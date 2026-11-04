/**
 * How much usage coss.com carries for an account before it has proved it pays. Usage is billed
 * after it happens and coss.com pays its providers for it either way, so every account has a credit
 * limit on what could still be lost, and is charged early as usage accrues. Client-safe: the docs
 * and the dashboard read it.
 */
export const CREDIT_POLICY = {
  /** The limit of an account with no settled payments. */
  newAccountLimitCents: 50_000n,
  /** Each settled dollar raises the limit by this many. */
  limitPerSettledDollar: 2n,
  /** Where automatic growth stops (more needs an admin's limit, or a contract). */
  maxAutomaticLimitCents: 10_000_000n,
  /**
   * Days until a payment is settled: most fraudulent card payments are disputed by then, so before
   * this it could still be taken back (and counts against the limit, not towards it).
   */
  settleDays: 30,
  /** Usage is charged early at this fraction of the limit… */
  thresholdDivisor: 5n,
  /** … within these bounds (never above the limit itself). */
  minThresholdCents: 10_000n,
  maxThresholdCents: 500_000n,
  /** Owners are told at this share of the limit, in time to ask for a higher one. */
  warnAtPercent: 80,
} as const;

/** The automatic limit: twice what has settled, at least the new account limit. */
export function automaticCreditLimit(settledPaidCents: bigint): bigint {
  const { newAccountLimitCents, limitPerSettledDollar, maxAutomaticLimitCents } = CREDIT_POLICY;
  const earned = settledPaidCents * limitPerSettledDollar;
  if (earned <= newAccountLimitCents) return newAccountLimitCents;
  return earned < maxAutomaticLimitCents ? earned : maxAutomaticLimitCents;
}

/** Unbilled usage that gets charged early under a limit. */
export function chargeThreshold(limitCents: bigint): bigint {
  const { thresholdDivisor, minThresholdCents, maxThresholdCents } = CREDIT_POLICY;
  const share = limitCents / thresholdDivisor;
  const threshold =
    share < minThresholdCents
      ? minThresholdCents
      : share > maxThresholdCents
        ? maxThresholdCents
        : share;
  return threshold < limitCents ? threshold : limitCents;
}
