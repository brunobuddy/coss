/**
 * Makes each host's calendar show what its bookings say. The ledger holds desired state, so the
 * worker converges on the latest rather than replaying operations: a quick create, move and cancel
 * can't arrive in the wrong order, and each key makes a retry after a lost answer harmless. A failed
 * write never touches the booking, which stays valid and is flagged for the customer.
 */
import { db, schema } from "@coss/db";
import { ID_PREFIXES, newId } from "@coss/db/id";
import { appendLogEntries } from "@coss/logs";
import { enqueueWebhookMessage } from "@coss/webhooks";
import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { CalendarError, type CalendarEventWrite } from "./client.ts";
import { type CalendarDeps, clientFor, markNeedsReauth } from "./connections.ts";

const {
  schedulingBooking,
  schedulingBookingHost,
  schedulingCalendar,
  schedulingCalendarConnection,
  schedulingCalendarEvent,
} = schema;

type LedgerRow = typeof schedulingCalendarEvent.$inferSelect;
type BookingRow = typeof schedulingBooking.$inferSelect;

const LEASE_MS = 2 * 60_000;
const MAX_ATTEMPTS = 8;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;
// What the host's calendar says, deliberately: their calendar may be seen by colleagues.
const NEUTRAL_TITLE = "Appointment";

type Scan = { limit?: number; scope?: { organizationIds: readonly string[] } };

function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** attempts, MAX_BACKOFF_MS);
}

async function claimDue(now: Date, opts: Scan): Promise<LedgerRow[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(schedulingCalendarEvent)
      .where(
        and(
          sql`${schedulingCalendarEvent.appliedVersion} < ${schedulingCalendarEvent.desiredVersion}`,
          lte(schedulingCalendarEvent.nextAttemptAt, now),
          or(
            isNull(schedulingCalendarEvent.leaseUntil),
            lt(schedulingCalendarEvent.leaseUntil, now),
          ),
          opts.scope
            ? inArray(schedulingCalendarEvent.organizationId, [...opts.scope.organizationIds])
            : undefined,
        ),
      )
      .orderBy(asc(schedulingCalendarEvent.nextAttemptAt))
      .limit(opts.limit ?? 50)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    await tx
      .update(schedulingCalendarEvent)
      .set({ leaseUntil: new Date(now.getTime() + LEASE_MS) })
      .where(
        inArray(
          schedulingCalendarEvent.id,
          due.map((row) => row.id),
        ),
      );
    return due;
  });
}

const eventKey = (row: LedgerRow) =>
  `${row.bookingId}-${row.calendarId}`.replace(/[^a-z0-9_-]/gi, "");

function conferenceOf(booking: BookingRow): CalendarEventWrite["conference"] {
  const type = booking.location?.type;
  return type === "google_meet" || type === "microsoft_teams" ? type : null;
}

function locationText(booking: BookingRow): string | null {
  const location = booking.location;
  if (!location) return null;
  if (location.type === "link") return location.url;
  if (location.type === "phone") return location.number;
  if (location.type === "in_person") return location.address;
  return null;
}

/** Records what happened, only if the row wasn't changed or reclaimed meanwhile. */
async function finish(
  row: LedgerRow,
  set: Partial<typeof schedulingCalendarEvent.$inferInsert>,
): Promise<boolean> {
  const [updated] = await db
    .update(schedulingCalendarEvent)
    .set({ ...set, leaseUntil: null })
    .where(
      and(
        eq(schedulingCalendarEvent.id, row.id),
        eq(schedulingCalendarEvent.organizationId, row.organizationId),
      ),
    )
    .returning({ id: schedulingCalendarEvent.id });
  return Boolean(updated);
}

async function setMeetingLink(booking: BookingRow, url: string, now: Date): Promise<void> {
  const location = booking.location;
  if (!location || location.type === "link") return;
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(schedulingBooking)
      .set({
        location: { type: "link", url },
        version: sql`${schedulingBooking.version} + 1`,
      })
      .where(
        and(
          eq(schedulingBooking.id, booking.id),
          eq(schedulingBooking.organizationId, booking.organizationId),
        ),
      )
      .returning();
    if (!updated) return;
    await announce(tx, updated, "scheduling.booking.location_ready", "Meeting link ready", now);
  });
}

type WritableEvent =
  | "scheduling.booking.location_ready"
  | "scheduling.booking.calendar_write_failed"
  | "scheduling.booking.external_conflict";

async function announce(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  booking: BookingRow,
  type: WritableEvent,
  message: string,
  now: Date,
): Promise<void> {
  const hosts = await tx
    .select({ hostId: schedulingBookingHost.hostId })
    .from(schedulingBookingHost)
    .where(eq(schedulingBookingHost.bookingId, booking.id));
  const id = newId(ID_PREFIXES.webhookEvent);
  await enqueueWebhookMessage(tx, {
    id,
    organizationId: booking.organizationId,
    environmentId: booking.environmentId,
    type,
    payload: {
      id,
      object: "event",
      type,
      created_at: now.toISOString(),
      data: {
        booking_id: booking.id,
        event_type_id: booking.eventTypeId,
        status: booking.status,
        start: booking.startAt.toISOString(),
        end: booking.endAt.toISOString(),
        host_ids: hosts.map((host) => host.hostId),
        attendee_uids: [],
        series_id: booking.seriesId,
        occurred_at: now.toISOString(),
      },
    },
  });
  await appendLogEntries(tx, [
    {
      organizationId: booking.organizationId,
      projectId: booking.projectId,
      environmentId: booking.environmentId,
      occurredAt: now,
      source: "scheduling",
      level: type === "scheduling.booking.location_ready" ? "info" : "warning",
      type,
      message,
      resourceType: "scheduling_booking",
      resourceId: booking.id,
    },
  ]);
}

async function writeOne(row: LedgerRow, deps: CalendarDeps, now: Date): Promise<void> {
  const [target] = await db
    .select({ calendar: schedulingCalendar, connection: schedulingCalendarConnection })
    .from(schedulingCalendar)
    .innerJoin(
      schedulingCalendarConnection,
      eq(schedulingCalendarConnection.id, schedulingCalendar.connectionId),
    )
    .where(eq(schedulingCalendar.id, row.calendarId));
  const [booking] = await db
    .select()
    .from(schedulingBooking)
    .where(
      and(
        eq(schedulingBooking.id, row.bookingId),
        eq(schedulingBooking.organizationId, row.organizationId),
      ),
    );
  if (!target || !booking) return;
  const { calendar, connection } = target;
  // Waits for the host to reconnect, without using up attempts.
  if (connection.status !== "active") {
    await finish(row, { nextAttemptAt: new Date(now.getTime() + 15 * 60_000) });
    return;
  }
  try {
    const client = await clientFor(connection, deps);
    if (row.desiredState === "absent") {
      if (row.providerEventId) await client.deleteEvent(calendar.externalId, row.providerEventId);
      await finish(row, {
        appliedVersion: row.desiredVersion,
        providerEventId: null,
        attempts: 0,
        lastErrorCode: null,
      });
      return;
    }
    const event: CalendarEventWrite = {
      key: eventKey(row),
      title: NEUTRAL_TITLE,
      startMs: row.desiredStart.getTime(),
      endMs: row.desiredEnd.getTime(),
      conference: conferenceOf(booking),
      location: locationText(booking),
    };
    const written = row.providerEventId
      ? await client.updateEvent(calendar.externalId, row.providerEventId, event)
      : await client.createEvent(calendar.externalId, event);
    await finish(row, {
      appliedVersion: row.desiredVersion,
      providerEventId: written.providerEventId,
      attempts: 0,
      lastErrorCode: null,
      externalState: "in_sync",
    });
    if (written.meetingUrl) await setMeetingLink(booking, written.meetingUrl, now);
  } catch (error) {
    if (!(error instanceof CalendarError)) {
      await finish(row, { nextAttemptAt: new Date(now.getTime() + backoffMs(row.attempts)) });
      throw error;
    }
    if (error.kind === "auth") {
      await markNeedsReauth(connection, error.code, deps);
      await finish(row, {
        nextAttemptAt: new Date(now.getTime() + 15 * 60_000),
        lastErrorCode: error.code,
      });
      return;
    }
    const attempts = row.attempts + 1;
    const exhausted = error.kind === "permanent" || attempts >= MAX_ATTEMPTS;
    if (exhausted) {
      // Given up on this version: the booking stands, and the customer knows.
      await db.transaction(async (tx) => {
        await tx
          .update(schedulingCalendarEvent)
          .set({
            appliedVersion: row.desiredVersion,
            attempts,
            lastErrorCode: error.code,
            leaseUntil: null,
          })
          .where(eq(schedulingCalendarEvent.id, row.id));
        await announce(
          tx,
          booking,
          "scheduling.booking.calendar_write_failed",
          "This booking couldn't be written to the host's calendar",
          now,
        );
      });
      return;
    }
    await finish(row, {
      attempts,
      lastErrorCode: error.code,
      nextAttemptAt: new Date(
        now.getTime() +
          (error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : backoffMs(attempts)),
      ),
    });
  }
}

export async function runDueCalendarWrites(deps: CalendarDeps, opts: Scan = {}): Promise<number> {
  const now = deps.now?.() ?? new Date();
  const due = await claimDue(now, opts);
  for (const row of due) await writeOne(row, deps, now);
  return due.length;
}

/**
 * A host moved or deleted our event on their own calendar. Coss.com stays the source of truth: it's
 * recorded and the customer is told; nothing's cancelled or put back. A moved event then blocks its
 * new time as ordinary busy, because the ledger no longer subtracts it.
 */
export async function checkHostEditedEvents(deps: CalendarDeps, opts: Scan = {}): Promise<number> {
  const now = deps.now?.() ?? new Date();
  const rows = await db
    .select({
      row: schedulingCalendarEvent,
      calendar: schedulingCalendar,
      connection: schedulingCalendarConnection,
    })
    .from(schedulingCalendarEvent)
    .innerJoin(schedulingCalendar, eq(schedulingCalendar.id, schedulingCalendarEvent.calendarId))
    .innerJoin(
      schedulingCalendarConnection,
      eq(schedulingCalendarConnection.id, schedulingCalendar.connectionId),
    )
    .where(
      and(
        eq(schedulingCalendarEvent.desiredState, "present"),
        eq(schedulingCalendarEvent.externalState, "in_sync"),
        isNotNull(schedulingCalendarEvent.providerEventId),
        gt(schedulingCalendarEvent.desiredStart, now),
        eq(schedulingCalendarConnection.status, "active"),
        sql`${schedulingCalendarEvent.appliedVersion} = ${schedulingCalendarEvent.desiredVersion}`,
        sql`${schedulingCalendarEvent.updatedAt} < ${new Date(now.getTime() - 3_600_000).toISOString()}::timestamptz`,
        opts.scope
          ? inArray(schedulingCalendarEvent.organizationId, [...opts.scope.organizationIds])
          : undefined,
      ),
    )
    .orderBy(asc(schedulingCalendarEvent.updatedAt))
    .limit(opts.limit ?? 50);
  for (const { row, calendar, connection } of rows) {
    try {
      const client = await clientFor(connection, deps);
      const state = await client.getEvent?.(calendar.externalId, row.providerEventId as string);
      if (!state) {
        await db
          .update(schedulingCalendarEvent)
          .set({ updatedAt: now })
          .where(eq(schedulingCalendarEvent.id, row.id));
        continue;
      }
      const moved =
        state.state === "present" &&
        (state.startMs !== row.desiredStart.getTime() || state.endMs !== row.desiredEnd.getTime());
      if (state.state === "present" && !moved) {
        await db
          .update(schedulingCalendarEvent)
          .set({ updatedAt: now })
          .where(eq(schedulingCalendarEvent.id, row.id));
        continue;
      }
      const [booking] = await db
        .select()
        .from(schedulingBooking)
        .where(eq(schedulingBooking.id, row.bookingId));
      await db.transaction(async (tx) => {
        await tx
          .update(schedulingCalendarEvent)
          .set({ externalState: moved ? "moved" : "deleted" })
          .where(eq(schedulingCalendarEvent.id, row.id));
        if (booking) {
          await tx
            .update(schedulingBooking)
            .set({ externalConflictAt: now })
            .where(eq(schedulingBooking.id, booking.id));
          await announce(
            tx,
            booking,
            "scheduling.booking.external_conflict",
            moved
              ? "The host moved this booking's event on their calendar"
              : "The host deleted this booking's event from their calendar",
            now,
          );
        }
      });
    } catch (error) {
      if (!(error instanceof CalendarError)) throw error;
      if (error.kind === "auth") await markNeedsReauth(connection, error.code, deps);
    }
  }
  return rows.length;
}
