import {
  includedUnitsText,
  limitText,
  planPriceText,
  plansWithText,
  rateText,
} from "../billing-text";
import type { Competitor } from "../compare";

// See src/lib/compare.ts for the rules: every fact about them checked and sourced, coss.com's
// prices and limits read from the catalog through the billing-text helpers.

const CHECKED = "2026-11-03";

const COSS = {
  pricing: `Per recipient, with no volume tiers to pick: ${rateText("email.recipients")}. Paid plans start at ${planPriceText("pro")}, all of it spendable on usage`,
  free: `Free plan: ${includedUnitsText("email.recipients")}, ${includedUnitsText("email.received")} and ${includedUnitsText("email.inboxes")}; ${limitText("domains", "free")} sending domain`,
  transactional:
    "REST API and an SMTP relay (smtp.coss.com), batch and scheduled sends, idempotency keys, templates with versions and locales",
  marketing:
    "Contacts with custom properties, audiences, segments, topics with a hosted preference center and double opt-in, broadcasts on a separate marketing stream",
  inbound:
    "Every environment has its own address under coss.com's inbound domain, or receive at your own domain with one MX record; an email.received webhook, content and attachments through the API",
  subaccounts: `Sub-accounts on ${plansWithText("subaccounts")}: each with its own domains, SES tenant, reputation, quotas and suppression list (transactional email)`,
  channels:
    "SMS, Verify (one-time codes), Hooks (webhooks as a service) and Risk on the same API key and SDK",
  sdks: "TypeScript, plus generated SDKs for Python, Go, Ruby, PHP, Java and .NET; Laravel, Rails and Django mail drivers; a CLI and an MCP server",
  webhooks:
    "Standard Webhooks signatures, automatic retries, test events and `coss listen` to forward events to localhost",
  logs: `Every API request, email event and webhook attempt of an environment, searchable and exportable; log drains on ${plansWithText("logDrains")}`,
  dedicatedIps: `An add-on on ${plansWithText("dedicatedIps")}: Amazon SES managed dedicated IPs, warmed up automatically`,
  sandbox: "Sandbox environments with coss_test_ keys: the same API, nothing leaves coss.com",
  sms: `${rateText("sms.segments")}, carrier fees included; live SMS on paid plans`,
  smsCountries:
    "The US and Canada by default; others once you allow them, from the priced list on coss.com/pricing",
} as const;

const BREVO: Competitor = {
  slug: "brevo",
  name: "Brevo",
  products: ["marketing-email", "email", "sms"],
  query: "Brevo alternative",
  verdict:
    "Brevo is a full marketing suite with automation, CRM and chat. coss.com is a developer platform: email, SMS and one-time codes behind one API.",
  lede: "Brevo is built for teams running campaigns: a drag-and-drop editor, automation workflows, A/B tests, landing pages, a sales CRM, live chat and WhatsApp, with an API alongside. coss.com is built for engineers: an API and SDKs first, sandbox environments, sub-accounts for your own customers, and logs of every request and webhook. If your marketers work in the tool every day, Brevo does far more for them.",
  checked: CHECKED,
  rows: [
    {
      label: "Pricing model",
      coss: COSS.pricing,
      them: "Plans by monthly email volume: Starter from $9/month and Standard from $18/month for 5,000 emails, Professional from $499/month for 150,000, Enterprise custom",
    },
    {
      label: "Free tier",
      coss: COSS.free,
      them: "300 emails a day (9,000 a month), with no time limit and no credit card",
    },
    {
      label: "Transactional email",
      coss: COSS.transactional,
      them: "REST API and SMTP relay, templates, up to 1,000 emails per batch request, attachments up to 25 MB per email",
    },
    {
      label: "Marketing email",
      coss: COSS.marketing,
      them: "Drag-and-drop editor, segmentation and forms on Starter; unlimited automation workflows, A/B testing, send time optimization and landing pages from Standard; contact scoring from Professional",
    },
    {
      label: "SMS",
      coss: COSS.sms,
      them: "Prepaid credits on every plan, Free included, priced by volume and destination; campaigns, automations and an API",
    },
    {
      label: "Other channels",
      coss: "Verify (one-time codes), Hooks (webhooks as a service) and Risk on the same API key and SDK",
      them: "WhatsApp, web and mobile push, live chat, a chatbot, wallet and phone",
    },
    {
      label: "CRM and sales",
      coss: "—",
      them: "Pipelines, sales automation and chat, sold as Sales Essentials and Sales Advanced",
    },
    {
      label: "Receiving email",
      coss: COSS.inbound,
      them: "Inbound parsing: MX records on a receiving subdomain, each message posted to your URL as JSON with extracted text and attachments to download",
    },
    {
      label: "Multi-tenant sending",
      coss: COSS.subaccounts,
      them: "Multi-account management on Enterprise: business units and brands under one master account",
    },
    {
      label: "Dedicated IPs",
      coss: COSS.dedicatedIps,
      them: "Listed on Enterprise, and optional for high-volume senders, with automated warming",
    },
    {
      label: "SDKs",
      coss: COSS.sdks,
      them: "Node.js, PHP, Python, Java, C#, Go and Ruby; 150+ integrations such as Shopify, WordPress, Stripe and Zapier",
    },
    {
      label: "Webhooks",
      coss: COSS.webhooks,
      them: "An optional authentication token; 4 retries over about 11 hours, and most 4xx and all 5xx responses end the retries",
      note: "Brevo's webhook reference mentions no request signature",
    },
  ],
  chooseThem: [
    {
      title: "Marketers run campaigns in the tool",
      body: "Brevo has a drag-and-drop editor, automation workflows, A/B tests, send time optimization and landing pages. coss.com's marketing email is broadcasts you write and schedule, with segments and topics deciding who gets them.",
    },
    {
      title: "You want the CRM and chat in one place",
      body: "Sales pipelines, live chat, a chatbot, WhatsApp, push and loyalty programs sit next to email in Brevo. coss.com has none of those.",
    },
    {
      title: "You send on a free plan",
      body: `Brevo's free plan allows 9,000 emails a month at up to 300 a day. coss.com's includes ${includedUnitsText("email.recipients")}.`,
    },
    {
      title: "You work in a platform with a plugin",
      body: "Brevo has 150+ integrations with tools such as Shopify, WordPress and Stripe, so a store can connect without writing code.",
    },
  ],
  chooseCoss: [
    {
      title: "Developers own your email",
      body: "An API and SDKs first: idempotency keys, React Email, generated SDKs in six more languages, a CLI that forwards webhooks to localhost, and an MCP server for coding agents.",
    },
    {
      title: "You want a real sandbox",
      body: "Every project has sandbox environments whose coss_test_ keys run the same API with nothing leaving coss.com, and a simulator for email and SMS outcomes.",
    },
    {
      title: "You send for your own customers",
      body: `A coss.com sub-account gives each of your users their own domains, SES tenant, reputation, quotas and suppressions, so one bad sender pauses only itself. Available on ${plansWithText("subaccounts")}; sandbox sub-accounts are free.`,
    },
    {
      title: "Signed webhooks and full logs",
      body: "Every webhook is signed with Standard Webhooks headers, and each environment's log holds every API request, email event and webhook attempt.",
    },
    {
      title: "Received mail you can read later",
      body: "coss.com keeps each received email, so a webhook outage loses nothing, and inboxes give AI agents their own addresses with threads and replies.",
    },
  ],
  migration: [
    {
      title: "Add and verify your domains",
      body: "There is no importer for Brevo: the dashboard's importer covers Resend, SendGrid and Postmark. Add each domain in coss.com and publish its DNS records. coss.com's DKIM records sit next to Brevo's, so you can keep sending through Brevo until you switch.",
      href: "/docs/email/domains",
    },
    {
      title: "Bring over contacts and suppressions",
      body: "Export your contacts from Brevo as CSV and read its blocked transactional contacts through its API. Import them with coss.email.contacts.import and coss.email.suppressions.import, or as CSV on the Contacts and Suppressions pages. An import never re-subscribes someone who unsubscribed.",
      href: "/docs/email/contacts",
    },
    {
      title: "Rebuild templates and campaigns",
      body: "Recreate your templates with coss.com's template language, or send HTML or React Email from your code. Lists become audiences and filters become segments. Automation workflows have no equivalent: trigger those emails from your own code.",
      href: "/docs/email/templates",
    },
    {
      title: "Switch your code and webhooks",
      body: "Send with coss.email.send() or point SMTP at smtp.coss.com. Move inbound parsing to a receiving domain with coss.com's MX record, and update your handlers to coss.com's events and signatures.",
      href: "/docs/webhooks",
    },
  ],
  faq: [
    {
      question: "Is there an importer for Brevo?",
      answer:
        "No. The dashboard's importer covers Resend, SendGrid and Postmark. From Brevo, add your domains, import contacts and suppressions through the API or as CSV, recreate your templates and switch your sending code.",
    },
    {
      question: "Does coss.com have marketing automation like Brevo?",
      answer:
        "No. coss.com's marketing email is contacts, audiences, segments, topics and broadcasts you write and schedule. There are no automation workflows or A/B tests; Brevo's Standard plan has both.",
    },
    {
      question: "Does coss.com have a CRM or live chat?",
      answer:
        "No. coss.com is APIs for email, SMS, one-time codes, webhooks and risk checks. If you want sales pipelines and chat with your email, Brevo includes them.",
    },
    {
      question: "Can I send SMS with coss.com as I do with Brevo?",
      answer:
        "Yes, on a paid plan, from your organization's own local or toll-free numbers. coss.com buys the numbers and submits the US registrations for you. SMS is billed per segment by country rather than from prepaid credits.",
    },
    {
      question: "Is coss.com cheaper than Brevo?",
      answer:
        "It depends on your volume and what you use. coss.com charges per recipient and a paid plan's fee is credit spent on usage; Brevo sells plans by email volume with marketing tools on each tier. Compare both pricing pages with your own numbers.",
    },
  ],
  sources: [
    { label: "Brevo pricing", href: "https://www.brevo.com/pricing/" },
    {
      label: "Brevo transactional email",
      href: "https://www.brevo.com/products/transactional-email/",
    },
    { label: "Brevo bulk SMS", href: "https://www.brevo.com/bulk-sms-sender/" },
    {
      label: "Brevo docs: parse inbound email",
      href: "https://developers.brevo.com/docs/inbound-parse-webhooks",
    },
    {
      label: "Brevo docs: webhook retries",
      href: "https://developers.brevo.com/docs/retry-mechanism",
    },
    {
      label: "Brevo API: create a webhook",
      href: "https://developers.brevo.com/reference/create-webhook",
    },
    { label: "Brevo API clients", href: "https://developers.brevo.com/docs/api-clients" },
    {
      label: "Brevo API: export contacts",
      href: "https://developers.brevo.com/reference/request-contact-export",
    },
    {
      label: "Brevo API: blocked transactional contacts",
      href: "https://developers.brevo.com/reference/get-transac-blocked-contacts",
    },
  ],
};

const MAILERSEND: Competitor = {
  slug: "mailersend",
  name: "MailerSend",
  products: ["email", "inbound-email", "sms"],
  query: "MailerSend alternative",
  verdict:
    "MailerSend is a transactional email API with SMS in the US and Canada. coss.com adds contacts, broadcasts and sub-accounts on the same key.",
  lede: "MailerSend covers transactional email well: an API and SMTP relay, a drag-and-drop builder, inbound routes on every plan, and SMS and WhatsApp as extras. For newsletters it points you to MailerLite. coss.com keeps transactional and marketing email in one account, gives platforms sub-accounts with their own reputation, and logs every request and webhook on every plan.",
  checked: CHECKED,
  rows: [
    {
      label: "Pricing model",
      coss: COSS.pricing,
      them: "Hobby $7/month for 5,000 emails; Starter from $35/month and Professional from $110/month for 50,000; extra emails $1.50 per 1,000 on Hobby, $1.30 on Starter and Professional at 50,000",
    },
    {
      label: "Free tier",
      coss: COSS.free,
      them: "500 emails a month, 1 domain, 1 template, 100 API requests a day, 1 day of activity data; a credit card is required",
    },
    {
      label: "Transactional email",
      coss: COSS.transactional,
      them: "Email API and SMTP relay; drag-and-drop, HTML and rich-text builders, dynamic templates and split testing; bulk emailing from Hobby",
    },
    {
      label: "Marketing email",
      coss: COSS.marketing,
      them: "Built for transactional email: its help pages recommend MailerLite for newsletters and campaigns",
    },
    {
      label: "Receiving email",
      coss: COSS.inbound,
      them: "Inbound routes on every plan: an @inbound.mailersend.net address or your domain with an MX record; messages parsed to JSON, posted to a webhook or forwarded by email",
    },
    {
      label: "SMS",
      coss: `${COSS.sms}. ${COSS.smsCountries}`,
      them: "US and Canada only, transactional only; 100 messages a month on Starter, 150 on Professional, then $1.40 per 100; phone numbers $2 each",
    },
    {
      label: "WhatsApp",
      coss: "—",
      them: "An add-on on Hobby, Starter and Professional",
    },
    {
      label: "Multi-tenant sending",
      coss: COSS.subaccounts,
      them: "1 domain on Hobby, 10 on Starter, unlimited on Professional, with extra domains at $4; no sub-accounts on its pricing page",
    },
    {
      label: "Dedicated IPs",
      coss: COSS.dedicatedIps,
      them: "An add-on for Enterprise accounts sending over 100,000 emails a week",
    },
    {
      label: "Activity history",
      coss: COSS.logs,
      them: "1 day on Free and Hobby, 7 days on Starter, 30 days on Professional; up to 365 days as an add-on, from $5",
    },
    {
      label: "Webhooks",
      coss: COSS.webhooks,
      them: "HMAC-SHA256 of the body in a Signature header; retries for about 3 days; 1 webhook on Free and Hobby, 50 on Starter, unlimited on Professional",
    },
    {
      label: "SDKs",
      coss: COSS.sdks,
      them: "Node.js, Python, Java, Laravel, PHP, Go and Ruby; a CLI and an MCP server",
    },
  ],
  chooseThem: [
    {
      title: "Designers build your emails",
      body: "MailerSend has drag-and-drop, HTML and rich-text builders and split testing. coss.com templates are HTML and text with variables, edited in the dashboard or through the API.",
    },
    {
      title: "You need WhatsApp",
      body: "WhatsApp is an add-on on MailerSend's paid plans. coss.com doesn't send WhatsApp messages.",
    },
    {
      title: "You want verification and blocklist tools",
      body: "MailerSend sells email verification credits on every plan and includes blocklist monitoring. coss.com has email checks in Risk and DMARC reports, but no blocklist monitoring.",
    },
    {
      title: "You send a small, steady volume",
      body: "Hobby is a flat monthly fee for 5,000 emails, for a single domain.",
    },
  ],
  chooseCoss: [
    {
      title: "Newsletters from the same account",
      body: "Contacts, audiences, segments, topics with a hosted preference center and broadcasts live next to your transactional email, on a separate stream with its own reputation.",
    },
    {
      title: "You send for your own customers",
      body: `Sub-accounts on ${plansWithText("subaccounts")} each get their own domains, SES tenant, reputation, quotas and suppressions, and pause on their own bounces and complaints, not yours.`,
    },
    {
      title: "SMS beyond North America, or for marketing",
      body: "MailerSend's SMS is US and Canada, and transactional only. coss.com can send to other priced countries once you allow them, and its registration form has a marketing use case.",
    },
    {
      title: "Logs on every plan",
      body: "Each environment's log holds every API request, email event and webhook attempt, Free included, instead of a retention window chosen by plan.",
    },
    {
      title: "Sandbox environments",
      body: "Sandbox environments with coss_test_ keys are free, run the same API, send nothing and simulate outcomes for email and SMS.",
    },
  ],
  migration: [
    {
      title: "Add and verify your domains",
      body: "There is no importer for MailerSend: the dashboard's importer covers Resend, SendGrid and Postmark. Add each domain in coss.com and publish its DNS records. coss.com's DKIM records sit next to MailerSend's, so you can keep sending there until you switch.",
      href: "/docs/email/domains",
    },
    {
      title: "Bring over suppressions",
      body: "Page through MailerSend's hard bounce, spam complaint, unsubscribe and blocklist endpoints and import the addresses with coss.email.suppressions.import, or as CSV on the Suppressions page.",
      href: "/docs/email/suppressions",
    },
    {
      title: "Recreate your templates",
      body: "Recreate each template in coss.com's template language, declare its variables, publish it and send it with template_id and variables. Or send HTML or React Email from your code.",
      href: "/docs/email/templates",
    },
    {
      title: "Switch sending, routes and webhooks",
      body: "Send with coss.email.send() or SMTP at smtp.coss.com. Replace inbound routes with a receiving domain and an email.received handler, and point webhook handlers at coss.com's events and signatures. SMS needs a coss.com number and its own registration.",
      href: "/docs/email/receiving",
    },
  ],
  faq: [
    {
      question: "Is there an importer for MailerSend?",
      answer:
        "No. The dashboard's importer covers Resend, SendGrid and Postmark. From MailerSend, add your domains, import your suppressions through the API or as CSV, recreate your templates and switch your sending code or SMTP settings.",
    },
    {
      question: "Can coss.com send newsletters as well as transactional email?",
      answer:
        "Yes. Broadcasts and marketing sends use the same API key and SDK as transactional email, on a separate stream with its own reputation, so newsletter complaints never hold up password resets.",
    },
    {
      question: "Does coss.com have inbound routing like MailerSend?",
      answer:
        "coss.com receives every message for an environment's addresses, stores it and sends an email.received webhook; your code decides what to do with it. There are no route rules or forwarding to another address.",
    },
    {
      question: "Can coss.com send SMS outside the US and Canada?",
      answer:
        "Yes. Every organization starts with the US and Canada, and owners and admins can allow other priced countries. The numbers themselves are US and Canadian, and toll-free numbers only send to those two countries.",
    },
    {
      question: "Does coss.com work with SMTP like MailerSend?",
      answer:
        "Yes. smtp.coss.com accepts TLS on port 465 and STARTTLS on 587 (2465 and 2587 also work), with the username coss and an API key as the password.",
    },
  ],
  sources: [
    { label: "MailerSend pricing", href: "https://www.mailersend.com/pricing" },
    {
      label: "MailerSend: transactional and marketing email",
      href: "https://www.mailersend.com/help/transactional-email-vs-marketing-email",
    },
    {
      label: "MailerSend: inbound email",
      href: "https://www.mailersend.com/whats-new/inbound-emails",
    },
    {
      label: "MailerSend docs: inbound routing",
      href: "https://developers.mailersend.com/api/v1/inbound.html",
    },
    { label: "MailerSend SMS API", href: "https://www.mailersend.com/features/sms-api" },
    {
      label: "MailerSend docs: webhooks",
      href: "https://developers.mailersend.com/api/v1/webhooks.html",
    },
    { label: "MailerSend docs", href: "https://developers.mailersend.com/" },
    { label: "MailerSend CLI", href: "https://developers.mailersend.com/tools/cli" },
    { label: "MailerSend MCP server", href: "https://developers.mailersend.com/mcp" },
  ],
};

const LOOPS: Competitor = {
  slug: "loops",
  name: "Loops",
  products: ["marketing-email", "email"],
  query: "Loops alternative",
  verdict:
    "Loops runs marketing, product and transactional email from one contact record, with workflows. coss.com adds receiving, sub-accounts and SMS.",
  lede: "Loops is email for SaaS teams: campaigns, event-triggered workflows and transactional messages built in its editor, priced by subscribed contacts with unlimited sends. coss.com has no workflows. It charges per recipient, sends HTML straight from your code, receives email, and puts SMS, Verify and Risk on the same API key.",
  checked: CHECKED,
  rows: [
    {
      label: "Pricing model",
      coss: COSS.pricing,
      them: "By subscribed contacts, with unlimited sends and no seat fees: Growth from $49/month for up to 5,000 contacts, Enterprise custom from 1.5 million",
    },
    {
      label: "Free tier",
      coss: `${COSS.free}; ${limitText("contactsPerEnvironment", "free")} contacts per environment`,
      them: "4,000 sends per rolling 30 days to your first 1,000 contacts, marketing and transactional together, with a Powered by Loops footer",
    },
    {
      label: "Transactional email",
      coss: COSS.transactional,
      them: "API or SMTP, always through a template published in Loops (SMTP carries JSON naming it, not HTML); opens and clicks aren't tracked",
    },
    {
      label: "Attachments",
      coss: "Up to 20 per email, 25 MB combined",
      them: "Not generally available: Loops enables them on request; requests under 4 MB",
    },
    {
      label: "Marketing email",
      coss: COSS.marketing,
      them: "Campaigns, segments, mailing lists with a preference center, signup forms, and double opt-in for form signups",
    },
    {
      label: "Automation",
      coss: "—",
      them: "Workflows started by a new contact, a property change, a list join or your own events, with timers, branches, filters and experiments",
    },
    {
      label: "Receiving email",
      coss: COSS.inbound,
      them: "—",
      note: "Loops' own guide sends inbound processing to other providers",
    },
    {
      label: "Other channels",
      coss: COSS.channels,
      them: "Email only, by its own description",
    },
    {
      label: "Multi-tenant sending",
      coss: COSS.subaccounts,
      them: "—",
      note: "Not found in Loops' docs",
    },
    {
      label: "SDKs",
      coss: COSS.sdks,
      them: "Go, JavaScript, Nuxt, PHP and Ruby; a CLI, agent skills and an MCP server; SMTP guides for Django, Laravel and Rails",
    },
    {
      label: "Webhooks",
      coss: COSS.webhooks,
      them: "Webhook-Id, Webhook-Timestamp and Webhook-Signature headers (HMAC-SHA256); 8 attempts over about 28 hours; an endpoint is disabled after 5 days of failures",
    },
    {
      label: "Testing",
      coss: COSS.sandbox,
      them: "Sends to @example.com and @test.com addresses succeed with no email delivered",
    },
  ],
  chooseThem: [
    {
      title: "You want event-triggered sequences",
      body: "Loops workflows start from your events or contact changes and run emails, timers, branches and experiments. coss.com's marketing email is broadcasts you write and schedule.",
    },
    {
      title: "You send a lot to few contacts",
      body: "Loops charges by subscribed contacts with unlimited sends and no seat fees. coss.com bills every recipient, so frequent email to a small list costs more as you send more.",
    },
    {
      title: "Non-engineers write the emails",
      body: "Loops' editor lets your team build and publish campaigns and transactional messages, with forms and no deploy. coss.com's templates are HTML and text, with variables.",
    },
    {
      title: "You connect tools without code",
      body: "Loops has integrations with Stripe, Supabase, Zapier, Clerk, PostHog and others.",
    },
  ],
  chooseCoss: [
    {
      title: "Your code sends the email",
      body: "Pass HTML, text or a React Email component straight to coss.email.send(), with attachments, and no template to publish first. Templates are there when you want them.",
    },
    {
      title: "You receive email too",
      body: "Every environment can receive email, and inboxes give AI agents their own addresses, with threads and replies from the same address.",
    },
    {
      title: "Email is one channel of several",
      body: "SMS, one-time codes (Verify), Hooks and Risk use the same API key, SDK, webhooks and logs as email.",
    },
    {
      title: "You send for your own customers",
      body: `Sub-accounts on ${plansWithText("subaccounts")} each get their own domains, SES tenant, reputation, quotas and suppressions.`,
    },
    {
      title: "Tracking on transactional email",
      body: "Turn on open and click tracking for an environment or one category of email, on your own domain if you like. Loops doesn't track them on its transactional messages.",
    },
  ],
  migration: [
    {
      title: "Add and verify your domain",
      body: "There is no importer for Loops: the dashboard's importer covers Resend, SendGrid and Postmark. Add your domain in coss.com and publish its DNS records, keeping Loops' until you switch.",
      href: "/docs/email/domains",
    },
    {
      title: "Bring over contacts and lists",
      body: "Export your audience from Loops as CSV and import it on the Contacts page (up to 10,000 rows, with a status column) or with coss.email.contacts.import. Contact properties become custom properties, mailing lists become topics or audiences, and filters become segments. An import never re-subscribes someone who unsubscribed.",
      href: "/docs/email/contacts",
    },
    {
      title: "Recreate templates",
      body: "A Loops transactional email becomes a coss.com template, or HTML from your code. Its transactionalId and dataVariables map to template_id and variables, and each variable is declared on the template.",
      href: "/docs/email/templates",
    },
    {
      title: "Replace workflows and webhooks",
      body: "coss.com has no workflows: campaigns become broadcasts, and workflow emails move into your own code, on the events you already send to Loops. Update your webhook handler to coss.com's events; Standard Webhooks verification should look familiar.",
      href: "/docs/email/broadcasts",
    },
  ],
  faq: [
    {
      question: "Is there an importer for Loops?",
      answer:
        "No. The dashboard's importer covers Resend, SendGrid and Postmark. From Loops, add your domain, import your contacts as CSV or through the API, recreate your templates and switch your sending code.",
    },
    {
      question: "Does coss.com have workflows like Loops?",
      answer:
        "No. coss.com has no automation workflows. Marketing email is broadcasts to audiences and segments, and any sequence runs from your own code, using scheduled sends up to 30 days ahead if you want.",
    },
    {
      question: "How does pricing differ from Loops?",
      answer:
        "Loops charges by subscribed contacts with unlimited sends. coss.com charges per recipient, with a contact limit set by the plan, and a paid plan's fee is credit spent on usage. Which is cheaper depends on how often you email your list.",
    },
    {
      question: "Can I send transactional email without a template?",
      answer:
        "Yes. coss.email.send() takes HTML, text or a React Email component directly, and SMTP takes an ordinary message. Templates are optional.",
    },
    {
      question: "Can coss.com receive email?",
      answer:
        "Yes. Each environment has an address under coss.com's inbound domain with no DNS setup, or you can receive at your own domain with an MX record. Each message triggers an email.received webhook and stays readable through the API.",
    },
  ],
  sources: [
    { label: "Loops pricing", href: "https://loops.so/pricing" },
    { label: "Loops docs", href: "https://loops.so/docs" },
    { label: "Loops docs: transactional email", href: "https://loops.so/docs/transactional" },
    {
      label: "Loops docs: attachments",
      href: "https://loops.so/docs/transactional/attachments",
    },
    { label: "Loops docs: SMTP", href: "https://loops.so/docs/smtp" },
    { label: "Loops docs: workflows", href: "https://loops.so/docs/workflows" },
    { label: "Loops docs: webhooks", href: "https://loops.so/docs/webhooks" },
    { label: "Loops docs: mailing lists", href: "https://loops.so/docs/contacts/mailing-lists" },
    { label: "Loops: double opt-in", href: "https://loops.so/changelog/double-opt-in" },
    { label: "Loops docs: CSV upload", href: "https://loops.so/docs/add-users/csv-upload" },
    {
      label: "Loops: best email marketing automation platforms",
      href: "https://loops.so/resources/best-email-marketing-automation",
    },
    {
      label: "Loops: best transactional email services",
      href: "https://loops.so/resources/best-transactional-email-services",
    },
  ],
};

const PLIVO: Competitor = {
  slug: "plivo",
  name: "Plivo",
  products: ["sms"],
  query: "Plivo alternative",
  verdict:
    "Plivo has voice, WhatsApp and short codes, sold through sales with a monthly commitment. coss.com is self-serve SMS next to email and Verify.",
  lede: "Plivo is a communications API with voice, SIP trunking and voice AI agents next to SMS, MMS and WhatsApp. Its SMS is provisioned by its sales team with a minimum monthly commitment, for businesses messaging under their own brand. coss.com does SMS only, on a self-serve plan, with US registration from one form and the same API key, webhooks and logs as email.",
  checked: CHECKED,
  rows: [
    {
      label: "Getting access",
      coss: `Self-serve: live SMS on paid plans, which start at ${planPriceText("pro")}, all of it spendable on usage`,
      them: "Through sales, with a minimum monthly commitment across Plivo products: USD 1,000 for the US, Canada, UK, Australia, India (ILDO routes) and countries without pre-approval; USD 10,000 adds pre-registration countries",
      note: "Its docs say self-service SMS onboarding isn't available",
    },
    {
      label: "US price per segment",
      coss: `${rateText("sms.segments")}, carrier fees included`,
      them: "$0.0077 per SMS on long and short codes, $0.0079 on toll-free, sent or received, plus carrier surcharges of $0.0035 to $0.0050 per SMS sent; volume discounts through sales",
      note: "List prices",
    },
    {
      label: "Phone numbers",
      coss: rateText("sms.numbers"),
      them: "Long code $0.50 a month, toll-free $1 a month; US short code $1,500 to set up plus $500 a month",
    },
    {
      label: "US carrier registration",
      coss: "coss.com submits the 10DLC brand and campaign or the toll-free verification from one dashboard form; fees passed through at cost",
      them: "You create the profile, brand and campaign and link numbers in the console or API; toll-free verification in the console",
    },
    {
      label: "Channels",
      coss: "SMS",
      them: "SMS, MMS and WhatsApp through one Message API (WhatsApp on its Enterprise plan, from $1,000 a month)",
    },
    {
      label: "Sender types",
      coss: "Local and toll-free numbers (US, Canada)",
      them: "10DLC, toll-free, short codes and alphanumeric sender IDs",
    },
    {
      label: "Countries",
      coss: COSS.smsCountries,
      them: "Outbound to 200+ countries; inbound in the US, Canada, UK, Australia, France, Germany, Netherlands, Sweden, Austria and Belgium",
    },
    {
      label: "Opt-outs",
      coss: "STOP suppresses the number in every live environment of the organization, START lifts it",
      them: "Automatic on STOP and similar keywords, for that Plivo number or, on 10DLC, every number of the campaign",
    },
    {
      label: "Voice",
      coss: "—",
      them: "Voice API and SIP trunking; voice AI agents at $0.03 a minute excluding telephony",
    },
    {
      label: "One-time codes",
      coss: `Verify by SMS or email: ${rateText("verify.verifications")}, approved ones only, with a fraud guard before anything is sent`,
      them: "Verify by SMS, voice or WhatsApp: no fee per verification, channel prices by country, Fraud Shield included; provisioned through sales",
    },
    {
      label: "Multi-tenant platforms",
      coss: "One registration per organization; sub-accounts cover email only",
      them: "Resellers, ISVs, aggregators and multi-tenant platforms aren't onboarded for SMS",
    },
    {
      label: "Callbacks",
      coss: "One webhook endpoint for the sms.* events, with Standard Webhooks signatures",
      them: "A callback URL per message, signed with HMAC-SHA256 in X-Plivo-Signature-V2 headers",
    },
    {
      label: "Testing",
      coss: "Sandbox keys simulate every message, with a simulator number for each outcome",
      them: "—",
      note: "Not compared: see Plivo's docs",
    },
    {
      label: "SDKs",
      coss: COSS.sdks,
      them: "PHP, Python, Node.js, Java, .NET, Ruby and Go",
    },
    {
      label: "Also on the same API key",
      coss: "Email, inboxes, Verify, Hooks, Risk, Forms, Sign",
      them: "Voice, WhatsApp and Verify; no email on its pricing page",
    },
  ],
  chooseThem: [
    {
      title: "You need voice",
      body: "Plivo has a voice API, SIP trunking and voice AI agents. coss.com has no voice product, and Verify doesn't make calls.",
    },
    {
      title: "You need MMS or WhatsApp",
      body: "Both go through Plivo's Message API. coss.com sends SMS only: no MMS, no WhatsApp.",
    },
    {
      title: "You need short codes or alphanumeric sender IDs",
      body: "Short codes or your brand name as the sender where countries allow it. coss.com sends from local and toll-free numbers.",
    },
    {
      title: "You send and receive outside North America",
      body: "Plivo's inbound SMS covers the UK, Australia and several European countries. coss.com's numbers are US and Canadian, so messages elsewhere come from one of those and replies come back to it.",
    },
    {
      title: "You can commit to volume",
      body: "With a monthly commitment you already plan to meet, Plivo's list prices and volume discounts can come in under coss.com's rate. Compare with your own traffic.",
    },
  ],
  chooseCoss: [
    {
      title: "No sales call or commitment",
      body: `Choose a paid plan, from ${planPriceText("pro")}, and spend its credit on usage. Plivo's docs list its smallest SMS commitment at USD 1,000 a month.`,
    },
    {
      title: "Registration from one form",
      body: "coss.com submits your business profile, brand, campaign or toll-free verification in order, shows each status and why a step was rejected, and passes the fees through at cost.",
    },
    {
      title: "You only pay for what reached a carrier",
      body: "Failed, suppressed and canceled messages cost nothing, and carrier fees are in the rate rather than a separate surcharge per carrier.",
    },
    {
      title: "SMS next to everything else",
      body: "The same API key, SDK, webhooks, logs and invoice as email, Verify and inboxes, and sandbox environments that simulate every outcome.",
    },
  ],
  migration: [
    {
      title: "Get a number and register it",
      body: "There is no importer for Plivo: the dashboard's importer covers Resend, SendGrid and Postmark, and only email. On the organization's SMS page, buy a local or toll-free number and fill in the registration form with the business details you gave Plivo. Reviews usually take a few days.",
      href: "/docs/sms/senders",
    },
    {
      title: "Swap the send call",
      body: "Plivo's src, dst and text become coss.sms.send({ from, to, body }) with E.164 numbers. coss.com takes one recipient per call, so send separately where you joined several dst numbers. Test it first with a sandbox key and the simulator's numbers.",
      href: "/docs/sms/sending",
    },
    {
      title: "Move callbacks to webhooks",
      body: "Instead of a url per message, subscribe one webhook endpoint to the sms.* events. Replies go to the number's receiving environment and arrive as sms.received.",
      href: "/docs/sms/receiving",
    },
    {
      title: "Carry over your opt-outs",
      body: "Opt-outs recorded at Plivo don't follow you. Add the numbers you must not text with coss.sms.suppressions.add() before your first live send.",
      href: "/docs/sms/sending",
    },
  ],
  faq: [
    {
      question: "Is there an importer for Plivo?",
      answer:
        "No. The dashboard's importer covers email from Resend, SendGrid and Postmark. From Plivo, buy and register a number on coss.com, swap your send call, move callbacks to webhooks and add your opt-outs as suppressions.",
    },
    {
      question: "Can coss.com make voice calls or send WhatsApp messages?",
      answer:
        "No. coss.com sends and receives SMS only, with no voice, MMS or WhatsApp. Plivo has all three.",
    },
    {
      question: "Do I need a monthly commitment for SMS on coss.com?",
      answer:
        "No more than a paid plan, whose fee is credit spent on usage. Numbers and US carrier registration fees are billed on the same invoice. See coss.com/pricing.",
    },
    {
      question: "Does coss.com register my numbers for A2P 10DLC?",
      answer:
        "Yes. Owners and admins fill in one form on the organization's SMS page, and coss.com submits the business profile, brand and campaign (or the toll-free verification) and passes the carrier fees through at cost.",
    },
    {
      question: "Which provider sends coss.com's SMS?",
      answer:
        "Twilio, with one subaccount per organization. coss.com handles the numbers, the registration, opt-outs, billing and webhooks around it.",
    },
  ],
  sources: [
    {
      label: "Plivo docs: SMS availability and coverage",
      href: "https://www.plivo.com/docs/messaging/sms-availability",
    },
    { label: "Plivo pricing", href: "https://www.plivo.com/pricing/" },
    { label: "Plivo SMS pricing (US)", href: "https://www.plivo.com/sms/pricing/us/" },
    {
      label: "Plivo docs: US messaging",
      href: "https://www.plivo.com/docs/faq/messaging/us-messaging",
    },
    {
      label: "Plivo docs: 10DLC registration",
      href: "https://www.plivo.com/docs/messaging/a2p-10dlc/registration-process",
    },
    { label: "Plivo docs: Message API", href: "https://www.plivo.com/docs/messaging/api/messages" },
    {
      label: "Plivo docs: Messaging API FAQ",
      href: "https://www.plivo.com/docs/faq/messaging/messaging-api",
    },
    {
      label: "Plivo docs: supported features",
      href: "https://www.plivo.com/docs/messaging/concepts/features",
    },
    {
      label: "Plivo docs: opt-outs (DND)",
      href: "https://www.plivo.com/docs/messaging/concepts/dnd-service",
    },
    {
      label: "Plivo docs: signature validation",
      href: "https://www.plivo.com/docs/messaging/concepts/signature-validation",
    },
    { label: "Plivo Voice", href: "https://www.plivo.com/voice/" },
    { label: "Plivo Verify pricing", href: "https://www.plivo.com/verify/pricing/" },
    {
      label: "Plivo docs: Verify availability",
      href: "https://docs.plivo.com/docs/programmable-api/verify/availability",
    },
    {
      label: "Plivo docs: server SDKs",
      href: "https://www.plivo.com/docs/voice/concepts/terminology",
    },
  ],
};

export const MESSAGING_COMPETITORS: readonly Competitor[] = [BREVO, MAILERSEND, LOOPS, PLIVO];
