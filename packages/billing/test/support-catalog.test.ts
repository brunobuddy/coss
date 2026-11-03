import { describe, expect, test } from "bun:test";
import {
  formatSupportTarget,
  PLAN_KEYS,
  rateCardAt,
  SUPPORT_TIERS,
  supportResponseMinutes,
} from "../src/catalog/index.ts";
import { resolveTerms } from "../src/engine/terms.ts";
import { parseContractTerms } from "../src/schemas.ts";

describe("support catalog", () => {
  test("every plan has a tier", () => {
    for (const plan of PLAN_KEYS) expect(SUPPORT_TIERS[plan].plan).toBe(plan);
  });

  test("a higher plan is never slower", () => {
    PLAN_KEYS.forEach((plan, index) => {
      const higher = PLAN_KEYS[index + 1];
      if (!higher) return;
      for (const severity of ["normal", "urgent"] as const) {
        expect(supportResponseMinutes(higher, severity)).toBeLessThanOrEqual(
          supportResponseMinutes(plan, severity),
        );
      }
    });
  });

  test("the published targets", () => {
    const published = PLAN_KEYS.map((plan) => [
      plan,
      formatSupportTarget(supportResponseMinutes(plan, "normal")),
      SUPPORT_TIERS[plan].responseMinutes.urgent === null
        ? null
        : formatSupportTarget(supportResponseMinutes(plan, "urgent")),
    ]);
    expect(published).toEqual([
      ["free", "3 business days", null],
      ["pro", "1 business day", "4 business hours"],
      ["scale", "4 business hours", "1 business hour"],
      ["enterprise", "2 business hours", "1 business hour"],
    ]);
  });

  test("urgent on a plan without it answers as normal", () => {
    expect(supportResponseMinutes("free", "urgent")).toBe(supportResponseMinutes("free", "normal"));
  });

  test("a contract's all-hours clock drops the business qualifier", () => {
    expect(formatSupportTarget(60, { allHours: true })).toBe("1 hour");
  });
});

describe("contract support term", () => {
  const card = rateCardAt(new Date());

  test("defaults to support hours", () => {
    const terms = resolveTerms(parseContractTerms({ version: 1, plan: "scale" }), card);
    expect(terms.support).toEqual({ allHours: false });
  });

  test("a contract can run the clock all hours", () => {
    const terms = resolveTerms(
      parseContractTerms({ version: 1, plan: "enterprise", support: { allHours: true } }),
      card,
    );
    expect(terms.support).toEqual({ allHours: true });
  });

  test("unknown support keys are refused", () => {
    expect(() =>
      parseContractTerms({ version: 1, plan: "enterprise", support: { minutes: 5 } }),
    ).toThrow();
  });
});
