import { expect, test } from "bun:test";
import { chosenTarget, overridesFor } from "../src/lib/team-moves.ts";

const item = { booking: "book_1", to_host: "host_a" };

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
  const free = { member: true, available: true, reason: null };
  expect(overridesFor(free)).toEqual([]);
  expect(overridesFor({ ...free, member: false })).toEqual(["any_host"]);
  const busy = { member: true, available: false, reason: "host_busy" };
  expect(overridesFor(busy)).toEqual(["host_busy"]);
  expect(overridesFor({ ...busy, member: false })).toEqual(["any_host", "host_busy"]);
  expect(overridesFor({ ...busy, reason: "outside_coverage" })).toEqual(["any_host"]);
  expect(overridesFor({ ...busy, reason: "already_claimed" })).toEqual([]);
});
