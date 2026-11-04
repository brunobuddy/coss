import { Badge } from "@coss/ui/components/badge";
import { cn } from "@coss/ui/lib/utils";
import type { ReactNode } from "react";
import { StatusDot, type Tone } from "./demo";

/*
 * Small real pieces of a product's interface, for the cards that link to it (the home page and
 * /products). Their data is illustrative; the names and statuses are the product's own.
 */

function Row({ tone, label, value }: { tone: Tone; label: string; value: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <span className="min-w-0 truncate text-sm">{label}</span>
      <StatusDot className="text-muted-foreground text-xs" tone={tone}>
        {value}
      </StatusDot>
    </li>
  );
}

function EmailPreview() {
  return (
    <ul className="divide-y">
      <Row label="ada@example.com" tone="success" value="delivered" />
      <Row label="grace@example.com" tone="info" value="sent" />
      <Row label="linus@example.org" tone="error" value="bounced" />
    </ul>
  );
}

function SmsPreview() {
  return (
    <div className="flex flex-col gap-2">
      <p className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-background px-3 py-2 text-sm leading-snug shadow-xs/5 ring-1 ring-border">
        Your Acme order has shipped.
      </p>
      <StatusDot className="ps-1 text-muted-foreground text-xs" tone="success">
        delivered, 1 segment
      </StatusDot>
    </div>
  );
}

function InboxesPreview() {
  return (
    <ul className="divide-y">
      <li className="flex flex-col gap-0.5 py-1.5">
        <span className="flex items-center justify-between gap-3 text-sm">
          <span className="truncate font-medium">Re: Refund for order 4417</span>
          <span className="shrink-0 text-muted-foreground text-xs">3 messages</span>
        </span>
        <span className="truncate font-mono text-muted-foreground text-xs">support@acme.com</span>
      </li>
      <li className="flex flex-col gap-0.5 py-1.5">
        <span className="flex items-center justify-between gap-3 text-sm">
          <span className="truncate font-medium">Invoice question</span>
          <span className="shrink-0 text-muted-foreground text-xs">1 message</span>
        </span>
        <span className="truncate font-mono text-muted-foreground text-xs">support@acme.com</span>
      </li>
    </ul>
  );
}

const SLOTS = [
  ["09:00", false],
  ["09:30", true],
  ["10:00", false],
  ["11:00", false],
  ["13:30", true],
  ["14:00", false],
  ["15:30", false],
  ["16:00", true],
] as const;

function SchedulingPreview() {
  return (
    <ul className="grid grid-cols-4 gap-1.5">
      {SLOTS.map(([time, taken]) => (
        <li
          className={cn(
            "rounded-md py-1.5 text-center font-mono text-xs tabular-nums",
            taken
              ? "text-muted-foreground line-through"
              : "bg-background shadow-xs/5 ring-1 ring-border",
          )}
          key={time}
        >
          {time}
        </li>
      ))}
    </ul>
  );
}

function RiskPreview() {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm">new-user@mailinator.example</span>
        <Badge variant="warning">review</Badge>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline">email.disposable</Badge>
        <Badge variant="outline">ip.tor</Badge>
      </div>
    </div>
  );
}

/** The products that show a piece of themselves on their cards. */
export const PREVIEWS: Record<string, ReactNode> = {
  email: <EmailPreview />,
  sms: <SmsPreview />,
  inboxes: <InboxesPreview />,
  scheduling: <SchedulingPreview />,
  risk: <RiskPreview />,
};
