// Pure (no React Native imports) so `bun test` can load it.

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** A local calendar day, as a key: `2026-11-05`. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Monday of a date's week, at midnight. */
export function startOfWeek(date: Date): Date {
  const weekday = (date.getDay() + 6) % 7;
  return addDays(date, -weekday);
}

export function formatTime(iso: string | Date, timeZone?: string): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
}

/** `Today`, `Tomorrow`, `Yesterday`, else `Thu 5 Nov`. */
export function formatDayHeading(date: Date, now: Date): string {
  const days = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY_MS);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return formatShortDay(date);
}

export function formatShortDay(date: Date): string {
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
}

export function minutesBetween(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / MINUTE_MS);
}

/** `in 3 h`, `in 40 min`, `in 2 days`; `null` once it has passed. */
export function formatUntil(iso: string, now: Date): string | null {
  const minutes = Math.ceil((Date.parse(iso) - now.getTime()) / MINUTE_MS);
  if (minutes <= 0) return null;
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `in ${hours} h`;
  return `in ${Math.round(hours / 24)} days`;
}

export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Bookings grouped by local day, in the order they came. */
export function groupByDay<T extends { start: string }>(
  items: T[],
): { key: string; date: Date; items: T[] }[] {
  const days: { key: string; date: Date; items: T[] }[] = [];
  for (const item of items) {
    const date = new Date(item.start);
    const key = dayKey(date);
    const last = days.at(-1);
    if (last?.key === key) last.items.push(item);
    else days.push({ key, date, items: [item] });
  }
  return days;
}

/** Where the "now" line goes in a day of bookings sorted by start: before this index. */
export function nowLineIndex<T extends { start: string }>(items: T[], now: Date): number {
  const index = items.findIndex((item) => Date.parse(item.start) > now.getTime());
  return index === -1 ? items.length : index;
}

export type WeekSpan = { start: number; end: number };

/** A schedule's rules as spans of minutes per weekday: Monday first, sorted, merged. */
export function weeklySpans(rules: { days: number[]; start: string; end: string }[]): WeekSpan[][] {
  const minutes = (time: string) => {
    const [hours = "0", mins = "0"] = time.split(":");
    return Number(hours) * 60 + Number(mins);
  };
  const week: WeekSpan[][] = [[], [], [], [], [], [], []];
  for (const rule of rules) {
    for (const day of rule.days) {
      week[(day + 6) % 7]?.push({ start: minutes(rule.start), end: minutes(rule.end) });
    }
  }
  return week.map((spans) => {
    const sorted = [...spans].sort((a, b) => a.start - b.start);
    const merged: WeekSpan[] = [];
    for (const span of sorted) {
      const last = merged.at(-1);
      if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
      else merged.push({ ...span });
    }
    return merged;
  });
}

/** The current minute of the day and Monday-first weekday in a time zone. */
export function zonedNow(now: Date, timeZone: string): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(value("weekday"));
  return {
    weekday: Math.max(0, weekday),
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
  };
}
