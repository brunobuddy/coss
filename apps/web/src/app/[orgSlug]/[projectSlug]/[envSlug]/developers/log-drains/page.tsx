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
import { listLogDrains } from "@coss/webhooks";
import { CableIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { planHas } from "@/lib/billing";
import { formatDateTime } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";
import { CreateDrainDialog } from "./create-drain-dialog";
import { DrainStatusBadge } from "./drain-status";
import { FORMAT_LABELS } from "./presets";
import { sourcesSummary } from "./sources";

export const metadata: Metadata = { title: "Log drains" };

export default async function LogDrainsPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/developers/log-drains">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ logDrain: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;
  const [drains, planAllows] = await Promise.all([
    listLogDrains({ organizationId: organization.id, environmentId: environment.id }),
    planHas(organization.id, "logDrains"),
  ]);
  const base = `/${organization.slug}/${project.slug}/${environment.slug}`;

  const create =
    can({ logDrain: ["create"] }) && planAllows ? (
      <CreateDrainDialog
        envSlug={environment.slug}
        orgSlug={organization.slug}
        projectSlug={project.slug}
      />
    ) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={create}
        description="Stream this environment's API requests, email events, webhook attempts and audit events to your own logging stack."
        meta={<ModeBadge mode={environment.mode} />}
        title="Log drains"
      />

      <Panel>
        {drains.length === 0 && !planAllows ? (
          <PanelBody flush>
            <EmptyState
              action={
                <Button
                  render={<Link href={`/${organization.slug}/settings/billing/plans`} />}
                  size="sm"
                  variant="outline"
                >
                  Compare plans
                </Button>
              }
              compact
              description="Log drains are part of the Scale plan and above."
              icon={CableIcon}
              title="Upgrade to stream logs"
            />
          </PanelBody>
        ) : drains.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              action={create}
              compact
              description="Add one to send this environment's logs, as they are written, to an HTTPS endpoint you run or straight into Grafana Cloud, Datadog or an OpenTelemetry collector."
              icon={CableIcon}
              title="No log drains yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead>Sources</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drains.map((drain) => (
                <TableRow key={drain.id}>
                  <TableCell className="max-w-96 truncate">
                    <Link
                      className="font-medium font-mono text-[0.8125rem] underline-offset-4 before:absolute before:inset-0 hover:underline"
                      href={`${base}/developers/log-drains/${drain.id}`}
                    >
                      {drain.url}
                    </Link>
                    {drain.description ? (
                      <div className="truncate text-muted-foreground text-xs">
                        {drain.description}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">
                    {sourcesSummary(drain.sources)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {FORMAT_LABELS[drain.format].label}
                  </TableCell>
                  <TableCell>
                    <DrainStatusBadge drain={drain} />
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatDateTime(drain.createdAt)}
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
