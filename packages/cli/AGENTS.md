# packages/cli — the public CLI (`coss-cli`, command `coss`)

Read together with the root `AGENTS.md` (conventions, tenancy rule, tests). Paths are from this
directory unless they name a workspace.

- `run(argv, io)` (`src/run.ts`) dispatches commands (`src/commands/*.ts`); everything outside the process (env,
  streams, `fetch`, clock, browser, prompts, cwd, child processes, config dir, the Ctrl-C signal) comes through `CliIo` (`src/io.ts`), so
  tests run commands in process. `src/cli.ts` is the bin (`nodeIo()`). Results go to stdout (`--json`: one object per
  line), progress and warnings to stderr. Usage errors exit 2, failures 1, Ctrl-C 130.
- Calls only the public SDK (`clientFor` always passes `apiKey`, `baseUrl` and `fetch`, so the SDK never reads
  `process.env` itself) — never workspace packages (AGPL) or the database; anything a command needs must exist in the
  public API first. No flag takes an API key (command lines are visible to other processes): `COSS_API_KEY`, else
  the profile (`--profile`, `COSS_PROFILE`, the saved default) in `config.json` (`src/config.ts`: XDG/APPDATA/
  `~/.config/coss`, 0600, written atomically). Login remembers a non-default `COSS_BASE_URL`/`COSS_DASHBOARD_URL`.
- `login`: the dashboard's CLI sign-in (`packages/auth/AGENTS.md`, "CLI sign-in") — PKCE with a 127.0.0.1 loopback
  server (`src/auth/loopback.ts`), or `mode=code` (pasted) with `--no-browser` and over SSH; `verificationCode`
  (`src/auth/pkce.ts`) must equal `cliVerificationCode` (`@coss/auth/cli`; both tests pin `DZ93-GPCX`). Keys it
  created (`login: "browser"`) are revoked by `logout` and by the next login of the profile (`coss.apiKey.revoke()`, at the
  profile's saved origin, never `COSS_BASE_URL`'s). Polling commands retry only transient errors (`isTransient`).
- `init` reuses login's browser flow with a `project` hint (the approval page then offers sandbox environments
  only and names the key after the project; `apps/web/src/app/app/authorize/cli/params.ts`), checks the key's
  environment again (a live key is revoked, never written) and writes it to the project's env file, never the
  profile. Agent notes are on by default (`--no-agents` skips them). It detects Nodemailer, Better Auth, Auth.js,
  Laravel, Rails and Django (`project-stack.ts`) and prints that drop-in, then `fetchSetupReport` (`describeSetup`
  in the SDK) as the one next step (`--json` includes it as `setup`; a failed list is a warning and still returns
  a next step). The update notice (`src/update-check.ts`) asks the npm registry at most once a day, runs alongside the
  command and is dropped if it hasn't answered when the command ends; never with `--json`, in CI, off a TTY or with
  `COSS_NO_UPDATE_CHECK`.
- `listen`: opens a webhook listener (`packages/webhooks/AGENTS.md`), long-polls (`wait_ms` 20 s, SDK timeout 35 s,
  no SDK retries), forwards each body byte for byte to `--forward-to`, signed with `COSS_WEBHOOK_SECRET` from the
  project env file (an existing valid secret is kept; otherwise the profile's `listen_secret`, otherwise a new
  `whsec_` from `src/listen/sign.ts`, Standard Webhooks). It writes that secret into the env file, and into the
  profile when the CLI key came from the profile. `webhook-id` = the event id
  (and `traceparent` = the body's `data.traceparent`, like the real delivery), and acks results in the next poll; Ctrl-C acks what was forwarded and deletes the listener. Live environments
  need `--live`.
- `trigger <type>`: `POST /v1/webhook_events/test` (`coss.webhookEvents.test`; `sendTestWebhookEvent` in
  `packages/email/src/test-events.ts`): a sample event built from the type's schema example, fresh ids, `data`
  merged over it and checked against the schema (unknown fields refused), fanned out through the outbox like a
  real one. Sandbox environments only, never the live-only `domain.*`/`account.*`/`billing.*`; nothing in the body
  marks it as a test. The SDK's `WEBHOOK_EVENT_TYPES`/`TEST_WEBHOOK_EVENT_TYPES` (completion) are hand mirrors of
  `@coss/email`'s, kept equal by `sdk-contract.test.ts`. `webhooks list|add|deliveries|retry` wrap the endpoint API.
  `webhooks add` writes the new endpoint's signing secret to the project env file as `COSS_WEBHOOK_SECRET`.
- `inboxes list|create|threads|thread|reply` wrap `coss.inboxes` (`src/commands/inboxes.ts`; `thread` prints each
  message's `extracted_text` unless `--full`); `inbox` (singular) follows every received email.
- `verify …` (`src/commands/verify.ts`), `contacts …`, `broadcasts …` (`marketing.ts`), `audiences …`, `segments …`,
  `topics …`, `marketing settings …` (`marketing-lists.ts`), `suppressions …`, `subaccounts …`, `log-drains …`,
  `risk rules|check|classify|settings` (`risk-manage.ts`), `sign …` (`sign.ts`) and `sms`, `forms` and `scheduling`
  share `src/commands/list-output.ts` (`--limit`, tables, `confirmLive`, `secretInput`, flag values). Text someone
  else wrote goes through `printable`. `broadcasts send` and `resume`, `scheduling book|reschedule|approve|decline` and
  `emails reschedule` to a past time ask before a live send and need `--yes` off a terminal, as do the deletes that
  can't be undone and take a lot with them (`forms remove`, `subaccounts delete`); other removes don't ask;
  `broadcasts create` and `sign create` make drafts (`sign create --send` sends); `verify check` exits 1 for a wrong
  code, `contacts import` when it skipped a row, `audiences contacts add` when one is no contact. Secrets never come
  from a flag: `secretInput` prompts or reads stdin (`log-drains --auth-header`, `risk settings set
  --captcha-secret-stdin`). `--data` takes the rest of a request body as JSON (inline, `@file`, `-`) and flags win over
  it. `test/management.test.ts` holds a case per management command.
- A word can be both a command and a group (`scheduling hosts`, `scheduling event-types`, `sign templates`, `inbox`):
  `findCommand` takes the longest match, so keep the bare form working and add `<word> list`. `run` treats a word
  after such a command as an unknown subcommand. Unknown-command errors point at `coss api`.
- `logs tail` polls `GET /v1/logs` like the dashboard's live mode (re-reads from a minute before the newest line,
  prints unseen ids oldest first, `src/logs/tail.ts`); `emails send --simulate` uses the mailbox simulator addresses
  (`src/emails/simulate.ts`, must match `packages/email/src/providers/fake.ts`).
- Dependencies are explicit versions, `coss` a caret range (like the MCP server); the release job publishes it after
  `coss`. Tests: `packages/cli/test` (fake `fetch`, real loopback and receiver servers) and
  `apps/api/test/cli-contract.test.ts` (built CLI against the in-process app; turbo builds it first).
- It also ships as a standalone executable (Bun's compiled runtime, not Node: `bun run build:binaries`, output in
  the git-ignored `packages/cli/binaries/`; releases under "CLI binaries" below). Keep `src/` to what both run:
  `test/binaries.test.ts` compiles this machine's binary, installs it with `install.sh` and runs
  `scripts/smoke-binary.ts` on it (stdin, pipes flushed on exit, the config file, Ctrl-C, the browser sign-in's
  loopback server).
- **CLI binaries** (the `cli-*` jobs of `release.yml`, after `publish`): for the `coss-cli@<version>` tag (built
  from the tag, never a newer main) whose GitHub release has no `SHA256SUMS` yet, `packages/cli/scripts/binaries.ts`
  cross-compiles standalone executables (`bun build --compile`, 7 targets: macOS, glibc/musl Linux, Windows; macOS
  ones come out ad-hoc signed). With the repository variable `CLI_MACOS_NOTARIZE` `true`, `cli-binaries-notarize`
  (macOS runner, `apple` environment: `APPLE_DEVELOPER_ID_P12` (base64 `.p12` of the Developer ID Application
  certificate and key) + `APPLE_DEVELOPER_ID_P12_PASSWORD`, `APPLE_NOTARY_KEY` (an App Store Connect API key's
  `.p8`) + `APPLE_NOTARY_KEY_ID` + `APPLE_NOTARY_ISSUER_ID`) re-signs them with the hardened runtime and Bun's JIT
  entitlements, has Apple notarize them (`scripts/notarize.ts`; a bare executable can't be stapled, so Gatekeeper
  checks online) and archives them again with a new `SHA256SUMS`; the smoke tests then run the notarized builds,
  quarantined on macOS as a browser download is, and `codesign --check-notarization` asks Apple about them. Running
  `release.yml` by hand on main (`gh workflow run release.yml`) is a dry run: it builds the executables from main,
  notarizes and smoke-tests them, and publishes nothing (no npm, release or tap), so the `apple` secrets can be
  checked between releases. Releases are notarized since coss-cli 0.3.0 (the CLI's README and `cli.mdx` say so;
  turning `CLI_MACOS_NOTARIZE` off means putting back their `xattr -d com.apple.quarantine` note). The certificate
  is Cal.com, Inc.'s (team `ADWKXDJV75`, G2 Sub-CA) and expires 2027-11-18: replace the two `.p12` secrets before
  then. The notary key is the App Store Connect team key "coss-cli notarization" (Developer role).
  `scripts/smoke-binary.ts` runs them on their own OS (musl in Alpine,
  which needs `libstdc++`), and the release gets the archives + `SHA256SUMS`, marked latest (`install.sh` and
  `releases/latest` rely on the CLI being the only package with GitHub releases). Then `scripts/homebrew.ts` renders
  `Formula/coss.rb` from that `SHA256SUMS` and pushes it to `cosscom/homebrew-tap` with the deploy key
  `HOMEBREW_TAP_DEPLOY_KEY` (`homebrew` environment) — never edit the tap by hand. Every job is skipped until the
  repository variable `CLI_BINARIES_PUBLISH` is `true`; each checks the release first, so a rerun fills in what's
  missing. `packages/cli/install.sh` (served from main's raw URL) is the `curl | sh` installer: it verifies the
  archive against `SHA256SUMS`.
