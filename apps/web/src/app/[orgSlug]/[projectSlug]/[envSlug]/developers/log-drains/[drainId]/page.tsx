import { formatRetentionDays, RETENTION_DAYS } from "@coss/retention";
import { getEnvironment } from "@coss/tenancy";
import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import {
  countQueuedLogDrainLines,
  getLogDrain,
  LOG_DRAIN_MAX_ATTEMPTS,
  type LogDrainBatchLogEntry,
  pageLogDrainBatches,
} from "@coss/webhooks";
import { PackageIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SpecItem, SpecList } from "@/components/spec-list";
import { StatusDot, type StatusTone } from "@/components/status-dot";
import { formatDateTime } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";
import { DrainStatusBadge } from "../drain-status";
import { FORMAT_LABELS } from "../presets";
import { sourcesSummary } from "../sources";
import {
  DeleteDrainButton,
  EditDeliveryButton,
  EditSourcesButton,
  RevealDrainSecret,
  ToggleDrainButton,
} from "./drain-actions";

export const metadata: Metadata = { title: "Log drain" };

const BATCH_STATUS = {
  pending: ["warning", "Pending"],
  succeeded: ["success", "Sent"],
  failed: ["error", "Failed"],
} as const satisfies Record<LogDrainBatchLogEntry["status"], readonly [StatusTone, string]>;

function lastResult(batch: LogDrainBatchLogEntry): string {
  const last = batch.attempts.at(-1);
  if (!last) return batch.lastError ?? "Not attempted yet";
  const outcome = last.statusCode ? `HTTP ${last.statusCode}` : (last.error ?? "Failed");
  return `${outcome} in ${last.durationMs} ms`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function LogDrainPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/developers/log-drains/[drainId]">) {
  const { orgSlug, projectSlug, envSlug, drainId } = await params;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ logDrain: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;
  const drain = await getLogDrain({ organizationId: organization.id, id: drainId });
  if (!drain || drain.environmentId !== environment.id) notFound();
  const ids = { organizationId: organization.id, drainId: drain.id };
  const [{ batches }, queued] = await Promise.all([
    pageLogDrainBatches({ ...ids, limit: 50 }),
    countQueuedLogDrainLines(ids),
  ]);
  const canUpdate = can({ logDrain: ["update"] });
  const target = {
    orgSlug: organization.slug,
    projectSlug: project.slug,
    envSlug: environment.slug,
    drainId: drain.id,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <>
            {canUpdate ? (
              <EditDeliveryButton
                {...target}
                authHeaderName={drain.authHeaderName}
                format={drain.format}
                url={drain.url}
              />
            ) : null}
            {canUpdate ? <EditSourcesButton {...target} sources={drain.sources} /> : null}
            {canUpdate ? <ToggleDrainButton {...target} enabled={drain.enabled} /> : null}
            {can({ logDrain: ["delete"] }) ? (
              <DeleteDrainButton {...target} url={drain.url} />
            ) : null}
          </>
        }
        description={drain.description ?? undefined}
        meta={
          <>
            <DrainStatusBadge drain={drain} />
            <code className="font-mono text-xs">{drain.id}</code>
          </>
        }
        title={<span className="break-all font-mono text-xl sm:text-2xl">{drain.url}</span>}
      />

      {!drain.enabled && drain.disabledReason === "failing" ? (
        <Alert variant="error">
          <AlertTitle>Disabled after repeated failures</AlertTitle>
          <AlertDescription>
            A batch failed all {LOG_DRAIN_MAX_ATTEMPTS} attempts, so coss.com disabled this drain
            {drain.disabledAt ? ` on ${formatDateTime(drain.disabledAt)}` : ""} and dropped the
            lines waiting for it. Fix the endpoint, then enable the drain again.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel title="Details">
          <PanelBody flush>
            <SpecList>
              <SpecItem label="Sources">{sourcesSummary(drain.sources)}</SpecItem>
              <SpecItem label="Format">{FORMAT_LABELS[drain.format].label}</SpecItem>
              <SpecItem label="Auth header" mono>
                {drain.authHeaderName ?? "None"}
              </SpecItem>
              <SpecItem label="Waiting" mono>
                {queued === 1 ? "1 line" : `${queued.toLocaleString("en-US")} lines`}
              </SpecItem>
              <SpecItem label="Created" mono>
                {formatDateTime(drain.createdAt)}
              </SpecItem>
            </SpecList>
          </PanelBody>
        </Panel>

        {canUpdate ? (
          <Panel
            description={
              <>
                Requests carry <code className="font-mono">webhook-id</code> (the batch id),{" "}
                <code className="font-mono">webhook-timestamp</code> and{" "}
                <code className="font-mono">webhook-signature</code> headers (Standard Webhooks).
                Verify them with this secret before storing the lines (NDJSON drains; log platforms
                ignore them).
              </>
            }
            title="Signing secret"
          >
            <PanelBody>
              <RevealDrainSecret {...target} />
            </PanelBody>
          </Panel>
        ) : null}
      </div>

      <Panel
        description={`Each batch is one request of up to 500 lines. Failed batches are retried for about a day (${LOG_DRAIN_MAX_ATTEMPTS} attempts); any 2xx response counts as sent. Batches are kept for ${formatRetentionDays(RETENTION_DAYS.logDrainBatches)}.`}
        title="Recent batches"
      >
        {batches.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              description="Batches appear here as lines are written and sent."
              icon={PackageIcon}
              title="No batches yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Lines</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Last result</TableHead>
                <TableHead>Next attempt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((batch) => {
                const [tone, label] = BATCH_STATUS[batch.status];
                const excerpt = batch.attempts.at(-1)?.responseExcerpt;
                return (
                  <TableRow key={batch.id}>
                    <TableCell>
                      <div className="text-xs">{formatDateTime(batch.createdAt)}</div>
                      <div className="font-mono text-muted-foreground text-xs">{batch.id}</div>
                    </TableCell>
                    <TableCell>
                      <StatusDot pulse={batch.status === "pending"} tone={tone}>
                        {label}
                      </StatusDot>
                    </TableCell>
                    <TableCell className="font-mono">
                      {batch.recordCount}
                      <div className="text-muted-foreground text-xs">
                        {formatBytes(batch.byteSize)}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">{batch.attemptCount}</TableCell>
                    <TableCell className="max-w-64 whitespace-normal break-all font-mono text-muted-foreground text-xs">
                      {lastResult(batch)}
                      {excerpt && batch.status !== "succeeded" ? (
                        <div className="mt-1 line-clamp-2">{excerpt}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(batch.nextAttemptAt)}
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
