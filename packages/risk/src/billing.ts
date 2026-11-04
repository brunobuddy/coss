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
import { budgetHoldFor, isOnBillingHold } from "@coss/billing/metering";
import { db } from "@coss/db";
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
  /** Record the meter when the assessment doesn't end in `block`. */
  billable: boolean;
  /** Assess without velocity, memory, content or paid data. */
  reduced: boolean;
  /** A capped plan's unit to give back if the assessment turns out not to be billable. */
  reservedAt: Date | null;
};

export const NOT_BILLED: AssessmentBilling = { billable: false, reduced: false, reservedAt: null };
const REDUCED: AssessmentBilling = { billable: false, reduced: true, reservedAt: null };

/** `usage_limit_exceeded`, or a contract that caps the meter at nothing. */
function isAllowanceError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const { code } = error as { code?: unknown };
  return code === "usage_limit_exceeded" || code === "plan_feature_unavailable";
}

/** Decides how a live assessment asked for through the API runs, before its signals are collected. */
export async function openAssessmentBilling(
  deps: RiskDeps,
  source: BillingSource,
): Promise<AssessmentBilling> {
  try {
    const held =
      (await isOnBillingHold(source.organizationId)) || (await budgetHoldFor(source)) !== null;
    if (held) return REDUCED;
    const gate = deps.usage;
    if (!gate) return { billable: true, reduced: false, reservedAt: null };
    const reservedAt = new Date();
    await db.transaction((tx) =>
      gate.reserve(tx, {
        organizationId: source.organizationId,
        meter: ASSESSMENT_METER,
        quantity: 1,
      }),
    );
    return { billable: true, reduced: false, reservedAt };
  } catch (error) {
    if (isAllowanceError(error)) return REDUCED;
    // Billing's trouble must not become the customer's: assess in full.
    console.error("[risk] Reading an assessment's billing state failed:", error);
    return { billable: true, reduced: false, reservedAt: null };
  }
}

/** Gives back the unit reserved for an assessment that isn't billable after all. */
export async function releaseAssessmentUnit(
  deps: RiskDeps,
  organizationId: string,
  billing: AssessmentBilling,
): Promise<void> {
  const release = deps.usage?.release?.bind(deps.usage);
  const { reservedAt } = billing;
  if (!release || !reservedAt) return;
  try {
    await db.transaction((tx) =>
      release(tx, { organizationId, meter: ASSESSMENT_METER, quantity: 1, reservedAt }),
    );
  } catch (error) {
    // At worst, one unit of an allowance. Never the assessment's answer.
    console.error("[risk] Giving back an assessment's unit failed:", error);
  }
}
