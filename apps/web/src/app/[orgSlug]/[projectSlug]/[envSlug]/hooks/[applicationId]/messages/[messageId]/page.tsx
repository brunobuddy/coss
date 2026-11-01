import {
  findHookApplication,
  getHookMessage,
  listHookAttempts,
  listMessageDeliveries,
} from "@coss/hooks";
import { SendIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { StatusDot } from "@/components/status-dot";
import { formatDateTime } from "@/lib/format";
import { RetryDeliveryButton } from "../../../hook-actions";
import { DELIVERY_STATUS, hookPageContext } from "../../../page-context";

export const metadata: Metadata = { title: "Hooks message" };

export default async function HookMessagePage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/hooks/[applicationId]/messages/[messageId]">) {
  const { applicationId, messageId, ...envParams } = await params;
  const { can, organization, environment, hooksPath, target } = await hookPageContext(envParams);
  const application = await findHookApplication({
    organizationId: organization.id,
    environmentId: environment.id,
    ref: applicationId,
  });
  if (!application) notFound();
  const message = await getHookMessage({
    organizationId: organization.id,
    applicationId: application.id,
    id: messageId,
  });
  if (!message) notFound();
  const deliveries = await listMessageDeliveries({ organizationId: organization.id, message });
  const attempts = await Promise.all(deliveries.map((delivery) => listHookAttempts(delivery)));
  const appPath = `${hooksPath}/${application.id}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description={
          <>
            Sent to{" "}
            <Link className="underline underline-offset-4" href={appPath}>
              {application.name}
            </Link>{" "}
            {formatDateTime(message.createdAt)}.
          </>
        }
        meta={<code className="font-mono text-xs">{message.id}</code>}
        title={<span className="font-mono">{message.eventType}</span>}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel description="The JSON body delivered to each endpoint." title="Payload">
          <PanelBody className="overflow-hidden" flush>
            <pre className="max-h-[32rem] overflow-auto p-4 font-mono text-[0.8125rem] leading-relaxed">
              {JSON.stringify(message.payload, null, 2)}
            </pre>
          </PanelBody>
        </Panel>

        <Panel
          description="One per endpoint the message went to, with every attempt."
          title="Deliveries"
        >
          {deliveries.length === 0 ? (
            <PanelBody flush>
              <EmptyState
                compact
                description={`No endpoint of this application was subscribed to ${message.eventType}.`}
                icon={SendIcon}
                title="Not delivered anywhere"
              />
            </PanelBody>
          ) : (
            <PanelBody flush>
              {deliveries.map((delivery, index) => {
                const [tone, label] = DELIVERY_STATUS[delivery.status];
                const deliveryAttempts = attempts[index] ?? [];
                return (
                  <div
                    className="flex flex-col gap-2 border-t px-5 py-4 first:border-t-0"
                    key={delivery.id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <StatusDot tone={tone}>{label}</StatusDot>
                        <Link
                          className="truncate font-mono text-xs underline-offset-4 hover:underline"
                          href={`${appPath}/endpoints/${delivery.endpointId}`}
                        >
                          {delivery.endpointId}
                        </Link>
                      </div>
                      {can({ hook: ["update"] }) && delivery.status !== "pending" ? (
                        <RetryDeliveryButton
                          {...target}
                          applicationId={application.id}
                          deliveryId={delivery.id}
                        />
                      ) : null}
                    </div>
                    {delivery.lastError && deliveryAttempts.length === 0 ? (
                      <p className="font-mono text-muted-foreground text-xs">
                        {delivery.lastError}
                      </p>
                    ) : null}
                    {deliveryAttempts.length > 0 ? (
                      <ol className="flex flex-col gap-1.5 border-l ps-3 font-mono text-xs">
                        {deliveryAttempts.map((attempt) => (
                          <li className="flex flex-col gap-0.5" key={attempt.id}>
                            <span>
                              <span className="text-muted-foreground">
                                {formatDateTime(attempt.attemptedAt)}
                              </span>{" "}
                              · {attempt.statusCode ? `HTTP ${attempt.statusCode}` : attempt.error}{" "}
                              · {attempt.durationMs} ms
                            </span>
                            {attempt.responseExcerpt ? (
                              <code className="break-all text-muted-foreground">
                                {attempt.responseExcerpt}
                              </code>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </div>
                );
              })}
            </PanelBody>
          )}
        </Panel>
      </div>
    </div>
  );
}
