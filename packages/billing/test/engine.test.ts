import { describe, expect, test } from "bun:test";
import type { MeterKey } from "../src/catalog/meters.ts";
import { RATE_CARDS, rateCardAt } from "../src/catalog/rates.ts";
import {
  chargeRange,
  composeContractChange,
  composePeriodInvoice,
  type GrantBalance,
  meterAvailability,
  resolveTerms,
  type Segment,
  type UsageRow,
} from "../src/engine/index.ts";
import { type ContractTermsInput, parseContractTerms } from "../src/schemas.ts";
import { addMonths, type Interval, nextPeriod } from "../src/time.ts";

const card = RATE_CARDS[0] as (typeof RATE_CARDS)[number];
const OCT: Interval = {
  start: new Date("2026-10-01T00:00:00Z"),
  end: new Date("2026-11-01T00:00:00Z"),
};
const NOV = nextPeriod(OCT);
const OCT_12 = new Date("2026-10-12T00:00:00Z");
const DEDICATED_IPS = {
  key: "dedicated_ips",
  name: "Dedicated IPs",
  unitAmountCents: "5000",
  quantity: 1,
  interval: "month",
  timing: "advance",
} as const;

function terms(input: ContractTermsInput) {
  return resolveTerms(parseContractTerms(input), card);
}

function segment(
  input: ContractTermsInput,
  opts: Partial<Omit<Segment, "terms">> & { interval?: Interval } = {},
): Segment {
  return {
    contractId: "contractId" in opts ? (opts.contractId ?? null) : "bcon_a",
    interval: opts.interval ?? OCT,
    terms: terms(input),
    contractStart: opts.contractStart ?? new Date("2026-09-01T00:00:00Z"),
    contractEnd: opts.contractEnd ?? null,
    termEnd: opts.termEnd ?? null,
    superseded: opts.superseded ?? false,
  };
}

function usage(
  quantity: number,
  opts: { at?: Date; meter?: UsageRow["meter"]; dimension?: string } = {},
): UsageRow {
  return {
    meter: opts.meter ?? "email.recipients",
    dimension: opts.dimension ?? "",
    hour: opts.at ?? new Date("2026-10-20T10:00:00Z"),
    quantity,
  };
}

function grant(input: Partial<GrantBalance> & { id: string; remaining: bigint }): GrantBalance {
  return {
    kind: "amount",
    meter: null,
    dimension: null,
    scope: null,
    appliesTo: "usage",
    effectiveAt: OCT.start,
    expiresAt: OCT.end,
    createdAt: OCT.start,
    ...input,
  };
}

const feeGrant = (cents: bigint, id = "bcg_fee") => grant({ id, remaining: cents });

function amounts(lines: { kind: string; amountCents: bigint }[]) {
  return lines.map((line) => [line.kind, line.amountCents]);
}

describe("tiers", () => {
  const email = card.rates["email.recipients"]?.default;
  if (!email) throw new Error("email rate missing");

  test("graduated: 2M emails = 1M at $0.40/1k + 1M at $0.30/1k = $700", () => {
    expect(chargeRange(email, 0, 2_000_000, 2_000_000).amountNanos).toBe(700n * 1_000_000_000n);
  });

  test("graduated: the band boundaries are inclusive of their limit", () => {
    const range = chargeRange(email, 999_999, 1_000_001, 0);
    expect(range.tiers.map((tier) => [tier.from, tier.to, tier.unitNanos])).toEqual([
      [999_999, 1_000_000, 400_000n],
      [1_000_000, 1_000_001, 300_000n],
    ]);
  });

  test("graduated: 20M emails reaches the $0.22 band", () => {
    // 1M × 0.0004 + 9M × 0.0003 + 10M × 0.00022 = 400 + 2,700 + 2,200
    expect(chargeRange(email, 0, 20_000_000, 0).amountNanos).toBe(5_300n * 1_000_000_000n);
  });

  test("volume: every unit at the band the total reaches", () => {
    const volume = { ...email, mode: "volume" as const };
    expect(chargeRange(volume, 0, 2_000_000, 2_000_000).amountNanos).toBe(600n * 1_000_000_000n);
    expect(chargeRange(volume, 0, 999_000, 999_000).amountNanos).toBe(399_600_000_000n);
  });
});

describe("terms", () => {
  test("Free caps every meter at its included units", () => {
    const free = terms({ version: 1, plan: "free" });
    expect(free.usageCaps).toEqual({
      "email.recipients": 3000,
      "email.dedicated_ip": 0,
      "email.received": 3000,
      "email.inboxes": 93,
      "sms.segments": 0,
      "sms.received_segments": 0,
      "sms.numbers": 0,
      "sms.registrations": 0,
      "sign.completed_requests": 0,
      "risk.phone_checks": 100,
      "verify.verifications": 0,
      "verify.sms": 0,
      "forms.submissions": 1_000,
      "forms.file_uploads": 1_000,
      "video.participant_minutes": 0,
      "scheduling.bookings": 100,
    });
    expect(free.fee).toBeNull();
  });

  test("Pro has its fee and no caps", () => {
    const pro = terms({ version: 1, plan: "pro" });
    expect(pro.fee).toEqual({ amountCents: 2500n, interval: "month", timing: "advance" });
    expect(pro.usageCaps).toEqual({});
    expect(pro.entitlements.features.trackingDomains).toBe(true);
    expect(pro.entitlements.limits.domains).toBe(10);
  });

  test("SMS is available by country, on paid plans", () => {
    const pro = terms({ version: 1, plan: "pro" });
    expect(meterAvailability(pro, "sms.segments")).toBe("available");
    expect(meterAvailability(pro, "sms.segments", "country=US")).toBe("available");
    expect(meterAvailability(pro, "sms.segments", "country=GB")).toBe("not_priced");
    expect(meterAvailability(terms({ version: 1, plan: "free" }), "sms.segments")).toBe("blocked");
    expect(meterAvailability(pro, "email.recipients")).toBe("available");
    expect(
      meterAvailability(terms({ version: 1, plan: "free" }), "video.participant_minutes"),
    ).toBe("blocked");
  });

  test("a contract's rates for some dimension values keep the list price of the others", () => {
    const contract = terms({
      version: 1,
      plan: "enterprise",
      rates: {
        "sms.segments": {
          byDimension: {
            "country=GB": { mode: "graduated", tiers: [{ upTo: null, unitNanos: "40000000" }] },
          },
        },
      },
    });
    expect(contract.rates["sms.segments"]?.byDimension).toEqual({
      "country=US": { mode: "graduated", tiers: [{ upTo: null, unitNanos: 14_200_000n }] },
      "country=GB": { mode: "graduated", tiers: [{ upTo: null, unitNanos: 40_000_000n }] },
    });
    expect(meterAvailability(contract, "sms.segments", "country=GB")).toBe("available");
    const everywhere = terms({
      version: 1,
      plan: "enterprise",
      rates: {
        "sms.segments": {
          default: { mode: "graduated", tiers: [{ upTo: null, unitNanos: "9000000" }] },
        },
      },
    });
    expect(everywhere.rates["sms.segments"]).toEqual({
      default: { mode: "graduated", tiers: [{ upTo: null, unitNanos: 9_000_000n }] },
    });
  });

  test("the November 2026 card prices SMS by country and passes fees through", () => {
    const november = rateCardAt(new Date("2026-11-01T00:00:00Z"));
    expect(november).not.toBe(card);
    const tiers = (meter: MeterKey, dimension: string) =>
      november.rates[meter]?.byDimension?.[dimension]?.tiers;
    expect(tiers("sms.segments", "country=US")).toEqual([{ upTo: null, unitNanos: 14_200_000n }]);
    expect(tiers("sms.segments", "country=GB")).toEqual([{ upTo: null, unitNanos: 66_500_000n }]);
    expect(tiers("sms.numbers", "type=local")).toEqual([{ upTo: null, unitNanos: 1_150_000_000n }]);
    expect(november.rates["email.recipients"]).toBe(card.rates["email.recipients"]);
    expect(rateCardAt(new Date("2026-10-31T23:59:59Z"))).toBe(card);
  });

  test("entitlement overrides merge over the plan's", () => {
    const scale = terms({
      version: 1,
      plan: "scale",
      entitlements: { features: { scim: true }, limits: { domains: null } },
    });
    expect(scale.entitlements.features.scim).toBe(true);
    expect(scale.entitlements.features.sso).toBe(true);
    expect(scale.entitlements.limits.domains).toBeNull();
  });
});

describe("month invoice", () => {
  test("Pro, 2M emails: $700 of usage less the $25 credit, plus next month's $25 fee", () => {
    const pro = segment({ version: 1, plan: "pro" });
    const invoice = composePeriodInvoice({
      closed: { period: OCT, segments: [pro], usage: [usage(2_000_000)] },
      next: { period: NOV, segment: { ...pro, interval: NOV } },
      grants: [feeGrant(2500n)],
    });
    expect(amounts(invoice.lines)).toEqual([
      ["usage", 70_000n],
      ["plan_fee", 2_500n],
      ["credit", -2_500n],
    ]);
    // Over the two months the customer pays max(fee, usage) = $700 for October.
    expect(invoice.totalCents).toBe(70_000n);
    expect(invoice.grants).toMatchObject([
      {
        key: `feecredit:bcon_a:${NOV.start.toISOString()}`,
        amount: 2_500n,
        source: "fee",
        expiresAt: NOV.end,
      },
    ]);
    expect(invoice.applications).toEqual([{ grantId: "bcg_fee", kind: "amount", amount: 2_500n }]);
  });

  test("Pro, light usage: only the fee (the credit covers usage)", () => {
    const pro = segment({ version: 1, plan: "pro" });
    const invoice = composePeriodInvoice({
      closed: { period: OCT, segments: [pro], usage: [usage(10_000)] },
      next: { period: NOV, segment: { ...pro, interval: NOV } },
      grants: [feeGrant(2500n)],
    });
    expect(amounts(invoice.lines)).toEqual([
      ["usage", 400n],
      ["plan_fee", 2_500n],
      ["credit", -400n],
    ]);
    expect(invoice.totalCents).toBe(2_500n);
  });

  test("Pro, inboxes: 3 included, $0.99 a month up to 100, $0.24 beyond", () => {
    const pro = segment({ version: 1, plan: "pro" });
    // 150 inboxes all of October: 4,650 inbox-days, 93 of them included.
    const invoice = composePeriodInvoice({
      closed: {
        period: OCT,
        segments: [pro],
        usage: [usage(150 * 31, { meter: "email.inboxes" })],
      },
      next: { period: NOV, segment: { ...pro, interval: NOV } },
      grants: [feeGrant(2500n)],
    });
    // 3,007 days at $0.033 + 1,550 at $0.008 = $99.231 + $12.40
    expect(amounts(invoice.lines)).toEqual([
      ["usage", 11_163n],
      ["plan_fee", 2_500n],
      ["credit", -2_500n],
    ]);
  });

  test("Free within its allowance costs nothing; beyond it, usage is written off", () => {
    const free = segment({ version: 1, plan: "free" }, { contractId: null });
    const within = composePeriodInvoice({
      closed: { period: OCT, segments: [free], usage: [usage(2_500)] },
      next: null,
      grants: [],
    });
    expect(amounts(within.lines)).toEqual([["usage", 0n]]);
    expect(within.lines[0]?.coveredUnits).toBe(2_500);

    const beyond = composePeriodInvoice({
      closed: { period: OCT, segments: [free], usage: [usage(3_500)] },
      next: null,
      grants: [],
    });
    expect(amounts(beyond.lines)).toEqual([
      ["usage", 20n],
      ["write_off", -20n],
    ]);
    expect(beyond.totalCents).toBe(0n);
  });

  test("Free → Pro on the 12th: Free's allowance covers the first units, the prorated credit the rest", () => {
    const free = segment(
      { version: 1, plan: "free" },
      { contractId: null, interval: { start: OCT.start, end: OCT_12 } },
    );
    const pro = segment(
      { version: 1, plan: "pro" },
      { contractStart: OCT_12, interval: { start: OCT_12, end: OCT.end } },
    );
    const invoice = composePeriodInvoice({
      closed: {
        period: OCT,
        segments: [free, pro],
        usage: [usage(3_000, { at: new Date("2026-10-05T00:00:00Z") }), usage(100_000)],
      },
      next: { period: NOV, segment: { ...pro, interval: NOV } },
      grants: [feeGrant(1_613n, "bcg_upgrade")],
    });
    expect(amounts(invoice.lines)).toEqual([
      ["usage", 0n],
      ["usage", 4_000n],
      ["plan_fee", 2_500n],
      ["credit", -1_613n],
    ]);
    expect(invoice.lines[1]).toMatchObject({
      contractId: "bcon_a",
      quantity: 100_000,
      coveredUnits: 0,
    });
  });

  test("tier positions continue across segments", () => {
    const first = segment(
      { version: 1, plan: "pro" },
      { interval: { start: OCT.start, end: OCT_12 } },
    );
    const second = segment(
      { version: 1, plan: "scale" },
      { contractId: "bcon_b", contractStart: OCT_12, interval: { start: OCT_12, end: OCT.end } },
    );
    const invoice = composePeriodInvoice({
      closed: {
        period: OCT,
        segments: [first, second],
        usage: [usage(900_000, { at: new Date("2026-10-02T00:00:00Z") }), usage(200_000)],
      },
      next: null,
      grants: [],
    });
    // 900k at $0.40 = $360; then 100k at $0.40 + 100k at $0.30 = $70.
    expect(amounts(invoice.lines)).toEqual([
      ["usage", 36_000n],
      ["usage", 7_000n],
    ]);
  });

  test("a line is rounded to cents once", () => {
    const pro = segment({ version: 1, plan: "pro" });
    const one = composePeriodInvoice({
      closed: { period: OCT, segments: [pro], usage: [usage(1)] },
      next: null,
      grants: [],
    });
    expect(one.lines[0]?.amountCents).toBe(0n); // $0.0004
    const thirteen = composePeriodInvoice({
      closed: { period: OCT, segments: [pro], usage: [usage(13)] },
      next: null,
      grants: [],
    });
    expect(thirteen.lines[0]?.amountCents).toBe(1n); // $0.0052
    const hourly = composePeriodInvoice({
      closed: {
        period: OCT,
        segments: [pro],
        usage: Array.from({ length: 13 }, (_, i) =>
          usage(1, { at: new Date(OCT.start.getTime() + i * 3_600_000) }),
        ),
      },
      next: null,
      grants: [],
    });
    expect(hourly.lines).toHaveLength(1);
    expect(hourly.lines[0]?.amountCents).toBe(1n);
  });
});

describe("credits", () => {
  const pro = segment({ version: 1, plan: "pro" });

  test("a meter-scoped grant is used before a general one, then the soonest to expire", () => {
    const invoice = composePeriodInvoice({
      closed: { period: OCT, segments: [pro], usage: [usage(100_000)] }, // $40
      next: null,
      grants: [
        grant({ id: "bcg_general_late", remaining: 2_000n, expiresAt: null }),
        grant({ id: "bcg_general_soon", remaining: 1_000n }),
        grant({ id: "bcg_email", remaining: 1_500n, scope: ["email.recipients"], expiresAt: null }),
      ],
    });
    expect(invoice.applications).toEqual([
      { grantId: "bcg_email", kind: "amount", amount: 1_500n },
      { grantId: "bcg_general_soon", kind: "amount", amount: 1_000n },
      { grantId: "bcg_general_late", kind: "amount", amount: 1_500n },
    ]);
    expect(invoice.totalCents).toBe(0n);
  });

  test("a support grant of free units covers the first units", () => {
    const invoice = composePeriodInvoice({
      closed: { period: OCT, segments: [pro], usage: [usage(60_000)] },
      next: null,
      grants: [
        grant({
          id: "bcg_units",
          kind: "units",
          meter: "email.recipients",
          remaining: 50_000n,
          expiresAt: null,
        }),
      ],
    });
    expect(invoice.lines[0]).toMatchObject({ amountCents: 400n, coveredUnits: 50_000 });
    expect(invoice.applications).toEqual([
      { grantId: "bcg_units", kind: "units", amount: 50_000n },
    ]);
  });

  test("grants outside the period or exhausted are ignored; `usage` grants never pay fees", () => {
    const invoice = composePeriodInvoice({
      closed: { period: OCT, segments: [pro], usage: [] },
      next: { period: NOV, segment: { ...pro, interval: NOV } },
      grants: [
        grant({
          id: "bcg_old",
          remaining: 5_000n,
          effectiveAt: new Date("2026-08-01T00:00:00Z"),
          expiresAt: OCT.start,
        }),
        grant({ id: "bcg_usage", remaining: 5_000n }),
      ],
    });
    expect(invoice.applications).toEqual([]);
    expect(invoice.totalCents).toBe(2_500n);
  });

  test("an `any` grant also pays fees", () => {
    const invoice = composePeriodInvoice({
      closed: { period: OCT, segments: [pro], usage: [] },
      next: { period: NOV, segment: { ...pro, interval: NOV } },
      grants: [grant({ id: "bcg_goodwill", remaining: 1_000n, appliesTo: "any" })],
    });
    expect(invoice.totalCents).toBe(1_500n);
  });
});

describe("contract changes", () => {
  test("Free → Pro on the 12th charges and credits the rest of the month", () => {
    const pro = segment(
      { version: 1, plan: "pro" },
      { contractStart: OCT_12, interval: { start: OCT_12, end: OCT.end } },
    );
    const change = composeContractChange({ at: OCT_12, from: null, to: pro });
    // 20 of 31 days.
    expect(amounts(change.lines)).toEqual([["plan_fee", 1_613n]]);
    expect(change.grants).toMatchObject([
      { amount: 1_613n, effectiveAt: OCT_12, expiresAt: OCT.end },
    ]);
    expect(change.lines[0]?.chargeKey).toBe(`fee:bcon_a:${OCT.start.toISOString()}`);
  });

  test("Pro → Scale charges and credits the difference", () => {
    const pro = segment({ version: 1, plan: "pro" }, { contractEnd: OCT_12, superseded: true });
    const scale = segment(
      { version: 1, plan: "scale" },
      { contractId: "bcon_b", contractStart: OCT_12, interval: { start: OCT_12, end: OCT.end } },
    );
    const change = composeContractChange({
      at: OCT_12,
      from: { segment: pro, advanceCharged: true },
      to: scale,
    });
    expect(amounts(change.lines)).toEqual([
      ["plan_fee", 16_129n],
      ["proration", -1_613n],
    ]);
    expect(change.totalCents).toBe(14_516n);
    expect(change.grants[0]?.amount).toBe(14_516n);
  });

  test("an add-on-only change charges the add-on and carries the fee", () => {
    const scale = segment({ version: 1, plan: "scale" }, { contractEnd: OCT_12, superseded: true });
    const withIps = segment(
      { version: 1, plan: "scale", addOns: [DEDICATED_IPS] },
      { contractId: "bcon_b", contractStart: OCT_12, interval: { start: OCT_12, end: OCT.end } },
    );
    const change = composeContractChange({
      at: OCT_12,
      from: { segment: scale, advanceCharged: true },
      to: withIps,
    });
    // 20 of 31 days of $50.
    expect(amounts(change.lines)).toEqual([["add_on", 3_226n]]);
    expect(change.grants).toEqual([]);
  });

  test("the replaced contract's unused add-on time is credited", () => {
    const pro = segment(
      { version: 1, plan: "pro", addOns: [{ ...DEDICATED_IPS, key: "support" }] },
      { contractEnd: OCT_12, superseded: true },
    );
    const scale = segment(
      { version: 1, plan: "scale" },
      { contractId: "bcon_b", contractStart: OCT_12, interval: { start: OCT_12, end: OCT.end } },
    );
    const change = composeContractChange({
      at: OCT_12,
      from: { segment: pro, advanceCharged: true, addOnsCharged: new Set(["support"]) },
      to: scale,
    });
    expect(amounts(change.lines)).toEqual([
      ["plan_fee", 16_129n],
      ["proration", -1_613n],
      ["proration", -3_226n],
    ]);
    expect(change.lines[2]?.chargeKey).toBe(`unused-addon:bcon_a:support:${OCT_12.toISOString()}`);
  });

  test("unused add-on time is credited at the discounted price it was charged", () => {
    const pro = segment(
      {
        version: 1,
        plan: "pro",
        addOns: [{ ...DEDICATED_IPS, key: "support" }],
        discounts: [{ scope: "add_ons", percent: 50 }],
      },
      { contractEnd: OCT_12, superseded: true },
    );
    const scale = segment(
      { version: 1, plan: "scale" },
      { contractId: "bcon_b", contractStart: OCT_12, interval: { start: OCT_12, end: OCT.end } },
    );
    const change = composeContractChange({
      at: OCT_12,
      from: { segment: pro, advanceCharged: true, addOnsCharged: new Set(["support"]) },
      to: scale,
    });
    // 20 of 31 days of the $25 it cost.
    expect(amounts(change.lines)).toEqual([
      ["plan_fee", 16_129n],
      ["proration", -1_613n],
      ["proration", -1_613n],
    ]);
  });

  test("unused add-on time is credited at the discount it was charged with, though expired", () => {
    const pro = segment(
      {
        version: 1,
        plan: "pro",
        addOns: [{ ...DEDICATED_IPS, key: "support" }],
        discounts: [{ scope: "add_ons", percent: 100, until: "2026-10-10T00:00:00Z" }],
      },
      // As `composeChange` builds it: from the change on.
      { contractEnd: OCT_12, superseded: true, interval: { start: OCT_12, end: OCT.end } },
    );
    const scale = segment(
      { version: 1, plan: "scale" },
      { contractId: "bcon_b", contractStart: OCT_12, interval: { start: OCT_12, end: OCT.end } },
    );
    const change = composeContractChange({
      at: OCT_12,
      from: { segment: pro, advanceCharged: true, addOnsCharged: new Set(["support"]) },
      to: scale,
    });
    // October's add-on cost nothing: nothing of it is credited.
    expect(amounts(change.lines)).toEqual([
      ["plan_fee", 16_129n],
      ["proration", -1_613n],
    ]);
  });

  test("a carried fee whose credit becomes spendable grants the rest of the month's credit", () => {
    const scale = segment(
      { version: 1, plan: "scale", feeCredit: { spendable: false, pool: "month" } },
      { contractEnd: OCT_12, superseded: true },
    );
    const spendable = segment(
      { version: 1, plan: "scale" },
      { contractId: "bcon_b", contractStart: OCT_12, interval: { start: OCT_12, end: OCT.end } },
    );
    const change = composeContractChange({
      at: OCT_12,
      from: { segment: scale, advanceCharged: true },
      to: spendable,
    });
    expect(change.lines).toEqual([]);
    expect(change.grants).toMatchObject([
      { amount: 16_129n, effectiveAt: OCT_12, expiresAt: OCT.end },
    ]);
  });

  test("a fee whose discount changes doesn't carry over", () => {
    const discounted = segment(
      { version: 1, plan: "scale", discounts: [{ scope: "fees", percent: 50 }] },
      { contractEnd: OCT_12, superseded: true },
    );
    const full = segment(
      { version: 1, plan: "scale" },
      { contractId: "bcon_b", contractStart: OCT_12, interval: { start: OCT_12, end: OCT.end } },
    );
    const change = composeContractChange({
      at: OCT_12,
      from: { segment: discounted, advanceCharged: true },
      to: full,
    });
    // The rest of the month at the full fee, less the half of it that was paid.
    expect(amounts(change.lines)).toEqual([
      ["plan_fee", 16_129n],
      ["proration", -8_065n],
    ]);
  });

  test("an add-on carried at the same price isn't charged again", () => {
    const pro = segment(
      { version: 1, plan: "pro", addOns: [DEDICATED_IPS] },
      { contractEnd: OCT_12, superseded: true },
    );
    const scale = segment(
      { version: 1, plan: "scale", addOns: [DEDICATED_IPS] },
      { contractId: "bcon_b", contractStart: OCT_12, interval: { start: OCT_12, end: OCT.end } },
    );
    const change = composeContractChange({
      at: OCT_12,
      from: { segment: pro, advanceCharged: true, addOnsCharged: new Set(["dedicated_ips"]) },
      to: scale,
    });
    expect(amounts(change.lines)).toEqual([
      ["plan_fee", 16_129n],
      ["proration", -1_613n],
    ]);
  });

  test("a cheaper contract mid-period refunds nothing", () => {
    const scale = segment({ version: 1, plan: "scale" }, { contractEnd: OCT_12, superseded: true });
    const pro = segment(
      { version: 1, plan: "pro" },
      { contractId: "bcon_b", contractStart: OCT_12, interval: { start: OCT_12, end: OCT.end } },
    );
    const change = composeContractChange({
      at: OCT_12,
      from: { segment: scale, advanceCharged: true },
      to: pro,
    });
    expect(change.lines).toEqual([]);
    expect(change.grants).toEqual([]);
    expect(change.warnings).toHaveLength(1);
  });
});

describe("sales contracts", () => {
  const enterprise: ContractTermsInput = {
    version: 1,
    plan: "enterprise",
    fee: { amountCents: "200000", interval: "month", timing: "advance" },
    rates: {
      "email.recipients": {
        default: { mode: "graduated", tiers: [{ upTo: null, unitNanos: "200000" }] },
      },
    },
  };

  test("custom rates replace list prices", () => {
    const invoice = composePeriodInvoice({
      closed: { period: OCT, segments: [segment(enterprise)], usage: [usage(5_000_000)] },
      next: null,
      grants: [],
    });
    expect(amounts(invoice.lines)).toEqual([["usage", 100_000n]]); // 5M × $0.0002
  });

  test("a discount on list prices", () => {
    const invoice = composePeriodInvoice({
      closed: {
        period: OCT,
        segments: [
          segment({
            version: 1,
            plan: "scale",
            rates: { "email.recipients": { discountPercent: 20 } },
          }),
        ],
        usage: [usage(1_000_000)],
      },
      next: null,
      grants: [],
    });
    expect(amounts(invoice.lines)).toEqual([
      ["usage", 40_000n],
      ["discount", -8_000n],
    ]);
  });

  test("a discount that ended before the segment no longer applies", () => {
    const invoice = composePeriodInvoice({
      closed: {
        period: OCT,
        segments: [
          segment({
            version: 1,
            plan: "pro",
            discounts: [
              { scope: "usage", percent: 50, until: "2026-10-01T00:00:00Z" },
              { scope: "fees", percent: 10 },
            ],
          }),
        ],
        usage: [usage(100_000)],
      },
      next: {
        period: NOV,
        segment: segment(
          { version: 1, plan: "pro", discounts: [{ scope: "fees", percent: 10 }] },
          { interval: NOV },
        ),
      },
      grants: [],
    });
    expect(amounts(invoice.lines)).toEqual([
      ["usage", 4_000n],
      ["plan_fee", 2_500n],
      ["discount", -250n],
    ]);
  });

  test("a monthly minimum spend bills its shortfall", () => {
    const invoice = composePeriodInvoice({
      closed: {
        period: OCT,
        segments: [
          segment({
            ...enterprise,
            commitments: [
              {
                id: "min",
                kind: "minimum_spend",
                amountCents: "300000",
                period: "month",
                counts: "usage",
              },
            ],
          }),
        ],
        usage: [usage(5_000_000)], // $1,000
      },
      next: null,
      grants: [],
    });
    expect(amounts(invoice.lines)).toEqual([
      ["usage", 100_000n],
      ["commitment_shortfall", 200_000n],
    ]);
  });

  test("an annual minimum spend counts the year's history and settles in its last month", () => {
    const contractStart = new Date("2025-11-01T00:00:00Z");
    const commitment: ContractTermsInput = {
      ...enterprise,
      commitments: [
        {
          id: "annual",
          kind: "minimum_spend",
          amountCents: "5000000",
          period: "year",
          counts: "usage",
        },
      ],
    };
    const history = Array.from({ length: 11 }, (_, i) => ({
      contractId: "bcon_a",
      month: addMonths(contractStart, i),
      usageCents: { "email.recipients": 400_000n },
      feeCents: 200_000n,
    }));
    const october = composePeriodInvoice({
      closed: {
        period: OCT,
        segments: [segment(commitment, { contractStart })],
        usage: [usage(1_000_000)],
        history,
      },
      next: null,
      grants: [],
    });
    // 11 × $4,000 + $200 = $44,200 of $50,000.
    expect(amounts(october.lines)).toEqual([
      ["usage", 20_000n],
      ["commitment_shortfall", 580_000n],
    ]);
    const september = composePeriodInvoice({
      closed: {
        period: { start: new Date("2026-09-01T00:00:00Z"), end: OCT.start },
        segments: [
          segment(commitment, {
            contractStart,
            interval: { start: new Date("2026-09-01T00:00:00Z"), end: OCT.start },
          }),
        ],
        usage: [usage(1, { at: new Date("2026-09-03T00:00:00Z") })],
        history,
      },
      next: null,
      grants: [],
    });
    expect(september.lines.some((line) => line.kind === "commitment_shortfall")).toBe(false);
  });

  test("committed SMS volume: units first, then the overage rate; installments each month", () => {
    const sms: ContractTermsInput = {
      ...enterprise,
      rates: {
        "sms.segments": {
          byDimension: {
            "country=US": { mode: "graduated", tiers: [{ upTo: null, unitNanos: "12000000" }] },
          },
        },
      },
      commitments: [
        {
          id: "sms",
          kind: "prepaid_units",
          meter: "sms.segments",
          dimension: "country=US",
          units: 1_000_000,
          unitNanos: "10000000",
          period: "month",
          schedule: "monthly",
          rollover: false,
        },
      ],
    };
    const contract = segment(sms);
    const invoice = composePeriodInvoice({
      closed: {
        period: OCT,
        segments: [contract],
        usage: [usage(1_200_000, { meter: "sms.segments", dimension: "country=US" })],
      },
      next: { period: NOV, segment: { ...contract, interval: NOV } },
      grants: [
        grant({
          id: "bcg_sms",
          kind: "units",
          meter: "sms.segments",
          dimension: "country=US",
          remaining: 1_000_000n,
        }),
      ],
    });
    expect(amounts(invoice.lines)).toEqual([
      ["usage", 240_000n], // 200k × $0.012
      ["plan_fee", 200_000n],
      ["commitment_fee", 1_000_000n], // 1M × $0.01, for November
    ]);
    expect(invoice.grants.map((g) => [g.kind, g.amount, g.meter])).toEqual([
      ["amount", 200_000n, null],
      ["units", 1_000_000n, "sms.segments"],
    ]);
  });

  test("an unpriced dimension is flagged, not charged", () => {
    const invoice = composePeriodInvoice({
      closed: {
        period: OCT,
        segments: [segment(enterprise)],
        usage: [usage(10, { meter: "sms.segments", dimension: "country=GB" })],
      },
      next: null,
      grants: [],
    });
    expect(amounts(invoice.lines)).toEqual([["usage", 0n]]);
    expect(invoice.warnings[0]).toContain("No price for SMS (GB)");
  });

  test("an annual prepaid commitment is invoiced upfront and granted for the year", () => {
    const contractStart = NOV.start;
    const contract = segment(
      {
        ...enterprise,
        fee: null,
        commitments: [
          {
            id: "prepaid",
            kind: "prepaid_spend",
            amountCents: "2400000",
            period: "year",
            schedule: "upfront",
            rollover: true,
          },
        ],
      },
      { contractStart, interval: NOV },
    );
    const invoice = composePeriodInvoice({
      closed: {
        period: OCT,
        segments: [segment({ version: 1, plan: "free" }, { contractId: null })],
        usage: [],
      },
      next: { period: NOV, segment: contract },
      grants: [],
    });
    expect(amounts(invoice.lines)).toEqual([["commitment_fee", 2_400_000n]]);
    expect(invoice.grants[0]).toMatchObject({
      amount: 2_400_000n,
      expiresAt: addMonths(NOV.start, 12),
      rolloverOf: "bcon_a:prepaid",
    });
  });

  test("annual volume tiers count the term so far", () => {
    const invoice = composePeriodInvoice({
      closed: {
        period: OCT,
        segments: [
          segment({
            ...enterprise,
            rates: {
              "email.recipients": {
                default: {
                  mode: "graduated",
                  tierWindow: "term",
                  tiers: [
                    { upTo: 1_000_000, unitNanos: "300000" },
                    { upTo: null, unitNanos: "200000" },
                  ],
                },
              },
            },
          }),
        ],
        usage: [usage(200_000)],
        termQuantities: [
          { contractId: "bcon_a", meter: "email.recipients", dimension: "", quantity: 900_000 },
        ],
      },
      next: null,
      grants: [],
    });
    // 100k × $0.0003 + 100k × $0.0002
    expect(amounts(invoice.lines)).toEqual([["usage", 5_000n]]);
  });

  test("a quarterly fee in arrears is billed at the quarter's end", () => {
    const contractStart = new Date("2026-08-01T00:00:00Z");
    const quarterly = segment(
      { ...enterprise, fee: { amountCents: "600000", interval: "quarter", timing: "arrears" } },
      { contractStart },
    );
    const invoice = composePeriodInvoice({
      closed: { period: OCT, segments: [quarterly], usage: [] },
      next: null,
      grants: [],
    });
    expect(amounts(invoice.lines)).toEqual([["plan_fee", 600_000n]]);
    const september = composePeriodInvoice({
      closed: {
        period: { start: new Date("2026-09-01T00:00:00Z"), end: OCT.start },
        segments: [
          { ...quarterly, interval: { start: new Date("2026-09-01T00:00:00Z"), end: OCT.start } },
        ],
        usage: [],
      },
      next: null,
      grants: [],
    });
    expect(september.lines).toEqual([]);
  });

  test("add-ons are charged on their own schedule and never become credit", () => {
    const contract = segment({
      version: 1,
      plan: "scale",
      addOns: [
        {
          key: "ip",
          name: "Dedicated IP",
          unitAmountCents: "4900",
          quantity: 2,
          interval: "month",
          timing: "advance",
        },
      ],
    });
    const invoice = composePeriodInvoice({
      closed: { period: OCT, segments: [contract], usage: [] },
      next: { period: NOV, segment: { ...contract, interval: NOV } },
      grants: [],
    });
    expect(amounts(invoice.lines)).toEqual([
      ["plan_fee", 25_000n],
      ["add_on", 9_800n],
    ]);
    expect(invoice.grants.map((g) => g.amount)).toEqual([25_000n]);
  });
});

describe("internal contracts", () => {
  test("are never charged", () => {
    const internal = { ...segment({ version: 1, plan: "enterprise" }), billable: false };
    const invoice = composePeriodInvoice({
      closed: { period: OCT, segments: [internal], usage: [usage(5_000_000)] },
      next: { period: NOV, segment: { ...internal, interval: NOV } },
      grants: [],
    });
    expect(invoice.totalCents).toBe(0n);
    expect(invoice.lines.map((line) => line.kind)).toEqual(["usage", "write_off"]);
  });
});
