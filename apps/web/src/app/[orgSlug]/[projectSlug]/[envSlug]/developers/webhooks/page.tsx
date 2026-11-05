import { WEBHOOK_EVENT_TYPES } from "@coss/email/schemas";
import { getEnvironment } from "@coss/tenancy";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { listWebhookEndpoints } from "@coss/webhooks";
import { WebhookIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { formatDateTime } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";
import { CreateEndpointDialog } from "./create-endpoint-dialog";
import { EndpointStatusBadge } from "./endpoint-status";

export const metadata: Metadata = { title: "Webhooks" };

export default async function WebhooksPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/developers/webhooks">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ webhook: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;
  const endpoints = await listWebhookEndpoints({
    organizationId: organization.id,
    environmentId: environment.id,
  });
  const base = `/${organization.slug}/${project.slug}/${environment.slug}`;
  const canCreate = can({ webhook: ["create"] });
  const create = canCreate ? (
    <CreateEndpointDialog
      envSlug={environment.slug}
      eventTypes={WEBHOOK_EVENT_TYPES}
      orgSlug={organization.slug}
      projectSlug={project.slug}
    />
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={create}
        description="Signed notifications of email delivery events and reputation changes in this environment."
        meta={<ModeBadge mode={environment.mode} />}
        title="Webhooks"
      />

      <Panel>
        {endpoints.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              action={create}
              compact
              description="Add an endpoint to be notified when emails are delivered, bounce or receive complaints."
              icon={WebhookIcon}
              title="No endpoints yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {endpoints.map((endpoint) => (
                <TableRow key={endpoint.id}>
                  <TableCell className="max-w-96 truncate">
                    <Link
                      className="font-medium font-mono text-[0.8125rem] underline-offset-4 before:absolute before:inset-0 hover:underline"
                      href={`${base}/developers/webhooks/${endpoint.id}`}
                    >
                      {endpoint.url}
                    </Link>
                    {endpoint.description ? (
                      <div className="truncate text-muted-foreground text-xs">
                        {endpoint.description}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {endpoint.eventTypes.length === 0
                      ? "All events"
                      : `${endpoint.eventTypes.length} ${endpoint.eventTypes.length === 1 ? "event" : "events"}`}
                  </TableCell>
                  <TableCell>
                    <EndpointStatusBadge endpoint={endpoint} />
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatDateTime(endpoint.createdAt)}
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
