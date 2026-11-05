/**
 * Composes invoices. A month's invoice has:
 * - arrears for the closed month: usage rated across the month's contract segments, discounts,
 *   write-offs for capped plans, fees and add-ons billed in arrears, commitment shortfalls;
 * - advance charges for the next month: fees, add-ons and commitment installments, plus the credit
 *   grants they fund (a plan's fee becomes that month's usage credit);
 * - then credits drawn down against the charges.
 */
import { INTERVAL_MONTHS } from "../catalog/add-ons.ts";
import { formatDimension, METER_KEYS, METERS, type MeterKey } from "../catalog/meters.ts";
import { PLANS } from "../catalog/plans.ts";
import { rateFor } from "../catalog/rates.ts";
import { nanosToCents, percentOf, prorate } from "../money.ts";
import type { Commitment, Discount } from "../schemas.ts";
import {
  addMonths,
  contains,
  hoursIn,
  type Interval,
  intersect,
  monthIndex,
  monthStart,
  overlaps,
} from "../time.ts";
import { monthlyFeeCents } from "./terms.ts";
import { chargeRange, singleUnitPrice } from "./tiers.ts";
import type {
  Composition,
  DraftGrant,
  DraftLine,
  GrantApplication,
  GrantBalance,
  Segment,
  SpendHistory,
  TermQuantity,
  UsageRow,
  UsageTotal,
} from "./types.ts";

const FAR_FUTURE = new Date("9999-01-01T00:00:00Z");

/** A charge line and what offsets it before credits (discounts, write-offs). */
type Charge = { line: DraftLine; net: bigint; segment: Segment | null };

/** Charges and grants an earlier invoice already made (their keys), so they aren't made twice. */
export type AlreadyBilled = {
  chargeKeys?: ReadonlySet<string>;
  grantKeys?: ReadonlySet<string>;
};

class Draft {
  readonly lines: DraftLine[] = [];
  readonly charges: Charge[] = [];
  readonly grants: DraftGrant[] = [];
  readonly applications: GrantApplication[] = [];
  readonly warnings: string[] = [];

  constructor(readonly billed: AlreadyBilled = {}) {}

  charge(line: DraftLine, segment: Segment | null): Charge {
    if (line.chargeKey && this.billed.chargeKeys?.has(line.chargeKey)) {
      // Billed by an earlier invoice: nothing to add (offsets on it are no-ops).
      return { line, net: 0n, segment };
    }
    this.lines.push(line);
    const charge = { line, net: line.amountCents, segment };
    this.charges.push(charge);
    return charge;
  }

  grant(grant: DraftGrant): void {
    if (this.billed.grantKeys?.has(grant.key)) return;
    this.grants.push(grant);
  }

  /** A negative line offsetting `charge` (a discount or write-off). */
  offset(charge: Charge, line: DraftLine): void {
    const amount = line.amountCents > charge.net ? charge.net : line.amountCents;
    if (amount <= 0n) return;
    this.lines.push({ ...line, amountCents: -amount });
    charge.net -= amount;
  }

  result(usage: UsageTotal[]): Composition {
    const totalCents = this.lines.reduce((sum, line) => sum + line.amountCents, 0n);
    return {
      lines: this.lines,
      grants: this.grants,
      applications: this.applications,
      usage,
      warnings: this.warnings,
      totalCents,
    };
  }
}

export type ArrearsInput = {
  period: Interval;
  /** Contract segments covering the whole period, in order. */
  segments: readonly Segment[];
  usage: readonly UsageRow[];
  history?: readonly SpendHistory[];
  termQuantities?: readonly TermQuantity[];
};

export type AdvanceInput = {
  /** The month being started. */
  period: Interval;
  /** The contract in effect at its start (`null`: Free). */
  segment: Segment | null;
};

export type PeriodInvoiceInput = {
  closed: ArrearsInput;
  next: AdvanceInput | null;
  grants: readonly GrantBalance[];
  billed?: AlreadyBilled;
};

/** The invoice closing `closed` and opening `next` (`next: null` for an estimate). */
export function composePeriodInvoice(input: PeriodInvoiceInput): Composition {
  const draft = new Draft(input.billed);
  const usage = rateUsage(draft, input.closed, input.grants);
  arrearsCharges(draft, input.closed);
  if (input.next?.segment) advanceCharges(draft, input.next.period, input.next.segment);
  applyCredits(draft, input.grants, input.closed.period);
  return draft.result(usage);
}

// ---------------------------------------------------------------------------------------------
// Usage

type UsageKey = { meter: MeterKey; dimension: string; perSegment: number[] };

function rateUsage(
  draft: Draft,
  input: ArrearsInput,
  grants: readonly GrantBalance[],
): UsageTotal[] {
  const { period, segments } = input;
  if (!segments.length) throw new Error("A billing period needs at least one segment.");

  const keys = new Map<string, UsageKey>();
  for (const row of input.usage) {
    let index = segments.findIndex((segment) => contains(segment.interval, row.hour));
    if (index === -1) {
      draft.warnings.push(`Usage at ${row.hour.toISOString()} falls outside every segment.`);
      index = segments.length - 1;
    }
    const id = `${row.meter}|${row.dimension}`;
    let key = keys.get(id);
    if (!key) {
      key = { meter: row.meter, dimension: row.dimension, perSegment: segments.map(() => 0) };
      keys.set(id, key);
    }
    key.perSegment[index] = (key.perSegment[index] ?? 0) + row.quantity;
  }
  const ordered = [...keys.values()].sort(
    (a, b) =>
      METER_KEYS.indexOf(a.meter) - METER_KEYS.indexOf(b.meter) ||
      a.dimension.localeCompare(b.dimension),
  );

  // Included units are per period (never prorated): the most generous segment's allowance.
  const included = new Map<MeterKey, number>();
  for (const segment of segments) {
    for (const [meter, units] of Object.entries(segment.terms.includedUnits) as [
      MeterKey,
      number,
    ][]) {
      included.set(meter, Math.max(included.get(meter) ?? 0, units));
    }
  }
  const unitGrants = sortGrants(
    grants.filter(
      (grant) => grant.kind === "units" && grant.remaining > 0n && grantOverlaps(grant, period),
    ),
  ).map((grant) => ({ grant, remaining: grant.remaining }));

  const totals: UsageTotal[] = [];
  const termQuantity = new Map<string, number>();
  for (const row of input.termQuantities ?? []) {
    termQuantity.set(`${row.contractId}|${row.meter}|${row.dimension}`, row.quantity);
  }

  for (const key of ordered) {
    const total = key.perSegment.reduce((sum, quantity) => sum + quantity, 0);
    if (total <= 0) continue;
    totals.push({ meter: key.meter, dimension: key.dimension, quantity: total });

    // Covered units (included, then unit grants) take the period's first positions.
    let covered = Math.min(included.get(key.meter) ?? 0, total);
    included.set(key.meter, (included.get(key.meter) ?? 0) - covered);
    for (const entry of unitGrants) {
      if (covered >= total) break;
      const grant = entry.grant;
      if (grant.meter !== key.meter) continue;
      if (grant.dimension !== null && grant.dimension !== key.dimension) continue;
      const take = Math.min(Number(entry.remaining), total - covered);
      if (take <= 0) continue;
      entry.remaining -= BigInt(take);
      covered += take;
      draft.applications.push({ grantId: grant.id, kind: "units", amount: BigInt(take) });
    }

    let position = 0;
    const contractSoFar = new Map<string, number>();
    segments.forEach((segment, index) => {
      const quantity = key.perSegment[index] ?? 0;
      if (quantity <= 0) return;
      const coveredHere = Math.max(0, Math.min(quantity, covered - position));
      rateSegmentUsage(draft, {
        key,
        segment,
        quantity,
        coveredHere,
        position,
        periodTotal: total,
        termBefore:
          segment.contractId === null
            ? 0
            : (termQuantity.get(`${segment.contractId}|${key.meter}|${key.dimension}`) ?? 0) +
              (contractSoFar.get(segment.contractId) ?? 0),
      });
      if (segment.contractId !== null) {
        contractSoFar.set(
          segment.contractId,
          (contractSoFar.get(segment.contractId) ?? 0) + quantity,
        );
      }
      position += quantity;
    });
  }
  return totals;
}

function rateSegmentUsage(
  draft: Draft,
  input: {
    key: UsageKey;
    segment: Segment;
    quantity: number;
    coveredHere: number;
    /** Units of this key in earlier segments of the period. */
    position: number;
    periodTotal: number;
    /** Units of this key the segment's contract consumed earlier in its term. */
    termBefore: number;
  },
): void {
  const { key, segment, quantity, coveredHere } = input;
  const meter = METERS[key.meter];
  const rate = rateFor(segment.terms.rates[key.meter], key.dimension);
  const label = describeUsage(key.meter, key.dimension, quantity, coveredHere);
  const base: DraftLine = {
    kind: "usage",
    description: label,
    amountCents: 0n,
    period: segment.interval,
    contractId: segment.contractId,
    meter: key.meter,
    dimension: key.dimension,
    quantity,
    coveredUnits: coveredHere,
  };
  if (!rate) {
    draft.warnings.push(
      `No price for ${meter.label}${key.dimension ? ` (${formatDimension(key.dimension)})` : ""} on contract ${segment.contractId ?? "free"}; ${quantity} units were not charged.`,
    );
    draft.charge({ ...base, unitNanos: null, detail: { unpriced: true } }, segment);
    return;
  }

  const term = rate.tierWindow === "term" && segment.contractId !== null;
  const offset = term ? input.termBefore : input.position;
  const windowTotal = term ? input.termBefore + quantity : input.periodTotal;
  const range = chargeRange(rate, offset + coveredHere, offset + quantity, windowTotal);
  const charge = draft.charge(
    {
      ...base,
      amountCents: nanosToCents(range.amountNanos),
      unitNanos: singleUnitPrice(rate),
      detail: {
        mode: rate.mode,
        tierWindow: rate.tierWindow ?? "period",
        tiers: range.tiers.map((tier) => ({
          from: tier.from,
          to: tier.to,
          unitNanos: tier.unitNanos.toString(),
          amountNanos: tier.amountNanos.toString(),
        })),
      },
    },
    segment,
  );

  const meterDiscount = segment.terms.meterDiscounts[key.meter];
  if (meterDiscount) {
    draft.offset(charge, {
      ...discountLine(
        charge.line,
        meterDiscount,
        `${meterDiscount}% off ${meter.label} list prices`,
        "list",
      ),
    });
  }
  for (const discount of activeDiscounts(
    segment,
    (scope) => scope === "usage" || scope === key.meter,
  )) {
    draft.offset(
      charge,
      discountLine(
        charge.line,
        discount.percent,
        discountLabel(discount),
        discountSlot(segment, discount),
      ),
    );
  }
  if (segment.billable === false && charge.net > 0n) {
    draft.offset(charge, {
      kind: "write_off",
      description: "Internal account: usage is not charged",
      amountCents: charge.net,
      period: segment.interval,
      contractId: segment.contractId,
      meter: key.meter,
      dimension: key.dimension,
    });
  }
  if (segment.terms.overage === "blocked" && charge.net > 0n) {
    draft.offset(charge, {
      kind: "write_off",
      description: `${PLANS[segment.terms.plan].name} plan usage beyond its allowance is not charged`,
      amountCents: charge.net,
      period: segment.interval,
      contractId: segment.contractId,
      meter: key.meter,
      dimension: key.dimension,
    });
  }
}

function describeUsage(
  meter: MeterKey,
  dimension: string,
  quantity: number,
  covered: number,
): string {
  const definition = METERS[meter];
  const where = dimension ? ` (${formatDimension(dimension)})` : "";
  const units = quantity === 1 ? definition.unit : definition.units;
  const included = covered > 0 ? `, ${covered.toLocaleString("en-US")} included` : "";
  return `${definition.label}${where}: ${quantity.toLocaleString("en-US")} ${units}${included}`;
}

// ---------------------------------------------------------------------------------------------
// Fees, add-ons and commitments

/** `slot` names the discount among the charge's (its terms index): keys never collide. */
function discountLine(
  line: DraftLine,
  percent: number,
  description: string,
  slot: string,
): DraftLine {
  return {
    kind: "discount",
    description,
    amountCents: percentOf(line.amountCents, percent),
    period: line.period,
    contractId: line.contractId,
    meter: line.meter,
    dimension: line.dimension,
    chargeKey: line.chargeKey ? `${line.chargeKey}:discount:${slot}` : undefined,
  };
}

function discountSlot(segment: Segment, discount: Discount): string {
  return String(segment.terms.discounts.indexOf(discount));
}

function discountLabel(discount: Discount): string {
  return discount.description ?? `${discount.percent}% discount`;
}

function activeDiscounts(
  segment: Segment,
  matches: (scope: Discount["scope"]) => boolean,
): Discount[] {
  return segment.terms.discounts.filter(
    (discount) =>
      matches(discount.scope) && (!discount.until || segment.interval.start < discount.until),
  );
}

/** The interval of `months` months (from the contract's month) containing `month`'s start. */
function intervalAt(segment: Segment, month: Date, months: number): Interval {
  const k = monthIndex(segment.contractStart, month);
  const start = addMonths(monthStart(segment.contractStart), k - (k % months));
  return { start, end: addMonths(start, months) };
}

/** The key of a contract's fee for the fee interval containing `at` (whether it was charged). */
export function feeChargeKeyAt(segment: Segment, at: Date): string | null {
  const fee = segment.terms.fee;
  if (!fee) return null;
  return `fee:${segment.contractId}:${intervalAt(segment, at, INTERVAL_MONTHS[fee.interval]).start.toISOString()}`;
}

function sameMonthlyFee(a: Segment["terms"]["fee"], b: Segment["terms"]["fee"]): boolean {
  return (
    a !== null &&
    b !== null &&
    a.interval === "month" &&
    b.interval === "month" &&
    a.timing === b.timing &&
    a.amountCents === b.amountCents
  );
}

/** The key of a monthly fee's usage credit for the month containing `at`. */
export function feeCreditKeyAt(segment: Segment, at: Date): string {
  return `feecredit:${segment.contractId}:${monthStart(at).toISOString()}`;
}

/** `gross` less a segment's discounts on `scope` in effect, as its charges were discounted. */
function netOfDiscounts(segment: Segment, scope: "fees" | "add_ons", gross: bigint): bigint {
  let net = gross;
  for (const discount of activeDiscounts(segment, (candidate) => candidate === scope)) {
    const off = percentOf(gross, discount.percent);
    net -= off > net ? net : off;
  }
  return net;
}

/**
 * `segment` as it was when its advance charge for the `months`-month interval containing `at` was
 * made (at the interval's start, or the contract's if later): the discounts in effect then.
 */
function asCharged(segment: Segment, at: Date, months: number): Segment {
  const { start } = intervalAt(segment, at, months);
  return {
    ...segment,
    interval: {
      start: start < segment.contractStart ? segment.contractStart : start,
      end: segment.interval.end,
    },
  };
}

/** The percentages of a segment's discounts on `scope` in effect (what its charges pay). */
function discountPercents(segment: Segment, scope: "fees" | "add_ons"): string {
  return activeDiscounts(segment, (candidate) => candidate === scope)
    .map((discount) => discount.percent)
    .join(",");
}

/**
 * Whether a contract change keeps the replaced contract's fee for the month, once paid (the same
 * plan, monthly fee and fee discounts: only add-ons change), instead of charging it again and
 * crediting it back.
 */
export function feeCarriesOver(from: Segment, to: Segment): boolean {
  return (
    from.terms.plan === to.terms.plan &&
    sameMonthlyFee(from.terms.fee, to.terms.fee) &&
    discountPercents(asCharged(from, to.interval.start, 1), "fees") === discountPercents(to, "fees")
  );
}

type AddOnLine = Segment["terms"]["addOns"][number];

/**
 * Whether a monthly in-advance add-on of `from`, once paid, carries over to `to`'s `after` (the
 * same price and add-on discounts).
 */
export function addOnCarriesOver(
  from: Segment,
  before: AddOnLine,
  to: Segment,
  after: AddOnLine,
): boolean {
  return (
    discountPercents(asCharged(from, to.interval.start, 1), "add_ons") ===
      discountPercents(to, "add_ons") &&
    before.key === after.key &&
    after.timing === "advance" &&
    after.interval === "month" &&
    before.interval === "month" &&
    before.timing === "advance" &&
    before.unitAmountCents * BigInt(before.quantity) ===
      after.unitAmountCents * BigInt(after.quantity)
  );
}

/** The key of a contract's add-on charge for the add-on interval containing `at`. */
export function addOnChargeKeyAt(
  segment: Segment,
  addOn: Segment["terms"]["addOns"][number],
  at: Date,
): string {
  const interval = intervalAt(segment, at, INTERVAL_MONTHS[addOn.interval]);
  return `addon:${segment.contractId}:${addOn.key}:${interval.start.toISOString()}`;
}

function contractRange(segment: Segment): Interval {
  return { start: segment.contractStart, end: segment.contractEnd ?? FAR_FUTURE };
}

/** `amount` for the part of `interval` the contract covers. */
function coveredAmount(segment: Segment, interval: Interval, amount: bigint): bigint {
  const covered = intersect(interval, contractRange(segment));
  if (!covered) return 0n;
  return prorate(amount, hoursIn(covered), hoursIn(interval));
}

function termMonths(segment: Segment): number | null {
  if (!segment.termEnd) return null;
  return monthIndex(segment.contractStart, new Date(segment.termEnd.getTime() - 1)) + 1;
}

function commitmentMonths(segment: Segment, commitment: Commitment): number | null {
  if (commitment.period === "term") return termMonths(segment);
  return { month: 1, quarter: 3, year: 12 }[commitment.period];
}

function endsWithin(segment: Segment, period: Interval): boolean {
  return segment.contractEnd !== null && segment.contractEnd <= period.end;
}

function arrearsCharges(draft: Draft, input: ArrearsInput): void {
  const { period } = input;
  for (const segment of input.segments) {
    if (segment.contractId === null || segment.billable === false) continue;
    const k = monthIndex(segment.contractStart, period.start);
    const ending = endsWithin(segment, period);
    const terms = segment.terms;

    if (terms.fee?.timing === "arrears") {
      const months = INTERVAL_MONTHS[terms.fee.interval];
      if ((k + 1) % months === 0 || ending) {
        const interval = intervalAt(segment, period.start, months);
        feeCharge(draft, segment, interval, terms.fee.amountCents, "arrears");
      }
    }
    for (const addOn of terms.addOns) {
      if (addOn.timing !== "arrears") continue;
      const months = INTERVAL_MONTHS[addOn.interval];
      if ((k + 1) % months === 0 || ending) {
        addOnCharge(draft, segment, intervalAt(segment, period.start, months), addOn);
      }
    }
    for (const commitment of terms.commitments) {
      if (commitment.kind !== "minimum_spend") continue;
      const months = commitmentMonths(segment, commitment);
      if (months === null) {
        draft.warnings.push(
          `Commitment ${commitment.id} is per term, but contract ${segment.contractId} has no term end.`,
        );
        continue;
      }
      if ((k + 1) % months !== 0 && !(ending && !segment.superseded)) continue;
      settleMinimum(draft, segment, commitment, k - (k % months), k, input.history ?? []);
    }
  }
}

function feeCharge(
  draft: Draft,
  segment: Segment,
  interval: Interval,
  amountCents: bigint,
  timing: "advance" | "arrears",
): void {
  const amount = coveredAmount(segment, interval, amountCents);
  if (amount <= 0n) return;
  const covered = intersect(interval, contractRange(segment)) ?? interval;
  const prorated = amount !== amountCents;
  const plan = PLANS[segment.terms.plan].name;
  const charge = draft.charge(
    {
      kind: "plan_fee",
      description: `${plan} plan${prorated ? " (prorated)" : ""}${timing === "arrears" ? " (in arrears)" : ""}`,
      amountCents: amount,
      period: covered,
      contractId: segment.contractId,
      chargeKey: `fee:${segment.contractId}:${interval.start.toISOString()}`,
    },
    segment,
  );
  for (const discount of activeDiscounts(segment, (scope) => scope === "fees")) {
    draft.offset(
      charge,
      discountLine(
        charge.line,
        discount.percent,
        discountLabel(discount),
        discountSlot(segment, discount),
      ),
    );
  }
}

function addOnCharge(
  draft: Draft,
  segment: Segment,
  interval: Interval,
  addOn: Segment["terms"]["addOns"][number],
): void {
  const amount = coveredAmount(segment, interval, addOn.unitAmountCents * BigInt(addOn.quantity));
  if (amount <= 0n) return;
  const covered = intersect(interval, contractRange(segment)) ?? interval;
  const charge = draft.charge(
    {
      kind: "add_on",
      description: addOn.quantity > 1 ? `${addOn.name} × ${addOn.quantity}` : addOn.name,
      amountCents: amount,
      period: covered,
      contractId: segment.contractId,
      quantity: addOn.quantity,
      chargeKey: `addon:${segment.contractId}:${addOn.key}:${interval.start.toISOString()}`,
    },
    segment,
  );
  for (const discount of activeDiscounts(segment, (scope) => scope === "add_ons")) {
    draft.offset(
      charge,
      discountLine(
        charge.line,
        discount.percent,
        discountLabel(discount),
        discountSlot(segment, discount),
      ),
    );
  }
}

/** Bills what a minimum-spend commitment's months `[first, last]` fell short of. */
function settleMinimum(
  draft: Draft,
  segment: Segment,
  commitment: Extract<Commitment, { kind: "minimum_spend" }>,
  first: number,
  last: number,
  history: readonly SpendHistory[],
): void {
  const contractMonth = monthStart(segment.contractStart);
  const firstMonth = addMonths(contractMonth, first);
  const lastMonth = addMonths(contractMonth, last);
  const counts = (meter: MeterKey | undefined) =>
    !commitment.meters || (meter !== undefined && commitment.meters.includes(meter));

  let eligible = 0n;
  for (const row of history) {
    if (row.contractId !== segment.contractId) continue;
    if (row.month < firstMonth || row.month > lastMonth) continue;
    for (const [meter, cents] of Object.entries(row.usageCents) as [MeterKey, bigint][]) {
      if (counts(meter)) eligible += cents;
    }
    if (commitment.counts === "usage_and_fees") eligible += row.feeCents;
  }
  for (const charge of draft.charges) {
    if (charge.line.contractId !== segment.contractId) continue;
    if (charge.line.kind === "usage" && counts(charge.line.meter)) eligible += charge.net;
    if (commitment.counts === "usage_and_fees" && charge.line.kind === "plan_fee") {
      eligible += charge.net;
    }
  }

  // A contract that started inside the window owes its share of it (one that ends early owes
  // it all: that's an early termination).
  const window: Interval = { start: firstMonth, end: addMonths(lastMonth, 1) };
  const served = intersect(window, { start: segment.contractStart, end: FAR_FUTURE });
  const committed = served
    ? prorate(commitment.amountCents, hoursIn(served), hoursIn(window))
    : commitment.amountCents;
  const shortfall = committed - eligible;
  if (shortfall <= 0n) return;
  draft.charge(
    {
      kind: "commitment_shortfall",
      description: `Minimum commitment shortfall (${commitment.id})`,
      amountCents: shortfall,
      period: { start: firstMonth, end: addMonths(lastMonth, 1) },
      contractId: segment.contractId,
      chargeKey: `shortfall:${segment.contractId}:${commitment.id}:${firstMonth.toISOString()}`,
      detail: {
        commitmentId: commitment.id,
        committedCents: committed.toString(),
        eligibleCents: eligible.toString(),
      },
    },
    segment,
  );
}

/** Charges and grants due at the start of `period` for the contract in effect then. */
function advanceCharges(draft: Draft, period: Interval, segment: Segment): void {
  if (segment.contractId === null || segment.billable === false) return;
  const k = monthIndex(segment.contractStart, period.start);
  if (k < 0) return;
  const terms = segment.terms;

  if (terms.fee) {
    const months = INTERVAL_MONTHS[terms.fee.interval];
    if (terms.fee.timing === "advance" && k % months === 0) {
      feeCharge(
        draft,
        segment,
        intervalAt(segment, period.start, months),
        terms.fee.amountCents,
        "advance",
      );
    }
    if (terms.feeCredit.spendable) feeCreditGrant(draft, segment, period, k);
  }
  for (const addOn of terms.addOns) {
    const months = INTERVAL_MONTHS[addOn.interval];
    if (addOn.timing === "advance" && k % months === 0) {
      addOnCharge(draft, segment, intervalAt(segment, period.start, months), addOn);
    }
  }
  for (const commitment of terms.commitments) {
    if (commitment.kind === "minimum_spend") continue;
    prepaidCommitment(draft, segment, period, k, commitment);
  }
}

/** The fee's usage credit for the month (`pool: month`) or the whole interval (`pool: interval`). */
function feeCreditGrant(draft: Draft, segment: Segment, period: Interval, k: number): void {
  const fee = segment.terms.fee;
  if (!fee) return;
  const plan = PLANS[segment.terms.plan].name;
  if (segment.terms.feeCredit.pool === "month" || fee.interval === "month") {
    const amount = coveredAmount(segment, period, monthlyFeeCents(fee));
    pushFeeGrant(draft, segment, period, amount, `${plan} plan usage credit`);
    return;
  }
  const months = INTERVAL_MONTHS[fee.interval];
  if (k % months !== 0) return;
  const interval = intervalAt(segment, period.start, months);
  pushFeeGrant(
    draft,
    segment,
    interval,
    coveredAmount(segment, interval, fee.amountCents),
    `${plan} plan usage credit`,
  );
}

function pushFeeGrant(
  draft: Draft,
  segment: Segment,
  interval: Interval,
  amount: bigint,
  description: string,
): void {
  if (amount <= 0n) return;
  const covered = intersect(interval, contractRange(segment)) ?? interval;
  draft.grant({
    key: `feecredit:${segment.contractId}:${interval.start.toISOString()}`,
    kind: "amount",
    amount,
    meter: null,
    dimension: null,
    scope: null,
    appliesTo: "usage",
    source: "fee",
    effectiveAt: covered.start,
    expiresAt: covered.end,
    contractId: segment.contractId,
    description,
  });
}

function prepaidCommitment(
  draft: Draft,
  segment: Segment,
  period: Interval,
  k: number,
  commitment: Exclude<Commitment, { kind: "minimum_spend" }>,
): void {
  const months = commitmentMonths(segment, commitment);
  if (months === null) {
    draft.warnings.push(
      `Commitment ${commitment.id} is per term, but contract ${segment.contractId} has no term end.`,
    );
    return;
  }
  const first = k - (k % months);
  const contractMonth = monthStart(segment.contractStart);
  const interval = {
    start: addMonths(contractMonth, first),
    end: addMonths(contractMonth, first + months),
  };
  const covered = intersect(interval, contractRange(segment)) ?? interval;
  const totalCents =
    commitment.kind === "prepaid_spend"
      ? commitment.amountCents
      : nanosToCents(BigInt(commitment.units) * commitment.unitNanos);

  if (k === first) {
    const units = commitment.kind === "prepaid_units";
    draft.grant({
      key: `commitment:${segment.contractId}:${commitment.id}:${interval.start.toISOString()}`,
      kind: units ? "units" : "amount",
      // A rollover's remainder is added when the grant is stored (after this invoice's drawdown).
      amount: units ? BigInt(commitment.units) : commitment.amountCents,
      meter: units ? commitment.meter : null,
      dimension: units ? (commitment.dimension ?? null) : null,
      scope: units ? null : (commitment.meters ?? null),
      appliesTo: "usage",
      source: "commitment",
      effectiveAt: covered.start,
      expiresAt: covered.end,
      contractId: segment.contractId,
      description: units
        ? `Committed ${METERS[commitment.meter].label} volume (${commitment.id})`
        : `Prepaid commitment (${commitment.id})`,
      rolloverOf: commitment.rollover ? `${segment.contractId}:${commitment.id}` : undefined,
    });
  }

  // Installments: all at once, monthly, or quarterly over the commitment's months.
  const step =
    commitment.schedule === "upfront"
      ? months
      : commitment.schedule === "quarterly"
        ? Math.min(3, months)
        : 1;
  if ((k - first) % step !== 0) return;
  const installments = Math.ceil(months / step);
  const index = (k - first) / step;
  const each = totalCents / BigInt(installments);
  const amount = index === installments - 1 ? totalCents - each * BigInt(installments - 1) : each;
  if (amount <= 0n) return;
  draft.charge(
    {
      kind: "commitment_fee",
      description:
        installments > 1
          ? `Commitment ${commitment.id} (installment ${index + 1} of ${installments})`
          : `Commitment ${commitment.id}`,
      amountCents: amount,
      period: interval,
      contractId: segment.contractId,
      chargeKey: `commitfee:${segment.contractId}:${commitment.id}:${period.start.toISOString()}`,
      detail: { commitmentId: commitment.id },
    },
    segment,
  );
}

// ---------------------------------------------------------------------------------------------
// Credits

function grantOverlaps(grant: GrantBalance, period: Interval): boolean {
  return overlaps(period, { start: grant.effectiveAt, end: grant.expiresAt ?? FAR_FUTURE });
}

/** Most specific first (a scoped grant before a general one), then soonest to expire, then oldest. */
function sortGrants<T extends GrantBalance>(grants: readonly T[]): T[] {
  return [...grants].sort((a, b) => {
    const scopeA = a.scope === null && a.dimension === null ? 1 : 0;
    const scopeB = b.scope === null && b.dimension === null ? 1 : 0;
    if (scopeA !== scopeB) return scopeA - scopeB;
    const expiryA = (a.expiresAt ?? FAR_FUTURE).getTime();
    const expiryB = (b.expiresAt ?? FAR_FUTURE).getTime();
    if (expiryA !== expiryB) return expiryA - expiryB;
    return a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
  });
}

function applyCredits(draft: Draft, grants: readonly GrantBalance[], period: Interval): void {
  const usable = sortGrants(
    grants.filter(
      (grant) => grant.kind === "amount" && grant.remaining > 0n && grantOverlaps(grant, period),
    ),
  );
  for (const grant of usable) {
    let left = grant.remaining;
    let applied = 0n;
    for (const charge of draft.charges) {
      if (left <= 0n) break;
      if (charge.net <= 0n) continue;
      const usage = charge.line.kind === "usage";
      if (!usage && grant.appliesTo !== "any") continue;
      if (grant.scope && !(usage && charge.line.meter && grant.scope.includes(charge.line.meter))) {
        continue;
      }
      const take = charge.net < left ? charge.net : left;
      charge.net -= take;
      left -= take;
      applied += take;
    }
    if (applied <= 0n) continue;
    draft.lines.push({
      kind: "credit",
      description: grant.lineDescription ?? "Credit applied",
      amountCents: -applied,
      period,
      contractId: null,
      grantId: grant.id,
    });
    draft.applications.push({ grantId: grant.id, kind: "amount", amount: applied });
  }
}

// ---------------------------------------------------------------------------------------------
// Contract changes inside a period

export type ContractChangeInput = {
  /** When the new contract takes effect (hour-aligned). */
  at: Date;
  /**
   * The contract being replaced (`null`: Free), whether its advance fee for `at`'s interval was
   * charged, and the keys of its add-ons whose advance charge for `at`'s interval was.
   */
  from: { segment: Segment; advanceCharged: boolean; addOnsCharged?: ReadonlySet<string> } | null;
  /** The new contract, starting at `at`. */
  to: Segment;
  billed?: AlreadyBilled;
};

/**
 * What a contract starting mid-period costs right away: its fee and add-ons for the rest of the
 * current interval, less the unused part of what the replaced contract was charged in advance;
 * the difference in usage credit; and its commitments' first installments and grants. A change
 * that costs less is not refunded (self-serve downgrades wait for the period's end).
 */
export function composeContractChange(input: ContractChangeInput): Composition {
  const draft = new Draft(input.billed);
  const { at, to } = input;
  const month: Interval = { start: monthStart(at), end: addMonths(monthStart(at), 1) };
  const from = input.from;
  const fromAdvance = from?.advanceCharged ? from.segment : null;
  // The same plan and monthly fee, already paid for this month (e.g. only an add-on changes):
  // the fee carries over instead of being charged again and credited back.
  const feeCarries = fromAdvance !== null && feeCarriesOver(fromAdvance, to);

  if (to.terms.fee?.timing === "advance" && !feeCarries) {
    const months = INTERVAL_MONTHS[to.terms.fee.interval];
    feeCharge(draft, to, intervalAt(to, at, months), to.terms.fee.amountCents, "advance");
  }
  const carried = new Set<string>();
  for (const addOn of to.terms.addOns) {
    if (addOn.timing !== "advance") continue;
    const before = from?.segment.terms.addOns.find((line) => line.key === addOn.key);
    if (
      before &&
      from?.addOnsCharged?.has(addOn.key) &&
      addOnCarriesOver(from.segment, before, to, addOn)
    ) {
      // Already paid for this month at the same price: it carries over too.
      carried.add(addOn.key);
      continue;
    }
    addOnCharge(draft, to, intervalAt(to, at, INTERVAL_MONTHS[addOn.interval]), addOn);
  }
  if (fromAdvance?.terms.fee?.timing === "advance" && !feeCarries) {
    const months = INTERVAL_MONTHS[fromAdvance.terms.fee.interval];
    const interval = intervalAt(fromAdvance, at, months);
    // The replaced contract now ends at `at`; what it was charged for after that is unused.
    const unused = intersect(interval, { start: at, end: FAR_FUTURE });
    if (unused) {
      // What it was charged: the fee less the replaced contract's fee discounts at the time.
      const paid = netOfDiscounts(
        asCharged(fromAdvance, at, months),
        "fees",
        fromAdvance.terms.fee.amountCents,
      );
      const amount = prorate(paid, hoursIn(unused), hoursIn(interval));
      if (amount > 0n) {
        draft.charge(
          {
            kind: "proration",
            description: `Unused time on ${PLANS[fromAdvance.terms.plan].name} plan`,
            amountCents: -amount,
            period: unused,
            contractId: fromAdvance.contractId,
            chargeKey: `unused:${fromAdvance.contractId}:${at.toISOString()}`,
          },
          fromAdvance,
        );
      }
    }
  }
  if (from) {
    for (const addOn of from.segment.terms.addOns) {
      if (addOn.timing !== "advance" || carried.has(addOn.key)) continue;
      if (!from.addOnsCharged?.has(addOn.key)) continue;
      const interval = intervalAt(from.segment, at, INTERVAL_MONTHS[addOn.interval]);
      const unused = intersect(interval, { start: at, end: FAR_FUTURE });
      if (!unused) continue;
      // What it was charged: its price less the replaced contract's add-on discounts at the time.
      const paid = netOfDiscounts(
        asCharged(from.segment, at, INTERVAL_MONTHS[addOn.interval]),
        "add_ons",
        addOn.unitAmountCents * BigInt(addOn.quantity),
      );
      const amount = prorate(paid, hoursIn(unused), hoursIn(interval));
      if (amount <= 0n) continue;
      draft.charge(
        {
          kind: "proration",
          description: `Unused time on ${addOn.name}`,
          amountCents: -amount,
          period: unused,
          contractId: from.segment.contractId,
          chargeKey: `unused-addon:${from.segment.contractId}:${addOn.key}:${at.toISOString()}`,
        },
        from.segment,
      );
    }
  }

  const net = draft.lines.reduce((sum, line) => sum + line.amountCents, 0n);
  if (net < 0n) {
    draft.lines.length = 0;
    draft.charges.length = 0;
    draft.warnings.push(
      "The new contract costs less for the rest of the period; nothing is refunded.",
    );
  }

  // Credit: the new contract's monthly credit for the rest of the month, less what the replaced
  // contract's (already granted) credit covers for the same time. Also when the fee carries over:
  // its credit may not have been spendable before.
  if (to.terms.fee && to.terms.feeCredit.spendable) {
    const rest: Interval = { start: at, end: month.end };
    const fraction = (fee: bigint) => prorate(fee, hoursIn(rest), hoursIn(month));
    const gained = fraction(monthlyFeeCents(to.terms.fee));
    const held =
      fromAdvance?.terms.fee && fromAdvance.terms.feeCredit.spendable
        ? fraction(monthlyFeeCents(fromAdvance.terms.fee))
        : 0n;
    const amount = gained - held;
    if (amount > 0n) {
      draft.grant({
        key: `feecredit:${to.contractId}:${month.start.toISOString()}`,
        kind: "amount",
        amount,
        meter: null,
        dimension: null,
        scope: null,
        appliesTo: "usage",
        source: "fee",
        effectiveAt: at,
        expiresAt: month.end,
        contractId: to.contractId,
        description: `${PLANS[to.terms.plan].name} plan usage credit`,
      });
    }
  }

  for (const commitment of to.terms.commitments) {
    if (commitment.kind === "minimum_spend") continue;
    prepaidCommitment(draft, to, month, monthIndex(to.contractStart, at), commitment);
  }
  return draft.result([]);
}
