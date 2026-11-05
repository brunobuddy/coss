/**
 * Wall clocks and instants on epoch milliseconds. Only Bun services compute slots: runtimes ship
 * different tz data, and two answers for one instant would make listing and booking disagree.
 */

export const MINUTE_MS = 60_000;
export const DAY_MS = 86_400_000;

// Offsets change on a quarter hour, so a bucket's offset holds for all of it.
const OFFSET_BUCKET_MS = 15 * MINUTE_MS;
const MAX_CACHED_BUCKETS = 50_000;

type PublishedTransition = { timeZone: string; effectiveFrom: number; offsetMinutes: number };

// tzdb changes the runtime may not carry yet. An entry stops applying once `Intl` agrees with it.
const PUBLISHED_TRANSITIONS: readonly PublishedTransition[] = [
  { timeZone: "Africa/Casablanca", effectiveFrom: Date.UTC(2026, 8, 20, 1), offsetMinutes: 0 },
  { timeZone: "Africa/El_Aaiun", effectiveFrom: Date.UTC(2026, 8, 20, 1), offsetMinutes: 0 },
  { timeZone: "America/Vancouver", effectiveFrom: Date.UTC(2026, 10, 1, 9), offsetMinutes: -420 },
  { timeZone: "America/Edmonton", effectiveFrom: Date.UTC(2026, 10, 1, 8), offsetMinutes: -360 },
  { timeZone: "America/Inuvik", effectiveFrom: Date.UTC(2026, 10, 1, 8), offsetMinutes: -360 },
  { timeZone: "America/Winnipeg", effectiveFrom: Date.UTC(2026, 10, 1, 7), offsetMinutes: -300 },
  // Cuba skips only this winter's change: the second entry hands back to the usual rules.
  { timeZone: "America/Havana", effectiveFrom: Date.UTC(2026, 10, 1, 5), offsetMinutes: -240 },
  { timeZone: "America/Havana", effectiveFrom: Date.UTC(2027, 10, 7, 5), offsetMinutes: -300 },
];

const formatters = new Map<string, Intl.DateTimeFormat>();
const offsetCache = new Map<string, Map<number, number>>();
const runtimeKnows = new Map<PublishedTransition, boolean>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let found = formatters.get(timeZone);
  if (!found) {
    found = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, found);
  }
  return found;
}

function runtimeOffsetMs(timeZone: string, epochMs: number): number {
  const parts: Record<string, number> = {};
  for (const { type, value } of formatter(timeZone).formatToParts(epochMs)) {
    if (type !== "literal") parts[type] = Number(value);
  }
  const wall = Date.UTC(
    parts.year ?? 0,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
  return wall - Math.floor(epochMs / 1000) * 1000;
}

function unknownTransition(timeZone: string, epochMs: number): PublishedTransition | null {
  let newest: PublishedTransition | null = null;
  for (const transition of PUBLISHED_TRANSITIONS) {
    if (transition.timeZone !== timeZone || epochMs < transition.effectiveFrom) continue;
    if (!newest || transition.effectiveFrom > newest.effectiveFrom) newest = transition;
  }
  if (!newest) return null;
  let known = runtimeKnows.get(newest);
  if (known === undefined) {
    known = runtimeOffsetMs(timeZone, newest.effectiveFrom) === newest.offsetMinutes * MINUTE_MS;
    runtimeKnows.set(newest, known);
  }
  return known ? null : newest;
}

/** Milliseconds east of UTC that `timeZone` observes at `epochMs`. */
export function zoneOffsetMs(timeZone: string, epochMs: number): number {
  let zone = offsetCache.get(timeZone);
  if (!zone) {
    zone = new Map();
    offsetCache.set(timeZone, zone);
  }
  const bucket = Math.floor(epochMs / OFFSET_BUCKET_MS);
  const cached = zone.get(bucket);
  if (cached !== undefined) return cached;
  const start = bucket * OFFSET_BUCKET_MS;
  const transition = unknownTransition(timeZone, start);
  const offset = transition
    ? transition.offsetMinutes * MINUTE_MS
    : runtimeOffsetMs(timeZone, start);
  if (zone.size >= MAX_CACHED_BUCKETS) zone.clear();
  zone.set(bucket, offset);
  return offset;
}

/** The zone's wall clock at `epochMs`, encoded as if it were UTC so offsets are subtraction. */
export function wallClockMs(timeZone: string, epochMs: number): number {
  return epochMs + zoneOffsetMs(timeZone, epochMs);
}

/**
 * The instant of a wall clock reading. An ambiguous one (clocks fall back across it) is its first
 * occurrence; one that doesn't exist (clocks spring forward across it) shifts forward by the gap.
 */
export function wallClockToInstant(wallMs: number, timeZone: string): number {
  const earlier = wallMs - zoneOffsetMs(timeZone, wallMs - DAY_MS);
  const later = wallMs - zoneOffsetMs(timeZone, wallMs + DAY_MS);
  if (earlier === later) return earlier;
  const earlierValid = wallClockMs(timeZone, earlier) === wallMs;
  const laterValid = wallClockMs(timeZone, later) === wallMs;
  if (earlierValid && laterValid) return Math.min(earlier, later);
  if (earlierValid) return earlier;
  if (laterValid) return later;
  return Math.max(earlier, later);
}

/** Whether `timeZone` is an IANA name this runtime can compute with. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** `YYYY-MM-DD` of a wall clock day number or instant encoded as UTC. */
export function formatLocalDate(wallMs: number): string {
  return new Date(Math.floor(wallMs / DAY_MS) * DAY_MS).toISOString().slice(0, 10);
}

/** UTC midnight of `YYYY-MM-DD`, parsed by hand so a local date never passes through a zone. */
export function parseLocalDate(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError(`Invalid local date: ${date}`);
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (formatLocalDate(ms) !== date) throw new RangeError(`Invalid local date: ${date}`);
  return ms;
}

/** The local day an instant falls on in a zone. */
export function localDateOf(timeZone: string, epochMs: number): string {
  return formatLocalDate(wallClockMs(timeZone, epochMs));
}

/** The Monday starting the local week an instant falls in. */
export function localWeekOf(timeZone: string, epochMs: number): string {
  const day = Math.floor(wallClockMs(timeZone, epochMs) / DAY_MS) * DAY_MS;
  const weekday = new Date(day).getUTCDay();
  return formatLocalDate(day - ((weekday + 6) % 7) * DAY_MS);
}
