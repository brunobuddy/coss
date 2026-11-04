import { describe, expect, test } from "bun:test";
import { billableEmailMegabytes, meterAmount } from "../src/catalog/meters.ts";
import { PLANS } from "../src/catalog/plans.ts";
import { rateCardAt, rateFor } from "../src/catalog/rates.ts";
import { chargeRange } from "../src/engine/index.ts";

const MB = 2 ** 20;

describe("email data", () => {
  test("bills whole MB past the first, rounded up", () => {
    expect(billableEmailMegabytes(0)).toBe(0);
    expect(billableEmailMegabytes(MB)).toBe(0);
    expect(billableEmailMegabytes(MB + 1)).toBe(1);
    expect(billableEmailMegabytes(2 * MB)).toBe(1);
    expect(billableEmailMegabytes(2 * MB + 1)).toBe(2);
    expect(billableEmailMegabytes(25 * MB)).toBe(24);
    expect(billableEmailMegabytes(40 * MB)).toBe(39);
  });

  test.each([
    ["email.attachment_data", 250_000n],
    ["email.received_data", 750_000n],
  ] as const)("%s is priced on current and future cards", (meter, unitNanos) => {
    for (const at of ["2026-11-04T00:00:00Z", "2027-01-01T00:00:00Z"]) {
      const rate = rateFor(rateCardAt(new Date(at)).rates[meter], "");
      if (!rate) throw new Error(`${meter} has no price at ${at}`);
      expect(chargeRange(rate, 0, 1_000, 1_000).amountNanos).toBe(unitNanos * 1_000n);
    }
  });

  test("a 25 MB email at list prices sells above what SES charges for it", () => {
    const sesSent = 3_100_000n; // $0.0031
    const sesReceived = 9_100_000n; // $0.0091
    const lowestEmailPrice = 220_000n; // $0.22 per 1,000
    const data = BigInt(billableEmailMegabytes(25 * MB));
    expect(lowestEmailPrice + data * 250_000n).toBeGreaterThan(sesSent);
    expect(lowestEmailPrice + data * 750_000n).toBeGreaterThan(sesReceived);
  });

  test("Free includes 1,000 MB of each, and paid plans bill it", () => {
    expect(PLANS.free.includedUnits["email.attachment_data"]).toBe(1_000);
    expect(PLANS.free.includedUnits["email.received_data"]).toBe(1_000);
    for (const plan of [PLANS.pro, PLANS.scale]) {
      expect(plan.includedUnits).not.toContainKey("email.attachment_data");
      expect(plan.includedUnits).not.toContainKey("email.received_data");
    }
    expect(meterAmount("email.received_data", 1_000)).toBe("1,000 MB of received email data");
  });
});
