import { expect, test } from "bun:test";
import {
  buildAvailability,
  type DateOverride,
  type WeeklyRule,
} from "../src/engine/availability.ts";
import fixtures from "./fixtures/date-ranges.json";

type Case = {
  timeZone: string;
  fromMs: number;
  toMs: number;
  rules: WeeklyRule[];
  overrides: DateOverride[];
  expected: [number, number][];
};

// The one intended difference: Cal.com's overrides can spill outside the requested window.
function clipped(item: Case): [number, number][] {
  return item.expected
    .map(([start, end]): [number, number] => [
      Math.max(start, item.fromMs),
      Math.min(end, item.toMs),
    ])
    .filter(([start, end]) => end > start);
}

test(`agrees with Cal.com's date ranges on ${fixtures.cases.length} generated cases, to the instant`, () => {
  for (const item of fixtures.cases as unknown as Case[]) {
    const got = buildAvailability(item).map((range): [number, number] => [
      range.startMs,
      range.endMs,
    ]);
    expect({ case: item, got }).toEqual({ case: item, got: clipped(item) });
  }
});
