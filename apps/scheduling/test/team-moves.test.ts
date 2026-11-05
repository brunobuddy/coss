import { expect, test } from "bun:test";
import { chosenTarget, overridesFor, sourceHost } from "../src/lib/team-moves.ts";

const item = { booking: "book_1", to_host: "host_a" };

test("who's leaving is someone still on the booking", () => {
  expect(sourceHost("host_b", ["host_a", "host_b"])).toBe("host_b");
  expect(sourceHost("host_a", ["host_b"])).toBe("host_b");
  expect(sourceHost("host_a", [])).toBe("");
});

test("a preview's proposal stands until someone says otherwise", () => {
  expect(chosenTarget(item, {})).toBe("host_a");
  expect(chosenTarget(item, { book_2: "host_b" })).toBe("host_a");
  expect(chosenTarget({ booking: "book_1", to_host: null }, {})).toBeNull();
});

test("choosing someone, or that it stays, wins over the proposal", () => {
  expect(chosenTarget(item, { book_1: "host_b" })).toBe("host_b");
  expect(chosenTarget(item, { book_1: null })).toBeNull();
});

test("choosing someone asks only for what the API can go past", () => {
  const free = { member: true, reasons: [] };
  expect(overridesFor(free)).toEqual([]);
  expect(overridesFor({ ...free, member: false })).toEqual(["any_host"]);
  const busy = { member: true, reasons: ["host_busy"] };
  expect(overridesFor(busy)).toEqual(["host_busy"]);
  expect(overridesFor({ ...busy, member: false })).toEqual(["any_host", "host_busy"]);
  expect(overridesFor({ member: true, reasons: ["outside_coverage"] })).toEqual(["any_host"]);
  expect(overridesFor({ member: true, reasons: ["already_claimed"] })).toEqual([]);
});

test("everything in the way is asked for, or going past one would only show the next", () => {
  const both = { member: true, reasons: ["outside_availability", "limit_reached"] };
  expect(overridesFor(both)).toEqual(["outside_availability", "limit_reached"]);
});
