# apps/api — the public API

Read together with the root `AGENTS.md` (conventions, tenancy rule, tests). Paths are from this
directory unless they name a workspace.

- `createApp(opts)` (`src/app.ts`) is side-effect free; services are injected via `CreateAppOptions` and `src/index.ts`
  wires env (`webhookDeps` is required — a throwaway secrets key would make the endpoints it creates
  undeliverable; `emailService` is required — `src/index.ts` builds it on the pg-boss queue; `domainDeps` defaults to
  the fake provider). Middleware order: request id → `secureHeaders` → `bodyLimit` (5 MB; `POST /v1/emails` uses its own 40 MB limit after authentication) → `logger` (off under test). Every
  response carries a server-generated `X-Request-Id: req_…` (client values are ignored).
- The only unauthenticated routes are `/health`, `/health/ready` (for uptime monitors; load balancers stay on `/health`, which never touches the database), `/openapi.json` and the tracking endpoints `GET /t/o/:token`
  (open pixel, always a GIF) and `GET /t/c/:token/:position` (302 to the stored link, else a plain-text 404)
  (`src/routes/tracking.ts`). They are plain Hono routes outside `/v1` and the OpenAPI document, never return the
  error envelope, record nothing for HEAD, and get `Cross-Origin-Resource-Policy: cross-origin` (everything else keeps
  `same-origin`).
- Errors are always the envelope `{ error: { type, code, message, param?, issues?, hint?, request_id } }`, built only by
  `errorResponse` (`src/errors.ts`). Throw `new ApiError(status, { type, code, message, param? })` with `type` from
  `ERROR_TYPES`, or a product error mapped in `toApiError`; anything else is logged and returned as a generic 500. Never
  hand-build error JSON.
- New endpoint: `createRoute({ …, security: [{ bearerAuth: [] }], middleware: [requireApiKey({ <product>: ["<action>"] }), rateLimit("api.read" | "api.write" | "api.send")] })`
  + `router.openapi(route, handler)`, mounted in `createV1Router` (`src/routes/v1.ts`). Auth goes in `middleware` so it
  runs before validation (401 beats 422). Tenancy comes only from `c.var.auth` — environment-scoped resources filter by
  `environmentId`, organization-scoped ones (domains, audit events, billing) only by `organizationId`. Document responses with
  `jsonDoc`/`errorDoc`/`commonErrors` (`src/routes/docs.ts`, includes 429). The root `validationHook` turns zod failures into 422 + `issues`;
  a per-route hook must end with `validationHook(result)`. `test/app.test.ts` asserts the exact OpenAPI path list.
- Every operation needs an `operationId` (it names its docs page). Wire schemas carry a whole-object
  `.meta({ examples: [...] })` (OpenAPI 3.1 form; the singular `example` is ignored by the docs), checked by
  `packages/{email,webhooks}/test/schema-examples.test.ts`; they feed the reference's samples and playground. After route changes
  run `bun run openapi:generate`, add the operation's SDK sample in `apps/site/src/lib/sdk-samples.ts` and its method
  to `SDK_METHODS` in `tooling/sdkgen/src/methods.ts` (the same name; to `NO_RETRY` too when the API doesn't
  deduplicate it, like the TypeScript SDK's `retry: false`) — tests enforce all three. The generated SDKs
  (`sdks/*`) and their docs samples (`tooling/sdkgen/snippets.json`) follow in main's "Regenerate SDKs" PR.
  Webhook event schemas no route returns are listed in `src/webhook-events.ts` (components of the document, so the
  generated SDKs type them).
- **Versions** (`Coss-Version: YYYY-MM-DD`, `@coss/versioning`): handlers always build the latest shape. The
  `apiVersion` middleware (`src/middleware/api-version.ts`, on `/v1/*`) rejects unknown versions (400
  `invalid_api_version`, before authentication), echoes `Coss-Version` and renders 2xx JSON bodies in the caller's
  version; `requireApiKey` resolves `c.var.apiVersion` (header, else the org pin from `authenticateApiKey`). Routes
  with a JSON body end their `middleware` with `upgradeRequestBody("<METHOD> /v1/<path template>")` (after the body
  limit, before validation). Error envelopes, CSV and `/t/*` are never versioned. The OpenAPI `Coss-Version`
  parameter/header and `info.version` are added by `withApiVersionDocs` (`src/openapi-versions.ts`).
- Long polls (`POST /v1/webhook_listeners/{id}/poll`, `coss listen`) wait at most 25 s (CloudFront's and the ALB's
  60 s) and end on `AbortSignal.any([c.req.raw.signal, shutdownSignal])`: `src/index.ts` aborts `shutdownSignal`
  on SIGTERM before draining, so they never hold a deploy up. They aren't request-logged (`request-log.ts`) or
  traced (`@coss/observability`). `GET /v1/environment` and `DELETE /v1/api_key` take any valid key
  (`requireApiKey({})`): a key can always describe and revoke itself.
- **Trace context**: `traceContext` (`src/middleware/trace-context.ts`, on `/v1/*`) reads the W3C `traceparent`
  (`parseTraceparent` from `@coss/webhooks/schemas`: invalid ones ignored, never refused; stored as version 00) into
  `c.var.traceparent`. Sends pass it to the service (`SendEmailInput`/`SendEmailBatchInput`/`InboxSendInput`/
  `SendSmsInput.traceparent`, never part of the request hash), which stores it on `email.traceparent` /
  `sms_message.traceparent`; event log lines and webhook payloads echo it (`data.traceparent`, only when set), and
  webhook delivery sends it as a `traceparent` header (`traceparentOf`).
- CORS: only `/v1/*`, only `API_CORS_ORIGINS`, never `credentials` — the API authenticates with bearer keys and must
  never accept the dashboard's session cookie (that would need CSRF protection on every endpoint). The one exception
  is `/scheduling/client/*`, outside `/v1`: open preflights, since a session token is its only authority, with real
  requests checked against the environment's `allowed_origins`.
