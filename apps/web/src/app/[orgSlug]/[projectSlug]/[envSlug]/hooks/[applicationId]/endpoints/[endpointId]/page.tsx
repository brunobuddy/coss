import {
  findHookApplication,
  getHookEndpoint,
  latestHookEndpointRecovery,
  listHookEventTypes,
  pageHookDeliveries,
  previousSecretExpiresAt,
} from "@coss/hooks";
import { formatRetentionDays, RETENTION_DAYS } from "@coss/retention";
import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { DISABLE_FAILING_ENDPOINT_AFTER_MS } from "@coss/webhooks";
import { SendIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SpecItem, SpecList } from "@/components/spec-list";
import { StatusDot } from "@/components/status-dot";
import { formatDateTime } from "@/lib/format";
import { EndpointStatusBadge } from "../../../../developers/webhooks/endpoint-status";
import {
  DeleteEndpointButton,
  RecoverButton,
  RetryDeliveryButton,
  RevealSecret,
  RollSecretButton,
  SendTestButton,
  ToggleEndpointButton,
} from "../../../hook-actions";
import { DELIVERY_STATUS, hookPageContext } from "../../../page-context";

export const metadata: Metadata = { title: "Hooks endpoint" };

const DISABLED_AFTER_DAYS = DISABLE_FAILING_ENDPOINT_AFTER_MS / (24 * 3_600_000);

export default async function HookEndpointPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/hooks/[applicationId]/endpoints/[endpointId]">) {
  const { applicationId, endpointId, ...envParams } = await params;
  const { can, organization, environment, hooksPath, target } = await hookPageContext(envParams);
  const application = await findHookApplication({
    organizationId: organization.id,
    environmentId: environment.id,
    ref: applicationId,
  });
  if (!application) notFound();
  const endpoint = await getHookEndpoint({
    organizationId: organization.id,
    applicationId: application.id,
    id: endpointId,
  });
  if (!endpoint) notFound();
  const [deliveries, eventTypes, recovery] = await Promise.all([
    pageHookDeliveries({
      organizationId: organization.id,
      applicationId: application.id,
      endpointId: endpoint.id,
      limit: 50,
    }),
    listHookEventTypes({ organizationId: organization.id, environmentId: environment.id }),
    latestHookEndpointRecovery({ organizationId: organization.id, endpointId: endpoint.id }),
  ]);
  const appPath = `${hooksPath}/${application.id}`;
  const endpointTarget = { ...target, applicationId: application.id, endpointId: endpoint.id };
  const canUpdate = can({ hook: ["update"] });
  const previousExpiresAt = previousSecretExpiresAt(endpoint);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <>
            {canUpdate && endpoint.enabled ? <RecoverButton {...endpointTarget} /> : null}
            {canUpdate ? (
              <ToggleEndpointButton {...endpointTarget} enabled={endpoint.enabled} />
            ) : null}
            {can({ hook: ["delete"] }) ? (
              <DeleteEndpointButton {...endpointTarget} url={endpoint.url} />
            ) : null}
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
            Enable it again once its receiver works, then recover what it missed.
          </AlertDescription>
        </Alert>
      ) : null}
      {endpoint.enabled && endpoint.failingSince ? (
        <Alert variant="warning">
          <AlertTitle>Failing since {formatDateTime(endpoint.failingSince)}</AlertTitle>
          <AlertDescription>
            If no delivery succeeds for {DISABLED_AFTER_DAYS} days, coss.com disables the endpoint.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel title="Details">
          <PanelBody flush>
            <SpecList>
              <SpecItem label="Application">
                <Link className="underline underline-offset-4" href={appPath}>
                  {application.name}
                </Link>
              </SpecItem>
              <SpecItem label="Event types" mono stacked={endpoint.filterTypes.length > 0}>
                {endpoint.filterTypes.length === 0 ? "All" : endpoint.filterTypes.join(", ")}
              </SpecItem>
              <SpecItem label="Rate limit" mono>
                {endpoint.rateLimitPerSecond ? `${endpoint.rateLimitPerSecond}/s` : "Default"}
              </SpecItem>
              <SpecItem label="Created" mono>
                {formatDateTime(endpoint.createdAt)}
              </SpecItem>
              {recovery ? (
                <SpecItem label="Last recovery" mono>
                  {formatDateTime(recovery.createdAt)} · {recovery.requeued} requeued
                  {recovery.status === "pending" ? ", running" : ""}
                </SpecItem>
              ) : null}
            </SpecList>
          </PanelBody>
        </Panel>

        {canUpdate ? (
          <Panel
            description={
              <>
                Requests carry <code className="font-mono">webhook-id</code>,{" "}
                <code className="font-mono">webhook-timestamp</code> and{" "}
                <code className="font-mono">webhook-signature</code> headers (Standard Webhooks),
                signed with this secret.
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
                <RevealSecret {...endpointTarget} key={endpoint.updatedAt.toISOString()} />
                <RollSecretButton {...endpointTarget} />
              </div>
            </PanelBody>
          </Panel>
        ) : null}
      </div>

      <Panel
        action={
          can({ hook: ["send"] }) && endpoint.enabled ? (
            <SendTestButton {...endpointTarget} eventTypes={eventTypes.map((type) => type.name)} />
          ) : null
        }
        description={`Failed deliveries are retried for about a day (8 attempts). Kept for ${formatRetentionDays(RETENTION_DAYS.hookMessages)}.`}
        title="Recent deliveries"
      >
        {deliveries.deliveries.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              description="Messages sent to this endpoint's application show up here."
              icon={SendIcon}
              title="No deliveries yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Last result</TableHead>
                <TableHead>Next attempt</TableHead>
                {canUpdate ? <TableHead className="w-0" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.deliveries.map((delivery) => {
                const [tone, label] = DELIVERY_STATUS[delivery.status];
                return (
                  <TableRow key={delivery.id}>
                    <TableCell>
                      <StatusDot tone={tone}>{label}</StatusDot>
                    </TableCell>
                    <TableCell>
                      <Link
                        className="font-mono text-xs underline-offset-4 hover:underline"
                        href={`${appPath}/messages/${delivery.messageId}`}
                      >
                        {delivery.messageId}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{delivery.attemptCount}</TableCell>
                    <TableCell className="max-w-64 whitespace-normal break-all font-mono text-muted-foreground text-xs">
                      {delivery.lastStatusCode
                        ? `HTTP ${delivery.lastStatusCode}`
                        : (delivery.lastError ?? "—")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(delivery.nextAttemptAt)}
                    </TableCell>
                    {canUpdate ? (
                      <TableCell className="text-right">
                        {delivery.status === "pending" ? null : (
                          <RetryDeliveryButton
                            {...target}
                            applicationId={application.id}
                            deliveryId={delivery.id}
                          />
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
