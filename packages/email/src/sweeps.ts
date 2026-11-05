/**
 * Recovery of emails whose dispatch was lost or interrupted (worker). System-level: the scans
 * span organizations, and every write is scoped by the email's own organization.
 */
import { db, schema } from "@coss/db";
import { and, asc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { purgeSendContent } from "./attachments.ts";
import type { EmailDispatchQueue } from "./dispatch.ts";
import { COSS_EVENT_SOURCE, recordProviderEvent } from "./events.ts";
import { recordEmailUsage } from "./usage.ts";

const { email, emailEvent, environment } = schema;

/** A claimed email still `queued` after this long was interrupted mid-send. */
export const STALE_CLAIM_MS = 15 * 60 * 1000;

/** An unclaimed email still `queued` after this long may have lost its dispatch job. */
export const UNCLAIMED_REQUEUE_MS = 10 * 60 * 1000;

/** An unclaimed email still `queued` after this long is failed: sending it now would be too late. */
export const UNCLAIMED_FAIL_MS = 60 * 60 * 1000;

type Scope = { organizationIds: string[] };

/**
 * When a queued email became due: when it was created, or for a scheduled send held after its
 * screening failed, when it was scheduled for.
 */
const DUE_AT = sql`greatest(${email.createdAt}, coalesce(${email.scheduledAt}, ${email.createdAt}))`;

/** Unclaimed `queued` emails due before `before`, optionally since `since`, oldest first. */
function unclaimedBefore(before: Date, limit: number, scope: Scope | undefined, since?: Date) {
  return db
    .select({
      id: email.id,
      organizationId: email.organizationId,
      stream: email.stream,
      errorCode: email.errorCode,
    })
    .from(email)
    .where(
      and(
        eq(email.status, "queued"),
        isNull(email.provider),
        sql`${DUE_AT} < ${before.toISOString()}::timestamptz`,
        since ? sql`${DUE_AT} >= ${since.toISOString()}::timestamptz` : undefined,
        scope ? inArray(email.organizationId, scope.organizationIds) : undefined,
      ),
    )
    .orderBy(asc(email.createdAt))
    .limit(limit);
}

/**
 * System-level: unclaimed `queued` emails due before `olderThan`. Nothing fails a health check when
 * dispatch stalls, and these fail after `UNCLAIMED_FAIL_MS`, so the worker reports them first.
 */
export async function unclaimedEmailBacklog(opts: {
  olderThan: Date;
  scope?: Scope;
}): Promise<{ count: number; oldest: Date | null }> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      oldest: sql<string | null>`min(${DUE_AT})`,
    })
    .from(email)
    .where(
      and(
        eq(email.status, "queued"),
        isNull(email.provider),
        sql`${DUE_AT} < ${opts.olderThan.toISOString()}::timestamptz`,
        opts.scope ? inArray(email.organizationId, opts.scope.organizationIds) : undefined,
      ),
    );
  return { count: row?.count ?? 0, oldest: row?.oldest ? new Date(row.oldest) : null };
}

/** Why an email that was never handed over in time failed. */
function dispatchFailure(errorCode: string | null) {
  return errorCode === "content_screening_unavailable"
    ? {
        code: errorCode,
        message: "The email was held because content screening was unavailable, and it gave up.",
      }
    : {
        code: "dispatch_failed",
        message: "The email could not be handed to the email provider in time.",
      };
}

/**
 * Recovers emails no dispatcher claimed in time (their job exhausted its retries, or the email
 * predates async dispatch). Older than `UNCLAIMED_FAIL_MS`, an email is `failed` with
 * `dispatch_failed` and an `email.failed` event (and webhook); this also keeps emails that can
 * never be dispatched from filling every batch. Older than `UNCLAIMED_REQUEUE_MS`, its dispatch
 * is enqueued again: an email still waiting behind a backlog keeps its one queued job (the queue
 * allows one per email), and an extra job for an email being dispatched right now finds it
 * claimed and does nothing. A dispatcher that claims an email first always wins over the failing
 * update. `scope` limits the scans to some organizations (tests).
 */
export async function sweepUnclaimedEmails(
  queue: EmailDispatchQueue,
  opts: { now?: Date; limit?: number; scope?: Scope },
): Promise<{ failed: number; requeued: number }> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 100;
  const failureThreshold = new Date(now.getTime() - UNCLAIMED_FAIL_MS);

  let failed = 0;
  const expired = await unclaimedBefore(failureThreshold, limit, opts.scope);
  for (const candidate of expired) {
    const failure = dispatchFailure(candidate.errorCode);
    const done = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(email)
        .set({ status: "failed", errorCode: failure.code, errorMessage: failure.message })
        .where(
          and(
            eq(email.id, candidate.id),
            eq(email.organizationId, candidate.organizationId),
            eq(email.status, "queued"),
            isNull(email.provider),
          ),
        )
        .returning({ id: email.id });
      if (!updated) return false;
      await purgeSendContent(tx, candidate);
      await recordProviderEvent(tx, {
        provider: COSS_EVENT_SOURCE,
        providerEventType: "DispatchFailed",
        emailId: candidate.id,
        providerMessageId: null,
        type: "email.failed",
        recipients: null,
        occurredAt: now,
        sourceId: failure.code,
        data: { failure },
      });
      return true;
    });
    if (done) failed++;
  }

  const unclaimed = await unclaimedBefore(
    new Date(now.getTime() - UNCLAIMED_REQUEUE_MS),
    limit,
    opts.scope,
    failureThreshold,
  );
  for (const candidate of unclaimed) {
    await db.transaction((tx) =>
      queue.enqueue(tx, {
        organizationId: candidate.organizationId,
        emailId: candidate.id,
        stream: candidate.stream,
      }),
    );
  }
  return { failed, requeued: unclaimed.length };
}

/**
 * Resolves emails claimed by a dispatcher that never recorded the outcome (e.g. the process died
 * during the provider call). If the provider reported the email as sent, it is `sent`; otherwise
 * it is `failed` with `dispatch_interrupted`, which a late `Send` event still repairs. Returns how
 * many emails were resolved. `scope` limits the scan to some organizations (tests).
 */
export async function sweepStaleClaims(opts: {
  now?: Date;
  limit?: number;
  scope?: { organizationIds: string[] };
}): Promise<number> {
  const now = opts.now ?? new Date();
  const stale = await db
    .select({ id: email.id, organizationId: email.organizationId, mode: environment.mode })
    .from(email)
    .innerJoin(
      environment,
      and(
        eq(environment.id, email.environmentId),
        eq(environment.organizationId, email.organizationId),
      ),
    )
    .where(
      and(
        eq(email.status, "queued"),
        isNotNull(email.provider),
        lt(email.updatedAt, new Date(now.getTime() - STALE_CLAIM_MS)),
        opts.scope ? inArray(email.organizationId, opts.scope.organizationIds) : undefined,
      ),
    )
    .orderBy(asc(email.updatedAt))
    .limit(opts.limit ?? 100);

  let resolved = 0;
  for (const candidate of stale) {
    const done = await db.transaction(async (tx) => {
      const thisEmail = and(
        eq(email.id, candidate.id),
        eq(email.organizationId, candidate.organizationId),
        eq(email.status, "queued"),
      );
      const [sent] = await tx
        .select({ occurredAt: emailEvent.occurredAt })
        .from(emailEvent)
        .where(
          and(
            eq(emailEvent.organizationId, candidate.organizationId),
            eq(emailEvent.emailId, candidate.id),
            eq(emailEvent.type, "email.sent"),
          ),
        )
        .limit(1);
      if (sent) {
        const [updated] = await tx
          .update(email)
          .set({ status: "sent", sentAt: sent.occurredAt })
          .where(thisEmail)
          .returning({ id: email.id });
        if (updated) {
          await purgeSendContent(tx, candidate);
          if (candidate.mode === "live") await recordEmailUsage(tx, candidate);
        }
        return Boolean(updated);
      }
      const [failed] = await tx
        .update(email)
        .set({
          status: "failed",
          errorCode: "dispatch_interrupted",
          errorMessage: "The send was interrupted before the provider confirmed it.",
        })
        .where(thisEmail)
        .returning({ id: email.id });
      if (!failed) return false;
      await purgeSendContent(tx, candidate);
      await recordProviderEvent(tx, {
        provider: COSS_EVENT_SOURCE,
        providerEventType: "DispatchInterrupted",
        emailId: candidate.id,
        providerMessageId: null,
        type: "email.failed",
        recipients: null,
        occurredAt: now,
        sourceId: "dispatch_interrupted",
        data: {
          failure: {
            code: "dispatch_interrupted",
            message: "The send was interrupted before the email provider confirmed it.",
          },
        },
      });
      return true;
    });
    if (done) resolved++;
  }
  return resolved;
}
