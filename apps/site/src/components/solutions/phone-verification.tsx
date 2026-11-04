import { Badge } from "@coss/ui/components/badge";
import { Replay, StatusDot } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import { DataTable, Line, Mono, StageHead } from "./parts";
import type { SolutionShowcase } from "./types";

function Guard() {
  return (
    <Tray flush title="Verifications">
      <DataTable
        head={["To", "Stopped by", "Status"]}
        rows={[
          [
            "+1 415 555 0123",
            <Mono key="w" muted>
              none
            </Mono>,
            <StatusDot key="s" tone="success">
              approved
            </StatusDot>,
          ],
          [
            "+1 415 555 0142",
            "Burst to one prefix",
            <StatusDot key="s" tone="error">
              blocked
            </StatusDot>,
          ],
          [
            "+1 415 555 0177",
            "Tor exit node",
            <StatusDot key="s" tone="error">
              blocked
            </StatusDot>,
          ],
        ]}
      />
    </Tray>
  );
}

function Stored() {
  return (
    <Tray title="What coss.com keeps">
      <div className="flex flex-col">
        <Line label="The code">
          <Mono muted>keyed hash, until it expires</Mono>
        </Line>
        <Line label="The message text">
          <Mono muted>erased once sent</Mono>
        </Line>
        <Line label="Logs and webhooks">
          <Mono muted>never the code</Mono>
        </Line>
      </div>
    </Tray>
  );
}

function PhoneCheck() {
  return (
    <Tray title="coss.risk.checkPhone()" meta="+14155550123">
      <div className="flex flex-col font-mono">
        <Line label="valid">true</Line>
        <Line label="country">US</Line>
        <Line label="line_type">mobile</Line>
        <Line label="carrier.name">T-Mobile USA, Inc.</Line>
      </div>
    </Tray>
  );
}

function Countries() {
  return (
    <Tray title="Verify settings" meta="Countries">
      <div className="flex flex-col">
        <Line label="United States">
          <StatusDot tone="success">allowed</StatusDot>
        </Line>
        <Line label="Canada">
          <StatusDot tone="success">allowed</StatusDot>
        </Line>
        <Line label="Anywhere else">
          <Mono muted>country_not_allowed</Mono>
        </Line>
      </div>
    </Tray>
  );
}

export const phoneVerification: SolutionShowcase = {
  lede: "Two calls send and check a code. The fraud guard runs first, so SMS pumping never reaches your bill.",
  call: "coss.verify.start()",
  stage: (
    <Replay
      events={[
        { name: "coss.verify.start()", tone: "info", at: "09:41:02", detail: "status: pending" },
        { name: "sms.delivered", tone: "success", at: "09:41:05" },
        { name: "coss.verify.check()", tone: "neutral", at: "09:41:27", detail: "valid: true" },
        { name: "verification.approved", tone: "success", at: "09:41:27" },
      ]}
    >
      <StageHead
        detail="user_42"
        state={<Badge variant="success">approved</Badge>}
        title="+1 415 555 0123"
      />
    </Replay>
  ),
  steps: [
    {
      title: "A fraud guard that runs first",
      body: "Premium-rate numbers, Tor exit nodes and bursts are checked before a code goes out. A blocked one costs nothing.",
      href: "/docs/verify/fraud-guard",
      demo: <Guard />,
    },
    {
      title: "Nothing worth stealing",
      body: "Attempts, expiry and resends are handled for you, and codes never appear in logs or webhooks.",
      href: "/products/verify",
      demo: <Stored />,
    },
    {
      title: "Know the line first",
      body: "See whether a number exists, whether it's mobile, landline or VoIP, and which network it's on.",
      href: "/docs/risk/lookups",
      demo: <PhoneCheck />,
    },
    {
      title: "Countries you choose",
      body: "Codes go only where Verify's settings allow, and someone who replied STOP gets none until they reply START.",
      href: "/products/verify",
      demo: <Countries />,
    },
  ],
};
