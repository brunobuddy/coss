/** What can be booked. Bookings snapshot what they occupy, so edits never move an existing one. */
import type { PlanGate } from "@coss/billing/gate";
import { HipaaModeError, hipaaModeApplies } from "@coss/compliance";
import { db, type Executor, schema } from "@coss/db";
import { ID_PREFIXES, isId } from "@coss/db/id";
import { canonicalJson } from "@coss/db/idempotency";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { notZoomMeeting } from "./calendar/zoom.ts";
import { startingUnits } from "./engine/rank.ts";
import { SchedulingError } from "./errors.ts";
import { attributesMatch, checkTimeZone, type HostRow, resolveHost } from "./hosts.ts";
import { policyFromWire, policyToWire } from "./notification-policy.ts";
import { requireLiveFeatureToCreate } from "./plan.ts";
import {
  checkReminders,
  normalizeReminders,
  queueReminderSync,
  type ReminderChecks,
} from "./reminders.ts";
import type {
  CreateEventTypeRequestOutput,
  EventTypeObjectOutput,
  UpdateEventTypeRequestOutput,
} from "./schemas.ts";
import {
  isWithinDomains,
  linkedHosts,
  locationText,
  refuseLinks,
  refuseLinksInAddresses,
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
  schedulingSettings,
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
    description: row.description,
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
    reassignment_enabled: row.reassignmentEnabled,
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
    notifications: policyToWire(row.notifications),
    reminders: row.reminders ?? null,
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

/** A description is shown on hosted pages, so its links can only go somewhere the customer owns. */
async function checkDescription(
  organizationId: string,
  description: string | null | undefined,
): Promise<void> {
  if (!description) return;
  const hosts = linkedHosts(description);
  if (!hosts) {
    throw new SchedulingError(
      "content_refused",
      "Links in a description must use https and a plain address, with no `user@`.",
      {
        param: "description",
      },
    );
  }
  if (hosts.length === 0) return;
  const verified = await db
    .select({ name: schema.domain.name })
    .from(schema.domain)
    .where(
      and(
        eq(schema.domain.organizationId, organizationId),
        eq(schema.domain.status, "verified"),
        isNull(schema.domain.subaccountId),
      ),
    );
  const domains = verified.map((row) => row.name);
  const outside = hosts.find((host) => !isWithinDomains(host, domains));
  if (outside) {
    throw new SchedulingError(
      "content_refused",
      `A description can only link to your organization's verified domains, and ${outside} isn't one.`,
      { param: "description" },
    );
  }
}

/** Addresses and links land in attendees' emails, where nothing screens them per email. */
function locationsText(locations: readonly Parameters<typeof locationText>[0][] | undefined) {
  return (locations ?? []).map(locationText).filter(Boolean).join("\n");
}

function setupText(values: {
  title?: string | undefined;
  description?: string | null | undefined;
  questions?: readonly { label: string; options: readonly string[] }[] | undefined;
}): string {
  return [
    values.title ?? "",
    ...(values.description ? [values.description] : []),
    ...(values.questions ?? []).flatMap((question) => [question.label, ...question.options]),
  ].join("\n");
}

async function emailFromOf(scope: Scope): Promise<string | null> {
  const [settings] = await db
    .select({ emailFrom: schedulingSettings.emailFrom })
    .from(schedulingSettings)
    .where(
      and(
        eq(schedulingSettings.organizationId, scope.organizationId),
        eq(schedulingSettings.environmentId, scope.environmentId),
      ),
    );
  return settings?.emailFrom ?? null;
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

/** Whether a live event type finds its hosts by attributes (what a downgrade would leave behind). */
export async function hasLiveHostFilters(organizationId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schedulingEventType.id })
    .from(schedulingEventType)
    .innerJoin(
      schema.environment,
      and(
        eq(schema.environment.id, schedulingEventType.environmentId),
        eq(schema.environment.organizationId, schedulingEventType.organizationId),
      ),
    )
    .where(
      and(
        eq(schedulingEventType.organizationId, organizationId),
        eq(schema.environment.mode, "live"),
        isNotNull(schedulingEventType.hostFilter),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** A live group session's seats, within the plan's limit (one that shrinks is never refused). */
async function checkGroupSeats(
  env: { organizationId: string; mode?: "live" | "sandbox" },
  plans: PlanGate | undefined,
  capacity: number | null | undefined,
  existing = 0,
): Promise<void> {
  if (env.mode !== "live" || !capacity || capacity <= existing) return;
  await plans?.requireCapacity(env.organizationId, "schedulingGroupSeats", 0, capacity);
}

export async function createEventType(
  env: SchedulingEnvironment,
  params: CreateEventTypeRequestOutput,
  opts: ReminderChecks & { plans?: PlanGate | undefined } = {},
): Promise<EventTypeObjectOutput> {
  // `{}` is a filter too: it matches every active host.
  if (params.host_filter != null)
    await requireLiveFeatureToCreate(env, opts.plans, "schedulingRouting");
  await checkGroupSeats(env, opts.plans, params.capacity);
  refuseLinks(params.title, "title");
  await checkDescription(env.organizationId, params.description);
  refuseLinksInAddresses(params.locations);
  await screenSetup(env, setupText(params), opts.screen, "title");
  const reminders = params.reminders ? normalizeReminders(params.reminders) : null;
  if (reminders) await checkReminders(env, reminders, await emailFromOf(env), opts);
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
          description: params.description ?? null,
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
          reassignmentEnabled: params.reassignment_enabled ?? true,
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
          notifications: policyFromWire(params.notifications ?? null),
          reminders,
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
  opts: ReminderChecks & { plans?: PlanGate | undefined } = {},
): Promise<EventTypeObjectOutput> {
  refuseLinks(params.title, "title");
  await checkDescription(scope.organizationId, params.description);
  refuseLinksInAddresses(params.locations);
  await checkHostCalendarDetails(scope.environmentId, params.host_calendar_details);
  if (
    scope.mode &&
    (params.title !== undefined ||
      params.description !== undefined ||
      params.questions !== undefined)
  ) {
    await screenSetup(
      { organizationId: scope.organizationId, mode: scope.mode },
      setupText(params),
      opts.screen,
      "title",
    );
  }
  const reminders = params.reminders ? normalizeReminders(params.reminders) : params.reminders;
  if (reminders) {
    // A caller with no mode is refused what it can't prove, as a live environment would be.
    await checkReminders(
      { organizationId: scope.organizationId, mode: scope.mode ?? "live" },
      reminders,
      await emailFromOf(scope),
      opts,
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
  // What it already has keeps working: only a change meets the plan. Before the transaction, since
  // the gate takes a connection of its own.
  if (opts.plans && (params.host_filter != null || params.capacity != null)) {
    const current = await resolveEventType(db, scope, ref);
    if (
      params.host_filter != null &&
      // Canonical: jsonb doesn't keep the order of an object's keys.
      canonicalJson(params.host_filter) !== canonicalJson(current.hostFilter)
    ) {
      await requireLiveFeatureToCreate(scope, opts.plans, "schedulingRouting");
    }
    await checkGroupSeats(scope, opts.plans, params.capacity, current.capacity ?? 0);
  }
  try {
    return await db.transaction(async (tx) => {
      const existing = await resolveEventType(tx, scope, ref);
      const set = {
        ...(params.uid !== undefined ? { uid: params.uid } : {}),
        ...(params.title !== undefined ? { title: params.title } : {}),
        ...(params.description !== undefined ? { description: params.description } : {}),
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
        ...(params.reassignment_enabled !== undefined
          ? { reassignmentEnabled: params.reassignment_enabled }
          : {}),
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
        ...(params.notifications !== undefined
          ? { notifications: policyFromWire(params.notifications) }
          : {}),
        ...(reminders !== undefined ? { reminders } : {}),
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
      // Clearing a policy can bring the default reminder back, as much as setting one can.
      if (reminders !== undefined || params.notifications !== undefined) {
        await queueReminderSync(tx, scope, row.id);
      }
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
