import { DAY_MS, wallClockMs, wallClockToInstant } from "./time.ts";

export type RecurrenceRule = {
  frequency: "weekly" | "monthly";
  interval: number;
  count: number;
};

/**
 * Occurrences of a series, keeping the anchor zone's wall clock: 10:00 stays 10:00 across a DST
 * change, so the instants aren't evenly spaced. A monthly date a month doesn't have (the 31st) is
 * skipped rather than moved, so a series never lands on a day nobody chose.
 */
export function expandRecurrence(input: {
  startMs: number;
  timeZone: string;
  rule: RecurrenceRule;
}): number[] {
  const { startMs, timeZone, rule } = input;
  const wall = wallClockMs(timeZone, startMs);
  const occurrences: number[] = [];
  if (rule.frequency === "weekly") {
    for (let index = 0; index < rule.count; index++) {
      occurrences.push(wallClockToInstant(wall + index * rule.interval * 7 * DAY_MS, timeZone));
    }
    return occurrences;
  }
  const date = new Date(wall);
  const dayOfMonth = date.getUTCDate();
  const timeOfDay = ((wall % DAY_MS) + DAY_MS) % DAY_MS;
  for (let step = 0; occurrences.length < rule.count && step < rule.count * 12; step++) {
    const candidate = Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + step * rule.interval,
      dayOfMonth,
    );
    if (new Date(candidate).getUTCDate() !== dayOfMonth) continue;
    occurrences.push(wallClockToInstant(candidate + timeOfDay, timeZone));
  }
  return occurrences;
}
