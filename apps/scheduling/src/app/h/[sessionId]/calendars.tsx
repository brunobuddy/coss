"use client";

import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
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
import { Skeleton } from "@coss/ui/components/skeleton";
import { Spinner } from "@coss/ui/components/spinner";
import { Switch } from "@coss/ui/components/switch";
import { useCallback, useEffect, useState } from "react";
import type { ClientCall } from "@/lib/client-api";
import { postToHost } from "@/lib/embed";
import { ContinueWithGoogle } from "./continue-with-google";
import { PROVIDER_NAMES, type Provider, ProviderIcon } from "./provider-icon";
import type { HostSession } from "./types";

type Connection = {
  id: string;
  provider: Provider;
  account: string;
  status: "active" | "needs_reauth";
  calendars: { id: string; external_id: string; read_busy: boolean; write_target: boolean }[];
};

function ConnectionCard(props: {
  connection: Connection;
  readOnly: boolean;
  working: boolean;
  onReconnect: () => void;
  onDisconnect: () => void;
  onChangeCalendar: (id: string, change: Record<string, boolean>) => void;
}) {
  const { connection, readOnly, working, onReconnect, onDisconnect, onChangeCalendar } = props;
  const name = PROVIDER_NAMES[connection.provider];
  const zoom = connection.provider === "zoom";
  const canReconnect =
    connection.status === "needs_reauth" &&
    (connection.provider === "google" || connection.provider === "microsoft" || zoom);
  return (
    <section className="flex flex-col rounded-xl border">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <ProviderIcon provider={connection.provider} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex flex-wrap items-center gap-2 font-medium text-sm">
            {name}
            {connection.status === "needs_reauth" ? (
              <Badge variant="error">Needs reconnecting</Badge>
            ) : null}
          </span>
          {zoom ? (
            <span className="text-muted-foreground text-sm">
              Bookings with a Zoom location get a meeting on your account.
            </span>
          ) : (
            <span className="break-all text-muted-foreground text-sm">{connection.account}</span>
          )}
        </div>
        {readOnly ? null : (
          <div className="flex gap-1">
            {canReconnect ? (
              <Button onClick={onReconnect} size="sm" variant="outline">
                Reconnect
              </Button>
            ) : null}
            <AlertDialog>
              <AlertDialogTrigger render={<Button disabled={working} size="sm" variant="ghost" />}>
                Disconnect
              </AlertDialogTrigger>
              <AlertDialogPopup>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect {name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {zoom
                      ? "New bookings won't get a Zoom link. Meetings already made stay on your Zoom account."
                      : "Its busy times stop counting, so you could be booked over them. Events already added stay on your calendar."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogClose render={<Button variant="ghost" />}>Keep it</AlertDialogClose>
                  <AlertDialogClose
                    onClick={onDisconnect}
                    render={<Button variant="destructive" />}
                  >
                    Disconnect
                  </AlertDialogClose>
                </AlertDialogFooter>
              </AlertDialogPopup>
            </AlertDialog>
          </div>
        )}
      </div>
      {zoom || connection.calendars.length === 0 ? null : (
        <div className="flex flex-col divide-y border-t">
          {connection.calendars.map((calendar) => (
            <div
              className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              key={calendar.id}
            >
              <span className="min-w-0 break-all">{calendar.external_id}</span>
              <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
                <Label className="flex items-center gap-2 font-normal">
                  <Switch
                    checked={calendar.read_busy}
                    disabled={readOnly || working}
                    onCheckedChange={(checked) =>
                      onChangeCalendar(calendar.id, { read_busy: checked })
                    }
                  />
                  Check for conflicts
                </Label>
                <Label className="flex items-center gap-2 font-normal">
                  <Switch
                    checked={calendar.write_target}
                    disabled={readOnly || working}
                    onCheckedChange={(checked) =>
                      onChangeCalendar(calendar.id, { write_target: checked })
                    }
                  />
                  Add bookings here
                </Label>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function Calendars(props: { call: ClientCall; session: HostSession }) {
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

  const connect = async (provider: "google" | "microsoft" | "zoom") => {
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

  const lostAccess = connections?.filter((connection) => connection.status === "needs_reauth");
  const needsReauth = lostAccess?.some((connection) => connection.provider !== "zoom");
  const zoomNeedsReauth = lostAccess?.some((connection) => connection.provider === "zoom");
  return (
    <div className="flex flex-col gap-6">
      {needsReauth ? (
        <Alert variant="error">
          <AlertTitle>A calendar needs reconnecting</AlertTitle>
          <AlertDescription>
            We can't read it, so you aren't being offered for new bookings until it's back.
          </AlertDescription>
        </Alert>
      ) : null}
      {zoomNeedsReauth ? (
        <Alert variant="error">
          <AlertTitle>Zoom needs reconnecting</AlertTitle>
          <AlertDescription>
            New bookings won't get a Zoom link until it's back. You're still being offered.
          </AlertDescription>
        </Alert>
      ) : null}
      {problem ? (
        <p className="text-destructive-foreground text-sm" role="alert">
          {problem}
        </p>
      ) : null}
      {connections === null && !problem ? (
        <div aria-busy="true">
          <span className="sr-only">Loading your calendars</span>
          <Skeleton className="h-20" />
        </div>
      ) : null}
      {connections && connections.length > 0 ? (
        <div className="flex flex-col gap-3">
          {connections.map((connection) => (
            <ConnectionCard
              connection={connection}
              key={connection.id}
              onChangeCalendar={(id, change) =>
                run(() => call(`/host/calendars/${id}`, { method: "PATCH", body: change }))
              }
              onDisconnect={() =>
                run(() => call(`/host/calendar_connections/${connection.id}`, { method: "DELETE" }))
              }
              onReconnect={() => connect(connection.provider as "google" | "microsoft" | "zoom")}
              readOnly={session.read_only}
              working={working}
            />
          ))}
        </div>
      ) : null}
      {connections?.length === 0 ? (
        <p className="text-pretty text-sm">
          No calendars yet. Connect one so you're never booked over something else.
        </p>
      ) : null}
      {session.read_only ? null : (
        <section className="flex flex-col gap-3">
          <h2 className="font-medium text-sm">
            {connections && connections.length > 0 ? "Connect another" : "Connect a calendar"}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <ContinueWithGoogle onClick={() => connect("google")} />
            <Button onClick={() => connect("microsoft")} size="lg" variant="outline">
              <ProviderIcon provider="microsoft" />
              Microsoft Outlook
            </Button>
            {session.zoom_available ? (
              <Button onClick={() => connect("zoom")} size="lg" variant="outline">
                <ProviderIcon provider="zoom" />
                Zoom
              </Button>
            ) : null}
            <Button
              aria-expanded={caldavOpen}
              onClick={() => setCaldavOpen((open) => !open)}
              size="lg"
              variant="outline"
            >
              <ProviderIcon provider="caldav" />
              Apple or CalDAV
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
                size="lg"
                variant="outline"
              >
                Add a test calendar
              </Button>
            ) : null}
          </div>
          {caldavOpen ? (
            <form
              className="flex max-w-md flex-col gap-3 rounded-xl border p-4"
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
                <p className="text-muted-foreground text-xs">
                  Not your account's password. Apple's are made at account.apple.com, under Sign-In
                  and Security.
                </p>
              </div>
              <div>
                <Button disabled={working} type="submit">
                  {working ? <Spinner /> : null}
                  Connect
                </Button>
              </div>
            </form>
          ) : null}
          <p className="max-w-prose text-pretty text-muted-foreground text-xs">
            Connecting a calendar lets coss.com see when you're busy and which calendars you have,
            and add, change and remove the events for your bookings. Your other events only count as
            busy times: coss.com never keeps their titles or details, and you can disconnect at any
            time.{" "}
            <a
              className="underline underline-offset-3"
              href="https://coss.com/legal/privacy"
              rel="noopener noreferrer"
              target="_blank"
            >
              Privacy Policy
            </a>
          </p>
        </section>
      )}
    </div>
  );
}
