import type { LogDrainSource } from "@coss/logs/schemas";

/** How each source reads in the dashboard. */
export const SOURCE_LABELS: Record<LogDrainSource, { label: string; description: string }> = {
  api: { label: "API requests", description: "Requests made with this environment's API keys." },
  email: { label: "Email events", description: "Sent, delivered, bounced, opened, clicked…" },
  webhook: { label: "Webhook attempts", description: "Every delivery attempt to your endpoints." },
  risk: { label: "Risk assessments", description: "Every assessment and the feedback on it." },
  smtp: {
    label: "SMTP messages",
    description: "Messages submitted to the SMTP relay with this environment's keys.",
  },
  sms: { label: "SMS events", description: "Sent, delivered, undelivered, received, opt-outs…" },
  sign: {
    label: "Signature events",
    description: "Signature requests sent, viewed, signed, declined, completed…",
  },
  verify: {
    label: "Verification events",
    description: "Codes sent, checked, approved, failed or blocked by the fraud guard.",
  },
  forms: {
    label: "Form submissions",
    description: "Submissions received, flagged as spam, confirmed, released…",
  },
  audit: {
    label: "Audit events",
    description: "Changes to this environment: keys, endpoints, drains, suppressions…",
  },
};

export function sourcesSummary(sources: readonly LogDrainSource[]): string {
  return sources.length === 0
    ? "All sources"
    : sources.map((source) => SOURCE_LABELS[source].label).join(", ");
}
