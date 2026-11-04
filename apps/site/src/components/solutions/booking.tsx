import { Badge } from "@coss/ui/components/badge";
import { cn } from "@coss/ui/lib/utils";
import { Replay, StatusDot } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import { DataTable, Line, Mono, StageHead } from "./parts";
import type { SolutionShowcase } from "./types";

const SLOTS = [
  ["09:00", "open"],
  ["09:30", "open"],
  ["10:00", "booked"],
  ["10:30", "busy"],
  ["11:00", "open"],
  ["11:30", "open"],
] as const;

function Slots() {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {SLOTS.map(([time, state]) => (
        <span
          className={cn(
            "rounded-md border px-2 py-1.5 text-center font-mono text-xs tabular-nums",
            state === "booked" && "border-info/40 bg-info/8 text-info-foreground",
            state === "busy" && "bg-muted text-muted-foreground line-through",
          )}
          key={time}
        >
          {time}
        </span>
      ))}
    </div>
  );
}

function Race() {
  return (
    <Tray title="Two people, one 10:00 slot">
      <ol className="flex flex-col gap-2.5 font-mono text-[0.8125rem]">
        <li className="flex items-center justify-between gap-4">
          <span>sam@example.com</span>
          <StatusDot tone="success">confirmed</StatusDot>
        </li>
        <li className="flex items-center justify-between gap-4">
          <span>kim@example.com</span>
          <StatusDot tone="error">slot_unavailable</StatusDot>
        </li>
      </ol>
    </Tray>
  );
}

function Calendars() {
  return (
    <Tray flush title="Ana Reyes" meta="Calendars">
      <DataTable
        head={["Calendar", "Provider", "State"]}
        rows={[
          [
            "ana@acme.com",
            "Google",
            <StatusDot key="s" tone="success">
              connected
            </StatusDot>,
          ],
          [
            "ana@tutors.example",
            "Microsoft",
            <StatusDot key="s" tone="success">
              connected
            </StatusDot>,
          ],
          [
            "Home",
            "CalDAV",
            <StatusDot key="s" tone="warning">
              needs_reauth
            </StatusDot>,
          ],
        ]}
      />
    </Tray>
  );
}

function Notifications() {
  return (
    <Tray title="Sam Lee" meta="Attendee">
      <div className="flex flex-col">
        <Line label="Booking confirmed, with invitation">
          <Mono muted>email</Mono>
        </Line>
        <Line label="Reminder a day before">
          <Mono muted>email, SMS</Mono>
        </Line>
        <Line label="Reply STOP">
          <StatusDot tone="neutral">always honored</StatusDot>
        </Line>
      </div>
    </Tray>
  );
}

function Kinds() {
  return (
    <Tray flush title="Event types">
      <DataTable
        head={["Kind", "Books"]}
        rows={[
          [<Mono key="k">one_on_one</Mono>, "One host"],
          [<Mono key="k">pool</Mono>, "Any available host"],
          [<Mono key="k">collective</Mono>, "Every required host at once"],
          [<Mono key="k">group</Mono>, "A seat in one session"],
        ]}
      />
    </Tray>
  );
}

export const booking: SolutionShowcase = {
  lede: "Availability, calendars and bookings for your users, with pages you embed under your own brand.",
  call: "coss.scheduling.sessions.createForBooker()",
  stage: (
    <Replay
      events={[
        { name: "scheduling.booking.created", tone: "info", at: "09:41:02" },
        { name: "scheduling.booking.confirmed", tone: "success", at: "09:41:02" },
        { name: "email.delivered", tone: "success", at: "09:41:05" },
      ]}
    >
      <StageHead
        detail="Ana Reyes, 30 minutes"
        state={<Badge variant="success">confirmed</Badge>}
        title="Trial lesson"
      />
      <Slots />
    </Replay>
  ),
  steps: [
    {
      title: "No double-booking",
      body: "A Postgres exclusion constraint refuses two overlapping claims of one host, under races, retries and second tabs.",
      href: "/products/scheduling",
      demo: <Race />,
    },
    {
      title: "Calendars that count",
      body: "Busy times from Google, Microsoft or CalDAV block slots, and a calendar that can't be read never counts as free.",
      href: "/docs/scheduling/calendars",
      demo: <Calendars />,
    },
    {
      title: "Reminders from your domain",
      body: "Attendees and hosts hear from your verified domain, and reminders can also go by text from your own number.",
      href: "/docs/scheduling/notifications",
      demo: <Notifications />,
    },
    {
      title: "Pools, panels and classes",
      body: "Book any available host, every required host, or a seat in one session.",
      href: "/docs/scheduling/pools-and-groups",
      demo: <Kinds />,
    },
  ],
};
