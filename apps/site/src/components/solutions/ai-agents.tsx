import { Badge } from "@coss/ui/components/badge";
import { Replay, StatusDot } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import { DataTable, Line, Mono, StageHead } from "./parts";
import type { SolutionShowcase } from "./types";

function Addresses() {
  return (
    <Tray flush title="Inboxes" meta="3 agents">
      <DataTable
        head={["Address", "Client id", "Threads"]}
        rows={[
          [
            <Mono key="a">support-agent@acme.com</Mono>,
            <Mono key="b" muted>
              agent-42
            </Mono>,
            "128",
          ],
          [
            <Mono key="a">billing-agent@acme.com</Mono>,
            <Mono key="b" muted>
              agent-43
            </Mono>,
            "61",
          ],
          [
            <Mono key="a">intake-agent@acme.com</Mono>,
            <Mono key="b" muted>
              agent-44
            </Mono>,
            "14",
          ],
        ]}
      />
    </Tray>
  );
}

function Thread() {
  return (
    <Tray title="Re: Invoice 1042" meta="extracted_text">
      <div className="flex flex-col gap-3 text-sm leading-snug">
        <p>Can you resend the invoice with our new billing address?</p>
        <div className="flex flex-col gap-1 border-s-2 ps-3 text-muted-foreground/72 line-through decoration-muted-foreground/40">
          <p>On Tuesday, Support Agent wrote:</p>
          <p>Your invoice is attached. Thanks!</p>
        </div>
        <p className="text-muted-foreground">The sender&apos;s own words, ready for a prompt.</p>
      </div>
    </Tray>
  );
}

function Scores() {
  return (
    <Tray title="coss.risk.classify()" action={<Badge variant="warning">Hold for a person</Badge>}>
      <div className="flex flex-col font-mono">
        <Line label="spam">0.04</Line>
        <Line label="phishing">0.91</Line>
        <Line label="malware">0.01</Line>
        <Line label="fraud">0.33</Line>
      </div>
    </Tray>
  );
}

function Setup() {
  return (
    <Tray title="Your coding agent">
      <ol className="flex flex-col gap-2.5 font-mono text-[0.8125rem]">
        <li>npx coss-cli init --agents</li>
        <li className="text-muted-foreground">
          <StatusDot tone="success">Development key approved in the browser</StatusDot>
        </li>
        <li>coss listen</li>
        <li className="text-muted-foreground">
          <StatusDot tone="info">Forwarding events to the local handler</StatusDot>
        </li>
      </ol>
    </Tray>
  );
}

export const aiAgents: SolutionShowcase = {
  lede: "Give each agent its own address, read mail as clean threads, check it, and reply in the thread.",
  call: "coss.inboxes.messages.reply()",
  stage: (
    <Replay
      events={[
        { name: "inbox.message.received", tone: "info", at: "09:41:02" },
        { name: "coss.risk.classify()", tone: "neutral", at: "09:41:03" },
        { name: "coss.inboxes.messages.reply()", tone: "neutral", at: "09:41:09" },
        { name: "email.delivered", tone: "success", at: "09:41:12" },
      ]}
    >
      <StageHead
        detail="from ada@example.com"
        state={<Badge variant="success">replied</Badge>}
        title="support-agent@acme.com"
      />
    </Replay>
  ),
  steps: [
    {
      title: "An address per agent",
      body: "One call creates the inbox, and mail to username+anything@ reaches the same one, so an agent can hand out an address per task.",
      href: "/products/inboxes",
      demo: <Addresses />,
    },
    {
      title: "Threads ready for a prompt",
      body: "Messages are grouped into threads, and extracted_text holds only what the sender wrote.",
      href: "/products/inboxes",
      demo: <Thread />,
    },
    {
      title: "Check mail before acting",
      body: "Email is untrusted input. Score it for spam, phishing, malware and fraud, and your code picks the thresholds.",
      href: "/products/risk",
      demo: <Scores />,
    },
    {
      title: "Set up by your coding agent",
      body: "One prompt gets a development key, which works with every API and delivers nothing.",
      href: "/products/agents",
      demo: <Setup />,
    },
  ],
};
