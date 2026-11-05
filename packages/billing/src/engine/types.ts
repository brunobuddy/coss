/** The engine's inputs and outputs. The engine is pure: the database layer loads and stores. */
import type { MeterKey } from "../catalog/meters.ts";
import type { Interval } from "../time.ts";
import type { EffectiveTerms } from "./terms.ts";

export type ContractKind = "self_serve" | "sales" | "internal";

/** One contract's share of a billing period (or the Free plan, where no contract applies). */
export type Segment = {
  /** `null`: no contract, i.e. the Free plan. */
  contractId: string | null;
  /** Within the period, hour-aligned. */
  interval: Interval;
  terms: EffectiveTerms;
  /** The contract's `effective_from`: months (fees, commitments) are counted from its month. */
  contractStart: Date;
  /** The contract's `effective_until` (`null`: open-ended). */
  contractEnd: Date | null;
  /** End of the committed term (term commitments, `tierWindow: term`). */
  termEnd: Date | null;
  /**
   * It ends because a successor took over (an amendment or plan change): its commitments carry
   * over and aren't settled early.
   */
  superseded: boolean;
  /** `false` for internal contracts (coss.com's own organizations): nothing is ever charged. */
  billable?: boolean;
};

/** Usage of one meter (and dimension value) in one hour, summed over environments. */
export type UsageRow = { meter: MeterKey; dimension: string; hour: Date; quantity: number };

/** A credit grant's balance as of this invoice. */
export type GrantBalance = {
  id: string;
  kind: "amount" | "units";
  /** Unit grants: the meter (and optionally dimension value) they cover. */
  meter: MeterKey | null;
  dimension: string | null;
  /** Cents for amount grants, units for unit grants. */
  remaining: bigint;
  /** Amount grants: the meters they pay for (`null`: any). */
  scope: readonly MeterKey[] | null;
  /** `usage`: usage lines only; `any`: also fees, add-ons and shortfalls. */
  appliesTo: "usage" | "any";
  effectiveAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
  /** What the invoice calls it when it's drawn down (default: `Credit applied`). */
  lineDescription?: string;
};

/** What a contract was billed in an earlier month (from invoice lines), for commitments. */
export type SpendHistory = {
  contractId: string;
  month: Date;
  /** Usage charges after discounts, before credits. */
  usageCents: Partial<Record<MeterKey, bigint>>;
  feeCents: bigint;
};

/** Units of a meter a contract consumed in its term before this period (`tierWindow: term`). */
export type TermQuantity = {
  contractId: string;
  meter: MeterKey;
  dimension: string;
  quantity: number;
};

export type LineKind =
  | "plan_fee"
  | "proration"
  | "usage"
  | "credit"
  | "discount"
  | "commitment_fee"
  | "commitment_shortfall"
  | "add_on"
  | "adjustment"
  | "write_off";

export type DraftLine = {
  kind: LineKind;
  description: string;
  amountCents: bigint;
  /** The time this line charges for. */
  period: Interval;
  contractId: string | null;
  meter?: MeterKey;
  dimension?: string;
  quantity?: number;
  coveredUnits?: number;
  unitNanos?: bigint | null;
  grantId?: string;
  /**
   * Charges are idempotent across invoices by this key (a contract's fee for one interval is
   * charged once, whichever invoice gets there first). Unset for usage and credits.
   */
  chargeKey?: string;
  detail?: Record<string, unknown>;
};

export type GrantSource =
  | "fee"
  | "commitment"
  | "support"
  | "promotion"
  | "refund"
  | "sla"
  | "threshold";

export type DraftGrant = {
  /** Idempotency key: the same grant is never created twice. */
  key: string;
  kind: "amount" | "units";
  amount: bigint;
  meter: MeterKey | null;
  dimension: string | null;
  scope: readonly MeterKey[] | null;
  appliesTo: "usage" | "any";
  source: GrantSource;
  effectiveAt: Date;
  expiresAt: Date | null;
  contractId: string | null;
  description: string;
  /** `prepaid_spend`/`prepaid_units` with rollover: carry the previous grant's remainder. */
  rolloverOf?: string;
};

export type GrantApplication = { grantId: string; kind: "amount" | "units"; amount: bigint };

export type UsageTotal = { meter: MeterKey; dimension: string; quantity: number };

export type Composition = {
  lines: DraftLine[];
  grants: DraftGrant[];
  applications: GrantApplication[];
  /** Units per meter and dimension in the rated period. */
  usage: UsageTotal[];
  warnings: string[];
  totalCents: bigint;
};
