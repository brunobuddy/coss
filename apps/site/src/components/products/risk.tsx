import { Badge } from "@coss/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@coss/ui/components/tabs";
import { cn } from "@coss/ui/lib/utils";
import { StatusDot } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import type { ProductShowcase } from "./types";

type Decision = "allow" | "review" | "block";

/** Scores are the real formula over the reasons' default weights: 1 − Π(1 − weight). */
const ASSESSMENTS: Record<
  Decision,
  { email: string; score: number; reasons: readonly (readonly [string, number])[] }
> = {
  allow: {
    email: "info@acme.com",
    score: 0.15,
    reasons: [["email.role_account", 0.15]],
  },
  review: {
    email: "a.d.a+2@gmail.com",
    score: 0.65,
    reasons: [
      ["duplicate.canonical_mailbox", 0.5],
      ["ip.vpn_network", 0.3],
    ],
  },
  block: {
    email: "x7@disposable.test",
    score: 0.93,
    reasons: [
      ["email.disposable", 0.7],
      ["device.automation", 0.7],
      ["ip.hosting_provider", 0.25],
    ],
  },
};

const BADGE = { allow: "success", review: "warning", block: "error" } as const;
const FILL = { allow: "bg-success", review: "bg-warning", block: "bg-destructive" } as const;

function Assessment({ decision }: { decision: Decision }) {
  const { email, score, reasons } = ASSESSMENTS[decision];
  return (
    <div className="flex flex-col gap-3 pt-3">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm">{email}</span>
        <span className="enter-pop" style={{ animationDelay: "420ms" }}>
          <Badge variant={BADGE[decision]}>{decision}</Badge>
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="relative h-2 rounded-full bg-muted">
          <div
            className={cn("enter-fill h-full origin-left rounded-full", FILL[decision])}
            style={{ width: `${score * 100}%` }}
          />
          {[50, 85].map((mark) => (
            <span
              aria-hidden
              className="absolute -top-0.5 h-3 w-px bg-foreground/48"
              key={mark}
              style={{ left: `${mark}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between font-mono text-muted-foreground text-xs tabular-nums">
          <span>score {score.toFixed(2)}</span>
          <span>review 0.50, block 0.85</span>
        </div>
      </div>
      <ul className="flex flex-col">
        {reasons.map(([code, weight], index) => (
          <li
            className="enter-rise flex items-baseline justify-between gap-4 border-b py-2 last:border-b-0"
            key={code}
            style={{ animationDelay: `${520 + index * 200}ms` }}
          >
            <code className="truncate font-mono text-[0.8125rem]">{code}</code>
            <span className="font-mono text-muted-foreground text-xs tabular-nums">
              {weight.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ORDER = [
  {
    step: "Allow list, then block list",
    detail: "A match decides at once",
    codes: ["list.allowed", "list.blocked"],
  },
  {
    step: "Your rules",
    detail: "The first enabled rule that matches decides",
    codes: ["rule.matched"],
  },
  {
    step: "The score",
    detail: "Every reason that fired adds its weight",
    codes: ["1 − Π(1 − weight)"],
  },
] as const;

function DecisionOrder() {
  return (
    <Tray flush title="How a decision is made">
      <ol className="flex flex-col">
        {ORDER.map((item, index) => (
          <li className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0" key={item.step}>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-muted-foreground text-xs">
              {index + 1}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="flex flex-col">
                <span className="text-sm">{item.step}</span>
                <span className="text-muted-foreground text-xs">{item.detail}</span>
              </span>
              <span className="flex flex-wrap gap-1.5">
                {item.codes.map((code) => (
                  <Badge className="font-mono" key={code} variant="outline">
                    {code}
                  </Badge>
                ))}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </Tray>
  );
}

const SIGNALS = [
  ["Email", "email.disposable", "disposable.test"],
  ["Network", "ip.hosting_provider", "a cloud provider"],
  ["Velocity", "velocity.signups_per_ip_1h", "this IP, last hour"],
  ["Mailbox", "duplicate.canonical_mailbox", "dots and +tags folded"],
  ["Browser", "device.automation", "automation markers"],
  ["Content", "content.spam", "at your threshold"],
] as const;

function Signals() {
  return (
    <Tray flush title="Collected in parallel">
      <ul className="grid sm:grid-cols-2">
        {SIGNALS.map(([family, code, detail]) => (
          <li
            className="flex flex-col gap-0.5 border-b px-4 py-3 max-sm:last:border-b-0 sm:odd:border-e sm:[&:nth-last-child(-n+2)]:border-b-0"
            key={code}
          >
            <span className="text-muted-foreground text-xs">{family}</span>
            <code className="truncate font-mono text-[0.8125rem]">{code}</code>
            <span className="truncate text-muted-foreground text-xs">{detail}</span>
          </li>
        ))}
      </ul>
    </Tray>
  );
}

const QUEUE = [
  ["a.d.a+2@gmail.com", "0.65", "open"],
  ["sam@new-domain.example", "0.58", "open"],
  ["grace@example.com", "0.52", "resolved"],
] as const;

function Queue() {
  return (
    <Tray flush meta="risk.assessment.review" title="Review queue">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="ps-4">Email</TableHead>
            <TableHead>Score</TableHead>
            <TableHead className="pe-4 text-right">Review</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {QUEUE.map(([email, score, status]) => (
            <TableRow key={email}>
              <TableCell className="max-w-44 truncate ps-4">{email}</TableCell>
              <TableCell className="font-mono text-xs tabular-nums">{score}</TableCell>
              <TableCell className="pe-4 text-right">
                <StatusDot className="justify-end" tone={status === "open" ? "warning" : "success"}>
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

function EmailCheck() {
  return (
    <Tray flush title="coss.risk.checkEmail()">
      <pre className="overflow-x-auto p-4 font-mono text-[0.8125rem] leading-relaxed">
        <code>{`{
  email: "ada@gmail.con",
  valid: true,
  disposable: false,
  deliverability: "undeliverable",
  suggestion: "gmail.com",
}`}</code>
      </pre>
    </Tray>
  );
}

export const risk: ProductShowcase = {
  lede: "Score sign-ups, logins, checkouts and messages, and get allow, review or block with the reasons why.",
  call: "coss.risk.assess()",
  stage: (
    <Tabs defaultValue="block">
      <TabsList>
        <TabsTab value="allow">Allow</TabsTab>
        <TabsTab value="review">Review</TabsTab>
        <TabsTab value="block">Block</TabsTab>
      </TabsList>
      {(["allow", "review", "block"] as const).map((decision) => (
        <TabsPanel key={decision} value={decision}>
          <Assessment decision={decision} />
        </TabsPanel>
      ))}
    </Tabs>
  ),
  highlights: [
    {
      title: "Decisions you can explain",
      body: "A fixed order means a case you decided yourself is never overruled by the score.",
      href: "/docs/risk/rules",
      demo: <DecisionOrder />,
    },
    {
      title: "Signals you'd otherwise build",
      body: "One call collects them all, and each fails open on its own time budget.",
      href: "/docs/risk/reasons",
      demo: <Signals />,
    },
    {
      title: "A queue for the unclear cases",
      body: "Reviews wait in the dashboard and reach your webhooks, and your verdict teaches the next assessment.",
      href: "/docs/risk/lists-and-feedback",
      demo: <Queue />,
    },
    {
      title: "Each signal on its own",
      body: "Check an email, IP or phone number, or classify text, without an assessment and without storing anything.",
      href: "/docs/risk/lookups",
      demo: <EmailCheck />,
    },
  ],
};
