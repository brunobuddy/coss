/**
 * The only code that writes `scheduling_claim`. A claim is what stops double-booking: Postgres's
 * exclusion constraint decides, and everything else (slot lists, re-checks) only avoids asking it
 * questions it would refuse.
 */
import { type Executor, schema, type Transaction } from "@coss/db";
import { ID_PREFIXES, newId } from "@coss/db/id";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Interval } from "./engine/intervals.ts";
import { localDateOf, localWeekOf } from "./engine/time.ts";

const { schedulingClaim } = schema;

export type ClaimInput = {
  organizationId: string;
  environmentId: string;
  hostId: string;
  hostTimeZone: string;
  eventTypeId: string;
  owner: { bookingId: string } | { groupSessionId: string };
  occupied: Interval;
  startMs: number;
  /** How long it lasts unless converted; null: until released. */
  ttlSeconds: number | null;
};

/**
 * Claims a host's time, or returns null if someone holds it. Uses `DO NOTHING` so a lost claim
 * leaves the transaction usable. `live_until` comes from the same clock as `live_from`: passing an
 * expiry in would raise an error rather than a conflict when it's already past.
 */
export async function tryClaim(
  tx: Executor,
  input: ClaimInput,
): Promise<{ id: string; liveUntil: Date | null } | null> {
  const bookingId = "bookingId" in input.owner ? input.owner.bookingId : null;
  const groupSessionId = "groupSessionId" in input.owner ? input.owner.groupSessionId : null;
  const result = await tx.execute(sql`
    insert into scheduling_claim (
      id, organization_id, environment_id, host_id, event_type_id, booking_id, group_session_id,
      occupied_start, occupied_end, live_from, live_until, limit_day, limit_week
    )
    select
      ${newId(ID_PREFIXES.schedulingClaim)}, ${input.organizationId}, ${input.environmentId},
      ${input.hostId}, ${input.eventTypeId}, ${bookingId}, ${groupSessionId},
      ${new Date(input.occupied.startMs).toISOString()}::timestamptz,
      ${new Date(input.occupied.endMs).toISOString()}::timestamptz,
      t, t + (${input.ttlSeconds}::int * interval '1 second'),
      ${localDateOf(input.hostTimeZone, input.startMs)}::date,
      ${localWeekOf(input.hostTimeZone, input.startMs)}::date
    from clock_timestamp() t
    on conflict on constraint scheduling_claim_no_overlap do nothing
    returning id, live_until
  `);
  const row = result.rows[0] as { id: string; live_until: Date | string | null } | undefined;
  if (!row) return null;
  return { id: row.id, liveUntil: row.live_until ? new Date(row.live_until) : null };
}

/**
 * Makes a claim permanent, as of now. `live_from` moves too: an expired hold's old start would
 * otherwise overlap other holds that have come and gone since. Raises `23P01` if someone took the
 * time after this claim expired, which the caller runs in a savepoint to catch.
 */
export async function makeClaimPermanent(
  tx: Executor,
  where: { organizationId: string; bookingId?: string; groupSessionId?: string },
): Promise<number> {
  const rows = await tx
    .update(schedulingClaim)
    .set({ liveFrom: sql`clock_timestamp()`, liveUntil: null })
    .where(
      and(
        eq(schedulingClaim.organizationId, where.organizationId),
        where.bookingId ? eq(schedulingClaim.bookingId, where.bookingId) : undefined,
        where.groupSessionId ? eq(schedulingClaim.groupSessionId, where.groupSessionId) : undefined,
      ),
    )
    .returning({ id: schedulingClaim.id });
  return rows.length;
}

export async function releaseBookingClaims(
  tx: Executor,
  booking: { id: string; organizationId: string },
): Promise<void> {
  await tx
    .delete(schedulingClaim)
    .where(
      and(
        eq(schedulingClaim.bookingId, booking.id),
        eq(schedulingClaim.organizationId, booking.organizationId),
      ),
    );
}

/** One host's part of a booking or session, leaving the rest of its claims alone. */
export async function releaseHostClaim(
  tx: Executor,
  where: { organizationId: string; hostId: string } & (
    | { bookingId: string }
    | { groupSessionId: string }
  ),
): Promise<void> {
  await tx
    .delete(schedulingClaim)
    .where(
      and(
        eq(schedulingClaim.organizationId, where.organizationId),
        eq(schedulingClaim.hostId, where.hostId),
        "bookingId" in where
          ? eq(schedulingClaim.bookingId, where.bookingId)
          : eq(schedulingClaim.groupSessionId, where.groupSessionId),
      ),
    );
}

/**
 * Whole seconds left on a host's claim, from the same clock that made it, rounded down so a new
 * claim never outlasts the old. Null: no such claim. A firm claim has none to speak of: 0 means
 * nothing's left, which a firm booking never asks.
 */
export async function claimRemainingSeconds(
  tx: Executor,
  where: { organizationId: string; bookingId: string; hostId: string },
): Promise<number | null> {
  const [row] = await tx
    .select({
      seconds: sql<number>`floor(extract(epoch from ${schedulingClaim.liveUntil} - clock_timestamp()))::int`,
    })
    .from(schedulingClaim)
    .where(
      and(
        eq(schedulingClaim.organizationId, where.organizationId),
        eq(schedulingClaim.bookingId, where.bookingId),
        eq(schedulingClaim.hostId, where.hostId),
      ),
    );
  return row ? (row.seconds ?? null) : null;
}

/** As `claimRemainingSeconds` for a session's one claim, which can also be firm: `seconds` null. */
export async function sessionClaimRemainingSeconds(
  tx: Executor,
  where: { organizationId: string; groupSessionId: string },
): Promise<{ found: boolean; seconds: number | null }> {
  const [row] = await tx
    .select({
      seconds: sql<
        number | null
      >`floor(extract(epoch from ${schedulingClaim.liveUntil} - clock_timestamp()))::int`,
    })
    .from(schedulingClaim)
    .where(
      and(
        eq(schedulingClaim.organizationId, where.organizationId),
        eq(schedulingClaim.groupSessionId, where.groupSessionId),
      ),
    );
  return row ? { found: true, seconds: row.seconds } : { found: false, seconds: null };
}

type SessionClaim = { organizationId: string; groupSessionId: string };

const ofSession = (where: SessionClaim) =>
  and(
    eq(schedulingClaim.groupSessionId, where.groupSessionId),
    eq(schedulingClaim.organizationId, where.organizationId),
  );

export async function releaseSessionClaim(tx: Executor, where: SessionClaim): Promise<void> {
  await tx.delete(schedulingClaim).where(ofSession(where));
}

/** Lasts at least `ttlSeconds` more; a firm claim stays firm. Expired: as `makeClaimPermanent`. */
export async function extendSessionClaim(
  tx: Executor,
  where: SessionClaim,
  ttlSeconds: number,
): Promise<Date | null> {
  const [row] = await tx
    .update(schedulingClaim)
    .set({
      liveFrom: sql`case when ${schedulingClaim.liveUntil} <= clock_timestamp() then clock_timestamp() else ${schedulingClaim.liveFrom} end`,
      liveUntil: sql`greatest(${schedulingClaim.liveUntil}, clock_timestamp() + (${ttlSeconds}::int * interval '1 second'))`,
    })
    .where(and(ofSession(where), isNotNull(schedulingClaim.liveUntil)))
    .returning({ liveUntil: schedulingClaim.liveUntil });
  return row?.liveUntil ?? null;
}

/** Ends a session's claim by `until` at the latest, when its seats no longer need it longer. */
export async function limitSessionClaim(
  tx: Executor,
  where: SessionClaim,
  until: Date,
): Promise<void> {
  const iso = until.toISOString();
  await tx
    .update(schedulingClaim)
    .set({
      liveUntil: sql`least(coalesce(${schedulingClaim.liveUntil}, ${iso}::timestamptz), ${iso}::timestamptz)`,
    })
    .where(ofSession(where));
}

/** Drizzle's nested `transaction` never releases after a rollback, so retries nest and keep their locks. */
export async function inSavepoint<T>(
  tx: Transaction,
  run: (savepoint: Transaction) => Promise<T>,
): Promise<T> {
  await tx.execute(sql`savepoint scheduling_attempt`);
  try {
    const result = await run(tx);
    await tx.execute(sql`release savepoint scheduling_attempt`);
    return result;
  } catch (error) {
    await tx.execute(sql`rollback to savepoint scheduling_attempt`);
    await tx.execute(sql`release savepoint scheduling_attempt`);
    throw error;
  }
}

export function isExclusionViolation(error: unknown): boolean {
  return codeOf(error) === "23P01";
}

export function isDeadlock(error: unknown): boolean {
  return codeOf(error) === "40P01";
}

function codeOf(error: unknown): string | undefined {
  const direct = (error as { code?: string }).code;
  if (typeof direct === "string") return direct;
  return (error as { cause?: { code?: string } }).cause?.code;
}
