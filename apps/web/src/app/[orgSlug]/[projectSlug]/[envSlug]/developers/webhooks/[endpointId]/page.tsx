import { formatRetentionDays, RETENTION_DAYS } from "@coss/retention";
import { getEnvironment } from "@coss/tenancy";
import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { versioning } from "@coss/versioning";
import {
  DISABLE_FAILING_ENDPOINT_AFTER_MS,
  getWebhookEndpoint,
  listWebhookDeliveries,
  previousSecretExpiresAt,
  type WebhookDeliveryLogEntry,
} from "@coss/webhooks";
import { SendIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SpecItem, SpecList } from "@/components/spec-list";
import { StatusDot, type StatusTone } from "@/components/status-dot";
import { formatDateTime } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";
import { EndpointStatusBadge } from "../endpoint-status";
import {
  DeleteEndpointButton,
  RecoverDeliveriesButton,
  RetryDeliveryButton,
  RevealSecret,
  RollSecretButton,
  ToggleEndpointButton,
  UpgradeEndpointVersionButton,
} from "./endpoint-actions";

export const metadata: Metadata = { title: "Webhook endpoint" };

const DISABLED_AFTER_DAYS = DISABLE_FAILING_ENDPOINT_AFTER_MS / (24 * 3_600_000);

const DELIVERY_STATUS = {
  pending: ["warning", "Pending"],
  succeeded: ["success", "Succeeded"],
  failed: ["error", "Failed"],
} as const satisfies Record<WebhookDeliveryLogEntry["status"], readonly [StatusTone, string]>;

function lastResult(delivery: WebhookDeliveryLogEntry): string {
  const last = delivery.attempts.at(-1);
  if (!last) return "Not attempted yet";
  const outcome = last.statusCode ? `HTTP ${last.statusCode}` : (last.error ?? "Failed");
  return `${outcome} in ${last.durationMs} ms`;
}

export default async function WebhookEndpointPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/developers/webhooks/[endpointId]">) {
  const { orgSlug, projectSlug, envSlug, endpointId } = await params;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ webhook: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;
  const endpoint = await getWebhookEndpoint({ organizationId: organization.id, id: endpointId });
  if (!endpoint || endpoint.environmentId !== environment.id) notFound();
  const deliveries = await listWebhookDeliveries({
    organizationId: organization.id,
    endpointId: endpoint.id,
  });
  const canUpdate = can({ webhook: ["update"] });
  const previousExpiresAt = previousSecretExpiresAt(endpoint);
  const canDelete = can({ webhook: ["delete"] });
  const target = {
    orgSlug: organization.slug,
    projectSlug: project.slug,
    envSlug: environment.slug,
    endpointId: endpoint.id,
  };
  const base = `/${organization.slug}/${project.slug}/${environment.slug}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <>
            {can({ log: ["read"] }) ? (
              <Button
                render={
                  <Link
                    href={`${base}/developers/logs?${new URLSearchParams({ q: `source:webhook ${endpoint.id}`, range: "7d" })}`}
                  />
                }
                size="sm"
                variant="outline"
              >
                View logs
              </Button>
            ) : null}
            {canUpdate && endpoint.enabled ? <RecoverDeliveriesButton {...target} /> : null}
            {canUpdate ? <ToggleEndpointButton {...target} enabled={endpoint.enabled} /> : null}
            {canDelete ? <DeleteEndpointButton {...target} url={endpoint.url} /> : null}
          </>
        }
        description={endpoint.description ?? undefined}
        meta={
          <>
            <EndpointStatusBadge endpoint={endpoint} />
            <code className="font-mono text-xs">{endpoint.id}</code>
          </>
        }
        title={<span className="break-all font-mono text-xl sm:text-2xl">{endpoint.url}</span>}
      />

      {!endpoint.enabled && endpoint.disabledReason === "failing" ? (
        <Alert variant="error">
          <AlertTitle>Disabled after repeated failures</AlertTitle>
          <AlertDescription>
            Every delivery to this endpoint failed for {DISABLED_AFTER_DAYS} days, so coss.com
            disabled it{endpoint.disabledAt ? ` on ${formatDateTime(endpoint.disabledAt)}` : ""}.
            Fix the receiver, enable the endpoint again, then recover the deliveries it missed.
          </AlertDescription>
        </Alert>
      ) : null}
      {endpoint.enabled && endpoint.failingSince ? (
        <Alert variant="warning">
          <AlertTitle>Failing since {formatDateTime(endpoint.failingSince)}</AlertTitle>
          <AlertDescription>
            Deliveries to this endpoint have been failing every attempt. If none succeeds for{" "}
            {DISABLED_AFTER_DAYS} days, coss.com disables the endpoint.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel title="Details">
          <PanelBody flush>
            <SpecList>
              <SpecItem label="Events" mono stacked={endpoint.eventTypes.length > 0}>
                {endpoint.eventTypes.length === 0 ? (
                  "All events"
                ) : (
                  <span className="flex flex-wrap gap-1.5">
                    {endpoint.eventTypes.map((type) => (
                      <Badge className="font-mono" key={type} variant="secondary">
                        {type}
                      </Badge>
                    ))}
                  </span>
                )}
              </SpecItem>
              <SpecItem label="API version" mono>
                {endpoint.apiVersion}
                {canUpdate && endpoint.apiVersion < versioning.latest ? (
                  <UpgradeEndpointVersionButton {...target} latest={versioning.latest} />
                ) : null}
              </SpecItem>
              <SpecItem label="Created" mono>
                {formatDateTime(endpoint.createdAt)}
              </SpecItem>
            </SpecList>
          </PanelBody>
        </Panel>

        {canUpdate ? (
          <Panel
            description={
              <>
                Requests carry <code className="font-mono">webhook-id</code>,{" "}
                <code className="font-mono">webhook-timestamp</code> and{" "}
                <code className="font-mono">webhook-signature</code> headers (Standard Webhooks).
                Verify them with this secret before trusting a request. Rolling it replaces it with
                a new one; the old one can keep signing for a while, so you can switch without
                rejecting requests.
              </>
            }
            title="Signing secret"
          >
            <PanelBody className="flex flex-col gap-4">
              {previousExpiresAt ? (
                <p className="text-sm">
                  The previous secret also signs requests until{" "}
                  <span className="font-medium">{formatDateTime(previousExpiresAt)}</span>.
                </p>
              ) : null}
              <div className="flex flex-wrap items-start gap-2">
                {/* Remounts after a roll, so a secret revealed before it isn't left on screen. */}
                <RevealSecret {...target} key={endpoint.updatedAt.toISOString()} />
                <RollSecretButton {...target} />
              </div>
            </PanelBody>
          </Panel>
        ) : null}
      </div>

      <Panel
        description={`Failed deliveries are retried for about a day (8 attempts). Any 2xx response counts as delivered. Deliveries are kept for ${formatRetentionDays(RETENTION_DAYS.webhookDeliveries)}.`}
        title="Recent deliveries"
      >
        {deliveries.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              description="Deliveries appear here once events of the subscribed types happen."
              icon={SendIcon}
              title="No deliveries yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Last result</TableHead>
                <TableHead>Next attempt</TableHead>
                {canUpdate ? <TableHead className="w-0" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.map((delivery) => {
                const [tone, label] = DELIVERY_STATUS[delivery.status];
                return (
                  <TableRow key={delivery.id}>
                    <TableCell>
                      <div className="font-mono text-xs">{delivery.eventType}</div>
                      <div className="font-mono text-muted-foreground text-xs">
                        {delivery.messageId}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusDot pulse={delivery.status === "pending"} tone={tone}>
                        {label}
                      </StatusDot>
                    </TableCell>
                    <TableCell className="font-mono">{delivery.attemptCount}</TableCell>
                    <TableCell className="max-w-64 whitespace-normal break-all font-mono text-muted-foreground text-xs">
                      {lastResult(delivery)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(delivery.nextAttemptAt)}
                    </TableCell>
                    {canUpdate ? (
                      <TableCell className="text-right">
                        {delivery.status === "pending" ? null : (
                          <RetryDeliveryButton {...target} deliveryId={delivery.id} />
                        )}
                      </TableCell>
                    ) : null}
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
