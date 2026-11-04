/**
 * Usage checks (the worker's `billing-usage` loop): alerts when an organization crosses a share of
 * its month's credit (or of a capped plan's allowance), and the spend limit: usage beyond the
 * credit past an owner's limit holds live sending until the month ends or the limit is raised.
 * Then budgets (`checkBudgets`): members', projects' and API keys' shares of the month's charges.
 * System-level: spans organizations.
 */
import { db, schema } from "@coss/db";
import { inArray } from "drizzle-orm";
import { getBillingAccount } from "./accounts.ts";
import { announce } from "./announce.ts";
import { checkBudgets } from "./budgets.ts";
import { METERS, type MeterKey } from "./catalog/meters.ts";
import { grantsFor } from "./grants.ts";
import { liftHold, placeHold } from "./holds.ts";
import { formatCents } from "./money.ts";
import { enqueueBillingNotification } from "./notifications.ts";
import { billingStateAt } from "./resolve.ts";
import { spendBreakdown } from "./spend.ts";
import { formatPeriod, HOUR_MS, periodOf } from "./time.ts";
import { organizationsWithUsageSince } from "./usage.ts";

const DEFAULT_THRESHOLDS = [80, 100];

export async function runBillingUsageChecks(opts: {
  now?: Date;
  /** Batch size; every candidate is checked on each run. */
  limit?: number;
  scope?: { organizationIds: string[] };
  systemOrganizationId?: string | null;
}): Promise<number> {
  const now = opts.now ?? new Date();
  const active = await organizationsWithUsageSince(new Date(now.getTime() - 2 * HOUR_MS));
  const held = await db
    .selectDistinct({ organizationId: schema.billingHold.organizationId })
    .from(schema.billingHold)
    .where(inArray(schema.billingHold.reason, ["spend_limit"]));
  // Held budgets too: a paused source that stopped sending is lifted when the month ends.
  const budgetHeld = await db
    .selectDistinct({ organizationId: schema.billingBudgetHold.organizationId })
    .from(schema.billingBudgetHold);
  let candidates = [
    ...new Set([...active, ...[...held, ...budgetHeld].map((row) => row.organizationId)]),
  ];
  if (opts.scope) candidates = candidates.filter((id) => opts.scope?.organizationIds.includes(id));
  candidates = candidates.filter((id) => id !== opts.systemOrganizationId);
  const batchSize = Math.max(1, Math.floor(opts.limit ?? 200));
  for (let offset = 0; offset < candidates.length; offset += batchSize) {
    for (const organizationId of candidates.slice(offset, offset + batchSize)) {
      try {
        await checkOrganizationSpend(organizationId, now);
      } catch (error) {
        console.error(`[billing] usage check of ${organizationId} failed:`, error);
      }
    }
  }
  return candidates.length;
}

/**
 * One organization's usage checks (also run by the dashboard right after budget changes, so a
 * raised budget lifts its hold at once). Never for coss.com's own organization.
 */
export async function checkOrganizationSpend(organizationId: string, now: Date): Promise<void> {
  const period = periodOf(now);
  const periodKey = period.start.toISOString().slice(0, 7);
  const [account, state, spend] = await Promise.all([
    getBillingAccount(organizationId),
    billingStateAt(organizationId, now),
    spendBreakdown(organizationId, now),
  ]);
  const { estimate } = spend;
  const thresholds = account?.alertThresholds.length ? account.alertThresholds : DEFAULT_THRESHOLDS;
  // The email and the webhook event go out once per threshold and month (the dedupe key).
  const alert = (
    meter: MeterKey | null,
    percent: number,
    what: string,
    blocked: boolean,
    atLimit?: string,
  ) =>
    db.transaction(async (tx) => {
      const fresh = await enqueueBillingNotification(tx, {
        organizationId,
        kind: "usage_threshold",
        dedupeKey: `usage:${organizationId}:${periodKey}:${meter ?? "credit"}:${percent}`,
        payload: {
          percent,
          what,
          period: formatPeriod(period),
          blocked: blocked ? "true" : "false",
          ...(atLimit ? { atLimit } : {}),
        },
        now,
      });
      if (!fresh) return;
      await announce(
        tx,
        organizationId,
        {
          type: "billing.usage_threshold_reached",
          data: {
            percent,
            of: meter ? "allowance" : "credit",
            meter,
            period: { start: period.start.toISOString(), end: period.end.toISOString() },
          },
        },
        now,
      );
    });

  // Capped plans: the share of each allowance used.
  for (const [meter, cap] of Object.entries(state.terms.usageCaps) as [MeterKey, number][]) {
    if (!cap) continue;
    const used = estimate.usage
      .filter((row) => row.meter === meter)
      .reduce((sum, row) => sum + row.quantity, 0);
    const share = (used / cap) * 100;
    const crossed = thresholds.filter((t) => share >= t).at(-1);
    if (crossed !== undefined) {
      await alert(
        meter,
        crossed,
        `${cap.toLocaleString("en-US")} included ${METERS[meter].units}`,
        true,
        meter === "risk.assessments"
          ? "Past the limit, assessments go on until the next billing period without velocity, memory or content checks. Upgrade to keep them."
          : undefined,
      );
    }
  }

  // Billed plans: the share of the month's credit the usage has reached.
  const grants = await grantsFor(organizationId, period);
  const credit = grants
    .filter((grant) => grant.kind === "amount" && grant.appliesTo === "usage")
    .reduce((sum, grant) => sum + grant.amount, 0n);
  if (credit > 0n && estimate.usageCents > 0n) {
    const share = Number((estimate.usageCents * 10_000n) / credit) / 100;
    const crossed = thresholds.filter((t) => share >= t).at(-1);
    if (crossed !== undefined) await alert(null, crossed, "usage credit", false);
  }

  // Spend limit: usage beyond the month's credit (not fees or commitment shortfalls, which the
  // contract owes whatever is sent).
  const usageNet = estimate.composition.lines
    .filter(
      (line) =>
        line.kind === "usage" ||
        ((line.kind === "discount" || line.kind === "write_off") && line.meter !== undefined),
    )
    .reduce((sum, line) => sum + line.amountCents, 0n);
  const overage = usageNet > estimate.creditUsedCents ? usageNet - estimate.creditUsedCents : 0n;
  const limit = account?.spendLimitCents ?? null;
  if (limit !== null && overage > limit) {
    await db.transaction(async (tx) => {
      const placed = await placeHold(
        tx,
        organizationId,
        "spend_limit",
        `Over ${formatCents(limit)} in ${periodKey}`,
      );
      if (!placed) return;
      await enqueueBillingNotification(tx, {
        organizationId,
        kind: "spend_limit_reached",
        dedupeKey: `spend:${organizationId}:${periodKey}:${limit}`,
        payload: { limit: formatCents(limit) },
        now,
      });
    });
  } else {
    await db.transaction((tx) => liftHold(tx, organizationId, "spend_limit"));
  }

  await checkBudgets(organizationId, spend, now);
}
