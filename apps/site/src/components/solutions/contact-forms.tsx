import { Badge } from "@coss/ui/components/badge";
import { Replay, StatusDot } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import { DataTable, Line, Mono, StageHead } from "./parts";
import type { SolutionShowcase } from "./types";

function Submissions() {
  return (
    <Tray flush title="Contact us" meta="Submissions">
      <DataTable
        head={["From", "Checked by", "Status"]}
        rows={[
          [
            "ada@example.com",
            "All checks",
            <StatusDot key="s" tone="success">
              accepted
            </StatusDot>,
          ],
          [
            "grace@example.com",
            "Risk review",
            <StatusDot key="s" tone="warning">
              held
            </StatusDot>,
          ],
          [
            "bot@example.net",
            "Honeypot",
            <StatusDot key="s" tone="neutral">
              spam
            </StatusDot>,
          ],
        ]}
      />
    </Tray>
  );
}

function Notification() {
  return (
    <Tray title="New submission: Contact us" meta="to sales@example.com">
      <div className="flex flex-col">
        <Line label="From">forms@example.com</Line>
        <Line label="Reply goes to">ada@example.com</Line>
        <Line label="Fields">every field, with a dashboard link</Line>
      </div>
    </Tray>
  );
}

function Contact() {
  return (
    <Tray title="ada@example.com" action={<Badge variant="outline">Contact</Badge>}>
      <div className="flex flex-col">
        <Line label="First name">Ada</Line>
        <Line label="Company">Analytical Engines</Line>
        <Line label="Audience">Leads</Line>
      </div>
    </Tray>
  );
}

function Html() {
  return (
    <Tray title="Any HTML form">
      <pre className="overflow-x-auto font-mono text-[0.8125rem] leading-relaxed">
        {`<form action="https://…/f/form_01k…" method="post">
  <input name="email" type="email" required />
  <textarea name="message"></textarea>
  <button>Send</button>
</form>`}
      </pre>
    </Tray>
  );
}

export const contactForms: SolutionShowcase = {
  lede: "Point any form at one endpoint. Spam stays out, your team gets an email, and leads land in your contacts.",
  call: "coss.forms.create()",
  stage: (
    <Replay
      events={[
        { name: "form.submission.received", tone: "success", at: "09:41:02" },
        {
          name: "email.delivered",
          tone: "success",
          at: "09:41:04",
          detail: "to sales@example.com",
        },
        { name: "contact.created", tone: "info", at: "09:41:04" },
      ]}
    >
      <StageHead
        detail="ada@example.com"
        state={<Badge variant="success">accepted</Badge>}
        title="Contact us"
      />
      <Mono muted>Tell me about your pricing for teams.</Mono>
    </Replay>
  ),
  steps: [
    {
      title: "Spam stays out",
      body: "A honeypot, a Risk assessment, a content check and an optional captcha. Spam is answered like a success, so bots learn nothing.",
      href: "/docs/forms/spam-filtering",
      demo: <Submissions />,
    },
    {
      title: "Notifications your team can answer",
      body: "Up to 5 recipients get an email per accepted submission, and a reply goes to the submitter.",
      href: "/products/forms",
      demo: <Notification />,
    },
    {
      title: "Leads in your contacts",
      body: "Submitters become contacts, with audiences and properties, ready for broadcasts.",
      href: "/docs/email/contacts",
      demo: <Contact />,
    },
    {
      title: "No backend needed",
      body: "The endpoint takes what browsers post. Define fields to validate them, or turn on a hosted page.",
      href: "/docs/forms/html-forms",
      demo: <Html />,
    },
  ],
};
