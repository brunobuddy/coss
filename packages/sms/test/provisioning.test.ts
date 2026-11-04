import { describe, expect, test } from "bun:test";
import type { PlanGate } from "@coss/billing/gate";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { TEST_SECRETS_KEYS } from "@coss/webhooks/testing";
import { eq, sql } from "drizzle-orm";
import {
  advanceDueSmsRegistrations,
  advanceSmsRegistration,
  attachPendingSmsNumbers,
  buySmsNumber,
  chargeDueSmsFees,
  createSmsRegistration,
  ensureSmsSubaccount,
  listSmsRegistrations,
  oneMonthAfter,
  reconcileSmsPurchases,
  releaseOrganizationSmsResources,
  releaseSmsNumber,
  retryUnfinishedSmsReleases,
  type SmsSenderDeps,
  searchSmsNumbers,
} from "../src/provisioning.ts";
import { SmsRegistrationInput } from "../src/schemas.ts";
import { authorizeLiveSmsSender } from "../src/senders.ts";
import { testPhoneNumber } from "../src/testing.ts";
import { TwilioApiError, TwilioNetworkError } from "../src/twilio/client.ts";
import { FakeTwilioApi } from "../src/twilio/fake.ts";

const { billingUsage, smsAccount, smsNumber } = schema;

/** A toll-free number no other test run used (the test database keeps every run's numbers). */
function testTollFreeNumber(): string {
  return testPhoneNumber().replace(/^\+1415/, "+1833");
}

/** A plan gate that allows `numbers` SMS numbers (`null`: any number). */
function plansAllowing(numbers: number | null): PlanGate {
  return {
    async requireFeature() {},
    async hasFeature() {
      return true;
    },
    async limit() {
      return numbers;
    },
    async requireCapacity(_org, _limit, current) {
      if (numbers !== null && current >= numbers) {
        throw Object.assign(new Error("limit"), { code: "plan_limit_reached" });
      }
    },
  };
}

function deps(twilio = new FakeTwilioApi()): SmsSenderDeps & { twilio: FakeTwilioApi } {
  return {
    provider: "fake",
    twilio,
    secretsKeys: TEST_SECRETS_KEYS,
    subaccountPrefix: "coss-test",
    callbackBaseUrl: "https://api.coss.test",
    plans: plansAllowing(null),
  };
}

/** Fails adding numbers to messaging services, and releasing them, until `working` is set. */
class FlakyServiceTwilio extends FakeTwilioApi {
  working = false;
  override async releaseNumber(
    account: { accountSid: string; authToken: string },
    numberSid: string,
  ) {
    if (!this.working) throw new Error("Twilio unreachable");
    await super.releaseNumber(account, numberSid);
  }
  override async addNumberToService(
    account: { accountSid: string; authToken: string },
    serviceSid: string,
    numberSid: string,
  ) {
    if (!this.working) throw new Error("Twilio unreachable");
    await super.addNumberToService(account, serviceSid, numberSid);
  }
}

const PROFILE = {
  legalName: "Acme, Inc.",
  companyType: "PRIVATE_PROFIT",
  taxId: "12-3456789",
  taxIdType: "EIN",
  industry: "TECHNOLOGY",
  website: "https://acme.test",
  street: "1 Main St",
  city: "San Francisco",
  region: "CA",
  postalCode: "94105",
  country: "US",
  contact: {
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@acme.test",
    phone: "+14155550100",
    title: "CTO",
    jobPosition: "Director",
  },
};

const CAMPAIGN = {
  useCase: "ACCOUNT_NOTIFICATION",
  description: "Sign-in codes and account notifications for Acme's customers.",
  messageFlow: "Customers enter their mobile number in Acme's sign-up form and confirm it.",
  samples: [
    "Your Acme code is 123456. It expires in 10 minutes.",
    "Your Acme password was changed.",
  ],
  hasEmbeddedLinks: false,
  hasEmbeddedPhone: false,
};

async function fees(organizationId: string) {
  return db
    .select({
      meter: billingUsage.meter,
      dimension: billingUsage.dimension,
      quantity: sql<number>`sum(${billingUsage.quantity})::int`,
    })
    .from(billingUsage)
    .where(eq(billingUsage.organizationId, organizationId))
    .groupBy(billingUsage.meter, billingUsage.dimension)
    .orderBy(billingUsage.meter, billingUsage.dimension);
}

/** Each organization's own clock, moved an hour per round, so later calls continue from it. */
const clocks = new Map<string, number>();

async function advanceUntilSettled(organizationId: string, d: SmsSenderDeps) {
  const scope = { organizationIds: [organizationId] };
  let now = clocks.get(organizationId) ?? Date.now();
  for (let i = 0; i < 20; i++) {
    now += 60 * 60 * 1000;
    if ((await advanceDueSmsRegistrations(d, { now: new Date(now), scope })) === 0) break;
  }
  clocks.set(organizationId, now);
  return listSmsRegistrations(organizationId);
}

async function advanceUntilSettledOnce(organizationId: string, d: SmsSenderDeps) {
  const now = (clocks.get(organizationId) ?? Date.now()) + 60 * 60 * 1000;
  clocks.set(organizationId, now);
  await advanceDueSmsRegistrations(d, {
    now: new Date(now),
    scope: { organizationIds: [organizationId] },
  });
}

describe("US A2P 10DLC", () => {
  test("a registration goes through every step, then its numbers can send", async () => {
    const tenant = await createTestTenant();
    const org = tenant.organization.id;
    const d = deps();
    const [available] = await searchSmsNumbers(org, { kind: "local", country: "US" }, d);
    if (!available) throw new Error("no number");
    const number = await buySmsNumber(
      org,
      { phoneNumber: available.phoneNumber, kind: "local" },
      d,
    );
    await expect(
      authorizeLiveSmsSender({
        organizationId: org,
        from: number.phoneNumber,
        toCountry: "US",
        provider: "fake",
      }),
    ).rejects.toMatchObject({ code: "sender_not_ready" });
    await createSmsRegistration(
      org,
      SmsRegistrationInput.parse({
        kind: "us_10dlc",
        brandType: "standard",
        profile: PROFILE,
        campaign: CAMPAIGN,
      }),
      d,
    );
    const [registration] = await advanceUntilSettled(org, d);
    expect(registration).toMatchObject({ status: "approved", step: "done" });
    expect(registration?.campaignSid).toBeTruthy();
    expect(d.twilio.calls.map((call) => call.method)).toEqual([
      "createSubaccount",
      "searchNumbers",
      "buyNumber",
      "createCustomerProfile",
      "createTrustProduct",
      "createBrand",
      "createMessagingService",
      "createCampaign",
      "addNumberToService",
    ]);
    expect(
      await authorizeLiveSmsSender({
        organizationId: org,
        from: number.phoneNumber,
        toCountry: "US",
        provider: "fake",
      }),
    ).toMatchObject({
      numberId: number.id,
      route: { messagingServiceSid: registration?.messagingServiceSid },
    });
    expect(await fees(org)).toEqual([
      { meter: "sms.numbers", dimension: "type=local", quantity: 1 },
      { meter: "sms.registrations", dimension: "fee=brand", quantity: 1 },
      { meter: "sms.registrations", dimension: "fee=brand_vetting", quantity: 1 },
      { meter: "sms.registrations", dimension: "fee=campaign_monthly", quantity: 1 },
      { meter: "sms.registrations", dimension: "fee=campaign_vetting", quantity: 1 },
    ]);
    // A month on, the number and the campaign are charged again.
    const later = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
    expect(await chargeDueSmsFees({ now: later, scope: { organizationIds: [org] } })).toBe(2);
    expect(await chargeDueSmsFees({ now: later, scope: { organizationIds: [org] } })).toBe(0);
    expect(await fees(org)).toContainEqual({
      meter: "sms.numbers",
      dimension: "type=local",
      quantity: 2,
    });
    await expect(
      createSmsRegistration(
        org,
        SmsRegistrationInput.parse({
          kind: "us_10dlc",
          brandType: "standard",
          profile: PROFILE,
          campaign: CAMPAIGN,
        }),
        d,
      ),
    ).rejects.toMatchObject({ code: "registration_locked" });
  });

  test("a rejected business is told why and can register again", async () => {
    const tenant = await createTestTenant();
    const org = tenant.organization.id;
    const d = deps();
    await createSmsRegistration(
      org,
      SmsRegistrationInput.parse({
        kind: "us_10dlc",
        brandType: "low_volume_standard",
        profile: { ...PROFILE, legalName: "Acme [reject]" },
        campaign: { ...CAMPAIGN, useCase: "LOW_VOLUME" },
      }),
      d,
    );
    const [registration] = await advanceUntilSettled(org, d);
    expect(registration).toMatchObject({ status: "rejected" });
    expect(registration?.rejectionReason).toContain("Simulated rejection");
    expect(
      (
        await createSmsRegistration(
          org,
          SmsRegistrationInput.parse({
            kind: "us_10dlc",
            brandType: "low_volume_standard",
            profile: PROFILE,
            campaign: { ...CAMPAIGN, useCase: "LOW_VOLUME" },
          }),
          d,
        )
      ).status,
    ).toBe("submitted");
  });

  test("reviews that take time are polled", async () => {
    const tenant = await createTestTenant();
    const org = tenant.organization.id;
    const twilio = new FakeTwilioApi();
    twilio.hold();
    const d = deps(twilio);
    await createSmsRegistration(
      org,
      SmsRegistrationInput.parse({
        kind: "us_10dlc",
        brandType: "standard",
        profile: PROFILE,
        campaign: CAMPAIGN,
      }),
      d,
    );
    const [pending] = await advanceUntilSettled(org, d);
    expect(pending).toMatchObject({ status: "in_review", step: "customer_profile" });
    twilio.decide(pending?.customerProfileSid ?? "", {
      status: "rejected",
      reason: "EIN mismatch",
    });
    const [rejected] = await advanceUntilSettled(org, d);
    expect(rejected).toMatchObject({ status: "rejected", rejectionReason: "EIN mismatch" });
  });
});

test("toll-free: a number is verified, then sends to the US and Canada only", async () => {
  const tenant = await createTestTenant();
  const org = tenant.organization.id;
  const d = deps();
  const [available] = await searchSmsNumbers(org, { kind: "toll_free", country: "US" }, d);
  if (!available) throw new Error("no number");
  const number = await buySmsNumber(
    org,
    { phoneNumber: available.phoneNumber, kind: "toll_free" },
    d,
  );
  await expect(
    createSmsRegistration(
      org,
      SmsRegistrationInput.parse({
        kind: "toll_free",
        numberId: number.id,
        profile: PROFILE,
        campaign: {
          ...CAMPAIGN,
          optInProofUrl: "https://acme.test/opt-in.png",
          privacyPolicyUrl: "https://acme.test/privacy",
        },
      }),
      d,
    ),
  ).resolves.toMatchObject({ kind: "toll_free", numberId: number.id });
  const [registration] = await advanceUntilSettled(org, d);
  expect(registration).toMatchObject({ status: "approved" });
  await db
    .update(smsAccount)
    .set({ allowedCountries: ["US", "CA", "GB"] })
    .where(eq(smsAccount.organizationId, org));
  await expect(
    authorizeLiveSmsSender({
      organizationId: org,
      from: number.phoneNumber,
      toCountry: "GB",
      provider: "fake",
    }),
  ).rejects.toMatchObject({ code: "country_not_allowed" });
  expect(
    await authorizeLiveSmsSender({
      organizationId: org,
      from: number.phoneNumber,
      toCountry: "CA",
      provider: "fake",
    }),
  ).toMatchObject({ numberId: number.id });
});

test("plans cap numbers; released numbers stop sending; deletion closes the subaccount", async () => {
  const tenant = await createTestTenant();
  const org = tenant.organization.id;
  const d: SmsSenderDeps = {
    ...deps(),
    plans: {
      async requireFeature() {},
      async hasFeature() {
        return true;
      },
      async limit() {
        return 1;
      },
      async requireCapacity(_org, _limit, current) {
        if (current >= 1) throw Object.assign(new Error("limit"), { code: "plan_limit_reached" });
      },
    },
  };
  const first = await buySmsNumber(org, { phoneNumber: testPhoneNumber(), kind: "local" }, d);
  await expect(
    buySmsNumber(org, { phoneNumber: testPhoneNumber(), kind: "local" }, d),
  ).rejects.toMatchObject({ code: "plan_limit_reached" });
  await releaseSmsNumber(org, first.id, d);
  expect(await db.select().from(smsNumber).where(eq(smsNumber.organizationId, org))).toEqual([]);
  const account = await ensureSmsSubaccount(org, d);
  await releaseOrganizationSmsResources(org, d);
  const [closed] = await db.select().from(smsAccount).where(eq(smsAccount.organizationId, org));
  expect(closed?.status).toBe("closed");
  expect((d.twilio as FakeTwilioApi).calls.at(-1)).toEqual({
    method: "closeSubaccount",
    args: [account.accountSid],
  });
  expect(oneMonthAfter(new Date("2026-01-31T10:00:00Z")).toISOString()).toBe(
    "2026-02-28T10:00:00.000Z",
  );
});

test("plans without SMS numbers can't register senders or buy numbers", async () => {
  const tenant = await createTestTenant();
  const org = tenant.organization.id;
  const d = { ...deps(), plans: plansAllowing(0) };
  await expect(
    createSmsRegistration(
      org,
      SmsRegistrationInput.parse({
        kind: "us_10dlc",
        brandType: "standard",
        profile: PROFILE,
        campaign: CAMPAIGN,
      }),
      d,
    ),
  ).rejects.toMatchObject({ code: "plan_required" });
  await expect(
    buySmsNumber(org, { phoneNumber: testPhoneNumber(), kind: "local" }, d),
  ).rejects.toMatchObject({ code: "plan_required" });
  expect(await listSmsRegistrations(org)).toEqual([]);
  expect(d.twilio.calls).toEqual([]);
});

test("a number is bought as what it is, not as what the form said", async () => {
  const tenant = await createTestTenant();
  const org = tenant.organization.id;
  const d = deps();
  const [tollFree] = await searchSmsNumbers(org, { kind: "toll_free", country: "US" }, d);
  if (!tollFree) throw new Error("no number");
  await expect(
    buySmsNumber(org, { phoneNumber: tollFree.phoneNumber, kind: "local" }, d),
  ).rejects.toMatchObject({ code: "number_unavailable" });
  expect(d.twilio.calls.map((call) => call.method)).not.toContain("buyNumber");
  const number = await buySmsNumber(
    org,
    { phoneNumber: tollFree.phoneNumber, kind: "toll_free" },
    d,
  );
  expect(number.kind).toBe("toll_free");
});

test("a number its messaging service didn't take is pending until the worker adds it", async () => {
  const tenant = await createTestTenant();
  const org = tenant.organization.id;
  const twilio = new FlakyServiceTwilio();
  twilio.working = true;
  const d = deps(twilio);
  await createSmsRegistration(
    org,
    SmsRegistrationInput.parse({
      kind: "us_10dlc",
      brandType: "low_volume_standard",
      profile: PROFILE,
      campaign: { ...CAMPAIGN, useCase: "LOW_VOLUME" },
    }),
    d,
  );
  const [registration] = await advanceUntilSettled(org, d);
  expect(registration?.status).toBe("approved");
  twilio.working = false;
  const number = await buySmsNumber(org, { phoneNumber: testPhoneNumber(), kind: "local" }, d);
  expect(number.status).toBe("pending");
  const send = () =>
    authorizeLiveSmsSender({
      organizationId: org,
      from: number.phoneNumber,
      toCountry: "US",
      provider: "fake",
    });
  await expect(send()).rejects.toMatchObject({ code: "sender_not_ready" });
  const scope = { organizationIds: [org] };
  const later = new Date(Date.now() + 5 * 60 * 1000);
  expect(await attachPendingSmsNumbers(d, { now: later, scope })).toBe(0);
  twilio.working = true;
  // A failed attempt waits its turn: not again within the minute.
  expect(await attachPendingSmsNumbers(d, { now: later, scope })).toBe(0);
  const afterward = new Date(later.getTime() + 2 * 60 * 1000);
  expect(await attachPendingSmsNumbers(d, { now: afterward, scope })).toBe(1);
  expect(await send()).toMatchObject({
    numberId: number.id,
    route: { messagingServiceSid: registration?.messagingServiceSid },
  });
});

test("a number bought while its campaign is approved waits, pending, to join the service", async () => {
  const tenant = await createTestTenant();
  const org = tenant.organization.id;
  const d = deps();
  await createSmsRegistration(
    org,
    SmsRegistrationInput.parse({
      kind: "us_10dlc",
      brandType: "low_volume_standard",
      profile: PROFILE,
      campaign: { ...CAMPAIGN, useCase: "LOW_VOLUME" },
    }),
    d,
  );
  // Run the steps until the campaign's review is the next thing asked about.
  let [registration] = await listSmsRegistrations(org);
  for (let i = 0; i < 20 && registration && !registration.campaignSid; i++) {
    await advanceUntilSettledOnce(org, d);
    [registration] = await listSmsRegistrations(org);
  }
  // The purchase commits after the approval step read the registration's numbers.
  const original = d.twilio.addNumberToService.bind(d.twilio);
  let bought: Awaited<ReturnType<typeof buySmsNumber>> | undefined;
  d.twilio.addNumberToService = async (...args) => {
    bought ??= await buySmsNumber(org, { phoneNumber: testPhoneNumber(), kind: "local" }, d);
    return original(...args);
  };
  const local = await buySmsNumber(org, { phoneNumber: testPhoneNumber(), kind: "local" }, d);
  expect(local.status).toBe("active");
  [registration] = await advanceUntilSettled(org, d);
  expect(registration?.status).toBe("approved");
  if (!bought) throw new Error("not bought");
  const [stored] = await db.select().from(smsNumber).where(eq(smsNumber.id, bought.id));
  expect(stored?.status).toBe("pending");
  d.twilio.addNumberToService = original;
  const later = new Date(Date.now() + 5 * 60 * 1000);
  expect(await attachPendingSmsNumbers(d, { now: later, scope: { organizationIds: [org] } })).toBe(
    1,
  );
});

test("a release the provider didn't finish is retried by the worker", async () => {
  const tenant = await createTestTenant();
  const org = tenant.organization.id;
  const twilio = new FlakyServiceTwilio();
  twilio.working = true;
  const d = deps(twilio);
  const number = await buySmsNumber(org, { phoneNumber: testPhoneNumber(), kind: "local" }, d);
  twilio.working = false;
  await expect(releaseSmsNumber(org, number.id, d)).rejects.toThrow("Twilio unreachable");
  const [releasing] = await db.select().from(smsNumber).where(eq(smsNumber.id, number.id));
  expect(releasing?.status).toBe("releasing");
  // Still Twilio's to charge for: still billed monthly.
  const nextMonth = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
  expect(await chargeDueSmsFees({ now: nextMonth, scope: { organizationIds: [org] } })).toBe(1);
  const scope = { organizationIds: [org] };
  const later = new Date(Date.now() + 15 * 60 * 1000);
  expect(await retryUnfinishedSmsReleases(d, { now: later, scope })).toBe(0);
  twilio.working = true;
  // A failed release is tried again 10 minutes later.
  expect(await retryUnfinishedSmsReleases(d, { now: later, scope })).toBe(0);
  const afterward = new Date(later.getTime() + 15 * 60 * 1000);
  expect(await retryUnfinishedSmsReleases(d, { now: afterward, scope })).toBe(1);
  expect(await db.select().from(smsNumber).where(eq(smsNumber.id, number.id))).toEqual([]);
});

test("a brand whose creation answer was lost is adopted, never created (and paid) twice", async () => {
  const tenant = await createTestTenant();
  const org = tenant.organization.id;
  class LostAnswer extends FakeTwilioApi {
    lost = false;
    override async createBrand(...args: Parameters<FakeTwilioApi["createBrand"]>) {
      const created = await super.createBrand(...args);
      if (!this.lost) {
        this.lost = true;
        throw new TwilioNetworkError("Twilio POST BrandRegistrations got no answer.");
      }
      return created;
    }
    override async createCustomerProfile(
      ...args: Parameters<FakeTwilioApi["createCustomerProfile"]>
    ) {
      if (!this.unauthorized) {
        this.unauthorized = true;
        throw new TwilioApiError(401, "20003", "Authenticate");
      }
      return super.createCustomerProfile(...args);
    }
    unauthorized = false;
  }
  const twilio = new LostAnswer();
  const d = deps(twilio);
  await createSmsRegistration(
    org,
    SmsRegistrationInput.parse({
      kind: "us_10dlc",
      brandType: "standard",
      profile: PROFILE,
      campaign: CAMPAIGN,
    }),
    d,
  );
  // A 401 is coss.com's setup, not the business's details: retried, never rejected.
  await advanceUntilSettledOnce(org, d);
  expect((await listSmsRegistrations(org))[0]?.status).toBe("submitted");
  const [registration] = await advanceUntilSettled(org, d);
  expect(registration?.status).toBe("approved");
  expect(twilio.calls.filter((call) => call.method === "createBrand")).toHaveLength(1);
  expect(await fees(org)).toContainEqual({
    meter: "sms.registrations",
    dimension: "fee=brand",
    quantity: 1,
  });
});

test("a number at a provider this deployment doesn't use is kept until it can be released", async () => {
  const tenant = await createTestTenant();
  const org = tenant.organization.id;
  const twilio = new FakeTwilioApi();
  const atTwilio: SmsSenderDeps = { ...deps(twilio), provider: "twilio" };
  const number = await buySmsNumber(
    org,
    { phoneNumber: testPhoneNumber(), kind: "local" },
    atTwilio,
  );
  const fake = deps(twilio);
  await expect(releaseSmsNumber(org, number.id, fake)).rejects.toMatchObject({
    code: "provider_unavailable",
  });
  const scope = { organizationIds: [org] };
  const later = new Date(Date.now() + 15 * 60 * 1000);
  expect(await retryUnfinishedSmsReleases(fake, { now: later, scope })).toBe(0);
  await expect(releaseOrganizationSmsResources(org, fake)).rejects.toThrow("not closed");
  expect(await db.select().from(smsNumber).where(eq(smsNumber.id, number.id))).toHaveLength(1);
  expect(await retryUnfinishedSmsReleases(atTwilio, { now: later, scope })).toBe(1);
});

test("a purchase whose answer was lost is found at Twilio and recorded once", async () => {
  const tenant = await createTestTenant();
  const org = tenant.organization.id;
  class LostPurchase extends FakeTwilioApi {
    lost = false;
    override async buyNumber(...args: Parameters<FakeTwilioApi["buyNumber"]>) {
      const bought = await super.buyNumber(...args);
      if (!this.lost) {
        this.lost = true;
        throw new TwilioNetworkError("Twilio POST IncomingPhoneNumbers got no answer.");
      }
      return bought;
    }
  }
  const twilio = new LostPurchase();
  const d = deps(twilio);
  const phoneNumber = testPhoneNumber();
  await expect(buySmsNumber(org, { phoneNumber, kind: "local" }, d)).rejects.toThrow("no answer");
  const scope = { organizationIds: [org] };
  // Too soon: the purchase may still be under way.
  expect(await reconcileSmsPurchases(d, { now: new Date(), scope })).toBe(0);
  const later = new Date(Date.now() + 5 * 60 * 1000);
  expect(await reconcileSmsPurchases(d, { now: later, scope })).toBe(1);
  const [number] = await db.select().from(smsNumber).where(eq(smsNumber.organizationId, org));
  expect(number).toMatchObject({ phoneNumber, status: "active", providerSid: expect.any(String) });
  expect(twilio.calls.filter((call) => call.method === "buyNumber")).toHaveLength(1);
  expect(await fees(org)).toEqual([{ meter: "sms.numbers", dimension: "type=local", quantity: 1 }]);
});

test("an intent Twilio never heard of is dropped", async () => {
  const tenant = await createTestTenant();
  const org = tenant.organization.id;
  class Unreachable extends FakeTwilioApi {
    override async buyNumber(): Promise<{ sid: string; phoneNumber: string }> {
      throw new TwilioNetworkError("Twilio POST IncomingPhoneNumbers got no answer.");
    }
  }
  const d = deps(new Unreachable());
  await expect(
    buySmsNumber(org, { phoneNumber: testPhoneNumber(), kind: "local" }, d),
  ).rejects.toThrow("no answer");
  const scope = { organizationIds: [org] };
  const muchLater = new Date(Date.now() + 60 * 60 * 1000);
  expect(await reconcileSmsPurchases(d, { now: muchLater, scope })).toBe(1);
  expect(await db.select().from(smsNumber).where(eq(smsNumber.organizationId, org))).toEqual([]);
  expect(await fees(org)).toEqual([]);
});

test("a toll-free verification whose answer was lost is followed, not submitted again", async () => {
  const tenant = await createTestTenant();
  const org = tenant.organization.id;
  class LostVerification extends FakeTwilioApi {
    lost = false;
    override async createTollFreeVerification(
      ...args: Parameters<FakeTwilioApi["createTollFreeVerification"]>
    ) {
      const created = await super.createTollFreeVerification(...args);
      if (!this.lost) {
        this.lost = true;
        throw new TwilioNetworkError("Twilio POST Tollfree/Verifications got no answer.");
      }
      return created;
    }
  }
  const twilio = new LostVerification();
  const d = deps(twilio);
  const [tollFree] = await searchSmsNumbers(org, { kind: "toll_free", country: "US" }, d);
  if (!tollFree) throw new Error("no number");
  const number = await buySmsNumber(
    org,
    { phoneNumber: tollFree.phoneNumber, kind: "toll_free" },
    d,
  );
  await createSmsRegistration(
    org,
    SmsRegistrationInput.parse({
      kind: "toll_free",
      numberId: number.id,
      profile: PROFILE,
      campaign: {
        ...CAMPAIGN,
        optInProofUrl: "https://acme.test/opt-in.png",
        privacyPolicyUrl: "https://acme.test/privacy",
      },
    }),
    d,
  );
  const [registration] = await advanceUntilSettled(org, d);
  expect(registration?.status).toBe("approved");
  expect(twilio.calls.filter((call) => call.method === "createTollFreeVerification")).toHaveLength(
    1,
  );
});

test("a rejected toll-free verification is resubmitted with the corrected details", async () => {
  const tenant = await createTestTenant();
  const org = tenant.organization.id;
  const d = deps();
  const [tollFree] = await searchSmsNumbers(org, { kind: "toll_free", country: "US" }, d);
  if (!tollFree) throw new Error("no number");
  const number = await buySmsNumber(
    org,
    { phoneNumber: tollFree.phoneNumber, kind: "toll_free" },
    d,
  );
  const register = (legalName: string) =>
    createSmsRegistration(
      org,
      SmsRegistrationInput.parse({
        kind: "toll_free",
        numberId: number.id,
        profile: { ...PROFILE, legalName },
        campaign: {
          ...CAMPAIGN,
          optInProofUrl: "https://acme.test/opt-in.png",
          privacyPolicyUrl: "https://acme.test/privacy",
        },
      }),
      d,
    );
  await register("[reject] Acme, Inc.");
  const [rejected] = await advanceUntilSettled(org, d);
  expect(rejected?.status).toBe("rejected");
  await register("Acme, Inc.");
  const registrations = await advanceUntilSettled(org, d);
  // The rejected attempt it replaced is no longer listed.
  expect(registrations.map((row) => row.status)).toEqual(["approved"]);
  const methods = d.twilio.calls.map((call) => call.method);
  expect(methods.filter((method) => method === "createTollFreeVerification")).toHaveLength(1);
  expect(methods.filter((method) => method === "resubmitTollFreeVerification")).toHaveLength(1);
  // The number stays in the one messaging service it can belong to.
  expect(methods.filter((method) => method === "createMessagingService")).toHaveLength(1);
  expect(registrations[0]?.messagingServiceSid).toBe(rejected?.messagingServiceSid);
});

test("releasing a purchase still under way waits for its outcome", async () => {
  const tenant = await createTestTenant();
  const org = tenant.organization.id;
  class Slow extends FakeTwilioApi {
    override async buyNumber(): Promise<{ sid: string; phoneNumber: string }> {
      throw new TwilioNetworkError("Twilio POST IncomingPhoneNumbers got no answer.");
    }
  }
  const twilio = new Slow();
  const d = deps(twilio);
  const phoneNumber = testPhoneNumber();
  await expect(buySmsNumber(org, { phoneNumber, kind: "local" }, d)).rejects.toThrow("no answer");
  const [intent] = await db.select().from(smsNumber).where(eq(smsNumber.organizationId, org));
  if (!intent) throw new Error("no intent");
  await releaseSmsNumber(org, intent.id, d);
  // Kept: Twilio may still complete the purchase.
  const [kept] = await db.select().from(smsNumber).where(eq(smsNumber.id, intent.id));
  expect(kept?.status).toBe("releasing");
  // It does.
  const account = await ensureSmsSubaccount(org, d);
  await FakeTwilioApi.prototype.buyNumber.call(twilio, account, { phoneNumber });
  const scope = { organizationIds: [org] };
  const later = new Date(Date.now() + 15 * 60 * 1000);
  expect(await retryUnfinishedSmsReleases(d, { now: later, scope })).toBe(1);
  expect(await db.select().from(smsNumber).where(eq(smsNumber.id, intent.id))).toEqual([]);
  expect(twilio.calls.map((call) => call.method)).toContain("releaseNumber");
  // Twilio charged for it: so is the organization, once.
  expect(await fees(org)).toEqual([{ meter: "sms.numbers", dimension: "type=local", quantity: 1 }]);
});

test("a low-volume standard brand registers the low-volume mixed use case only", () => {
  const input = (brandType: string, useCase: string) =>
    SmsRegistrationInput.safeParse({
      kind: "us_10dlc",
      brandType,
      profile: PROFILE,
      campaign: { ...CAMPAIGN, useCase },
    });
  expect(input("low_volume_standard", "2FA").success).toBe(false);
  expect(input("low_volume_standard", "LOW_VOLUME").success).toBe(true);
  expect(input("standard", "2FA").success).toBe(true);
});

test("a toll-free number still being bought can't be registered yet", async () => {
  const tenant = await createTestTenant();
  const org = tenant.organization.id;
  class Unanswered extends FakeTwilioApi {
    override async buyNumber(): Promise<{ sid: string; phoneNumber: string }> {
      throw new TwilioNetworkError("Twilio POST IncomingPhoneNumbers got no answer.");
    }
  }
  const d = deps(new Unanswered());
  await expect(
    buySmsNumber(org, { phoneNumber: testTollFreeNumber(), kind: "toll_free" }, d),
  ).rejects.toThrow("no answer");
  const [intent] = await db.select().from(smsNumber).where(eq(smsNumber.organizationId, org));
  if (!intent) throw new Error("no intent");
  await expect(
    createSmsRegistration(
      org,
      SmsRegistrationInput.parse({
        kind: "toll_free",
        numberId: intent.id,
        profile: PROFILE,
        campaign: {
          ...CAMPAIGN,
          optInProofUrl: "https://acme.test/opt-in.png",
          privacyPolicyUrl: "https://acme.test/privacy",
        },
      }),
      d,
    ),
  ).rejects.toMatchObject({ code: "registration_invalid" });
});

test("only US and Canadian numbers can be bought", async () => {
  const tenant = await createTestTenant();
  const d = deps();
  await expect(
    buySmsNumber(tenant.organization.id, { phoneNumber: "+447400123456", kind: "local" }, d),
  ).rejects.toMatchObject({ code: "number_unavailable" });
  expect(d.twilio.calls.map((call) => call.method)).not.toContain("buyNumber");
});

test("a step that outlived its claim records nothing: the worker that took over does", async () => {
  const tenant = await createTestTenant();
  const org = tenant.organization.id;
  class TakenOver extends FakeTwilioApi {
    override async createBrand(...args: Parameters<FakeTwilioApi["createBrand"]>) {
      const created = await super.createBrand(...args);
      // Meanwhile another worker claimed the registration.
      await db
        .update(schema.smsRegistration)
        .set({ nextCheckAt: new Date(0) })
        .where(eq(schema.smsRegistration.organizationId, org));
      return created;
    }
  }
  const d = deps(new TakenOver());
  await createSmsRegistration(
    org,
    SmsRegistrationInput.parse({
      kind: "us_10dlc",
      brandType: "standard",
      profile: PROFILE,
      campaign: CAMPAIGN,
    }),
    d,
  );
  let [registration] = await listSmsRegistrations(org);
  for (let i = 0; i < 10 && registration?.step !== "brand"; i++) {
    await advanceUntilSettledOnce(org, d);
    [registration] = await listSmsRegistrations(org);
  }
  if (!registration) throw new Error("no registration");
  expect(await advanceSmsRegistration(registration, d, new Date(Date.now() + 1e9))).toBeNull();
  [registration] = await listSmsRegistrations(org);
  expect(registration?.brandSid).toBeNull();
  expect(await fees(org)).toEqual([]);
});

test("a low-volume mixed campaign is billed its lower monthly fee, whatever the brand", async () => {
  const tenant = await createTestTenant();
  const org = tenant.organization.id;
  const d = deps();
  await createSmsRegistration(
    org,
    SmsRegistrationInput.parse({
      kind: "us_10dlc",
      brandType: "standard",
      profile: PROFILE,
      campaign: { ...CAMPAIGN, useCase: "LOW_VOLUME" },
    }),
    d,
  );
  expect((await advanceUntilSettled(org, d))[0]?.status).toBe("approved");
  const charged = (await fees(org)).map((fee) => fee.dimension);
  expect(charged).toContain("fee=campaign_monthly_low_volume");
  expect(charged).not.toContain("fee=campaign_monthly");
});

test("teardown closes the account first, so no subaccount is created behind it", async () => {
  const tenant = await createTestTenant();
  const org = tenant.organization.id;
  const d = deps();
  // An account without a subaccount yet: a first purchase could be creating one.
  await db.insert(smsAccount).values({ organizationId: org }).onConflictDoNothing();
  await releaseOrganizationSmsResources(org, d);
  await expect(ensureSmsSubaccount(org, d)).rejects.toMatchObject({ code: "provider_unavailable" });
  expect(d.twilio.calls.map((call) => call.method)).not.toContain("createSubaccount");
});
