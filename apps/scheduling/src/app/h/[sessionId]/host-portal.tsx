"use client";

import { Tabs, TabsList, TabsPanel, TabsTab } from "@coss/ui/components/tabs";
import { useEffect, useState } from "react";
import {
  BrandMark,
  BrokenLink,
  CossAttribution,
  LoadingPanel,
  PageTitle,
  Panel,
  TestModeNotice,
} from "@/components/page";
import { useAccentColor } from "@/lib/branding";
import { type ClientApiError, useClientApi } from "@/lib/client-api";
import { postToHost, reportHeight } from "@/lib/embed";
import { Bookings } from "./bookings";
import { Calendars } from "./calendars";
import { Availability } from "./hours";
import { Locations } from "./locations";
import { TimeOff } from "./time-off";
import type { HostSession } from "./types";

export function HostPortal({ sessionId, apiUrl }: { sessionId: string; apiUrl: string }) {
  const call = useClientApi(sessionId, apiUrl);
  const [session, setSession] = useState<HostSession | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useAccentColor(session?.accent_color);
  useEffect(reportHeight, []);
  useEffect(() => {
    call<HostSession>("/session")
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

  if (problem) return <BrokenLink message={problem} title="This link isn't working" />;
  if (!session) return <LoadingPanel className="max-w-3xl" />;
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:py-12">
      {session.sandbox ? <TestModeNotice /> : null}
      <Panel>
        <header className="flex flex-col gap-4 px-4 pt-6 sm:px-6">
          <BrandMark branding={session} />
          <PageTitle>{session.host.name}</PageTitle>
        </header>
        <Tabs defaultValue="hours">
          <div className="mt-3 overflow-x-auto border-b px-2 sm:px-4">
            <TabsList variant="underline">
              <TabsTab value="hours">Hours</TabsTab>
              <TabsTab value="time-off">Time off</TabsTab>
              <TabsTab value="calendars">Calendars</TabsTab>
              <TabsTab value="locations">Locations</TabsTab>
              <TabsTab value="bookings">Bookings</TabsTab>
            </TabsList>
          </div>
          <TabsPanel className="p-4 sm:p-6" value="hours">
            <Availability call={call} session={session} />
          </TabsPanel>
          <TabsPanel className="p-4 sm:p-6" value="time-off">
            <TimeOff call={call} session={session} />
          </TabsPanel>
          <TabsPanel className="p-4 sm:p-6" value="calendars">
            <Calendars call={call} session={session} />
          </TabsPanel>
          <TabsPanel className="p-4 sm:p-6" value="locations">
            <Locations call={call} session={session} />
          </TabsPanel>
          <TabsPanel className="p-4 sm:p-6" value="bookings">
            <Bookings call={call} session={session} />
          </TabsPanel>
        </Tabs>
      </Panel>
      <CossAttribution branding={session} />
    </main>
  );
}
