import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import { Switch } from "@coss/ui/components/switch";
import { cn } from "@coss/ui/lib/utils";
import { Replay, StatusDot, type Tone } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import type { ProductShowcase } from "./types";

const ATTEMPTS: readonly { after: string; result: string; tone: Tone }[] = [
  { after: "at once", result: "503", tone: "error" },
  { after: "5 seconds", result: "503", tone: "error" },
  { after: "5 minutes", result: "timeout", tone: "error" },
  { after: "30 minutes", result: "503", tone: "error" },
  { after: "2 hours", result: "200", tone: "success" },
  { after: "5 hours", result: "", tone: "neutral" },
  { after: "10 hours", result: "", tone: "neutral" },
  { after: "10 hours", result: "", tone: "neutral" },
];

function Retries() {
  return (
    <Tray
      flush
      title="invoice.paid to ledger.acme.example"
      action={<Badge variant="success">succeeded</Badge>}
    >
      <ol className="grid grid-cols-2 sm:grid-cols-4">
        {ATTEMPTS.map((attempt, index) => (
          <li
            className={cn(
              "flex flex-col gap-1 border-b border-e p-3 sm:[&:nth-child(4n)]:border-e-0 max-sm:[&:nth-child(2n)]:border-e-0 sm:[&:nth-last-child(-n+4)]:border-b-0 max-sm:[&:nth-last-child(-n+2)]:border-b-0",
              !attempt.result && "text-muted-foreground",
            )}
            // biome-ignore lint/suspicious/noArrayIndexKey: attempts are numbered
            key={index}
          >
            <span className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
              {index + 1} of 8
            </span>
            <span className="text-sm">{attempt.after}</span>
            {attempt.result ? (
              <StatusDot className="font-mono text-xs" tone={attempt.tone}>
                {attempt.result}
              </StatusDot>
            ) : (
              <span className="text-xs">not needed</span>
            )}
          </li>
        ))}
      </ol>
    </Tray>
  );
}

function Portal() {
  return (
    <Tray flush title="portal.cosshooks.com" action={<Badge variant="outline">Acme Corp</Badge>}>
      <div className="flex flex-col gap-3 bg-muted/48 p-4 sm:p-5">
        <div className="flex flex-col gap-3 rounded-xl border bg-background p-4 shadow-xs/5">
          <div className="flex items-center justify-between gap-4">
            <code className="min-w-0 truncate font-mono text-[0.8125rem]">
              https://billing.acme.example/hooks
            </code>
            <Switch aria-label="Endpoint enabled" defaultChecked />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">invoice.paid</Badge>
            <Badge variant="outline">invoice.refunded</Badge>
          </div>
          <div aria-hidden className="flex flex-wrap gap-2">
            <Button render={<span />} size="sm" variant="outline">
              Send test
            </Button>
            <Button render={<span />} size="sm" variant="outline">
              Roll secret
            </Button>
          </div>
        </div>
      </div>
    </Tray>
  );
}

const HEADERS = [
  ["webhook-id", "hmsg_01k7c8m4q2f3e9v6"],
  ["webhook-timestamp", "1793809923"],
  ["webhook-signature", "v1,K5oZfzN95Z9UVu1EsfQ…"],
] as const;

function Signed() {
  return (
    <Tray flush title="POST /hooks">
      <dl className="flex flex-col">
        {HEADERS.map(([name, value]) => (
          <div
            className="grid gap-x-4 gap-y-0.5 border-b px-4 py-2.5 last:border-b-0 sm:grid-cols-[10rem_minmax(0,1fr)]"
            key={name}
          >
            <dt className="font-mono text-muted-foreground text-xs">{name}</dt>
            <dd className="truncate font-mono text-xs">{value}</dd>
          </div>
        ))}
      </dl>
    </Tray>
  );
}

function AutoDisable() {
  return (
    <Tray title="https://old.acme.example/hooks" action={<Badge variant="error">disabled</Badge>}>
      <div className="flex flex-col gap-3">
        <ol className="grid grid-cols-5 gap-1.5">
          {[1, 2, 3, 4, 5].map((day) => (
            <li
              className="flex h-10 items-center justify-center rounded-md bg-destructive/8 text-destructive-foreground text-xs dark:bg-destructive/16"
              key={day}
            >
              Day {day}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <code className="font-mono text-xs">disabled_reason: "failing"</code>
          <code className="font-mono text-muted-foreground text-xs">hook_endpoint.disabled</code>
        </div>
      </div>
    </Tray>
  );
}

export const hooks: ProductShowcase = {
  lede: "Send an event once, and coss.com signs, delivers and retries it to every endpoint your customers registered.",
  call: "coss.hooks.messages.send()",
  stage: (
    <Replay
      events={[
        { name: "billing.acme.example", tone: "success", at: "09:41:02.301", detail: "200" },
        {
          name: "ledger.acme.example",
          tone: "warning",
          at: "09:41:02.418",
          detail: "503. Attempt 1 of 8, next in 5 seconds.",
        },
        { name: "crm.acme.example", tone: "success", at: "09:41:02.526", detail: "200" },
      ]}
    >
      <div className="flex items-start justify-between gap-3 pb-1">
        <div className="min-w-0">
          <p className="truncate font-mono text-[0.9375rem]">invoice.paid</p>
          <p className="truncate text-muted-foreground text-sm">Acme Corp, sent to 3 endpoints</p>
        </div>
        <Badge variant="outline">customer_8812</Badge>
      </div>
    </Replay>
  ),
  highlights: [
    {
      title: "Retries, then recovery",
      body: "A failed delivery gets 8 attempts over about a day. After an outage, a recovery requeues whatever failed since a time you choose.",
      href: "/docs/hooks/delivery",
      demo: <Retries />,
    },
    {
      title: "A portal your customers run themselves",
      body: "They add endpoints, choose event types, roll secrets and retry deliveries, on a domain of its own.",
      href: "/docs/hooks/portal",
      demo: <Portal />,
    },
    {
      title: "Signed the standard way",
      body: "Standard Webhooks headers, and both secrets during a roll, so receivers keep working.",
      href: "/docs/hooks/receiving",
      demo: <Signed />,
    },
    {
      title: "Failing endpoints switch off",
      body: "After 5 days of failing every attempt, the endpoint is disabled and you're told.",
      href: "/docs/hooks/delivery",
      demo: <AutoDisable />,
    },
  ],
};
