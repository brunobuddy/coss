import { describe, expect, test } from "bun:test";
import { environmentSetupSteps, isFirstVisit } from "../src/lib/home-setup";

const input = {
  base: "/acme/default/development",
  keyPrefix: "coss_test_",
  live: false,
  hasKey: false,
  hasActivity: false,
  domains: [] as { canSend: boolean }[] | null,
  liveBase: "/acme/default/production" as string | null,
};

describe("environmentSetupSteps", () => {
  test("a sandbox ends by leading to the live environment's domains", () => {
    const steps = environmentSetupSteps(input);
    expect(steps.map((step) => step.label)).toEqual([
      "Create an API key",
      "Make your first request",
      "Go live",
    ]);
    expect(steps.at(-1)?.href).toBe("/acme/default/production/email/domains");
  });

  test("a sandbox's checklist stays until a domain can send", () => {
    const remaining = (domains: { canSend: boolean }[]) =>
      environmentSetupSteps({ ...input, hasKey: true, hasActivity: true, domains }).filter(
        (step) => !step.done,
      );
    expect(remaining([{ canSend: false }]).map((step) => step.label)).toEqual(["Go live"]);
    expect(remaining([{ canSend: true }])).toEqual([]);
  });

  test("without access to domains there is nothing to lead to", () => {
    expect(environmentSetupSteps({ ...input, domains: null })).toHaveLength(2);
    expect(environmentSetupSteps({ ...input, liveBase: null })).toHaveLength(2);
  });

  test("a live environment verifies a domain here, before its first request", () => {
    const steps = environmentSetupSteps({
      ...input,
      base: "/acme/default/production",
      live: true,
    });
    expect(steps.map((step) => step.label)).toEqual([
      "Create an API key",
      "Verify a domain",
      "Make your first request",
    ]);
    expect(steps[1]?.href).toBe("/acme/default/production/email/domains");
  });
});

test("isFirstVisit: only with no key and no activity", () => {
  expect(isFirstVisit({ hasKey: false, hasActivity: false })).toBe(true);
  expect(isFirstVisit({ hasKey: true, hasActivity: false })).toBe(false);
  expect(isFirstVisit({ hasKey: false, hasActivity: true })).toBe(false);
});
