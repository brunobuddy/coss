/**
 * Read models for the dashboard and the admin console: where an organization stands (plan,
 * scheduled change, the running month's usage and estimate, credits, holds), and simulations of
 * terms against real usage (sales previews).
 */
import { db, schema } from "@coss/db";
import { desc, eq } from "drizzle-orm";
import { type BillingAccount, getBillingAccount } from "./accounts.ts";
import { rateCardAt } from "./catalog/rates.ts";
import { type Contract, pendingContract } from "./contracts.ts";
import { type CreditStanding, creditStandingOf } from "./credit.ts";
import { composePeriodInvoice } from "./engine/compose.ts";
import { resolveTerms } from "./engine/terms.ts";
import type { Composition, Segment, UsageTotal } from "./engine/types.ts";
import { type Grant, grantsFor, toGrantBalance } from "./grants.ts";
import { holdsOf } from "./holds.ts";
import { invoiceTotals } from "./invoices.ts";
import { composeMonth } from "./periods.ts";
import { type BillingState, billingStateAt } from "./resolve.ts";
import type { ContractTerms } from "./schemas.ts";
import { type Interval, periodOf } from "./time.ts";
import { usageRows } from "./usage.ts";

export type PeriodEstimate = {
  period: Interval;
  /** Usage so far, per meter and dimension. */
  usage: UsageTotal[];
  composition: Composition;
  /** Usage charges before credits (what the credit is measured against). */
  usageCents: bigint;
  /** Credit usable this month (fee credit, prepaid commitments, support credit). */
  creditCents: bigint;
  creditUsedCents: bigint;
  /** Usage threshold charges drawn down: already paid for, so neither credit nor still to pay. */
  alreadyChargedCents: bigint;
  /** What the month's invoice would be today (without next month's advance charges). */
  totals: ReturnType<typeof invoiceTotals>;
};

export type BillingOverview = {
  account: BillingAccount | null;
  state: BillingState;
  pending: Contract | null;
  estimate: PeriodEstimate;
  grants: Grant[];
  holds: { reason: string; createdAt: Date }[];
  /** Where it stands against its credit limit (`null`: not under one). */
  credit: CreditStanding | null;
};

export async function billingOverview(
  organizationId: string,
  now: Date = new Date(),
): Promise<BillingOverview> {
  const [account, state, pending, estimate, holds] = await Promise.all([
    getBillingAccount(organizationId),
    billingStateAt(organizationId, now),
    pendingContract(organizationId),
    estimatePeriod(organizationId, now),
    holdsOf(organizationId),
  ]);
  const period = periodOf(now);
  const grants = await grantsFor(organizationId, period);
  const credit = account
    ? await creditStandingOf(account, state, estimate.totals.totalCents, now)
    : null;
  return { account, state, pending, estimate, grants, holds, credit };
}

/** The running month's invoice as it would be if it closed now. */
export async function estimatePeriod(
  organizationId: string,
  now: Date = new Date(),
): Promise<PeriodEstimate> {
  const period = periodOf(now);
  const { composition } = await composeMonth({
    organizationId,
    period,
    withAdvance: false,
    usageUntil: now,
  });
  return summarize(period, composition, await grantsFor(organizationId, period));
}

function summarize(period: Interval, composition: Composition, grants: Grant[]): PeriodEstimate {
  const usageCents = composition.lines
    .filter((line) => line.kind === "usage")
    .reduce((sum, line) => sum + line.amountCents, 0n);
  const creditCents = grants
    .filter((grant) => grant.kind === "amount" && grant.source !== "threshold")
    .reduce((sum, grant) => sum + (grant.remaining > 0n ? grant.remaining : 0n), 0n);
  const charged = new Set(
    grants.filter((grant) => grant.source === "threshold").map((grant) => grant.id),
  );
  const applied = composition.lines.filter((line) => line.kind === "credit");
  const alreadyChargedCents = -applied
    .filter((line) => line.grantId && charged.has(line.grantId))
    .reduce((sum, line) => sum + line.amountCents, 0n);
  const creditUsedCents =
    -applied.reduce((sum, line) => sum + line.amountCents, 0n) - alreadyChargedCents;
  return {
    period,
    usage: composition.usage,
    composition,
    usageCents,
    creditCents,
    creditUsedCents,
    alreadyChargedCents,
    totals: invoiceTotals(composition.lines),
  };
}

/**
 * What a month would cost under `terms` (a draft deal) with the organization's real usage of
 * `period`, next to what it costs under its actual contracts. Nothing is written.
 */
export async function simulateTerms(input: {
  organizationId: string;
  terms: ContractTerms;
  period: Interval;
  now?: Date;
}): Promise<{ simulated: Composition; actual: Composition }> {
  const now = input.now ?? new Date();
  const until = now < input.period.end ? now : input.period.end;
  const usage = await usageRows(input.organizationId, { start: input.period.start, end: until });
  const segment: Segment = {
    contractId: "simulated",
    interval: input.period,
    terms: resolveTerms(input.terms, rateCardAt(input.period.start)),
    contractStart: input.period.start,
    contractEnd: null,
    termEnd: null,
    superseded: false,
  };
  const feeCredit =
    segment.terms.fee && segment.terms.feeCredit.spendable
      ? [
          {
            id: "simulated_fee_credit",
            kind: "amount" as const,
            meter: null,
            dimension: null,
            remaining:
              segment.terms.fee.amountCents /
              BigInt({ month: 1, quarter: 3, year: 12 }[segment.terms.fee.interval]),
            scope: null,
            appliesTo: "usage" as const,
            effectiveAt: input.period.start,
            expiresAt: input.period.end,
            createdAt: input.period.start,
          },
        ]
      : [];
  const simulated = composePeriodInvoice({
    closed: { period: input.period, segments: [segment], usage },
    next: null,
    grants: feeCredit,
  });
  // The monthly fee itself, for comparison (charged in advance on the previous invoice).
  if (segment.terms.fee) {
    simulated.lines.unshift({
      kind: "plan_fee",
      description: "Fee (charged in advance)",
      amountCents:
        segment.terms.fee.amountCents /
        BigInt({ month: 1, quarter: 3, year: 12 }[segment.terms.fee.interval]),
      period: input.period,
      contractId: "simulated",
    });
    simulated.totalCents = simulated.lines.reduce((sum, line) => sum + line.amountCents, 0n);
  }
  const { composition: actual } = await composeMonth({
    organizationId: input.organizationId,
    period: input.period,
    withAdvance: false,
    usageUntil: until,
  });
  return { simulated, actual };
}

/** Grants as the engine sees them now (admin console debugging). */
export async function grantBalancesNow(organizationId: string, now: Date = new Date()) {
  return (await grantsFor(organizationId, periodOf(now))).map(toGrantBalance);
}

/** Closed months with their invoice, newest first. */
export async function listBillingPeriods(organizationId: string, limit = 24) {
  return db
    .select()
    .from(schema.billingPeriod)
    .where(eq(schema.billingPeriod.organizationId, organizationId))
    .orderBy(desc(schema.billingPeriod.periodStart))
    .limit(limit);
}
