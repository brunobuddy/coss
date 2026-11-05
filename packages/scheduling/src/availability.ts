/**
 * Loads what the engine needs, and asks it. The same loader serves slot lists and bookings, so
 * they see the same world; inside a booking's transaction it also sees the bucket locks' effects.
 */
import { db, type Executor, schema } from "@coss/db";
import { and, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { notZoomMeeting } from "./calendar/zoom.ts";
import { buildAvailability, overrideDateRange } from "./engine/availability.ts";
import { type CalendarFreshness, calendarVerdict } from "./engine/calendar-verdict.ts";
import { type Interval, normalizeIntervals, subtractIntervals } from "./engine/intervals.ts";
import {
  type HostInputs,
  isBookable,
  listSlots,
  type NotBookableReason,
  type SlotRule,
} from "./engine/slots.ts";
import { DAY_MS, MINUTE_MS } from "./engine/time.ts";
import { SchedulingError } from "./errors.ts";
import {
  type EventTypeHostRow,
  type EventTypeRow,
  eventTypeHosts,
  resolveEventType,
} from "./event-types.ts";
import { attributesMatch, type HostRow, hostsByIds, resolveHost } from "./hosts.ts";
import { MAX_SLOT_WINDOW_DAYS } from "./schemas.ts";
import type { SchedulingEnvironment } from "./types.ts";

const {
  schedulingBusyInterval,
  schedulingCalendar,
  schedulingCalendarConnection,
  schedulingCalendarEvent,
  schedulingClaim,
  schedulingGroupSession,
  schedulingHost,
  schedulingSchedule,
  schedulingScheduleOverride,
  schedulingSettings,
} = schema;

type Scope = Pick<SchedulingEnvironment, "organizationId" | "environmentId">;

export function slotRuleOf(
  eventType: Pick<
    EventTypeRow,
    | "durationMinutes"
    | "stepMinutes"
    | "gridTimeZone"
    | "bufferBeforeMinutes"
    | "bufferAfterMinutes"
    | "minNoticeMinutes"
    | "bookingWindow"
    | "limits"
  >,
  durationMinutes?: number,
): SlotRule {
  return {
    durationMinutes: durationMinutes ?? eventType.durationMinutes,
    stepMinutes: eventType.stepMinutes,
    gridTimeZone: eventType.gridTimeZone,
    bufferBeforeMinutes: eventType.bufferBeforeMinutes,
    bufferAfterMinutes: eventType.bufferAfterMinutes,
    minNoticeMinutes: eventType.minNoticeMinutes,
    bookingWindow: eventType.bookingWindow ?? null,
    limits: eventType.limits,
  };
}

export type LoadedHost = HostInputs & { calendarReason: string | null };

const HOSTS_PER_TURN = 25;

/** Hundreds of hosts are tens of ms of pure computing, and other requests share this thread. */
export async function takeTurn(hostIndex: number): Promise<void> {
  if (hostIndex > 0 && hostIndex % HOSTS_PER_TURN === 0) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function groupedBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(key(row));
    if (group) group.push(row);
    else groups.set(key(row), [row]);
  }
  return groups;
}

/** Everything the engine needs per host, in one pass. Never calls a calendar provider. */
export async function loadHostInputs(
  executor: Executor,
  input: {
    scope: Scope;
    hosts: readonly { id: string; timeZone: string; scheduleId: string | null }[];
    eventTypeId: string;
    fromMs: number;
    toMs: number;
    nowMs: number;
    /** Group events: this event type's sessions are joinable rather than blocking. */
    groupSessions?: boolean;
    calendarFailureMode: "hide" | "last_known";
    /** Moving a booking: its own claims don't count, since the move gives them up first. */
    exceptBookingId?: string | undefined;
  },
): Promise<Map<string, LoadedHost>> {
  const { scope, hosts, fromMs, toMs, nowMs } = input;
  const result = new Map<string, LoadedHost>();
  if (hosts.length === 0) return result;
  const hostIds = hosts.map((host) => host.id);
  const fromDate = new Date(fromMs);
  const toDate = new Date(toMs);
  // Limits count a whole week around the window, so claims are read that wide.
  const claimFrom = new Date(fromMs - 8 * DAY_MS);
  const claimTo = new Date(toMs + 8 * DAY_MS);

  const schedules = await executor
    .select()
    .from(schedulingSchedule)
    .where(
      and(
        eq(schedulingSchedule.organizationId, scope.organizationId),
        inArray(schedulingSchedule.hostId, hostIds),
      ),
    );
  const scheduleIds = schedules.map((schedule) => schedule.id);
  const dates = overrideDateRange(fromMs, toMs);
  const overrides = scheduleIds.length
    ? await executor
        .select()
        .from(schedulingScheduleOverride)
        .where(
          and(
            eq(schedulingScheduleOverride.organizationId, scope.organizationId),
            inArray(schedulingScheduleOverride.scheduleId, scheduleIds),
            gte(schedulingScheduleOverride.date, dates.from),
            lte(schedulingScheduleOverride.date, dates.to),
          ),
        )
    : [];
  const claims = await executor
    .select({
      hostId: schedulingClaim.hostId,
      eventTypeId: schedulingClaim.eventTypeId,
      groupSessionId: schedulingClaim.groupSessionId,
      occupiedStart: schedulingClaim.occupiedStart,
      occupiedEnd: schedulingClaim.occupiedEnd,
      limitDay: schedulingClaim.limitDay,
      limitWeek: schedulingClaim.limitWeek,
    })
    .from(schedulingClaim)
    .where(
      and(
        eq(schedulingClaim.organizationId, scope.organizationId),
        inArray(schedulingClaim.hostId, hostIds),
        sql`tstzrange(${schedulingClaim.occupiedStart}, ${schedulingClaim.occupiedEnd}, '[)') && tstzrange(${claimFrom.toISOString()}::timestamptz, ${claimTo.toISOString()}::timestamptz, '[)')`,
        or(
          isNull(schedulingClaim.liveUntil),
          sql`${schedulingClaim.liveUntil} > clock_timestamp()`,
        ),
        input.exceptBookingId
          ? or(
              isNull(schedulingClaim.bookingId),
              ne(schedulingClaim.bookingId, input.exceptBookingId),
            )
          : undefined,
      ),
    );
  const sessions = input.groupSessions
    ? await executor
        .select({
          id: schedulingGroupSession.id,
          hostId: schedulingGroupSession.hostId,
          startAt: schedulingGroupSession.startAt,
          capacity: schedulingGroupSession.capacity,
          // Spelled out: drizzle drops table names from columns in a select's fields, which here
          // would compare the wrong `id`.
          seats: sql<number>`(select count(*)::int from scheduling_booking b
            where b.group_session_id = scheduling_group_session.id
              and (b.status = 'confirmed'
                or (b.status = 'pending_approval'
                  and (b.approval_expires_at is null or b.approval_expires_at > clock_timestamp()))
                or (b.status = 'held' and b.hold_expires_at > clock_timestamp())))`,
        })
        .from(schedulingGroupSession)
        .where(
          and(
            eq(schedulingGroupSession.organizationId, scope.organizationId),
            eq(schedulingGroupSession.eventTypeId, input.eventTypeId),
            inArray(schedulingGroupSession.hostId, hostIds),
            gte(schedulingGroupSession.startAt, claimFrom),
            lte(schedulingGroupSession.startAt, claimTo),
          ),
        )
    : [];
  const busy = await executor
    .select({
      hostId: schedulingBusyInterval.hostId,
      startAt: schedulingBusyInterval.startAt,
      endAt: schedulingBusyInterval.endAt,
    })
    .from(schedulingBusyInterval)
    .where(
      and(
        eq(schedulingBusyInterval.organizationId, scope.organizationId),
        inArray(schedulingBusyInterval.hostId, hostIds),
        sql`${schedulingBusyInterval.endAt} > ${fromDate.toISOString()}::timestamptz - interval '1 day'`,
        sql`${schedulingBusyInterval.startAt} < ${toDate.toISOString()}::timestamptz + interval '1 day'`,
      ),
    );
  // `freeBusy` can't say which events are ours, so what we wrote is subtracted back out.
  const ownEvents = await executor
    .select({
      hostId: schedulingCalendarEvent.hostId,
      desiredStart: schedulingCalendarEvent.desiredStart,
      desiredEnd: schedulingCalendarEvent.desiredEnd,
    })
    .from(schedulingCalendarEvent)
    .where(
      and(
        eq(schedulingCalendarEvent.organizationId, scope.organizationId),
        inArray(schedulingCalendarEvent.hostId, hostIds),
        eq(schedulingCalendarEvent.desiredState, "present"),
        eq(schedulingCalendarEvent.externalState, "in_sync"),
        notZoomMeeting(),
        sql`${schedulingCalendarEvent.desiredEnd} > ${fromDate.toISOString()}::timestamptz - interval '1 day'`,
        sql`${schedulingCalendarEvent.desiredStart} < ${toDate.toISOString()}::timestamptz + interval '1 day'`,
      ),
    );
  const calendars = await executor
    .select({
      hostId: schedulingCalendar.hostId,
      verifiedAt: schedulingCalendar.verifiedAt,
      coveredUntil: schedulingCalendar.coveredUntil,
      channelId: schedulingCalendar.channelId,
      status: schedulingCalendarConnection.status,
      provider: schedulingCalendarConnection.provider,
    })
    .from(schedulingCalendar)
    .innerJoin(
      schedulingCalendarConnection,
      and(
        eq(schedulingCalendarConnection.id, schedulingCalendar.connectionId),
        eq(schedulingCalendarConnection.organizationId, schedulingCalendar.organizationId),
      ),
    )
    .where(
      and(
        eq(schedulingCalendar.organizationId, scope.organizationId),
        inArray(schedulingCalendar.hostId, hostIds),
        eq(schedulingCalendar.readBusy, true),
      ),
    );

  // Up to 500 hosts with thousands of rows each: filtering per host took more time than the queries.
  const schedulesByHost = groupedBy(schedules, (row) => row.hostId);
  const overridesBySchedule = groupedBy(overrides, (row) => row.scheduleId);
  const claimsByHost = groupedBy(claims, (row) => row.hostId);
  const ownEventsByHost = groupedBy(ownEvents, (row) => row.hostId);
  const busyByHost = groupedBy(busy, (row) => row.hostId);
  const sessionsByHost = groupedBy(sessions, (row) => row.hostId);
  const calendarsByHost = groupedBy(calendars, (row) => row.hostId);

  for (const [index, host] of hosts.entries()) {
    await takeTurn(index);
    const hostSchedules = schedulesByHost.get(host.id) ?? [];
    const schedule = host.scheduleId
      ? hostSchedules.find((candidate) => candidate.id === host.scheduleId)
      : hostSchedules.find((candidate) => candidate.isDefault);
    const availability = schedule
      ? buildAvailability({
          timeZone: schedule.timeZone,
          rules: schedule.rules,
          overrides: overridesBySchedule.get(schedule.id) ?? [],
          // A wider range than asked for, so a slot's end can fall past the window's.
          fromMs: fromMs - DAY_MS,
          toMs: toMs + 2 * DAY_MS,
        })
      : [];
    const hostClaims = claimsByHost.get(host.id) ?? [];
    const own = normalizeIntervals(
      (ownEventsByHost.get(host.id) ?? []).map((event) => ({
        startMs: event.desiredStart.getTime(),
        endMs: event.desiredEnd.getTime(),
      })),
    );
    const externalBusy = subtractIntervals(
      normalizeIntervals(
        (busyByHost.get(host.id) ?? []).map((interval) => ({
          startMs: interval.startAt.getTime(),
          endMs: interval.endAt.getTime(),
        })),
      ),
      own,
    );
    const limitUsage: Record<string, number> = {};
    for (const claim of hostClaims) {
      const scopes = claim.eventTypeId === input.eventTypeId ? ["event_type", "host"] : ["host"];
      for (const limitScope of scopes) {
        const day = `${limitScope}:day:${claim.limitDay}`;
        const week = `${limitScope}:week:${claim.limitWeek}`;
        limitUsage[day] = (limitUsage[day] ?? 0) + 1;
        limitUsage[week] = (limitUsage[week] ?? 0) + 1;
      }
    }
    const hostSessions = sessionsByHost.get(host.id) ?? [];
    const sessionClaims = new Map(
      hostClaims.flatMap((claim) =>
        claim.groupSessionId && hostSessions.some((session) => session.id === claim.groupSessionId)
          ? [[claim.groupSessionId, claim]]
          : [],
      ),
    );
    const blocking: Interval[] = hostClaims
      .filter((claim) => !(claim.groupSessionId && sessionClaims.has(claim.groupSessionId)))
      .map((claim) => ({
        startMs: claim.occupiedStart.getTime(),
        endMs: claim.occupiedEnd.getTime(),
      }));
    const verdict = calendarVerdict(
      (calendarsByHost.get(host.id) ?? [])
        // Nobody hosts a simulated calendar, and nothing syncs it: its busy times are what's set.
        .filter((calendar) => calendar.provider !== "simulated")
        .map(
          (calendar): CalendarFreshness => ({
            connectionHealthy: calendar.status === "active",
            verifiedAtMs: calendar.verifiedAt?.getTime() ?? null,
            coveredUntilMs: calendar.coveredUntil?.getTime() ?? null,
            hasChannel: calendar.channelId !== null,
          }),
        ),
      nowMs,
      toMs,
    );
    result.set(host.id, {
      timeZone: host.timeZone,
      availability,
      externalBusy,
      claims: normalizeIntervals(blocking),
      sessions: hostSessions.flatMap((session) => {
        const claim = sessionClaims.get(session.id);
        return claim
          ? [
              {
                startMs: session.startAt.getTime(),
                occupied: {
                  startMs: claim.occupiedStart.getTime(),
                  endMs: claim.occupiedEnd.getTime(),
                },
                seatsLeft: session.capacity - session.seats,
                seatsTaken: session.seats,
              },
            ]
          : [];
      }),
      limitUsage,
      calendarVerified: verdict.verified || input.calendarFailureMode === "last_known",
      calendarReason: verdict.verified ? null : verdict.reason,
    });
  }
  return result;
}

export async function calendarFailureModeOf(
  executor: Executor,
  scope: Scope,
): Promise<"hide" | "last_known"> {
  const [row] = await executor
    .select({ mode: schedulingSettings.calendarFailureMode })
    .from(schedulingSettings)
    .where(
      and(
        eq(schedulingSettings.organizationId, scope.organizationId),
        eq(schedulingSettings.environmentId, scope.environmentId),
      ),
    )
    .limit(1);
  return row?.mode ?? "hide";
}

export type Candidates = {
  required: { host: HostRow; membership: EventTypeHostRow | null }[];
  members: { host: HostRow; membership: EventTypeHostRow | null }[];
};

/**
 * Who could take a booking of this event type: its active assigned hosts, filter matches for a
 * pool, narrowed by a specific host or attributes. Required hosts can't be filtered away.
 */
export async function candidatesOf(
  executor: Executor,
  scope: Scope,
  eventType: EventTypeRow,
  narrow: {
    hostRef?: string | undefined;
    attributes?: Record<string, string | string[]> | undefined;
    hostRefs?: readonly string[] | undefined;
  } = {},
): Promise<Candidates> {
  const rows = await eventTypeHosts(executor, eventType);
  const memberships = rows.filter((row) => !row.removedAt);
  const removed = new Set(rows.filter((row) => row.removedAt).map((row) => row.hostId));
  const assigned = await hostsByIds(
    executor,
    scope,
    memberships.filter((row) => row.assigned).map((row) => row.hostId),
  );
  const byHost = new Map(memberships.map((row) => [row.hostId, row]));
  const hosts = new Map(assigned.map((host) => [host.id, host]));
  if (eventType.kind === "pool" && eventType.hostFilter) {
    const filtered = await executor
      .select()
      .from(schedulingHost)
      .where(
        and(
          eq(schedulingHost.organizationId, scope.organizationId),
          eq(schedulingHost.environmentId, scope.environmentId),
          eq(schedulingHost.status, "active"),
        ),
      );
    for (const host of filtered) {
      // Taken out of the pool by name, which a filter doesn't undo.
      if (removed.has(host.id)) continue;
      if (attributesMatch(host.attributes, eventType.hostFilter)) hosts.set(host.id, host);
    }
  }
  const only = new Set<string>();
  for (const ref of [...(narrow.hostRef ? [narrow.hostRef] : []), ...(narrow.hostRefs ?? [])]) {
    only.add((await resolveHost(executor, scope, ref)).id);
  }
  const required: Candidates["required"] = [];
  const members: Candidates["members"] = [];
  let hasMembers = false;
  for (const host of hosts.values()) {
    const membership = byHost.get(host.id) ?? null;
    if (membership?.role !== "required") hasMembers = true;
    if (host.status !== "active") continue;
    if (membership?.role === "required") {
      required.push({ host, membership });
      continue;
    }
    if (only.size > 0 && !only.has(host.id)) continue;
    if (!attributesMatch(host.attributes, narrow.attributes)) continue;
    members.push({ host, membership });
  }
  // A pool's required hosts come with a member: they're never booked alone in place of one.
  if (hasMembers && members.length === 0) return { required: [], members };
  return { required, members };
}

export function checkWindow(fromMs: number, toMs: number): void {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    throw new SchedulingError("invalid_time", "`end` must be a valid time after `start`.");
  }
  if (toMs - fromMs > MAX_SLOT_WINDOW_DAYS * DAY_MS) {
    throw new SchedulingError(
      "invalid_time",
      `Ask for at most ${MAX_SLOT_WINDOW_DAYS} days at a time.`,
    );
  }
}

/** `seatsLeft`: a group event type's free seats at that start, otherwise null. */
export type SlotResult = {
  startMs: number;
  endMs: number;
  hostIds: string[];
  seatsLeft: number | null;
};

/** A required host must be free at every slot, and so must one member if there are any. */
export function combineSlots(
  perHost: ReadonlyMap<string, readonly number[]>,
  required: readonly string[],
  members: readonly string[],
  durationMs: number,
): SlotResult[] {
  const byStart = new Map<number, string[]>();
  for (const hostId of members) {
    for (const start of perHost.get(hostId) ?? []) {
      const hosts = byStart.get(start);
      if (hosts) hosts.push(hostId);
      else byStart.set(start, [hostId]);
    }
  }
  let starts: Iterable<number>;
  if (required.length > 0) {
    const [first, ...others] = required;
    const common = new Set(perHost.get(first as string) ?? []);
    for (const hostId of others) {
      const own = new Set(perHost.get(hostId) ?? []);
      for (const start of common) if (!own.has(start)) common.delete(start);
    }
    starts = common;
  } else {
    starts = byStart.keys();
  }
  const result: SlotResult[] = [];
  for (const start of starts) {
    const memberHosts = byStart.get(start);
    if (members.length > 0 && !memberHosts) continue;
    result.push({
      startMs: start,
      endMs: start + durationMs,
      hostIds: [...required, ...(memberHosts ?? [])],
      seatsLeft: null,
    });
  }
  return result.sort((a, b) => a.startMs - b.startMs);
}

function scheduleOf(entry: { membership: EventTypeHostRow | null }): string | null {
  return entry.membership?.scheduleId ?? null;
}

function durationOf(eventType: EventTypeRow, requested: number | undefined): number {
  const duration = requested ?? eventType.durationMinutes;
  if (duration !== eventType.durationMinutes && !eventType.durationOptions.includes(duration)) {
    throw new SchedulingError(
      "invalid_time",
      `${duration} minutes isn't one of this event type's durations.`,
      { param: "duration_minutes" },
    );
  }
  return duration;
}

export async function listEventTypeSlots(
  scope: Scope,
  input: {
    eventTypeRef: string;
    fromMs: number;
    toMs: number;
    nowMs: number;
    hostRef?: string | undefined;
    hostRefs?: readonly string[] | undefined;
    attributes?: Record<string, string | string[]> | undefined;
    durationMinutes?: number | undefined;
  },
): Promise<SlotResult[]> {
  checkWindow(input.fromMs, input.toMs);
  const eventType = await resolveEventType(db, scope, input.eventTypeRef);
  if (eventType.status !== "active") return [];
  const duration = durationOf(eventType, input.durationMinutes);
  const candidates = await candidatesOf(db, scope, eventType, {
    hostRef: input.hostRef,
    hostRefs: input.hostRefs,
    attributes: input.attributes,
  });
  const all = [...candidates.required, ...candidates.members];
  const loaded = await loadHostInputs(db, {
    scope,
    hosts: all.map((entry) => ({
      id: entry.host.id,
      timeZone: entry.host.timeZone,
      scheduleId: scheduleOf(entry),
    })),
    eventTypeId: eventType.id,
    fromMs: input.fromMs,
    toMs: input.toMs,
    nowMs: input.nowMs,
    groupSessions: eventType.kind === "group",
    calendarFailureMode: await calendarFailureModeOf(db, scope),
  });
  const rule = slotRuleOf(eventType, duration);
  const perHost = new Map<string, number[]>();
  for (const [index, [hostId, host]] of [...loaded].entries()) {
    await takeTurn(index);
    perHost.set(
      hostId,
      listSlots({ nowMs: input.nowMs, rule, host, fromMs: input.fromMs, toMs: input.toMs }),
    );
  }
  const slots = combineSlots(
    perHost,
    candidates.required.map((entry) => entry.host.id),
    candidates.members.map((entry) => entry.host.id),
    duration * MINUTE_MS,
  );
  if (eventType.kind !== "group") return slots;
  // A session keeps the capacity it was made with, even once its last seat's gone and it has no
  // claim, and booking that start reuses it.
  const sessions = await db
    .select({
      hostId: schedulingGroupSession.hostId,
      startAt: schedulingGroupSession.startAt,
      capacity: schedulingGroupSession.capacity,
    })
    .from(schedulingGroupSession)
    .where(
      and(
        eq(schedulingGroupSession.eventTypeId, eventType.id),
        eq(schedulingGroupSession.organizationId, scope.organizationId),
        gte(schedulingGroupSession.startAt, new Date(input.fromMs)),
        lt(schedulingGroupSession.startAt, new Date(input.toMs)),
      ),
    );
  const capacityOf = new Map(
    sessions.map((session) => [`${session.hostId}:${session.startAt.getTime()}`, session.capacity]),
  );
  return slots.map((slot) => ({
    ...slot,
    seatsLeft: Math.max(
      ...slot.hostIds.map(
        (hostId) =>
          loaded.get(hostId)?.sessions?.find((session) => session.startMs === slot.startMs)
            ?.seatsLeft ??
          capacityOf.get(`${hostId}:${slot.startMs}`) ??
          (eventType.capacity as number),
      ),
    ),
  }));
}

export type SlotUnavailableReason = NotBookableReason | "event_type_inactive" | "no_hosts";

export type SlotExplanation = {
  startMs: number;
  endMs: number;
  available: boolean;
  /** Null when it's available. The first host's reason, when several hosts are refused. */
  reason: SlotUnavailableReason | null;
  hosts: {
    hostId: string;
    required: boolean;
    available: boolean;
    reason: NotBookableReason | null;
    /** Why a `calendar_unverified` host's calendars can't be trusted. */
    calendarReason: string | null;
  }[];
};

/**
 * Why a start can or can't be booked, host by host, from the same `isBookable` booking uses. This
 * tells whoever's asking about a host's calendar, so it never reaches the hosted pages.
 */
export async function explainSlot(
  scope: Scope,
  input: {
    eventTypeRef: string;
    startMs: number;
    nowMs: number;
    hostRef?: string | undefined;
    attributes?: Record<string, string | string[]> | undefined;
    durationMinutes?: number | undefined;
  },
): Promise<SlotExplanation> {
  const eventType = await resolveEventType(db, scope, input.eventTypeRef);
  const duration = durationOf(eventType, input.durationMinutes);
  const { startMs, nowMs } = input;
  const endMs = startMs + duration * MINUTE_MS;
  if (eventType.status !== "active") {
    return { startMs, endMs, available: false, reason: "event_type_inactive", hosts: [] };
  }
  const candidates = await candidatesOf(db, scope, eventType, {
    hostRef: input.hostRef,
    attributes: input.attributes,
  });
  const entries = [...candidates.required, ...candidates.members];
  if (entries.length === 0) {
    return { startMs, endMs, available: false, reason: "no_hosts", hosts: [] };
  }
  const loaded = await loadHostInputs(db, {
    scope,
    hosts: entries.map((entry) => ({
      id: entry.host.id,
      timeZone: entry.host.timeZone,
      scheduleId: scheduleOf(entry),
    })),
    eventTypeId: eventType.id,
    fromMs: startMs,
    toMs: endMs,
    nowMs,
    groupSessions: eventType.kind === "group",
    calendarFailureMode: await calendarFailureModeOf(db, scope),
  });
  const rule = slotRuleOf(eventType, duration);
  const hosts = entries.map((entry) => {
    const host = loaded.get(entry.host.id);
    // Joining a session with people in it commits the host to nothing new, so booking doesn't ask
    // `isBookable`: notice or changed hours don't stop it, only a full session does.
    const session = host?.sessions?.find((candidate) => candidate.startMs === startMs);
    const verdict: ReturnType<typeof isBookable> = !host
      ? { ok: false, reason: "outside_availability" }
      : session && session.seatsLeft <= 0
        ? { ok: false, reason: "session_full" }
        : session?.seatsTaken
          ? { ok: true }
          : isBookable(startMs, { nowMs, rule, host });
    const reason = verdict.ok ? null : verdict.reason;
    return {
      hostId: entry.host.id,
      required: candidates.required.includes(entry),
      available: verdict.ok,
      reason,
      calendarReason: reason === "calendar_unverified" ? (host?.calendarReason ?? null) : null,
    };
  });
  const required = hosts.filter((host) => host.required);
  const members = hosts.filter((host) => !host.required);
  const blocking =
    required.find((host) => !host.available) ??
    (members.length > 0 && !members.some((host) => host.available) ? members[0] : undefined);
  return {
    startMs,
    endMs,
    available: !blocking,
    reason: blocking?.reason ?? null,
    hosts,
  };
}

/** For a marketplace's "who's free": each host's soonest slots, soonest first. */
export async function searchAvailability(
  scope: Scope,
  input: {
    eventTypeRef: string;
    fromMs: number;
    toMs: number;
    nowMs: number;
    attributes?: Record<string, string | string[]> | undefined;
    hostRefs?: readonly string[] | undefined;
    slotsPerHost: number;
    limit: number;
    /** The plan's hosts per search: beyond them, `hasMore` says there's more than was searched. */
    maxHosts?: number | null | undefined;
  },
): Promise<{
  data: { hostId: string; uid: string | null; slots: { startMs: number; endMs: number }[] }[];
  hasMore: boolean;
}> {
  checkWindow(input.fromMs, input.toMs);
  const eventType = await resolveEventType(db, scope, input.eventTypeRef);
  if (eventType.status !== "active") return { data: [], hasMore: false };
  const candidates = await candidatesOf(db, scope, eventType, {
    attributes: input.attributes,
    hostRefs: input.hostRefs,
  });
  const entries =
    input.maxHosts != null ? candidates.members.slice(0, input.maxHosts) : candidates.members;
  const cutShort = entries.length < candidates.members.length;
  const loaded = await loadHostInputs(db, {
    scope,
    hosts: entries.map((entry) => ({
      id: entry.host.id,
      timeZone: entry.host.timeZone,
      scheduleId: scheduleOf(entry),
    })),
    eventTypeId: eventType.id,
    fromMs: input.fromMs,
    toMs: input.toMs,
    nowMs: input.nowMs,
    groupSessions: eventType.kind === "group",
    calendarFailureMode: await calendarFailureModeOf(db, scope),
  });
  const rule = slotRuleOf(eventType);
  const duration = rule.durationMinutes * MINUTE_MS;
  const rows: {
    hostId: string;
    uid: string | null;
    slots: { startMs: number; endMs: number }[];
  }[] = [];
  for (const [index, entry] of entries.entries()) {
    await takeTurn(index);
    const host = loaded.get(entry.host.id);
    if (!host) continue;
    const slots = listSlots({
      nowMs: input.nowMs,
      rule,
      host,
      fromMs: input.fromMs,
      toMs: input.toMs,
      limit: input.slotsPerHost,
    });
    if (slots.length === 0) continue;
    rows.push({
      hostId: entry.host.id,
      uid: entry.host.uid,
      slots: slots.map((startMs) => ({ startMs, endMs: startMs + duration })),
    });
  }
  rows.sort((a, b) => (a.slots[0]?.startMs ?? 0) - (b.slots[0]?.startMs ?? 0));
  return { data: rows.slice(0, input.limit), hasMore: cutShort || rows.length > input.limit };
}
