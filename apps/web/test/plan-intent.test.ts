import { expect, test } from "bun:test";
import { planIntent, planIntentPath } from "../src/lib/plan-intent";

test("planIntent names only paid self-serve plans", () => {
  expect(planIntent("pro")).toBe("pro");
  expect(planIntent("scale")).toBe("scale");
  expect(planIntent("free")).toBeNull();
  expect(planIntent("enterprise")).toBeNull();
  expect(planIntent("/evil")).toBeNull();
  expect(planIntent(["pro"])).toBeNull();
  expect(planIntent(undefined)).toBeNull();
});

test("planIntentPath stays on the entry page", () => {
  expect(planIntentPath("pro")).toBe("/dashboard?plan=pro");
});
