import { Badge } from "@coss/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { CheckIcon } from "lucide-react";
import { ProgressBadge, Replay, StatusDot, type Tone } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import type { ProductShowcase } from "./types";

const RECIPIENTS: readonly { address: string; tone: Tone; status: string; time: string }[] = [
  { address: "ada@example.com", tone: "success", status: "delivered", time: "09:41:04" },
  { address: "grace@example.com", tone: "success", status: "delivered", time: "09:41:05" },
  { address: "linus@example.org", tone: "error", status: "bounced", time: "09:41:06" },
  { address: "alan@example.net", tone: "warning", status: "complained", time: "10:02:17" },
];

function Recipients() {
  return (
    <Tray flush title="Your October invoice" meta="4 recipients">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="ps-4">Recipient</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="pe-4 text-right">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {RECIPIENTS.map((recipient) => (
            <TableRow key={recipient.address}>
              <TableCell className="ps-4">{recipient.address}</TableCell>
              <TableCell>
                <StatusDot tone={recipient.tone}>{recipient.status}</StatusDot>
              </TableCell>
              <TableCell className="pe-4 text-right font-mono text-muted-foreground text-xs tabular-nums">
                {recipient.time}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Tray>
  );
}

const RECORDS = [
  ["CNAME", "x1._domainkey", "DKIM"],
  ["CNAME", "x2._domainkey", "DKIM"],
  ["CNAME", "x3._domainkey", "DKIM"],
  ["MX", "mail", "MAIL FROM"],
  ["TXT", "mail", "SPF"],
  ["TXT", "_dmarc", "DMARC"],
] as const;

function Domain() {
  return (
    <Tray
      flush
      title="acme.com"
      action={
        <Badge variant="success">
          <CheckIcon />
          Verified
        </Badge>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="ps-4">Type</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="pe-4 text-right">Purpose</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {RECORDS.map(([type, name, purpose]) => (
            <TableRow key={`${type}-${name}`}>
              <TableCell className="ps-4 font-mono text-xs">{type}</TableCell>
              <TableCell className="font-mono text-xs">{name}</TableCell>
              <TableCell className="pe-4 text-right">
                <StatusDot className="justify-end" tone="success">
                  {purpose}
                </StatusDot>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Tray>
  );
}

function Template() {
  return (
    <Tray title="welcome" action={<Badge variant="success">v3 published</Badge>}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-1.5">
          <Badge>en</Badge>
          <Badge variant="outline">de</Badge>
          <Badge variant="outline">fr</Badge>
        </div>
        <p className="font-medium">
          Welcome, <span className="font-mono text-[0.8125rem]">{"{{first_name}}"}</span>
        </p>
        <p className="text-muted-foreground text-sm leading-snug">
          Rendered at send, so publishing v4 never changes an email already sent or scheduled.
        </p>
      </div>
    </Tray>
  );
}

function Idempotency() {
  return (
    <Tray title="Idempotency-Key: invoice-2026-10-ada">
      <ol className="flex flex-col gap-2.5 font-mono text-[0.8125rem]">
        <li className="flex items-center justify-between gap-4">
          <span>POST /v1/emails</span>
          <StatusDot tone="success">202, sent once</StatusDot>
        </li>
        <li className="flex items-center justify-between gap-4">
          <span>POST /v1/emails</span>
          <StatusDot tone="neutral">202, same email</StatusDot>
        </li>
        <li className="flex items-center justify-between gap-4">
          <span>POST /v1/emails</span>
          <StatusDot tone="neutral">202, same email</StatusDot>
        </li>
      </ol>
    </Tray>
  );
}

export const email: ProductShowcase = {
  lede: "One call sends it. You get a status and a signed webhook for every recipient.",
  call: "coss.email.send()",
  stage: (
    <Replay
      events={[
        { name: "queued", tone: "neutral", at: "09:41:02.118" },
        { name: "email.sent", tone: "info", at: "09:41:02.904" },
        { name: "email.delivered", tone: "success", at: "09:41:04.377" },
        { name: "email.opened", tone: "success", at: "09:47:31.002" },
      ]}
    >
      <div className="flex items-start justify-between gap-3 pb-1">
        <div className="min-w-0">
          <p className="truncate font-medium">Your October invoice</p>
          <p className="truncate text-muted-foreground text-sm">to ada@example.com</p>
        </div>
        <ProgressBadge
          steps={[
            { label: "queued", variant: "outline" },
            { label: "sent", variant: "info" },
            { label: "delivered", variant: "success" },
          ]}
        />
      </div>
    </Replay>
  ),
  highlights: [
    {
      title: "Know what happened to every recipient",
      body: "Each recipient has their own status, and every change is an event on the email and a signed webhook.",
      href: "/docs/email/delivery",
      demo: <Recipients />,
    },
    {
      title: "Your domain, set up in one click",
      body: "Three DKIM keys, SPF on a MAIL FROM subdomain and DMARC. With Domain Connect, the dashboard adds them for you.",
      href: "/docs/email/domains",
      demo: <Domain />,
    },
    {
      title: "Templates that stay put",
      body: "Publish numbered versions, one per locale, with typed variables.",
      href: "/docs/email/templates",
      demo: <Template />,
    },
    {
      title: "Retries that never send twice",
      body: "The SDK puts an Idempotency-Key on every send. A repeat returns the first email instead of sending a second.",
      href: "/docs/api-reference/idempotency",
      demo: <Idempotency />,
    },
  ],
};
