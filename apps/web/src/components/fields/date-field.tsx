"use client";

import { Button } from "@coss/ui/components/button";
import { Calendar } from "@coss/ui/components/calendar";
import { Input } from "@coss/ui/components/input";
import { Popover, PopoverPopup, PopoverTrigger } from "@coss/ui/components/popover";
import { cn } from "@coss/ui/lib/utils";
import { CalendarIcon, XIcon } from "lucide-react";
import { useState } from "react";

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MINUTE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** "2026-10-10" ↔ a local Date at midnight (the calendar's days). */
function dayToDate(day: string): Date | undefined {
  const match = DAY.exec(day);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined;
}

function dateToDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function longDay(day: string): string {
  const date = dayToDate(day);
  return date
    ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : day;
}

function DayPicker(props: {
  day: string;
  onDay: (day: string) => void;
  placeholder: string;
  clearable?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = dayToDate(props.day);
  return (
    <div className="flex items-center gap-1">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          render={
            <Button
              className={cn(
                "min-w-40 justify-start font-normal",
                !props.day && "text-muted-foreground",
              )}
              id={props.id}
              variant="outline"
            />
          }
        >
          <CalendarIcon className="opacity-72" />
          {props.day ? longDay(props.day) : props.placeholder}
        </PopoverTrigger>
        <PopoverPopup align="start" className="w-auto *:p-2">
          <Calendar
            defaultMonth={selected}
            mode="single"
            onSelect={(date: Date | undefined) => {
              if (date) props.onDay(dateToDay(date));
              setOpen(false);
            }}
            selected={selected}
          />
        </PopoverPopup>
      </Popover>
      {props.clearable && props.day ? (
        <Button aria-label="Clear" onClick={() => props.onDay("")} size="icon-sm" variant="ghost">
          <XIcon />
        </Button>
      ) : null}
    </div>
  );
}

/** A day from a calendar, posted as "YYYY-MM-DD" under `name` (empty when cleared). */
export function DateField(props: {
  name?: string;
  value?: string;
  onValueChange?: (day: string) => void;
  defaultValue?: string;
  placeholder?: string;
  clearable?: boolean;
  id?: string;
}) {
  const [own, setOwn] = useState(
    DAY.test(props.defaultValue ?? "") ? (props.defaultValue ?? "") : "",
  );
  const day = props.value ?? own;
  const setDay = (next: string) => {
    if (props.value === undefined) setOwn(next);
    props.onValueChange?.(next);
  };
  return (
    <>
      {props.name ? <input name={props.name} type="hidden" value={day} /> : null}
      <DayPicker
        clearable={props.clearable ?? true}
        day={day}
        id={props.id}
        onDay={setDay}
        placeholder={props.placeholder ?? "Pick a day"}
      />
    </>
  );
}

/**
 * A UTC minute: a day from a calendar and a time, posted as "YYYY-MM-DDTHH:mm" under `name` (the
 * actions add `:00Z`), with the same moment in the viewer's own time beside it.
 */
export function UtcDateTimeField(props: {
  name: string;
  defaultValue?: string;
  required?: boolean;
  id?: string;
}) {
  const initial = MINUTE.exec(props.defaultValue ?? "");
  const [day, setDay] = useState(initial?.[1] ?? "");
  const [time, setTime] = useState(initial ? `${initial[2]}:${initial[3]}` : "09:00");
  const value = day && time ? `${day}T${time}` : "";
  const local = value ? new Date(`${value}:00Z`) : null;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const preset = (date: Date) => {
    setDay(`${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`);
    setTime(`${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`);
  };
  const inAnHour = () => {
    const date = new Date(Date.now() + 60 * 60 * 1000);
    date.setUTCMinutes(Math.ceil(date.getUTCMinutes() / 15) * 15, 0, 0);
    preset(date);
  };
  const tomorrowAtNine = () => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 1);
    date.setUTCHours(9, 0, 0, 0);
    preset(date);
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <input name={props.name} required={props.required} type="hidden" value={value} />
      <div className="flex flex-wrap items-center gap-2">
        <DayPicker day={day} id={props.id} onDay={setDay} placeholder="Pick a day" />
        <Input
          aria-label="Time (UTC)"
          className="w-32 font-mono tabular-nums"
          onChange={(event) => setTime(event.currentTarget.value)}
          type="time"
          value={time}
        />
        <span className="font-mono text-muted-foreground text-xs">UTC</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Button onClick={inAnHour} size="xs" variant="outline">
          In an hour
        </Button>
        <Button onClick={tomorrowAtNine} size="xs" variant="outline">
          Tomorrow, 09:00 UTC
        </Button>
        {local && !Number.isNaN(local.getTime()) ? (
          <span className="text-muted-foreground">
            {local.toLocaleString(undefined, {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            in {zone.replaceAll("_", " ")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
