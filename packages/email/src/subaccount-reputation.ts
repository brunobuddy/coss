/**
 * Each email sub-account's own reputation: its live transactional bounce and complaint rates over
 * the organization's window and thresholds (`ReputationPolicy`), counted from its own emails. A
 * warning clears when the rates recover; a pause (`suspend` severity, or a content screening
 * block) is never lifted automatically, only by `reinstateSubaccount` (the customer, or a platform
 * admin). Paused sub-accounts' live sends are refused (`subaccount_paused`); the organization and
 * its other sub-accounts go on. The organization's own standing still counts every sub-account's
 * sending, so it stays accountable for them.
 */
import { db, type Executor, schema } from "@coss/db";
import { ID_PREFIXES, newId } from "@coss/db/id";
import {
  type CheckResult,
  getReputationStanding,
  policyOf,
  rateResult,
  toCheckObject,
} from "@coss/reputation";
import { enqueueWebhookMessage } from "@coss/webhooks";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { countSlices } from "./reputation-checks.ts";
import type {
  StoredSubaccountWebhookEvent,
  SubaccountEventType,
  SubaccountReputationStatus,
} from "./subaccount-schemas.ts";
import type { SubaccountRow } from "./subaccounts.ts";

const { emailSubaccount } = schema;

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
export const SUBACCOUNT_EVALUATION_LEASE_MS = 5 * MINUTE;
/** While warned, re-evaluate this often so a recovery clears the warning. */
export const SUBACCOUNT_WARNING_RECHECK_MS = 60 * MINUTE;

/** Marks a sub-account due for evaluation (new evidence: a live bounce or complaint). */
export async function markSubaccountReputationDue(
  tx: Executor,
  subaccountId: string,
  now: Date = new Date(),
): Promise<void> {
  await tx
    .update(emailSubaccount)
    .set({ nextEvaluationAt: now })
    .where(
      and(
        eq(emailSubaccount.id, subaccountId),
        sql`${emailSubaccount.status} <> 'deleting'`,
        or(
          isNull(emailSubaccount.nextEvaluationAt),
          sql`${emailSubaccount.nextEvaluationAt} > ${now.toISOString()}::timestamptz`,
        ),
      ),
    );
}

/** The sub-account's transactional rate checks over `[windowStart, now]`. */
async function subaccountChecks(
  row: SubaccountRow,
  input: { now: Date; windowStart: Date; policy: ReturnType<typeof policyOf> },
): Promise<CheckResult[]> {
  const slices = await countSlices(row.organizationId, input.windowStart, input.now, {
    inclusive: true,
    stream: "transactional",
    subaccountId: row.id,
  });
  let recipients = 0;
  let bounces = 0;
  let complaints = 0;
  const simulator = input.policy.countSimulatorRecipients;
  for (const slice of slices.values()) {
    recipients += slice.recipients + (simulator ? slice.simulatorRecipients : 0);
    bounces += slice.bounces + (simulator ? slice.simulatorBounces : 0);
    complaints += slice.complaints + (simulator ? slice.simulatorComplaints : 0);
  }
  return [
    rateResult({
      trigger: "bounce_rate",
      label: "Bounce rate",
      count: bounces,
      volume: recipients,
      threshold: input.policy.bounceRate,
    }),
    rateResult({
      trigger: "complaint_rate",
      label: "Complaint rate",
      count: complaints,
      volume: recipients,
      threshold: input.policy.complaintRate,
    }),
  ];
}

const SEVERITY = { ok: 0, warning: 1, suspend: 2 } as const;

/** What the checks move a standing to (`null`: nothing changes). A pause is never lifted here. */
export function decideSubaccount(
  current: SubaccountReputationStatus,
  results: readonly CheckResult[],
): { to: SubaccountReputationStatus; trigger: string } | null {
  if (current === "paused") return null;
  const worst = [...results].sort((a, b) => SEVERITY[b.severity] - SEVERITY[a.severity])[0];
  if (worst?.severity === "suspend") return { to: "paused", trigger: worst.trigger };
  if (worst?.severity === "warning") {
    return current === "good" ? { to: "warning", trigger: worst.trigger } : null;
  }
  return current === "warning" ? { to: "good", trigger: "recovered" } : null;
}

function eventType(
  from: SubaccountReputationStatus,
  to: SubaccountReputationStatus,
  reinstated: boolean,
): SubaccountEventType | null {
  if (reinstated) return "subaccount.reinstated";
  if (to === "paused") return "subaccount.paused";
  if (to === "warning") return "subaccount.reputation_warning";
  return from === "warning" ? "subaccount.reputation_recovered" : null;
}

/**
 * Moves the standing (guarded by `revision`), bumps the revision and sends the webhook event to
 * the sub-account's environment (live sub-accounts only), in `tx`. Returns the row, or `null`
 * when the standing changed since it was read.
 */
async function applySubaccountTransition(
  tx: Executor,
  row: SubaccountRow,
  input: {
    to: SubaccountReputationStatus;
    trigger: string;
    checks: CheckResult[];
    now: Date;
    reinstated?: boolean;
  },
): Promise<SubaccountRow | null> {
  const [updated] = await tx
    .update(emailSubaccount)
    .set({
      reputationStatus: input.to,
      reputationTrigger: input.trigger,
      reputationChangedAt: input.now,
      revision: sql`${emailSubaccount.revision} + 1`,
      ...(input.reinstated ? { reinstatedAt: input.now } : {}),
      // A warned sub-account is checked again until it recovers; a paused one waits.
      nextEvaluationAt:
        input.to === "warning"
          ? new Date(input.now.getTime() + SUBACCOUNT_WARNING_RECHECK_MS)
          : null,
    })
    .where(
      and(
        eq(emailSubaccount.id, row.id),
        eq(emailSubaccount.organizationId, row.organizationId),
        eq(emailSubaccount.revision, row.revision),
      ),
    )
    .returning();
  if (!updated) return null;
  const type = eventType(row.reputationStatus, input.to, input.reinstated ?? false);
  const [env] = await tx
    .select({ mode: schema.environment.mode })
    .from(schema.environment)
    .where(eq(schema.environment.id, row.environmentId));
  if (type && env?.mode === "live") {
    // Message ids are global, like every webhook event's.
    const id = newId(ID_PREFIXES.webhookEvent);
    const payload: StoredSubaccountWebhookEvent = {
      id,
      object: "event",
      type,
      created_at: input.now.toISOString(),
      data: {
        subaccount_id: row.id,
        uid: row.uid,
        status: input.to,
        previous_status: row.reputationStatus,
        trigger: input.trigger,
        occurred_at: input.now.toISOString(),
        checks: input.checks.map(toCheckObject),
      },
    };
    await enqueueWebhookMessage(tx, {
      id,
      organizationId: row.organizationId,
      environmentId: row.environmentId,
      type,
      payload,
    });
  }
  return updated;
}

/**
 * Runs the sub-account's checks, stores them and applies what they decide. The window starts
 * `windowDays` ago (the organization's policy), never before its last reinstatement.
 */
export async function evaluateSubaccount(
  row: SubaccountRow,
  opts: { now?: Date } = {},
): Promise<SubaccountReputationStatus> {
  const now = opts.now ?? new Date();
  const policy = policyOf(await getReputationStanding(row.organizationId));
  const windowStart = new Date(
    Math.max(now.getTime() - policy.windowDays * DAY, row.reinstatedAt?.getTime() ?? 0),
  );
  const checks = await subaccountChecks(row, { now, windowStart, policy });
  const metrics = {
    windowStart: windowStart.toISOString(),
    windowEnd: now.toISOString(),
    checks,
  };
  const decision = decideSubaccount(row.reputationStatus, checks);
  // Unhealthy rates below the minimum volume decide nothing yet, but more sending can carry them
  // over it without a new bounce or complaint to mark the sub-account due: re-check them too.
  const belowMinimumUnhealthy = checks.some(
    (check) =>
      check.minimumVolume !== null &&
      check.volume < check.minimumVolume &&
      check.rate !== null &&
      check.warningThreshold !== null &&
      check.rate >= check.warningThreshold,
  );
  return db.transaction(async (tx) => {
    const [latest] = await tx
      .select()
      .from(emailSubaccount)
      .where(
        and(eq(emailSubaccount.id, row.id), eq(emailSubaccount.organizationId, row.organizationId)),
      )
      .for("update");
    if (!latest) return row.reputationStatus;
    // A claim that outlived its lease was taken over: the newer worker decides.
    if (
      row.evaluationLeaseUntil &&
      latest.evaluationLeaseUntil?.getTime() !== row.evaluationLeaseUntil.getTime()
    ) {
      return latest.reputationStatus;
    }
    // The claim consumed its due marker: one set since is newer evidence, and stays.
    const pending = latest.nextEvaluationAt;
    if (latest.revision !== row.revision) {
      // Reinstated or paused meanwhile: decide again on what it is now.
      await tx
        .update(emailSubaccount)
        .set({ evaluationLeaseUntil: null, nextEvaluationAt: pending ?? now })
        .where(eq(emailSubaccount.id, row.id));
      return latest.reputationStatus;
    }
    const moved = decision
      ? await applySubaccountTransition(tx, latest, { ...decision, checks, now })
      : null;
    const status = moved?.reputationStatus ?? latest.reputationStatus;
    const scheduledAt =
      status === "warning" || (status === "good" && belowMinimumUnhealthy)
        ? new Date(now.getTime() + SUBACCOUNT_WARNING_RECHECK_MS)
        : null;
    await tx
      .update(emailSubaccount)
      .set({
        metrics,
        evaluationLeaseUntil: null,
        nextEvaluationAt:
          pending && (!scheduledAt || pending < scheduledAt) ? pending : scheduledAt,
      })
      .where(eq(emailSubaccount.id, row.id));
    return status;
  });
}

/**
 * The worker's scan (system-level): evaluates sub-accounts that are due (a new live bounce or
 * complaint, a warning to re-check), oldest first, each under an expiring lease. `scope` limits
 * it to some organizations (tests). Returns how many were evaluated.
 */
export async function runDueSubaccountEvaluations(
  opts: { now?: Date; limit?: number; scope?: { organizationIds: string[] } } = {},
): Promise<number> {
  const now = opts.now ?? new Date();
  const claimable = and(
    sql`${emailSubaccount.status} <> 'deleting'`,
    or(
      and(isNull(emailSubaccount.evaluationLeaseUntil), lte(emailSubaccount.nextEvaluationAt, now)),
      lte(emailSubaccount.evaluationLeaseUntil, now),
    ),
    opts.scope ? inArray(emailSubaccount.organizationId, opts.scope.organizationIds) : undefined,
  );
  const due = await db
    .select({ id: emailSubaccount.id })
    .from(emailSubaccount)
    .where(claimable)
    .orderBy(asc(emailSubaccount.nextEvaluationAt))
    .limit(opts.limit ?? 50);
  let evaluated = 0;
  for (const candidate of due) {
    const [leased] = await db
      .update(emailSubaccount)
      .set({
        nextEvaluationAt: null,
        evaluationLeaseUntil: new Date(now.getTime() + SUBACCOUNT_EVALUATION_LEASE_MS),
      })
      .where(and(claimable, eq(emailSubaccount.id, candidate.id)))
      .returning();
    if (!leased) continue;
    try {
      await evaluateSubaccount(leased, { now });
      evaluated++;
    } catch (error) {
      console.error(`[subaccounts] evaluating ${leased.id} failed:`, error);
    }
  }
  return evaluated;
}

/**
 * Pauses a sub-account at once (content screening blocked one of its emails), in `tx`. A paused
 * sub-account stays paused.
 */
export async function pauseSubaccount(
  tx: Executor,
  input: { organizationId: string; subaccountId: string; trigger: string; now?: Date },
): Promise<void> {
  const [row] = await tx
    .select()
    .from(emailSubaccount)
    .where(
      and(
        eq(emailSubaccount.id, input.subaccountId),
        eq(emailSubaccount.organizationId, input.organizationId),
      ),
    )
    .for("update");
  if (!row || row.reputationStatus === "paused" || row.status === "deleting") return;
  await applySubaccountTransition(tx, row, {
    to: "paused",
    trigger: input.trigger,
    checks: [],
    now: input.now ?? new Date(),
  });
}

/**
 * Lifts a pause (or a warning): rates are measured again from now on. Repeating it returns the
 * row as it is. `false` when there was nothing to lift.
 */
export async function reinstateSubaccount(input: {
  organizationId: string;
  id: string;
  now?: Date;
}): Promise<{ row: SubaccountRow; changed: boolean }> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(emailSubaccount)
      .where(
        and(
          eq(emailSubaccount.id, input.id),
          eq(emailSubaccount.organizationId, input.organizationId),
        ),
      )
      .for("update");
    if (!row) throw new Error(`Sub-account ${input.id} not found.`);
    if (row.reputationStatus === "good") return { row, changed: false };
    const moved = await applySubaccountTransition(tx, row, {
      to: "good",
      trigger: "reinstated",
      checks: [],
      now,
      reinstated: true,
    });
    if (moved) {
      await tx
        .delete(schema.emailSenderDomainBlock)
        .where(
          and(
            eq(schema.emailSenderDomainBlock.organizationId, input.organizationId),
            eq(schema.emailSenderDomainBlock.groupId, input.id),
          ),
        );
    }
    return { row: moved ?? row, changed: Boolean(moved) };
  });
}
