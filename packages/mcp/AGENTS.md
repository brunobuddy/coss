# packages/mcp — the public MCP server (`coss-mcp`)

Read together with the root `AGENTS.md` (conventions, tenancy rule, tests). Paths are from this
directory unless they name a workspace.

- `createCossMcpServer({ coss, apiKey })` (`src/server.ts`) registers every tool on an `McpServer`
  (`@modelcontextprotocol/server` v2); `src/cli.ts` serves it over stdio (`serveStdio`). Configuration comes from the
  environment only (`COSS_API_KEY`, `COSS_BASE_URL`), never argv; stdout is the protocol, so log to stderr. With no
  `COSS_API_KEY`, `cli.ts` reads a `coss_test_` key from the project's `.env.local` or `.env` (`project-env.ts`) and
  never loads a `coss_live_` key from that file.
- Tools (`src/tools/*.ts`) call only the public SDK — never workspace packages (AGPL) or the database — so anything a
  tool needs must exist in the public API first. The exception is `search_docs`/`read_docs` (`tools/docs.ts`), which
  fetch coss.com's public docs (`/docs/search.json`, `<page>.md`, nothing outside `/docs`) and work without a key:
  with no `COSS_API_KEY` the server registers only them. Every tool carries annotations (`READ_ONLY`, `WRITE`,
  `DESTRUCTIVE`, `SENDS` in `tools/shared.ts`); clients rely on them to prompt (full-access keys hold every
  permission; a restricted key's 403 hint points at `get_account_status`, which lists what it holds).
- Answers stay small: lists drop content (`compact`, `emailListItem`), bodies are cut (`truncate`), API failures
  become `isError` results with a hint (`result.ts`; the API's `error.hint` wins over the local one). `get_setup`
  (`tools/setup.ts`, `describeSetup` in the SDK) is the readiness answer. Risk, Hooks, inboxes
  (`tools/inboxes.ts`: an agent's own address, its threads with each message's `extracted_text`, sends and
  replies), marketing (`tools/marketing.ts`), Verify, Sign, Forms and Scheduling have tools that call only the public
  SDK, as do template drafts. `publish_email_template` publishes the revision it just read. `save_*` tools update with
  an id and create without one; broadcasts and signature requests are always created as drafts (`send: false`), so
  only `send_broadcast` and `send_sign_request` reach people. `upload_sign_document` reads a PDF by path, only inside
  `projectDir` (through symlinks too). `COSS_MCP_TOOLSETS` (`TOOLSETS` in `src/server.ts`) offers fewer tools.
  `create_webhook_endpoint` registers a URL once and writes `COSS_WEBHOOK_SECRET` into the project
  env file (the same file the CLI uses; a repeat for that URL does not create another endpoint).
  Third-party text (email content, received mail, bounce and
  webhook responses) is labelled untrusted, and the server's `instructions` say so.
- **Hosted server** (`https://api.coss.com/mcp`, `src/http.ts`, `coss-mcp/http`): `createHostedMcp` answers one
  authenticated POST with a new server and a new SDK client holding that caller's key (stateless: no sessions, no
  streams, `maxSubscriptions: 0`); 2026-07-28 and 2025-era clients both get one JSON body. `apps/api`'s
  `src/routes/mcp.ts` authenticates, rate limits and says how the API is reached. `transport: "hosted"` makes
  `ctx.projectDir` `null`: a tool that reads or writes files must check it and omit or adapt itself
  (`upload_sign_document` is omitted; `create_webhook_endpoint` returns the secret), and `test/hosted.test.ts` calls
  every hosted tool with paths for arguments and fails if `node:fs/promises` is touched, or if a file under
  `src/tools/` starts importing the filesystem without being listed. Outgoing requests are pinned: the API's `/v1/*`
  at the origin given at start, the docs' origin (redirects never followed). No request can name another. An API
  call's answer is read here, not by the SDK (`readAnswer`): at most 8 MiB, cancelled on a stop, and a 2xx that isn't
  JSON is refused unread, because an in-process streaming route has nothing else stopping it. Failures this server makes
  itself carry their own `hint` in the envelope, as `result.ts`'s hints name the local server's env vars. `drain` waits
  for API calls that outlive their request (`apps/api`'s `onDrained`, before it closes the database). The
  key goes no further than the SDK client: `onFailure` gets an error's name only, since messages can quote what
  the caller sent. Don't log in here. `server.json` is for the MCP registry (not published yet: it needs
  `com.coss`'s DNS verification); `version-packages` keeps its versions equal to `package.json`'s.
- Delivery diagnosis is the SDK's `coss/diagnose` (`packages/sdk/src/diagnose.ts`, shared with `coss emails
  diagnose`): `diagnoseEmail` is pure (email + events + best-effort context → verdict), `diagnose` fetches first;
  next steps name the server's tools through `references`. Its explanations of failure codes and recipient
  statuses must match the email product's behaviour: change both together.
- Dependencies are explicit versions (`npm publish` doesn't rewrite `workspace:`/`catalog:`); `coss` is a caret
  range that changesets moves when the SDK's version leaves it. The release job publishes it after `coss`.
- Tests: `packages/mcp/test` (in-memory client, fake `fetch`), `apps/api/test/mcp-contract.test.ts` (built
  server against the in-process app; turbo builds it first) and `apps/api/test/mcp-hosted.test.ts` (`POST /mcp`, the
  built handler in the real app, a real Streamable HTTP client).
