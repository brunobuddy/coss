import { containedIn, type Interval, overlapsAny } from "./intervals.ts";
import { localDateOf, localWeekOf, MINUTE_MS, wallClockMs, zoneOffsetMs } from "./time.ts";

export type BookingWindow =
  | { kind: "rolling"; days: number }
  | { kind: "range"; from: string; to: string };

export type BookingLimit = { period: "day" | "week"; max: number; scope: "event_type" | "host" };

/** The parts of an event type that decide when it can be booked. */
export type SlotRule = {
  durationMinutes: number;
  stepMinutes: number;
  /** Null: the host's own zone. */
  gridTimeZone: string | null;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeMinutes: number;
  bookingWindow: BookingWindow | null;
  limits: readonly BookingLimit[];
};

/** Everything known about one host, already loaded. */
export type HostInputs = {
  timeZone: string;
  /** Normalized (`normalizeIntervals`), as is everything below. */
  availability: readonly Interval[];
  externalBusy: readonly Interval[];
  claims: readonly Interval[];
  /** Live claims per `limitUsageKey`. */
  limitUsage: Readonly<Record<string, number>>;
  /** False when the host's calendars can't be trusted right now, and the environment hides them. */
  calendarVerified: boolean;
  /** Time off. Nothing can be booked in it, joining a session already running included. */
  away?: readonly Interval[];
  /** Group event types: sessions already running, which people can join rather than start. */
  sessions?: readonly GroupSessionState[];
};

export type GroupSessionState = { startMs: number; occupied: Interval; seatsLeft: number };

export type NotBookableReason =
  | "not_on_grid"
  | "too_soon"
  | "outside_booking_window"
  | "out_of_office"
  | "calendar_unverified"
  | "outside_availability"
  | "host_busy"
  | "already_claimed"
  | "limit_reached"
  | "session_full";

/** The time a booking occupies: the same range its claim stores and the constraint compares. */
export function occupiedRange(startMs: number, rule: SlotRule): Interval {
  return {
    startMs: startMs - rule.bufferBeforeMinutes * MINUTE_MS,
    endMs: startMs + (rule.durationMinutes + rule.bufferAfterMinutes) * MINUTE_MS,
  };
}

export function limitUsageKey(
  limit: Pick<BookingLimit, "period" | "scope">,
  timeZone: string,
  startMs: number,
): string {
  const period =
    limit.period === "day" ? localDateOf(timeZone, startMs) : localWeekOf(timeZone, startMs);
  return `${limit.scope}:${limit.period}:${period}`;
}

function gridZone(rule: SlotRule, host: Pick<HostInputs, "timeZone">): string {
  return rule.gridTimeZone ?? host.timeZone;
}

/** Whether an instant is on the grid. Depends on no window, `now` or busy time, by design. */
export function isOnGrid(startMs: number, stepMinutes: number, timeZone: string): boolean {
  return wallClockMs(timeZone, startMs) % (stepMinutes * MINUTE_MS) === 0;
}

/** The first on-grid instant at or after `ms`. */
export function nextGridInstant(ms: number, stepMinutes: number, timeZone: string): number {
  const step = stepMinutes * MINUTE_MS;
  const align = (at: number): number => {
    const offset = zoneOffsetMs(timeZone, at);
    return Math.ceil((at + offset) / step) * step - offset;
  };
  let candidate = align(ms);
  // A transition between `ms` and the candidate changes what's aligned: offsets only move forward
  // in time, so this settles within a step or two.
  for (let attempts = 0; attempts < 4; attempts++) {
    const realigned = align(candidate);
    if (realigned === candidate) break;
    candidate = realigned;
  }
  return candidate;
}

function withinBookingWindow(
  startMs: number,
  nowMs: number,
  window: BookingWindow,
  timeZone: string,
): boolean {
  if (window.kind === "rolling") return startMs < nowMs + window.days * 24 * 60 * MINUTE_MS;
  const date = localDateOf(timeZone, startMs);
  return date >= window.from && date <= window.to;
}

/**
 * The one definition of "can this be booked". Listing and booking both call it, and the database's
 * constraint has the final word on claims. `claims` must already leave out a booking's own when
 * rescheduling.
 */
export function isBookable(
  startMs: number,
  input: { nowMs: number; rule: SlotRule; host: HostInputs },
): { ok: true } | { ok: false; reason: NotBookableReason } {
  const { nowMs, rule, host } = input;
  if (!isOnGrid(startMs, rule.stepMinutes, gridZone(rule, host))) {
    return { ok: false, reason: "not_on_grid" };
  }
  if (startMs < nowMs + rule.minNoticeMinutes * MINUTE_MS) {
    return { ok: false, reason: "too_soon" };
  }
  if (
    rule.bookingWindow &&
    !withinBookingWindow(startMs, nowMs, rule.bookingWindow, host.timeZone)
  ) {
    return { ok: false, reason: "outside_booking_window" };
  }
  const endMs = startMs + rule.durationMinutes * MINUTE_MS;
  // Before the calendar's verdict, so the reason's honest: reconnecting wouldn't make this bookable.
  if (host.away && overlapsAny(host.away, startMs, endMs)) {
    return { ok: false, reason: "out_of_office" };
  }
  if (!host.calendarVerified) return { ok: false, reason: "calendar_unverified" };
  if (!containedIn(host.availability, startMs, endMs)) {
    return { ok: false, reason: "outside_availability" };
  }
  const occupied = occupiedRange(startMs, rule);
  const session = host.sessions?.find((candidate) => candidate.startMs === startMs);
  if (session) {
    // Joining: the host is already committed to this time, so nothing new can conflict with it.
    return session.seatsLeft > 0 ? { ok: true } : { ok: false, reason: "session_full" };
  }
  if (overlapsAny(host.externalBusy, occupied.startMs, occupied.endMs)) {
    return { ok: false, reason: "host_busy" };
  }
  if (overlapsAny(host.claims, occupied.startMs, occupied.endMs)) {
    return { ok: false, reason: "already_claimed" };
  }
  for (const other of host.sessions ?? []) {
    if (other.occupied.startMs < occupied.endMs && occupied.startMs < other.occupied.endMs) {
      return { ok: false, reason: "already_claimed" };
    }
  }
  for (const limit of rule.limits) {
    if ((host.limitUsage[limitUsageKey(limit, host.timeZone, startMs)] ?? 0) >= limit.max) {
      return { ok: false, reason: "limit_reached" };
    }
  }
  return { ok: true };
}

/** Starts in `[fromMs, toMs)` that `isBookable` accepts, in order. */
export function listSlots(input: {
  nowMs: number;
  rule: SlotRule;
  host: HostInputs;
  fromMs: number;
  toMs: number;
  /** Stop after this many. */
  limit?: number;
}): number[] {
  const { nowMs, rule, host, fromMs, toMs, limit } = input;
  const zone = gridZone(rule, host);
  const duration = rule.durationMinutes * MINUTE_MS;
  const slots: number[] = [];
  for (const range of host.availability) {
    if (range.startMs >= toMs) break;
    let start = nextGridInstant(Math.max(range.startMs, fromMs), rule.stepMinutes, zone);
    while (start < toMs && start + duration <= range.endMs) {
      if (isBookable(start, { nowMs, rule, host }).ok) {
        slots.push(start);
        if (limit !== undefined && slots.length >= limit) return slots;
      }
      start = nextGridInstant(start + 1, rule.stepMinutes, zone);
    }
  }
  return slots;
}
