import { pageHookEventTypes } from "@coss/hooks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { TagsIcon } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { StatusDot } from "@/components/status-dot";
import { ArchiveEventTypeButton, CreateEventTypeDialog } from "../hook-actions";
import { hookPageContext } from "../page-context";

export const metadata: Metadata = { title: "Hooks event types" };

export default async function HookEventTypesPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/hooks/event-types">) {
  const { can, organization, environment, target } = await hookPageContext(await params);
  const { eventTypes } = await pageHookEventTypes({
    organizationId: organization.id,
    environmentId: environment.id,
    includeArchived: true,
    limit: 100,
  });
  const canArchive = can({ hook: ["delete"] });
  const createDialog = can({ hook: ["create"] }) ? <CreateEventTypeDialog {...target} /> : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={createDialog}
        description="The kinds of messages you send. Your applications' users pick the ones their endpoints receive."
        title="Event types"
      />
      <Panel>
        {eventTypes.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              action={createDialog}
              compact
              description="Messages can use any type, but registered ones are what users subscribe to."
              icon={TagsIcon}
              title="No event types yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                {canArchive ? <TableHead className="w-0" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {eventTypes.map((eventType) => (
                <TableRow key={eventType.id}>
                  <TableCell className="font-mono text-xs">{eventType.name}</TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">
                    {eventType.description ?? "—"}
                  </TableCell>
                  <TableCell>
                    {eventType.archivedAt ? (
                      <StatusDot tone="neutral">Archived</StatusDot>
                    ) : (
                      <StatusDot tone="success">Active</StatusDot>
                    )}
                  </TableCell>
                  {canArchive ? (
                    <TableCell className="text-right">
                      <ArchiveEventTypeButton
                        {...target}
                        archived={eventType.archivedAt !== null}
                        name={eventType.name}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
