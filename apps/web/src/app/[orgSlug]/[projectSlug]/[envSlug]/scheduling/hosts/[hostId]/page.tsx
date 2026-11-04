import {
  getHost,
  listConnections,
  listEventTypes,
  listSchedules,
  listUpcomingHostBookings,
  SchedulingError,
} from "@coss/scheduling";
import type { ScheduleObjectOutput } from "@coss/scheduling/schemas";
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
import { CopyValue } from "@/components/copy-value";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { BookingStatusDot, EVENT_TYPE_KIND_LABEL } from "@/components/scheduling-badges";
import { StatusDot } from "@/components/status-dot";
import { formatDateTime } from "@/lib/format";
import { schedulingPageContext } from "../../page-context";
import {
  DeleteHostButton,
  HostForm,
  HostStatusButton,
  OpenPortalButton,
} from "../../scheduling-actions";

export const metadata: Metadata = { title: "Host" };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PROVIDER_LABEL = {
  google: "Google",
  microsoft: "Microsoft",
  caldav: "CalDAV",
  simulated: "Simulated",
  zoom: "Zoom",
} as const;
const UPCOMING_SHOWN = 10;

/** Local times exactly as stored: nothing here converts between time zones. */
function hoursSummary(schedule: ScheduleObjectOutput): string {
  if (schedule.rules.length === 0) return "No weekly hours";
  return schedule.rules
    .map((rule) => {
      const days = rule.days.map((day) => WEEKDAYS[day] ?? String(day)).join(", ");
      return `${days} ${rule.start}–${rule.end}`;
    })
    .join("; ");
}

export default async function HostPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/scheduling/hosts/[hostId]">) {
  const { hostId, ...rest } = await params;
  const { schedulingPath, scope, can, target, deps } = await schedulingPageContext(rest);
  const host = await getHost(scope, hostId).catch((error: unknown) => {
    if (error instanceof SchedulingError && error.code === "not_found") notFound();
    throw error;
  });
  const [schedules, connections, eventTypes, upcoming] = await Promise.all([
    listSchedules(scope, host.id),
    listConnections(scope, host.id),
    listEventTypes(scope, { limit: 100, hostId: host.id }),
    listUpcomingHostBookings(
      scope,
      { hostId: host.id, now: new Date(), limit: UPCOMING_SHOWN },
      deps,
    ),
  ]);
  const canEdit = can({ scheduling: ["update"] });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          canEdit ? (
            <div className="flex gap-1">
              <OpenPortalButton {...target} hostId={host.id} />
              <HostStatusButton {...target} hostId={host.id} status={host.status} />
              {can({ scheduling: ["delete"] }) ? (
                <DeleteHostButton {...target} hostId={host.id} leavePage="on" name={host.name} />
              ) : null}
            </div>
          ) : null
        }
        meta={
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <StatusDot tone={host.status === "active" ? "success" : "neutral"}>
              {host.status === "active" ? "Active" : "Disabled"}
            </StatusDot>
            <CopyValue value={host.id} />
          </div>
        }
        title={host.name}
      />

      <Panel title="Details">
        <PanelBody>
          <HostForm {...target} canEdit={canEdit} host={host} key={host.updated_at} />
        </PanelBody>
      </Panel>

      <Panel
        description="Hosts set their own hours on their page, which you can open from here."
        title="Hours"
      >
        {schedules.length === 0 ? (
          <PanelBody>
            <p className="text-muted-foreground text-sm">
              No hours yet, so this host has no times to offer.
            </p>
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Weekly hours</TableHead>
                <TableHead>Time zone</TableHead>
                <TableHead>Date overrides</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      {schedule.name}
                      {schedule.is_default ? <Badge variant="outline">Default</Badge> : null}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-normal">{hoursSummary(schedule)}</TableCell>
                  <TableCell>{schedule.time_zone}</TableCell>
                  <TableCell>{schedule.overrides.length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel
        description="Only when they're busy is read: never titles or who's attending."
        title="Calendars"
      >
        {connections.length === 0 ? (
          <PanelBody>
            <p className="text-muted-foreground text-sm">
              None connected. Only the host can connect theirs, on their page.
            </p>
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Calendars</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connections.map((connection) => (
                <TableRow key={connection.id}>
                  <TableCell>{PROVIDER_LABEL[connection.provider]}</TableCell>
                  <TableCell>{connection.account}</TableCell>
                  <TableCell>{connection.calendars.length}</TableCell>
                  <TableCell>
                    <StatusDot tone={connection.status === "active" ? "success" : "warning"}>
                      {connection.status === "active" ? "Connected" : "Needs reconnecting"}
                    </StatusDot>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel description="Those they're assigned to by name." title="Event types">
        {eventTypes.data.length === 0 ? (
          <PanelBody>
            <p className="text-muted-foreground text-sm">Not assigned to any yet.</p>
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eventTypes.data.map((eventType) => (
                <TableRow key={eventType.id}>
                  <TableCell>
                    <Link
                      className="font-medium hover:underline"
                      href={`${schedulingPath}/event-types/${eventType.id}`}
                    >
                      {eventType.title}
                    </Link>
                  </TableCell>
                  <TableCell>{EVENT_TYPE_KIND_LABEL[eventType.kind]}</TableCell>
                  <TableCell>{eventType.duration_minutes} min</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel
        description={upcoming.nextCursor ? `The next ${UPCOMING_SHOWN}.` : undefined}
        title="Upcoming bookings"
      >
        {upcoming.data.length === 0 ? (
          <PanelBody>
            <p className="text-muted-foreground text-sm">Nothing coming up.</p>
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Starts</TableHead>
                <TableHead>Booking</TableHead>
                <TableHead>Attendee</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {upcoming.data.map((booking) => (
                <TableRow key={booking.id}>
                  <TableCell>
                    <Link
                      className="font-medium hover:underline"
                      href={`${schedulingPath}/${booking.id}`}
                    >
                      {formatDateTime(booking.start)}
                    </Link>
                  </TableCell>
                  <TableCell>{booking.title}</TableCell>
                  <TableCell>
                    {booking.attendees[0]?.name ?? booking.attendees[0]?.uid ?? "—"}
                  </TableCell>
                  <TableCell>
                    <BookingStatusDot status={booking.status} />
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
