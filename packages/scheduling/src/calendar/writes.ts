/**
 * Makes each host's calendar show what its bookings say. The ledger holds desired state, so the
 * worker converges on the latest rather than replaying operations: a quick create, move and cancel
 * can't arrive in the wrong order, and each key makes a retry after a lost answer harmless. A failed
 * write never touches the booking, which stays valid and is flagged for the customer.
 */
import { hipaaModeApplies } from "@coss/compliance";
import { db, type Executor, schema } from "@coss/db";
import { ID_PREFIXES, newId } from "@coss/db/id";
import { appendLogEntries } from "@coss/logs";
import { enqueueWebhookMessage } from "@coss/webhooks";
import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { decryptContact } from "../attendees.ts";
import { confirmedSeats, locationOfSession } from "../group-sessions.ts";
import { carryReminders } from "../notifications.ts";
import type { SchedulingDeps } from "../types.ts";
import { type CalendarClient, CalendarError, type CalendarEventWrite } from "./client.ts";
import { type CalendarDeps, clientFor } from "./connections.ts";
import { handleAccessLost } from "./delegation-failures.ts";
import { type HostEventText, hostEventText, locationText, NEUTRAL_EVENT } from "./details.ts";
import { notZoomMeeting } from "./zoom.ts";

const {
  schedulingAttendee,
  schedulingBooking,
  schedulingBookingHost,
  schedulingCalendar,
  schedulingCalendarConnection,
  schedulingCalendarEvent,
  schedulingEventType,
  schedulingGroupSession,
  schedulingOutOfOffice,
  organization,
} = schema;

/** Writing events can put an attendee's details on them, so the worker's data keys are needed. */
export type CalendarWriteDeps = CalendarDeps & Pick<SchedulingDeps, "dataKeys">;

type LedgerRow = typeof schedulingCalendarEvent.$inferSelect;
type BookingRow = typeof schedulingBooking.$inferSelect;
type SessionRow = typeof schedulingGroupSession.$inferSelect;

// A row's `lease_until` is its fencing token: each claim sets a later one than any before it.
const LEASE_MS = 2 * 60_000;
const MAX_ATTEMPTS = 8;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;
// Colleagues may see this, which is why it never says why.
const OUT_OF_OFFICE_TITLE = "Out of office";

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
    const leaseUntil = new Date(now.getTime() + LEASE_MS);
    await tx
      .update(schedulingCalendarEvent)
      .set({ leaseUntil })
      .where(
        inArray(
          schedulingCalendarEvent.id,
          due.map((row) => row.id),
        ),
      );
    return due.map((row) => ({ ...row, leaseUntil }));
  });
}

const stillHeld = (row: LedgerRow) =>
  and(
    eq(schedulingCalendarEvent.id, row.id),
    eq(schedulingCalendarEvent.organizationId, row.organizationId),
    row.leaseUntil ? eq(schedulingCalendarEvent.leaseUntil, row.leaseUntil) : undefined,
  );

/** A batch can outlast its lease: each row takes a new one and its latest state. */
async function renewLease(row: LedgerRow, now: Date): Promise<LedgerRow | null> {
  const [renewed] = await db
    .update(schedulingCalendarEvent)
    .set({ leaseUntil: new Date(now.getTime() + LEASE_MS) })
    .where(stillHeld(row))
    .returning();
  return renewed ?? null;
}

/**
 * A session's event can go and come back, as a new row. A booking's row comes back itself when a
 * host leaves and returns, so its generation makes a key not yet used: Graph's answer to a repeated
 * `transactionId` is undocumented, and it could be the deleted event. It goes first because Meet's
 * `requestId` is the key's first 64 characters, and a new event needs a new one of those too.
 */
const eventKey = (row: LedgerRow) =>
  (row.groupSessionId
    ? row.id
    : `${row.keyGeneration > 0 ? `g${row.keyGeneration}-` : ""}${
        row.outOfOfficeId ?? row.bookingId
      }-${row.calendarId}`
  ).replace(/[^a-z0-9_-]/gi, "");

type Location = BookingRow["location"];

function conferenceOf(location: Location): CalendarEventWrite["conference"] {
  const type = location?.type;
  return type === "google_meet" || type === "microsoft_teams" || type === "zoom" ? type : null;
}

/**
 * A write done with neither flag owed anything any more, unless the row has moved on meanwhile: a
 * stale writer's `redrive` may have just asked for details to come off again.
 */
const clearedUnlessNewer = (row: LedgerRow) => ({
  detailsWritten: sql<boolean>`case when ${schedulingCalendarEvent.desiredVersion} = ${row.desiredVersion} then false else ${schedulingCalendarEvent.detailsWritten} end`,
  scrubPending: sql<boolean>`case when ${schedulingCalendarEvent.desiredVersion} = ${row.desiredVersion} then false else ${schedulingCalendarEvent.scrubPending} end`,
});

/** Records what happened, only if this worker still holds the row. */
async function finish(
  row: LedgerRow,
  set: PgUpdateSetSource<typeof schedulingCalendarEvent>,
): Promise<boolean> {
  const [updated] = await db
    .update(schedulingCalendarEvent)
    .set({ ...set, leaseUntil: null })
    .where(stillHeld(row))
    .returning({ id: schedulingCalendarEvent.id });
  return Boolean(updated);
}

/**
 * The lost request may land after the newest write, so the row is written once more. If it carried
 * details, the row is marked again, or a neutral rewrite would leave them in the description.
 */
async function redrive(row: LedgerRow, now: Date, carriedDetails: boolean): Promise<void> {
  await db
    .update(schedulingCalendarEvent)
    .set({
      ...(carriedDetails ? { detailsWritten: true, scrubPending: true } : {}),
      desiredVersion: sql`${schedulingCalendarEvent.desiredVersion} + 1`,
      nextAttemptAt: now,
      attempts: 0,
    })
    .where(
      and(
        eq(schedulingCalendarEvent.id, row.id),
        eq(schedulingCalendarEvent.organizationId, row.organizationId),
      ),
    );
}

/** An event this worker made is spare once the row names another or has gone. */
async function dropSpareEvent(
  row: LedgerRow,
  client: CalendarClient,
  calendarId: string,
  providerEventId: string,
): Promise<void> {
  const [current] = await db
    .select({ providerEventId: schedulingCalendarEvent.providerEventId })
    .from(schedulingCalendarEvent)
    .where(
      and(
        eq(schedulingCalendarEvent.id, row.id),
        eq(schedulingCalendarEvent.organizationId, row.organizationId),
      ),
    );
  // With no row left, nothing else will ever clean up what this request made.
  if (!current || (current.providerEventId && current.providerEventId !== providerEventId)) {
    await client.deleteEvent(calendarId, providerEventId).catch(() => {});
  }
}

async function setMeetingLink(
  booking: BookingRow,
  hostId: string,
  url: string,
  now: Date,
): Promise<void> {
  const location = booking.location;
  if (!location || location.type === "link") return;
  const zoom = location.type === "zoom";
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ location: schedulingBooking.location })
      .from(schedulingBooking)
      .where(
        and(
          eq(schedulingBooking.id, booking.id),
          eq(schedulingBooking.organizationId, booking.organizationId),
        ),
      )
      .for("update");
    const [assigned] = await tx
      .select({ hostId: schedulingBookingHost.hostId })
      .from(schedulingBookingHost)
      .where(
        and(
          eq(schedulingBookingHost.bookingId, booking.id),
          eq(schedulingBookingHost.organizationId, booking.organizationId),
          eq(schedulingBookingHost.hostId, hostId),
        ),
      );
    // A slow answer for a host who's since been replaced: their meeting isn't this booking's.
    if (!assigned || current?.location?.type !== location.type) return;
    const [updated] = await tx
      .update(schedulingBooking)
      .set({
        // Remembers where the link came from and whose it is, for when hosts change.
        location: zoom
          ? { type: "zoom", url }
          : ({
              type: "link",
              url,
              conference: location.type,
              conference_host_id: hostId,
            } as never),
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
    await carryReminders(tx, updated);
    // Other events went out without the link. A Meet's own event already shows it.
    await tx
      .update(schedulingCalendarEvent)
      .set({
        desiredVersion: sql`${schedulingCalendarEvent.desiredVersion} + 1`,
        nextAttemptAt: now,
        attempts: 0,
      })
      .where(
        and(
          eq(schedulingCalendarEvent.bookingId, booking.id),
          eq(schedulingCalendarEvent.organizationId, booking.organizationId),
          eq(schedulingCalendarEvent.desiredState, "present"),
          notZoomMeeting(),
          zoom ? undefined : ne(schedulingCalendarEvent.hostId, hostId),
        ),
      );
    await announce(tx, updated, "scheduling.booking.location_ready", "Meeting link ready", now);
  });
}

/** Every confirmed seat gets the session's link, unless they've all left since the write. */
async function setSessionMeetingLink(
  session: SessionRow,
  hostId: string,
  url: string,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(schedulingGroupSession)
      .where(
        and(
          eq(schedulingGroupSession.id, session.id),
          eq(schedulingGroupSession.organizationId, session.organizationId),
        ),
      )
      .for("update");
    if (!locked || locked.meetingUrl === url || locked.location?.type === "link") return;
    // A slow answer for a host who's since been replaced: their meeting isn't this session's.
    if (locked.hostId !== hostId) return;
    const seats = await confirmedSeats(tx, locked);
    if (seats.length === 0) return;
    await tx
      .update(schedulingGroupSession)
      .set({ meetingUrl: url })
      .where(
        and(
          eq(schedulingGroupSession.id, locked.id),
          eq(schedulingGroupSession.organizationId, locked.organizationId),
        ),
      );
    for (const seat of seats) {
      await announce(tx, seat, "scheduling.booking.location_ready", "Meeting link ready", now);
    }
  });
}

/** Who a ledger row's news is about: its booking, or each confirmed seat of its session. */
async function bookingsOfRow(tx: Executor, row: LedgerRow): Promise<BookingRow[]> {
  if (row.groupSessionId) {
    return confirmedSeats(tx, { id: row.groupSessionId, organizationId: row.organizationId });
  }
  if (!row.bookingId) return [];
  return tx
    .select()
    .from(schedulingBooking)
    .where(
      and(
        eq(schedulingBooking.id, row.bookingId as string),
        eq(schedulingBooking.organizationId, row.organizationId),
      ),
    );
}

type WritableEvent =
  | "scheduling.booking.location_ready"
  | "scheduling.booking.calendar_write_failed"
  | "scheduling.booking.external_conflict";

export async function announce(
  tx: Executor,
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

/** The title this row's event would have with details on. Null: its event type wants it neutral. */
async function detailedTitle(
  row: LedgerRow,
  booking: BookingRow | undefined,
  session: SessionRow | undefined,
  connection: typeof schedulingCalendarConnection.$inferSelect,
): Promise<string | null> {
  // A Zoom meeting's topic is shown to whoever joins it.
  if (connection.provider === "zoom") return null;
  const eventTypeId = session?.eventTypeId ?? booking?.eventTypeId;
  if (!eventTypeId) return null;
  const [eventType] = await db
    .select({
      title: schedulingEventType.title,
      details: schedulingEventType.hostCalendarDetails,
    })
    .from(schedulingEventType)
    .where(
      and(
        eq(schedulingEventType.id, eventTypeId),
        eq(schedulingEventType.organizationId, row.organizationId),
      ),
    );
  if (eventType?.details !== "full") return null;
  return booking?.title ?? eventType.title;
}

/**
 * What the event may say, decided against anything that could take details away while it's sent.
 * The locks come first and the row is marked before they're released, which makes both orders safe.
 * An erasure holds its attendee rows while it asks for a rewrite of marked events, and enabling HIPAA
 * mode holds the organization's row while it does the same. So they either commit first, and these
 * locks wait and then read what they left, or wait for this to commit and see its mark. A plain read
 * wouldn't wait: it would see the old details with an uncommitted erasure's rewrite already missed.
 * Marking last means this never holds the ledger row while waiting for what those two hold.
 */
async function detailsToSend(
  row: LedgerRow,
  booking: BookingRow | undefined,
  title: string,
  deps: CalendarWriteDeps,
): Promise<HostEventText | null> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, row.organizationId))
      .for("share");
    if (await hipaaModeApplies(row.environmentId, tx)) return NEUTRAL_EVENT;
    // A group session's seats come and go without a write, so its event names nobody.
    const attendees = booking
      ? await tx
          .select()
          .from(schedulingAttendee)
          .where(
            and(
              eq(schedulingAttendee.bookingId, booking.id),
              eq(schedulingAttendee.organizationId, booking.organizationId),
            ),
          )
          .orderBy(asc(schedulingAttendee.role), asc(schedulingAttendee.id))
          .for("share")
      : [];
    if (!row.detailsWritten) {
      const [marked] = await tx
        .update(schedulingCalendarEvent)
        .set({ detailsWritten: true })
        .where(stillHeld(row))
        .returning({ id: schedulingCalendarEvent.id });
      if (!marked) return null;
    }
    if (!booking) return { title, description: null };
    return hostEventText(
      title,
      attendees.map((attendee) => ({
        role: attendee.role,
        ...decryptContact(attendee.encryptedContact, deps),
      })),
    );
  });
}

async function writeOne(claimed: LedgerRow, deps: CalendarWriteDeps): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const row = await renewLease(claimed, now);
  if (!row) return;
  const [target] = await db
    .select({ calendar: schedulingCalendar, connection: schedulingCalendarConnection })
    .from(schedulingCalendar)
    .innerJoin(
      schedulingCalendarConnection,
      eq(schedulingCalendarConnection.id, schedulingCalendar.connectionId),
    )
    .where(eq(schedulingCalendar.id, row.calendarId));
  const [booking] = row.bookingId
    ? await db
        .select()
        .from(schedulingBooking)
        .where(
          and(
            eq(schedulingBooking.id, row.bookingId),
            eq(schedulingBooking.organizationId, row.organizationId),
          ),
        )
    : [];
  const [session] = row.groupSessionId
    ? await db
        .select()
        .from(schedulingGroupSession)
        .where(
          and(
            eq(schedulingGroupSession.id, row.groupSessionId),
            eq(schedulingGroupSession.organizationId, row.organizationId),
          ),
        )
    : [];
  const [away] = row.outOfOfficeId
    ? await db
        .select({ id: schedulingOutOfOffice.id })
        .from(schedulingOutOfOffice)
        .where(
          and(
            eq(schedulingOutOfOffice.id, row.outOfOfficeId),
            eq(schedulingOutOfOffice.organizationId, row.organizationId),
          ),
        )
    : [];
  if (!target || !(booking || session || away)) return;
  const location = session ? locationOfSession(session) : (booking?.location ?? null);
  const { calendar, connection } = target;
  // Waits for the host to reconnect, without using up attempts.
  if (connection.status !== "active") {
    await finish(row, { nextAttemptAt: new Date(now.getTime() + 15 * 60_000) });
    return;
  }
  let sent = false;
  let carriedDetails = false;
  // Taking details off an event isn't something to give up on: they'd stay on a provider for good.
  // A deletion counts, since a row that's absent is never rewritten when someone's erased.
  const removingDetails = row.scrubPending || (row.desiredState === "absent" && row.detailsWritten);
  const settle = async (set: Parameters<typeof finish>[1]): Promise<boolean> => {
    const finished = await finish(row, set);
    if (!finished && sent) await redrive(row, now, carriedDetails);
    return finished;
  };
  try {
    const client = await clientFor(connection, deps);
    if (row.desiredState === "absent") {
      sent = true;
      // No id doesn't mean no event: a create's answer may have been lost.
      if (row.providerEventId) await client.deleteEvent(calendar.externalId, row.providerEventId);
      else await client.deleteEventByKey(calendar.externalId, eventKey(row));
      await settle({
        appliedVersion: row.desiredVersion,
        providerEventId: null,
        keyGeneration: row.keyGeneration + 1,
        ...clearedUnlessNewer(row),
        attempts: 0,
        lastErrorCode: null,
      });
      return;
    }
    const held = row.detailsWritten;
    const title = await detailedTitle(row, booking, session, connection);
    const text = title ? await detailsToSend(row, booking, title, deps) : NEUTRAL_EVENT;
    if (!text) return;
    carriedDetails = text !== NEUTRAL_EVENT;
    sent = true;
    const event: CalendarEventWrite = {
      key: eventKey(row),
      title: away ? OUT_OF_OFFICE_TITLE : text.title,
      // An event that never held details keeps whatever the host wrote on it.
      ...(text.description || held ? { description: text.description } : {}),
      startMs: row.desiredStart.getTime(),
      endMs: row.desiredEnd.getTime(),
      conference: conferenceOf(location),
      location: locationText(location),
    };
    const written = row.providerEventId
      ? await client.updateEvent(calendar.externalId, row.providerEventId, event)
      : await client.createEvent(calendar.externalId, event);
    const finished = await settle({
      appliedVersion: row.desiredVersion,
      providerEventId: written.providerEventId,
      // Whatever else this write did, an event still saying more keeps its mark.
      ...(carriedDetails
        ? { detailsWritten: true, scrubPending: clearedUnlessNewer(row).scrubPending }
        : clearedUnlessNewer(row)),
      attempts: 0,
      lastErrorCode: null,
      externalState: "in_sync",
    });
    if (!finished) {
      await dropSpareEvent(row, client, calendar.externalId, written.providerEventId);
      return;
    }
    if (written.meetingUrl) {
      if (session) await setSessionMeetingLink(session, row.hostId, written.meetingUrl, now);
      else if (booking) await setMeetingLink(booking, row.hostId, written.meetingUrl, now);
    }
  } catch (error) {
    if (!(error instanceof CalendarError)) {
      await settle({ nextAttemptAt: new Date(now.getTime() + backoffMs(row.attempts)) });
      throw error;
    }
    if (error.kind === "auth") {
      await handleAccessLost(connection, error, deps);
      await settle({
        nextAttemptAt: new Date(now.getTime() + 15 * 60_000),
        lastErrorCode: error.code,
      });
      return;
    }
    const attempts = row.attempts + 1;
    if (removingDetails) {
      if (error.status === 404 || error.status === 410) {
        await settle({
          appliedVersion: row.desiredVersion,
          providerEventId: null,
          ...clearedUnlessNewer(row),
          attempts: 0,
          lastErrorCode: null,
        });
        return;
      }
      if (attempts === MAX_ATTEMPTS) {
        console.error(
          `[scheduling] can't take details off calendar event ${row.id}, still trying:`,
          error.code,
        );
      }
      await settle({
        attempts,
        lastErrorCode: error.code,
        nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)),
      });
      return;
    }
    const exhausted = error.kind === "permanent" || attempts >= MAX_ATTEMPTS;
    if (exhausted) {
      // Given up on this version: the booking stands, and the customer knows.
      const gaveUp = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(schedulingCalendarEvent)
          .set({
            appliedVersion: row.desiredVersion,
            attempts,
            lastErrorCode: error.code,
            leaseUntil: null,
          })
          .where(stillHeld(row))
          .returning({ id: schedulingCalendarEvent.id });
        if (!updated) return false;
        // A past event that can't be rewritten is nobody's news.
        if (row.desiredEnd <= now) return true;
        for (const about of await bookingsOfRow(tx, row)) {
          await announce(
            tx,
            about,
            "scheduling.booking.calendar_write_failed",
            "This booking couldn't be written to the host's calendar",
            now,
          );
        }
        return true;
      });
      if (!gaveUp && sent) await redrive(row, now, carriedDetails);
      return;
    }
    await settle({
      attempts,
      lastErrorCode: error.code,
      nextAttemptAt: new Date(
        now.getTime() +
          (error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : backoffMs(attempts)),
      ),
    });
  }
}

export async function runDueCalendarWrites(
  deps: CalendarWriteDeps,
  opts: Scan = {},
): Promise<number> {
  const now = deps.now?.() ?? new Date();
  const due = await claimDue(now, opts);
  for (const row of due) await writeOne(row, deps);
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
        // Someone removing their own time off from their calendar isn't a conflict with anything.
        isNull(schedulingCalendarEvent.outOfOfficeId),
        isNotNull(schedulingCalendarEvent.providerEventId),
        gt(schedulingCalendarEvent.desiredStart, now),
        eq(schedulingCalendarConnection.status, "active"),
        ne(schedulingCalendarConnection.provider, "zoom"),
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
      await db.transaction(async (tx) => {
        // Bookings before the ledger row, as cancelling and erasing take them, or these deadlock.
        const bookings = await bookingsOfRow(tx, row);
        for (const booking of [...bookings].sort((a, b) => (a.id < b.id ? -1 : 1))) {
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
        await tx
          .update(schedulingCalendarEvent)
          .set({ externalState: moved ? "moved" : "deleted" })
          .where(eq(schedulingCalendarEvent.id, row.id));
      });
    } catch (error) {
      if (!(error instanceof CalendarError)) throw error;
      if (error.kind === "auth") await handleAccessLost(connection, error, deps);
    }
  }
  return rows.length;
}
