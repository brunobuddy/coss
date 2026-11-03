import { PRODUCTS } from "@coss/dashboard-routes";
import { formatSupportTime, getCustomerTicket, markCustomerTicketRead } from "@coss/support";
import {
  CUSTOMER_TICKET_STATE_LABELS,
  type CustomerTicketState,
  customerTicketState,
  supportCategoryLabel,
} from "@coss/support/schemas";
import { Badge } from "@coss/ui/components/badge";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/page-header";
import { StatusDot, type StatusTone } from "@/components/status-dot";
import { Conversation, type ConversationItem } from "@/components/support/conversation";
import { SupportActionButton } from "@/components/support/support-action";
import { requireOrgMember } from "@/lib/session";
import { reopenTicketAction, resolveTicketAction } from "../actions";
import { CustomerComposer } from "./customer-composer";

export const metadata: Metadata = { title: "Ticket" };

const STATE_TONE: Record<CustomerTicketState, StatusTone> = {
  with_support: "info",
  waiting_for_you: "warning",
  resolved: "neutral",
};

const EVENT_LABELS: Record<string, string> = {
  resolved: "Resolved",
  reopened: "Reopened",
  auto_resolved: "Closed after a quiet week",
};

export default async function SupportTicketPage({
  params,
}: PageProps<"/[orgSlug]/support/[ticketId]">) {
  const { orgSlug, ticketId } = await params;
  const { organization, member, session } = await requireOrgMember(orgSlug);
  const scope = { organizationId: organization.id, userId: session.user.id, role: member.role };
  const ticket = await getCustomerTicket(scope, ticketId);
  if (!ticket) notFound();
  // Someone reading as an impersonating admin hasn't read it for the customer.
  if (!session.session.impersonatedBy) await markCustomerTicketRead(scope, ticket.id);

  const state = customerTicketState(ticket.status);
  const productName = PRODUCTS.find((product) => product.key === ticket.context.product)?.name;
  const now = new Date();
  const hidden = { orgSlug, ticketId: ticket.id };
  const items: ConversationItem[] = ticket.messages.map((message) => ({
    id: message.id,
    kind: message.kind,
    author: message.fromSupport
      ? `${message.authorName ?? "Support"} from coss.com`
      : (message.authorName ?? ticket.requesterEmail),
    at: message.createdAt,
    body: message.body,
    visibleText: message.visibleText,
    eventLabel: EVENT_LABELS[message.event ?? ""] ?? null,
    attachments: message.attachments.map((attachment) => ({
      ...attachment,
      href: `/${orgSlug}/support/attachments/${attachment.id}`,
    })),
  }));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        actions={
          state === "resolved" ? (
            <SupportActionButton
              action={reopenTicketAction}
              hidden={hidden}
              success="Ticket reopened"
            >
              Reopen
            </SupportActionButton>
          ) : (
            <SupportActionButton
              action={resolveTicketAction}
              hidden={hidden}
              success="Ticket resolved"
            >
              Mark as resolved
            </SupportActionButton>
          )
        }
        meta={
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <StatusDot tone={STATE_TONE[state]}>{CUSTOMER_TICKET_STATE_LABELS[state]}</StatusDot>
            {ticket.severity === "urgent" ? <Badge variant="error">Urgent</Badge> : null}
            <span className="text-muted-foreground">{supportCategoryLabel(ticket.category)}</span>
            {productName ? <span className="text-muted-foreground">{productName}</span> : null}
            {ticket.context.projectName ? (
              <span className="text-muted-foreground">
                {ticket.context.projectName} / {ticket.context.environmentName}
              </span>
            ) : null}
            {ticket.context.resourceId ? (
              <span className="font-mono text-muted-foreground text-xs">
                {ticket.context.resourceId}
              </span>
            ) : null}
            <span className="font-mono text-muted-foreground text-xs">#{ticket.number}</span>
          </span>
        }
        title={ticket.subject}
      />
      {state === "with_support" && ticket.responseDueAt && ticket.responseDueAt > now ? (
        <p className="text-muted-foreground text-sm">
          Expect a reply by {formatSupportTime(ticket.responseDueAt)}.
        </p>
      ) : null}
      <Conversation items={items} />
      <CustomerComposer orgSlug={orgSlug} ticketId={ticket.id} />
      <div className="flex justify-end">
        <AutoRefresh seconds={20} />
      </div>
    </div>
  );
}
