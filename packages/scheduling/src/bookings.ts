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
import { enqueueWebhookMessage } from "@coss/webhooks";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  decryptAnswers,
  decryptContact,
  emailLookup,
  encryptAnswers,
  encryptContact,
} from "./attendees.ts";
import {
  type Candidates,
  calendarFailureModeOf,
  candidatesOf,
  loadHostInputs,
  slotRuleOf,
} from "./availability.ts";
import { hostsBusyNow } from "./calendar/live-check.ts";
import {
  isDeadlock,
  isExclusionViolation,
  makeClaimPermanent,
  releaseBookingClaims,
  tryClaim,
} from "./claims.ts";
import { type PoolMember, rankCandidates } from "./engine/rank.ts";
import { expandRecurrence } from "./engine/recurrence.ts";
import { isBookable, limitUsageKey, occupiedRange, type SlotRule } from "./engine/slots.ts";
import { MINUTE_MS } from "./engine/time.ts";
import { SchedulingError } from "./errors.ts";
import { type EventTypeRow, resolveEventType } from "./event-types.ts";
import { checkTimeZone, type HostRow, hostsByIds, resolveHost } from "./hosts.ts";
import { enqueueBookingNotifications } from "./notifications.ts";
import {
  type AttendeeInputOutput,
  type BookingObjectOutput,
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
  schedulingCalendarEvent,
  schedulingClaim,
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
  answers?: Answers | undefined;
  location?: Location | undefined;
  metadata?: Record<string, string> | undefined;
  idempotencyKey?: string | undefined;
};

const LIVE_CHECK_CANDIDATES = 3;

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

const URL_LIKE = /https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,}\//i;

/** A name is printed in emails sent to the attendee, who may be anyone: no room for a link. */
function checkAttendee(attendee: AttendeeInputOutput): void {
  checkTimeZone(attendee.time_zone, "attendee.time_zone");
  if (attendee.name && URL_LIKE.test(attendee.name)) {
    throw new SchedulingError("invalid_attendee", "A name can't contain a link.", {
      param: "attendee.name",
    });
  }
}

function chooseLocation(eventType: EventTypeRow, wanted: Location | undefined): Location | null {
  if (!wanted) return eventType.locations[0] ?? null;
  const offered = eventType.locations.find((location) => location.type === wanted.type);
  if (!offered) {
    throw new SchedulingError(
      "invalid_event_type",
      `This event type doesn't offer the location "${wanted.type}".`,
      { param: "location" },
    );
  }
  return wanted;
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

const slotLost = (reason?: string) =>
  new SchedulingError(
    "slot_unavailable",
    reason ? `That time isn't available (${reason}).` : "That time isn't available.",
    { param: "start" },
  );

async function lockHostsAndMemberships(
  tx: Executor,
  eventType: EventTypeRow,
  hostIds: readonly string[],
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
      .values({ eventTypeId: eventType.id, hostId, organizationId: eventType.organizationId })
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
        isNull(schedulingEventTypeHost.removedAt),
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

type ClaimPlan = {
  eventType: EventTypeRow;
  rule: SlotRule;
  scope: Scope;
  startMs: number;
  nowMs: number;
  failureMode: "hide" | "last_known";
  ttlSeconds: number | null;
};

/** Claims every host for a non-group booking, or throws `LostSlot`. Runs inside a savepoint. */
async function claimHosts(
  tx: Transaction,
  plan: ClaimPlan,
  hosts: readonly HostRow[],
  bookingId: string,
  schedules: ReadonlyMap<string, string | null>,
): Promise<Date | null> {
  const { eventType, rule, scope, startMs, nowMs } = plan;
  const sorted = [...hosts].sort((a, b) => (a.id < b.id ? -1 : 1));
  await lockHostsAndMemberships(
    tx,
    eventType,
    sorted.map((host) => host.id),
  );
  await lockLimitBuckets(tx, eventType, rule, sorted, startMs);
  const duration = rule.durationMinutes * MINUTE_MS;
  const loaded = await loadHostInputs(tx, {
    scope,
    hosts: sorted.map((host) => ({
      id: host.id,
      timeZone: host.timeZone,
      scheduleId: schedules.get(host.id) ?? null,
    })),
    eventTypeId: eventType.id,
    fromMs: startMs,
    toMs: startMs + duration,
    nowMs,
    calendarFailureMode: plan.failureMode,
  });
  for (const host of sorted) {
    const inputs = loaded.get(host.id);
    const verdict = inputs ? isBookable(startMs, { nowMs, rule, host: inputs }) : null;
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

function ranked(candidates: Candidates, seed: string): HostRow[] {
  const members: PoolMember[] = candidates.members.map(({ host, membership }) => ({
    hostId: host.id,
    weight: membership?.weight ?? 100,
    fairUnits: membership?.fairUnits ?? 0,
    lastAssignedAtMs: membership?.lastAssignedAt?.getTime() ?? null,
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
  const choices: (HostRow | null)[] =
    candidates.members.length > 0 ? ranked(candidates, seed) : [null];
  if (required.length === 0 && candidates.members.length === 0) throw slotLost("no_hosts");
  let lastReason: string | undefined;
  for (const member of choices) {
    const hosts = member ? [...required, member] : required;
    try {
      const liveUntil = await tx.transaction((savepoint) =>
        claimHosts(savepoint, plan, hosts, bookingId, schedules),
      );
      return { hosts, liveUntil };
    } catch (error) {
      if (!(error instanceof LostSlot)) throw error;
      lastReason = error.reason;
    }
  }
  throw slotLost(lastReason);
}

function toWebhookData(
  booking: BookingRow,
  hostIds: readonly string[],
  attendeeUids: readonly string[],
  occurredAt: Date,
  extra: { previousStart?: Date } = {},
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
    .orderBy(asc(schedulingAttendee.id));
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
          input.previousStart ? { previousStart: input.previousStart } : {},
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

/** What each host's calendar should now show. The worker converges on it. */
async function setCalendarState(
  tx: Executor,
  booking: BookingRow,
  hostIds: readonly string[],
  state: "present" | "absent",
): Promise<void> {
  if (hostIds.length === 0) return;
  const targets = await tx
    .select({ id: schedulingCalendar.id, hostId: schedulingCalendar.hostId })
    .from(schedulingCalendar)
    .where(
      and(
        eq(schedulingCalendar.organizationId, booking.organizationId),
        inArray(schedulingCalendar.hostId, [...hostIds]),
        eq(schedulingCalendar.writeTarget, true),
      ),
    );
  for (const target of targets) {
    await tx
      .insert(schedulingCalendarEvent)
      .values({
        organizationId: booking.organizationId,
        environmentId: booking.environmentId,
        bookingId: booking.id,
        hostId: target.hostId,
        calendarId: target.id,
        desiredStart: booking.startAt,
        desiredEnd: booking.endAt,
        desiredState: state,
      })
      .onConflictDoUpdate({
        target: [
          schedulingCalendarEvent.bookingId,
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
      location: values.location,
      holdExpiresAt: values.status === "held" ? expiresAt : null,
      approvalExpiresAt: values.status === "pending_approval" ? expiresAt : null,
      seriesId: values.seriesId ?? null,
      seriesIndex: values.seriesIndex ?? null,
      metadata: request.metadata ?? {},
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
  const ttlSeconds = plan.ttlSeconds;
  let liveUntil: Date | null = null;
  const stillLive = claimed && (claimed.liveUntil === null || liveSeats > 0);
  if (!stillLive) {
    if (claimed) {
      await tx.delete(schedulingClaim).where(eq(schedulingClaim.id, claimed.id));
    }
    const loaded = await loadHostInputs(tx, {
      scope,
      hosts: [{ id: host.id, timeZone: host.timeZone, scheduleId }],
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
  } else if (claimed?.liveUntil) {
    // Every seat so far is a hold: the claim now lasts as long as the longest of them.
    if (ttlSeconds === null) {
      await makeClaimPermanent(tx, {
        organizationId: eventType.organizationId,
        groupSessionId: session.id,
      });
    } else {
      const [extended] = await tx
        .update(schedulingClaim)
        .set({
          liveUntil: sql`greatest(${schedulingClaim.liveUntil}, clock_timestamp() + (${ttlSeconds}::int * interval '1 second'))`,
        })
        .where(eq(schedulingClaim.id, claimed.id))
        .returning({ liveUntil: schedulingClaim.liveUntil });
      liveUntil = extended?.liveUntil ?? null;
    }
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

async function liveSeatCount(
  tx: Executor,
  session: { id: string; organizationId: string },
): Promise<number> {
  const [row] = await tx
    .select({ seats: sql<number>`count(*)::int` })
    .from(schedulingBooking)
    .where(
      and(
        eq(schedulingBooking.groupSessionId, session.id),
        eq(schedulingBooking.organizationId, session.organizationId),
        or(
          inArray(schedulingBooking.status, ["confirmed", "pending_approval"]),
          and(
            eq(schedulingBooking.status, "held"),
            sql`${schedulingBooking.holdExpiresAt} > clock_timestamp()`,
          ),
        ),
      ),
    );
  return row?.seats ?? 0;
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
  if ((await liveSeatCount(tx, session)) > 0) return;
  await tx
    .delete(schedulingClaim)
    .where(
      and(
        eq(schedulingClaim.groupSessionId, session.id),
        eq(schedulingClaim.organizationId, session.organizationId),
      ),
    );
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
    const entry = candidates.members[0] ?? candidates.required[0];
    if (!entry) throw slotLost("no_hosts");
    try {
      const joined = await tx.transaction((savepoint) =>
        joinGroupSession(
          savepoint,
          plan,
          booking,
          entry.host,
          entry.membership?.scheduleId ?? null,
        ),
      );
      won = { hosts: [entry.host], liveUntil: joined.liveUntil };
      current = { ...booking, groupSessionId: joined.sessionId };
    } catch (error) {
      if (error instanceof LostSlot) throw slotLost(error.reason);
      throw error;
    }
  } else {
    won = await assignAndClaim(tx, plan, candidates, booking.id, booking.id);
  }
  current = await finishBookingRow(tx, current, won.hosts, candidates, won.liveUntil);
  const memberIds = won.hosts
    .filter((host) => candidates.members.some((entry) => entry.host.id === host.id))
    .map((host) => host.id);
  if (eventType.kind === "pool") await assignFairly(tx, current, memberIds, 1);
  const hostIds = won.hosts.map((host) => host.id);
  if (current.status === "confirmed") {
    if (eventType.kind !== "group" || (await isFirstConfirmedSeat(tx, current))) {
      await setCalendarState(tx, current, hostIds, "present");
    }
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

async function isFirstConfirmedSeat(tx: Executor, booking: BookingRow): Promise<boolean> {
  const [other] = await tx
    .select({ id: schedulingBooking.id })
    .from(schedulingBooking)
    .where(
      and(
        eq(schedulingBooking.groupSessionId, booking.groupSessionId as string),
        eq(schedulingBooking.organizationId, booking.organizationId),
        eq(schedulingBooking.status, "confirmed"),
        sql`${schedulingBooking.id} <> ${booking.id}`,
      ),
    )
    .limit(1);
  return !other;
}

/** Everything about a booking, with attendees decrypted; answers only when asked for. */
export async function toBookingObject(
  executor: Executor,
  booking: BookingRow,
  deps: Pick<SchedulingDeps, "dataKeys">,
  opts: { includeAnswers?: boolean } = {},
): Promise<BookingObjectOutput> {
  const { hostIds, attendees } = await participants(executor, booking);
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
    location: (booking.location ?? null) as BookingObjectOutput["location"],
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
  const top = ranked(candidates, seed).slice(0, LIVE_CHECK_CANDIDATES);
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
  const location = chooseLocation(eventType, request.location);
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
    await convertClaims(tx, booking, eventType, env, next);
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
      await setCalendarState(tx, updated, hostIds, "present");
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
  try {
    await tx.transaction(async (savepoint) => {
      if (booking.groupSessionId) {
        if (ttlSeconds === null) {
          const made = await makeClaimPermanent(savepoint, {
            organizationId: booking.organizationId,
            groupSessionId: booking.groupSessionId,
          });
          if (made > 0) return;
        }
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
        if (!claim) throw new LostSlot("already_claimed");
      }
    });
  } catch (error) {
    if (error instanceof LostSlot || isExclusionViolation(error)) throw slotLost("taken since");
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
  const lastSeat =
    !updated.groupSessionId ||
    (
      await tx
        .select({ id: schedulingBooking.id })
        .from(schedulingBooking)
        .where(
          and(
            eq(schedulingBooking.groupSessionId, updated.groupSessionId),
            eq(schedulingBooking.organizationId, updated.organizationId),
            eq(schedulingBooking.status, "confirmed"),
          ),
        )
        .limit(1)
    ).length === 0;
  if (lastSeat) await setCalendarState(tx, updated, hostIds, "absent");
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
    await convertClaims(tx, booking, eventType, env, "confirmed");
    const updated = await bumped(tx, booking, { status: "confirmed", approvalExpiresAt: null });
    const { hostIds } = await participants(tx, updated);
    await setCalendarState(tx, updated, hostIds, "present");
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
    if (replacement && !member) {
      throw new SchedulingError("invalid_event_type", "This booking's hosts can't be changed.", {
        param: "host",
      });
    }
    const hosts = replacement
      ? [...current.filter((host) => host.id !== member?.hostId), replacement]
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
    if (replacement && member) {
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
          hostId: replacement.id,
          organizationId: booking.organizationId,
          role: "member",
        })
        .onConflictDoNothing();
    }
    const updated = await bumped(tx, booking, {
      startAt: new Date(input.startMs),
      endAt: new Date(input.startMs + durationMinutes * MINUTE_MS),
      externalConflictAt: null,
    });
    const after = await participants(tx, updated);
    if (updated.status === "confirmed") {
      if (replacement && member) await setCalendarState(tx, updated, [member.hostId], "absent");
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
    if (updated.status !== "held") {
      await enqueueBookingNotifications(tx, updated, "rescheduled", now);
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
    const updated = await bumped(tx, booking, { location });
    await recordChange(tx, updated, {
      type: "scheduling.booking.location_ready",
      webhook: "scheduling.booking.location_ready",
      actor,
      occurredAt: nowOf(deps),
      message: "Booking location set",
    });
    return updated;
  });
  return toBookingObject(db, row, deps);
}

export async function getBooking(
  scope: Scope,
  id: string,
  deps: Pick<SchedulingDeps, "dataKeys">,
): Promise<BookingObjectOutput> {
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
  return toBookingObject(db, row, deps, { includeAnswers: true });
}

export async function listBookings(
  scope: Scope,
  query: {
    limit: number;
    after?: string | undefined;
    hostRef?: string | undefined;
    eventTypeRef?: string | undefined;
    status?: BookingRow["status"] | undefined;
    attendeeUid?: string | undefined;
    attendeeEmail?: string | undefined;
    startAfter?: Date | undefined;
    startBefore?: Date | undefined;
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
        query.after ? lt(schedulingBooking.id, query.after) : undefined,
        eventTypeId ? eq(schedulingBooking.eventTypeId, eventTypeId) : undefined,
        query.status ? eq(schedulingBooking.status, query.status) : undefined,
        query.startAfter ? gte(schedulingBooking.startAt, query.startAfter) : undefined,
        query.startBefore ? lte(schedulingBooking.startAt, query.startBefore) : undefined,
        hostId
          ? sql`exists (select 1 from ${schedulingBookingHost}
              where ${schedulingBookingHost.bookingId} = ${schedulingBooking.id}
                and ${schedulingBookingHost.hostId} = ${hostId})`
          : undefined,
        query.attendeeUid
          ? sql`exists (select 1 from ${schedulingAttendee}
              where ${schedulingAttendee.bookingId} = ${schedulingBooking.id}
                and ${schedulingAttendee.uid} = ${query.attendeeUid})`
          : undefined,
        query.attendeeEmail
          ? sql`exists (select 1 from ${schedulingAttendee}
              where ${schedulingAttendee.bookingId} = ${schedulingBooking.id}
                and ${schedulingAttendee.emailHmac} = ${emailLookup(query.attendeeEmail, deps)})`
          : undefined,
      ),
    )
    .orderBy(desc(schedulingBooking.id))
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  return {
    data: await Promise.all(page.map((row) => toBookingObject(db, row, deps))),
    hasMore: rows.length > query.limit,
  };
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
      hosts: entries.map((entry) => ({
        id: entry.host.id,
        timeZone: entry.host.timeZone,
        scheduleId: entry.membership?.scheduleId ?? null,
      })),
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
  const location = chooseLocation(eventType, request.location);
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

  const memberChoices = candidates.members.length > 0 ? ranked(candidates, hash) : [];
  const choiceSets: Candidates[] =
    memberChoices.length > 0
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
      };
      try {
        const created = await tx.transaction(async (savepoint) => {
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
        const outcome = await tx.transaction(async (savepoint) => {
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
          await tx.transaction(async (savepoint) => {
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
