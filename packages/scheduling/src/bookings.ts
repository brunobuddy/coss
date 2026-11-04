/**
 * Bookings, holds and approvals. Everything that changes what a host is committed to happens here,
 * in one transaction with its claims, history, webhook, log line and usage.
 *
 * Lock order, always: hosts and memberships (sorted), limit buckets (sorted), the group session,
 * then claims by host. Without it, collective bookings deadlock constantly: a test on real Postgres
 * saw about half of unsorted attempts fail with `40P01`, and none sorted.
 */
import { recordUsage } from "@coss/billing/metering";
import { db, type Executor, schema, type Transaction } from "@coss/db";
import { ID_PREFIXES, isId, newId } from "@coss/db/id";
import { requestHash as hashRequest, withIdempotencyKey } from "@coss/db/idempotency";
import { appendLogEntries } from "@coss/logs";
import { decryptSecret, enqueueWebhookMessage } from "@coss/webhooks";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import {
  decryptAnswers,
  decryptContact,
  emailLookup,
  encryptAnswers,
  encryptContact,
  encryptRouting,
} from "./attendees.ts";
import {
  type Candidates,
  calendarFailureModeOf,
  candidatesOf,
  checkWindow,
  combineSlots,
  hostInputOf,
  loadHostInputs,
  type SlotResult,
  slotRuleOf,
  takeTurn,
} from "./availability.ts";
import { hostsBusyNow } from "./calendar/live-check.ts";
import { announce } from "./calendar/writes.ts";
import { ZOOM_CALENDAR_ID } from "./calendar/zoom.ts";
import {
  extendSessionClaim,
  inSavepoint,
  isDeadlock,
  isExclusionViolation,
  limitSessionClaim,
  makeClaimPermanent,
  releaseBookingClaims,
  releaseSessionClaim,
  tryClaim,
} from "./claims.ts";
import { type Interval, overlapsAny } from "./engine/intervals.ts";
import { type PoolMember, rankCandidates } from "./engine/rank.ts";
import { expandRecurrence } from "./engine/recurrence.ts";
import {
  isBookable,
  limitUsageKey,
  listSlots,
  type NotBookableReason,
  occupiedRange,
  type SlotRule,
} from "./engine/slots.ts";
import { MINUTE_MS } from "./engine/time.ts";
import { SchedulingError } from "./errors.ts";
import { type EventTypeRow, resolveEventType } from "./event-types.ts";
import { confirmedSeats, withSessionLocation } from "./group-sessions.ts";
import { checkTimeZone, type HostRow, hostsByIds, resolveHost } from "./hosts.ts";
import {
  carryReminders,
  enqueueBookingNotifications,
  enqueueReassignment,
} from "./notifications.ts";
import { hostsAwayDuring } from "./out-of-office.ts";
import {
  type AttendeeInputOutput,
  type BookingObjectOutput,
  type GuestInputOutput,
  MAX_SERIES_OCCURRENCES,
  type SchedulingWebhookEventType,
} from "./schemas.ts";
import { nowOf, type SchedulingDeps, type SchedulingEnvironment } from "./types.ts";

const {
  schedulingAttendee,
  schedulingBooking,
  schedulingBookingEvent,
  schedulingBookingHost,
  schedulingCalendar,
  schedulingCalendarConnection,
  schedulingCalendarEvent,
  schedulingClaim,
  schedulingEventType,
  schedulingEventTypeHost,
  schedulingGroupSession,
  schedulingHost,
  schedulingLimitBucket,
  schedulingSeries,
  schedulingSession,
} = schema;

export type BookingRow = typeof schedulingBooking.$inferSelect;
type AttendeeRow = typeof schedulingAttendee.$inferSelect;
type Scope = Pick<SchedulingEnvironment, "organizationId" | "environmentId">;
type Answers = Record<string, string | string[]>;
type Location = NonNullable<BookingRow["location"]>;

export type BookingActor = NonNullable<typeof schedulingBookingEvent.$inferInsert.actor>;

export type BookingRequest = {
  eventType: string;
  startMs: number;
  host?: string | undefined;
  attributes?: Record<string, string | string[]> | undefined;
  durationMinutes?: number | undefined;
  attendee: AttendeeInputOutput;
  guests?: readonly GuestInputOutput[] | undefined;
  answers?: Answers | undefined;
  location?: Location | undefined;
  locationFromBrowser?: boolean | undefined;
  metadata?: Record<string, string> | undefined;
  idempotencyKey?: string | undefined;
};

const LIVE_CHECK_CANDIDATES = 3;
const BOOKING_HISTORY_LIMIT = 100;
const RECENT_HOST_BOOKINGS_MS = 30 * 86_400_000;

/** Thrown inside a savepoint to undo a candidate's partial claims. Never leaves this file. */
class LostSlot extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

async function retryingDeadlocks<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isDeadlock(error)) throw error;
    return run();
  }
}

function checkAnswers(eventType: EventTypeRow, answers: Answers | undefined): void {
  const given = answers ?? {};
  const invalid = (message: string, key: string) =>
    new SchedulingError("invalid_answers", message, { param: `answers.${key}` });
  const known = new Set(eventType.questions.map((question) => question.key));
  for (const key of Object.keys(given)) {
    if (!known.has(key)) throw invalid(`This event type asks no question "${key}".`, key);
  }
  for (const question of eventType.questions) {
    const value = given[question.key];
    const empty = value === undefined || value === "" || (Array.isArray(value) && !value.length);
    if (empty) {
      if (question.required) throw invalid(`"${question.label}" is required.`, question.key);
      continue;
    }
    if (question.type === "checkbox" ? false : Array.isArray(value)) {
      throw invalid(`"${question.label}" takes one answer.`, question.key);
    }
    if (question.options.length > 0) {
      const values = Array.isArray(value) ? value : [value as string];
      if (values.some((item) => !question.options.includes(item))) {
        throw invalid(`That isn't one of the options of "${question.label}".`, question.key);
      }
    }
  }
}

const URL_LIKE = /https?:\/\/|www\.|(?<![a-z0-9-])[a-z0-9-]+\.[a-z]{2,}\//i;

/** A name is printed in emails sent to the attendee, who may be anyone: no room for a link. */
function checkAttendee(attendee: AttendeeInputOutput): void {
  checkTimeZone(attendee.time_zone, "attendee.time_zone");
  if (attendee.name && URL_LIKE.test(attendee.name)) {
    throw new SchedulingError("invalid_attendee", "A name can't contain a link.", {
      param: "attendee.name",
    });
  }
}

/** The host a location came from, kept off the wire: it goes with them if they leave the booking. */
const fromHostOf = (location: BookingRow["location"]): string | null =>
  (location as { fromHost?: string } | null)?.fromHost ?? null;

const isBlank = (location: Location): boolean =>
  (location.type === "link" && !location.url) ||
  (location.type === "phone" && !location.number) ||
  (location.type === "in_person" && !location.address);

/**
 * A location that leaves its value open takes it from the first of these hosts who has one, by id,
 * as with Zoom. Anything that names its own value keeps it, and with no host's value it stays blank.
 */
function withHostLocation(location: Location, hosts: readonly HostRow[]): Location {
  if (!isBlank(location)) return location;
  const sorted = [...hosts].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const host of sorted) {
    const own = host.locations.find((candidate) => candidate.type === location.type);
    if (own) {
      const filled = { ...own, fromHost: host.id };
      return filled;
    }
  }
  return location;
}

function blankOf(location: Location): Location {
  if (location.type === "link") return { type: "link", url: null };
  if (location.type === "phone") return { type: "phone", number: null };
  if (location.type === "in_person") return { type: "in_person", address: null };
  return location;
}

/**
 * What a booking's location becomes when another host takes it, or `null` if it stays. A meeting
 * made on the old host's account goes back to being made, and the old host's own office or link
 * never stays: `leaving` had it, so the booking takes the hosts' it has now, or none.
 */
function locationForNewHost(
  location: BookingRow["location"],
  leaving: string | undefined,
  hosts: readonly HostRow[],
): BookingRow["location"] {
  if (!location) return null;
  if (location.type === "zoom") return { type: "zoom", url: null };
  if (location.type === "link" && "conference" in location) {
    return { type: location.conference as "google_meet" | "microsoft_teams" };
  }
  const fromHost = fromHostOf(location);
  if (fromHost ? fromHost === leaving : isBlank(location)) {
    return withHostLocation(blankOf(location), hosts);
  }
  return null;
}

/** Guests are emailed, so an event type has to allow them, and everyone is only told once. */
function checkGuests(
  eventType: EventTypeRow,
  attendee: AttendeeInputOutput,
  guests: readonly GuestInputOutput[] | undefined,
): void {
  if (!guests?.length) return;
  const invalid = (message: string, param: string) =>
    new SchedulingError("invalid_attendee", message, { param });
  if (guests.length > eventType.maxGuests) {
    throw invalid(
      eventType.maxGuests === 0
        ? "This event type doesn't allow guests."
        : `This event type allows ${eventType.maxGuests} guests at most.`,
      "guests",
    );
  }
  const seen = new Set(attendee.email ? [attendee.email.trim().toLowerCase()] : []);
  for (const [index, guest] of guests.entries()) {
    if (guest.name && URL_LIKE.test(guest.name)) {
      throw invalid("A name can't contain a link.", `guests[${index}].name`);
    }
    const email = guest.email.trim().toLowerCase();
    if (seen.has(email)) {
      throw invalid("Everyone on a booking needs their own email.", `guests[${index}].email`);
    }
    seen.add(email);
  }
}

function wireLocation(location: BookingRow["location"]): BookingRow["location"] {
  if (!location) return null;
  if (!("conference" in location) && !fromHostOf(location)) return location;
  const {
    conference: _conference,
    conference_host_id: _conferenceHost,
    fromHost: _fromHost,
    ...rest
  } = location as typeof location & {
    conference?: string;
    conference_host_id?: string;
    fromHost?: string;
  };
  return rest as BookingRow["location"];
}

/** Whose account runs a booking's meeting, when that's known: older Meet and Teams links don't say. */
async function meetingOwnerOf(tx: Executor, booking: BookingRow): Promise<string | null> {
  const location = booking.location;
  if (location?.type === "link" && "conference_host_id" in location) {
    return location.conference_host_id as string;
  }
  if (location?.type !== "zoom") return null;
  const [row] = await tx
    .select({ hostId: schedulingCalendarEvent.hostId })
    .from(schedulingCalendarEvent)
    .innerJoin(schedulingCalendar, eq(schedulingCalendar.id, schedulingCalendarEvent.calendarId))
    .where(
      and(
        eq(schedulingCalendarEvent.bookingId, booking.id),
        eq(schedulingCalendarEvent.organizationId, booking.organizationId),
        eq(schedulingCalendarEvent.desiredState, "present"),
        eq(schedulingCalendar.externalId, ZOOM_CALENDAR_ID),
      ),
    );
  return row?.hostId ?? null;
}

/**
 * The location once a host leaves, or null if it stands: a meeting may be someone else's, and
 * their own office or link goes with them, to the hosts it has now.
 */
async function locationWithoutHost(
  tx: Executor,
  booking: BookingRow,
  hostId: string,
  hosts: readonly HostRow[],
): Promise<BookingRow["location"]> {
  const owner = await meetingOwnerOf(tx, booking);
  return owner && owner !== hostId ? null : locationForNewHost(booking.location, hostId, hosts);
}

/** Once hosts have won, a location left open takes the value of theirs. */
async function settleHostLocation(
  tx: Executor,
  booking: BookingRow,
  hosts: readonly HostRow[],
): Promise<BookingRow> {
  if (!booking.location) return booking;
  const location = withHostLocation(booking.location, hosts);
  if (location === booking.location) return booking;
  await tx
    .update(schedulingBooking)
    .set({ location })
    .where(
      and(
        eq(schedulingBooking.id, booking.id),
        eq(schedulingBooking.organizationId, booking.organizationId),
      ),
    );
  return { ...booking, location };
}

function chooseLocation(
  eventType: EventTypeRow,
  wanted: Location | undefined,
  fromBrowser = false,
): Location | null {
  const location = wanted ?? eventType.locations[0] ?? null;
  // Its link comes from the meeting we create, never from whoever's booking.
  if (location?.type === "zoom" && eventType.locations.some((l) => l.type === "zoom")) {
    return { type: "zoom", url: null };
  }
  if (!wanted) return location;
  const offered = eventType.locations.find((location) => location.type === wanted.type);
  if (!offered) {
    throw new SchedulingError(
      "invalid_event_type",
      `This event type doesn't offer the location "${wanted.type}".`,
      { param: "location" },
    );
  }
  if (!fromBrowser) return wanted;
  // A browser picks among what's offered. It can't supply a link or address of its own, only the
  // number to call it on when the event type leaves that open.
  if (offered.type === "phone" && wanted.type === "phone" && !offered.number) return wanted;
  return offered;
}

function checkBookableEventType(eventType: EventTypeRow, durationMinutes: number): void {
  if (eventType.status !== "active") {
    throw new SchedulingError("not_found", "This event type is archived.");
  }
  if (
    durationMinutes !== eventType.durationMinutes &&
    !eventType.durationOptions.includes(durationMinutes)
  ) {
    throw new SchedulingError(
      "invalid_time",
      `${durationMinutes} minutes isn't one of this event type's durations.`,
      { param: "duration_minutes" },
    );
  }
}

function checkStart(startMs: number): void {
  if (!Number.isFinite(startMs)) {
    throw new SchedulingError("invalid_time", "`start` isn't a valid time.", { param: "start" });
  }
}

// Whoever's booking doesn't get to read that someone's out of office, least of all an attendee.
const slotLost = (reason?: string) =>
  new SchedulingError(
    "slot_unavailable",
    // Neither says anything a booker should learn: that someone's away, or who's covering for them.
    reason && reason !== "out_of_office" && reason !== "outside_coverage"
      ? `That time isn't available (${reason}).`
      : "That time isn't available.",
    { param: "start" },
  );

async function lockHostsAndMemberships(
  tx: Executor,
  eventType: EventTypeRow,
  hostIds: readonly string[],
  /** Someone named a host past membership, who may have been taken off it (`any_host`). */
  opts: { evenIfRemoved?: boolean } = {},
): Promise<void> {
  const sorted = [...hostIds].sort();
  const active = await tx
    .select({ id: schedulingHost.id })
    .from(schedulingHost)
    .where(
      and(
        inArray(schedulingHost.id, sorted),
        eq(schedulingHost.organizationId, eventType.organizationId),
        eq(schedulingHost.status, "active"),
      ),
    )
    .orderBy(asc(schedulingHost.id))
    .for("share");
  if (active.length !== sorted.length) throw new LostSlot("host_unavailable");
  for (const hostId of sorted) {
    await tx
      .insert(schedulingEventTypeHost)
      .values({
        eventTypeId: eventType.id,
        hostId,
        organizationId: eventType.organizationId,
        assigned: false,
      })
      .onConflictDoNothing();
  }
  const memberships = await tx
    .select({ hostId: schedulingEventTypeHost.hostId })
    .from(schedulingEventTypeHost)
    .where(
      and(
        eq(schedulingEventTypeHost.eventTypeId, eventType.id),
        eq(schedulingEventTypeHost.organizationId, eventType.organizationId),
        inArray(schedulingEventTypeHost.hostId, sorted),
        opts.evenIfRemoved ? undefined : isNull(schedulingEventTypeHost.removedAt),
      ),
    )
    .orderBy(asc(schedulingEventTypeHost.hostId))
    // Not `share`: the fairness update later would then deadlock with another booker's lock on
    // the same row, each waiting on the other's claim. Removal takes `update`, which still waits.
    .for("key share");
  if (memberships.length !== sorted.length) throw new LostSlot("host_unavailable");
}

async function lockLimitBuckets(
  tx: Executor,
  eventType: EventTypeRow,
  rule: SlotRule,
  hosts: readonly HostRow[],
  startMs: number,
): Promise<void> {
  if (rule.limits.length === 0) return;
  const keys = new Set<string>();
  for (const host of hosts) {
    for (const limit of rule.limits) {
      const scopeId = limit.scope === "host" ? host.id : `${host.id}:${eventType.id}`;
      keys.add(`${limit.scope}|${scopeId}|${limitUsageKey(limit, host.timeZone, startMs)}`);
    }
  }
  for (const key of [...keys].sort()) {
    const [scope, scopeId, period] = key.split("|") as [string, string, string];
    await tx
      .insert(schedulingLimitBucket)
      .values({ organizationId: eventType.organizationId, scope, scopeId, period })
      .onConflictDoNothing();
    await tx
      .select({ scopeId: schedulingLimitBucket.scopeId })
      .from(schedulingLimitBucket)
      .where(
        and(
          eq(schedulingLimitBucket.scope, scope),
          eq(schedulingLimitBucket.scopeId, scopeId),
          eq(schedulingLimitBucket.period, period),
        ),
      )
      .for("update");
  }
}

export type ClaimPlan = {
  eventType: EventTypeRow;
  rule: SlotRule;
  scope: Scope;
  startMs: number;
  nowMs: number;
  failureMode: "hide" | "last_known";
  ttlSeconds: number | null;
  /** Reassigning: what a booking that exists doesn't have to answer again, and any overrides. */
  skip?: readonly NotBookableReason[] | undefined;
  /** Who's only standing in for someone, and when. */
  coverage?: ReadonlyMap<string, readonly Interval[]> | undefined;
};

/** What's committed now says about each host. Null: not found. */
async function verdictsOf(
  executor: Executor,
  plan: ClaimPlan,
  hosts: readonly HostRow[],
  schedules: ReadonlyMap<string, string | null>,
) {
  const { eventType, rule, scope, startMs, nowMs } = plan;
  const loaded = await loadHostInputs(executor, {
    scope,
    hosts: hosts.map((host) => ({
      id: host.id,
      timeZone: host.timeZone,
      scheduleId: schedules.get(host.id) ?? null,
      onlyWithin: plan.coverage?.get(host.id),
    })),
    eventTypeId: eventType.id,
    fromMs: startMs,
    toMs: startMs + rule.durationMinutes * MINUTE_MS,
    nowMs,
    calendarFailureMode: plan.failureMode,
  });
  return new Map(
    hosts.map((host) => {
      const inputs = loaded.get(host.id);
      return [
        host.id,
        inputs ? isBookable(startMs, { nowMs, rule, host: inputs, skip: plan.skip }) : null,
      ];
    }),
  );
}

/** Claims every host for a non-group booking, or throws `LostSlot`. Runs inside a savepoint. */
async function claimHosts(
  tx: Transaction,
  plan: ClaimPlan,
  hosts: readonly HostRow[],
  bookingId: string,
  schedules: ReadonlyMap<string, string | null>,
): Promise<Date | null> {
  const { eventType, rule, startMs } = plan;
  const sorted = [...hosts].sort((a, b) => (a.id < b.id ? -1 : 1));
  await lockHostsAndMemberships(
    tx,
    eventType,
    sorted.map((host) => host.id),
  );
  await lockLimitBuckets(tx, eventType, rule, sorted, startMs);
  const verdicts = await verdictsOf(tx, plan, sorted, schedules);
  for (const host of sorted) {
    const verdict = verdicts.get(host.id);
    if (!verdict?.ok) throw new LostSlot(verdict?.reason ?? "host_unavailable");
  }
  const occupied = occupiedRange(startMs, rule);
  let liveUntil: Date | null = null;
  for (const host of sorted) {
    const claim = await tryClaim(tx, {
      organizationId: eventType.organizationId,
      environmentId: eventType.environmentId,
      hostId: host.id,
      hostTimeZone: host.timeZone,
      eventTypeId: eventType.id,
      owner: { bookingId },
      occupied,
      startMs,
      ttlSeconds: plan.ttlSeconds,
    });
    if (!claim) throw new LostSlot("already_claimed");
    if (claim.liveUntil && (!liveUntil || claim.liveUntil < liveUntil)) liveUntil = claim.liveUntil;
  }
  return liveUntil;
}

function schedulesOf(candidates: Candidates): Map<string, string | null> {
  return new Map(
    [...candidates.required, ...candidates.members].map((entry) => [
      entry.host.id,
      entry.membership?.scheduleId ?? null,
    ]),
  );
}

/** Who's only here standing in for someone, and when. */
function coverageWindows(candidates: Candidates): Map<string, Interval[]> {
  return new Map(
    candidates.members.flatMap((entry) =>
      entry.coverage ? [[entry.host.id, entry.coverage.windows] as const] : [],
    ),
  );
}

function ranked(candidates: Candidates, seed: string): HostRow[] {
  const members: PoolMember[] = candidates.members.map(({ host, membership, coverage }) => ({
    hostId: host.id,
    weight: membership?.weight ?? 100,
    fairUnits: membership?.fairUnits ?? 0,
    lastAssignedAtMs: membership?.lastAssignedAt?.getTime() ?? null,
    atLeastRatio: coverage?.principalRatio,
    coverPosition: coverage?.position,
  }));
  const byId = new Map(candidates.members.map((entry) => [entry.host.id, entry.host]));
  return rankCandidates(members, seed).map((id) => byId.get(id) as HostRow);
}

/** Tries each choice of member in rank order. Returns who won and when the claims expire. */
async function assignAndClaim(
  tx: Transaction,
  plan: ClaimPlan,
  candidates: Candidates,
  bookingId: string,
  seed: string,
): Promise<{ hosts: HostRow[]; liveUntil: Date | null }> {
  const required = candidates.required.map((entry) => entry.host);
  const schedules = schedulesOf(candidates);
  let choices: (HostRow | null)[] =
    candidates.members.length > 0 ? ranked(candidates, seed) : [null];
  if (required.length === 0 && candidates.members.length === 0) throw slotLost("no_hosts");
  let lastReason: string | undefined;
  let narrowed = false;
  while (choices.length > 0) {
    const [member, ...others] = choices as [HostRow | null, ...(HostRow | null)[]];
    choices = others;
    const hosts = member ? [...required, member] : required;
    try {
      const liveUntil = await inSavepoint(tx, (savepoint) =>
        claimHosts(savepoint, plan, hosts, bookingId, schedules),
      );
      return { hosts, liveUntil };
    } catch (error) {
      if (!(error instanceof LostSlot)) throw error;
      lastReason = error.reason;
    }
    // One read instead of an attempt per busy host. Each attempt still checks under its locks.
    if (!narrowed && choices.length > 1) {
      narrowed = true;
      const members = choices.filter((choice) => choice !== null);
      const verdicts = await verdictsOf(tx, plan, [...required, ...members], schedules);
      for (const host of required) {
        const verdict = verdicts.get(host.id);
        if (!verdict?.ok) throw slotLost(verdict?.reason ?? "host_unavailable");
      }
      choices = members.filter((choice) => verdicts.get(choice.id)?.ok);
    }
  }
  throw slotLost(lastReason);
}

function toWebhookData(
  booking: BookingRow,
  hostIds: readonly string[],
  attendeeUids: readonly string[],
  occurredAt: Date,
  extra: {
    previousStart?: Date | undefined;
    previousHostIds?: readonly string[] | undefined;
    reassignmentId?: string | undefined;
  } = {},
) {
  return {
    booking_id: booking.id,
    event_type_id: booking.eventTypeId,
    status: booking.status,
    start: booking.startAt.toISOString(),
    end: booking.endAt.toISOString(),
    host_ids: [...hostIds],
    attendee_uids: [...attendeeUids],
    series_id: booking.seriesId,
    ...(extra.previousStart ? { previous_start: extra.previousStart.toISOString() } : {}),
    ...(extra.previousHostIds ? { previous_host_ids: [...extra.previousHostIds] } : {}),
    ...(extra.reassignmentId ? { reassignment_id: extra.reassignmentId } : {}),
    occurred_at: occurredAt.toISOString(),
  };
}

async function participants(
  tx: Executor,
  booking: Pick<BookingRow, "id" | "organizationId">,
): Promise<{ hostIds: string[]; attendees: AttendeeRow[] }> {
  const hosts = await tx
    .select({ hostId: schedulingBookingHost.hostId })
    .from(schedulingBookingHost)
    .where(
      and(
        eq(schedulingBookingHost.bookingId, booking.id),
        eq(schedulingBookingHost.organizationId, booking.organizationId),
      ),
    )
    .orderBy(asc(schedulingBookingHost.hostId));
  const attendees = await tx
    .select()
    .from(schedulingAttendee)
    .where(
      and(
        eq(schedulingAttendee.bookingId, booking.id),
        eq(schedulingAttendee.organizationId, booking.organizationId),
      ),
    )
    .orderBy(asc(schedulingAttendee.role), asc(schedulingAttendee.id));
  return { hostIds: hosts.map((row) => row.hostId), attendees };
}

/**
 * What every change records: its history row (sequenced under the booking's lock), webhook and log
 * line. None of them carry a person's details.
 */
async function recordChange(
  tx: Executor,
  booking: BookingRow,
  input: {
    type: string;
    webhook: SchedulingWebhookEventType | null;
    actor: BookingActor;
    occurredAt: Date;
    details?: Record<string, unknown>;
    previousStart?: Date;
    previousHostIds?: readonly string[] | undefined;
    reassignmentId?: string | undefined;
    /** Why it was done, in someone's own words: on this row only, encrypted, gone with the details. */
    encryptedNote?: string | null;
    message: string;
    level?: "info" | "warning";
  },
): Promise<void> {
  const [last] = await tx
    .select({ sequence: schedulingBookingEvent.sequence })
    .from(schedulingBookingEvent)
    .where(
      and(
        eq(schedulingBookingEvent.bookingId, booking.id),
        eq(schedulingBookingEvent.organizationId, booking.organizationId),
      ),
    )
    .orderBy(desc(schedulingBookingEvent.sequence))
    .limit(1);
  await tx.insert(schedulingBookingEvent).values({
    organizationId: booking.organizationId,
    bookingId: booking.id,
    sequence: (last?.sequence ?? 0) + 1,
    type: input.type,
    actor: input.actor,
    details: input.details ?? {},
    encryptedNote: input.encryptedNote ?? null,
    occurredAt: input.occurredAt,
  });
  const { hostIds, attendees } = await participants(tx, booking);
  if (input.webhook) {
    const id = newId(ID_PREFIXES.webhookEvent);
    await enqueueWebhookMessage(tx, {
      id,
      organizationId: booking.organizationId,
      environmentId: booking.environmentId,
      type: input.webhook,
      payload: {
        id,
        object: "event",
        type: input.webhook,
        created_at: input.occurredAt.toISOString(),
        data: toWebhookData(
          booking,
          hostIds,
          attendees.flatMap((attendee) => (attendee.uid ? [attendee.uid] : [])),
          input.occurredAt,
          {
            previousStart: input.previousStart,
            previousHostIds: input.previousHostIds,
            reassignmentId: input.reassignmentId,
          },
        ),
      },
    });
  }
  await appendLogEntries(tx, [
    {
      organizationId: booking.organizationId,
      projectId: booking.projectId,
      environmentId: booking.environmentId,
      occurredAt: input.occurredAt,
      source: "scheduling",
      level: input.level ?? "info",
      type: input.type,
      message: input.message,
      resourceType: "scheduling_booking",
      resourceId: booking.id,
      attributes: {
        event_type_id: booking.eventTypeId,
        status: booking.status,
        host_ids: hostIds,
        start: booking.startAt.toISOString(),
      },
      searchTerms: [booking.eventTypeId, ...hostIds],
    },
  ]);
}

/** One unit per confirmed booking, or per group session. Sandbox bookings aren't billed. */
async function chargeOnce(
  tx: Executor,
  env: { mode: "live" | "sandbox" },
  booking: BookingRow,
  deps: SchedulingDeps,
): Promise<void> {
  if (env.mode === "sandbox") return;
  const at = sql`clock_timestamp()`;
  const charged = booking.groupSessionId
    ? await tx
        .update(schedulingGroupSession)
        .set({ usageRecordedAt: at })
        .where(
          and(
            eq(schedulingGroupSession.id, booking.groupSessionId),
            eq(schedulingGroupSession.organizationId, booking.organizationId),
            isNull(schedulingGroupSession.usageRecordedAt),
          ),
        )
        .returning({ id: schedulingGroupSession.id })
    : await tx
        .update(schedulingBooking)
        .set({ usageRecordedAt: at })
        .where(
          and(
            eq(schedulingBooking.id, booking.id),
            eq(schedulingBooking.organizationId, booking.organizationId),
            isNull(schedulingBooking.usageRecordedAt),
          ),
        )
        .returning({ id: schedulingBooking.id });
  if (charged.length === 0) return;
  await deps.billing?.reserve(tx, {
    organizationId: booking.organizationId,
    meter: "scheduling.bookings",
    quantity: 1,
  });
  await recordUsage(tx, {
    organizationId: booking.organizationId,
    environmentId: booking.environmentId,
    projectId: booking.projectId,
    meter: "scheduling.bookings",
    quantity: 1,
  });
}

async function assignFairly(
  tx: Executor,
  booking: Pick<BookingRow, "eventTypeId" | "organizationId">,
  hostIds: readonly string[],
  delta: 1 | -1,
): Promise<void> {
  if (hostIds.length === 0) return;
  await tx
    .update(schedulingEventTypeHost)
    .set({
      fairUnits: sql`greatest(${schedulingEventTypeHost.fairUnits} + ${delta}, 0)`,
      ...(delta > 0 ? { lastAssignedAt: sql`clock_timestamp()` } : {}),
    })
    .where(
      and(
        eq(schedulingEventTypeHost.eventTypeId, booking.eventTypeId),
        eq(schedulingEventTypeHost.organizationId, booking.organizationId),
        inArray(schedulingEventTypeHost.hostId, [...hostIds].sort()),
      ),
    );
}

/** What each host's calendar should now show. A seat's event is its session's. The worker converges. */
async function setCalendarState(
  tx: Executor,
  booking: BookingRow,
  hostIds: readonly string[],
  state: "present" | "absent",
): Promise<void> {
  if (hostIds.length === 0) return;
  const sessionId = booking.groupSessionId;
  if (state === "absent") {
    // Whatever these hosts' events are on now, which may not be where they'd be written today.
    await tx
      .update(schedulingCalendarEvent)
      .set({
        desiredState: "absent",
        desiredVersion: sql`${schedulingCalendarEvent.desiredVersion} + 1`,
        nextAttemptAt: sql`clock_timestamp()`,
        attempts: 0,
      })
      .where(
        and(
          sessionId
            ? eq(schedulingCalendarEvent.groupSessionId, sessionId)
            : eq(schedulingCalendarEvent.bookingId, booking.id),
          eq(schedulingCalendarEvent.organizationId, booking.organizationId),
          inArray(schedulingCalendarEvent.hostId, [...hostIds]),
          eq(schedulingCalendarEvent.desiredState, "present"),
        ),
      );
    return;
  }
  const calendars = await tx
    .select({
      id: schedulingCalendar.id,
      hostId: schedulingCalendar.hostId,
      writeTarget: schedulingCalendar.writeTarget,
      externalId: schedulingCalendar.externalId,
      provider: schedulingCalendarConnection.provider,
    })
    .from(schedulingCalendar)
    .innerJoin(
      schedulingCalendarConnection,
      eq(schedulingCalendarConnection.id, schedulingCalendar.connectionId),
    )
    .where(
      and(
        eq(schedulingCalendar.organizationId, booking.organizationId),
        inArray(schedulingCalendar.hostId, [...hostIds]),
        or(
          eq(schedulingCalendar.writeTarget, true),
          eq(schedulingCalendar.externalId, ZOOM_CALENDAR_ID),
        ),
      ),
    )
    .orderBy(asc(schedulingCalendar.hostId));
  const targets = calendars.filter((calendar) => calendar.writeTarget);
  if (booking.location?.type === "zoom") {
    // One meeting however many hosts there are: whoever runs it now, or the first with Zoom connected.
    const zooms = calendars.filter((calendar) => calendar.externalId === ZOOM_CALENDAR_ID);
    const owner = await meetingOwnerOf(tx, booking);
    const meeting = zooms.find((calendar) => calendar.hostId === owner) ?? zooms[0];
    if (meeting) targets.push(meeting);
    else if (!booking.location.url && !targets.some((target) => target.provider === "simulated")) {
      await announce(
        tx,
        booking,
        "scheduling.booking.calendar_write_failed",
        "This booking's host has no Zoom account connected, so it has no meeting link",
        new Date(),
      );
    }
  }
  // A session can come back after its event went, and a provider's key doesn't work twice.
  if (sessionId) {
    await tx
      .delete(schedulingCalendarEvent)
      .where(
        and(
          eq(schedulingCalendarEvent.groupSessionId, sessionId),
          eq(schedulingCalendarEvent.organizationId, booking.organizationId),
          eq(schedulingCalendarEvent.desiredState, "absent"),
          isNull(schedulingCalendarEvent.providerEventId),
          sql`${schedulingCalendarEvent.appliedVersion} = ${schedulingCalendarEvent.desiredVersion}`,
        ),
      );
  }
  for (const target of targets) {
    await tx
      .insert(schedulingCalendarEvent)
      .values({
        organizationId: booking.organizationId,
        environmentId: booking.environmentId,
        ...(sessionId ? { groupSessionId: sessionId } : { bookingId: booking.id }),
        hostId: target.hostId,
        calendarId: target.id,
        desiredStart: booking.startAt,
        desiredEnd: booking.endAt,
        desiredState: state,
      })
      .onConflictDoUpdate({
        target: [
          sessionId ? schedulingCalendarEvent.groupSessionId : schedulingCalendarEvent.bookingId,
          schedulingCalendarEvent.hostId,
          schedulingCalendarEvent.calendarId,
        ],
        set: {
          desiredStart: booking.startAt,
          desiredEnd: booking.endAt,
          desiredState: state,
          desiredVersion: sql`${schedulingCalendarEvent.desiredVersion} + 1`,
          nextAttemptAt: sql`clock_timestamp()`,
          attempts: 0,
        },
      });
  }
}

type NewBookingContext = {
  env: SchedulingEnvironment;
  eventType: EventTypeRow;
  deps: SchedulingDeps;
  actor: BookingActor;
  now: Date;
};

type FinishedState = "held" | "pending_approval" | "confirmed";
type NotifiableStatus = "pending_approval" | "confirmed";

async function insertBookingRow(
  tx: Executor,
  context: NewBookingContext,
  request: BookingRequest,
  values: {
    id?: string;
    status: FinishedState;
    startMs: number;
    durationMinutes: number;
    ttlSeconds: number | null;
    location: Location | null;
    hash: string | null;
    idempotencyKey: string | null;
    seriesId?: string | null;
    seriesIndex?: number | null;
  },
): Promise<BookingRow | undefined> {
  const { env, eventType } = context;
  const expiresAt = values.ttlSeconds
    ? new Date(context.now.getTime() + values.ttlSeconds * 1000)
    : null;
  const [row] = await tx
    .insert(schedulingBooking)
    .values({
      ...(values.id ? { id: values.id } : {}),
      organizationId: env.organizationId,
      projectId: env.projectId,
      environmentId: env.environmentId,
      eventTypeId: eventType.id,
      status: values.status,
      startAt: new Date(values.startMs),
      endAt: new Date(values.startMs + values.durationMinutes * MINUTE_MS),
      title: eventType.title,
      bufferBeforeMinutes: eventType.bufferBeforeMinutes,
      bufferAfterMinutes: eventType.bufferAfterMinutes,
      location: eventType.kind === "group" ? null : values.location,
      holdExpiresAt: values.status === "held" ? expiresAt : null,
      approvalExpiresAt: values.status === "pending_approval" ? expiresAt : null,
      seriesId: values.seriesId ?? null,
      seriesIndex: values.seriesIndex ?? null,
      metadata: request.metadata ?? {},
      encryptedAttributes: encryptRouting(request.attributes, context.deps),
      idempotencyKey: values.idempotencyKey,
      requestHash: values.hash,
    })
    .onConflictDoNothing({
      target: [schedulingBooking.environmentId, schedulingBooking.idempotencyKey],
    })
    .returning();
  return row;
}

async function insertAttendeeRow(
  tx: Executor,
  booking: BookingRow,
  request: BookingRequest,
  deps: SchedulingDeps,
): Promise<void> {
  await tx.insert(schedulingAttendee).values({
    organizationId: booking.organizationId,
    environmentId: booking.environmentId,
    bookingId: booking.id,
    uid: request.attendee.uid ?? null,
    ...encryptContact(request.attendee, deps),
    encryptedAnswers: encryptAnswers(request.answers, deps),
    timeZone: request.attendee.time_zone,
    locale: request.attendee.locale ?? null,
  });
  if (!request.guests?.length) return;
  // Shown the booking in the attendee's zone and language: nobody's asked for a guest's.
  await tx.insert(schedulingAttendee).values(
    request.guests.map((guest) => ({
      organizationId: booking.organizationId,
      environmentId: booking.environmentId,
      bookingId: booking.id,
      role: "guest" as const,
      ...encryptContact({ ...guest, time_zone: request.attendee.time_zone }, deps),
      timeZone: request.attendee.time_zone,
      locale: request.attendee.locale ?? null,
    })),
  );
}

/** Sets the real expiry (from the claim's clock) and the hosts, once a host has won. */
async function finishBookingRow(
  tx: Executor,
  booking: BookingRow,
  hosts: readonly HostRow[],
  candidates: Candidates,
  liveUntil: Date | null,
): Promise<BookingRow> {
  await tx.insert(schedulingBookingHost).values(
    hosts.map((host) => ({
      bookingId: booking.id,
      hostId: host.id,
      organizationId: booking.organizationId,
      role: candidates.required.some((entry) => entry.host.id === host.id)
        ? ("required" as const)
        : ("member" as const),
    })),
  );
  if (!liveUntil) return booking;
  const [row] = await tx
    .update(schedulingBooking)
    .set(
      booking.status === "held" ? { holdExpiresAt: liveUntil } : { approvalExpiresAt: liveUntil },
    )
    .where(
      and(
        eq(schedulingBooking.id, booking.id),
        eq(schedulingBooking.organizationId, booking.organizationId),
      ),
    )
    .returning();
  return row as BookingRow;
}

/** Joins a group session, starting it if needed. Capacity is counted under the session's lock. */
async function joinGroupSession(
  tx: Transaction,
  plan: ClaimPlan,
  booking: BookingRow,
  host: HostRow,
  scheduleId: string | null,
  location: { chosen: Location | null; wanted: Location | undefined },
): Promise<{ sessionId: string; liveUntil: Date | null }> {
  const { eventType, rule, startMs, scope, nowMs } = plan;
  await lockHostsAndMemberships(tx, eventType, [host.id]);
  await lockLimitBuckets(tx, eventType, rule, [host], startMs);
  const startAt = new Date(startMs);
  await tx
    .insert(schedulingGroupSession)
    .values({
      organizationId: eventType.organizationId,
      environmentId: eventType.environmentId,
      eventTypeId: eventType.id,
      hostId: host.id,
      startAt,
      endAt: new Date(startMs + rule.durationMinutes * MINUTE_MS),
      capacity: eventType.capacity as number,
    })
    .onConflictDoNothing();
  const [session] = await tx
    .select()
    .from(schedulingGroupSession)
    .where(
      and(
        eq(schedulingGroupSession.eventTypeId, eventType.id),
        eq(schedulingGroupSession.hostId, host.id),
        eq(schedulingGroupSession.startAt, startAt),
        eq(schedulingGroupSession.organizationId, eventType.organizationId),
      ),
    )
    .for("update");
  if (!session) throw new LostSlot("host_unavailable");
  const [claimed] = await tx
    .select({ id: schedulingClaim.id, liveUntil: schedulingClaim.liveUntil })
    .from(schedulingClaim)
    .where(
      and(
        eq(schedulingClaim.groupSessionId, session.id),
        eq(schedulingClaim.organizationId, eventType.organizationId),
      ),
    );
  const liveSeats = await liveSeatCount(tx, session);
  if (liveSeats >= session.capacity) throw new LostSlot("session_full");
  // A running session isn't re-checked below, and its host's still away if they went after it began.
  const endMs = startMs + rule.durationMinutes * MINUTE_MS;
  const away = await hostsAwayDuring(tx, eventType, [host.id], startMs, endMs);
  if (away.has(host.id)) throw new LostSlot("out_of_office");
  const covering = plan.coverage?.get(host.id);
  if (covering && !overlapsAny(covering, startMs, endMs)) throw new LostSlot("outside_coverage");
  await settleSessionLocation(tx, session, liveSeats, location);
  const ttlSeconds = plan.ttlSeconds;
  const sessionClaim = { organizationId: eventType.organizationId, groupSessionId: session.id };
  let liveUntil: Date | null = null;
  if (!claimed || liveSeats === 0) {
    if (claimed) await releaseSessionClaim(tx, sessionClaim);
    const loaded = await loadHostInputs(tx, {
      scope,
      hosts: [{ id: host.id, timeZone: host.timeZone, scheduleId, onlyWithin: covering }],
      eventTypeId: eventType.id,
      fromMs: startMs,
      toMs: startMs + rule.durationMinutes * MINUTE_MS,
      nowMs,
      groupSessions: true,
      calendarFailureMode: plan.failureMode,
    });
    const inputs = loaded.get(host.id);
    const verdict = inputs ? isBookable(startMs, { nowMs, rule, host: inputs }) : null;
    if (!verdict?.ok) throw new LostSlot(verdict?.reason ?? "host_unavailable");
    const claim = await tryClaim(tx, {
      organizationId: eventType.organizationId,
      environmentId: eventType.environmentId,
      hostId: host.id,
      hostTimeZone: host.timeZone,
      eventTypeId: eventType.id,
      owner: { groupSessionId: session.id },
      occupied: occupiedRange(startMs, rule),
      startMs,
      ttlSeconds,
    });
    if (!claim) throw new LostSlot("already_claimed");
    liveUntil = claim.liveUntil;
  } else if (claimed.liveUntil) {
    // Every seat so far is a hold: the claim now lasts as long as the longest of them.
    if (ttlSeconds === null) await makeClaimPermanent(tx, sessionClaim);
    else liveUntil = await extendSessionClaim(tx, sessionClaim, ttlSeconds);
  }
  await tx
    .update(schedulingBooking)
    .set({ groupSessionId: session.id })
    .where(
      and(
        eq(schedulingBooking.id, booking.id),
        eq(schedulingBooking.organizationId, booking.organizationId),
      ),
    );
  return { sessionId: session.id, liveUntil };
}

const isLiveSeat = () =>
  or(
    eq(schedulingBooking.status, "confirmed"),
    and(
      eq(schedulingBooking.status, "pending_approval"),
      or(
        isNull(schedulingBooking.approvalExpiresAt),
        sql`${schedulingBooking.approvalExpiresAt} > clock_timestamp()`,
      ),
    ),
    and(
      eq(schedulingBooking.status, "held"),
      sql`${schedulingBooking.holdExpiresAt} > clock_timestamp()`,
    ),
  );

async function liveSeatCount(
  tx: Executor,
  session: { id: string; organizationId: string },
  except?: string,
): Promise<number> {
  const [row] = await tx
    .select({ seats: sql<number>`count(*)::int` })
    .from(schedulingBooking)
    .where(
      and(
        eq(schedulingBooking.groupSessionId, session.id),
        eq(schedulingBooking.organizationId, session.organizationId),
        except ? ne(schedulingBooking.id, except) : undefined,
        isLiveSeat(),
      ),
    );
  return row?.seats ?? 0;
}

/** The first seat of a session says where it meets, and everyone after is told the same. */
async function settleSessionLocation(
  tx: Executor,
  session: typeof schedulingGroupSession.$inferSelect,
  liveSeats: number,
  { chosen, wanted }: { chosen: Location | null; wanted: Location | undefined },
): Promise<void> {
  if (liveSeats > 0 && session.location) {
    if (wanted && wanted.type !== session.location.type) {
      throw new SchedulingError(
        "invalid_event_type",
        `This session already meets by "${session.location.type}".`,
        { param: "location" },
      );
    }
    return;
  }
  await tx
    .update(schedulingGroupSession)
    .set({ location: chosen, meetingUrl: null })
    .where(
      and(
        eq(schedulingGroupSession.id, session.id),
        eq(schedulingGroupSession.organizationId, session.organizationId),
      ),
    );
}

/** Other attendees will see this, so a browser's values and one attendee's own number stay out. */
function sharedLocation(
  eventType: EventTypeRow,
  chosen: Location | null,
  fromBrowser: boolean | undefined,
): Location | null {
  if (!chosen) return null;
  if (!fromBrowser && chosen.type !== "phone") return chosen;
  return eventType.locations.find((location) => location.type === chosen.type) ?? chosen;
}

/** A seat left: the session's claim goes with its last seat, and stops being firm with its last confirmed one. */
async function leaveGroupSession(tx: Executor, booking: BookingRow): Promise<void> {
  if (!booking.groupSessionId) return;
  const [session] = await tx
    .select()
    .from(schedulingGroupSession)
    .where(
      and(
        eq(schedulingGroupSession.id, booking.groupSessionId),
        eq(schedulingGroupSession.organizationId, booking.organizationId),
      ),
    )
    .for("update");
  if (!session) return;
  const sessionClaim = { organizationId: session.organizationId, groupSessionId: session.id };
  const [seats] = await tx
    .select({
      live: sql<number>`count(*)::int`,
      confirmed: sql<number>`(count(*) filter (where ${schedulingBooking.status} = 'confirmed'))::int`,
      until:
        sql<Date | null>`max(greatest(${schedulingBooking.holdExpiresAt}, ${schedulingBooking.approvalExpiresAt}))`.mapWith(
          schedulingBooking.holdExpiresAt,
        ),
    })
    .from(schedulingBooking)
    .where(
      and(
        eq(schedulingBooking.groupSessionId, session.id),
        eq(schedulingBooking.organizationId, session.organizationId),
        isLiveSeat(),
      ),
    );
  if (!seats?.live) {
    await releaseSessionClaim(tx, sessionClaim);
  } else if (!seats.confirmed && seats.until) {
    await limitSessionClaim(tx, sessionClaim, seats.until);
  }
}

function chooseStatus(eventType: EventTypeRow, wantHold: boolean): FinishedState {
  if (wantHold) return "held";
  return eventType.requiresApproval ? "pending_approval" : "confirmed";
}

function ttlFor(eventType: EventTypeRow, status: FinishedState): number | null {
  if (status === "held") return eventType.holdTtlSeconds;
  if (status === "pending_approval") return eventType.approvalTtlMinutes * 60;
  return null;
}

const WEBHOOK_OF_STATUS = {
  confirmed: "scheduling.booking.confirmed",
  pending_approval: "scheduling.booking.pending_approval",
  held: null,
} as const;

const MESSAGE_OF_STATUS = {
  confirmed: "Booking confirmed",
  pending_approval: "Booking awaiting approval",
  held: "Slot held",
} as const;

async function createOne(
  tx: Transaction,
  context: NewBookingContext,
  request: BookingRequest,
  booking: BookingRow,
  candidates: Candidates,
  plan: ClaimPlan,
): Promise<BookingRow> {
  const { env, eventType, deps, actor, now } = context;
  await insertAttendeeRow(tx, booking, request, deps);
  let won: { hosts: HostRow[]; liveUntil: Date | null };
  let current = booking;
  if (eventType.kind === "group") {
    // A group has one host, but someone may be standing in: whoever can have this time, in order.
    const entries = [...candidates.members, ...candidates.required];
    if (entries.length === 0) throw slotLost("no_hosts");
    const shared = sharedLocation(
      eventType,
      chooseLocation(eventType, request.location),
      request.locationFromBrowser,
    );
    let lost: string | undefined;
    let joined: { host: HostRow; liveUntil: Date | null; sessionId: string } | null = null;
    for (const entry of entries) {
      try {
        const session = await tx.transaction((savepoint) =>
          joinGroupSession(
            savepoint,
            plan,
            booking,
            entry.host,
            entry.membership?.scheduleId ?? null,
            {
              chosen: shared && withHostLocation(shared, [entry.host]),
              wanted: request.location,
            },
          ),
        );
        joined = { host: entry.host, ...session };
        break;
      } catch (error) {
        if (!(error instanceof LostSlot)) throw error;
        lost = error.reason;
      }
    }
    if (!joined) throw slotLost(lost);
    won = { hosts: [joined.host], liveUntil: joined.liveUntil };
    current = { ...booking, groupSessionId: joined.sessionId };
  } else {
    won = await assignAndClaim(tx, plan, candidates, booking.id, booking.id);
    current = await settleHostLocation(tx, current, won.hosts);
  }
  current = await finishBookingRow(tx, current, won.hosts, candidates, won.liveUntil);
  const memberIds = won.hosts
    .filter((host) => candidates.members.some((entry) => entry.host.id === host.id))
    .map((host) => host.id);
  if (eventType.kind === "pool") await assignFairly(tx, current, memberIds, 1);
  const hostIds = won.hosts.map((host) => host.id);
  if (current.status === "confirmed") {
    await showOnCalendars(tx, current, hostIds);
    await chargeOnce(tx, env, current, deps);
  }
  await recordChange(tx, current, {
    type: `scheduling.booking.${current.status}`,
    webhook: WEBHOOK_OF_STATUS[current.status as FinishedState],
    actor,
    occurredAt: now,
    message: MESSAGE_OF_STATUS[current.status as FinishedState],
  });
  if (current.status !== "held") {
    await enqueueBookingNotifications(tx, current, current.status as NotifiableStatus, now);
  }
  return current;
}

/** A newly confirmed booking goes on its hosts' calendars; a seat only if it's the session's first. */
async function showOnCalendars(
  tx: Executor,
  booking: BookingRow,
  hostIds: readonly string[],
): Promise<void> {
  if (booking.groupSessionId) {
    const seats = await confirmedSeats(tx, {
      id: booking.groupSessionId,
      organizationId: booking.organizationId,
    });
    if (seats.some((seat) => seat.id !== booking.id)) return;
  }
  await setCalendarState(tx, booking, hostIds, "present");
}

/** Everything about a booking, with attendees decrypted; answers only when asked for. */
export async function toBookingObject(
  executor: Executor,
  booking: BookingRow,
  deps: Pick<SchedulingDeps, "dataKeys">,
  opts: { includeAnswers?: boolean } = {},
): Promise<BookingObjectOutput> {
  const { hostIds, attendees } = await participants(executor, booking);
  const { location } = await withSessionLocation(executor, booking);
  return {
    object: "scheduling.booking",
    id: booking.id,
    event_type: booking.eventTypeId,
    status: booking.status,
    title: booking.title,
    start: booking.startAt.toISOString(),
    end: booking.endAt.toISOString(),
    hosts: hostIds,
    attendees: attendees.map((attendee) => {
      const contact = decryptContact(attendee.encryptedContact, deps);
      return {
        id: attendee.id,
        role: attendee.role,
        uid: attendee.uid,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        time_zone: attendee.timeZone,
        locale: attendee.locale,
        ...(opts.includeAnswers
          ? { answers: decryptAnswers(attendee.encryptedAnswers, deps) }
          : {}),
      };
    }),
    location: wireLocation(location) as BookingObjectOutput["location"],
    hold_expires_at: booking.holdExpiresAt?.toISOString() ?? null,
    approval_expires_at: booking.approvalExpiresAt?.toISOString() ?? null,
    series: booking.seriesId,
    series_index: booking.seriesIndex,
    group_session: booking.groupSessionId,
    calendar_unverified: booking.calendarUnverified,
    external_conflict_at: booking.externalConflictAt?.toISOString() ?? null,
    no_show_at: booking.noShowAt?.toISOString() ?? null,
    cancelled_at: booking.cancelledAt?.toISOString() ?? null,
    metadata: booking.metadata,
    created_at: booking.createdAt.toISOString(),
    updated_at: booking.updatedAt.toISOString(),
  };
}

/**
 * Drops hosts the provider says became busy since the last sync: the top few of a pool, since
 * asking everyone would make booking as slow as the slowest calendar. A required host that's busy
 * loses the slot outright.
 */
async function withLiveCheck(
  env: SchedulingEnvironment,
  candidates: Candidates,
  plan: ClaimPlan,
  seed: string,
  deps: SchedulingDeps,
): Promise<Candidates> {
  if (!deps.calendars) return candidates;
  // Only ones who could take it: this makes a few paid requests, so none go on someone who's away.
  const away = await hostsAwayDuring(
    db,
    env,
    candidates.members.map((entry) => entry.host.id),
    plan.startMs,
    plan.startMs + plan.rule.durationMinutes * MINUTE_MS,
  );
  const present = {
    required: candidates.required,
    members: candidates.members.filter((entry) => !away.has(entry.host.id)),
  };
  const top = ranked(present, seed).slice(0, LIVE_CHECK_CANDIDATES);
  const hostIds = [
    ...candidates.required.map((entry) => entry.host.id),
    ...top.map((host) => host.id),
  ];
  const occupied = occupiedRange(plan.startMs, plan.rule);
  const busy = await hostsBusyNow(
    env.organizationId,
    hostIds,
    occupied.startMs,
    occupied.endMs,
    deps.calendars,
  );
  if (busy.size === 0) return candidates;
  if (candidates.required.some((entry) => busy.has(entry.host.id))) throw slotLost("host_busy");
  const members = candidates.members.filter((entry) => !busy.has(entry.host.id));
  if (candidates.members.length > 0 && members.length === 0) throw slotLost("host_busy");
  return { required: candidates.required, members };
}

const idempotencyErrors = {
  inProgress: () =>
    new SchedulingError("idempotency_in_progress", "A request with this key is still running."),
  reused: () =>
    new SchedulingError(
      "idempotency_key_reused",
      "This Idempotency-Key was used with a different request.",
    ),
};

async function book(
  env: SchedulingEnvironment,
  request: BookingRequest,
  deps: SchedulingDeps,
  actor: BookingActor,
  wantHold: boolean,
): Promise<{ booking: BookingObjectOutput; replayed: boolean }> {
  checkStart(request.startMs);
  checkAttendee(request.attendee);
  const eventType = await resolveEventType(db, env, request.eventType);
  const durationMinutes = request.durationMinutes ?? eventType.durationMinutes;
  checkBookableEventType(eventType, durationMinutes);
  checkAnswers(eventType, request.answers);
  checkGuests(eventType, request.attendee, request.guests);
  const location = chooseLocation(eventType, request.location, request.locationFromBrowser);
  const status = chooseStatus(eventType, wantHold);
  const ttlSeconds = ttlFor(eventType, status);
  const now = nowOf(deps);
  const failureMode = await calendarFailureModeOf(db, env);
  const candidates = await candidatesOf(db, env, eventType, {
    hostRef: request.host,
    attributes: request.attributes,
  });
  const rule = slotRuleOf(eventType, durationMinutes);
  const plan: ClaimPlan = {
    eventType,
    rule,
    scope: env,
    startMs: request.startMs,
    nowMs: now.getTime(),
    failureMode,
    ttlSeconds,
    coverage: coverageWindows(candidates),
  };
  const context: NewBookingContext = { env, eventType, deps, actor, now };
  const hash = hashRequest({ wantHold, request: { ...request, idempotencyKey: undefined } });
  const checked = await withLiveCheck(env, candidates, plan, request.idempotencyKey ?? hash, deps);

  const run = (tx: Transaction, key: string | null) =>
    (async (): Promise<BookingRow | undefined> => {
      const inserted = await insertBookingRow(tx, context, request, {
        status,
        startMs: request.startMs,
        durationMinutes,
        ttlSeconds,
        location,
        hash: key ? hash : null,
        idempotencyKey: key,
      });
      if (!inserted) return undefined;
      return createOne(tx, context, request, inserted, checked, plan);
    })();

  const key = request.idempotencyKey ?? null;
  const { row, replayed } = key
    ? await retryingDeadlocks(() =>
        withIdempotencyKey<BookingRow>({
          requestHash: hash,
          insert: (tx) => run(tx, key),
          existing: async () => {
            const [existing] = await db
              .select()
              .from(schedulingBooking)
              .where(
                and(
                  eq(schedulingBooking.organizationId, env.organizationId),
                  eq(schedulingBooking.environmentId, env.environmentId),
                  eq(schedulingBooking.idempotencyKey, key),
                ),
              );
            return existing;
          },
          release: (tx, existing) =>
            tx
              .update(schedulingBooking)
              .set({ idempotencyKey: null })
              .where(
                and(
                  eq(schedulingBooking.id, existing.id),
                  eq(schedulingBooking.organizationId, existing.organizationId),
                  eq(schedulingBooking.idempotencyKey, key),
                ),
              ),
          errors: idempotencyErrors,
        }),
      )
    : {
        row: (await retryingDeadlocks(() =>
          db.transaction((tx) => run(tx, null) as Promise<BookingRow>),
        )) as BookingRow,
        replayed: false,
      };
  return { booking: await toBookingObject(db, row, deps), replayed };
}

export const createBooking = (
  env: SchedulingEnvironment,
  request: BookingRequest,
  deps: SchedulingDeps,
  actor: BookingActor,
) => book(env, request, deps, actor, false);

export const createHold = (
  env: SchedulingEnvironment,
  request: BookingRequest,
  deps: SchedulingDeps,
  actor: BookingActor,
) => book(env, request, deps, actor, true);

async function lockBooking(tx: Executor, scope: Scope, id: string): Promise<BookingRow> {
  if (!isId(ID_PREFIXES.schedulingBooking, id)) {
    throw new SchedulingError("not_found", `No booking "${id}" in this environment.`);
  }
  const [row] = await tx
    .select()
    .from(schedulingBooking)
    .where(
      and(
        eq(schedulingBooking.id, id),
        eq(schedulingBooking.organizationId, scope.organizationId),
        eq(schedulingBooking.environmentId, scope.environmentId),
      ),
    )
    .for("update");
  if (!row) throw new SchedulingError("not_found", `No booking "${id}" in this environment.`);
  return row;
}

async function bumped(
  tx: Executor,
  booking: BookingRow,
  set: Partial<typeof schedulingBooking.$inferInsert>,
): Promise<BookingRow> {
  const [row] = await tx
    .update(schedulingBooking)
    .set({ ...set, version: sql`${schedulingBooking.version} + 1` })
    .where(
      and(
        eq(schedulingBooking.id, booking.id),
        eq(schedulingBooking.organizationId, booking.organizationId),
      ),
    )
    .returning();
  return row as BookingRow;
}

const notChangeable = (booking: BookingRow) =>
  new SchedulingError(
    "booking_not_changeable",
    `This booking is ${booking.status} and can't be changed that way.`,
  );

/** Turns a hold into a booking: the promise a customer took payment against. */
export async function confirmHold(
  env: SchedulingEnvironment,
  id: string,
  opts: { ifStillFree?: boolean | undefined },
  deps: SchedulingDeps,
  actor: BookingActor,
): Promise<BookingObjectOutput> {
  const row = await db.transaction(async (tx) => {
    const booking = await lockBooking(tx, env, id);
    if (booking.status === "confirmed" || booking.status === "pending_approval") return booking;
    if (booking.status !== "held") throw notChangeable(booking);
    const [{ expired } = { expired: true }] = (
      await tx.execute(
        sql`select ${booking.holdExpiresAt?.toISOString() ?? null}::timestamptz <= clock_timestamp() as expired`,
      )
    ).rows as { expired: boolean }[];
    if (expired && !opts.ifStillFree) {
      throw new SchedulingError(
        "hold_expired",
        "This hold has expired. Pass `if_still_free` to book anyway if nobody else took the slot.",
      );
    }
    const eventType = await resolveEventType(tx, env, booking.eventTypeId);
    const next: FinishedState = eventType.requiresApproval ? "pending_approval" : "confirmed";
    await convertClaims(tx, booking, eventType, env, next, expired ? nowOf(deps) : null);
    const updated = await bumped(tx, booking, {
      status: next,
      holdExpiresAt: null,
      ...(next === "pending_approval"
        ? {
            approvalExpiresAt: new Date(
              nowOf(deps).getTime() + eventType.approvalTtlMinutes * MINUTE_MS,
            ),
          }
        : {}),
    });
    const { hostIds } = await participants(tx, updated);
    if (next === "confirmed") {
      await showOnCalendars(tx, updated, hostIds);
      await chargeOnce(tx, env, updated, deps);
    }
    await recordChange(tx, updated, {
      type: `scheduling.booking.${next}`,
      webhook: WEBHOOK_OF_STATUS[next],
      actor,
      occurredAt: nowOf(deps),
      message: MESSAGE_OF_STATUS[next],
    });
    await enqueueBookingNotifications(tx, updated, next as NotifiableStatus, nowOf(deps));
    return updated;
  });
  return toBookingObject(db, row, deps);
}

/** Under the session's lock, since an expired hold's seat may be gone. False: no claim to firm up. */
async function convertSeat(
  tx: Executor,
  booking: BookingRow,
  ttlSeconds: number | null,
): Promise<boolean> {
  const sessionId = booking.groupSessionId as string;
  const [session] = await tx
    .select()
    .from(schedulingGroupSession)
    .where(
      and(
        eq(schedulingGroupSession.id, sessionId),
        eq(schedulingGroupSession.organizationId, booking.organizationId),
      ),
    )
    .for("update");
  if (!session) throw new LostSlot("host_unavailable");
  if ((await liveSeatCount(tx, session, booking.id)) >= session.capacity) {
    throw new LostSlot("session_full");
  }
  const [claim] = await tx
    .select({ liveUntil: schedulingClaim.liveUntil })
    .from(schedulingClaim)
    .where(
      and(
        eq(schedulingClaim.groupSessionId, session.id),
        eq(schedulingClaim.organizationId, session.organizationId),
      ),
    );
  if (!claim) return false;
  if (claim.liveUntil) {
    const where = { organizationId: session.organizationId, groupSessionId: session.id };
    if (ttlSeconds === null) await makeClaimPermanent(tx, where);
    else await extendSessionClaim(tx, where, ttlSeconds);
  }
  return true;
}

/** Joining a session someone else is keeping alive commits the host to nothing new. */
async function sessionClaimIsLive(tx: Executor, booking: BookingRow): Promise<boolean> {
  if (!booking.groupSessionId) return false;
  const [claim] = await tx
    .select({ id: schedulingClaim.id })
    .from(schedulingClaim)
    .where(
      and(
        eq(schedulingClaim.groupSessionId, booking.groupSessionId),
        eq(schedulingClaim.organizationId, booking.organizationId),
        or(
          isNull(schedulingClaim.liveUntil),
          sql`${schedulingClaim.liveUntil} > clock_timestamp()`,
        ),
      ),
    );
  return Boolean(claim);
}

/** It stopped counting towards hours and limits when it expired, so they apply again. */
async function recheckExpiredHold(
  tx: Transaction,
  booking: BookingRow,
  eventType: EventTypeRow,
  env: SchedulingEnvironment,
  hosts: readonly HostRow[],
  nowMs: number,
): Promise<void> {
  // Notice was met when it was held: being late to confirm shouldn't count against it.
  const rule = {
    ...slotRuleOf(eventType, (booking.endAt.getTime() - booking.startAt.getTime()) / MINUTE_MS),
    minNoticeMinutes: 0,
  };
  const startMs = booking.startAt.getTime();
  await lockHostsAndMemberships(
    tx,
    eventType,
    hosts.map((host) => host.id),
  );
  await lockLimitBuckets(tx, eventType, rule, hosts, startMs);
  const memberships = await tx
    .select({
      hostId: schedulingEventTypeHost.hostId,
      scheduleId: schedulingEventTypeHost.scheduleId,
    })
    .from(schedulingEventTypeHost)
    .where(
      and(
        eq(schedulingEventTypeHost.eventTypeId, eventType.id),
        eq(schedulingEventTypeHost.organizationId, eventType.organizationId),
      ),
    );
  const verdicts = await verdictsOf(
    tx,
    {
      eventType,
      rule,
      scope: env,
      startMs,
      nowMs,
      failureMode: await calendarFailureModeOf(tx, env),
      ttlSeconds: null,
    },
    hosts,
    new Map(memberships.map((row) => [row.hostId, row.scheduleId])),
  );
  for (const host of hosts) {
    const verdict = verdicts.get(host.id);
    if (!verdict?.ok) throw new LostSlot(verdict?.reason ?? "host_unavailable");
  }
}

/**
 * Firms up a booking's claims. If a sweep already removed them they're claimed afresh, so a slot
 * someone else took since refuses the conversion either way.
 */
async function convertClaims(
  tx: Transaction,
  booking: BookingRow,
  eventType: EventTypeRow,
  env: SchedulingEnvironment,
  next: FinishedState,
  expiredAt: Date | null,
): Promise<void> {
  const ttlSeconds = next === "pending_approval" ? eventType.approvalTtlMinutes * 60 : null;
  const hostRows = await tx
    .select({ hostId: schedulingBookingHost.hostId })
    .from(schedulingBookingHost)
    .where(
      and(
        eq(schedulingBookingHost.bookingId, booking.id),
        eq(schedulingBookingHost.organizationId, booking.organizationId),
      ),
    );
  const hosts = (
    await hostsByIds(
      tx,
      env,
      hostRows.map((row) => row.hostId),
    )
  ).sort((a, b) => (a.id < b.id ? -1 : 1));
  // `deleteHost` refuses while a booking can still convert: this is a row from before it did.
  if (hosts.length === 0) throw slotLost("host_unavailable");
  try {
    await inSavepoint(tx, async (savepoint) => {
      if (expiredAt && !(await sessionClaimIsLive(savepoint, booking))) {
        await recheckExpiredHold(savepoint, booking, eventType, env, hosts, expiredAt.getTime());
      }
      if (booking.groupSessionId) {
        if (await convertSeat(savepoint, booking, ttlSeconds)) return;
      } else {
        await releaseBookingClaims(savepoint, booking);
      }
      const occupied = {
        startMs: booking.startAt.getTime() - booking.bufferBeforeMinutes * MINUTE_MS,
        endMs: booking.endAt.getTime() + booking.bufferAfterMinutes * MINUTE_MS,
      };
      for (const host of hosts) {
        const claim = await tryClaim(savepoint, {
          organizationId: booking.organizationId,
          environmentId: booking.environmentId,
          hostId: host.id,
          hostTimeZone: host.timeZone,
          eventTypeId: booking.eventTypeId,
          owner: booking.groupSessionId
            ? { groupSessionId: booking.groupSessionId }
            : { bookingId: booking.id },
          occupied,
          startMs: booking.startAt.getTime(),
          ttlSeconds,
        });
        if (!claim) throw new LostSlot("taken since");
      }
    });
  } catch (error) {
    if (error instanceof LostSlot) throw slotLost(error.reason);
    if (isExclusionViolation(error)) throw slotLost("taken since");
    throw error;
  }
}

export async function deleteHold(
  env: SchedulingEnvironment,
  id: string,
  deps: SchedulingDeps,
  actor: BookingActor,
): Promise<BookingObjectOutput> {
  const row = await db.transaction(async (tx) => {
    const booking = await lockBooking(tx, env, id);
    if (booking.status !== "held") throw notChangeable(booking);
    await endBooking(tx, booking, "cancelled", deps, actor, null, "Hold released");
    return (await lockBooking(tx, env, id)) as BookingRow;
  });
  return toBookingObject(db, row, deps);
}

/** Ends a booking: claims go, the calendar event goes, sessions stop working. Usage stays. */
async function endBooking(
  tx: Executor,
  booking: BookingRow,
  status: "cancelled" | "declined",
  deps: Pick<SchedulingDeps, "now">,
  actor: BookingActor,
  webhook: SchedulingWebhookEventType | null,
  message: string,
): Promise<BookingRow> {
  const now = nowOf(deps);
  const { hostIds } = await participants(tx, booking);
  await releaseBookingClaims(tx, booking);
  const updated = await bumped(tx, booking, {
    status,
    cancelledAt: now,
    holdExpiresAt: null,
    approvalExpiresAt: null,
  });
  await leaveGroupSession(tx, updated);
  if (!updated.groupSessionId) {
    await setCalendarState(tx, updated, hostIds, "absent");
  } else if (booking.status === "confirmed") {
    const session = { id: updated.groupSessionId, organizationId: updated.organizationId };
    if ((await confirmedSeats(tx, session)).length === 0) {
      await setCalendarState(tx, updated, hostIds, "absent");
      await tx
        .update(schedulingGroupSession)
        .set({ meetingUrl: null })
        .where(
          and(
            eq(schedulingGroupSession.id, session.id),
            eq(schedulingGroupSession.organizationId, session.organizationId),
          ),
        );
    }
  }
  if (booking.status === "confirmed" && booking.startAt.getTime() > now.getTime()) {
    const members = await tx
      .select({ hostId: schedulingBookingHost.hostId })
      .from(schedulingBookingHost)
      .where(
        and(
          eq(schedulingBookingHost.bookingId, booking.id),
          eq(schedulingBookingHost.organizationId, booking.organizationId),
          eq(schedulingBookingHost.role, "member"),
        ),
      );
    await assignFairly(
      tx,
      booking,
      members.map((row) => row.hostId),
      -1,
    );
  }
  await tx
    .update(schedulingSession)
    .set({ revokedAt: now })
    .where(
      and(
        eq(schedulingSession.bookingId, booking.id),
        eq(schedulingSession.organizationId, booking.organizationId),
        isNull(schedulingSession.revokedAt),
      ),
    );
  await recordChange(tx, updated, {
    type: `scheduling.booking.${status}`,
    webhook,
    actor,
    occurredAt: now,
    message,
  });
  // A released hold never told anyone it existed.
  if (booking.status !== "held") await enqueueBookingNotifications(tx, updated, status, now);
  return updated;
}

function checkNotice(
  booking: BookingRow,
  minutes: number,
  now: Date,
  opts: { enforceCutoffs?: boolean | undefined },
): void {
  if (!opts.enforceCutoffs) return;
  if (booking.startAt.getTime() - now.getTime() < minutes * MINUTE_MS) {
    throw new SchedulingError(
      "notice_too_short",
      "This booking starts too soon to be changed online. Please contact the organizer.",
    );
  }
}

export async function cancelBooking(
  env: SchedulingEnvironment,
  id: string,
  deps: SchedulingDeps,
  actor: BookingActor,
  opts: { enforceCutoffs?: boolean } = {},
): Promise<BookingObjectOutput> {
  const row = await db.transaction(async (tx) => {
    const booking = await lockBooking(tx, env, id);
    if (booking.status === "cancelled") return booking;
    if (booking.status === "declined") throw notChangeable(booking);
    const eventType = await resolveEventType(tx, env, booking.eventTypeId);
    checkNotice(booking, eventType.cancelNoticeMinutes, nowOf(deps), opts);
    return endBooking(
      tx,
      booking,
      "cancelled",
      deps,
      actor,
      "scheduling.booking.cancelled",
      "Booking cancelled",
    );
  });
  return toBookingObject(db, row, deps);
}

export async function declineBooking(
  env: SchedulingEnvironment,
  id: string,
  deps: SchedulingDeps,
  actor: BookingActor,
): Promise<BookingObjectOutput> {
  const row = await db.transaction(async (tx) => {
    const booking = await lockBooking(tx, env, id);
    if (booking.status !== "pending_approval") throw notChangeable(booking);
    return endBooking(
      tx,
      booking,
      "declined",
      deps,
      actor,
      "scheduling.booking.declined",
      "Booking declined",
    );
  });
  return toBookingObject(db, row, deps);
}

export async function approveBooking(
  env: SchedulingEnvironment,
  id: string,
  deps: SchedulingDeps,
  actor: BookingActor,
): Promise<BookingObjectOutput> {
  const row = await db.transaction(async (tx) => {
    const booking = await lockBooking(tx, env, id);
    if (booking.status === "confirmed") return booking;
    if (booking.status !== "pending_approval") throw notChangeable(booking);
    const eventType = await resolveEventType(tx, env, booking.eventTypeId);
    await convertClaims(tx, booking, eventType, env, "confirmed", null);
    const updated = await bumped(tx, booking, { status: "confirmed", approvalExpiresAt: null });
    const { hostIds } = await participants(tx, updated);
    await showOnCalendars(tx, updated, hostIds);
    await chargeOnce(tx, env, updated, deps);
    await recordChange(tx, updated, {
      type: "scheduling.booking.confirmed",
      webhook: "scheduling.booking.confirmed",
      actor,
      occurredAt: nowOf(deps),
      message: "Booking approved",
    });
    await enqueueBookingNotifications(tx, updated, "confirmed", nowOf(deps));
    return updated;
  });
  return toBookingObject(db, row, deps);
}

/** What `reassign.ts` builds on. Not part of the package's interface. */
export const bookingInternals = {
  coverageWindows,
  LostSlot,
  assignFairly,
  bumped,
  locationForNewHost,
  locationWithoutHost,
  lockBooking,
  lockHostsAndMemberships,
  lockLimitBuckets,
  notChangeable,
  participants,
  ranked,
  recordChange,
  retryingDeadlocks,
  schedulesOf,
  setCalendarState,
  verdictsOf,
};

/**
 * Where a booking could move to, answered the way `rescheduleBooking` checks: its own hosts, none
 * disabled or taken off the event type and all of them free, at its own length and buffers, with its own claims
 * left out. Its current time isn't a move.
 */
export async function listRescheduleSlots(
  scope: Scope,
  id: string,
  input: { fromMs: number; toMs: number; nowMs: number },
): Promise<SlotResult[]> {
  checkWindow(input.fromMs, input.toMs);
  const booking = await bookingRow(scope, id);
  if (booking.groupSessionId) return [];
  if (booking.status === "cancelled" || booking.status === "declined") return [];
  const eventType = await resolveEventType(db, scope, booking.eventTypeId);
  if (eventType.status !== "active") return [];
  const { hostIds } = await participants(db, booking);
  const hosts = await hostsByIds(db, scope, hostIds);
  if (hosts.length === 0 || hosts.some((host) => host.status !== "active")) return [];
  const memberships = await db
    .select({
      hostId: schedulingEventTypeHost.hostId,
      scheduleId: schedulingEventTypeHost.scheduleId,
      removedAt: schedulingEventTypeHost.removedAt,
    })
    .from(schedulingEventTypeHost)
    .where(
      and(
        eq(schedulingEventTypeHost.eventTypeId, eventType.id),
        eq(schedulingEventTypeHost.organizationId, eventType.organizationId),
        inArray(schedulingEventTypeHost.hostId, hostIds),
      ),
    );
  // Taken off the event type, a host keeps the booking but can't be moved on it.
  if (memberships.some((row) => row.removedAt)) return [];
  const schedules = new Map(memberships.map((row) => [row.hostId, row.scheduleId]));
  const durationMinutes = (booking.endAt.getTime() - booking.startAt.getTime()) / MINUTE_MS;
  const rule = {
    ...slotRuleOf(eventType, durationMinutes),
    bufferBeforeMinutes: booking.bufferBeforeMinutes,
    bufferAfterMinutes: booking.bufferAfterMinutes,
  };
  const loaded = await loadHostInputs(db, {
    scope,
    hosts: hosts.map((host) => ({
      id: host.id,
      timeZone: host.timeZone,
      scheduleId: schedules.get(host.id) ?? null,
    })),
    eventTypeId: eventType.id,
    fromMs: input.fromMs,
    toMs: input.toMs,
    nowMs: input.nowMs,
    calendarFailureMode: await calendarFailureModeOf(db, scope),
    exceptBookingId: booking.id,
  });
  const perHost = new Map<string, number[]>();
  for (const [index, [hostId, host]] of [...loaded].entries()) {
    await takeTurn(index);
    perHost.set(
      hostId,
      listSlots({
        nowMs: input.nowMs,
        rule,
        host,
        fromMs: input.fromMs,
        toMs: input.toMs,
      }),
    );
  }
  return combineSlots(perHost, hostIds, [], durationMinutes * MINUTE_MS).filter(
    (slot) => slot.startMs !== booking.startAt.getTime(),
  );
}

/** Moves a booking, keeping its id. The old time stays claimed until the new one is won. */
export async function rescheduleBooking(
  env: SchedulingEnvironment,
  id: string,
  input: { startMs: number; host?: string | undefined },
  deps: SchedulingDeps,
  actor: BookingActor,
  opts: { enforceCutoffs?: boolean } = {},
): Promise<BookingObjectOutput> {
  checkStart(input.startMs);
  const row = await db.transaction(async (tx) => {
    const booking = await lockBooking(tx, env, id);
    if (booking.status === "cancelled" || booking.status === "declined") {
      throw notChangeable(booking);
    }
    if (booking.groupSessionId) {
      throw new SchedulingError(
        "booking_not_changeable",
        "A group session seat is moved by cancelling it and booking another session.",
      );
    }
    const eventType = await resolveEventType(tx, env, booking.eventTypeId);
    const now = nowOf(deps);
    checkNotice(booking, eventType.rescheduleNoticeMinutes, now, opts);
    const durationMinutes = (booking.endAt.getTime() - booking.startAt.getTime()) / MINUTE_MS;
    const { hostIds } = await participants(tx, booking);
    const current = await hostsByIds(tx, env, hostIds);
    const replacement = input.host ? await resolveHost(tx, env, input.host) : null;
    const rows = await tx
      .select()
      .from(schedulingBookingHost)
      .where(
        and(
          eq(schedulingBookingHost.bookingId, booking.id),
          eq(schedulingBookingHost.organizationId, booking.organizationId),
        ),
      );
    const member = rows.find((row) => row.role === "member");
    // Asking for the host it has is just moving the booking.
    const replacing = replacement && replacement.id !== member?.hostId ? replacement : null;
    if (replacing && !eventType.reassignmentEnabled) {
      throw new SchedulingError(
        "booking_not_changeable",
        "This event type's bookings stay with their hosts.",
      );
    }
    let replacementCoverage: Map<string, Interval[]> | undefined;
    if (replacement && !member) {
      throw new SchedulingError("invalid_event_type", "This booking's hosts can't be changed.", {
        param: "host",
      });
    }
    if (replacement) {
      const { members } = await candidatesOf(tx, env, eventType, { hostRef: replacement.id });
      const entry = members.find((candidate) => candidate.host.id === replacement.id);
      if (!entry) {
        throw new SchedulingError("invalid_event_type", "That host can't take this event type.", {
          param: "host",
        });
      }
      if (entry.coverage) replacementCoverage = new Map([[replacement.id, entry.coverage.windows]]);
    }
    const hosts = replacing
      ? [...current.filter((host) => host.id !== member?.hostId), replacing]
      : current;
    const ttlSeconds =
      booking.status === "held"
        ? eventType.holdTtlSeconds
        : booking.status === "pending_approval"
          ? eventType.approvalTtlMinutes * 60
          : null;
    const memberships = await tx
      .select()
      .from(schedulingEventTypeHost)
      .where(
        and(
          eq(schedulingEventTypeHost.eventTypeId, eventType.id),
          eq(schedulingEventTypeHost.organizationId, eventType.organizationId),
          inArray(
            schedulingEventTypeHost.hostId,
            hosts.map((host) => host.id),
          ),
        ),
      );
    const schedules = new Map(memberships.map((row) => [row.hostId, row.scheduleId]));
    const plan: ClaimPlan = {
      eventType,
      rule: {
        ...slotRuleOf(eventType, durationMinutes),
        bufferBeforeMinutes: booking.bufferBeforeMinutes,
        bufferAfterMinutes: booking.bufferAfterMinutes,
      },
      scope: env,
      startMs: input.startMs,
      nowMs: now.getTime(),
      failureMode: await calendarFailureModeOf(tx, env),
      ttlSeconds,
      coverage: replacementCoverage,
    };
    try {
      await tx.transaction(async (savepoint) => {
        await releaseBookingClaims(savepoint, booking);
        await claimHosts(savepoint, plan, hosts, booking.id, schedules);
      });
    } catch (error) {
      if (error instanceof LostSlot) throw slotLost(error.reason);
      throw error;
    }
    if (replacing && member) {
      await tx
        .delete(schedulingBookingHost)
        .where(
          and(
            eq(schedulingBookingHost.bookingId, booking.id),
            eq(schedulingBookingHost.organizationId, booking.organizationId),
            eq(schedulingBookingHost.hostId, member.hostId),
          ),
        );
      await tx
        .insert(schedulingBookingHost)
        .values({
          bookingId: booking.id,
          hostId: replacing.id,
          organizationId: booking.organizationId,
          role: "member",
        })
        .onConflictDoNothing();
    }
    // Naming the host it already has changes nothing about where it happens.
    const newLocation =
      replacement && member && replacement.id !== member.hostId
        ? await locationWithoutHost(tx, booking, member.hostId, hosts)
        : null;
    const updated = await bumped(tx, booking, {
      startAt: new Date(input.startMs),
      endAt: new Date(input.startMs + durationMinutes * MINUTE_MS),
      externalConflictAt: null,
      // The old host's meeting or office goes with them, so the new host's takes its place.
      ...(newLocation ? { location: newLocation } : {}),
    });
    const after = await participants(tx, updated);
    if (updated.status === "confirmed") {
      if (replacing && member) await setCalendarState(tx, updated, [member.hostId], "absent");
      await setCalendarState(tx, updated, after.hostIds, "present");
    }
    await recordChange(tx, updated, {
      type: "scheduling.booking.rescheduled",
      webhook: "scheduling.booking.rescheduled",
      actor,
      occurredAt: now,
      previousStart: booking.startAt,
      details: { previous_start: booking.startAt.toISOString() },
      message: "Booking rescheduled",
    });
    if (replacing && member) {
      if (eventType.kind === "pool" && booking.startAt > now) {
        for (const move of [
          { hostId: member.hostId, delta: -1 as const },
          { hostId: replacing.id, delta: 1 as const },
        ].sort((a, b) => (a.hostId < b.hostId ? -1 : 1))) {
          await assignFairly(tx, booking, [move.hostId], move.delta);
        }
      }
      await recordChange(tx, updated, {
        type: "scheduling.booking.reassigned",
        webhook: "scheduling.booking.reassigned",
        actor,
        occurredAt: now,
        previousHostIds: hostIds,
        details: { previous_host_ids: hostIds },
        message: "Booking reassigned",
      });
    }
    if (updated.status !== "held") {
      await enqueueBookingNotifications(tx, updated, "rescheduled", now);
      // They'd hear nothing otherwise: `rescheduled` goes to the hosts it has now.
      if (replacing && member) {
        await enqueueReassignment(
          tx,
          updated,
          { added: [], removed: [member.hostId], attendee: false },
          now,
        );
      }
    }
    return updated;
  });
  return toBookingObject(db, row, deps);
}

export async function markNoShow(
  env: SchedulingEnvironment,
  id: string,
  deps: SchedulingDeps,
  actor: BookingActor,
): Promise<BookingObjectOutput> {
  const row = await db.transaction(async (tx) => {
    const booking = await lockBooking(tx, env, id);
    if (booking.status !== "confirmed") throw notChangeable(booking);
    // Marked already: a second click tells nobody anything new, and keeps the first time.
    if (booking.noShowAt) return booking;
    const now = nowOf(deps);
    if (booking.startAt.getTime() > now.getTime()) {
      throw new SchedulingError("booking_not_changeable", "This booking hasn't started yet.");
    }
    const updated = await bumped(tx, booking, { noShowAt: now });
    await recordChange(tx, updated, {
      type: "scheduling.booking.no_show",
      webhook: "scheduling.booking.no_show",
      actor,
      occurredAt: now,
      message: "Attendee marked as a no-show",
    });
    return updated;
  });
  return toBookingObject(db, row, deps);
}

export async function updateBookingLocation(
  env: SchedulingEnvironment,
  id: string,
  location: Location,
  deps: SchedulingDeps,
  actor: BookingActor,
): Promise<BookingObjectOutput> {
  const row = await db.transaction(async (tx) => {
    const booking = await lockBooking(tx, env, id);
    if (booking.status === "cancelled" || booking.status === "declined") {
      throw notChangeable(booking);
    }
    // A seat's version stays: nothing about the seat changed, and a bump would drop its reminder.
    const updated = booking.groupSessionId ? booking : await bumped(tx, booking, { location });
    if (!booking.groupSessionId) await carryReminders(tx, updated);
    await recordChange(tx, updated, {
      type: "scheduling.booking.location_ready",
      webhook: "scheduling.booking.location_ready",
      actor,
      occurredAt: nowOf(deps),
      message: "Booking location set",
    });
    if (updated.groupSessionId) {
      const session = { id: updated.groupSessionId, organizationId: updated.organizationId };
      await tx
        .update(schedulingGroupSession)
        .set({ location, meetingUrl: null })
        .where(
          and(
            eq(schedulingGroupSession.id, session.id),
            eq(schedulingGroupSession.organizationId, session.organizationId),
          ),
        );
      for (const seat of await confirmedSeats(tx, session)) {
        if (seat.id === updated.id) continue;
        await announce(
          tx,
          seat,
          "scheduling.booking.location_ready",
          "Booking location set",
          nowOf(deps),
        );
      }
    }
    return updated;
  });
  return toBookingObject(db, row, deps);
}

async function bookingRow(scope: Scope, id: string): Promise<BookingRow> {
  if (!isId(ID_PREFIXES.schedulingBooking, id)) {
    throw new SchedulingError("not_found", `No booking "${id}" in this environment.`);
  }
  const [row] = await db
    .select()
    .from(schedulingBooking)
    .where(
      and(
        eq(schedulingBooking.id, id),
        eq(schedulingBooking.organizationId, scope.organizationId),
        eq(schedulingBooking.environmentId, scope.environmentId),
      ),
    );
  if (!row) throw new SchedulingError("not_found", `No booking "${id}" in this environment.`);
  return row;
}

export async function getBooking(
  scope: Scope,
  id: string,
  deps: Pick<SchedulingDeps, "dataKeys">,
): Promise<BookingObjectOutput> {
  return toBookingObject(db, await bookingRow(scope, id), deps, { includeAnswers: true });
}

/** The dashboard's view of one booking: names and its history, never answers (only `getBooking`). */
export async function getBookingOverview(
  scope: Scope,
  id: string,
  deps: Pick<SchedulingDeps, "dataKeys">,
): Promise<{
  booking: BookingObjectOutput;
  eventTypeTitle: string | null;
  hosts: { id: string; name: string }[];
  events: {
    id: string;
    type: string;
    actor: BookingActor["kind"];
    occurredAt: Date;
    /** Why it was reassigned, when someone said: only here, never lists, webhooks or logs. */
    reasonCode: string | null;
    note: string | null;
  }[];
}> {
  const row = await bookingRow(scope, id);
  const booking = await toBookingObject(db, row, deps);
  const [[eventType], hosts, events] = await Promise.all([
    db
      .select({ title: schedulingEventType.title })
      .from(schedulingEventType)
      .where(
        and(
          eq(schedulingEventType.id, row.eventTypeId),
          eq(schedulingEventType.organizationId, scope.organizationId),
          eq(schedulingEventType.environmentId, scope.environmentId),
        ),
      ),
    booking.hosts.length === 0
      ? []
      : db
          .select({ id: schedulingHost.id, name: schedulingHost.name })
          .from(schedulingHost)
          .where(
            and(
              inArray(schedulingHost.id, booking.hosts),
              eq(schedulingHost.organizationId, scope.organizationId),
              eq(schedulingHost.environmentId, scope.environmentId),
            ),
          ),
    db
      .select({
        id: schedulingBookingEvent.id,
        type: schedulingBookingEvent.type,
        actor: schedulingBookingEvent.actor,
        occurredAt: schedulingBookingEvent.occurredAt,
        details: schedulingBookingEvent.details,
        encryptedNote: schedulingBookingEvent.encryptedNote,
      })
      .from(schedulingBookingEvent)
      .where(
        and(
          eq(schedulingBookingEvent.bookingId, row.id),
          eq(schedulingBookingEvent.organizationId, scope.organizationId),
        ),
      )
      .orderBy(desc(schedulingBookingEvent.sequence))
      .limit(BOOKING_HISTORY_LIMIT),
  ]);
  return {
    booking,
    eventTypeTitle: eventType?.title ?? null,
    hosts,
    events: events.map((event) => ({
      id: event.id,
      type: event.type,
      occurredAt: event.occurredAt,
      actor: event.actor.kind,
      reasonCode: typeof event.details.reason_code === "string" ? event.details.reason_code : null,
      note: event.encryptedNote ? decryptSecret(event.encryptedNote, deps.dataKeys) : null,
    })),
  };
}

export async function listBookings(
  scope: Scope,
  query: {
    limit: number;
    after?: string | undefined;
    hostRef?: string | undefined;
    eventTypeRef?: string | undefined;
    status?: BookingRow["status"] | undefined;
    statuses?: BookingRow["status"][] | undefined;
    attendeeUid?: string | undefined;
    attendeeEmail?: string | undefined;
    startAfter?: Date | undefined;
    startBefore?: Date | undefined;
    endAfter?: Date | undefined;
    endBefore?: Date | undefined;
    /** Newest first by default; by start time for an agenda (`after` is still a booking id). */
    order?: "start_asc" | "start_desc" | undefined;
  },
  deps: Pick<SchedulingDeps, "dataKeys" | "lookupKey">,
): Promise<{ data: BookingObjectOutput[]; hasMore: boolean }> {
  const hostId = query.hostRef ? (await resolveHost(db, scope, query.hostRef)).id : null;
  const eventTypeId = query.eventTypeRef
    ? (await resolveEventType(db, scope, query.eventTypeRef)).id
    : null;
  const rows = await db
    .select()
    .from(schedulingBooking)
    .where(
      and(
        eq(schedulingBooking.organizationId, scope.organizationId),
        eq(schedulingBooking.environmentId, scope.environmentId),
        query.after ? afterCursor(scope, query.after, query.order) : undefined,
        eventTypeId ? eq(schedulingBooking.eventTypeId, eventTypeId) : undefined,
        query.status ? eq(schedulingBooking.status, query.status) : undefined,
        query.statuses ? inArray(schedulingBooking.status, query.statuses) : undefined,
        query.startAfter ? gte(schedulingBooking.startAt, query.startAfter) : undefined,
        query.startBefore ? lte(schedulingBooking.startAt, query.startBefore) : undefined,
        query.endAfter ? gte(schedulingBooking.endAt, query.endAfter) : undefined,
        query.endBefore ? lt(schedulingBooking.endAt, query.endBefore) : undefined,
        hostId
          ? sql`exists (select 1 from ${schedulingBookingHost}
              where ${schedulingBookingHost.bookingId} = ${schedulingBooking.id}
                and ${schedulingBookingHost.hostId} = ${hostId})`
          : undefined,
        query.attendeeUid
          ? sql`exists (select 1 from ${schedulingAttendee}
              where ${schedulingAttendee.bookingId} = ${schedulingBooking.id}
                and ${schedulingAttendee.environmentId} = ${scope.environmentId}
                and ${schedulingAttendee.uid} = ${query.attendeeUid})`
          : undefined,
        query.attendeeEmail
          ? sql`exists (select 1 from ${schedulingAttendee}
              where ${schedulingAttendee.bookingId} = ${schedulingBooking.id}
                and ${schedulingAttendee.environmentId} = ${scope.environmentId}
                and ${schedulingAttendee.emailHmac} = ${emailLookup(query.attendeeEmail, deps)})`
          : undefined,
      ),
    )
    .orderBy(
      ...(query.order === "start_asc"
        ? [asc(schedulingBooking.startAt), asc(schedulingBooking.id)]
        : query.order === "start_desc"
          ? [desc(schedulingBooking.startAt), desc(schedulingBooking.id)]
          : [desc(schedulingBooking.id)]),
    )
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  return {
    data: await Promise.all(page.map((row) => toBookingObject(db, row, deps))),
    hasMore: rows.length > query.limit,
  };
}

/** A host's coming bookings, soonest first, without the ones that are off. */
export async function listUpcomingHostBookings(
  scope: Scope,
  query: { hostId: string; now: Date; limit: number; cursor?: string | undefined },
  deps: Pick<SchedulingDeps, "dataKeys">,
): Promise<{ data: BookingObjectOutput[]; nextCursor: string | null }> {
  const [cursorStart, cursorId] = query.cursor?.split("_after_") ?? [];
  const cursorMs = cursorStart ? Number(cursorStart) : Number.NaN;
  const rows = await db
    .select()
    .from(schedulingBooking)
    .where(
      and(
        eq(schedulingBooking.organizationId, scope.organizationId),
        eq(schedulingBooking.environmentId, scope.environmentId),
        gte(schedulingBooking.startAt, query.now),
        notInArray(schedulingBooking.status, ["cancelled", "declined"]),
        sql`exists (select 1 from ${schedulingBookingHost}
          where ${schedulingBookingHost.bookingId} = ${schedulingBooking.id}
            and ${schedulingBookingHost.hostId} = ${query.hostId})`,
        Number.isFinite(cursorMs) && cursorId
          ? or(
              gt(schedulingBooking.startAt, new Date(cursorMs)),
              and(
                eq(schedulingBooking.startAt, new Date(cursorMs)),
                gt(schedulingBooking.id, cursorId),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(asc(schedulingBooking.startAt), asc(schedulingBooking.id))
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    data: await Promise.all(page.map((row) => toBookingObject(db, row, deps))),
    nextCursor:
      rows.length > query.limit && last ? `${last.startAt.getTime()}_after_${last.id}` : null,
  };
}

/**
 * A host's confirmed bookings that have started, newest first: what can still be marked a no-show.
 * Bounded, since the query walks the environment's bookings by start time.
 */
export async function listRecentHostBookings(
  scope: Scope,
  query: { hostId: string; now: Date; limit: number; cursor?: string | undefined },
  deps: Pick<SchedulingDeps, "dataKeys">,
): Promise<{ data: BookingObjectOutput[]; nextCursor: string | null }> {
  const [cursorStart, cursorId] = query.cursor?.split("_after_") ?? [];
  const cursorMs = cursorStart ? Number(cursorStart) : Number.NaN;
  const rows = await db
    .select()
    .from(schedulingBooking)
    .where(
      and(
        eq(schedulingBooking.organizationId, scope.organizationId),
        eq(schedulingBooking.environmentId, scope.environmentId),
        lt(schedulingBooking.startAt, query.now),
        gte(schedulingBooking.startAt, new Date(query.now.getTime() - RECENT_HOST_BOOKINGS_MS)),
        eq(schedulingBooking.status, "confirmed"),
        sql`exists (select 1 from ${schedulingBookingHost}
          where ${schedulingBookingHost.bookingId} = ${schedulingBooking.id}
            and ${schedulingBookingHost.hostId} = ${query.hostId})`,
        Number.isFinite(cursorMs) && cursorId
          ? or(
              lt(schedulingBooking.startAt, new Date(cursorMs)),
              and(
                eq(schedulingBooking.startAt, new Date(cursorMs)),
                lt(schedulingBooking.id, cursorId),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(schedulingBooking.startAt), desc(schedulingBooking.id))
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    data: await Promise.all(page.map((row) => toBookingObject(db, row, deps))),
    nextCursor:
      rows.length > query.limit && last ? `${last.startAt.getTime()}_after_${last.id}` : null,
  };
}

function afterCursor(scope: Scope, after: string, order: "start_asc" | "start_desc" | undefined) {
  if (!order) return lt(schedulingBooking.id, after);
  const position = sql`(select ${schedulingBooking.startAt}, ${schedulingBooking.id}
    from ${schedulingBooking}
    where ${schedulingBooking.id} = ${after}
      and ${schedulingBooking.organizationId} = ${scope.organizationId}
      and ${schedulingBooking.environmentId} = ${scope.environmentId})`;
  return order === "start_asc"
    ? sql`(${schedulingBooking.startAt}, ${schedulingBooking.id}) > ${position}`
    : sql`(${schedulingBooking.startAt}, ${schedulingBooking.id}) < ${position}`;
}

export type SeriesRequest = Omit<BookingRequest, "startMs"> & {
  startMs: number;
  recurrence: { frequency: "weekly" | "monthly"; interval: number; count: number };
  onConflict: "reject" | "skip";
};

export type SeriesResult = {
  seriesId: string;
  bookings: BookingObjectOutput[];
  conflicts: { index: number; start: string }[];
};

function expandedStarts(request: SeriesRequest, anchorTimeZone: string): number[] {
  if (request.recurrence.count > MAX_SERIES_OCCURRENCES) {
    throw new SchedulingError(
      "invalid_time",
      `A series can have at most ${MAX_SERIES_OCCURRENCES} occurrences.`,
      { param: "recurrence.count" },
    );
  }
  return expandRecurrence({
    startMs: request.startMs,
    timeZone: anchorTimeZone,
    rule: request.recurrence,
  });
}

/** What a series would do, without doing it: for showing conflicts before committing. */
export async function previewSeries(
  env: SchedulingEnvironment,
  request: SeriesRequest,
  deps: SchedulingDeps,
): Promise<{ start: string; available: boolean; reason: string | null; hosts: string[] }[]> {
  checkStart(request.startMs);
  checkAttendee(request.attendee);
  const eventType = await resolveEventType(db, env, request.eventType);
  const durationMinutes = request.durationMinutes ?? eventType.durationMinutes;
  checkBookableEventType(eventType, durationMinutes);
  const starts = expandedStarts(request, request.attendee.time_zone);
  const candidates = await candidatesOf(db, env, eventType, {
    hostRef: request.host,
    attributes: request.attributes,
  });
  const entries = [...candidates.required, ...candidates.members];
  const now = nowOf(deps).getTime();
  const rule = slotRuleOf(eventType, durationMinutes);
  const failureMode = await calendarFailureModeOf(db, env);
  const results = [];
  for (const startMs of starts) {
    const loaded = await loadHostInputs(db, {
      scope: env,
      hosts: entries.map(hostInputOf),
      eventTypeId: eventType.id,
      fromMs: startMs,
      toMs: startMs + durationMinutes * MINUTE_MS,
      nowMs: now,
      groupSessions: eventType.kind === "group",
      calendarFailureMode: failureMode,
    });
    const verdicts = entries.map((entry) => {
      const host = loaded.get(entry.host.id);
      return {
        hostId: entry.host.id,
        required: candidates.required.includes(entry),
        verdict: host ? isBookable(startMs, { nowMs: now, rule, host }) : null,
      };
    });
    const requiredOk = verdicts.filter((v) => v.required).every((v) => v.verdict?.ok);
    const freeMembers = verdicts.filter((v) => !v.required && v.verdict?.ok);
    const available =
      requiredOk &&
      (candidates.members.length === 0 || freeMembers.length > 0) &&
      entries.length > 0;
    const firstReason = verdicts.find((v) => v.verdict && !v.verdict.ok)?.verdict;
    results.push({
      start: new Date(startMs).toISOString(),
      available,
      reason: available ? null : firstReason && !firstReason.ok ? firstReason.reason : "no_hosts",
      hosts: available
        ? verdicts.filter((v) => v.required || v.verdict?.ok).map((v) => v.hostId)
        : [],
    });
  }
  return results;
}

/** How many hosts a large pool's `skip` series tries: each try books the whole series. */
const SERIES_HOST_ATTEMPTS = 3;

/**
 * The hosts worth trying for a whole series, by what's committed now, in rank order: everyone free
 * for all of it, or with `skip` the few with the fewest conflicts. Each attempt still decides.
 */
async function seriesChoices(
  env: SchedulingEnvironment,
  candidates: Candidates,
  members: readonly HostRow[],
  input: {
    eventTypeId: string;
    starts: readonly number[];
    rule: SlotRule;
    nowMs: number;
    failureMode: "hide" | "last_known";
    onConflict: SeriesRequest["onConflict"];
  },
): Promise<HostRow[]> {
  const { starts, rule, nowMs } = input;
  const required = candidates.required.map((entry) => entry.host);
  const schedules = schedulesOf(candidates);
  const coverage = coverageWindows(candidates);
  const loaded = await loadHostInputs(db, {
    scope: env,
    hosts: [...required, ...members].map((host) => ({
      id: host.id,
      timeZone: host.timeZone,
      scheduleId: schedules.get(host.id) ?? null,
      onlyWithin: coverage.get(host.id),
    })),
    eventTypeId: input.eventTypeId,
    fromMs: Math.min(...starts),
    toMs: Math.max(...starts) + rule.durationMinutes * MINUTE_MS,
    nowMs,
    calendarFailureMode: input.failureMode,
  });
  const bookable = (host: HostRow, startMs: number) => {
    const inputs = loaded.get(host.id);
    return inputs ? isBookable(startMs, { nowMs, rule, host: inputs }).ok : false;
  };
  const open = starts.filter((startMs) => required.every((host) => bookable(host, startMs)));
  const conflicts = new Map<string, number>();
  for (const [index, member] of members.entries()) {
    await takeTurn(index);
    const free = open.filter((startMs) => bookable(member, startMs)).length;
    conflicts.set(member.id, starts.length - free);
  }
  const conflictsOf = (host: HostRow) => conflicts.get(host.id) ?? starts.length;
  if (input.onConflict !== "skip") return members.filter((host) => conflictsOf(host) === 0);
  return members
    .filter((host) => conflictsOf(host) < starts.length)
    .sort((a, b) => conflictsOf(a) - conflictsOf(b))
    .slice(0, SERIES_HOST_ATTEMPTS);
}

/**
 * Creates each occurrence as an ordinary booking, in one transaction. A pool tries each host for
 * the whole series, because a patient wants the same doctor every week; with `skip`, the best host
 * is the one with the fewest conflicts.
 */
export async function createSeries(
  env: SchedulingEnvironment,
  request: SeriesRequest,
  deps: SchedulingDeps,
  actor: BookingActor,
): Promise<{ result: SeriesResult; replayed: boolean }> {
  checkStart(request.startMs);
  checkAttendee(request.attendee);
  const eventType = await resolveEventType(db, env, request.eventType);
  const durationMinutes = request.durationMinutes ?? eventType.durationMinutes;
  checkBookableEventType(eventType, durationMinutes);
  checkAnswers(eventType, request.answers);
  checkGuests(eventType, request.attendee, request.guests);
  const location = chooseLocation(eventType, request.location, request.locationFromBrowser);
  const anchor = request.attendee.time_zone;
  const starts = expandedStarts(request, anchor);
  const now = nowOf(deps);
  const failureMode = await calendarFailureModeOf(db, env);
  const candidates = await candidatesOf(db, env, eventType, {
    hostRef: request.host,
    attributes: request.attributes,
  });
  const status = chooseStatus(eventType, false);
  const ttlSeconds = ttlFor(eventType, status);
  const rule = slotRuleOf(eventType, durationMinutes);
  const hash = hashRequest({ series: { ...request, idempotencyKey: undefined } });
  const context: NewBookingContext = { env, eventType, deps, actor, now };

  const memberRanking = candidates.members.length > 0 ? ranked(candidates, hash) : [];
  const memberChoices =
    memberRanking.length > SERIES_HOST_ATTEMPTS
      ? await seriesChoices(env, candidates, memberRanking, {
          eventTypeId: eventType.id,
          starts,
          rule,
          nowMs: now.getTime(),
          failureMode,
          onConflict: request.onConflict,
        })
      : memberRanking;
  const choiceSets: Candidates[] =
    memberRanking.length > 0
      ? memberChoices.map((member) => ({
          required: candidates.required,
          members: candidates.members.filter((entry) => entry.host.id === member.id),
        }))
      : [candidates];

  const attempt = async (
    tx: Transaction,
    seriesId: string,
    chosen: Candidates,
    allowSkips: boolean,
  ) => {
    const bookings: BookingRow[] = [];
    const conflicts: { index: number; start: string }[] = [];
    for (const [index, startMs] of starts.entries()) {
      const plan: ClaimPlan = {
        eventType,
        rule,
        scope: env,
        startMs,
        nowMs: now.getTime(),
        failureMode,
        ttlSeconds,
        coverage: coverageWindows(candidates),
      };
      try {
        const created = await inSavepoint(tx, async (savepoint) => {
          const inserted = await insertBookingRow(savepoint, context, request, {
            status,
            startMs,
            durationMinutes,
            ttlSeconds,
            location,
            hash: null,
            idempotencyKey: null,
            seriesId,
            seriesIndex: index,
          });
          return createOne(savepoint, context, request, inserted as BookingRow, chosen, plan);
        });
        bookings.push(created);
      } catch (error) {
        if (!(error instanceof SchedulingError) || error.code !== "slot_unavailable") throw error;
        if (!allowSkips) throw new LostSlot(new Date(startMs).toISOString());
        conflicts.push({ index, start: new Date(startMs).toISOString() });
      }
    }
    return { bookings, conflicts };
  };

  const insertAll = async (tx: Transaction, key: string | null) => {
    const [series] = await tx
      .insert(schedulingSeries)
      .values({
        organizationId: env.organizationId,
        projectId: env.projectId,
        environmentId: env.environmentId,
        eventTypeId: eventType.id,
        rule: request.recurrence,
        anchorTimeZone: anchor,
        idempotencyKey: key,
        requestHash: key ? hash : null,
      })
      .onConflictDoNothing({
        target: [schedulingSeries.environmentId, schedulingSeries.idempotencyKey],
      })
      .returning();
    if (!series) return undefined;
    let best: { chosen: Candidates; conflicts: number } | null = null;
    for (const chosen of choiceSets) {
      try {
        // The whole series for this host, undone either way until the best one is known.
        const outcome = await inSavepoint(tx, async (savepoint) => {
          const done = await attempt(savepoint, series.id, chosen, false);
          return done;
        });
        return { series, bookings: outcome.bookings, conflicts: outcome.conflicts };
      } catch (error) {
        if (!(error instanceof LostSlot)) throw error;
      }
      if (request.onConflict === "skip") {
        const probe = new LostSlot("probe");
        let conflictCount = 0;
        try {
          await inSavepoint(tx, async (savepoint) => {
            const done = await attempt(savepoint, series.id, chosen, true);
            conflictCount = done.conflicts.length;
            throw probe;
          });
        } catch (error) {
          if (error !== probe) throw error;
        }
        if (!best || conflictCount < best.conflicts) best = { chosen, conflicts: conflictCount };
      }
    }
    if (request.onConflict === "skip" && best && best.conflicts < starts.length) {
      const outcome = await attempt(tx, series.id, best.chosen, true);
      return { series, bookings: outcome.bookings, conflicts: outcome.conflicts };
    }
    throw slotLost("series");
  };

  const finish = async (
    done: {
      seriesId: string;
      bookings: BookingRow[];
      conflicts: { index: number; start: string }[];
    },
    replayed: boolean,
  ) => ({
    result: {
      seriesId: done.seriesId,
      bookings: await Promise.all(done.bookings.map((row) => toBookingObject(db, row, deps))),
      conflicts: done.conflicts,
    },
    replayed,
  });

  const key = request.idempotencyKey ?? null;
  if (!key) {
    const done = await retryingDeadlocks(() => db.transaction((tx) => insertAll(tx, null)));
    if (!done) throw slotLost("series");
    return finish(
      { seriesId: done.series.id, bookings: done.bookings, conflicts: done.conflicts },
      false,
    );
  }
  let fresh: { bookings: BookingRow[]; conflicts: { index: number; start: string }[] } | null =
    null;
  const outcome = await retryingDeadlocks(() =>
    withIdempotencyKey<typeof schedulingSeries.$inferSelect>({
      requestHash: hash,
      insert: async (tx) => {
        const done = await insertAll(tx, key);
        if (!done) return undefined;
        fresh = { bookings: done.bookings, conflicts: done.conflicts };
        return done.series;
      },
      existing: async () => {
        const [existing] = await db
          .select()
          .from(schedulingSeries)
          .where(
            and(
              eq(schedulingSeries.organizationId, env.organizationId),
              eq(schedulingSeries.environmentId, env.environmentId),
              eq(schedulingSeries.idempotencyKey, key),
            ),
          );
        return existing;
      },
      release: (tx, existing) =>
        tx
          .update(schedulingSeries)
          .set({ idempotencyKey: null })
          .where(
            and(
              eq(schedulingSeries.id, existing.id),
              eq(schedulingSeries.organizationId, existing.organizationId),
            ),
          ),
      errors: idempotencyErrors,
    }),
  );
  if (!outcome.replayed && fresh) {
    const { bookings, conflicts } = fresh as {
      bookings: BookingRow[];
      conflicts: { index: number; start: string }[];
    };
    return finish({ seriesId: outcome.row.id, bookings, conflicts }, false);
  }
  const existing = await db
    .select()
    .from(schedulingBooking)
    .where(
      and(
        eq(schedulingBooking.organizationId, env.organizationId),
        eq(schedulingBooking.seriesId, outcome.row.id),
      ),
    )
    .orderBy(asc(schedulingBooking.seriesIndex));
  return finish({ seriesId: outcome.row.id, bookings: existing, conflicts: [] }, true);
}

/** Cancels a series' occurrences from `fromIndex` on (all by default). */
export async function cancelSeries(
  env: SchedulingEnvironment,
  seriesId: string,
  opts: { fromIndex?: number | undefined },
  deps: SchedulingDeps,
  actor: BookingActor,
): Promise<BookingObjectOutput[]> {
  const rows = await db
    .select({ id: schedulingBooking.id })
    .from(schedulingBooking)
    .where(
      and(
        eq(schedulingBooking.organizationId, env.organizationId),
        eq(schedulingBooking.environmentId, env.environmentId),
        eq(schedulingBooking.seriesId, seriesId),
        gte(schedulingBooking.seriesIndex, opts.fromIndex ?? 0),
        inArray(schedulingBooking.status, ["held", "pending_approval", "confirmed"]),
      ),
    )
    .orderBy(asc(schedulingBooking.seriesIndex));
  if (rows.length === 0) {
    const [series] = await db
      .select({ id: schedulingSeries.id })
      .from(schedulingSeries)
      .where(
        and(
          eq(schedulingSeries.id, seriesId),
          eq(schedulingSeries.organizationId, env.organizationId),
          eq(schedulingSeries.environmentId, env.environmentId),
        ),
      );
    if (!series) throw new SchedulingError("not_found", `No series "${seriesId}".`);
    return [];
  }
  const cancelled: BookingObjectOutput[] = [];
  for (const row of rows) cancelled.push(await cancelBooking(env, row.id, deps, actor));
  return cancelled;
}

/**
 * Worker: holds past their expiry become `cancelled`, approvals past their deadline `declined`.
 * Correctness doesn't depend on this running: an expired claim already blocks nobody. It tidies up
 * and tells the customer.
 */
export async function expireDueBookings(
  deps: Pick<SchedulingDeps, "now">,
  opts: { limit?: number; scope?: { organizationIds: readonly string[] } } = {},
): Promise<number> {
  const limit = opts.limit ?? 200;
  const now = nowOf(deps);
  const due = await db
    .select({
      id: schedulingBooking.id,
      organizationId: schedulingBooking.organizationId,
      environmentId: schedulingBooking.environmentId,
      status: schedulingBooking.status,
    })
    .from(schedulingBooking)
    .where(
      and(
        opts.scope
          ? inArray(schedulingBooking.organizationId, [...opts.scope.organizationIds])
          : undefined,
        or(
          and(eq(schedulingBooking.status, "held"), lte(schedulingBooking.holdExpiresAt, now)),
          and(
            eq(schedulingBooking.status, "pending_approval"),
            lte(schedulingBooking.approvalExpiresAt, now),
          ),
        ),
      ),
    )
    .limit(limit);
  for (const row of due) {
    await db.transaction(async (tx) => {
      const booking = await lockBooking(tx, row, row.id);
      const stillHeld =
        booking.status === "held" && booking.holdExpiresAt && booking.holdExpiresAt <= now;
      const stillPending =
        booking.status === "pending_approval" &&
        booking.approvalExpiresAt &&
        booking.approvalExpiresAt <= now;
      if (stillHeld) {
        await endBooking(tx, booking, "cancelled", deps, { kind: "system" }, null, "Hold expired");
      } else if (stillPending) {
        await endBooking(
          tx,
          booking,
          "declined",
          deps,
          { kind: "system" },
          "scheduling.booking.declined",
          "Approval deadline passed",
        );
      }
    });
  }
  return due.length;
}
