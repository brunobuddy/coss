import { describe, expect, test } from "bun:test";
import {
  ESTIMATED_PLANS,
  emailTierCharges,
  estimateEmailMonth,
  formatPrice,
  rateTables,
  smsRates,
  suggestedPlan,
} from "../src/lib/pricing";

const suggest = (emails: number) =>
  suggestedPlan(ESTIMATED_PLANS.map((plan) => estimateEmailMonth(plan, emails)));

describe("formatPrice", () => {
  test("drops cents only for whole dollars", () => {
    expect(formatPrice(2_500n)).toBe("$25");
    expect(formatPrice(200_000n)).toBe("$2,000");
    expect(formatPrice(4_040n)).toBe("$40.40");
    expect(formatPrice(4n)).toBe("$0.04");
  });
});

describe("estimateEmailMonth", () => {
  test("Free costs nothing within its allowance and can't send beyond it", () => {
    expect(estimateEmailMonth("free", 3_000)).toMatchObject({ totalCents: 0n, dailyLimit: null });
    expect(estimateEmailMonth("free", 3_001).totalCents).toBeNull();
  });

  test("a paid month costs the larger of the fee and the usage", () => {
    expect(estimateEmailMonth("pro", 10_000)).toMatchObject({
      usageCents: 400n,
      totalCents: 2_500n,
    });
    // The billing guide's example: 2,000,000 emails on Pro is $700.
    expect(estimateEmailMonth("pro", 2_000_000)).toMatchObject({
      usageCents: 70_000n,
      totalCents: 70_000n,
      dailyLimit: null,
    });
    expect(estimateEmailMonth("scale", 100_000).totalCents).toBe(25_000n);
  });

  test("flags volumes beyond a plan's daily sending limit", () => {
    expect(estimateEmailMonth("pro", 5_000_000).dailyLimit).toBe(100_000);
    expect(estimateEmailMonth("scale", 5_000_000).dailyLimit).toBeNull();
  });
});

test("suggestedPlan picks the cheapest plan that can send the volume", () => {
  expect(suggest(2_000)).toBe("free");
  expect(suggest(10_000)).toBe("pro");
  // Pro and Scale cost the same here; the lower plan wins.
  expect(suggest(1_000_000)).toBe("pro");
  expect(suggest(5_000_000)).toBe("scale");
  expect(suggest(40_000_000)).toBe("enterprise");
});

test("emailTierCharges prices each band at its own rate", () => {
  expect(emailTierCharges(2_000_000)).toEqual([
    { first: 1, last: 1_000_000, pricePerThousand: "$0.40", amountCents: 40_000n },
    { first: 1_000_001, last: 2_000_000, pricePerThousand: "$0.30", amountCents: 30_000n },
  ]);
  expect(emailTierCharges(0)).toEqual([]);
});

test("rateTables lists every product's list rates", () => {
  const tables = rateTables();
  expect(tables.find((table) => table.meter === "email.recipients")).toMatchObject({
    per: "per 1,000 recipients",
    bands: [
      { range: "First 1,000,000", price: "$0.40" },
      { range: "1,000,001 to 10,000,000", price: "$0.30" },
      { range: "Above 10,000,000", price: "$0.22" },
    ],
  });
  expect(tables.find((table) => table.meter === "sms.segments")).toMatchObject({
    scope: "United States",
    per: "per segment",
    bands: [{ range: "All usage", price: "$0.0142" }],
    note: "Other countries in the SMS rates below",
  });
  expect(tables.filter((table) => table.meter === "sms.segments")).toHaveLength(1);
  expect(tables.find((table) => table.meter === "sms.numbers")).toMatchObject({
    scope: null,
    per: "per number-month",
    bands: [
      { range: "Local", price: "$1.15" },
      { range: "Toll-free", price: "$2.15" },
    ],
  });
  expect(tables.find((table) => table.meter === "sms.registrations")?.per).toBe(
    "passed through at cost",
  );
});

test("smsRates lists every priced country by name", () => {
  const rates = smsRates();
  expect(rates.map((rate) => rate.country)).toEqual(
    [...rates.map((rate) => rate.country)].sort((a, b) => a.localeCompare(b)),
  );
  expect(rates.find((rate) => rate.code === "GB")).toEqual({
    code: "GB",
    country: "United Kingdom",
    outbound: "$0.0665",
    inbound: null,
  });
  expect(rates.find((rate) => rate.code === "US")).toMatchObject({
    outbound: "$0.0142",
    inbound: "$0.016",
  });
});
