/**
 * What's kept, and for how long (`@coss/retention`): attendee details and answers go 90 days after
 * a booking ends, the rest of the booking at 13 months. System-level, run by the worker, each step
 * a bounded batch with the condition re-checked.
 */
import { db, schema } from "@coss/db";
import { RETENTION_DAYS } from "@coss/retention";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
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
  if (due.length === 0) return 0;
  await db.transaction(async (tx) => {
    const ids = due.map((row) => row.id);
    await tx
      .update(schedulingAttendee)
      .set({ ...REDACTED, redactedAt: now })
      .where(inArray(schedulingAttendee.bookingId, ids));
    await tx
      .update(schedulingBooking)
      .set({ metadata: {}, location: null, redactedAt: now })
      .where(and(inArray(schedulingBooking.id, ids), lt(schedulingBooking.endAt, cutoff)));
  });
  return due.length;
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
export async function purgeSchedulingLeftovers(opts: PurgeOptions = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const limit = opts.limit ?? 1000;
  const scopeOf = (column: AnyPgColumn) =>
    opts.scope ? inArray(column, [...opts.scope.organizationIds]) : undefined;
  await db.delete(schedulingSession).where(
    inArray(
      schedulingSession.id,
      db
        .select({ id: schedulingSession.id })
        .from(schedulingSession)
        .where(
          and(lt(schedulingSession.expiresAt, dayAgo), scopeOf(schedulingSession.organizationId)),
        )
        .limit(limit),
    ),
  );
  await db.delete(schedulingOauthState).where(
    inArray(
      schedulingOauthState.id,
      db
        .select({ id: schedulingOauthState.id })
        .from(schedulingOauthState)
        .where(
          and(
            lt(schedulingOauthState.expiresAt, now),
            scopeOf(schedulingOauthState.organizationId),
          ),
        )
        .limit(limit),
    ),
  );
  await db
    .delete(schedulingLimitBucket)
    .where(
      and(
        lt(schedulingLimitBucket.createdAt, new Date(now.getTime() - 60 * DAY_MS)),
        scopeOf(schedulingLimitBucket.organizationId),
      ),
    );
  await db
    .delete(schedulingClaim)
    .where(
      and(
        scopeOf(schedulingClaim.organizationId),
        lt(schedulingClaim.occupiedEnd, new Date(now.getTime() - 14 * DAY_MS)),
      ),
    );
  await db
    .delete(schedulingClaim)
    .where(and(scopeOf(schedulingClaim.organizationId), lt(schedulingClaim.liveUntil, dayAgo)));
  await db
    .delete(schedulingGroupSession)
    .where(
      and(
        scopeOf(schedulingGroupSession.organizationId),
        lt(
          schedulingGroupSession.endAt,
          new Date(now.getTime() - RETENTION_DAYS.schedulingBookings * DAY_MS),
        ),
      ),
    );
  await db
    .delete(schedulingSeries)
    .where(
      and(
        scopeOf(schedulingSeries.organizationId),
        lt(
          schedulingSeries.createdAt,
          new Date(now.getTime() - RETENTION_DAYS.schedulingBookings * DAY_MS),
        ),
        sql`not exists (select 1 from scheduling_booking b where b.series_id = ${schedulingSeries.id})`,
      ),
    );
  return 0;
}

/** An attendee's right to be forgotten: their details go from every booking now. */
export async function eraseAttendee(
  scope: Pick<SchedulingEnvironment, "organizationId" | "environmentId">,
  input: { uid: string },
): Promise<number> {
  const erased = await db
    .update(schedulingAttendee)
    .set({ ...REDACTED, redactedAt: new Date() })
    .where(
      and(
        eq(schedulingAttendee.organizationId, scope.organizationId),
        eq(schedulingAttendee.environmentId, scope.environmentId),
        eq(schedulingAttendee.uid, input.uid),
      ),
    )
    .returning({ id: schedulingAttendee.id });
  return erased.length;
}
