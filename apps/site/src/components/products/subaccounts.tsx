import { Badge } from "@coss/ui/components/badge";
import { Meter, MeterIndicator, MeterTrack } from "@coss/ui/components/meter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { Replay, StatusDot, type Tone } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import type { ProductShowcase } from "./types";

const ACCOUNTS: readonly {
  name: string;
  uid: string;
  domain: string;
  tone: Tone;
  reputation: string;
}[] = [
  {
    name: "Acme Bakery",
    uid: "user_8812",
    domain: "acmebakery.com",
    tone: "success",
    reputation: "good",
  },
  {
    name: "Northwind Tea",
    uid: "user_8813",
    domain: "northwind.example",
    tone: "success",
    reputation: "good",
  },
  {
    name: "Bright Cycles",
    uid: "user_8820",
    domain: "brightcycles.example",
    tone: "warning",
    reputation: "warning",
  },
  {
    name: "Sprintly Deals",
    uid: "user_8827",
    domain: "shared",
    tone: "error",
    reputation: "paused",
  },
];

function Accounts() {
  return (
    <Tray flush title="Sub-accounts">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="ps-4">Name</TableHead>
            <TableHead className="max-sm:hidden">Domain</TableHead>
            <TableHead className="pe-4 text-right">Reputation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ACCOUNTS.map((account) => (
            <TableRow key={account.uid}>
              <TableCell className="ps-4">
                <span className="block">{account.name}</span>
                <span className="block font-mono text-muted-foreground text-xs">{account.uid}</span>
              </TableCell>
              <TableCell className="font-mono text-xs max-sm:hidden">{account.domain}</TableCell>
              <TableCell className="pe-4 text-right">
                <StatusDot className="justify-end" tone={account.tone}>
                  {account.reputation}
                </StatusDot>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Tray>
  );
}

function Quotas() {
  return (
    <Tray title="Quotas">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span>Acme Bakery</span>
            <span className="font-mono text-muted-foreground text-xs tabular-nums">
              2,140 / 5,000 a day
            </span>
          </div>
          <Meter aria-label="Acme Bakery's daily quota" max={5000} value={2140}>
            <MeterTrack>
              <MeterIndicator />
            </MeterTrack>
          </Meter>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span>Northwind Tea</span>
            <span className="font-mono text-muted-foreground text-xs tabular-nums">
              1,000 / 1,000 a day
            </span>
          </div>
          <Meter aria-label="Northwind Tea's daily quota" max={1000} value={1000}>
            <MeterTrack>
              <MeterIndicator className="bg-destructive" />
            </MeterTrack>
          </Meter>
          <span className="font-mono text-destructive-foreground text-xs">429 quota_exceeded</span>
        </div>
      </div>
    </Tray>
  );
}

const DAYS = [
  ["Oct 12", 118, 115, 2],
  ["Oct 13", 164, 160, 3],
  ["Oct 14", 142, 140, 1],
  ["Oct 15", 201, 197, 3],
  ["Oct 16", 96, 95, 1],
  ["Oct 17", 182, 176, 5],
] as const;

function Stats() {
  const peak = Math.max(...DAYS.map(([, sent]) => sent));
  return (
    <Tray title="coss.email.subaccounts.stats()">
      <div className="flex flex-col gap-3">
        <ul className="flex h-28 items-end gap-2">
          {DAYS.map(([day, , delivered, bounced]) => (
            <li
              aria-label={`${day}: ${delivered} delivered, ${bounced} bounced`}
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
              key={day}
            >
              <span
                className="w-full rounded-t-sm bg-destructive"
                style={{ height: `${(bounced / peak) * 100}%` }}
              />
              <span
                className="w-full rounded-b-sm bg-success/64"
                style={{ height: `${(delivered / peak) * 100}%` }}
              />
            </li>
          ))}
        </ul>
        <div className="flex gap-4 text-muted-foreground text-xs">
          <StatusDot tone="success">delivered</StatusDot>
          <StatusDot tone="error">bounced</StatusDot>
        </div>
      </div>
    </Tray>
  );
}

function Domains() {
  return (
    <Tray flush title="Who sends from what">
      <ul className="flex flex-col">
        <li className="flex flex-col gap-1 border-b p-4">
          <span className="flex items-center justify-between gap-3">
            <code className="truncate font-mono text-[0.8125rem]">acmebakery.com</code>
            <Badge variant="outline">Own SES tenant</Badge>
          </span>
          <span className="text-muted-foreground text-sm">Only Acme Bakery can send from it</span>
        </li>
        <li className="flex flex-col gap-1 p-4">
          <span className="flex items-center justify-between gap-3">
            <code className="truncate font-mono text-[0.8125rem]">mail.yourplatform.com</code>
            <Badge variant="outline">Shared</Badge>
          </span>
          <span className="truncate font-mono text-muted-foreground text-xs">
            shared_with_subaccounts: true
          </span>
        </li>
      </ul>
    </Tray>
  );
}

export const subaccounts: ProductShowcase = {
  lede: "Give each of your users their own domains, quotas and reputation, on your one API key.",
  call: "coss.email.send({ subaccount })",
  stage: (
    <Replay
      events={[
        { name: "queued", tone: "neutral", at: "14:20:07.301" },
        { name: "email.sent", tone: "info", at: "14:20:07.988" },
        { name: "email.delivered", tone: "success", at: "14:20:09.142" },
      ]}
    >
      <div className="flex items-start justify-between gap-3 pb-1">
        <div className="min-w-0">
          <p className="truncate font-medium">Acme Bakery</p>
          <p className="truncate font-mono text-muted-foreground text-xs">user_8812</p>
        </div>
        <Badge variant="success">active</Badge>
      </div>
    </Replay>
  ),
  highlights: [
    {
      title: "One user's bounces stop only that user",
      body: "Rates are measured per live sub-account, and past your thresholds only that sub-account is paused.",
      href: "/docs/email/subaccounts",
      demo: <Accounts />,
    },
    {
      title: "Quotas per sub-account",
      body: "A send over its quota is refused, and your other users go on sending.",
      href: "/docs/email/subaccounts",
      demo: <Quotas />,
    },
    {
      title: "Stats per sub-account",
      body: "Its recipients per day: sent, delivered, bounced, complained, failed and suppressed.",
      href: "/docs/email/subaccounts",
      demo: <Stats />,
    },
    {
      title: "Their domain, or one of yours",
      body: "Users without a domain send from one you share with them, through your organization's reputation.",
      href: "/docs/email/subaccounts#domains",
      demo: <Domains />,
    },
  ],
};
