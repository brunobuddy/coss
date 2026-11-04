import { Badge } from "@coss/ui/components/badge";
import { cn } from "@coss/ui/lib/utils";
import { CheckIcon, MailIcon, MessageSquareIcon, XIcon } from "lucide-react";
import { ProgressBadge, Replay } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import type { ProductShowcase } from "./types";

/** The stage's timing: the code arrives, is typed in, and is approved. */
const FIRST_DIGIT = 900;
const APPROVED = 1800;

const GUARD = [
  { check: "Your Risk lists", result: "no match", failed: false },
  { check: "Line type", result: "mobile", failed: false },
  { check: "Tor exit node", result: "no", failed: false },
  { check: "Velocity per IP and user", result: "normal", failed: false },
  { check: "Prefix +1 415 555", result: "verify.prefix_low_conversion", failed: true },
] as const;

function FraudGuard() {
  return (
    <Tray flush title="Before a code goes out" action={<Badge variant="error">blocked</Badge>}>
      <ul className="flex flex-col">
        {GUARD.map(({ check, result, failed }) => (
          <li
            className="flex items-center justify-between gap-4 border-b px-4 py-2.5 last:border-b-0"
            key={check}
          >
            <span className="flex min-w-0 items-center gap-2 text-sm">
              {failed ? (
                <XIcon aria-hidden className="size-3.5 shrink-0 text-destructive-foreground" />
              ) : (
                <CheckIcon aria-hidden className="size-3.5 shrink-0 text-success-foreground" />
              )}
              {check}
            </span>
            <span
              className={cn(
                "truncate font-mono text-xs",
                failed ? "text-destructive-foreground" : "text-muted-foreground",
              )}
            >
              {result}
            </span>
          </li>
        ))}
        <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-muted/48 px-4 py-2.5">
          <span className="font-mono text-[0.8125rem]">verification.blocked</span>
          <span className="text-muted-foreground text-xs">No SMS sent, nothing billed</span>
        </li>
      </ul>
    </Tray>
  );
}

const KEPT = [
  ["The code", "an HMAC, until it expires"],
  ["The message text", "erased once sent"],
  ["Logs", "never the code"],
  ["Webhooks", "never the code"],
  ["Email subjects", "never the code"],
] as const;

function NeverStored() {
  return (
    <Tray flush title="What coss.com keeps">
      <dl className="flex flex-col">
        {KEPT.map(([what, kept]) => (
          <div
            className="flex items-baseline justify-between gap-4 border-b px-4 py-2.5 last:border-b-0"
            key={what}
          >
            <dt className="text-sm">{what}</dt>
            <dd className="text-right font-mono text-muted-foreground text-xs">{kept}</dd>
          </div>
        ))}
      </dl>
    </Tray>
  );
}

const CODES = ["retired", "retired", "active", "unused", "unused"] as const;

function Resends() {
  return (
    <Tray title="verification_01k7c8m4q2" meta="third code">
      <div className="flex flex-col gap-3">
        <ol className="grid grid-cols-5 gap-1.5">
          {CODES.map((state, index) => (
            <li
              className={cn(
                "flex h-11 items-center justify-center rounded-md border font-mono text-xs tabular-nums",
                state === "active" && "border-transparent bg-primary text-primary-foreground",
                state === "retired" && "bg-muted text-muted-foreground line-through",
                state === "unused" && "border-dashed text-muted-foreground",
              )}
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed row of five
              key={index}
            >
              {index + 1}
            </li>
          ))}
        </ol>
        <p className="text-muted-foreground text-sm leading-snug">
          The old code stops working and the expiry restarts. There's no resend endpoint and no
          state on your side.
        </p>
      </div>
    </Tray>
  );
}

function Channels() {
  return (
    <Tray flush title="coss.verify.start()">
      <ul className="flex flex-col">
        <li className="flex items-center gap-3 border-b px-4 py-3">
          <MessageSquareIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <code className="truncate font-mono text-[0.8125rem]">to: "+14155550123"</code>
            <span className="text-muted-foreground text-xs">
              SMS, from shared numbers or your own
            </span>
          </span>
        </li>
        <li className="flex items-center gap-3 border-b px-4 py-3">
          <MailIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <code className="truncate font-mono text-[0.8125rem]">to: "ada@example.com"</code>
            <span className="text-muted-foreground text-xs">
              Email, from your domain or coss.com's sender
            </span>
          </span>
        </li>
        <li className="flex items-center gap-3 px-4 py-3">
          <XIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <code className="truncate font-mono text-[0.8125rem]">to: "+33612345678"</code>
            <span className="text-muted-foreground text-xs">
              <code className="font-mono">country_not_allowed</code>, until you add France
            </span>
          </span>
        </li>
      </ul>
    </Tray>
  );
}

export const verify: ProductShowcase = {
  lede: "Two calls prove someone has that number or mailbox, and a fraud guard runs before you pay for a text.",
  call: "coss.verify.start()",
  stage: (
    <Replay
      events={[
        { name: "verification.started", tone: "neutral", at: "09:41:02.118" },
        { name: "verification.sent", tone: "info", at: "09:41:02.640" },
        { name: "verification.approved", tone: "success", at: "09:41:19.205" },
      ]}
      step={APPROVED / 2}
    >
      <div className="flex flex-col gap-3 pb-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">Enter your code</p>
            <p className="truncate text-muted-foreground text-sm">Sent to +1 415 555 0123</p>
          </div>
          <ProgressBadge
            step={APPROVED}
            steps={[
              { label: "pending", variant: "outline" },
              { label: "approved", variant: "success" },
            ]}
          />
        </div>
        <ul aria-label="The code entered" className="flex gap-2">
          {[..."482913"].map((digit, index) => (
            <li
              className="enter-pop flex h-11 w-10 items-center justify-center rounded-lg border bg-background font-mono text-lg shadow-xs/5"
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed code, in order
              key={index}
              style={{ animationDelay: `${FIRST_DIGIT + index * 110}ms` }}
            >
              {digit}
            </li>
          ))}
        </ul>
      </div>
    </Replay>
  ),
  highlights: [
    {
      title: "SMS pumping stops before you pay for it",
      body: "The fraud guard checks every new verification first, and a blocked one costs nothing.",
      href: "/docs/verify/fraud-guard",
      demo: <FraudGuard />,
    },
    {
      title: "One call, whichever way the code travels",
      body: "A number gets an SMS and an address gets an email. SMS goes only to the countries you allow.",
      href: "/docs/verify/sms",
      demo: <Channels />,
    },
    {
      title: "Resends that just work",
      body: "Starting again for a pending destination sends a new code, up to 5 per verification.",
      href: "/docs/verify",
      demo: <Resends />,
    },
    {
      title: "Codes are never stored or logged",
      body: "Only an HMAC of each code exists, and only until the verification expires.",
      href: "/docs/verify",
      demo: <NeverStored />,
    },
  ],
};
