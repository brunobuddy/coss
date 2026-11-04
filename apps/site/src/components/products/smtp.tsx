import { Badge } from "@coss/ui/components/badge";
import { Input } from "@coss/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { cn } from "@coss/ui/lib/utils";
import { Replay } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import type { ProductShowcase } from "./types";

const SESSION = [
  ["C", "AUTH PLAIN ••••••••"],
  ["S", "235 Authentication successful"],
  ["C", "MAIL FROM:<hello@acme.com>"],
  ["C", "RCPT TO:<ada@example.com>"],
  ["C", "DATA"],
  ["S", "250 2.0.0 OK queued as email_01k7c8…"],
] as const;

function Session() {
  return (
    <ol className="flex flex-col gap-1 rounded-lg border bg-muted/48 p-3 font-mono text-xs leading-relaxed">
      {SESSION.map(([side, line]) => (
        <li className={cn("truncate", side === "C" && "text-muted-foreground")} key={line}>
          {line}
        </li>
      ))}
    </ol>
  );
}

const SETTINGS = [
  ["Host", "smtp.coss.com"],
  ["Port", "465"],
  ["Username", "coss"],
  ["Password", "coss_live_••••••••"],
] as const;

const FRAMEWORKS = [
  "nodemailer",
  "Better Auth",
  "Supabase",
  "WordPress",
  "Rails",
  "Laravel",
  "Django",
];

function Settings() {
  return (
    <Tray title="Mail settings">
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {SETTINGS.map(([label, value]) => (
            <div className="flex min-w-0 flex-col gap-1.5 text-sm" key={label}>
              <span aria-hidden>{label}</span>
              <Input
                aria-label={label}
                className="font-mono"
                defaultValue={value}
                readOnly
                size="sm"
              />
            </div>
          ))}
        </div>
        <ul className="flex flex-wrap gap-1.5">
          {FRAMEWORKS.map((framework) => (
            <li key={framework}>
              <Badge variant="outline">{framework}</Badge>
            </li>
          ))}
        </ul>
      </div>
    </Tray>
  );
}

const HEADERS = [
  ["X-Coss-Category", "category"],
  ["X-Coss-Tags", "tags"],
  ["X-Coss-Tracking", "tracking"],
  ["X-Coss-Scheduled-At", "scheduled_at"],
  ["X-Coss-Idempotency-Key", "Idempotency-Key"],
  ["X-Coss-Subaccount", "subaccount"],
] as const;

function Headers() {
  return (
    <Tray flush title="Headers read, never sent on">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="ps-4">Header</TableHead>
            <TableHead className="pe-4 text-right">API field</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {HEADERS.map(([header, field]) => (
            <TableRow key={header}>
              <TableCell className="ps-4 font-mono text-xs">{header}</TableCell>
              <TableCell className="pe-4 text-right font-mono text-muted-foreground text-xs">
                {field}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Tray>
  );
}

function Replies() {
  return (
    <Tray flush title="Replies your client can act on">
      <ul className="flex flex-col">
        <li className="flex items-center justify-between gap-4 border-b px-4 py-3">
          <span className="min-w-0">
            <span className="block font-mono text-[0.8125rem]">451 4.3.0</span>
            <span className="block text-muted-foreground text-sm">Temporary, so it retries</span>
          </span>
          <Badge variant="warning">Retry</Badge>
        </li>
        <li className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="min-w-0">
            <span className="block font-mono text-[0.8125rem]">550 5.7.1</span>
            <span className="block text-muted-foreground text-sm">An unverified sender, say</span>
          </span>
          <Badge variant="error">Give up</Badge>
        </li>
      </ul>
    </Tray>
  );
}

function Envelope() {
  return (
    <Tray title="One message's recipients">
      <dl className="flex flex-col gap-2 font-mono text-[0.8125rem]">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">To</dt>
          <dd className="truncate">ada@example.com</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">Cc</dt>
          <dd className="truncate">grace@example.com</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t pt-2">
          <dt className="text-muted-foreground">bcc</dt>
          <dd className="truncate">audit@acme.com</dd>
        </div>
      </dl>
    </Tray>
  );
}

export const smtp: ProductShowcase = {
  lede: "Point your app's mail settings at coss.com, and each message becomes an API send.",
  call: "smtp.coss.com:465",
  stage: (
    <Replay
      events={[
        { name: "queued", tone: "neutral", at: "09:41:02" },
        { name: "email.sent", tone: "info", at: "09:41:03" },
        { name: "email.delivered", tone: "success", at: "09:41:04" },
      ]}
    >
      <Session />
    </Replay>
  ),
  highlights: [
    {
      title: "Works with what already speaks SMTP",
      body: "Log in as coss with an API key, and that key is checked again on every message.",
      href: "/docs/email/smtp",
      demo: <Settings />,
    },
    {
      title: "Set the API's fields from headers",
      body: "Categories, tags, tracking, schedules and idempotency all work over SMTP.",
      href: "/docs/email/smtp",
      demo: <Headers />,
    },
    {
      title: "Replies that say what to do",
      body: "4xx where a retry can help, and 5xx where it can't.",
      href: "/docs/email/smtp",
      demo: <Replies />,
    },
    {
      title: "Bcc stays private",
      body: "The envelope decides who receives a message, and a Bcc'd address never moves into a visible header.",
      href: "/docs/email/smtp",
      demo: <Envelope />,
    },
  ],
};
