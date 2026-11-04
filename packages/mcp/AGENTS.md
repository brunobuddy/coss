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
  (`tools/setup.ts`, `fetchSetupReport` in the SDK) is the readiness answer, per product with `product`
  (`packages/sdk/src/setup.ts`: at most three extra reads, sandbox steps from each product's docs testing page; it
  describes a project's setup state, never whether a product is on in a deployment, and a failed read is `warning`).
  Without `product` it answers for email and lists `products_in_use` (one `limit=1` read per product the key may
  read: `GET /v1/environment` doesn't say). Risk, Hooks, inboxes
  (`tools/inboxes.ts`: an agent's own address, its threads with each message's `extracted_text`, sends and
  replies), marketing (`tools/marketing.ts`), Verify, Sign, Forms and Scheduling have tools that call only the public
  SDK, as do template drafts. `publish_email_template` publishes the revision it just read. `save_*` tools update with
  an id and create without one; broadcasts and signature requests are always created as drafts (`send: false`), so
  only `send_broadcast` and `send_sign_request` reach people. `upload_sign_document` reads a PDF by path, only inside
  `projectDir` (through symlinks too). `COSS_MCP_TOOLSETS` (`TOOLSETS` in `src/server.ts`) offers fewer tools.
  Sub-accounts (`tools/subaccounts.ts`) and log drains (`tools/log-drains.ts`) are toolsets of their own.
  `api_get` (`tools/api.ts`, always there) GETs any `/v1/` path through `coss.request` and refuses everything else
  (`refusedPath`: dot segments, encoded slashes, anything with `secret` in the path); it has no write equivalent, so
  other operations can't bypass the write annotations. Its answers are cut and labelled untrusted.
  Prompts (`src/prompts.ts`) only write instructions naming tools; resources (`src/resources.ts`) are the docs'
  index (`/llms.txt`, no key needed) and the setup report. The capabilities in `src/server.ts` say so.
  `create_webhook_endpoint` registers a URL once and writes `COSS_WEBHOOK_SECRET` into the project
  env file (the same file the CLI uses; a repeat for that URL does not create another endpoint).
  Third-party text (email content, received mail, bounce and
  webhook responses) is labelled untrusted, and the server's `instructions` say so.
- Diagnosis is the SDK's `coss/diagnose` (`packages/sdk/src/diagnose*.ts`, shared with the CLI's `… diagnose`
  commands): each `diagnose*` is pure (the object + best-effort context → verdict, summary, explanation, next steps,
  warnings), each `fetch*Diagnosis` reads first; next steps name the server's tools through `references`
  (`tools/diagnose-references.ts`; `test/agent-surface.test.ts` checks they exist). Each file's header names the
  product files it must match: change them together. Answers leave out what they don't need (form values, codes,
  addresses of signers' sessions), and what third parties wrote (signers' names, response excerpts) carries a `note`.
- `outputSchema` only on `get_setup` and the diagnose tools (`tools/output-schemas.ts`): clients reject a result that
  doesn't match, so they're `looseObject`s (a plain `z.object` becomes `additionalProperties: false`), with strings
  rather than enums for verdicts and statuses, promising only what the SDK always returns. Don't add them elsewhere.
- `apps/api/test/agent-surface.test.ts` requires every API operation to be called by a tool or CLI command, or
  listed with a reason in `agent-surface-exemptions.ts` (stale lines fail too: delete them). `test/agent-surface.test.ts`
  requires every tool in `(tools)/mcp.mdx` and the README.
- Dependencies are explicit versions (`npm publish` doesn't rewrite `workspace:`/`catalog:`); `coss` is a caret
  range that changesets moves when the SDK's version leaves it. The release job publishes it after `coss`.
- Tests: `packages/mcp/test` (in-memory client, fake `fetch`) and `apps/api/test/mcp-contract.test.ts` (built
  server against the in-process app; turbo builds it first).
