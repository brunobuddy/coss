import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import { Replay, StatusDot } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import type { ProductShowcase } from "./types";

const DOCS = [
  ["/llms.txt", "A brief for agents, then every page"],
  ["/llms-full.txt", "Every guide in one file"],
  ["/docs/email/sending.md", "Any page, as Markdown"],
] as const;

function Docs() {
  return (
    <Tray flush title="coss.com, as text">
      <ul className="flex flex-col divide-y">
        {DOCS.map(([path, what]) => (
          <li className="flex flex-col gap-0.5 px-4 py-3" key={path}>
            <span className="font-mono text-[0.8125rem]">{path}</span>
            <span className="text-muted-foreground text-sm">{what}</span>
          </li>
        ))}
      </ul>
    </Tray>
  );
}

function Diagnose() {
  return (
    <Tray title="diagnose_email">
      <div className="flex flex-col gap-3">
        <p className="rounded-lg bg-muted/64 px-3 py-2 text-sm">
          Did the welcome email to jane@example.com get delivered?
        </p>
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[0.8125rem]">verdict</span>
          <Badge variant="error">not_delivered</Badge>
        </div>
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <span className="truncate text-sm">jane@example.com</span>
          <StatusDot className="font-mono text-[0.8125rem]" tone="error">
            bounced
          </StatusDot>
        </div>
        <p className="text-muted-foreground text-sm leading-snug">
          Next steps come back with the verdict, written for the agent to act on.
        </p>
      </div>
    </Tray>
  );
}

function Approve() {
  return (
    <Tray title="Approve a development key">
      <div className="flex flex-col gap-3">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Project</dt>
          <dd className="truncate text-right">acme-web</dd>
          <dt className="text-muted-foreground">Environment</dt>
          <dd className="truncate text-right">development, sandbox only</dd>
          <dt className="text-muted-foreground">Written to</dt>
          <dd className="truncate text-right font-mono text-xs">.env.local</dd>
        </dl>
        <Button className="w-full" render={<span />} size="sm">
          Approve
        </Button>
      </div>
    </Tray>
  );
}

function Results() {
  return (
    <Tray title="{ data, error }">
      <pre className="whitespace-pre-wrap break-words font-mono text-[0.8125rem] leading-relaxed">
        {`{
  "data": null,
  "error": {
    "type": "invalid_request_error",
    "code": "domain_not_verified",
    "hint": "A live key can only send from a verified domain. A sandbox key accepts any from address. https://coss.com/docs/email/domains.md"
  }
}`}
      </pre>
    </Tray>
  );
}

export const agents: ProductShowcase = {
  close: "Hand it to your coding agent today.",
  lede: "Give your agent one prompt: it reads the docs, gets a sandbox key and tests what it builds.",
  call: "An agent's session",
  stage: (
    <Replay
      events={[
        { name: "Read coss.com/llms.txt", tone: "neutral", at: "00:02" },
        {
          name: "npx coss-cli init --agents",
          tone: "info",
          at: "00:09",
          detail: "You approved a development key",
        },
        { name: "get_setup", tone: "neutral", at: "00:14", detail: "Sandbox: any from address" },
        { name: "coss.email.send()", tone: "info", at: "00:31" },
        {
          name: "email.delivered",
          tone: "success",
          at: "00:33",
          detail: "Simulated: nothing left coss.com",
        },
      ]}
    >
      <div className="flex items-start justify-between gap-3 pb-1">
        <div className="min-w-0">
          <p className="truncate font-medium">Add coss.com to this project</p>
          <p className="truncate text-muted-foreground text-sm">Your prompt, its steps</p>
        </div>
        <Badge variant="outline">coss_test_…</Badge>
      </div>
    </Replay>
  ),
  highlights: [
    {
      title: "Docs written to be fetched",
      body: "A brief for agents at /llms.txt, and every docs page as Markdown at its URL plus .md.",
      href: "/docs/agents",
      demo: <Docs />,
    },
    {
      title: "Tools that explain what happened",
      body: "The MCP server searches the docs, finds emails and SMS, and says why one wasn't delivered.",
      href: "/docs/mcp",
      demo: <Diagnose />,
    },
    {
      title: "A key without copy and paste",
      body: "You approve it in your browser, and nothing is delivered until you switch to a production key yourself.",
      href: "/docs/cli",
      demo: <Approve />,
    },
    {
      title: "Errors an agent can fix",
      body: "Methods return results instead of throwing, and errors often carry a hint with the fix.",
      href: "/docs/sdk/errors",
      demo: <Results />,
    },
  ],
};
