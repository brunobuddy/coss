import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { buildAvailability } from "../src/engine/availability.ts";
import { type Interval, normalizeIntervals, overlapsAny } from "../src/engine/intervals.ts";
import {
  type HostInputs,
  isBookable,
  isOnGrid,
  limitUsageKey,
  listSlots,
  nextGridInstant,
  occupiedRange,
  type SlotRule,
} from "../src/engine/slots.ts";
import { MINUTE_MS } from "../src/engine/time.ts";

const ms = Date.parse;
const ZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/New_York",
  "Asia/Kolkata",
  "Australia/Lord_Howe",
  "America/Vancouver",
  "Africa/Casablanca",
  "Asia/Kathmandu",
  "America/Santiago",
  "Europe/London",
];

const rule = (overrides: Partial<SlotRule> = {}): SlotRule => ({
  durationMinutes: 30,
  stepMinutes: 30,
  gridTimeZone: null,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  minNoticeMinutes: 0,
  bookingWindow: null,
  limits: [],
  ...overrides,
});

const host = (overrides: Partial<HostInputs> = {}): HostInputs => ({
  timeZone: "UTC",
  availability: [{ startMs: ms("2027-01-04T09:00:00Z"), endMs: ms("2027-01-04T12:00:00Z") }],
  externalBusy: [],
  claims: [],
  limitUsage: {},
  calendarVerified: true,
  ...overrides,
});

const NOW = ms("2027-01-01T00:00:00Z");
const iso = (slots: number[]) => slots.map((s) => new Date(s).toISOString().slice(11, 16));
const list = (r: SlotRule, h: HostInputs) =>
  listSlots({
    nowMs: NOW,
    rule: r,
    host: h,
    fromMs: ms("2027-01-04T00:00:00Z"),
    toMs: ms("2027-01-05T00:00:00Z"),
  });

describe("listSlots", () => {
  test("lists starts whose whole duration is available", () => {
    expect(iso(list(rule({ durationMinutes: 60 }), host()))).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
    ]);
  });

  test("buffers keep busy time out of the envelope, not the availability", () => {
    const busy = [{ startMs: ms("2027-01-04T10:00:00Z"), endMs: ms("2027-01-04T10:30:00Z") }];
    expect(iso(list(rule({ bufferAfterMinutes: 15 }), host({ externalBusy: busy })))).toEqual([
      "09:00",
      "10:30",
      "11:00",
      "11:30",
    ]);
    expect(iso(list(rule({ bufferBeforeMinutes: 15 }), host({ externalBusy: busy })))).toEqual([
      "09:00",
      "09:30",
      "11:00",
      "11:30",
    ]);
  });

  test("two neighbours' buffers add up", () => {
    const first = occupiedRange(ms("2027-01-04T09:00:00Z"), rule({ bufferAfterMinutes: 15 }));
    const later = rule({ bufferBeforeMinutes: 15 });
    const h = host({ claims: [first] });
    // A claim ends 09:45; a neighbour with a 15-minute buffer before can start at 10:00, not 09:30.
    expect(isBookable(ms("2027-01-04T09:30:00Z"), { nowMs: NOW, rule: later, host: h }).ok).toBe(
      false,
    );
    expect(isBookable(ms("2027-01-04T10:00:00Z"), { nowMs: NOW, rule: later, host: h }).ok).toBe(
      true,
    );
  });

  test("a stale calendar hides the host", () => {
    expect(list(rule(), host({ calendarVerified: false }))).toEqual([]);
    expect(
      isBookable(ms("2027-01-04T09:00:00Z"), {
        nowMs: NOW,
        rule: rule(),
        host: host({ calendarVerified: false }),
      }),
    ).toEqual({ ok: false, reason: "calendar_unverified" });
  });

  test("minimum notice and the booking window", () => {
    const now = ms("2027-01-04T09:40:00Z");
    expect(
      iso(
        listSlots({
          nowMs: now,
          rule: rule({ minNoticeMinutes: 60 }),
          host: host(),
          fromMs: ms("2027-01-04T00:00:00Z"),
          toMs: ms("2027-01-05T00:00:00Z"),
        }),
      ),
    ).toEqual(["11:00", "11:30"]);
    const window = rule({ bookingWindow: { kind: "range", from: "2027-01-05", to: "2027-01-06" } });
    expect(list(window, host())).toEqual([]);
    const rolling = rule({ bookingWindow: { kind: "rolling", days: 1 } });
    expect(list(rolling, host())).toEqual([]);
  });

  test("limits count in the host's local day", () => {
    const limit = { period: "day", max: 1, scope: "host" } as const;
    const h = host({
      timeZone: "America/Los_Angeles",
      availability: [{ startMs: ms("2027-01-05T01:00:00Z"), endMs: ms("2027-01-05T02:00:00Z") }],
    });
    const key = limitUsageKey(limit, h.timeZone, ms("2027-01-05T01:00:00Z"));
    expect(key).toBe("host:day:2027-01-04");
    const r = rule({ limits: [limit], stepMinutes: 15 });
    const start = ms("2027-01-05T01:00:00Z");
    expect(isBookable(start, { nowMs: NOW, rule: r, host: h }).ok).toBe(true);
    expect(
      isBookable(start, { nowMs: NOW, rule: r, host: { ...h, limitUsage: { [key]: 1 } } }),
    ).toEqual({ ok: false, reason: "limit_reached" });
  });

  test("a grid in another zone", () => {
    // 15-minute offsets: a 30-minute grid in Kathmandu lands on :15 and :45 UTC.
    const h = host({
      availability: [{ startMs: ms("2027-01-04T09:00:00Z"), endMs: ms("2027-01-04T10:00:00Z") }],
    });
    expect(iso(list(rule({ gridTimeZone: "Asia/Kathmandu" }), h))).toEqual(["09:15"]);
  });

  test("the repeated hour offers both occurrences", () => {
    const h = host({
      timeZone: "America/Los_Angeles",
      availability: buildAvailability({
        timeZone: "America/Los_Angeles",
        rules: [{ days: [0], startMinute: 0, endMinute: 240 }],
        overrides: [],
        fromMs: ms("2026-11-01T07:00:00Z"),
        toMs: ms("2026-11-02T08:00:00Z"),
      }),
    });
    const slots = listSlots({
      nowMs: NOW - 86400000 * 365,
      rule: rule(),
      host: h,
      fromMs: ms("2026-11-01T07:00:00Z"),
      toMs: ms("2026-11-02T08:00:00Z"),
    });
    expect(slots).toContain(ms("2026-11-01T08:30:00Z"));
    expect(slots).toContain(ms("2026-11-01T09:30:00Z"));
    expect(slots.length).toBe(10);
  });

  test("a booked occurrence of a repeated hour leaves the other", () => {
    const first = { startMs: ms("2026-11-01T08:30:00Z"), endMs: ms("2026-11-01T09:00:00Z") };
    expect(overlapsAny([first], ms("2026-11-01T09:30:00Z"), ms("2026-11-01T10:00:00Z"))).toBe(
      false,
    );
  });
});

const arbitraryIntervals = (baseMs: number) =>
  fc
    .array(fc.tuple(fc.integer({ min: 0, max: 14 * 24 * 60 }), fc.integer({ min: 5, max: 600 })), {
      maxLength: 25,
    })
    .map((items) =>
      normalizeIntervals(
        items.map(
          ([start, length]): Interval => ({
            startMs: baseMs + start * MINUTE_MS,
            endMs: baseMs + (start + length) * MINUTE_MS,
          }),
        ),
      ),
    );

const arbitraryScenario = fc.record({
  timeZone: fc.constantFrom(...ZONES),
  gridZone: fc.option(fc.constantFrom(...ZONES)),
  base: fc.constantFrom(
    ms("2026-10-20T00:00:00Z"),
    ms("2027-03-06T00:00:00Z"),
    ms("2027-01-01T00:00:00Z"),
    ms("2026-09-01T00:00:00Z"),
  ),
  startMinute: fc.constantFrom(0, 30, 60, 120, 540),
  endMinute: fc.constantFrom(600, 1020, 1440),
  days: fc.uniqueArray(fc.integer({ min: 0, max: 6 }), { minLength: 1, maxLength: 7 }),
  duration: fc.constantFrom(15, 20, 30, 45, 60),
  step: fc.constantFrom(5, 10, 15, 30, 60),
  before: fc.constantFrom(0, 5, 15),
  after: fc.constantFrom(0, 10, 30),
  busySeed: fc.integer(),
});

type Scenario = typeof arbitraryScenario extends fc.Arbitrary<infer T> ? T : never;

function scenarioInputs(s: Scenario, busy: Interval[], claims: Interval[]) {
  const toMs = s.base + 14 * 24 * 60 * MINUTE_MS;
  const availability = buildAvailability({
    timeZone: s.timeZone,
    rules: [{ days: s.days, startMinute: s.startMinute, endMinute: s.endMinute }],
    overrides: [],
    fromMs: s.base,
    toMs: toMs + 2 * 24 * 60 * MINUTE_MS,
  });
  const r = rule({
    durationMinutes: s.duration,
    stepMinutes: s.step,
    gridTimeZone: s.gridZone,
    bufferBeforeMinutes: s.before,
    bufferAfterMinutes: s.after,
  });
  const h = host({ timeZone: s.timeZone, availability, externalBusy: busy, claims });
  return { r, h, toMs };
}

describe("properties", () => {
  test("nextGridInstant never skips an on-grid minute, in any zone", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ZONES),
        fc.constantFrom(5, 15, 30, 60),
        fc.constantFrom(
          ms("2026-11-01T00:00:00Z"),
          ms("2027-03-14T00:00:00Z"),
          ms("2027-04-04T00:00:00Z"),
          ms("2026-09-06T00:00:00Z"),
          ms("2027-10-03T00:00:00Z"),
        ),
        (zone, step, base) => {
          let cursor = base;
          for (let minute = 0; minute < 48 * 60; minute += 1) {
            const at = base + minute * MINUTE_MS;
            if (at < cursor) continue;
            const next = nextGridInstant(at, step, zone);
            expect(next).toBeGreaterThanOrEqual(at);
            expect(isOnGrid(next, step, zone)).toBe(true);
            for (let between = at; between < next; between += MINUTE_MS) {
              expect(isOnGrid(between, step, zone)).toBe(false);
            }
            cursor = next + 1;
          }
        },
      ),
      { numRuns: 25 },
    );
  });

  test("listed slots are exactly the instants isBookable accepts", () => {
    fc.assert(
      fc.property(arbitraryScenario, arbitraryIntervals(ms("2027-01-01T00:00:00Z")), (s, extra) => {
        const shift = s.base - ms("2027-01-01T00:00:00Z");
        const busy = extra.map((i) => ({ startMs: i.startMs + shift, endMs: i.endMs + shift }));
        const { r, h, toMs } = scenarioInputs(s, busy, []);
        const fromMs = s.base;
        const slots = new Set(listSlots({ nowMs: s.base, rule: r, host: h, fromMs, toMs }));
        for (let at = fromMs; at < toMs; at += 5 * MINUTE_MS) {
          expect(slots.has(at)).toBe(isBookable(at, { nowMs: s.base, rule: r, host: h }).ok);
        }
      }),
      { numRuns: 40 },
    );
  });

  test("window independence: a narrower window lists the same slots", () => {
    fc.assert(
      fc.property(
        arbitraryScenario,
        fc.integer({ min: 0, max: 13 * 24 * 60 }),
        fc.integer({ min: 60, max: 3 * 24 * 60 }),
        (s, offset, width) => {
          const { r, h, toMs } = scenarioInputs(s, [], []);
          const wide = listSlots({ nowMs: s.base, rule: r, host: h, fromMs: s.base, toMs });
          const fromMs = s.base + offset * MINUTE_MS;
          const narrowTo = Math.min(toMs, fromMs + width * MINUTE_MS);
          const narrow = listSlots({ nowMs: s.base, rule: r, host: h, fromMs, toMs: narrowTo });
          expect(narrow).toEqual(wide.filter((slot) => slot >= fromMs && slot < narrowTo));
        },
      ),
      { numRuns: 80 },
    );
  });

  test("adding busy time only removes slots, and every remaining slot's envelope misses it", () => {
    fc.assert(
      fc.property(arbitraryScenario, arbitraryIntervals(ms("2027-01-01T00:00:00Z")), (s, extra) => {
        const shift = s.base - ms("2027-01-01T00:00:00Z");
        const busy = extra.map((i) => ({ startMs: i.startMs + shift, endMs: i.endMs + shift }));
        const free = scenarioInputs(s, [], []);
        const before = listSlots({
          nowMs: s.base,
          rule: free.r,
          host: free.h,
          fromMs: s.base,
          toMs: free.toMs,
        });
        const after = listSlots({
          nowMs: s.base,
          rule: free.r,
          host: { ...free.h, externalBusy: busy },
          fromMs: s.base,
          toMs: free.toMs,
        });
        const allowed = new Set(before);
        for (const slot of after) {
          expect(allowed.has(slot)).toBe(true);
          const { startMs, endMs } = occupiedRange(slot, free.r);
          expect(overlapsAny(busy, startMs, endMs)).toBe(false);
        }
      }),
      { numRuns: 60 },
    );
  });

  test("slots stay inside the same local hours across DST", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "America/New_York",
          "Europe/London",
          "Australia/Lord_Howe",
          "America/Santiago",
        ),
        (zone) => {
          const fromMs = ms("2026-10-20T00:00:00Z");
          const toMs = ms("2026-11-15T00:00:00Z");
          const availability = buildAvailability({
            timeZone: zone,
            rules: [{ days: [0, 1, 2, 3, 4, 5, 6], startMinute: 540, endMinute: 1020 }],
            overrides: [],
            fromMs,
            toMs: toMs + 86400000,
          });
          const slots = listSlots({
            nowMs: fromMs,
            rule: rule({ stepMinutes: 60, durationMinutes: 60 }),
            host: host({ timeZone: zone, availability }),
            fromMs,
            toMs,
          });
          const format = new Intl.DateTimeFormat("en-GB", {
            timeZone: zone,
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
          });
          const hours = new Set(slots.map((slot) => format.format(slot)));
          expect([...hours].sort()).toEqual([
            "09:00",
            "10:00",
            "11:00",
            "12:00",
            "13:00",
            "14:00",
            "15:00",
            "16:00",
          ]);
        },
      ),
      { numRuns: 4 },
    );
  });
});

test("500 hosts over 14 days stays well within a request", () => {
  const fromMs = ms("2027-01-04T00:00:00Z");
  const toMs = fromMs + 14 * 86400000;
  const hosts = Array.from({ length: 500 }, (_, i) => {
    const timeZone = ZONES[i % ZONES.length] as string;
    return host({
      timeZone,
      availability: buildAvailability({
        timeZone,
        rules: [{ days: [1, 2, 3, 4, 5], startMinute: 480, endMinute: 1080 }],
        overrides: [],
        fromMs,
        toMs: toMs + 86400000,
      }),
      claims: normalizeIntervals(
        Array.from({ length: 30 }, (_, n) => ({
          startMs: fromMs + n * 9 * 3600000,
          endMs: fromMs + n * 9 * 3600000 + 1800000,
        })),
      ),
    });
  });
  const started = performance.now();
  let total = 0;
  for (const h of hosts)
    total += listSlots({ nowMs: fromMs, rule: rule(), host: h, fromMs, toMs }).length;
  const elapsed = performance.now() - started;
  console.log(`500 hosts, 14 days: ${total} slots in ${elapsed.toFixed(0)} ms`);
  expect(total).toBeGreaterThan(50_000);
  expect(elapsed).toBeLessThan(1500);
});
