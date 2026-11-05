import { orgRoleCan } from "@coss/auth/permissions";
import { getEmailTenant } from "@coss/email";
import { getReputationStanding, listReputationEvents } from "@coss/reputation";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import {
  MarketingPausedAlert,
  ReputationChecks,
  ReputationHistory,
  StandingBadge,
} from "@/components/reputation";
import { SendingPausedAlert } from "@/components/sending-paused-alert";
import { requireOrgMember } from "@/lib/session";

export const metadata: Metadata = { title: "Reputation" };

export default async function ReputationPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/email/reputation">) {
  const { orgSlug } = await params;
  const { organization, member } = await requireOrgMember(orgSlug);
  if (!orgRoleCan(member.role, { reputation: ["read"] })) notFound();
  const [standing, events, tenant] = await Promise.all([
    getReputationStanding(organization.id),
    listReputationEvents(organization.id, { limit: 50 }),
    getEmailTenant(organization.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="coss.com watches the bounce and complaint rates of your live sending and suspends it automatically when they get too high, to protect deliverability for everyone. Marketing email is measured on its own: its rates only ever pause marketing. Sandbox sending is never affected."
        meta={<StandingBadge status={standing?.status ?? "good"} />}
        title="Reputation"
      />
      {tenant?.sendingStatus === "disabled" ? (
        <SendingPausedAlert cause={tenant.statusCause} orgSlug={orgSlug} />
      ) : null}
      {standing?.marketingPausedAt ? (
        <MarketingPausedAlert reason={standing.marketingReason} />
      ) : null}
      <ReputationChecks standing={standing} />
      <ReputationHistory events={events} />
    </div>
  );
}
