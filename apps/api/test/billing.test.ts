import { describe, expect, test } from "bun:test";
import {
  createCreditGrant,
  createPlanGate,
  createUsageGate,
  periodOf,
  placeHold,
  runDueBillingPeriods,
} from "@coss/billing";
import { createTestContract, recordTestUsage } from "@coss/billing/testing";
import { db, schema } from "@coss/db";
import { uniqueSuffix } from "@coss/db/testing";
import { createVerifiedDomain } from "@coss/email/testing";
import { memoryLimiter } from "@coss/ratelimit/testing";
import { createTestTenant } from "@coss/tenancy/testing";
import { apiRequest, createTestApp, emailBody, errorOf, sendEmail } from "./helpers.ts";

describe("billing errors", () => {
  test("plan limits answer 402 billing_error", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp({ plans: createPlanGate() });
    const create = () =>
      apiRequest(app, "POST", "/v1/domains", {
        key: tenant.liveKey,
        body: { name: `t-${uniqueSuffix()}.coss.test` },
      });
    expect((await create()).status).toBe(200);
    const refused = await create();
    expect(refused.status).toBe(402);
    expect(await errorOf(refused)).toMatchObject({
      type: "billing_error",
      code: "plan_limit_reached",
      message: expect.stringContaining("1 domains"),
    });
  });

  test("the audit log needs a plan that includes it", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp({ plans: createPlanGate() });
    const free = await apiRequest(app, "GET", "/v1/audit_events", { key: tenant.liveKey });
    expect(free.status).toBe(402);
    expect((await errorOf(free)).code).toBe("plan_feature_unavailable");
    await createTestContract(
      tenant.organization.id,
      { version: 1, plan: "pro" },
      { effectiveFrom: new Date("2026-01-01T00:00:00Z") },
    );
    expect((await apiRequest(app, "GET", "/v1/audit_events", { key: tenant.liveKey })).status).toBe(
      200,
    );
  });

  test("a billing hold refuses live sends; Free's allowance caps them", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp({ plans: createPlanGate(), billing: createUsageGate() });
    const domain = await createVerifiedDomain(tenant.organization.id);
    const from = `hello@${domain.name}`;

    await db.insert(schema.billingQuota).values({
      organizationId: tenant.organization.id,
      meter: "email.recipients",
      periodStart: periodOf(new Date()).start,
      reserved: 3_000,
    });
    const capped = await sendEmail(app, tenant.liveKey, emailBody({ from }));
    expect(capped.status).toBe(402);
    expect(await errorOf(capped)).toMatchObject({
      type: "billing_error",
      code: "usage_limit_exceeded",
    });
    // Sandbox sends aren't capped.
    expect((await sendEmail(app, tenant.sandboxKey, emailBody())).status).toBe(202);

    await placeHold(db, tenant.organization.id, "delinquent", null);
    const held = await sendEmail(app, tenant.liveKey, emailBody({ from }));
    expect(held.status).toBe(402);
    expect(await errorOf(held)).toMatchObject({ type: "billing_error", code: "billing_hold" });
  });

  test("Hooks: Free's messages cap live sends and refund the quota; holds refuse them", async () => {
    const tenant = await createTestTenant();
    const organizationId = tenant.organization.id;
    const consumed: string[] = [];
    const refunded: string[] = [];
    const limiter = memoryLimiter();
    const { app } = createTestApp({
      billing: createUsageGate(),
      rateLimiter: {
        ...limiter,
        consume: (request) => {
          consumed.push(...request.buckets);
          return limiter.consume(request);
        },
        refund: (request) => {
          refunded.push(...request.buckets);
          return limiter.refund(request);
        },
      },
    });
    const key = tenant.liveKey;
    const created = await apiRequest(app, "POST", "/v1/hooks/applications", {
      key,
      body: { name: "Acme", uid: "customer_1" },
    });
    expect(created.status).toBe(200);
    const send = () =>
      apiRequest(app, "POST", "/v1/hooks/applications/customer_1/messages", {
        key,
        body: { event_type: "invoice.paid", payload: {} },
      });

    expect((await send()).status).toBe(202);
    expect(refunded).toEqual([]);
    await db
      .insert(schema.billingQuota)
      .values({
        organizationId,
        meter: "hooks.messages",
        periodStart: periodOf(new Date()).start,
        reserved: 50_000,
      })
      .onConflictDoUpdate({
        target: [
          schema.billingQuota.organizationId,
          schema.billingQuota.meter,
          schema.billingQuota.periodStart,
        ],
        set: { reserved: 50_000 },
      });
    const capped = await send();
    expect(capped.status).toBe(402);
    expect(await errorOf(capped)).toMatchObject({
      type: "billing_error",
      code: "usage_limit_exceeded",
    });
    expect(refunded.filter((bucket) => bucket === "hooks.deliveries.day")).toHaveLength(1);
    expect(refunded.filter((bucket) => bucket === "hooks.messages.second")).toHaveLength(1);
    expect(consumed).toContain("hooks.messages.second");
    const listed = await apiRequest(app, "GET", "/v1/hooks/applications/customer_1/messages", {
      key,
    });
    expect((await listed.json()).data).toHaveLength(1);

    await placeHold(db, organizationId, "delinquent", null);
    const held = await send();
    expect(held.status).toBe(402);
    expect(await errorOf(held)).toMatchObject({ type: "billing_error", code: "billing_hold" });
  });
});

describe("GET /v1/billing*", () => {
  test("the organization's billing, the same from any environment's key", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const now = new Date();
    await createTestContract(
      tenant.organization.id,
      { version: 1, plan: "pro" },
      { effectiveFrom: periodOf(now).start },
    );
    await recordTestUsage({
      organizationId: tenant.organization.id,
      environmentId: tenant.production.id,
      meter: "email.recipients",
      quantity: 100_000,
      at: now,
    });
    const live = await apiRequest(app, "GET", "/v1/billing", { key: tenant.liveKey });
    expect(live.status).toBe(200);
    const body = await live.json();
    expect(body).toMatchObject({
      object: "billing",
      organization_id: tenant.organization.id,
      plan: "pro",
      contract: { kind: "self_serve" },
      status: "active",
      holds: [],
      currency: "usd",
      usage: [{ meter: "email.recipients", quantity: 100_000, included: null }],
      estimate: { usage: 4_000 },
      features: { tracking_domains: true, sso: false },
      limits: { domains: 10 },
    });
    const sandbox = await apiRequest(app, "GET", "/v1/billing", { key: tenant.sandboxKey });
    expect((await sandbox.json()).organization_id).toBe(tenant.organization.id);
  });

  test("usage by day, environment and source, and range validation", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    for (const [at, quantity, apiKeyId] of [
      ["2026-09-03T10:00:00Z", 5, null],
      ["2026-09-03T11:00:00Z", 7, "key_a"],
      ["2026-09-04T01:00:00Z", 3, "key_b"],
    ] as const) {
      await recordTestUsage({
        organizationId: tenant.organization.id,
        environmentId: tenant.production.id,
        meter: "email.recipients",
        quantity,
        at: new Date(at),
        ...(apiKeyId ? { source: { projectId: tenant.project.id, apiKeyId } } : {}),
      });
    }
    const query = "from=2026-09-01T00:00:00Z&to=2026-10-01T00:00:00Z";
    const daily = await apiRequest(app, "GET", `/v1/billing/usage?${query}`, {
      key: tenant.liveKey,
    });
    expect(
      (await daily.json()).data.map((row: { start: string; quantity: number }) => [
        row.start,
        row.quantity,
      ]),
    ).toEqual([
      ["2026-09-03T00:00:00.000Z", 12],
      ["2026-09-04T00:00:00.000Z", 3],
    ]);
    const monthly = await apiRequest(
      app,
      "GET",
      `/v1/billing/usage?${query}&granularity=month&group_by=environment`,
      { key: tenant.liveKey },
    );
    expect((await monthly.json()).data).toEqual([
      {
        object: "usage",
        meter: "email.recipients",
        dimension: null,
        environment_id: tenant.production.id,
        project_id: null,
        api_key_id: null,
        user_id: null,
        start: "2026-09-01T00:00:00.000Z",
        end: "2026-10-01T00:00:00.000Z",
        quantity: 15,
      },
    ]);
    const byKey = await apiRequest(
      app,
      "GET",
      `/v1/billing/usage?${query}&granularity=month&group_by=api_key`,
      { key: tenant.liveKey },
    );
    expect(
      (await byKey.json()).data.map((row: { api_key_id: string | null; quantity: number }) => [
        row.api_key_id,
        row.quantity,
      ]),
    ).toEqual([
      [null, 5],
      ["key_a", 7],
      ["key_b", 3],
    ]);
    const byProject = await apiRequest(
      app,
      "GET",
      `/v1/billing/usage?${query}&granularity=month&group_by=project`,
      { key: tenant.liveKey },
    );
    expect(
      (await byProject.json()).data.map((row: { project_id: string | null; quantity: number }) => [
        row.project_id,
        row.quantity,
      ]),
    ).toEqual([
      [null, 5],
      [tenant.project.id, 10],
    ]);
    const hourlyTooLong = await apiRequest(
      app,
      "GET",
      `/v1/billing/usage?${query}&granularity=hour`,
      {
        key: tenant.liveKey,
      },
    );
    expect(hourlyTooLong.status).toBe(422);
    expect(await errorOf(hourlyTooLong)).toMatchObject({ code: "invalid_range", param: "to" });
  });

  test("invoices page newest first; another organization's are not found", async () => {
    const tenant = await createTestTenant();
    const other = await createTestTenant();
    const { app } = createTestApp();
    await createTestContract(
      tenant.organization.id,
      { version: 1, plan: "pro" },
      { effectiveFrom: new Date("2026-08-01T00:00:00Z") },
    );
    await runDueBillingPeriods({
      now: new Date("2026-10-01T00:20:00Z"),
      scope: { organizationIds: [tenant.organization.id] },
    });
    const first = await apiRequest(app, "GET", "/v1/billing/invoices?limit=1", {
      key: tenant.liveKey,
    });
    const page = await first.json();
    expect(page).toMatchObject({
      object: "list",
      has_more: true,
      data: [{ object: "invoice", total: 2_500 }],
    });
    const second = await apiRequest(
      app,
      "GET",
      `/v1/billing/invoices?limit=1&after=${page.data[0].id}`,
      {
        key: tenant.liveKey,
      },
    );
    const rest = await second.json();
    expect(rest.data).toHaveLength(1);
    expect(rest.data[0].id < page.data[0].id).toBe(true);

    const invoice = await apiRequest(app, "GET", `/v1/billing/invoices/${page.data[0].id}`, {
      key: tenant.liveKey,
    });
    expect(await invoice.json()).toMatchObject({
      id: page.data[0].id,
      lines: [{ object: "invoice_line", kind: "plan_fee", amount: 2_500, unit_price: null }],
    });
    const foreign = await apiRequest(app, "GET", `/v1/billing/invoices/${page.data[0].id}`, {
      key: other.liveKey,
    });
    expect(foreign.status).toBe(404);
  });

  test("credits: usable ones by default", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const actor = { userId: tenant.owner.id, email: tenant.owner.email };
    const grant = (expiresAt: Date | null) =>
      createCreditGrant({
        grant: {
          organizationId: tenant.organization.id,
          kind: "units",
          amount: 50_000n,
          meter: "email.recipients",
          source: "support",
          description: "Migration credit",
          effectiveAt: new Date("2026-01-01T00:00:00Z"),
          expiresAt,
        },
        actor,
        reason: "test",
      });
    await grant(new Date("2026-02-01T00:00:00Z"));
    const usable = await grant(null);
    const active = await (
      await apiRequest(app, "GET", "/v1/billing/credits", { key: tenant.liveKey })
    ).json();
    expect(active.data.map((credit: { id: string }) => credit.id)).toEqual([usable.id]);
    expect(active.data[0]).toMatchObject({
      object: "credit",
      kind: "units",
      amount: 50_000,
      remaining: 50_000,
    });
    const all = await (
      await apiRequest(app, "GET", "/v1/billing/credits?status=all", { key: tenant.liveKey })
    ).json();
    expect(all.data).toHaveLength(2);
  });
});
