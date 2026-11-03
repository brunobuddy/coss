"use client";

import { Button } from "@coss/ui/components/button";
import { Skeleton } from "@coss/ui/components/skeleton";
import { useEffect, useMemo, useState } from "react";
import type { ClientCall } from "@/lib/client-api";

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 14;

type Slot = { start: string; end: string };

/** A day in the attendee's own zone, as a stable key. */
function dayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
}

/** Slots are UTC instants from the API; only this component turns them into local times. */
export function SlotPicker(props: {
  call: ClientCall;
  /** `/slots` or `/booking/slots`. */
  path: string;
  timeZone: string;
  durationMinutes?: number | undefined;
  onPick: (slot: Slot) => void;
  busy?: boolean;
}) {
  const { call, path, timeZone, durationMinutes, onPick, busy } = props;
  const [offset, setOffset] = useState(0);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [chosenDay, setChosenDay] = useState<string | null>(null);

  const { start, end } = useMemo(() => {
    const from = Date.now() + offset * WINDOW_DAYS * DAY_MS;
    return {
      start: new Date(from).toISOString(),
      end: new Date(from + WINDOW_DAYS * DAY_MS).toISOString(),
    };
  }, [offset]);

  useEffect(() => {
    let cancelled = false;
    setSlots(null);
    setFailed(null);
    const query = new URLSearchParams({ start, end });
    if (durationMinutes) query.set("duration_minutes", String(durationMinutes));
    call<{ data: Slot[] }>(`${path}?${query}`)
      .then((response) => {
        if (cancelled) return;
        setSlots(response.data);
        const first = response.data[0];
        setChosenDay(first ? dayKey(first.start, timeZone) : null);
      })
      .catch((error: Error) => {
        if (!cancelled) setFailed(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [call, path, start, end, durationMinutes, timeZone]);

  const days = useMemo(() => {
    const byDay = new Map<string, Slot[]>();
    for (const slot of slots ?? []) {
      const key = dayKey(slot.start, timeZone);
      byDay.set(key, [...(byDay.get(key) ?? []), slot]);
    }
    return byDay;
  }, [slots, timeZone]);

  const timeFormat = useMemo(
    () => new Intl.DateTimeFormat(undefined, { timeZone, hour: "numeric", minute: "2-digit" }),
    [timeZone],
  );
  const dayFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        timeZone: "UTC",
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button
          disabled={offset === 0}
          onClick={() => setOffset((value) => value - 1)}
          size="sm"
          variant="outline"
        >
          Earlier
        </Button>
        <span className="text-muted-foreground text-xs">Times shown in {timeZone}</span>
        <Button onClick={() => setOffset((value) => value + 1)} size="sm" variant="outline">
          Later
        </Button>
      </div>
      {failed ? <p className="text-destructive-foreground text-sm">{failed}</p> : null}
      {!slots && !failed ? (
        <div aria-busy className="grid grid-cols-3 gap-2">
          {[0, 1, 2, 3, 4, 5].map((key) => (
            <Skeleton className="h-9" key={key} />
          ))}
        </div>
      ) : null}
      {slots && slots.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground text-sm">
          Nothing available in these two weeks. Try later dates.
        </p>
      ) : null}
      {days.size > 0 ? (
        <>
          <fieldset aria-label="Choose a day" className="flex flex-wrap gap-2">
            {[...days.keys()].map((key) => (
              <Button
                aria-pressed={chosenDay === key}
                key={key}
                onClick={() => setChosenDay(key)}
                size="sm"
                variant={chosenDay === key ? "default" : "outline"}
              >
                {dayFormat.format(new Date(`${key}T00:00:00Z`))}
              </Button>
            ))}
          </fieldset>
          <fieldset aria-label="Choose a time" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {(chosenDay ? (days.get(chosenDay) ?? []) : []).map((slot) => (
              <Button
                disabled={busy}
                key={slot.start}
                onClick={() => onPick(slot)}
                variant="outline"
              >
                {timeFormat.format(new Date(slot.start))}
              </Button>
            ))}
          </fieldset>
        </>
      ) : null}
    </div>
  );
}
