import { formatRetentionDays, RETENTION_DAYS } from "@coss/retention";
import { includedUnitsText, limitText, plansWithText, rateText } from "../billing-text";
import type { Competitor } from "../compare";

// See src/lib/compare.ts for the rules: every fact about them checked and sourced, coss.com's
// prices and limits read from the catalog through the billing-text helpers.

const CHECKED = "2026-10-30";

const TWILIO: Competitor = {
  slug: "twilio",
  name: "Twilio",
  products: ["sms"],
  query: "Twilio alternative",
  verdict:
    "Twilio reaches more channels and sender types worldwide. coss.com is SMS next to email and Verify, with registration done for you.",
  lede: "Twilio Programmable Messaging is the broadest messaging API there is: SMS, MMS, RCS and WhatsApp, short codes and alphanumeric sender IDs, in more than 180 countries. coss.com's SMS runs on Twilio itself (one subaccount per organization), and adds what a product team would otherwise build around it: carrier registration from one form, opt-outs across environments, sandbox environments with a simulator, and the same API key, webhooks and logs as email.",
  checked: CHECKED,
  rows: [
    {
      label: "Price per segment",
      coss: `${rateText("sms.segments")}, carrier fees included`,
      them: "US: $0.0083 per segment sent or received, plus carrier fees per message",
      note: "List prices",
    },
    {
      label: "Failed messages",
      coss: "Free: billed only once a message reaches a carrier",
      them: "$0.001 processing fee per message that ends Failed",
    },
    {
      label: "Phone numbers",
      coss: rateText("sms.numbers"),
      them: "Local $1.15 a month, toll-free $2.15 a month (bring your own: $0.50)",
    },
    {
      label: "US carrier registration",
      coss: "coss.com submits the 10DLC brand and campaign or the toll-free verification from one dashboard form; fees passed through at cost",
      them: "A2P 10DLC registration with onboarding fees",
    },
    {
      label: "Channels",
      coss: "SMS",
      them: "SMS, MMS, RCS, WhatsApp, Facebook Messenger (beta)",
    },
    {
      label: "Sender types",
      coss: "Local and toll-free numbers (US, Canada)",
      them: "Local 10DLC, toll-free, short codes, alphanumeric sender IDs",
    },
    {
      label: "Countries",
      coss: "The US and Canada by default; others once you allow them, from the priced list on coss.com/pricing",
      them: "180+ countries",
    },
    {
      label: "Opt-outs",
      coss: "STOP suppresses the number in every live environment of the organization, START lifts it",
      them: "—",
      note: "Not compared: see Twilio's docs",
    },
    {
      label: "Testing",
      coss: "Sandbox keys simulate every message, with a simulator number for each outcome",
      them: "—",
      note: "Not compared: see Twilio's docs",
    },
    {
      label: "Also on the same API key",
      coss: "Email, inboxes, Verify, Hooks, Risk, Forms, Sign",
      them: "Twilio Verify and other Twilio products, each with its own pricing",
    },
  ],
  chooseThem: [
    {
      title: "You need more than SMS",
      body: "MMS, RCS, WhatsApp and Messenger all go through Twilio's one Messaging API. coss.com sends SMS only: no MMS, no WhatsApp.",
    },
    {
      title: "You need short codes or alphanumeric sender IDs",
      body: "High-volume campaigns from a dedicated short code, or your brand name as the sender where countries allow it. coss.com sends from local and toll-free numbers.",
    },
    {
      title: "You send from numbers outside the US and Canada",
      body: "Twilio has localized senders in 180+ countries. coss.com's numbers are US and Canadian, so other countries get a message from one of those.",
    },
    {
      title: "You want the platform underneath",
      body: "Messaging Services, every channel and every sender type in one account: coss.com uses only Twilio's SMS, and doesn't offer sole-proprietor 10DLC brands.",
    },
  ],
  chooseCoss: [
    {
      title: "Registration without the paperwork maze",
      body: "One form on the organization's SMS page: coss.com submits your business profile, brand, campaign or toll-free verification, and passes the fees through at cost.",
    },
    {
      title: "You only pay for what reached a carrier",
      body: "Failed, suppressed and canceled messages cost nothing, and a send to a suppressed number is never handed over.",
    },
    {
      title: "Opt-outs you can't get wrong",
      body: "A STOP suppresses the number in every live environment at once, and live sends to it fail as suppressed instead of reaching the carrier.",
    },
    {
      title: "SMS next to everything else",
      body: "The same API key, SDK, webhooks, logs and invoice as email, Verify and inboxes, and sandbox environments that simulate every outcome.",
    },
  ],
  migration: [
    {
      title: "Get a number and register it",
      body: "On the organization's SMS page, buy a local or toll-free number and fill in the registration form with the business details you gave Twilio. Reviews usually take a few days.",
      href: "/docs/sms/senders",
    },
    {
      title: "Swap the send call",
      body: "Twilio's From, To and Body become coss.sms.send({ from, to, body }) with E.164 numbers. Test it first with a sandbox key and the simulator's numbers.",
      href: "/docs/sms/sending",
    },
    {
      title: "Move status callbacks to webhooks",
      body: "Instead of a StatusCallback URL per message, subscribe one webhook endpoint to the sms.* events, and route replies to an environment.",
      href: "/docs/sms/receiving",
    },
  ],
  faq: [
    {
      question: "Is coss.com built on Twilio?",
      answer:
        "Yes. coss.com's SMS goes through Twilio, with one Twilio subaccount per organization. coss.com handles the numbers, the carrier registration, opt-outs, billing and webhooks around it.",
    },
    {
      question: "Can coss.com send WhatsApp or MMS messages?",
      answer:
        "No. coss.com sends and receives SMS only. If you need WhatsApp, MMS or RCS, Twilio's Messaging API covers them.",
    },
    {
      question: "Does coss.com register my numbers for A2P 10DLC?",
      answer:
        "Yes. Owners and admins fill in one form on the organization's SMS page, and coss.com submits the business profile, brand and campaign (or the toll-free verification) and passes the carrier fees through at cost.",
    },
    {
      question: "Which countries can coss.com send SMS to?",
      answer:
        "Every organization starts with the US and Canada. Owners and admins can allow other countries that have a price on the pricing page; a few high-fraud countries need coss.com support to unlock them.",
    },
    {
      question: "Can I test SMS without sending real messages?",
      answer:
        "Yes. Sandbox API keys simulate every message without sending or billing anything, and the SMS simulator has a number for each outcome, such as delivered or invalid_number.",
    },
  ],
  sources: [
    { label: "Twilio SMS pricing (US)", href: "https://www.twilio.com/en-us/sms/pricing/us" },
    { label: "Twilio Messaging docs", href: "https://www.twilio.com/docs/messaging" },
    { label: "Twilio SMS", href: "https://www.twilio.com/en-us/messaging/channels/sms" },
    {
      label: "Twilio: alphanumeric sender ID",
      href: "https://www.twilio.com/docs/glossary/what-alphanumeric-sender-id",
    },
  ],
};

const TWILIO_VERIFY: Competitor = {
  slug: "twilio-verify",
  name: "Twilio Verify",
  products: ["verify"],
  query: "Twilio Verify alternative",
  verdict:
    "Twilio Verify has more channels and languages. coss.com Verify is SMS and email codes with a fraud guard that runs before anything is sent.",
  lede: "Both charge per successful verification plus the channel, and neither charges for codes nobody enters. Twilio Verify covers SMS, voice, WhatsApp, email, TOTP, push, Silent Network Auth and passkeys, in many languages. coss.com Verify does SMS and email, checks every new verification against the environment's Risk lists, premium-rate numbers and pumping patterns first, and shares the API key, webhooks and invoice with the rest of coss.com.",
  checked: CHECKED,
  rows: [
    {
      label: "Price per verification",
      coss: `${rateText("verify.verifications")}, approved ones only`,
      them: "$0.05 per successful verification",
    },
    {
      label: "SMS channel",
      coss: "From your own number, billed as any SMS; or, as they roll out, coss.com's shared numbers, billed at the country's SMS price",
      them: "Plus the channel fee: $0.0083 per SMS in the US",
    },
    {
      label: "Email channel",
      coss: "No extra cost; from your verified domain, else coss.com's sender",
      them: "Plus email pricing",
    },
    {
      label: "Other channels",
      coss: "—",
      them: "Voice, WhatsApp, TOTP, push, Silent Network Auth, passkeys",
    },
    {
      label: "Fraud protection",
      coss: "Fraud guard before sending: Risk lists, premium-rate and non-mobile numbers, Tor, velocity per IP, user, number prefix and country with approval rates",
      them: "Verify Fraud Guard: automated SMS pumping protection, included",
    },
    {
      label: "Blocked or unchecked codes",
      coss: "Blocked, failed and expired verifications cost only the messages actually sent; blocked ones send nothing",
      them: "No base fee for failed, expired or incomplete verifications; delivery attempts may still bill",
    },
    {
      label: "Languages",
      coss: "English",
      them: "Built-in translations",
    },
    {
      label: "Testing",
      coss: "Sandbox keys: codes are always zeros, nothing is sent or billed",
      them: "—",
      note: "Not compared: see Twilio's docs",
    },
    {
      label: "Events",
      coss: "verification.approved, verification.failed and verification.blocked webhooks, and log lines for every step",
      them: "—",
      note: "Not compared: see Twilio's docs",
    },
  ],
  chooseThem: [
    {
      title: "You need voice, WhatsApp or TOTP",
      body: "Twilio Verify has voice calls, WhatsApp, TOTP authenticator apps, push, Silent Network Auth and passkeys. coss.com sends codes by SMS and email only.",
    },
    {
      title: "Your users read other languages",
      body: "Twilio Verify translates its messages. coss.com's code messages are fixed English text.",
    },
    {
      title: "You want your own message text",
      body: "Twilio Verify lets you bring your own one-time code. coss.com makes the code itself, and its messages are fixed text.",
    },
  ],
  chooseCoss: [
    {
      title: "Fraud checks come before the cost",
      body: "Every new verification runs through the fraud guard before anything is sent or billed. A blocked one returns its reasons and sends nothing.",
    },
    {
      title: "Your Risk lists apply",
      body: "The environment's coss.com Risk allow and block lists, which also guard your sign-ups and logins, decide verifications too: allow wins.",
    },
    {
      title: "Codes are never stored",
      body: "coss.com keeps only a keyed hash of each code, never logs it or puts it in a webhook, and discards the message body once it is sent.",
    },
    {
      title: "One account for the rest",
      body: "Verify shares the API key, webhooks, logs and invoice with email, SMS and Risk, and sandbox keys make every code zeros for your tests.",
    },
  ],
  migration: [
    {
      title: "Replace the two calls",
      body: "Twilio's Verifications create and VerificationCheck become coss.verify.start({ to, ip }) and coss.verify.check({ to, code }).",
      href: "/docs/verify",
    },
    {
      title: "Set the environment's Verify settings",
      body: "Code length, lifetime, attempts, the SMS sender and the countries codes may go to are settings in the dashboard, like a Twilio Verify service's.",
      href: "/docs/verify/sms",
    },
    {
      title: "Pass the end user's IP",
      body: "The fraud guard uses ip and your user_id: add them to start, and handle verification_blocked like a failed send.",
      href: "/docs/verify/fraud-guard",
    },
  ],
  faq: [
    {
      question: "Does coss.com Verify support voice or WhatsApp codes?",
      answer:
        "No. coss.com Verify sends codes by SMS and email. Twilio Verify also has voice, WhatsApp, TOTP, push, Silent Network Auth and passkeys.",
    },
    {
      question: "Do I pay for verifications that never get approved?",
      answer:
        "No. coss.com charges per approved verification. Blocked, failed and expired ones cost only the messages that were actually sent, and blocked ones send nothing.",
    },
    {
      question: "How does coss.com stop SMS pumping?",
      answer:
        "Its fraud guard checks every new verification before sending: your Risk lists, premium-rate and non-mobile numbers, Tor, and velocity per IP, user, number prefix and country, with each one's approval rate.",
    },
    {
      question: "Can I test Verify without sending real codes?",
      answer:
        "Yes. In sandbox environments the code is always zeros and nothing is sent or billed.",
    },
  ],
  sources: [
    { label: "Twilio Verify pricing", href: "https://www.twilio.com/en-us/verify/pricing" },
    { label: "Twilio Verify docs", href: "https://www.twilio.com/docs/verify" },
  ],
};

const SVIX: Competitor = {
  slug: "svix",
  name: "Svix",
  products: ["hooks"],
  query: "Svix alternative",
  verdict:
    "Svix is the more complete webhooks service. coss.com Hooks covers the core, with a portal, on the API key you use for everything else.",
  lede: "Svix and coss.com Hooks work the same way: applications for your customers, event types, endpoints with their own secrets, a portal, and the same retry schedule. Svix goes further, with channels, transformations, FIFO endpoints, receiving webhooks (Ingest) and a self-hostable MIT server. coss.com Hooks sits next to email, SMS and the rest of coss.com, priced per message with no platform fee.",
  checked: CHECKED,
  rows: [
    {
      label: "Price",
      coss: `${rateText("hooks.messages")}, once whatever the fan-out; ${includedUnitsText("hooks.messages")} on Free; no platform fee`,
      them: "Free; Basic from $20 a month; Professional from $490 a month; 50,000 messages included, then $0.0001 a message",
    },
    {
      label: "Send rate",
      coss: "50 messages a second per organization (bursts of 200), 100,000 deliveries a day",
      them: "50, 200 or 800 messages a second by plan",
    },
    {
      label: "Retries",
      coss: "5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours, 10 hours",
      them: "The same schedule",
    },
    {
      label: "Failing endpoints",
      coss: "Disabled after 5 days of failures, with a webhook to you",
      them: "Disabled after 5 days of failures",
    },
    {
      label: "Signatures",
      coss: "Standard Webhooks headers (webhook-id, webhook-signature)",
      them: "Unbranded webhook- headers from Basic",
    },
    {
      label: "Portal",
      coss: "Included: your name, accent color and theme, embeddable on origins you allow",
      them: "Embeddable on every plan; unbranded from Professional",
    },
    {
      label: "Message retention",
      coss: formatRetentionDays(RETENTION_DAYS.hookMessages),
      them: "7, 30 or 90 days by plan; custom on Enterprise",
    },
    {
      label: "Channels and transformations",
      coss: "—",
      them: "Both, on every plan",
    },
    {
      label: "Ordering",
      coss: "Not ordered: payloads carry their own timestamps",
      them: "FIFO endpoints on Enterprise",
    },
    {
      label: "Receiving webhooks",
      coss: "—",
      them: "Ingest",
    },
    {
      label: "Self-hosting",
      coss: "—",
      them: "MIT-licensed server, Docker image",
    },
    {
      label: "SSO",
      coss: plansWithText("sso"),
      them: "Google Workspace on every plan; OIDC and SAML on Enterprise",
    },
  ],
  chooseThem: [
    {
      title: "You need channels, transformations or custom headers",
      body: "Svix filters by channel as well as event type, and lets customers rewrite the URL, method, body and headers with JavaScript before delivery. coss.com Hooks has neither.",
    },
    {
      title: "Order matters",
      body: "Svix offers FIFO endpoints on Enterprise. coss.com doesn't deliver in order.",
    },
    {
      title: "You run it yourself",
      body: "Svix's server is MIT-licensed and ships as a Docker image, with an on-prem option on Enterprise.",
    },
    {
      title: "You also receive webhooks",
      body: "Svix Ingest gives you endpoints to share with webhook providers. coss.com Hooks only sends.",
    },
    {
      title: "Higher throughput and compliance terms",
      body: "Up to 800 messages a second on Professional, and HIPAA with a BAA, mTLS and custom regions on Enterprise.",
    },
  ],
  chooseCoss: [
    {
      title: "No platform fee to start",
      body: `${includedUnitsText("hooks.messages")} on Free, then per message on any paid plan, with sandbox environments free.`,
    },
    {
      title: "It's on the account you already have",
      body: "One API key, SDK, audit log and dashboard for Hooks, email, SMS, Verify and Risk. Portal changes show in the audit log as made by the key that opened it.",
    },
    {
      title: "Recovery built in",
      body: "Requeue every delivery an endpoint missed since a time, from the API or the portal.",
    },
    {
      title: "Sandbox environments",
      body: "Sandbox keys deliver to real URLs under lower limits, so tests never mix with production messages.",
    },
  ],
  migration: [
    {
      title: "Recreate event types and applications",
      body: "Svix's event types and applications map one to one: coss.hooks.eventTypes.create() and coss.hooks.applications.create() with your own uid for each customer.",
      href: "/docs/hooks",
    },
    {
      title: "Move endpoints and tell your customers",
      body: "Create each endpoint with coss.hooks.endpoints.create(). Its signing secret is new, so customers update it; receivers already on Standard Webhooks verification keep their code.",
      href: "/docs/hooks/receiving",
    },
    {
      title: "Swap the send and the portal",
      body: "Sending a message becomes coss.hooks.messages.send({ application, event_type, payload }), and portal links come from coss.hooks.portal.createSession().",
      href: "/docs/hooks/portal",
    },
  ],
  faq: [
    {
      question: "What does coss.com Hooks cost?",
      answer: `${rateText("hooks.messages")}. A live message is charged once, whatever its fan-out; retries, recoveries, test sends and sandbox environments are free. Free includes ${includedUnitsText("hooks.messages")}. The current rates are on coss.com/pricing.`,
    },
    {
      question: "Is the retry schedule the same as Svix's?",
      answer:
        "Yes. Both retry after about 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours and 10 hours, and both disable an endpoint that has failed for 5 days.",
    },
    {
      question: "Can my customers keep their verification code?",
      answer:
        "If they verify with a Standard Webhooks library, yes: coss.com sends webhook-id, webhook-timestamp and webhook-signature headers. They need the endpoint's new signing secret.",
    },
    {
      question: "Does coss.com Hooks support transformations or channels?",
      answer:
        "No. Endpoints filter by event type only, and payloads are delivered as sent. Svix has both.",
    },
  ],
  sources: [
    { label: "Svix pricing", href: "https://www.svix.com/pricing/" },
    { label: "Svix docs: retries", href: "https://docs.svix.com/retries" },
    { label: "Svix docs: channels", href: "https://docs.svix.com/channels" },
    { label: "Svix docs: transformations", href: "https://docs.svix.com/transformations" },
    { label: "svix-webhooks on GitHub", href: "https://github.com/svix/svix-webhooks" },
  ],
};

const AGENTMAIL: Competitor = {
  slug: "agentmail",
  name: "AgentMail",
  products: ["inboxes"],
  query: "AgentMail alternative",
  verdict:
    "AgentMail is a fuller email client for agents. coss.com Inboxes gives agents threads and replies on the platform that also sends your email and SMS.",
  lede: "Both give each AI agent its own address, keep mail as threads, extract the reply from the quoted conversation and send a webhook per message. AgentMail adds drafts, labels, WebSockets, IMAP and SMTP, and a calendar. coss.com Inboxes builds on its email product: the same domains, deliverability, suppressions, logs and API key as your transactional email.",
  checked: CHECKED,
  rows: [
    {
      label: "Free",
      coss: `${includedUnitsText("email.inboxes")} and ${includedUnitsText("email.received")}`,
      them: "3 inboxes, 3,000 emails a month (100 a day)",
    },
    {
      label: "Paid",
      coss: `Per inbox: ${rateText("email.inboxes")}`,
      them: "Developer $20 a month (10 inboxes); Startup $200 a month (150 inboxes)",
    },
    {
      label: "Most inboxes",
      coss: `${limitText("inboxes", "pro")} on Pro, ${limitText("inboxes", "scale")} on Scale`,
      them: "150 on Startup; up to unlimited on Enterprise",
    },
    {
      label: "Addresses",
      coss: "At coss.com's inbound domain (no DNS setup; receive-only in live environments) or your own receiving domains",
      them: "At AgentMail's domain, or custom domains on paid plans",
    },
    {
      label: "Real-time events",
      coss: "Webhooks (inbox.message.received); coss listen while you develop",
      them: "Webhooks and WebSockets",
    },
    {
      label: "Threads and reply text",
      coss: "Threads, each message's extracted_text without the quoted conversation",
      them: "Threads, reply extraction",
    },
    {
      label: "Drafts and labels",
      coss: "—",
      them: "Both",
    },
    {
      label: "IMAP and SMTP",
      coss: "—",
      them: "Both",
    },
    {
      label: "Multi-tenancy",
      coss: "Projects and environments, sandbox and live",
      them: "Pods",
    },
    {
      label: "SSO",
      coss: plansWithText("sso"),
      them: "Social sign-in on every plan; OIDC and SAML on Enterprise",
    },
    {
      label: "Same account",
      coss: "Transactional and marketing email, SMS, Verify, Risk",
      them: "Calendar",
    },
  ],
  chooseThem: [
    {
      title: "Your agent needs a full mailbox",
      body: "Drafts for human review and scheduled sends, labels to track state, allow and block lists, and a calendar with invitations. coss.com Inboxes has none of these.",
    },
    {
      title: "You connect over IMAP or WebSockets",
      body: "AgentMail speaks IMAP and SMTP for ordinary mail clients, and streams events over a WebSocket without a public URL.",
    },
    {
      title: "Agents send from a shared domain on day one",
      body: "AgentMail's free inboxes send and receive at its domain. coss.com's live inboxes at its inbound domain only receive: sending needs one of your own domains.",
    },
  ],
  chooseCoss: [
    {
      title: "Your email is already on coss.com",
      body: "Inboxes reply from the domains you send from, with the same deliverability, suppressions, delivery events and logs as your transactional email.",
    },
    {
      title: "Agents that also text and verify",
      body: "The same API key sends SMS, one-time codes and Risk assessments, so an agent's tools come from one SDK.",
    },
    {
      title: "Priced per inbox, by the day",
      body: "An inbox costs only the days it exists, so short-lived agent inboxes don't pay for a month.",
    },
    {
      title: "Sandbox environments",
      body: "Sandbox inboxes send and receive without touching production mail or your bill.",
    },
  ],
  migration: [
    {
      title: "Set up receiving",
      body: "Start at the environment's inbound domain with no DNS, or add your own receiving domain for addresses you already use.",
      href: "/docs/email/receiving",
    },
    {
      title: "Create the inboxes",
      body: "AgentMail's inboxes become coss.inboxes.create({ username, client_id }); client_id makes a repeat create return the same inbox.",
      href: "/docs/inboxes",
    },
    {
      title: "Move the event handler",
      body: "Subscribe a webhook endpoint to inbox.message.received, read the thread with coss.inboxes.threads.get() and reply with coss.inboxes.messages.reply().",
      href: "/docs/inboxes/threads",
    },
  ],
  faq: [
    {
      question: "Can a coss.com inbox send email?",
      answer:
        "Yes, from one of your own domains, and every inbox can send in sandbox environments. Live inboxes at coss.com's shared inbound domain only receive.",
    },
    {
      question: "Does coss.com support IMAP for agent inboxes?",
      answer:
        "No. coss.com inboxes are read through the API, the SDK, the CLI and the MCP server, with a webhook for each message. AgentMail offers IMAP and SMTP.",
    },
    {
      question: "How are coss.com inboxes priced?",
      answer:
        "Every plan includes a few inboxes; beyond them an inbox is billed for each day it exists, and received mail by the thousand. The current rates are on coss.com/pricing.",
    },
    {
      question: "Does coss.com strip quoted replies?",
      answer:
        "Yes. Each message in a thread has extracted_text, its own words without the quoted conversation or the signature, which is what an agent should read.",
    },
  ],
  sources: [
    { label: "AgentMail pricing", href: "https://www.agentmail.to/pricing" },
    { label: "AgentMail docs index", href: "https://docs.agentmail.to/llms.txt" },
    { label: "AgentMail: drafts", href: "https://docs.agentmail.to/drafts" },
    { label: "AgentMail: IMAP and SMTP", href: "https://docs.agentmail.to/imap-smtp" },
    { label: "AgentMail: WebSockets", href: "https://docs.agentmail.to/websockets" },
    {
      label: "AgentMail: pods",
      href: "https://docs.agentmail.to/documentation/core-concepts/pods",
    },
  ],
};

const DOCUSIGN: Competitor = {
  slug: "docusign",
  name: "DocuSign",
  products: ["sign"],
  query: "DocuSign alternative",
  verdict:
    "DocuSign covers more signature levels, compliance programs and integrations. coss.com Sign puts embedded, sealed e-signatures on your API key.",
  lede: "DocuSign eSignature is the reference for e-signatures: advanced and qualified signatures with identity verification, bulk sending, mobile apps and over a thousand integrations. coss.com Sign is for products that ask their own users to sign: simple electronic signatures under ESIGN, UETA and eIDAS, embedded in your app or by email, sealed as PAdES with a hash-chained audit trail.",
  checked: CHECKED,
  rows: [
    {
      label: "API pricing",
      coss: "Metered per completed signature request; see coss.com/pricing",
      them: "Starter $50 a month (40 envelopes), Intermediate $300 (100), Advanced $480 (100), Enhanced custom",
    },
    {
      label: "Embedded signing",
      coss: "Every request: signers sign in your app through a signing session",
      them: "Enhanced API plans only",
    },
    {
      label: "Email signing",
      coss: "Invitations in signing order, reminders, expiry, signed copies, from your own address",
      them: "Yes",
    },
    {
      label: "Templates",
      coss: "Roles, merge fields, and a builder you embed in your app",
      them: "Reusable templates on every API plan; locked templates on Advanced",
    },
    {
      label: "Bulk send",
      coss: "—",
      them: "Advanced and up",
    },
    {
      label: "Signature levels",
      coss: "Simple electronic signatures (ESIGN, UETA, eIDAS)",
      them: "Simple, advanced (AES) and qualified (QES) with identity verification",
    },
    {
      label: "Completed document",
      coss: "A PDF sealed as PAdES, with certificate pages and the audit trail",
      them: "—",
      note: "Not compared: see DocuSign's docs",
    },
    {
      label: "Audit trail",
      coss: "Append-only and hash-chained, with webhooks and log lines for every step",
      them: "—",
      note: "Not compared: see DocuSign's docs",
    },
    {
      label: "Compliance programs",
      coss: "—",
      note: "coss.com doesn't list certifications here",
      them: "ISO 27001:2022, SOC 1 and SOC 2 Type 2, PCI-DSS; supports HIPAA and 21 CFR Part 11",
    },
    {
      label: "Integrations and apps",
      coss: "The coss.com API key, SDK and webhooks",
      them: "1,100+ integrations, iOS and Android apps",
    },
    {
      label: "Testing",
      coss: "Sandbox environments with the same API",
      them: "Free developer account in a demo environment",
    },
  ],
  chooseThem: [
    {
      title: "You need advanced or qualified signatures",
      body: "DocuSign offers AES and QES under eIDAS with identity verification. coss.com Sign makes simple electronic signatures only.",
    },
    {
      title: "Compliance reviews ask for certificates",
      body: "DocuSign holds ISO 27001, SOC 1 and SOC 2 Type 2 and PCI-DSS, and supports HIPAA and 21 CFR Part 11.",
    },
    {
      title: "You send in bulk or work in other tools",
      body: "Bulk send, PowerForms, 1,100+ integrations, and iOS and Android apps.",
    },
  ],
  chooseCoss: [
    {
      title: "Signing inside your product",
      body: "Every request can have embedded signers who sign in your app, with mountSigning from the coss package and the signing page's events.",
    },
    {
      title: "A record you can check yourself",
      body: "A hash-chained audit trail, document hashes, and a completed PDF sealed as PAdES: any later change shows.",
    },
    {
      title: "Templates your users build",
      body: "Embed the template builder so your customers place their own fields, then create requests from a template with merge fields.",
    },
    {
      title: "Same account as everything else",
      body: "One API key, webhooks, logs and sandbox environments with email, SMS and Verify.",
    },
  ],
  migration: [
    {
      title: "Map envelopes to requests",
      body: "An envelope becomes a signature request: documents as uploaded or inline PDFs, recipients as signers, tabs as fields placed by position or by a text anchor in the PDF.",
      href: "/docs/sign/fields-and-anchors",
    },
    {
      title: "Recreate templates",
      body: "Template roles and fields map to coss.com templates; create requests from them with one signer per role and merge fields for text.",
      href: "/docs/sign/templates",
    },
    {
      title: "Move to webhooks",
      body: "DocuSign's event notifications become sign_request.* webhooks; sign_request.completed means the sealed PDF is ready to download.",
      href: "/docs/sign/completion-and-audit-trail",
    },
  ],
  faq: [
    {
      question: "Are coss.com signatures legally binding?",
      answer:
        "They are simple electronic signatures under the US ESIGN Act and UETA and the EU's eIDAS: each signer consents, signs with a deliberate act and is identified, and the audit trail records each step.",
    },
    {
      question: "Does coss.com offer qualified electronic signatures?",
      answer:
        "No. coss.com Sign makes simple electronic signatures. For advanced or qualified signatures under eIDAS, DocuSign offers both with identity verification.",
    },
    {
      question: "Can signers sign inside my app?",
      answer:
        "Yes. Signers marked embedded sign in an iframe you open with a signing session, and your page gets events as they view, sign or decline.",
    },
    {
      question: "What do I get when everyone has signed?",
      answer:
        "A completed PDF with every field drawn in, certificate pages with the signers, hashes and the audit trail, sealed as PAdES so any change shows.",
    },
  ],
  sources: [
    {
      label: "DocuSign developer API plans",
      href: "https://ecom.docusign.com/plans-and-pricing/developer",
    },
    {
      label: "DocuSign: advanced electronic signatures",
      href: "https://www.docusign.com/en-gb/products/electronic-signature/advanced-electronic-signature",
    },
    { label: "DocuSign: eIDAS", href: "https://www.docusign.com/learn/eidas" },
    { label: "DocuSign compliance", href: "https://www.docusign.com/trust/compliance" },
    {
      label: "DocuSign eSignature",
      href: "https://www.docusign.com/products/electronic-signature",
    },
  ],
};

const FORMSPREE: Competitor = {
  slug: "formspree",
  name: "Formspree",
  products: ["forms"],
  query: "Formspree alternative",
  verdict:
    "Formspree has more integrations and keeps submissions longer. coss.com Forms screens every submission with Risk and feeds your contacts.",
  lede: "Both give a plain HTML form an endpoint to post to, with no backend, a _gotcha honeypot and email notifications. Formspree connects to Slack, Google Sheets, Zapier and two dozen other tools. coss.com Forms runs every submission through coss.com Risk, sends accepted ones to your webhooks, team and contacts with double opt-in, and renders hosted pages.",
  checked: CHECKED,
  rows: [
    {
      label: "Price",
      coss: `${rateText("forms.submissions")} accepted; ${includedUnitsText("forms.submissions")} on Free`,
      them: "Free (50 submissions a month); Personal $15, Professional $30, Business $90 a month",
    },
    {
      label: "Forms",
      coss: "100 per environment",
      them: "Unlimited",
    },
    {
      label: "Endpoint",
      coss: "A plain HTML form posts to /f/<form id>; coss/forms for JavaScript",
      them: "A plain HTML form posts to formspree.io/f/<form id>; JavaScript libraries",
    },
    {
      label: "Spam filtering",
      coss: "Honeypot, then a Risk assessment of email, IP, browser, captcha and text on every submission; spam answered like a success",
      them: "Formshield and reCAPTCHA on every plan; advanced spam control from Professional, custom rules on Business",
    },
    {
      label: "Captcha",
      coss: "Turnstile or hCaptcha, optional or required",
      them: "reCAPTCHA",
    },
    {
      label: "Destinations",
      coss: "Webhooks, notification emails, contacts with audiences and topics",
      them: "Email, Slack, Discord and more on Free; Sheets, Notion and more from Personal; webhooks, Zapier, HubSpot, Mailchimp from Professional",
    },
    {
      label: "Double opt-in",
      coss: "Confirm the contact, or hold the whole submission until the submitter clicks",
      them: "—",
      note: "Not on Formspree's plans page",
    },
    {
      label: "File uploads",
      coss: `Up to 25 MB per submission, ${rateText("forms.file_uploads")}; ${includedUnitsText("forms.file_uploads")} on Free`,
      them: "1, 5 or 10 GB of storage by plan; none on Free",
    },
    {
      label: "Hosted pages",
      coss: "A page coss.com renders from your fields, to link to or embed",
      them: "—",
      note: "Not on Formspree's plans page",
    },
    {
      label: "Retention",
      coss: `Accepted submissions ${formatRetentionDays(RETENTION_DAYS.formSubmissions)}, spam ${formatRetentionDays(RETENTION_DAYS.formSpam)}`,
      them: "30 days on Free, unlimited on paid plans",
    },
    {
      label: "Autoresponses",
      coss: "—",
      them: "From Professional",
    },
  ],
  chooseThem: [
    {
      title: "Submissions go to your other tools",
      body: "Slack, Google Sheets, Notion, Airtable, Zapier, HubSpot and more, without writing a webhook handler. coss.com sends to webhooks, email and its own contacts.",
    },
    {
      title: "You keep every submission",
      body: "Formspree's paid plans keep the submission archive with no limit. coss.com deletes accepted submissions after a retention period.",
    },
    {
      title: "You want autoresponses or lots of forms",
      body: "Autoresponses from Professional, and unlimited forms on every plan.",
    },
  ],
  chooseCoss: [
    {
      title: "Real spam screening on every submission",
      body: "The same Risk assessment coss.com uses for sign-ups: disposable addresses, IP reputation, velocity, captcha and a content check, with held submissions you can release.",
    },
    {
      title: "Forms that build your list",
      body: "Accepted submissions become contacts with audiences, topics and properties, with double opt-in, ready for broadcasts from the same account.",
    },
    {
      title: "No-backend pages",
      body: "Hosted pages rendered from your fields, embeddable on origins you allow, with the honeypot and captcha already in.",
    },
    {
      title: "Sandbox environments",
      body: "Test forms in a sandbox environment, including the confirmation emails, without touching live data.",
    },
  ],
  migration: [
    {
      title: "Create the form",
      body: "Create a form with your allowed origins and notification recipients, in the dashboard or with coss.forms.create().",
      href: "/docs/forms",
    },
    {
      title: "Change the action",
      body: "Point the form's action at its coss.com endpoint. The _gotcha honeypot keeps its name, and _next sets the redirect.",
      href: "/docs/forms/html-forms",
    },
    {
      title: "Choose destinations",
      body: "Subscribe a webhook endpoint to form.submission.received, and map fields to contact properties if the form signs people up.",
      href: "/docs/forms/destinations",
    },
  ],
  faq: [
    {
      question: "Can I keep my HTML form when moving from Formspree?",
      answer:
        "Yes. Change the action to the coss.com form's endpoint. The _gotcha honeypot works under the same name, and _next sets where the browser goes afterwards.",
    },
    {
      question: "How does coss.com filter form spam?",
      answer:
        "Every submission passes the honeypot, then a coss.com Risk assessment of the email, IP, browser, captcha and the text. Spam gets the same answer as a success, so bots learn nothing.",
    },
    {
      question: "Does coss.com Forms integrate with Slack or Google Sheets?",
      answer:
        "Not directly. Accepted submissions go to your webhooks, to your team by email and into your coss.com contacts; Formspree has ready-made integrations for those tools.",
    },
    {
      question: "How long does coss.com keep submissions?",
      answer: `Accepted submissions for ${formatRetentionDays(RETENTION_DAYS.formSubmissions)} and spam, held and unconfirmed ones for ${formatRetentionDays(RETENTION_DAYS.formSpam)}. Download them as CSV from the dashboard, or forward them to your own store with a webhook.`,
    },
  ],
  sources: [
    { label: "Formspree plans", href: "https://formspree.io/plans" },
    { label: "Formspree HTML forms", href: "https://formspree.io/html/" },
    {
      label: "Formspree: honeypot",
      href: "https://help.formspree.io/hc/en-us/articles/360013580813-Honeypot-spam-filtering",
    },
    {
      label: "Formspree: JavaScript",
      href: "https://help.formspree.io/hc/en-us/articles/360013470814-Submit-forms-with-JavaScript-AJAX",
    },
  ],
};

export const OTHERS_COMPETITORS: readonly Competitor[] = [
  TWILIO,
  TWILIO_VERIFY,
  SVIX,
  AGENTMAIL,
  DOCUSIGN,
  FORMSPREE,
];
