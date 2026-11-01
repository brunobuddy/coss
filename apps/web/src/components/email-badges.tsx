import type {
  EmailEventType,
  EmailObjectOutput,
  EmailRecipientStatus,
  SuppressionReason,
} from "@coss/email";
import type { EnvironmentMode } from "@coss/tenancy";
import { Badge } from "@coss/ui/components/badge";
import { StatusDot, type StatusTone } from "./status-dot";

const STATUS_VARIANT = {
  queued: "secondary",
  sent: "success",
  failed: "error",
  scheduled: "info",
  canceled: "outline",
} as const satisfies Record<EmailObjectOutput["status"], string>;

export function EmailStatusBadge({ status }: { status: EmailObjectOutput["status"] }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
}

/** Each email status's dot colour, shared by badges, tables and the status filter. */
export const EMAIL_STATUS_TONE = {
  queued: "neutral",
  sent: "success",
  failed: "error",
  scheduled: "info",
  canceled: "neutral",
} as const satisfies Record<EmailObjectOutput["status"], StatusTone>;

const STATUS_LABEL = {
  queued: "Queued",
  sent: "Sent",
  failed: "Failed",
  scheduled: "Scheduled",
  canceled: "Canceled",
} as const satisfies Record<EmailObjectOutput["status"], string>;

/** An email's status as a dot and label, for dense lists. */
export function EmailStatusDot({ status }: { status: EmailObjectOutput["status"] }) {
  return (
    <StatusDot pulse={status === "queued"} tone={EMAIL_STATUS_TONE[status]}>
      {STATUS_LABEL[status]}
    </StatusDot>
  );
}

const RECIPIENT_STATUS_VARIANT = {
  queued: "secondary",
  sent: "info",
  delivery_delayed: "warning",
  delivered: "success",
  bounced: "error",
  suppressed: "error",
  complained: "error",
  failed: "error",
  canceled: "outline",
} as const satisfies Record<EmailRecipientStatus, string>;

export function RecipientStatusBadge({ status }: { status: EmailRecipientStatus }) {
  return <Badge variant={RECIPIENT_STATUS_VARIANT[status]}>{status.replaceAll("_", " ")}</Badge>;
}

const EVENT_VARIANT = {
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
} as const satisfies Record<EmailEventType, string>;

export function EmailEventBadge({ type }: { type: EmailEventType }) {
  return <Badge variant={EVENT_VARIANT[type]}>{type}</Badge>;
}

const SUPPRESSION_REASON_VARIANT = {
  bounce: "error",
  complaint: "error",
  manual: "secondary",
  import: "secondary",
  unsubscribe: "warning",
} as const satisfies Record<SuppressionReason, string>;

export function SuppressionReasonBadge({ reason }: { reason: SuppressionReason }) {
  return <Badge variant={SUPPRESSION_REASON_VARIANT[reason]}>{reason}</Badge>;
}

/** `*` reads as "All emails"; anything else is a category. */
export function SuppressionScopeBadge({ scope }: { scope: string }) {
  return scope === "*" ? (
    <Badge variant="outline">All emails</Badge>
  ) : (
    <Badge className="font-mono" variant="secondary">
      {scope}
    </Badge>
  );
}

export function SandboxBadge({ sandbox }: { sandbox: boolean }) {
  return sandbox ? <Badge variant="info">sandbox</Badge> : <Badge variant="outline">live</Badge>;
}

export function ModeBadge({ mode }: { mode: EnvironmentMode }) {
  return (
    <Badge variant="outline">
      {mode === "live" ? (
        <StatusDot tone="success">Live</StatusDot>
      ) : (
        <StatusDot tone="info">Sandbox</StatusDot>
      )}
    </Badge>
  );
}

/** Whether a kind of tracking is on: for settings and for a sent email. */
export function TrackingBadge({ on }: { on: boolean }) {
  return on ? <Badge variant="success">On</Badge> : <Badge variant="outline">Off</Badge>;
}

/** A received email's status: `blocked` carried a virus. */
export function ReceivedStatusBadge({ status }: { status: "received" | "blocked" }) {
  return status === "received" ? (
    <StatusDot tone="success">Received</StatusDot>
  ) : (
    <StatusDot tone="error">Blocked</StatusDot>
  );
}

const VERDICT_VARIANT = {
  pass: "success",
  fail: "error",
  gray: "warning",
  processing_failed: "secondary",
} as const;

/** One receiving verdict (`spam`, `spf`, …): `pass`, `fail`, `gray`, or not checked. */
export function VerdictBadge({
  label,
  verdict,
}: {
  label: string;
  verdict: keyof typeof VERDICT_VARIANT | null;
}) {
  return (
    <Badge variant={verdict ? VERDICT_VARIANT[verdict] : "outline"}>
      {label}: {verdict ? verdict.replaceAll("_", " ") : "not checked"}
    </Badge>
  );
}
