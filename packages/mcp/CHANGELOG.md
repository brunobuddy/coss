# coss-mcp

## 0.7.0

### Minor Changes

- 2012767: Setup and diagnosis know every product. `fetchSetupReport(coss, { product })`, the MCP server's `get_setup` and `coss init --product` say what a product still needs or how to try it in a sandbox, and report `products` and `products_in_use` next to the fields they had. `coss/diagnose` adds SMS, Verify, Sign, Forms, Hooks and Scheduling, as MCP tools (`diagnose_verification`, `diagnose_sign_request`, `diagnose_form_submission`, `diagnose_hook_delivery`, `diagnose_scheduling_slots`) and CLI commands (`coss sms diagnose`, `coss verify diagnose`, `coss sign diagnose`, `coss forms diagnose`, `coss hooks diagnose`, `coss scheduling diagnose`). The MCP server also gets `list_email_templates`, log drain and sub-account tools, `api_get` (a read-only fallback for any `/v1/` path), output schemas on `get_setup` and the diagnose tools, and its first prompts and resources.
- a7ff535: Verify's settings have an API: `coss.verify.settings.get()` and `.update()`. The MCP server gets tools for marketing (contacts, audiences, segments, topics, broadcasts), Verify and Sign, and more for Forms, Scheduling, Hooks and Risk, plus `COSS_MCP_TOOLSETS` to offer fewer of them. The CLI gets `coss verify`, `coss contacts`, `coss broadcasts` and `coss sign`, and more of `coss sms`, `coss forms` and `coss scheduling`.
- 411767c: `coss.environment.get()` and the MCP server's `get_account_status` say whether the organization is in HIPAA mode (`organization.hipaa_mode`). The MCP server explains `hipaa_mode_restriction` refusals.
- cdec0a9: The server is also hosted at `https://api.coss.com/mcp` (Streamable HTTP, stateless, authenticated with `Authorization: Bearer <API key>`), for clients that can't start a local process. `coss-mcp/http` is its handler, and `createCossMcpServer` takes `transport: "hosted"`, which offers no tool that touches files. `server.json` describes both for the MCP registry.
- 17ac7bc: Scheduling bookings have a readable history: `coss.scheduling.bookings.events(id)`, the MCP server's `list_scheduling_booking_events` and `coss scheduling booking-events`. A cancelled booking says who cancelled it in `cancelled_by`, and `bookings.cancel` takes an optional `reason`, which only retrieving that booking returns. `bookings.cancel`'s second argument is now its parameters, and request options moved to the third, as on `series.cancel`.
- 4168d9e: Scheduling slots explain themselves. `coss.scheduling.slots.explain(eventType, { start })`, the MCP server's `explain_scheduling_slot` and `coss scheduling slots explain` say whether one start can be booked right now and, host by host, why not. Slots also carry `seats_left` for group event types.
- f099789: Scheduling bookings can have guests: set an event type's `max_guests`, then pass `guests` when booking. They're emailed about it, and `coss.scheduling.attendees.eraseByEmail()` erases someone known only by their address. An event type's `host_calendar_details: "full"` puts its title and who's coming on hosts' calendars instead of a neutral "Appointment". The MCP server's `create_scheduling_booking` takes `guests`.
- 6d31dd3: Scheduling reminders: `reminders` on `coss.scheduling.settings` and event types say what goes out around a booking, timed from its start, end or any change to it, to attendees, hosts, fixed addresses or a webhook, in your own words if you like. `coss.scheduling.bookings.notifications()` lists what was queued and why anything wasn't sent. New webhooks: `scheduling.booking.started`, `scheduling.booking.ended` and `scheduling.booking.reminder`. Hosts take a `phone`, event types take `notifications`, and settings take `email_reply_to`. The MCP server gets `get_scheduling_reminders`, `save_scheduling_reminders`, `list_scheduling_booking_notifications` and `mark_scheduling_no_show`, and the CLI `coss scheduling reminders`, `notifications` and `no-show`.

### Patch Changes

- 476ed3c: An empty or whitespace `COSS_MCP_TOOLSETS` now means every tool, as an unset one does, instead of only the core tools. The Claude Code plugin's new optional `toolsets` setting passes it through, and is empty unless someone picks toolsets.
- 7452381: Avoid regular expressions that slow down on unusual input when trimming base URLs and reading From headers.
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

- 9978333: Docs tools: `search_docs` searches coss.com's guides, SDK pages and API reference, and `read_docs` reads a page as Markdown (an API operation's parameters, bodies, responses and samples included). Both work without an API key: `COSS_API_KEY` is now optional, and without it the server offers only these two tools (and explains how to get a key) instead of exiting. `createCossMcpServer`'s `coss` option is optional for the same reason, and its new `docs` option points the docs tools elsewhere.
- 57cc163: Scoped API keys: `coss.environment.get()` now returns the key's `api_key.access` (`full` or `restricted`) and `api_key.permissions` (`resource:action` strings, e.g. `email:send`). The MCP server's `get_account_status` reports them and its permission errors say the key is restricted; `coss whoami` prints the key's access.
- fb711e1: SMS tools: `send_sms`, `cancel_sms`, `find_sms`, `get_sms`, `diagnose_sms` (what a message's status or failure code means and what to do), `list_received_sms`, `list_sms_numbers`, `check_sms_suppression`, `add_sms_suppression` and `remove_sms_suppression`; `diagnoseSms` is exported.

### Patch Changes

- Updated dependencies [2f2c982]
- Updated dependencies [001c8ed]
- Updated dependencies [57cc163]
- Updated dependencies [ecaa8cc]
- Updated dependencies [9d872c0]
- Updated dependencies [ce6f1e6]
- Updated dependencies [2f2c982]
  - coss@0.8.0

## 0.2.3

### Patch Changes

- 2857473: `coss/diagnose` explains an email's delivery: `diagnose(coss, id)` reads the email, its events and its account context, and `diagnoseEmail` is the pure part (moved from `coss-mcp`, which now uses it and still re-exports it). The CLI gets `coss emails list`, `coss emails get`, `coss emails events` and `coss emails diagnose`, and `coss inbox` (the inbound domain, then received emails as they arrive) with `coss inbox get`.
- Updated dependencies [e13f0e4]
- Updated dependencies [2857473]
- Updated dependencies [78b99d3]
- Updated dependencies [8fea903]
  - coss@0.7.0

## 0.2.2

### Patch Changes

- Updated dependencies [0d7a859]
- Updated dependencies [9cfbbfa]
- Updated dependencies [9682942]
- Updated dependencies [1d2d0f6]
  - coss@0.6.0

## 0.2.1

### Patch Changes

- Updated dependencies [990da3c]
  - coss@0.5.0

## 0.2.0

### Minor Changes

- 0005212: One-click unsubscribe (RFC 8058): `unsubscribe` in tracking rules (`coss.email.tracking`) and in a
  send's `tracking` option, `tracking.unsubscribe` on emails, the `email.unsubscribed` event and the
  `unsubscribe` suppression reason. The MCP server's send tool takes `tracking.unsubscribe`.

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

## 0.1.0

### Minor Changes

- 57a79b8: First release of `coss-mcp`, the coss.com MCP server: coding agents can find emails and diagnose their delivery (`diagnose_email`), send test emails, manage suppressions and domains, inspect webhook deliveries, received emails and logs, and check the account's reputation and billing standing. Run it with `npx -y coss-mcp` and `COSS_API_KEY`.

### Patch Changes

- Updated dependencies [57a79b8]
- Updated dependencies [01979e0]
- Updated dependencies [c6fa2fd]
  - coss@0.3.0
