import { MINUTE_MS } from "./time.ts";

/** One calendar a host's availability reads from. */
export type CalendarFreshness = {
  connectionHealthy: boolean;
  verifiedAtMs: number | null;
  coveredUntilMs: number | null;
  /** Has a push channel, so a longer silence is normal. */
  hasChannel: boolean;
};

const PUSH_FRESHNESS_MS = 7 * 60 * MINUTE_MS;
const POLL_FRESHNESS_MS = 20 * MINUTE_MS;

export type CalendarVerdict =
  | { verified: true }
  | {
      verified: false;
      reason: "calendar_needs_reauth" | "calendar_stale" | "calendar_not_covered";
    };

/**
 * Whether a host's calendars can be trusted for a window. An unreadable calendar never reads as
 * free: a hidden host is visible and fixable, a double-booked patient isn't.
 */
export function calendarVerdict(
  calendars: readonly CalendarFreshness[],
  nowMs: number,
  windowEndMs: number,
): CalendarVerdict {
  for (const calendar of calendars) {
    if (!calendar.connectionHealthy) return { verified: false, reason: "calendar_needs_reauth" };
    const budget = calendar.hasChannel ? PUSH_FRESHNESS_MS : POLL_FRESHNESS_MS;
    if (calendar.verifiedAtMs === null || nowMs - calendar.verifiedAtMs > budget) {
      return { verified: false, reason: "calendar_stale" };
    }
    if (calendar.coveredUntilMs === null || windowEndMs > calendar.coveredUntilMs) {
      return { verified: false, reason: "calendar_not_covered" };
    }
  }
  return { verified: true };
}
