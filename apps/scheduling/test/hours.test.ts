import { expect, test } from "bun:test";
import { hoursFromRules, rulesFromHours } from "../src/app/h/[sessionId]/host-portal.tsx";

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
