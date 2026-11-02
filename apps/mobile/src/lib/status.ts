import type {
  EmailEventType,
  EmailRecipientStatus,
  EmailStatus,
  ReputationStatus,
  SmsEventType,
  SmsStatus,
} from "@coss/companion";
import type { Tone } from "./theme";

// Mirrors apps/web/src/components/email-badges.tsx.
type BadgeVariant = Tone | "outline" | "secondary";

export const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  queued: "Queued",
  sent: "Sent",
  failed: "Failed",
  scheduled: "Scheduled",
  canceled: "Canceled",
};

export const EMAIL_STATUS_TONE: Record<EmailStatus, Tone> = {
  queued: "neutral",
  sent: "success",
  failed: "error",
  scheduled: "info",
  canceled: "neutral",
};

export const EMAIL_STATUS_VARIANT: Record<EmailStatus, BadgeVariant> = {
  queued: "secondary",
  sent: "success",
  failed: "error",
  scheduled: "info",
  canceled: "outline",
};

export const RECIPIENT_STATUS_VARIANT: Record<EmailRecipientStatus, BadgeVariant> = {
  queued: "secondary",
  sent: "info",
  delivery_delayed: "warning",
  delivered: "success",
  bounced: "error",
  suppressed: "error",
  complained: "error",
  failed: "error",
  canceled: "outline",
};

export const EVENT_VARIANT: Record<EmailEventType, BadgeVariant> = {
  "email.sent": "info",
  "email.delivered": "success",
  "email.delivery_delayed": "warning",
  "email.bounced": "error",
  "email.complained": "error",
  "email.failed": "error",
  "email.suppressed": "warning",
  "email.scheduled": "info",
  "email.canceled": "outline",
  "email.opened": "secondary",
  "email.clicked": "secondary",
  "email.rescheduled": "info",
  "email.unsubscribed": "warning",
};

// Mirrors apps/web/src/components/sms-badges.tsx.
export const SMS_STATUS_LABELS: Record<SmsStatus, string> = {
  queued: "Queued",
  scheduled: "Scheduled",
  sent: "Sent",
  delivered: "Delivered",
  undelivered: "Undelivered",
  failed: "Failed",
  canceled: "Canceled",
};

export const SMS_STATUS_TONE: Record<SmsStatus, Tone> = {
  queued: "neutral",
  scheduled: "info",
  sent: "info",
  delivered: "success",
  undelivered: "error",
  failed: "error",
  canceled: "neutral",
};

export const SMS_EVENT_VARIANT: Record<SmsEventType, BadgeVariant> = {
  "sms.scheduled": "info",
  "sms.sent": "info",
  "sms.delivered": "success",
  "sms.undelivered": "error",
  "sms.failed": "error",
  "sms.suppressed": "warning",
  "sms.canceled": "outline",
};

export const STANDING_LABELS: Record<ReputationStatus, string> = {
  good: "Good",
  warning: "Warning",
  suspended: "Suspended",
};

export function standingTone(status: ReputationStatus): Tone {
  return status === "suspended" ? "error" : status === "warning" ? "warning" : "success";
}

// Mirrors apps/web/src/components/domain-badges.tsx.
export const DOMAIN_STATUS: Record<string, [Tone, string]> = {
  pending: ["warning", "Pending"],
  verified: ["success", "Verified"],
  temporary_failure: ["warning", "Temporary failure"],
  failed: ["error", "Failed"],
  deleting: ["neutral", "Deleting"],
};

export const RECORD_STATUS: Record<string, [Tone, string]> = {
  verified: ["success", "Found"],
  missing: ["warning", "Not found"],
  mismatch: ["error", "Wrong value"],
  not_checked: ["neutral", "Not checked"],
};

export const TRACKING_STATUS: Record<string, [Tone, string]> = {
  pending: ["warning", "Pending"],
  active: ["success", "Active"],
  temporary_failure: ["warning", "Temporary failure"],
  failed: ["error", "Failed"],
  deleting: ["neutral", "Removing"],
};

/** Mirrors the dashboard's EndpointStatusBadge. */
export function endpointStatus(endpoint: {
  enabled: boolean;
  disabled_reason: string | null;
  failing_since: string | null;
}): [Tone, string] {
  if (endpoint.enabled)
    return endpoint.failing_since ? ["warning", "Failing"] : ["success", "Enabled"];
  return endpoint.disabled_reason === "failing"
    ? ["error", "Disabled: failing"]
    : ["neutral", "Disabled"];
}

export const DELIVERY_STATUS: Record<string, [Tone, string]> = {
  pending: ["warning", "Pending"],
  succeeded: ["success", "Succeeded"],
  failed: ["error", "Failed"],
};

export const DECISION_TONE: Record<string, Tone> = {
  allow: "success",
  review: "warning",
  block: "error",
};
export const OUTCOME_TONE: Record<string, Tone> = {
  legitimate: "success",
  fraud: "error",
  abuse: "error",
};

export const LEVEL_TONE: Record<string, Tone> = {
  info: "neutral",
  warning: "warning",
  error: "error",
};

/** Mirrors the dashboard's InvoiceStatusBadge. */
export function invoiceStatus(invoice: { status: string; due_at: string | null }): [Tone, string] {
  if (invoice.status === "open") {
    const overdue = invoice.due_at !== null && new Date(invoice.due_at).getTime() < Date.now();
    return overdue ? ["error", "Overdue"] : ["warning", "Due"];
  }
  const tones: Record<string, Tone> = { paid: "success", void: "neutral", uncollectible: "error" };
  return [
    tones[invoice.status] ?? "neutral",
    invoice.status[0]?.toUpperCase() + invoice.status.slice(1),
  ];
}

// apps/web/src/app/[orgSlug]/projects/[projectSlug]/[envSlug]/hooks/page-context.ts
export const HOOK_DELIVERY_STATUS: Record<string, [Tone, string]> = {
  pending: ["warning", "Pending"],
  succeeded: ["success", "Succeeded"],
  failed: ["error", "Failed"],
};

// log-drains/drain-status.tsx and [drainId]/page.tsx (BATCH_STATUS).
export function drainStatus(drain: {
  enabled: boolean;
  disabled_reason: string | null;
}): [Tone, string] {
  if (drain.enabled) return ["success", "Enabled"];
  return drain.disabled_reason === "failing"
    ? ["error", "Disabled: failing"]
    : ["neutral", "Disabled"];
}

export const BATCH_STATUS: Record<string, [Tone, string]> = {
  pending: ["warning", "Pending"],
  succeeded: ["success", "Sent"],
  failed: ["error", "Failed"],
};

// log-drains/sources.ts (SOURCE_LABELS).
export const DRAIN_SOURCE_LABELS: Record<string, string> = {
  api: "API requests",
  email: "Email events",
  webhook: "Webhook attempts",
  risk: "Risk assessments",
  smtp: "SMTP messages",
  sms: "SMS events",
  sign: "Signature events",
  verify: "Verification events",
  forms: "Form submissions",
  scheduling: "Bookings",
  audit: "Audit events",
};

/** Mirrors the dashboard's `FORMAT_LABELS` (`log-drains/sources.ts`). */
export const DRAIN_FORMAT_LABELS: Record<string, string> = {
  ndjson: "NDJSON",
  loki: "Loki push",
  datadog: "Datadog logs",
  otlp: "OTLP/HTTP logs",
};

export function sourcesSummary(sources: string[]): string {
  return sources.length === 0
    ? "All sources"
    : sources.map((source) => DRAIN_SOURCE_LABELS[source] ?? source).join(", ");
}
