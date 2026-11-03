"use client";

import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import { Button } from "@coss/ui/components/button";
import { Spinner } from "@coss/ui/components/spinner";
import { useEffect, useMemo, useState } from "react";
import { SlotPicker } from "@/components/slot-picker";
import { useAccentColor } from "@/lib/branding";
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

function whereText(location: Booking["location"]): string | null {
  if (!location) return null;
  return location.url ?? location.number ?? location.address ?? null;
}

export function Manage({ sessionId, apiUrl }: { sessionId: string; apiUrl: string }) {
  const call = useClientApi(sessionId, apiUrl);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [working, setWorking] = useState(false);
  const [accentColor, setAccentColor] = useState<string | null>(null);
  const browserZone = useMemo(browserTimeZone, []);
  const timeZone = booking?.attendees[0]?.time_zone ?? browserZone;

  useAccentColor(accentColor);
  useEffect(reportHeight, []);
  useEffect(() => {
    call<{ accent_color: string | null }>("/session")
      .then((value) => setAccentColor(value.accent_color))
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

  if (gone) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <Alert variant="error">
          <AlertTitle>This link isn't working any more</AlertTitle>
          <AlertDescription>{gone}</AlertDescription>
        </Alert>
      </main>
    );
  }
  if (!booking) {
    return (
      <main className="flex min-h-64 items-center justify-center" aria-busy>
        <Spinner />
      </main>
    );
  }
  const when = new Intl.DateTimeFormat(undefined, {
    timeZone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(booking.start));
  const ended = booking.status === "cancelled" || booking.status === "declined";
  const where = whereText(booking.location);
  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-xl">{booking.title}</h1>
        <p className="text-sm">{when}</p>
        {where ? <p className="break-all text-muted-foreground text-sm">{where}</p> : null}
        {ended ? <p className="font-medium text-sm">This booking is cancelled.</p> : null}
      </header>
      {problem ? <p className="text-destructive-foreground text-sm">{problem}</p> : null}
      {moving ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-medium text-sm">Choose a new time</h2>
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
                  postToHost({ type: "rescheduled", booking_id: value.id });
                },
              )
            }
            path="/booking/slots"
            timeZone={timeZone}
          />
          <Button onClick={() => setMoving(false)} variant="ghost">
            Keep the current time
          </Button>
        </section>
      ) : null}
      {!ended && !moving ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setMoving(true)} variant="outline">
            Reschedule
          </Button>
          {confirmingCancel ? (
            <>
              <Button
                disabled={working}
                onClick={() =>
                  act(
                    () => call<Booking>("/booking/cancel", { method: "POST" }),
                    (value) => {
                      setConfirmingCancel(false);
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
            </>
          ) : (
            <Button onClick={() => setConfirmingCancel(true)} variant="ghost">
              Cancel booking
            </Button>
          )}
        </div>
      ) : null}
    </main>
  );
}
