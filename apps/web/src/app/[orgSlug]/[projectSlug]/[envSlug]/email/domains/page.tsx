import { environmentHref } from "@coss/dashboard-routes";
import { getEmailTenant, listDomains } from "@coss/email";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { GlobeIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DomainStatusDot } from "@/components/domain-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SendingPausedAlert } from "@/components/sending-paused-alert";
import { formatDateTime, formatRelative } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";
import { AddDomainDialog } from "./add-domain-dialog";

export const metadata: Metadata = { title: "Domains" };

export default async function DomainsPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/email/domains">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const envBase = environmentHref({
    organization: orgSlug,
    project: projectSlug,
    environment: envSlug,
  });
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ domain: ["read"] })) notFound();
  const [domains, tenant] = await Promise.all([
    // The organization's own: its sub-accounts' domains show on their pages.
    listDomains({ organizationId: organization.id, subaccountId: null }),
    getEmailTenant(organization.id),
  ]);
  const canCreate = can({ domain: ["create"] });
  const addDialog = canCreate ? <AddDomainDialog orgSlug={organization.slug} /> : null;
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={addDialog}
        description="Live API keys can send from verified domains of this organization, in every project."
        title="Domains"
      />

      {tenant?.sendingStatus === "disabled" ? (
        <SendingPausedAlert cause={tenant.statusCause} orgSlug={orgSlug} />
      ) : null}

      <Panel>
        {domains.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              action={addDialog}
              description="Add one to send from your own address with live API keys."
              icon={GlobeIcon}
              title="No domains yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last checked</TableHead>
                <TableHead className="text-right">Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {domains.map((domain) => (
                <TableRow key={domain.id}>
                  <TableCell>
                    <Link
                      className="font-medium font-mono text-[0.8125rem] underline-offset-4 before:absolute before:inset-0 hover:underline"
                      href={`${envBase}/email/domains/${domain.id}`}
                    >
                      {domain.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <DomainStatusDot status={domain.status} />
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground"
                    title={formatDateTime(domain.lastCheckedAt)}
                  >
                    {domain.lastCheckedAt ? formatRelative(domain.lastCheckedAt, now) : "—"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatDateTime(domain.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
