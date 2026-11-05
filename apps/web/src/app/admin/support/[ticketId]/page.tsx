import {
  formatSupportTarget,
  PLANS,
  type PlanKey,
  supportResponseMinutes,
} from "@coss/billing/catalog";
import { getSupportTicketForRep, listSavedReplies, listSupportReps } from "@coss/support/admin";
import { supportCategoryLabel } from "@coss/support/schemas";
import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusDot } from "@/components/status-dot";
import { Conversation, type ConversationItem } from "@/components/support/conversation";
import { TicketLiveUpdates } from "@/components/support/desk-live";
import { SupportActionButton, SupportSelect } from "@/components/support/support-action";
import { requirePlatformAdmin } from "@/lib/session";
import { formatDue } from "@/lib/support";
import {
  assignTicketAction,
  markTicketSpamAction,
  revealTicketMessageAction,
  setTicketSeverityAction,
  setTicketStatusAction,
} from "../actions";
import { TicketContextPanel } from "../context-panel";
import { queueFilters, queueQuery, SupportQueue } from "../queue";
import { RepComposer } from "../rep-composer";

export const metadata: Metadata = { title: "Ticket" };

const EVENT_LABELS: Record<string, string> = {
  acknowledged: "Acknowledgement emailed",
  auto_resolved: "Closed automatically after a quiet week",
  resolved: "Resolved",
  reopened: "Reopened",
  opened: "Moved back to the queue",
  woke: "Snooze ended",
  snoozed: "Snoozed",
  waiting_on_customer: "Waiting on the customer",
  assigned: "Assigned",
  severity_changed: "Severity changed",
  marked_spam: "Marked as spam",
  not_spam: "Moved out of spam",
  organization_confirmed: "Organization confirmed",
  cc_added: "Added to replies",
};

const DELIVERY: Record<string, { label: string; tone: "neutral" | "success" | "error" }> = {
  pending: { label: "Sending", tone: "neutral" },
  accepted: { label: "Sent", tone: "neutral" },
  delivered: { label: "Delivered", tone: "success" },
  bounced: { label: "Bounced", tone: "error" },
  failed: { label: "Not sent", tone: "error" },
};

function eventLabel(event: string | null, data: Record<string, unknown>, by: string | null) {
  const label = EVENT_LABELS[event ?? ""] ?? event ?? "Updated";
  const detail =
    typeof data.assignee === "string"
      ? ` to ${data.assignee}`
      : data.assignee === null && event === "assigned"
        ? " to nobody"
        : typeof data.severity === "string"
          ? ` to ${data.severity}`
          : typeof data.organization === "string"
            ? `: ${data.organization}`
            : typeof data.address === "string"
              ? `: ${data.address}`
              : "";
  return `${label}${detail}${by ? ` by ${by}` : ""}`;
}

export default async function AdminSupportTicketPage({
  params,
  searchParams,
}: PageProps<"/admin/support/[ticketId]">) {
  const { actor } = await requirePlatformAdmin();
  const { ticketId } = await params;
  const filters = queueFilters(await searchParams);
  const [data, reps, savedReplies] = await Promise.all([
    getSupportTicketForRep(ticketId),
    listSupportReps(),
    listSavedReplies(),
  ]);
  if (!data) notFound();
  const { ticket, messages } = data;
  const now = new Date();
  const hidden = { ticketId: ticket.id };
  const plan = ticket.plan as PlanKey;
  const due = ticket.responseDueAt ? formatDue(ticket.responseDueAt, now) : null;
  const lastMessage = messages.at(-1);

  const items: ConversationItem[] = messages.map((message) => {
    const delivery = message.deliveryStatus ? DELIVERY[message.deliveryStatus] : undefined;
    return {
      id: message.id,
      kind: message.kind,
      author:
        message.authorName ??
        message.authorEmail ??
        (message.kind === "agent" ? "Support" : ticket.requesterEmail),
      subtitle: message.kind === "customer" && message.authorName ? message.authorEmail : undefined,
      at: message.createdAt,
      body: message.body,
      visibleText: message.visibleText,
      eventLabel:
        message.kind === "event"
          ? eventLabel(message.event, message.eventData, message.authorName)
          : null,
      attachments: message.attachments.map((attachment) => ({
        id: attachment.id,
        filename: attachment.filename,
        size: attachment.size,
        href: attachment.state === "stored" ? `/admin/support/attachments/${attachment.id}` : null,
      })),
      meta: (
        <>
          {message.kind === "customer" && message.senderAuth === "unverified" ? (
            <Badge size="sm" variant="warning">
              Unverified
            </Badge>
          ) : null}
          {message.lowSignal ? (
            <Badge size="sm" variant="outline">
              Automated
            </Badge>
          ) : null}
          {message.kind === "customer" && !message.customerVisible && !message.lowSignal ? (
            <SupportActionButton
              action={revealTicketMessageAction}
              hidden={{ ...hidden, messageId: message.id }}
              size="xs"
              success="Now visible to the customer"
              variant="ghost"
            >
              Show to customer
            </SupportActionButton>
          ) : null}
          {delivery ? (
            <StatusDot className="text-xs" tone={delivery.tone}>
              {delivery.label}
              {message.deliveryError ? `: ${message.deliveryError}` : ""}
            </StatusDot>
          ) : null}
        </>
      ),
    };
  });

  return (
    <div
      className="flex flex-col gap-4 lg:h-[calc(100dvh-7rem)] lg:flex-row"
      data-page-width="full"
    >
      <SupportQueue
        activeTicketId={ticket.id}
        actorUserId={actor.userId}
        className="hidden lg:flex"
        filters={filters}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto 2xl:flex-row">
        <main className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <Button
              className="w-fit lg:hidden"
              render={<Link href={`/admin/support${queueQuery(filters)}`} />}
              size="xs"
              variant="ghost"
            >
              <ArrowLeftIcon />
              Queue
            </Button>
            <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
              <h1 className="min-w-0 flex-1 text-balance font-heading font-semibold text-xl tracking-[-0.01em]">
                {ticket.subject}
              </h1>
              <span className="font-mono text-muted-foreground text-sm">#{ticket.number}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={plan === "free" ? "outline" : "secondary"}>
                {PLANS[plan]?.name ?? ticket.plan}
              </Badge>
              {due ? (
                <StatusDot className="font-mono text-xs" tone={due.overdue ? "error" : "neutral"}>
                  {due.label}
                </StatusDot>
              ) : null}
              <span className="text-muted-foreground text-xs">
                Target{" "}
                {formatSupportTarget(supportResponseMinutes(plan, ticket.severity), {
                  allHours: ticket.allHours,
                })}
              </span>
              <span className="text-muted-foreground text-xs">
                {supportCategoryLabel(ticket.category)} · via {ticket.source}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SupportSelect
                action={assignTicketAction}
                hidden={hidden}
                items={[
                  { value: "none", label: "Unassigned" },
                  ...reps.map((item) => ({ value: item.id, label: item.name })),
                ]}
                label="Assignee"
                name="assignee"
                success="Assignee changed"
                value={ticket.assigneeUserId ?? "none"}
              />
              <SupportSelect
                action={setTicketSeverityAction}
                hidden={hidden}
                items={[
                  { value: "normal", label: "Normal" },
                  { value: "urgent", label: "Urgent" },
                ]}
                label="Severity"
                name="severity"
                success="Severity changed"
                value={ticket.severity}
              />
              <div className="ms-auto flex flex-wrap items-center gap-2">
                {ticket.status === "spam" ? (
                  <SupportActionButton
                    action={markTicketSpamAction}
                    hidden={{ ...hidden, spam: "no" }}
                    success="Moved to the queue"
                  >
                    Not spam
                  </SupportActionButton>
                ) : (
                  <SupportActionButton
                    action={markTicketSpamAction}
                    hidden={{ ...hidden, spam: "yes" }}
                    success="Marked as spam"
                    variant="ghost"
                  >
                    Spam
                  </SupportActionButton>
                )}
                {ticket.status === "open" || ticket.status === "pending" ? (
                  <SupportActionButton
                    action={setTicketStatusAction}
                    hidden={{ ...hidden, status: "snoozed", days: "1" }}
                    success="Snoozed until tomorrow"
                    variant="ghost"
                  >
                    Snooze 1 day
                  </SupportActionButton>
                ) : null}
                {ticket.status === "resolved" || ticket.status === "snoozed" ? (
                  <SupportActionButton
                    action={setTicketStatusAction}
                    hidden={{ ...hidden, status: "open" }}
                    success="Moved to the queue"
                  >
                    Reopen
                  </SupportActionButton>
                ) : ticket.status !== "spam" ? (
                  <SupportActionButton
                    action={setTicketStatusAction}
                    hidden={{ ...hidden, status: "resolved" }}
                    id="support-resolve"
                    success="Ticket resolved"
                  >
                    Resolve
                  </SupportActionButton>
                ) : null}
              </div>
            </div>
          </header>
          <Conversation items={items} />
          {ticket.status === "spam" ? (
            <p className="rounded-xl border p-4 text-muted-foreground text-sm">
              Move this ticket out of Spam to reply.
            </p>
          ) : (
            <RepComposer
              lastSeenMessageId={lastMessage?.id ?? null}
              savedReplies={savedReplies}
              ticketId={ticket.id}
              to={ticket.requesterEmail}
              unverified={ticket.senderAuth === "unverified" && !ticket.organizationId}
            />
          )}
          <TicketLiveUpdates
            feedUrl={`/admin/support/${ticket.id}/feed`}
            lastMessageId={lastMessage?.id ?? null}
          />
        </main>
        <TicketContextPanel data={data} />
      </div>
    </div>
  );
}
