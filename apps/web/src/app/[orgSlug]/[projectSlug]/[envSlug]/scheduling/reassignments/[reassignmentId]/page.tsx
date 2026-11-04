import {
  getReassignment,
  listHosts,
  listReassignmentItems,
  SchedulingError,
} from "@coss/scheduling";
import {
  REASSIGNMENT_REASON_LABELS,
  type ReassignmentItemObjectOutput,
} from "@coss/scheduling/schemas";
import { Badge } from "@coss/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CursorPager } from "@/components/cursor-pager";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SpecItem, SpecList } from "@/components/spec-list";
import { schedulingPageContext } from "../../page-context";
import { CancelReassignmentButton, UndoReassignmentDialog } from "../../scheduling-actions";
import { REASSIGNMENT_STATUS, runDate } from "../status";

export const metadata: Metadata = { title: "Reassignment" };

const PAGE_SIZE = 100;
const HOSTS_TO_NAME = 100;

const OUTCOME: Record<ReassignmentItemObjectOutput["outcome"], string> = {
  pending: "Waiting",
  reassigned: "Moved",
  skipped_changed: "Changed since, so left alone",
  no_candidate: "Nobody could take it: it stayed",
  failed: "Failed: it stayed",
  cancelled: "Cancelled before it moved",
};

export default async function ReassignmentPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/scheduling/reassignments/[reassignmentId]">) {
  const resolved = await params;
  const { schedulingPath, scope, can, target } = await schedulingPageContext(resolved);
  const search = await searchParams;
  const after = typeof search.after === "string" ? search.after : undefined;
  const run = await getReassignment(scope, resolved.reassignmentId).catch((error) => {
    if (error instanceof SchedulingError && error.code === "not_found") notFound();
    throw error;
  });
  const [items, hosts] = await Promise.all([
    listReassignmentItems(scope, run.id, { limit: PAGE_SIZE, after }),
    listHosts(scope, { limit: HOSTS_TO_NAME }),
  ]);
  const nameOf = new Map(hosts.data.map((host) => [host.id, host.name]));
  const name = (id: string | null) => (id ? (nameOf.get(id) ?? id) : "");
  const runsPath = `${schedulingPath}/reassignments`;
  const path = `${runsPath}/${run.id}`;
  const status = REASSIGNMENT_STATUS[run.status];
  const canUpdate = can({ scheduling: ["update"] });
  const running = run.status === "pending" || run.status === "running";
  const last = items.data.at(-1);
  const actions = canUpdate ? (
    running ? (
      <CancelReassignmentButton {...target} reassignmentId={run.id} />
    ) : run.counts.reassigned > 0 ? (
      <UndoReassignmentDialog
        {...target}
        moved={run.counts.reassigned}
        reassignmentId={run.id}
        runsPath={runsPath}
      />
    ) : null
  ) : null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={actions}
        description={
          running
            ? "Bookings move one at a time in the background. Reload to see how it's going."
            : undefined
        }
        meta={<Badge variant={status.variant}>{status.label}</Badge>}
        title="Reassignment"
      />
      <Panel>
        <PanelBody flush>
          <SpecList columns={2}>
            <SpecItem label="Reason">{REASSIGNMENT_REASON_LABELS[run.reason_code]}</SpecItem>
            <SpecItem label="Started">{runDate.format(new Date(run.created_at))} UTC</SpecItem>
            <SpecItem label="Moved">
              {run.counts.reassigned} of {run.counts.total}
            </SpecItem>
            <SpecItem label="Nobody could take">{run.counts.no_candidate}</SpecItem>
            <SpecItem label="Changed since">{run.counts.skipped}</SpecItem>
            <SpecItem label="Failed">{run.counts.failed}</SpecItem>
            {run.undo_of ? (
              <SpecItem label="Gives back">
                <Link className="underline underline-offset-2" href={`${runsPath}/${run.undo_of}`}>
                  An earlier reassignment
                </Link>
              </SpecItem>
            ) : null}
          </SpecList>
        </PanelBody>
      </Panel>
      {items.data.length > 0 ? (
        <Panel
          footer={
            after || items.hasMore ? (
              <CursorPager
                newestHref={after ? path : undefined}
                olderHref={items.hasMore && last ? `${path}?after=${last.id}` : undefined}
              />
            ) : undefined
          }
        >
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Booking</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>What happened</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.data.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link
                      className="font-mono text-[0.8125rem] underline-offset-2 hover:underline"
                      href={`${schedulingPath}/${item.booking}`}
                    >
                      {item.booking}
                    </Link>
                  </TableCell>
                  <TableCell>{name(item.from_host)}</TableCell>
                  <TableCell>{item.outcome === "reassigned" ? name(item.to_host) : ""}</TableCell>
                  <TableCell>{OUTCOME[item.outcome]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      ) : null}
    </div>
  );
}
