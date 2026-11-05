import { listHolidayCalendars, listHosts } from "@coss/scheduling";
import { HOLIDAY_COUNTRIES } from "@coss/scheduling/holiday-countries";
import { Badge } from "@coss/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { TreePalmIcon } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { schedulingPageContext } from "../page-context";
import { DeleteHolidayCalendarButton, NewHolidayCalendarDialog } from "../scheduling-actions";

export const metadata: Metadata = { title: "Holidays" };

const HOSTS_TO_OFFER = 100;

const whoOf = (calendar: {
  hosts: string[] | null;
  host_filter: Record<string, string | string[]> | null;
}) => {
  if (calendar.hosts) {
    return calendar.hosts.length === 1 ? "1 host" : `${calendar.hosts.length} hosts`;
  }
  return Object.entries(calendar.host_filter ?? {})
    .map(([key, value]) => `${key}: ${[value].flat().join(", ")}`)
    .join("; ");
};

export default async function HolidaysPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/scheduling/holidays">) {
  const { scope, can, target, environment } = await schedulingPageContext(await params);
  const [page, hosts] = await Promise.all([
    listHolidayCalendars(scope),
    listHosts(scope, { limit: HOSTS_TO_OFFER }),
  ]);
  const offered = hosts.data
    .filter((host) => host.status === "active")
    .map((host) => ({ id: host.id, name: host.name }));
  const countries = Object.entries(HOLIDAY_COUNTRIES)
    .map(([value, entry]) => ({ value, label: entry.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const dialog = can({ scheduling: ["create"] }) ? (
    <NewHolidayCalendarDialog
      {...target}
      countries={countries}
      feedsAllowed={environment.mode === "live"}
      hosts={offered}
    />
  ) : null;
  const canDelete = can({ scheduling: ["delete"] });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={dialog}
        description="Public holidays, or your own feed, as time away for the hosts you choose. A host who removes a day keeps it removed."
        title="Holidays"
      />
      <Panel>
        {page.data.length === 0 ? (
          <PanelBody>
            <EmptyState
              action={dialog}
              description="Choose a country or add your own feed, and who it applies to. It's kept up to date from then on."
              icon={TreePalmIcon}
              title="No holiday calendars yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((calendar) => (
                <TableRow key={calendar.id}>
                  <TableCell>{calendar.name}</TableCell>
                  <TableCell>
                    {calendar.country
                      ? (HOLIDAY_COUNTRIES[calendar.country]?.name ?? calendar.country)
                      : "Your feed"}
                  </TableCell>
                  <TableCell>{whoOf(calendar)}</TableCell>
                  <TableCell>
                    {calendar.last_error ? (
                      <Badge variant="warning">{calendar.last_error}</Badge>
                    ) : calendar.last_read_at ? (
                      <Badge variant="success">Up to date</Badge>
                    ) : (
                      <Badge variant="secondary">Waiting for its first read</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {canDelete ? (
                      <div className="flex justify-end">
                        <DeleteHolidayCalendarButton {...target} calendarId={calendar.id} />
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
