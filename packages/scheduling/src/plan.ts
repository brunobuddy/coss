/**
 * What the plan and the account's billing decide about Scheduling. Live environments only: sandbox
 * has everything, so a team builds first and meets the plan at go-live. These refuse new setup and
 * new bookings; what already exists (a filter, a confirmed booking, a hold being confirmed) keeps
 * working whatever the plan says.
 */
import type { FeatureKey, PlanGate } from "@coss/billing/gate";
import { BUDGET_EXCEEDED_MESSAGES, budgetHoldFor, isOnBillingHold } from "@coss/billing/metering";
import type { Executor } from "@coss/db";
import { SchedulingError } from "./errors.ts";
import type { SchedulingEnvironment } from "./types.ts";

type Environment = Pick<SchedulingEnvironment, "organizationId"> & {
  mode?: SchedulingEnvironment["mode"];
};

/** Throws a `BillingError` when a live environment's plan lacks the feature. */
export async function requireLiveFeature(
  env: Environment,
  plans: PlanGate | undefined,
  feature: FeatureKey,
): Promise<void> {
  if (env.mode === "live") await plans?.requireFeature(env.organizationId, feature);
}

/** Asking for hosts by attributes (`host_filter`, `attributes`). */
export async function requireRouting(
  env: Environment,
  plans: PlanGate | undefined,
  attributes: Readonly<Record<string, unknown>> | null | undefined,
): Promise<void> {
  if (attributes && Object.keys(attributes).length > 0) {
    await requireLiveFeature(env, plans, "schedulingRouting");
  }
}

/** A new live host is a new monthly charge: an overdue invoice, spend limit or project budget stops it. */
export async function refuseNewHostWhileHeld(env: SchedulingEnvironment): Promise<void> {
  if (env.mode !== "live") return;
  if (await isOnBillingHold(env.organizationId)) {
    throw new SchedulingError(
      "billing_hold",
      "New live hosts are paused: your organization has an overdue invoice or reached its spend " +
        "limit. Sandbox keys still work.",
    );
  }
  const held = await budgetHoldFor({
    organizationId: env.organizationId,
    projectId: env.projectId,
  });
  if (held) throw new SchedulingError("budget_exceeded", BUDGET_EXCEEDED_MESSAGES[held]);
}

/**
 * A live new booking is usage: an overdue invoice, spend limit or project budget stops it. Called
 * once the row is known to be new, so a retry of a booking already made still answers with it.
 */
export async function refuseNewBookingWhileHeld(
  env: SchedulingEnvironment,
  executor: Executor,
): Promise<void> {
  if (env.mode !== "live") return;
  if (await isOnBillingHold(env.organizationId, executor)) {
    throw new SchedulingError(
      "billing_hold",
      "New live bookings are paused: your organization has an overdue invoice or reached its " +
        "spend limit. Sandbox keys still work.",
    );
  }
  const held = await budgetHoldFor(
    { organizationId: env.organizationId, projectId: env.projectId },
    executor,
  );
  if (held) throw new SchedulingError("budget_exceeded", BUDGET_EXCEEDED_MESSAGES[held]);
}
