import { PLANS, SELF_SERVE_PLANS } from "@coss/billing/catalog";

/** A paid self-serve plan named by the pricing page's `?plan=`; anything else is no intent. */
export function planIntent(value: unknown): keyof typeof PLANS | null {
  const plan = SELF_SERVE_PLANS.find((key) => key === value);
  return plan && PLANS[plan].feeCents > 0n ? plan : null;
}

/** The entry page, carrying the plan through sign-in and onboarding. */
export function planIntentPath(plan: keyof typeof PLANS): string {
  return `/dashboard?plan=${plan}`;
}
