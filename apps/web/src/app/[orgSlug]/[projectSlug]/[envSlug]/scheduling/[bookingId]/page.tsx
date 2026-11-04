import { getBookingOverview, listBookingNotifications, SchedulingError } from "@coss/scheduling";
import type { BookingObjectOutput } from "@coss/scheduling/schemas";
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
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { BookingStatusDot } from "@/components/scheduling-badges";
import { SpecItem, SpecList } from "@/components/spec-list";
import { formatDateTime } from "@/lib/format";
import { schedulingPageContext } from "../page-context";
import { CancelBookingButton, MarkNoShowButton } from "../scheduling-actions";

export const metadata: Metadata = { title: "Booking" };

const EVENT_LABEL: Record<string, string> = {
  "scheduling.booking.created": "Created",
  "scheduling.booking.held": "Held",
  "scheduling.booking.pending_approval": "Awaiting approval",
  "scheduling.booking.confirmed": "Confirmed",
  "scheduling.booking.rescheduled": "Rescheduled",
  "scheduling.booking.cancelled": "Cancelled",
  "scheduling.booking.declined": "Declined",
  "scheduling.booking.no_show": "Marked as a no-show",
  "scheduling.booking.external_conflict": "Conflict found on a calendar",
  "scheduling.booking.calendar_write_failed": "Couldn't update a calendar",
  "scheduling.booking.location_ready": "Location set",
  "scheduling.booking.started": "Started",
  "scheduling.booking.ended": "Ended",
  "scheduling.booking.reminder": "Reminder webhook",
};

const NOTIFICATION_KIND_LABEL: Record<string, string> = {
  confirmed: "Confirmation",
  pending_approval: "Request received",
  rescheduled: "Rescheduled notice",
  cancelled: "Cancellation notice",
  declined: "Declined notice",
  started: "Started webhook",
  ended: "Ended webhook",
};

const NOTIFICATION_TO_LABEL = {
  "email:attendee": "Attendee email",
  "email:host": "Host email",
  "email:address": "Fixed addresses",
  "sms:attendee": "Attendee SMS",
  "sms:host": "Host SMS",
  "webhook:endpoint": "Your webhook",
} as Record<string, string>;

const OUTCOME_LABEL: Record<string, string> = {
  sent: "Sent",
  too_late: "Skipped: too late",
  filtered: "Skipped: its conditions didn't match",
  no_show: "Skipped: marked a no-show",
  no_address: "Skipped: nowhere to send it",
  no_sender: "Skipped: needs your own sender",
  stale: "Dropped: no longer applied",
  superseded: "Dropped: the booking changed",
  failed: "Failed",
};

const ACTOR_LABEL = {
  api_key: "API key",
  user: "Dashboard member",
  host_session: "Host",
  booker_session: "Booker",
  manage_session: "Attendee",
  system: "coss.com",
} as const;

function locationText(location: BookingObjectOutput["location"]): string {
  if (!location) return "—";
  switch (location.type) {
    case "link":
      return location.url ?? "A link";
    case "phone":
      return location.number ?? "Phone";
    case "in_person":
      return location.address ?? "In person";
    case "google_meet":
      return "Google Meet";
    case "microsoft_teams":
      return "Microsoft Teams";
    case "zoom":
      return location.url ?? "Zoom (the link is being created)";
  }
}

export default async function BookingPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/scheduling/[bookingId]">) {
  const { bookingId, ...rest } = await params;
  const { schedulingPath, scope, can, target, deps } = await schedulingPageContext(rest);
  const { booking, eventTypeTitle, hosts, events } = await getBookingOverview(
    scope,
    bookingId,
    deps,
  ).catch((error: unknown) => {
    if (error instanceof SchedulingError && error.code === "not_found") notFound();
    throw error;
  });
  const notifications = await listBookingNotifications(scope, booking.id);
  const ended = booking.status === "cancelled" || booking.status === "declined";
  const started = booking.status === "confirmed" && new Date(booking.start) <= new Date();
  const metadataEntries = Object.entries(booking.metadata);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          !ended && can({ scheduling: ["update"] }) ? (
            <div className="flex gap-2">
              {started && !booking.no_show_at ? (
                <MarkNoShowButton {...target} bookingId={booking.id} />
              ) : null}
              <CancelBookingButton {...target} bookingId={booking.id} />
            </div>
          ) : null
        }
        description="Answers to booking questions are only available through the API."
        meta={<BookingStatusDot status={booking.status} />}
        title={booking.title}
      />

      <Panel title="Booking">
        <PanelBody flush>
          <SpecList columns={2}>
            <SpecItem label="ID" mono>
              {booking.id}
            </SpecItem>
            <SpecItem label="Event type">
              <Link className="hover:underline" href={`${schedulingPath}/event-types`}>
                {eventTypeTitle ?? booking.event_type}
              </Link>
            </SpecItem>
            <SpecItem label="Starts">{formatDateTime(booking.start)}</SpecItem>
            <SpecItem label="Ends">{formatDateTime(booking.end)}</SpecItem>
            <SpecItem label="Hosts">
              {hosts.length > 0 ? hosts.map((host) => host.name).join(", ") : "—"}
            </SpecItem>
            <SpecItem label="Location">{locationText(booking.location)}</SpecItem>
            <SpecItem label="Created">{formatDateTime(booking.created_at)}</SpecItem>
            <SpecItem label="Updated">{formatDateTime(booking.updated_at)}</SpecItem>
            {booking.hold_expires_at ? (
              <SpecItem label="Hold expires">{formatDateTime(booking.hold_expires_at)}</SpecItem>
            ) : null}
            {booking.approval_expires_at ? (
              <SpecItem label="Approval expires">
                {formatDateTime(booking.approval_expires_at)}
              </SpecItem>
            ) : null}
            {booking.cancelled_at ? (
              <SpecItem label="Cancelled">{formatDateTime(booking.cancelled_at)}</SpecItem>
            ) : null}
            {booking.no_show_at ? (
              <SpecItem label="No-show">{formatDateTime(booking.no_show_at)}</SpecItem>
            ) : null}
            {booking.external_conflict_at ? (
              <SpecItem label="Calendar conflict">
                {formatDateTime(booking.external_conflict_at)}
              </SpecItem>
            ) : null}
            {booking.calendar_unverified ? (
              <SpecItem label="Calendars">Booked without verifying them</SpecItem>
            ) : null}
            {booking.series ? (
              <SpecItem label="Series" mono>
                {booking.series}
                {booking.series_index === null ? "" : ` (#${booking.series_index + 1})`}
              </SpecItem>
            ) : null}
            {booking.group_session ? (
              <SpecItem label="Group session" mono>
                {booking.group_session}
              </SpecItem>
            ) : null}
          </SpecList>
        </PanelBody>
      </Panel>

      <Panel title="Attendees">
        <Table variant="card">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Your ID</TableHead>
              <TableHead>Time zone</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {booking.attendees.map((attendee) => (
              <TableRow key={attendee.id}>
                <TableCell>
                  {attendee.name ?? "—"}
                  {attendee.role === "guest" ? (
                    <span className="text-muted-foreground"> (guest)</span>
                  ) : null}
                </TableCell>
                <TableCell>{attendee.email ?? "—"}</TableCell>
                <TableCell>{attendee.phone ?? "—"}</TableCell>
                <TableCell className="font-mono text-[0.8125rem]">{attendee.uid ?? "—"}</TableCell>
                <TableCell>{attendee.time_zone}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      {metadataEntries.length > 0 ? (
        <Panel title="Metadata">
          <PanelBody flush>
            <SpecList>
              {metadataEntries.map(([key, value]) => (
                <SpecItem key={key} label={key} mono>
                  {value}
                </SpecItem>
              ))}
            </SpecList>
          </PanelBody>
        </Panel>
      ) : null}

      {notifications.length > 0 ? (
        <Panel
          description="What's queued for this booking and what became of it."
          title="Reminders and notices"
        >
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Due</TableHead>
                <TableHead>What</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notifications.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatDateTime(row.due_at)}</TableCell>
                  <TableCell>
                    {row.reminder_key ? (
                      <span className="font-mono text-[0.8125rem]">{row.reminder_key}</span>
                    ) : (
                      (NOTIFICATION_KIND_LABEL[row.kind] ?? row.kind)
                    )}
                  </TableCell>
                  <TableCell>
                    {NOTIFICATION_TO_LABEL[`${row.channel}:${row.recipient}`] ?? row.channel}
                  </TableCell>
                  <TableCell>
                    {row.outcome ? (OUTCOME_LABEL[row.outcome] ?? row.outcome) : "Scheduled"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      ) : null}

      <Panel title="History">
        <Table variant="card">
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>What</TableHead>
              <TableHead>By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.id}>
                <TableCell>{formatDateTime(event.occurredAt)}</TableCell>
                <TableCell>{EVENT_LABEL[event.type] ?? event.type}</TableCell>
                <TableCell>{ACTOR_LABEL[event.actor]}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
