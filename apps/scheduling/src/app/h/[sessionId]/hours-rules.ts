export type ScheduleRule = { days: number[]; start: string; end: string };
export type HoursRange = { start: string; end: string };
export type DayHours = { enabled: boolean; ranges: HoursRange[] };

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const DEFAULT_RANGE: HoursRange = { start: "09:00", end: "17:00" };
// A time input can't show the API's 24:00, the end of the day.
const END_OF_DAY_INPUT = "23:59";

export function hoursFromRules(rules: ScheduleRule[]): DayHours[] {
  return WEEKDAYS.map((_, day) => {
    const ranges = rules
      .filter((rule) => rule.days.includes(day))
      .map((rule) => ({
        start: rule.start,
        end: rule.end === "24:00" ? END_OF_DAY_INPUT : rule.end,
      }))
      .sort((a, b) => a.start.localeCompare(b.start));
    return ranges.length > 0
      ? { enabled: true, ranges }
      : { enabled: false, ranges: [{ ...DEFAULT_RANGE }] };
  });
}

export function rulesFromHours(hours: DayHours[]): ScheduleRule[] {
  return hours.flatMap((day, index) =>
    day.enabled
      ? day.ranges.map((range) => ({
          days: [index],
          start: range.start,
          end: range.end === END_OF_DAY_INPUT ? "24:00" : range.end,
        }))
      : [],
  );
}

/** Says what's wrong in a day's words, before the API has to. */
export function hoursProblem(hours: DayHours[]): string | null {
  for (const [index, day] of hours.entries()) {
    if (!day.enabled) continue;
    const name = WEEKDAYS[index];
    const sorted = [...day.ranges].sort((a, b) => a.start.localeCompare(b.start));
    for (const [at, range] of sorted.entries()) {
      if (range.end <= range.start) return `${name}: a range has to end after it starts.`;
      const next = sorted[at + 1];
      if (next && next.start < range.end) return `${name}: two ranges overlap.`;
    }
  }
  return null;
}
