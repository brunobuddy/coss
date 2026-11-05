import { expect, test } from "bun:test";
import {
  hoursFromRules,
  hoursProblem,
  rulesFromHours,
} from "../src/app/h/[sessionId]/hours-rules.ts";

test("saving keeps a lunch break and a day that runs to midnight", () => {
  const rules = [
    { days: [1], start: "09:00", end: "12:00" },
    { days: [1], start: "13:00", end: "17:00" },
    { days: [2], start: "20:00", end: "24:00" },
  ];
  const hours = hoursFromRules(rules);
  expect(hours[1]?.ranges.length).toBe(2);
  expect(hours[2]?.ranges[0]?.end).toBe("23:59");
  expect(hours[0]?.enabled).toBe(false);
  expect(rulesFromHours(hours)).toEqual(rules);
});

test("hours that can't work are named by their day", () => {
  const off = { enabled: false, ranges: [{ start: "17:00", end: "09:00" }] };
  const week = (monday: { start: string; end: string }[]) => [
    off,
    { enabled: true, ranges: monday },
    off,
    off,
    off,
    off,
    off,
  ];
  expect(hoursProblem(week([{ start: "09:00", end: "17:00" }]))).toBeNull();
  expect(
    hoursProblem(
      week([
        { start: "13:00", end: "17:00" },
        { start: "09:00", end: "12:00" },
      ]),
    ),
  ).toBeNull();
  expect(hoursProblem(week([{ start: "17:00", end: "09:00" }]))).toContain("Monday");
  expect(
    hoursProblem(
      week([
        { start: "09:00", end: "13:00" },
        { start: "12:00", end: "17:00" },
      ]),
    ),
  ).toContain("overlap");
});
