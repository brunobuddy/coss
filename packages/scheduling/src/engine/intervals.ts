/** Half-open `[startMs, endMs)` instants. */
export type Interval = { startMs: number; endMs: number };

/** Sorted, disjoint and with touching intervals joined; empty ones are dropped. */
export function normalizeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals
    .filter((interval) => interval.endMs > interval.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  const result: Interval[] = [];
  for (const interval of sorted) {
    const last = result[result.length - 1];
    if (last && interval.startMs <= last.endMs) {
      if (interval.endMs > last.endMs) last.endMs = interval.endMs;
    } else {
      result.push({ startMs: interval.startMs, endMs: interval.endMs });
    }
  }
  return result;
}

/** The first index whose interval ends after `ms`, in normalized intervals. */
function firstEndingAfter(intervals: readonly Interval[], ms: number): number {
  let low = 0;
  let high = intervals.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((intervals[middle] as Interval).endMs > ms) high = middle;
    else low = middle + 1;
  }
  return low;
}

/** Whether `[startMs, endMs)` overlaps any normalized interval: Postgres's `&&` on `'[)'` ranges. */
export function overlapsAny(
  intervals: readonly Interval[],
  startMs: number,
  endMs: number,
): boolean {
  const candidate = intervals[firstEndingAfter(intervals, startMs)];
  return candidate !== undefined && candidate.startMs < endMs;
}

/** Whether a single normalized interval contains all of `[startMs, endMs)`. */
export function containedIn(
  intervals: readonly Interval[],
  startMs: number,
  endMs: number,
): boolean {
  const candidate = intervals[firstEndingAfter(intervals, startMs)];
  return candidate !== undefined && candidate.startMs <= startMs && candidate.endMs >= endMs;
}

/** `intervals` minus `removed`, both normalized. */
export function subtractIntervals(
  intervals: readonly Interval[],
  removed: readonly Interval[],
): Interval[] {
  const result: Interval[] = [];
  for (const interval of intervals) {
    let cursor = interval.startMs;
    for (const cut of removed) {
      if (cut.startMs >= interval.endMs) break;
      if (cut.endMs <= cursor) continue;
      if (cut.startMs > cursor) result.push({ startMs: cursor, endMs: cut.startMs });
      cursor = Math.max(cursor, cut.endMs);
    }
    if (cursor < interval.endMs) result.push({ startMs: cursor, endMs: interval.endMs });
  }
  return result;
}
