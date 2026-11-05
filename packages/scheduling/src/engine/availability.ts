import { type Interval, normalizeIntervals } from "./intervals.ts";
import {
  DAY_MS,
  formatLocalDate,
  MINUTE_MS,
  parseLocalDate,
  wallClockMs,
  wallClockToInstant,
} from "./time.ts";

export type WeeklyRule = { days: readonly number[]; startMinute: number; endMinute: number };
export type MinuteRange = { startMinute: number; endMinute: number };
/** `date` is a local date; no ranges means the host is unavailable that day. */
export type DateOverride = { date: string; ranges: readonly MinuteRange[] };

/**
 * When a schedule is available in `[fromMs, toMs)`. An override replaces the weekly rules for its
 * whole local day. Rules live in `timeZone`'s wall clock, so 09:00 stays 09:00 across a DST change.
 */
export function buildAvailability(input: {
  timeZone: string;
  rules: readonly WeeklyRule[];
  overrides: readonly DateOverride[];
  fromMs: number;
  toMs: number;
}): Interval[] {
  const { timeZone, rules, overrides, fromMs, toMs } = input;
  if (toMs <= fromMs) return [];
  const overrideByDay = new Map(overrides.map((override) => [override.date, override.ranges]));
  const firstDay = Math.floor(wallClockMs(timeZone, fromMs) / DAY_MS) * DAY_MS;
  const lastDay = Math.floor(wallClockMs(timeZone, toMs) / DAY_MS) * DAY_MS;
  const ranges: Interval[] = [];

  const add = (day: number, startMinute: number, endMinute: number): void => {
    ranges.push({
      startMs: wallClockToInstant(day + startMinute * MINUTE_MS, timeZone),
      endMs: wallClockToInstant(day + endMinute * MINUTE_MS, timeZone),
    });
  };

  for (let day = firstDay; day <= lastDay; day += DAY_MS) {
    const override = overrideByDay.get(formatLocalDate(day));
    if (override) {
      for (const range of override) add(day, range.startMinute, range.endMinute);
      continue;
    }
    const weekday = new Date(day).getUTCDay();
    for (const rule of rules) {
      if (rule.days.includes(weekday)) add(day, rule.startMinute, rule.endMinute);
    }
  }

  const result: Interval[] = [];
  for (const range of normalizeIntervals(ranges)) {
    const startMs = Math.max(range.startMs, fromMs);
    const endMs = Math.min(range.endMs, toMs);
    if (endMs > startMs) result.push({ startMs, endMs });
  }
  return result;
}

/** The date range overrides need loading for, wide enough for any zone. */
export function overrideDateRange(fromMs: number, toMs: number): { from: string; to: string } {
  return { from: formatLocalDate(fromMs - DAY_MS), to: formatLocalDate(toMs + DAY_MS) };
}

export { parseLocalDate };
