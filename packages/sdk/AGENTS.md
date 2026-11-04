# packages/sdk — the public SDK (`coss`)

Read together with the root `AGENTS.md` (conventions, tenancy rule, tests). Paths are from this
directory unless they name a workspace.

- `Coss` (`src/client.ts`) → one `HttpClient` (`src/core/http.ts`: bearer auth, JSON, per-attempt timeout, retries on
  network/timeout/409/429/5xx honoring `Retry-After`, an `Idempotency-Key` on every POST reused across retries) → one
  resource per product or managed resource (`src/resources/*.ts`: `email`, `domains`, `webhookEndpoints`;
  sub-resources hang off their parent, e.g. `coss.email.suppressions`, `coss.webhookEndpoints.deliveries`). Methods return `{ data, error }` and never
  throw for API/network failures. Webhook endpoint creation disables
  automatic retries because the API does not deduplicate it, even with an `Idempotency-Key`.
- Must run unchanged on Node, Bun, Deno and Workers: no `node:*`, no `Bun.*`, only guarded `globalThis.process`
  access, zero runtime deps. `isolatedDeclarations` is on (exported functions need explicit types).
- React Email (`src/react.ts`): a send's `react` is rendered into `html`/`text` by `@react-email/render`, an
  **optional peer** loaded with a literal `import()` inside try/catch (bundlers include it when installed, only
  warn when not) — never make it a dependency or import React types (`ReactEmailElement` is structural). `react`
  is SDK-only: `contract-types.ts` compares `Omit<SendEmailParams, "react">` with the API's schema.
- **Integrations** (`src/nodemailer.ts`, `src/better-auth.ts`, `src/authjs.ts`; shared code in `src/core/integration.ts`
  + `src/core/mime.ts`): each is its own tsdown entry and describes its host library **structurally** (no import
  from it in `src/`, so no runtime or type dependency; the libraries are optional `peerDependencies` and pinned
  devDependencies). `test/integration-types.ts` (typecheck only) assigns them to the libraries' real types, so
  drift fails `typecheck`; `apps/api/test/integrations-contract.test.ts` runs the built ones against the app. They
  throw `CossSendError` (the libraries report failures by throwing), create their client lazily (a missing key
  fails the first send, not a build), tag `User-Agent` via the internal `INTEGRATION` symbol (never a
  `CossOptions` field), drop the API's reserved headers (`isReservedHeader` mirrors `RESERVED_HEADERS`; the
  contract test sends every one) and refuse what coss.com can't send (raw MIME, custom envelopes, `sender`, AMP)
  rather than dropping it. Auth emails (Better Auth, Auth.js) always send `category: "account"` with tracking
  off — click tracking would route secret links through `/t/c/…` — and derive idempotency keys only from
  single-use tokens (hashed), never from OTP codes or invitation ids, which are legitimately resent.
- **Tracing** (`src/core/tracing.ts`): `@opentelemetry/api` is an optional peer loaded like React Email's renderer
  (literal `import()` in try/catch, described structurally; `test/integration-types.ts` checks the real API fits).
  One client span per call, retries included, named `<METHOD> <route>` (`routeTemplate` matches the API's own
  templates, `src/core/routes.generated.ts`, written by `bun run openapi:generate` from `apps/api/openapi.json`;
  an undocumented path is `<METHOD>` alone; no `url.full`, its query and path can name people). Only the W3C trace
  headers the propagator writes go out (`traceparent`, `tracestate`: the API's CORS allows nothing else, and
  `baggage` is the app's own data), never over one of the SDK's own. `tracing: false` turns it off.
- **Diagnosis** (`coss/diagnose`, `src/diagnose.ts` + `src/diagnose-*.ts`): one pure `diagnose*` and one `fetch*Diagnosis`
  per product (email, SMS, Verify, Sign, Forms, Hooks, Scheduling), all verdict + summary + next steps, used by the MCP
  server and the CLI, which name their own tools or commands through `references`. Each file's header names the
  product files whose behaviour it mirrors. **Setup** (`src/setup.ts`): `fetchSetupReport(coss, { product })`, additive
  on `describeSetup`'s shape; it describes a project's setup state, never whether a product is on in a deployment.
- Error types are listed in three places: `ERROR_TYPES` (`apps/api/src/errors.ts`) and `CossErrorType` +
  `API_ERROR_TYPES` (`packages/sdk/src/core/errors.ts`).
- The api contract tests import the SDK's built `dist`: turbo builds it first, but outside turbo run
  `bun run --cwd packages/sdk build` before api typecheck/tests. `src/version.ts` must equal `package.json` `version`.
- `verifyWebhook` (`src/webhooks.ts`, Web Crypto only) is the one SDK function that throws (`WebhookVerificationError`):
  a failed signature check must not be ignorable. The event body's wire types live in `src/types/webhook.ts`; endpoint
  management's in `src/types/webhook-endpoint.ts`.
- Every request sends `Coss-Version`: `API_VERSION` (`src/api-version.ts`, a hand mirror of `API_VERSIONS`; the
  contract tests keep them equal), overridable with the `apiVersion` client option. The SDK's wire types describe
  `API_VERSION` only.
- Releases: Changesets 3 (`.changeset/`, the SDK, `coss-mcp` and `coss-cli` — every other workspace is private and never versioned).
  `bun run version-packages` also rewrites `src/version.ts` (`scripts/sync-version.ts`) and refreshes `bun.lock`
  (it records workspace versions; CI installs with `--frozen-lockfile`).
- **Publishing** (`.github/workflows/release.yml`): merging the "Version packages" PR publishes `coss` to npm
  from CI only — npm trusted publishing (GitHub OIDC, no npm token anywhere) with provenance, trusted for exactly
  `cosscom/coss` → `release.yml` → the `npm` environment (deployable from `main`); `npm trust list coss` shows it.
  The publish job builds the SDK and runs `npm publish --provenance` itself, skipping a version already on npm,
  waits until the registry serves the new one (usually a minute or two, up to 15 minutes) and tags it. Never
  publish from a laptop. npm owners: baileypumfleet, peer_rich, keithwillcode (versions 0.0.1–0.0.5 are a previous
  owner's unrelated, deprecated package).
- The framework drivers mirror `src/core/mime.ts` and the reserved headers: `integrations/AGENTS.md`. The CLI's
  standalone executables come after `publish` in `release.yml`: `packages/cli/AGENTS.md`.
