/**
 * Plan enforcement, wired by the apps into the product packages (`PlanGate`, `UsageGate`) and the
 * rate limiter (`planRateLimits`). coss.com's own organization is never limited.
 */
import { db, type Executor, schema } from "@coss/db";
import { and, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { ADD_ON_KEYS, ADD_ONS, type AddOnKey, addOnGranting } from "./catalog/add-ons.ts";
import {
  type Entitlements,
  FEATURE_LABELS,
  type FeatureKey,
  LIMIT_LABELS,
  type LimitKey,
  RATE_LIMIT_KEYS,
  type RateLimitRule,
} from "./catalog/entitlements.ts";
import { formatDimension, METERS, type MeterKey, meterAmount } from "./catalog/meters.ts";
import { PLAN_KEYS, PLANS, type PlanKey } from "./catalog/plans.ts";
import { meterAvailability, resolveTermsAt } from "./engine/terms.ts";
import { BillingError } from "./errors.ts";
import type { PlanGate, UsageGate } from "./gate.ts";
import { billingStateAt, creatableEntitlements } from "./resolve.ts";
import { parseContractTerms } from "./schemas.ts";
import { periodOf } from "./time.ts";

const { billingQuota } = schema;

/** The cheapest self-serve plan (or Enterprise) that has a feature, for messages. */
export function planWith(predicate: (entitlements: Entitlements) => boolean): PlanKey {
  return PLAN_KEYS.find((key) => predicate(PLANS[key].entitlements)) ?? "enterprise";
}

export function featureUnavailable(feature: FeatureKey): BillingError {
  const addOn = addOnGranting(feature);
  if (addOn) {
    const plans = addOn.plans.map((key) => PLANS[key].name).join(" and ");
    return new BillingError(
      "plan_feature_unavailable",
      `${FEATURE_LABELS[feature]} require the ${addOn.name} add-on (on the ${plans} plans).`,
    );
  }
  const plan = PLANS[planWith((e) => e.features[feature])].name;
  return new BillingError(
    "plan_feature_unavailable",
    `${FEATURE_LABELS[feature]} ${feature === "auditLog" ? "is" : "are"} available on the ${plan} plan and above.`,
  );
}

export function limitReached(limit: LimitKey, value: number): BillingError {
  return new BillingError(
    "plan_limit_reached",
    `Your plan allows ${value.toLocaleString("en-US")} ${LIMIT_LABELS[limit].toLowerCase()}. Upgrade to add more.`,
  );
}

/** What the organization may create now (see `creatableEntitlements`). */
export async function entitlementsFor(
  organizationId: string,
  now: Date = new Date(),
  executor: Executor = db,
): Promise<Entitlements> {
  return creatableEntitlements(await billingStateAt(organizationId, now, executor));
}

export function createPlanGate(opts: { systemOrganizationId?: string | null } = {}): PlanGate {
  const exempt = (organizationId: string) => organizationId === opts.systemOrganizationId;
  return {
    async requireFeature(organizationId, feature) {
      if (exempt(organizationId)) return;
      const entitlements = await entitlementsFor(organizationId);
      if (!entitlements.features[feature]) throw featureUnavailable(feature);
    },
    async requireCapacity(organizationId, limit, current, count = 1) {
      if (exempt(organizationId)) return;
      const value = (await entitlementsFor(organizationId)).limits[limit];
      if (value !== null && current + count > value) throw limitReached(limit, value);
    },
    async limit(organizationId, limit) {
      if (exempt(organizationId)) return null;
      return (await entitlementsFor(organizationId)).limits[limit];
    },
  };
}

type CapCache = Map<string, { capped: boolean; expiresAt: number }>;

/**
 * Hard per-period caps (Free's 3,000 emails), reserved in the send's transaction. Organizations
 * believed uncapped skip the database for `ttlMs`; capped ones read their plan on every send, so
 * an upgrade lifts the cap at once.
 */
export function createUsageGate(
  opts: { systemOrganizationId?: string | null; ttlMs?: number } = {},
): UsageGate {
  const ttlMs = opts.ttlMs ?? 60_000;
  const cache: CapCache = new Map();
  return {
    async reserve(tx, input) {
      if (input.quantity <= 0 || input.organizationId === opts.systemOrganizationId) return;
      const cacheKey = `${input.organizationId}:${input.meter}:${input.dimension ?? ""}`;
      const cached = cache.get(cacheKey);
      if (cached && !cached.capped && cached.expiresAt > Date.now()) return;
      const now = new Date();
      const state = await billingStateAt(input.organizationId, now, tx);
      const availability = meterAvailability(state.terms, input.meter, input.dimension);
      const label = METERS[input.meter].label;
      if (availability === "not_priced" && input.dimension) {
        throw new BillingError(
          "plan_feature_unavailable",
          `${label} to ${formatDimension(input.dimension)} isn't available.`,
        );
      }
      if (availability === "requires_commitment" || availability === "not_priced") {
        throw new BillingError(
          "plan_feature_unavailable",
          `${label} needs a contract. Contact sales.`,
        );
      }
      if (availability === "blocked" && !state.terms.includedUnits[input.meter]) {
        throw new BillingError("plan_feature_unavailable", `${label} isn't included in your plan.`);
      }
      const cap = state.terms.usageCaps[input.meter];
      cache.set(cacheKey, { capped: cap !== undefined, expiresAt: Date.now() + ttlMs });
      if (cap === undefined) return;
      await reserveUnderCap(tx, {
        organizationId: input.organizationId,
        meter: input.meter,
        quantity: input.quantity,
        cap,
        periodStart: periodOf(now).start,
        plan: state.terms.plan,
      });
    },
    async exhausted(organizationId, meter) {
      if (organizationId === opts.systemOrganizationId) return false;
      const cacheKey = `${organizationId}:${meter}:`;
      const cached = cache.get(cacheKey);
      if (cached && !cached.capped && cached.expiresAt > Date.now()) return false;
      const now = new Date();
      const { terms } = await billingStateAt(organizationId, now);
      if (meterAvailability(terms, meter) !== "available") return true;
      const cap = terms.usageCaps[meter];
      cache.set(cacheKey, { capped: cap !== undefined, expiresAt: Date.now() + ttlMs });
      if (cap === undefined) return false;
      return (await reservedThisPeriod(organizationId, meter, now)) >= cap;
    },
    async release(tx, input) {
      if (input.quantity <= 0) return;
      await tx
        .update(billingQuota)
        .set({
          reserved: sql`greatest(${billingQuota.reserved} - ${input.quantity}, 0)`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(billingQuota.organizationId, input.organizationId),
            eq(billingQuota.meter, input.meter),
            eq(billingQuota.periodStart, periodOf(input.reservedAt ?? new Date()).start),
          ),
        );
    },
  };
}

async function reserveUnderCap(
  tx: Executor,
  input: {
    organizationId: string;
    meter: MeterKey;
    quantity: number;
    cap: number;
    periodStart: Date;
    plan: PlanKey;
  },
): Promise<void> {
  // One statement: the row's lock serializes concurrent sends, so the cap can't be overshot.
  const reserved = await tx
    .insert(billingQuota)
    .values({
      organizationId: input.organizationId,
      meter: input.meter,
      periodStart: input.periodStart,
      reserved: input.quantity,
    })
    .onConflictDoUpdate({
      target: [billingQuota.organizationId, billingQuota.meter, billingQuota.periodStart],
      set: { reserved: sql`${billingQuota.reserved} + excluded.reserved`, updatedAt: new Date() },
      setWhere: sql`${billingQuota.reserved} + excluded.reserved <= ${input.cap}`,
    })
    .returning({ reserved: billingQuota.reserved });
  // Nothing returned: the update's condition failed. A first reservation over the cap was
  // inserted, but the error below rolls the send's transaction (and it) back.
  if (reserved[0] !== undefined && reserved[0].reserved <= input.cap) return;
  const meter = METERS[input.meter];
  throw new BillingError(
    "usage_limit_exceeded",
    input.cap === 0
      ? `${meter.label} isn't included in the ${PLANS[input.plan].name} plan. Upgrade to use it.`
      : `The ${PLANS[input.plan].name} plan includes ${meterAmount(input.meter, input.cap)} a month, and this would go past it. Upgrade to keep sending.`,
  );
}

/** Units reserved against a cap this period (dashboard progress). */
export async function reservedThisPeriod(
  organizationId: string,
  meter: MeterKey,
  now: Date = new Date(),
): Promise<number> {
  const [row] = await db
    .select({ reserved: billingQuota.reserved })
    .from(billingQuota)
    .where(
      and(
        eq(billingQuota.organizationId, organizationId),
        eq(billingQuota.meter, meter),
        eq(billingQuota.periodStart, periodOf(now).start),
      ),
    );
  return row?.reserved ?? 0;
}

/**
 * Whether a capped plan's allowance of a meter is used up this period, for pages that explain
 * what follows. `false` without a cap.
 */
export async function allowanceUsedUp(
  organizationId: string,
  meter: MeterKey,
  now: Date = new Date(),
): Promise<boolean> {
  const { terms } = await billingStateAt(organizationId, now);
  const cap = terms.usageCaps[meter];
  if (cap === undefined) return false;
  return (await reservedThisPeriod(organizationId, meter, now)) >= cap;
}

/**
 * The organization's plan rate limits, for `@coss/ratelimit`'s plan layer (an admin override
 * still wins). Keys are bucket names.
 */
export async function planRateLimits(
  organizationId: string,
  opts: { systemOrganizationId?: string | null } = {},
): Promise<Record<string, RateLimitRule>> {
  if (organizationId === opts.systemOrganizationId) return {};
  const { terms } = await billingStateAt(organizationId, new Date());
  const rules: Record<string, RateLimitRule> = {};
  for (const key of RATE_LIMIT_KEYS) rules[key] = terms.entitlements.rateLimits[key];
  return rules;
}

/**
 * Organizations whose contract in effect at `now` grants `feature` (from its plan, overrides or
 * catalog add-ons). For system-level reconciliation, e.g. provisioning dedicated IPs.
 */
export async function organizationsEntitledTo(
  feature: FeatureKey,
  opts: { now?: Date; scope?: { organizationIds: string[] } } = {},
  executor: Executor = db,
): Promise<string[]> {
  const now = opts.now ?? new Date();
  const contract = schema.billingContract;
  const plans = PLAN_KEYS.filter((key) => PLANS[key].entitlements.features[feature]);
  const addOns = ADD_ON_KEYS.filter((key) =>
    (ADD_ONS[key].features as readonly FeatureKey[]).includes(feature),
  );
  if (plans.includes("free")) throw new Error(`Every organization has ${feature}.`);
  // Candidates by SQL, decided by resolving their terms (an override can turn a feature off).
  const rows = await executor
    .select({ organizationId: contract.organizationId, terms: contract.terms })
    .from(contract)
    .where(
      and(
        eq(contract.status, "confirmed"),
        lte(contract.effectiveFrom, now),
        or(isNull(contract.effectiveUntil), gt(contract.effectiveUntil, now)),
        opts.scope ? inArray(contract.organizationId, opts.scope.organizationIds) : undefined,
        or(
          plans.length ? inArray(contract.plan, plans) : undefined,
          sql`${contract.terms} -> 'entitlements' -> 'features' ->> ${feature} = 'true'`,
          ...addOns.map(
            (key) => sql`${contract.terms} -> 'addOns' @> ${JSON.stringify([{ key }])}::jsonb`,
          ),
        ),
      ),
    );
  const entitled = rows.filter(
    (row) => resolveTermsAt(parseContractTerms(row.terms), now).entitlements.features[feature],
  );
  return [...new Set(entitled.map((row) => row.organizationId))];
}

/**
 * Organizations with a pending (unpaid) change that adds catalog add-on `key` to a contract that
 * doesn't have it yet: purchases that capacity must be kept for.
 */
export async function organizationsBuyingAddOn(
  key: AddOnKey,
  now: Date = new Date(),
  executor: Executor = db,
): Promise<string[]> {
  const contract = schema.billingContract;
  const rows = await executor
    .select({ organizationId: contract.organizationId })
    .from(contract)
    .where(
      and(
        eq(contract.status, "pending"),
        gt(contract.pendingExpiresAt, now),
        sql`${contract.terms} -> 'addOns' @> ${JSON.stringify([{ key }])}::jsonb`,
      ),
    );
  const buying: string[] = [];
  for (const { organizationId } of rows) {
    const state = await billingStateAt(organizationId, now, executor);
    if (!(state.contract?.terms.addOns ?? []).some((line) => line.key === key)) {
      buying.push(organizationId);
    }
  }
  return [...new Set(buying)];
}
