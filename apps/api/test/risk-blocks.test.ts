import { describe, expect, test } from "bun:test";
import { createUsageGate } from "@coss/billing";
import { pool } from "@coss/db";
import { memoryLogWriter } from "@coss/logs/testing";
import { cachedOverrides, setRateLimitOverride } from "@coss/ratelimit";
import { memoryLimiter } from "@coss/ratelimit/testing";
import { fakePhoneLookup, TEST_IPS, testRiskDeps } from "@coss/risk/testing";
import { fakeClassifier } from "@coss/screening/testing";
import { createTestTenant } from "@coss/tenancy/testing";
import {
  apiKeyIdForEnvironment,
  apiRequest,
  createTestApp,
  errorOf,
  setKeyPermissions,
} from "./helpers.ts";

describe("POST /v1/risk/email/check and /v1/risk/ip/check", () => {
  test("return what coss.com knows, in live and sandbox environments", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const email = await apiRequest(app, "POST", "/v1/risk/email/check", {
      key: tenant.liveKey,
      body: { email: "ada@gnail.com" },
    });
    expect(email.status).toBe(200);
    expect(await email.json()).toMatchObject({
      object: "risk_email_check",
      valid: true,
      suggestion: "gmail.com",
    });
    const sandboxEmail = await apiRequest(app, "POST", "/v1/risk/email/check", {
      key: tenant.sandboxKey,
      body: { email: "a@disposable.test" },
    });
    expect(await sandboxEmail.json()).toMatchObject({ disposable: true });

    const ip = await apiRequest(app, "POST", "/v1/risk/ip/check", {
      key: tenant.liveKey,
      body: { ip: TEST_IPS.tor },
    });
    expect(await ip.json()).toMatchObject({ object: "risk_ip_check", tor: true });
    const invalid = await apiRequest(app, "POST", "/v1/risk/ip/check", {
      key: tenant.liveKey,
      body: { ip: "not-an-ip" },
    });
    expect(invalid.status).toBe(422);
  });

  test("need risk:assess", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    await setKeyPermissions(await apiKeyIdForEnvironment(tenant.development.id), {
      risk: ["read"],
    });
    for (const [path, body] of [
      ["/v1/risk/email/check", { email: "a@example.com" }],
      ["/v1/risk/ip/check", { ip: "192.0.2.1" }],
      ["/v1/risk/phone/check", { phone: "+12025550100" }],
      ["/v1/risk/content/classify", { text: "hi" }],
      ["/v1/risk/limits", { bucket: "b", key: "k" }],
    ] as const) {
      const res = await apiRequest(app, "POST", path, { key: tenant.sandboxKey, body });
      expect(res.status).toBe(403);
    }
  });
});

describe("POST /v1/risk/phone/check", () => {
  test("asks the provider about live numbers; the request log keeps neither number", async () => {
    const tenant = await createTestTenant();
    const writer = memoryLogWriter();
    const phoneLookup = fakePhoneLookup({
      "+14155550123": {
        lineType: "non_fixed_voip",
        carrier: { name: "Example Voice", mobileCountryCode: null, mobileNetworkCode: null },
      },
    });
    const { app } = createTestApp({ logWriter: writer, riskDeps: testRiskDeps({ phoneLookup }) });
    const res = await apiRequest(app, "POST", "/v1/risk/phone/check", {
      key: tenant.liveKey,
      body: { phone: "+1 (415) 555-0123" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      object: "risk_phone_check",
      phone: "+14155550123",
      valid: true,
      country: "US",
      line_type: "non_fixed_voip",
      carrier: { name: "Example Voice", mobile_country_code: null, mobile_network_code: null },
      sim_swap: null,
      degraded: [],
    });

    // Not E.164: answered without asking anyone.
    const invalid = await apiRequest(app, "POST", "/v1/risk/phone/check", {
      key: tenant.liveKey,
      body: { phone: "0415 555 0124" },
    });
    expect(await invalid.json()).toMatchObject({ phone: "0415 555 0124", valid: false });
    expect(phoneLookup.calls).toEqual(["+14155550123"]);

    await writer.flush();
    expect(writer.entries.filter((entry) => entry.path === "/v1/risk/phone/check")).toHaveLength(2);
    const logged = JSON.stringify(writer.entries);
    expect(logged).not.toContain("5550123");
    expect(logged).not.toContain("5550124");
  });

  test("sandbox keys see the fixtures, never the provider", async () => {
    const tenant = await createTestTenant();
    const phoneLookup = fakePhoneLookup();
    const { app } = createTestApp({ riskDeps: testRiskDeps({ phoneLookup }) });
    const check = async (phone: string) =>
      (
        await apiRequest(app, "POST", "/v1/risk/phone/check", {
          key: tenant.sandboxKey,
          body: { phone },
        })
      ).json();
    expect(await check("+12025550102")).toMatchObject({
      line_type: "non_fixed_voip",
      sim_swap: null,
    });
    expect(await check("+12025550104")).toMatchObject({
      line_type: "mobile",
      sim_swap: { recent: true, period: "PT48H" },
    });
    expect(await check("+12025550199")).toMatchObject({ valid: false, line_type: null });
    expect(await check("+447700900123")).toMatchObject({
      valid: true,
      line_type: null,
      degraded: [],
    });
    expect(phoneLookup.calls).toEqual([]);
  });

  test("a failed lookup is degraded; no provider is a 503", async () => {
    const tenant = await createTestTenant();
    const failing = createTestApp({
      riskDeps: testRiskDeps({ phoneLookup: fakePhoneLookup({ "+14155550123": "fail" }) }),
    });
    const degraded = await apiRequest(failing.app, "POST", "/v1/risk/phone/check", {
      key: tenant.liveKey,
      body: { phone: "+14155550123" },
    });
    expect(await degraded.json()).toMatchObject({
      valid: true,
      line_type: null,
      degraded: ["phone_data"],
    });

    const { app } = createTestApp({ riskDeps: testRiskDeps({ phoneLookup: null }) });
    const unavailable = await apiRequest(app, "POST", "/v1/risk/phone/check", {
      key: tenant.liveKey,
      body: { phone: "+14155550123" },
    });
    expect(unavailable.status).toBe(503);
    expect(await errorOf(unavailable)).toMatchObject({ code: "phone_lookup_unavailable" });
  });

  test("a billing hold is a 402; checks the provider answered are metered", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const check = () =>
      apiRequest(app, "POST", "/v1/risk/phone/check", {
        key: tenant.liveKey,
        body: { phone: "+14155550123" },
      });
    expect((await check()).status).toBe(200);
    const usage = await pool.query<{ quantity: number }>(
      "select sum(quantity)::int as quantity from billing_usage where organization_id = $1 and meter = 'risk.phone_checks'",
      [tenant.organization.id],
    );
    expect(usage.rows[0]?.quantity).toBe(1);
    await pool.query(
      "insert into billing_hold (organization_id, reason) values ($1, 'delinquent')",
      [tenant.organization.id],
    );
    const held = await check();
    expect(held.status).toBe(402);
    expect(await errorOf(held)).toMatchObject({ type: "billing_error", code: "billing_hold" });
  });

  test("live checks are limited per organization; sandbox ones are free", async () => {
    const tenant = await createTestTenant();
    await setRateLimitOverride({
      organizationId: tenant.organization.id,
      bucket: "risk.phone",
      rule: { limit: 1, periodMs: 60_000, burst: 1 },
    });
    const { app } = createTestApp({ rateLimiter: memoryLimiter({ overrides: cachedOverrides() }) });
    const check = (key: string) =>
      apiRequest(app, "POST", "/v1/risk/phone/check", { key, body: { phone: "+12025550100" } });
    expect((await check(tenant.liveKey)).status).toBe(200);
    const limited = await check(tenant.liveKey);
    expect(limited.status).toBe(429);
    expect(await errorOf(limited)).toMatchObject({ code: "phone_check_rate_limited" });
    expect((await check(tenant.sandboxKey)).status).toBe(200);
  });
});

describe("POST /v1/risk/content/classify", () => {
  test("returns scores; neither the request log nor anything else keeps the text", async () => {
    const tenant = await createTestTenant();
    const writer = memoryLogWriter();
    const { app } = createTestApp({ logWriter: writer });
    const text = "Earn $5,000 a week [coss-test:fraud:0.8] secret-sentence";
    const res = await apiRequest(app, "POST", "/v1/risk/content/classify", {
      key: tenant.liveKey,
      body: { text },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      object: "risk_content_classification",
      scores: { spam: 0.01, phishing: 0.01, malware: 0.01, fraud: 0.8 },
      truncated: false,
    });
    await writer.flush();
    expect(writer.entries.some((entry) => entry.path === "/v1/risk/content/classify")).toBe(true);
    expect(JSON.stringify(writer.entries)).not.toContain("secret-sentence");
  });

  test("503 when the model fails, so the caller can retry or go without", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp({
      riskDeps: testRiskDeps({ classifier: fakeClassifier({ fail: true }) }),
    });
    const res = await apiRequest(app, "POST", "/v1/risk/content/classify", {
      key: tenant.liveKey,
      body: { text: "hello" },
    });
    expect(res.status).toBe(503);
    expect(await errorOf(res)).toMatchObject({
      type: "api_error",
      code: "classification_unavailable",
    });
  });

  test("live classifications are limited per organization; sandbox ones are free", async () => {
    const tenant = await createTestTenant();
    await setRateLimitOverride({
      organizationId: tenant.organization.id,
      bucket: "risk.classify",
      rule: { limit: 1, periodMs: 60_000, burst: 1 },
    });
    const { app } = createTestApp({ rateLimiter: memoryLimiter({ overrides: cachedOverrides() }) });
    const classify = (key: string) =>
      apiRequest(app, "POST", "/v1/risk/content/classify", { key, body: { text: "hi" } });
    expect((await classify(tenant.liveKey)).status).toBe(200);
    const limited = await classify(tenant.liveKey);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    expect(await errorOf(limited)).toMatchObject({ code: "classification_rate_limited" });
    expect((await classify(tenant.sandboxKey)).status).toBe(200);
  });
});

describe("metering Risk", () => {
  const usage = async (organizationId: string, meter: string) => {
    const { rows } = await pool.query<{ quantity: number }>(
      "select coalesce(sum(quantity), 0)::int as quantity from billing_usage where organization_id = $1 and meter = $2",
      [organizationId, meter],
    );
    return rows[0]?.quantity;
  };

  test("the API counts live assessments and content checks; sandbox ones are free", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp({
      riskDeps: testRiskDeps({ classifier: fakeClassifier() }),
    });
    const assess = (key: string) =>
      apiRequest(app, "POST", "/v1/risk/assessments", {
        key,
        body: { event: "signup", user: { email: "ada@example.com" } },
      });
    const classify = (key: string) =>
      apiRequest(app, "POST", "/v1/risk/content/classify", { key, body: { text: "hi" } });

    expect((await assess(tenant.sandboxKey)).status).toBe(201);
    expect((await classify(tenant.sandboxKey)).status).toBe(200);
    expect(await usage(tenant.organization.id, "risk.assessments")).toBe(0);
    expect(await usage(tenant.organization.id, "risk.content_checks")).toBe(0);

    expect((await assess(tenant.liveKey)).status).toBe(201);
    expect((await classify(tenant.liveKey)).status).toBe(200);
    expect(await usage(tenant.organization.id, "risk.assessments")).toBe(1);
    expect(await usage(tenant.organization.id, "risk.content_checks")).toBe(1);
  });

  test("past the allowance an assessment still answers, and a content check is a 402", async () => {
    const tenant = await createTestTenant();
    const gate = createUsageGate({ ttlMs: 0 });
    const { app } = createTestApp({
      riskDeps: testRiskDeps({ usage: gate, classifier: fakeClassifier() }),
    });
    for (const meter of ["risk.assessments", "risk.content_checks"]) {
      await pool.query(
        "insert into billing_quota (organization_id, meter, period_start, reserved) values ($1, $2, date_trunc('month', now() at time zone 'UTC') at time zone 'UTC', 10000)",
        [tenant.organization.id, meter],
      );
    }
    const assessed = await apiRequest(app, "POST", "/v1/risk/assessments", {
      key: tenant.liveKey,
      body: { event: "signup", user: { email: "ada@example.com" } },
    });
    expect(assessed.status).toBe(201);
    const assessment = (await assessed.json()) as { decision: string; degraded: string[] };
    expect(assessment.degraded).toContain("usage_limit");

    const classified = await apiRequest(app, "POST", "/v1/risk/content/classify", {
      key: tenant.liveKey,
      body: { text: "hi" },
    });
    expect(classified.status).toBe(402);
    expect(await errorOf(classified)).toMatchObject({
      type: "billing_error",
      code: "usage_limit_exceeded",
    });
  });
});

describe("POST /v1/risk/assessments with content", () => {
  test("scores land in signals; the request log keeps only the text's length", async () => {
    const tenant = await createTestTenant();
    const writer = memoryLogWriter();
    const { app } = createTestApp({ logWriter: writer });
    const res = await apiRequest(app, "POST", "/v1/risk/assessments", {
      key: tenant.liveKey,
      body: {
        event: "signup",
        user: { email: "ada@example.com" },
        content: { text: "My private bio [coss-test:spam:0.7]" },
      },
    });
    expect(res.status).toBe(201);
    expect((await res.json()).signals.content).toEqual({
      spam: 0.7,
      phishing: 0.01,
      malware: 0.01,
      fraud: 0.01,
    });
    await writer.flush();
    const line = writer.entries.find((entry) => entry.path === "/v1/risk/assessments");
    expect(JSON.stringify(writer.entries)).not.toContain("private bio");
    const attributes = line?.attributes as { request: { body: { content: unknown } } } | undefined;
    expect(attributes?.request.body.content).toEqual({ text: "[35 characters]" });
  });

  test("content thresholds are settings", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const key = tenant.liveKey;
    const patched = await apiRequest(app, "PATCH", "/v1/risk/settings", {
      key,
      body: { content_thresholds: { phishing: 0.6 } },
    });
    expect((await patched.json()).content_thresholds).toEqual({
      spam: null,
      phishing: 0.6,
      malware: null,
      fraud: null,
    });
    const assessed = await apiRequest(app, "POST", "/v1/risk/assessments", {
      key,
      body: { event: "message", content: { text: "Log in at [coss-test:phishing]" } },
    });
    expect((await assessed.json()).reasons).toEqual([
      {
        code: "content.phishing",
        message: "The content's phishing score (0.99) reached your threshold (0.6).",
        value: 0.99,
        threshold: 0.6,
      },
    ]);
  });
});

describe("/v1/risk/limit_buckets and POST /v1/risk/limits", () => {
  test("manage buckets and check keys against them", async () => {
    const tenant = await createTestTenant();
    const writer = memoryLogWriter();
    const { app } = createTestApp({ logWriter: writer });
    const key = tenant.liveKey;
    const created = await apiRequest(app, "POST", "/v1/risk/limit_buckets", {
      key,
      body: { name: "password_reset", limit: 2, period_seconds: 3600 },
    });
    expect(created.status).toBe(201);
    const bucket = await created.json();
    expect(bucket).toMatchObject({
      object: "risk_limit_bucket",
      name: "password_reset",
      limit: 2,
      period_seconds: 3600,
      burst: 2,
      on_failure: "allow",
    });
    const taken = await apiRequest(app, "POST", "/v1/risk/limit_buckets", {
      key,
      body: { name: "password_reset", limit: 1, period_seconds: 1 },
    });
    expect(taken.status).toBe(422);
    expect(await errorOf(taken)).toMatchObject({ code: "limit_bucket_name_taken", param: "name" });

    const check = () =>
      apiRequest(app, "POST", "/v1/risk/limits", {
        key,
        body: { bucket: "password_reset", key: "ada@example.com" },
      });
    expect(await (await check()).json()).toMatchObject({
      object: "risk_limit",
      allowed: true,
      remaining: 1,
    });
    await check();
    const denied = await check();
    expect(denied.status).toBe(200);
    expect(await denied.json()).toMatchObject({ allowed: false, remaining: 0 });
    // The limited key never reaches the request log.
    await writer.flush();
    expect(JSON.stringify(writer.entries)).not.toContain("ada@example.com");

    const missing = await apiRequest(app, "POST", "/v1/risk/limits", {
      key,
      body: { bucket: "nope", key: "k" },
    });
    expect(missing.status).toBe(404);
    expect(await errorOf(missing)).toMatchObject({ code: "not_found", param: "bucket" });

    const patched = await apiRequest(app, "PATCH", `/v1/risk/limit_buckets/${bucket.id}`, {
      key,
      body: { burst: 5 },
    });
    expect(await patched.json()).toMatchObject({ limit: 2, burst: 5 });
    expect((await check()).status).toBe(200);
    const list = await (await apiRequest(app, "GET", "/v1/risk/limit_buckets", { key })).json();
    expect(list.data.map((b: { id: string }) => b.id)).toEqual([bucket.id]);
    // Other environments don't see it.
    const other = await apiRequest(app, "GET", `/v1/risk/limit_buckets/${bucket.id}`, {
      key: tenant.sandboxKey,
    });
    expect(other.status).toBe(404);
    const deleted = await apiRequest(app, "DELETE", `/v1/risk/limit_buckets/${bucket.id}`, { key });
    expect(await deleted.json()).toEqual({
      object: "risk_limit_bucket",
      id: bucket.id,
      deleted: true,
    });
    expect((await check()).status).toBe(404);

    const { rows } = await pool.query(
      "select action from org_audit_event where organization_id = $1 and action like 'risk_limit_bucket.%' order by id",
      [tenant.organization.id],
    );
    expect(rows.map((row) => row.action)).toEqual([
      "risk_limit_bucket.created",
      "risk_limit_bucket.updated",
      "risk_limit_bucket.deleted",
    ]);
  });

  test("risk:read lists buckets, risk:update changes them", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    await setKeyPermissions(await apiKeyIdForEnvironment(tenant.development.id), {
      risk: ["read", "assess"],
    });
    const key = tenant.sandboxKey;
    expect((await apiRequest(app, "GET", "/v1/risk/limit_buckets", { key })).status).toBe(200);
    const refused = await apiRequest(app, "POST", "/v1/risk/limit_buckets", {
      key,
      body: { name: "b", limit: 1, period_seconds: 1 },
    });
    expect(refused.status).toBe(403);
  });
});
