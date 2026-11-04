import { Badge } from "@coss/ui/components/badge";
import { Replay, StatusDot } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import { DataTable, Line, Mono, StageHead } from "./parts";
import type { SolutionShowcase } from "./types";

function Decisions() {
  return (
    <Tray flush title="coss.risk.assess()" meta="event: signup">
      <DataTable
        head={["Email", "Reasons", "Decision"]}
        rows={[
          [
            "ada@example.com",
            <Mono key="r" muted>
              none
            </Mono>,
            <Badge key="d" variant="success">
              allow
            </Badge>,
          ],
          [
            "team@example.org",
            <Mono key="r" muted>
              email.role_account
            </Mono>,
            <Badge key="d" variant="warning">
              review
            </Badge>,
          ],
          [
            "x7@example.net",
            <Mono key="r" muted>
              email.disposable, ip.tor
            </Mono>,
            <Badge key="d" variant="error">
              block
            </Badge>,
          ],
        ]}
      />
    </Tray>
  );
}

function Code() {
  return (
    <Tray title="coss.verify.check()" action={<Badge variant="success">approved</Badge>}>
      <div className="flex flex-col gap-4">
        <div aria-label="Code 482913" className="flex justify-center gap-1.5" role="img">
          {["4", "8", "2", "9", "1", "3"].map((digit, index) => (
            <span
              className="flex size-10 items-center justify-center rounded-lg border bg-muted/48 font-mono text-lg tabular-nums"
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed code
              key={index}
            >
              {digit}
            </span>
          ))}
        </div>
        <div className="flex flex-col">
          <Line label="Code lifetime">10 minutes by default</Line>
          <Line label="Wrong code that fails it">the fifth</Line>
        </div>
      </div>
    </Tray>
  );
}

function Limits() {
  return (
    <Tray flush title="coss.risk.limit()" meta="bucket: login">
      <DataTable
        head={["Attempt", "Key", "Allowed"]}
        rows={[
          [
            "1",
            <Mono key="k" muted>
              ada@example.com
            </Mono>,
            <StatusDot key="a" tone="success">
              true
            </StatusDot>,
          ],
          [
            "2",
            <Mono key="k" muted>
              ada@example.com
            </Mono>,
            <StatusDot key="a" tone="success">
              true
            </StatusDot>,
          ],
          [
            "3",
            <Mono key="k" muted>
              ada@example.com
            </Mono>,
            <StatusDot key="a" tone="error">
              false
            </StatusDot>,
          ],
        ]}
      />
    </Tray>
  );
}

function AccountEmails() {
  return (
    <Tray title="coss/better-auth" meta='category: "account"'>
      <div className="flex flex-col">
        <Line label="Verify your email">
          <StatusDot tone="success">delivered</StatusDot>
        </Line>
        <Line label="Reset your password">
          <StatusDot tone="success">delivered</StatusDot>
        </Line>
        <Line label="Your sign-in link">
          <StatusDot tone="success">delivered</StatusDot>
        </Line>
        <Line label="You're invited">
          <StatusDot tone="info">sent</StatusDot>
        </Line>
      </div>
    </Tray>
  );
}

export const authentication: SolutionShowcase = {
  lede: "Stop abuse at sign-up, prove a phone or mailbox, and limit login attempts on one key.",
  call: "coss.risk.assess() + coss.verify.start()",
  stage: (
    <Replay
      events={[
        { name: "coss.risk.assess()", tone: "success", at: "09:41:02", detail: "decision: allow" },
        { name: "coss.verify.start()", tone: "info", at: "09:41:02", detail: "status: pending" },
        { name: "verification.approved", tone: "success", at: "09:41:27" },
      ]}
    >
      <StageHead
        detail="+1 415 555 0123"
        state={<Badge variant="success">approved</Badge>}
        title="ada@example.com"
      />
    </Replay>
  ),
  steps: [
    {
      title: "Decide at the door",
      body: "An assessment combines email, IP, device and content signals into allow, review or block, with its reasons.",
      href: "/products/risk",
      demo: <Decisions />,
    },
    {
      title: "Codes you never handle",
      body: "coss.com keeps only a keyed hash, and a fraud guard runs before anything is sent or billed.",
      href: "/products/verify",
      demo: <Code />,
    },
    {
      title: "Limits for your endpoints",
      body: "Protect login, sign-up and password reset with the limiter coss.com runs on itself.",
      href: "/products/rate-limiting",
      demo: <Limits />,
    },
    {
      title: "Account emails, drop-in",
      body: "The Better Auth integration covers verification, resets, magic links and invitations, with tracking off.",
      href: "/docs/integrations",
      demo: <AccountEmails />,
    },
  ],
};
