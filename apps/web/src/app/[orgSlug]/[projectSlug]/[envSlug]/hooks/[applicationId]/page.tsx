import {
  findHookApplication,
  listHookEndpoints,
  listHookEventTypes,
  pageHookMessages,
} from "@coss/hooks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { LinkIcon, MessageSquareIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { formatDateTime, formatRelative } from "@/lib/format";
import { EndpointStatusBadge } from "../../developers/webhooks/endpoint-status";
import { CreateEndpointDialog, DeleteApplicationButton, OpenPortalButton } from "../hook-actions";
import { hookPageContext } from "../page-context";

export const metadata: Metadata = { title: "Hooks application" };

export default async function HookApplicationPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/hooks/[applicationId]">) {
  const { applicationId, ...envParams } = await params;
  const { can, organization, environment, hooksPath, target } = await hookPageContext(envParams);
  const application = await findHookApplication({
    organizationId: organization.id,
    environmentId: environment.id,
    ref: applicationId,
  });
  if (!application) notFound();
  const scope = { organizationId: organization.id, applicationId: application.id };
  const [endpoints, eventTypes, messages] = await Promise.all([
    listHookEndpoints(scope),
    listHookEventTypes({ organizationId: organization.id, environmentId: environment.id }),
    pageHookMessages({ ...scope, limit: 20 }),
  ]);
  const appTarget = { ...target, applicationId: application.id };
  const appPath = `${hooksPath}/${application.id}`;
  const createEndpoint = can({ hook: ["create"] }) ? (
    <CreateEndpointDialog {...appTarget} eventTypes={eventTypes.map((type) => type.name)} />
  ) : null;
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <>
            {can({ hook: ["update"] }) ? <OpenPortalButton {...appTarget} /> : null}
            {can({ hook: ["delete"] }) ? (
              <DeleteApplicationButton {...appTarget} name={application.name} />
            ) : null}
          </>
        }
        meta={
          <>
            <code className="font-mono text-xs">{application.id}</code>
            {application.uid ? (
              <code className="font-mono text-xs">uid {application.uid}</code>
            ) : null}
          </>
        }
        title={application.name}
      />

      <Panel
        action={createEndpoint}
        description="Where this application's messages go. Its users can manage them in the portal."
        title="Endpoints"
      >
        {endpoints.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              action={createEndpoint}
              compact
              description="Add one here, or let the application's users add theirs in the portal."
              icon={LinkIcon}
              title="No endpoints yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead>Event types</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {endpoints.map((endpoint) => (
                <TableRow key={endpoint.id}>
                  <TableCell className="max-w-96 whitespace-normal">
                    <Link
                      className="break-all font-medium font-mono text-xs underline-offset-4 before:absolute before:inset-0 hover:underline"
                      href={`${appPath}/endpoints/${endpoint.id}`}
                    >
                      {endpoint.url}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-normal font-mono text-muted-foreground text-xs">
                    {endpoint.filterTypes.length === 0 ? "All" : endpoint.filterTypes.join(", ")}
                  </TableCell>
                  <TableCell>
                    <EndpointStatusBadge endpoint={endpoint} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel description="The last 20 messages sent to this application." title="Recent messages">
        {messages.messages.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              description="Messages you send to this application show up here."
              icon={MessageSquareIcon}
              title="No messages yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Event type</TableHead>
                <TableHead>Message</TableHead>
                <TableHead className="text-right">Sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.messages.map((message) => (
                <TableRow key={message.id}>
                  <TableCell className="font-medium font-mono text-xs">
                    {message.eventType}
                  </TableCell>
                  <TableCell>
                    <Link
                      className="font-mono text-muted-foreground text-xs underline-offset-4 before:absolute before:inset-0 hover:underline"
                      href={`${appPath}/messages/${message.id}`}
                    >
                      {message.id}
                    </Link>
                  </TableCell>
                  <TableCell
                    className="text-right font-mono text-muted-foreground text-xs"
                    title={formatDateTime(message.createdAt)}
                  >
                    {formatRelative(message.createdAt, now)}
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
