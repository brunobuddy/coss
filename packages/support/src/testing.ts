import type { SupportEmail, SupportEmailStatus, SupportMailer } from "./delivery.ts";
import type { SupportPlan, SupportPlanFor } from "./matching.ts";

/** Keeps what it's asked to send; `statuses` decides what each email turns into. */
export function recordingSupportMailer(options?: {
  fail?: (email: SupportEmail) => Error | null;
}): SupportMailer & {
  sent: SupportEmail[];
  statuses: Map<string, SupportEmailStatus | null>;
} {
  const sent: SupportEmail[] = [];
  const statuses = new Map<string, SupportEmailStatus | null>();
  return {
    sent,
    statuses,
    async send(email) {
      const failure = options?.fail?.(email);
      if (failure) throw failure;
      sent.push(email);
      return { emailId: `email_${sent.length}` };
    },
    async status(emailId) {
      return statuses.get(emailId) ?? null;
    },
  };
}

/** Each organization's plan, Free when unlisted. */
export function fixedSupportPlans(
  plans: Record<string, SupportPlan["plan"] | SupportPlan> = {},
): SupportPlanFor {
  return async (organizationId) => {
    const plan = plans[organizationId] ?? "free";
    return typeof plan === "string" ? { plan, allHours: false } : plan;
  };
}
