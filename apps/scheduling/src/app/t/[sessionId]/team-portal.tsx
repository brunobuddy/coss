"use client";

import { REASSIGNMENT_REASON_LABELS } from "@coss/scheduling/schemas";
import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import { Checkbox } from "@coss/ui/components/checkbox";
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
import { Tabs, TabsList, TabsPanel, TabsTab } from "@coss/ui/components/tabs";
import { Textarea } from "@coss/ui/components/textarea";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  BrandMark,
  BrokenLink,
  LoadingPanel,
  PageTitle,
  Panel,
  TestModeNotice,
} from "@/components/page";
import { type Branding, useAccentColor } from "@/lib/branding";
import { type ClientApiError, type ClientCall, useClientApi } from "@/lib/client-api";
import { postToHost, reportHeight } from "@/lib/embed";
import { chosenTarget, overridesFor, sourceHost } from "@/lib/team-moves";

type TeamSession = Branding & { read_only: boolean; sandbox: boolean };
type Host = { id: string; name: string; status: string };
type Entry = {
  id: string;
  host: string;
  start: string;
  end: string;
  all_day: { start_date: string; end_date: string } | null;
  reason: string;
  public_message: string | null;
  delegates: string[];
};
type Reason = { key: string; label: string };
type ManagedBooking = {
  id: string;
  title: string;
  status: string;
  start: string;
  end: string;
  hosts: string[];
  external_conflict: boolean;
  host_away: boolean;
};
type Candidate = {
  host: string;
  name: string;
  available: boolean;
  reason: string | null;
  reasons: string[];
  member: boolean;
};
type PreviewItem = {
  booking: string;
  title: string;
  start: string;
  from_host: string | null;
  to_host: string | null;
  reason: string | null;
};
type Run = {
  id: string;
  status: "pending" | "running" | "completed" | "cancelled";
  undo_of: string | null;
  created_at: string;
  counts: {
    total: number;
    reassigned: number;
    skipped: number;
    no_candidate: number;
    failed: number;
  };
};

/** Where a link from the dashboard wants to start. */
export type TeamFocus = { tab?: string; booking?: string; outOfOffice?: string };

const REASSIGN_REASONS = Object.entries(REASSIGNMENT_REASON_LABELS).map(([key, label]) => ({
  key,
  label,
}));

function ReasonSelect(props: { value: string; onChange: (next: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Reason</Label>
      <Select
        items={REASSIGN_REASONS.map((entry) => ({ value: entry.key, label: entry.label }))}
        onValueChange={(next) => props.onChange(String(next))}
        value={props.value}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectPopup>
          {REASSIGN_REASONS.map((entry) => (
            <SelectItem key={entry.key} value={entry.key}>
              {entry.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </div>
  );
}

const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const dayOnly = new Intl.DateTimeFormat(undefined, { timeZone: "UTC", dateStyle: "medium" });

const WHY_NOT: Record<string, string> = {
  out_of_office: "Away",
  outside_coverage: "Only covers at other times",
  outside_availability: "Outside their hours",
  host_busy: "Busy on their calendar",
  limit_reached: "At their booking limit",
  calendar_unverified: "Their calendar can't be read",
  already_claimed: "Already booked",
  no_candidate: "Nobody's free",
  not_on_team: "Not on this team",
  not_a_member: "Doesn't take this event type",
  already_a_host: "Already a host of this",
  routing_unknown: "Choose someone: this one's routing isn't known",
  reassignment_disabled: "This event type's bookings stay with their hosts",
};

function Problem({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="text-destructive-foreground text-sm" role="alert">
      {message}
    </p>
  );
}

function HostSelect(props: {
  hosts: readonly Host[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <Select
      items={[
        { value: null, label: props.placeholder },
        ...props.hosts.map((host) => ({ value: host.id, label: host.name })),
      ]}
      onValueChange={(next) => props.onChange(next ? String(next) : null)}
      value={props.value}
    >
      <SelectTrigger aria-label={props.label}>
        <SelectValue placeholder={props.placeholder} />
      </SelectTrigger>
      <SelectPopup>
        <SelectItem value={null}>{props.placeholder}</SelectItem>
        {props.hosts.map((host) => (
          <SelectItem key={host.id} value={host.id}>
            {host.name}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

function Away(props: {
  call: ClientCall;
  hosts: readonly Host[];
  nameOf: (id: string) => string;
  readOnly: boolean;
}) {
  const { call, hosts, nameOf, readOnly } = props;
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [reason, setReason] = useState("unspecified");
  const [covers, setCovers] = useState<string[]>([]);
  const [wholeDays, setWholeDays] = useState(true);
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState("");
  const [onCalendar, setOnCalendar] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    call<{ data: Entry[]; has_more: boolean; reasons?: Reason[] }>("/manager/out_of_office")
      .then((response) => {
        setEntries(response.data);
        setHasMore(response.has_more);
        setReasons(response.reasons ?? []);
      })
      .catch((error: Error) => setProblem(error.message));
  }, [call]);
  useEffect(load, [load]);
  const loadMore = async () => {
    const last = entries?.at(-1);
    if (!last) return;
    setProblem(null);
    try {
      const response = await call<{ data: Entry[]; has_more: boolean }>(
        `/manager/out_of_office?after=${encodeURIComponent(last.id)}`,
      );
      setEntries((current) => [...(current ?? []), ...response.data]);
      setHasMore(response.has_more);
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setProblem(null);
    try {
      await call("/manager/out_of_office", {
        method: "POST",
        body: {
          hosts: chosen,
          // This browser's the only one that knows which zone a time was typed in.
          ...(wholeDays
            ? { start_date: first, end_date: last || first }
            : { start: new Date(first).toISOString(), end: new Date(last).toISOString() }),
          reason,
          ...(message.trim() ? { public_message: message.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          show_on_calendar: onCalendar,
          delegates: covers.filter((id) => !chosen.includes(id)),
        },
      });
      setChosen([]);
      setFirst("");
      setLast("");
      setCovers([]);
      setMessage("");
      setNotes("");
      load();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const remove = async (id: string) => {
    setProblem(null);
    try {
      await call(`/manager/out_of_office/${id}`, { method: "DELETE" });
      load();
    } catch (error) {
      setProblem((error as Error).message);
    }
  };
  const whenOf = (entry: Entry) => {
    if (!entry.all_day)
      return `${when.format(new Date(entry.start))} – ${when.format(new Date(entry.end))}`;
    const from = dayOnly.format(new Date(`${entry.all_day.start_date}T00:00:00Z`));
    const to = dayOnly.format(new Date(`${entry.all_day.end_date}T00:00:00Z`));
    return from === to ? from : `${from} – ${to}`;
  };
  const reasonOf = (key: string) => reasons.find((entry) => entry.key === key)?.label ?? key;
  const active = hosts.filter((host) => host.status === "active");
  return (
    <div className="flex flex-col gap-4">
      <Problem message={problem} />
      {readOnly ? null : (
        <form className="flex flex-col gap-3 rounded-xl border p-4" onSubmit={submit}>
          <div className="flex flex-col gap-1.5">
            <Label>Who's away</Label>
            <div className="flex max-h-36 flex-col gap-2 overflow-y-auto rounded-lg border p-3">
              {active.map((host) => (
                <Label className="font-normal" key={host.id}>
                  <Checkbox
                    checked={chosen.includes(host.id)}
                    onCheckedChange={(checked) =>
                      setChosen((current) =>
                        checked ? [...current, host.id] : current.filter((id) => id !== host.id),
                      )
                    }
                  />
                  {host.name}
                </Label>
              ))}
            </div>
          </div>
          <Label className="font-normal">
            <Checkbox
              checked={wholeDays}
              onCheckedChange={(checked) => {
                setWholeDays(Boolean(checked));
                setFirst("");
                setLast("");
              }}
            />
            Whole days
          </Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="team-first">{wholeDays ? "First day" : "From"}</Label>
              <Input
                id="team-first"
                onChange={(event) => setFirst(event.target.value)}
                required
                type={wholeDays ? "date" : "datetime-local"}
                value={first}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="team-last">{wholeDays ? "Last day" : "Until"}</Label>
              <Input
                id="team-last"
                min={first || undefined}
                onChange={(event) => setLast(event.target.value)}
                required={!wholeDays}
                type={wholeDays ? "date" : "datetime-local"}
                value={last}
              />
            </div>
          </div>
          <div className="flex flex-col gap-3">
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
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Who covers</Label>
              <div className="flex max-h-32 flex-col gap-2 overflow-y-auto rounded-lg border p-3">
                {active
                  .filter((host) => !chosen.includes(host.id))
                  .map((host) => (
                    <Label className="font-normal" key={host.id}>
                      <Checkbox
                        checked={covers.includes(host.id)}
                        onCheckedChange={(checked) =>
                          setCovers((current) =>
                            checked
                              ? [...current, host.id]
                              : current.filter((id) => id !== host.id),
                          )
                        }
                      />
                      {host.name}
                    </Label>
                  ))}
              </div>
              <p className="text-muted-foreground text-xs">
                Optional. They can be booked in their place during this, if they fit the booking.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="team-message">Message for people booking</Label>
              <Input
                id="team-message"
                maxLength={300}
                onChange={(event) => setMessage(event.target.value)}
                value={message}
              />
              <p className="text-muted-foreground text-xs">Optional. Can't contain a link.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="team-notes">Private notes</Label>
              <Textarea
                id="team-notes"
                maxLength={2000}
                onChange={(event) => setNotes(event.target.value)}
                value={notes}
              />
            </div>
            <Label className="font-normal">
              <Checkbox
                checked={onCalendar}
                onCheckedChange={(checked) => setOnCalendar(Boolean(checked))}
              />
              Show on their calendar
            </Label>
          </div>
          <Button className="self-start" disabled={saving || chosen.length === 0} type="submit">
            {saving ? <Spinner /> : null}
            Add time off
          </Button>
        </form>
      )}
      {entries === null ? (
        <Skeleton className="h-16" />
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nobody's away.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border">
          {entries.map((entry) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
              key={entry.id}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">{nameOf(entry.host)}</span>
                <span className="text-muted-foreground">
                  {whenOf(entry)}, {reasonOf(entry.reason)}
                </span>
                {entry.delegates.length > 0 ? (
                  <span className="text-muted-foreground">
                    Covered by {entry.delegates.map(nameOf).join(", ")}
                  </span>
                ) : null}
              </span>
              {readOnly ? null : (
                <Button onClick={() => remove(entry.id)} size="sm" variant="ghost">
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {hasMore ? (
        <Button className="self-start" onClick={loadMore} size="sm" variant="ghost">
          Show more
        </Button>
      ) : null}
    </div>
  );
}

function BookingRow(props: {
  call: ClientCall;
  booking: ManagedBooking;
  nameOf: (id: string) => string;
  readOnly: boolean;
  onMoved: () => void;
  /** Someone came here to move this one. */
  opened?: boolean;
}) {
  const { call, booking, nameOf, readOnly, onMoved, opened } = props;
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [pickedSource, setFrom] = useState(booking.hosts[0] ?? "");
  const from = sourceHost(pickedSource, booking.hosts);
  const [to, setTo] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState(booking.host_away ? "out_of_office" : "other");
  const [notify, setNotify] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const open = async () => {
    setProblem(null);
    try {
      const response = await call<{ data: Candidate[] }>(
        `/manager/bookings/${booking.id}/reassign_candidates?from_host=${encodeURIComponent(from)}`,
      );
      setCandidates(response.data);
    } catch (error) {
      setProblem((error as Error).message);
    }
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the once, on arriving.
  useEffect(() => {
    if (opened && !readOnly) void open();
  }, []);
  const picked = candidates?.find((candidate) => candidate.host === to);
  const overrides = picked ? overridesFor(picked) : [];
  const overriding = Boolean(picked && !picked.available);
  const move = async () => {
    if (!to) return;
    setWorking(true);
    setProblem(null);
    try {
      await call(`/manager/bookings/${booking.id}/reassign`, {
        method: "POST",
        body: {
          changes: [{ from_host: from, to_host: to }],
          reason_code: reason,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(overrides.length > 0 ? { overrides } : {}),
          notify: { attendee: notify },
        },
      });
      setCandidates(null);
      setTo(null);
      setNote("");
      onMoved();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setWorking(false);
    }
  };
  return (
    <li className="flex flex-col gap-3 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2 font-medium">
            {when.format(new Date(booking.start))}
            {booking.host_away ? <Badge variant="warning">Host away</Badge> : null}
            {booking.external_conflict ? <Badge variant="warning">Calendar conflict</Badge> : null}
          </span>
          <span className="text-muted-foreground">
            {booking.title}, with {booking.hosts.map(nameOf).join(", ")}
          </span>
        </span>
        {readOnly || candidates ? null : (
          <Button onClick={open} size="sm" variant="outline">
            Give to someone else
          </Button>
        )}
      </div>
      {candidates ? (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          {booking.hosts.length > 1 ? (
            <HostSelect
              hosts={booking.hosts.map((id) => ({ id, name: nameOf(id), status: "active" }))}
              label="Who's leaving"
              onChange={(next) => setFrom(next ?? from)}
              placeholder="Who's leaving"
              value={from}
            />
          ) : null}
          {candidates.length === 0 ? (
            <p className="text-muted-foreground">There's nobody else on this team.</p>
          ) : (
            <Select
              items={candidates.map((candidate) => ({
                value: candidate.host,
                label: candidate.name,
              }))}
              onValueChange={(next) => setTo(next ? String(next) : null)}
              value={to}
            >
              <SelectTrigger aria-label="Who it goes to">
                <SelectValue placeholder="Who it goes to" />
              </SelectTrigger>
              <SelectPopup>
                {candidates.map((candidate) => (
                  <SelectItem
                    disabled={candidate.reasons.includes("already_claimed")}
                    key={candidate.host}
                    value={candidate.host}
                  >
                    {candidate.name}
                    {candidate.available
                      ? ""
                      : `: ${candidate.reasons.map((why) => WHY_NOT[why] ?? "Not available").join(", ")}`}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          )}
          <ReasonSelect onChange={setReason} value={reason} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`note-${booking.id}`}>
              {overriding ? "Why, since they aren't free" : "Note"}
            </Label>
            <Input
              id={`note-${booking.id}`}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              value={note}
            />
            {overriding ? null : (
              <p className="text-muted-foreground text-xs">
                Optional. Only shown in this booking's history.
              </p>
            )}
          </div>
          <Label className="font-normal">
            <Checkbox checked={notify} onCheckedChange={(checked) => setNotify(Boolean(checked))} />
            Tell the attendee
          </Label>
          <div className="flex gap-2">
            <Button
              disabled={working || !to || (overriding && !note.trim())}
              onClick={move}
              size="sm"
            >
              {working ? <Spinner /> : null}
              Give it to them
            </Button>
            <Button onClick={() => setCandidates(null)} size="sm" variant="ghost">
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      <Problem message={problem} />
    </li>
  );
}

function MoveMany(props: {
  call: ClientCall;
  hosts: readonly Host[];
  nameOf: (id: string) => string;
  onStarted: () => void;
  /** What's in one person's time away, rather than everything of someone's. */
  outOfOffice?: string | undefined;
}) {
  const { call, hosts, nameOf, onStarted, outOfOffice } = props;
  const [from, setFrom] = useState<string | null>(null);
  const [before, setBefore] = useState("");
  const [prefer, setPrefer] = useState<string | null>(null);
  const [reason, setReason] = useState(outOfOffice ? "out_of_office" : "other");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [items, setItems] = useState<PreviewItem[] | null>(null);
  const [choices, setChoices] = useState<Record<string, string | null>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const others = hosts.filter((host) => host.status === "active" && host.id !== from);
  const targetOf = (item: PreviewItem) => chosenTarget(item, choices);
  const assignments = (items ?? []).flatMap((item) => {
    const to = targetOf(item);
    return to && item.from_host
      ? [{ booking: item.booking, to_host: to, from_host: item.from_host }]
      : [];
  });
  const selection = outOfOffice
    ? { out_of_office: outOfOffice }
    : { host: from, ...(before ? { start_before: new Date(before).toISOString() } : {}) };
  const preview = async () => {
    setWorking(true);
    setProblem(null);
    try {
      const response = await call<{ items: PreviewItem[]; truncated?: boolean }>(
        "/manager/reassignments/preview",
        {
          method: "POST",
          // A preview only proposes people on this team, however it's asked.
          body: { selection, strategy: prefer ? { preferred_hosts: [prefer] } : {} },
        },
      );
      setItems(response.items);
      setTruncated(response.truncated === true);
      setChoices({});
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setWorking(false);
    }
  };
  const start = async () => {
    setWorking(true);
    setProblem(null);
    try {
      const run = await call<{ id: string }>("/manager/reassignments", {
        method: "POST",
        body: {
          selection,
          strategy: { assignments },
          reason_code: reason,
          ...(note.trim() ? { note: note.trim() } : {}),
          notify: { attendees: notify },
        },
      });
      postToHost({ type: "reassignment_started", reassignment_id: run.id });
      setItems(null);
      setFrom(null);
      onStarted();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setWorking(false);
    }
  };
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="font-medium text-sm">
        {outOfOffice ? "Move the bookings in this time off" : "Move someone's bookings"}
      </h2>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        {outOfOffice ? null : (
          <>
            <HostSelect
              hosts={hosts}
              label="Whose bookings"
              onChange={(next) => {
                setFrom(next);
                setItems(null);
              }}
              placeholder="Whose bookings"
              value={from}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="team-before">Starting before</Label>
              <Input
                id="team-before"
                onChange={(event) => {
                  setBefore(event.target.value);
                  setItems(null);
                }}
                type="datetime-local"
                value={before}
              />
              <p className="text-muted-foreground text-xs">Leave empty for all of them.</p>
            </div>
          </>
        )}
        <HostSelect
          hosts={others}
          label="Try first"
          onChange={setPrefer}
          placeholder="Anyone on this team"
          value={prefer}
        />
      </div>
      {items === null ? (
        <Button
          className="self-start"
          disabled={working || (!from && !outOfOffice)}
          onClick={preview}
          size="sm"
        >
          See who they'd go to
        </Button>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">There's nothing to move.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 rounded-md p-1.5 text-sm"
                key={item.booking}
              >
                <span className="flex min-w-0 flex-col">
                  <span>{when.format(new Date(item.start))}</span>
                  <span className="text-muted-foreground text-xs">
                    {item.title}
                    {item.reason && !choices[item.booking]
                      ? `. ${WHY_NOT[item.reason] ?? "Not available"}`
                      : ""}
                  </span>
                </span>
                <div className="w-48">
                  <HostSelect
                    hosts={others.filter((host) => host.id !== item.from_host)}
                    label={`Who ${item.title} goes to`}
                    onChange={(next) =>
                      setChoices((current) => ({ ...current, [item.booking]: next }))
                    }
                    placeholder="Stays"
                    value={targetOf(item)}
                  />
                </div>
              </li>
            ))}
          </ul>
          {truncated ? (
            <p className="text-muted-foreground text-xs">
              That's the first 500. Move these, then do the rest.
            </p>
          ) : null}
          <p className="text-muted-foreground text-xs">
            Each host hears once. A booking nobody can take stays where it is, with{" "}
            {from ? nameOf(from) : "them"}.
          </p>
          <ReasonSelect onChange={setReason} value={reason} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="team-many-note">Note</Label>
            <Textarea
              id="team-many-note"
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              value={note}
            />
            <p className="text-muted-foreground text-xs">
              Optional. Only shown in each booking's history.
            </p>
          </div>
          <Label className="font-normal">
            <Checkbox checked={notify} onCheckedChange={(checked) => setNotify(Boolean(checked))} />
            Tell attendees
          </Label>
          <Button
            className="self-start"
            disabled={working || assignments.length === 0}
            onClick={start}
            size="sm"
          >
            {working ? <Spinner /> : null}
            Move {assignments.length} {assignments.length === 1 ? "booking" : "bookings"}
          </Button>
        </>
      )}
      <Problem message={problem} />
    </section>
  );
}

function Cover(props: {
  call: ClientCall;
  hosts: readonly Host[];
  nameOf: (id: string) => string;
  readOnly: boolean;
  onStarted: () => void;
  focus: TeamFocus;
}) {
  const { call, hosts, nameOf, readOnly, onStarted, focus } = props;
  const [bookings, setBookings] = useState<ManagedBooking[] | null>(null);
  const [moreBookings, setMoreBookings] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [everything, setEverything] = useState(false);
  const only = everything ? undefined : focus.booking;
  const load = useCallback(() => {
    const query = only
      ? `?booking=${encodeURIComponent(only)}`
      : everything
        ? ""
        : "?needs_cover=true";
    call<{ data: ManagedBooking[]; has_more: boolean }>(`/manager/bookings${query}`)
      .then((response) => {
        setBookings(response.data);
        setMoreBookings(response.has_more);
      })
      .catch((error: Error) => setProblem(error.message));
  }, [call, everything, only]);
  useEffect(load, [load]);
  return (
    <div className="flex flex-col gap-4">
      <Problem message={problem} />
      {readOnly || only ? null : (
        <MoveMany
          call={call}
          hosts={hosts}
          nameOf={nameOf}
          onStarted={onStarted}
          outOfOffice={focus.outOfOffice}
        />
      )}
      <Label className="font-normal">
        <Checkbox
          checked={everything}
          onCheckedChange={(checked) => setEverything(Boolean(checked))}
        />
        Show every upcoming booking
      </Label>
      {bookings === null ? (
        <Skeleton className="h-16" />
      ) : bookings.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {everything ? "Nothing coming up." : "Nothing needs cover."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border">
          {bookings.map((booking) => (
            <BookingRow
              booking={booking}
              call={call}
              key={booking.id}
              nameOf={nameOf}
              onMoved={load}
              opened={booking.id === only}
              readOnly={readOnly}
            />
          ))}
        </ul>
      )}
      {moreBookings ? (
        <p className="text-muted-foreground text-xs">
          These are the soonest 100. Moving someone's bookings covers all of them.
        </p>
      ) : null}
    </div>
  );
}

function Moves(props: { call: ClientCall; readOnly: boolean; refreshKey: number }) {
  const { call, readOnly, refreshKey } = props;
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const load = useCallback(() => {
    call<{ data: Run[] }>("/manager/reassignments")
      .then((response) => setRuns(response.data))
      .catch((error: Error) => setProblem(error.message));
  }, [call]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new run elsewhere on the page reloads this.
  useEffect(load, [load, refreshKey]);
  const running = runs?.some((run) => run.status === "pending" || run.status === "running");
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [running, load]);
  const act = async (id: string, action: "cancel" | "undo") => {
    setProblem(null);
    try {
      await call(`/manager/reassignments/${id}/${action}`, {
        method: "POST",
        ...(action === "undo" ? { body: {} } : {}),
      });
      load();
    } catch (error) {
      setProblem((error as Error).message);
    }
  };
  if (runs === null) return <Skeleton className="h-16" />;
  if (runs.length === 0) return <p className="text-muted-foreground text-sm">Nothing moved yet.</p>;
  return (
    <div className="flex flex-col gap-4">
      <Problem message={problem} />
      <ul className="flex flex-col divide-y rounded-xl border">
        {runs.map((run) => {
          const active = run.status === "pending" || run.status === "running";
          return (
            <li
              className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
              key={run.id}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {when.format(new Date(run.created_at))}
                  {active ? <Badge variant="warning">Running</Badge> : null}
                  {run.status === "cancelled" ? <Badge variant="outline">Cancelled</Badge> : null}
                  {run.undo_of ? <Badge variant="outline">Gave back</Badge> : null}
                </span>
                <span className="text-muted-foreground">
                  {run.counts.reassigned} of {run.counts.total} moved
                  {run.counts.no_candidate + run.counts.failed > 0
                    ? `, ${run.counts.no_candidate + run.counts.failed} stayed`
                    : ""}
                  {run.counts.skipped > 0 ? `, ${run.counts.skipped} had changed` : ""}
                </span>
              </span>
              {readOnly ? null : active ? (
                <Button onClick={() => act(run.id, "cancel")} size="sm" variant="outline">
                  Cancel the rest
                </Button>
              ) : run.counts.reassigned > 0 ? (
                <Button onClick={() => act(run.id, "undo")} size="sm" variant="ghost">
                  Undo
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function TeamPortal(props: { sessionId: string; apiUrl: string; focus: TeamFocus }) {
  const { sessionId, apiUrl, focus } = props;
  const call = useClientApi(sessionId, apiUrl);
  const [session, setSession] = useState<TeamSession | null>(null);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [runsVersion, setRunsVersion] = useState(0);
  useAccentColor(session?.accent_color);
  useEffect(reportHeight, []);
  useEffect(() => {
    Promise.all([call<TeamSession>("/session"), call<{ data: Host[] }>("/manager/hosts")])
      .then(([value, team]) => {
        setSession(value);
        setHosts(team.data);
        postToHost({ type: "ready" });
      })
      .catch((error: ClientApiError) => {
        setProblem(error.message);
        postToHost({
          type: "error",
          code: error.detail?.code ?? "unknown",
          message: error.message,
        });
      });
  }, [call]);
  const names = useMemo(() => new Map(hosts.map((host) => [host.id, host.name])), [hosts]);
  const nameOf = useCallback((id: string) => names.get(id) ?? "Someone else", [names]);
  if (problem) return <BrokenLink message={problem} title="This link isn't working" />;
  if (!session) return <LoadingPanel className="max-w-3xl" />;
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:py-12">
      {session.sandbox ? <TestModeNotice /> : null}
      <Panel>
        <header className="flex flex-col gap-4 px-4 pt-6 sm:px-6">
          <BrandMark branding={session} />
          <PageTitle>Team cover</PageTitle>
        </header>
        <Tabs defaultValue={focus.tab === "away" ? "away" : "cover"}>
          <div className="mt-3 overflow-x-auto border-b px-2 sm:px-4">
            <TabsList variant="underline">
              <TabsTab value="cover">Needs cover</TabsTab>
              <TabsTab value="away">Who's away</TabsTab>
              <TabsTab value="moves">Moves</TabsTab>
            </TabsList>
          </div>
          <TabsPanel className="p-4 sm:p-6" value="cover">
            <Cover
              call={call}
              focus={focus}
              hosts={hosts}
              nameOf={nameOf}
              onStarted={() => setRunsVersion((version) => version + 1)}
              readOnly={session.read_only}
            />
          </TabsPanel>
          <TabsPanel className="p-4 sm:p-6" value="away">
            <Away call={call} hosts={hosts} nameOf={nameOf} readOnly={session.read_only} />
          </TabsPanel>
          <TabsPanel className="p-4 sm:p-6" value="moves">
            <Moves call={call} readOnly={session.read_only} refreshKey={runsVersion} />
          </TabsPanel>
        </Tabs>
      </Panel>
    </main>
  );
}
