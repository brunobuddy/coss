import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import { Input } from "@coss/ui/components/input";
import { Label } from "@coss/ui/components/label";
import { Textarea } from "@coss/ui/components/textarea";
import { MailIcon, UsersIcon, WebhookIcon } from "lucide-react";
import { Replay, StatusDot, type Tone } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import type { ProductShowcase } from "./types";

const SUBMISSIONS: readonly { from: string; status: string; tone: Tone; reason: string }[] = [
  { from: "ada@example.com", status: "accepted", tone: "success", reason: "" },
  { from: "grace@example.com", status: "pending_confirmation", tone: "info", reason: "" },
  { from: "win@mailinator.example", status: "held", tone: "warning", reason: "risk_review" },
  { from: "deals@example.net", status: "spam", tone: "error", reason: "content" },
  { from: "bot@example.net", status: "spam", tone: "error", reason: "honeypot" },
];

function Submissions() {
  return (
    <Tray flush title="Contact us" meta="Submissions">
      <ul className="flex flex-col">
        {SUBMISSIONS.map((submission) => (
          <li
            className="flex items-center justify-between gap-4 border-b px-4 py-2.5 last:border-b-0"
            key={`${submission.from}-${submission.reason}`}
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm">{submission.from}</span>
              {submission.reason ? (
                <span className="font-mono text-muted-foreground text-xs">
                  spam_reason: {submission.reason}
                </span>
              ) : null}
            </span>
            <StatusDot className="text-sm" tone={submission.tone}>
              {submission.status}
            </StatusDot>
          </li>
        ))}
      </ul>
    </Tray>
  );
}

const DESTINATIONS = [
  {
    icon: WebhookIcon,
    name: "Webhook",
    detail: "form.submission.received",
    mono: true,
  },
  {
    icon: MailIcon,
    name: "Notification email",
    detail: "support@example.com, replies go to the submitter",
    mono: false,
  },
  {
    icon: UsersIcon,
    name: "Contact",
    detail: "Added with its audiences, topics and properties",
    mono: false,
  },
] as const;

function Destinations() {
  return (
    <Tray flush title="One submission, each destination on its own">
      <ul className="flex flex-col">
        {DESTINATIONS.map(({ icon: Icon, name, detail, mono }) => (
          <li className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0" key={name}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
              <Icon aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm">{name}</span>
              <span
                className={
                  mono
                    ? "truncate font-mono text-muted-foreground text-xs"
                    : "truncate text-muted-foreground text-xs"
                }
              >
                {detail}
              </span>
            </span>
            <StatusDot className="text-sm" tone="success">
              delivered
            </StatusDot>
          </li>
        ))}
      </ul>
    </Tray>
  );
}

function Hosted() {
  return (
    <Tray title="/f/form_01k7c8m4q2" action={<Badge variant="outline">hosted</Badge>}>
      <div className="mx-auto flex w-full max-w-sm flex-col gap-3">
        <p className="font-heading font-semibold text-lg">Contact us</p>
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs">Email</span>
          <div className="h-8 rounded-lg border bg-muted/48" />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs">Message</span>
          <div className="h-16 rounded-lg border bg-muted/48" />
        </div>
        <div aria-hidden>
          <Button render={<span />} size="sm">
            Send
          </Button>
        </div>
      </div>
    </Tray>
  );
}

function PlainHtml() {
  return (
    <Tray flush title="Any HTML form">
      <pre className="overflow-x-auto p-4 font-mono text-[0.8125rem] leading-relaxed">
        <code>{`<form action="https://…/f/form_01k…" method="post">
  <input type="email" name="email" required>
  <textarea name="message"></textarea>
  <input type="text" name="_gotcha" style="display:none">
  <button>Send</button>
</form>`}</code>
      </pre>
    </Tray>
  );
}

export const forms: ProductShowcase = {
  lede: "Point any HTML form at an endpoint, and coss.com screens each submission and delivers it where you work.",
  call: "coss.forms.create()",
  stage: (
    <Replay
      events={[
        { name: "accepted", tone: "success", at: "09:41:02.118" },
        { name: "form.submission.received", tone: "info", at: "09:41:02.402" },
        { name: "notification", tone: "success", at: "09:41:03.260" },
      ]}
    >
      <div className="flex flex-col gap-2.5 pb-1">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="showcase-form-email">Email</Label>
          <Input defaultValue="ada@example.com" id="showcase-form-email" readOnly type="email" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="showcase-form-message">Message</Label>
          <Textarea
            defaultValue="Do you support annual invoicing?"
            id="showcase-form-message"
            readOnly
            rows={2}
          />
        </div>
      </div>
    </Replay>
  ),
  highlights: [
    {
      title: "Spam stays out",
      body: "A honeypot, a Risk assessment and a content check screen every submission. Release a false positive and Risk learns from it.",
      href: "/docs/forms/spam-filtering",
      demo: <Submissions />,
    },
    {
      title: "Delivered where you work",
      body: "Accepted submissions go to webhooks, up to 5 notification recipients and your contacts, and each destination retries on its own.",
      href: "/docs/forms/destinations",
      demo: <Destinations />,
    },
    {
      title: "Works with plain HTML",
      body: "URL-encoded, multipart or JSON. No JavaScript needed, though attachForm adds per-field errors if you want them.",
      href: "/docs/forms/html-forms",
      demo: <PlainHtml />,
    },
    {
      title: "Or let coss.com host the page",
      body: "Turn on hosted to serve the form from its fields. Pages can't ask for passwords, codes or card numbers.",
      href: "/docs/forms/hosted-pages",
      demo: <Hosted />,
    },
  ],
};
