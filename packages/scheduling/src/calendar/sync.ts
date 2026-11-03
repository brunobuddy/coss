/**
 * Keeps each calendar's busy times current. A push only marks a calendar dirty; this loop does the
 * reading, under a lease, and replaces intervals fenced on when the fetch began, so a slow older
 * fetch can't overwrite a newer one. An errored calendar keeps what it had and isn't re-verified:
 * `calendarVerdict` then decides how long that's trusted.
 */
import { createHash, randomBytes } from "node:crypto";
import { db, schema } from "@coss/db";
import { ID_PREFIXES, newId } from "@coss/db/id";
import { appendLogEntries } from "@coss/logs";
import { enqueueWebhookMessage } from "@coss/webhooks";
import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { type Interval, normalizeIntervals, subtractIntervals } from "../engine/intervals.ts";
import { CalendarError } from "./client.ts";
import {
  type CalendarDeps,
  type CalendarRow,
  type ConnectionRow,
  clientFor,
  markNeedsReauth,
  pushWebhookUrl,
  SYNC_HORIZON_DAYS,
} from "./connections.ts";

const {
  schedulingBooking,
  schedulingBookingHost,
  schedulingBusyInterval,
  schedulingCalendar,
  schedulingCalendarConnection,
  schedulingCalendarEvent,
  schedulingClaim,
} = schema;

const DAY_MS = 86_400_000;
const LEASE_MS = 2 * 60_000;
const RECONCILE_MS = 6 * 60 * 60_000;
const POLL_MS = 5 * 60_000;
const MAX_BACKOFF_MS = 60 * 60_000;
// Google channels last up to a month, Graph's about three days: renew well before either.
const CHANNEL_TTL_SECONDS = 2 * 86_400;
const CHANNEL_RENEW_BEFORE_MS = 86_400_000;
const CHANNEL_CLAIM_MS = 5 * 60_000;

type Scan = { limit?: number; scope?: { organizationIds: readonly string[] } };

const nowOf = (deps: CalendarDeps) => deps.now?.() ?? new Date();

function backoffMs(failures: number): number {
  return Math.min(60_000 * 2 ** Math.min(failures, 8), MAX_BACKOFF_MS);
}

async function claimDueCalendars(now: Date, opts: Scan) {
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ calendar: schedulingCalendar, connection: schedulingCalendarConnection })
      .from(schedulingCalendar)
      .innerJoin(
        schedulingCalendarConnection,
        eq(schedulingCalendarConnection.id, schedulingCalendar.connectionId),
      )
      .where(
        and(
          eq(schedulingCalendar.readBusy, true),
          eq(schedulingCalendarConnection.status, "active"),
          sql`${schedulingCalendarConnection.provider} <> 'simulated'`,
          lte(schedulingCalendar.nextSyncAt, now),
          or(isNull(schedulingCalendar.leaseUntil), lt(schedulingCalendar.leaseUntil, now)),
          opts.scope
            ? inArray(schedulingCalendar.organizationId, [...opts.scope.organizationIds])
            : undefined,
        ),
      )
      .orderBy(asc(schedulingCalendar.nextSyncAt))
      .limit(opts.limit ?? 50)
      .for("update", { of: schedulingCalendar, skipLocked: true });
    if (due.length === 0) return [];
    await tx
      .update(schedulingCalendar)
      .set({ leaseUntil: new Date(now.getTime() + LEASE_MS), lastFetchStartedAt: now })
      .where(
        inArray(
          schedulingCalendar.id,
          due.map((row) => row.calendar.id),
        ),
      );
    return due;
  });
}

/** How soon to read a calendar again, with nothing telling us it changed. */
function nextReadAt(calendar: CalendarRow, now: Date): Date {
  return new Date(now.getTime() + (calendar.channelId ? RECONCILE_MS : POLL_MS));
}

async function replaceIntervals(
  calendar: CalendarRow,
  startedAt: Date,
  intervals: readonly Interval[],
  now: Date,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        lastFetchStartedAt: schedulingCalendar.lastFetchStartedAt,
        dirtyAt: schedulingCalendar.dirtyAt,
      })
      .from(schedulingCalendar)
      .where(eq(schedulingCalendar.id, calendar.id))
      .for("update");
    if (!current) return false;
    if (current.lastFetchStartedAt && current.lastFetchStartedAt > startedAt) return false;
    await tx
      .delete(schedulingBusyInterval)
      .where(eq(schedulingBusyInterval.calendarId, calendar.id));
    if (intervals.length > 0) {
      await tx.insert(schedulingBusyInterval).values(
        intervals.map((interval) => ({
          organizationId: calendar.organizationId,
          calendarId: calendar.id,
          hostId: calendar.hostId,
          startAt: new Date(interval.startMs),
          endAt: new Date(interval.endMs),
        })),
      );
    }
    // A push that arrived during the fetch isn't covered by it: read again straight away.
    const stillDirty = current.dirtyAt !== null && current.dirtyAt > startedAt;
    await tx
      .update(schedulingCalendar)
      .set({
        verifiedAt: startedAt,
        coveredUntil: new Date(startedAt.getTime() + SYNC_HORIZON_DAYS * DAY_MS),
        dirtyAt: stillDirty ? current.dirtyAt : null,
        nextSyncAt: stillDirty ? now : nextReadAt(calendar, now),
        leaseUntil: null,
        syncFailures: 0,
      })
      .where(eq(schedulingCalendar.id, calendar.id));
    return true;
  });
}

async function recordFailure(
  calendar: CalendarRow,
  now: Date,
  retryAfterMs?: number,
): Promise<void> {
  await db
    .update(schedulingCalendar)
    .set({
      syncFailures: sql`${schedulingCalendar.syncFailures} + 1`,
      nextSyncAt: new Date(now.getTime() + (retryAfterMs ?? backoffMs(calendar.syncFailures))),
      leaseUntil: null,
    })
    .where(eq(schedulingCalendar.id, calendar.id));
}

/**
 * An external event landed on a booked time. The world outside can't be refused, so this flags it
 * and tells the customer. It never cancels anything.
 */
export async function flagExternalConflicts(
  hostId: string,
  organizationId: string,
  now: Date,
): Promise<number> {
  const claims = await db
    .select({
      bookingId: schedulingClaim.bookingId,
      occupiedStart: schedulingClaim.occupiedStart,
      occupiedEnd: schedulingClaim.occupiedEnd,
    })
    .from(schedulingClaim)
    .innerJoin(schedulingBooking, eq(schedulingBooking.id, schedulingClaim.bookingId))
    .where(
      and(
        eq(schedulingClaim.hostId, hostId),
        eq(schedulingClaim.organizationId, organizationId),
        gt(schedulingClaim.occupiedEnd, now),
        isNull(schedulingBooking.externalConflictAt),
        eq(schedulingBooking.status, "confirmed"),
      ),
    );
  if (claims.length === 0) return 0;
  const busy = await db
    .select({ startAt: schedulingBusyInterval.startAt, endAt: schedulingBusyInterval.endAt })
    .from(schedulingBusyInterval)
    .where(
      and(
        eq(schedulingBusyInterval.hostId, hostId),
        eq(schedulingBusyInterval.organizationId, organizationId),
        gt(schedulingBusyInterval.endAt, now),
      ),
    );
  const own = await db
    .select({
      desiredStart: schedulingCalendarEvent.desiredStart,
      desiredEnd: schedulingCalendarEvent.desiredEnd,
      providerEventId: schedulingCalendarEvent.providerEventId,
      appliedVersion: schedulingCalendarEvent.appliedVersion,
      desiredVersion: schedulingCalendarEvent.desiredVersion,
    })
    .from(schedulingCalendarEvent)
    .where(
      and(
        eq(schedulingCalendarEvent.hostId, hostId),
        eq(schedulingCalendarEvent.organizationId, organizationId),
        eq(schedulingCalendarEvent.desiredState, "present"),
        gt(schedulingCalendarEvent.desiredEnd, now),
      ),
    );
  const written = own.filter(
    (row) => row.providerEventId && row.appliedVersion === row.desiredVersion,
  );
  // Not known to be on the calendar yet, or mid-write: only its exact time can be ours, since
  // anything else there is someone else's. A foreign event wholly inside a written one can't be
  // told apart: `freeBusy` carries no identity.
  const inFlight = new Set(
    own
      .filter((row) => !written.includes(row))
      .map((row) => `${row.desiredStart.getTime()}:${row.desiredEnd.getTime()}`),
  );
  const external = subtractIntervals(
    normalizeIntervals(
      busy.map((row) => ({ startMs: row.startAt.getTime(), endMs: row.endAt.getTime() })),
    ),
    normalizeIntervals(
      written.map((row) => ({
        startMs: row.desiredStart.getTime(),
        endMs: row.desiredEnd.getTime(),
      })),
    ),
  ).filter((interval) => !inFlight.has(`${interval.startMs}:${interval.endMs}`));
  let flagged = 0;
  for (const claim of claims) {
    if (!claim.bookingId) continue;
    const start = claim.occupiedStart.getTime();
    const end = claim.occupiedEnd.getTime();
    if (!external.some((interval) => interval.startMs < end && interval.endMs > start)) continue;
    await db.transaction(async (tx) => {
      const [booking] = await tx
        .update(schedulingBooking)
        .set({ externalConflictAt: now })
        .where(
          and(
            eq(schedulingBooking.id, claim.bookingId as string),
            eq(schedulingBooking.organizationId, organizationId),
            isNull(schedulingBooking.externalConflictAt),
          ),
        )
        .returning();
      if (!booking) return;
      flagged++;
      const hosts = await tx
        .select({ hostId: schedulingBookingHost.hostId })
        .from(schedulingBookingHost)
        .where(eq(schedulingBookingHost.bookingId, booking.id));
      const id = newId(ID_PREFIXES.webhookEvent);
      await enqueueWebhookMessage(tx, {
        id,
        organizationId,
        environmentId: booking.environmentId,
        type: "scheduling.booking.external_conflict",
        payload: {
          id,
          object: "event",
          type: "scheduling.booking.external_conflict",
          created_at: now.toISOString(),
          data: {
            booking_id: booking.id,
            event_type_id: booking.eventTypeId,
            status: booking.status,
            start: booking.startAt.toISOString(),
            end: booking.endAt.toISOString(),
            host_ids: hosts.map((row) => row.hostId),
            attendee_uids: [],
            series_id: booking.seriesId,
            occurred_at: now.toISOString(),
          },
        },
      });
      await appendLogEntries(tx, [
        {
          organizationId,
          projectId: booking.projectId,
          environmentId: booking.environmentId,
          occurredAt: now,
          source: "scheduling",
          level: "warning",
          type: "scheduling.booking.external_conflict",
          message: "Something else landed on a host's calendar at this booking's time",
          resourceType: "scheduling_booking",
          resourceId: booking.id,
          attributes: { host_id: hostId },
        },
      ]);
    });
  }
  return flagged;
}

/** Reads due calendars. Returns how many were claimed, so a full batch runs again at once. */
export async function runDueCalendarSyncs(deps: CalendarDeps, opts: Scan = {}): Promise<number> {
  const startedAt = nowOf(deps);
  const due = await claimDueCalendars(startedAt, opts);
  for (const { calendar, connection } of due) {
    await syncOne(calendar, connection, startedAt, deps);
  }
  return due.length;
}

async function syncOne(
  calendar: CalendarRow,
  connection: ConnectionRow,
  startedAt: Date,
  deps: CalendarDeps,
): Promise<void> {
  try {
    const client = await clientFor(connection, deps);
    const fromMs = startedAt.getTime() - DAY_MS;
    const toMs = startedAt.getTime() + SYNC_HORIZON_DAYS * DAY_MS;
    const busy = await client.fetchBusy({ calendarIds: [calendar.externalId], fromMs, toMs });
    const intervals = busy[calendar.externalId];
    if (!intervals) {
      await recordFailure(calendar, startedAt);
      return;
    }
    const replaced = await replaceIntervals(calendar, startedAt, intervals, startedAt);
    if (replaced) await flagExternalConflicts(calendar.hostId, calendar.organizationId, startedAt);
  } catch (error) {
    if (!(error instanceof CalendarError)) {
      await recordFailure(calendar, startedAt);
      throw error;
    }
    if (error.kind === "auth") {
      await markNeedsReauth(connection, error.code, deps);
      await db
        .update(schedulingCalendar)
        .set({ leaseUntil: null })
        .where(eq(schedulingCalendar.id, calendar.id));
      return;
    }
    await recordFailure(
      calendar,
      startedAt,
      error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : undefined,
    );
  }
}

/** Keeps push channels alive. A calendar without one is simply polled: nothing depends on this. */
export async function renewDueCalendarChannels(
  deps: CalendarDeps,
  opts: Scan = {},
): Promise<number> {
  const now = nowOf(deps);
  const due = await db
    .select({ calendar: schedulingCalendar, connection: schedulingCalendarConnection })
    .from(schedulingCalendar)
    .innerJoin(
      schedulingCalendarConnection,
      eq(schedulingCalendarConnection.id, schedulingCalendar.connectionId),
    )
    .where(
      and(
        eq(schedulingCalendar.readBusy, true),
        eq(schedulingCalendarConnection.status, "active"),
        inArray(schedulingCalendarConnection.provider, ["google", "microsoft"]),
        or(
          isNull(schedulingCalendar.channelExpiresAt),
          lt(
            schedulingCalendar.channelExpiresAt,
            new Date(now.getTime() + CHANNEL_RENEW_BEFORE_MS),
          ),
        ),
        opts.scope
          ? inArray(schedulingCalendar.organizationId, [...opts.scope.organizationIds])
          : undefined,
      ),
    )
    .limit(opts.limit ?? 50);
  for (const { calendar, connection } of due) {
    // Several workers may see the same row; a second subscribe would orphan the first channel.
    const [claimed] = await db
      .update(schedulingCalendar)
      .set({
        channelExpiresAt: new Date(now.getTime() + CHANNEL_RENEW_BEFORE_MS + CHANNEL_CLAIM_MS),
      })
      .where(
        and(
          eq(schedulingCalendar.id, calendar.id),
          calendar.channelExpiresAt
            ? eq(schedulingCalendar.channelExpiresAt, calendar.channelExpiresAt)
            : isNull(schedulingCalendar.channelExpiresAt),
        ),
      )
      .returning({ id: schedulingCalendar.id });
    if (!claimed) continue;
    try {
      const client = await clientFor(connection, deps);
      if (!client.subscribe) continue;
      const token = randomBytes(32).toString("base64url");
      const channel = await client.subscribe({
        calendarId: calendar.externalId,
        webhookUrl: pushWebhookUrl(deps, connection.provider as "google" | "microsoft"),
        token,
        ttlSeconds: CHANNEL_TTL_SECONDS,
      });
      if (calendar.channelId) {
        await client
          .unsubscribe?.({ channelId: calendar.channelId, resourceId: calendar.channelResourceId })
          .catch(() => {});
      }
      await db
        .update(schedulingCalendar)
        .set({
          channelId: channel.channelId,
          channelResourceId: channel.resourceId,
          channelTokenHash: createHash("sha256").update(token).digest("hex"),
          channelExpiresAt: channel.expiresAtMs
            ? new Date(channel.expiresAtMs)
            : new Date(now.getTime() + CHANNEL_TTL_SECONDS * 1000),
          // Pushes only cover changes from here on: read whatever changed before the channel.
          nextSyncAt: now,
        })
        .where(eq(schedulingCalendar.id, calendar.id));
    } catch (error) {
      if (!(error instanceof CalendarError)) throw error;
      if (error.kind === "auth") await markNeedsReauth(connection, error.code, deps);
      // A failed channel leaves the calendar on the poll: try again in an hour, not every run.
      await db
        .update(schedulingCalendar)
        .set({ channelExpiresAt: new Date(now.getTime() + CHANNEL_RENEW_BEFORE_MS + 3_600_000) })
        .where(eq(schedulingCalendar.id, calendar.id));
    }
  }
  return due.length;
}

/**
 * A provider says a calendar changed. System-level: the channel id finds the calendar, and the
 * token proves the notification is real. It only marks it dirty: no provider call here.
 */
export async function handleCalendarPush(input: {
  channelId: string;
  token: string | null;
  now?: Date;
}): Promise<"ok" | "unknown" | "invalid"> {
  const [calendar] = await db
    .select({ id: schedulingCalendar.id, tokenHash: schedulingCalendar.channelTokenHash })
    .from(schedulingCalendar)
    .where(
      and(
        eq(schedulingCalendar.channelId, input.channelId),
        isNotNull(schedulingCalendar.channelTokenHash),
      ),
    )
    .limit(1);
  if (!calendar) return "unknown";
  const given = createHash("sha256")
    .update(input.token ?? "")
    .digest("hex");
  if (given !== calendar.tokenHash) return "invalid";
  const now = input.now ?? new Date();
  await db
    .update(schedulingCalendar)
    .set({ dirtyAt: now, nextSyncAt: now })
    .where(eq(schedulingCalendar.id, calendar.id));
  return "ok";
}

export type { CalendarRow };
