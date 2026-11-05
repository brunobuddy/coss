import "server-only";
import {
  billingStateAt,
  createPlanGate,
  entitlementsFor,
  type FeatureKey,
  getBillingAccount,
  holdsOf,
  type MeterKey,
  meterUnitsName,
  type PlanGate,
  type ProviderName,
  planRateLimits,
  reservedThisPeriod,
} from "@coss/billing";
import { type BillingRuntime, createBillingRuntime } from "@coss/billing/runtime";
import { notificationEnvironment } from "@coss/email";
import { env } from "@/env";

// One runtime (Stripe client) per server process, kept across dev HMR re-evaluations.
const globalForBilling = globalThis as unknown as {
  __cossBillingRuntime?: BillingRuntime;
  __cossSystemOrganization?: Promise<string | null>;
};

/** Payment providers configured by `BILLING_PROVIDER` (and Stripe, when its key is set). */
export function billingRuntime(): BillingRuntime {
  globalForBilling.__cossBillingRuntime ??= createBillingRuntime(env);
  return globalForBilling.__cossBillingRuntime;
}

/** The provider new billing accounts get. */
export function defaultBillingProvider(): ProviderName {
  return billingRuntime().defaultProvider;
}

/**
 * coss.com's own organization (it sends account emails, `NOTIFICATIONS_ENVIRONMENT_ID`): never
 * limited by a plan. Resolved once per process.
 */
export function systemOrganizationId(): Promise<string | null> {
  const environmentId = env.NOTIFICATIONS_ENVIRONMENT_ID;
  if (!environmentId) return Promise.resolve(null);
  globalForBilling.__cossSystemOrganization ??= notificationEnvironment(environmentId)
    .then((environment) => environment.organizationId)
    .catch((error: unknown) => {
      globalForBilling.__cossSystemOrganization = undefined;
      console.error("[web] Resolving coss.com's own organization failed:", error);
      return null;
    });
  return globalForBilling.__cossSystemOrganization;
}

/** Plan limits for the product packages (domains, endpoints, log drains, SSO, members, …). */
export function planGate(): PlanGate {
  const gate = async () => createPlanGate({ systemOrganizationId: await systemOrganizationId() });
  return {
    requireFeature: async (organizationId, feature) =>
      (await gate()).requireFeature(organizationId, feature),
    hasFeature: async (organizationId, feature) =>
      (await gate()).hasFeature(organizationId, feature),
    requireCapacity: async (organizationId, limit, current, count) =>
      (await gate()).requireCapacity(organizationId, limit, current, count),
    limit: async (organizationId, limit) => (await gate()).limit(organizationId, limit),
    currentLimit: async (organizationId, limit) =>
      (await gate()).currentLimit(organizationId, limit),
  };
}

/** Whether a contract with sales (or coss.com's own) is in effect: never a self-serve plan. */
export async function hasManagedContract(organizationId: string): Promise<boolean> {
  const { contract } = await billingStateAt(organizationId, new Date());
  return contract?.kind === "sales" || contract?.kind === "internal";
}

/** The organization's plan rate limits (the rate limiter's plan layer). */
export async function planRules(organizationId: string) {
  return planRateLimits(organizationId, { systemOrganizationId: await systemOrganizationId() });
}

/** The organization's member limit (`null`: unlimited), for Better Auth's invitation routes. */
export async function memberLimit(organizationId: string): Promise<number | null> {
  if (organizationId === (await systemOrganizationId())) return null;
  return (await entitlementsFor(organizationId)).limits.members;
}

export type BillingBannerState = {
  held: "delinquent" | "spend_limit" | "credit_limit" | "admin" | null;
  pastDue: boolean;
  /** The most used capped allowance (Free's emails), when at 80% or more. */
  allowance: { label: string; used: number; cap: number } | null;
};

/** What the organization layout warns billing readers about (a few small queries). */
export async function billingBannerState(organizationId: string): Promise<BillingBannerState> {
  const now = new Date();
  const [holds, account, state] = await Promise.all([
    holdsOf(organizationId),
    getBillingAccount(organizationId),
    billingStateAt(organizationId, now),
  ]);
  const held =
    holds.find((hold) => hold.reason === "delinquent")?.reason ??
    holds.find((hold) => hold.reason === "credit_limit")?.reason ??
    holds.find((hold) => hold.reason === "spend_limit")?.reason ??
    holds[0]?.reason ??
    null;
  let allowance: BillingBannerState["allowance"] = null;
  for (const [meter, cap] of Object.entries(state.terms.usageCaps) as [MeterKey, number][]) {
    if (!cap) continue;
    const used = await reservedThisPeriod(organizationId, meter, now);
    if (used / cap >= 0.8 && (!allowance || used / cap > allowance.used / allowance.cap)) {
      allowance = {
        label: meterUnitsName(meter),
        used,
        cap,
      };
    }
  }
  return { held, pastDue: account?.status === "past_due", allowance };
}

/** Whether the organization's plan lets it set up `feature` now (coss.com's own always may). */
export async function planHas(organizationId: string, feature: FeatureKey): Promise<boolean> {
  if (organizationId === (await systemOrganizationId())) return true;
  return (await entitlementsFor(organizationId)).features[feature];
}
