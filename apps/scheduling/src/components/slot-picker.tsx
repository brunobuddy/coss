"use client";

import { Button } from "@coss/ui/components/button";
import { Calendar } from "@coss/ui/components/calendar";
import { Skeleton } from "@coss/ui/components/skeleton";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientCall } from "@/lib/client-api";

const DAY_MS = 86_400_000;
// How far a page with nothing soon looks ahead on its own, before saying so.
const EMPTY_MONTHS_TO_SKIP = 2;

export type Slot = { start: string; end: string; seats_left?: number | null };

function seatsLabel(seats: number): string {
  return seats === 1 ? "1 seat left" : `${seats} seats left`;
}

/** A day in the attendee's own zone, as a stable key. */
function dayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
}

/** The calendar's days are local dates with no zone of their own, so they're compared as keys. */
function cellKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function cellOf(key: string): Date {
  const [year = 0, month = 1, day = 1] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function firstDayOfWeek(): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  try {
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
    };
    const first = locale.getWeekInfo?.().firstDay ?? 7;
    return (first % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  } catch {
    return 0;
  }
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
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const emptyMonthsSkipped = useRef(0);
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    // A retry is a new attempt at the same month.
    void attempt;
    let cancelled = false;
    setSlots(null);
    setFailed(null);
    // A day either side, since the attendee's zone can start or end a month away from UTC's.
    const start = new Date(Math.max(month.getTime() - DAY_MS, Date.now()));
    const end = new Date(new Date(month.getFullYear(), month.getMonth() + 1, 1).getTime() + DAY_MS);
    const query = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
    if (durationMinutes) query.set("duration_minutes", String(durationMinutes));
    call<{ data: Slot[] }>(`${path}?${query}`)
      .then((response) => {
        if (cancelled) return;
        const inMonth = response.data.filter((slot) =>
          dayKey(slot.start, timeZone).startsWith(cellKey(month).slice(0, 7)),
        );
        const first = inMonth[0];
        if (!first && emptyMonthsSkipped.current < EMPTY_MONTHS_TO_SKIP) {
          emptyMonthsSkipped.current += 1;
          setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1));
          return;
        }
        if (first) emptyMonthsSkipped.current = EMPTY_MONTHS_TO_SKIP;
        setSlots(inMonth);
        setChosenDay((current) =>
          current && inMonth.some((slot) => dayKey(slot.start, timeZone) === current)
            ? current
            : first
              ? dayKey(first.start, timeZone)
              : null,
        );
      })
      .catch((error: Error) => {
        if (!cancelled) setFailed(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [call, path, month, durationMinutes, timeZone, attempt]);

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
    () => new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }),
    [],
  );
  const times = chosenDay ? (days.get(chosenDay) ?? []) : [];

  return (
    <div className="@container">
      <div className="grid @xl:grid-cols-[auto_minmax(0,1fr)] gap-x-8 gap-y-6">
        <Calendar
          classNames={{
            day: "p-0.5",
            day_button: "size-full in-data-disabled:no-underline tabular-nums",
          }}
          className="mx-auto @xl:mx-0 [--cell-size:--spacing(10)] sm:[--cell-size:--spacing(10)]"
          disabled={(date) => !days.has(cellKey(date))}
          mode="single"
          modifiers={{ available: (date) => days.has(cellKey(date)) }}
          modifiersClassNames={{
            available:
              "not-data-selected:*:bg-primary/10 *:font-medium not-data-selected:*:hover:bg-primary/20",
          }}
          month={month}
          onMonthChange={setMonth}
          onSelect={(date: Date | undefined) => {
            if (date) setChosenDay(cellKey(date));
          }}
          required
          selected={chosenDay ? cellOf(chosenDay) : undefined}
          showOutsideDays={false}
          startMonth={today}
          weekStartsOn={firstDayOfWeek()}
        />
        <section aria-live="polite" className="flex min-w-0 flex-col gap-3">
          {failed ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-destructive-foreground text-sm">{failed}</p>
              <Button
                onClick={() => setAttempt((value) => value + 1)}
                size="sm"
                type="button"
                variant="outline"
              >
                Try again
              </Button>
            </div>
          ) : null}
          {!slots && !failed ? (
            <div aria-busy="true" className="grid @xl:grid-cols-1 grid-cols-3 gap-2">
              <span className="sr-only">Loading times</span>
              {[0, 1, 2, 3, 4, 5].map((key) => (
                <Skeleton className="h-9" key={key} />
              ))}
            </div>
          ) : null}
          {slots && slots.length === 0 ? (
            <p className="text-pretty text-muted-foreground text-sm">
              Nothing's available this month. Try the next one.
            </p>
          ) : null}
          {slots && chosenDay ? (
            <>
              <h2 className="font-medium text-sm">{dayFormat.format(cellOf(chosenDay))}</h2>
              <fieldset
                aria-label="Choose a time"
                className="grid @xl:max-h-80 @xl:grid-cols-1 grid-cols-3 gap-2 @xl:overflow-y-auto @xl:pe-1"
              >
                {times.map((slot) => (
                  <Button
                    className={
                      slot.seats_left != null
                        ? "h-auto px-1 py-1.5 tabular-nums"
                        : "px-1 tabular-nums"
                    }
                    disabled={busy}
                    key={slot.start}
                    onClick={() => onPick(slot)}
                    type="button"
                    variant="outline"
                  >
                    {slot.seats_left != null ? (
                      // Stacked: three columns on a phone leave no room for it beside the time.
                      <span className="flex flex-col items-center leading-tight">
                        {timeFormat.format(new Date(slot.start))}
                        <span className="font-normal text-muted-foreground text-xs">
                          {seatsLabel(slot.seats_left)}
                        </span>
                      </span>
                    ) : (
                      timeFormat.format(new Date(slot.start))
                    )}
                  </Button>
                ))}
              </fieldset>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
