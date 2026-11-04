import { listHosts, listOutOfOffice, listOutOfOfficeConflicts } from "@coss/scheduling";
import { OUT_OF_OFFICE_REASON_LABELS } from "@coss/scheduling/schemas";
import { Badge } from "@coss/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { PalmtreeIcon } from "lucide-react";
import type { Metadata } from "next";
import { CursorPager } from "@/components/cursor-pager";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { schedulingPageContext } from "../page-context";
import { DeleteOutOfOfficeButton, OpenTeamPageButton } from "../scheduling-actions";

export const metadata: Metadata = { title: "Out of office" };

const PAGE_SIZE = 50;
// A long list of hosts is fine to choose from: this only bounds one page's load.
const HOSTS_TO_OFFER = 100;

const dayFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", dateStyle: "medium" });

function whenOf(entry: {
  start: string;
  end: string;
  all_day: { start_date: string; end_date: string } | null;
}): string {
  if (entry.all_day) {
    const first = dayFormat.format(new Date(`${entry.all_day.start_date}T00:00:00Z`));
    const last = dayFormat.format(new Date(`${entry.all_day.end_date}T00:00:00Z`));
    return first === last ? first : `${first} – ${last}`;
  }
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `${format.format(new Date(entry.start))} – ${format.format(new Date(entry.end))} UTC`;
}

export default async function OutOfOfficePage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/scheduling/out-of-office">) {
  const { schedulingPath, scope, can, target, deps } = await schedulingPageContext(await params);
  const search = await searchParams;
  const after = typeof search.after === "string" ? search.after : undefined;
  const now = new Date();
  const [page, hosts] = await Promise.all([
    listOutOfOffice(scope, { fromMs: now.getTime(), limit: PAGE_SIZE, after }, deps),
    listHosts(scope, { limit: HOSTS_TO_OFFER }),
  ]);
  const conflicts = await Promise.all(
    page.data.map((entry) =>
      listOutOfOfficeConflicts(scope, entry.id, { limit: 100 }, { now: () => now }),
    ),
  );
  const nameOf = new Map(hosts.data.map((host) => [host.id, host.name]));
  const last = page.data.at(-1);
  const path = `${schedulingPath}/out-of-office`;
  const canDelete = can({ scheduling: ["delete"] });
  const canMove = can({ scheduling: ["update"] });
  const dialog = canMove ? (
    <OpenTeamPageButton {...target} label="Add time off" tab="away" variant="default" />
  ) : null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={dialog}
        description="Time hosts are away. They aren't offered during it, and bookings they already have stay until someone moves them."
        title="Out of office"
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
              description="Add time off here or with the API. Hosts can add their own on their page."
              icon={PalmtreeIcon}
              title="Nobody's away"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Host</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Bookings in this time</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((entry, index) => {
                const found = conflicts[index];
                const count = found?.data.length ?? 0;
                return (
                  <TableRow key={entry.id}>
                    <TableCell>{nameOf.get(entry.host) ?? entry.host}</TableCell>
                    <TableCell>{whenOf(entry)}</TableCell>
                    <TableCell>
                      {(OUT_OF_OFFICE_REASON_LABELS as Record<string, string>)[entry.reason] ??
                        entry.reason}
                    </TableCell>
                    <TableCell>
                      {count > 0 ? (
                        <Badge variant="warning">
                          {count}
                          {found?.hasMore ? "+" : ""}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {canMove && count > 0 ? (
                          <OpenTeamPageButton
                            {...target}
                            label="Move bookings"
                            outOfOfficeId={entry.id}
                            variant="ghost"
                          />
                        ) : null}
                        {canDelete ? (
                          <DeleteOutOfOfficeButton {...target} entryId={entry.id} />
                        ) : null}
                      </div>
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
