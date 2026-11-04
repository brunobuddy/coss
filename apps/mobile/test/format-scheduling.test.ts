import { describe, expect, test } from "bun:test";
import {
  dayKey,
  formatDayHeading,
  formatDuration,
  formatUntil,
  groupByDay,
  minutesBetween,
  nowLineIndex,
  startOfWeek,
  weeklySpans,
  zonedNow,
} from "../src/lib/format-scheduling";

const local = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute);

describe("days", () => {
  test("headings say today and its neighbours, across a month end", () => {
    const now = local(2026, 10, 31);
    expect(formatDayHeading(local(2026, 10, 31, 23, 59), now)).toBe("Today");
    expect(formatDayHeading(local(2026, 11, 1, 0, 1), now)).toBe("Tomorrow");
    expect(formatDayHeading(local(2026, 10, 30), now)).toBe("Yesterday");
    expect(formatDayHeading(local(2026, 11, 5), now)).toBe("Thu 5 Nov");
  });

  test("the week starts on Monday", () => {
    expect(dayKey(startOfWeek(local(2026, 11, 8)))).toBe("2026-11-02");
    expect(dayKey(startOfWeek(local(2026, 11, 2)))).toBe("2026-11-02");
  });

  test("groups keep their order and split at local midnight", () => {
    const items = [
      local(2026, 11, 3, 23, 30),
      local(2026, 11, 4, 0, 30),
      local(2026, 11, 4, 9),
    ].map((date) => ({ start: date.toISOString() }));
    expect(groupByDay(items).map((day) => [day.key, day.items.length])).toEqual([
      ["2026-11-03", 1],
      ["2026-11-04", 2],
    ]);
  });
});

describe("the now line", () => {
  const day = [local(2026, 11, 3, 9), local(2026, 11, 3, 14)].map((date) => ({
    start: date.toISOString(),
  }));

  test("falls before the first booking that hasn't started", () => {
    expect(nowLineIndex(day, local(2026, 11, 3, 8))).toBe(0);
    expect(nowLineIndex(day, local(2026, 11, 3, 10))).toBe(1);
    expect(nowLineIndex(day, local(2026, 11, 3, 15))).toBe(2);
  });
});

describe("durations", () => {
  test("read in minutes, then hours", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(90)).toBe("1 h 30");
    expect(minutesBetween("2031-01-06T09:00:00Z", "2031-01-06T09:45:00Z")).toBe(45);
  });

  test("until counts up to days and stops once it has passed", () => {
    const now = new Date("2031-01-06T09:00:00Z");
    expect(formatUntil("2031-01-06T09:40:00Z", now)).toBe("in 40 min");
    expect(formatUntil("2031-01-06T12:00:00Z", now)).toBe("in 3 h");
    expect(formatUntil("2031-01-09T09:00:00Z", now)).toBe("in 3 days");
    expect(formatUntil("2031-01-06T09:00:00Z", now)).toBeNull();
  });
});

describe("working hours", () => {
  test("Sunday is day 0 in a rule and last in the week", () => {
    const week = weeklySpans([{ days: [0, 1], start: "09:00", end: "17:00" }]);
    expect(week[0]).toEqual([{ start: 540, end: 1020 }]);
    expect(week[6]).toEqual([{ start: 540, end: 1020 }]);
    expect(week[1]).toEqual([]);
  });

  test("overlapping rules merge and sort", () => {
    const week = weeklySpans([
      { days: [1], start: "13:00", end: "17:00" },
      { days: [1], start: "09:00", end: "14:00" },
      { days: [1], start: "18:00", end: "19:00" },
    ]);
    expect(week[0]).toEqual([
      { start: 540, end: 1020 },
      { start: 1080, end: 1140 },
    ]);
  });

  test("now is read in the host's zone, even when it's already tomorrow there", () => {
    const now = new Date("2026-11-03T23:30:00Z");
    expect(zonedNow(now, "UTC")).toEqual({ weekday: 1, minutes: 23 * 60 + 30 });
    expect(zonedNow(now, "Asia/Kolkata")).toEqual({ weekday: 2, minutes: 5 * 60 });
  });
});
