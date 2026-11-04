import { Badge } from "@coss/ui/components/badge";
import { Replay, StatusDot } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import { DataTable, Line, Mono, StageHead } from "./parts";
import type { SolutionShowcase } from "./types";

function Log() {
  return (
    <Tray flush title="Logs" meta="One environment">
      <DataTable
        head={["Source", "Line", "Time"]}
        rows={[
          [
            "API",
            <Mono key="l">POST /v1/emails 202</Mono>,
            <Mono key="t" muted>
              09:41:02
            </Mono>,
          ],
          [
            "Email",
            <Mono key="l">email.delivered</Mono>,
            <Mono key="t" muted>
              09:41:04
            </Mono>,
          ],
          [
            "API",
            <Mono key="l">POST /v1/sms 202</Mono>,
            <Mono key="t" muted>
              09:41:05
            </Mono>,
          ],
          [
            "SMS",
            <Mono key="l">sms.delivered</Mono>,
            <Mono key="t" muted>
              09:41:09
            </Mono>,
          ],
          [
            "Webhook",
            <Mono key="l">attempt 1, 200</Mono>,
            <Mono key="t" muted>
              09:41:10
            </Mono>,
          ],
        ]}
      />
    </Tray>
  );
}

function Webhooks() {
  return (
    <Tray title="https://acme.com/webhooks" action={<Badge variant="success">Healthy</Badge>}>
      <div className="flex flex-col font-mono">
        <Line label="email.delivered">
          <StatusDot tone="success">200</StatusDot>
        </Line>
        <Line label="sms.delivered">
          <StatusDot tone="success">200</StatusDot>
        </Line>
        <Line label="email.bounced">
          <StatusDot tone="warning">503, retrying</StatusDot>
        </Line>
      </div>
    </Tray>
  );
}

function Template() {
  return (
    <Tray title="order-shipped" action={<Badge variant="success">v3 published</Badge>}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-1.5">
          <Badge>en</Badge>
          <Badge variant="outline">de</Badge>
        </div>
        <p className="font-medium">
          <span className="font-mono text-[0.8125rem]">{"{{first_name}}"}</span>, your order shipped
        </p>
      </div>
    </Tray>
  );
}

function Suppressions() {
  return (
    <Tray flush title="Suppressions">
      <DataTable
        head={["Recipient", "Channel", "Reason"]}
        rows={[
          ["linus@example.org", "Email", <Mono key="r">bounce</Mono>],
          ["alan@example.net", "Email", <Mono key="r">unsubscribe</Mono>],
          ["+1 415 555 0199", "SMS", <Mono key="r">opt_out</Mono>],
        ]}
      />
    </Tray>
  );
}

export const notifications: SolutionShowcase = {
  lede: "Email and SMS from one client, with one webhook endpoint and one log for both.",
  call: "coss.email.send() + coss.sms.send()",
  stage: (
    <Replay
      events={[
        { name: "email.sent", tone: "info", at: "09:41:02" },
        { name: "email.delivered", tone: "success", at: "09:41:04" },
        { name: "sms.sent", tone: "info", at: "09:41:05" },
        { name: "sms.delivered", tone: "success", at: "09:41:09" },
      ]}
    >
      <StageHead
        detail="ada@example.com, +1 415 555 0199"
        state={<Badge variant="success">delivered</Badge>}
        title="Order 1042 shipped"
      />
    </Replay>
  ),
  steps: [
    {
      title: "One log across products",
      body: "Every request, email and SMS event and webhook attempt is searchable in one place, and streams to your own tools.",
      href: "/docs/logs",
      demo: <Log />,
    },
    {
      title: "One webhook endpoint",
      body: "Delivery events for both channels arrive signed, retried 7 times over about 28 hours.",
      href: "/docs/webhooks",
      demo: <Webhooks />,
    },
    {
      title: "Templates and scheduled sends",
      body: "Keep content versioned and localized in coss.com, and send up to 30 days ahead.",
      href: "/docs/email/templates",
      demo: <Template />,
    },
    {
      title: "Opt-outs honored",
      body: "Bounces, complaints and unsubscribes suppress later sends, and an SMS reply of STOP holds in every live environment.",
      href: "/docs/email/suppressions",
      demo: <Suppressions />,
    },
  ],
};
