import { formatPeriod } from "@coss/ratelimit";
import type { AdminAuditEvent } from "@coss/tenancy/admin";
import { Badge } from "@coss/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { HistoryIcon } from "lucide-react";
import Link from "next/link";
import { abuseCategoryLabel } from "@/lib/abuse-categories";
import { DEPLOY_REPOSITORY } from "@/lib/deploy-runs";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "../empty-state";
import { PanelBody } from "../panel";

const ACTION_LABELS: Record<string, { label: string; variant: "error" | "success" | "info" }> = {
  "user.ban": { label: "Banned user", variant: "error" },
  "user.unban": { label: "Unbanned user", variant: "success" },
  "user.set_role": { label: "Changed platform role", variant: "info" },
  "user.impersonate": { label: "Impersonated user", variant: "info" },
  "user.revoke_session": { label: "Revoked a session", variant: "info" },
  "user.revoke_sessions": { label: "Revoked all sessions", variant: "info" },
  "user.reset_two_factor": { label: "Reset two-factor", variant: "error" },
  "organization.suspend": { label: "Suspended account", variant: "error" },
  "organization.unsuspend": { label: "Lifted account suspension", variant: "success" },
  "organization.take_down": { label: "Took down organization", variant: "error" },
  "user.take_down": { label: "Took down user", variant: "error" },
  "risk_assessment.report": { label: "Reported sign-up to Risk", variant: "error" },
  "risk_assessment.mark_legitimate": { label: "Marked sign-up legitimate", variant: "success" },
  "form.disable": { label: "Disabled a form", variant: "error" },
  "form.enable": { label: "Re-enabled a form", variant: "success" },
  "email.view_content": { label: "Viewed email content", variant: "info" },
  "reputation.suspended": { label: "Suspended live sending", variant: "error" },
  "reputation.reinstated": { label: "Reinstated live sending", variant: "success" },
  "reputation.marketing_reinstated": { label: "Resumed marketing sending", variant: "success" },
  "reputation.policy_updated": { label: "Changed reputation policy", variant: "info" },
  "api_key.revoke": { label: "Revoked API key", variant: "error" },
  "rate_limit.override_set": { label: "Changed a rate limit", variant: "info" },
  "rate_limit.override_reset": { label: "Reset a rate limit", variant: "info" },
  "billing.account_updated": { label: "Changed billing settings", variant: "info" },
  "billing.contract_created": { label: "Created a contract", variant: "info" },
  "billing.contract_canceled": { label: "Ended a contract", variant: "error" },
  "billing.credit_granted": { label: "Granted credit", variant: "success" },
  "billing.credit_voided": { label: "Voided credit", variant: "error" },
  "billing.invoice_created": { label: "Created an invoice", variant: "info" },
  "billing.invoice_voided": { label: "Voided an invoice", variant: "error" },
  "billing.invoice_paid": { label: "Recorded a payment", variant: "success" },
  "billing.invoice_uncollectible": { label: "Wrote off an invoice", variant: "error" },
  "billing.invoice_resynced": { label: "Retried an invoice", variant: "info" },
  "billing.credit_note_created": { label: "Issued a credit note", variant: "info" },
  "billing.hold_placed": { label: "Paused live sending (billing)", variant: "error" },
  "billing.hold_lifted": { label: "Resumed live sending (billing)", variant: "success" },
  "deploy.started": { label: "Deployed main", variant: "info" },
  "deploy.redeployed": { label: "Redeployed an earlier commit", variant: "error" },
  "support.replied": { label: "Replied to a ticket", variant: "info" },
  "support.note_added": { label: "Added a ticket note", variant: "info" },
  "support.assigned": { label: "Assigned a ticket", variant: "info" },
  "support.severity_changed": { label: "Changed a ticket's severity", variant: "info" },
  "support.status_changed": { label: "Changed a ticket's status", variant: "info" },
  "support.spam_changed": { label: "Changed a ticket's spam status", variant: "info" },
  "support.organization_confirmed": { label: "Confirmed a ticket's organization", variant: "info" },
  "support.message_revealed": { label: "Showed a message to a customer", variant: "info" },
  "support.cc_added": { label: "Added someone to a ticket", variant: "info" },
  "support.attachment_downloaded": { label: "Downloaded a ticket's file", variant: "info" },
  "support.saved_reply_changed": { label: "Changed a saved reply", variant: "info" },
};

function targetHref(event: AdminAuditEvent): string | null {
  if (event.targetType === "user") return `/admin/users/${event.targetId}`;
  if (event.targetType === "organization") return `/admin/organizations/${event.targetId}`;
  if (event.targetType === "email") return `/admin/emails/${event.targetId}`;
  if (event.targetType === "commit") {
    return `https://github.com/${DEPLOY_REPOSITORY}/commit/${event.targetId}`;
  }
  if (event.organizationId) return `/admin/organizations/${event.organizationId}`;
  return null;
}

/** The most useful metadata for a row, as short text. */
function describe(event: AdminAuditEvent): string {
  const meta = event.metadata;
  const parts: string[] = [];
  if (typeof meta.email === "string") parts.push(meta.email);
  if (typeof meta.category === "string") parts.push(abuseCategoryLabel(meta.category) ?? "");
  if (typeof meta.slug === "string") parts.push(meta.slug);
  if (typeof meta.role === "string") parts.push(`role → ${meta.role}`);
  if (typeof meta.duration === "string") parts.push(meta.duration);
  if (typeof meta.name === "string") parts.push(`“${meta.name}”`);
  if (typeof meta.start === "string") parts.push(`${meta.start}…`);
  if (typeof meta.bucket === "string") parts.push(meta.bucket + ruleChange(meta));
  if (typeof meta.number === "string") parts.push(meta.number);
  if (typeof meta.plan === "string") parts.push(meta.plan);
  if (Array.isArray(meta.bannedUserIds)) parts.push(`${meta.bannedUserIds.length} banned`);
  if (Array.isArray(meta.revokedKeyIds)) parts.push(`${meta.revokedKeyIds.length} keys revoked`);
  if (Array.isArray(meta.reportedAssessmentIds)) {
    parts.push(`${meta.reportedAssessmentIds.length} sign-ups reported`);
  }
  if (typeof meta.subject === "string") parts.push(`“${meta.subject}”`);
  if (event.targetType === "commit") parts.push(event.targetId.slice(0, 7));
  return parts.join(" · ") || event.targetId;
}

/** `" 50/1s → 100/1s"` from a rate limit override's previous and new rules. */
function ruleChange(meta: Record<string, unknown>): string {
  const rule = (value: unknown) => {
    if (!value || typeof value !== "object") return "default";
    const { limit, periodMs, burst } = value as Record<string, unknown>;
    if (typeof limit !== "number" || typeof periodMs !== "number") return "?";
    return `${limit}/${formatPeriod(periodMs)}${burst !== limit ? ` (burst ${burst})` : ""}`;
  };
  return `: ${rule(meta.previous)} → ${rule(meta.rule)}`;
}

/** Admin audit events, as the contents of a `Panel`. */
export function AuditLogTable({ events }: { events: AdminAuditEvent[] }) {
  if (events.length === 0) {
    return (
      <PanelBody flush>
        <EmptyState
          compact
          description="Every admin action is recorded here, with its reason."
          icon={HistoryIcon}
          title="No admin actions yet"
        />
      </PanelBody>
    );
  }
  return (
    <Table variant="card">
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Admin</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Target</TableHead>
          <TableHead>Reason</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => {
          const action = ACTION_LABELS[event.action];
          const href = targetHref(event);
          return (
            <TableRow key={event.id}>
              <TableCell className="whitespace-nowrap font-mono text-muted-foreground text-xs">
                {formatDateTime(event.createdAt)}
              </TableCell>
              <TableCell>
                {event.actorUserId ? (
                  <Link className="hover:underline" href={`/admin/users/${event.actorUserId}`}>
                    {event.actorEmail}
                  </Link>
                ) : (
                  event.actorEmail
                )}
              </TableCell>
              <TableCell>
                <Badge variant={action?.variant ?? "outline"}>
                  {action?.label ?? event.action}
                </Badge>
              </TableCell>
              <TableCell className="max-w-64 truncate">
                {href ? (
                  <Link className="hover:underline" href={href}>
                    {describe(event)}
                  </Link>
                ) : (
                  describe(event)
                )}
              </TableCell>
              <TableCell className="max-w-80 whitespace-normal text-muted-foreground">
                {event.reason ?? "—"}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
