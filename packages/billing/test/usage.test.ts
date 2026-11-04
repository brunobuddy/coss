import { describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { eq } from "drizzle-orm";
import { checkOrganizationSpend } from "../src/alerts.ts";
import { rateCardAt } from "../src/catalog/rates.ts";
import { allowanceUsedUp, createUsageGate, planRateLimits } from "../src/enforcement.ts";
import { getInvoice, listInvoices } from "../src/invoices.ts";
import { runDueBillingPeriods } from "../src/periods.ts";
import { createTestContract, recordTestUsage } from "../src/testing.ts";
import { periodOf } from "../src/time.ts";
import { platformUsageByDay } from "../src/usage.ts";

describe("platformUsageByDay", () => {
  test("sums one meter per UTC day across organizations, one organization's apart", async () => {
    const customer = await createTestTenant();
    const other = await createTestTenant();
    const coss = await createTestTenant();
    const day1 = new Date("2026-03-02T10:00:00Z");
    const day2 = new Date("2026-03-03T23:00:00Z");
    for (const [tenant, quantity, at] of [
      [customer, 5, day1],
      [other, 7, day1],
      [coss, 3, day1],
      [customer, 2, day2],
    ] as const) {
      await recordTestUsage({
        organizationId: tenant.organization.id,
        environmentId: tenant.production.id,
        meter: "email.recipients",
        quantity,
        at,
      });
    }
    await recordTestUsage({
      organizationId: customer.organization.id,
      environmentId: customer.production.id,
      meter: "sms.segments",
      quantity: 100,
      at: day1,
    });
    const scope = {
      organizationIds: [customer.organization.id, other.organization.id, coss.organization.id],
    };
    const interval = {
      start: new Date("2026-03-01T00:00:00Z"),
      end: new Date("2026-04-01T00:00:00Z"),
    };

    expect(
      await platformUsageByDay({
        meter: "email.recipients",
        interval,
        apartFrom: coss.organization.id,
        scope,
      }),
    ).toEqual([
      { day: new Date("2026-03-02T00:00:00Z"), apart: false, quantity: 12 },
      { day: new Date("2026-03-02T00:00:00Z"), apart: true, quantity: 3 },
      { day: new Date("2026-03-03T00:00:00Z"), apart: false, quantity: 2 },
    ]);
    expect(await platformUsageByDay({ meter: "email.recipients", interval, scope })).toEqual([
      { day: new Date("2026-03-02T00:00:00Z"), apart: false, quantity: 15 },
      { day: new Date("2026-03-03T00:00:00Z"), apart: false, quantity: 2 },
    ]);
  });
});

describe("hooks.messages", () => {
  test("is priced per 1,000 from November 2026 on, and January's card keeps it", () => {
    const november = rateCardAt(new Date("2026-11-01T00:00:00Z"));
    const january = rateCardAt(new Date("2027-01-01T00:00:00Z"));
    expect(november.rates["hooks.messages"]?.default?.tiers).toEqual([
      { upTo: null, unitNanos: 100_000n },
    ]);
    expect(january.rates["hooks.messages"]).toBe(november.rates["hooks.messages"]);
  });

  test("a month close charges what's past the plan's included messages", async () => {
    const tenant = await createTestTenant();
    const organizationId = tenant.organization.id;
    await createTestContract(
      organizationId,
      { version: 1, plan: "pro" },
      { effectiveFrom: new Date("2026-11-01T00:00:00Z") },
    );
    await recordTestUsage({
      organizationId,
      environmentId: tenant.production.id,
      meter: "hooks.messages",
      quantity: 600_000,
      at: new Date("2026-11-10T12:00:00Z"),
    });
    await runDueBillingPeriods({
      now: new Date("2026-12-01T00:20:00Z"),
      scope: { organizationIds: [organizationId] },
    });
    const invoices = await listInvoices(organizationId, { limit: 10 });
    const lines = await Promise.all(
      invoices.map(async (row) => (await getInvoice(organizationId, row.id))?.lines ?? []),
    );
    const line = lines.flat().find((row) => row.meter === "hooks.messages");
    expect(line?.quantity).toBe(600_000);
    expect(line?.amountCents).toBe(1_000n);
  });

  test("Free's 50,000 messages cap the send", async () => {
    const tenant = await createTestTenant();
    const organizationId = tenant.organization.id;
    const gate = createUsageGate({ ttlMs: 0 });
    await db.insert(schema.billingQuota).values({
      organizationId,
      meter: "hooks.messages",
      periodStart: periodOf(new Date()).start,
      reserved: 49_999,
    });
    const reserve = () =>
      db.transaction((tx) =>
        gate.reserve(tx, { organizationId, meter: "hooks.messages", quantity: 1 }),
      );
    await reserve();
    await expect(reserve()).rejects.toMatchObject({ code: "usage_limit_exceeded" });
  });
});

describe("risk.assessments", () => {
  test("is priced from November 2026 on, getting cheaper with volume", () => {
    const october = rateCardAt(new Date("2026-10-31T23:59:59Z"));
    const november = rateCardAt(new Date("2026-11-01T00:00:00Z"));
    expect(october.rates["risk.assessments"]).toBeUndefined();
    expect(november.rates["risk.assessments"]?.default?.tiers).toEqual([
      { upTo: 1_000_000, unitNanos: 1_000_000n },
      { upTo: 10_000_000, unitNanos: 500_000n },
      { upTo: null, unitNanos: 250_000n },
    ]);
    expect(november.rates["risk.content_checks"]?.default?.tiers).toEqual([
      { upTo: null, unitNanos: 250_000n },
    ]);
  });

  test("Free assesses at 10 a second, paid plans at the bucket's 100", async () => {
    const free = await createTestTenant();
    const pro = await createTestTenant();
    await createTestContract(
      pro.organization.id,
      { version: 1, plan: "pro" },
      { effectiveFrom: new Date("2026-01-01T00:00:00Z") },
    );
    expect((await planRateLimits(free.organization.id))["risk.assess"]?.limit).toBe(10);
    expect((await planRateLimits(pro.organization.id))["risk.assess"]?.limit).toBe(100);
  });

  async function closeMonth(plan: "pro" | "scale", quantity: number) {
    const tenant = await createTestTenant();
    const organizationId = tenant.organization.id;
    await createTestContract(
      organizationId,
      { version: 1, plan },
      { effectiveFrom: new Date("2026-11-01T00:00:00Z") },
    );
    await recordTestUsage({
      organizationId,
      environmentId: tenant.production.id,
      meter: "risk.assessments",
      quantity,
      at: new Date("2026-11-10T12:00:00Z"),
    });
    await runDueBillingPeriods({
      now: new Date("2026-12-01T00:20:00Z"),
      scope: { organizationIds: [organizationId] },
    });
    const invoices = await listInvoices(organizationId, { limit: 10 });
    const lines = await Promise.all(
      invoices.map(async (row) => (await getInvoice(organizationId, row.id))?.lines ?? []),
    );
    return lines.flat().find((row) => row.meter === "risk.assessments");
  }

  test("Pro's 250,000 assessments cost $200 past its 50,000", async () => {
    expect((await closeMonth("pro", 250_000))?.amountCents).toBe(20_000n);
  });

  test("Scale's 1,000,000 cost $500 past its 500,000", async () => {
    expect((await closeMonth("scale", 1_000_000))?.amountCents).toBe(50_000n);
  });

  test("Free's allowance is announced, and says assessments go on", async () => {
    const tenant = await createTestTenant();
    const organizationId = tenant.organization.id;
    const now = new Date("2026-11-15T12:00:00Z");
    const periodStart = periodOf(now).start;
    await recordTestUsage({
      organizationId,
      environmentId: tenant.production.id,
      meter: "risk.assessments",
      quantity: 10_000,
      // Estimates read whole hours before their moment.
      at: new Date(now.getTime() - 2 * 60 * 60_000),
    });
    await db.insert(schema.billingQuota).values({
      organizationId,
      meter: "risk.assessments",
      periodStart,
      reserved: 9_999,
    });
    expect(await allowanceUsedUp(organizationId, "risk.assessments", now)).toBe(false);
    await db
      .update(schema.billingQuota)
      .set({ reserved: 10_000 })
      .where(eq(schema.billingQuota.organizationId, organizationId));
    expect(await allowanceUsedUp(organizationId, "risk.assessments", now)).toBe(true);

    await checkOrganizationSpend(organizationId, now);
    const notifications = await db
      .select({
        dedupeKey: schema.billingNotification.dedupeKey,
        payload: schema.billingNotification.payload,
      })
      .from(schema.billingNotification)
      .where(eq(schema.billingNotification.organizationId, organizationId));
    expect(notifications.map((row) => row.dedupeKey)).toEqual([
      `usage:${organizationId}:2026-11:risk.assessments:100`,
    ]);
    const payload = notifications[0]?.payload as { blocked?: string; atLimit?: string } | undefined;
    expect(payload?.blocked).toBe("true");
    expect(payload?.atLimit).toContain("assessments go on");
  });
});
