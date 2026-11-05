"use client";

import { Button } from "@coss/ui/components/button";
import { Input } from "@coss/ui/components/input";
import { Label } from "@coss/ui/components/label";
import { Skeleton } from "@coss/ui/components/skeleton";
import { Spinner } from "@coss/ui/components/spinner";
import { Switch } from "@coss/ui/components/switch";
import { CheckIcon, PlusIcon, XIcon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { TimeZonePicker } from "@/components/time-zone-picker";
import type { ClientCall } from "@/lib/client-api";
import { postToHost } from "@/lib/embed";
import {
  type DayHours,
  DEFAULT_RANGE,
  type HoursRange,
  hoursFromRules,
  hoursProblem,
  rulesFromHours,
  type ScheduleRule,
  WEEKDAYS,
} from "./hours-rules";
import type { HostSession } from "./types";

type Schedule = {
  id: string;
  time_zone: string;
  is_default: boolean;
  rules: ScheduleRule[];
};

function DayRow(props: {
  name: string;
  day: DayHours;
  readOnly: boolean;
  onChange: (next: DayHours) => void;
}) {
  const { name, day, readOnly, onChange } = props;
  const update = (position: number, next: HoursRange) =>
    onChange({
      ...day,
      ranges: day.ranges.map((range, at) => (at === position ? next : range)),
    });
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
      <Label className="flex h-9 items-center gap-2.5 font-medium sm:h-8 sm:w-36">
        <Switch
          checked={day.enabled}
          disabled={readOnly}
          onCheckedChange={(checked) => onChange({ ...day, enabled: checked })}
        />
        {name}
      </Label>
      {day.enabled ? (
        <div className="flex min-w-0 flex-col gap-2">
          {day.ranges.map((range, position) => (
            // Ranges have no identity but their place in the list.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above.
            <div className="flex items-center gap-2" key={position}>
              <Input
                aria-label={`${name} start`}
                className="min-w-0 flex-1 tabular-nums sm:w-30 sm:flex-none [&_input::-webkit-calendar-picker-indicator]:hidden"
                disabled={readOnly}
                onChange={(event) => update(position, { ...range, start: event.target.value })}
                required
                type="time"
                value={range.start}
              />
              <span aria-hidden="true" className="text-muted-foreground">
                –
              </span>
              <Input
                aria-label={`${name} end`}
                className="min-w-0 flex-1 tabular-nums sm:w-30 sm:flex-none [&_input::-webkit-calendar-picker-indicator]:hidden"
                disabled={readOnly}
                onChange={(event) => update(position, { ...range, end: event.target.value })}
                required
                type="time"
                value={range.end}
              />
              {readOnly ? null : position === 0 ? (
                <Button
                  aria-label={`Add hours on ${name}`}
                  onClick={() =>
                    onChange({
                      ...day,
                      ranges: [...day.ranges, { start: "13:00", end: "17:00" }],
                    })
                  }
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <PlusIcon aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  aria-label={`Remove these hours on ${name}`}
                  onClick={() =>
                    onChange({ ...day, ranges: day.ranges.filter((_, at) => at !== position) })
                  }
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <XIcon aria-hidden="true" />
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <span className="flex items-center text-muted-foreground text-sm sm:h-8">Unavailable</span>
      )}
    </div>
  );
}

export function Availability(props: { call: ClientCall; session: HostSession }) {
  const { call, session } = props;
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [hours, setHours] = useState<DayHours[] | null>(null);
  const [timeZone, setTimeZone] = useState(session.host.time_zone);
  const [savedAs, setSavedAs] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    call<{ data: Schedule[] }>("/host/schedules")
      .then((response) => {
        const first = response.data.find((item) => item.is_default) ?? response.data[0] ?? null;
        const initial = first
          ? hoursFromRules(first.rules)
          : WEEKDAYS.map((_, day) => ({
              enabled: day >= 1 && day <= 5,
              ranges: [{ ...DEFAULT_RANGE }],
            }));
        const zone = first?.time_zone ?? session.host.time_zone;
        setSchedule(first);
        setHours(initial);
        setTimeZone(zone);
        // With no schedule yet, the proposed week still has to be saved.
        setSavedAs(first ? JSON.stringify({ hours: rulesFromHours(initial), zone }) : null);
      })
      .catch((error: Error) => setProblem(error.message));
  }, [call, session.host.time_zone]);

  const changeDay = (index: number, next: DayHours) => {
    setJustSaved(false);
    setProblem(null);
    setHours((all) => all?.map((day, at) => (at === index ? next : day)) ?? null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!hours) return;
    const invalid = hoursProblem(hours);
    if (invalid) {
      setProblem(invalid);
      return;
    }
    setSaving(true);
    setProblem(null);
    setJustSaved(false);
    try {
      const rules = rulesFromHours(hours);
      const body = { rules, time_zone: timeZone };
      const next = schedule
        ? await call<Schedule>(`/host/schedules/${schedule.id}`, { method: "PUT", body })
        : await call<Schedule>("/host/schedules", { method: "POST", body });
      setSchedule(next);
      setSavedAs(JSON.stringify({ hours: rules, zone: timeZone }));
      setJustSaved(true);
      postToHost({ type: "availability_saved" });
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!hours) {
    return problem ? (
      <p className="text-destructive-foreground text-sm" role="alert">
        {problem}
      </p>
    ) : (
      <div aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only">Loading your hours</span>
        {WEEKDAYS.map((day) => (
          <Skeleton className="h-9" key={day} />
        ))}
      </div>
    );
  }
  const unchanged = savedAs === JSON.stringify({ hours: rulesFromHours(hours), zone: timeZone });
  return (
    <form className="flex flex-col gap-4" onSubmit={save}>
      <div className="flex flex-col gap-1.5 sm:max-w-72">
        <Label htmlFor="host-time-zone">Your time zone</Label>
        <TimeZonePicker
          disabled={session.read_only}
          id="host-time-zone"
          onChange={(zone) => {
            setJustSaved(false);
            setTimeZone(zone);
          }}
          value={timeZone}
        />
      </div>
      <div className="flex flex-col divide-y border-y">
        {hours.map((day, index) => (
          <DayRow
            day={day}
            key={WEEKDAYS[index]}
            name={WEEKDAYS[index] as string}
            onChange={(next) => changeDay(index, next)}
            readOnly={session.read_only}
          />
        ))}
      </div>
      {problem ? (
        <p className="text-destructive-foreground text-sm" role="alert">
          {problem}
        </p>
      ) : null}
      {session.read_only ? null : (
        <div className="flex items-center gap-3">
          <Button disabled={saving || unchanged} type="submit">
            {saving ? <Spinner /> : null}
            Save hours
          </Button>
          {justSaved ? (
            <span className="flex items-center gap-1.5 text-muted-foreground text-sm" role="status">
              <CheckIcon aria-hidden="true" className="size-4" />
              Saved
            </span>
          ) : null}
        </div>
      )}
    </form>
  );
}
