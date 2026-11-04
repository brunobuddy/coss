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
import { Input } from "@coss/ui/components/input";
import { Label } from "@coss/ui/components/label";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import { Skeleton } from "@coss/ui/components/skeleton";
import { Spinner } from "@coss/ui/components/spinner";
import { Switch } from "@coss/ui/components/switch";
import { Textarea } from "@coss/ui/components/textarea";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { ClientCall } from "@/lib/client-api";
import type { HostSession } from "./types";

type Entry = {
  id: string;
  start: string;
  end: string;
  all_day: { start_date: string; end_date: string; time_zone: string } | null;
  reason: string;
  public_message: string | null;
  notes: string | null;
  source: string;
};

type EntryList = { data: Entry[]; reasons: { key: string; label: string }[] };

function Conflicts(props: { call: ClientCall; entryId: string }) {
  const { call, entryId } = props;
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    call<{ data: unknown[]; has_more: boolean }>(`/host/out_of_office/${entryId}/conflicts`)
      .then((response) => setCount(response.data.length))
      // Only a hint: the entry and the bookings tab are what matter if this fails.
      .catch(() => setCount(null));
  }, [call, entryId]);
  if (!count) return null;
  return (
    <Badge variant="warning">{count === 1 ? "1 booking in this time" : `${count} bookings`}</Badge>
  );
}

function NewEntry(props: { call: ClientCall; reasons: EntryList["reasons"]; onSaved: () => void }) {
  const { call, reasons, onSaved } = props;
  const [wholeDays, setWholeDays] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("unspecified");
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState("");
  const [onCalendar, setOnCalendar] = useState(true);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setProblem(null);
    try {
      await call("/host/out_of_office", {
        method: "POST",
        body: {
          ...(wholeDays
            ? { start_date: startDate, end_date: endDate || startDate }
            : { start: new Date(start).toISOString(), end: new Date(end).toISOString() }),
          reason,
          show_on_calendar: onCalendar,
          ...(message.trim() ? { public_message: message.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      });
      setStartDate("");
      setEndDate("");
      setStart("");
      setEnd("");
      setMessage("");
      setNotes("");
      onSaved();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="flex flex-col gap-4 rounded-xl border p-4" onSubmit={submit}>
      <div className="flex items-center gap-2">
        <Switch checked={wholeDays} id="whole-days" onCheckedChange={setWholeDays} />
        <Label htmlFor="whole-days">Whole days</Label>
      </div>
      {wholeDays ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="first-day">First day</Label>
            <Input
              id="first-day"
              onChange={(event) => setStartDate(event.target.value)}
              required
              type="date"
              value={startDate}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="last-day">Last day</Label>
            <Input
              id="last-day"
              min={startDate || undefined}
              onChange={(event) => setEndDate(event.target.value)}
              type="date"
              value={endDate}
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="away-from">From</Label>
            <Input
              id="away-from"
              onChange={(event) => setStart(event.target.value)}
              required
              type="datetime-local"
              value={start}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="away-until">Until</Label>
            <Input
              id="away-until"
              min={start || undefined}
              onChange={(event) => setEnd(event.target.value)}
              required
              type="datetime-local"
              value={end}
            />
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label>Reason</Label>
        <Select
          items={reasons.map((entry) => ({ value: entry.key, label: entry.label }))}
          onValueChange={(next) => setReason(String(next))}
          value={reason}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {reasons.map((entry) => (
              <SelectItem key={entry.key} value={entry.key}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <p className="text-muted-foreground text-xs">
          Only people who manage your bookings see this.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="away-message">Message for people booking you</Label>
        <Input
          id="away-message"
          maxLength={300}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Back on the 16th."
          value={message}
        />
        <p className="text-muted-foreground text-xs">Optional. Can't contain a link.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="away-notes">Private notes</Label>
        <Textarea
          id="away-notes"
          maxLength={2000}
          onChange={(event) => setNotes(event.target.value)}
          value={notes}
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={onCalendar} id="on-calendar" onCheckedChange={setOnCalendar} />
        <Label htmlFor="on-calendar">Show on my calendar</Label>
      </div>
      {problem ? (
        <p className="text-destructive-foreground text-sm" role="alert">
          {problem}
        </p>
      ) : null}
      <Button className="self-start" disabled={saving} type="submit">
        {saving ? <Spinner /> : null}
        Add time off
      </Button>
    </form>
  );
}

export function TimeOff(props: { call: ClientCall; session: HostSession }) {
  const { call, session } = props;
  const [list, setList] = useState<EntryList | null>(null);
  const [loadFailed, setLoadFailed] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const timeZone = session.host.time_zone;

  const load = useCallback(() => {
    call<EntryList>("/host/out_of_office")
      .then(setList)
      .catch((error: Error) => setLoadFailed(error.message));
  }, [call]);
  useEffect(load, [load]);

  const remove = async (id: string) => {
    setProblem(null);
    try {
      await call(`/host/out_of_office/${id}`, { method: "DELETE" });
      load();
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  const dayFormat = useMemo(
    () => new Intl.DateTimeFormat(undefined, { timeZone: "UTC", dateStyle: "medium" }),
    [],
  );
  const timeFormat = useMemo(
    () => new Intl.DateTimeFormat(undefined, { timeZone, dateStyle: "medium", timeStyle: "short" }),
    [timeZone],
  );
  const whenOf = (entry: Entry) => {
    if (entry.all_day) {
      // Whole dates are dates, in no zone: shown as they were given.
      const first = dayFormat.format(new Date(`${entry.all_day.start_date}T00:00:00Z`));
      const last = dayFormat.format(new Date(`${entry.all_day.end_date}T00:00:00Z`));
      return first === last ? first : `${first} – ${last}`;
    }
    return `${timeFormat.format(new Date(entry.start))} – ${timeFormat.format(new Date(entry.end))}`;
  };

  if (loadFailed) {
    return (
      <p className="text-destructive-foreground text-sm" role="alert">
        {loadFailed}
      </p>
    );
  }
  if (!list) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only">Loading your time off</span>
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }
  const labelOf = (key: string) => list.reasons.find((reason) => reason.key === key)?.label ?? key;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-pretty text-muted-foreground text-sm">
        You aren't offered for new bookings during time off. Bookings you already have stay as they
        are until someone moves them.
      </p>
      {session.read_only ? null : <NewEntry call={call} onSaved={load} reasons={list.reasons} />}
      {problem ? (
        <p className="text-destructive-foreground text-sm" role="alert">
          {problem}
        </p>
      ) : null}
      {list.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">No time off coming up.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border">
          {list.data.map((entry) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
              key={entry.id}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  <span className="tabular-nums">{whenOf(entry)}</span>
                  <Conflicts call={call} entryId={entry.id} />
                </span>
                <span className="text-muted-foreground">{labelOf(entry.reason)}</span>
                {entry.public_message ? (
                  <span className="text-muted-foreground">"{entry.public_message}"</span>
                ) : null}
              </div>
              {session.read_only ? null : (
                <AlertDialog>
                  <AlertDialogTrigger render={<Button size="sm" variant="outline" />}>
                    Remove
                  </AlertDialogTrigger>
                  <AlertDialogPopup>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove this time off?</AlertDialogTitle>
                      <AlertDialogDescription>
                        You can be booked during it again.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogClose render={<Button variant="ghost" />}>
                        Keep it
                      </AlertDialogClose>
                      <AlertDialogClose
                        onClick={() => remove(entry.id)}
                        render={<Button variant="destructive" />}
                      >
                        Remove
                      </AlertDialogClose>
                    </AlertDialogFooter>
                  </AlertDialogPopup>
                </AlertDialog>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
