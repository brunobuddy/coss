/**
 * Time a host is away. It blocks new bookings (`HostInputs.away`, checked by `isBookable`) and never
 * touches existing ones, which it only reports as conflicts: coss.com never auto-cancels a booking.
 *
 * Reasons can say someone's on medical leave, so they stay out of webhooks, logs, calendars and
 * anything an attendee sees. Notes are encrypted. A deleted entry stays until its calendar event has
 * gone, because the ledger row that deletes the event belongs to it.
 */
import { db, type Executor, schema, type Transaction } from "@coss/db";
import { ID_PREFIXES, newId } from "@coss/db/id";
import { appendLogEntries } from "@coss/logs";
import { decryptSecret, encryptSecret, enqueueWebhookMessage } from "@coss/webhooks";
import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, notInArray, or, sql } from "drizzle-orm";
import type { Interval } from "./engine/intervals.ts";
import { DAY_MS, parseLocalDate, wallClockToInstant } from "./engine/time.ts";
import { SchedulingError } from "./errors.ts";
import { attributesMatch, checkTimeZone, type HostRow, hostsByIds, resolveHost } from "./hosts.ts";
import { queueReassignment, type ReassignmentStrategy } from "./reassignment-row.ts";
import {
  type CreateOutOfOfficeRequestOutput,
  MAX_OUT_OF_OFFICE_DAYS,
  MAX_OUT_OF_OFFICE_HOSTS,
  OUT_OF_OFFICE_PRESET_REASONS,
  type OutOfOfficeConflictOutput,
  type OutOfOfficeObjectOutput,
  type OutOfOfficeWebhookEventType,
  type PutOutOfOfficeRequestOutput,
  type UpdateOutOfOfficeRequestOutput,
} from "./schemas.ts";
import { refuseLinks, type SetupScreening, screenSetup } from "./screening.ts";
import { getSettingsRow } from "./settings.ts";
import { nowOf, type SchedulingDeps, type SchedulingEnvironment } from "./types.ts";

const {
  schedulingBooking,
  schedulingBookingHost,
  schedulingCalendar,
  schedulingCalendarEvent,
  schedulingEventType,
  schedulingEventTypeHost,
  schedulingHost,
  schedulingNotification,
  schedulingOutOfOffice,
  schedulingOutOfOfficeDelegate,
} = schema;

export type OutOfOfficeRow = typeof schedulingOutOfOffice.$inferSelect;
type Scope = Pick<SchedulingEnvironment, "organizationId" | "environmentId">;
type Keys = Pick<SchedulingDeps, "dataKeys">;
type Actor = OutOfOfficeRow["actor"];
type Source = OutOfOfficeRow["source"];

/** Keeps a caller to one host's entries: a host session's. */
type Only = { hostId?: string | undefined };

export function toOutOfOfficeObject(
  row: OutOfOfficeRow,
  keys: Keys,
  delegates: readonly string[],
): OutOfOfficeObjectOutput {
  return {
    object: "scheduling.out_of_office",
    id: row.id,
    host: row.hostId,
    start: row.startAt.toISOString(),
    end: row.endAt.toISOString(),
    all_day:
      row.startDate && row.endDate && row.allDayZone
        ? { start_date: row.startDate, end_date: row.endDate, time_zone: row.allDayZone }
        : null,
    reason: row.reason,
    notes: row.encryptedNotes ? decryptSecret(row.encryptedNotes, keys.dataKeys) : null,
    public_message: row.publicMessage,
    show_on_calendar: row.showOnCalendar,
    delegates: [...delegates],
    existing_bookings: row.existingBookings,
    external_id: row.externalId,
    group: row.groupId,
    source: row.source,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

type When = {
  start?: string | undefined;
  end?: string | undefined;
  start_date?: string | undefined;
  end_date?: string | undefined;
  time_zone?: string | undefined;
};

type Window = {
  startAt: Date;
  endAt: Date;
  startDate: string | null;
  endDate: string | null;
  allDayZone: string | null;
};

const MAX_EVENT_TYPES_TO_ASK = 100;

const invalid = (message: string, param: string) =>
  new SchedulingError("invalid_time", message, { param });

function localDate(value: string, param: string): number {
  try {
    return parseLocalDate(value);
  } catch {
    throw invalid(`"${value}" isn't a date.`, param);
  }
}

function checkedSpan(startMs: number, endMs: number, param: string): void {
  if (endMs <= startMs) throw invalid("The end must be after the start.", param);
  if (endMs - startMs > MAX_OUT_OF_OFFICE_DAYS * DAY_MS) {
    throw invalid(`An entry can last at most ${MAX_OUT_OF_OFFICE_DAYS} days.`, param);
  }
}

/** Instants, or whole local dates, resolved once: changing a host's zone later doesn't move them. */
function windowOf(when: When, host: Pick<HostRow, "timeZone">): Window {
  const instants = when.start !== undefined || when.end !== undefined;
  const dates = when.start_date !== undefined || when.end_date !== undefined;
  if (instants === dates) {
    throw invalid("Give either `start` and `end`, or `start_date` and `end_date`.", "start");
  }
  if (instants) {
    const startMs = Date.parse(when.start ?? "");
    const endMs = Date.parse(when.end ?? "");
    if (!Number.isFinite(startMs)) throw invalid("`start` isn't a valid time.", "start");
    if (!Number.isFinite(endMs)) throw invalid("`end` isn't a valid time.", "end");
    checkedSpan(startMs, endMs, "end");
    return {
      startAt: new Date(startMs),
      endAt: new Date(endMs),
      startDate: null,
      endDate: null,
      allDayZone: null,
    };
  }
  if (!when.start_date) throw invalid("`start_date` is required.", "start_date");
  if (!when.end_date) throw invalid("`end_date` is required.", "end_date");
  const zone = when.time_zone ?? host.timeZone;
  checkTimeZone(zone, "time_zone");
  const firstDay = localDate(when.start_date, "start_date");
  const lastDay = localDate(when.end_date, "end_date");
  if (lastDay < firstDay) throw invalid("`end_date` is before `start_date`.", "end_date");
  const startMs = wallClockToInstant(firstDay, zone);
  // The end date is included, so this runs to the start of the day after.
  const endMs = wallClockToInstant(lastDay + DAY_MS, zone);
  checkedSpan(startMs, endMs, "end_date");
  return {
    startAt: new Date(startMs),
    endAt: new Date(endMs),
    startDate: when.start_date,
    endDate: when.end_date,
    allDayZone: zone,
  };
}

export async function delegatesOf(
  executor: Executor,
  rows: readonly Pick<OutOfOfficeRow, "id" | "organizationId">[],
): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>();
  const [first] = rows;
  if (!first) return found;
  const delegates = await executor
    .select({
      entry: schedulingOutOfOfficeDelegate.outOfOfficeId,
      hostId: schedulingOutOfOfficeDelegate.hostId,
    })
    .from(schedulingOutOfOfficeDelegate)
    .where(
      and(
        eq(schedulingOutOfOfficeDelegate.organizationId, first.organizationId),
        inArray(
          schedulingOutOfOfficeDelegate.outOfOfficeId,
          rows.map((row) => row.id),
        ),
      ),
    )
    .orderBy(asc(schedulingOutOfOfficeDelegate.position));
  for (const row of delegates) found.set(row.entry, [...(found.get(row.entry) ?? []), row.hostId]);
  return found;
}

async function objectsOf(
  executor: Executor,
  rows: readonly OutOfOfficeRow[],
  keys: Keys,
): Promise<OutOfOfficeObjectOutput[]> {
  const delegates = await delegatesOf(executor, rows);
  return rows.map((row) => toOutOfOfficeObject(row, keys, delegates.get(row.id) ?? []));
}

async function objectOf(
  executor: Executor,
  row: OutOfOfficeRow,
  keys: Keys,
): Promise<OutOfOfficeObjectOutput> {
  const [object] = await objectsOf(executor, [row], keys);
  return object as OutOfOfficeObjectOutput;
}

/** References become ids once, in the order given, so a later rename doesn't change who was meant. */
async function delegateIdsOf(
  scope: Scope,
  refs: readonly string[] | undefined,
  allowed: readonly string[] | undefined,
): Promise<string[] | undefined> {
  if (refs === undefined) return undefined;
  const ids: string[] = [];
  for (const ref of refs) {
    const host = await resolveHost(db, scope, ref);
    if (allowed && !allowed.includes(host.id)) {
      throw new SchedulingError("invalid_out_of_office", "That host can't cover for you.", {
        param: "delegates",
      });
    }
    if (!ids.includes(host.id)) ids.push(host.id);
  }
  return ids;
}

/**
 * What a host's standing in for now, read with their row locked. A booking worked out who could take
 * it before it waited for that lock, and changing cover takes the same lock (`coveringOf`).
 */
export async function standingCover(
  executor: Executor,
  scope: Scope,
  hostIds: readonly string[],
  principalsOf?: ReadonlyMap<string, readonly string[]>,
): Promise<ReadonlyMap<string, readonly Interval[]>> {
  const found = new Map<string, Interval[]>();
  if (hostIds.length === 0) return found;
  const rows = await executor
    .select({
      hostId: schedulingOutOfOfficeDelegate.hostId,
      principal: schedulingOutOfOffice.hostId,
      startAt: schedulingOutOfOffice.startAt,
      endAt: schedulingOutOfOffice.endAt,
    })
    .from(schedulingOutOfOfficeDelegate)
    .innerJoin(
      schedulingOutOfOffice,
      eq(schedulingOutOfOffice.id, schedulingOutOfOfficeDelegate.outOfOfficeId),
    )
    .where(
      and(
        eq(schedulingOutOfOfficeDelegate.organizationId, scope.organizationId),
        inArray(schedulingOutOfOfficeDelegate.hostId, [...hostIds]),
        isNull(schedulingOutOfOffice.deletedAt),
      ),
    );
  for (const row of rows) {
    // Standing in for someone this booking couldn't go to says nothing about it.
    const principals = principalsOf?.get(row.hostId);
    if (principals && !principals.includes(row.principal)) continue;
    const windows = found.get(row.hostId) ?? [];
    windows.push({ startMs: row.startAt.getTime(), endMs: row.endAt.getTime() });
    found.set(row.hostId, windows);
  }
  return found;
}

/** Whose rows bookers hold while taking this entry's cover: changing it waits for them. */
async function coveringOf(
  executor: Executor,
  row: Pick<OutOfOfficeRow, "id" | "organizationId">,
): Promise<string[]> {
  return (await delegatesOf(executor, [row])).get(row.id) ?? [];
}

/** Someone can't cover for themselves. Across many hosts, that only drops them from their own list. */
async function setDelegates(
  tx: Executor,
  row: Pick<OutOfOfficeRow, "id" | "organizationId" | "hostId">,
  hostIds: readonly string[],
): Promise<void> {
  await tx
    .delete(schedulingOutOfOfficeDelegate)
    .where(
      and(
        eq(schedulingOutOfOfficeDelegate.outOfOfficeId, row.id),
        eq(schedulingOutOfOfficeDelegate.organizationId, row.organizationId),
      ),
    );
  const delegates = hostIds.filter((id) => id !== row.hostId);
  if (delegates.length === 0) return;
  await tx.insert(schedulingOutOfOfficeDelegate).values(
    delegates.map((hostId, position) => ({
      outOfOfficeId: row.id,
      organizationId: row.organizationId,
      hostId,
      position,
    })),
  );
}

function refuseSelfCover(hostIds: readonly string[] | undefined, hostId: string): void {
  if (hostIds?.includes(hostId)) {
    throw new SchedulingError("invalid_out_of_office", "A host can't cover for themselves.", {
      param: "delegates",
    });
  }
}

/**
 * Who a host could name to cover for them: whoever could also be booked for what they do. Only ids
 * and names: this is what a host's own page may know about the others.
 */
export async function listPossibleDelegates(
  scope: Scope,
  hostId: string,
): Promise<{ id: string; name: string }[]> {
  const hosts = await db
    .select({
      id: schedulingHost.id,
      name: schedulingHost.name,
      attributes: schedulingHost.attributes,
    })
    .from(schedulingHost)
    .where(
      and(
        eq(schedulingHost.organizationId, scope.organizationId),
        eq(schedulingHost.environmentId, scope.environmentId),
        eq(schedulingHost.status, "active"),
      ),
    );
  const me = hosts.find((host) => host.id === hostId);
  if (!me) return [];
  const eventTypes = await db
    .select({
      id: schedulingEventType.id,
      kind: schedulingEventType.kind,
      hostFilter: schedulingEventType.hostFilter,
    })
    .from(schedulingEventType)
    .where(
      and(
        eq(schedulingEventType.organizationId, scope.organizationId),
        eq(schedulingEventType.environmentId, scope.environmentId),
        eq(schedulingEventType.status, "active"),
      ),
    )
    .limit(MAX_EVENT_TYPES_TO_ASK);
  // A pool's filter takes whoever matches now, and most of them have no row saying so. A row says
  // who's named, and who's been taken off by name, which no filter overrides.
  const memberships = await db
    .select({
      eventTypeId: schedulingEventTypeHost.eventTypeId,
      hostId: schedulingEventTypeHost.hostId,
      assigned: schedulingEventTypeHost.assigned,
      removedAt: schedulingEventTypeHost.removedAt,
    })
    .from(schedulingEventTypeHost)
    .where(
      and(
        eq(schedulingEventTypeHost.organizationId, scope.organizationId),
        inArray(
          schedulingEventTypeHost.eventTypeId,
          eventTypes.map((eventType) => eventType.id),
        ),
      ),
    );
  const named = new Map<string, Set<string>>();
  const removed = new Map<string, Set<string>>();
  for (const row of memberships) {
    const into = row.removedAt ? removed : row.assigned ? named : null;
    if (!into) continue;
    into.set(row.eventTypeId, (into.get(row.eventTypeId) ?? new Set()).add(row.hostId));
  }
  const takes = (
    eventType: (typeof eventTypes)[number],
    host: { id: string; attributes: Record<string, unknown> },
  ) => {
    if (removed.get(eventType.id)?.has(host.id)) return false;
    if (named.get(eventType.id)?.has(host.id)) return true;
    return (
      eventType.kind === "pool" &&
      eventType.hostFilter !== null &&
      attributesMatch(host.attributes as never, eventType.hostFilter)
    );
  };
  const mine = eventTypes.filter((eventType) => takes(eventType, me));
  return hosts
    .filter((host) => host.id !== hostId && mine.some((eventType) => takes(eventType, host)))
    .map((host) => ({ id: host.id, name: host.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function checkReason(scope: Scope, reason: string | undefined): Promise<void> {
  if (!reason) return;
  if ((OUT_OF_OFFICE_PRESET_REASONS as readonly string[]).includes(reason)) return;
  const settings = await getSettingsRow(scope);
  if (settings?.outOfOfficeReasons?.some((custom) => custom.key === reason)) return;
  throw new SchedulingError(
    "invalid_out_of_office",
    `"${reason}" isn't one of this environment's reasons.`,
    { param: "reason" },
  );
}

/** Host references become ids, once, so a later rename doesn't change who was meant. */
async function reassignStrategyOf(
  scope: Scope,
  params: Pick<CreateOutOfOfficeRequestOutput, "existing_bookings" | "reassign">,
): Promise<ReassignmentStrategy | null> {
  if (params.existing_bookings !== "reassign" || !params.reassign) return null;
  if (params.reassign.to_host) {
    const host = await resolveHost(db, scope, params.reassign.to_host);
    return { kind: "to_host", host_id: host.id };
  }
  const preferred: string[] = [];
  for (const ref of params.reassign.preferred_hosts ?? []) {
    preferred.push((await resolveHost(db, scope, ref)).id);
  }
  return {
    kind: "auto",
    preferred_host_ids: preferred,
    otherwise: params.reassign.otherwise ?? "auto",
  };
}

async function checkMessage(
  env: SchedulingEnvironment,
  message: string | null | undefined,
  screen: SetupScreening | undefined,
): Promise<void> {
  refuseLinks(message, "public_message");
  // Bookers read it, on pages of this environment's own.
  if (message) await screenSetup(env, message, screen, "public_message");
}

/** Who a request is about, when it's about more than one person. */
async function hostsOfRequest(
  env: SchedulingEnvironment,
  params: Pick<CreateOutOfOfficeRequestOutput, "host" | "hosts" | "host_filter">,
): Promise<HostRow[]> {
  const given = [params.host, params.hosts, params.host_filter].filter(
    (value) => value !== undefined,
  );
  if (given.length !== 1) {
    throw new SchedulingError(
      "invalid_out_of_office",
      "Give exactly one of `host`, `hosts` and `host_filter`.",
      { param: "host" },
    );
  }
  if (params.host) return [await resolveHost(db, env, params.host)];
  if (params.hosts) {
    const found = new Map<string, HostRow>();
    for (const ref of params.hosts) {
      const host = await resolveHost(db, env, ref);
      found.set(host.id, host);
    }
    if (found.size === 0) {
      throw new SchedulingError("invalid_out_of_office", "`hosts` is empty.", { param: "hosts" });
    }
    return [...found.values()];
  }
  // `{}` matches everyone, which is never what a filter with nothing in it means to ask for.
  if (Object.keys(params.host_filter ?? {}).length === 0) {
    throw new SchedulingError("invalid_out_of_office", "`host_filter` is empty.", {
      param: "host_filter",
    });
  }
  const active = await db
    .select()
    .from(schedulingHost)
    .where(
      and(
        eq(schedulingHost.organizationId, env.organizationId),
        eq(schedulingHost.environmentId, env.environmentId),
        eq(schedulingHost.status, "active"),
      ),
    );
  const matched = active.filter((host) => attributesMatch(host.attributes, params.host_filter));
  if (matched.length > MAX_OUT_OF_OFFICE_HOSTS) {
    throw new SchedulingError(
      "invalid_out_of_office",
      `This filter matches ${matched.length} hosts, and a request can cover ${MAX_OUT_OF_OFFICE_HOSTS}.`,
      { param: "host_filter" },
    );
  }
  return matched;
}

/** Bookers hold `share` on the host, so a booking either commits first or sees this entry. */
async function lockHosts(tx: Executor, scope: Scope, hostIds: readonly string[]): Promise<void> {
  await tx
    .select({ id: schedulingHost.id })
    .from(schedulingHost)
    .where(
      and(
        eq(schedulingHost.organizationId, scope.organizationId),
        inArray(schedulingHost.id, [...hostIds].sort()),
      ),
    )
    .orderBy(asc(schedulingHost.id))
    .for("no key update");
}

/** What an entry should put on the host's calendars. The worker converges on it. */
async function setOutOfOfficeCalendar(tx: Executor, row: OutOfOfficeRow, now: Date): Promise<void> {
  const present = row.showOnCalendar && !row.deletedAt && row.endAt > now;
  if (!present) {
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
          eq(schedulingCalendarEvent.outOfOfficeId, row.id),
          eq(schedulingCalendarEvent.organizationId, row.organizationId),
          eq(schedulingCalendarEvent.desiredState, "present"),
        ),
      );
    return;
  }
  const targets = await tx
    .select({ id: schedulingCalendar.id })
    .from(schedulingCalendar)
    .where(
      and(
        eq(schedulingCalendar.hostId, row.hostId),
        eq(schedulingCalendar.organizationId, row.organizationId),
        eq(schedulingCalendar.writeTarget, true),
      ),
    );
  for (const target of targets) {
    await tx
      .insert(schedulingCalendarEvent)
      .values({
        organizationId: row.organizationId,
        environmentId: row.environmentId,
        outOfOfficeId: row.id,
        hostId: row.hostId,
        calendarId: target.id,
        desiredStart: row.startAt,
        desiredEnd: row.endAt,
        desiredState: "present",
      })
      .onConflictDoUpdate({
        target: [
          schedulingCalendarEvent.outOfOfficeId,
          schedulingCalendarEvent.hostId,
          schedulingCalendarEvent.calendarId,
        ],
        set: {
          desiredStart: row.startAt,
          desiredEnd: row.endAt,
          desiredState: "present",
          desiredVersion: sql`${schedulingCalendarEvent.desiredVersion} + 1`,
          nextAttemptAt: sql`clock_timestamp()`,
          attempts: 0,
        },
      });
  }
  // One on a calendar that's stopped being written to would stay, saying the old times.
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
        eq(schedulingCalendarEvent.outOfOfficeId, row.id),
        eq(schedulingCalendarEvent.organizationId, row.organizationId),
        eq(schedulingCalendarEvent.desiredState, "present"),
        targets.length > 0
          ? notInArray(
              schedulingCalendarEvent.calendarId,
              targets.map((target) => target.id),
            )
          : undefined,
      ),
    );
}

const MESSAGES: Record<OutOfOfficeWebhookEventType, string> = {
  "scheduling.out_of_office.created": "Out of office added",
  "scheduling.out_of_office.updated": "Out of office changed",
  "scheduling.out_of_office.deleted": "Out of office removed",
  "scheduling.out_of_office.started": "Out of office started",
  "scheduling.out_of_office.ended": "Out of office ended",
};

async function recordEvent(
  tx: Executor,
  row: OutOfOfficeRow,
  type: OutOfOfficeWebhookEventType,
  now: Date,
): Promise<void> {
  const id = newId(ID_PREFIXES.webhookEvent);
  await enqueueWebhookMessage(tx, {
    id,
    organizationId: row.organizationId,
    environmentId: row.environmentId,
    type,
    payload: {
      id,
      object: "event",
      type,
      created_at: now.toISOString(),
      // Never the reason, the notes or the message: ids and times, as every webhook here.
      data: {
        out_of_office_id: row.id,
        host_id: row.hostId,
        start: row.startAt.toISOString(),
        end: row.endAt.toISOString(),
        group: row.groupId,
        occurred_at: now.toISOString(),
      },
    },
  });
  const [host] = await tx
    .select({ projectId: schedulingHost.projectId })
    .from(schedulingHost)
    .where(
      and(eq(schedulingHost.id, row.hostId), eq(schedulingHost.organizationId, row.organizationId)),
    );
  if (!host) return;
  await appendLogEntries(tx, [
    {
      organizationId: row.organizationId,
      projectId: host.projectId,
      environmentId: row.environmentId,
      occurredAt: now,
      source: "scheduling",
      level: "info",
      type,
      message: MESSAGES[type],
      resourceType: "scheduling_out_of_office",
      resourceId: row.id,
    },
  ]);
}

const liveBooking = (now: Date) =>
  and(
    inArray(schedulingBooking.status, ["confirmed", "pending_approval", "held"]),
    or(isNull(schedulingBooking.holdExpiresAt), gt(schedulingBooking.holdExpiresAt, now)),
    or(isNull(schedulingBooking.approvalExpiresAt), gt(schedulingBooking.approvalExpiresAt, now)),
  );

/**
 * Tells the host, unless it was them just now, looking at the page that shows this. With
 * `existing_bookings: reassign` it also starts moving them, and what's told is what's left: the
 * email's counted when it's sent, a while later, so it doesn't say what the run's about to fix.
 */
async function noteConflicts(
  tx: Executor,
  env: Pick<SchedulingEnvironment, "projectId">,
  row: OutOfOfficeRow,
  actor: Actor,
  now: Date,
  before?: OutOfOfficeRow,
  opts: { startsNoRun?: boolean | undefined } = {},
): Promise<void> {
  const [conflict] = await tx
    .select({ id: schedulingBooking.id })
    .from(schedulingBookingHost)
    .innerJoin(schedulingBooking, eq(schedulingBooking.id, schedulingBookingHost.bookingId))
    .where(
      and(
        eq(schedulingBookingHost.hostId, row.hostId),
        eq(schedulingBookingHost.organizationId, row.organizationId),
        liveBooking(now),
        lt(schedulingBooking.startAt, row.endAt),
        gt(schedulingBooking.endAt, row.startAt),
        gt(schedulingBooking.endAt, now),
      ),
    )
    .limit(1);
  if (!conflict) return;
  const reassigning = row.existingBookings === "reassign";
  // Changing an entry's notes isn't a reason to move anything again.
  const widened =
    before?.existingBookings !== "reassign" ||
    before.hostId !== row.hostId ||
    before.startAt.getTime() !== row.startAt.getTime() ||
    before.endAt.getTime() !== row.endAt.getTime();
  if (reassigning && widened && !opts.startsNoRun) {
    await queueReassignment(tx, {
      organizationId: row.organizationId,
      projectId: env.projectId,
      environmentId: row.environmentId,
      selection: { host_id: row.hostId, out_of_office_id: row.id },
      // Whoever they named to cover for them first, unless the entry said how.
      strategy: row.reassignStrategy ?? {
        kind: "auto",
        preferred_host_ids: (await delegatesOf(tx, [row])).get(row.id) ?? [],
        otherwise: "auto",
      },
      reasonCode: "out_of_office",
      outOfOfficeId: row.id,
      actor,
    });
  }
  if (actor.kind === "host_session") return;
  await tx
    .insert(schedulingNotification)
    .values({
      organizationId: row.organizationId,
      environmentId: row.environmentId,
      hostId: row.hostId,
      kind: "out_of_office_conflicts",
      channel: "email",
      recipient: "host",
      dedupeKey: `out_of_office_conflicts:${row.id}:${row.updatedAt.getTime()}`,
      dueAt: reassigning ? new Date(now.getTime() + 15 * 60_000) : now,
    })
    .onConflictDoNothing();
}

/** One or more hosts' entries, in one transaction: each is an ordinary entry from then on. */
export async function createOutOfOffice(
  env: SchedulingEnvironment,
  params: CreateOutOfOfficeRequestOutput,
  deps: Keys & Pick<SchedulingDeps, "now" | "screenSetup">,
  actor: Actor,
  source: Source,
  opts: {
    allowedDelegates?: readonly string[] | undefined;
    /** A holiday calendar's, which a deleted row keeps. */
    sourceKey?: string | undefined;
  } = {},
): Promise<OutOfOfficeObjectOutput[]> {
  const hosts = await hostsOfRequest(env, params);
  if (params.external_id && hosts.length > 1) {
    throw new SchedulingError(
      "invalid_out_of_office",
      "`external_id` names one entry, so it needs one host.",
      { param: "external_id" },
    );
  }
  // Checked for every host before anything's written: a date that's bad for one is bad for all.
  const windows = new Map(hosts.map((host) => [host.id, windowOf(params, host)]));
  await checkReason(env, params.reason);
  await checkMessage(env, params.public_message, deps.screenSetup);
  const now = nowOf(deps);
  const groupId = hosts.length > 1 ? newId(ID_PREFIXES.schedulingOutOfOfficeGroup) : null;
  const reassignStrategy = await reassignStrategyOf(env, params);
  const delegates = await delegateIdsOf(env, params.delegates, opts.allowedDelegates);
  if (hosts.length === 1 && hosts[0]) refuseSelfCover(delegates, hosts[0].id);
  const encryptedNotes = params.notes ? encryptSecret(params.notes, deps.dataKeys) : null;
  try {
    const rows = await db.transaction(async (tx) => {
      await lockHosts(
        tx,
        env,
        hosts.map((host) => host.id),
      );
      const created: OutOfOfficeRow[] = [];
      for (const host of hosts) {
        const window = windows.get(host.id) as Window;
        const [row] = await tx
          .insert(schedulingOutOfOffice)
          .values({
            organizationId: env.organizationId,
            environmentId: env.environmentId,
            hostId: host.id,
            ...window,
            reason: params.reason ?? "unspecified",
            encryptedNotes,
            publicMessage: params.public_message ?? null,
            showOnCalendar: params.show_on_calendar ?? true,
            existingBookings: params.existing_bookings ?? "leave",
            reassignStrategy,
            source,
            sourceKey: opts.sourceKey ?? null,
            externalId: params.external_id ?? null,
            groupId,
            actor,
            // Long over already: there's nothing to announce starting or ending.
            ...(window.endAt <= now ? { announcedStartAt: now, announcedEndAt: now } : {}),
          })
          .returning();
        const inserted = row as OutOfOfficeRow;
        await setDelegates(tx, inserted, delegates ?? []);
        await setOutOfOfficeCalendar(tx, inserted, now);
        await recordEvent(tx, inserted, "scheduling.out_of_office.created", now);
        await noteConflicts(tx, env, inserted, actor, now);
        created.push(inserted);
      }
      return created;
    });
    return objectsOf(db, rows, deps);
  } catch (error) {
    if (isExternalIdTaken(error)) throw externalIdTaken(params.external_id);
    throw error;
  }
}

function isExternalIdTaken(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } }).cause?.code;
  return code === "23505" || (error as { code?: string }).code === "23505";
}

const externalIdTaken = (id: string | null | undefined) =>
  new SchedulingError("invalid_out_of_office", `An entry with the external id "${id}" exists.`, {
    param: "external_id",
  });

async function entryRow(
  executor: Executor,
  scope: Scope,
  id: string,
  only: Only = {},
): Promise<OutOfOfficeRow> {
  const [row] = await executor
    .select()
    .from(schedulingOutOfOffice)
    .where(
      and(
        eq(schedulingOutOfOffice.id, id),
        eq(schedulingOutOfOffice.organizationId, scope.organizationId),
        eq(schedulingOutOfOffice.environmentId, scope.environmentId),
        isNull(schedulingOutOfOffice.deletedAt),
        only.hostId ? eq(schedulingOutOfOffice.hostId, only.hostId) : undefined,
      ),
    );
  if (!row) throw new SchedulingError("not_found", `No out of office entry "${id}".`);
  return row;
}

export async function getOutOfOffice(
  scope: Scope,
  id: string,
  keys: Keys,
  only: Only = {},
): Promise<OutOfOfficeObjectOutput> {
  return objectOf(db, await entryRow(db, scope, id, only), keys);
}

export async function listOutOfOffice(
  scope: Scope,
  query: {
    hostIds?: readonly string[] | undefined;
    fromMs?: number | undefined;
    toMs?: number | undefined;
    group?: string | undefined;
    limit: number;
    after?: string | undefined;
  },
  keys: Keys,
): Promise<{ data: OutOfOfficeObjectOutput[]; hasMore: boolean }> {
  const rows = await db
    .select()
    .from(schedulingOutOfOffice)
    .where(
      and(
        eq(schedulingOutOfOffice.organizationId, scope.organizationId),
        eq(schedulingOutOfOffice.environmentId, scope.environmentId),
        isNull(schedulingOutOfOffice.deletedAt),
        query.hostIds ? inArray(schedulingOutOfOffice.hostId, [...query.hostIds]) : undefined,
        query.fromMs !== undefined
          ? gt(schedulingOutOfOffice.endAt, new Date(query.fromMs))
          : undefined,
        query.toMs !== undefined
          ? lt(schedulingOutOfOffice.startAt, new Date(query.toMs))
          : undefined,
        query.group ? eq(schedulingOutOfOffice.groupId, query.group) : undefined,
        query.after ? lt(schedulingOutOfOffice.id, query.after) : undefined,
      ),
    )
    .orderBy(desc(schedulingOutOfOffice.id))
    .limit(query.limit + 1);
  return {
    data: await objectsOf(db, rows.slice(0, query.limit), keys),
    hasMore: rows.length > query.limit,
  };
}

/** The values a change comes to, once anything about its time is known to make sense. */
function changesOf(
  row: OutOfOfficeRow,
  host: HostRow,
  params: UpdateOutOfOfficeRequestOutput,
  keys: Keys,
  now: Date,
  strategy: ReassignmentStrategy | null | undefined,
): Partial<typeof schedulingOutOfOffice.$inferInsert> {
  const moving =
    params.start !== undefined ||
    params.end !== undefined ||
    params.start_date !== undefined ||
    params.end_date !== undefined;
  const window = moving ? windowOf(whenOfChange(row, params), host) : null;
  return {
    ...(window ?? {}),
    ...(window
      ? {
          // A time moved into the future has yet to happen again.
          announcedStartAt: window.startAt > now ? null : row.announcedStartAt,
          announcedEndAt: window.endAt > now ? null : row.announcedEndAt,
          fairnessLeveledAt: window.endAt > now ? null : row.fairnessLeveledAt,
        }
      : {}),
    ...(params.reason !== undefined ? { reason: params.reason } : {}),
    ...(params.notes !== undefined
      ? { encryptedNotes: params.notes ? encryptSecret(params.notes, keys.dataKeys) : null }
      : {}),
    ...(params.public_message !== undefined ? { publicMessage: params.public_message } : {}),
    ...(params.show_on_calendar !== undefined ? { showOnCalendar: params.show_on_calendar } : {}),
    ...(params.existing_bookings !== undefined
      ? { existingBookings: params.existing_bookings }
      : {}),
    ...(strategy !== undefined ? { reassignStrategy: strategy } : {}),
  };
}

/** A change can give half a window: the other half is what the entry has. */
function whenOfChange(row: OutOfOfficeRow, params: UpdateOutOfOfficeRequestOutput): When {
  if (params.start_date !== undefined || params.end_date !== undefined) {
    return {
      start_date: params.start_date ?? row.startDate ?? undefined,
      end_date: params.end_date ?? row.endDate ?? undefined,
      time_zone: params.time_zone ?? row.allDayZone ?? undefined,
    };
  }
  return {
    start: params.start ?? row.startAt.toISOString(),
    end: params.end ?? row.endAt.toISOString(),
  };
}

export async function updateOutOfOffice(
  env: SchedulingEnvironment,
  id: string,
  params: UpdateOutOfOfficeRequestOutput,
  deps: Keys & Pick<SchedulingDeps, "now" | "screenSetup">,
  actor: Actor,
  only: Only = {},
  opts: {
    allowedDelegates?: readonly string[] | undefined;
    /**
     * A session's edit: it can't reach whoever an entry's run would send bookings to, so what's now
     * in the way is reported, and moving it is its own step.
     */
    startsNoRun?: boolean | undefined;
  } = {},
): Promise<OutOfOfficeObjectOutput> {
  await checkReason(env, params.reason);
  await checkMessage(env, params.public_message, deps.screenSetup);
  const now = nowOf(deps);
  const found = await entryRow(db, env, id, only);
  const strategy =
    params.existing_bookings === undefined ? undefined : await reassignStrategyOf(env, params);
  const delegates = await delegateIdsOf(env, params.delegates, opts.allowedDelegates);
  refuseSelfCover(delegates, found.hostId);
  const row = await db.transaction(async (tx) => {
    await lockHosts(tx, env, [
      found.hostId,
      ...(await coveringOf(tx, found)),
      ...(delegates ?? []),
    ]);
    // First: a run this change starts prefers whoever's covering, and reads them from here.
    if (delegates) await setDelegates(tx, found, delegates);
    return applyChange(tx, env, found.id, params, deps, actor, now, strategy, only, opts);
  });
  return objectOf(db, row, deps);
}

async function applyChange(
  tx: Transaction,
  env: SchedulingEnvironment,
  id: string,
  params: UpdateOutOfOfficeRequestOutput,
  keys: Keys,
  actor: Actor,
  now: Date,
  strategy: ReassignmentStrategy | null | undefined,
  only: Only = {},
  opts: { startsNoRun?: boolean | undefined } = {},
): Promise<OutOfOfficeRow> {
  const current = await entryRow(tx, env, id, only);
  const [host] = await hostsByIds(tx, env, [current.hostId]);
  if (!host) throw new SchedulingError("not_found", `No out of office entry "${id}".`);
  const [row] = await tx
    .update(schedulingOutOfOffice)
    .set({ ...changesOf(current, host, params, keys, now, strategy), updatedAt: new Date() })
    .where(
      and(
        eq(schedulingOutOfOffice.id, current.id),
        eq(schedulingOutOfOffice.organizationId, current.organizationId),
      ),
    )
    .returning();
  const updated = row as OutOfOfficeRow;
  await setOutOfOfficeCalendar(tx, updated, now);
  await recordEvent(tx, updated, "scheduling.out_of_office.updated", now);
  await noteConflicts(tx, env, updated, actor, now, current, opts);
  return updated;
}

/**
 * Creates or replaces the entry with your own id, so a system of record can send what it knows
 * without keeping our ids. Never repeats an entry if it's sent twice.
 */
export async function putOutOfOffice(
  env: SchedulingEnvironment,
  externalId: string,
  params: PutOutOfOfficeRequestOutput,
  deps: Keys & Pick<SchedulingDeps, "now" | "screenSetup">,
  actor: Actor,
): Promise<{ entry: OutOfOfficeObjectOutput; created: boolean }> {
  const host = await resolveHost(db, env, params.host);
  await checkReason(env, params.reason);
  await checkMessage(env, params.public_message, deps.screenSetup);
  const now = nowOf(deps);
  const window = windowOf(params, host);
  const encryptedNotes = params.notes ? encryptSecret(params.notes, deps.dataKeys) : null;
  const values = {
    ...window,
    reason: params.reason ?? "unspecified",
    encryptedNotes,
    publicMessage: params.public_message ?? null,
    showOnCalendar: params.show_on_calendar ?? true,
    existingBookings: params.existing_bookings ?? ("leave" as const),
    reassignStrategy: await reassignStrategyOf(env, params),
  };
  const delegates = await delegateIdsOf(env, params.delegates, undefined);
  refuseSelfCover(delegates, host.id);
  const attempt = () =>
    db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(schedulingOutOfOffice)
        .where(
          and(
            eq(schedulingOutOfOffice.organizationId, env.organizationId),
            eq(schedulingOutOfOffice.environmentId, env.environmentId),
            eq(schedulingOutOfOffice.externalId, externalId),
            isNull(schedulingOutOfOffice.deletedAt),
          ),
        );
      await lockHosts(tx, env, [
        host.id,
        ...(existing ? [existing.hostId, ...(await coveringOf(tx, existing))] : []),
        ...(delegates ?? []),
      ]);
      if (existing) {
        const [row] = await tx
          .update(schedulingOutOfOffice)
          .set({
            ...values,
            hostId: host.id,
            announcedStartAt: window.startAt > now ? null : existing.announcedStartAt,
            announcedEndAt: window.endAt > now ? null : existing.announcedEndAt,
            fairnessLeveledAt: window.endAt > now ? null : existing.fairnessLeveledAt,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schedulingOutOfOffice.id, existing.id),
              eq(schedulingOutOfOffice.organizationId, existing.organizationId),
            ),
          )
          .returning();
        const updated = row as OutOfOfficeRow;
        // The old host's event goes if the entry's moved to someone else.
        if (existing.hostId !== host.id) {
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
                eq(schedulingCalendarEvent.outOfOfficeId, existing.id),
                eq(schedulingCalendarEvent.organizationId, existing.organizationId),
                eq(schedulingCalendarEvent.hostId, existing.hostId),
              ),
            );
        }
        await setDelegates(tx, updated, delegates ?? []);
        await setOutOfOfficeCalendar(tx, updated, now);
        await recordEvent(tx, updated, "scheduling.out_of_office.updated", now);
        await noteConflicts(tx, env, updated, actor, now, existing);
        return { entry: await objectOf(tx, updated, deps), created: false };
      }
      const [row] = await tx
        .insert(schedulingOutOfOffice)
        .values({
          organizationId: env.organizationId,
          environmentId: env.environmentId,
          hostId: host.id,
          ...values,
          source: "api",
          externalId,
          actor,
          ...(window.endAt <= now ? { announcedStartAt: now, announcedEndAt: now } : {}),
        })
        .returning();
      const inserted = row as OutOfOfficeRow;
      await setDelegates(tx, inserted, delegates ?? []);
      await setOutOfOfficeCalendar(tx, inserted, now);
      await recordEvent(tx, inserted, "scheduling.out_of_office.created", now);
      await noteConflicts(tx, env, inserted, actor, now);
      return { entry: await objectOf(tx, inserted, deps), created: true };
    });
  // A retry of the same request can overlap it: both see nothing, and whichever's second loses on the
  // unique index. By then there's an entry for it to update, as if it had come a moment later.
  try {
    return await attempt();
  } catch (error) {
    if (!isExternalIdTaken(error)) throw error;
  }
  try {
    return await attempt();
  } catch (error) {
    if (isExternalIdTaken(error)) throw externalIdTaken(externalId);
    throw error;
  }
}

export async function deleteOutOfOffice(
  scope: Scope,
  id: string,
  deps: Pick<SchedulingDeps, "now">,
  only: Only = {},
): Promise<{ id: string }> {
  const now = nowOf(deps);
  return db.transaction(async (tx) => {
    const row = await entryRow(tx, scope, id, only);
    await lockHosts(tx, scope, [row.hostId, ...(await coveringOf(tx, row))]);
    const [deleted] = await tx
      .update(schedulingOutOfOffice)
      // Nobody will read these again, so they don't wait for the row to go.
      .set({ deletedAt: now, encryptedNotes: null, publicMessage: null, updatedAt: new Date() })
      .where(
        and(
          eq(schedulingOutOfOffice.id, row.id),
          eq(schedulingOutOfOffice.organizationId, row.organizationId),
          isNull(schedulingOutOfOffice.deletedAt),
        ),
      )
      .returning();
    if (!deleted) throw new SchedulingError("not_found", `No out of office entry "${id}".`);
    await setOutOfOfficeCalendar(tx, deleted, now);
    await recordEvent(tx, deleted, "scheduling.out_of_office.deleted", now);
    return { id: row.id };
  });
}

/** Bookings that fall in an entry, which it never changed. Ids and times: nobody's details. */
export async function listOutOfOfficeConflicts(
  scope: Scope,
  id: string,
  query: { limit: number },
  deps: Pick<SchedulingDeps, "now">,
  only: Only = {},
): Promise<{ data: OutOfOfficeConflictOutput[]; hasMore: boolean }> {
  const row = await entryRow(db, scope, id, only);
  const now = nowOf(deps);
  const rows = await db
    .select({
      id: schedulingBooking.id,
      eventTypeId: schedulingBooking.eventTypeId,
      title: schedulingBooking.title,
      status: schedulingBooking.status,
      startAt: schedulingBooking.startAt,
      endAt: schedulingBooking.endAt,
      seriesId: schedulingBooking.seriesId,
      groupSessionId: schedulingBooking.groupSessionId,
    })
    .from(schedulingBookingHost)
    .innerJoin(schedulingBooking, eq(schedulingBooking.id, schedulingBookingHost.bookingId))
    .where(
      and(
        eq(schedulingBookingHost.hostId, row.hostId),
        eq(schedulingBookingHost.organizationId, row.organizationId),
        eq(schedulingBooking.environmentId, row.environmentId),
        liveBooking(now),
        lt(schedulingBooking.startAt, row.endAt),
        gt(schedulingBooking.endAt, row.startAt),
      ),
    )
    .orderBy(asc(schedulingBooking.startAt), asc(schedulingBooking.id))
    .limit(query.limit + 1);
  return {
    data: rows.slice(0, query.limit).map((conflict) => ({
      object: "scheduling.out_of_office_conflict" as const,
      booking: conflict.id,
      event_type: conflict.eventTypeId,
      title: conflict.title,
      status: conflict.status,
      start: conflict.startAt.toISOString(),
      end: conflict.endAt.toISOString(),
      series: conflict.seriesId,
      group_session: conflict.groupSessionId,
    })),
    hasMore: rows.length > query.limit,
  };
}

/** How many live bookings fall in any of a host's entries still to come. For its email. */
export async function countHostConflicts(
  organizationId: string,
  hostId: string,
  now: Date,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(distinct ${schedulingBooking.id})::int` })
    .from(schedulingBookingHost)
    .innerJoin(schedulingBooking, eq(schedulingBooking.id, schedulingBookingHost.bookingId))
    .innerJoin(
      schedulingOutOfOffice,
      and(
        eq(schedulingOutOfOffice.hostId, schedulingBookingHost.hostId),
        lt(schedulingOutOfOffice.startAt, schedulingBooking.endAt),
        gt(schedulingOutOfOffice.endAt, schedulingBooking.startAt),
        isNull(schedulingOutOfOffice.deletedAt),
      ),
    )
    .where(
      and(
        eq(schedulingBookingHost.hostId, hostId),
        eq(schedulingBookingHost.organizationId, organizationId),
        liveBooking(now),
        gt(schedulingBooking.endAt, now),
      ),
    );
  return row?.count ?? 0;
}

/** Which of these hosts are away for any of this time. Bookings call it under their locks. */
export async function hostsAwayDuring(
  executor: Executor,
  scope: Pick<Scope, "organizationId">,
  hostIds: readonly string[],
  startMs: number,
  endMs: number,
): Promise<Set<string>> {
  if (hostIds.length === 0) return new Set();
  const rows = await executor
    .select({ hostId: schedulingOutOfOffice.hostId })
    .from(schedulingOutOfOffice)
    .where(
      and(
        eq(schedulingOutOfOffice.organizationId, scope.organizationId),
        inArray(schedulingOutOfOffice.hostId, [...hostIds]),
        isNull(schedulingOutOfOffice.deletedAt),
        lt(schedulingOutOfOffice.startAt, new Date(endMs)),
        gt(schedulingOutOfOffice.endAt, new Date(startMs)),
      ),
    );
  return new Set(rows.map((row) => row.hostId));
}

export type AwayNotice = { until: string; message: string | null; covered: boolean };

/**
 * What a booker's told when the only host they could get is away right now. When the host's back,
 * and any message they left: never the reason. Null when they aren't away.
 */
export async function awayNoticeOf(
  scope: Scope,
  hostId: string,
  now: Date,
): Promise<AwayNotice | null> {
  const rows = await db
    .select({
      id: schedulingOutOfOffice.id,
      organizationId: schedulingOutOfOffice.organizationId,
      startAt: schedulingOutOfOffice.startAt,
      endAt: schedulingOutOfOffice.endAt,
      publicMessage: schedulingOutOfOffice.publicMessage,
    })
    .from(schedulingOutOfOffice)
    .where(
      and(
        eq(schedulingOutOfOffice.organizationId, scope.organizationId),
        eq(schedulingOutOfOffice.environmentId, scope.environmentId),
        eq(schedulingOutOfOffice.hostId, hostId),
        isNull(schedulingOutOfOffice.deletedAt),
        gt(schedulingOutOfOffice.endAt, now),
      ),
    )
    .orderBy(asc(schedulingOutOfOffice.startAt));
  const [first] = rows;
  if (!first || first.startAt > now) return null;
  // Entries that touch or overlap run together: back means back from all of them.
  let until = first.endAt;
  let message = first.publicMessage;
  for (const row of rows.slice(1)) {
    if (row.startAt > until) break;
    if (row.endAt > until) until = row.endAt;
    message = row.publicMessage ?? message;
  }
  // Who's actually available decides what's offered: this only keeps it from reading as nobody.
  const delegates = await delegatesOf(db, [first]);
  return {
    until: until.toISOString(),
    message,
    covered: (delegates.get(first.id)?.length ?? 0) > 0,
  };
}

/**
 * Someone back from two weeks away is far behind their pool, and without this would take nearly
 * every booking until they caught up. They come back level with the lowest of their peers, once.
 * Only ever upward, and not while another entry still has them away: that one's end does this.
 */
async function levelReturningHost(tx: Executor, row: OutOfOfficeRow, now: Date): Promise<void> {
  const [claimed] = await tx
    .update(schedulingOutOfOffice)
    .set({ fairnessLeveledAt: now })
    .where(
      and(
        eq(schedulingOutOfOffice.id, row.id),
        eq(schedulingOutOfOffice.organizationId, row.organizationId),
        isNull(schedulingOutOfOffice.fairnessLeveledAt),
      ),
    )
    .returning({ id: schedulingOutOfOffice.id });
  if (!claimed) return;
  const [stillAway] = await tx
    .select({ id: schedulingOutOfOffice.id })
    .from(schedulingOutOfOffice)
    .where(
      and(
        eq(schedulingOutOfOffice.organizationId, row.organizationId),
        eq(schedulingOutOfOffice.hostId, row.hostId),
        isNull(schedulingOutOfOffice.deletedAt),
        lte(schedulingOutOfOffice.startAt, now),
        gt(schedulingOutOfOffice.endAt, now),
      ),
    )
    .limit(1);
  if (stillAway) return;
  const memberships = await tx
    .select({ eventTypeId: schedulingEventTypeHost.eventTypeId })
    .from(schedulingEventTypeHost)
    .innerJoin(schedulingEventType, eq(schedulingEventType.id, schedulingEventTypeHost.eventTypeId))
    .where(
      and(
        eq(schedulingEventTypeHost.organizationId, row.organizationId),
        eq(schedulingEventTypeHost.hostId, row.hostId),
        isNull(schedulingEventTypeHost.removedAt),
        eq(schedulingEventType.kind, "pool"),
      ),
    )
    .orderBy(asc(schedulingEventTypeHost.eventTypeId));
  for (const { eventTypeId } of memberships) {
    // Peers with bookings of their own: someone new counts as level with the pool, not below it.
    await tx
      .update(schedulingEventTypeHost)
      .set({
        fairUnits: sql`greatest(${schedulingEventTypeHost.fairUnits}, coalesce(ceil((
          select min(peer.fair_units::float8 / peer.weight)
          from scheduling_event_type_host peer
          where peer.event_type_id = ${eventTypeId}
            and peer.organization_id = ${row.organizationId}
            and peer.host_id <> ${row.hostId}
            and peer.removed_at is null
            and peer.weight > 0
            and peer.fair_units > 0
        ) * ${schedulingEventTypeHost.weight})::int, 0))`,
      })
      .where(
        and(
          eq(schedulingEventTypeHost.eventTypeId, eventTypeId),
          eq(schedulingEventTypeHost.organizationId, row.organizationId),
          eq(schedulingEventTypeHost.hostId, row.hostId),
        ),
      );
  }
}

/** Lets customers' systems react when someone's time off actually begins and ends. */
export async function announceDueOutOfOffice(
  deps: Pick<SchedulingDeps, "now">,
  opts: { limit?: number; scope?: { organizationIds: readonly string[] } } = {},
): Promise<number> {
  const now = nowOf(deps);
  return db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(schedulingOutOfOffice)
      .where(
        and(
          isNull(schedulingOutOfOffice.deletedAt),
          or(
            and(
              isNull(schedulingOutOfOffice.announcedStartAt),
              lte(schedulingOutOfOffice.startAt, now),
            ),
            and(
              isNull(schedulingOutOfOffice.announcedEndAt),
              lte(schedulingOutOfOffice.endAt, now),
            ),
          ),
          opts.scope
            ? inArray(schedulingOutOfOffice.organizationId, [...opts.scope.organizationIds])
            : undefined,
        ),
      )
      .limit(opts.limit ?? 100)
      .for("update", { skipLocked: true });
    for (const row of due) {
      const ended = row.endAt <= now;
      // Over by the time this ran, so it's only said once it's ended.
      if (ended) {
        await recordEvent(tx, row, "scheduling.out_of_office.ended", now);
        await levelReturningHost(tx, row, now);
      } else {
        await recordEvent(tx, row, "scheduling.out_of_office.started", now);
      }
      await tx
        .update(schedulingOutOfOffice)
        .set({
          announcedStartAt: row.announcedStartAt ?? now,
          ...(ended ? { announcedEndAt: now } : {}),
        })
        .where(
          and(
            eq(schedulingOutOfOffice.id, row.id),
            eq(schedulingOutOfOffice.organizationId, row.organizationId),
          ),
        );
    }
    return due.length;
  });
}
