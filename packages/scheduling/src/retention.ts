/**
 * What's kept, and for how long (`@coss/retention`): attendee details and answers go 90 days after
 * a booking ends, the rest of the booking at 13 months. System-level, run by the worker, each step
 * a bounded batch with the condition re-checked.
 */
import { db, schema } from "@coss/db";
import { RETENTION_DAYS } from "@coss/retention";
import { and, asc, eq, inArray, isNotNull, isNull, lt, or, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { emailLookup } from "./attendees.ts";
import { rewriteDetailedEvents } from "./calendar/details.ts";
import type { SchedulingDeps, SchedulingEnvironment } from "./types.ts";

const {
  schedulingAttendee,
  schedulingBooking,
  schedulingBookingEvent,
  schedulingClaim,
  schedulingGroupSession,
  schedulingLimitBucket,
  schedulingOauthState,
  schedulingOutOfOffice,
  schedulingReassignment,
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
      .select({ id: schedulingBooking.id, organizationId: schedulingBooking.organizationId })
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
      .orderBy(asc(schedulingBooking.id))
      .for("update");
    if (locked.length === 0) return 0;
    const ids = locked.map((row) => row.id);
    await tx
      .update(schedulingAttendee)
      .set({ ...REDACTED, redactedAt: now })
      .where(inArray(schedulingAttendee.bookingId, ids));
    const organizationIds = [...new Set(locked.map((row) => row.organizationId))];
    for (const organizationId of organizationIds) {
      await rewriteDetailedEvents(
        tx,
        { organizationId },
        locked.filter((row) => row.organizationId === organizationId).map((row) => row.id),
        now,
      );
    }
    await tx
      .update(schedulingBooking)
      .set({
        metadata: {},
        location: null,
        encryptedAttributes: null,
        encryptedCancellationReason: null,
        redactedAt: now,
      })
      .where(inArray(schedulingBooking.id, ids));
    await tx
      .update(schedulingBookingEvent)
      .set({ encryptedNote: null })
      .where(
        and(
          inArray(schedulingBookingEvent.bookingId, ids),
          isNotNull(schedulingBookingEvent.encryptedNote),
        ),
      );
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

/** What someone wrote about their time off goes well before the fact that they had it. */
export async function redactExpiredOutOfOffice(opts: PurgeOptions = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - RETENTION_DAYS.schedulingOutOfOfficeNotes * DAY_MS);
  const where = and(
    lt(schedulingOutOfOffice.endAt, cutoff),
    or(
      isNotNull(schedulingOutOfOffice.encryptedNotes),
      isNotNull(schedulingOutOfOffice.publicMessage),
    ),
    scoped(schedulingOutOfOffice.organizationId, opts),
  );
  const due = db
    .select({ id: schedulingOutOfOffice.id })
    .from(schedulingOutOfOffice)
    .where(where)
    .limit(opts.limit ?? 1000);
  const redacted = await db
    .update(schedulingOutOfOffice)
    .set({ encryptedNotes: null, publicMessage: null })
    .where(and(inArray(schedulingOutOfOffice.id, due), where))
    .returning({ id: schedulingOutOfOffice.id });
  return redacted.length;
}

// Long enough for a deleted entry's calendar event to have gone, which its row's ledger row does.
const DELETED_OUT_OF_OFFICE_DAYS = 30;

/** Past the policy's whole period, or deleted a while ago. Holidays' stay as their tombstones. */
export async function purgeExpiredOutOfOffice(opts: PurgeOptions = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - RETENTION_DAYS.schedulingOutOfOffice * DAY_MS);
  const deletedCutoff = new Date(now.getTime() - DELETED_OUT_OF_OFFICE_DAYS * DAY_MS);
  const where = and(
    or(
      lt(schedulingOutOfOffice.endAt, cutoff),
      and(
        lt(schedulingOutOfOffice.deletedAt, deletedCutoff),
        sql`${schedulingOutOfOffice.source} <> 'holiday'`,
      ),
    ),
    scoped(schedulingOutOfOffice.organizationId, opts),
  );
  const due = db
    .select({ id: schedulingOutOfOffice.id })
    .from(schedulingOutOfOffice)
    .where(where)
    .limit(opts.limit ?? 1000);
  const deleted = await db
    .delete(schedulingOutOfOffice)
    .where(and(inArray(schedulingOutOfOffice.id, due), where))
    .returning({ id: schedulingOutOfOffice.id });
  return deleted.length;
}

/** A run's report goes when its bookings' rows do. Its note went when it finished. */
export async function purgeExpiredReassignments(opts: PurgeOptions = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - RETENTION_DAYS.schedulingBookings * DAY_MS);
  const where = and(
    lt(schedulingReassignment.createdAt, cutoff),
    or(
      eq(schedulingReassignment.status, "completed"),
      eq(schedulingReassignment.status, "cancelled"),
    ),
    scoped(schedulingReassignment.organizationId, opts),
  );
  const due = db
    .select({ id: schedulingReassignment.id })
    .from(schedulingReassignment)
    .where(where)
    .limit(opts.limit ?? 1000);
  const deleted = await db
    .delete(schedulingReassignment)
    .where(and(inArray(schedulingReassignment.id, due), where))
    .returning({ id: schedulingReassignment.id });
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

type Scope = Pick<SchedulingEnvironment, "organizationId" | "environmentId">;

async function eraseMatching(
  scope: Scope,
  matching: SQL,
  fixedSessions: { uid?: string; emailHmac?: string },
): Promise<number> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const where = and(
      eq(schedulingAttendee.organizationId, scope.organizationId),
      eq(schedulingAttendee.environmentId, scope.environmentId),
      matching,
    );
    // Bookings first, as redacting and cancelling do, or erasing the same booking would deadlock.
    const affected = await tx
      .select({ bookingId: schedulingAttendee.bookingId })
      .from(schedulingAttendee)
      .where(where);
    if (affected.length > 0) {
      await tx
        .select({ id: schedulingBooking.id })
        .from(schedulingBooking)
        .where(
          and(
            inArray(schedulingBooking.id, [...new Set(affected.map((row) => row.bookingId))]),
            eq(schedulingBooking.organizationId, scope.organizationId),
          ),
        )
        .orderBy(asc(schedulingBooking.id))
        .for("update");
    }
    // Before they're gone: redacting takes the uid, which is how sessions name this person.
    const matched = await tx
      .select({ uid: schedulingAttendee.uid })
      .from(schedulingAttendee)
      .where(where)
      .for("update");
    const erased = await tx
      .update(schedulingAttendee)
      .set({ ...REDACTED, redactedAt: now })
      .where(where)
      .returning({ bookingId: schedulingAttendee.bookingId });
    const bookingIds = [...new Set(erased.map((row) => row.bookingId))];
    await rewriteDetailedEvents(tx, scope, bookingIds, now);
    // What they were routed with can say what they needed, as their answers can, and whoever wrote
    // a cancellation's reason may have said anything about this person.
    if (bookingIds.length > 0) {
      await tx
        .update(schedulingBooking)
        .set({ encryptedAttributes: null, encryptedCancellationReason: null })
        .where(
          and(
            eq(schedulingBooking.organizationId, scope.organizationId),
            eq(schedulingBooking.environmentId, scope.environmentId),
            inArray(schedulingBooking.id, bookingIds),
          ),
        );
      // Written about them, whoever wrote it.
      await tx
        .update(schedulingBookingEvent)
        .set({ encryptedNote: null })
        .where(
          and(
            eq(schedulingBookingEvent.organizationId, scope.organizationId),
            inArray(schedulingBookingEvent.bookingId, bookingIds),
            isNotNull(schedulingBookingEvent.encryptedNote),
          ),
        );
    }
    const uids = new Set(matched.flatMap((row) => (row.uid ? [row.uid] : [])));
    if (fixedSessions.uid) uids.add(fixedSessions.uid);
    const sessionMatches = [
      ...(uids.size > 0 ? [inArray(schedulingSession.attendeeUid, [...uids])] : []),
      ...(fixedSessions.emailHmac
        ? [eq(schedulingSession.attendeeEmailHmac, fixedSessions.emailHmac)]
        : []),
    ];
    if (sessionMatches.length > 0) {
      await tx
        .update(schedulingSession)
        .set({
          encryptedAttendee: null,
          encryptedAttributes: null,
          attendeeUid: null,
          attendeeEmailHmac: null,
          revokedAt: sql`coalesce(${schedulingSession.revokedAt}, ${now.toISOString()}::timestamptz)`,
        })
        .where(
          and(
            eq(schedulingSession.organizationId, scope.organizationId),
            eq(schedulingSession.environmentId, scope.environmentId),
            or(...sessionMatches),
          ),
        );
    }
    return erased.length;
  });
}

/**
 * An attendee's right to be forgotten: their details go from every booking now, and from hosts'
 * calendars as the worker gets to them, and any booker session fixed to them ends, since without
 * its identity it would let the browser book as anyone.
 */
export async function eraseAttendee(scope: Scope, input: { uid: string }): Promise<number> {
  return eraseMatching(scope, eq(schedulingAttendee.uid, input.uid), { uid: input.uid });
}

/** The same for someone known only by their address, which is all there is of a guest. */
export async function eraseAttendeeByEmail(
  scope: Scope,
  input: { email: string },
  keys: Pick<SchedulingDeps, "lookupKey">,
): Promise<number> {
  const emailHmac = emailLookup(input.email, keys);
  return eraseMatching(scope, eq(schedulingAttendee.emailHmac, emailHmac), { emailHmac });
}
