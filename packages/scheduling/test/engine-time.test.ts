import { describe, expect, test } from "bun:test";
import { buildAvailability } from "../src/engine/availability.ts";
import {
  localDateOf,
  localWeekOf,
  parseLocalDate,
  wallClockMs,
  wallClockToInstant,
} from "../src/engine/time.ts";

const ms = Date.parse;
const every = [0, 1, 2, 3, 4, 5, 6];

// Cal.com's date-ranges.wall-clock.cases.ts, with 23:59 written as 1440.
const WALL_CLOCK_CASES: [
  string,
  string,
  string,
  string,
  string,
  number,
  number,
  [string, string],
][] = [
  [
    "ordinary day, UTC",
    "UTC",
    "2026-01-15T00:00:00Z",
    "2026-01-16T00:00:00Z",
    "2026-01-15",
    300,
    1260,
    ["2026-01-15T05:00:00Z", "2026-01-15T21:00:00Z"],
  ],
  [
    "ordinary day, London",
    "Europe/London",
    "2026-01-15T00:00:00Z",
    "2026-01-16T00:00:00Z",
    "2026-01-15",
    300,
    1260,
    ["2026-01-15T05:00:00Z", "2026-01-15T21:00:00Z"],
  ],
  [
    "ordinary day east of UTC",
    "Asia/Kolkata",
    "2026-01-14T18:30:00Z",
    "2026-01-15T18:30:00Z",
    "2026-01-15",
    300,
    1260,
    ["2026-01-14T23:30:00Z", "2026-01-15T15:30:00Z"],
  ],
  [
    "fall-back day west of UTC",
    "America/Los_Angeles",
    "2026-11-01T07:00:00Z",
    "2026-11-02T08:00:00Z",
    "2026-11-01",
    300,
    1260,
    ["2026-11-01T13:00:00Z", "2026-11-02T05:00:00Z"],
  ],
  [
    "spring-forward day west of UTC",
    "America/Los_Angeles",
    "2026-03-08T08:00:00Z",
    "2026-03-09T07:00:00Z",
    "2026-03-08",
    300,
    1260,
    ["2026-03-08T12:00:00Z", "2026-03-09T04:00:00Z"],
  ],
  [
    "start inside the gap shifts forward",
    "America/Los_Angeles",
    "2026-03-08T08:00:00Z",
    "2026-03-09T07:00:00Z",
    "2026-03-08",
    150,
    1020,
    ["2026-03-08T10:30:00Z", "2026-03-09T00:00:00Z"],
  ],
  [
    "start in the repeated hour is its first occurrence",
    "Europe/Berlin",
    "2026-10-24T22:00:00Z",
    "2026-10-25T23:00:00Z",
    "2026-10-25",
    120,
    1020,
    ["2026-10-25T00:00:00Z", "2026-10-25T16:00:00Z"],
  ],
  [
    "a whole 25-hour day",
    "America/Los_Angeles",
    "2026-11-01T07:00:00Z",
    "2026-11-02T08:00:00Z",
    "2026-11-01",
    0,
    1440,
    ["2026-11-01T07:00:00Z", "2026-11-02T08:00:00Z"],
  ],
  [
    "local midnight doesn't exist",
    "America/Santiago",
    "2026-09-06T04:00:00Z",
    "2026-09-07T03:00:00Z",
    "2026-09-06",
    300,
    1260,
    ["2026-09-06T08:00:00Z", "2026-09-07T00:00:00Z"],
  ],
  [
    "until midnight as clocks fall back at midnight",
    "America/Santiago",
    "2026-04-04T03:00:00Z",
    "2026-04-05T04:00:00Z",
    "2026-04-04",
    1320,
    1440,
    ["2026-04-05T01:00:00Z", "2026-04-05T04:00:00Z"],
  ],
  [
    "spring-forward day east of UTC",
    "Australia/Sydney",
    "2026-10-03T14:00:00Z",
    "2026-10-04T13:00:00Z",
    "2026-10-04",
    300,
    1260,
    ["2026-10-03T18:00:00Z", "2026-10-04T10:00:00Z"],
  ],
];

describe("hours keep their wall clock", () => {
  for (const [
    name,
    timeZone,
    from,
    to,
    date,
    startMinute,
    endMinute,
    expected,
  ] of WALL_CLOCK_CASES) {
    const want = [{ startMs: ms(expected[0]), endMs: ms(expected[1]) }];
    test(`weekly: ${name}`, () => {
      expect(
        buildAvailability({
          timeZone,
          rules: [{ days: every, startMinute, endMinute }],
          overrides: [],
          fromMs: ms(from),
          toMs: ms(to),
        }),
      ).toEqual(want);
    });
    test(`override: ${name}`, () => {
      expect(
        buildAvailability({
          timeZone,
          rules: [{ days: every, startMinute: 720, endMinute: 780 }],
          overrides: [{ date, ranges: [{ startMinute, endMinute }] }],
          fromMs: ms(from),
          toMs: ms(to),
        }),
      ).toEqual(want);
    });
  }
});

describe("zones", () => {
  test("the repeated hour's two instants read the same wall clock", () => {
    const first = ms("2026-11-01T08:30:00Z");
    const second = ms("2026-11-01T09:30:00Z");
    expect(wallClockMs("America/Los_Angeles", first)).toBe(
      wallClockMs("America/Los_Angeles", second),
    );
    expect(
      wallClockToInstant(wallClockMs("America/Los_Angeles", second), "America/Los_Angeles"),
    ).toBe(first);
  });

  test("published transitions hold whatever tz data the runtime has", () => {
    const after = ms("2026-11-09T17:00:00Z");
    expect(new Date(wallClockMs("America/Vancouver", after)).toISOString()).toBe(
      "2026-11-09T10:00:00.000Z",
    );
    expect(
      new Date(wallClockMs("Africa/Casablanca", ms("2026-12-01T12:00:00Z"))).toISOString(),
    ).toBe("2026-12-01T12:00:00.000Z");
    // Before the change, the old rules still apply.
    expect(
      new Date(wallClockMs("America/Vancouver", ms("2026-01-15T17:00:00Z"))).toISOString(),
    ).toBe("2026-01-15T09:00:00.000Z");
  });

  test("half-hour and 45-minute zones", () => {
    expect(new Date(wallClockMs("Asia/Kathmandu", ms("2026-01-15T00:00:00Z"))).toISOString()).toBe(
      "2026-01-15T05:45:00.000Z",
    );
    expect(
      new Date(wallClockMs("Australia/Lord_Howe", ms("2026-01-15T00:00:00Z"))).toISOString(),
    ).toBe("2026-01-15T11:00:00.000Z");
    expect(
      new Date(wallClockMs("Australia/Lord_Howe", ms("2026-07-15T00:00:00Z"))).toISOString(),
    ).toBe("2026-07-15T10:30:00.000Z");
  });

  test("local days and Monday-started weeks", () => {
    const monday = ms("2026-03-10T00:30:00Z");
    expect(localDateOf("America/Los_Angeles", monday)).toBe("2026-03-09");
    expect(localDateOf("Europe/London", monday)).toBe("2026-03-10");
    expect(localWeekOf("America/Los_Angeles", monday)).toBe("2026-03-09");
    expect(localWeekOf("UTC", ms("2026-03-08T12:00:00Z"))).toBe("2026-03-02");
  });

  test("a local date never passes through a zone, and bad ones are refused", () => {
    expect(parseLocalDate("2026-12-24")).toBe(Date.UTC(2026, 11, 24));
    expect(() => parseLocalDate("2026-02-30")).toThrow();
    expect(() => parseLocalDate("24/12/2026")).toThrow();
  });
});

test("an unavailable override removes the whole local day", () => {
  const got = buildAvailability({
    timeZone: "America/New_York",
    rules: [{ days: every, startMinute: 0, endMinute: 1440 }],
    overrides: [{ date: "2026-12-24", ranges: [] }],
    fromMs: ms("2026-12-23T05:00:00Z"),
    toMs: ms("2026-12-26T05:00:00Z"),
  });
  expect(got).toEqual([
    { startMs: ms("2026-12-23T05:00:00Z"), endMs: ms("2026-12-24T05:00:00Z") },
    { startMs: ms("2026-12-25T05:00:00Z"), endMs: ms("2026-12-26T05:00:00Z") },
  ]);
});
