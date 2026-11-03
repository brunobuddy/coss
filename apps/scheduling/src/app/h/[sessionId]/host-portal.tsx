"use client";

import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import { Checkbox } from "@coss/ui/components/checkbox";
import { Input } from "@coss/ui/components/input";
import { Label } from "@coss/ui/components/label";
import { Spinner } from "@coss/ui/components/spinner";
import { Switch } from "@coss/ui/components/switch";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@coss/ui/components/tabs";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { type ClientApiError, type ClientCall, useClientApi } from "@/lib/client-api";
import { postToHost, reportHeight } from "@/lib/embed";
import { ContinueWithGoogle } from "./continue-with-google";

type Session = {
  brand_name: string | null;
  read_only: boolean;
  sandbox: boolean;
  host: { id: string; name: string; time_zone: string };
};

type Schedule = {
  id: string;
  time_zone: string;
  is_default: boolean;
  rules: { days: number[]; start: string; end: string }[];
};

type Connection = {
  id: string;
  provider: "google" | "microsoft" | "caldav" | "simulated";
  account: string;
  status: "active" | "needs_reauth";
  calendars: { id: string; external_id: string; read_busy: boolean; write_target: boolean }[];
};

type HostBooking = {
  id: string;
  status: string;
  title: string;
  start: string;
  attendees: { name: string | null }[];
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PROVIDER_NAMES = {
  google: "Google",
  microsoft: "Microsoft",
  caldav: "CalDAV",
  simulated: "Simulated",
} as const;

type HoursRange = { start: string; end: string };
type DayHours = { enabled: boolean; ranges: HoursRange[] };

const DEFAULT_RANGE: HoursRange = { start: "09:00", end: "17:00" };
// A time input can't show the API's 24:00, the end of the day.
const END_OF_DAY_INPUT = "23:59";

export function hoursFromRules(rules: Schedule["rules"]): DayHours[] {
  return WEEKDAYS.map((_, day) => {
    const ranges = rules
      .filter((rule) => rule.days.includes(day))
      .map((rule) => ({
        start: rule.start,
        end: rule.end === "24:00" ? END_OF_DAY_INPUT : rule.end,
      }))
      .sort((a, b) => a.start.localeCompare(b.start));
    return ranges.length > 0
      ? { enabled: true, ranges }
      : { enabled: false, ranges: [{ ...DEFAULT_RANGE }] };
  });
}

export function rulesFromHours(hours: DayHours[]): Schedule["rules"] {
  return hours.flatMap((day, index) =>
    day.enabled
      ? day.ranges.map((range) => ({
          days: [index],
          start: range.start,
          end: range.end === END_OF_DAY_INPUT ? "24:00" : range.end,
        }))
      : [],
  );
}

function Availability(props: { call: ClientCall; session: Session }) {
  const { call, session } = props;
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [hours, setHours] = useState<DayHours[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    call<{ data: Schedule[] }>("/host/schedules")
      .then((response) => {
        const first = response.data.find((item) => item.is_default) ?? response.data[0] ?? null;
        setSchedule(first);
        setHours(
          first
            ? hoursFromRules(first.rules)
            : WEEKDAYS.map((_, day) => ({
                enabled: day >= 1 && day <= 5,
                ranges: [{ ...DEFAULT_RANGE }],
              })),
        );
      })
      .catch((error: Error) => setProblem(error.message));
  }, [call]);

  const changeDay = (index: number, next: DayHours) =>
    setHours((all) => all?.map((day, at) => (at === index ? next : day)) ?? null);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!hours) return;
    setSaving(true);
    setProblem(null);
    setSaved(false);
    try {
      const body = { rules: rulesFromHours(hours) };
      const next = schedule
        ? await call<Schedule>(`/host/schedules/${schedule.id}`, { method: "PUT", body })
        : await call<Schedule>("/host/schedules", { method: "POST", body });
      setSchedule(next);
      setSaved(true);
      postToHost({ type: "availability_saved" });
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!hours) {
    return problem ? <p className="text-destructive-foreground text-sm">{problem}</p> : <Spinner />;
  }
  return (
    <form className="flex flex-col gap-4" onSubmit={save}>
      <p className="text-muted-foreground text-sm">
        When you can be booked, in {schedule?.time_zone ?? session.host.time_zone}.
      </p>
      <div className="flex flex-col gap-2">
        {hours.map((day, index) => (
          <div className="flex flex-wrap items-start gap-3" key={WEEKDAYS[index]}>
            <Label className="flex h-9 w-20 items-center gap-2 font-normal">
              <Checkbox
                checked={day.enabled}
                disabled={session.read_only}
                onCheckedChange={(checked) =>
                  changeDay(index, { ...day, enabled: checked === true })
                }
              />
              {WEEKDAYS[index]}
            </Label>
            {day.enabled ? (
              <div className="flex flex-col gap-2">
                {day.ranges.map((range, position) => {
                  const update = (next: HoursRange) =>
                    changeDay(index, {
                      ...day,
                      ranges: day.ranges.map((item, at) => (at === position ? next : item)),
                    });
                  return (
                    // Ranges have no identity but their place in the list.
                    // biome-ignore lint/suspicious/noArrayIndexKey: see above.
                    <div className="flex flex-wrap items-center gap-2" key={position}>
                      <Input
                        aria-label={`${WEEKDAYS[index]} start`}
                        className="w-32"
                        disabled={session.read_only}
                        onChange={(event) => update({ ...range, start: event.target.value })}
                        required
                        type="time"
                        value={range.start}
                      />
                      <span className="text-muted-foreground text-sm">to</span>
                      <Input
                        aria-label={`${WEEKDAYS[index]} end`}
                        className="w-32"
                        disabled={session.read_only}
                        onChange={(event) => update({ ...range, end: event.target.value })}
                        required
                        type="time"
                        value={range.end}
                      />
                      {session.read_only || day.ranges.length === 1 ? null : (
                        <Button
                          onClick={() =>
                            changeDay(index, {
                              ...day,
                              ranges: day.ranges.filter((_, at) => at !== position),
                            })
                          }
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  );
                })}
                {session.read_only ? null : (
                  <div>
                    <Button
                      onClick={() =>
                        changeDay(index, {
                          ...day,
                          ranges: [...day.ranges, { start: "13:00", end: "17:00" }],
                        })
                      }
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Add hours
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <span className="flex h-9 items-center text-muted-foreground text-sm">
                Unavailable
              </span>
            )}
          </div>
        ))}
      </div>
      {problem ? <p className="text-destructive-foreground text-sm">{problem}</p> : null}
      {saved ? <p className="text-muted-foreground text-sm">Saved.</p> : null}
      {session.read_only ? null : (
        <div>
          <Button disabled={saving} type="submit">
            {saving ? <Spinner /> : null}
            Save hours
          </Button>
        </div>
      )}
    </form>
  );
}

function Calendars(props: { call: ClientCall; session: Session }) {
  const { call, session } = props;
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [caldavOpen, setCaldavOpen] = useState(false);
  const [caldav, setCaldav] = useState({
    url: "https://caldav.icloud.com",
    username: "",
    password: "",
  });
  const [working, setWorking] = useState(false);

  const load = useCallback(() => {
    call<{ data: Connection[] }>("/host/calendar_connections")
      .then((response) => setConnections(response.data))
      .catch((error: Error) => setProblem(error.message));
  }, [call]);
  useEffect(load, [load]);

  const connect = async (provider: "google" | "microsoft") => {
    setProblem(null);
    // Opened before the call, or browsers treat it as a popup nobody asked for.
    const popup = window.open("about:blank", "coss-calendar", "width=520,height=680");
    try {
      const { url } = await call<{ url: string }>("/host/calendar_connections/authorize", {
        method: "POST",
        body: { provider },
      });
      if (popup) {
        popup.location.href = url;
        const timer = window.setInterval(() => {
          if (!popup.closed) return;
          window.clearInterval(timer);
          load();
          postToHost({ type: "calendar_connected" });
        }, 800);
      } else {
        window.location.href = url;
      }
    } catch (error) {
      popup?.close();
      setProblem((error as Error).message);
    }
  };

  const run = async (work: () => Promise<unknown>) => {
    setWorking(true);
    setProblem(null);
    try {
      await work();
      load();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const needsReauth = connections?.some((connection) => connection.status === "needs_reauth");
  return (
    <div className="flex flex-col gap-4">
      {needsReauth ? (
        <Alert variant="error">
          <AlertTitle>A calendar needs reconnecting</AlertTitle>
          <AlertDescription>
            We can't read it, so you aren't being offered for new bookings until it's back.
          </AlertDescription>
        </Alert>
      ) : null}
      {problem ? <p className="text-destructive-foreground text-sm">{problem}</p> : null}
      {session.read_only ? null : (
        <p className="text-muted-foreground text-sm">
          Connecting a calendar lets coss.com see when you're busy and which calendars you have, and
          add, change and remove the events for your bookings. Your other events only count as busy
          times: coss.com never keeps their titles or details, and you can disconnect at any time.{" "}
          <a
            className="underline"
            href="https://coss.com/legal/privacy"
            rel="noopener noreferrer"
            target="_blank"
          >
            Privacy Policy
          </a>
        </p>
      )}
      {session.read_only ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <ContinueWithGoogle onClick={() => connect("google")} />
          <Button onClick={() => connect("microsoft")} variant="outline">
            Connect Microsoft
          </Button>
          <Button onClick={() => setCaldavOpen((open) => !open)} variant="outline">
            Connect Apple or CalDAV
          </Button>
          {session.sandbox ? (
            <Button
              disabled={working}
              onClick={() =>
                run(() =>
                  call("/host/calendar_connections", {
                    method: "POST",
                    body: { provider: "simulated" },
                  }),
                )
              }
              variant="ghost"
            >
              Add a test calendar
            </Button>
          ) : null}
        </div>
      )}
      {caldavOpen ? (
        <form
          className="flex flex-col gap-3 rounded-md border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              await call("/host/calendar_connections", {
                method: "POST",
                body: { provider: "caldav", ...caldav },
              });
              setCaldavOpen(false);
              setCaldav({ ...caldav, password: "" });
            });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="caldav-url">Server</Label>
            <Input
              id="caldav-url"
              onChange={(event) => setCaldav({ ...caldav, url: event.target.value })}
              required
              type="url"
              value={caldav.url}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="caldav-username">Username</Label>
            <Input
              autoComplete="off"
              id="caldav-username"
              onChange={(event) => setCaldav({ ...caldav, username: event.target.value })}
              required
              value={caldav.username}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="caldav-password">App-specific password</Label>
            <Input
              autoComplete="off"
              id="caldav-password"
              onChange={(event) => setCaldav({ ...caldav, password: event.target.value })}
              required
              type="password"
              value={caldav.password}
            />
          </div>
          <div>
            <Button disabled={working} type="submit">
              {working ? <Spinner /> : null}
              Connect
            </Button>
          </div>
        </form>
      ) : null}
      {connections === null ? <Spinner /> : null}
      {connections?.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No calendars yet. Connect one so you're never booked over something else.
        </p>
      ) : null}
      {connections?.map((connection) => (
        <section className="flex flex-col gap-3 rounded-md border p-4" key={connection.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{PROVIDER_NAMES[connection.provider]}</span>
              <span className="break-all text-muted-foreground">{connection.account}</span>
              {connection.status === "needs_reauth" ? (
                <Badge variant="error">Needs reconnecting</Badge>
              ) : null}
            </div>
            {session.read_only ? null : (
              <Button
                disabled={working}
                onClick={() =>
                  run(() =>
                    call(`/host/calendar_connections/${connection.id}`, { method: "DELETE" }),
                  )
                }
                size="sm"
                variant="ghost"
              >
                Disconnect
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {connection.calendars.map((calendar) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 text-sm"
                key={calendar.id}
              >
                <span className="min-w-0 break-all">{calendar.external_id}</span>
                <div className="flex items-center gap-4">
                  <Label className="flex items-center gap-2 font-normal">
                    <Switch
                      checked={calendar.read_busy}
                      disabled={session.read_only || working}
                      onCheckedChange={(checked) =>
                        run(() =>
                          call(`/host/calendars/${calendar.id}`, {
                            method: "PATCH",
                            body: { read_busy: checked },
                          }),
                        )
                      }
                    />
                    Check for conflicts
                  </Label>
                  <Label className="flex items-center gap-2 font-normal">
                    <Switch
                      checked={calendar.write_target}
                      disabled={session.read_only || working}
                      onCheckedChange={(checked) =>
                        run(() =>
                          call(`/host/calendars/${calendar.id}`, {
                            method: "PATCH",
                            body: { write_target: checked },
                          }),
                        )
                      }
                    />
                    Add bookings here
                  </Label>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Bookings(props: { call: ClientCall; session: Session }) {
  const { call, session } = props;
  const [bookings, setBookings] = useState<HostBooking[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(() => {
    call<{ data: HostBooking[] }>("/host/bookings")
      .then((response) =>
        setBookings(
          [...response.data]
            .filter((booking) => booking.status !== "cancelled" && booking.status !== "declined")
            .sort((a, b) => a.start.localeCompare(b.start)),
        ),
      )
      .catch((error: Error) => setProblem(error.message));
  }, [call]);
  useEffect(load, [load]);

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

  const format = new Intl.DateTimeFormat(undefined, {
    timeZone: session.host.time_zone,
    dateStyle: "medium",
    timeStyle: "short",
  });
  if (problem) return <p className="text-destructive-foreground text-sm">{problem}</p>;
  if (!bookings) return <Spinner />;
  if (bookings.length === 0) {
    return <p className="text-muted-foreground text-sm">Nothing coming up.</p>;
  }
  return (
    <ul className="flex flex-col divide-y">
      {bookings.map((booking) => (
        <li
          className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
          key={booking.id}
        >
          <div className="flex min-w-0 flex-col">
            <span className="font-medium">{booking.title}</span>
            <span className="text-muted-foreground">
              {format.format(new Date(booking.start))}
              {booking.attendees[0]?.name ? ` · ${booking.attendees[0].name}` : ""}
            </span>
          </div>
          {session.read_only ? null : (
            <div className="flex gap-2">
              {booking.status === "pending_approval" ? (
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
                <Button
                  disabled={working === booking.id}
                  onClick={() => act(booking.id, "cancel")}
                  size="sm"
                  variant="ghost"
                >
                  Cancel
                </Button>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function HostPortal({ sessionId, apiUrl }: { sessionId: string; apiUrl: string }) {
  const call = useClientApi(sessionId, apiUrl);
  const [session, setSession] = useState<Session | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(reportHeight, []);
  useEffect(() => {
    call<Session>("/session")
      .then((value) => {
        setSession(value);
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

  if (problem) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Alert variant="error">
          <AlertTitle>This link isn't working</AlertTitle>
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      </main>
    );
  }
  if (!session) {
    return (
      <main className="flex min-h-64 items-center justify-center" aria-busy>
        <Spinner />
      </main>
    );
  }
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        {session.brand_name ? (
          <p className="text-muted-foreground text-sm">{session.brand_name}</p>
        ) : null}
        <h1 className="font-semibold text-xl">{session.host.name}</h1>
      </header>
      {session.sandbox ? (
        <Alert variant="warning">
          <AlertDescription>
            Test mode: nothing here is real, and nobody's emailed.
          </AlertDescription>
        </Alert>
      ) : null}
      <Tabs defaultValue="hours">
        <TabsList>
          <TabsTab value="hours">Hours</TabsTab>
          <TabsTab value="calendars">Calendars</TabsTab>
          <TabsTab value="bookings">Bookings</TabsTab>
        </TabsList>
        <TabsPanel className="pt-4" value="hours">
          <Availability call={call} session={session} />
        </TabsPanel>
        <TabsPanel className="pt-4" value="calendars">
          <Calendars call={call} session={session} />
        </TabsPanel>
        <TabsPanel className="pt-4" value="bookings">
          <Bookings call={call} session={session} />
        </TabsPanel>
      </Tabs>
    </main>
  );
}
