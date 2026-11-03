/** Test helpers for the SMS product (and the apps' tests that use it). */
import { randomInt, randomUUID } from "node:crypto";
import { db, schema } from "@coss/db";
import { encryptSecret } from "@coss/webhooks";
import { eq } from "drizzle-orm";
import { ensureSmsAccountRow } from "./accounts.ts";
import type { SmsDispatchJob, SmsDispatchQueue } from "./dispatch.ts";
import { FAKE_SMS_PROVIDER, FakeSmsProvider } from "./providers/fake.ts";
import { createSmsService, type SmsService, type SmsServiceOptions } from "./service.ts";

export { FakeTwilioApi } from "./twilio/fake.ts";
export { FakeSmsProvider };

const { smsAccount, smsNumber, smsRegistration } = schema;

export type MemorySmsDispatchQueue = SmsDispatchQueue & {
  jobs: SmsDispatchJob[];
  /** Dispatches every queued job (in order) with `service`. */
  drain(service: Pick<SmsService, "dispatch">): Promise<void>;
};

/** Records dispatch jobs instead of queueing them in pg-boss. */
export function memorySmsDispatchQueue(): MemorySmsDispatchQueue {
  const jobs: SmsDispatchJob[] = [];
  return {
    jobs,
    async enqueue(_tx, job) {
      jobs.push(job);
    },
    async drain(service) {
      for (const job of jobs.splice(0)) await service.dispatch(job);
    },
  };
}

/** A service whose `send` also dispatches the new message before returning (as the worker would). */
export function dispatchingSmsService(
  opts: Partial<Omit<SmsServiceOptions, "queue">> = {},
): SmsService & { queue: MemorySmsDispatchQueue; provider: FakeSmsProvider } {
  const provider = new FakeSmsProvider({ log: false });
  const queue = memorySmsDispatchQueue();
  const service = createSmsService({
    liveProvider: provider,
    sandboxProvider: provider,
    ...opts,
    queue,
  });
  return {
    ...service,
    queue,
    provider,
    async send(input) {
      const result = await service.send(input);
      if (result.replayed) return result;
      await queue.drain(service);
      const sms = await service.dispatch({
        organizationId: input.environment.organizationId,
        smsId: result.sms.id,
      });
      return { sms, replayed: false };
    },
  };
}

/** A random valid US number (area code 415, exchange 200-999). */
export function testPhoneNumber(): string {
  const exchange = randomInt(200, 1000);
  const line = randomInt(10_000);
  return `+1415${exchange}${String(line).padStart(4, "0")}`;
}

/**
 * An active number with an approved registration (fake provider), so live sends from it pass
 * `authorizeLiveSmsSender`. `countries` replaces the account's allowed destinations.
 */
export async function createTestSmsNumber(
  organizationId: string,
  opts: {
    phoneNumber?: string;
    kind?: "local" | "toll_free";
    receivingEnvironmentId?: string | null;
    countries?: string[];
    provider?: string;
  } = {},
): Promise<{ id: string; phoneNumber: string; registrationId: string }> {
  await ensureSmsAccountRow(organizationId);
  if (opts.countries) {
    await db
      .update(smsAccount)
      .set({ allowedCountries: opts.countries })
      .where(eq(smsAccount.organizationId, organizationId));
  }
  const [registration] = await db
    .insert(smsRegistration)
    .values({
      organizationId,
      kind: opts.kind === "toll_free" ? "toll_free" : "us_10dlc",
      status: "approved",
      profile: {
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
      },
      campaign: {
        useCase: "ACCOUNT_NOTIFICATION",
        description: "Sign-in codes",
        messageFlow: "Users enter their number at sign-up.",
        samples: ["Your Acme code is 123456"],
        hasEmbeddedLinks: false,
        hasEmbeddedPhone: false,
      },
      messagingServiceSid: "MGtest",
      approvedAt: new Date(),
    })
    .returning({ id: smsRegistration.id });
  if (!registration) throw new Error("Test registration insert returned no row.");
  // The test database is never truncated: a random number taken by an earlier run is drawn again.
  for (let attempt = 0; attempt < 10; attempt++) {
    const phoneNumber = opts.phoneNumber ?? testPhoneNumber();
    const [number] = await db
      .insert(smsNumber)
      .values({
        organizationId,
        phoneNumber,
        kind: opts.kind ?? "local",
        country: "US",
        provider: opts.provider ?? FAKE_SMS_PROVIDER,
        status: "active",
        registrationId: registration.id,
        receivingEnvironmentId: opts.receivingEnvironmentId ?? null,
      })
      .onConflictDoNothing({ target: smsNumber.phoneNumber })
      .returning({ id: smsNumber.id });
    if (number) return { id: number.id, phoneNumber, registrationId: registration.id };
    if (opts.phoneNumber) break;
  }
  throw new Error("Couldn't insert a test SMS number.");
}

/**
 * Makes the organization's SMS account a Twilio subaccount with a known auth token (stored
 * encrypted with `keys`), so tests can sign callbacks for it.
 */
export async function useTestTwilioAccount(
  organizationId: string,
  keys: Parameters<typeof encryptSecret>[1],
): Promise<{ accountSid: string; authToken: string }> {
  const authToken = randomUUID();
  const accountSid = `AC${randomUUID().replaceAll("-", "")}`;
  await ensureSmsAccountRow(organizationId);
  await db
    .update(smsAccount)
    .set({
      provider: "twilio",
      subaccountSid: accountSid,
      authToken: encryptSecret(authToken, keys),
    })
    .where(eq(smsAccount.organizationId, organizationId));
  return { accountSid, authToken };
}
