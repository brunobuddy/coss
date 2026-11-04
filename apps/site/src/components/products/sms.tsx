import { countSegments } from "@coss/sms/segments";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { cn } from "@coss/ui/lib/utils";
import { CheckIcon, LoaderIcon } from "lucide-react";
import type { ReactNode } from "react";
import { beat } from "@/components/marketing/beat";
import { ProgressBadge, Replay, StatusDot } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import type { ProductShowcase } from "./types";

const BODY = "Your Acme order #1042 has shipped.";

function Bubble({ out, children }: { out?: boolean; children: ReactNode }) {
  return (
    <p
      className={cn(
        "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-snug",
        out
          ? "self-end rounded-br-sm bg-primary text-primary-foreground"
          : "self-start rounded-bl-sm bg-muted",
      )}
    >
      {children}
    </p>
  );
}

const STEPS = [
  ["Business profile", "approved"],
  ["Brand", "approved"],
  ["Campaign", "in_review"],
] as const;

function Registration() {
  return (
    <Tray title="US 10DLC registration" meta="us_10dlc">
      <ol className="flex flex-col">
        {STEPS.map(([step, status]) => (
          <li
            className="flex items-center justify-between gap-4 border-b py-2.5 last:border-b-0"
            key={step}
          >
            <span className="flex items-center gap-2.5 text-sm">
              {status === "approved" ? (
                <CheckIcon aria-hidden className="size-4 text-success-foreground" />
              ) : (
                <LoaderIcon aria-hidden className="size-4 text-warning-foreground" />
              )}
              {step}
            </span>
            <span className="font-mono text-muted-foreground text-xs">{status}</span>
          </li>
        ))}
      </ol>
    </Tray>
  );
}

function OptOut() {
  return (
    <Tray flush title="+1 415 555 0199">
      <div className="flex flex-col gap-2 p-4">
        <Bubble out>{BODY}</Bubble>
        <Bubble>STOP</Bubble>
      </div>
      <div className="flex items-center justify-between gap-4 border-t px-4 py-2.5">
        <StatusDot className="font-mono text-[0.8125rem]" tone="warning">
          sms.opted_out
        </StatusDot>
        <span className="text-muted-foreground text-xs">Every live environment</span>
      </div>
    </Tray>
  );
}

const MESSAGES = [
  "Your Acme order #1042 has shipped.",
  "Votre colis est arrivé 📦",
  "Your Acme order ships on Friday. Track it, change the delivery address or hold it at the depot from your account page, and reply STOP at any time to opt out of these delivery updates.",
];

function Segments() {
  return (
    <Tray flush title="Messages">
      <ul className="flex flex-col">
        {MESSAGES.map((message) => {
          const { encoding, segments } = countSegments(message);
          return (
            <li
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b px-4 py-3 last:border-b-0"
              key={message}
            >
              <span className="line-clamp-2 text-sm leading-snug">{message}</span>
              <span className="flex flex-col items-end gap-0.5 font-mono text-xs">
                <span>{encoding}</span>
                <span className="text-muted-foreground">
                  {segments} {segments === 1 ? "segment" : "segments"}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </Tray>
  );
}

const NUMBERS = [
  ["+1 415 555 0123", "local", "approved", true],
  ["+1 833 555 0147", "toll_free", "approved", true],
  ["+1 212 555 0176", "local", "in_review", false],
] as const;

function Numbers() {
  return (
    <Tray flush title="Numbers">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="ps-4">Number</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead className="pe-4 text-right">Registration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {NUMBERS.map(([number, kind, status, canSend]) => (
            <TableRow key={number}>
              <TableCell className="ps-4 font-mono text-xs tabular-nums">{number}</TableCell>
              <TableCell className="font-mono text-muted-foreground text-xs">{kind}</TableCell>
              <TableCell className="pe-4 text-right">
                <StatusDot className="justify-end" tone={canSend ? "success" : "warning"}>
                  {status}
                </StatusDot>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Tray>
  );
}

const _counted = countSegments(BODY);

export const sms: ProductShowcase = {
  lede: "US registration is done for you, and every delivery event and reply reaches your webhooks.",
  call: "coss.sms.send()",
  stage: (
    <Replay
      events={[
        { name: "queued", tone: "neutral", at: "09:41:02.118" },
        { name: "sms.sent", tone: "info", at: "09:41:02.640" },
        { name: "sms.delivered", tone: "success", at: "09:41:05.271" },
      ]}
    >
      <div className="flex flex-col gap-2 pb-1">
        <div className="flex items-center justify-between gap-3">
          <ProgressBadge
            steps={[
              { label: "queued", variant: "outline" },
              { label: "sent", variant: "info" },
              { label: "delivered", variant: "success" },
            ]}
          />
          <p className="truncate font-mono text-muted-foreground text-xs">to +1 415 555 0199</p>
        </div>
        <div className="enter-rise flex flex-col" style={beat(0)}>
          <Bubble out>{BODY}</Bubble>
        </div>
      </div>
    </Replay>
  ),
  highlights: [
    {
      title: "Registration without the paperwork",
      body: "One form becomes the business profile, the brand and the campaign US carriers require.",
      href: "/docs/sms/senders",
      demo: <Registration />,
    },
    {
      title: "Opt-outs honored everywhere",
      body: "A reply of STOP suppresses the number in every live environment of your organization, and START lifts it.",
      href: "/docs/sms/receiving",
      demo: <OptOut />,
    },
    {
      title: "Segments counted up front",
      body: "Every message says its encoding and segments, counted as the carrier counts them.",
      href: "/docs/sms/sending",
      demo: <Segments />,
    },
    {
      title: "Numbers that belong to your organization",
      body: "Every environment's keys send from them, and the list says which can send now.",
      href: "/docs/sms/senders",
      demo: <Numbers />,
    },
  ],
};
