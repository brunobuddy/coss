import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import { cn } from "@coss/ui/lib/utils";
import { ArrowDownIcon, LockIcon } from "lucide-react";
import { Replay, StatusDot, type Tone } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import type { ProductShowcase } from "./types";

/** A drawn signature. */
function Signature({ className, draw }: { className?: string; draw?: boolean }) {
  return (
    <svg
      aria-label="Ada Lovelace's signature"
      className={cn("text-foreground", className)}
      fill="none"
      role="img"
      viewBox="0 0 160 44"
    >
      <path
        className={draw ? "enter-draw" : undefined}
        pathLength={draw ? 1 : undefined}
        style={draw ? { animationDelay: "1040ms" } : undefined}
        d="M6 34c7-9 14-22 20-27 3-2 4 1 2 7-3 9-9 19-11 21-2 1 2-8 10-11 6-2 8-1 6 3-2 3-1 5 3 2 5-4 11-13 15-20 2-3 3-1 1 4-3 8-8 20-7 22 2 2 6-5 11-9 3-2 5-1 3 2-1 3 1 4 4 2 6-4 12-9 18-9 4 0 1 7 4 7 5 0 8-6 13-6 3 0 2 4 5 4 8 0 20-5 39-9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </svg>
  );
}

/** Lines of text on a page, at the size a PDF shows them when zoomed out. */
function TextLines({ widths }: { widths: readonly string[] }) {
  return (
    <div aria-hidden className="flex flex-col gap-1.5">
      {widths.map((width, index) => (
        <span
          className="h-1 rounded-full bg-foreground/12"
          // biome-ignore lint/suspicious/noArrayIndexKey: decorative lines
          key={index}
          style={{ width }}
        />
      ))}
    </div>
  );
}

function Page() {
  return (
    <div className="rounded-lg bg-muted/72 p-3">
      <div className="flex flex-col gap-3 rounded-sm bg-background p-4 shadow-xs ring-1 ring-border">
        <p className="font-medium text-sm">Services agreement</p>
        <TextLines widths={["100%", "94%", "98%", "62%"]} />
        <div className="grid grid-cols-[1fr_auto] items-end gap-4 pt-1">
          <div className="flex flex-col gap-1">
            <div className="rounded-sm bg-info/8 px-2 py-1 ring-1 ring-info/32 ring-inset">
              <Signature className="h-7 w-auto" draw />
            </div>
            <span className="font-mono text-[0.625rem] text-muted-foreground">signature</span>
          </div>
          <div className="flex flex-col gap-1">
            <div
              className="enter-pop rounded-sm bg-info/8 px-2 py-2.5 font-mono text-xs ring-1 ring-info/32 ring-inset"
              style={{ animationDelay: "1800ms" }}
            >
              2026-11-04
            </div>
            <span className="font-mono text-[0.625rem] text-muted-foreground">date_signed</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Embedded() {
  return (
    <Tray flush title="yourapp.com/contracts/42" meta="Your app">
      <div className="flex flex-col gap-4 bg-muted/48 p-4 sm:p-5">
        <div className="flex flex-col gap-4 rounded-xl border bg-background p-4 shadow-xs/5">
          <div className="flex flex-col gap-1">
            <p className="font-medium">Adopt your signature</p>
            <p className="text-muted-foreground text-sm">
              Ada Lovelace agreed to sign electronically.
            </p>
          </div>
          <div className="flex items-center justify-center rounded-lg border border-dashed py-3">
            <Signature className="h-10 w-auto" />
          </div>
          <div aria-hidden className="flex flex-wrap justify-end gap-2">
            <Button render={<span />} size="sm" variant="outline">
              Decline
            </Button>
            <Button render={<span />} size="sm">
              Adopt and sign
            </Button>
          </div>
        </div>
      </div>
    </Tray>
  );
}

const TRAIL = [
  ["created", "41ab07e2"],
  ["sent", "9f2c11d8"],
  ["viewed", "07de94b3"],
  ["consented", "c3185fa6"],
  ["signed", "e27b60c1"],
  ["completed", "5ad90c37"],
  ["sealed", "b86f24ea"],
] as const;

function AuditTrail() {
  return (
    <Tray
      flush
      meta={
        <span className="inline-flex items-center gap-1">
          <LockIcon aria-hidden className="size-3" />
          PAdES B-LT
        </span>
      }
      title="Audit trail"
    >
      <ol className="flex flex-col">
        {TRAIL.map(([event, hash], index) => (
          <li
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b px-4 py-2 last:border-b-0"
            key={event}
          >
            <span className="font-mono text-[0.8125rem]">{event}</span>
            <span className="font-mono text-muted-foreground text-xs tabular-nums">
              {index > 0 ? `${TRAIL[index - 1]?.[1].slice(0, 4)}… → ` : "null → "}
              <span className="text-foreground">{hash.slice(0, 4)}…</span>
            </span>
          </li>
        ))}
      </ol>
    </Tray>
  );
}

const SIGNERS: readonly { name: string; status: string; tone: Tone; note: string }[] = [
  { name: "Ada Lovelace", status: "signed", tone: "success", note: "Finished" },
  { name: "Grace Hopper", status: "viewed", tone: "info", note: "Their turn" },
  { name: "Alan Turing", status: "pending", tone: "neutral", note: "Waiting" },
];

function SigningOrder() {
  return (
    <Tray flush title='signing_order: "sequential"'>
      <ol className="flex flex-col">
        {SIGNERS.map((signer, index) => (
          <li
            className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
            key={signer.name}
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-muted-foreground text-xs">
              {index + 1}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm">{signer.name}</span>
              <span className="text-muted-foreground text-xs">{signer.note}</span>
            </span>
            <StatusDot className="text-sm" tone={signer.tone}>
              {signer.status}
            </StatusDot>
          </li>
        ))}
      </ol>
    </Tray>
  );
}

function Anchors() {
  return (
    <Tray title="agreement.pdf">
      <div className="flex flex-col items-start gap-2.5">
        <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
          {"{{signature:signer_1}}"}
        </code>
        <ArrowDownIcon aria-hidden className="ms-2 size-3.5 text-muted-foreground" />
        <div className="rounded-sm bg-info/8 px-3 py-1 ring-1 ring-info/32 ring-inset">
          <Signature className="h-8 w-auto" />
        </div>
        <div className="flex flex-wrap gap-1.5 pt-2">
          {["signature", "initials", "date_signed", "name", "email", "text", "checkbox"].map(
            (type) => (
              <Badge key={type} variant="outline">
                {type}
              </Badge>
            ),
          )}
        </div>
      </div>
    </Tray>
  );
}

export const sign: ProductShowcase = {
  lede: "People sign PDFs inside your app or from an email, and you get a sealed copy with an audit trail.",
  call: "coss.sign.requests.create()",
  stage: (
    <Replay
      events={[
        { name: "sign_request.sent", tone: "neutral", at: "09:41:02" },
        { name: "sign_request.viewed", tone: "info", at: "09:44:18" },
        { name: "sign_request.signer_signed", tone: "info", at: "09:45:03" },
        { name: "sign_request.completed", tone: "success", at: "09:45:04" },
      ]}
    >
      <Page />
    </Replay>
  ),
  highlights: [
    {
      title: "Signing on your own page",
      body: "mountSigning opens the signing page in an iframe in your app, with your accent color and theme.",
      href: "/docs/sign/embedded-signing",
      demo: <Embedded />,
    },
    {
      title: "A record that proves itself",
      body: "Each event's hash covers the one before it, and a PAdES seal shows nothing changed since.",
      href: "/docs/sign/completion-and-audit-trail",
      demo: <AuditTrail />,
    },
    {
      title: "All at once, or in turn",
      body: "Signers sign in parallel by default, or each once everyone before them has signed.",
      href: "/docs/sign/email-signing",
      demo: <SigningOrder />,
    },
    {
      title: "Fields that find their place",
      body: "Write an anchor into the document, or place fields in PDF points on a page.",
      href: "/docs/sign/fields-and-anchors",
      demo: <Anchors />,
    },
  ],
};
