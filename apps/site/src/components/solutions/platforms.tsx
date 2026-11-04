import { Badge } from "@coss/ui/components/badge";
import { Meter, MeterIndicator, MeterTrack } from "@coss/ui/components/meter";
import { Replay, StatusDot } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import { DataTable, Line, Mono, StageHead } from "./parts";
import type { SolutionShowcase } from "./types";

function Subaccounts() {
  return (
    <Tray flush title="Sub-accounts" meta="Your customers">
      <DataTable
        head={["Customer", "Domain", "Standing"]}
        rows={[
          [
            "Acme Bakery",
            <Mono key="d" muted>
              acmebakery.com
            </Mono>,
            <StatusDot key="s" tone="success">
              good
            </StatusDot>,
          ],
          [
            "Northwind",
            <Mono key="d" muted>
              northwind.example
            </Mono>,
            <StatusDot key="s" tone="success">
              good
            </StatusDot>,
          ],
          [
            "Fast Offers",
            <Mono key="d" muted>
              fastoffers.example
            </Mono>,
            <StatusDot key="s" tone="error">
              paused
            </StatusDot>,
          ],
        ]}
      />
    </Tray>
  );
}

function Standing() {
  return (
    <Tray title="subaccount.paused" action={<Badge variant="error">Fast Offers only</Badge>}>
      <div className="flex flex-col">
        <Line label="Fast Offers">
          <StatusDot tone="error">paused</StatusDot>
        </Line>
        <Line label="Acme Bakery">
          <StatusDot tone="success">still sending</StatusDot>
        </Line>
        <Line label="Your organization">
          <StatusDot tone="success">still sending</StatusDot>
        </Line>
      </div>
    </Tray>
  );
}

function Portal() {
  return (
    <Tray flush title="Acme Bakery's endpoints" meta="Portal">
      <DataTable
        head={["Event", "Endpoint", "Delivery"]}
        rows={[
          [
            <Mono key="e">order.ready</Mono>,
            <Mono key="u" muted>
              acmebakery.com/hook
            </Mono>,
            <StatusDot key="s" tone="success">
              succeeded
            </StatusDot>,
          ],
          [
            <Mono key="e">order.ready</Mono>,
            <Mono key="u" muted>
              zapier.example/in
            </Mono>,
            <StatusDot key="s" tone="warning">
              pending
            </StatusDot>,
          ],
          [
            <Mono key="e">order.paid</Mono>,
            <Mono key="u" muted>
              acmebakery.com/hook
            </Mono>,
            <StatusDot key="s" tone="success">
              succeeded
            </StatusDot>,
          ],
        ]}
      />
    </Tray>
  );
}

function Budget({ label, value }: { label: string; value: number }) {
  return (
    <Meter aria-label={label} className="flex flex-col gap-1.5" value={value}>
      <span className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono text-muted-foreground text-xs tabular-nums">{value}%</span>
      </span>
      <MeterTrack>
        <MeterIndicator />
      </MeterTrack>
    </Meter>
  );
}

function Budgets() {
  return (
    <Tray title="Budgets" meta="This month">
      <div className="flex flex-col gap-4">
        <Budget label="Project: Storefront" value={42} />
        <Budget label="API key: Partner sync" value={81} />
        <Budget label="Member: Ada" value={12} />
      </div>
    </Tray>
  );
}

export const platforms: SolutionShowcase = {
  lede: "Send email and webhooks for each of your customers, with reputation kept apart and a portal you don't build.",
  call: "coss.email.send({ subaccount })",
  stage: (
    <Replay
      events={[
        { name: "email.sent", tone: "info", at: "09:41:02", detail: "subaccount: user_8812" },
        { name: "email.delivered", tone: "success", at: "09:41:04" },
        {
          name: "coss.hooks.messages.send()",
          tone: "neutral",
          at: "09:41:04",
          detail: "order.ready",
        },
        { name: "delivery succeeded", tone: "success", at: "09:41:05", detail: "2 endpoints" },
      ]}
    >
      <StageHead
        detail="orders@acmebakery.com"
        state={<Badge variant="success">sending</Badge>}
        title="Acme Bakery"
      />
    </Replay>
  ),
  steps: [
    {
      title: "A sub-account per customer",
      body: "Each has its own domains, SES tenant, quotas, suppression list and stats, and takes your own uid on every call.",
      href: "/products/subaccounts",
      demo: <Subaccounts />,
    },
    {
      title: "Reputation kept apart",
      body: "Bounce and complaint rates are measured per sub-account. One that crosses the line pauses alone.",
      href: "/products/subaccounts",
      demo: <Standing />,
    },
    {
      title: "A portal you don't build",
      body: "Customers add endpoints, roll secrets and retry deliveries in a portal with your name and theme.",
      href: "/products/hooks",
      demo: <Portal />,
    },
    {
      title: "Budgets and spend",
      body: "See usage by project, key and member. Monthly budgets refuse live sends from that source once spend goes over.",
      href: "/products/platform",
      demo: <Budgets />,
    },
  ],
};
