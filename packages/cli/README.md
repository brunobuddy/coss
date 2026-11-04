# coss-cli

The command line for [coss.com](https://coss.com): sign in, send test emails and text messages, follow
your environment's log, and receive its webhook events on your machine.

```sh
npm install -g coss-cli    # or: npx coss-cli <command>
coss login
coss listen --forward-to localhost:3000/webhooks
coss trigger email.bounced    # in another terminal: a test event, forwarded by coss listen
```

Published from [cosscom/coss](https://github.com/cosscom/coss) by CI, with
[provenance](https://docs.npmjs.com/generating-provenance-statements). Full guide:
[coss.com/docs/cli](https://coss.com/docs/cli).

## Install without Node.js

Each release's [GitHub release](https://github.com/cosscom/coss/releases) (`coss-cli@<version>`)
also has standalone executables (Bun's runtime built in) for macOS, Linux (glibc and musl) and
Windows, arm64 and x64, with a `SHA256SUMS`:

```sh
brew install cosscom/tap/coss                 # macOS and Linux; completions included
curl -fsSL https://raw.githubusercontent.com/cosscom/coss/main/packages/cli/install.sh | sh
```

`install.sh` picks the archive for the machine, checks it against `SHA256SUMS` and installs `coss`
into `~/.local/bin` (`COSS_INSTALL_DIR`; `COSS_VERSION` for another version). The musl builds need
`libstdc++` (`apk add libstdc++` on Alpine). macOS executables are signed with coss.com's Developer
ID and notarized by Apple (since 0.3.0), so one downloaded with a browser runs without a warning.

## Commands

| Command | |
| --- | --- |
| `coss login` | Opens the dashboard, where you pick an environment; the CLI gets a new API key of it. `--manual` pastes an existing key instead; `--no-browser` (the default over SSH) shows a link and asks for the code it displays. |
| `coss logout` | Removes the saved key, and revokes it if `coss login` created it (`--revoke` revokes a pasted one too; `--all` signs every profile out). |
| `coss whoami` | The key in use, where it comes from, and its organization, project and environment. |
| `coss profiles list` | The saved profiles: each one's environment, whether `coss login` created its key or it was pasted, and which is the default. |
| `coss use <profile>` | Makes a saved profile the default. |
| `coss init` | Sets the project in the current directory up: installs `coss` with its package manager (`--no-install` doesn't) and writes a new development key, approved in the dashboard and named after the project, to `.env.local` (Next.js) or `.env` (`--env-file` picks another). A key already there is kept unless `--force`. It adds notes on coss.com for coding agents to the project's `AGENTS.md` (`--no-agents` skips them) and prints the one next step for the key (`--product sms`: that product's). |
| `coss open [page]` | Opens the environment's page in the dashboard: `overview`, `emails`, `logs`, `webhooks`, `api-keys`, `domains`, `risk-rules`, `scheduling-hosts`, `billing`, … (`--print` prints the URL; `coss open --help` lists them). |
| `coss emails send` | A test email: `--to`, or `--simulate delivered\|bounced\|complained\|suppressed` for the mailbox simulator; `--template` with `--var name=value`; `--wait` follows it to its outcome (up to `--timeout`, 60 s). |
| `coss emails list` | The environment's emails, newest first, with where each stands. Filter with `--to`, `--status`, `--recipient-status`, `-q`, `--category`, `--batch`, `--since`/`--until`; `--limit` (20). |
| `coss emails get <id>` | An email: sender, recipients and their statuses, failure, tracking, attachments; `--text` or `--html` prints a body alone. |
| `coss emails events <id>` | Its delivery events, with the receiving server's answers. |
| `coss emails diagnose <id>` | Whether it was delivered and, if not, why and what to do (or `--to <address>` for the newest email to it). |
| `coss emails cancel <email>`, `coss emails reschedule <email> --at <time>` | Cancels or moves a scheduled email. A time that has passed sends it right away, so a live key asks first (`--yes` off a terminal). |
| `coss suppressions list`, `coss suppressions check <address>`, `coss suppressions add <address>`, `coss suppressions remove <suppression>` | The [addresses that won't be emailed](https://coss.com/docs/email/suppressions) (`--scope`, `--subaccount`; `check` takes `--category`, `--stream`). |
| `coss subaccounts list`, `coss subaccounts get <subaccount>`, `coss subaccounts create <name>`, `coss subaccounts update <subaccount>`, `coss subaccounts delete <subaccount>`, `coss subaccounts reinstate <subaccount>`, `coss subaccounts stats <subaccount>` | [Sub-accounts](https://coss.com/docs/email/subaccounts) for your users, by id or uid (`--uid`, `--metadata`, `--per-day`, `--per-second`, `--burst`; `update` takes `--status`; `stats` takes `--from`, `--to`). `delete` can't be undone, so a live key asks first (`--yes` off a terminal). |
| `coss sms send` | A test text message: `--to +14155550123`, or `--simulate delivered\|invalid\|filtered\|opted-out\|reply` for the SMS simulator (sandbox keys); `--from` (default for sandbox keys `+14155550100`; live keys need one of your registered numbers), `--body`; `--wait` follows it to its outcome (and shows the simulator's reply). |
| `coss sms list`, `coss sms get <message>`, `coss sms cancel <message>`, `coss sms received`, `coss sms numbers` | Messages and their events, cancelling a scheduled one, what your numbers received, and which numbers can send. |
| `coss sms diagnose <message>` | Whether it was delivered and, if not, why and what to do (or `--to <number>` for the newest message to it). |
| `coss sms suppressions list`, `coss sms suppressions check <number>`, `coss sms suppressions add <number>`, `coss sms suppressions remove <suppression>` | The numbers that won't be texted. |
| `coss verify start <to>`, `coss verify check --code <code>` | [One-time codes](https://coss.com/docs/verify): sends one, and compares what the end user typed (`--id` or `--to`; exits 0 only when it's right). |
| `coss verify list`, `coss verify get <verification>`, `coss verify cancel <verification>` | Verifications and what happened to each. |
| `coss verify settings get`, `coss verify settings set` | Code length, lifetime and attempts, the senders and allowed countries. |
| `coss verify diagnose <verification>` | Why no code arrived or a check failed (or `--to <to>` for the newest one). Never shows a code. |
| `coss contacts list`, `coss contacts get <contact>`, `coss contacts add <email>`, `coss contacts update <contact>`, `coss contacts remove <contact>` | [Marketing contacts](https://coss.com/docs/email/contacts) (`update`: `--first-name`, `--last-name`, `--status`, `--property name=value`, `--data`). |
| `coss contacts import <file>`, `coss contacts export` | Contacts from a CSV or JSON file (`-` for stdin, `--audience`; exits 1 when it skipped a row), and as CSV (`--status`, `--audience`, `--out`). |
| `coss audiences list`, `coss audiences get <audience>`, `coss audiences create <name>`, `coss audiences update <audience>`, `coss audiences remove <audience>` | [Static lists of contacts](https://coss.com/docs/email/audiences-and-segments). |
| `coss audiences contacts list <audience>`, `coss audiences contacts add <audience> <contact>...`, `coss audiences contacts remove <audience> <contact>` | Who is in an audience, by id or address (`add` exits 1 when one is no contact). |
| `coss segments list`, `coss segments get <segment>`, `coss segments create <name> --filter <json>`, `coss segments update <segment>`, `coss segments remove <segment>`, `coss segments contacts list <segment>` | Filters over the contacts, and who they match now. |
| `coss topics list`, `coss topics get <topic>`, `coss topics create <key>`, `coss topics update <topic>`, `coss topics remove <topic>` | [What contacts subscribe to](https://coss.com/docs/email/topics-and-preferences) (`--name`, `--default opt_in\|opt_out`, `--description`, `--visibility`, `--position`). |
| `coss marketing settings get`, `coss marketing settings set` | The sender's name, postal address and double opt-in (`--display-name`, `--mailing-address`, `--double-opt-in`, `--no-double-opt-in`, `--confirmation-from`, `--confirmation-subject`, `--confirmation-html`, `--confirmation-text`, `--confirmed-redirect-url`). |
| `coss broadcasts list`, `coss broadcasts get <broadcast>`, `coss broadcasts create`, `coss broadcasts update <broadcast>`, `coss broadcasts remove <broadcast>`, `coss broadcasts test <broadcast>`, `coss broadcasts send <broadcast>`, `coss broadcasts pause <broadcast>`, `coss broadcasts resume <broadcast>`, `coss broadcasts cancel <broadcast>` | [Marketing sends](https://coss.com/docs/email/broadcasts): `create` makes a draft from files, `send` and `resume` ask before a live send (`--yes` off a terminal, `--at` to schedule). |
| `coss sign upload <file.pdf>`, `coss sign create`, `coss sign send <request>` | [Signatures](https://coss.com/docs/sign): a PDF, a draft request (`--document` or `--template`, `--signer "Name <email>"`) and sending it. |
| `coss sign list`, `coss sign get <request>`, `coss sign remind <request>`, `coss sign cancel <request>`, `coss sign download <request>`, `coss sign audit <request>`, `coss sign templates`, `coss sign templates list` | Requests, reminders, the sealed PDF, the audit trail and templates. |
| `coss sign templates create <name>`, `coss sign settings get`, `coss sign settings set` | A new template (`--document`, `--role key:Name`, `--signing-order`, `--data` for its fields), and the name signers see, the sender, branding, reminders and embedding origins. |
| `coss sign diagnose <request>` | Where a request stands: each signer's state, whose turn it is, and what to do next. |
| `coss logs tail` | New lines of the environment's log as they arrive: API requests, email events, webhook attempts. Filter with `--source`, `--level`, `--type`, `--status`, `-q`; `--since 15m` starts earlier; `--interval` sets the poll interval (2000 ms). |
| `coss log-drains list`, `coss log-drains get <drain>`, `coss log-drains create <url>`, `coss log-drains update <drain>`, `coss log-drains delete <drain>` | [Log drains](https://coss.com/docs/log-drains): where the log is streamed (`--source`, `--format`, `--description`; `create` prints the signing secret once; `update` takes `--enabled`, `--disabled`, `--url`). `--auth-header <name>` takes the header's value from stdin or a prompt, never a flag; `--remove-auth-header` drops it. |
| `coss inbox` | The environment's inbound domain, then each email it receives as it arrives (`--since`, `--interval`). |
| `coss inbox get <id>` | A received email: verdicts, attachments and its text (`--html`, `--headers`); `--raw > message.eml` saves the message as received. |
| `coss inboxes list`, `coss inboxes create` | [Inboxes](https://coss.com/docs/inboxes): email addresses for agents (`--username`, `--domain`, `--name`, `--client-id`). |
| `coss inboxes threads <inbox>`, `coss inboxes thread <inbox> <thread>` | An inbox's conversations (● awaits a reply), and one read message by message (`--full` keeps the quoted text). |
| `coss inboxes reply <inbox> <message> --text <text>` | Replies in the message's thread from the inbox (`--all`: to everyone on it). |
| `coss listen` | Receives the environment's webhook events and forwards each one to `--forward-to`, signed like coss.com signs real deliveries. Verify them with `verifyWebhook` from the `coss` SDK and the signing secret it prints (it stays the same for the profile). `--header "Name: value"` adds a header to forwarded requests. |
| `coss trigger <event-type>` | A test event of that type, sent to the environment's subscribed endpoints and `coss listen` listeners like a real one (sandbox keys; every type but `domain.*`, `account.*`, `billing.*`). `--data '{…}'` and `-F name=value` (dotted names, JSON values) change its `data`. |
| `coss webhooks list` | The environment's webhook endpoints: URL, state and event types. |
| `coss webhooks add <url>` | Creates an endpoint and writes its signing secret to the project env file as `COSS_WEBHOOK_SECRET` (`--events`, `--description`, `--force`). |
| `coss webhooks deliveries <endpoint>` | An endpoint's deliveries, newest first (`--status failed`, `--event <id>`, `--limit`). |
| `coss webhooks retry <endpoint> <delivery>` | Sends a finished delivery to its endpoint once more. |
| `coss hooks apps list`, `coss hooks apps create <name>` | [Hooks](https://coss.com/docs/hooks) applications (`--uid`, `--metadata`). Every `<app>` below is an application's id or uid. |
| `coss hooks event-types list`, `coss hooks event-types create <name>` | The event types messages are sent as (`--description`, `--schema`, `--example`). |
| `coss hooks endpoints list <app>`, `coss hooks endpoints add <app> --url <url>` | An application's endpoints; `add` prints the new endpoint's signing secret (`--types`, `--rate-limit`). |
| `coss hooks send <app> <event-type>` | Sends a message: the payload from `--data '{…}'`, `-F name=value` fields, or the type's first example. |
| `coss hooks deliveries <app>`, `coss hooks attempts <app> <delivery>`, `coss hooks retry <app> <delivery>` | Deliveries (`--endpoint`, `--message`, `--status`), each HTTP request of one, and one more attempt. |
| `coss hooks portal <app>` | A portal link for the application's users (`--open`, `--read-only`, `--expires-in`). |
| `coss hooks diagnose <app> <delivery>` | What the endpoint answered on each attempt, the next retry, and whether it's disabled (or `--message`, `--endpoint`). |
| `coss risk assess --event <event>` | Assesses an event (`--email`, `--ip`, `--user`, `--content`, `--data '{…}'`…) and prints the decision, score and reasons. Sandbox fixtures (`192.0.2.1`, `disposable.test`, `[coss-test:spam]`…) produce each decision. |
| `coss risk assessments`, `coss risk feedback <assessment> --outcome <outcome>` | Assessments (`--review open`: the review queue), and what a user turned out to be. |
| `coss risk lists list`, `coss risk lists add <allow\|block> <type> <value>`, `coss risk lists remove <entry>` | The allow and block lists (`--note`, `--expires 7d`). |
| `coss risk rules list`, `coss risk rules get <rule>`, `coss risk rules create <name>`, `coss risk rules update <rule>`, `coss risk rules delete <rule>` | [Rules](https://coss.com/docs/risk/rules): `--action block --condition "ip.tor is true"` (`--match`, `--event`, `--position`, `--enabled`, `--disabled`, `--data`). |
| `coss risk check email <address>`, `coss risk check ip <ip>`, `coss risk check phone <number>`, `coss risk classify <text>` | [The signals on their own](https://coss.com/docs/risk/lookups); nothing is stored, and live phone checks are billed. `classify` also takes `--file` or `-`. |
| `coss risk settings get`, `coss risk settings set` | Thresholds, disabled reasons and the captcha (`--review-threshold`, `--block-threshold`, `--disabled-reason`, `--captcha`, `--captcha-required`, `--captcha-optional`, `--data`). `--captcha-secret-stdin` takes its secret from stdin or a prompt, never a flag. |
| `coss scheduling hosts`, `coss scheduling hosts list`, `coss scheduling bookings`, `coss scheduling event-types`, `coss scheduling event-types list` | The environment's [hosts, bookings and event types](https://coss.com/docs/scheduling). |
| `coss scheduling hosts create <name>`, `coss scheduling hosts update <host>`, `coss scheduling hosts remove <host>` | Who can be booked (`--time-zone`, `--uid`, `--email`, `--attribute`, `--metadata`, `--status`, `--data`). |
| `coss scheduling schedules list <host>`, `coss scheduling schedules create <host>`, `coss scheduling schedules update <host> <schedule>`, `coss scheduling schedules remove <host> <schedule>` | When a host is free: `--rule "mon-fri 09:00-17:00"` (`--name`, `--time-zone`, `--default`, `--data` for overrides). |
| `coss scheduling event-types create <title>`, `coss scheduling event-types update <event-type>` | What can be booked (`--minutes`, `--uid`, `--host`, `--kind`, `--status`, `--requires-approval`, `--no-approval`, `--data`). |
| `coss scheduling slots <event-type>`, `coss scheduling slots explain <event-type>`, `coss scheduling booking <booking>`, `coss scheduling cancel <booking>`, `coss scheduling calendars <host>` | Bookable starts (`--start`, `--end`), one booking, cancelling it, and a host's calendar connections. |
| `coss scheduling diagnose <event-type>` | Why there are no slots, each finding certain, likely or possible (`--start`, `--end`, `--host`). |
| `coss scheduling book <event-type>`, `coss scheduling reschedule <booking>`, `coss scheduling approve <booking>`, `coss scheduling decline <booking>` | Books a slot (`--start`, `--time-zone`, `--name`, `--email`, `--phone`, `--uid`, `--host`, `--minutes`, `--attribute`, `--answer`, `--metadata`, `--data`) and moves or decides one. They tell the attendee, so a live key asks first (`--yes` off a terminal). |
| `coss forms list`, `coss forms get <form>`, `coss forms create <name>`, `coss forms update <form>`, `coss forms remove <form>` | The environment's [forms](https://coss.com/docs/forms) and their endpoints (`update`: `--name`, `--enabled`, `--disabled`, `--origin`, `--redirect`, `--data`). `remove` can't be undone, so a live key asks first (`--yes` off a terminal). |
| `coss forms submissions <form>`, `coss forms submission <form> <submission>`, `coss forms release <form> <submission>` | A form's submissions (`--status held`: Risk's review queue), one's values, and accepting a held one. |
| `coss forms diagnose <form> [submission]` | What happened to a submission (the newest without an id): held, spam and why, waiting to be confirmed, or accepted and where it goes. |
| `coss domains list` | The organization's sending domains and their status. |
| `coss domains add <domain>` | Adds a domain and prints the DNS records to publish (`--format bind` prints zone-file lines). |
| `coss domains get <domain>` | A domain's records and what the last DNS check saw (verified, missing, mismatch). `--format bind` too. |
| `coss domains verify <domain>` | Checks the records now; `--wait` keeps checking until the domain is verified, saying which records are still missing (up to `--timeout`, 600 s). |
| `coss templates list` | The environment's email templates. |
| `coss templates pull [<template>...]` | Writes drafts to `--dir` (`templates`): a folder per template with `template.json` and `<locale>.subject.txt`, `<locale>.html`, `<locale>.txt`. |
| `coss templates push [<path>...]` | Saves drafts from those files, finding templates by alias (creating missing ones); `--publish` publishes after, `--watch` pushes again whenever a file changes. |
| `coss templates preview <template>` | Renders the draft (or `--version`) without sending: `--var name=value`, `--locale`, `--open` shows the HTML, `--output` saves it. |
| `coss api <path>` | Any endpoint of the API, including those without a command, with the CLI's key: `coss api domains`, `coss api -X POST domains/<id>/verify`. `-f name=value` (strings) and `-F name=value` (JSON values, `@file`) are query parameters for GET and DELETE and the JSON body otherwise; `--input file.json` (or `-` for stdin) sends a body as is; `--paginate` prints every item of a list; `--raw` prints a body that isn't JSON. |
| `coss completion <shell>` | The completion script for `bash`, `zsh` or `fish`, e.g. `eval "$(coss completion zsh)"` in `~/.zshrc`. |

Every command takes `--json` (one JSON object per line), `--profile <name>` and `--help`; `coss --version`
prints the CLI's. Results go to stdout, progress to stderr. Exit codes: `0` done, `1` failed, `2` wrong usage,
`130` stopped with Ctrl-C.

## Configuration

| Variable | |
| --- | --- |
| `COSS_API_KEY` | Use this key instead of a saved profile (CI, scripts). |
| `COSS_PROFILE` | The saved profile to use (default: the one `coss login` saved first). |
| `COSS_BASE_URL` | Another API origin, e.g. `http://localhost:3001`. Remembered by `coss login`. |
| `COSS_DASHBOARD_URL` | Another dashboard for `coss login`, e.g. `http://localhost:3000`. |
| `COSS_NO_UPDATE_CHECK` | `1` turns the update notice off. |

Keys are saved in `$XDG_CONFIG_HOME/coss/config.json` (`~/.config/coss`, `%APPDATA%\coss` on Windows),
readable only by you. No flag takes a key: command lines are visible to other local processes.

Once a day, in a terminal, the CLI asks the npm registry for its latest version (a plain `GET` of
`https://registry.npmjs.org/coss-cli/latest`, nothing else is sent) and prints one line on stderr
when there is a newer one. It never runs with `--json`, in CI (`CI`) or when stderr isn't a terminal.

## Development

```sh
bun run --cwd packages/cli build   # tsdown, publint, attw
bun run --cwd packages/cli test
node packages/cli/dist/cli.js --help
bun run --cwd packages/cli build:binaries [native|linux-x64|…]   # standalone executables
bun packages/cli/scripts/smoke-binary.ts packages/cli/binaries/stage/linux-x64/coss
```

## License

MIT
