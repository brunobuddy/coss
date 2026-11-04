import { listHosts, listReassignments } from "@coss/scheduling";
import { REASSIGNMENT_REASON_LABELS } from "@coss/scheduling/schemas";
import { Badge } from "@coss/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { ArrowRightLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CursorPager } from "@/components/cursor-pager";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { schedulingPageContext } from "../page-context";
import { ReassignManyDialog } from "../scheduling-actions";
import { REASSIGNMENT_STATUS, runDate } from "./status";

export const metadata: Metadata = { title: "Reassignments" };

const PAGE_SIZE = 50;
const HOSTS_TO_OFFER = 100;

export default async function ReassignmentsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/scheduling/reassignments">) {
  const { schedulingPath, scope, can, target } = await schedulingPageContext(await params);
  const search = await searchParams;
  const after = typeof search.after === "string" ? search.after : undefined;
  const [page, hosts] = await Promise.all([
    listReassignments(scope, { limit: PAGE_SIZE, after }),
    listHosts(scope, { limit: HOSTS_TO_OFFER }),
  ]);
  const path = `${schedulingPath}/reassignments`;
  const last = page.data.at(-1);
  const dialog = can({ scheduling: ["update"] }) ? (
    <ReassignManyDialog
      {...target}
      hosts={hosts.data.map((host) => ({ id: host.id, name: host.name }))}
      runsPath={path}
    />
  ) : null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={dialog}
        description="Moving many bookings at once: when someone's away, leaving, or has too much on."
        title="Reassignments"
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
              action={dialog}
              description="See who each booking would go to first, and change any of it. A booking nobody can take stays where it is."
              icon={ArrowRightLeftIcon}
              title="No reassignments yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Moved</TableHead>
                <TableHead>Stayed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((run) => {
                const status = REASSIGNMENT_STATUS[run.status];
                const stayed = run.counts.no_candidate + run.counts.failed;
                return (
                  <TableRow key={run.id}>
                    <TableCell>
                      <Link
                        className="underline-offset-2 hover:underline"
                        href={`${path}/${run.id}`}
                      >
                        {runDate.format(new Date(run.created_at))} UTC
                      </Link>
                    </TableCell>
                    <TableCell>{REASSIGNMENT_REASON_LABELS[run.reason_code]}</TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell>
                      {run.counts.reassigned} of {run.counts.total}
                    </TableCell>
                    <TableCell>
                      {stayed > 0 ? (
                        <Badge variant="warning">{stayed}</Badge>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
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
