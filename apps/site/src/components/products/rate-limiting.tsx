import { Badge } from "@coss/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { cn } from "@coss/ui/lib/utils";
import { Tray } from "@/components/marketing/kit";
import { BucketDemo } from "./rate-limiting-bucket";
import type { ProductShowcase } from "./types";

/** One row of tokens, each cell a request let through. */
function Tokens({ count, faded }: { count: number; faded?: boolean }) {
  return (
    <span className="flex flex-wrap gap-[3px]">
      {Array.from({ length: count }, (_, index) => (
        <span
          className={cn("size-2 rounded-[2px]", faded ? "bg-foreground/32" : "bg-foreground/80")}
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed cells
          key={index}
        />
      ))}
    </span>
  );
}

function Burst() {
  const rows = [
    ["At once", 30, false],
    ["Minute 1", 10, true],
    ["Minute 2", 10, true],
    ["Minute 3", 10, true],
  ] as const;
  return (
    <Tray title="search" meta="limit: 10, period_seconds: 60, burst: 30">
      <ul className="flex flex-col gap-3">
        {rows.map(([label, count, faded]) => (
          <li className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3" key={label}>
            <span className="text-muted-foreground text-sm">{label}</span>
            <Tokens count={count} faded={faded} />
            <span className="font-mono text-muted-foreground text-xs tabular-nums">{count}</span>
          </li>
        ))}
      </ul>
    </Tray>
  );
}

const KEYS = [
  ["User", "user_8fK2a", "9f2c…a17e"],
  ["Email", "ada@example.com", "41be…07d3"],
  ["IP address", "203.0.113.7", "c60a…e92b"],
] as const;

function Keys() {
  return (
    <Tray flush title="Keys">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="ps-4">Limit by</TableHead>
            <TableHead>You send</TableHead>
            <TableHead className="pe-4 text-right">coss.com stores</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {KEYS.map(([kind, key, hash]) => (
            <TableRow key={kind}>
              <TableCell className="ps-4 text-muted-foreground">{kind}</TableCell>
              <TableCell className="font-mono text-xs">{key}</TableCell>
              <TableCell className="pe-4 text-right font-mono text-muted-foreground text-xs">
                {hash}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Tray>
  );
}

const COSTS = [
  ["search", 1, 99, true],
  ["export", 20, 79, true],
  ["full_backup", 100, 79, false],
] as const;

function Costs() {
  return (
    <Tray flush title="api" meta="burst: 100">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="ps-4">Request</TableHead>
            <TableHead className="text-right">cost</TableHead>
            <TableHead className="text-right">remaining</TableHead>
            <TableHead className="pe-4 text-right">allowed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {COSTS.map(([request, cost, remaining, allowed]) => (
            <TableRow key={request}>
              <TableCell className="ps-4 font-mono text-xs">{request}</TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">{cost}</TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {remaining}
              </TableCell>
              <TableCell className="pe-4 text-right">
                <Badge variant={allowed ? "success" : "error"}>{String(allowed)}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Tray>
  );
}

function Failure() {
  return (
    <Tray flush title="While coss.com can't count">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="ps-4">on_failure</TableHead>
            <TableHead>allowed</TableHead>
            <TableHead className="pe-4 text-right">degraded</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="ps-4 font-mono text-xs">allow</TableCell>
            <TableCell>
              <Badge variant="success">true</Badge>
            </TableCell>
            <TableCell className="pe-4 text-right font-mono text-xs">true</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="ps-4 font-mono text-xs">deny</TableCell>
            <TableCell>
              <Badge variant="error">false</Badge>
            </TableCell>
            <TableCell className="pe-4 text-right font-mono text-xs">true</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Tray>
  );
}

export const rateLimiting: ProductShowcase = {
  lede: "Define a bucket once, check any key on every request, and get told when to retry.",
  call: "coss.risk.limit()",
  stage: <BucketDemo />,
  highlights: [
    {
      title: "Bursts, then a steady rate",
      body: "Every key gets burst tokens that refill at the bucket's rate, using GCRA, the same engine that limits coss.com's own API.",
      href: "/docs/risk/rate-limits",
      demo: <Burst />,
    },
    {
      title: "Limit by anything",
      body: "A user, an email address or an IP address, up to 512 characters. coss.com stores only a keyed hash of it.",
      href: "/docs/risk/rate-limits",
      demo: <Keys />,
    },
    {
      title: "Heavier requests cost more",
      body: "Take several tokens at once for an export or a batch. A denied request takes nothing.",
      href: "/docs/risk/rate-limits",
      demo: <Costs />,
    },
    {
      title: "You choose how it fails",
      body: "Keep your product up, or protect what's expensive, per bucket. The answer tells you either way.",
      href: "/docs/risk/rate-limits",
      demo: <Failure />,
    },
  ],
};
