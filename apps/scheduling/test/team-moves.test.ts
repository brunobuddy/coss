import { expect, test } from "bun:test";
import { chosenTarget } from "../src/lib/team-moves.ts";

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
