import { describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { rateCardAt } from "../src/catalog/rates.ts";
import { createUsageGate } from "../src/enforcement.ts";
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
