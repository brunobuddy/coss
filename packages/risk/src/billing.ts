/**
 * What an assessment owes (`risk.assessments`), and what it does when it can't be paid for: an
 * assessment never fails over billing, because customers treat errors as `allow` and an error at
 * the limit would turn their protection off, possibly in the middle of an attack. Past Free's
 * allowance, on a billing hold or over a budget it goes on in a reduced form: stateless signals,
 * lists and rules, no velocity, memory, content or paid data, listed in `degraded`, and free.
 *
 * Only API calls are billed (`AssessRiskInput.metered`): Forms' submissions already pay for their
 * assessments.
 */
import {
  budgetHoldFor,
  isOnBillingHold,
  recordUsage,
  type UsageInput,
} from "@coss/billing/metering";
import type { Transaction } from "@coss/db";
import type { RiskDeps } from "./assess.ts";

export const ASSESSMENT_METER = "risk.assessments";
export const CONTENT_METER = "risk.content_checks";

export type BillingSource = {
  organizationId: string;
  projectId: string;
  apiKeyId: string | null;
  /** The member a personal key belongs to. */
  userId: string | null;
};

export type AssessmentBilling = {
  /** Charge the meter when the assessment doesn't end in `block`. */
  billable: boolean;
  /** Assess without velocity, memory, content or paid data. */
  reduced: boolean;
};

export const NOT_BILLED: AssessmentBilling = { billable: false, reduced: false };
const FULL: AssessmentBilling = { billable: true, reduced: false };
const REDUCED: AssessmentBilling = { billable: false, reduced: true };

/** `usage_limit_exceeded`, or a contract that caps the meter at nothing. */
function isAllowanceError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const { code } = error as { code?: unknown };
  return code === "usage_limit_exceeded" || code === "plan_feature_unavailable";
}

/**
 * Decides how a live assessment asked for through the API runs, before its signals are collected.
 * It only reads: the unit is taken by `chargeAssessment`, under the `Idempotency-Key`'s lock, so
 * retries of one request can't see each other's unit and disagree about how it runs.
 */
export async function openAssessmentBilling(
  deps: RiskDeps,
  source: BillingSource,
): Promise<AssessmentBilling> {
  try {
    const held =
      (await isOnBillingHold(source.organizationId)) || (await budgetHoldFor(source)) !== null;
    if (held) return REDUCED;
    const exhausted = await deps.usage?.exhausted?.(source.organizationId, ASSESSMENT_METER);
    return exhausted ? REDUCED : FULL;
  } catch (error) {
    // Billing's trouble must not become the customer's: assess in full.
    console.error("[risk] Reading an assessment's billing state failed:", error);
    return FULL;
  }
}

/**
 * Takes and records the unit, last thing in the assessment's transaction (a rollback gives it back,
 * and a blocked or replayed assessment never takes one). Behind a savepoint: a failed write loses
 * that unit of usage, never the assessment, and losing a race for a plan's last units makes this
 * one free.
 */
export async function chargeAssessment(
  tx: Transaction,
  deps: RiskDeps,
  usage: Omit<UsageInput, "meter" | "quantity">,
): Promise<void> {
  const record = deps.recordUsage ?? recordUsage;
  const unit = { meter: ASSESSMENT_METER, quantity: 1 } as const;
  try {
    await tx.transaction(async (savepoint) => {
      await deps.usage?.reserve(savepoint, { organizationId: usage.organizationId, ...unit });
      await record(savepoint, { ...usage, ...unit });
    });
  } catch (error) {
    if (isAllowanceError(error)) return;
    console.error("[risk] Charging for an assessment failed:", error);
  }
}
