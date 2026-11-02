import { describe, expect, spyOn, test } from "bun:test";
import { memoryLimiter } from "@coss/ratelimit/testing";
import { createEnvironmentApiKey } from "@coss/tenancy";
import { suspendOrganization, unsuspendOrganization } from "@coss/tenancy/admin";
import { createTestTenant, createTestUser } from "@coss/tenancy/testing";
import { versioning } from "@coss/versioning";
import { Hono } from "hono";
import { errorResponse, toApiError } from "../src/errors.ts";
import { type Authenticate, requireApiKey } from "../src/middleware/api-key.ts";
import { requestId } from "../src/middleware/request-id.ts";
import type { AppEnv } from "../src/types.ts";
import {
  apiKeyIdForEnvironment,
  authContext,
  createTestApp,
  deleteKey,
  emailBody,
  errorOf,
  getEmailById,
  sendEmail,
  setKeyEnabled,
  setKeyPermissions,
} from "./helpers.ts";

const UNKNOWN_KEY = `coss_test_${"a".repeat(64)}`;

describe("authentication", () => {
  test("a request without Authorization is 401 missing_api_key", async () => {
    const { app } = createTestApp();
    const res = await sendEmail(app, null, emailBody());

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe("Bearer");
    expect(await errorOf(res)).toMatchObject({
      type: "authentication_error",
      code: "missing_api_key",
    });
  });

  test("a non-Bearer Authorization header is 401 missing_api_key", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const res = await sendEmail(app, null, emailBody(), {
      Authorization: `Basic ${tenant.sandboxKey}`,
    });

    expect(res.status).toBe(401);
    const error = await errorOf(res);
    expect(error).toMatchObject({ type: "authentication_error", code: "missing_api_key" });
    expect(error.message).toContain("Bearer");
  });

  test("a malformed key is 401 invalid_api_key", async () => {
    const { app } = createTestApp();
    const res = await sendEmail(app, "not-a-coss-key", emailBody());

    expect(res.status).toBe(401);
    expect(await errorOf(res)).toMatchObject({
      type: "authentication_error",
      code: "invalid_api_key",
    });
  });

  test("a well-formed but unknown key is 401 invalid_api_key", async () => {
    const { app } = createTestApp();
    const res = await sendEmail(app, UNKNOWN_KEY, emailBody());

    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe("invalid_api_key");
  });

  test("a revoked (deleted) key is 401 invalid_api_key", async () => {
    const tenant = await createTestTenant();
    const { app, sandboxProvider } = createTestApp();
    await deleteKey(await apiKeyIdForEnvironment(tenant.development.id));

    const res = await sendEmail(app, tenant.sandboxKey, emailBody());

    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe("invalid_api_key");
    expect(sandboxProvider.sent).toHaveLength(0);
  });

  test("a disabled key is 401 invalid_api_key", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    await setKeyEnabled(await apiKeyIdForEnvironment(tenant.development.id), false);

    const res = await getEmailById(app, tenant.sandboxKey, "email_01k7c8m4q2f3e9v6t5r1n0p8yz");

    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe("invalid_api_key");
  });

  test("the Bearer scheme is case-insensitive", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const res = await sendEmail(app, null, emailBody(), {
      Authorization: `bearer ${tenant.sandboxKey}`,
    });

    expect(res.status).toBe(202);
  });

  test("authentication runs before body validation (401 wins over 422)", async () => {
    const { app } = createTestApp();
    const res = await sendEmail(app, null, { nonsense: true });

    expect(res.status).toBe(401);
  });

  test("a key without the needed permission is 403 insufficient_permissions", async () => {
    const tenant = await createTestTenant();
    const { app, sandboxProvider } = createTestApp();
    const created = await createEnvironmentApiKey({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
      name: "Hooks only",
      userId: tenant.owner.id,
      permissions: "full",
    });
    await setKeyPermissions(created.id, { hook: ["send"] });

    const send = await sendEmail(app, created.key, emailBody());
    expect(send.status).toBe(403);
    const error = await errorOf(send);
    expect(error).toMatchObject({ type: "permission_error", code: "insufficient_permissions" });
    expect(error.message).toContain("email:send");
    expect(sandboxProvider.sent).toHaveLength(0);

    const get = await getEmailById(app, created.key, "email_01k7c8m4q2f3e9v6t5r1n0p8yz");
    expect(get.status).toBe(403);
    expect((await errorOf(get)).message).toContain("email:read");
  });

  test("keys of a suspended organization are 403 organization_suspended until it is lifted", async () => {
    const tenant = await createTestTenant();
    const admin = await createTestUser();
    const actor = { userId: admin.id, email: admin.email };
    const { app, sandboxProvider } = createTestApp();

    await suspendOrganization({
      organizationId: tenant.organization.id,
      reason: "Abuse report",
      actor,
    });
    for (const key of [tenant.sandboxKey, tenant.liveKey]) {
      const res = await sendEmail(app, key, emailBody());
      expect(res.status).toBe(403);
      const error = await errorOf(res);
      expect(error).toMatchObject({
        type: "permission_error",
        code: "organization_suspended",
        hint: expect.stringContaining("https://coss.com/docs/email/delivery.md"),
      });
      // The internal reason is never shown to the organization.
      expect(error.message).not.toContain("Abuse");
    }
    const read = await getEmailById(app, tenant.sandboxKey, "email_01k7c8m4q2f3e9v6t5r1n0p8yz");
    expect((await errorOf(read)).code).toBe("organization_suspended");
    expect(sandboxProvider.sent).toHaveLength(0);

    // A wrong key still looks wrong: the suspension is only revealed to valid keys.
    expect(await errorOf(await sendEmail(app, UNKNOWN_KEY, emailBody()))).toMatchObject({
      code: "invalid_api_key",
    });

    await unsuspendOrganization({ organizationId: tenant.organization.id, actor });
    expect((await sendEmail(app, tenant.sandboxKey, emailBody())).status).toBe(202);
  });

  test("permissions are checked per endpoint", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const created = await createEnvironmentApiKey({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
      name: "Read only",
      userId: tenant.owner.id,
      permissions: { email: ["read"] },
    });

    expect((await sendEmail(app, created.key, emailBody())).status).toBe(403);
    // Authorized to read, so the unknown id gets past auth to a 404.
    const get = await getEmailById(app, created.key, "email_01k7c8m4q2f3e9v6t5r1n0p8yz");
    expect(get.status).toBe(404);
  });
});

describe("requireApiKey", () => {
  function appWith(authenticate: Authenticate) {
    const app = new Hono<AppEnv>();
    // Frozen clock: a real one refills a token every 20 ms, so the 101st request could pass.
    const limiter = memoryLimiter();
    app.use(requestId);
    app.use(async (c, next) => {
      c.set("rateLimiter", limiter);
      c.set("clientIp", null);
      c.set("versioning", versioning);
      c.set("requestedApiVersion", null);
      await next();
    });
    app.onError((error, c) => {
      const apiError = toApiError(error);
      return apiError ? errorResponse(c, apiError) : c.text("unexpected", 500);
    });
    app.get("/", requireApiKey({ email: ["send"] }, { authenticate }), (c) => c.json(c.var.auth));
    return app;
  }

  test("passes the bearer token and required permissions, and exposes the context", async () => {
    const context = authContext({ mode: "live" });
    const calls: unknown[][] = [];
    const app = appWith(async (...args) => {
      calls.push(args);
      return { ok: true, context };
    });

    const res = await app.request("/", { headers: { Authorization: "Bearer  coss_live_x  " } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(context);
    expect(calls).toEqual([["coss_live_x", { email: ["send"] }]]);
  });

  test("limits one raw credential before database authentication", async () => {
    const context = authContext({ mode: "live" });
    let calls = 0;
    const app = appWith(async () => {
      calls++;
      return { ok: true, context };
    });
    for (let i = 0; i < 100; i++) {
      expect(
        (
          await app.request("/", {
            headers: { Authorization: "Bearer coss_live_replayed-secret" },
          })
        ).status,
      ).toBe(200);
    }
    const denied = await app.request("/", {
      headers: { Authorization: "Bearer coss_live_replayed-secret" },
    });
    expect(denied.status).toBe(429);
    expect((await errorOf(denied)).code).toBe("too_many_authentications");
    expect(calls).toBe(100);
  });

  test("a verification failure (e.g. database outage) is 503 service_unavailable", async () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => {});
    try {
      const app = appWith(async () => {
        throw new Error("connection refused");
      });

      const res = await app.request("/", { headers: { Authorization: `Bearer ${UNKNOWN_KEY}` } });

      expect(res.status).toBe(503);
      const error = await errorOf(res);
      expect(error).toMatchObject({ type: "api_error", code: "service_unavailable" });
      expect(error.message).not.toContain("connection refused");
      // Logged with the request id so the outage can be traced.
      expect(String(consoleError.mock.calls[0]?.[0])).toContain(error.request_id);
    } finally {
      consoleError.mockRestore();
    }
  });
});
