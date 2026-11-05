# coss

## 0.12.0

### Minor Changes

- 2012767: Setup and diagnosis know every product. `fetchSetupReport(coss, { product })`, the MCP server's `get_setup` and `coss init --product` say what a product still needs or how to try it in a sandbox, and report `products` and `products_in_use` next to the fields they had. `coss/diagnose` adds SMS, Verify, Sign, Forms, Hooks and Scheduling, as MCP tools (`diagnose_verification`, `diagnose_sign_request`, `diagnose_form_submission`, `diagnose_hook_delivery`, `diagnose_scheduling_slots`) and CLI commands (`coss sms diagnose`, `coss verify diagnose`, `coss sign diagnose`, `coss forms diagnose`, `coss hooks diagnose`, `coss scheduling diagnose`). The MCP server also gets `list_email_templates`, log drain and sub-account tools, `api_get` (a read-only fallback for any `/v1/` path), output schemas on `get_setup` and the diagnose tools, and its first prompts and resources.
- a7ff535: Verify's settings have an API: `coss.verify.settings.get()` and `.update()`. The MCP server gets tools for marketing (contacts, audiences, segments, topics, broadcasts), Verify and Sign, and more for Forms, Scheduling, Hooks and Risk, plus `COSS_MCP_TOOLSETS` to offer fewer of them. The CLI gets `coss verify`, `coss contacts`, `coss broadcasts` and `coss sign`, and more of `coss sms`, `coss forms` and `coss scheduling`.
- 05dd81b: Scheduling's calendar delegations: `coss.scheduling.calendarDelegations` lets an admin authorize a Google Workspace or Microsoft 365 domain once, so every host on it gets their calendar with no consent screen. Hosts gain `calendar_account`, calendar connections gain `delegation`, and there are `scheduling.calendar_delegation.failing` and `.restored` webhooks. `coss open scheduling-calendar-delegation` opens its dashboard page.
- 9e79d10: Billing has a credit limit: `coss.billing.get()` returns `credit_limit` (`limit`, `used`, `charge_threshold`), holds can have the reason `credit_limit`, invoices the kind `threshold` (usage charged early) and credits the source `threshold`.
- 8dacd0f: `BillingMeter` adds `email.attachment_data` and `email.received_data`: attachments and received messages past an email's first MB, billed by the MB.
- 411767c: `coss.environment.get()` and the MCP server's `get_account_status` say whether the organization is in HIPAA mode (`organization.hipaa_mode`). The MCP server explains `hipaa_mode_restriction` refusals.
- 97e84b2: Scheduling hosts have `locations`: their own office, meeting link and phone number. An event type's location that leaves its value blank uses the booked host's.
- 56a7443: Scheduling event types take `max_active_bookings_per_attendee`, which caps how many upcoming bookings one person can have at a time. Booking past it answers `attendee_limit_reached`.
- 17ac7bc: Scheduling bookings have a readable history: `coss.scheduling.bookings.events(id)`, the MCP server's `list_scheduling_booking_events` and `coss scheduling booking-events`. A cancelled booking says who cancelled it in `cancelled_by`, and `bookings.cancel` takes an optional `reason`, which only retrieving that booking returns. `bookings.cancel`'s second argument is now its parameters, and request options moved to the third, as on `series.cancel`.
- 346c63f: Scheduling event types take a `description`, shown on hosted booking pages and never in emails. Its links must be on your organization's verified domains and use `https`.
- 4168d9e: Scheduling slots explain themselves. `coss.scheduling.slots.explain(eventType, { start })`, the MCP server's `explain_scheduling_slot` and `coss scheduling slots explain` say whether one start can be booked right now and, host by host, why not. Slots also carry `seats_left` for group event types.
- f099789: Scheduling bookings can have guests: set an event type's `max_guests`, then pass `guests` when booking. They're emailed about it, and `coss.scheduling.attendees.eraseByEmail()` erases someone known only by their address. An event type's `host_calendar_details: "full"` puts its title and who's coming on hosts' calendars instead of a neutral "Appointment". The MCP server's `create_scheduling_booking` takes `guests`.
- cee7e38: Scheduling hosts take a `locale`, which their notifications are written in. Emails and texts about a booking are now written in the attendee's or host's locale when coss.com has it, and in English otherwise.
- 11286f6: Scheduling settings take a `logo`, shown on the hosted pages and on emails sent from your own address.
- 6d31dd3: Scheduling reminders: `reminders` on `coss.scheduling.settings` and event types say what goes out around a booking, timed from its start, end or any change to it, to attendees, hosts, fixed addresses or a webhook, in your own words if you like. `coss.scheduling.bookings.notifications()` lists what was queued and why anything wasn't sent. New webhooks: `scheduling.booking.started`, `scheduling.booking.ended` and `scheduling.booking.reminder`. Hosts take a `phone`, event types take `notifications`, and settings take `email_reply_to`. The MCP server gets `get_scheduling_reminders`, `save_scheduling_reminders`, `list_scheduling_booking_notifications` and `mark_scheduling_no_show`, and the CLI `coss scheduling reminders`, `notifications` and `no-show`.
- 0101bab: Scheduling: a booker session can take `attributes`, so hosted and embedded bookers can route to a specialist.
- ddf6142: Scheduling: `zoom` as a location, and `provider: "zoom"` when authorizing a host's connection.

### Patch Changes

- fb681ad: Billing's meter type includes `hooks.messages`: live Hooks messages are now billed.
- cbed6ab: Risk: the `Meter` type gains `risk.assessments` and `risk.content_checks`, and `RiskDegradedSignal` gains `usage_limit` (an assessment that ran without velocity, memory or content because the plan's included assessments are used up, or a billing hold or budget applies). `coss.risk.classify()` is billed now, so it is no longer retried automatically.
- 895ef91: Billing: the `scheduling.hosts` meter is new, and the unreleased `video.participant_minutes` is gone.
- 7452381: Avoid regular expressions that slow down on unusual input when trimming base URLs and reading From headers.

## 0.11.0

### Minor Changes

- a951582: Forms: `coss.forms` (create, list, get, update, remove) and `coss.forms.submissions` (list, get,
  remove, release, file) for hosted form endpoints screened by Risk.
- 545d704: `coss/forms`: `attachForm(form)` and `submitForm()` post a form to its coss.com Forms endpoint from
  the browser (JSON answers with errors per field, a `coss/device` token for Risk).
- 09ccfba: Types for Forms: contacts created by a form have `source: "form"`, form submissions log with
  `source: "forms"`, and usage has the `forms.submissions` meter.
- 9d65e49: Forms webhooks: `form.submission.received` and `form.submission.flagged` events
  (`FormSubmissionWebhookEvent`), with the Forms wire types (`Form`, `FormSubmission`, …).
- 95707e1: Log drains: `format` (`ndjson`, `loki`, `datadog`, `otlp`) sends batches straight to Loki (Grafana
  Cloud), Datadog or an OTLP/HTTP collector, and `auth_header` carries the intake's key (encrypted,
  never returned; drains show `auth_header_name`).
- a2ed56a: Adds `coss.scheduling`: hosts, schedules, event types, slots, availability search, bookings, holds, recurring
  series, calendars, sessions and settings. `coss/scheduling` embeds the hosted pages (`mountBooker`,
  `mountHostPortal`).
  
  `coss-mcp` gets tools to list hosts, slots and bookings and to cancel a booking; `coss-cli` gets
  `coss scheduling hosts` and `coss scheduling bookings`.
- b4cb758: OpenTelemetry: with `@opentelemetry/api` installed (an optional peer dependency), every call gets a
  client span and sends its context as `traceparent`. The API stores it on the emails and text
  messages a call sends and echoes it in their log lines and webhooks (`data.traceparent`, typed on
  `EmailWebhookEventData` and `SmsWebhookEventData`). `tracing: false` turns it off.

### Patch Changes

- 9f31e28: Billing: usage can have the `forms.file_uploads` meter (MB of accepted form submissions' files).

## 0.10.0

### Minor Changes

- 0464e77: Email for platforms: `coss.email.subaccounts` creates, reads, updates and deletes sub-accounts, one per user of your platform, each with its own quotas, suppression list and reputation (addressed by id or your own `uid`), and reports their sending per day (`stats`). Sends, batch sends and suppression calls take a `subaccount`, `coss.email.list` filters by it, and emails, suppressions and email webhook events carry `subaccount_id`. Domains can belong to a sub-account (`coss.domains.create({ name, subaccount })`, `coss.domains.list({ subaccount })`), and `coss.domains.update(id, { shared_with_subaccounts })` shares one of your own domains with your sub-accounts; domains carry `subaccount_id` and `shared_with_subaccounts`. `coss.email.subaccounts.reinstate()` lifts a sub-account's reputation pause, and `subaccount.reputation_warning`, `subaccount.reputation_recovered`, `subaccount.paused` and `subaccount.reinstated` webhook events (`SubaccountWebhookEvent`, live only) announce its standing changes.
- 80a9c6f: Inboxes: `coss.inboxes` gives an AI agent its own email address (`create`, `list`, `get`, `update`, `delete`), with received mail kept as threads (`coss.inboxes.threads`) and messages sent and replied from the address (`coss.inboxes.messages.send`, `.reply`). New webhook event `inbox.message.received`.
- 62cdc89: Risk: `coss.risk.checkPhone(phone)` checks a phone number on its own: whether it exists, its line type (mobile, landline, fixed or non-fixed VoIP…), carrier and, where carriers share it, a recent SIM swap.
- 9d4c942: Sign: `coss.sign.requests.remove(id)` deletes a request that isn't `sent`, with its audit trail, signatures and signed document. Billing usage gains the `sign.completed_requests` meter.
- f9f26a4: Add `coss.sign`: upload PDFs (`coss.sign.documents`) and create, send, cancel and read signature requests with their signers, fields (placed by position or text anchor) and hash-chained audit trail (`coss.sign.requests`).
- d55a308: Sign: signers with `delivery: "email"` get their invitation, reminders and signed copy by email. `coss.sign.requests.remind(id)` asks for a reminder now, requests take `reminder_interval_days` and report `expired_at`, settings gain `email_from` and `reminder_interval_days`, and webhooks gain `sign_request.expired`.
- 7e77a8e: Sign: `coss.sign.sessions.create()` makes a signing link for a signer who signs in your app, `coss.sign.settings` reads and changes the signing page's settings (embedding origins, branding, consent text), the new `coss/sign` entry's `mountSigning()` embeds the signing page in an iframe, and webhooks gain the `sign_request.*` events (`SignRequestWebhookEvent`).
- 0718160: Sign: completed requests get a sealed, signed PDF (the documents as signed and a certificate of completion). `SignRequest.signed_document` says when it is ready, `coss.sign.requests.signedDocument(id)` downloads it, and the `sign_request.completed` webhook now arrives once it is ready. The audit trail gains the `sealed` event.
- c0e5c69: Sign: templates (`coss.sign.templates`: documents with fields for roles and merge fields, `createRequest()` to make a request by naming a signer per role) and the embedded template builder (`coss.sign.templates.createBuilderSession()`, `mountBuilder()` from `coss/sign`).
- a85e735: Verify: one-time codes by SMS or email. `coss.verify.start({ to })` sends a code (behind a fraud guard that stops SMS pumping before anything is sent), `coss.verify.check({ to, code })` checks the one the end user typed; also `get`, `list` and `cancel`.
- a4e2b6a: Verify's types: `Verification`, `VerificationCheck` and the `verification.approved`, `verification.failed` and `verification.blocked` webhook events (also in `WEBHOOK_EVENT_TYPES`), and the `verify` log source.

### Patch Changes

- e97dd14: Billing: the `email.received` and `email.inboxes` meters, and the plan's `limits.inboxes`.
- fbdc39f: Billing: the `Meter` type gains `risk.phone_checks` (live phone checks, $0.01 each; every plan includes 100 a month). `coss.risk.checkPhone()` is no longer retried automatically: each answered live check is billed.

## 0.9.0

### Minor Changes

- 57397ff: Setup status for agents, error hints, and one project key.
  
  `describeSetup` reports a from address that will succeed and one next step. API errors can include `hint` (a fix, often with a docs URL), and the SDK copies it onto `CossError`. `coss init` writes agent notes by default, points at the project's mail library or framework driver, and prints that setup. `coss listen` writes `COSS_WEBHOOK_SECRET` into the project env file. `coss-mcp` loads a development key from that file and adds setup, risk, Hooks and template tools.

### Patch Changes

- 2b6c98e: Publish a template and register a webhook endpoint from the tools an agent already uses.
  
  `publish_email_template` publishes the draft revision it just read. `create_webhook_endpoint` and `coss webhooks add` create an endpoint once and write its signing secret to the project env file as `COSS_WEBHOOK_SECRET`. A URL that already has an endpoint is left as it is. `coss init` snippets send to the mailbox simulator from the address setup reports.

## 0.8.0

### Minor Changes

- 2f2c982: Budgets: the `billing.budget_threshold_reached`, `billing.budget_hold_placed` and `billing.budget_hold_lifted` webhook events (a member's, project's or API key's monthly budget), and the `BudgetScope` type. Sends over a budget fail with `billing_error` `budget_exceeded`; a broadcast waits with `pause_reason: "budget_exceeded"`.
- 001c8ed: Content storage: `coss.email.storage` (`get`, `update`) switches an environment to `content_storage: "discard"`, which keeps each email's subject, body, headers, template variables and attachment filenames only until it is sent, fails or is canceled. Emails have `content_storage` (`mode` and `discarded_at`); `EmailContentStorage`, `ContentStorageMode`, `StorageSettings` and `UpdateStorageSettingsParams` are exported.
- 57cc163: Scoped API keys: `coss.environment.get()` now returns the key's `api_key.access` (`full` or `restricted`) and `api_key.permissions` (`resource:action` strings, e.g. `email:send`). The MCP server's `get_account_status` reports them and its permission errors say the key is restricted; `coss whoami` prints the key's access.
- 9d872c0: SMS: `coss.sms.send`, `get`, `list`, `listEvents` and `cancel`, with `coss.sms.suppressions` (`add`, `list`, `check`, `get`, `remove`), `coss.sms.received` (`list`, `get`) and `coss.sms.numbers.list`.
- ce6f1e6: SMS types: `Sms`, `SmsEvent`, `ReceivedSms`, `SmsSuppression`, `SmsNumber` and the `sms.*` webhook events (`SmsWebhookEvent`, `ReceivedSmsWebhookEvent`, part of `WebhookEvent` and `WebhookEventType`); `LogSource` adds `sms`, and `coss.webhookEvents.test()` sends `sms.*` test events.
- 2f2c982: `coss.billing.usage()` takes `group_by: "project" | "api_key" | "user"` (besides `"environment"`), and each usage row has `project_id`, `api_key_id` and `user_id` (`user_id`: the member whose personal API key caused the usage).

### Patch Changes

- ecaa8cc: Billing: the `Meter` type adds `sms.received_segments`, `sms.numbers` and `sms.registrations`.

## 0.7.0

### Minor Changes

- e13f0e4: `coss.email.templates.render(template, { version, locale, variables })` renders a template's draft (or a published version) as a send would, without sending (`POST /v1/email_templates/{id}/render`). The CLI gets `coss domains list|add|get|verify` (DNS records as a table or zone-file lines with `--format bind`; `verify --wait` follows the domain until it's verified) and templates as code: `coss templates list|pull|push|preview` (a folder per template, `push --watch` and `--publish`, `preview --var … --open`).
- 2857473: `coss/diagnose` explains an email's delivery: `diagnose(coss, id)` reads the email, its events and its account context, and `diagnoseEmail` is the pure part (moved from `coss-mcp`, which now uses it and still re-exports it). The CLI gets `coss emails list`, `coss emails get`, `coss emails events` and `coss emails diagnose`, and `coss inbox` (the inbound domain, then received emails as they arrive) with `coss inbox get`.
- 78b99d3: Test webhook events: `coss.webhookEvents.test({ type, data })` (`POST /v1/webhook_events/test`) sends a sample event of a type to the environment's subscribed endpoints and open listeners, exactly like a real one (sandbox keys; every type but the live-only `domain.*`, `account.*` and `billing.*`). The SDK also exports `WEBHOOK_EVENT_TYPES`, `TEST_WEBHOOK_EVENT_TYPES` and `isLiveOnlyEventType`. The CLI gets `coss trigger <event-type>` (with `--data` and `-F`, so `coss listen` + `coss trigger` exercises a local handler), and `coss webhooks list`, `coss webhooks deliveries <endpoint>` and `coss webhooks retry <endpoint> <delivery>`.
- 8fea903: `coss.request(method, path, options)` calls any endpoint by its path (for one the SDK has no method for yet), with the client's key, version, timeout and retries; POST, PUT and PATCH are retried only with `retry: true`. The CLI's new `coss api <path>` uses it: `-f`/`-F` fields, `--input` bodies (or stdin), `--paginate` and `--raw`. Also `coss completion bash|zsh|fish`, and every command's `--help` is now generated from its flags.

## 0.6.0

### Minor Changes

- 0d7a859: Broadcasts: `coss.email.broadcasts` (`create`, `list`, `get`, `update`, `remove`, `send`, `cancel`, `pause`, `resume`, `test`, `listEmails`) send one marketing email to an audience or a segment, with `{{{contact.<key>|fallback}}}` templates, scheduling, throttling at the plan's marketing rate and per-broadcast `stats`. Adds the `broadcast.sending`, `broadcast.sent`, `broadcast.paused`, `broadcast.canceled` and `broadcast.failed` webhook events and `broadcast_id` on emails.
- 9cfbbfa: Contacts: `coss.email.contacts` (upsert, list, get, update, remove, import, export, topics), custom contact properties (`coss.email.contacts.properties`), audiences (`coss.email.audiences`), segments (`coss.email.segments`), topics (`coss.email.topics`) and marketing settings (`coss.email.marketingSettings`), the `contact.*` webhook events, and `contacts_per_environment` in the billing limits.
- 9682942: Email streams: `marketing` on the reputation (`Reputation.marketing`, the marketing stream's own standing) and on `account.*` webhook events, the new `account.marketing_paused` and `account.marketing_reinstated` events, the `stream:marketing` suppression scope, and `stream` on `coss.email.suppressions.check()`.
- 1d2d0f6: Marketing email: `stream: "marketing"` on sends (one-click unsubscribe headers and a CAN-SPAM footer added by coss.com) and `stream` on emails, double opt-in (`double_opt_in` on `coss.email.contacts.upsert()`, `resendConfirmation()`, confirmation settings in `coss.email.marketingSettings`), `coss.email.contacts.createPreferenceLinks()`, the `contact.unsubscribed` and `contact.confirmed` events (with `topic`), and `unsubscribe` on `email.suppressed` event data.

## 0.5.0

### Minor Changes

- 990da3c: Integrations: `coss/nodemailer` (a Nodemailer transport, `cossTransport()` and `withCoss()`), `coss/better-auth` (`cossEmail()`: Better Auth's verification, password reset, change-email, delete-account, magic link, one-time code and invitation emails) and `coss/authjs` (an Auth.js email provider). They send through `coss.email.send`, throw a `CossSendError` on failure, and add no dependencies: Nodemailer, Better Auth and `@auth/core` are optional peer dependencies.

## 0.4.0

### Minor Changes

- 5444ed6: `coss.apiKey.revoke()` (`DELETE /v1/api_key`): revokes the client's own API key at once.
- 4439171: Dedicated IPs: `coss.email.dedicatedIps.get()` reads the organization's dedicated IP pool (the Dedicated IPs add-on): its status while SES warms it up, its IPs and their deliveries. `Billing` gains `add_ons` and `features.dedicated_ips`, and the `email.dedicated_ip` meter.
- ad46699: DMARC: `coss.domains.dmarc.get()` (a domain's published DMARC record, the guided next step from `p=none` to `p=reject` with its readiness checks, and a summary of recent aggregate reports), `coss.domains.dmarc.reports.list()` and `.get()`, and the `domain.dmarc_report_received` webhook event (`DomainWebhookEvent`).
- 9734c4f: Domains: `bimi`, the result of the last BIMI check (the domain's `default._bimi` record, its logo and certificate URLs, the DMARC policy that applies and what keeps the logo from showing), with the new `DomainBimi`, `BimiStatus` and `BimiIssueCode` types.
- 7734ef4: Email templates: `coss.email.templates` (create, list, get, update, delete; `getDraft`, `updateDraft`, `publish`; `versions.list`, `versions.get`, `versions.restore`), sending a published template with `template_id`, `variables`, `template_version` and `locale` on `coss.email.send()` and `sendBatch()` (`SendEmailParams` is now `SendEmailContentParams | SendEmailTemplateParams`), and `Email.template`.
- 77505e7: `coss.environment.get()` (`GET /v1/environment`): the environment, project and organization the API key belongs to (with the organization's pinned API version) and the key itself. Any valid key can read it.
- 747e8f9: `coss.email.getBatch()` reads a batch sent with `sendBatch` back, with its emails' current statuses in request order.
- 0005212: One-click unsubscribe (RFC 8058): `unsubscribe` in tracking rules (`coss.email.tracking`) and in a
  send's `tracking` option, `tracking.unsubscribe` on emails, the `email.unsubscribed` event and the
  `unsubscribe` suppression reason. The MCP server's send tool takes `tracking.unsubscribe`.
- ffc8666: React Email: `coss.email.send()` and `sendBatch()` take a `react` component, rendered into `html` (and `text`, unless you pass one) by `@react-email/render`, a new optional peer dependency. The SDK still has no required dependencies.
- 4ea7298: `coss.webhookListeners` (`create`, `poll`, `delete`; `POST /v1/webhook_listeners`, `POST /v1/webhook_listeners/{id}/poll`, `DELETE /v1/webhook_listeners/{id}`): temporary listeners that receive the environment's events by long poll, so a CLI can forward them to a local server (`coss listen`). Polls hand out each event's body exactly as an endpoint would receive it, and take acknowledgements of earlier deliveries.

### Patch Changes

- 0a992f6: Logs: the `smtp` log source, for messages submitted to the SMTP relay (`smtp.coss.com`).

## 0.3.0

### Minor Changes

- 57a79b8: Email: `coss.email.list()` finds emails by recipient (`to`), status, a recipient's delivery status, subject text, category, batch and creation time (newest first, without content), and every email now has `failure` (`{ code, message }` once it has failed, otherwise `null`).
- 01979e0: Risk building blocks and rate limiting: `coss.risk.checkEmail()`, `coss.risk.checkIp()` and
  `coss.risk.classify()` (content scores for spam, phishing, malware and fraud), `content` on
  `coss.risk.assess()` with `signals.content` and `content.*` reasons and rule fields, content
  thresholds in `coss.risk.settings`, and `coss.risk.limit()` with `coss.risk.limitBuckets` for rate
  limiting your own endpoints.
- c6fa2fd: Risk: `checkout` details and `device` tokens on `coss.risk.assess()`, the new `coss/device` browser entry (`collectDevice()`), `coss.risk.calibration()`, `reason_weights` in risk settings, IP `privacy` data (VPN, proxy, relay) on assessments and `checkIp()`, and the new reasons and rule fields that come with them.

## 0.2.0

### Minor Changes

- a9040a1: Add the `hook_endpoint.disabled` webhook event (`HookEndpointWebhookEvent`), sent to your webhook endpoints when a Hooks endpoint of one of your applications is disabled for failing. `verifyWebhook` takes a payload type for verifying Hooks deliveries: `verifyWebhook<MyPayload>(…)`.
- a4dedda: Add `coss.hooks`, webhooks as a service: applications, event types, endpoints, messages (`coss.hooks.messages.send()`), deliveries and attempts, endpoint recovery, and portal sessions (`coss.hooks.portal.createSession()`).
- 0f8d9ca: Add `coss.risk.rules` (create, list, get, update, delete) and `coss.risk.settings` (get, update: thresholds, disabled reasons, captcha provider), the `captcha` assessment parameter, the `domain_age_days`, `captcha` and `login` signals, new reason codes (`email.domain_new`, `login.new_country`, `login.new_network`, `captcha.failed`, `captcha.missing`, `rule.matched`) and the `risk.assessment.reviewed` webhook event.
- a51deae: Webhook endpoints that fail every delivery for five days are now disabled automatically: `WebhookEndpoint` gains `disabled_reason`, `disabled_at` and `failing_since`. Add `coss.webhookEndpoints.recover()` to requeue an endpoint's failed deliveries since a time.

## 0.1.0

### Minor Changes

- 5957659: Send the `Coss-Version` header with every request (`API_VERSION`, overridable with the `apiVersion` client option), and add `api_version` to webhook endpoints and webhook events.
- 503172a: Add `coss.auditEvents.list()` and `coss.auditEvents.get()` to read the organization's audit log.
- f44f537: Add `coss.email.sendBatch()` to queue up to 100 emails in one atomic, idempotent request.
- f0a68ac: Add `coss.billing` to read the organization's billing: `get()` (plan, this month's usage and estimate, standing, limits), `usage()`, `invoices.list()`/`invoices.get()` and `credits.list()`. Add the `billing.*` webhook event types (`BillingWebhookEvent`, part of `WebhookEvent`).
- cd9bbf8: Add the `billing_error` error type (HTTP 402): the organization's plan or billing refused the request — `billing_hold` (live sending paused for an overdue invoice or the spend limit), `usage_limit_exceeded` (past the plan's monthly allowance), `plan_limit_reached` or `plan_feature_unavailable`. It is never retried.
- 65c1177: Add `coss.domains.tracking.create()` and `coss.domains.tracking.delete()` to set up a custom tracking domain (e.g. `links.acme.com`) for a sending domain, and the `tracking` field on `Domain`.
- 7ab096a: Add `coss.logs.list()` and `coss.logs.get()` to read an environment's logs: API requests, email events and webhook delivery attempts.
- 50fde5b: Add `coss.logDrains` (create, list, get, update, delete, and `batches.list`/`batches.get`) to stream an environment's log and audit events to an HTTPS endpoint, and `verifyLogDrainBatch()` to verify and parse the signed NDJSON batches.
- 0c00824: Receive email: `coss.email.received` lists, retrieves and deletes the emails an environment received, downloads their raw message (`getRaw`) and attachments (`getAttachment`) as bytes, and returns the environment's inbound address (`address()`). `coss.domains.receiving` starts and stops receiving at a domain's hostname, and `Domain.receiving` describes it. `WebhookEvent` includes the new `email.received` event (`ReceivedEmailWebhookEvent`).
- f35bf25: Add `coss.email.reschedule()` to move a scheduled email to a new time, and the `email.rescheduled` event type (`data.reschedule`).
- 1be79bb: Add `coss.risk`: `assess()` sign-ups, logins and other events for an `allow`/`review`/`block` decision with reasons, report outcomes with `feedback()`, read past assessments (`coss.risk.assessments`), manage allow and block lists (`coss.risk.lists`) and forget deleted users (`coss.risk.users.forget()`). Webhooks gain the `risk.assessment.review` event and logs the `risk` source.
- 6c62053: Add `coss.webhookEndpoints.rollSecret()` to replace an endpoint's signing secret while the previous one keeps signing for a grace period, and `previous_secret_expires_at` to webhook endpoints.
- 5b6db5c: Add `coss.email.tracking` to read and change the environment's open and click tracking settings: `get()`, `updateDefault()`, `removeDefault()`, `updateCategory()` and `removeCategory()`.
