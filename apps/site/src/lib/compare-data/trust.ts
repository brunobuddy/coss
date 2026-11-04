import { BUCKETS } from "@coss/ratelimit/buckets";
import { formatRetentionDays, RETENTION_DAYS } from "@coss/retention";
import { includedUnitsText, planPriceText, rateText } from "../billing-text";
import type { Competitor } from "../compare";
import { formatRule } from "../rate-limits-text";

// See src/lib/compare.ts for the rules: every fact about them checked and sourced, coss.com's
// prices and limits read from the catalog through the billing-text helpers.

const CHECKED = "2026-11-03";

function apiKeyRate(bucket: "risk.assess" | "risk.limit"): string {
  const { limit, periodMs, burst } = BUCKETS[bucket];
  return `${formatRule(limit, periodMs)} per API key, bursts of ${burst.toLocaleString("en-US")}`;
}

const NYLAS_SCHEDULER: Competitor = {
  slug: "nylas-scheduler",
  name: "Nylas Scheduler",
  products: ["scheduling"],
  query: "Nylas Scheduler alternative",
  verdict:
    "Nylas Scheduler has public booking links, Stripe payments and a BAA. coss.com Scheduling bills per booking, on the key you use for email and SMS.",
  lede: "Both give your product hosts, availability, calendar connections, one-on-one, collective, round-robin and group meetings, and a page or component to book on. Nylas Scheduler sits on Nylas's email and calendar APIs, is priced per connected account, and adds public links, native Stripe payments and a BAA. coss.com Scheduling is priced per booking, keeps only busy times from calendars, and shares its API key, webhooks and logs with the rest of coss.com.",
  checked: CHECKED,
  rows: [
    {
      label: "Price",
      coss: `${rateText("scheduling.bookings")}, charged when confirmed; nothing per host or calendar`,
      them: "No per-booking price. Per connected account: Essentials $15 a month with 10 calendar-only accounts, then $1.70 each; Pro $49 a month with 35, then $1.50 each",
    },
    {
      label: "Free",
      coss: includedUnitsText("scheduling.bookings"),
      them: "5 email and calendar accounts; calendar-only accounts aren't included",
    },
    {
      label: "Hosts without a calendar",
      coss: "A host needs only a schedule",
      them: "Virtual calendars, billed per account; Nylas sends no invitations or reminders for their events",
    },
    {
      label: "Calendars",
      coss: "Google, Microsoft and CalDAV (Apple, Nextcloud, Fastmail)",
      them: "Google, Microsoft, iCloud and Exchange; no Free/Busy on iCloud",
    },
    {
      label: "Calendar consent",
      coss: "Hosts consent to coss.com's Google and Microsoft apps. Using your own apps isn't offered",
      them: "Your own Google and Microsoft apps, or Nylas's shared Google app with the Accelerator add-on ($2,400 a year, on Pro Annual)",
    },
    {
      label: "Meeting kinds",
      coss: "One-on-one, pool (shared by weight), collective, group (2 to 10,000 seats)",
      them: "One-on-one, round-robin (fairness or availability), collective, group with a capacity",
    },
    {
      label: "Double-booking",
      coss: "A Postgres exclusion constraint refuses overlapping claims of one host; the loser gets slot_unavailable",
      them: 'Re-checks the slot against the live calendar when booking and rejects a second claim; its page cites "race-condition-free locking"',
    },
    {
      label: "Public booking links",
      coss: "—",
      them: "A public Configuration gets a page at book.nylas.com/<slug>",
      note: "coss.com's hosted pages open from a session your server creates",
    },
    {
      label: "Embedding",
      coss: "mountBooker and mountHostPortal open coss.com's pages in an iframe; or your own UI on the client API",
      them: "Web and React components with CSS variables and a composable mode, and a Scheduler Editor for organizers",
    },
    {
      label: "Taking payment",
      coss: "Hold the slot, charge with your own provider, then confirm",
      them: "Native Stripe payments in the booking flow",
    },
    {
      label: "Recurring series",
      coss: "Up to 52 weekly or monthly occurrences at the attendee's local time",
      them: "—",
      note: "Not on Scheduler's API reference; its Events API takes RRULEs",
    },
    {
      label: "Finding a host",
      coss: "Host attributes narrow a pool per booking; availability.search covers up to 500 hosts",
      them: "—",
      note: "Not compared: see Nylas's docs",
    },
    {
      label: "Booking emails",
      coss: "Standard text or, on reminders, your own, with your brand name or logo and accent color from your own domain; each can be turned off",
      them: "Fixed wording and branding; turn them off and send your own",
    },
    {
      label: "Reminders",
      coss: "Any number, timed from any point in a booking's life, by email, webhook and SMS from your own approved number on the same account",
      them: "Email or a webhook; SMS through your own messaging stack",
    },
    {
      label: "Meeting links",
      coss: "Google Meet and Microsoft Teams; Zoom only once Zoom approves coss.com's app",
      them: "Microsoft Teams, Google Meet and Zoom",
    },
    {
      label: "Calendar data",
      coss: `Busy times only. Bookings go on as private events titled "Appointment". Attendee details kept ${formatRetentionDays(RETENTION_DAYS.schedulingPersonalData)} after the booking ends`,
      them: "Free/Busy returns busy blocks without titles; the Events API reads whole events",
    },
    {
      label: "HIPAA",
      coss: "No BAA yet; the Terms don't allow protected health information without a written agreement",
      them: "Pre-signed BAA on every paid plan",
    },
    {
      label: "Testing",
      coss: "Sandbox keys, with simulated calendars and no emails or charges",
      them: "—",
      note: "Not compared: see Nylas's docs",
    },
    {
      label: "Also on the same API key",
      coss: "Email, SMS, Verify, Risk, Forms, Sign, Hooks",
      them: "Email and calendar APIs, Notetaker, Agent Accounts",
    },
  ],
  chooseThem: [
    {
      title: "You want a link anyone can open",
      body: "A public Nylas Configuration with a slug is a booking page at book.nylas.com. coss.com has no public booking pages yet: each hosted page opens from a session your server creates.",
    },
    {
      title: "Payment belongs in the booking flow",
      body: "Nylas has native Stripe payments, with the booking finalized once payment succeeds. coss.com has no built-in payments: you hold the slot and charge through your own provider.",
    },
    {
      title: "You handle patient data",
      body: "Nylas offers a pre-signed BAA on every paid plan. coss.com doesn't offer one yet, and its Terms don't allow protected health information without a written agreement.",
    },
    {
      title: "You need more of the calendar than free and busy",
      body: "Nylas's Calendar and Events APIs read and write whole events, next to its email API and Notetaker. coss.com only knows when a host is busy, on purpose.",
    },
    {
      title: "You want consent under your own name, or components you can restyle",
      body: "With Nylas, hosts consent to your own Google and Microsoft apps, and its web and React components take CSS variables and a composable mode. coss.com's consent screens are its own, and its pages are iframes with your brand name, logo and accent color.",
    },
    {
      title: "Hosts take many bookings each",
      body: "Nylas charges per account, however many bookings it takes, so a busy host costs the same as a quiet one. coss.com charges every booking.",
    },
  ],
  chooseCoss: [
    {
      title: "Many hosts, few bookings each",
      body: "A marketplace pays for what gets booked, not for every provider who connected a calendar. A host with no bookings this month costs nothing.",
    },
    {
      title: "Nothing to set up for calendars",
      body: "Hosts connect Google or Microsoft through coss.com's consent screens, or CalDAV with an app-specific password. You don't create or verify an OAuth app.",
    },
    {
      title: "Routing for marketplaces",
      body: "Describe hosts with your own attributes, narrow each booking by them, and search up to 500 hosts at once. It never falls back to a host who doesn't match.",
    },
    {
      title: "Little held about people",
      body: 'Only busy times are kept from calendars, bookings are private events titled "Appointment", attendee details are encrypted, and answers never reach webhooks, logs or emails.',
    },
    {
      title: "One account for what comes around a booking",
      body: "Booking emails from your domain, SMS reminders from your number, webhooks, logs and sandbox environments, on the API key you use for email and SMS.",
    },
  ],
  migration: [
    {
      title: "Add hosts and reconnect calendars",
      body: "Create a host for each organizer and participant with coss.scheduling.hosts.create(). Nylas grants don't carry over, so each host connects their calendar again through the host portal or coss.scheduling.calendars.authorize().",
      href: "/docs/scheduling/calendars",
    },
    {
      title: "Turn Configurations into event types",
      body: "Open hours become schedules, and buffers and notice become event type settings. Round-robin becomes a pool, while collective and group keep their names.",
      href: "/docs/scheduling/pools-and-groups",
    },
    {
      title: "Swap the booking calls and the component",
      body: "POST /v3/scheduling/bookings becomes coss.scheduling.bookings.create(), and <nylas-scheduling> becomes mountBooker with a session from your server. Your own UI can use the client API instead.",
      href: "/docs/scheduling/embedding",
    },
    {
      title: "Move webhooks and notifications",
      body: "Subscribe an endpoint to the scheduling.booking.* events, set email_from on one of your verified domains, and turn off any notification you send yourself.",
      href: "/docs/scheduling/notifications",
    },
  ],
  faq: [
    {
      question: "Does coss.com have public booking pages like book.nylas.com?",
      answer:
        "Not yet. coss.com's hosted pages open from a session your server creates, for one event type, host or booking. Nylas generates a public page from a Configuration with a slug.",
    },
    {
      question: "What does coss.com Scheduling cost next to Nylas?",
      answer: `coss.com charges ${rateText("scheduling.bookings")} once it's confirmed, with ${includedUnitsText("scheduling.bookings")} on Free. Beyond that you need a paid plan, such as Pro at ${planPriceText("pro")}, whose fee counts toward usage. Nylas charges per connected account and lists no per-booking price, so which costs less depends on how many bookings each host takes.`,
    },
    {
      question: "Can coss.com take payment for a booking?",
      answer:
        "Not by itself. Hold the slot with coss.scheduling.holds.create(), charge the customer with your own provider, then call coss.scheduling.holds.confirm(). Nylas has native Stripe payments in the booking flow.",
    },
    {
      question: "Will coss.com sign a BAA for Scheduling?",
      answer:
        "Not yet, and its Terms don't allow protected health information without a written agreement. Nylas offers a pre-signed BAA on every paid plan.",
    },
    {
      question: "Do hosts have to reconnect their calendars?",
      answer:
        "Yes. Calendar access granted to Nylas doesn't transfer, so each host connects Google, Microsoft or CalDAV again, from the page you embed or through your own UI.",
    },
    {
      question: "Is coss.com Scheduling related to Cal.com?",
      answer:
        "Yes. It's built by the team behind Cal.com, as its own engine with no runtime dependency on Cal.com.",
    },
  ],
  sources: [
    { label: "Nylas pricing", href: "https://www.nylas.com/pricing/" },
    { label: "Nylas Scheduler", href: "https://www.nylas.com/products/scheduler/" },
    { label: "Nylas docs: Scheduler", href: "https://developer.nylas.com/docs/v3/scheduler/" },
    {
      label: "Nylas docs: hosted Scheduling Pages",
      href: "https://developer.nylas.com/docs/v3/scheduler/hosted-scheduling-pages/",
    },
    {
      label: "Nylas docs: the Scheduling component",
      href: "https://developer.nylas.com/docs/v3/scheduler/using-scheduling-component/",
    },
    {
      label: "Nylas API reference: Scheduler",
      href: "https://developer.nylas.com/docs/api/v3/scheduler/",
    },
    {
      label: "Nylas docs: virtual calendars",
      href: "https://developer.nylas.com/docs/v3/calendar/virtual-calendars/",
    },
    {
      label: "Nylas docs: recurring events",
      href: "https://developer.nylas.com/docs/v3/calendar/recurring-events/",
    },
    {
      label: "Nylas docs: creating a Google auth app",
      href: "https://developer.nylas.com/docs/provider-guides/google/create-google-app/",
    },
    {
      label: "Nylas docs: the Google shared app",
      href: "https://developer.nylas.com/docs/provider-guides/google/shared-gcp-app/",
    },
    {
      label: "Nylas cookbook: healthcare appointment booking",
      href: "https://developer.nylas.com/docs/cookbook/scheduler/healthcare-appointment-booking/",
    },
  ],
};

const CASTLE: Competitor = {
  slug: "castle",
  name: "Castle",
  products: ["risk"],
  query: "Castle.io alternative",
  verdict:
    "Castle goes deeper on devices and bots, on web and mobile. coss.com Risk gives reasons for each decision, checks content too, with no per-assessment price.",
  lede: "Both are called from your server at sign-up, login and payment, and answer with a score and a decision you act on: allow, challenge or deny at Castle, allow, review or block at coss.com. Castle fingerprints devices and watches behavior across web and native apps, and keeps separate abuse, account takeover and bot scores. coss.com Risk works from email, IP, velocity, your lists and rules, what users write and what you report back, without browser fingerprinting.",
  checked: CHECKED,
  rows: [
    {
      label: "Price",
      coss: `Assessments and email, IP and content checks are part of your plan; live phone checks ${rateText("risk.phone_checks")}`,
      them: "Pay per request: $0.005 for Risk and Filter, $0.001 for IP Intelligence. Pro $200 a month of usage; Enterprise from $4,000 a month",
    },
    {
      label: "Free",
      coss: `Assessments, and ${includedUnitsText("risk.phone_checks")}`,
      them: "$5 of usage a month: 1,000 Risk calls or 5,000 IP lookups, sharing one budget",
    },
    {
      label: "Request rate",
      coss: apiKeyRate("risk.assess"),
      them: "1 a second on Free, 5 on Pro, unlimited on Enterprise",
    },
    {
      label: "Decisions",
      coss: "allow, review or block, with one score from 0 to 1 and its reasons",
      them: "allow, challenge or deny from your policies, with abuse, account takeover and bot scores from 0 to 1",
    },
    {
      label: "Your own logic",
      coss: "Allow and block lists, then up to 50 rules, then score thresholds; in the dashboard or through the API",
      them: "Policies in order, on event type, lists, scores and signals; lists of user ids, IPs, transactions or custom values",
    },
    {
      label: "Devices",
      coss: "coss/device: a random id in localStorage, coarse facts and automation markers; no canvas or WebGL fingerprinting, no cookies",
      them: "Castle.js: canvas and WebGL fingerprinting, mouse and keyboard interactions, first-party cookies and local storage",
    },
    {
      label: "Native apps",
      coss: "—",
      note: "coss/device is browser-only; assessments work without a device token",
      them: "iOS, Android, React Native and Flutter SDKs",
    },
    {
      label: "Bots",
      coss: "Automation markers, plus your Turnstile or hCaptcha token, verified with the provider",
      them: "A bot score from device fingerprints and interaction patterns; spoofed, headless and emulated device signals",
    },
    {
      label: "Logins",
      coss: "New country and new network per user, velocity, and identifiers you reported as fraud",
      them: "An account takeover score, with new country, device, device type, ISP, OS and language signals",
    },
    {
      label: "Payments",
      coss: "checkout events: amount, card country and funding, billing country; card fingerprints kept as keyed hashes and remembered once reported",
      them: "$transaction events: purchases, withdrawals, deposits, transfers and more, with payment method and merchant details",
    },
    {
      label: "Email and IP",
      coss: "Disposable and undeliverable domains, typos, new domains, duplicate mailboxes; Tor, cloud and hosting networks, ASN and country. VPNs guessed from the network, unless coss.com has address-level data",
      them: "Disposable, fraudulent and unreachable email domains; Tor, VPN, proxy, residential proxy and data center IPs",
    },
    {
      label: "What people write",
      coss: "Spam, phishing, malware and fraud scores from an AI model; the text is never stored",
      them: "—",
      note: "Not in Castle's signals reference",
    },
    {
      label: "Phone numbers",
      coss: "Line type and carrier, as a check on its own",
      them: "—",
      note: "Not in Castle's signals reference",
    },
    {
      label: "Learning from outcomes",
      coss: "Feedback flags the mailbox, card, browser and IP next time, and suggests weights you choose to apply",
      them: "Crowd-wide statistics and self-learning AI",
    },
    {
      label: "Data kept",
      coss: `Email, IP and user agent ${formatRetentionDays(RETENTION_DAYS.riskPersonalData)}; decisions and reasons ${formatRetentionDays(RETENTION_DAYS.riskAssessments)}; each environment's memory is keyed hashes only`,
      them: "3 days on Free, 7 on Pro, up to 18 months on Enterprise",
    },
    {
      label: "Testing",
      coss: "Sandbox keys, with fixed inputs that trigger each reason and their own counters and lists",
      them: "Sandbox environments on the same pipeline, with mock request tokens that set the score and action",
    },
    {
      label: "Compliance programs",
      coss: "—",
      note: "coss.com doesn't list certifications here",
      them: "SOC 2 Type II; lists itself as GDPR Ready",
    },
  ],
  chooseThem: [
    {
      title: "Bots are your main problem",
      body: "Castle reads device fingerprints and interaction patterns such as mouse movement and timing, and keeps a separate bot score. coss.com only sees automation markers and your captcha's answer.",
    },
    {
      title: "You protect native apps",
      body: "Castle has iOS, Android, React Native and Flutter SDKs, with jailbreak and emulator detection. coss/device runs in browsers only.",
    },
    {
      title: "Account takeover is what you're defending against",
      body: "An account takeover score at login, with signals for new devices, device types, ISPs, operating systems and languages. coss.com looks at new countries and networks, velocity and reported identifiers.",
    },
    {
      title: "You want signals from beyond your own traffic",
      body: "Castle draws on crowd-wide statistics. coss.com's memory of what it has seen is separate per environment, so a new environment starts empty, apart from public IP data and its email checks.",
    },
    {
      title: "You need VPN and proxy data per address",
      body: "Castle flags VPNs, proxies and residential proxies. coss.com mostly infers VPNs from the network and has no residential proxy signal unless it holds address-level data.",
    },
    {
      title: "Your security review asks for SOC 2",
      body: "Castle lists SOC 2 Type II on its trust page.",
    },
  ],
  chooseCoss: [
    {
      title: "No per-assessment bill",
      body: "Assessments are part of every coss.com plan, within the rate limit per API key. Castle's Free and Pro plans count each request against a usage budget, at 1 and 5 requests a second.",
    },
    {
      title: "Decisions you can read and tune",
      body: "Each assessment lists its reasons, your lists and rules decide before the score, and calibration shows how often each reason was right on your own traffic. coss.com only suggests new weights: you choose which to apply.",
    },
    {
      title: "It reads what people write",
      body: "Pass a bio, a listing or a message, and it's scored for spam, phishing, malware and fraud without the text being stored. Phone checks give the line type and carrier on their own.",
    },
    {
      title: "No browser fingerprinting",
      body: "coss/device keeps a random id in localStorage and nothing from canvas, WebGL, fonts or audio. It costs accuracy, since clearing storage looks like a new browser, and it's less for you to explain to your users.",
    },
    {
      title: "Sits next to the rest of your stack",
      body: "One API key and SDK with email, SMS, Forms and Verify. Forms and Verify already use Risk's signals, and rate limiting is on the same account.",
    },
  ],
  migration: [
    {
      title: "Swap the browser token",
      body: "castle.createRequestToken() becomes collectDevice() from coss/device, sent to your server with the form. Native apps have no equivalent, so assess them without a device token.",
      href: "/docs/risk/devices",
    },
    {
      title: "Replace the server calls",
      body: '$registration becomes event: "signup", $login becomes "login", and $transaction becomes "checkout". Act on decision instead of policy.action, treating review the way you treated challenge. Keep failing open on errors.',
      href: "/docs/risk",
    },
    {
      title: "Move policies to rules and lists",
      body: "Recreate each policy as a rule, or as a threshold if it only tests a score, and add list entries with coss.risk.lists.add(). Rules see the fields and reasons coss.com has, which aren't Castle's signals one for one.",
      href: "/docs/risk/rules",
    },
    {
      title: "Report outcomes as you go",
      body: "coss.com starts with no history of your users. Send feedback on confirmed fraud and chargebacks so the same mailbox, card or browser is flagged next time, and run both services side by side until you trust the decisions.",
      href: "/docs/risk/lists-and-feedback",
    },
  ],
  faq: [
    {
      question: "How much does coss.com Risk cost?",
      answer: `Assessments and email, IP and content checks are part of every plan, up to ${apiKeyRate("risk.assess")}. Live phone checks cost ${rateText("risk.phone_checks")} once they get an answer, and every plan includes ${includedUnitsText("risk.phone_checks")}.`,
    },
    {
      question: "Does coss.com fingerprint browsers like Castle does?",
      answer:
        "No. coss/device keeps a random id in localStorage with coarse facts and automation markers, and uses no canvas, WebGL, font or audio fingerprinting. A browser with cleared storage looks like a new one, and the token isn't signed, so treat it as one hint among others.",
    },
    {
      question: "Can coss.com Risk protect a mobile app?",
      answer:
        "Your server can assess events from any client, using the email, IP, user and velocity signals. There's no native device SDK: coss/device is browser-only. Castle has iOS, Android, React Native and Flutter SDKs.",
    },
    {
      question: "Does coss.com Risk cover payments?",
      answer:
        "Yes. A checkout event takes the amount and what your processor knows about the card: its fingerprint, country and funding. coss.com compares countries, counts checkouts per card, and remembers cards you report as fraud. It never takes a card number.",
    },
    {
      question: "What happens if a signal is slow or unavailable?",
      answer:
        "The assessment is made without it, and the missing group is listed in degraded. If the API can't be reached at all, your code decides, and the docs recommend failing open.",
    },
    {
      question: "Does coss.com share fraud data between customers?",
      answer:
        "No. What an environment remembers for velocity, duplicates and fraud reports stays in that environment, as keyed hashes. Castle's scoring draws on crowd-wide statistics.",
    },
  ],
  sources: [
    { label: "Castle pricing", href: "https://castle.io/pricing/" },
    { label: "Castle", href: "https://castle.io/" },
    { label: "Castle trust", href: "https://castle.io/trust/" },
    {
      label: "Castle docs: integration guide",
      href: "https://docs.castle.io/docs/integration-guide.md",
    },
    { label: "Castle docs: risk scoring", href: "https://docs.castle.io/docs/risk-scoring.md" },
    {
      label: "Castle docs: signals reference",
      href: "https://docs.castle.io/docs/signals-reference.md",
    },
    {
      label: "Castle docs: device fingerprinting",
      href: "https://docs.castle.io/docs/device-fingerprinting.md",
    },
    {
      label: "Castle docs: transactions",
      href: "https://docs.castle.io/docs/transaction-activity.md",
    },
    { label: "Castle docs: policies", href: "https://docs.castle.io/docs/creating-a-policy.md" },
    { label: "Castle docs: lists", href: "https://docs.castle.io/docs/lists.md" },
    {
      label: "Castle docs: sandbox environments",
      href: "https://docs.castle.io/docs/sandbox-environments.md",
    },
  ],
};

const UNKEY: Competitor = {
  slug: "unkey",
  name: "Unkey",
  products: ["rate-limiting"],
  query: "Unkey rate limiting alternative",
  verdict:
    "Unkey has per-user overrides and regional counters. coss.com's limiter keeps named buckets with a separate burst, on your coss.com API key.",
  lede: "Both are hosted: you make an HTTP call with an identifier and get back whether to let the request through, with no Redis of your own. Unkey's standalone API takes the limit in each request, counts in a sliding window per region, and comes with overrides and API key management. coss.com's limiter keeps named buckets in one store, using GCRA with a separate burst, and is part of your plan next to Risk.",
  checked: CHECKED,
  rows: [
    {
      label: "Price",
      coss: "No per-check price: part of every coss.com plan",
      them: "Free: 150,000 valid requests a month. Pro: $25 a month for 250,000, up to $1,000 for 100,000,000; over-limit checks aren't billed",
      note: "One quota, shared with key verifications",
    },
    {
      label: "Rate of checks",
      coss: apiKeyRate("risk.limit"),
      them: "—",
      note: "No figure in Unkey's docs",
    },
    {
      label: "How a limit is set",
      coss: "A named bucket, created once in the dashboard or the API; each check names the bucket and a key",
      them: "limit and duration sent with every request; the namespace is created on first use",
    },
    {
      label: "Changing a limit",
      coss: "Update the bucket, and the next check uses it",
      them: "Change the code, or add an override, which takes about a minute to apply",
    },
    {
      label: "Limits per customer",
      coss: "One rule per bucket: make a bucket per tier, up to 100 per environment",
      them: "Overrides per identifier or wildcard pattern (*@acme.com)",
    },
    {
      label: "Algorithm",
      coss: "GCRA, with a burst set apart from the steady rate",
      them: "Sliding window; remaining is a close estimate",
    },
    {
      label: "Period",
      coss: "1 second to 1 day",
      them: "1 second to 30 days",
    },
    {
      label: "Cost per check",
      coss: "1 or more tokens",
      them: "0 or more: 0 reads without counting",
    },
    {
      label: "Several limits at once",
      coss: "—",
      note: "coss.com checks one bucket per call",
      them: "multiLimit: up to 100 checks, none counted if any fails",
    },
    {
      label: "Where it counts",
      coss: "One central store: every check sees the same count, and checks far from it take longer",
      them: "Regional counters that share counts within moments; a short burst can pass while traffic is split across regions",
    },
    {
      label: "Repeat offenders",
      coss: "Every check is a request",
      them: "The TypeScript SDK answers blocked identifiers from memory until reset",
    },
    {
      label: "When it can't count",
      coss: "on_failure per bucket: allow (default) or deny, with degraded: true. If the API can't be reached, your code decides",
      them: "The API returns an error and your code decides; the TypeScript SDK denies after 5 seconds unless you set a fallback",
    },
    {
      label: "Retried checks",
      coss: "The SDK sends an Idempotency-Key, and a retried check is charged once",
      them: "—",
      note: "Not documented on Unkey's rate limiting pages",
    },
    {
      label: "What's recorded",
      coss: "A keyed hash of each key; a log line per request with the key redacted; no per-identifier analytics",
      them: "Each check in rate limit analytics, with a query API; a header keeps a call out of them",
    },
    {
      label: "Self-hosting",
      coss: "—",
      them: "Source-available under FSL-1.1-ALv2, with self-hosting allowed",
    },
    {
      label: "Also on the same account",
      coss: "Risk assessments, email, SMS, Verify, Forms, Hooks",
      them: "API keys and identities, Compute",
    },
  ],
  chooseThem: [
    {
      title: "You give some customers different limits",
      body: "An override changes one identifier or a wildcard pattern without a deploy, which suits per-customer deals. coss.com has one rule per bucket, so tiers mean separate buckets and code to pick one.",
    },
    {
      title: "Your traffic is global",
      body: "Unkey decides in the region that sees the request. coss.com counts in one central store, so checks from far away take longer.",
    },
    {
      title: "You check several limits per request",
      body: "multiLimit checks up to 100 limits in one call and counts none of them if any fails. With coss.com, that's one call per bucket, and each counts on its own.",
    },
    {
      title: "You also issue API keys",
      body: "Unkey's keys and identities carry limits checked at verification. coss.com doesn't offer API keys for your own product.",
    },
    {
      title: "You need windows longer than a day, or to run it yourself",
      body: "Unkey's durations go up to 30 days, and its code is source-available with self-hosting allowed. coss.com's periods stop at a day, and it's offered as a hosted service.",
    },
  ],
  chooseCoss: [
    {
      title: "No meter",
      body: "Checks are part of every coss.com plan, so a limiter on a busy endpoint doesn't add a line to your bill.",
    },
    {
      title: "Bursts as their own setting",
      body: "With limit: 10, period_seconds: 60 and burst: 30, a key can make 30 requests at once and then 10 a minute.",
    },
    {
      title: "The numbers live outside your code",
      body: "Code names a bucket. Its limit, burst and failure mode are in the dashboard and the API, and the next check uses them, with no deploy.",
    },
    {
      title: "Retries don't double-spend",
      body: "The SDK retries network errors with the same Idempotency-Key, so a flaky connection never spends a user's tokens twice.",
    },
    {
      title: "Keys stay hashed",
      body: "coss.com keeps only a keyed hash of each key, so email addresses and IP addresses you limit by aren't stored.",
    },
    {
      title: "Next to Risk",
      body: "A limit answers how often and an assessment answers who, on one API key: limit password resets per address, and assess sign-ups with velocity across your environment.",
    },
  ],
  migration: [
    {
      title: "Turn each limit into a bucket",
      body: "Each namespace, limit and duration you use becomes coss.risk.limitBuckets.create({ name, limit, period_seconds }). Durations go from milliseconds to seconds, up to a day, with on_failure set to what you want during an outage.",
      href: "/docs/risk/rate-limits",
    },
    {
      title: "Swap the check",
      body: "unkey.ratelimit.limit({ namespace, identifier, limit, duration }) becomes coss.risk.limit({ bucket, key, cost }). success becomes allowed, and reset (a timestamp) becomes reset_ms (from now), with retry_after_ms when denied. Counts start from zero.",
      href: "/docs/risk/rate-limits",
    },
    {
      title: "Replace overrides",
      body: "Overrides have no equivalent: make a bucket per tier and choose one by the customer's plan. multiLimit becomes one call per bucket.",
      href: "/products/rate-limiting",
    },
  ],
  faq: [
    {
      question: "Do I have to run Redis for either one?",
      answer:
        "No. Both count in their own store and answer over HTTP. A denied check is a 200 on both, so read allowed on coss.com and success on Unkey.",
    },
    {
      question: "What does coss.com's rate limiting cost?",
      answer: `It has no per-check price: it's part of every plan, up to ${apiKeyRate("risk.limit")}. Unkey meters standalone rate limit operations against a monthly quota shared with key verifications, and over-limit checks aren't billed.`,
    },
    {
      question: "Does coss.com have overrides for individual customers?",
      answer:
        "No. A bucket has one rule for every key. Make one bucket per tier and pick it in your code. Unkey's overrides set a different limit per identifier or wildcard pattern.",
    },
    {
      question: "Is it as fast as a multi-region limiter?",
      answer:
        "Not everywhere. coss.com counts in one central store, so checks from far away take longer, and every check sees the same count. Unkey decides in each region and shares counts within moments, so a short burst can pass when traffic is split.",
    },
    {
      question: "What happens when the limiter is down?",
      answer:
        "On coss.com, each bucket's on_failure says whether to allow or deny while its store is down, and the answer has degraded: true. If the API itself can't be reached, the call fails and your code decides. On Unkey, the check returns an error and your code decides, and its TypeScript SDK has a fallback.",
    },
  ],
  sources: [
    { label: "Unkey pricing", href: "https://www.unkey.com/pricing" },
    {
      label: "Unkey docs: rate limiting overview",
      href: "https://www.unkey.com/docs/api-management/ratelimiting/overview.md",
    },
    {
      label: "Unkey docs: how rate limiting works",
      href: "https://www.unkey.com/docs/api-management/ratelimiting/how-it-works.md",
    },
    {
      label: "Unkey docs: limit and multiLimit",
      href: "https://www.unkey.com/docs/api-management/ratelimiting/limit-and-multi-limit.md",
    },
    {
      label: "Unkey docs: overrides",
      href: "https://www.unkey.com/docs/api-management/ratelimiting/overrides.md",
    },
    {
      label: "Unkey docs: TypeScript SDK",
      href: "https://www.unkey.com/docs/api-management/sdks/typescript/ratelimit.md",
    },
    { label: "Unkey docs: usage", href: "https://www.unkey.com/docs/platform/billing/usage.md" },
    { label: "unkey on GitHub", href: "https://github.com/unkeyed/unkey" },
  ],
};

export const TRUST_COMPETITORS: readonly Competitor[] = [NYLAS_SCHEDULER, CASTLE, UNKEY];
