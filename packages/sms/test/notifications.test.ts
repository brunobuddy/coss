import { expect, test } from "bun:test";
import type { PlanGate } from "@coss/billing/gate";
import { listNotifications, runDueNotifications } from "@coss/notifications";
import { recordingNotifier } from "@coss/notifications/testing";
import { createTestTenant } from "@coss/tenancy/testing";
import { TEST_SECRETS_KEYS } from "@coss/webhooks/testing";
import { SMS_NOTIFICATION_KINDS } from "../src/notifications.ts";
import {
  advanceDueSmsRegistrations,
  buySmsNumber,
  createSmsRegistration,
  type SmsSenderDeps,
  searchSmsNumbers,
} from "../src/provisioning.ts";
import { SmsRegistrationInput } from "../src/schemas.ts";
import { FakeTwilioApi } from "../src/twilio/fake.ts";

const HOUR = 60 * 60 * 1000;
const DASHBOARD = "https://coss.test";

const anyPlan: PlanGate = {
  async requireFeature() {},
  async limit() {
    return null;
  },
  async requireCapacity() {},
};

function deps(): SmsSenderDeps {
  return {
    provider: "fake",
    twilio: new FakeTwilioApi(),
    secretsKeys: TEST_SECRETS_KEYS,
    subaccountPrefix: "coss-test",
    callbackBaseUrl: "https://api.coss.test",
    plans: anyPlan,
  };
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
  useCase: "LOW_VOLUME",
  description: "Sign-in codes and account notifications for Acme's customers.",
  messageFlow: "Customers enter their mobile number in Acme's sign-up form and confirm it.",
  samples: ["Your Acme code is 123456.", "Your Acme password was changed."],
  hasEmbeddedLinks: false,
  hasEmbeddedPhone: false,
  optInProofUrl: "https://acme.test/opt-in.png",
  privacyPolicyUrl: "https://acme.test/privacy",
};

async function buy(org: string, kind: "local" | "toll_free", d: SmsSenderDeps) {
  const [available] = await searchSmsNumbers(org, { kind, country: "US" }, d);
  if (!available) throw new Error("no number");
  return buySmsNumber(org, { phoneNumber: available.phoneNumber, kind }, d);
}

/** Sends what is due at `at` and returns the subjects and texts sent to the owner. */
async function send(org: string, at: Date) {
  const notifier = recordingNotifier();
  await runDueNotifications(
    { now: at, scope: { organizationIds: [org] } },
    { notifier, kinds: SMS_NOTIFICATION_KINDS, dashboardUrl: DASHBOARD },
  );
  return notifier.sent;
}

async function settle(org: string, d: SmsSenderDeps, from: number): Promise<number> {
  let now = from;
  for (let i = 0; i < 20; i++) {
    now += HOUR;
    const advanced = await advanceDueSmsRegistrations(d, {
      now: new Date(now),
      scope: { organizationIds: [org] },
    });
    if (advanced === 0) break;
  }
  return now;
}

test("a local number: reminded an hour later, then told it's in review and approved", async () => {
  const tenant = await createTestTenant();
  const org = tenant.organization.id;
  const d = deps();
  const start = Date.now();
  const number = await buy(org, "local", d);
  // A second local number the same day doesn't remind twice.
  await buy(org, "local", d);
  expect(await send(org, new Date(start))).toEqual([]);

  const [reminder] = await send(org, new Date(start + HOUR + 60_000));
  expect(reminder?.to).toBe(tenant.owner.email);
  expect(reminder?.subject).toBe(`Register your business to send SMS from ${number.phoneNumber}`);
  expect(reminder?.text).toContain(
    `${DASHBOARD}/${tenant.organization.slug}?to=${encodeURIComponent("/sms/numbers/register?kind=us_10dlc")}`,
  );
  expect(reminder?.text).toContain("[>] 2. Register your business");

  const registration = await createSmsRegistration(
    org,
    SmsRegistrationInput.parse({
      kind: "us_10dlc",
      brandType: "low_volume_standard",
      profile: PROFILE,
      campaign: CAMPAIGN,
    }),
    d,
  );
  const [submitted] = await send(org, new Date(start + 2 * HOUR));
  expect(submitted?.subject).toBe("Acme, Inc.'s US A2P 10DLC registration is in review");
  expect(submitted?.text).toContain(number.phoneNumber);
  expect(submitted?.text).toContain(
    encodeURIComponent(`/sms/numbers?registered=${registration.id}`),
  );
  expect(submitted?.html).toContain("Carrier review");

  const settled = await settle(org, d, start + 2 * HOUR);
  const [approved] = await send(org, new Date(settled + HOUR));
  expect(approved?.subject).toBe("Acme, Inc. is approved to send SMS");
  expect(approved?.text).toContain(`from: "${number.phoneNumber}"`);

  expect((await listNotifications(org)).map((row) => [row.kind, row.status]).sort()).toEqual([
    ["sms.number_needs_registration", "sent"],
    ["sms.registration_approved", "sent"],
    ["sms.registration_submitted", "sent"],
  ]);
});

test("the reminder is skipped when the sender was registered within the hour", async () => {
  const tenant = await createTestTenant();
  const org = tenant.organization.id;
  const d = deps();
  const start = Date.now();
  const number = await buy(org, "toll_free", d);
  await createSmsRegistration(
    org,
    SmsRegistrationInput.parse({
      kind: "toll_free",
      numberId: number.id,
      profile: PROFILE,
      campaign: CAMPAIGN,
    }),
    d,
  );
  const sent = await send(org, new Date(start + HOUR + 60_000));
  expect(sent.map((notice) => notice.subject)).toEqual([
    "Acme, Inc.'s toll-free verification is in review",
  ]);
  const reminder = (await listNotifications(org)).find(
    (row) => row.kind === "sms.number_needs_registration",
  );
  expect(reminder).toMatchObject({ status: "skipped" });
});

test("an unverified toll-free number links to its own verification", async () => {
  const tenant = await createTestTenant();
  const org = tenant.organization.id;
  const number = await buy(org, "toll_free", deps());
  const [reminder] = await send(org, new Date(Date.now() + HOUR + 60_000));
  expect(reminder?.subject).toBe(`Verify ${number.phoneNumber} to send SMS`);
  expect(reminder?.text).toContain(encodeURIComponent(`/sms/numbers/register?number=${number.id}`));
});

test("a rejected registration says why and links to registering again", async () => {
  const tenant = await createTestTenant();
  const org = tenant.organization.id;
  const d = deps();
  const start = Date.now();
  await createSmsRegistration(
    org,
    SmsRegistrationInput.parse({
      kind: "us_10dlc",
      brandType: "low_volume_standard",
      profile: { ...PROFILE, legalName: "Acme [reject]" },
      campaign: CAMPAIGN,
    }),
    d,
  );
  const settled = await settle(org, d, start);
  // In review was overtaken by the decision: only the rejection goes out.
  const sent = await send(org, new Date(settled + HOUR));
  expect(sent.map((notice) => notice.subject)).toEqual([
    "Acme [reject]'s US A2P 10DLC registration wasn't approved",
  ]);
  expect(sent[0]?.text).toContain("Simulated rejection");
  expect(sent[0]?.text).toContain("Register again: ");
  expect(sent[0]?.text).toContain("[!] 2. Carrier review (Not approved)");
});

test("a rejection overtaken by a new registration isn't sent", async () => {
  const tenant = await createTestTenant();
  const org = tenant.organization.id;
  const d = deps();
  const start = Date.now();
  await createSmsRegistration(
    org,
    SmsRegistrationInput.parse({
      kind: "us_10dlc",
      brandType: "low_volume_standard",
      profile: { ...PROFILE, legalName: "Acme [reject]" },
      campaign: CAMPAIGN,
    }),
    d,
  );
  const settled = await settle(org, d, start);
  await createSmsRegistration(
    org,
    SmsRegistrationInput.parse({
      kind: "us_10dlc",
      brandType: "low_volume_standard",
      profile: PROFILE,
      campaign: CAMPAIGN,
    }),
    d,
  );
  const sent = await send(org, new Date(settled + HOUR));
  expect(sent.map((notice) => notice.subject)).toEqual([
    "Acme, Inc.'s US A2P 10DLC registration is in review",
  ]);
  const rejection = (await listNotifications(org)).find(
    (row) => row.kind === "sms.registration_rejected",
  );
  expect(rejection).toMatchObject({ status: "skipped", lastError: "Registered again since." });
});
