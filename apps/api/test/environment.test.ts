import { describe, expect, test } from "bun:test";
import { listOrgAuditEvents } from "@coss/logs";
import { createEnvironmentApiKey } from "@coss/tenancy";
import { createTestTenant } from "@coss/tenancy/testing";
import { API_VERSIONS, LATEST_API_VERSION } from "@coss/versioning";
import { EnvironmentObject } from "../src/routes/environment.ts";
import {
  apiKeyIdForEnvironment,
  createTestApp,
  errorOf,
  setKeyPermissions,
  type TestApp,
} from "./helpers.ts";

function getEnvironment(app: TestApp, key: string | null, headers: Record<string, string> = {}) {
  return Promise.resolve(
    app.request("/v1/environment", {
      headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...headers },
    }),
  );
}

describe("GET /v1/environment", () => {
  test("describes each key's own environment, project and organization", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();

    for (const [key, environment] of [
      [tenant.sandboxKey, tenant.development],
      [tenant.liveKey, tenant.production],
    ] as const) {
      const res = await getEnvironment(app, key);
      expect(res.status).toBe(200);
      const body = EnvironmentObject.parse(await res.json());
      expect(body).toEqual({
        object: "environment",
        id: environment.id,
        name: environment.name,
        slug: environment.slug,
        mode: environment.mode,
        project: { id: tenant.project.id, name: tenant.project.name, slug: tenant.project.slug },
        organization: {
          id: tenant.organization.id,
          name: tenant.organization.name,
          slug: tenant.organization.slug,
          api_version: LATEST_API_VERSION,
          hipaa_mode: false,
        },
        api_key: {
          id: await apiKeyIdForEnvironment(environment.id),
          name: environment.mode === "live" ? "Test live key" : "Test sandbox key",
          start: expect.stringMatching(/^coss_(live|test)_/),
          access: "full",
          permissions: expect.arrayContaining(["email:send", "domain:create", "hook:send"]),
        },
      });
      expect(key.startsWith(body.api_key.start ?? "-")).toBe(true);
    }
  });

  test("reports what a restricted key may do", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const created = await createEnvironmentApiKey({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
      name: "Sender",
      userId: tenant.owner.id,
      permissions: { email: ["send"], log: ["read"] },
    });
    const res = await getEnvironment(app, created.key);
    expect(res.status).toBe(200);
    expect(EnvironmentObject.parse(await res.json()).api_key).toEqual({
      id: created.id,
      name: "Sender",
      start: created.start,
      access: "restricted",
      permissions: ["email:send", "log:read"],
    });
  });

  test("reports the organization's pin, not the requested version", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const older = API_VERSIONS[0];
    const res = await getEnvironment(app, tenant.sandboxKey, { "Coss-Version": older });
    expect(res.status).toBe(200);
    expect(res.headers.get("coss-version")).toBe(older);
    expect((await res.json()).organization.api_version).toBe(LATEST_API_VERSION);
  });

  test("needs no permission, only a valid key", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    await setKeyPermissions(await apiKeyIdForEnvironment(tenant.development.id), {});
    expect((await getEnvironment(app, tenant.sandboxKey)).status).toBe(200);

    const missing = await getEnvironment(app, null);
    expect(missing.status).toBe(401);
    expect(await errorOf(missing)).toMatchObject({ code: "missing_api_key" });
    const invalid = await getEnvironment(app, `coss_test_${"x".repeat(64)}`);
    expect(invalid.status).toBe(401);
    expect(await errorOf(invalid)).toMatchObject({ code: "invalid_api_key" });
  });
});

describe("DELETE /v1/api_key", () => {
  test("revokes the calling key, and only that key", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const keyId = await apiKeyIdForEnvironment(tenant.development.id);
    const res = await app.request("/v1/api_key", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tenant.sandboxKey}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ object: "api_key", id: keyId, deleted: true });

    const after = await getEnvironment(app, tenant.sandboxKey);
    expect(after.status).toBe(401);
    expect(await errorOf(after)).toMatchObject({ code: "invalid_api_key" });
    // The other environment's key still works.
    expect((await getEnvironment(app, tenant.liveKey)).status).toBe(200);

    const { events } = await listOrgAuditEvents({ organizationId: tenant.organization.id });
    expect(events.find((event) => event.action === "api_key.revoked")).toMatchObject({
      actor_type: "api_key",
      actor_id: keyId,
      target_id: keyId,
      target_label: "Test sandbox key",
    });
  });
});
