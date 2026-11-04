import { Badge } from "@coss/ui/components/badge";
import { FileIcon, FileTextIcon } from "lucide-react";
import { Replay, StatusDot } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import type { ProductShowcase } from "./types";

function Addresses() {
  return (
    <Tray flush title="Where mail arrives">
      <div className="flex flex-col">
        <div className="flex flex-col gap-1.5 border-b p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-sm">The environment's address</span>
            <Badge variant="success">No DNS</Badge>
          </div>
          <code className="truncate font-mono text-[0.8125rem]">
            anything@k3j9x2m7qp4l.inbound.coss.com
          </code>
        </div>
        <div className="flex flex-col gap-1.5 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-sm">Your own domain</span>
            <Badge variant="outline">One MX record</Badge>
          </div>
          <code className="truncate font-mono text-[0.8125rem]">support@inbound.acme.com</code>
          <code className="truncate font-mono text-muted-foreground text-xs">
            MX 10 inbound-smtp.us-east-1.amazonaws.com
          </code>
        </div>
      </div>
    </Tray>
  );
}

const COPIES = [
  ["production", "support@inbound.acme.com"],
  ["staging", "qa@inbound-staging.acme.com"],
] as const;

function Routing() {
  return (
    <Tray title="One message, two environments">
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border bg-muted/48 p-3 font-mono text-xs leading-relaxed">
          <p>RCPT TO: support@inbound.acme.com</p>
          <p>RCPT TO: qa@inbound-staging.acme.com</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {COPIES.map(([environment, recipient]) => (
            <li className="flex min-w-0 flex-col gap-1 rounded-lg border p-3" key={environment}>
              <span className="font-medium text-sm">{environment}</span>
              <span className="truncate text-muted-foreground text-xs">Its own copy, naming</span>
              <code className="truncate font-mono text-xs">{recipient}</code>
            </li>
          ))}
        </ul>
      </div>
    </Tray>
  );
}

function Attachments() {
  return (
    <Tray flush title="Re: Your order" meta="2 attachments">
      <ul className="flex flex-col">
        <li className="flex items-center gap-3 border-b px-4 py-3">
          <FileTextIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">invoice.pdf</span>
            <span className="block truncate font-mono text-muted-foreground text-xs">
              getAttachment(), application/octet-stream
            </span>
          </span>
        </li>
        <li className="flex items-center gap-3 border-b px-4 py-3">
          <FileIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">photo.heic</span>
            <span className="block truncate font-mono text-muted-foreground text-xs">
              getAttachment(), application/octet-stream
            </span>
          </span>
        </li>
        <li className="flex items-center gap-3 px-4 py-3">
          <FileIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">The whole message</span>
            <span className="block truncate font-mono text-muted-foreground text-xs">
              getRaw(), message/rfc822
            </span>
          </span>
        </li>
      </ul>
    </Tray>
  );
}

const VERDICTS = [
  ["spam", "pass", "success"],
  ["virus", "pass", "success"],
  ["spf", "pass", "success"],
  ["dkim", "pass", "success"],
  ["dmarc", "fail", "warning"],
] as const;

function Verdicts() {
  return (
    <Tray title="verdicts">
      <dl className="flex flex-col gap-2 font-mono text-[0.8125rem]">
        {VERDICTS.map(([name, value, tone]) => (
          <div className="flex items-center justify-between gap-4" key={name}>
            <dt className="text-muted-foreground">{name}</dt>
            <dd>
              <StatusDot tone={tone}>{value}</StatusDot>
            </dd>
          </div>
        ))}
      </dl>
    </Tray>
  );
}

export const inboundEmail: ProductShowcase = {
  lede: "Mail arrives, coss.com scans and stores it, and your endpoint gets a signed webhook.",
  call: "coss.email.received.get()",
  stage: (
    <Replay
      events={[
        { name: "spam: pass", tone: "success", at: "12:00:00.214" },
        { name: "virus: pass", tone: "success", at: "12:00:00.218" },
        { name: "dkim: pass", tone: "success", at: "12:00:00.221" },
        { name: "email.received", tone: "info", at: "12:00:01.006" },
      ]}
    >
      <div className="flex items-start justify-between gap-3 pb-1">
        <div className="min-w-0">
          <p className="truncate font-medium">Re: Your order</p>
          <p className="truncate text-muted-foreground text-sm">
            from jane@example.com to support@inbound.acme.com
          </p>
        </div>
        <Badge variant="success">received</Badge>
      </div>
    </Replay>
  ),
  highlights: [
    {
      title: "Receive with no DNS, or on your domain",
      body: "Every environment has its own inbound address, and your own subdomain takes one MX record.",
      href: "/docs/email/receiving",
      demo: <Addresses />,
    },
    {
      title: "Routed by the envelope",
      body: "Bcc'd addresses count too. When one message reaches several environments, each gets a copy naming only its own recipients.",
      href: "/docs/email/receiving",
      demo: <Routing />,
    },
    {
      title: "Bodies, attachments, raw",
      body: "Fetch what you need, and attachments are always served as application/octet-stream.",
      href: "/docs/email/receiving",
      demo: <Attachments />,
    },
    {
      title: "A verdict on every message",
      body: "Spam and authentication failures are flagged for your handler. A virus is blocked and its content never stored.",
      href: "/docs/email/receiving",
      demo: <Verdicts />,
    },
  ],
};
