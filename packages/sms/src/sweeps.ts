/**
 * Recovery of messages whose dispatch was lost or interrupted (worker). System-level: the scans
 * span organizations, and every write is scoped by the message's own organization.
 */
import { db, schema } from "@coss/db";
import { and, asc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { SmsDispatchQueue } from "./dispatch.ts";
import { COSS_SMS_EVENT_SOURCE, recordSmsEvent } from "./events.ts";

const { smsMessage } = schema;

/** A claimed message still `queued` after this long was interrupted mid-send. */
export const STALE_SMS_CLAIM_MS = 15 * 60 * 1000;
/** An unclaimed message still `queued` after this long may have lost its dispatch job. */
export const UNCLAIMED_SMS_REQUEUE_MS = 10 * 60 * 1000;
/** An unclaimed message still `queued` after this long is failed: sending it now would be too late. */
export const UNCLAIMED_SMS_FAIL_MS = 60 * 60 * 1000;

type Scope = { organizationIds: string[] };

/** When a queued message became due: when it was created, or a held scheduled one's time. */
const DUE_AT = sql`greatest(${smsMessage.createdAt}, coalesce(${smsMessage.scheduledAt}, ${smsMessage.createdAt}))`;

function unclaimedBefore(before: Date, limit: number, scope: Scope | undefined, since?: Date) {
  return db
    .select({
      id: smsMessage.id,
      organizationId: smsMessage.organizationId,
      errorCode: smsMessage.errorCode,
    })
    .from(smsMessage)
    .where(
      and(
        eq(smsMessage.status, "queued"),
        isNull(smsMessage.provider),
        sql`${DUE_AT} < ${before.toISOString()}::timestamptz`,
        since ? sql`${DUE_AT} >= ${since.toISOString()}::timestamptz` : undefined,
        scope ? inArray(smsMessage.organizationId, scope.organizationIds) : undefined,
      ),
    )
    .orderBy(asc(smsMessage.createdAt))
    .limit(limit);
}

/** System-level: unclaimed `queued` messages due before `olderThan`, for the worker's backlog check. */
export async function unclaimedSmsBacklog(opts: {
  olderThan: Date;
  scope?: Scope;
}): Promise<{ count: number; oldest: Date | null }> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      oldest: sql<string | null>`min(${DUE_AT})`,
    })
    .from(smsMessage)
    .where(
      and(
        eq(smsMessage.status, "queued"),
        isNull(smsMessage.provider),
        sql`${DUE_AT} < ${opts.olderThan.toISOString()}::timestamptz`,
        opts.scope ? inArray(smsMessage.organizationId, opts.scope.organizationIds) : undefined,
      ),
    );
  return { count: row?.count ?? 0, oldest: row?.oldest ? new Date(row.oldest) : null };
}

/**
 * Recovers messages no dispatcher claimed in time: older than `UNCLAIMED_SMS_FAIL_MS` they fail
 * (`dispatch_failed`, or `content_screening_unavailable` for one held by screening), older than
 * `UNCLAIMED_SMS_REQUEUE_MS` their dispatch is enqueued again (one job per message at most).
 */
export async function sweepUnclaimedSms(
  queue: SmsDispatchQueue,
  opts: { now?: Date; limit?: number; scope?: Scope },
): Promise<{ failed: number; requeued: number }> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 100;
  const failureThreshold = new Date(now.getTime() - UNCLAIMED_SMS_FAIL_MS);
  let failed = 0;
  for (const candidate of await unclaimedBefore(failureThreshold, limit, opts.scope)) {
    const failure =
      candidate.errorCode === "content_screening_unavailable"
        ? {
            code: candidate.errorCode,
            message:
              "The message was held because content screening was unavailable, and it gave up.",
          }
        : {
            code: "dispatch_failed",
            message: "The message could not be handed to the SMS provider in time.",
          };
    const done = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(smsMessage)
        .set({ status: "failed", errorCode: failure.code, errorMessage: failure.message })
        .where(
          and(
            eq(smsMessage.id, candidate.id),
            eq(smsMessage.organizationId, candidate.organizationId),
            eq(smsMessage.status, "queued"),
            isNull(smsMessage.provider),
          ),
        )
        .returning({ id: smsMessage.id });
      if (!updated) return false;
      await recordSmsEvent(tx, {
        provider: COSS_SMS_EVENT_SOURCE,
        providerStatus: "DispatchFailed",
        smsId: candidate.id,
        providerMessageId: null,
        type: "sms.failed",
        occurredAt: now,
        sourceId: failure.code,
        data: { failure },
      });
      return true;
    });
    if (done) failed++;
  }
  const unclaimed = await unclaimedBefore(
    new Date(now.getTime() - UNCLAIMED_SMS_REQUEUE_MS),
    limit,
    opts.scope,
    failureThreshold,
  );
  for (const candidate of unclaimed) {
    await db.transaction((tx) =>
      queue.enqueue(tx, { organizationId: candidate.organizationId, smsId: candidate.id }),
    );
  }
  return { failed, requeued: unclaimed.length };
}

/**
 * Resolves messages claimed by a dispatcher that never recorded the outcome (the process died
 * during the provider call): `failed` with `dispatch_interrupted`, which a late status callback
 * from the provider still repairs.
 */
export async function sweepStaleSmsClaims(opts: {
  now?: Date;
  limit?: number;
  scope?: Scope;
}): Promise<number> {
  const now = opts.now ?? new Date();
  // Checked again by the update: the claim may have been given back (a screening hold) or taken
  // afresh since it was selected.
  const staleClaim = and(
    eq(smsMessage.status, "queued"),
    isNotNull(smsMessage.provider),
    lt(smsMessage.updatedAt, new Date(now.getTime() - STALE_SMS_CLAIM_MS)),
  );
  const stale = await db
    .select({ id: smsMessage.id, organizationId: smsMessage.organizationId })
    .from(smsMessage)
    .where(
      and(
        staleClaim,
        opts.scope ? inArray(smsMessage.organizationId, opts.scope.organizationIds) : undefined,
      ),
    )
    .orderBy(asc(smsMessage.updatedAt))
    .limit(opts.limit ?? 100);
  let resolved = 0;
  const failure = {
    code: "dispatch_interrupted",
    message: "The send was interrupted before the SMS provider confirmed it.",
  };
  for (const candidate of stale) {
    const done = await db.transaction(async (tx) => {
      const [failed] = await tx
        .update(smsMessage)
        .set({ status: "failed", errorCode: failure.code, errorMessage: failure.message })
        .where(
          and(
            eq(smsMessage.id, candidate.id),
            eq(smsMessage.organizationId, candidate.organizationId),
            staleClaim,
          ),
        )
        .returning({ id: smsMessage.id });
      if (!failed) return false;
      await recordSmsEvent(tx, {
        provider: COSS_SMS_EVENT_SOURCE,
        providerStatus: "DispatchInterrupted",
        smsId: candidate.id,
        providerMessageId: null,
        type: "sms.failed",
        occurredAt: now,
        sourceId: failure.code,
        data: { failure },
      });
      return true;
    });
    if (done) resolved++;
  }
  return resolved;
}
