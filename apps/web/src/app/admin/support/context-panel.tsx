import { billingOverview } from "@coss/billing";
import { formatSupportTarget, PLANS, supportResponseMinutes } from "@coss/billing/catalog";
import { getProduct, isProductKey } from "@coss/dashboard-routes";
import { listDomains } from "@coss/email";
import { listSendersForAdmin } from "@coss/email/admin";
import { getOrganizationStanding } from "@coss/reputation";
import { supportReferenceLabel } from "@coss/support";
import { listSupportTicketsFor, type SupportTicketForRep } from "@coss/support/admin";
import { getOrganizationForAdmin } from "@coss/tenancy/admin";
import { Badge } from "@coss/ui/components/badge";
import Link from "next/link";
import { Panel, PanelBody } from "@/components/panel";
import { SpecItem, SpecList } from "@/components/spec-list";
import { StatusDot, type StatusTone } from "@/components/status-dot";
import { SupportActionButton } from "@/components/support/support-action";
import { formatCents } from "@/lib/billing-format";
import { formatDateTime, formatRelative } from "@/lib/format";
import { acceptTicketCcAction, confirmTicketOrganizationAction } from "./actions";
import { ConfirmOrganizationForm } from "./confirm-organization-form";

const DAY = 24 * 60 * 60 * 1000;
const STANDING_TONE: Record<string, StatusTone> = {
  good: "success",
  warning: "warning",
  suspended: "error",
};

async function OrganizationFacts(props: { organizationId: string; now: Date }) {
  const { organizationId, now } = props;
  const [detail, billing, standing, senders, domains] = await Promise.all([
    getOrganizationForAdmin(organizationId),
    billingOverview(organizationId, now),
    getOrganizationStanding(organizationId),
    listSendersForAdmin({ since: new Date(now.getTime() - 7 * DAY), now, organizationId }),
    listDomains({ organizationId }),
  ]);
  if (!detail) {
    return <p className="p-5 text-muted-foreground text-sm">This organization is gone.</p>;
  }
  const plan = billing.state.terms.plan;
  const sender = senders[0];
  const verified = domains.filter((domain) => domain.status === "verified");
  const status = standing?.standing?.status ?? "good";
  return (
    <SpecList>
      <SpecItem label="Plan">
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge variant={plan === "free" ? "outline" : "secondary"}>{PLANS[plan].name}</Badge>
          {billing.state.contract?.kind === "sales" ? (
            <Badge variant="outline">Contract</Badge>
          ) : null}
          {billing.state.terms.support.allHours ? <Badge variant="outline">24×7</Badge> : null}
        </span>
      </SpecItem>
      <SpecItem label="Support target">
        {formatSupportTarget(supportResponseMinutes(plan, "normal"))}
      </SpecItem>
      <SpecItem label="This month">{formatCents(billing.estimate.usageCents)} of usage</SpecItem>
      <SpecItem label="Standing">
        <StatusDot tone={STANDING_TONE[status] ?? "neutral"}>{status}</StatusDot>
      </SpecItem>
      {billing.holds.length > 0 ? (
        <SpecItem label="Billing hold">
          <StatusDot tone="error">
            {billing.holds.map((hold) => hold.reason.replaceAll("_", " ")).join(", ")}
          </StatusDot>
        </SpecItem>
      ) : null}
      {detail.suspension ? (
        <SpecItem label="Suspended">
          <StatusDot tone="error">{detail.suspension.reason}</StatusDot>
        </SpecItem>
      ) : null}
      {detail.deletion ? (
        <SpecItem label="Deletion">
          <StatusDot tone="warning">Pending</StatusDot>
        </SpecItem>
      ) : null}
      <SpecItem label="Sent, 7 days">
        {sender ? `${sender.liveSent.toLocaleString("en-US")} emails` : "None"}
      </SpecItem>
      <SpecItem label="Domains">
        {verified.length > 0
          ? verified
              .slice(0, 3)
              .map((domain) => domain.name)
              .join(", ")
          : "None verified"}
      </SpecItem>
      <SpecItem label="Member since">{formatDateTime(detail.organization.createdAt)}</SpecItem>
    </SpecList>
  );
}

/** Who this is and what they're on: everything a rep checks before answering. */
export async function TicketContextPanel(props: { data: SupportTicketForRep }) {
  const { ticket, requester, confirmedOrganization, suggestedOrganization } = props.data;
  const now = new Date();
  const organization = confirmedOrganization ?? suggestedOrganization;
  const others = await listSupportTicketsFor({
    organizationId: organization?.id,
    requesterEmail: ticket.requesterEmail,
    excludeTicketId: ticket.id,
  });
  const context = ticket.context;
  const candidates = props.data.requesterOrganizations.filter(
    (item) => item.id !== confirmedOrganization?.id && item.id !== suggestedOrganization?.id,
  );
  return (
    <div className="flex min-w-0 flex-col gap-4 2xl:w-80 2xl:shrink-0">
      {context.path || context.projectName || context.product || context.resourceId ? (
        <Panel title="About">
          <PanelBody flush>
            <SpecList>
              {context.projectName ? (
                <SpecItem label="Project">
                  {context.projectName} / {context.environmentName}
                </SpecItem>
              ) : null}
              {context.product ? (
                <SpecItem label="Product">
                  {isProductKey(context.product)
                    ? getProduct(context.product).name
                    : context.product}
                </SpecItem>
              ) : null}
              {context.resourceId ? (
                <SpecItem label={supportReferenceLabel(context.resourceType ?? "")} mono>
                  {context.resourceType === "email" ? (
                    <Link
                      className="underline underline-offset-2"
                      href={`/admin/emails/${context.resourceId}`}
                    >
                      {context.resourceId}
                    </Link>
                  ) : (
                    context.resourceId
                  )}
                </SpecItem>
              ) : null}
              {context.path ? (
                <SpecItem label="Raised from">
                  <Link
                    className="underline underline-offset-2 [overflow-wrap:anywhere]"
                    href={context.path}
                  >
                    {context.path}
                  </Link>
                </SpecItem>
              ) : null}
            </SpecList>
          </PanelBody>
        </Panel>
      ) : null}

      <Panel title="Requester">
        <PanelBody flush>
          <SpecList>
            <SpecItem label="Email">
              <span className="break-all">{ticket.requesterEmail}</span>
            </SpecItem>
            <SpecItem label="Sender">
              {ticket.senderAuth === "unverified" ? (
                <StatusDot tone="warning">Unverified: could be forged</StatusDot>
              ) : ticket.senderAuth === "session" ? (
                <StatusDot tone="success">Signed in</StatusDot>
              ) : (
                <StatusDot tone="success">Passed DMARC</StatusDot>
              )}
            </SpecItem>
            {requester ? (
              <>
                <SpecItem label="Account">
                  <Link
                    className="underline underline-offset-2"
                    href={`/admin/users/${requester.id}`}
                  >
                    {requester.name}
                  </Link>
                </SpecItem>
                <SpecItem label="Email verified">{requester.emailVerified ? "Yes" : "No"}</SpecItem>
                {requester.banned ? (
                  <SpecItem label="Banned">
                    <StatusDot tone="error">Yes</StatusDot>
                  </SpecItem>
                ) : null}
                <SpecItem label="Joined">{formatRelative(requester.createdAt, now)}</SpecItem>
              </>
            ) : (
              <SpecItem label="Account">None with this address</SpecItem>
            )}
            {ticket.cc.length > 0 ? (
              <SpecItem label="Also on replies">
                <span className="break-all">{ticket.cc.join(", ")}</span>
              </SpecItem>
            ) : null}
          </SpecList>
          {ticket.suggestedCc.length > 0 ? (
            <div className="flex flex-col gap-1.5 border-t px-5 py-3">
              <p className="text-muted-foreground text-xs">
                Copied on unverified mail. Add only if you trust them:
              </p>
              {ticket.suggestedCc.map((address) => (
                <div className="flex items-center justify-between gap-2" key={address}>
                  <span className="min-w-0 truncate text-sm">{address}</span>
                  <SupportActionButton
                    action={acceptTicketCcAction}
                    hidden={{ ticketId: ticket.id, address }}
                    size="xs"
                    success="Added to replies"
                    variant="ghost"
                  >
                    Add
                  </SupportActionButton>
                </div>
              ))}
            </div>
          ) : null}
        </PanelBody>
      </Panel>

      <Panel
        action={
          organization ? (
            <Link
              className="text-muted-foreground text-xs underline underline-offset-2"
              href={`/admin/organizations/${organization.id}`}
            >
              Open
            </Link>
          ) : null
        }
        title={organization?.name ?? "Organization"}
      >
        <PanelBody flush>
          {!confirmedOrganization && suggestedOrganization ? (
            <div className="m-5 flex flex-col gap-2 rounded-lg border border-dashed p-3">
              <p className="text-sm">
                Might be <strong>{suggestedOrganization.name}</strong>. It stays hidden from them
                until you confirm.
              </p>
              <SupportActionButton
                action={confirmTicketOrganizationAction}
                hidden={{ ticketId: ticket.id, organization: suggestedOrganization.id }}
                success="Organization confirmed"
              >
                Confirm {suggestedOrganization.name}
              </SupportActionButton>
            </div>
          ) : null}
          {organization ? (
            <OrganizationFacts now={now} organizationId={organization.id} />
          ) : (
            <p className="p-5 text-muted-foreground text-sm">
              No match. This ticket follows Free's target.
            </p>
          )}
          <div className="flex flex-col gap-2 border-t px-5 py-3">
            {candidates.map((candidate) => (
              <SupportActionButton
                action={confirmTicketOrganizationAction}
                hidden={{ ticketId: ticket.id, organization: candidate.id }}
                key={candidate.id}
                size="xs"
                success="Organization confirmed"
                variant="ghost"
              >
                Use {candidate.name} ({candidate.role})
              </SupportActionButton>
            ))}
            <ConfirmOrganizationForm ticketId={ticket.id} />
          </div>
        </PanelBody>
      </Panel>

      {others.length > 0 ? (
        <Panel title="Other tickets">
          <PanelBody className="flex flex-col gap-2">
            {others.map((other) => (
              <Link
                className="flex items-center gap-2 text-sm hover:underline"
                href={`/admin/support/${other.id}`}
                key={other.id}
              >
                <span className="font-mono text-muted-foreground text-xs">#{other.number}</span>
                <span className="min-w-0 flex-1 truncate">{other.subject}</span>
                <Badge size="sm" variant="outline">
                  {other.status}
                </Badge>
              </Link>
            ))}
          </PanelBody>
        </Panel>
      ) : null}
    </div>
  );
}
