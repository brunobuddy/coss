import { describe, expect, test } from "bun:test";
import { getHipaaImpact, HIPAA_MODE_RESTRICTION, HipaaModeError } from "@coss/compliance";
import { enableTestHipaaMode } from "@coss/compliance/testing";
import { db, schema } from "@coss/db";
import { createTestTenant, type TestTenant } from "@coss/tenancy/testing";
import { eq } from "drizzle-orm";
import { SendSmsRequest, SMS_SIMULATOR } from "../src/schemas.ts";
import { createSmsService, type SendEnvironment } from "../src/service.ts";
import {
  createTestSmsNumber,
  dispatchingSmsService,
  FakeSmsProvider,
  memorySmsDispatchQueue,
} from "../src/testing.ts";

const { smsMessage } = schema;
const UK_NUMBER = "+447911123456";

function env(environment: TestTenant["production"]): SendEnvironment {
  return {
    organizationId: environment.organizationId,
    projectId: environment.projectId,
    environmentId: environment.id,
    mode: environment.mode,
  };
}

async function liveSender(tenant: TestTenant): Promise<string> {
  const number = await createTestSmsNumber(tenant.organization.id, {
    countries: ["US", "GB", "GG"],
  });
  return number.phoneNumber;
}

describe("HIPAA mode", () => {
  test("a live SMS to a US number goes out, and its body isn't kept", async () => {
    const tenant = await createTestTenant();
    const from = await liveSender(tenant);
    await enableTestHipaaMode(tenant.organization.id);
    const service = dispatchingSmsService();

    const { sms } = await service.send({
      environment: env(tenant.production),
      apiKeyId: null,
      params: SendSmsRequest.parse({
        from,
        to: SMS_SIMULATOR.delivered,
        body: "Your lab results are ready",
      }),
    });

    expect(sms.status).not.toBe("failed");
    expect(service.provider.sent.at(-1)?.body).toBe("Your lab results are ready");
    const [row] = await db.select().from(smsMessage).where(eq(smsMessage.id, sms.id));
    expect(row?.discardBody).toBe(true);
    expect(row?.body).toBe("");
  });

  test("a live SMS to another country is refused before anything is stored", async () => {
    const tenant = await createTestTenant();
    const from = await liveSender(tenant);
    await enableTestHipaaMode(tenant.organization.id);
    const service = dispatchingSmsService();

    const error = await service
      .send({
        environment: env(tenant.production),
        apiKeyId: null,
        params: SendSmsRequest.parse({ from, to: UK_NUMBER, body: "Your results" }),
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HipaaModeError);
    expect((error as HipaaModeError).code).toBe(HIPAA_MODE_RESTRICTION);
    expect(service.provider.sent).toEqual([]);
    const rows = await db
      .select()
      .from(smsMessage)
      .where(eq(smsMessage.organizationId, tenant.organization.id));
    expect(rows).toEqual([]);
  });

  test("a message accepted before the mode was on fails instead of going out", async () => {
    const tenant = await createTestTenant();
    const from = await liveSender(tenant);
    const provider = new FakeSmsProvider({ log: false });
    const service = createSmsService({
      liveProvider: provider,
      sandboxProvider: provider,
      queue: memorySmsDispatchQueue(),
    });
    const { sms: accepted } = await service.send({
      environment: env(tenant.production),
      apiKeyId: null,
      params: SendSmsRequest.parse({ from, to: UK_NUMBER, body: "Your results" }),
    });
    await enableTestHipaaMode(tenant.organization.id);

    const sms = await service.dispatch({
      organizationId: tenant.organization.id,
      smsId: accepted.id,
    });

    expect(sms.status).toBe("failed");
    expect(sms.failure?.code).toBe(HIPAA_MODE_RESTRICTION);
    expect(provider.sent).toEqual([]);
    const impact = await getHipaaImpact(tenant.organization.id);
    expect(impact.smsOutsideUsLast30Days).toBe(1);
  });

  test("a US message accepted before the mode was on doesn't keep its body either", async () => {
    const tenant = await createTestTenant();
    const from = await liveSender(tenant);
    const provider = new FakeSmsProvider({ log: false });
    const service = createSmsService({
      liveProvider: provider,
      sandboxProvider: provider,
      queue: memorySmsDispatchQueue(),
    });
    const { sms: accepted } = await service.send({
      environment: env(tenant.production),
      apiKeyId: null,
      params: SendSmsRequest.parse({ from, to: SMS_SIMULATOR.delivered, body: "Your results" }),
    });
    await enableTestHipaaMode(tenant.organization.id);

    await service.dispatch({ organizationId: tenant.organization.id, smsId: accepted.id });

    expect(provider.sent).toHaveLength(1);
    const [row] = await db.select().from(smsMessage).where(eq(smsMessage.id, accepted.id));
    expect(row?.discardBody).toBe(true);
    expect(row?.body).toBe("");
  });

  test("sandbox environments reach no vendor, so they keep their text and any country", async () => {
    const tenant = await createTestTenant();
    await enableTestHipaaMode(tenant.organization.id);
    const service = dispatchingSmsService();

    const { sms } = await service.send({
      environment: env(tenant.development),
      apiKeyId: null,
      params: SendSmsRequest.parse({ from: "+14155550123", to: UK_NUMBER, body: "Test message" }),
    });

    const [row] = await db.select().from(smsMessage).where(eq(smsMessage.id, sms.id));
    expect(row?.body).toBe("Test message");
  });
});
