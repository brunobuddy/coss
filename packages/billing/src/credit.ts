/**
 * Credit control: usage is invoiced after it happens, and coss.com pays its providers either way.
 * Two things bound what an account can run up (the worker's `billing-credit` loop):
 *
 * - **Threshold charges.** Unbilled usage reaching the threshold is invoiced and charged at once
 *   (`threshold` invoices). The invoice funds a `threshold` credit grant, so the rating engine stays
 *   the only thing that prices usage: the month's invoice re-rates the whole month and draws the
 *   grant down, and a charge that fails is still owed once, on its own invoice.
 * - **The credit limit.** What could still be lost (unbilled usage, unpaid invoices and threshold
 *   charges too recent to have survived a dispute) stays under a limit that grows with settled
 *   payments. Over it, a `credit_limit` hold pauses live sending. A stolen card that pays every
 *   charge is therefore still capped: its payments count against the limit until they settle.
 *
 * Self-serve accounts charged automatically are under it; contracts and net terms only when an admin
 * sets a limit (`billing_account.credit_limit_cents`). System-level: spans organizations.
 */
import { db, type Executor, schema } from "@coss/db";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import {
  type BillingAccount,
  getBillingAccount,
  lockBillingAccount,
  organizationLabel,
} from "./accounts.ts";
import { automaticCreditLimit, CREDIT_POLICY, chargeThreshold } from "./catalog/credit.ts";
import type { GrantApplication } from "./engine/types.ts";
import { insertComposedGrants } from "./grants.ts";
import { liftHold, placeHold } from "./holds.ts";
import { createInvoice, finalizeInvoice, type InvoiceRow } from "./invoices.ts";
import { formatCents } from "./money.ts";
import { enqueueBillingNotification } from "./notifications.ts";
import { CATCH_UP_MONTHS, composeMonth, hasContractIn } from "./periods.ts";
import { type BillingState, billingStateAt } from "./resolve.ts";
import { HOUR_MS, type Interval, periodOf, previousPeriod } from "./time.ts";

const {
  billingAccount,
  billingCreditNote,
  billingHold,
  billingInvoice,
  billingPeriod,
  billingUsage,
} = schema;

const DAY_MS = 24 * 60 * 60 * 1000;
/** A Stripe dispute reason: the cardholder says they didn't make the payment. */
const FRAUD_DISPUTE = "fraudulent";

export type CreditHoldCause = "over_limit" | "charge_failed" | "fraud_dispute";

export type CreditStanding = {
  limitCents: bigint;
  /** Whether the limit is an admin's (it then overrides the automatic rules). */
  customLimit: boolean;
  /** Unbilled usage charged early at this amount (`null`: this account isn't charged automatically). */
  thresholdCents: bigint | null;
  /** What could still be lost: the next three together. */
  usedCents: bigint;
  /** Usage not invoiced yet, after credits: this month's and any ended month's not closed yet. */
  accruedCents: bigint;
  /** This month's part of it (what a threshold charge bills; the close bills the rest). */
  accruedThisMonthCents: bigint;
  /** Open invoices' amounts due. */
  unpaidCents: bigint;
  /** Threshold charges paid but not settled yet. */
  unsettledChargesCents: bigint;
  /** Payments that have settled (what the automatic limit grows from). */
  settledPaidCents: bigint;
  /** Why live sending should be held (`null`: it shouldn't). */
  holdCause: CreditHoldCause | null;
};

/** Whether an account is under a credit limit, and how it's charged. */
function creditTerms(
  account: BillingAccount,
  state: Pick<BillingState, "contract">,
): { applies: boolean; chargesAutomatically: boolean } {
  const chargesAutomatically =
    account.collectionMethod === "charge_automatically" && account.provider !== "manual";
  if (account.creditLimitCents !== null) return { applies: true, chargesAutomatically };
  return {
    applies: state.contract?.kind === "self_serve" && chargesAutomatically,
    chargesAutomatically,
  };
}

/**
 * Usage not invoiced yet, after credits. A month that ended stays here until it closes (the settle
 * window, a backlog), or the rollover would make it vanish from what's at risk and lift a hold. Each
 * month's estimate spends credit the earlier ones didn't, as the closes will.
 */
async function unbilledUsage(
  organizationId: string,
  now: Date,
  executor: Executor,
): Promise<{ thisMonthCents: bigint; unclosedCents: bigint }> {
  const current = periodOf(now);
  const ended: Interval[] = [];
  for (let period = current, i = 0; i < CATCH_UP_MONTHS; i++) {
    period = previousPeriod(period);
    ended.unshift(period);
  }
  const closed = await executor
    .select({ start: billingPeriod.periodStart })
    .from(billingPeriod)
    .where(
      and(
        eq(billingPeriod.organizationId, organizationId),
        inArray(
          billingPeriod.periodStart,
          ended.map((period) => period.start),
        ),
      ),
    );
  const closedAt = new Set(closed.map((row) => row.start.getTime()));
  const drawnDown: GrantApplication[] = [];
  let unclosedCents = 0n;
  for (const period of ended) {
    if (closedAt.has(period.start.getTime())) continue;
    if (!(await hasContractIn(organizationId, period, executor))) continue;
    const { composition } = await composeMonth(
      { organizationId, period, withAdvance: false, drawnDown },
      executor,
    );
    unclosedCents += composition.totalCents;
    drawnDown.push(...composition.applications);
  }
  const { composition } = await composeMonth(
    { organizationId, period: current, withAdvance: false, usageUntil: now, drawnDown },
    executor,
  );
  return { thisMonthCents: composition.totalCents, unclosedCents };
}

/** Where an account stands against its credit limit (`null`: not under one). */
export async function creditStandingOf(
  account: BillingAccount,
  state: Pick<BillingState, "contract">,
  now: Date,
  executor: Executor = db,
): Promise<CreditStanding | null> {
  const { applies, chargesAutomatically } = creditTerms(account, state);
  if (!applies) return null;
  const settledBefore = new Date(now.getTime() - CREDIT_POLICY.settleDays * DAY_MS);
  const organizationId = account.organizationId;
  const paid = sql`${billingInvoice.status} = 'paid'`;
  const settled = sql`${paid} and ${billingInvoice.paidAt} <= ${settledBefore}`;
  const disputed = sql`${billingInvoice.paymentState} = 'disputed'`;
  const threshold = sql`${billingInvoice.kind} = 'threshold'`;
  // What each payment still stands at: a refund takes back its own invoice's, no other's. The outer
  // column is spelled out: in a single-table select Drizzle doesn't qualify columns.
  const refunded = sql`coalesce((select sum(${billingCreditNote.refundCents}) from ${billingCreditNote} where ${billingCreditNote.invoiceId} = ${sql.raw('"billing_invoice"."id"')} and ${billingCreditNote.status} <> 'failed'), 0)`;
  const kept = sql`${billingInvoice.amountPaidCents} - ${refunded}`;
  const [row] = await executor
    .select({
      settled: sql<string>`coalesce(sum(${kept}) filter (where ${settled} and not coalesce(${disputed}, false)), 0)`,
      unsettled: sql<string>`coalesce(sum(${kept}) filter (where ${threshold} and ${paid} and ${billingInvoice.paidAt} > ${settledBefore}), 0)`,
      unpaid: sql<string>`coalesce(sum(${billingInvoice.amountDueCents}) filter (where ${billingInvoice.status} = 'open'), 0)`,
      chargeFailed: sql<boolean>`coalesce(bool_or(${threshold} and ${billingInvoice.status} = 'open' and ${billingInvoice.paymentState} = 'failed'), false)`,
      fraud: sql<boolean>`coalesce(bool_or(${disputed} and ${billingInvoice.paymentError} = ${FRAUD_DISPUTE}), false)`,
    })
    .from(billingInvoice)
    .where(eq(billingInvoice.organizationId, organizationId));
  const settledPaidCents = BigInt(row?.settled ?? 0);
  const unpaidCents = BigInt(row?.unpaid ?? 0);
  const unsettledChargesCents = BigInt(row?.unsettled ?? 0);
  const { thisMonthCents, unclosedCents } = await unbilledUsage(organizationId, now, executor);
  const accruedCents = thisMonthCents + unclosedCents;
  const customLimit = account.creditLimitCents !== null;
  const limitCents = account.creditLimitCents ?? automaticCreditLimit(settledPaidCents);
  const usedCents = accruedCents + unpaidCents + unsettledChargesCents;
  // An admin's limit is a decision about this account: it replaces the automatic signals too.
  const holdCause: CreditHoldCause | null =
    usedCents > limitCents
      ? "over_limit"
      : customLimit
        ? null
        : row?.fraud
          ? "fraud_dispute"
          : row?.chargeFailed && settledPaidCents === 0n
            ? "charge_failed"
            : null;
  return {
    limitCents,
    customLimit,
    thresholdCents: chargesAutomatically ? chargeThreshold(limitCents) : null,
    usedCents,
    accruedCents,
    accruedThisMonthCents: thisMonthCents,
    unpaidCents,
    unsettledChargesCents,
    settledPaidCents,
    holdCause,
  };
}

/**
 * Invoices the month's unbilled usage now, if it has reached `thresholdCents` and no earlier
 * threshold charge is still open. Takes the account lock, so several workers (and the month's close)
 * can't bill the same usage twice. Returns the invoice.
 */
export async function chargeAccruedUsage(input: {
  organizationId: string;
  provider: BillingAccount["provider"];
  thresholdCents: bigint;
  now: Date;
}): Promise<InvoiceRow | null> {
  const { organizationId, now } = input;
  return db.transaction(async (tx) => {
    const account = await lockBillingAccount(tx, organizationId, input.provider);
    const [open] = await tx
      .select({ id: billingInvoice.id })
      .from(billingInvoice)
      .where(
        and(
          eq(billingInvoice.organizationId, organizationId),
          eq(billingInvoice.kind, "threshold"),
          eq(billingInvoice.status, "open"),
        ),
      )
      .limit(1);
    if (open) return null;
    const period = periodOf(now);
    const { thisMonthCents: amount } = await unbilledUsage(organizationId, now, tx);
    if (amount <= 0n || amount < input.thresholdCents) return null;
    const organization = await organizationLabel(organizationId, tx);
    if (!organization) return null;
    const soFar = { start: period.start, end: now };
    const invoice = await createInvoice(tx, {
      account,
      organization,
      kind: "threshold",
      period: soFar,
      lines: [
        {
          kind: "adjustment",
          description: "Usage so far this month",
          amountCents: amount,
          period: soFar,
          contractId: null,
        },
      ],
      memo: "Usage charged early: it reached your billing threshold. This month's invoice takes it off.",
    });
    const finalized = await finalizeInvoice(tx, invoice, account, now);
    await insertComposedGrants(tx, organizationId, finalized.id, [
      {
        key: `threshold:${finalized.id}`,
        kind: "amount",
        amount,
        meter: null,
        dimension: null,
        scope: null,
        // Never expires, and pays for anything: it's the customer's own money, however the month's
        // final rating turns out (volume pricing can lower what's owed).
        appliesTo: "any",
        source: "threshold",
        effectiveAt: now,
        expiresAt: null,
        contractId: null,
        description: `Usage charged early on invoice ${finalized.number ?? finalized.id}`,
      },
    ]);
    await enqueueBillingNotification(tx, {
      organizationId,
      kind: "usage_charged",
      dedupeKey: `usage_charged:${finalized.id}`,
      payload: {
        invoiceId: finalized.id,
        amount: formatCents(amount),
        threshold: formatCents(input.thresholdCents),
      },
      now,
    });
    return finalized;
  });
}

/**
 * One organization's credit check: charges unbilled usage over the threshold, warns near the limit,
 * and places or lifts the hold.
 */
export async function checkOrganizationCredit(organizationId: string, now: Date): Promise<void> {
  const account = await getBillingAccount(organizationId);
  if (!account) return;
  const state = await billingStateAt(organizationId, now);
  const standing = await creditStandingOf(account, state, now);
  if (
    standing?.thresholdCents != null &&
    standing.accruedThisMonthCents >= standing.thresholdCents
  ) {
    // What it moves from unbilled to unpaid, so what's at risk (and the hold below) doesn't change.
    await chargeAccruedUsage({
      organizationId,
      provider: account.provider,
      thresholdCents: standing.thresholdCents,
      now,
    });
  }
  const exempt = account.holdExemptUntil !== null && account.holdExemptUntil > now;
  const cause = exempt ? null : (standing?.holdCause ?? null);
  await db.transaction(async (tx) => {
    if (cause && standing) {
      const limit = formatCents(standing.limitCents);
      const placed = await placeHold(
        tx,
        organizationId,
        "credit_limit",
        `${cause}: ${formatCents(standing.usedCents)} at risk of ${limit}`,
      );
      if (placed) {
        await enqueueBillingNotification(tx, {
          organizationId,
          kind: "credit_limit_reached",
          dedupeKey: `credit_limit:${organizationId}:${now.toISOString()}`,
          payload: { limit, cause },
          now,
        });
      }
      return;
    }
    const lifted = await liftHold(tx, organizationId, "credit_limit");
    if (lifted) {
      await enqueueBillingNotification(tx, {
        organizationId,
        kind: "hold_lifted",
        dedupeKey: `hold_lifted:credit_limit:${organizationId}:${now.toISOString()}`,
        payload: { reason: "credit_limit" },
        now,
      });
    }
    if (
      standing &&
      standing.usedCents * 100n >= standing.limitCents * BigInt(CREDIT_POLICY.warnAtPercent)
    ) {
      // Once per limit: raising it is what makes the warning worth repeating.
      await enqueueBillingNotification(tx, {
        organizationId,
        kind: "credit_limit_warning",
        dedupeKey: `credit_warning:${organizationId}:${standing.limitCents}`,
        payload: {
          limit: formatCents(standing.limitCents),
          used: formatCents(standing.usedCents),
        },
        now,
      });
    }
  });
}

/**
 * Checks every account that may need it: recent usage, a hold to lift, or a threshold charge still
 * open (it may have failed since). Separate from `runBillingUsageChecks` because it runs much more
 * often: minutes of a fraudster's SMS cost more than the limit is worth. Returns how many it checked.
 */
export async function runDueCreditChecks(opts: {
  now?: Date;
  scope?: { organizationIds: string[] };
  systemOrganizationId?: string | null;
}): Promise<number> {
  const now = opts.now ?? new Date();
  const scope = opts.scope?.organizationIds;
  const [active, held, charging] = await Promise.all([
    db
      .selectDistinct({ organizationId: billingAccount.organizationId })
      .from(billingAccount)
      .innerJoin(billingUsage, eq(billingUsage.organizationId, billingAccount.organizationId))
      .where(
        and(
          gte(billingUsage.hourStart, new Date(now.getTime() - 2 * HOUR_MS)),
          scope ? inArray(billingAccount.organizationId, scope) : undefined,
        ),
      ),
    db
      .selectDistinct({ organizationId: billingHold.organizationId })
      .from(billingHold)
      .where(
        and(
          eq(billingHold.reason, "credit_limit"),
          scope ? inArray(billingHold.organizationId, scope) : undefined,
        ),
      ),
    db
      .selectDistinct({ organizationId: billingInvoice.organizationId })
      .from(billingInvoice)
      .where(
        and(
          eq(billingInvoice.kind, "threshold"),
          eq(billingInvoice.status, "open"),
          scope ? inArray(billingInvoice.organizationId, scope) : undefined,
        ),
      ),
  ]);
  const candidates = [
    ...new Set([...active, ...held, ...charging].map((row) => row.organizationId)),
  ].filter((id) => id !== opts.systemOrganizationId);
  for (const organizationId of candidates) {
    try {
      await checkOrganizationCredit(organizationId, now);
    } catch (error) {
      console.error(`[billing] credit check of ${organizationId} failed:`, error);
    }
  }
  return candidates.length;
}
