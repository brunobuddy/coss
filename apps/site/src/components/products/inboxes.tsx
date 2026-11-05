import { Badge } from "@coss/ui/components/badge";
import { beat } from "@/components/marketing/beat";
import { Replay } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import type { ProductShowcase } from "./types";

const DOMAIN = "k3j9x2m7qp4l.inbound.coss.com";

const THREADS = [
  {
    from: "jane@example.com",
    preview: "Sorry about that, Jane! A new one is on its way.",
    count: 2,
    when: "12:00",
  },
  {
    from: "omar@example.org",
    preview: "Can you move my renewal to the first of the month?",
    count: 4,
    when: "11:42",
  },
  {
    from: "billing@example.net",
    preview: "Invoice 2291 is attached. Please confirm receipt.",
    count: 1,
    when: "09:15",
  },
] as const;

function Threads() {
  return (
    <Tray flush meta={`support-agent@${DOMAIN}`} title="Threads">
      <ul className="flex flex-col">
        {THREADS.map((thread) => (
          <li
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 border-b px-4 py-3 last:border-b-0"
            key={thread.from}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium text-sm">{thread.from}</span>
              <Badge variant="outline">{thread.count}</Badge>
            </span>
            <time className="font-mono text-muted-foreground text-xs tabular-nums">
              {thread.when}
            </time>
            <span className="col-span-2 truncate text-muted-foreground text-sm">
              {thread.preview}
            </span>
          </li>
        ))}
      </ul>
    </Tray>
  );
}

function Extracted() {
  return (
    <Tray flush title="A message, as your agent reads it">
      <div className="grid sm:grid-cols-2">
        <div className="flex flex-col gap-2 border-b p-4 sm:border-e sm:border-b-0">
          <p className="font-mono text-muted-foreground text-xs">text</p>
          <div className="flex flex-col gap-2 text-sm leading-snug">
            <p>Hi, the order arrived damaged. Can you send a new one?</p>
            <p className="text-muted-foreground line-through decoration-muted-foreground/40">
              Jane Doe, Head of Ops
            </p>
            <p className="text-muted-foreground line-through decoration-muted-foreground/40">
              On Oct 9, Acme wrote: &gt; Your order has shipped.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 p-4">
          <p className="font-mono text-muted-foreground text-xs">extracted_text</p>
          <p className="text-sm leading-snug">
            Hi, the order arrived damaged. Can you send a new one?
          </p>
        </div>
      </div>
    </Tray>
  );
}

const PAYLOAD = [
  ["type", '"inbox.message.received"'],
  ["inbox_id", '"inbox_01k7c8m4…"'],
  ["thread_id", '"thread_01k7c8m4…"'],
  ["message_id", '"imsg_01k7c8m4…"'],
  ["from", '"jane@example.com"'],
  ["new_thread", "true"],
  ["spam", "false"],
] as const;

function Webhook() {
  return (
    <Tray meta="Signed" title="Webhook">
      <dl className="flex flex-col gap-1.5 font-mono text-[0.8125rem]">
        {PAYLOAD.map(([key, value]) => (
          <div className="flex items-baseline justify-between gap-4" key={key}>
            <dt className="text-muted-foreground">{key}</dt>
            <dd className="min-w-0 truncate">{value}</dd>
          </div>
        ))}
      </dl>
    </Tray>
  );
}

const AGENTS = [
  ["agent-42", "support-agent"],
  ["agent-43", "billing-agent"],
  ["task-9917", "refund-9917"],
] as const;

function Addresses() {
  return (
    <Tray title="Inboxes">
      <ul className="flex flex-col gap-2.5">
        {AGENTS.map(([client, username]) => (
          <li className="flex items-center justify-between gap-4" key={client}>
            <span className="min-w-0 truncate font-mono text-[0.8125rem]">
              {username}
              <span className="text-muted-foreground">@acme.com</span>
            </span>
            <span className="shrink-0 font-mono text-muted-foreground text-xs">{client}</span>
          </li>
        ))}
      </ul>
    </Tray>
  );
}

export const inboxes: ProductShowcase = {
  lede: "Give each agent an address, get a webhook when mail arrives, and reply in the same thread.",
  call: "coss.inboxes.messages.reply()",
  stage: (
    <Replay
      events={[
        { name: "inbox.message.received", tone: "info", at: "12:00:01" },
        { name: "email.sent", tone: "info", at: "12:00:09" },
        { name: "email.delivered", tone: "success", at: "12:00:11" },
      ]}
    >
      <div className="flex flex-col gap-2 pb-1">
        <p className="truncate font-mono text-muted-foreground text-xs">support-agent@{DOMAIN}</p>
        <p
          className="enter-rise max-w-[85%] self-start rounded-xl rounded-bl-sm bg-muted px-3 py-2 text-sm leading-snug"
          style={beat(0)}
        >
          Hi, the order arrived damaged. Can you send a new one?
        </p>
        <p
          className="enter-rise max-w-[85%] self-end rounded-xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground text-sm leading-snug"
          style={beat(1)}
        >
          Sorry about that, Jane! A new one is on its way.
        </p>
      </div>
    </Replay>
  ),
  highlights: [
    {
      title: "Threads, not raw mail",
      body: "Messages are grouped by their headers, or by subject and participants within 30 days.",
      href: "/docs/inboxes/threads",
      demo: <Threads />,
    },
    {
      title: "Just the new words",
      body: "extracted_text drops the quoted conversation and the signature, so it's ready for a prompt.",
      href: "/docs/inboxes/threads",
      demo: <Extracted />,
    },
    {
      title: "A webhook per message",
      body: "It says which inbox, thread and message, and whether it's spam, never the content.",
      href: "/docs/inboxes",
      demo: <Webhook />,
    },
    {
      title: "An address per agent",
      body: "A client_id makes creating idempotent, so every agent or task can have its own without a lookup table.",
      href: "/docs/inboxes",
      demo: <Addresses />,
    },
  ],
};
