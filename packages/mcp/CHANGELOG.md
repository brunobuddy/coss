# coss-mcp

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
