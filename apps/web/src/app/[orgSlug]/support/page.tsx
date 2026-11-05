import { billingStateAt } from "@coss/billing";
import {
  formatSupportTarget,
  PLANS,
  SUPPORT_HOURS,
  SUPPORT_TIERS,
  supportResponseMinutes,
} from "@coss/billing/catalog";
import { settingsHref } from "@coss/dashboard-routes";
import { listCustomerTickets, seesAllTickets } from "@coss/support";
import {
  CUSTOMER_TICKET_STATE_LABELS,
  type CustomerTicketState,
  customerTicketState,
} from "@coss/support/schemas";
import { Button } from "@coss/ui/components/button";
import { LifeBuoyIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SpecItem, SpecList } from "@/components/spec-list";
import { StatusDot, type StatusTone } from "@/components/status-dot";
import { formatRelative } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";

export const metadata: Metadata = { title: "Support" };

const STATE_TONE: Record<CustomerTicketState, StatusTone> = {
  with_support: "info",
  waiting_for_you: "warning",
  resolved: "neutral",
};

export default async function SupportPage({ params }: PageProps<"/[orgSlug]/support">) {
  const { orgSlug } = await params;
  const { organization, member, session } = await requireOrgMember(orgSlug);
  const now = new Date();
  const [tickets, billing] = await Promise.all([
    listCustomerTickets({
      organizationId: organization.id,
      userId: session.user.id,
      role: member.role,
    }),
    billingStateAt(organization.id, now),
  ]);
  const plan = billing.terms.plan;
  const tier = SUPPORT_TIERS[plan];
  const allHours = billing.terms.support.allHours;
  const newHref = `/${orgSlug}/support/new`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <Button render={<Link href={newHref} />} size="sm">
            <PlusIcon />
            New ticket
          </Button>
        }
        description={
          seesAllTickets(member.role)
            ? `Every ticket from ${organization.name}. You can also email support@coss.com.`
            : "Your tickets. You can also email support@coss.com."
        }
        title="Support"
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel>
          {tickets.length === 0 ? (
            <EmptyState
              action={
                <Button render={<Link href={newHref} />} size="sm">
                  New ticket
                </Button>
              }
              compact
              description="When you need a hand, a person reads every ticket and replies here and by email."
              icon={LifeBuoyIcon}
              title="No tickets yet"
            />
          ) : (
            <ul className="divide-y">
              {tickets.map((ticket) => {
                const state = customerTicketState(ticket.status);
                return (
                  <li key={ticket.id}>
                    <Link
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5 transition-colors hover:bg-muted/56"
                      href={`/${orgSlug}/support/${ticket.id}`}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        {ticket.unread ? (
                          <span
                            aria-label="New reply"
                            className="size-1.5 shrink-0 rounded-full bg-info"
                            role="img"
                          />
                        ) : null}
                        <span
                          className={`min-w-0 truncate text-sm ${ticket.unread ? "font-medium" : ""}`}
                        >
                          {ticket.subject}
                        </span>
                      </span>
                      <StatusDot className="text-xs" tone={STATE_TONE[state]}>
                        {CUSTOMER_TICKET_STATE_LABELS[state]}
                      </StatusDot>
                      <span className="w-20 text-end font-mono text-muted-foreground text-xs">
                        {formatRelative(ticket.lastMessageAt, now)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <Panel title={`${PLANS[plan].name} plan support`}>
          <PanelBody flush>
            <SpecList>
              <SpecItem label="Response target">
                {formatSupportTarget(supportResponseMinutes(plan, "normal"), { allHours })}
              </SpecItem>
              <SpecItem label="Urgent issues">
                {tier.responseMinutes.urgent === null
                  ? "Not included"
                  : formatSupportTarget(tier.responseMinutes.urgent, { allHours })}
              </SpecItem>
              <SpecItem label="Channels">{tier.channels.join(", ")}</SpecItem>
              <SpecItem label="Hours">{allHours ? "All hours" : SUPPORT_HOURS.label}</SpecItem>
            </SpecList>
            {plan === "free" || plan === "pro" ? (
              <div className="border-t p-5">
                <Button
                  className="w-full"
                  render={<Link href={settingsHref(orgSlug, "/billing/plans")} />}
                  size="sm"
                  variant="outline"
                >
                  Compare plans
                </Button>
              </div>
            ) : null}
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
