/** What can be booked. Bookings snapshot what they occupy, so edits never move an existing one. */
import { HipaaModeError, hipaaModeApplies } from "@coss/compliance";
import { db, type Executor, schema } from "@coss/db";
import { ID_PREFIXES, isId } from "@coss/db/id";
import { and, asc, desc, eq, gt, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { notZoomMeeting } from "./calendar/zoom.ts";
import { startingUnits } from "./engine/rank.ts";
import { SchedulingError } from "./errors.ts";
import { attributesMatch, checkTimeZone, type HostRow, resolveHost } from "./hosts.ts";
import type {
  CreateEventTypeRequestOutput,
  EventTypeObjectOutput,
  UpdateEventTypeRequestOutput,
} from "./schemas.ts";
import {
  locationText,
  refuseLinks,
  refuseLinksInAddresses,
  type SetupScreening,
  screenSetup,
} from "./screening.ts";
import type { SchedulingEnvironment } from "./types.ts";

const {
  schedulingBooking,
  schedulingCalendarEvent,
  schedulingEventType,
  schedulingEventTypeHost,
  schedulingGroupSession,
  schedulingSchedule,
} = schema;

export type EventTypeRow = typeof schedulingEventType.$inferSelect;
export type EventTypeHostRow = typeof schedulingEventTypeHost.$inferSelect;
type Scope = Pick<SchedulingEnvironment, "organizationId" | "environmentId">;

export function toEventTypeObject(
  row: EventTypeRow,
  hosts: readonly EventTypeHostRow[],
): EventTypeObjectOutput {
  return {
    object: "scheduling.event_type",
    id: row.id,
    uid: row.uid,
    title: row.title,
    kind: row.kind,
    status: row.status,
    duration_minutes: row.durationMinutes,
    duration_options: row.durationOptions,
    step_minutes: row.stepMinutes,
    grid_time_zone: row.gridTimeZone,
    buffer_before_minutes: row.bufferBeforeMinutes,
    buffer_after_minutes: row.bufferAfterMinutes,
    min_notice_minutes: row.minNoticeMinutes,
    booking_window: row.bookingWindow ?? null,
    limits: row.limits,
    capacity: row.capacity,
    requires_approval: row.requiresApproval,
    approval_ttl_minutes: row.approvalTtlMinutes,
    hold_ttl_seconds: row.holdTtlSeconds,
    cancel_notice_minutes: row.cancelNoticeMinutes,
    reschedule_notice_minutes: row.rescheduleNoticeMinutes,
    max_guests: row.maxGuests,
    max_active_bookings_per_attendee: row.maxActiveBookingsPerAttendee,
    host_calendar_details: row.hostCalendarDetails,
    questions: row.questions,
    locations: row.locations as EventTypeObjectOutput["locations"],
    host_filter: row.hostFilter ?? null,
    hosts: hosts
      .filter((host) => host.assigned && !host.removedAt)
      .map((host) => ({
        host: host.hostId,
        role: host.role,
        weight: host.weight,
        schedule: host.scheduleId,
      })),
    metadata: row.metadata,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function resolveEventType(
  executor: Executor,
  scope: Scope,
  ref: string,
): Promise<EventTypeRow> {
  const [row] = await executor
    .select()
    .from(schedulingEventType)
    .where(
      and(
        eq(schedulingEventType.organizationId, scope.organizationId),
        eq(schedulingEventType.environmentId, scope.environmentId),
        isId(ID_PREFIXES.schedulingEventType, ref)
          ? eq(schedulingEventType.id, ref)
          : eq(schedulingEventType.uid, ref),
      ),
    )
    .limit(1);
  if (!row) throw new SchedulingError("not_found", `No event type "${ref}" in this environment.`);
  return row;
}

export async function eventTypeHosts(
  executor: Executor,
  row: Pick<EventTypeRow, "id" | "organizationId">,
): Promise<EventTypeHostRow[]> {
  return executor
    .select()
    .from(schedulingEventTypeHost)
    .where(
      and(
        eq(schedulingEventTypeHost.eventTypeId, row.id),
        eq(schedulingEventTypeHost.organizationId, row.organizationId),
      ),
    )
    .orderBy(asc(schedulingEventTypeHost.hostId));
}

type Kind = EventTypeRow["kind"];
type HostInput = NonNullable<CreateEventTypeRequestOutput["hosts"]>[number];

function checkShape(
  values: {
    kind: Kind;
    capacity: number | null;
    maxGuests: number;
    durationMinutes: number;
    durationOptions: readonly number[];
    questions: readonly { key: string; type: string; options: readonly string[] }[];
    gridTimeZone: string | null;
    bookingWindow: EventTypeRow["bookingWindow"];
    locations: readonly { type: string }[];
  },
  hosts: readonly HostInput[] | undefined,
): void {
  const invalid = (message: string, param: string) =>
    new SchedulingError("invalid_event_type", message, { param });
  if (values.kind === "group" && !values.capacity) {
    throw invalid("A group event type needs a capacity.", "capacity");
  }
  if (values.kind !== "group" && values.capacity) {
    throw invalid("Only a group event type has a capacity.", "capacity");
  }
  if (values.kind === "group" && values.maxGuests > 0) {
    throw invalid("A group event type has no guests: each person takes a seat.", "max_guests");
  }
  if (values.gridTimeZone) checkTimeZone(values.gridTimeZone, "grid_time_zone");
  if (
    values.bookingWindow?.kind === "range" &&
    values.bookingWindow.from > values.bookingWindow.to
  ) {
    throw invalid("The booking window ends before it starts.", "booking_window");
  }
  const keys = values.questions.map((question) => question.key);
  if (new Set(keys).size !== keys.length) {
    throw invalid("Question keys must be unique.", "questions");
  }
  for (const [index, question] of values.questions.entries()) {
    const choice = question.type === "select" || question.type === "radio";
    if (choice && question.options.length === 0) {
      throw invalid("This question needs options.", `questions[${index}].options`);
    }
  }
  if (values.kind === "group" && values.locations.some((l) => l.type === "zoom")) {
    throw invalid("A group event type can't use Zoom yet.", "locations");
  }
  if (!hosts) return;
  const refs = hosts.map((host) => host.host);
  if (new Set(refs).size !== refs.length) throw invalid("A host is listed twice.", "hosts");
  const required = hosts.filter((host) => host.role === "required").length;
  const members = hosts.length - required;
  if (values.kind === "one_on_one" && hosts.length > 1) {
    throw invalid("A one-on-one event type has one host. Use a pool for several.", "hosts");
  }
  if (values.kind === "group" && hosts.length > 1) {
    throw invalid("A group event type has one host.", "hosts");
  }
  if (values.kind === "collective" && (required < 1 || members > 1)) {
    throw invalid(
      "A collective event type needs its hosts to be required, with at most one member.",
      "hosts",
    );
  }
}

async function replaceHosts(
  tx: Executor,
  scope: Scope,
  row: EventTypeRow,
  hosts: readonly HostInput[],
): Promise<void> {
  const resolved: { input: HostInput; host: HostRow }[] = [];
  for (const input of hosts) {
    resolved.push({ input, host: await resolveHost(tx, scope, input.host) });
  }
  const scheduleIds = resolved.flatMap(({ input }) => (input.schedule ? [input.schedule] : []));
  if (scheduleIds.length > 0) {
    const owned = await tx
      .select({ id: schedulingSchedule.id, hostId: schedulingSchedule.hostId })
      .from(schedulingSchedule)
      .where(
        and(
          inArray(schedulingSchedule.id, scheduleIds),
          eq(schedulingSchedule.organizationId, scope.organizationId),
        ),
      );
    for (const { input, host } of resolved) {
      if (input.schedule && !owned.some((s) => s.id === input.schedule && s.hostId === host.id)) {
        throw new SchedulingError(
          "invalid_event_type",
          `Schedule "${input.schedule}" isn't one of this host's.`,
          { param: "hosts" },
        );
      }
    }
  }
  // Waits for bookers holding `key share`, so a removal can't slip past one choosing the host.
  const current = await tx
    .select({
      hostId: schedulingEventTypeHost.hostId,
      role: schedulingEventTypeHost.role,
      weight: schedulingEventTypeHost.weight,
      fairUnits: schedulingEventTypeHost.fairUnits,
      assigned: schedulingEventTypeHost.assigned,
      removedAt: schedulingEventTypeHost.removedAt,
      hostStatus: schema.schedulingHost.status,
      attributes: schema.schedulingHost.attributes,
    })
    .from(schedulingEventTypeHost)
    .innerJoin(schema.schedulingHost, eq(schema.schedulingHost.id, schedulingEventTypeHost.hostId))
    .where(
      and(
        eq(schedulingEventTypeHost.eventTypeId, row.id),
        eq(schedulingEventTypeHost.organizationId, row.organizationId),
      ),
    )
    .orderBy(asc(schedulingEventTypeHost.hostId))
    .for("update", { of: schedulingEventTypeHost });
  const keep = resolved.map(({ host }) => host.id);
  await tx
    .update(schedulingEventTypeHost)
    .set({ removedAt: new Date() })
    .where(
      and(
        eq(schedulingEventTypeHost.eventTypeId, row.id),
        eq(schedulingEventTypeHost.organizationId, row.organizationId),
        eq(schedulingEventTypeHost.assigned, true),
        isNull(schedulingEventTypeHost.removedAt),
        keep.length > 0 ? notInArray(schedulingEventTypeHost.hostId, keep) : undefined,
      ),
    );
  const before = new Map(current.map((entry) => [entry.hostId, entry]));
  const wanted = new Map(resolved.map(({ input, host }) => [host.id, input]));
  // Who's in the pool once this is saved, decided before anyone's counter is, so it can't depend on
  // the order hosts are written in.
  const staying = current.filter((entry) => {
    if (entry.hostStatus !== "active" || entry.removedAt || entry.role !== "member") return false;
    const input = wanted.get(entry.hostId);
    if (input) return input.role === "member";
    return (
      !entry.assigned &&
      row.kind === "pool" &&
      Boolean(row.hostFilter) &&
      attributesMatch(entry.attributes, row.hostFilter)
    );
  });
  for (const { input, host } of resolved.sort((a, b) => (a.host.id < b.host.id ? -1 : 1))) {
    const existing = before.get(host.id);
    const continuing = existing && !existing.removedAt && existing.role === "member";
    // Coming back, or newly taking bookings, is joining. A new weight applies from now on, so it
    // keeps their place rather than leaving them with a backlog to catch up on.
    const fairUnits = continuing
      ? (existing.fairUnits * input.weight) / existing.weight
      : startingUnits(staying, input.weight);
    const values = {
      role: input.role,
      weight: input.weight,
      scheduleId: input.schedule,
      assigned: true,
      removedAt: null,
      fairUnits,
    };
    await tx
      .insert(schedulingEventTypeHost)
      .values({
        eventTypeId: row.id,
        hostId: host.id,
        organizationId: row.organizationId,
        ...values,
      })
      .onConflictDoUpdate({
        target: [schedulingEventTypeHost.eventTypeId, schedulingEventTypeHost.hostId],
        set: {
          ...values,
          // Not there when this read: a booker just made it for a host its filter found, and it
          // already holds their counter.
          ...(existing
            ? {}
            : {
                fairUnits: sql`scheduling_event_type_host.fair_units * ${input.weight}::double precision / scheduling_event_type_host.weight`,
              }),
        },
      });
  }
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } }).cause?.code;
  return code === "23505" || (error as { code?: string }).code === "23505";
}

const uidTaken = (uid: string | null | undefined) =>
  new SchedulingError("uid_taken", `An event type with the uid "${uid}" already exists.`, {
    param: "uid",
  });

/** Addresses and links land in attendees' emails, where nothing screens them per email. */
function locationsText(locations: readonly Parameters<typeof locationText>[0][] | undefined) {
  return (locations ?? []).map(locationText).filter(Boolean).join("\n");
}

function setupText(values: {
  title?: string | undefined;
  questions?: readonly { label: string; options: readonly string[] }[] | undefined;
}): string {
  return [
    values.title ?? "",
    ...(values.questions ?? []).flatMap((question) => [question.label, ...question.options]),
  ].join("\n");
}

/** Attendees' details would reach hosts' calendar providers, which HIPAA mode doesn't allow. */
async function checkHostCalendarDetails(
  environmentId: string,
  details: EventTypeRow["hostCalendarDetails"] | undefined,
): Promise<void> {
  if (details !== "full" || !(await hipaaModeApplies(environmentId))) return;
  throw new HipaaModeError(
    "HIPAA mode keeps attendees' details off hosts' calendars, so `host_calendar_details` can't be `full`.",
  );
}

/** Upcoming events say what this event type now asks for. Past ones stay until they're redacted. */
async function rewriteUpcomingEvents(tx: Executor, row: EventTypeRow): Promise<void> {
  const now = sql`clock_timestamp()`;
  await tx
    .update(schedulingCalendarEvent)
    .set({
      ...(row.hostCalendarDetails === "neutral"
        ? { scrubPending: sql<boolean>`${schedulingCalendarEvent.detailsWritten}` }
        : {}),
      desiredVersion: sql`${schedulingCalendarEvent.desiredVersion} + 1`,
      nextAttemptAt: now,
      attempts: 0,
    })
    .where(
      and(
        eq(schedulingCalendarEvent.organizationId, row.organizationId),
        eq(schedulingCalendarEvent.desiredState, "present"),
        gt(schedulingCalendarEvent.desiredEnd, now),
        notZoomMeeting(),
        or(
          inArray(
            schedulingCalendarEvent.bookingId,
            tx
              .select({ id: schedulingBooking.id })
              .from(schedulingBooking)
              .where(
                and(
                  eq(schedulingBooking.eventTypeId, row.id),
                  eq(schedulingBooking.organizationId, row.organizationId),
                ),
              ),
          ),
          inArray(
            schedulingCalendarEvent.groupSessionId,
            tx
              .select({ id: schedulingGroupSession.id })
              .from(schedulingGroupSession)
              .where(
                and(
                  eq(schedulingGroupSession.eventTypeId, row.id),
                  eq(schedulingGroupSession.organizationId, row.organizationId),
                ),
              ),
          ),
        ),
      ),
    );
}

export async function createEventType(
  env: SchedulingEnvironment,
  params: CreateEventTypeRequestOutput,
  opts: { screen?: SetupScreening | undefined } = {},
): Promise<EventTypeObjectOutput> {
  refuseLinks(params.title, "title");
  refuseLinksInAddresses(params.locations);
  await screenSetup(env, setupText(params), opts.screen, "title");
  await screenSetup(env, locationsText(params.locations), opts.screen, "locations");
  await checkHostCalendarDetails(env.environmentId, params.host_calendar_details);
  checkShape(
    {
      kind: params.kind,
      capacity: params.capacity ?? null,
      maxGuests: params.max_guests ?? 0,
      durationMinutes: params.duration_minutes,
      durationOptions: params.duration_options ?? [],
      questions: params.questions ?? [],
      gridTimeZone: params.grid_time_zone ?? null,
      bookingWindow: params.booking_window ?? null,
      locations: params.locations ?? [],
    },
    params.hosts,
  );
  try {
    return await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(schedulingEventType)
        .values({
          organizationId: env.organizationId,
          projectId: env.projectId,
          environmentId: env.environmentId,
          uid: params.uid ?? null,
          title: params.title,
          kind: params.kind,
          durationMinutes: params.duration_minutes,
          durationOptions: params.duration_options ?? [],
          stepMinutes: params.step_minutes ?? params.duration_minutes,
          gridTimeZone: params.grid_time_zone ?? null,
          bufferBeforeMinutes: params.buffer_before_minutes ?? 0,
          bufferAfterMinutes: params.buffer_after_minutes ?? 0,
          minNoticeMinutes: params.min_notice_minutes ?? 0,
          bookingWindow: params.booking_window ?? null,
          limits: params.limits ?? [],
          capacity: params.capacity ?? null,
          requiresApproval: params.requires_approval ?? false,
          ...(params.approval_ttl_minutes !== undefined
            ? { approvalTtlMinutes: params.approval_ttl_minutes }
            : {}),
          ...(params.hold_ttl_seconds !== undefined
            ? { holdTtlSeconds: params.hold_ttl_seconds }
            : {}),
          cancelNoticeMinutes: params.cancel_notice_minutes ?? 0,
          rescheduleNoticeMinutes: params.reschedule_notice_minutes ?? 0,
          maxGuests: params.max_guests ?? 0,
          maxActiveBookingsPerAttendee: params.max_active_bookings_per_attendee ?? null,
          hostCalendarDetails: params.host_calendar_details ?? "neutral",
          questions: params.questions ?? [],
          locations: (params.locations ?? []) as EventTypeRow["locations"],
          hostFilter: params.host_filter ?? null,
          metadata: params.metadata ?? {},
        })
        .returning();
      const row = inserted as EventTypeRow;
      await replaceHosts(tx, env, row, params.hosts);
      return toEventTypeObject(row, await eventTypeHosts(tx, row));
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw uidTaken(params.uid);
    throw error;
  }
}

export async function getEventType(scope: Scope, ref: string): Promise<EventTypeObjectOutput> {
  const row = await resolveEventType(db, scope, ref);
  return toEventTypeObject(row, await eventTypeHosts(db, row));
}

export async function listEventTypes(
  scope: Scope,
  query: {
    limit: number;
    after?: string | undefined;
    /** Only those this host is assigned to by name. */
    hostId?: string | undefined;
  },
): Promise<{ data: EventTypeObjectOutput[]; hasMore: boolean }> {
  const rows = await db
    .select()
    .from(schedulingEventType)
    .where(
      and(
        eq(schedulingEventType.organizationId, scope.organizationId),
        eq(schedulingEventType.environmentId, scope.environmentId),
        query.after ? lt(schedulingEventType.id, query.after) : undefined,
        query.hostId
          ? sql`exists (select 1 from ${schedulingEventTypeHost}
              where ${schedulingEventTypeHost.eventTypeId} = ${schedulingEventType.id}
                and ${schedulingEventTypeHost.hostId} = ${query.hostId}
                and ${schedulingEventTypeHost.assigned}
                and ${schedulingEventTypeHost.removedAt} is null)`
          : undefined,
      ),
    )
    .orderBy(desc(schedulingEventType.id))
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  const hosts =
    page.length > 0
      ? await db
          .select()
          .from(schedulingEventTypeHost)
          .where(
            and(
              eq(schedulingEventTypeHost.organizationId, scope.organizationId),
              inArray(
                schedulingEventTypeHost.eventTypeId,
                page.map((row) => row.id),
              ),
            ),
          )
      : [];
  return {
    data: page.map((row) =>
      toEventTypeObject(
        row,
        hosts.filter((host) => host.eventTypeId === row.id),
      ),
    ),
    hasMore: rows.length > query.limit,
  };
}

/** Every active event type by name, for choosing one to book: no hosts, and no page to fall off. */
export async function listBookableEventTypes(
  scope: Scope,
): Promise<{ id: string; title: string }[]> {
  return db
    .select({ id: schedulingEventType.id, title: schedulingEventType.title })
    .from(schedulingEventType)
    .where(
      and(
        eq(schedulingEventType.organizationId, scope.organizationId),
        eq(schedulingEventType.environmentId, scope.environmentId),
        eq(schedulingEventType.status, "active"),
      ),
    )
    .orderBy(asc(schedulingEventType.title), asc(schedulingEventType.id));
}

export async function updateEventType(
  scope: Scope & { mode?: "live" | "sandbox" },
  ref: string,
  params: UpdateEventTypeRequestOutput,
  opts: { screen?: SetupScreening | undefined } = {},
): Promise<EventTypeObjectOutput> {
  refuseLinks(params.title, "title");
  refuseLinksInAddresses(params.locations);
  await checkHostCalendarDetails(scope.environmentId, params.host_calendar_details);
  if (scope.mode && (params.title !== undefined || params.questions !== undefined)) {
    await screenSetup(
      { organizationId: scope.organizationId, mode: scope.mode },
      setupText(params),
      opts.screen,
      "title",
    );
  }
  if (scope.mode) {
    await screenSetup(
      { organizationId: scope.organizationId, mode: scope.mode },
      locationsText(params.locations),
      opts.screen,
      "locations",
    );
  }
  try {
    return await db.transaction(async (tx) => {
      const existing = await resolveEventType(tx, scope, ref);
      const set = {
        ...(params.uid !== undefined ? { uid: params.uid } : {}),
        ...(params.title !== undefined ? { title: params.title } : {}),
        ...(params.status !== undefined ? { status: params.status } : {}),
        ...(params.duration_minutes !== undefined
          ? { durationMinutes: params.duration_minutes }
          : {}),
        ...(params.duration_options !== undefined
          ? { durationOptions: params.duration_options }
          : {}),
        ...(params.step_minutes !== undefined ? { stepMinutes: params.step_minutes } : {}),
        ...(params.grid_time_zone !== undefined ? { gridTimeZone: params.grid_time_zone } : {}),
        ...(params.buffer_before_minutes !== undefined
          ? { bufferBeforeMinutes: params.buffer_before_minutes }
          : {}),
        ...(params.buffer_after_minutes !== undefined
          ? { bufferAfterMinutes: params.buffer_after_minutes }
          : {}),
        ...(params.min_notice_minutes !== undefined
          ? { minNoticeMinutes: params.min_notice_minutes }
          : {}),
        ...(params.booking_window !== undefined ? { bookingWindow: params.booking_window } : {}),
        ...(params.limits !== undefined ? { limits: params.limits } : {}),
        ...(params.capacity !== undefined ? { capacity: params.capacity } : {}),
        ...(params.requires_approval !== undefined
          ? { requiresApproval: params.requires_approval }
          : {}),
        ...(params.approval_ttl_minutes !== undefined
          ? { approvalTtlMinutes: params.approval_ttl_minutes }
          : {}),
        ...(params.hold_ttl_seconds !== undefined
          ? { holdTtlSeconds: params.hold_ttl_seconds }
          : {}),
        ...(params.cancel_notice_minutes !== undefined
          ? { cancelNoticeMinutes: params.cancel_notice_minutes }
          : {}),
        ...(params.reschedule_notice_minutes !== undefined
          ? { rescheduleNoticeMinutes: params.reschedule_notice_minutes }
          : {}),
        ...(params.max_guests !== undefined ? { maxGuests: params.max_guests } : {}),
        ...(params.max_active_bookings_per_attendee !== undefined
          ? { maxActiveBookingsPerAttendee: params.max_active_bookings_per_attendee }
          : {}),
        ...(params.host_calendar_details !== undefined
          ? { hostCalendarDetails: params.host_calendar_details }
          : {}),
        ...(params.questions !== undefined ? { questions: params.questions } : {}),
        ...(params.locations !== undefined
          ? { locations: params.locations as EventTypeRow["locations"] }
          : {}),
        ...(params.host_filter !== undefined ? { hostFilter: params.host_filter } : {}),
        ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
      };
      const merged = { ...existing, ...set };
      checkShape(merged, params.hosts);
      const [updated] = await tx
        .update(schedulingEventType)
        .set({ ...set, updatedAt: sql`now()` })
        .where(
          and(
            eq(schedulingEventType.id, existing.id),
            eq(schedulingEventType.organizationId, existing.organizationId),
          ),
        )
        .returning();
      const row = updated as EventTypeRow;
      if (params.hosts) await replaceHosts(tx, scope, row, params.hosts);
      if (row.hostCalendarDetails !== existing.hostCalendarDetails) {
        await rewriteUpcomingEvents(tx, row);
      }
      return toEventTypeObject(row, await eventTypeHosts(tx, row));
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw uidTaken(params.uid);
    throw error;
  }
}
