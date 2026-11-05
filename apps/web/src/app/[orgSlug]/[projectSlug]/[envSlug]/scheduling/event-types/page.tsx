import { listEventTypes, listHosts } from "@coss/scheduling";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { CalendarClockIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CursorPager } from "@/components/cursor-pager";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { EVENT_TYPE_KIND_LABEL, EventTypeStatusDot } from "@/components/scheduling-badges";
import { schedulingPageContext } from "../page-context";
import { NewEventTypeDialog } from "../scheduling-actions";

export const metadata: Metadata = { title: "Event types" };

const PAGE_SIZE = 50;

export default async function EventTypesPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/scheduling/event-types">) {
  const { schedulingPath, scope, can, target } = await schedulingPageContext(await params);
  const search = await searchParams;
  const after = typeof search.after === "string" ? search.after : undefined;
  const page = await listEventTypes(scope, { limit: PAGE_SIZE, after });
  const hosts = await listHosts(scope, { limit: 100 });
  const last = page.data.at(-1);
  const path = `${schedulingPath}/event-types`;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          can({ scheduling: ["create"] }) ? (
            <NewEventTypeDialog
              {...target}
              hosts={hosts.data.map((host) => ({ id: host.id, name: host.name }))}
            />
          ) : null
        }
        description="What can be booked, and by whom."
        title="Event types"
      />
      <Panel
        footer={
          after || page.hasMore ? (
            <CursorPager
              newestHref={after ? path : undefined}
              olderHref={page.hasMore && last ? `${path}?after=${last.id}` : undefined}
            />
          ) : undefined
        }
      >
        {page.data.length === 0 ? (
          <PanelBody>
            <EmptyState
              action={
                can({ scheduling: ["create"] }) ? (
                  <NewEventTypeDialog
                    {...target}
                    hosts={hosts.data.map((host) => ({ id: host.id, name: host.name }))}
                  />
                ) : null
              }
              description="An appointment, a consultation or a class: how long it takes, and who takes it."
              icon={CalendarClockIcon}
              title="No event types yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Hosts</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Id</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((eventType) => (
                <TableRow key={eventType.id}>
                  <TableCell>
                    <Link className="font-medium hover:underline" href={`${path}/${eventType.id}`}>
                      {eventType.title}
                    </Link>
                  </TableCell>
                  <TableCell>{EVENT_TYPE_KIND_LABEL[eventType.kind]}</TableCell>
                  <TableCell>{eventType.duration_minutes} min</TableCell>
                  <TableCell>{eventType.hosts.length}</TableCell>
                  <TableCell>
                    <EventTypeStatusDot status={eventType.status} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{eventType.id}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
