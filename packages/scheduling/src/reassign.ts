/**
 * Giving a booking to another host, keeping its id and time. Every kind can move: a pool's or
 * one-on-one's host, either role of a collective, a whole group session, a hold, a request waiting
 * for approval, and for the record one that's already started.
 *
 * The target is claimed before the source lets go, so a lost race leaves the booking as it was. The
 * exclusion constraint has the last word: overrides can skip what `isBookable` checks, never that.
 */
import { db, type Executor, schema, type Transaction } from "@coss/db";
import { encryptSecret } from "@coss/webhooks";
import { and, asc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { decryptRouting } from "./attendees.ts";
import { calendarFailureModeOf, candidatesOf, loadHostInputs, slotRuleOf } from "./availability.ts";
import {
  type BookingActor,
  bookingInternals,
  type ClaimPlan,
  toBookingObject,
} from "./bookings.ts";
import {
  claimRemainingSeconds,
  inSavepoint,
  releaseHostClaim,
  sessionClaimRemainingSeconds,
  tryClaim,
} from "./claims.ts";
import { isBookable, type NotBookableReason, occupiedRange } from "./engine/slots.ts";
import { MINUTE_MS } from "./engine/time.ts";
import { SchedulingError } from "./errors.ts";
import { type EventTypeRow, resolveEventType } from "./event-types.ts";
import { type HostRow, hostsByIds, resolveHost } from "./hosts.ts";
import { carryReminders, enqueueReassignment } from "./notifications.ts";
import type { BookingObjectOutput, ReassignBookingRequestOutput } from "./schemas.ts";
import { nowOf, type SchedulingDeps, type SchedulingEnvironment } from "./types.ts";

const {
  schedulingBooking,
  schedulingBookingHost,
  schedulingCalendar,
  schedulingCalendarConnection,
  schedulingCalendarEvent,
  schedulingClaim,
  schedulingGroupSession,
  schedulingHost,
} = schema;

type BookingRow = typeof schedulingBooking.$inferSelect;
type Scope = Pick<SchedulingEnvironment, "organizationId" | "environmentId">;
type HostRole = (typeof schedulingBookingHost.$inferSelect)["role"];
type Keys = Pick<SchedulingDeps, "dataKeys" | "now">;
type Options = {
  /** The bulk reassignment this is part of. */
  reassignmentId?: string | undefined;
  /** It'll tell the hosts itself, once. */
  quietHosts?: boolean | undefined;
  /** With `auto`: only the preferred hosts, not whoever else a pool would pick. */
  onlyPreferred?: boolean | undefined;
  /**
   * A session's reach, known before the booking's locked. Only here is it certain who has the booking
   * now, so here's where it's checked: someone else's looks like it doesn't exist.
   */
  fromHosts?: ReadonlySet<string> | undefined;
  /** Who a session can give it to. */
  toHosts?: ReadonlySet<string> | undefined;
  /** In the same transaction, so a report can't disagree with what happened. */
  onMoved?:
    | ((tx: Transaction, moves: readonly { from: string; to: string }[]) => Promise<void>)
    | undefined;
};

const {
  LostSlot,
  assignFairly,
  bumped,
  coverageWindows,
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
} = bookingInternals;

/** The fixed time's own business: a booking that exists already answered these when it was made. */
const ALREADY_DECIDED: readonly NotBookableReason[] = [
  "not_on_grid",
  "too_soon",
  "outside_booking_window",
];

const OVERRIDE_REASONS = {
  out_of_office: "out_of_office",
  outside_availability: "outside_availability",
  host_busy: "host_busy",
  limit_reached: "limit_reached",
  calendar_unverified: "calendar_unverified",
} as const satisfies Record<string, NotBookableReason>;

const refusedByHost = (reason: string) =>
  new SchedulingError(
    "reassign_target_unavailable",
    reason === "already_claimed"
      ? "That host already has something at this time."
      : `That host isn't available at this time (${reason}). Pass it in \`overrides\` to go ahead.`,
    { param: "changes" },
  );

const invalid = (message: string, param = "changes") =>
  new SchedulingError("invalid_reassignment", message, { param });

export function skipsOfOverrides(
  overrides: ReassignBookingRequestOutput["overrides"],
): NotBookableReason[] {
  const skipped: NotBookableReason[] = [...ALREADY_DECIDED];
  // Standing in is a reason someone who doesn't take this could; `any_host` doesn't need one.
  if (overrides?.includes("any_host")) skipped.push("outside_coverage");
  for (const override of overrides ?? []) {
    if (override in OVERRIDE_REASONS) {
      skipped.push(OVERRIDE_REASONS[override as keyof typeof OVERRIDE_REASONS]);
    }
  }
  return skipped;
}

function checkRequest(input: ReassignBookingRequestOutput): void {
  for (const change of input.changes) {
    if (Boolean(change.to_host) === Boolean(change.auto)) {
      throw invalid("Each change names `to_host`, or sets `auto`.");
    }
    if (change.preferred_hosts?.length && !change.auto) {
      throw invalid("`preferred_hosts` goes with `auto`.");
    }
  }
  // Going against what the host said about their own time needs someone to say why.
  const bypassing = (input.overrides ?? []).some((override) => override in OVERRIDE_REASONS);
  if (bypassing && !input.note?.trim()) {
    throw invalid("Overriding a host's availability needs a `note` saying why.", "note");
  }
}

function checkChangeable(booking: BookingRow): void {
  if (booking.status === "cancelled" || booking.status === "declined") throw notChangeable(booking);
  if (booking.redactedAt) {
    throw new SchedulingError(
      "booking_not_changeable",
      "This booking's details have been erased, so it can't change.",
    );
  }
}

async function bookingHostRows(tx: Executor, booking: Pick<BookingRow, "id" | "organizationId">) {
  return tx
    .select()
    .from(schedulingBookingHost)
    .where(
      and(
        eq(schedulingBookingHost.bookingId, booking.id),
        eq(schedulingBookingHost.organizationId, booking.organizationId),
      ),
    );
}

async function hostRowOf(tx: Executor, scope: Scope, ref: string): Promise<HostRow> {
  return resolveHost(tx, scope, ref);
}

/** Whichever host a change means when it doesn't say: the only one, or the only `member`. */
function sourceOf(
  rows: readonly { hostId: string; role: HostRole }[],
  given: string | undefined,
): { hostId: string; role: HostRole } {
  if (given) {
    const named = rows.find((row) => row.hostId === given);
    if (!named) throw invalid("`from_host` isn't a host of this booking.", "from_host");
    return named;
  }
  if (rows.length === 1 && rows[0]) return rows[0];
  const members = rows.filter((row) => row.role === "member");
  if (members.length === 1 && members[0]) return members[0];
  throw invalid("This booking has several hosts: say which with `from_host`.", "from_host");
}

/** Who this booking could go to without an override, keeping to what it was routed with. */
async function candidatesFor(
  tx: Executor,
  env: Scope,
  booking: BookingRow,
  eventType: EventTypeRow,
  deps: Pick<SchedulingDeps, "dataKeys">,
) {
  const routing = decryptRouting(booking.encryptedAttributes, deps);
  const candidates = await candidatesOf(
    tx,
    env,
    eventType,
    routing && Object.keys(routing).length > 0 ? { attributes: routing } : {},
  );
  return { candidates, routingKnown: routing !== null };
}

type Swap = { from: { hostId: string; role: HostRole }; to: HostRow };

/** Everyone involved, in one order, so two reassignments can't wait on each other's hosts. */
async function holdSources(tx: Executor, scope: Scope, hostIds: readonly string[]): Promise<void> {
  // `key share` and no status check: leaving a disabled host is how someone gets offboarded.
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
    .for("key share");
}

async function claimTarget(
  tx: Transaction,
  plan: ClaimPlan,
  target: HostRow,
  schedules: ReadonlyMap<string, string | null>,
  owner: { bookingId: string } | { groupSessionId: string },
  ttlSeconds: number | null,
): Promise<Date | null> {
  const { eventType, rule, startMs } = plan;
  await lockHostsAndMemberships(tx, eventType, [target.id]);
  await lockLimitBuckets(tx, eventType, rule, [target], startMs);
  const verdict = (await verdictsOf(tx, plan, [target], schedules)).get(target.id);
  if (!verdict?.ok) throw new LostSlot(verdict?.reason ?? "host_unavailable");
  const claim = await tryClaim(tx, {
    organizationId: eventType.organizationId,
    environmentId: eventType.environmentId,
    hostId: target.id,
    hostTimeZone: target.timeZone,
    eventTypeId: eventType.id,
    owner,
    occupied: occupiedRange(startMs, rule),
    startMs,
    ttlSeconds,
  });
  if (!claim) throw new LostSlot("already_claimed");
  return claim.liveUntil;
}

async function remainingTtl(tx: Executor, booking: BookingRow, hostId: string) {
  if (booking.status === "confirmed") return null;
  const remaining = await claimRemainingSeconds(tx, {
    bookingId: booking.id,
    organizationId: booking.organizationId,
    hostId,
  });
  // A second's what's needed for a claim's range to be a range at all.
  if (remaining === null || remaining < 1) {
    throw new SchedulingError("hold_expired", "This booking's hold has run out.");
  }
  return remaining;
}

function expiryOf(booking: BookingRow, liveUntil: Date | null) {
  if (!liveUntil) return {};
  if (booking.status === "held") {
    const current = booking.holdExpiresAt;
    return { holdExpiresAt: current && current < liveUntil ? current : liveUntil };
  }
  if (booking.status === "pending_approval") {
    const current = booking.approvalExpiresAt;
    return { approvalExpiresAt: current && current < liveUntil ? current : liveUntil };
  }
  return {};
}

async function swapHostRow(tx: Executor, booking: BookingRow, swap: Swap): Promise<void> {
  await tx
    .delete(schedulingBookingHost)
    .where(
      and(
        eq(schedulingBookingHost.bookingId, booking.id),
        eq(schedulingBookingHost.organizationId, booking.organizationId),
        eq(schedulingBookingHost.hostId, swap.from.hostId),
      ),
    );
  await tx.insert(schedulingBookingHost).values({
    bookingId: booking.id,
    hostId: swap.to.id,
    organizationId: booking.organizationId,
    role: swap.from.role,
  });
}

/** The pool's count follows the booking, one row at a time and in order, as bookers take them. */
async function moveFairness(tx: Executor, booking: BookingRow, swaps: readonly Swap[]) {
  const moves = swaps
    .filter((swap) => swap.from.role === "member")
    .flatMap((swap) => [
      { hostId: swap.from.hostId, delta: -1 as const },
      { hostId: swap.to.id, delta: 1 as const },
    ])
    .sort((a, b) => (a.hostId < b.hostId ? -1 : 1));
  for (const move of moves) await assignFairly(tx, booking, [move.hostId], move.delta);
}

function encryptedNoteOf(note: string | undefined, deps: Pick<SchedulingDeps, "dataKeys">) {
  return note?.trim() ? encryptSecret(note.trim(), deps.dataKeys) : null;
}

/** Hands a booking to another host. Its id, time and attendees stay. */
export async function reassignBooking(
  env: SchedulingEnvironment,
  id: string,
  input: ReassignBookingRequestOutput,
  deps: Keys,
  actor: BookingActor,
  opts: Options = {},
): Promise<BookingObjectOutput> {
  checkRequest(input);
  const row = await retryingDeadlocks(() =>
    db.transaction(async (tx) => {
      const [peek] = await tx
        .select({ groupSessionId: schedulingBooking.groupSessionId })
        .from(schedulingBooking)
        .where(
          and(
            eq(schedulingBooking.id, id),
            eq(schedulingBooking.organizationId, env.organizationId),
            eq(schedulingBooking.environmentId, env.environmentId),
          ),
        );
      if (peek?.groupSessionId) {
        return reassignSession(tx, env, peek.groupSessionId, id, input, deps, actor, opts);
      }
      const booking = await lockBooking(tx, env, id);
      return reassignOne(tx, env, booking, input, deps, actor, opts);
    }),
  );
  return toBookingObject(db, row, deps);
}

async function reassignOne(
  tx: Transaction,
  env: SchedulingEnvironment,
  booking: BookingRow,
  input: ReassignBookingRequestOutput,
  deps: Keys,
  actor: BookingActor,
  opts: Options,
): Promise<BookingRow> {
  checkChangeable(booking);
  const now = nowOf(deps);
  const eventType = await resolveEventType(tx, env, booking.eventTypeId);
  if (!eventType.reassignmentEnabled) {
    throw new SchedulingError(
      "booking_not_changeable",
      "This event type's bookings stay with their hosts.",
    );
  }
  const started = booking.startAt.getTime() <= now.getTime();
  if (started && booking.status !== "confirmed") throw notChangeable(booking);
  const rows = await bookingHostRows(tx, booking);
  // Before anything else says what's wrong with it: someone else's doesn't exist.
  const { fromHosts } = opts;
  if (fromHosts && !rows.some((row) => fromHosts.has(row.hostId))) {
    throw new SchedulingError("not_found", `No booking "${booking.id}" in this environment.`);
  }
  const { candidates, routingKnown } = await candidatesFor(tx, env, booking, eventType, deps);
  const memberIds = new Set(
    [...candidates.members, ...candidates.required].map((entry) => entry.host.id),
  );
  const anyHost = input.overrides?.includes("any_host") ?? false;
  const durationMinutes = (booking.endAt.getTime() - booking.startAt.getTime()) / MINUTE_MS;
  const plan: ClaimPlan = {
    eventType,
    rule: {
      ...slotRuleOf(eventType, durationMinutes),
      bufferBeforeMinutes: booking.bufferBeforeMinutes,
      bufferAfterMinutes: booking.bufferAfterMinutes,
    },
    scope: env,
    startMs: booking.startAt.getTime(),
    nowMs: now.getTime(),
    failureMode: await calendarFailureModeOf(tx, env),
    ttlSeconds: null,
    skip: skipsOfOverrides(input.overrides),
    coverage: coverageWindows(candidates),
  };
  const schedules = schedulesOf(candidates);
  const taken = new Set(rows.map((row) => row.hostId));
  const leaving = new Set<string>();
  for (const change of input.changes) {
    const from = sourceOf(
      rows,
      change.from_host ? await refId(tx, env, change.from_host) : undefined,
    );
    if (leaving.has(from.hostId)) throw invalid("Each change has a different `from_host`.");
    if (opts.fromHosts && !opts.fromHosts.has(from.hostId)) {
      throw new SchedulingError("not_found", `No booking "${booking.id}" in this environment.`);
    }
    leaving.add(from.hostId);
  }
  await holdSources(tx, env, [...leaving]);

  const swaps: Swap[] = [];
  let liveUntil: Date | null = null;
  for (const change of input.changes) {
    const from = sourceOf(
      rows,
      change.from_host ? await refId(tx, env, change.from_host) : undefined,
    );
    const ttl = started ? null : await remainingTtl(tx, booking, from.hostId);
    let choices: HostRow[];
    if (change.to_host) {
      const named = await hostRowOf(tx, env, change.to_host);
      if (opts.toHosts && !opts.toHosts.has(named.id))
        throw invalid("They can't take it from here.");
      if (taken.has(named.id)) {
        throw invalid("That host is already on this booking.");
      }
      if (!memberIds.has(named.id) && !anyHost) {
        throw invalid("That host can't take this event type. Pass `any_host` in `overrides`.");
      }
      choices = [named];
    } else {
      // Guessing that nothing narrowed a pool's booking could send someone to the wrong specialist.
      if (!routingKnown && eventType.kind === "pool") {
        throw invalid(
          "This booking doesn't say what it was routed with, so name a host in `to_host`.",
        );
      }
      const preferred = await hostsInOrder(tx, env, change.preferred_hosts ?? []);
      const ranking = opts.onlyPreferred
        ? []
        : ranked({ required: [], members: candidates.members }, `${booking.id}:${booking.version}`);
      const seen = new Set<string>();
      choices = [...preferred, ...ranking].filter((host) => {
        // Preferring someone doesn't make them fit how this was routed: `any_host` says that.
        if (!memberIds.has(host.id) && !anyHost) return false;
        if (opts.toHosts && !opts.toHosts.has(host.id)) return false;
        if (seen.has(host.id) || taken.has(host.id)) return false;
        seen.add(host.id);
        return true;
      });
      if (choices.length === 0) throw new SchedulingError("no_reassign_candidate", NOBODY);
    }
    let won: HostRow | null = null;
    let lastReason = "no_hosts";
    for (const choice of choices) {
      try {
        const claimed = started
          ? null
          : await inSavepoint(tx, (savepoint) =>
              claimTarget(savepoint, plan, choice, schedules, { bookingId: booking.id }, ttl),
            );
        if (started) await lockHostsAndMemberships(tx, eventType, [choice.id]);
        if (claimed && (!liveUntil || claimed < liveUntil)) liveUntil = claimed;
        won = choice;
        break;
      } catch (error) {
        if (!(error instanceof LostSlot)) throw error;
        lastReason = error.reason;
      }
    }
    if (!won) {
      throw change.auto
        ? new SchedulingError("no_reassign_candidate", NOBODY)
        : refusedByHost(lastReason);
    }
    taken.add(won.id);
    swaps.push({ from, to: won });
  }

  let current = booking;
  const previousHostIds = rows.map((row) => row.hostId).sort();
  // Worked out before anything moves: whose meeting it is depends on the ledger as it stands.
  const leavingIds = new Set(swaps.map((swap) => swap.from.hostId));
  const hostsAfter = await hostsByIds(tx, env, [
    ...rows.map((row) => row.hostId).filter((id) => !leavingIds.has(id)),
    ...swaps.map((swap) => swap.to.id),
  ]);
  let location: BookingRow["location"] = null;
  for (const swap of swaps) {
    const moved = await locationWithoutHost(
      tx,
      location ? { ...current, location } : current,
      swap.from.hostId,
      hostsAfter,
    );
    location = moved ?? location;
  }
  for (const swap of swaps) {
    await releaseHostClaim(tx, {
      bookingId: booking.id,
      organizationId: booking.organizationId,
      hostId: swap.from.hostId,
    });
    await swapHostRow(tx, booking, swap);
  }
  current = await bumped(tx, booking, {
    ...expiryOf(booking, liveUntil),
    externalConflictAt: null,
    ...(location ? { location } : {}),
  });
  await carryReminders(tx, current);
  if (!started && current.status === "confirmed") {
    await setCalendarState(
      tx,
      current,
      swaps.map((swap) => swap.from.hostId),
      "absent",
    );
    const after = await participants(tx, current);
    await setCalendarState(tx, current, after.hostIds, "present");
  }
  if (!started && eventType.kind === "pool") await moveFairness(tx, booking, swaps);
  await recordChange(tx, current, {
    type: "scheduling.booking.reassigned",
    webhook: "scheduling.booking.reassigned",
    actor,
    occurredAt: now,
    details: {
      previous_host_ids: previousHostIds,
      reason_code: input.reason_code,
      ...(input.overrides?.length ? { overrides: input.overrides } : {}),
      ...(opts.reassignmentId ? { reassignment_id: opts.reassignmentId } : {}),
    },
    encryptedNote: encryptedNoteOf(input.note, deps),
    previousHostIds,
    reassignmentId: opts.reassignmentId,
    message: "Booking reassigned",
  });
  if (!started && current.status !== "held") {
    await enqueueReassignment(
      tx,
      current,
      {
        added: opts.quietHosts ? [] : swaps.map((swap) => swap.to.id),
        removed: opts.quietHosts ? [] : swaps.map((swap) => swap.from.hostId),
        attendee: input.notify?.attendee ?? true,
      },
      now,
    );
  }
  await opts.onMoved?.(
    tx,
    swaps.map((swap) => ({ from: swap.from.hostId, to: swap.to.id })),
  );
  return current;
}

const NOBODY = "Nobody else can take this booking at its time.";

/** A from-host given as a uid means the same host as its id does. */
async function refId(tx: Executor, env: Scope, ref: string): Promise<string> {
  return (await hostRowOf(tx, env, ref)).id;
}

async function hostsInOrder(tx: Executor, env: Scope, refs: readonly string[]): Promise<HostRow[]> {
  const found: HostRow[] = [];
  for (const ref of refs) found.push(await hostRowOf(tx, env, ref));
  return found;
}

/**
 * A group session has one host, so a seat's reassignment moves the session and everyone in it. Seats
 * are locked before the session, as cancelling a seat takes them, and read again once locked.
 */
async function reassignSession(
  tx: Transaction,
  env: SchedulingEnvironment,
  sessionId: string,
  askedSeatId: string,
  input: ReassignBookingRequestOutput,
  deps: Keys,
  actor: BookingActor,
  opts: Options,
): Promise<BookingRow> {
  const now = nowOf(deps);
  await tx
    .select({ id: schedulingBooking.id })
    .from(schedulingBooking)
    .where(
      and(
        eq(schedulingBooking.groupSessionId, sessionId),
        eq(schedulingBooking.organizationId, env.organizationId),
      ),
    )
    .orderBy(asc(schedulingBooking.id))
    .for("update");
  const [session] = await tx
    .select()
    .from(schedulingGroupSession)
    .where(
      and(
        eq(schedulingGroupSession.id, sessionId),
        eq(schedulingGroupSession.organizationId, env.organizationId),
      ),
    )
    .for("update");
  if (!session) throw new SchedulingError("not_found", `No booking "${askedSeatId}".`);
  const seats = await tx
    .select()
    .from(schedulingBooking)
    .where(
      and(
        eq(schedulingBooking.groupSessionId, sessionId),
        eq(schedulingBooking.organizationId, env.organizationId),
      ),
    )
    .orderBy(asc(schedulingBooking.id));
  const asked = seats.find((seat) => seat.id === askedSeatId);
  if (!asked) throw new SchedulingError("not_found", `No booking "${askedSeatId}".`);
  checkChangeable(asked);
  if (opts.fromHosts && !opts.fromHosts.has(session.hostId)) {
    throw new SchedulingError("not_found", `No booking "${askedSeatId}".`);
  }
  if (session.startAt.getTime() <= now.getTime()) {
    throw new SchedulingError("booking_not_changeable", "A session that's started keeps its host.");
  }
  const [change] = input.changes;
  if (input.changes.length !== 1 || !change) throw invalid("A session has one host to change.");
  if (change.from_host && (await refId(tx, env, change.from_host)) !== session.hostId) {
    throw invalid("`from_host` isn't this session's host.", "from_host");
  }
  const eventType = await resolveEventType(tx, env, session.eventTypeId);
  if (!eventType.reassignmentEnabled) {
    throw new SchedulingError(
      "booking_not_changeable",
      "This event type's bookings stay with their hosts.",
    );
  }
  const { candidates } = await candidatesFor(tx, env, asked, eventType, deps);
  const memberIds = new Set(
    [...candidates.members, ...candidates.required].map((entry) => entry.host.id),
  );
  const anyHost = input.overrides?.includes("any_host") ?? false;
  let choices: HostRow[];
  if (change.to_host) {
    const named = await hostRowOf(tx, env, change.to_host);
    if (opts.toHosts && !opts.toHosts.has(named.id)) throw invalid("They can't take it from here.");
    if (named.id === session.hostId) throw invalid("That host already runs this session.");
    if (!memberIds.has(named.id) && !anyHost) {
      throw invalid("That host can't take this event type. Pass `any_host` in `overrides`.");
    }
    choices = [named];
  } else {
    const preferred = await hostsInOrder(tx, env, change.preferred_hosts ?? []);
    const others = opts.onlyPreferred
      ? []
      : ranked({ required: [], members: candidates.members }, `${session.id}:${now.getTime()}`);
    const seen = new Set<string>([session.hostId]);
    choices = [...preferred, ...others].filter((host) => {
      if (!memberIds.has(host.id) && !anyHost) return false;
      if (opts.toHosts && !opts.toHosts.has(host.id)) return false;
      if (seen.has(host.id)) return false;
      seen.add(host.id);
      return true;
    });
    if (choices.length === 0) throw new SchedulingError("no_reassign_candidate", NOBODY);
  }
  await holdSources(tx, env, [session.hostId]);
  const remaining = await sessionClaimRemainingSeconds(tx, {
    groupSessionId: session.id,
    organizationId: session.organizationId,
  });
  if (remaining.found && remaining.seconds !== null && remaining.seconds < 1) {
    throw new SchedulingError("hold_expired", "This session's hold has run out.");
  }
  const durationMinutes = (session.endAt.getTime() - session.startAt.getTime()) / MINUTE_MS;
  const plan: ClaimPlan = {
    eventType,
    rule: {
      ...slotRuleOf(eventType, durationMinutes),
      bufferBeforeMinutes: asked.bufferBeforeMinutes,
      bufferAfterMinutes: asked.bufferAfterMinutes,
    },
    scope: env,
    startMs: session.startAt.getTime(),
    nowMs: now.getTime(),
    failureMode: await calendarFailureModeOf(tx, env),
    ttlSeconds: null,
    skip: skipsOfOverrides(input.overrides),
    coverage: coverageWindows(candidates),
  };
  const schedules = schedulesOf(candidates);
  let target: HostRow | null = null;
  let liveUntil: Date | null = null;
  let lastReason = "no_hosts";
  for (const choice of choices) {
    try {
      liveUntil = await inSavepoint(tx, async (savepoint) => {
        await clearDeadSession(savepoint, session, choice.id);
        return claimTarget(
          savepoint,
          plan,
          choice,
          schedules,
          { groupSessionId: session.id },
          remaining.found ? remaining.seconds : null,
        );
      });
      target = choice;
      break;
    } catch (error) {
      if (!(error instanceof LostSlot)) throw error;
      lastReason = error.reason;
    }
  }
  if (!target) {
    throw change.auto
      ? new SchedulingError("no_reassign_candidate", NOBODY)
      : refusedByHost(lastReason);
  }
  const previousHostId = session.hostId;
  const sessionLocation = locationForNewHost(session.location, previousHostId, [target]);
  await releaseHostClaim(tx, {
    groupSessionId: session.id,
    organizationId: session.organizationId,
    hostId: previousHostId,
  });
  await tx
    .update(schedulingGroupSession)
    // The link was made on the old host's account, and goes with their event, as their office does.
    .set({
      hostId: target.id,
      meetingUrl: null,
      ...(sessionLocation ? { location: sessionLocation } : {}),
    })
    .where(
      and(
        eq(schedulingGroupSession.id, session.id),
        eq(schedulingGroupSession.organizationId, session.organizationId),
      ),
    );

  const live = seats.filter((seat) => seat.status !== "cancelled" && seat.status !== "declined");
  let result = asked;
  let hostsTold = opts.quietHosts ?? false;
  const swap: Swap = { from: { hostId: previousHostId, role: "member" }, to: target };
  const encryptedNote = encryptedNoteOf(input.note, deps);
  let calendarMoved = false;
  for (const seat of live) {
    const [row] = await tx
      .select({ role: schedulingBookingHost.role })
      .from(schedulingBookingHost)
      .where(
        and(
          eq(schedulingBookingHost.bookingId, seat.id),
          eq(schedulingBookingHost.organizationId, seat.organizationId),
          eq(schedulingBookingHost.hostId, previousHostId),
        ),
      );
    if (row) await swapHostRow(tx, seat, { ...swap, from: { ...swap.from, role: row.role } });
    const updated = await bumped(tx, seat, {
      ...expiryOf(seat, liveUntil),
      externalConflictAt: null,
    });
    await carryReminders(tx, updated);
    if (!calendarMoved && updated.status === "confirmed") {
      // One event for the session: `setCalendarState` goes by the session, not the seat.
      await setCalendarState(tx, updated, [previousHostId], "absent");
      await setCalendarState(tx, updated, [target.id], "present");
      calendarMoved = true;
    }
    await recordChange(tx, updated, {
      type: "scheduling.booking.reassigned",
      webhook: "scheduling.booking.reassigned",
      actor,
      occurredAt: now,
      details: {
        previous_host_ids: [previousHostId],
        reason_code: input.reason_code,
        ...(input.overrides?.length ? { overrides: input.overrides } : {}),
        ...(opts.reassignmentId ? { reassignment_id: opts.reassignmentId } : {}),
      },
      encryptedNote,
      previousHostIds: [previousHostId],
      reassignmentId: opts.reassignmentId,
      message: "Booking reassigned",
    });
    if (updated.status !== "held") {
      await enqueueReassignment(
        tx,
        updated,
        {
          // The hosts hear once about the session, not per seat.
          added: hostsTold ? [] : [target.id],
          removed: hostsTold ? [] : [previousHostId],
          attendee: input.notify?.attendee ?? true,
        },
        now,
      );
      hostsTold = true;
    }
    if (updated.id === askedSeatId) result = updated;
  }
  await opts.onMoved?.(tx, [{ from: previousHostId, to: target.id }]);
  return result;
}

/**
 * A session row outlives its claim, so a target's old, empty one at this time would stop this one
 * taking its place (`scheduling_group_session_slot_unique`) without really being in the way.
 */
async function clearDeadSession(
  tx: Executor,
  session: typeof schedulingGroupSession.$inferSelect,
  targetId: string,
): Promise<void> {
  const [dead] = await tx
    .select({ id: schedulingGroupSession.id })
    .from(schedulingGroupSession)
    .where(
      and(
        eq(schedulingGroupSession.organizationId, session.organizationId),
        eq(schedulingGroupSession.eventTypeId, session.eventTypeId),
        eq(schedulingGroupSession.hostId, targetId),
        eq(schedulingGroupSession.startAt, session.startAt),
      ),
    )
    .for("update");
  if (!dead) return;
  const [claim] = await tx
    .select({ id: schedulingClaim.id })
    .from(schedulingClaim)
    .where(
      and(
        eq(schedulingClaim.groupSessionId, dead.id),
        eq(schedulingClaim.organizationId, session.organizationId),
        or(
          sql`${schedulingClaim.liveUntil} is null`,
          sql`${schedulingClaim.liveUntil} > clock_timestamp()`,
        ),
      ),
    )
    .limit(1);
  if (claim) throw new LostSlot("already_claimed");
  const [unsettled] = await tx
    .select({ id: schedulingCalendarEvent.id })
    .from(schedulingCalendarEvent)
    .where(
      and(
        eq(schedulingCalendarEvent.groupSessionId, dead.id),
        eq(schedulingCalendarEvent.organizationId, session.organizationId),
        sql`${schedulingCalendarEvent.appliedVersion} < ${schedulingCalendarEvent.desiredVersion}`,
      ),
    )
    .limit(1);
  // Its event's still being removed, and that row can't go first. Trying again shortly works.
  if (unsettled) throw new LostSlot("already_claimed");
  await tx
    .delete(schedulingGroupSession)
    .where(
      and(
        eq(schedulingGroupSession.id, dead.id),
        eq(schedulingGroupSession.organizationId, session.organizationId),
      ),
    );
}

export type ReassignCandidate = {
  object: "scheduling.reassign_candidate";
  host: string;
  uid: string | null;
  name: string;
  /** Takes this event type, and fits what the booking was routed with. Otherwise `any_host`. */
  member: boolean;
  available: boolean;
  /** Why not. Each has an override of the same name, except `already_claimed`. */
  reason: NotBookableReason | "host_unavailable" | null;
  /** Their live bookings in the week from this one. */
  load: number;
  /** Their place in who a pool would pick next, from 1. Null when they aren't a member. */
  rank: number | null;
  /** Taking this over would leave it with no meeting: they haven't connected the provider. */
  meeting_provider_missing: boolean;
};

const MAX_CANDIDATES = 200;
const LOAD_WINDOW_MS = 7 * 24 * 60 * MINUTE_MS;

const PROVIDER_OF: Record<string, string> = {
  zoom: "zoom",
  google_meet: "google",
  microsoft_teams: "microsoft",
};

/**
 * Who a booking could go to, and whether they're free. Reads only: anything here can change before
 * asking, and `reassignBooking` decides again under its locks.
 */
export async function listReassignCandidates(
  env: Scope,
  id: string,
  query: { fromHost?: string | undefined; hostIds?: readonly string[] | undefined },
  deps: Pick<SchedulingDeps, "dataKeys" | "now">,
): Promise<{ data: ReassignCandidate[]; hasMore: boolean }> {
  const now = nowOf(deps);
  const [booking] = await db
    .select()
    .from(schedulingBooking)
    .where(
      and(
        eq(schedulingBooking.id, id),
        eq(schedulingBooking.organizationId, env.organizationId),
        eq(schedulingBooking.environmentId, env.environmentId),
      ),
    );
  if (!booking) throw new SchedulingError("not_found", `No booking "${id}" in this environment.`);
  const eventType = await resolveEventType(db, env, booking.eventTypeId);
  const rows = await bookingHostRows(db, booking);
  const current = new Set(rows.map((row) => row.hostId));
  const { candidates } = await candidatesFor(db, env, booking, eventType, deps);
  const active = await db
    .select()
    .from(schedulingHost)
    .where(
      and(
        eq(schedulingHost.organizationId, env.organizationId),
        eq(schedulingHost.environmentId, env.environmentId),
        eq(schedulingHost.status, "active"),
        query.hostIds ? inArray(schedulingHost.id, [...query.hostIds]) : undefined,
      ),
    );
  const members = new Set(
    [...candidates.members, ...candidates.required].map((entry) => entry.host.id),
  );
  const order = new Map(
    ranked({ required: [], members: candidates.members }, `${booking.id}:${booking.version}`).map(
      (host, index) => [host.id, index + 1],
    ),
  );
  const others = active
    .filter((host) => !current.has(host.id))
    .sort((a, b) => {
      const byMember = Number(members.has(b.id)) - Number(members.has(a.id));
      if (byMember !== 0) return byMember;
      return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0) || a.name.localeCompare(b.name);
    });
  const chosen = others.slice(0, MAX_CANDIDATES);
  const coverage = coverageWindows(candidates);
  const schedules = schedulesOf(candidates);
  const startMs = booking.startAt.getTime();
  const durationMinutes = (booking.endAt.getTime() - startMs) / MINUTE_MS;
  const rule = {
    ...slotRuleOf(eventType, durationMinutes),
    bufferBeforeMinutes: booking.bufferBeforeMinutes,
    bufferAfterMinutes: booking.bufferAfterMinutes,
  };
  const loaded = await loadHostInputs(db, {
    scope: env,
    hosts: chosen.map((host) => ({
      id: host.id,
      timeZone: host.timeZone,
      scheduleId: schedules.get(host.id) ?? null,
      onlyWithin: coverage.get(host.id),
    })),
    eventTypeId: eventType.id,
    fromMs: startMs,
    toMs: startMs + durationMinutes * MINUTE_MS,
    nowMs: now.getTime(),
    calendarFailureMode: await calendarFailureModeOf(db, env),
  });
  const loads = await db
    .select({ hostId: schedulingClaim.hostId, count: sql<number>`count(*)::int` })
    .from(schedulingClaim)
    .where(
      and(
        eq(schedulingClaim.organizationId, env.organizationId),
        inArray(
          schedulingClaim.hostId,
          chosen.map((host) => host.id),
        ),
        gte(schedulingClaim.occupiedStart, booking.startAt),
        lt(schedulingClaim.occupiedStart, new Date(startMs + LOAD_WINDOW_MS)),
        or(
          sql`${schedulingClaim.liveUntil} is null`,
          sql`${schedulingClaim.liveUntil} > clock_timestamp()`,
        ),
      ),
    )
    .groupBy(schedulingClaim.hostId);
  const loadOf = new Map(loads.map((row) => [row.hostId, row.count]));
  const needed = await providerNeeded(db, booking, query.fromHost ?? null, rows);
  const connected = needed ? await hostsWithProvider(db, env, needed, chosen) : null;
  const started = startMs <= now.getTime();
  const data = chosen.map((host): ReassignCandidate => {
    const inputs = loaded.get(host.id);
    const verdict = inputs
      ? isBookable(startMs, {
          nowMs: now.getTime(),
          rule,
          host: inputs,
          skip: ALREADY_DECIDED,
        })
      : null;
    const available = started || verdict?.ok === true;
    return {
      object: "scheduling.reassign_candidate",
      host: host.id,
      uid: host.uid,
      name: host.name,
      member: members.has(host.id),
      available,
      reason: available ? null : verdict && !verdict.ok ? verdict.reason : "host_unavailable",
      load: loadOf.get(host.id) ?? 0,
      rank: order.get(host.id) ?? null,
      meeting_provider_missing: connected ? !connected.has(host.id) : false,
    };
  });
  return { data, hasMore: others.length > chosen.length };
}

/** The provider a new host would need, if leaving takes the meeting with them. */
async function providerNeeded(
  tx: Executor,
  booking: BookingRow,
  fromHost: string | null,
  rows: readonly { hostId: string; role: HostRole }[],
): Promise<string | null> {
  const location = booking.location;
  const leaving = fromHost ?? sourceOrNull(rows);
  if (!leaving) return null;
  const reset = await locationWithoutHost(tx, booking, leaving, []);
  const type = reset?.type ?? location?.type;
  // A reset of anything else, or one that stands, isn't this host's to make.
  if (!reset || !type) return null;
  return PROVIDER_OF[type] ?? null;
}

function sourceOrNull(rows: readonly { hostId: string; role: HostRole }[]): string | null {
  try {
    return sourceOf(rows, undefined).hostId;
  } catch {
    return null;
  }
}

async function hostsWithProvider(
  tx: Executor,
  env: Scope,
  provider: string,
  hosts: readonly HostRow[],
): Promise<Set<string>> {
  if (hosts.length === 0) return new Set();
  const rows = await tx
    .select({ hostId: schedulingCalendar.hostId })
    .from(schedulingCalendar)
    .innerJoin(
      schedulingCalendarConnection,
      eq(schedulingCalendarConnection.id, schedulingCalendar.connectionId),
    )
    .where(
      and(
        eq(schedulingCalendar.organizationId, env.organizationId),
        inArray(
          schedulingCalendar.hostId,
          hosts.map((host) => host.id),
        ),
        sql`${schedulingCalendarConnection.provider}::text in (${provider}, 'simulated')`,
      ),
    );
  return new Set(rows.map((row) => row.hostId));
}
