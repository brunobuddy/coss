import { listMigrations, PROVIDER_NAMES } from "@coss/migrate";
import { getEnvironment } from "@coss/tenancy";
import { Button } from "@coss/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { ImportIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { StatusDot } from "@/components/status-dot";
import { formatDateTime } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";
import { STATUS_LABELS } from "./labels";

export const metadata: Metadata = { title: "Import" };

export default async function ImportsPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/developers/import">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ environment: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;
  const imports = await listMigrations({
    organizationId: organization.id,
    environmentId: environment.id,
  });
  const base = `/${organization.slug}/${project.slug}/${environment.slug}`;
  const start = can({ environment: ["update"] }) ? (
    <Button render={<Link href={`${base}/developers/import/new`} />} size="sm">
      New import
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={start}
        description="Bring your domains, templates, contacts, suppressions and webhooks over from Resend, SendGrid or Postmark."
        meta={<ModeBadge mode={environment.mode} />}
        title="Import"
      />

      <Panel>
        {imports.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              action={start}
              compact
              description="Connect your old provider with an API key: coss.com reads what you have there, and you choose what to bring into this environment."
              icon={ImportIcon}
              title="No imports yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Connected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imports.map((row) => {
                const status = STATUS_LABELS[row.status] ?? { label: row.status, tone: "neutral" };
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        className="font-medium underline-offset-4 before:absolute before:inset-0 hover:underline"
                        href={`${base}/developers/import/${row.id}`}
                      >
                        {PROVIDER_NAMES[row.provider]}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-[0.8125rem] text-muted-foreground">
                      {row.credentialHint}
                    </TableCell>
                    <TableCell>
                      <StatusDot pulse={status.pulse} tone={status.tone}>
                        {status.label}
                      </StatusDot>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDateTime(row.createdAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
