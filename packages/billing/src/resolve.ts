/** What applies to an organization at a moment: its contract, resolved terms and entitlements. */
import { db, type Executor } from "@coss/db";
import { type Entitlements, lowerEntitlements } from "./catalog/entitlements.ts";
import type { PlanKey } from "./catalog/plans.ts";
import { rateCardAt } from "./catalog/rates.ts";
import {
  type Contract,
  contractAt,
  contractsOverlapping,
  nextContractAfter,
  supersededIds,
} from "./contracts.ts";
import { type EffectiveTerms, resolveTerms } from "./engine/terms.ts";
import type { Segment } from "./engine/types.ts";
import { selfServeTerms } from "./schemas.ts";
import { type Interval, intersect } from "./time.ts";

export const FREE_TERMS = selfServeTerms("free");

export type BillingState = {
  /** `null`: the Free plan. */
  contract: Contract | null;
  terms: EffectiveTerms;
  /** The next change: a scheduled contract, or the current one ending (to Free). */
  scheduled: { at: Date; contract: Contract | null; terms: EffectiveTerms } | null;
};

export async function billingStateAt(
  organizationId: string,
  at: Date,
  executor: Executor = db,
): Promise<BillingState> {
  const contract = await contractAt(organizationId, at, executor);
  const card = rateCardAt(at);
  const terms = resolveTerms(contract?.terms ?? FREE_TERMS, card);
  let scheduled: BillingState["scheduled"] = null;
  if (contract?.effectiveUntil) {
    const next = await contractAt(organizationId, contract.effectiveUntil, executor);
    scheduled = {
      at: contract.effectiveUntil,
      contract: next,
      terms: resolveTerms(next?.terms ?? FREE_TERMS, card),
    };
  } else if (!contract) {
    const next = await nextContractAfter(organizationId, at, executor);
    if (next)
      scheduled = { at: next.effectiveFrom, contract: next, terms: resolveTerms(next.terms, card) };
  }
  return { contract, terms, scheduled };
}

/**
 * What the organization may create now: its plan's entitlements, or, while a downgrade is
 * scheduled, what both plans grant (so nothing created meanwhile is taken away).
 */
export function creatableEntitlements(state: BillingState): Entitlements {
  if (!state.scheduled) return state.terms.entitlements;
  return lowerEntitlements(state.terms.entitlements, state.scheduled.terms.entitlements);
}

/** The month's contract segments, in order, with Free filling the gaps. */
export async function segmentsFor(
  organizationId: string,
  period: Interval,
  executor: Executor = db,
): Promise<Segment[]> {
  const contracts = await contractsOverlapping(organizationId, period, executor);
  const superseded = await supersededIds(
    contracts.map((contract) => contract.id),
    executor,
  );
  const card = rateCardAt(period.start);
  const segments: Segment[] = [];
  let cursor = period.start;
  const free = (start: Date, end: Date): Segment => ({
    contractId: null,
    interval: { start, end },
    terms: resolveTerms(FREE_TERMS, card),
    contractStart: start,
    contractEnd: null,
    termEnd: null,
    superseded: false,
  });
  for (const contract of contracts) {
    const interval = intersect(period, {
      start: contract.effectiveFrom,
      end: contract.effectiveUntil ?? period.end,
    });
    if (!interval) continue;
    if (interval.start > cursor) segments.push(free(cursor, interval.start));
    segments.push(contractSegment(contract, interval, superseded.has(contract.id)));
    cursor = interval.end;
  }
  if (cursor < period.end) segments.push(free(cursor, period.end));
  return segments;
}

export function contractSegment(
  contract: Contract,
  interval: Interval,
  superseded: boolean,
): Segment {
  return {
    contractId: contract.id,
    interval,
    terms: resolveTerms(contract.terms, rateCardAt(interval.start)),
    contractStart: contract.effectiveFrom,
    contractEnd: contract.effectiveUntil,
    termEnd: contract.termEnd,
    superseded,
    billable: contract.kind !== "internal",
  };
}

/** The plan and support clock in effect: what `@coss/support` takes injected. */
export async function supportPlanAt(
  organizationId: string,
  at: Date,
): Promise<{ plan: PlanKey; allHours: boolean }> {
  const { terms } = await billingStateAt(organizationId, at);
  return { plan: terms.plan, allHours: terms.support.allHours };
}
