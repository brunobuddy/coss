/**
 * Moving many bookings at once: someone's going away, leaving, or has too much on. A run is a row
 * and its items, worked through by the worker one booking per transaction, so one that can't move
 * never holds up the rest and a long list never holds a lock for long. Nothing's ever cancelled:
 * a booking nobody can take stays where it is, and says so.
 */
import { db, type Executor, schema } from "@coss/db";
import { ID_PREFIXES, newId } from "@coss/db/id";
import { requestHash as hashRequest, withIdempotencyKey } from "@coss/db/idempotency";
import { appendLogEntries } from "@coss/logs";
import { decryptSecret, encryptSecret, enqueueWebhookMessage } from "@coss/webhooks";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { decryptRouting } from "./attendees.ts";
import { calendarFailureModeOf, candidatesOf, loadHostInputs, slotRuleOf } from "./availability.ts";
import { type BookingActor, bookingInternals } from "./bookings.ts";
import { type Interval, normalizeIntervals } from "./engine/intervals.ts";
import { isBookable, limitUsageKey, occupiedRange } from "./engine/slots.ts";
import { MINUTE_MS } from "./engine/time.ts";
import { SchedulingError } from "./errors.ts";
import { resolveEventType } from "./event-types.ts";
import { type HostRow, resolveHost } from "./hosts.ts";
import { checkManagedRun, managedRunWhere } from "./manager.ts";
import { reassignBooking, skipsOfOverrides } from "./reassign.ts";
import {
  queueReassignment,
  type ReassignmentRow,
  type ReassignmentSelection,
  type ReassignmentStrategy,
} from "./reassignment-row.ts";
import type {
  CreateReassignmentRequestOutput,
  ReassignBookingRequestOutput,
  ReassignmentItemObjectOutput,
  ReassignmentObjectOutput,
  ReassignmentPreviewOutput,
  UndoReassignmentRequestOutput,
} from "./schemas.ts";
import { nowOf, type SchedulingDeps, type SchedulingEnvironment } from "./types.ts";

const {
  environment,
  schedulingBooking,
  schedulingBookingHost,
  schedulingNotification,
  schedulingOutOfOffice,
  schedulingReassignment,
  schedulingReassignmentItem,
  schedulingSettings,
} = schema;

type Scope = Pick<SchedulingEnvironment, "organizationId" | "environmentId">;
type Keys = Pick<SchedulingDeps, "dataKeys" | "now">;
type BookingRow = typeof schedulingBooking.$inferSelect;
type ItemRow = typeof schedulingReassignmentItem.$inferSelect;

const { coverageWindows, ranked } = bookingInternals;

export const MAX_REASSIGNMENT_BOOKINGS = 5000;
export const MAX_PREVIEW_BOOKINGS = 500;
const LEASE_MS = 2 * 60_000;
const ITEMS_PER_RUN = 50;

const invalid = (message: string, param = "selection") =>
  new SchedulingError("invalid_reassignment", message, { param });

const instantOf = (value: string, param: string): string => {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw invalid(`\`${param}\` isn't a valid time.`, param);
  return new Date(ms).toISOString();
};

/** References become ids once, so a host renamed in between is still who was meant. */
async function resolveSelection(
  env: Scope,
  given: CreateReassignmentRequestOutput["selection"],
  strategy: ReassignmentStrategy,
): Promise<ReassignmentSelection> {
  const selection: ReassignmentSelection = {};
  if (given.host) selection.host_id = (await resolveHost(db, env, given.host)).id;
  if (given.start_after) selection.start_after = instantOf(given.start_after, "start_after");
  if (given.start_before) selection.start_before = instantOf(given.start_before, "start_before");
  if (given.event_types) {
    selection.event_type_ids = [];
    for (const ref of given.event_types) {
      selection.event_type_ids.push((await resolveEventType(db, env, ref)).id);
    }
  }
  if (given.booking_ids) selection.booking_ids = given.booking_ids;
  if (strategy.kind === "assignments") {
    selection.booking_ids = strategy.assignments.map((item) => item.booking_id);
  }
  if (given.series) selection.series_id = given.series;
  if (given.external_conflict !== undefined) selection.external_conflict = given.external_conflict;
  if (given.out_of_office) {
    const [entry] = await db
      .select({ id: schedulingOutOfOffice.id, hostId: schedulingOutOfOffice.hostId })
      .from(schedulingOutOfOffice)
      .where(
        and(
          eq(schedulingOutOfOffice.id, given.out_of_office),
          eq(schedulingOutOfOffice.organizationId, env.organizationId),
          eq(schedulingOutOfOffice.environmentId, env.environmentId),
          isNull(schedulingOutOfOffice.deletedAt),
        ),
      );
    if (!entry) throw invalid(`No out of office entry "${given.out_of_office}".`, "out_of_office");
    selection.out_of_office_id = entry.id;
    selection.host_id = entry.hostId;
  }
  // Without one of these it would mean every booking in the environment.
  if (!selection.host_id && !selection.booking_ids && !selection.series_id) {
    throw invalid("Say whose bookings: `host`, `out_of_office`, `booking_ids` or `series`.");
  }
  return selection;
}

async function resolveStrategy(
  env: Scope,
  given: CreateReassignmentRequestOutput["strategy"],
): Promise<ReassignmentStrategy> {
  if (given.to_host) {
    return { kind: "to_host", host_id: (await resolveHost(db, env, given.to_host)).id };
  }
  if (given.assignments) {
    const assignments = [];
    for (const assignment of given.assignments) {
      assignments.push({
        booking_id: assignment.booking,
        to_host_id: (await resolveHost(db, env, assignment.to_host)).id,
        ...(assignment.from_host
          ? { from_host_id: (await resolveHost(db, env, assignment.from_host)).id }
          : {}),
      });
    }
    return { kind: "assignments", assignments };
  }
  const preferred: string[] = [];
  for (const ref of given.preferred_hosts ?? []) {
    preferred.push((await resolveHost(db, env, ref)).id);
  }
  return { kind: "auto", preferred_host_ids: preferred, otherwise: given.otherwise ?? "auto" };
}

/**
 * What a selection means now: live bookings still to come. A session moves as a whole, so one of
 * its seats stands for it, whichever a person or a count sees.
 */
async function selectionConditions(
  executor: Executor,
  scope: Scope,
  selection: ReassignmentSelection,
  now: Date,
) {
  const [entry] = selection.out_of_office_id
    ? await executor
        .select({ startAt: schedulingOutOfOffice.startAt, endAt: schedulingOutOfOffice.endAt })
        .from(schedulingOutOfOffice)
        .where(
          and(
            eq(schedulingOutOfOffice.id, selection.out_of_office_id),
            eq(schedulingOutOfOffice.organizationId, scope.organizationId),
          ),
        )
    : [];
  if (selection.out_of_office_id && !entry) return null;
  return and(
    eq(schedulingBooking.organizationId, scope.organizationId),
    eq(schedulingBooking.environmentId, scope.environmentId),
    inArray(schedulingBooking.status, ["confirmed", "pending_approval", "held"]),
    gt(schedulingBooking.startAt, now),
    or(isNull(schedulingBooking.holdExpiresAt), gt(schedulingBooking.holdExpiresAt, now)),
    or(isNull(schedulingBooking.approvalExpiresAt), gt(schedulingBooking.approvalExpiresAt, now)),
    selection.host_id ? eq(schedulingBookingHost.hostId, selection.host_id) : undefined,
    selection.start_after
      ? gt(schedulingBooking.endAt, new Date(selection.start_after))
      : undefined,
    selection.start_before
      ? lt(schedulingBooking.startAt, new Date(selection.start_before))
      : undefined,
    entry ? lt(schedulingBooking.startAt, entry.endAt) : undefined,
    entry ? gt(schedulingBooking.endAt, entry.startAt) : undefined,
    selection.event_type_ids
      ? inArray(schedulingBooking.eventTypeId, selection.event_type_ids)
      : undefined,
    selection.booking_ids ? inArray(schedulingBooking.id, selection.booking_ids) : undefined,
    selection.series_id ? eq(schedulingBooking.seriesId, selection.series_id) : undefined,
    selection.external_conflict ? isNotNull(schedulingBooking.externalConflictAt) : undefined,
  );
}

const oneOfASession = sql`coalesce(${schedulingBooking.groupSessionId}, ${schedulingBooking.id})`;

async function selectBookings(
  executor: Executor,
  scope: Scope,
  selection: ReassignmentSelection,
  now: Date,
  limit: number,
): Promise<BookingRow[]> {
  const where = await selectionConditions(executor, scope, selection, now);
  if (!where) return [];
  const picked = await executor
    .select({ id: sql<string>`min(${schedulingBooking.id})` })
    .from(schedulingBooking)
    .leftJoin(schedulingBookingHost, eq(schedulingBookingHost.bookingId, schedulingBooking.id))
    .where(where)
    .groupBy(oneOfASession)
    .orderBy(sql`min(${schedulingBooking.startAt})`, sql`min(${schedulingBooking.id})`)
    .limit(limit);
  if (picked.length === 0) return [];
  return executor
    .select()
    .from(schedulingBooking)
    .where(
      and(
        eq(schedulingBooking.organizationId, scope.organizationId),
        inArray(
          schedulingBooking.id,
          picked.map((row) => row.id),
        ),
      ),
    )
    .orderBy(asc(schedulingBooking.startAt), asc(schedulingBooking.id));
}

async function countSelected(
  scope: Scope,
  selection: ReassignmentSelection,
  now: Date,
): Promise<number> {
  const where = await selectionConditions(db, scope, selection, now);
  if (!where) return 0;
  const [row] = await db
    .select({ count: sql<number>`count(distinct ${oneOfASession})::int` })
    .from(schedulingBooking)
    .leftJoin(schedulingBookingHost, eq(schedulingBookingHost.bookingId, schedulingBooking.id))
    .where(where);
  return row?.count ?? 0;
}

function toObject(
  row: ReassignmentRow,
  counts: ReassignmentObjectOutput["counts"],
): ReassignmentObjectOutput {
  return {
    object: "scheduling.reassignment",
    id: row.id,
    status: row.status,
    reason_code: row.reasonCode as ReassignmentObjectOutput["reason_code"],
    out_of_office: row.outOfOfficeId,
    undo_of: row.undoOfId,
    counts,
    created_at: row.createdAt.toISOString(),
    started_at: row.startedAt?.toISOString() ?? null,
    finished_at: row.finishedAt?.toISOString() ?? null,
  };
}

async function countsOf(
  executor: Executor,
  row: Pick<ReassignmentRow, "id" | "organizationId">,
): Promise<ReassignmentObjectOutput["counts"]> {
  const rows = await executor
    .select({
      outcome: schedulingReassignmentItem.outcome,
      count: sql<number>`count(*)::int`,
    })
    .from(schedulingReassignmentItem)
    .where(
      and(
        eq(schedulingReassignmentItem.reassignmentId, row.id),
        eq(schedulingReassignmentItem.organizationId, row.organizationId),
      ),
    )
    .groupBy(schedulingReassignmentItem.outcome);
  const of = (outcome: ItemRow["outcome"]) =>
    rows.find((entry) => entry.outcome === outcome)?.count ?? 0;
  return {
    total: rows.reduce((sum, entry) => sum + entry.count, 0),
    pending: of("pending"),
    reassigned: of("reassigned"),
    skipped: of("skipped_changed"),
    no_candidate: of("no_candidate"),
    failed: of("failed"),
    cancelled: of("cancelled"),
  };
}

const replayErrors = {
  inProgress: () =>
    new SchedulingError("idempotency_in_progress", "A request with this key is still running."),
  reused: () =>
    new SchedulingError(
      "idempotency_key_reused",
      "This Idempotency-Key was used with a different request.",
    ),
};

/** Starts moving them. It comes back at once: follow it with its id, or the webhook. */
export async function createReassignment(
  env: SchedulingEnvironment,
  params: CreateReassignmentRequestOutput,
  deps: Keys,
  actor: BookingActor,
  opts: {
    idempotencyKey?: string | undefined;
    maxBookings?: number | undefined;
    onlyHosts?: ReadonlySet<string> | undefined;
  } = {},
): Promise<{ reassignment: ReassignmentObjectOutput; replayed: boolean }> {
  const now = nowOf(deps);
  const strategy = await resolveStrategy(env, params.strategy);
  const selection = await resolveSelection(env, params.selection, strategy);
  checkOverrides(params);
  if (opts.onlyHosts) checkManagedRun({ selection, strategy }, opts.onlyHosts);
  const cap = opts.maxBookings ?? MAX_REASSIGNMENT_BOOKINGS;
  if ((await countSelected(env, selection, now)) > cap) {
    throw invalid(
      `That's more than ${cap} bookings. Narrow it with \`start_before\`, and go in steps.`,
    );
  }
  const values = {
    organizationId: env.organizationId,
    projectId: env.projectId,
    environmentId: env.environmentId,
    selection,
    strategy,
    reasonCode: params.reason_code,
    encryptedNote: params.note?.trim() ? encryptSecret(params.note.trim(), deps.dataKeys) : null,
    overrides: params.overrides ?? [],
    notifyAttendees: params.notify?.attendees ?? true,
    notifyHosts: params.notify?.hosts ?? ("digest" as const),
    outOfOfficeId: selection.out_of_office_id ?? null,
    actor,
  };
  const key = opts.idempotencyKey ?? null;
  if (!key) {
    const row = await queueReassignment(db, values);
    return { reassignment: toObject(row, await countsOf(db, row)), replayed: false };
  }
  const { row, replayed } = await withIdempotencyKey<ReassignmentRow>({
    requestHash: hashRequest({ reassignment: params }),
    insert: async (tx) => {
      const [inserted] = await tx
        .insert(schedulingReassignment)
        .values({
          ...values,
          idempotencyKey: key,
          requestHash: hashRequest({ reassignment: params }),
        })
        .onConflictDoNothing({
          target: [schedulingReassignment.environmentId, schedulingReassignment.idempotencyKey],
        })
        .returning();
      return inserted;
    },
    existing: async () => {
      const [existing] = await db
        .select()
        .from(schedulingReassignment)
        .where(
          and(
            eq(schedulingReassignment.organizationId, env.organizationId),
            eq(schedulingReassignment.environmentId, env.environmentId),
            eq(schedulingReassignment.idempotencyKey, key),
          ),
        );
      return existing;
    },
    release: (tx, existing) =>
      tx
        .update(schedulingReassignment)
        .set({ idempotencyKey: null })
        .where(
          and(
            eq(schedulingReassignment.id, existing.id),
            eq(schedulingReassignment.organizationId, existing.organizationId),
          ),
        ),
    errors: replayErrors,
  });
  return { reassignment: toObject(row, await countsOf(db, row)), replayed };
}

function checkOverrides(params: Pick<CreateReassignmentRequestOutput, "overrides" | "note">): void {
  const bypassing = (params.overrides ?? []).some((override) => override !== "any_host");
  if (bypassing && !params.note?.trim()) {
    throw invalid("Overriding someone's availability needs a `note` saying why.", "note");
  }
}

/** Whether a team page can see this run: someone else's looks like it doesn't exist. */
export async function assertManagedRun(
  scope: Scope,
  id: string,
  hostIds: readonly string[],
): Promise<void> {
  const [row] = await db
    .select({ id: schedulingReassignment.id })
    .from(schedulingReassignment)
    .where(
      and(
        eq(schedulingReassignment.id, id),
        eq(schedulingReassignment.organizationId, scope.organizationId),
        eq(schedulingReassignment.environmentId, scope.environmentId),
        await managedRunWhere(hostIds),
      ),
    );
  if (!row) throw new SchedulingError("not_found", `No reassignment "${id}".`);
}

export async function getReassignment(scope: Scope, id: string): Promise<ReassignmentObjectOutput> {
  const row = await runRow(db, scope, id);
  return toObject(row, await countsOf(db, row));
}

async function runRow(executor: Executor, scope: Scope, id: string): Promise<ReassignmentRow> {
  const [row] = await executor
    .select()
    .from(schedulingReassignment)
    .where(
      and(
        eq(schedulingReassignment.id, id),
        eq(schedulingReassignment.organizationId, scope.organizationId),
        eq(schedulingReassignment.environmentId, scope.environmentId),
      ),
    );
  if (!row) throw new SchedulingError("not_found", `No reassignment "${id}".`);
  return row;
}

export async function listReassignments(
  scope: Scope,
  query: { limit: number; after?: string | undefined; hostIds?: readonly string[] | undefined },
): Promise<{ data: ReassignmentObjectOutput[]; hasMore: boolean }> {
  const rows = await db
    .select()
    .from(schedulingReassignment)
    .where(
      and(
        eq(schedulingReassignment.organizationId, scope.organizationId),
        eq(schedulingReassignment.environmentId, scope.environmentId),
        query.hostIds ? await managedRunWhere(query.hostIds) : undefined,
        query.after ? lt(schedulingReassignment.id, query.after) : undefined,
      ),
    )
    .orderBy(desc(schedulingReassignment.id))
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  return {
    data: await Promise.all(page.map(async (row) => toObject(row, await countsOf(db, row)))),
    hasMore: rows.length > query.limit,
  };
}

export async function listReassignmentItems(
  scope: Scope,
  id: string,
  query: { limit: number; after?: string | undefined },
): Promise<{ data: ReassignmentItemObjectOutput[]; hasMore: boolean }> {
  const run = await runRow(db, scope, id);
  const rows = await db
    .select()
    .from(schedulingReassignmentItem)
    .where(
      and(
        eq(schedulingReassignmentItem.reassignmentId, run.id),
        eq(schedulingReassignmentItem.organizationId, run.organizationId),
        query.after ? gt(schedulingReassignmentItem.id, query.after) : undefined,
      ),
    )
    .orderBy(asc(schedulingReassignmentItem.id))
    .limit(query.limit + 1);
  return {
    data: rows.slice(0, query.limit).map((row) => ({
      object: "scheduling.reassignment_item" as const,
      id: row.id,
      booking: row.bookingId,
      from_host: row.fromHostId,
      to_host: row.toHostId,
      outcome: row.outcome,
      error_code: row.errorCode,
    })),
    hasMore: rows.length > query.limit,
  };
}

/** What's done stays done. What isn't, doesn't happen. */
export async function cancelReassignment(
  scope: Scope,
  id: string,
  deps: Pick<SchedulingDeps, "now">,
): Promise<ReassignmentObjectOutput> {
  const now = nowOf(deps);
  const row = await db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(schedulingReassignment)
      .where(
        and(
          eq(schedulingReassignment.id, id),
          eq(schedulingReassignment.organizationId, scope.organizationId),
          eq(schedulingReassignment.environmentId, scope.environmentId),
        ),
      )
      .for("update");
    if (!run) throw new SchedulingError("not_found", `No reassignment "${id}".`);
    if (run.status === "completed" || run.status === "cancelled") return run;
    await tx
      .update(schedulingReassignmentItem)
      .set({ outcome: "cancelled" })
      .where(
        and(
          eq(schedulingReassignmentItem.reassignmentId, run.id),
          eq(schedulingReassignmentItem.organizationId, run.organizationId),
          eq(schedulingReassignmentItem.outcome, "pending"),
        ),
      );
    return finishRun(tx, run, "cancelled", now);
  });
  return toObject(row, await countsOf(db, row));
}

/**
 * Gives back what a run moved, as a new run. Only what's still as it left it: a booking that's moved
 * on since is skipped, and nobody's overridden unless this says so.
 */
export async function undoReassignment(
  env: SchedulingEnvironment,
  id: string,
  params: UndoReassignmentRequestOutput,
  deps: Keys,
  actor: BookingActor,
  opts: { onlyHosts?: ReadonlySet<string> | undefined } = {},
): Promise<ReassignmentObjectOutput> {
  checkOverrides(params);
  const run = await runRow(db, env, id);
  if (run.status === "pending" || run.status === "running") {
    throw new SchedulingError(
      "reassignment_not_finished",
      "This reassignment is still running: cancel it, or wait for it to finish.",
    );
  }
  const items = await db
    .select()
    .from(schedulingReassignmentItem)
    .where(
      and(
        eq(schedulingReassignmentItem.reassignmentId, run.id),
        eq(schedulingReassignmentItem.organizationId, run.organizationId),
        eq(schedulingReassignmentItem.outcome, "reassigned"),
        isNotNull(schedulingReassignmentItem.fromHostId),
      ),
    );
  // A team page gives back only between its own people: a run from elsewhere may have gone further.
  const { onlyHosts } = opts;
  const moved = onlyHosts
    ? items.filter(
        (item) =>
          item.fromHostId &&
          item.toHostId &&
          onlyHosts.has(item.fromHostId) &&
          onlyHosts.has(item.toHostId),
      )
    : items;
  const row = await queueReassignment(db, {
    organizationId: env.organizationId,
    projectId: env.projectId,
    environmentId: env.environmentId,
    selection: { booking_ids: moved.map((item) => item.bookingId) },
    strategy: {
      kind: "assignments",
      assignments: moved.map((item) => ({
        booking_id: item.bookingId,
        to_host_id: item.fromHostId as string,
        ...(item.toHostId ? { from_host_id: item.toHostId } : {}),
      })),
    },
    reasonCode: params.reason_code ?? "other",
    encryptedNote: params.note?.trim() ? encryptSecret(params.note.trim(), deps.dataKeys) : null,
    overrides: params.overrides ?? [],
    notifyAttendees: params.notify?.attendees ?? run.notifyAttendees,
    notifyHosts: params.notify?.hosts ?? run.notifyHosts,
    undoOfId: run.id,
    actor,
  });
  return toObject(row, await countsOf(db, row));
}

/** A preview's fairest may be anyone, and it only proposes people the team reaches anyway. */
const previewable = (strategy: ReassignmentStrategy): ReassignmentStrategy =>
  strategy.kind === "auto" ? { ...strategy, otherwise: "leave" } : strategy;

/**
 * What would happen, without doing it: who each booking would go to, working down them in order so
 * two can't both be promised the same free hour. Things can change before it's asked for, and the
 * run decides again. A UI can change any of it and send it back as `assignments`.
 */
export async function previewReassignment(
  env: Scope,
  params: Pick<CreateReassignmentRequestOutput, "selection" | "strategy" | "overrides">,
  deps: Keys,
  opts: { onlyHosts?: ReadonlySet<string> | undefined } = {},
): Promise<ReassignmentPreviewOutput> {
  const now = nowOf(deps);
  const strategy = await resolveStrategy(env, params.strategy);
  const selection = await resolveSelection(env, params.selection, strategy);
  if (opts.onlyHosts)
    checkManagedRun({ selection, strategy: previewable(strategy) }, opts.onlyHosts);
  const bookings = await selectBookings(db, env, selection, now, MAX_PREVIEW_BOOKINGS + 1);
  const truncated = bookings.length > MAX_PREVIEW_BOOKINGS;
  const chosen = bookings.slice(0, MAX_PREVIEW_BOOKINGS);
  const skip = skipsOfOverrides(params.overrides);
  const anyHost = params.overrides?.includes("any_host") ?? false;
  const assigned = new Map(
    strategy.kind === "assignments"
      ? strategy.assignments.map((item) => [item.booking_id, item])
      : [],
  );
  const named = new Map<string, HostRow>();
  const namedIds = [
    ...(strategy.kind === "to_host" ? [strategy.host_id] : []),
    ...(strategy.kind === "auto" ? strategy.preferred_host_ids : []),
    ...[...assigned.values()].map((item) => item.to_host_id),
  ];
  for (const id of new Set(namedIds)) named.set(id, await resolveHost(db, env, id));
  const failureMode = await calendarFailureModeOf(db, env);
  const hostRows = chosen.length
    ? await db
        .select()
        .from(schedulingBookingHost)
        .where(
          and(
            eq(schedulingBookingHost.organizationId, env.organizationId),
            inArray(
              schedulingBookingHost.bookingId,
              chosen.map((booking) => booking.id),
            ),
          ),
        )
    : [];
  // What the proposal's used so far. A host's one person, across event types.
  const proposed = new Map<
    string,
    { eventTypeId: string; startMs: number; occupied: Interval }[]
  >();
  const fairness = new Map<string, number>();
  const seriesHost = new Map<string, string>();
  const byEventType = new Map<string, BookingRow[]>();
  for (const booking of chosen) {
    byEventType.set(booking.eventTypeId, [
      ...(byEventType.get(booking.eventTypeId) ?? []),
      booking,
    ]);
  }
  const items: ReassignmentPreviewOutput["items"] = [];
  for (const [eventTypeId, group] of byEventType) {
    const eventType = await resolveEventType(db, env, eventTypeId);
    const unrouted = await candidatesOf(db, env, eventType, {});
    const everyone = new Map<string, HostRow>(named);
    for (const entry of [...unrouted.members, ...unrouted.required]) {
      everyone.set(entry.host.id, entry.host);
    }
    const scheduleOf = new Map(
      [...unrouted.members, ...unrouted.required].map((entry) => [
        entry.host.id,
        entry.membership?.scheduleId ?? null,
      ]),
    );
    const loaded = await loadHostInputs(db, {
      scope: env,
      hosts: [...everyone.values()].map((host) => ({
        id: host.id,
        timeZone: host.timeZone,
        scheduleId: scheduleOf.get(host.id) ?? null,
      })),
      eventTypeId,
      fromMs: Math.min(...group.map((booking) => booking.startAt.getTime())),
      toMs: Math.max(...group.map((booking) => booking.endAt.getTime())),
      nowMs: now.getTime(),
      calendarFailureMode: failureMode,
    });
    for (const booking of group) {
      const rows = hostRows.filter((row) => row.bookingId === booking.id);
      const current = new Set(rows.map((row) => row.hostId));
      const members = rows.filter((row) => row.role === "member");
      const from =
        assigned.get(booking.id)?.from_host_id ??
        selection.host_id ??
        (rows.length === 1 ? rows[0]?.hostId : members.length === 1 ? members[0]?.hostId : null) ??
        null;
      const routing = decryptRouting(booking.encryptedAttributes, deps);
      const candidates = await candidatesOf(
        db,
        env,
        eventType,
        routing && Object.keys(routing).length > 0 ? { attributes: routing } : {},
      );
      const memberIds = new Set(
        [...candidates.members, ...candidates.required].map((entry) => entry.host.id),
      );
      // Whose time someone's covering depends on who this booking could have gone to.
      const coverage = coverageWindows(candidates);
      const durationMinutes = (booking.endAt.getTime() - booking.startAt.getTime()) / MINUTE_MS;
      const rule = {
        ...slotRuleOf(eventType, durationMinutes),
        bufferBeforeMinutes: booking.bufferBeforeMinutes,
        bufferAfterMinutes: booking.bufferAfterMinutes,
      };
      const startMs = booking.startAt.getTime();
      let to: string | null = null;
      let reason: string | null = null;
      const attempt = (hostId: string): boolean => {
        const inputs = loaded.get(hostId);
        if (opts.onlyHosts && !opts.onlyHosts.has(hostId)) reason = "not_on_team";
        else if (current.has(hostId)) reason = "already_a_host";
        else if (!memberIds.has(hostId) && !anyHost) reason = "not_a_member";
        else if (!inputs) reason = "host_unavailable";
        else {
          const taken = proposed.get(hostId) ?? [];
          const limitUsage = { ...inputs.limitUsage };
          for (const limit of rule.limits) {
            const key = limitUsageKey(limit, inputs.timeZone, startMs);
            const inSameBucket = taken.filter(
              (claim) =>
                (limit.scope === "host" || claim.eventTypeId === eventTypeId) &&
                limitUsageKey(limit, inputs.timeZone, claim.startMs) === key,
            ).length;
            limitUsage[key] = (limitUsage[key] ?? 0) + inSameBucket;
          }
          const verdict = isBookable(startMs, {
            nowMs: now.getTime(),
            rule,
            host: {
              ...inputs,
              onlyWithin: anyHost ? undefined : coverage.get(hostId),
              limitUsage,
              claims: normalizeIntervals([
                ...inputs.claims,
                ...taken.map((claim) => claim.occupied),
              ]),
            },
            skip,
          });
          if (verdict.ok) {
            to = hostId;
            reason = null;
            return true;
          }
          reason = verdict.reason;
        }
        return false;
      };
      if (!eventType.reassignmentEnabled) reason = "reassignment_disabled";
      else if (!from) reason = "several_hosts";
      else if (strategy.kind === "to_host") attempt(strategy.host_id);
      else if (strategy.kind === "assignments") {
        const target = assigned.get(booking.id);
        if (target) attempt(target.to_host_id);
        else reason = "no_assignment";
      } else if (routing === null && eventType.kind === "pool") {
        reason = "routing_unknown";
      } else {
        const series = booking.seriesId ? seriesHost.get(booking.seriesId) : undefined;
        const adjusted = candidates.members.map((entry) => ({
          ...entry,
          membership: entry.membership && {
            ...entry.membership,
            fairUnits:
              entry.membership.fairUnits + (fairness.get(`${eventTypeId}:${entry.host.id}`) ?? 0),
          },
        }));
        const ranking =
          strategy.otherwise === "auto"
            ? ranked({ required: [], members: adjusted }, `${booking.id}:${booking.version}`)
            : [];
        const ordered = new Set([
          ...(series ? [series] : []),
          ...strategy.preferred_host_ids,
          ...ranking.map((host) => host.id),
        ]);
        for (const hostId of ordered) {
          if (attempt(hostId)) break;
        }
        if (!to) reason = "no_candidate";
      }
      if (to) {
        const taken = proposed.get(to) ?? [];
        taken.push({ eventTypeId, startMs, occupied: occupiedRange(startMs, rule) });
        proposed.set(to, taken);
        if (eventType.kind === "pool") {
          const key = `${eventTypeId}:${to}`;
          fairness.set(key, (fairness.get(key) ?? 0) + 1);
        }
        if (booking.seriesId) seriesHost.set(booking.seriesId, to);
      }
      items.push({
        booking: booking.id,
        event_type: booking.eventTypeId,
        title: booking.title,
        status: booking.status,
        start: booking.startAt.toISOString(),
        end: booking.endAt.toISOString(),
        series: booking.seriesId,
        group_session: booking.groupSessionId,
        from_host: from,
        to_host: to,
        reason,
      });
    }
  }
  items.sort((a, b) => a.start.localeCompare(b.start) || a.booking.localeCompare(b.booking));
  return { object: "scheduling.reassignment_preview", items, truncated };
}

type Scan = { limit?: number; scope?: { organizationIds: readonly string[] } };

const stillHeld = (run: ReassignmentRow) =>
  and(
    eq(schedulingReassignment.id, run.id),
    eq(schedulingReassignment.organizationId, run.organizationId),
    run.leaseUntil ? eq(schedulingReassignment.leaseUntil, run.leaseUntil) : undefined,
    inArray(schedulingReassignment.status, ["pending", "running"]),
  );

async function claimDue(now: Date, opts: Scan): Promise<ReassignmentRow[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(schedulingReassignment)
      .where(
        and(
          inArray(schedulingReassignment.status, ["pending", "running"]),
          or(isNull(schedulingReassignment.leaseUntil), lt(schedulingReassignment.leaseUntil, now)),
          opts.scope
            ? inArray(schedulingReassignment.organizationId, [...opts.scope.organizationIds])
            : undefined,
        ),
      )
      .orderBy(asc(schedulingReassignment.createdAt))
      .limit(opts.limit ?? 5)
      .for("update", { skipLocked: true });
    const leaseUntil = new Date(now.getTime() + LEASE_MS);
    const claimed: ReassignmentRow[] = [];
    for (const run of due) {
      const [row] = await tx
        .update(schedulingReassignment)
        .set({ leaseUntil, status: "running", startedAt: run.startedAt ?? now })
        .where(
          and(
            eq(schedulingReassignment.id, run.id),
            eq(schedulingReassignment.organizationId, run.organizationId),
          ),
        )
        .returning();
      if (row) claimed.push(row);
    }
    return claimed;
  });
}

/** Works out what a run covers, once, when it first runs. */
async function expand(run: ReassignmentRow, now: Date): Promise<void> {
  if (run.expandedAt) return;
  const scope = { organizationId: run.organizationId, environmentId: run.environmentId };
  await db.transaction(async (tx) => {
    const bookings = await selectBookings(tx, scope, run.selection, now, MAX_REASSIGNMENT_BOOKINGS);
    const strategy = run.strategy;
    const wanted =
      strategy.kind === "assignments"
        ? new Map(strategy.assignments.map((item) => [item.booking_id, item]))
        : null;
    const rows = bookings
      .filter((booking) => !wanted || wanted.has(booking.id))
      .map((booking) => ({
        organizationId: run.organizationId,
        reassignmentId: run.id,
        bookingId: booking.id,
        fromHostId: wanted?.get(booking.id)?.from_host_id ?? run.selection.host_id ?? null,
        toHostId:
          wanted?.get(booking.id)?.to_host_id ??
          (strategy.kind === "to_host" ? strategy.host_id : null),
        seriesId: booking.seriesId,
        startAt: booking.startAt,
      }));
    for (let index = 0; index < rows.length; index += 500) {
      await tx
        .insert(schedulingReassignmentItem)
        .values(rows.slice(index, index + 500))
        .onConflictDoNothing();
    }
    await tx.update(schedulingReassignment).set({ expandedAt: now }).where(stillHeld(run));
  });
}

function outcomeOf(error: SchedulingError, item: ItemRow): ItemRow["outcome"] {
  switch (error.code) {
    // It's moved on since it was selected, which is its own news.
    case "booking_not_changeable":
    case "hold_expired":
    case "not_found":
      return "skipped_changed";
    case "no_reassign_candidate":
    case "reassign_target_unavailable":
      return "no_candidate";
    case "invalid_reassignment":
      return error.param === "from_host" && item.fromHostId ? "skipped_changed" : "no_candidate";
    default:
      return "failed";
  }
}

async function processItem(
  run: ReassignmentRow,
  env: SchedulingEnvironment,
  item: ItemRow,
  note: string | undefined,
  seriesHost: Map<string, string>,
  deps: Keys,
): Promise<void> {
  const strategy = run.strategy;
  const series = item.seriesId ? seriesHost.get(item.seriesId) : undefined;
  const change: ReassignBookingRequestOutput["changes"][number] = {
    ...(item.fromHostId ? { from_host: item.fromHostId } : {}),
    ...(item.toHostId
      ? { to_host: item.toHostId }
      : {
          auto: true,
          preferred_hosts: [
            ...(series ? [series] : []),
            ...(strategy.kind === "auto" ? strategy.preferred_host_ids : []),
          ],
        }),
  };
  const finish = (
    executor: Executor,
    values: Partial<ItemRow> & Pick<ItemRow, "outcome">,
    onlyIfPending: boolean,
  ) =>
    executor
      .update(schedulingReassignmentItem)
      .set(values)
      .where(
        and(
          eq(schedulingReassignmentItem.id, item.id),
          eq(schedulingReassignmentItem.organizationId, item.organizationId),
          onlyIfPending ? eq(schedulingReassignmentItem.outcome, "pending") : undefined,
        ),
      );
  try {
    await reassignBooking(
      env,
      item.bookingId,
      {
        changes: [change],
        reason_code: run.reasonCode as ReassignBookingRequestOutput["reason_code"],
        ...(note ? { note } : {}),
        overrides: run.overrides as NonNullable<ReassignBookingRequestOutput["overrides"]>,
        notify: { attendee: run.notifyAttendees },
      },
      deps,
      run.actor,
      {
        reassignmentId: run.id,
        quietHosts: run.notifyHosts !== "each",
        onlyPreferred: strategy.kind === "auto" && strategy.otherwise === "leave",
        onMoved: async (tx, moves) => {
          const [move] = moves;
          if (!move) return;
          if (item.seriesId) seriesHost.set(item.seriesId, move.to);
          // What happened happened, even if someone's just cancelled what's left of the run.
          await finish(
            tx,
            { outcome: "reassigned", errorCode: null, fromHostId: move.from, toHostId: move.to },
            false,
          );
        },
      },
    );
  } catch (error) {
    if (error instanceof SchedulingError) {
      await finish(db, { outcome: outcomeOf(error, item), errorCode: error.code }, true);
    } else {
      // One booking's trouble isn't the run's: the rest still go, and this one says it failed.
      console.error("[scheduling] a reassignment item failed:", error);
      await finish(db, { outcome: "failed", errorCode: "internal_error" }, true);
    }
  }
}

async function finishRun(
  tx: Executor,
  run: ReassignmentRow,
  status: "completed" | "cancelled",
  now: Date,
): Promise<ReassignmentRow> {
  const [row] = await tx
    .update(schedulingReassignment)
    // Each booking's history keeps its own copy, so a finished run has no reason to hold this.
    .set({ status, finishedAt: now, leaseUntil: null, encryptedNote: null })
    .where(
      and(
        eq(schedulingReassignment.id, run.id),
        eq(schedulingReassignment.organizationId, run.organizationId),
      ),
    )
    .returning();
  const finished = row as ReassignmentRow;
  const counts = await countsOf(tx, finished);
  const id = newId(ID_PREFIXES.webhookEvent);
  await enqueueWebhookMessage(tx, {
    id,
    organizationId: run.organizationId,
    environmentId: run.environmentId,
    type: "scheduling.reassignment.completed",
    payload: {
      id,
      object: "event",
      type: "scheduling.reassignment.completed",
      created_at: now.toISOString(),
      data: {
        reassignment_id: run.id,
        status,
        out_of_office_id: run.outOfOfficeId,
        counts,
        occurred_at: now.toISOString(),
      },
    },
  });
  await appendLogEntries(tx, [
    {
      organizationId: run.organizationId,
      projectId: run.projectId,
      environmentId: run.environmentId,
      occurredAt: now,
      source: "scheduling",
      level: counts.failed + counts.no_candidate > 0 ? "warning" : "info",
      type: "scheduling.reassignment.completed",
      message: `Reassigned ${counts.reassigned} of ${counts.total} bookings`,
      resourceType: "scheduling_reassignment",
      resourceId: run.id,
      attributes: counts,
    },
  ]);
  await enqueueDigests(tx, finished, now);
  return finished;
}

/** One email per host per run, whatever it moved: fifty at once isn't fifty things to read. */
async function enqueueDigests(tx: Executor, run: ReassignmentRow, now: Date): Promise<void> {
  if (run.notifyHosts !== "digest") return;
  const [settings] = await tx
    .select({ notifications: schedulingSettings.notifications })
    .from(schedulingSettings)
    .where(
      and(
        eq(schedulingSettings.organizationId, run.organizationId),
        eq(schedulingSettings.environmentId, run.environmentId),
      ),
    );
  if (settings?.notifications?.reassigned?.emailHost === false) return;
  const moved = await tx
    .select({
      fromHostId: schedulingReassignmentItem.fromHostId,
      toHostId: schedulingReassignmentItem.toHostId,
    })
    .from(schedulingReassignmentItem)
    .where(
      and(
        eq(schedulingReassignmentItem.reassignmentId, run.id),
        eq(schedulingReassignmentItem.organizationId, run.organizationId),
        eq(schedulingReassignmentItem.outcome, "reassigned"),
      ),
    );
  const hostIds = new Set(
    moved.flatMap((item) => [item.fromHostId, item.toHostId]).filter((id) => id !== null),
  );
  if (hostIds.size === 0) return;
  await tx
    .insert(schedulingNotification)
    .values(
      [...hostIds].map((hostId) => ({
        organizationId: run.organizationId,
        environmentId: run.environmentId,
        hostId,
        reassignmentId: run.id,
        kind: "reassignment_summary",
        channel: "email" as const,
        recipient: "host" as const,
        dedupeKey: `reassignment_summary:${run.id}:${hostId}`,
        dueAt: now,
      })),
    )
    .onConflictDoNothing();
}

async function environmentOf(run: ReassignmentRow): Promise<SchedulingEnvironment | null> {
  const [found] = await db
    .select({ mode: environment.mode })
    .from(environment)
    .where(
      and(
        eq(environment.id, run.environmentId),
        eq(environment.organizationId, run.organizationId),
      ),
    );
  return found
    ? {
        organizationId: run.organizationId,
        projectId: run.projectId,
        environmentId: run.environmentId,
        mode: found.mode,
      }
    : null;
}

async function workOn(run: ReassignmentRow, deps: Keys, now: Date) {
  const env = await environmentOf(run);
  if (!env) return;
  await expand(run, now);
  const note = run.encryptedNote ? decryptSecret(run.encryptedNote, deps.dataKeys) : undefined;
  // A series keeps to one host where it can. The last one's whoever took an earlier occurrence.
  const seriesHost = new Map<string, string>();
  const placed = await db
    .select({
      seriesId: schedulingReassignmentItem.seriesId,
      toHostId: schedulingReassignmentItem.toHostId,
    })
    .from(schedulingReassignmentItem)
    .where(
      and(
        eq(schedulingReassignmentItem.reassignmentId, run.id),
        eq(schedulingReassignmentItem.organizationId, run.organizationId),
        eq(schedulingReassignmentItem.outcome, "reassigned"),
        isNotNull(schedulingReassignmentItem.seriesId),
      ),
    );
  for (const item of placed) {
    if (item.seriesId && item.toHostId) seriesHost.set(item.seriesId, item.toHostId);
  }
  const items = await db
    .select()
    .from(schedulingReassignmentItem)
    .where(
      and(
        eq(schedulingReassignmentItem.reassignmentId, run.id),
        eq(schedulingReassignmentItem.organizationId, run.organizationId),
        eq(schedulingReassignmentItem.outcome, "pending"),
      ),
    )
    // Soonest first: they're who it matters most to.
    .orderBy(asc(schedulingReassignmentItem.startAt), asc(schedulingReassignmentItem.id))
    .limit(ITEMS_PER_RUN);
  let current = run;
  for (const item of items) {
    // Cancelled or taken over: whoever holds it now carries on, and this stops here.
    const leaseUntil = new Date(nowOf(deps).getTime() + LEASE_MS);
    const [renewed] = await db
      .update(schedulingReassignment)
      .set({ leaseUntil })
      .where(stillHeld(current))
      .returning();
    if (!renewed) return;
    current = renewed;
    await processItem(current, env, item, note, seriesHost, deps);
  }
  if (items.length === ITEMS_PER_RUN) {
    // More to do: free for the next pass of the loop, which may be another worker's.
    await db.update(schedulingReassignment).set({ leaseUntil: null }).where(stillHeld(current));
    return;
  }
  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(schedulingReassignment)
      .where(stillHeld(current))
      .for("update");
    if (locked) await finishRun(tx, locked, "completed", nowOf(deps));
  });
}

/** Works through what's due. Returns how many runs it looked at, so a full batch goes again. */
export async function runDueReassignments(deps: Keys, opts: Scan = {}): Promise<number> {
  const now = nowOf(deps);
  const due = await claimDue(now, opts);
  for (const run of due) {
    try {
      await workOn(run, deps, now);
    } catch (error) {
      // The lease runs out and it's tried again: nothing it did needs undoing.
      console.error("[scheduling] a reassignment failed:", error);
    }
  }
  return due.length;
}
