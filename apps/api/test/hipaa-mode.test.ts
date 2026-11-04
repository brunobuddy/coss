import { describe, expect, test } from "bun:test";
import { HIPAA_MODE_RESTRICTION } from "@coss/compliance";
import { enableTestHipaaMode } from "@coss/compliance/testing";
import { createVerifiedDomain } from "@coss/email/testing";
import { memoryLogWriter } from "@coss/logs/testing";
import { createTestTenant } from "@coss/tenancy/testing";
import { createTestApp, errorOf, type TestApp } from "./helpers.ts";

function json(app: TestApp, key: string, path: string, method: string, body?: unknown) {
  return Promise.resolve(
    app.request(path, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}

async function tenantInMode() {
  const tenant = await createTestTenant();
  await enableTestHipaaMode(tenant.organization.id);
  return tenant;
}

async function expectRefused(response: Response) {
  expect(response.status).toBe(403);
  const error = await errorOf(response);
  expect(error.type).toBe("permission_error");
  expect(error.code).toBe(HIPAA_MODE_RESTRICTION);
  expect(error.hint).toContain("HIPAA mode");
}

describe("HIPAA mode over the API", () => {
  test("GET /v1/environment says so", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const before = await json(app, tenant.liveKey, "/v1/environment", "GET");
    expect((await before.json()).organization.hipaa_mode).toBe(false);
    await enableTestHipaaMode(tenant.organization.id);
    const after = await json(app, tenant.liveKey, "/v1/environment", "GET");
    expect((await after.json()).organization.hipaa_mode).toBe(true);
  });

  test("classifying content and checking phones are refused in live environments", async () => {
    const tenant = await tenantInMode();
    const { app } = createTestApp();
    await expectRefused(
      await json(app, tenant.liveKey, "/v1/risk/content/classify", "POST", { text: "A patient" }),
    );
    await expectRefused(
      await json(app, tenant.liveKey, "/v1/risk/phone/check", "POST", { phone: "+14155550123" }),
    );
  });

  test("sandbox keys keep their test fixtures", async () => {
    const tenant = await tenantInMode();
    const { app } = createTestApp();
    const response = await json(app, tenant.sandboxKey, "/v1/risk/content/classify", "POST", {
      text: "[coss-test:phishing]",
    });
    expect(response.status).toBe(200);
  });

  test("a send asking for tracking is refused, and one without it goes through", async () => {
    const tenant = await tenantInMode();
    const domain = await createVerifiedDomain(tenant.organization.id);
    const { app } = createTestApp();
    const email = { from: `hello@${domain.name}`, to: "a@example.com", subject: "Hi", text: "Hi" };
    await expectRefused(
      await json(app, tenant.liveKey, "/v1/emails", "POST", {
        ...email,
        tracking: { opens: true },
      }),
    );
    const accepted = await json(app, tenant.liveKey, "/v1/emails", "POST", email);
    expect(accepted.status).toBe(202);
  });

  test("storage and tracking settings can't be loosened", async () => {
    const tenant = await tenantInMode();
    const { app } = createTestApp();
    await expectRefused(
      await json(app, tenant.liveKey, "/v1/storage_settings", "PATCH", {
        content_storage: "store",
      }),
    );
    await expectRefused(
      await json(app, tenant.liveKey, "/v1/tracking_settings/default", "PATCH", { clicks: true }),
    );
  });

  test("live request logs keep metadata only, sandbox ones their bodies", async () => {
    const tenant = await tenantInMode();
    const logWriter = memoryLogWriter();
    const { app } = createTestApp({ logWriter });
    for (const key of [tenant.liveKey, tenant.sandboxKey]) {
      await json(app, key, "/v1/contacts?email=patient@example.com", "POST", {
        email: "patient@example.com",
      });
    }
    await Bun.sleep(50);
    const [live, sandbox] = [tenant.production.id, tenant.development.id].map((environmentId) =>
      logWriter.entries.find((entry) => entry.environmentId === environmentId),
    );
    expect(JSON.stringify(live?.attributes)).not.toContain("patient@example.com");
    expect(live?.path).toBe("/v1/contacts");
    expect(JSON.stringify(sandbox?.attributes)).toContain("patient@example.com");
  });
});
