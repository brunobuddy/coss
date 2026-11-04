/**
 * Closing billing months. Once a month has ended (plus `USAGE_SETTLE_MS`, so every transaction
 * that metered usage in it has committed), each account with a contract around it gets one
 * invoice: the month's usage and arrears charges, the next month's advance charges and credit,
 * and the credits drawn down. Idempotent per account and month (`billing_period`).
 */
import { db, type Executor, schema, type Transaction } from "@coss/db";
import {
  and,
  asc,
  exists,
  gt,
  inArray,
  isNull,
  lt,
  notExists,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { type BillingAccount, lockBillingAccount, organizationLabel } from "./accounts.ts";
import { carriedKeys } from "./carried.ts";
import type { MeterKey } from "./catalog/meters.ts";
import { contractAt, contractsOverlapping } from "./contracts.ts";
import { composePeriodInvoice } from "./engine/compose.ts";
import type { Composition, Segment, SpendHistory, TermQuantity } from "./engine/types.ts";
import { existingGrantKeys, grantsFor, toGrantBalance } from "./grants.ts";
import { createInvoice, existingChargeKeys, finalizeInvoice, spendHistory } from "./invoices.ts";
import { stringifyWithBigInt } from "./money.ts";
import { contractSegment, segmentsFor } from "./resolve.ts";
import { type Interval, intersect, nextPeriod, periodOf, previousPeriod } from "./time.ts";
import { usageRows } from "./usage.ts";

const { billingAccount, billingContract, billingPeriod } = schema;

/** How long after a month ends it is closed: longer than any transaction that meters usage. */
export const USAGE_SETTLE_MS = 15 * 60 * 1000;
/** Months the close scan looks back (it catches up after an outage). */
const CATCH_UP_MONTHS = 3;

type ComposeInput = {
  organizationId: string;
  period: Interval;
  /** The next month's advance charges are included (a real close; not an estimate). */
  withAdvance: boolean;
  /** Only usage before this instant (an estimate of the running month). */
  usageUntil?: Date;
};

/** Everything the engine needs for an account's month, read in `executor`. */
export async function composeMonth(
  input: ComposeInput,
  executor: Executor = db,
): Promise<{ composition: Composition; segments: Segment[]; nextSegment: Segment | null }> {
  const { organizationId, period } = input;
  const segments = await segmentsFor(organizationId, period, executor);
  const usageWindow = input.usageUntil
    ? { start: period.start, end: input.usageUntil < period.end ? input.usageUntil : period.end }
    : period;
  const usage = await usageRows(organizationId, usageWindow, executor);

  const next = nextPeriod(period);
  const nextContract = input.withAdvance
    ? await contractAt(organizationId, next.start, executor)
    : null;
  const nextSegment = nextContract
    ? contractSegment(
        nextContract,
        intersect(next, {
          start: nextContract.effectiveFrom,
          end: nextContract.effectiveUntil ?? next.end,
        }) ?? next,
        false,
      )
    : null;

  const contractIds = [
    ...new Set(
      [...segments.map((segment) => segment.contractId), nextSegment?.contractId].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  const lines = await spendHistory(contractIds, executor);
  const history = new Map<string, SpendHistory>();
  const termQuantities = new Map<string, TermQuantity>();
  for (const line of lines) {
    if (line.month >= period.start && line.kind !== "plan_fee" && line.kind !== "proration")
      continue;
    const key = `${line.contractId}|${line.month.toISOString()}`;
    let row = history.get(key);
    if (!row) {
      row = { contractId: line.contractId, month: line.month, usageCents: {}, feeCents: 0n };
      history.set(key, row);
    }
    if (line.kind === "plan_fee" || line.kind === "proration") {
      row.feeCents += line.amountCents;
    } else if (
      line.meter &&
      (line.kind === "usage" || line.kind === "discount" || line.kind === "write_off")
    ) {
      const meter = line.meter as MeterKey;
      row.usageCents[meter] = (row.usageCents[meter] ?? 0n) + line.amountCents;
      if (line.kind === "usage" && line.quantity && line.month < period.start) {
        const termKey = `${line.contractId}|${meter}|${line.dimension ?? ""}`;
        const term = termQuantities.get(termKey) ?? {
          contractId: line.contractId,
          meter,
          dimension: line.dimension ?? "",
          quantity: 0,
        };
        term.quantity += line.quantity;
        termQuantities.set(termKey, term);
      }
    }
  }

  const grants = await grantsFor(organizationId, { start: period.start, end: next.end }, executor);

  // Charges and grants an earlier invoice made (a mid-month contract start, a re-run).
  const draft = composePeriodInvoice({
    closed: {
      period,
      segments,
      usage,
      history: [...history.values()],
      termQuantities: [...termQuantities.values()],
    },
    next: nextSegment ? { period: next, segment: nextSegment } : null,
    grants: grants.map(toGrantBalance),
  });
  const billed = {
    chargeKeys: await existingChargeKeys(
      draft.lines.flatMap((line) => (line.chargeKey ? [line.chargeKey] : [])),
      executor,
    ),
    grantKeys: await existingGrantKeys(
      draft.grants.map((grant) => grant.key),
      executor,
    ),
  };
  // The next month's fee or add-ons an earlier contract paid (a change in its first hour).
  if (nextContract) {
    const carried = await carriedKeys(nextContract, next.start, executor);
    for (const key of carried.chargeKeys) billed.chargeKeys.add(key);
    for (const key of carried.grantKeys) billed.grantKeys.add(key);
  }
  const composition =
    billed.chargeKeys.size || billed.grantKeys.size
      ? composePeriodInvoice({
          closed: {
            period,
            segments,
            usage,
            history: [...history.values()],
            termQuantities: [...termQuantities.values()],
          },
          next: nextSegment ? { period: next, segment: nextSegment } : null,
          grants: grants.map(toGrantBalance),
          billed,
        })
      : draft;
  return { composition, segments, nextSegment };
}

/** Closes one account's month. Returns the invoice id (`null`: nothing billable), or `undefined` when already closed. */
export async function closeBillingPeriod(input: {
  account: Pick<BillingAccount, "organizationId" | "provider">;
  period: Interval;
  now: Date;
  /** Wait for the previous month to close first (default). Off for the scan's oldest month. */
  inOrder?: boolean;
}): Promise<string | null | undefined> {
  return db.transaction(async (tx) => {
    const account = await lockBillingAccount(
      tx,
      input.account.organizationId,
      input.account.provider,
    );
    if (await periodClosed(tx, account.id, input.period.start)) return undefined;
    // Months close in order: the one before creates this one's credit (its advance charges).
    const previous = previousPeriod(input.period);
    if (
      input.inOrder !== false &&
      !(await periodClosed(tx, account.id, previous.start)) &&
      (
        await contractsOverlapping(
          account.organizationId,
          { start: previous.start, end: input.period.end },
          tx,
        )
      ).length > 0 &&
      (await hasClosedMonth(tx, account.id))
    ) {
      return undefined;
    }
    const organization = await organizationLabel(account.organizationId, tx);
    if (!organization) return undefined;
    const { composition, segments, nextSegment } = await composeMonth(
      { organizationId: account.organizationId, period: input.period, withAdvance: true },
      tx,
    );
    let invoiceId: string | null = null;
    // Internal accounts (coss.com's own) are never invoiced: neither the month nor the next is billable.
    const billable =
      segments.some((segment) => segment.billable !== false) ||
      (nextSegment !== null && nextSegment.billable !== false);
    // Also when every line is zero but credit was drawn down (units covered all usage): the
    // invoice is the record of the drawdown.
    if (
      billable &&
      (composition.lines.some((line) => line.amountCents !== 0n) ||
        composition.grants.length > 0 ||
        composition.applications.length > 0)
    ) {
      const invoice = await createInvoice(tx, {
        account,
        organization,
        kind: "period",
        period: input.period,
        lines: composition.lines,
        applications: composition.applications,
        grants: composition.grants,
        termsSnapshot: snapshot(segments),
      });
      await finalizeInvoice(tx, invoice, account, input.now);
      invoiceId = invoice.id;
    }
    await tx.insert(billingPeriod).values({
      organizationId: account.organizationId,
      accountId: account.id,
      periodStart: input.period.start,
      periodEnd: input.period.end,
      invoiceId,
      usage: composition.usage,
      warnings: composition.warnings,
    });
    for (const warning of composition.warnings) {
      console.warn(
        `[billing] ${account.organizationId} ${input.period.start.toISOString()}: ${warning}`,
      );
    }
    return invoiceId;
  });
}

/** Whether the account had any month closed (its first month needs no predecessor). */
async function hasClosedMonth(tx: Transaction, accountId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: billingPeriod.id })
    .from(billingPeriod)
    .where(sql`${billingPeriod.accountId} = ${accountId}`)
    .limit(1);
  return Boolean(row);
}

async function periodClosed(tx: Transaction, accountId: string, start: Date): Promise<boolean> {
  const [row] = await tx
    .select({ id: billingPeriod.id })
    .from(billingPeriod)
    .where(
      and(
        sql`${billingPeriod.accountId} = ${accountId}`,
        sql`${billingPeriod.periodStart} = ${start}`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** The resolved terms an invoice was computed with (support reads them later). */
export function snapshot(segments: readonly Segment[]): Record<string, unknown> {
  return JSON.parse(
    stringifyWithBigInt({
      segments: segments.map((segment) => ({
        contractId: segment.contractId,
        start: segment.interval.start,
        end: segment.interval.end,
        plan: segment.terms.plan,
        fee: segment.terms.fee,
        rates: segment.terms.rates,
        includedUnits: segment.terms.includedUnits,
        commitments: segment.terms.commitments,
        discounts: segment.terms.discounts,
      })),
    }),
  );
}

/** Accounts with a contract around the month whose close hasn't happened. */
function accountsDue(
  period: Interval,
  opts: { scope?: { organizationIds: string[] }; except: string[]; limit: number },
) {
  const next = nextPeriod(period);
  return db
    .select({
      organizationId: billingAccount.organizationId,
      provider: billingAccount.provider,
    })
    .from(billingAccount)
    .where(
      and(
        opts.scope ? inArray(billingAccount.organizationId, opts.scope.organizationIds) : undefined,
        opts.except.length ? notInArray(billingAccount.organizationId, opts.except) : undefined,
        // A contract around the month (or starting the next one, for its advance charges).
        exists(
          db
            .select({ id: billingContract.id })
            .from(billingContract)
            .where(
              and(
                sql`${billingContract.accountId} = ${billingAccount.id}`,
                sql`${billingContract.status} = 'confirmed'`,
                lt(billingContract.effectiveFrom, next.end),
                or(
                  isNull(billingContract.effectiveUntil),
                  gt(billingContract.effectiveUntil, period.start),
                ),
              ),
            ),
        ),
        notExists(
          db
            .select({ id: billingPeriod.id })
            .from(billingPeriod)
            .where(
              and(
                sql`${billingPeriod.accountId} = ${billingAccount.id}`,
                sql`${billingPeriod.periodStart} = ${period.start}`,
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(billingAccount.id))
    .limit(opts.limit);
}

/**
 * Closes every ended month that is due (oldest first, up to `CATCH_UP_MONTHS` back) for accounts
 * with a contract around it. System-level: spans organizations. Returns how many were closed.
 */
export async function runDueBillingPeriods(opts: {
  now?: Date;
  limit?: number;
  scope?: { organizationIds: string[] };
}): Promise<number> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 50;
  const latest = previousPeriod(periodOf(new Date(now.getTime() - USAGE_SETTLE_MS)));
  const periods: Interval[] = [latest];
  for (let i = 1; i < CATCH_UP_MONTHS; i++) periods.unshift(previousPeriod(periods[0] as Interval));

  let closed = 0;
  // An account whose close failed waits for the next run (its later months too: they close in
  // order), and doesn't keep the others from closing.
  const failed: string[] = [];
  for (const period of periods) {
    for (;;) {
      if (closed >= limit) return closed;
      const due = await accountsDue(period, {
        scope: opts.scope,
        except: failed,
        limit: Math.min(limit - closed, 50),
      });
      if (!due.length) break;
      let progressed = false;
      for (const account of due) {
        try {
          const result = await closeBillingPeriod({
            account,
            period,
            now,
            // Older months are past the catch-up window: the oldest one can't wait for them.
            inOrder: period !== periods[0],
          });
          if (result !== undefined) {
            closed++;
            progressed = true;
          } else {
            // Waiting for an earlier month (or closed meanwhile): not this run.
            failed.push(account.organizationId);
          }
        } catch (error) {
          failed.push(account.organizationId);
          console.error(
            `[billing] closing ${period.start.toISOString()} for ${account.organizationId} failed:`,
            error,
          );
        }
      }
      if (!progressed && due.every((account) => failed.includes(account.organizationId))) continue;
    }
  }
  // After `CATCH_UP_MONTHS` a month is skipped for good and its usage goes unbilled: say so first.
  for (const period of periods.slice(0, -1)) {
    const late = await accountsDue(period, { scope: opts.scope, except: [], limit: 20 });
    if (late.length > 0) {
      console.error(
        `[billing] ${period.start.toISOString()} is still open for ${late.map((account) => account.organizationId).join(", ")}: after ${CATCH_UP_MONTHS} months it can't be closed.`,
      );
    }
  }
  return closed;
}

/** Whether an account's month overlaps any of its contracts (it needs closing). */
export async function hasContractIn(
  organizationId: string,
  period: Interval,
  executor: Executor = db,
): Promise<boolean> {
  return (await contractsOverlapping(organizationId, period, executor)).length > 0;
}
