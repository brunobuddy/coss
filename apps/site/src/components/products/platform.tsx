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
import { Replay, StatusDot, type Tone } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import type { ProductShowcase } from "./types";

const KEYS = [
  ["Backend", "coss_live_…", "production", "full"],
  ["Mailer", "coss_live_…", "production", "sending"],
  ["Analytics", "coss_live_…", "production", "read-only"],
  ["Local dev", "coss_test_…", "development", "full"],
] as const;

function Keys() {
  return (
    <Tray flush title="API keys">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="ps-4">Key</TableHead>
            <TableHead>Environment</TableHead>
            <TableHead className="pe-4 text-right">Access</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {KEYS.map(([name, prefix, environment, access]) => (
            <TableRow key={name}>
              <TableCell className="ps-4">
                <span className="flex flex-col">
                  <span>{name}</span>
                  <span className="font-mono text-muted-foreground text-xs">{prefix}</span>
                </span>
              </TableCell>
              <TableCell>
                <StatusDot tone={environment === "production" ? "success" : "neutral"}>
                  {environment}
                </StatusDot>
              </TableCell>
              <TableCell className="pe-4 text-right">
                <Badge variant="outline">{access}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Tray>
  );
}

const ATTEMPTS: readonly { after: string; tone: Tone; result: string }[] = [
  { after: "first try", tone: "error", result: "500" },
  { after: "+ 5 s", tone: "error", result: "500" },
  { after: "+ 5 min", tone: "error", result: "timed out" },
  { after: "+ 30 min", tone: "success", result: "200" },
];

function Webhook() {
  return (
    <Tray title="email.delivered">
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 font-mono text-xs">
          <dt className="text-muted-foreground">webhook-id</dt>
          <dd className="truncate">evt_01k7c8m4q2f3e9</dd>
          <dt className="text-muted-foreground">webhook-timestamp</dt>
          <dd className="truncate">1793809923</dd>
          <dt className="text-muted-foreground">webhook-signature</dt>
          <dd className="truncate">v1,K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN/H/pI4=</dd>
        </dl>
        <ol className="flex flex-col border-t">
          {ATTEMPTS.map((attempt) => (
            <li
              className="flex items-center justify-between gap-4 border-b py-2 text-sm last:border-b-0"
              key={attempt.after}
            >
              <span className="text-muted-foreground">{attempt.after}</span>
              <StatusDot className="font-mono text-[0.8125rem]" tone={attempt.tone}>
                {attempt.result}
              </StatusDot>
            </li>
          ))}
        </ol>
      </div>
    </Tray>
  );
}

const LOG_LINES = [
  ["09:41:12", "api", "POST /v1/sms", "503"],
  ["09:40:58", "webhook", "email.bounced", "500"],
  ["09:40:21", "api", "GET /v1/emails", "502"],
] as const;

function LogSearch() {
  return (
    <Tray title="Logs">
      <div className="flex flex-col gap-3">
        <Input aria-label="Log search" className="font-mono" defaultValue="status:5xx" readOnly />
        <ul className="flex flex-col font-mono text-xs">
          {LOG_LINES.map(([at, source, what, status]) => (
            <li
              className="grid grid-cols-[auto_4rem_minmax(0,1fr)_auto] items-center gap-3 border-b py-2 last:border-b-0"
              key={at}
            >
              <time className="text-muted-foreground tabular-nums">{at}</time>
              <span className="text-muted-foreground">{source}</span>
              <span className="truncate">{what}</span>
              <StatusDot tone="error">{status}</StatusDot>
            </li>
          ))}
        </ul>
      </div>
    </Tray>
  );
}

const BUDGETS = [
  ["Project: storefront", 46, "success", "sending"],
  ["Key: Mailer", 82, "warning", "alerted at 80%"],
  ["Member: ada@acme.com", 100, "error", "paused"],
] as const;

function Budgets() {
  return (
    <Tray title="Budgets">
      <ul className="flex flex-col gap-4">
        {BUDGETS.map(([label, percent, tone, state]) => (
          <li className="flex flex-col gap-1.5" key={label}>
            <span className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate">{label}</span>
              <StatusDot className="text-muted-foreground" tone={tone}>
                {state}
              </StatusDot>
            </span>
            <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
              <span
                className={cn(
                  "block h-full rounded-full",
                  tone === "success" && "bg-success",
                  tone === "warning" && "bg-warning",
                  tone === "error" && "bg-destructive",
                )}
                style={{ width: `${percent}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
    </Tray>
  );
}

export const platform: ProductShowcase = {
  close: "Build on one platform today.",
  lede: "Every product shares the same environments, keys, webhooks, logs and invoice, so you only learn them once.",
  call: "coss.logs.list()",
  stage: (
    <Replay
      events={[
        { name: "POST /v1/emails 202", tone: "neutral", at: "09:41:02" },
        { name: "email.delivered", tone: "success", at: "09:41:04" },
        { name: "POST /v1/sms 202", tone: "neutral", at: "09:41:06" },
        { name: "sms.delivered", tone: "success", at: "09:41:09" },
        { name: "webhook 200", tone: "success", at: "09:41:09" },
      ]}
    >
      <div className="flex items-start justify-between gap-3 pb-1">
        <div className="min-w-0">
          <p className="truncate font-medium">production</p>
          <p className="truncate text-muted-foreground text-sm">One log, every product</p>
        </div>
        <Badge variant="success">live</Badge>
      </div>
    </Replay>
  ),
  highlights: [
    {
      title: "Test against the real API",
      body: "Sandbox keys deliver nothing and simulate every event. Live keys can be scoped to full, sending, read-only or custom access.",
      href: "/docs/environments",
      demo: <Keys />,
    },
    {
      title: "Webhooks you can rely on",
      body: "Signed with Standard Webhooks and retried 7 times over about 28 hours, for every product.",
      href: "/docs/webhooks",
      demo: <Webhook />,
    },
    {
      title: "One searchable log",
      body: "Every request, event and webhook attempt, with filters like status:5xx. Stream it to your own stack with a log drain.",
      href: "/docs/logs",
      demo: <LogSearch />,
    },
    {
      title: "Spend you can cap",
      body: "One invoice for every product, with budgets per member, project or key, and alerts before you hit them.",
      href: "/docs/spend",
      demo: <Budgets />,
    },
  ],
};
