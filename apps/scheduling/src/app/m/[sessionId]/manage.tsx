"use client";

import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import { Spinner } from "@coss/ui/components/spinner";
import { CalendarIcon, GlobeIcon, MapPinIcon, PhoneIcon, VideoIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  BrandMark,
  BrokenLink,
  Detail,
  DetailList,
  LoadingPanel,
  PageTitle,
  Panel,
  TestModeNotice,
} from "@/components/page";
import { SlotPicker } from "@/components/slot-picker";
import { zoneLabel } from "@/components/time-zone-picker";
import { type Branding, useAccentColor } from "@/lib/branding";
import { browserTimeZone, type ClientApiError, useClientApi } from "@/lib/client-api";
import { postToHost, reportHeight } from "@/lib/embed";

type Booking = {
  id: string;
  status: string;
  title: string;
  start: string;
  end: string;
  location: {
    type: string;
    url?: string | null;
    number?: string | null;
    address?: string | null;
  } | null;
  attendees: { time_zone: string }[];
};

type Session = Branding & { sandbox: boolean };

function Where({ location }: { location: Booking["location"] }) {
  if (!location) return null;
  if (location.url) {
    return (
      <Detail icon={VideoIcon} label="Where">
        <a
          className="underline underline-offset-3"
          href={location.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          Join the meeting
        </a>
      </Detail>
    );
  }
  if (location.number) {
    return (
      <Detail icon={PhoneIcon} label="Where">
        <a className="underline underline-offset-3" href={`tel:${location.number}`}>
          {location.number}
        </a>
      </Detail>
    );
  }
  if (location.address) {
    return (
      <Detail icon={MapPinIcon} label="Where">
        {location.address}
      </Detail>
    );
  }
  return null;
}

const STATUS_BADGES: Record<string, { label: string; variant: "warning" | "error" }> = {
  pending_approval: { label: "Waiting for approval", variant: "warning" },
  held: { label: "Held", variant: "warning" },
  cancelled: { label: "Cancelled", variant: "error" },
  declined: { label: "Declined", variant: "error" },
};

export function Manage({ sessionId, apiUrl }: { sessionId: string; apiUrl: string }) {
  const call = useClientApi(sessionId, apiUrl);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [moved, setMoved] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [working, setWorking] = useState(false);
  const browserZone = useMemo(browserTimeZone, []);
  const timeZone = booking?.attendees[0]?.time_zone ?? browserZone;

  useAccentColor(session?.accent_color);
  useEffect(reportHeight, []);
  useEffect(() => {
    // Branding only: the page still works without it.
    call<Session>("/session")
      .then(setSession)
      .catch(() => {});
  }, [call]);
  useEffect(() => {
    call<Booking>("/booking")
      .then((value) => {
        setBooking(value);
        postToHost({ type: "ready" });
      })
      .catch((error: ClientApiError) => setGone(error.message));
  }, [call]);

  const act = async (run: () => Promise<Booking>, after: (value: Booking) => void) => {
    setWorking(true);
    setProblem(null);
    try {
      const value = await run();
      setBooking(value);
      after(value);
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setWorking(false);
    }
  };

  if (gone) return <BrokenLink message={gone} title="This link isn't working any more" />;
  if (!booking) return <LoadingPanel className="max-w-lg" />;

  const when = new Intl.DateTimeFormat(undefined, {
    timeZone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(booking.start));
  const closed = booking.status === "cancelled" || booking.status === "declined";
  const over = Date.parse(booking.end) < Date.now();
  const badge = STATUS_BADGES[booking.status];
  const statusLine = moved ? "Your booking has moved." : null;
  return (
    <main
      className={`mx-auto flex w-full flex-col gap-4 px-4 py-6 sm:py-12 ${moving ? "max-w-3xl" : "max-w-lg"}`}
    >
      {session?.sandbox ? <TestModeNotice /> : null}
      <Panel className="flex flex-col gap-6 p-4 sm:p-8">
        {session ? <BrandMark branding={session} /> : null}
        <header className="flex flex-col items-start gap-2">
          <PageTitle>{booking.title}</PageTitle>
          {badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}
        </header>
        <DetailList>
          <Detail icon={CalendarIcon} label="When">
            {when}
          </Detail>
          <Detail icon={GlobeIcon} label="Time zone">
            {zoneLabel(timeZone)}
          </Detail>
          {closed ? null : <Where location={booking.location} />}
        </DetailList>
        {statusLine ? (
          <p className="text-pretty text-sm" role="status">
            {statusLine}
          </p>
        ) : null}
        {problem ? (
          <p className="text-destructive-foreground text-sm" role="alert">
            {problem}
          </p>
        ) : null}
        {moving ? (
          <section className="flex flex-col gap-4 border-t pt-6">
            <h2 className="font-medium">Choose a new time</h2>
            <SlotPicker
              busy={working}
              call={call}
              onPick={(slot) =>
                act(
                  () =>
                    call<Booking>("/booking/reschedule", {
                      method: "POST",
                      body: { start: slot.start },
                    }),
                  (value) => {
                    setMoving(false);
                    setMoved(true);
                    postToHost({ type: "rescheduled", booking_id: value.id });
                  },
                )
              }
              path="/booking/slots"
              timeZone={timeZone}
            />
            <Button className="self-start" onClick={() => setMoving(false)} variant="outline">
              Keep the current time
            </Button>
          </section>
        ) : null}
        {!closed && !over && !moving ? (
          <div className="flex flex-wrap gap-2 border-t pt-6">
            {confirmingCancel ? (
              <div className="flex w-full flex-col gap-3">
                <p className="font-medium text-sm">Cancel this booking?</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={working}
                    onClick={() =>
                      act(
                        () => call<Booking>("/booking/cancel", { method: "POST" }),
                        (value) => {
                          setConfirmingCancel(false);
                          setMoved(false);
                          postToHost({ type: "cancelled", booking_id: value.id });
                        },
                      )
                    }
                    variant="destructive"
                  >
                    {working ? <Spinner /> : null}
                    Yes, cancel it
                  </Button>
                  <Button onClick={() => setConfirmingCancel(false)} variant="ghost">
                    No, keep it
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Button
                  onClick={() => {
                    setMoved(false);
                    setMoving(true);
                  }}
                >
                  Reschedule
                </Button>
                <Button onClick={() => setConfirmingCancel(true)} variant="ghost">
                  Cancel booking
                </Button>
              </>
            )}
          </div>
        ) : null}
      </Panel>
    </main>
  );
}
