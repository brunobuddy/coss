/**
 * What's kept, and for how long (`@coss/retention`): attendee details and answers go 90 days after
 * a booking ends, the rest of the booking at 13 months. System-level, run by the worker, each step
 * a bounded batch with the condition re-checked.
 */
import { db, schema } from "@coss/db";
import { RETENTION_DAYS } from "@coss/retention";
import { and, eq, inArray, isNotNull, isNull, lt, or, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import type { SchedulingEnvironment } from "./types.ts";

const {
  schedulingAttendee,
  schedulingBooking,
  schedulingClaim,
  schedulingGroupSession,
  schedulingLimitBucket,
  schedulingOauthState,
  schedulingSeries,
  schedulingSession,
} = schema;

const DAY_MS = 86_400_000;

export type PurgeOptions = {
  now?: Date;
  limit?: number;
  scope?: { organizationIds: readonly string[] };
};

const REDACTED = {
  encryptedContact: null,
  emailHmac: null,
  encryptedAnswers: null,
  uid: null,
};

function scoped(column: AnyPgColumn, opts: PurgeOptions) {
  return opts.scope ? inArray(column, [...opts.scope.organizationIds]) : undefined;
}

/** Erases attendee details and booking metadata of bookings that ended long enough ago. */
export async function redactExpiredBookings(opts: PurgeOptions = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - RETENTION_DAYS.schedulingPersonalData * DAY_MS);
  const due = await db
    .select({ id: schedulingBooking.id, organizationId: schedulingBooking.organizationId })
    .from(schedulingBooking)
    .where(
      and(
        lt(schedulingBooking.endAt, cutoff),
        isNull(schedulingBooking.redactedAt),
        scoped(schedulingBooking.organizationId, opts),
      ),
    )
    .limit(opts.limit ?? 1000);
  const sessionsDue = db
    .select({ id: schedulingGroupSession.id })
    .from(schedulingGroupSession)
    .where(
      and(
        lt(schedulingGroupSession.endAt, cutoff),
        or(
          isNotNull(schedulingGroupSession.location),
          isNotNull(schedulingGroupSession.meetingUrl),
        ),
        scoped(schedulingGroupSession.organizationId, opts),
      ),
    )
    .limit(opts.limit ?? 1000);
  await db
    .update(schedulingGroupSession)
    .set({ location: null, meetingUrl: null })
    .where(inArray(schedulingGroupSession.id, sessionsDue));
  if (due.length === 0) return 0;
  return db.transaction(async (tx) => {
    // Under the lock: a booking moved into the future meanwhile keeps its attendees.
    const locked = await tx
      .select({ id: schedulingBooking.id })
      .from(schedulingBooking)
      .where(
        and(
          inArray(
            schedulingBooking.id,
            due.map((row) => row.id),
          ),
          lt(schedulingBooking.endAt, cutoff),
          isNull(schedulingBooking.redactedAt),
        ),
      )
      .for("update");
    if (locked.length === 0) return 0;
    const ids = locked.map((row) => row.id);
    await tx
      .update(schedulingAttendee)
      .set({ ...REDACTED, redactedAt: now })
      .where(inArray(schedulingAttendee.bookingId, ids));
    await tx
      .update(schedulingBooking)
      .set({ metadata: {}, location: null, redactedAt: now })
      .where(inArray(schedulingBooking.id, ids));
    return ids.length;
  });
}

/** Deletes what's left of bookings past the policy's whole period; cascades take their children. */
export async function purgeExpiredBookings(opts: PurgeOptions = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - RETENTION_DAYS.schedulingBookings * DAY_MS);
  const due = db
    .select({ id: schedulingBooking.id })
    .from(schedulingBooking)
    .where(and(lt(schedulingBooking.endAt, cutoff), scoped(schedulingBooking.organizationId, opts)))
    .limit(opts.limit ?? 1000);
  const deleted = await db
    .delete(schedulingBooking)
    .where(and(inArray(schedulingBooking.id, due), lt(schedulingBooking.endAt, cutoff)))
    .returning({ id: schedulingBooking.id });
  return deleted.length;
}

/** Sessions, consents in progress, emptied series and group sessions, and spent limit buckets. */
export async function purgeSchedulingLeftovers(opts: PurgeOptions = {}): Promise<number[]> {
  const now = opts.now ?? new Date();
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const limit = opts.limit ?? 1000;
  const bookingsCutoff = new Date(now.getTime() - RETENTION_DAYS.schedulingBookings * DAY_MS);
  const scopeOf = (column: AnyPgColumn) => scoped(column, opts);
  const batch = async <T extends PgTable & { id: AnyPgColumn }>(
    table: T,
    where: SQL | undefined,
  ) => {
    const oldest = db
      .select({ id: table.id })
      .from(table as PgTable)
      .where(where)
      .limit(limit);
    const gone = await db
      .delete(table)
      .where(and(inArray(table.id, oldest), where))
      .returning({ id: table.id });
    return gone.length;
  };
  const spentBuckets = db
    .select({
      scope: schedulingLimitBucket.scope,
      scopeId: schedulingLimitBucket.scopeId,
      period: schedulingLimitBucket.period,
    })
    .from(schedulingLimitBucket)
    .where(
      and(
        lt(schedulingLimitBucket.createdAt, new Date(now.getTime() - 60 * DAY_MS)),
        scopeOf(schedulingLimitBucket.organizationId),
      ),
    )
    .limit(limit);
  const buckets = await db
    .delete(schedulingLimitBucket)
    .where(
      sql`(${schedulingLimitBucket.scope}, ${schedulingLimitBucket.scopeId}, ${schedulingLimitBucket.period}) in ${spentBuckets}`,
    )
    .returning({ scope: schedulingLimitBucket.scope });
  return [
    await batch(
      schedulingSession,
      and(lt(schedulingSession.expiresAt, dayAgo), scopeOf(schedulingSession.organizationId)),
    ),
    await batch(
      schedulingOauthState,
      and(lt(schedulingOauthState.expiresAt, now), scopeOf(schedulingOauthState.organizationId)),
    ),
    buckets.length,
    await batch(
      schedulingClaim,
      and(
        lt(schedulingClaim.occupiedEnd, new Date(now.getTime() - 14 * DAY_MS)),
        scopeOf(schedulingClaim.organizationId),
      ),
    ),
    await batch(
      schedulingClaim,
      and(lt(schedulingClaim.liveUntil, dayAgo), scopeOf(schedulingClaim.organizationId)),
    ),
    await batch(
      schedulingGroupSession,
      and(
        lt(schedulingGroupSession.endAt, bookingsCutoff),
        scopeOf(schedulingGroupSession.organizationId),
      ),
    ),
    await batch(
      schedulingSeries,
      and(
        lt(schedulingSeries.createdAt, bookingsCutoff),
        scopeOf(schedulingSeries.organizationId),
        sql`not exists (select 1 from scheduling_booking b where b.series_id = ${schedulingSeries.id})`,
      ),
    ),
  ];
}

/**
 * An attendee's right to be forgotten: their details go from every booking now, and any booker
 * session fixed to them ends, since without its identity it would let the browser book as anyone.
 */
export async function eraseAttendee(
  scope: Pick<SchedulingEnvironment, "organizationId" | "environmentId">,
  input: { uid: string },
): Promise<number> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const erased = await tx
      .update(schedulingAttendee)
      .set({ ...REDACTED, redactedAt: now })
      .where(
        and(
          eq(schedulingAttendee.organizationId, scope.organizationId),
          eq(schedulingAttendee.environmentId, scope.environmentId),
          eq(schedulingAttendee.uid, input.uid),
        ),
      )
      .returning({ id: schedulingAttendee.id });
    await tx
      .update(schedulingSession)
      .set({
        encryptedAttendee: null,
        encryptedAttributes: null,
        attendeeUid: null,
        revokedAt: sql`coalesce(${schedulingSession.revokedAt}, ${now.toISOString()}::timestamptz)`,
      })
      .where(
        and(
          eq(schedulingSession.organizationId, scope.organizationId),
          eq(schedulingSession.environmentId, scope.environmentId),
          eq(schedulingSession.attendeeUid, input.uid),
        ),
      );
    return erased.length;
  });
}
