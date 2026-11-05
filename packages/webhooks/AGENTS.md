# packages/webhooks — webhooks, the delivery engine, log drains

Read together with the root `AGENTS.md` (conventions, tenancy rule, tests). Paths are from the
repository root.

- **Webhooks:** deliver only through `createWebhookSender` (every resolved address must be public; the socket is pinned
  to the checked address; no redirects; 10 s timeout for coss.com's own webhooks and log drains, 15 s for Hooks; 1 KB response excerpt). `allowPrivateNetworks`/insecure URLs are
  for non-production only. A payload whose `data.traceparent` is set (emails and text messages sent with one) is
  delivered with that `traceparent` header too (`traceparentOf`, `trace-context.ts`), and its attempt log line names it. Payloads never include bodies, headers, cc or bcc (email's); Forms' `form.submission.*` carry the submitted fields by design (the product's point), never uploaded files' bytes. Secrets are AES-256-GCM encrypted with
  `WEBHOOK_SECRETS_KEY`, a key ring (`parseSecretsKeys`): stored as `v2:<key id>:<iv>:<ciphertext>:<tag>` (the
  `v2:<key id>` prefix is the AAD; ids are derived from the keys), encrypted with the first key, decrypted with the
  one named. Keyless `v1:` rows from before are still read by trying every key until `webhooks:reencrypt` rewrites
  them. Every write of a secret column goes through `encryptSecret`, and `reencryptWebhookSecrets` must cover every
  encrypted column (today the webhook and Hooks endpoints' `secret_ciphertext` and `previous_secret_ciphertext`, `log_drain.secret_ciphertext` and `auth_header_ciphertext`, `risk_settings.captcha_secret_ciphertext`, `scheduling_calendar_connection.encrypted_credentials`, `scheduling_calendar_delegation.encrypted_credentials`, `scheduling_oauth_app.encrypted_credentials` and `migration.credentials_ciphertext`, the provider key an import from another provider holds until it finishes). Rotation runbook: README.md,
  "Rotating `WEBHOOK_SECRETS_KEY`". The initial upgrade from v1-only readers must use README.md's
  "Upgrading from v1 webhook secret storage" coordinated cutover, not a rolling deployment.
- **Delivery engine** (`@coss/webhooks/engine`): webhook deliveries, log drain batches (and future products) share
  `organizationNotHeld` (suspended or deleting orgs are held), `deliveryOutcome` (retry schedules; jitter only with
  an injected `random`), `sendAttempt`, `endpointHealth` and `runClaimed`; each product keeps its own tables and SQL.
  A claimed row's `lease_expires_at` is its fencing token: always bind it from a JS `Date` (`leaseUntil`), finish
  with a `stillOwned` update **first**, and write attempt rows, log lines and health changes only when that update
  matched, so a worker whose lease was taken over records nothing.
- **Endpoint health** (`webhook_endpoint.failing_since`, `disabled_reason` `manual`|`failing`, `disabled_at`; no
  CHECK ties them to `enabled`, since code running during a deploy's migration sets `enabled` alone, so a disabled
  endpoint without a reason reads as `manual`): a delivery that failed every attempt starts a streak, any success ends it
  (both written only when they change), and one failing for good 5 days into a streak
  (`DISABLE_FAILING_ENDPOINT_AFTER_MS`) disables the endpoint with a system `webhook_endpoint.disabled` audit event.
  Enabling it clears the streak. `recoverWebhookEndpoint` (`POST /v1/webhook_endpoints/{id}/recover`,
  `webhook:update`) requeues failed deliveries since a time, ≤ 1,000 per call, locking their parent messages first
  (in id order) like `retryWebhookDelivery`, so retention can't purge what it requeued.
- **Secret rolls** (`rollWebhookEndpointSecret`, `POST /v1/webhook_endpoints/{id}/roll_secret`, the dashboard's
  **Roll secret**, `webhook:update`): one UPDATE moves the current secret to `previous_secret_ciphertext` with
  `previous_secret_expires_at` (default a day, at most a week, `0` = none; both columns or neither, a CHECK) and
  stores a new one. Until then deliveries carry both signatures in `webhook-signature` (`signingSecrets`, checked at
  each attempt), which `verifyWebhook` already accepts. A second roll drops the older previous secret, so rolls are
  not idempotent and the SDK never retries them. The new secret is returned only in that response; reads expose
  `previous_secret_expires_at`, never a secret.
- **Log drains** (`log_drain` (ids `drain_`), `log_drain_record` (`drainrec_`), `log_drain_batch` (`drainbat_`),
  `log_drain_attempt` (`drainatt_`); management and delivery in `@coss/webhooks`, the outbox in `@coss/logs`): an
  environment's log lines (exactly the `GET /v1/logs` objects) and its environment-scoped audit events
  (`{ object: "audit_event", … }`; org-wide events never reach drains), filtered by `sources`. `appendLogEntries` and
  `recordOrgAuditEvent` select the environment's enabled drains under `FOR KEY SHARE` in the transaction that
  writes the line and its records (a savepoint inside the caller's); management and exhaustion take `FOR UPDATE`
  before changing eligibility — so every `log_entry` write path queues drain records without racing disable/delete;
  record ids ascend in write order and order delivery. The worker's `log-drains` loop (`runDueLogDrainDeliveries`,
  system-level) forms one open batch per drain at a time (partial unique index; the drain is locked `FOR NO KEY UPDATE
  SKIP LOCKED` so it never blocks lines being queued), ≤ 500 lines / 1 MB of NDJSON (`takeBatch`), and posts it
  through `createWebhookSender` encoded in the drain's `format` (`log-drain-formats.ts`, pure: `ndjson`
  `application/x-ndjson`, `loki` push, `datadog` intake, `otlp` OTLP/HTTP JSON; each carries every line whole),
  Standard Webhooks-signed with `webhook-id` = the batch id (stable across retries), plus the drain's optional auth
  header (`auth_header_name` + `auth_header_ciphertext`, both or neither, a CHECK; the value goes only through
  `encryptSecret`, is never returned, revealed or audited — audit metadata names the header only; names coss.com
  sets are refused by `logDrainAuthHeaderNameProblem`). The body is encoded from the drain as it is at each attempt,
  so a format, URL or header change applies to the batch being retried. Retries back off over ~a day (`LOG_DRAIN_RETRY_DELAYS_MS`); an exhausted batch disables the drain
  (`disabled_reason = 'failing'`), drops its backlog and records a system `log_drain.disabled` audit event. Disabling
  by hand also drops the backlog; nothing is queued for a disabled drain. Suspended organizations' drains are held.
  Drain deliveries are never written to `log_entry` (that would feed itself). Retention (`purgeExpiredLogDrainBatches`):
  finished batches after `RETENTION_DAYS.logDrainBatches`, unbatched lines after `logDrainBacklog`. Lines are not
  versioned (like `GET /v1/logs`). Permissions: `logDrain` (members read; API keys all, backfilled by `0040`); revealing a
  secret needs `logDrain:update`.
- **Webhook listeners** (`coss listen`; `webhook_listener` (ids `whlis_`), `webhook_listener_delivery` (`whlisdel_`),
  `src/listeners.ts`, `/v1/webhook_listeners*`, `coss.webhookListeners`): coss.com can't POST to `localhost`, so the CLI
  pulls. A listener is **not** an endpoint (own tables), so the worker's delivery loop, plan limits, endpoint health,
  recover and the endpoint API never see one; `enqueueWebhookMessage` fans out to the environment's open listeners
  (`expires_at > now()`, `FOR KEY SHARE`) next to its endpoints, and writes the message if either subscribed
  (`fanOutWebhookMessage` is the same call, returning both counts: test events, `coss trigger`, report them).
  Listeners stay open while polled (`touchWebhookListener`: +`LISTENER_IDLE_TTL_MS`, 10 min) and are closed softly
  (`expires_at = now`, never a DELETE racing a fan-out insert); `purgeExpiredWebhookListeners` removes them a day
  after expiry (cascading their deliveries; a purged message takes its listener deliveries too). At most
  `MAX_LISTENERS_PER_ENVIRONMENT` (5) open per environment. `pollWebhookListener`: touch, record acks, then
  claim/wait (`intervalMs` sleeps outside any connection; ≤ 25 s, ends on the request's or the server's
  `shutdownSignal`). Claims are leased (`leaseUntil`, 2 min) and the lease is the delivery's `ack_token`; acks are
  fenced by it (`stillOwned`) and write one `webhook.forward` log line each — no `webhook_attempt`, no retry (a
  failed forward is final), no endpoint health. Unacknowledged deliveries are handed out again (same `event_id`)
  until `MAX_HAND_OUTS`. Bodies are rendered per listener `api_version` and returned as a **string** (never
  rewritten by response versioning). Listeners hold no secret: the CLI signs what it forwards (Standard Webhooks)
  with its own `whsec_`, so `reencryptWebhookSecrets` has nothing to cover. Polls are not request-logged
  (`apps/api/src/middleware/request-log.ts`) nor traced (`@coss/observability`); creating one is audited
  (`webhook_listener.created`).
