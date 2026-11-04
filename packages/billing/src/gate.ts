/**
 * What product packages take (injected, optional) to enforce plans: the dependency points the
 * other way, so they import only these types. Without one, nothing is enforced (tests,
 * scripts); the apps wire the real ones (`createPlanGate`, `createUsageGate`).
 */
import type { Executor } from "@coss/db";
import type { FeatureKey, LimitKey } from "./catalog/entitlements.ts";
import type { MeterKey } from "./catalog/meters.ts";

export type { FeatureKey, LimitKey, MeterKey };

export interface PlanGate {
  /** Throws a `BillingError` (`plan_feature_unavailable`) when the plan lacks the feature. */
  requireFeature(organizationId: string, feature: FeatureKey): Promise<void>;
  /** Whether the plan in effect has the feature, for what changes rather than refuses. */
  hasFeature(organizationId: string, feature: FeatureKey): Promise<boolean>;
  /**
   * Throws a `BillingError` (`plan_limit_reached`) when `count` more would exceed the plan's
   * limit, `current` already existing.
   */
  requireCapacity(
    organizationId: string,
    limit: LimitKey,
    current: number,
    count?: number,
  ): Promise<void>;
  /** The plan's limit (`null`: unlimited), for packages that combine it with their own caps. */
  limit(organizationId: string, limit: LimitKey): Promise<number | null>;
}

export interface UsageGate {
  /**
   * Reserves `quantity` units of a capped meter for the current period, in the transaction that
   * accepts the usage (throws a `BillingError`, `usage_limit_exceeded`, beyond the cap).
   * Uncapped organizations pass through without a write. With a `dimension` (`country=GB`), a
   * value the organization's prices don't cover is refused (`plan_feature_unavailable`).
   */
  reserve(
    tx: Executor,
    input: { organizationId: string; meter: MeterKey; quantity: number; dimension?: string },
  ): Promise<void>;
  /**
   * Gives back reserved units that will never be used (e.g. a canceled broadcast's unsent
   * emails), in `tx`, to the period they were reserved in (`reservedAt`, default now). Never
   * below zero.
   */
  release?(
    tx: Executor,
    input: { organizationId: string; meter: MeterKey; quantity: number; reservedAt?: Date },
  ): Promise<void>;
}
