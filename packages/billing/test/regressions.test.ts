import { describe, expect, spyOn, test } from "bun:test";
import { db, schema } from "@coss/db";
import { createTestTenant, type TestTenant } from "@coss/tenancy/testing";
import { eq, sql } from "drizzle-orm";
import { RATE_CARDS } from "../src/catalog/rates.ts";
import { startUpgrade } from "../src/changes.ts";
import { contractAt } from "../src/contracts.ts";
import { composePeriodInvoice } from "../src/engine/compose.ts";
import { resolveTerms } from "../src/engine/terms.ts";
import { runDueBillingEvents, storeProviderEvent } from "../src/events.ts";
import { listGrants } from "../src/grants.ts";
import { getInvoice, listInvoices } from "../src/invoices.ts";
import { voidInvoice } from "../src/payments.ts";
import { runDueBillingPeriods } from "../src/periods.ts";
import { parseContractTerms } from "../src/schemas.ts";
import { collectInvoiceNow } from "../src/sync.ts";
import { createTestContract, recordTestUsage, testBillingProviders } from "../src/testing.ts";

const at = (iso: string) => new Date(iso);
const scopeOf = (tenant: TestTenant) => ({ organizationIds: [tenant.organization.id] });

async function invoicesOf(tenant: TestTenant) {
  return (await listInvoices(tenant.organization.id, { limit: 50 })).reverse();
}

describe("credit commitments", () => {
  test("a rolled-over commitment carries only what's left after the month's drawdown", async () => {
    const tenant = await createTestTenant();
    const org = tenant.organization.id;
    await createTestContract(
      org,
      {
        version: 1,
        plan: "enterprise",
        fee: null,
        commitments: [
          {
            id: "prepaid",
            kind: "prepaid_spend",
            amountCents: "100000",
            period: "month",
            schedule: "upfront",
            rollover: true,
          },
        ],
      },
      { effectiveFrom: at("2026-09-01T00:00:00Z"), kind: "sales" },
    );
    // August's close grants September's $1,000.
    await runDueBillingPeriods({ now: at("2026-09-01T00:20:00Z"), scope: scopeOf(tenant) });
    await recordTestUsage({
      organizationId: org,
      environmentId: tenant.production.id,
      meter: "email.recipients",
      quantity: 1_000_000, // $400
      at: at("2026-09-10T00:00:00Z"),
    });
    await runDueBillingPeriods({ now: at("2026-10-01T00:20:00Z"), scope: scopeOf(tenant) });
    const grants = (await listGrants(org)).filter((grant) => grant.source === "commitment");
    const october = grants.find(
      (grant) => grant.effectiveAt.getTime() === at("2026-10-01T00:00:00Z").getTime(),
    );
    // $1,000 + the $600 September left.
    expect(october?.amount).toBe(160_000n);
    const september = grants.find((grant) => grant.id !== october?.id);
    expect(september?.remaining).toBe(0n);
  });

  test("committed units that cover all of a month's usage still record the drawdown", async () => {
    const tenant = await createTestTenant();
    const org = tenant.organization.id;
    await createTestContract(
      org,
      {
        version: 1,
        plan: "enterprise",
        fee: null,
        commitments: [
          {
            id: "volume",
            kind: "prepaid_units",
            meter: "email.recipients",
            units: 1_000_000,
            unitNanos: "200000",
            period: "year",
            schedule: "upfront",
            rollover: false,
          },
        ],
      },
      {
        effectiveFrom: at("2026-08-01T00:00:00Z"),
        kind: "sales",
        termEnd: at("2027-08-01T00:00:00Z"),
      },
    );
    await runDueBillingPeriods({ now: at("2026-08-01T00:20:00Z"), scope: scopeOf(tenant) });
    await recordTestUsage({
      organizationId: org,
      environmentId: tenant.production.id,
      meter: "email.recipients",
      quantity: 500_000,
      at: at("2026-08-10T00:00:00Z"),
    });
    await runDueBillingPeriods({ now: at("2026-09-01T00:20:00Z"), scope: scopeOf(tenant) });
    const units = (await listGrants(org)).find((grant) => grant.kind === "units");
    expect(units?.remaining).toBe(500_000n);
  });
});

describe("payments and contracts", () => {
  test("a payment for a voided invoice becomes credit", async () => {
    const tenant = await createTestTenant();
    const deps = testBillingProviders();
    await createTestContract(
      tenant.organization.id,
      { version: 1, plan: "pro" },
      { effectiveFrom: at("2026-10-01T00:00:00Z") },
    );
    await runDueBillingPeriods({ now: at("2026-10-01T00:20:00Z"), scope: scopeOf(tenant) });
    deps.fake.willCollect({ state: "requires_action", hostedUrl: null });
    const [invoice] = await invoicesOf(tenant);
    await collectInvoiceNow(invoice?.id ?? "", {
      providers: deps.providers,
      dashboardUrl: "https://coss.test",
    });
    await voidInvoice({
      organizationId: tenant.organization.id,
      invoiceId: invoice?.id ?? "",
      actor: null,
      reason: "test",
    });
    const providerInvoiceId = (await getInvoice(tenant.organization.id, invoice?.id ?? ""))
      ?.providerInvoiceId;
    await storeProviderEvent("fake", {
      id: `evt_late_${invoice?.id}`,
      type: "invoice.paid",
      payload: {
        outcomes: [
          {
            kind: "invoice_paid",
            providerInvoiceId,
            paymentId: `py_late_${invoice?.id}`,
            amountCents: "2500",
            method: "card",
          },
        ],
      },
    });
    await runDueBillingEvents({ now: new Date(Date.now() + 1000) }, { providers: deps.providers });
    const credit = (await listGrants(tenant.organization.id)).find(
      (grant) => grant.source === "refund",
    );
    expect(credit).toMatchObject({ amount: 2_500n, appliesTo: "any" });
    expect((await getInvoice(tenant.organization.id, invoice?.id ?? ""))?.paymentState).toBe(
      "paid_after_void",
    );
  });

  test("an upgrade paid after its month closed starts the next month and credits what was paid", async () => {
    const tenant = await createTestTenant();
    const org = tenant.organization.id;
    const deps = testBillingProviders();
    await createTestContract(
      org,
      { version: 1, plan: "pro" },
      { effectiveFrom: at("2026-10-01T00:00:00Z") },
    );
    const { invoice } = await startUpgrade({
      organizationId: org,
      plan: "scale",
      userId: null,
      defaultProvider: "fake",
      now: at("2026-10-31T22:30:00Z"),
    });
    // October closes (with Pro's November fee) before the debit settles.
    await runDueBillingPeriods({ now: at("2026-11-01T00:20:00Z"), scope: scopeOf(tenant) });
    await collectInvoiceNow(
      invoice?.id ?? "",
      { providers: deps.providers, dashboardUrl: "https://coss.test" },
      at("2026-11-01T03:00:00Z"),
    );
    const contract = await contractAt(org, at("2026-11-02T00:00:00Z"));
    expect(contract).toMatchObject({ plan: "scale", effectiveFrom: at("2026-11-01T00:00:00Z") });
    const refunds = (await listGrants(org)).filter((grant) => grant.source === "refund");
    expect(refunds.map((grant) => grant.amount)).toEqual([invoice?.totalCents ?? 0n]);
    // November's difference: $250 less the $25 Pro was charged.
    const followUp = (await invoicesOf(tenant)).filter((row) => row.kind === "plan_change").at(-1);
    expect(followUp?.totalCents).toBe(22_500n);
  });

  test("a contract created earlier in the same millisecond is not a later plan change", async () => {
    const tenant = await createTestTenant();
    const org = tenant.organization.id;
    const deps = testBillingProviders();
    await createTestContract(
      org,
      { version: 1, plan: "pro" },
      { effectiveFrom: at("2026-10-01T00:00:00Z") },
    );
    const { invoice } = await startUpgrade({
      organizationId: org,
      plan: "scale",
      userId: null,
      defaultProvider: "fake",
      now: at("2026-10-20T12:00:00Z"),
    });
    // Both contracts in one millisecond, the upgrade microseconds later: a JS Date of the
    // upgrade's creation (milliseconds) is earlier than the Pro contract's stored timestamp.
    await db.execute(sql`
      UPDATE billing_contract
      SET created_at = CASE WHEN status = 'pending'
        THEN timestamptz '2026-10-20 12:00:00.000900+00'
        ELSE timestamptz '2026-10-20 12:00:00.000100+00' END
      WHERE organization_id = ${org}`);
    await collectInvoiceNow(
      invoice?.id ?? "",
      { providers: deps.providers, dashboardUrl: "https://coss.test" },
      at("2026-10-20T12:05:00Z"),
    );
    expect(await contractAt(org, at("2026-10-21T00:00:00Z"))).toMatchObject({ plan: "scale" });
  });

  test("moving from an internal contract to a paid one bills the paid one's first month", async () => {
    const tenant = await createTestTenant();
    const org = tenant.organization.id;
    await createTestContract(
      org,
      { version: 1, plan: "enterprise", fee: null },
      {
        effectiveFrom: at("2026-09-01T00:00:00Z"),
        effectiveUntil: at("2026-11-01T00:00:00Z"),
        kind: "internal",
      },
    );
    await createTestContract(
      org,
      { version: 1, plan: "pro" },
      { effectiveFrom: at("2026-11-01T00:00:00Z") },
    );
    await runDueBillingPeriods({ now: at("2026-11-01T00:20:00Z"), scope: scopeOf(tenant) });
    const invoices = await invoicesOf(tenant);
    expect(invoices.map((invoice) => invoice.totalCents)).toEqual([2_500n]);
  });
});

describe("engine", () => {
  test("two discounts with the same label get distinct charge keys", () => {
    const card = RATE_CARDS[0] as (typeof RATE_CARDS)[number];
    const terms = resolveTerms(
      parseContractTerms({
        version: 1,
        plan: "pro",
        discounts: [
          { scope: "fees", percent: 10 },
          { scope: "fees", percent: 10 },
        ],
      }),
      card,
    );
    const period = { start: at("2026-10-01T00:00:00Z"), end: at("2026-11-01T00:00:00Z") };
    const next = { start: period.end, end: at("2026-12-01T00:00:00Z") };
    const segment = {
      contractId: "bcon_x",
      interval: period,
      terms,
      contractStart: at("2026-09-01T00:00:00Z"),
      contractEnd: null,
      termEnd: null,
      superseded: false,
    };
    const invoice = composePeriodInvoice({
      closed: { period, segments: [segment], usage: [] },
      next: { period: next, segment: { ...segment, interval: next } },
      grants: [],
    });
    const keys = invoice.lines
      .filter((line) => line.kind === "discount")
      .map((line) => line.chargeKey);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });
});

test("concurrent upgrades void the replaced invoice and collect only the surviving upgrade", async () => {
  const tenant = await createTestTenant();
  const now = at("2026-10-12T12:00:00Z");
  const input = {
    organizationId: tenant.organization.id,
    plan: "pro" as const,
    userId: tenant.owner.id,
    defaultProvider: "fake" as const,
    now,
  };
  const results = await Promise.all([startUpgrade(input), startUpgrade(input)]);
  const invoices = await invoicesOf(tenant);
  expect(invoices.map((invoice) => invoice.status).sort()).toEqual(["open", "void"]);
  const { fake, providers } = testBillingProviders();
  for (const result of results) {
    if (!result.invoice) throw new Error("Expected upgrade invoice");
    await collectInvoiceNow(
      result.invoice.id,
      { providers, dashboardUrl: "https://coss.test" },
      now,
    );
  }
  expect(fake.calls.filter((call) => call.op === "collect")).toHaveLength(1);
  expect((await contractAt(tenant.organization.id, now))?.plan).toBe("pro");
});

test("replacing an upgrade refuses while its payment is processing", async () => {
  const tenant = await createTestTenant();
  const now = at("2026-10-12T12:00:00Z");
  const input = {
    organizationId: tenant.organization.id,
    plan: "pro" as const,
    userId: tenant.owner.id,
    defaultProvider: "fake" as const,
    now,
  };
  const upgrade = await startUpgrade(input);
  const { fake, providers } = testBillingProviders();
  fake.willCollect({ state: "processing" });
  if (!upgrade.invoice) throw new Error("Expected upgrade invoice");
  await collectInvoiceNow(
    upgrade.invoice.id,
    { providers, dashboardUrl: "https://coss.test" },
    now,
  );
  await expect(startUpgrade(input)).rejects.toThrow("still being processed");
  expect((await invoicesOf(tenant)).map((invoice) => invoice.status)).toEqual(["open"]);
});

describe("a month that won't close", () => {
  test("is reported while it can still be closed", async () => {
    const tenant = await createTestTenant();
    const scope = { organizationIds: [tenant.organization.id] };
    const contract = await createTestContract(
      tenant.organization.id,
      { version: 1, plan: "pro" },
      { effectiveFrom: new Date("2026-10-01T00:00:00Z") },
    );
    await db
      .update(schema.billingContract)
      .set({ terms: { broken: true } as never })
      .where(eq(schema.billingContract.id, contract.id));

    const errors = spyOn(console, "error").mockImplementation(() => {});
    try {
      await runDueBillingPeriods({ now: new Date("2026-12-01T00:20:00Z"), scope });
      const lines = errors.mock.calls.map((call) => String(call[0]));
      expect(
        lines.some(
          (line) => line.includes("is still open for") && line.includes(tenant.organization.id),
        ),
      ).toBe(true);
    } finally {
      errors.mockRestore();
    }
  });

  test("nothing is reported when months close", async () => {
    const tenant = await createTestTenant();
    const scope = { organizationIds: [tenant.organization.id] };
    await createTestContract(
      tenant.organization.id,
      { version: 1, plan: "pro" },
      { effectiveFrom: new Date("2026-10-01T00:00:00Z") },
    );
    const errors = spyOn(console, "error").mockImplementation(() => {});
    try {
      await runDueBillingPeriods({ now: new Date("2026-12-01T00:20:00Z"), scope });
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });
});
