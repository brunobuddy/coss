import { listHosts } from "@coss/scheduling";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { UserRoundIcon } from "lucide-react";
import type { Metadata } from "next";
import { CursorPager } from "@/components/cursor-pager";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { StatusDot } from "@/components/status-dot";
import { schedulingPageContext } from "../page-context";
import {
  DeleteHostButton,
  HostStatusButton,
  NewHostDialog,
  OpenPortalButton,
} from "../scheduling-actions";

export const metadata: Metadata = { title: "Hosts" };

const PAGE_SIZE = 50;

export default async function HostsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/scheduling/hosts">) {
  const { schedulingPath, scope, can, target } = await schedulingPageContext(await params);
  const search = await searchParams;
  const after = typeof search.after === "string" ? search.after : undefined;
  const page = await listHosts(scope, { limit: PAGE_SIZE, after });
  const last = page.data.at(-1);
  const hostsPath = `${schedulingPath}/hosts`;
  const canUpdate = can({ scheduling: ["update"] });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={can({ scheduling: ["create"] }) ? <NewHostDialog {...target} /> : null}
        description="The people who can be booked. Each has their own page for hours and calendars."
        title="Hosts"
      />
      <Panel
        footer={
          after || page.hasMore ? (
            <CursorPager
              newestHref={after ? hostsPath : undefined}
              olderHref={page.hasMore && last ? `${hostsPath}?after=${last.id}` : undefined}
            />
          ) : undefined
        }
      >
        {page.data.length === 0 ? (
          <PanelBody>
            <EmptyState
              action={can({ scheduling: ["create"] }) ? <NewHostDialog {...target} /> : null}
              description="Create one here or with the API, usually one for each of your users who takes bookings."
              icon={UserRoundIcon}
              title="No hosts yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Your id</TableHead>
                <TableHead>Time zone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((host) => (
                <TableRow key={host.id}>
                  <TableCell>{host.name}</TableCell>
                  <TableCell className="font-mono text-xs">{host.uid ?? "—"}</TableCell>
                  <TableCell>{host.time_zone}</TableCell>
                  <TableCell>
                    <StatusDot tone={host.status === "active" ? "success" : "neutral"}>
                      {host.status === "active" ? "Active" : "Disabled"}
                    </StatusDot>
                  </TableCell>
                  <TableCell>
                    {canUpdate ? (
                      <div className="flex justify-end gap-1">
                        <OpenPortalButton {...target} hostId={host.id} />
                        <HostStatusButton {...target} hostId={host.id} status={host.status} />
                        {can({ scheduling: ["delete"] }) ? (
                          <DeleteHostButton {...target} hostId={host.id} name={host.name} />
                        ) : null}
                      </div>
                    ) : null}
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
