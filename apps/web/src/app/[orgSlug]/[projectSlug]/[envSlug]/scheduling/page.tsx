import { listBookings } from "@coss/scheduling";
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
import { CursorPager } from "@/components/cursor-pager";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { StatusDot } from "@/components/status-dot";
import { formatDateTime } from "@/lib/format";
import { schedulingPageContext } from "./page-context";
import { CancelBookingButton } from "./scheduling-actions";

export const metadata: Metadata = { title: "Bookings" };

const PAGE_SIZE = 50;

const STATUS_TONE = {
  confirmed: "success",
  held: "neutral",
  pending_approval: "warning",
  cancelled: "neutral",
  declined: "neutral",
} as const;

const STATUS_LABEL = {
  confirmed: "Confirmed",
  held: "Held",
  pending_approval: "Awaiting approval",
  cancelled: "Cancelled",
  declined: "Declined",
} as const;

export default async function BookingsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/scheduling">) {
  const { environment, schedulingPath, scope, can, target, deps } = await schedulingPageContext(
    await params,
  );
  const search = await searchParams;
  const after = typeof search.after === "string" ? search.after : undefined;
  const page = await listBookings(scope, { limit: PAGE_SIZE, after }, deps);
  const last = page.data.at(-1);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Bookings in this environment, newest first. Answers to booking questions are only available through the API."
        meta={<ModeBadge mode={environment.mode} />}
        title="Bookings"
      />
      <Panel
        footer={
          after || page.hasMore ? (
            <CursorPager
              newestHref={after ? schedulingPath : undefined}
              olderHref={page.hasMore && last ? `${schedulingPath}?after=${last.id}` : undefined}
            />
          ) : undefined
        }
      >
        {page.data.length === 0 ? (
          <PanelBody>
            <EmptyState
              description="Add a host and an event type, then book through the API or a hosted page."
              icon={CalendarClockIcon}
              title="No bookings yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>What</TableHead>
                <TableHead>Attendee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((booking) => {
                const ended = booking.status === "cancelled" || booking.status === "declined";
                const attendee = booking.attendees[0];
                return (
                  <TableRow key={booking.id}>
                    <TableCell>{formatDateTime(new Date(booking.start))}</TableCell>
                    <TableCell>{booking.title}</TableCell>
                    <TableCell>{attendee?.name ?? attendee?.uid ?? "—"}</TableCell>
                    <TableCell>
                      <StatusDot tone={STATUS_TONE[booking.status]}>
                        {STATUS_LABEL[booking.status]}
                      </StatusDot>
                      {booking.external_conflict_at ? (
                        <p className="text-muted-foreground text-xs">Calendar conflict</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {!ended && can({ scheduling: ["update"] }) ? (
                        <CancelBookingButton {...target} bookingId={booking.id} />
                      ) : null}
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
