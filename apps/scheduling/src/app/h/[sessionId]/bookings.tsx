"use client";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@coss/ui/components/alert-dialog";
import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@coss/ui/components/empty";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import { Skeleton } from "@coss/ui/components/skeleton";
import { CalendarIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClientCall } from "@/lib/client-api";
import type { HostSession } from "./types";

type HostBooking = {
  id: string;
  status: string;
  title: string;
  start: string;
  end: string;
  attendees: { name: string | null }[];
};

type BookingPage = { data: HostBooking[]; next_cursor: string | null };

/** Giving a booking away: who's free and takes this, by name, and nothing about anyone else. */
function GiveAway(props: { call: ClientCall; bookingId: string; onMoved: () => void }) {
  const { call, bookingId, onMoved } = props;
  const [people, setPeople] = useState<{ host: string; name: string }[] | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const open = async () => {
    setProblem(null);
    try {
      const response = await call<{ data: { host: string; name: string }[] }>(
        `/host/bookings/${bookingId}/reassign_candidates`,
      );
      setPeople(response.data);
    } catch (error) {
      setProblem((error as Error).message);
    }
  };
  const give = async () => {
    if (!to) return;
    setWorking(true);
    setProblem(null);
    try {
      await call(`/host/bookings/${bookingId}/reassign`, { method: "POST", body: { to_host: to } });
      onMoved();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setWorking(false);
    }
  };
  if (people === null) {
    return (
      <>
        <Button onClick={open} size="sm" variant="outline">
          Give to someone
        </Button>
        {problem ? (
          <p className="text-destructive-foreground text-xs" role="alert">
            {problem}
          </p>
        ) : null}
      </>
    );
  }
  if (people.length === 0) {
    return <span className="text-muted-foreground text-xs">Nobody else is free then.</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <div className="w-44">
        <Select
          items={people.map((person) => ({ value: person.host, label: person.name }))}
          onValueChange={(next) => setTo(next ? String(next) : null)}
          value={to}
        >
          <SelectTrigger aria-label="Who it goes to">
            <SelectValue placeholder="Who it goes to" />
          </SelectTrigger>
          <SelectPopup>
            {people.map((person) => (
              <SelectItem key={person.host} value={person.host}>
                {person.name}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>
      <Button disabled={working || !to} onClick={give} size="sm">
        Give
      </Button>
      {problem ? (
        <p className="text-destructive-foreground text-xs" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

export function Bookings(props: { call: ClientCall; session: HostSession }) {
  const { call, session } = props;
  const [bookings, setBookings] = useState<HostBooking[] | null>(null);
  const [loadFailed, setLoadFailed] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const timeZone = session.host.time_zone;

  const load = useCallback(() => {
    call<BookingPage>("/host/bookings")
      .then((response) => {
        setBookings(response.data);
        setNextCursor(response.next_cursor);
      })
      .catch((error: Error) => setLoadFailed(error.message));
  }, [call]);
  useEffect(load, [load]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    setProblem(null);
    try {
      const response = await call<BookingPage>(
        `/host/bookings?cursor=${encodeURIComponent(nextCursor)}`,
      );
      setBookings((current) => [...(current ?? []), ...response.data]);
      setNextCursor(response.next_cursor);
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const act = async (id: string, action: "approve" | "decline" | "cancel") => {
    setWorking(id);
    setProblem(null);
    try {
      await call(`/host/bookings/${id}/${action}`, { method: "POST" });
      load();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setWorking(null);
    }
  };

  const dayFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        timeZone,
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    [timeZone],
  );
  const timeFormat = useMemo(
    () => new Intl.DateTimeFormat(undefined, { timeZone, hour: "numeric", minute: "2-digit" }),
    [timeZone],
  );
  const groups = useMemo(() => {
    const byDay = new Map<string, HostBooking[]>();
    for (const booking of bookings ?? []) {
      const day = dayFormat.format(new Date(booking.start));
      byDay.set(day, [...(byDay.get(day) ?? []), booking]);
    }
    return [...byDay.entries()];
  }, [bookings, dayFormat]);

  if (loadFailed) {
    return (
      <p className="text-destructive-foreground text-sm" role="alert">
        {loadFailed}
      </p>
    );
  }
  if (!bookings) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only">Loading your bookings</span>
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }
  if (bookings.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Nothing coming up</EmptyTitle>
          <EmptyDescription>New bookings show up here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {problem ? (
        <p className="text-destructive-foreground text-sm" role="alert">
          {problem}
        </p>
      ) : null}
      {groups.map(([day, items]) => (
        <section className="flex flex-col gap-2" key={day}>
          <h2 className="font-medium text-muted-foreground text-sm">{day}</h2>
          <ul className="flex flex-col divide-y rounded-xl border">
            {items.map((booking) => {
              const attendee = booking.attendees[0]?.name;
              const start = new Date(booking.start);
              const pending = booking.status === "pending_approval";
              return (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
                  key={booking.id}
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      <span className="tabular-nums">
                        {timeFormat.format(start)} – {timeFormat.format(new Date(booking.end))}
                      </span>
                      {pending ? <Badge variant="warning">Needs approval</Badge> : null}
                    </span>
                    <span className="text-muted-foreground">
                      {attendee ? `${attendee}, ` : ""}
                      {booking.title}
                    </span>
                  </div>
                  {session.read_only ? null : (
                    <div className="flex flex-wrap items-center gap-2">
                      {session.can_reassign ? (
                        <GiveAway bookingId={booking.id} call={call} onMoved={load} />
                      ) : null}
                      {pending ? (
                        <>
                          <Button
                            disabled={working === booking.id}
                            onClick={() => act(booking.id, "approve")}
                            size="sm"
                          >
                            Approve
                          </Button>
                          <Button
                            disabled={working === booking.id}
                            onClick={() => act(booking.id, "decline")}
                            size="sm"
                            variant="outline"
                          >
                            Decline
                          </Button>
                        </>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <Button
                                disabled={working === booking.id}
                                size="sm"
                                variant="outline"
                              />
                            }
                          >
                            Cancel
                          </AlertDialogTrigger>
                          <AlertDialogPopup>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {attendee ?? "The attendee"} will be told, and this can't be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogClose render={<Button variant="ghost" />}>
                                Keep it
                              </AlertDialogClose>
                              <AlertDialogClose
                                onClick={() => act(booking.id, "cancel")}
                                render={<Button variant="destructive" />}
                              >
                                Cancel booking
                              </AlertDialogClose>
                            </AlertDialogFooter>
                          </AlertDialogPopup>
                        </AlertDialog>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {nextCursor ? (
        <Button
          className="self-start"
          disabled={loadingMore}
          onClick={loadMore}
          type="button"
          variant="outline"
        >
          Show more
        </Button>
      ) : null}
    </div>
  );
}
