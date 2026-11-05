/**
 * Contract terms: everything a deal can change, as data (`billing_contract.terms`). A self-serve
 * contract stores just `{ version: 1, plan }` and follows the plan's list prices; a sales contract
 * pins whatever it overrides. Amounts are bigints, stored in jsonb as decimal strings
 * (`stringifyWithBigInt`) and parsed back by these schemas. Client-safe: zod only.
 */
import { z } from "zod";
import type { AddOnDefinition, BillingInterval } from "./catalog/add-ons.ts";
import { FEATURE_KEYS, LIMIT_KEYS, RATE_LIMIT_KEYS } from "./catalog/entitlements.ts";
import { METER_KEYS } from "./catalog/meters.ts";
import { PLAN_KEYS } from "./catalog/plans.ts";

/** Recipients one send may have (`MAX_RECIPIENTS` in `@coss/email`): a per-second bucket's burst floor. */
const MIN_SEND_BURST = 50;
/** Rate limit rules are stored as int4 (`MAX_RULE_VALUE` in `@coss/ratelimit`). */
const MAX_RULE_VALUE = 2_147_483_647;

/** A non-negative bigint, written as a decimal string in JSON (a number or bigint is also accepted). */
export const amountSchema = z
  .union([
    z.bigint(),
    z.string().regex(/^\d{1,18}$/, "Must be a whole number."),
    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  ])
  .transform((value) => BigInt(value))
  .pipe(z.bigint().nonnegative());

export const meterKeySchema = z.enum(METER_KEYS);

/** `""` or sorted `name=value` pairs joined by `&` (`dimensionKey`). */
export const dimensionKeySchema = z
  .string()
  .max(200)
  .regex(/^(?:[a-z_]+=[^&=]+(?:&[a-z_]+=[^&=]+)*)?$/, "Must look like country=US.");

export const tierSchema = z.strictObject({
  upTo: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  unitNanos: amountSchema,
});

export const rateSchema = z
  .strictObject({
    mode: z.enum(["graduated", "volume"]),
    tiers: z.array(tierSchema).min(1).max(20),
    tierWindow: z.enum(["period", "term"]).optional(),
  })
  .superRefine((rate, ctx) => {
    let previous = 0;
    rate.tiers.forEach((tier, index) => {
      const last = index === rate.tiers.length - 1;
      if (last && tier.upTo !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["tiers", index, "upTo"],
          message: "The last tier must have no limit.",
        });
      }
      if (!last && tier.upTo === null) {
        ctx.addIssue({
          code: "custom",
          path: ["tiers", index, "upTo"],
          message: "Only the last tier can be unlimited.",
        });
      }
      if (tier.upTo !== null) {
        if (tier.upTo <= previous) {
          ctx.addIssue({
            code: "custom",
            path: ["tiers", index, "upTo"],
            message: "Tier limits must increase.",
          });
        }
        previous = tier.upTo;
      }
    });
  });

export const meterRatesSchema = z.strictObject({
  default: rateSchema.optional(),
  byDimension: z.record(dimensionKeySchema, rateSchema).optional(),
});

/** Either the meter's own rates (replacing the list prices) or a discount on the list prices. */
export const meterRateOverrideSchema = z.union([
  meterRatesSchema,
  z.strictObject({ discountPercent: z.number().gt(0).max(100) }),
]);

const intervalSchema = z.enum(["month", "quarter", "year"] satisfies BillingInterval[]);
const timingSchema = z.enum(["advance", "arrears"]);
const commitmentPeriodSchema = z.enum(["month", "quarter", "year", "term"]);
const scheduleSchema = z.enum(["upfront", "monthly", "quarterly"]);
const commitmentIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, "Use lowercase letters, digits, - and _.");

export const feeSchema = z.strictObject({
  amountCents: amountSchema,
  interval: intervalSchema,
  timing: timingSchema,
});

export const feeCreditSchema = z.strictObject({
  /** Whether the fee is credit spendable on usage (bill = max(fee, usage)). */
  spendable: z.boolean(),
  /** `month`: fee ÷ months each month, unused credit expires monthly; `interval`: the whole fee is one pool. */
  pool: z.enum(["month", "interval"]),
});

export const discountSchema = z.strictObject({
  scope: z.union([z.enum(["usage", "fees", "add_ons"]), meterKeySchema]),
  percent: z.number().gt(0).max(100),
  /** Applies to billing segments that start before this instant. */
  until: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .optional(),
  description: z.string().min(1).max(120).optional(),
});

export const commitmentSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    id: commitmentIdSchema,
    /** Usage (at contract rates, after discounts, before credits) of at least this much per period; the shortfall is invoiced. */
    kind: z.literal("minimum_spend"),
    amountCents: amountSchema,
    period: commitmentPeriodSchema,
    counts: z.enum(["usage", "usage_and_fees"]),
    meters: z.array(meterKeySchema).min(1).optional(),
  }),
  z.strictObject({
    id: commitmentIdSchema,
    /** Paid on a schedule and drawn down by usage as credit; what's left expires (or rolls over). */
    kind: z.literal("prepaid_spend"),
    amountCents: amountSchema,
    period: commitmentPeriodSchema,
    schedule: scheduleSchema,
    rollover: z.boolean(),
    meters: z.array(meterKeySchema).min(1).optional(),
  }),
  z.strictObject({
    id: commitmentIdSchema,
    /** A volume of one meter paid on a schedule at `unitNanos`; usage beyond it is billed at the contract's rates. */
    kind: z.literal("prepaid_units"),
    meter: meterKeySchema,
    dimension: dimensionKeySchema.optional(),
    units: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    unitNanos: amountSchema,
    period: commitmentPeriodSchema,
    schedule: scheduleSchema,
    rollover: z.boolean(),
  }),
]);

export const addOnSchema = z.strictObject({
  key: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/),
  name: z.string().trim().min(1).max(80),
  unitAmountCents: amountSchema,
  quantity: z.number().int().min(1).max(100_000),
  interval: intervalSchema,
  timing: timingSchema,
});

const rateLimitRuleSchema = z.strictObject({
  limit: z.number().int().min(1).max(MAX_RULE_VALUE),
  periodMs: z.number().int().min(1).max(MAX_RULE_VALUE),
  burst: z.number().int().min(1).max(MAX_RULE_VALUE).optional(),
});

const limitValueSchema = z.number().int().nonnegative().max(1_000_000).nullable();

export const entitlementOverridesSchema = z
  .strictObject({
    features: z.partialRecord(z.enum(FEATURE_KEYS), z.boolean()).optional(),
    limits: z.partialRecord(z.enum(LIMIT_KEYS), limitValueSchema).optional(),
    rateLimits: z.partialRecord(z.enum(RATE_LIMIT_KEYS), rateLimitRuleSchema).optional(),
  })
  .superRefine((overrides, ctx) => {
    const second = overrides.rateLimits?.["email.recipients.second"];
    if (second && (second.burst ?? second.limit) < MIN_SEND_BURST) {
      ctx.addIssue({
        code: "custom",
        path: ["rateLimits", "email.recipients.second", "burst"],
        message: `The burst must allow one send to its maximum of ${MIN_SEND_BURST} recipients.`,
      });
    }
  });

export const contractTermsSchema = z
  .strictObject({
    version: z.literal(1),
    plan: z.enum(PLAN_KEYS),
    /** `null`: no fee. Absent: the plan's monthly fee, in advance. */
    fee: feeSchema.nullable().optional(),
    feeCredit: feeCreditSchema.optional(),
    /** Units included every billing period (never prorated). Absent: the plan's. */
    includedUnits: z.partialRecord(meterKeySchema, z.number().int().nonnegative()).optional(),
    overage: z.enum(["billed", "blocked"]).optional(),
    rates: z.partialRecord(meterKeySchema, meterRateOverrideSchema).optional(),
    discounts: z.array(discountSchema).max(20).optional(),
    commitments: z.array(commitmentSchema).max(20).optional(),
    addOns: z.array(addOnSchema).max(20).optional(),
    entitlements: entitlementOverridesSchema.optional(),
    /** Hard limits per billing period (`null`: none). Absent: the included units when overage is blocked. */
    usageCaps: z
      .partialRecord(meterKeySchema, z.number().int().nonnegative().nullable())
      .optional(),
    /** `allHours`: the support clock runs 24x7. Parsing is strict: deploy before a contract sets it. */
    support: z.strictObject({ allHours: z.boolean() }).optional(),
  })
  .superRefine((terms, ctx) => {
    const ids = new Set<string>();
    terms.commitments?.forEach((commitment, index) => {
      if (ids.has(commitment.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["commitments", index, "id"],
          message: "Commitment ids must be unique.",
        });
      }
      ids.add(commitment.id);
    });
    const keys = new Set<string>();
    terms.addOns?.forEach((addOn, index) => {
      if (keys.has(addOn.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["addOns", index, "key"],
          message: "Add-on keys must be unique.",
        });
      }
      keys.add(addOn.key);
    });
  });

export type ContractTerms = z.output<typeof contractTermsSchema>;
export type ContractTermsInput = z.input<typeof contractTermsSchema>;
export type Commitment = ContractTerms["commitments"] extends (infer C)[] | undefined ? C : never;
export type Discount = z.output<typeof discountSchema>;
export type AddOn = z.output<typeof addOnSchema>;
export type Fee = z.output<typeof feeSchema>;
export type FeeCredit = z.output<typeof feeCreditSchema>;

/**
 * Terms a self-serve contract stores: everything else follows the plan, plus the catalog add-ons
 * bought (priced as they were when bought).
 */
export function selfServeTerms(
  plan: ContractTerms["plan"],
  addOns: readonly AddOn[] = [],
): ContractTerms {
  return addOns.length ? { version: 1, plan, addOns: [...addOns] } : { version: 1, plan };
}

/** The contract line of a catalog add-on (one unit, at today's list price). */
export function addOnTerms(addOn: AddOnDefinition): AddOn {
  return {
    key: addOn.key,
    name: addOn.name,
    unitAmountCents: addOn.unitAmountCents,
    quantity: 1,
    interval: addOn.interval,
    timing: addOn.timing,
  };
}

/** Parses stored or submitted terms; throws a `ZodError` when invalid. */
export function parseContractTerms(value: unknown): ContractTerms {
  return contractTermsSchema.parse(value);
}
