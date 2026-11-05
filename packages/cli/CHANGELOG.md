# coss-cli

## 0.7.0

### Minor Changes

- 2012767: Setup and diagnosis know every product. `fetchSetupReport(coss, { product })`, the MCP server's `get_setup` and `coss init --product` say what a product still needs or how to try it in a sandbox, and report `products` and `products_in_use` next to the fields they had. `coss/diagnose` adds SMS, Verify, Sign, Forms, Hooks and Scheduling, as MCP tools (`diagnose_verification`, `diagnose_sign_request`, `diagnose_form_submission`, `diagnose_hook_delivery`, `diagnose_scheduling_slots`) and CLI commands (`coss sms diagnose`, `coss verify diagnose`, `coss sign diagnose`, `coss forms diagnose`, `coss hooks diagnose`, `coss scheduling diagnose`). The MCP server also gets `list_email_templates`, log drain and sub-account tools, `api_get` (a read-only fallback for any `/v1/` path), output schemas on `get_setup` and the diagnose tools, and its first prompts and resources.
- a7ff535: Verify's settings have an API: `coss.verify.settings.get()` and `.update()`. The MCP server gets tools for marketing (contacts, audiences, segments, topics, broadcasts), Verify and Sign, and more for Forms, Scheduling, Hooks and Risk, plus `COSS_MCP_TOOLSETS` to offer fewer of them. The CLI gets `coss verify`, `coss contacts`, `coss broadcasts` and `coss sign`, and more of `coss sms`, `coss forms` and `coss scheduling`.
- 1d11cf9: The CLI manages what it could only read. New: `coss suppressions`, `coss subaccounts`, `coss log-drains`, `coss audiences`, `coss segments`, `coss topics`, `coss marketing settings`, `coss risk rules`, `coss risk check`, `coss risk classify`, `coss risk settings`, `coss sign settings` and `coss scheduling schedules`; `coss emails cancel` and `reschedule`, `coss sms cancel`, `coss sms suppressions check`, `coss contacts update`, `import` and `export`, `coss broadcasts update`, `remove`, `pause` and `resume`, `coss forms update` and `remove`, `coss sign templates create`, and `coss scheduling hosts create`, `update` and `remove`, `event-types create` and `update`, `book`, `reschedule`, `approve` and `decline`. `coss open` knows every page of the dashboard, and unknown commands point at `coss api`.
- 17ac7bc: Scheduling bookings have a readable history: `coss.scheduling.bookings.events(id)`, the MCP server's `list_scheduling_booking_events` and `coss scheduling booking-events`. A cancelled booking says who cancelled it in `cancelled_by`, and `bookings.cancel` takes an optional `reason`, which only retrieving that booking returns. `bookings.cancel`'s second argument is now its parameters, and request options moved to the third, as on `series.cancel`.
- 4168d9e: Scheduling slots explain themselves. `coss.scheduling.slots.explain(eventType, { start })`, the MCP server's `explain_scheduling_slot` and `coss scheduling slots explain` say whether one start can be booked right now and, host by host, why not. Slots also carry `seats_left` for group event types.
- 6d31dd3: Scheduling reminders: `reminders` on `coss.scheduling.settings` and event types say what goes out around a booking, timed from its start, end or any change to it, to attendees, hosts, fixed addresses or a webhook, in your own words if you like. `coss.scheduling.bookings.notifications()` lists what was queued and why anything wasn't sent. New webhooks: `scheduling.booking.started`, `scheduling.booking.ended` and `scheduling.booking.reminder`. Hosts take a `phone`, event types take `notifications`, and settings take `email_reply_to`. The MCP server gets `get_scheduling_reminders`, `save_scheduling_reminders`, `list_scheduling_booking_notifications` and `mark_scheduling_no_show`, and the CLI `coss scheduling reminders`, `notifications` and `no-show`.

### Patch Changes

- 05dd81b: Scheduling's calendar delegations: `coss.scheduling.calendarDelegations` lets an admin authorize a Google Workspace or Microsoft 365 domain once, so every host on it gets their calendar with no consent screen. Hosts gain `calendar_account`, calendar connections gain `delegation`, and there are `scheduling.calendar_delegation.failing` and `.restored` webhooks. `coss open scheduling-calendar-delegation` opens its dashboard page.
- Updated dependencies [2012767]
- Updated dependencies [a7ff535]
- Updated dependencies [05dd81b]
- Updated dependencies [9e79d10]
- Updated dependencies [8dacd0f]
- Updated dependencies [411767c]
- Updated dependencies [fb681ad]
- Updated dependencies [97e84b2]
- Updated dependencies [cbed6ab]
- Updated dependencies [56a7443]
- Updated dependencies [17ac7bc]
- Updated dependencies [346c63f]
- Updated dependencies [4168d9e]
- Updated dependencies [f099789]
- Updated dependencies [895ef91]
- Updated dependencies [cee7e38]
- Updated dependencies [11286f6]
- Updated dependencies [6d31dd3]
- Updated dependencies [0101bab]
- Updated dependencies [ddf6142]
- Updated dependencies [7452381]
  - coss@0.12.0

## 0.6.0

### Minor Changes

- 7afbbef: Forms: the MCP server's `list_forms`, `list_form_submissions` and `get_form_submission` tools (submitted
  values labelled untrusted), and the CLI's `coss forms list` and `coss forms submissions <form>`
  (`--status`, `--limit`, `--json`).
- a2ed56a: Adds `coss.scheduling`: hosts, schedules, event types, slots, availability search, bookings, holds, recurring
  series, calendars, sessions and settings. `coss/scheduling` embeds the hosted pages (`mountBooker`,
  `mountHostPortal`).
  
  `coss-mcp` gets tools to list hosts, slots and bookings and to cancel a booking; `coss-cli` gets
  `coss scheduling hosts` and `coss scheduling bookings`.

### Patch Changes

- b4cb758: `coss listen` forwards an event's `data.traceparent` as a `traceparent` header, as coss.com's own
  webhook delivery does.
- 014f709: `coss open` follows the dashboard's product-first URLs (`/<org>/<project>/<env>/email/domains`,
  `/<org>/settings/members`) and opens more pages: `products`, `email`, `sms`, `verify`, `sign`,
  `forms`, `inboxes`, `developers`, `subaccounts` and `spend`.
- Updated dependencies [a951582]
- Updated dependencies [545d704]
- Updated dependencies [09ccfba]
- Updated dependencies [9f31e28]
- Updated dependencies [9d65e49]
- Updated dependencies [95707e1]
- Updated dependencies [a2ed56a]
- Updated dependencies [b4cb758]
  - coss@0.11.0

## 0.5.0

### Minor Changes

- daf97ff: Inboxes: the MCP server gains `create_inbox`, `list_inboxes`, `list_inbox_threads`, `get_inbox_thread`, `send_inbox_message` and `reply_to_inbox_message`; the CLI gains `coss inboxes list|create|threads|thread|reply`.

### Patch Changes

- Updated dependencies [0464e77]
- Updated dependencies [e97dd14]
- Updated dependencies [80a9c6f]
- Updated dependencies [62cdc89]
- Updated dependencies [fbdc39f]
- Updated dependencies [9d4c942]
- Updated dependencies [f9f26a4]
- Updated dependencies [d55a308]
- Updated dependencies [7e77a8e]
- Updated dependencies [0718160]
- Updated dependencies [c0e5c69]
- Updated dependencies [a85e735]
- Updated dependencies [a4e2b6a]
  - coss@0.10.0

## 0.4.0

### Minor Changes

- 57397ff: Setup status for agents, error hints, and one project key.
  
  `describeSetup` reports a from address that will succeed and one next step. API errors can include `hint` (a fix, often with a docs URL), and the SDK copies it onto `CossError`. `coss init` writes agent notes by default, points at the project's mail library or framework driver, and prints that setup. `coss listen` writes `COSS_WEBHOOK_SECRET` into the project env file. `coss-mcp` loads a development key from that file and adds setup, risk, Hooks and template tools.
- 2b6c98e: Publish a template and register a webhook endpoint from the tools an agent already uses.
  
  `publish_email_template` publishes the draft revision it just read. `create_webhook_endpoint` and `coss webhooks add` create an endpoint once and write its signing secret to the project env file as `COSS_WEBHOOK_SECRET`. A URL that already has an endpoint is left as it is. `coss init` snippets send to the mailbox simulator from the address setup reports.

### Patch Changes

- Updated dependencies [57397ff]
- Updated dependencies [2b6c98e]
  - coss@0.9.0

## 0.3.0

### Minor Changes

- 9978333: `coss init --agents`: adds a short section on coss.com for coding agents (where the docs are, what the development key does, how to test) to the project's `AGENTS.md`, or its `CLAUDE.md` when it has no `AGENTS.md`. Running it again updates the section. `--json` reports the file as `agents_file`.
- 57cc163: Scoped API keys: `coss.environment.get()` now returns the key's `api_key.access` (`full` or `restricted`) and `api_key.permissions` (`resource:action` strings, e.g. `email:send`). The MCP server's `get_account_status` reports them and its permission errors say the key is restricted; `coss whoami` prints the key's access.
- fb711e1: `coss sms send`: a test text message (`--to`, or `--simulate delivered|invalid|filtered|opted-out|reply` for the SMS simulator; `--wait` follows it to its outcome and shows the simulator's reply).

### Patch Changes

- Updated dependencies [2f2c982]
- Updated dependencies [001c8ed]
- Updated dependencies [57cc163]
- Updated dependencies [ecaa8cc]
- Updated dependencies [9d872c0]
- Updated dependencies [ce6f1e6]
- Updated dependencies [2f2c982]
  - coss@0.8.0

## 0.2.0

### Minor Changes

- e13f0e4: `coss.email.templates.render(template, { version, locale, variables })` renders a template's draft (or a published version) as a send would, without sending (`POST /v1/email_templates/{id}/render`). The CLI gets `coss domains list|add|get|verify` (DNS records as a table or zone-file lines with `--format bind`; `verify --wait` follows the domain until it's verified) and templates as code: `coss templates list|pull|push|preview` (a folder per template, `push --watch` and `--publish`, `preview --var … --open`).
- 2857473: `coss/diagnose` explains an email's delivery: `diagnose(coss, id)` reads the email, its events and its account context, and `diagnoseEmail` is the pure part (moved from `coss-mcp`, which now uses it and still re-exports it). The CLI gets `coss emails list`, `coss emails get`, `coss emails events` and `coss emails diagnose`, and `coss inbox` (the inbound domain, then received emails as they arrive) with `coss inbox get`.
- e2ddd7a: `coss hooks …`: create Hooks applications, event types and endpoints (`endpoints add` prints the signing secret), send messages (`--data`, `-F` fields, or the event type's example), follow deliveries and their attempts, retry one, and open an application's portal. `coss risk …`: assess an event and see the decision, score and reasons (sandbox fixtures produce each decision), list assessments and the review queue, send feedback, and manage the allow and block lists. Help and errors for groups inside groups (`coss hooks apps`) now name their own commands.
- 3a02992: `coss init` sets a project up: it installs `coss` with the project's package manager and writes a new development key, approved in the dashboard and named after the project, to `.env.local` (Next.js) or `.env`. `coss profiles list` and `coss use <profile>` show and switch the saved profiles, and `coss open [page]` opens the environment's dashboard page. A daily update notice says when a newer coss-cli exists (`COSS_NO_UPDATE_CHECK=1` turns it off), and completion offers saved profile names.
- 78b99d3: Test webhook events: `coss.webhookEvents.test({ type, data })` (`POST /v1/webhook_events/test`) sends a sample event of a type to the environment's subscribed endpoints and open listeners, exactly like a real one (sandbox keys; every type but the live-only `domain.*`, `account.*` and `billing.*`). The SDK also exports `WEBHOOK_EVENT_TYPES`, `TEST_WEBHOOK_EVENT_TYPES` and `isLiveOnlyEventType`. The CLI gets `coss trigger <event-type>` (with `--data` and `-F`, so `coss listen` + `coss trigger` exercises a local handler), and `coss webhooks list`, `coss webhooks deliveries <endpoint>` and `coss webhooks retry <endpoint> <delivery>`.
- 8fea903: `coss.request(method, path, options)` calls any endpoint by its path (for one the SDK has no method for yet), with the client's key, version, timeout and retries; POST, PUT and PATCH are retried only with `retry: true`. The CLI's new `coss api <path>` uses it: `-f`/`-F` fields, `--input` bodies (or stdin), `--paginate` and `--raw`. Also `coss completion bash|zsh|fish`, and every command's `--help` is now generated from its flags.

### Patch Changes

- Updated dependencies [e13f0e4]
- Updated dependencies [2857473]
- Updated dependencies [78b99d3]
- Updated dependencies [8fea903]
  - coss@0.7.0

## 0.1.2

### Patch Changes

- Updated dependencies [0d7a859]
- Updated dependencies [9cfbbfa]
- Updated dependencies [9682942]
- Updated dependencies [1d2d0f6]
  - coss@0.6.0

## 0.1.1

### Patch Changes

- Updated dependencies [990da3c]
  - coss@0.5.0

## 0.1.0

### Minor Changes

- 11bed1a: The coss.com CLI (`npm i -g coss-cli`, command `coss`): `coss login` (in the browser, or `--manual` with an API key), `logout`, `whoami`, `coss emails send` (test emails, `--simulate bounced|complained|delivered|suppressed`, `--wait`), `coss logs tail`, and `coss listen --forward-to localhost:3000/webhooks` to receive the environment's webhook events on your machine, signed with a stable `whsec_` secret.

### Patch Changes

- Updated dependencies [5444ed6]
- Updated dependencies [4439171]
- Updated dependencies [ad46699]
- Updated dependencies [9734c4f]
- Updated dependencies [7734ef4]
- Updated dependencies [77505e7]
- Updated dependencies [747e8f9]
- Updated dependencies [0005212]
- Updated dependencies [ffc8666]
- Updated dependencies [0a992f6]
- Updated dependencies [4ea7298]
  - coss@0.4.0
