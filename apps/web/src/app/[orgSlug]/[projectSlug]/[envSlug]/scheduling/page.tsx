import { isId } from "@coss/db/id";
import { listBookings } from "@coss/scheduling";
import { BOOKING_STATUSES } from "@coss/scheduling/schemas";
import { Button } from "@coss/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { CalendarClockIcon, SearchXIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CursorPager } from "@/components/cursor-pager";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { FilterLinks } from "@/components/filter-links";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { BOOKING_STATUS_LABEL, BookingStatusDot } from "@/components/scheduling-badges";
import { SearchForm } from "@/components/search-form";
import { formatDateTime } from "@/lib/format";
import { schedulingPageContext } from "./page-context";
import {
  ApproveBookingButton,
  CancelBookingButton,
  DeclineBookingButton,
} from "./scheduling-actions";

export const metadata: Metadata = { title: "Bookings" };

const PAGE_SIZE = 50;

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

export default async function BookingsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/scheduling">) {
  const { environment, schedulingPath, scope, can, target, deps } = await schedulingPageContext(
    await params,
  );
  const search = await searchParams;
  const after = single(search.after);
  const q = single(search.q);
  if (q && isId("book", q)) redirect(`${schedulingPath}/${q}`);
  const status = BOOKING_STATUSES.find((value) => value === single(search.status));
  // Attendees' names are encrypted: only an exact email address or uid can be searched.
  const page = await listBookings(
    scope,
    {
      limit: PAGE_SIZE,
      after,
      status,
      ...(q?.includes("@") ? { attendeeEmail: q } : { attendeeUid: q }),
    },
    deps,
  );
  const query = (extra: Record<string, string>) => {
    const values = { ...(status ? { status } : {}), ...(q ? { q } : {}), ...extra };
    const encoded = new URLSearchParams(values).toString();
    return encoded ? `${schedulingPath}?${encoded}` : schedulingPath;
  };
  const last = page.data.at(-1);
  const narrowed = Boolean(status || q);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Bookings in this environment, newest first. Answers to booking questions are only available through the API."
        meta={<ModeBadge mode={environment.mode} />}
        title="Bookings"
      />
      <div className="flex flex-wrap items-center gap-2">
        <FilterLinks
          options={[undefined, ...BOOKING_STATUSES].map((option) => {
            const encoded = new URLSearchParams({
              ...(option ? { status: option } : {}),
              ...(q ? { q } : {}),
            }).toString();
            return {
              value: option ?? "all",
              label: option ? BOOKING_STATUS_LABEL[option] : "All",
              href: encoded ? `${schedulingPath}?${encoded}` : schedulingPath,
            };
          })}
          value={status ?? "all"}
        />
        <SearchForm
          action={schedulingPath}
          keep={{ status }}
          placeholder="Attendee's email or uid, booking ID"
          query={q ?? ""}
        />
      </div>
      <Panel
        footer={
          after || page.hasMore ? (
            <CursorPager
              newestHref={after ? query({}) : undefined}
              olderHref={page.hasMore && last ? query({ after: last.id }) : undefined}
            />
          ) : undefined
        }
      >
        {page.data.length === 0 ? (
          <PanelBody>
            {narrowed ? (
              <EmptyState
                description="Search for an attendee's full email address or uid, or try another status."
                icon={SearchXIcon}
                title="No bookings found"
              />
            ) : (
              <EmptyState
                action={
                  <Button
                    render={<Link href={`${schedulingPath}/event-types`} />}
                    size="sm"
                    variant="outline"
                  >
                    Go to event types
                  </Button>
                }
                description="Add a host and an event type, then book through the API or a hosted page."
                icon={CalendarClockIcon}
                title="No bookings yet"
              />
            )}
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
                    <TableCell>
                      <Link
                        className="font-medium hover:underline"
                        href={`${schedulingPath}/${booking.id}`}
                      >
                        {formatDateTime(new Date(booking.start))}
                      </Link>
                    </TableCell>
                    <TableCell>{booking.title}</TableCell>
                    <TableCell>{attendee?.name ?? attendee?.uid ?? "—"}</TableCell>
                    <TableCell>
                      <BookingStatusDot status={booking.status} />
                      {booking.external_conflict_at ? (
                        <p className="text-muted-foreground text-xs">Calendar conflict</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {can({ scheduling: ["update"] }) && booking.status === "pending_approval" ? (
                        <>
                          <ApproveBookingButton {...target} bookingId={booking.id} />
                          <DeclineBookingButton {...target} bookingId={booking.id} />
                        </>
                      ) : !ended && can({ scheduling: ["update"] }) ? (
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
