# coss

The official TypeScript SDK for coss.com: one API key for email, marketing, inboxes, SMS, Verify, Sign, Forms,
Scheduling, Hooks and Risk.

```sh
npm install coss
```

Published from [cosscom/coss](https://github.com/cosscom/coss) by CI, with
[provenance](https://docs.npmjs.com/generating-provenance-statements). Versions 0.0.1–0.0.5 of the npm package
are an earlier, unrelated package by a previous owner (deprecated).

- Zero dependencies (React Email support is an optional peer), ESM-only, fully typed.
- One client for every product: `coss.email`, `coss.inboxes`, `coss.sms`, `coss.verify`, `coss.sign`,
  `coss.forms`, `coss.scheduling`, `coss.hooks` and `coss.risk`, plus `coss.domains`,
  `coss.webhookEndpoints`, `coss.reputation`, `coss.logs` and `coss.billing`.
- Every method returns `{ data, error }`. API and network failures are returned, never thrown.
- Retries transient failures automatically, and sends are idempotent.

## Quick start

```ts
import { Coss } from "coss";

const coss = new Coss({ apiKey: process.env.COSS_API_KEY });

const { data, error } = await coss.email.send({
  from: "Acme <onboarding@example.com>",
  to: "delivered@example.com",
  subject: "Hello from coss.com",
  html: "<p>It works!</p>",
});

if (error) {
  console.error(error.type, error.code, error.message, error.request_id);
} else {
  console.log(data.id, data.status); // "email_01k…", "queued" (sent moments later)
}

const { data: email } = await coss.email.get("email_01k…");
console.log(email?.recipients); // [{ address: "user@example.com", type: "to", status: "delivered", … }]

const { data: events } = await coss.email.listEvents("email_01k…"); // email.sent, email.delivered, …
```

Keys come in two kinds. `coss_live_…` keys belong to a project's **production** environment and
deliver email from your organization's verified domains. `coss_test_…` keys belong to
**development**: nothing is delivered, every email is recorded with `sandbox: true`, and delivery
events are simulated (send to `bounce@simulator.amazonses.com` or `complaint@…` to test failures).

Request and response fields use the API's snake_case names, such as `reply_to` and `created_at`.

A runnable example lives in [`examples/send-email.ts`](./examples/send-email.ts):

```sh
COSS_API_KEY=coss_test_… COSS_BASE_URL=http://localhost:3001 bun packages/sdk/examples/send-email.ts
```

## Options

```ts
new Coss({
  apiKey: "coss_test_…",           // default: process.env.COSS_API_KEY
  baseUrl: "https://api.coss.com", // default: process.env.COSS_BASE_URL, then https://api.coss.com
  timeout: 30_000,                 // per attempt, in ms
  maxRetries: 2,                   // 0 disables retries
  fetch: customFetch,              // default: the global fetch
  apiVersion: "2026-10-10",        // default: API_VERSION, the version these types describe
  dangerouslyAllowBrowser: false,
});
```

The constructor throws in only two cases, both programmer errors:
- No API key is found.
- It runs where a `document` global exists (a browser, or a jsdom or happy-dom test environment)
  without `dangerouslyAllowBrowser: true`.

API keys are secrets, so call coss.com from your server.

Each method also takes per-request options:

```ts
await coss.email.send(params, { idempotencyKey: "welcome-user_123", signal: controller.signal });
await coss.email.get(id, { signal });
```

## API versions

The API is versioned by date. Every request sends a `Coss-Version` header: by default `API_VERSION`,
the version this SDK's types describe, so upgrading the SDK is how you upgrade the API version.
Your organization's pinned version (which applies to plain HTTP requests without the header) never
affects the SDK. Every response says which version it was rendered in, in its `Coss-Version` header.

Webhook endpoints have their own `api_version`. Created through the SDK, it defaults to the client's
version, so events match the `WebhookEvent` types. Each event carries it as `api_version`. After an
SDK upgrade that moves `API_VERSION`, update your endpoints too:

```ts
import { API_VERSION } from "coss";

await coss.webhookEndpoints.update("whep_01k…", { api_version: API_VERSION });
```

## React Email

Pass a [React Email](https://react.email) component as `react` instead of `html`. The SDK renders it
with `@react-email/render`, an optional peer dependency you install yourself (with `react` and
`react-dom`, which your components need anyway):

```sh
npm install @react-email/render
```

```tsx
import { WelcomeEmail } from "./emails/welcome";

await coss.email.send({
  from: "Acme <hello@acme.com>",
  to: "ada@example.com",
  subject: "Welcome to Acme",
  react: <WelcomeEmail name="Ada" />,
});
```

The component becomes `html`, and `text` too unless you pass your own. Rendering happens once, before
the first attempt, so retries resend the same body. `sendBatch` renders each email's `react` the same way.
Nothing throws: `react` together with `html` returns `validation_error`, a missing
`@react-email/render` returns `react_renderer_missing`, and a component that throws returns
`react_render_failed`, all `invalid_request_error`s with `param` naming the email (`react`,
`emails.3.react`) and no request made. The SDK itself still has no dependencies: the renderer is imported
only by a send that has `react`.

## Attachments

Attach up to 20 files (25 MB combined) as base64. The content type defaults from the extension.
A `content_id` makes an attachment inline, so the HTML can reference it as `cid:…`:

```ts
import { readFile } from "node:fs/promises";

await coss.email.send({
  from: "Acme <billing@acme.com>",
  to: "user@example.com",
  subject: "Your invoice",
  html: '<img src="cid:logo@acme" alt="Acme"><p>Your invoice is attached.</p>',
  attachments: [
    { filename: "invoice.pdf", content: (await readFile("invoice.pdf")).toString("base64") },
    { filename: "logo.png", content: logoBase64, content_id: "logo@acme" },
  ],
});
```

Emails only return attachment metadata (`id`, `filename`, `content_type`, `content_id`, `size`).
coss.com discards the content once the email is sent. Executables and other file types the delivery
provider refuses (`.exe`, `.js`, `.bat`, …) are rejected with a `validation_error`.

## Domains

Live keys can only send from a verified domain. Domains belong to the **organization**, so a
`coss_test_…` key manages the same list a `coss_live_…` key does.

```ts
const { data: domain } = await coss.domains.create({ name: "acme.com" });

// Publish these, then check them. `records` carries the result of the last check.
for (const record of domain?.records ?? []) {
  console.log(record.type, record.name, record.value, record.status); // "CNAME", "…", "…", "missing"
}

const { data: checked } = await coss.domains.verify(domain!.id);
console.log(checked?.status, checked?.can_send); // "verified", true

await coss.domains.list();
await coss.domains.get(domain!.id);
await coss.domains.delete(domain!.id);
```

`verify` asks the provider and DNS right away instead of waiting for the background check, so it is
rate limited: a second call within a few seconds answers `429` (the SDK waits out `Retry-After` and
retries). Verification gives up after 72 hours and the domain becomes `failed`; calling `verify`
again then starts over with fresh DKIM records, which have to be published too. The `dmarc` record
is recommended rather than required (`required: false`). `bimi` reports whether mailbox providers can show
your brand logo (your own BIMI record and VMC or CMC certificate, with DMARC at enforcement).

## Webhook endpoints

Endpoints belong to the API key's own **environment**, so sandbox and production receivers stay
separate. The signing secret is returned only when the endpoint is created.

```ts
const { data: endpoint } = await coss.webhookEndpoints.create({
  url: "https://example.com/webhooks/coss",
  description: "Billing service",
  event_types: ["email.bounced", "email.complained"], // omit for every event type
});
console.log(endpoint?.secret); // "whsec_…" — store it now, it is not returned again

await coss.webhookEndpoints.update(endpoint!.id, { enabled: false }); // pause without deleting
await coss.webhookEndpoints.list();
await coss.webhookEndpoints.get(endpoint!.id);
await coss.webhookEndpoints.delete(endpoint!.id);
```

`update` only changes the fields you pass, and never the signing secret, so receivers keep
verifying deliveries. `event_types: []` means every event type, including ones added later.

## Scheduled sends

Pass `scheduled_at` (ISO 8601 with an offset, at most 30 days ahead) to send later. The email
comes back with the status `scheduled` and is sent at that time; a time that is not in the future
sends immediately.

```ts
const { data: email } = await coss.email.send({
  ...params,
  scheduled_at: "2026-10-11T09:00:00Z", // or new Date(…).toISOString()
}); // { status: "scheduled", scheduled_at: "2026-10-11T09:00:00.000Z", … }

// Until it is sent, move it to another time (at most 30 days ahead; a past time sends it now)…
await coss.email.reschedule(email.id, { scheduled_at: "2026-10-12T09:00:00Z" });
// …or cancel it.
const { error } = await coss.email.cancel(email.id); // status "canceled"
// error?.code === "email_not_cancelable" (or "email_not_reschedulable") once it is being sent,
// was sent or, for reschedule, was canceled.
```

Scheduling, rescheduling and canceling are recorded as `email.scheduled`, `email.rescheduled`
(with the new and previous times in `data.reschedule`) and `email.canceled` events (and webhooks).

## Suppressions

Each environment has a suppression list. Sends skip suppressed recipients: they get the status
`suppressed` and an `email.suppressed` event, and the rest of the email is still sent. Permanent
bounces and spam complaints add an address for every email (`scope: "*"`) automatically.

An entry can also cover a single category. That makes the list a good backend for unsubscribe
links:

```ts
// The recipient unsubscribed from marketing email.
await coss.email.suppressions.add({ address: "jane@example.com", scope: "marketing" });

// Skipped: the email has the suppressed category.
await coss.email.send({ ...params, to: "jane@example.com", category: "marketing" });
// Delivered: receipts are not suppressed.
await coss.email.send({ ...params, to: "jane@example.com", category: "receipts" });

const { data: check } = await coss.email.suppressions.check({
  address: "jane@example.com",
  category: "marketing",
}); // { suppressed: true, suppressions: [{ id: "sup_01k…", scope: "marketing", … }] }

const { data: page } = await coss.email.suppressions.list({ limit: 50 }); // newest first
// Next page: list({ after: page.data.at(-1).id }) while page.has_more.
await coss.email.suppressions.remove("sup_01k…"); // e.g. when they resubscribe
```

Move whole lists in and out in bulk. `import` sends 1,000 entries per request and adds up the
results; invalid entries are skipped and reported by their position, and entries already on the
list are left unchanged, so importing again is safe:

```ts
const { data: result } = await coss.email.suppressions.import({
  suppressions: [{ address: "jane@example.com" }, { address: "joe@example.com", scope: "marketing" }],
}); // { created: 2, existing: 0, invalid: [] }

// CSV with the columns address,scope,reason,created_at,email_id,id (oldest first).
const { data: csv } = await coss.email.suppressions.export({ reason: "bounce" });
```

Imported entries have the reason `import`. The dashboard imports and exports the same CSV.

### Open and click tracking

Tracking is off unless the environment turns it on in the dashboard (a default, plus rules per
category) or a send asks for it. coss.com then adds an invisible image to the HTML body and sends its
links through a redirect. Links with a `data-coss-no-track` attribute are left as they are.

```ts
const { data: sent } = await coss.email.send({
  ...params,
  html: '<p><a href="https://acme.com/start">Get started</a></p>',
  tracking: { opens: true, clicks: true }, // overrides the environment's settings for this email
});

const { data: email } = await coss.email.get(sent.id);
console.log(email?.tracking); // { opens: true, clicks: true, open_count: 1, click_count: 0, … }

const { data: links } = await coss.email.listLinks(sent.id);
// [{ url: "https://acme.com/start", click_count: 0, … }]
```

Opens and clicks arrive as `email.opened` and `email.clicked` events (in `listEvents` and in
webhooks), with `data.open` / `data.click`. They name a recipient only when the email had exactly
one. Mail clients that preload images and link scanners can inflate the numbers.

## Marketing email

Contacts belong to an environment. Each has an `email`, names, a `status` (`subscribed`,
`unsubscribed`, or `pending` while waiting for a double opt-in confirmation), custom properties you
define first, and a choice per topic. Audiences are static lists of contacts; segments are saved
filters over them.

```ts
await coss.email.contacts.properties.create({ key: "plan", type: "string", fallback: "free" });

// Creates the contact for this address, or updates it (201 vs 200).
const { data: contact } = await coss.email.contacts.upsert({
  email: "ada@example.com",
  first_name: "Ada",
  properties: { plan: "pro" },
  topics: [{ topic: "newsletter", status: "opted_in" }],
  // Stays `pending` until they click the confirmation email's link (sent from the marketing
  // settings' `confirmation_from`).
  double_opt_in: true,
});

// Up to 1,000 per request; the SDK sends larger lists in batches.
await coss.email.contacts.import({
  contacts: [{ email: "joe@example.com", properties: { plan: "free" } }],
  audience_id: "aud_01k…",
});
const { data: csv } = await coss.email.contacts.export();
```

A single marketing email goes to one recipient with `stream: "marketing"`. It needs your postal
address (`coss.email.marketingSettings.update({ mailing_address: "…" })`), and coss.com adds
one-click unsubscribe headers and a footer. Contacts who unsubscribed, or opted out of the email's
topic (its `category`), are skipped.

```ts
await coss.email.send({
  from: "Acme <news@acme.com>",
  to: "ada@example.com",
  subject: "You're invited",
  html: "<p>Join us on Thursday.</p>",
  stream: "marketing",
  category: "events",
});
```

### Broadcasts

A broadcast sends one email to every eligible contact of an audience or a segment, each filled in
with their own values (`{{{contact.<key>|fallback}}}`), at your plan's marketing rate or slower.

```ts
const { data: broadcast } = await coss.email.broadcasts.create({
  name: "October newsletter",
  segment_id: "seg_01k…",
  topic: "newsletter",
  from: "Acme <news@acme.com>",
  subject: "What's new, {{{contact.first_name|there}}}",
  html: "<p>Hi {{{contact.first_name|there}}}, …</p>",
});
await coss.email.broadcasts.test(broadcast.id, { to: ["me@acme.com"] });
await coss.email.broadcasts.send(broadcast.id, { scheduled_at: "2026-11-01T09:00:00Z" });

const { data: sent } = await coss.email.broadcasts.get(broadcast.id);
// sent.stats: { recipients, sent, delivered, bounced, complained, opened, clicked, unsubscribed, … }
await coss.email.broadcasts.pause(broadcast.id); // then resume() or cancel()
```

Guides: [contacts](https://coss.com/docs/email/contacts),
[audiences and segments](https://coss.com/docs/email/audiences-and-segments),
[topics and preferences](https://coss.com/docs/email/topics-and-preferences),
[broadcasts](https://coss.com/docs/email/broadcasts) and
[streams](https://coss.com/docs/email/streams).

## Inboxes

Give an AI agent its own email address. Mail to it arrives as threads, with an
`inbox.message.received` webhook for each message, and the agent replies from the same address.

```ts
const { data: inbox } = await coss.inboxes.create({
  username: "support-agent",
  client_id: "agent-42", // your own id: creating it again returns this inbox
});

const { data: thread } = await coss.inboxes.threads.get(inbox!.id, "thread_01k…");
await coss.inboxes.messages.reply(inbox!.id, "imsg_01k…", { text: "On it." });
```

Guide: [coss.com/docs/inboxes](https://coss.com/docs/inboxes).

## SMS

Text messages from your organization's registered numbers. Sandbox keys accept any `from` and
simulate every outcome.

```ts
const { data: sms } = await coss.sms.send({
  from: "+14155550123",
  to: "+14155550199",
  body: "Your order has shipped.",
}); // { status: "queued", … }; follow it with coss.sms.get(id) or the sms.* webhooks

await coss.sms.received.list(); // replies to your numbers
```

Guide: [coss.com/docs/sms](https://coss.com/docs/sms).

## Verify

One-time codes by SMS or email. coss.com makes the code, sends it, counts the attempts and expires it.

```ts
await coss.verify.start({ to: "+14155550123", ip: userIp }); // an address sends the code by email
const { data: check } = await coss.verify.check({ to: "+14155550123", code: "482913" });
if (check?.valid) {
  // The number is theirs.
}
```

Sandbox codes are always zeros. Live SMS codes need a sender while coss.com's shared numbers roll out:
without one the call fails with `503 shared_sender_unavailable`, so set one of your registered numbers
with `coss.verify.settings.update({ sms_from: "+14155550100" })`.

Guide: [coss.com/docs/verify](https://coss.com/docs/verify).

## Sign

E-signatures on your PDFs. Signers sign from a link coss.com emails them or inside your app, and
everyone signing produces a sealed PDF.

```ts
const { data: request } = await coss.sign.requests.create({
  title: "Services agreement",
  documents: [{ filename: "agreement.pdf", content: pdfBase64 }],
  signers: [
    {
      name: "Ada Lovelace",
      email: "ada@example.com",
      fields: [{ type: "signature", anchor: "{{signature:signer_1}}" }],
    },
  ],
});

const { data: pdf } = await coss.sign.requests.signedDocument(request!.id); // once it has completed
```

Guide: [coss.com/docs/sign](https://coss.com/docs/sign). `coss/sign`'s `mountSigning` opens the
signing page in your own page.

## Forms

An endpoint for each form on your site: every submission is screened, then goes to your webhooks,
your team by email and your contacts.

```ts
const { data: form } = await coss.forms.create({
  name: "Contact us",
  allowed_origins: ["https://www.example.com"],
  notifications: { recipients: ["support@example.com"] },
});
console.log(form?.endpoint); // point your <form action> at it

await coss.forms.submissions.list(form!.id);
```

Guide: [coss.com/docs/forms](https://coss.com/docs/forms).

## Scheduling

Let your users be booked, with their calendars, time zones and double-booking handled.

```ts
const { data: slots } = await coss.scheduling.slots.list("evtype_01k…", {
  start: "2027-01-04T00:00:00Z",
  end: "2027-01-11T00:00:00Z",
});

const { data: booking, error } = await coss.scheduling.bookings.create({
  event_type: "evtype_01k…",
  start: slots!.data[0]!.start,
  attendee: { name: "Sam Lee", email: "sam@example.com", time_zone: "America/Chicago" },
}); // error?.code === "slot_unavailable" when the time has gone
```

Guide: [coss.com/docs/scheduling](https://coss.com/docs/scheduling).

## Hooks

Webhooks as a service: send a message to one of your customers, and coss.com delivers it to every
endpoint they registered, signed and retried.

```ts
await coss.hooks.applications.create({ name: "Acme Corp", uid: "customer_8812" });
await coss.hooks.endpoints.create("customer_8812", { url: "https://acme.example/webhooks" });

await coss.hooks.messages.send({
  application: "customer_8812",
  event_type: "invoice.paid",
  payload: { invoice_id: "in_1042", amount: 4200 },
});

const { data: portal } = await coss.hooks.portal.createSession({ application: "customer_8812" }); // portal.url: their own page
```

Guide: [coss.com/docs/hooks](https://coss.com/docs/hooks).

## Risk

Ask whether a sign-up, login or other event looks like abuse, and why. Each signal and a rate limiter
are available on their own too.

```ts
const { data: assessment } = await coss.risk.assess({
  event: "signup",
  user: { email: "ada@example.com" },
  ip: clientIp,
});
if (assessment?.decision === "block") {
  // "allow", "review" or "block", with the score and reasons behind it.
}

await coss.risk.checkEmail("ada@example.com");
await coss.risk.limit({ bucket: "signups", key: clientIp });
```

Guide: [coss.com/docs/risk](https://coss.com/docs/risk).

## Reputation

coss.com watches your live bounce and complaint rates. When one gets too high your organization is
warned, and past the suspension threshold live sending is suspended automatically (sends fail with
`permission_error` / `account_suspended`; sandbox keys keep working) until coss.com support reinstates it.

```ts
const { data } = await coss.reputation.get();
// { status: "warning", reason: "bounce_rate", checks: [{ trigger: "bounce_rate", rate: 0.051, … }], … }
```


## Webhooks

Webhook endpoints receive each product's events (`sms.*`, `verification.*`, `sign_request.*`,
`form.submission.*`, `scheduling.booking.*`, `inbox.message.received`, `risk.assessment.review`, …) and
`email.sent`, `email.delivered`, `email.delivery_delayed`,
`email.bounced`, `email.complained`, `email.failed`, `email.suppressed`, `email.opened` and
`email.clicked` events, plus `account.reputation_warning`, `account.reputation_recovered`,
`account.suspended`, `account.reinstated`, `account.marketing_paused` and
`account.marketing_reinstated` for live environments, signed with
[Standard Webhooks](https://www.standardwebhooks.com) headers. Verify them with the raw body:

```ts
import { verifyWebhook, WebhookVerificationError } from "coss";

export async function POST(request: Request) {
  try {
    const event = await verifyWebhook(await request.text(), request.headers, process.env.COSS_WEBHOOK_SECRET!);
    if (event.type === "email.bounced") console.log(event.data.recipient, event.data.bounce);
    if (event.type === "account.suspended") console.log(event.data.reason, event.data.checks);
    return new Response("ok");
  } catch (error) {
    if (error instanceof WebhookVerificationError) return new Response("invalid", { status: 400 });
    throw error;
  }
}
```

Unlike other methods, `verifyWebhook` throws. Deliveries are retried for about a day and may arrive
out of order (use `data.occurred_at`) or more than once (deduplicate by `event.id`).

## Errors

`error` is a plain object:

```ts
interface CossError {
  type: CossErrorType;
  code: string;               // e.g. "invalid_api_key", "validation_error"
  message: string;
  status: number | null;      // null when no response was received
  request_id: string | null;  // include it when contacting support
  param?: string;
  issues?: { path: string; message: string }[]; // per-field validation problems
}
```

| `type`                  | Status            | Meaning                                                           |
| ----------------------- | ----------------- | ----------------------------------------------------------------- |
| `invalid_request_error` | 400 / 413 / 422   | Malformed JSON, payload too large, or failed validation (`issues`) |
| `authentication_error`  | 401               | `missing_api_key` or `invalid_api_key`                            |
| `permission_error`      | 403               | The key lacks the permission (`insufficient_permissions`)         |
| `not_found_error`       | 404               | No such resource in the key's environment                         |
| `idempotency_error`     | 409 / 422         | `request_in_progress` (retried automatically), or `idempotency_key_reused` with a different body |
| `rate_limit_error`      | 429               | Too many requests with the key (`rate_limited`), the send quota is used up (`quota_exceeded`), or a domain was checked moments ago (`domain_recently_checked`) |
| `api_error`             | 5xx, other        | Server error. Also used for responses that are not a coss.com error envelope (`unexpected_response`) |
| `connection_error`      | —                 | Network failure (`network_error`), or you aborted (`aborted`)      |
| `timeout_error`         | —                 | An attempt exceeded `timeout` (`request_timeout`)                 |

## Retries and idempotency

The SDK retries failed requests up to `maxRetries` times (default 2) on:
- connection errors and timeouts;
- `409`, `429` and `5xx` responses.

Other errors are returned immediately.

`webhookEndpoints.create()` never retries automatically, regardless of `maxRetries`: the API does
not deduplicate endpoint creation, even with an `Idempotency-Key`. If the response is lost, creation
may still have succeeded. List endpoints and delete the endpoint with the unknown secret before
creating a replacement.

The wait between attempts grows exponentially (500 ms, 1 s, 2 s, … up to 8 s) with random jitter. When
the response has a `Retry-After` header, the SDK waits exactly that long instead. If `Retry-After` asks
for more than 60 s, the SDK returns the error rather than waiting.

Every `POST` carries an `Idempotency-Key` header. It is either the key you pass or a random UUID, and
the same key is reused on every retry of that call. For email sends, the API stores the result for 24 hours, so a
retried send is never delivered twice:
- A repeat with the same key and the same body returns the original email.
- A repeat with the same key and a different body fails with `idempotency_key_reused`.

To make a send safe across process restarts too, pass your own key, derived from your data
(for example `welcome-${userId}`).

## Timeouts and cancellation

`timeout` applies to each attempt and covers reading the response body. Pass an `AbortSignal` to
cancel a call. Aborting stops the request in flight and any pending retry, and returns
`{ type: "connection_error", code: "aborted" }`.

## Integrations

To send from libraries you already use, import the matching entry. They need no other package
than the library itself, and they throw a `CossSendError` when coss.com refuses an email.

```ts
// Nodemailer
import nodemailer from "nodemailer";
import { cossTransport } from "coss/nodemailer";
const transporter = nodemailer.createTransport(cossTransport());

// Better Auth: verification, password reset, magic link, one-time code and invitation emails
import { cossEmail } from "coss/better-auth";
const email = cossEmail({ from: "Acme <auth@acme.com>", appName: "Acme" });
// betterAuth({ emailVerification: { sendVerificationEmail: email.sendVerificationEmail }, … })

// Auth.js (NextAuth.js v5): the email provider
import Coss from "coss/authjs";
// NextAuth({ adapter, providers: [Coss({ from: "Acme <auth@acme.com>" })] })
```

Guides: [coss.com/docs/integrations](https://coss.com/docs/integrations).

## Runtime support

The SDK works on Node.js ≥ 22, Bun, Deno and Cloudflare Workers. It only needs the standard `fetch`,
`AbortSignal.timeout`/`AbortSignal.any` and `crypto.randomUUID`. It never uses Node built-ins.

The package is **ESM-only**:
- `import { Coss } from "coss"` works everywhere.
- On Node 22.12+ (and 20.19+), CommonJS can also `require("coss")` because Node supports `require(esm)` there.

Environment fallbacks read `process.env` where it exists. On Workers or Deno without env access,
pass `apiKey` (and `baseUrl`) explicitly.

## Development

```sh
bun run --cwd packages/sdk typecheck  # src (isolatedDeclarations) + tests
bun run --cwd packages/sdk test       # bun:test with a mocked fetch; no network
bun run --cwd packages/sdk build      # tsdown → dist/, then publint and attw
```

`src/version.ts` must match `version` in `package.json`, and a test enforces it. Releases are
prepared with [Changesets](https://github.com/changesets/changesets): add one with `bun run changeset`
for every user-facing change. `bun run version-packages` bumps `package.json`, `src/version.ts` and
`CHANGELOG.md` together, and on `main` CI opens a "Version packages" PR that does the same. Merging it
publishes to npm from CI, never from a laptop.

`src/api-version.ts` mirrors the API's versions. When the API adds one, add it there, move
`API_VERSION` and update the wire types in the same change. The contract tests in `apps/api` check
both.

`tsdown` rewrites the `exports`, `main`, `module` and `types` fields in `package.json` on every
build. The committed values are exactly what it generates.
