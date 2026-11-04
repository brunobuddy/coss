import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import { Switch } from "@coss/ui/components/switch";
import { cn } from "@coss/ui/lib/utils";
import type { ReactNode } from "react";
import { Replay } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import type { ProductShowcase } from "./types";

/** A segment condition's value, drawn like the dashboard's select keycaps. */
function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center rounded-md border bg-popover px-2 font-mono text-xs shadow-xs/5">
      {children}
    </span>
  );
}

const CONDITIONS = [
  ["property", "plan", "eq", "pro"],
  ["topic", "newsletter", "subscribed"],
  ["created_at", "within_days", "90"],
] as const;

function Segment() {
  return (
    <Tray title="Pro customers">
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          Match <span className="font-mono text-foreground text-xs">all</span> of these
        </p>
        <ul className="flex flex-col gap-2">
          {CONDITIONS.map((condition) => (
            <li className="flex flex-wrap gap-1.5" key={condition.join("-")}>
              {condition.map((part) => (
                <Chip key={part}>{part}</Chip>
              ))}
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between border-t pt-3">
          <span className="text-muted-foreground text-sm">Matches now</span>
          <span className="font-heading font-semibold text-2xl tabular-nums">2,418</span>
        </div>
      </div>
    </Tray>
  );
}

const STAGES = ["draft", "scheduled", "sending", "paused", "sent"] as const;

const STATS = [
  ["sent", "2,406"],
  ["delivered", "2,391"],
  ["bounced", "15"],
  ["opened", "1,204"],
  ["clicked", "388"],
  ["unsubscribed", "9"],
] as const;

function Lifecycle() {
  return (
    <Tray title="October newsletter" flush>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-3 sm:px-5">
        {STAGES.map((stage, index) => (
          <li className="flex items-center gap-2" key={stage}>
            {index > 0 ? <span aria-hidden className="h-px w-3 bg-border sm:w-5" /> : null}
            <span
              className={cn(
                "font-mono text-xs",
                stage === "sent" ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {stage}
            </span>
          </li>
        ))}
      </ol>
      <dl className="grid grid-cols-2 sm:grid-cols-3">
        {STATS.map(([label, value]) => (
          <div className="flex flex-col gap-0.5 border-b p-4 sm:px-5" key={label}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="font-heading font-semibold text-2xl tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </Tray>
  );
}

const TOPICS = [
  ["Newsletter", "What we shipped this month", true],
  ["Product updates", "New features, as they land", true],
  ["Events", "Meetups and webinars", false],
] as const;

function Preferences() {
  return (
    <Tray meta="Hosted on your tracking domain" title="Email preferences">
      <div className="flex flex-col gap-3">
        <ul className="flex flex-col">
          {TOPICS.map(([name, description, on]) => (
            <li
              className="flex items-center justify-between gap-4 border-b py-2.5 last:border-b-0"
              key={name}
            >
              <span className="min-w-0">
                <span className="block font-medium text-sm">{name}</span>
                <span className="block text-muted-foreground text-xs">{description}</span>
              </span>
              <Switch aria-label={name} defaultChecked={on} />
            </li>
          ))}
        </ul>
        <Button className="self-start" size="sm" variant="outline">
          Unsubscribe from everything
        </Button>
      </div>
    </Tray>
  );
}

function Streams() {
  return (
    <Tray title="Sending streams">
      <ul className="flex flex-col gap-4">
        <li className="flex items-center justify-between gap-4">
          <span className="min-w-0">
            <span className="block font-medium text-sm">Transactional</span>
            <span className="block text-muted-foreground text-xs">Receipts and sign-in links</span>
          </span>
          <Badge variant="success">sending</Badge>
        </li>
        <li className="flex items-center justify-between gap-4">
          <span className="min-w-0">
            <span className="block font-medium text-sm">Marketing</span>
            <span className="block font-mono text-muted-foreground text-xs">
              account.marketing_paused
            </span>
          </span>
          <Badge variant="warning">paused</Badge>
        </li>
      </ul>
    </Tray>
  );
}

export const marketingEmail: ProductShowcase = {
  lede: "Keep your contacts in coss.com, pick a segment and send it as a broadcast.",
  call: "coss.email.broadcasts.create()",
  stage: (
    <Replay
      events={[
        { name: "broadcast.sending", tone: "info", at: "09:00:00" },
        { name: "broadcast.sent", tone: "success", at: "09:06:41" },
        { name: "email.opened", tone: "success", at: "09:12:08" },
        { name: "contact.unsubscribed", tone: "neutral", at: "09:40:55" },
      ]}
    >
      <div className="flex items-start justify-between gap-3 pb-1">
        <div className="min-w-0">
          <p className="truncate font-medium">October newsletter</p>
          <p className="truncate text-muted-foreground text-sm">to Pro customers</p>
        </div>
        <Badge variant="success">sent</Badge>
      </div>
    </Replay>
  ),
  highlights: [
    {
      title: "Segments that are always current",
      body: "Filter on properties, audiences, topics, addresses and sign-up dates. A segment is evaluated at every use.",
      href: "/docs/email/audiences-and-segments",
      demo: <Segment />,
    },
    {
      title: "Stay in control of every send",
      body: "Test it on yourself, schedule it, pace it, then pause and resume where it stopped.",
      href: "/docs/email/broadcasts",
      demo: <Lifecycle />,
    },
    {
      title: "A preference center you don't build",
      body: "Every marketing email carries one-click unsubscribe and links to a page coss.com hosts.",
      href: "/docs/email/topics-and-preferences",
      demo: <Preferences />,
    },
    {
      title: "Campaigns never hold up receipts",
      body: "Marketing has its own stream and rates, so pausing it leaves password resets running.",
      href: "/docs/email/streams",
      demo: <Streams />,
    },
  ],
};
