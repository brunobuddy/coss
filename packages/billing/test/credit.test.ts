import { describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { and, eq } from "drizzle-orm";
import { getBillingAccount } from "../src/accounts.ts";
import { runBillingUsageChecks } from "../src/alerts.ts";
import { billingObject } from "../src/api.ts";
import { automaticCreditLimit, CREDIT_POLICY, chargeThreshold } from "../src/catalog/credit.ts";
import { creditStandingOf, runDueCreditChecks } from "../src/credit.ts";
import { applyOutcome } from "../src/events.ts";
import { holdsOf, placeHold } from "../src/holds.ts";
import { getInvoice, listInvoices } from "../src/invoices.ts";
import { type BillingNotice, runDueBillingNotifications } from "../src/notifications.ts";
import { estimatePeriod } from "../src/overview.ts";
import { voidInvoice } from "../src/payments.ts";
import { closeBillingPeriod } from "../src/periods.ts";
import { billingStateAt } from "../src/resolve.ts";
import { runDueBillingSync } from "../src/sync.ts";
import { createTestContract, recordTestUsage, testBillingProviders } from "../src/testing.ts";
import { periodOf } from "../src/time.ts";

const start = new Date("2026-10-01T00:00:00Z");
const now = new Date("2026-10-12T12:00:00Z");
const DAY = 86_400_000;
/** Recipients costing this many cents at the first band's $0.40 per 1,000. */
const recipientsFor = (cents: number) => (cents / 40) * 1000;

async function fixture(
  opts: { kind?: "self_serve" | "sales"; collectionMethod?: "send_invoice" } = {},
) {
  const tenant = await createTestTenant();
  const organizationId = tenant.organization.id;
  await createTestContract(
    organizationId,
    { version: 1, plan: "pro" },
    {
      effectiveFrom: start,
      kind: opts.kind,
    },
  );
  if (opts.collectionMethod) {
    await db
      .update(schema.billingAccount)
      .set({ collectionMethod: opts.collectionMethod })
      .where(eq(schema.billingAccount.organizationId, organizationId));
  }
  const environmentId = tenant.production.id;
  const { fake, providers } = testBillingProviders();
  const deps = { providers, dashboardUrl: "https://coss.test" };
  const scope = { organizationIds: [organizationId] };
  // Each amount gets its own hour: test usage rows don't add up within one.
  let hour = 1;
  const useCents = (cents: number, base: Date = now) =>
    recordTestUsage({
      organizationId,
      environmentId,
      meter: "email.recipients",
      quantity: recipientsFor(cents),
      at: new Date(base.getTime() - (base === now ? hour++ : 1) * 3_600_000),
    });
  const check = (at: Date = now) => runDueCreditChecks({ now: at, scope });
  const collect = async (at: Date = now) => {
    // One pass pushes, the next collects.
    await runDueBillingSync({ now: at, scope }, deps);
    await runDueBillingSync({ now: at, scope }, deps);
  };
  const invoices = async (kind: "threshold" | "period") =>
    (await listInvoices(organizationId)).filter((invoice) => invoice.kind === kind);
  const held = async () =>
    (await holdsOf(organizationId)).some((hold) => hold.reason === "credit_limit");
  const standing = async (at: Date = now) => {
    const account = await getBillingAccount(organizationId);
    if (!account) throw new Error("No account.");
    return creditStandingOf(account, await billingStateAt(organizationId, at), at);
  };
  const close = (period = periodOf(now)) =>
    closeBillingPeriod({
      account: { organizationId, provider: "fake" },
      period,
      now: new Date(period.end.getTime() + 20 * 60_000),
      inOrder: false,
    });
  return {
    tenant,
    organizationId,
    fake,
    deps,
    scope,
    useCents,
    check,
    collect,
    invoices,
    held,
    standing,
    close,
  };
}

describe("the policy", () => {
  test("the limit starts at the new account limit and doubles what has settled, up to a ceiling", () => {
    expect(automaticCreditLimit(0n)).toBe(CREDIT_POLICY.newAccountLimitCents);
    expect(automaticCreditLimit(2_500n)).toBe(CREDIT_POLICY.newAccountLimitCents);
    expect(automaticCreditLimit(100_000n)).toBe(200_000n);
    expect(automaticCreditLimit(1_000_000_000n)).toBe(CREDIT_POLICY.maxAutomaticLimitCents);
  });

  test("the threshold is a share of the limit, within bounds and never above it", () => {
    expect(chargeThreshold(CREDIT_POLICY.newAccountLimitCents)).toBe(10_000n);
    expect(chargeThreshold(200_000n)).toBe(40_000n);
    expect(chargeThreshold(CREDIT_POLICY.maxAutomaticLimitCents)).toBe(500_000n);
    expect(chargeThreshold(5_000n)).toBe(5_000n);
  });
});

describe("threshold charges", () => {
  test("usage under the threshold waits for the month's invoice", async () => {
    const f = await fixture();
    await f.useCents(9_999);
    await f.check();
    expect(await f.invoices("threshold")).toHaveLength(0);
  });

  test("usage over the threshold is charged at once, and the month's invoice takes it off", async () => {
    const f = await fixture();
    await f.useCents(15_000);
    await f.check();
    const [charge] = await f.invoices("threshold");
    expect(charge).toMatchObject({ status: "open", amountDueCents: 15_000n });
    expect(charge?.number).toBeTruthy();
    await f.collect();
    expect((await getInvoice(f.organizationId, charge?.id ?? ""))?.status).toBe("paid");

    // Nothing left to charge until usage accrues again.
    expect((await estimatePeriod(f.organizationId, now)).totals.totalCents).toBe(0n);
    await f.check();
    expect(await f.invoices("threshold")).toHaveLength(1);

    // Another $25 of usage stays under the threshold, and is all the month's invoice still owes.
    await f.useCents(2_500);
    const period = periodOf(now);
    await f.close(period);
    const [closing] = await f.invoices("period");
    const full = await getInvoice(f.organizationId, closing?.id ?? "");
    const usage = full?.lines.filter((line) => line.kind === "usage") ?? [];
    expect(usage.reduce((sum, line) => sum + line.amountCents, 0n)).toBe(17_500n);
    const credit = full?.lines.find((line) => line.description === "Usage already charged");
    expect(credit?.amountCents).toBe(-15_000n);
    const fee = full?.lines.find((line) => line.kind === "plan_fee");
    expect(fee?.amountCents).toBe(2_500n);
    expect(full?.totalCents).toBe(2_500n + 2_500n);
  });

  test("a charge that fails is still owed exactly once", async () => {
    const f = await fixture();
    await f.useCents(15_000);
    await f.check();
    f.fake.willCollect({ state: "failed", error: "Declined" });
    await f.collect();
    const [charge] = await f.invoices("threshold");
    expect(charge).toMatchObject({ status: "open", paymentState: "failed" });
    await f.close();
    const [closing] = await f.invoices("period");
    // The open charge owes the usage; the month's invoice only opens the next month.
    expect(closing?.totalCents).toBe(2_500n);
  });

  test("only one is open at a time, and racing workers bill usage once", async () => {
    const f = await fixture();
    await f.useCents(15_000);
    await Promise.all([f.check(), f.check(), f.check()]);
    expect(await f.invoices("threshold")).toHaveLength(1);
    await f.useCents(15_000);
    await f.check();
    expect(await f.invoices("threshold")).toHaveLength(1);
    await f.collect();
    await f.check();
    expect(await f.invoices("threshold")).toHaveLength(2);
  });

  test("voiding one bills its usage again", async () => {
    const f = await fixture();
    await f.useCents(15_000);
    await f.check();
    const [charge] = await f.invoices("threshold");
    await voidInvoice({
      organizationId: f.organizationId,
      invoiceId: charge?.id ?? "",
      actor: null,
      reason: "Test",
      now,
    });
    expect((await estimatePeriod(f.organizationId, now)).totals.totalCents).toBe(15_000n);
  });

  test("once a month's invoice took it off, a charge can't be voided, only credited", async () => {
    const f = await fixture();
    await f.useCents(15_000);
    await f.check();
    f.fake.willCollect({ state: "failed", error: "Declined" });
    await f.collect();
    await f.close();
    const [charge] = await f.invoices("threshold");
    const invoiceId = charge?.id ?? "";
    await expect(
      voidInvoice({
        organizationId: f.organizationId,
        invoiceId,
        actor: null,
        reason: "Test",
        now,
      }),
    ).rejects.toThrow("credit note");
    expect((await getInvoice(f.organizationId, invoiceId))?.status).toBe("open");

    // If the month's invoice is voided instead, the credit is given back and so is the choice.
    const [closing] = await f.invoices("period");
    await voidInvoice({
      organizationId: f.organizationId,
      invoiceId: closing?.id ?? "",
      actor: null,
      reason: "Test",
      now,
    });
    await voidInvoice({
      organizationId: f.organizationId,
      invoiceId,
      actor: null,
      reason: "Test",
      now,
    });
    expect((await getInvoice(f.organizationId, invoiceId))?.status).toBe("void");
  });

  test("an email goes out with each charge", async () => {
    const f = await fixture();
    await f.useCents(15_000);
    await f.check();
    const rows = await db
      .select()
      .from(schema.billingNotification)
      .where(
        and(
          eq(schema.billingNotification.organizationId, f.organizationId),
          eq(schema.billingNotification.kind, "usage_charged"),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  test("a threshold charge doesn't count as credit against the spend limit", async () => {
    const f = await fixture();
    await db
      .update(schema.billingAccount)
      .set({ spendLimitCents: 10_000n })
      .where(eq(schema.billingAccount.organizationId, f.organizationId));
    await f.useCents(15_000);
    await f.check();
    const estimate = await estimatePeriod(f.organizationId, now);
    expect(estimate.alreadyChargedCents).toBe(15_000n);
    expect(estimate.creditUsedCents).toBe(0n);
    await runBillingUsageChecks({ now, scope: f.scope });
    expect((await holdsOf(f.organizationId)).map((hold) => hold.reason)).toContain("spend_limit");
  });
});

describe("the credit limit", () => {
  test("a stolen card that pays every charge is still stopped at the limit", async () => {
    const f = await fixture();
    for (let charge = 0; charge < 6; charge++) {
      await f.useCents(10_000);
      await f.check();
      await f.collect();
    }
    expect(
      (await f.invoices("threshold")).every((invoice) => invoice.status === "paid"),
    ).toBeTrue();
    expect(await f.held()).toBeTrue();
    // Past the first 1,000,000 recipients the band's lower price applies: the month is re-rated.
    expect(await f.standing()).toMatchObject({
      limitCents: 50_000n,
      usedCents: 55_000n,
      unsettledChargesCents: 55_000n,
      holdCause: "over_limit",
    });
    const notified = await db
      .select({ kind: schema.billingNotification.kind })
      .from(schema.billingNotification)
      .where(eq(schema.billingNotification.organizationId, f.organizationId));
    const kinds = notified.map((row) => row.kind);
    expect(kinds).toContain("credit_limit_warning");
    expect(kinds).toContain("credit_limit_reached");
  });

  test("the hold lifts when the payments settle, and the limit has grown", async () => {
    const f = await fixture();
    for (let charge = 0; charge < 6; charge++) {
      await f.useCents(10_000);
      await f.check();
      await f.collect();
    }
    expect(await f.held()).toBeTrue();
    const later = new Date(now.getTime() + (CREDIT_POLICY.settleDays + 1) * DAY);
    await f.check(later);
    expect(await f.held()).toBeFalse();
    expect(await f.standing(later)).toMatchObject({
      limitCents: 110_000n,
      settledPaidCents: 55_000n,
      unsettledChargesCents: 0n,
    });
  });

  test("plan fees don't use the limit, and refunded or disputed payments don't raise it", async () => {
    const f = await fixture();
    const paidAt = new Date(now.getTime() - (CREDIT_POLICY.settleDays + 1) * DAY);
    const old = (amount: bigint, extra: Partial<typeof schema.billingInvoice.$inferInsert>) =>
      db.insert(schema.billingInvoice).values({
        organizationId: f.organizationId,
        accountId: extra.accountId ?? "",
        organizationName: "Test",
        organizationSlug: "test",
        kind: "plan_change",
        status: "paid",
        periodStart: paidAt,
        periodEnd: paidAt,
        totalCents: amount,
        amountPaidCents: amount,
        collectionMethod: "charge_automatically",
        provider: "fake",
        paidAt,
        ...extra,
      });
    const account = await getBillingAccount(f.organizationId);
    const accountId = account?.id ?? "";
    await old(40_000n, { accountId });
    await old(90_000n, { accountId, paymentState: "disputed", paymentError: "general" });
    const refund = async (values: { amount: bigint; paidAt: Date; kind?: "threshold" }) => {
      const [invoice] = await db
        .insert(schema.billingInvoice)
        .values({
          organizationId: f.organizationId,
          accountId,
          organizationName: "Test",
          organizationSlug: "test",
          kind: values.kind ?? "plan_change",
          status: "paid",
          periodStart: paidAt,
          periodEnd: paidAt,
          totalCents: values.amount,
          amountPaidCents: values.amount,
          collectionMethod: "charge_automatically",
          provider: "fake",
          paidAt: values.paidAt,
        })
        .returning();
      await db.insert(schema.billingCreditNote).values({
        organizationId: f.organizationId,
        invoiceId: invoice?.id ?? "",
        number: `CN-T-${invoice?.id}`,
        amountCents: 10_000n,
        refundCents: 10_000n,
        memo: "Test",
        reason: "Test",
        status: "issued",
      });
    };
    // A settled payment, partly refunded: what's kept counts.
    await refund({ amount: 20_000n, paidAt });
    // A recent one's refund has nothing to do with what has settled…
    await refund({ amount: 30_000n, paidAt: now });
    // … and a recent threshold charge's lowers what's at risk.
    await refund({ amount: 30_000n, paidAt: now, kind: "threshold" });
    expect(await f.standing()).toMatchObject({
      settledPaidCents: 50_000n,
      unsettledChargesCents: 20_000n,
      usedCents: 20_000n,
      limitCents: 100_000n,
    });
  });

  test("a failed charge holds an account with nothing settled, until it's paid", async () => {
    const f = await fixture();
    await f.useCents(15_000);
    await f.check();
    f.fake.willCollect({ state: "failed", error: "Declined" });
    await f.collect();
    await f.check();
    expect(await f.held()).toBeTrue();
    expect((await f.standing())?.holdCause).toBe("charge_failed");

    const [charge] = await f.invoices("threshold");
    await applyOutcome(
      {
        kind: "invoice_paid",
        providerInvoiceId: charge?.providerInvoiceId ?? "",
        paymentId: `pay_${charge?.id}`,
        amountCents: 15_000n,
        method: "card",
      },
      "fake",
      {},
      now,
    );
    await f.check();
    expect(await f.held()).toBeFalse();
  });

  test("a failed charge doesn't hold an account with settled payments, under its limit", async () => {
    const f = await fixture();
    for (let charge = 0; charge < 2; charge++) {
      await f.useCents(10_000);
      await f.check();
      await f.collect();
    }
    await f.close();
    const later = new Date(now.getTime() + (CREDIT_POLICY.settleDays + 1) * DAY);
    await f.collect(later);
    // Past the $25 of credit the month's fee brought.
    await f.useCents(15_000, later);
    await f.check(later);
    f.fake.willCollect({ state: "failed", error: "Declined" });
    await f.collect(later);
    await f.check(later);
    const charges = await f.invoices("threshold");
    expect(charges.filter((charge) => charge.paymentState === "failed")).toHaveLength(1);
    expect(await f.held()).toBeFalse();
  });

  test("a fraud dispute holds at once; an admin's limit is the way out", async () => {
    const f = await fixture();
    await f.useCents(15_000);
    await f.check();
    await f.collect();
    const [charge] = await f.invoices("threshold");
    await applyOutcome(
      {
        kind: "dispute_opened",
        providerInvoiceId: charge?.providerInvoiceId ?? "",
        customerId: null,
        amountCents: 15_000n,
        reason: "fraudulent",
      },
      "fake",
      {},
      now,
    );
    expect(await f.held()).toBeTrue();
    await f.check();
    expect(await f.held()).toBeTrue();

    await db
      .update(schema.billingAccount)
      .set({ creditLimitCents: 100_000n })
      .where(eq(schema.billingAccount.organizationId, f.organizationId));
    await f.check();
    expect(await f.held()).toBeFalse();
  });

  test("a check waiting for the account sees what happened while it waited", async () => {
    const f = await fixture();
    await f.useCents(15_000);
    await f.check();
    await f.collect();
    const [charge] = await f.invoices("threshold");
    let release = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked = () => {};
    const holding = new Promise<void>((resolve) => {
      locked = resolve;
    });
    // Another change of the account is under way…
    const other = db.transaction(async (tx) => {
      await tx
        .select({ id: schema.billingAccount.id })
        .from(schema.billingAccount)
        .where(eq(schema.billingAccount.organizationId, f.organizationId))
        .for("update");
      locked();
      await released;
      // … and it's a fraud dispute, with its hold: the waiting check must not undo them.
      await tx
        .update(schema.billingInvoice)
        .set({ paymentState: "disputed", paymentError: "fraudulent" })
        .where(eq(schema.billingInvoice.id, charge?.id ?? ""));
      await placeHold(tx, f.organizationId, "credit_limit", "Test");
    });
    await holding;
    const waiting = f.check();
    await Bun.sleep(50);
    release();
    await Promise.all([other, waiting]);
    expect(await f.held()).toBeTrue();
  });

  test("other disputes don't hold", async () => {
    const f = await fixture();
    await f.useCents(15_000);
    await f.check();
    await f.collect();
    const [charge] = await f.invoices("threshold");
    await applyOutcome(
      {
        kind: "dispute_opened",
        providerInvoiceId: charge?.providerInvoiceId ?? "",
        customerId: null,
        amountCents: 15_000n,
        reason: "product_unacceptable",
      },
      "fake",
      {},
      now,
    );
    expect(await f.held()).toBeFalse();
  });

  test("an exemption keeps sending on, and charges still go out", async () => {
    const f = await fixture();
    await db
      .update(schema.billingAccount)
      .set({ holdExemptUntil: new Date(now.getTime() + DAY) })
      .where(eq(schema.billingAccount.organizationId, f.organizationId));
    await f.useCents(60_000);
    await f.check();
    expect(await f.held()).toBeFalse();
    expect(await f.invoices("threshold")).toHaveLength(1);
  });

  test("contracts and net terms have no limit until an admin sets one", async () => {
    const contract = await fixture({ kind: "sales" });
    await contract.useCents(60_000);
    await contract.check();
    expect(await contract.standing()).toBeNull();
    expect(await contract.invoices("threshold")).toHaveLength(0);
    expect(await contract.held()).toBeFalse();

    const terms = await fixture({ collectionMethod: "send_invoice" });
    await terms.useCents(60_000);
    await terms.check();
    expect(await terms.standing()).toBeNull();
    await db
      .update(schema.billingAccount)
      .set({ creditLimitCents: 50_000n })
      .where(eq(schema.billingAccount.organizationId, terms.organizationId));
    await terms.check();
    expect(await terms.held()).toBeTrue();
    // Held, but never charged: it's invoiced with terms.
    expect(await terms.standing()).toMatchObject({ thresholdCents: null });
    expect(await terms.invoices("threshold")).toHaveLength(0);
  });

  test("usage of a month that ended stays at risk until it closes", async () => {
    const f = await fixture({ collectionMethod: "send_invoice" });
    await db
      .update(schema.billingAccount)
      .set({ creditLimitCents: 50_000n })
      .where(eq(schema.billingAccount.organizationId, f.organizationId));
    // Past the first 1,000,000 recipients the band's lower price applies: $512.50.
    await f.useCents(55_000);
    await f.check();
    expect(await f.held()).toBeTrue();

    // A new month, the old one still waiting for its close: nothing changed.
    const rollover = new Date("2026-11-01T00:05:00Z");
    await f.check(rollover);
    expect(await f.standing(rollover)).toMatchObject({
      accruedCents: 51_250n,
      accruedThisMonthCents: 0n,
    });
    expect(await f.held()).toBeTrue();

    // Closed, it's an unpaid invoice instead (its first month's fee on top).
    await f.close();
    await f.check(rollover);
    const closed = await f.standing(rollover);
    expect(closed?.accruedCents).toBe(0n);
    expect(closed?.unpaidCents).toBe(53_750n);
    expect(await f.held()).toBeTrue();
  });

  test("a threshold charge is credit for one month's estimate, not two", async () => {
    const f = await fixture();
    await f.useCents(15_000);
    await f.check();
    await f.collect();
    // The charge paid for October; November's usage can't spend it as well before October closes.
    const rollover = new Date("2026-11-01T02:00:00Z");
    await recordTestUsage({
      organizationId: f.organizationId,
      environmentId: f.tenant.production.id,
      meter: "email.recipients",
      quantity: recipientsFor(5_000),
      at: new Date("2026-11-01T01:00:00Z"),
    });
    expect(await f.standing(rollover)).toMatchObject({
      accruedCents: 5_000n,
      accruedThisMonthCents: 5_000n,
    });
  });

  test("its emails say what happened, and a hold is pushed to the app", async () => {
    const f = await fixture();
    for (let charge = 0; charge < 6; charge++) {
      await f.useCents(10_000);
      await f.check();
      await f.collect();
    }
    const sent: BillingNotice[] = [];
    await runDueBillingNotifications(
      { now, scope: f.scope, limit: 100 },
      {
        notifier: {
          async send(notice) {
            sent.push(notice);
          },
        },
        dashboardUrl: "https://coss.test",
      },
    );
    const subjects = sent.map((notice) => notice.subject);
    expect(subjects.some((subject) => subject.startsWith("We charged $100.00"))).toBeTrue();
    expect(subjects.some((subject) => subject.includes("close to its credit limit"))).toBeTrue();
    expect(subjects.some((subject) => subject.includes("reached its credit limit"))).toBeTrue();
    const pushes = await db
      .select({ kind: schema.pushNotification.kind, subject: schema.pushNotification.subjectId })
      .from(schema.pushNotification)
      .where(eq(schema.pushNotification.organizationId, f.organizationId));
    expect(pushes).toContainEqual({ kind: "billing_hold_placed", subject: "credit_limit" });
  });

  test("the Free plan isn't under one", async () => {
    const tenant = await createTestTenant();
    const organizationId = tenant.organization.id;
    await runDueCreditChecks({ now, scope: { organizationIds: [organizationId] } });
    expect((await billingObject(organizationId, now)).credit_limit).toBeNull();
  });

  test("coss.com's own organization is never checked", async () => {
    const f = await fixture();
    await f.useCents(60_000);
    await runDueCreditChecks({
      now,
      scope: f.scope,
      systemOrganizationId: f.organizationId,
    });
    expect(await f.invoices("threshold")).toHaveLength(0);
    expect(await f.held()).toBeFalse();
  });

  test("the API reports it", async () => {
    const f = await fixture();
    await f.useCents(5_000);
    expect((await billingObject(f.organizationId, now)).credit_limit).toEqual({
      limit: 50_000,
      used: 5_000,
      charge_threshold: 10_000,
    });
  });
});
