import { Badge } from "@coss/ui/components/badge";
import { cn } from "@coss/ui/lib/utils";
import { beat } from "@/components/marketing/beat";
import { Replay, StatusDot, type Tone } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import type { ProductShowcase } from "./types";

const DAYS = ["Mon 9", "Tue 10", "Wed 11", "Thu 12", "Fri 13"] as const;
const HOURS = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00"] as const;

/** Row by day: what each hour is. */
const WEEK: Record<string, Record<string, "busy" | "booked" | "picked">> = {
  "Mon 9": { "09:00": "busy", "13:00": "booked" },
  "Tue 10": { "10:00": "picked", "14:00": "busy", "15:00": "busy" },
  "Wed 11": { "09:00": "booked", "11:00": "busy" },
  "Thu 12": { "10:00": "busy", "13:00": "booked", "14:00": "booked" },
  "Fri 13": { "15:00": "busy" },
};

function WeekGrid() {
  return (
    <div className="flex flex-col gap-2">
      <table className="w-full table-fixed border-separate border-spacing-1 text-center">
        <caption className="sr-only">
          Ana Reyes's week: open times, times busy on a connected calendar, and bookings
        </caption>
        <thead>
          <tr>
            <th className="w-11" scope="col">
              <span className="sr-only">Time</span>
            </th>
            {DAYS.map((day) => (
              <th
                className="pb-0.5 font-medium text-muted-foreground text-xs"
                key={day}
                scope="col"
              >
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HOURS.map((hour) => (
            <tr key={hour}>
              <th
                className="text-left font-mono font-normal text-[0.6875rem] text-muted-foreground tabular-nums"
                scope="row"
              >
                {hour}
              </th>
              {DAYS.map((day) => {
                const state = WEEK[day]?.[hour];
                return (
                  <td
                    className={cn(
                      "h-7 rounded-md text-[0.6875rem] leading-none",
                      !state && "border bg-background text-muted-foreground/0",
                      state === "busy" &&
                        "bg-[repeating-linear-gradient(135deg,var(--muted)_0_4px,transparent_4px_8px)] text-transparent ring-1 ring-border ring-inset",
                      state === "booked" && "bg-info/16 text-info-foreground",
                      state === "picked" &&
                        "enter-pop bg-primary font-medium text-primary-foreground",
                    )}
                    key={day}
                  >
                    <span className={cn(state !== "picked" && "sr-only")}>
                      {state === "picked" ? "Sam" : (state ?? "open")}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm border bg-background" />
          Open
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 rounded-sm bg-[repeating-linear-gradient(135deg,var(--muted-foreground)_0_1px,transparent_1px_3px)] ring-1 ring-border ring-inset"
          />
          Busy on calendar
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-info/32" />
          Booked
        </span>
      </div>
    </div>
  );
}

function Race() {
  return (
    <Tray flush title="Tue 10, 10:00 with Ana Reyes">
      <ul className="flex flex-col">
        <li className="flex items-center justify-between gap-4 border-b px-4 py-3">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm">Sam Lee</span>
            <span className="truncate font-mono text-muted-foreground text-xs">
              POST /v1/scheduling/bookings
            </span>
          </span>
          <Badge variant="success">confirmed</Badge>
        </li>
        <li className="flex items-center justify-between gap-4 border-b px-4 py-3">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm">Jo Park</span>
            <span className="truncate font-mono text-muted-foreground text-xs">
              POST /v1/scheduling/bookings
            </span>
          </span>
          <Badge variant="error">422 slot_unavailable</Badge>
        </li>
        <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-muted/48 px-4 py-2.5">
          <span className="text-muted-foreground text-xs">Refused by Postgres</span>
          <code className="font-mono text-xs">scheduling_claim_no_overlap</code>
        </li>
      </ul>
    </Tray>
  );
}

const CALENDARS: readonly { name: string; detail: string; tone: Tone; status: string }[] = [
  { name: "Google", detail: "Changes arrive by push", tone: "success", status: "connected" },
  { name: "Microsoft", detail: "Changes arrive by push", tone: "success", status: "connected" },
  { name: "CalDAV", detail: "Read every five minutes", tone: "success", status: "connected" },
  {
    name: "Google",
    detail: "Can't be read, so it isn't free",
    tone: "warning",
    status: "needs_reauth",
  },
];

function Calendars() {
  return (
    <Tray flush title="Ana Reyes's calendars">
      <ul className="flex flex-col">
        {CALENDARS.map((calendar) => (
          <li
            className="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0"
            key={calendar.name + calendar.status}
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm">{calendar.name}</span>
              <span className="truncate text-muted-foreground text-xs">{calendar.detail}</span>
            </span>
            <StatusDot className="text-sm" tone={calendar.tone}>
              {calendar.status}
            </StatusDot>
          </li>
        ))}
      </ul>
    </Tray>
  );
}

const HOSTS = [
  ["Ana Reyes", "es", "Tue 10:00"],
  ["Ben Okafor", "en", "Tue 11:30"],
  ["Chloe Martin", "fr", "Wed 09:00"],
  ["Dev Patel", "en", "Wed 14:00"],
] as const;

function Search() {
  return (
    <Tray flush title="coss.scheduling.availability.search()">
      <ul className="flex flex-col">
        {HOSTS.map(([name, language, slot]) => (
          <li
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
            key={name}
          >
            <span className="truncate text-sm">{name}</span>
            <Badge variant="outline">{language}</Badge>
            <span className="font-mono text-muted-foreground text-xs tabular-nums">{slot}</span>
          </li>
        ))}
      </ul>
    </Tray>
  );
}

const SERIES = [
  ["Mar 2", "10:00", "15:00 UTC"],
  ["Mar 9", "10:00", "14:00 UTC"],
  ["Mar 16", "10:00", "14:00 UTC"],
  ["Mar 23", "10:00", "14:00 UTC"],
] as const;

function Series() {
  return (
    <Tray flush title="Weekly lesson" meta="New York, clocks change Mar 8">
      <ol className="flex flex-col">
        {SERIES.map(([date, local, utc]) => (
          <li
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 border-b px-4 py-2.5 last:border-b-0"
            key={date}
          >
            <span className="text-sm">{date}</span>
            <span className="font-medium font-mono text-[0.8125rem] tabular-nums">{local}</span>
            <span className="font-mono text-muted-foreground text-xs tabular-nums">{utc}</span>
          </li>
        ))}
      </ol>
    </Tray>
  );
}

export const scheduling: ProductShowcase = {
  lede: "Your providers set hours and connect calendars, your customers book in your app, and overlaps are refused.",
  call: "coss.scheduling.bookings.create()",
  stage: (
    <Replay
      events={[
        {
          name: "confirmed",
          tone: "success",
          at: "09:41:02",
          detail: "Calendar invitations to Sam and Ana",
        },
        { name: "scheduling.booking.confirmed", tone: "info", at: "09:41:02" },
      ]}
    >
      <div className="flex flex-col gap-2 pb-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">Trial lesson with Ana Reyes</p>
            <p className="truncate text-muted-foreground text-sm">30 minutes, 10 minute buffer</p>
          </div>
          <span className="enter-pop" style={beat(1)}>
            <Badge variant="success">confirmed</Badge>
          </span>
        </div>
        <WeekGrid />
      </div>
    </Replay>
  ),
  highlights: [
    {
      title: "A slot can't be taken twice",
      body: "A database constraint refuses overlaps, so it holds under races, retries and second tabs. The second person sees the times again.",
      href: "/docs/scheduling/bookings",
      demo: <Race />,
    },
    {
      title: "Real calendars, and no false free time",
      body: "Hosts connect Google, Microsoft or CalDAV. A calendar that can't be read never counts as free.",
      href: "/docs/scheduling/calendars",
      demo: <Calendars />,
    },
    {
      title: "Who's free, across your marketplace",
      body: "Search every matching host's soonest slots, or let a pool share bookings by weight.",
      href: "/docs/scheduling/pools-and-groups",
      demo: <Search />,
    },
    {
      title: "10:00 stays 10:00",
      body: "Recurring series keep the attendee's local time across a clock change.",
      href: "/docs/scheduling/bookings",
      demo: <Series />,
    },
  ],
};
