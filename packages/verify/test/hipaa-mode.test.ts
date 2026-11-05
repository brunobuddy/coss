import { describe, expect, test } from "bun:test";
import { HipaaModeError } from "@coss/compliance";
import { enableTestHipaaMode } from "@coss/compliance/testing";
import { createTestSmsNumber } from "@coss/sms/testing";
import { createTestTenant, type TestTenant } from "@coss/tenancy/testing";
import { StartVerificationRequest } from "../src/schemas.ts";
import type { VerifyEnvironment } from "../src/service.ts";
import { updateVerifySettings } from "../src/settings.ts";
import { testVerifyService } from "../src/testing.ts";

function env(environment: TestTenant["production"]): VerifyEnvironment {
  return {
    organizationId: environment.organizationId,
    projectId: environment.projectId,
    environmentId: environment.id,
    mode: environment.mode,
  };
}

function start(tenant: TestTenant, service: ReturnType<typeof testVerifyService>, to: string) {
  return service.start({
    environment: env(tenant.production),
    apiKeyId: null,
    params: StartVerificationRequest.parse({ channel: "sms", to }),
  });
}

describe("HIPAA mode", () => {
  test("coss.com's shared numbers aren't available", async () => {
    const coss = await createTestTenant();
    const shared = await createTestSmsNumber(coss.organization.id);
    const tenant = await createTestTenant();
    await enableTestHipaaMode(tenant.organization.id);
    const service = testVerifyService({
      sharedSms: { environment: env(coss.production), numbers: [shared.phoneNumber] },
    });

    await expect(start(tenant, service, "+14155550199")).rejects.toBeInstanceOf(HipaaModeError);
    expect(service.sms.provider.sent).toEqual([]);
  });

  test("the environment's own number sends to US numbers, and nowhere else", async () => {
    const tenant = await createTestTenant();
    const own = await createTestSmsNumber(tenant.organization.id, { countries: ["US", "CA"] });
    await updateVerifySettings(
      { organizationId: tenant.organization.id, environmentId: tenant.production.id },
      { sms_from: own.phoneNumber, app_name: "Clinic", allowed_countries: ["US", "CA"] },
    );
    await enableTestHipaaMode(tenant.organization.id);
    const service = testVerifyService();

    await start(tenant, service, "+14155550199");
    expect(service.sms.provider.sent).toHaveLength(1);

    await expect(start(tenant, service, "+14165550199")).rejects.toBeInstanceOf(HipaaModeError);
    expect(service.sms.provider.sent).toHaveLength(1);
  });
});
