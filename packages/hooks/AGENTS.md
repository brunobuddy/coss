# packages/hooks — Hooks (webhooks as a service)

Read together with the root `AGENTS.md` (conventions, tenancy rule, tests). Paths are from the
repository root.

- **Hooks** (`packages/hooks`, `/v1/hooks/*`, `coss.hooks`, permission `hook`): customer messages are opaque JSON
  with customer-defined types, kept apart from coss.com's own `webhook_*` tables (which render through `@coss/versioning`)
  on the shared delivery engine. Every function takes `organizationId` (+ the environment or application); the API
  addresses applications by id **or** `uid` (`requireHookApplication`). `hook_message`/`hook_delivery`/`hook_attempt`
  are partitioned by UTC day of the **message** (migrations 0050/0051) with **no default partition** (expired days
  are detached `CONCURRENTLY`; `migrate.ts`, the test preload and the worker keep days ahead): nothing has an FK into
  them, they have none to applications or endpoints (deleting one must never cascade into millions of rows; a
  delivery to a missing endpoint fails at its attempt) and none to `environment` either (dropping a partition that
  references a table takes an ACCESS EXCLUSIVE lock on that table; organization deletion deletes them). Their
  `created_at` and ids are bound from the same JS millisecond (`newId(prefix, ms)`, never `defaultNow()`), so an id
  alone finds its partition: every lookup by id adds the partition column (`cursorOf`). Idempotency keys live in
  `hook_idempotency_key` (a partitioned table can't be unique on them). Sends are charged per fan-out
  (`hooks.messages.second`/`hooks.deliveries.day`, sandbox `hooks.sandbox_deliveries.day`, refunded on replays and
  errors); live sends refuse reputation-suspended orgs (`account_suspended`) and billing holds (`billing_hold`, 402),
  replays still return. **Billing**: a live, non-test message is one `hooks.messages` unit whatever its fan-out,
  metered in the transaction that accepts it (`recordUsage`), after `budgetHoldFor` (`budget_exceeded`, 402) and with the
  injected `UsageGate` as that transaction's last statement (Free's cap, `usage_limit_exceeded`, rolls the send and its
  idempotency key back); retries, recoveries, test sends (`onlyEndpointId`), replays and sandbox are free, and `@coss/hooks` imports only
  `@coss/billing/{metering,gate}`. Delivery
  (`runDueHookDeliveries`): claims at most `MAX_IN_FLIGHT_PER_ENDPOINT` per endpoint, skips held orgs
  (`parkHeldHookDeliveries` puts their due rows off an hour so they never block the queue's head), batch-loads
  messages and endpoints, charges `hookThrottle` (per endpoint, `org:host`, global per host; a denial reschedules
  without counting an attempt), then signs the stored payload (`webhook-id` = message id) and finishes fenced. Payloads
  are normalized JSON (parsed and re-serialized), and `OPAQUE_FIELDS` keeps versioning out of payloads, schemas,
  examples and metadata. Portal sessions: only the token's sha256 is stored; the URL is `<PORTAL_PUBLIC_URL>/s/<id>#<token>`
  — never put a token in a path, query or cookie. `reencryptWebhookSecrets` must also cover `hook_endpoint` secrets.
  Abuse: an endpoint failing for 5 days is disabled (`endpointHealth`), which records a `hook_endpoint.disabled` audit
  event and sends the customer's own webhook endpoints a `hook_endpoint.disabled` event (`HOOK_OPERATIONAL_EVENT_TYPES`
  in `@coss/webhooks/schemas`, part of `WEBHOOK_EVENT_TYPES`), in the same transaction. Live outcomes are counted per
  org and hour into `hook_delivery_rollup` (once per claimed batch, `recordHookDeliveryOutcomes`, the worker's
  `onFinished`; sandbox never counts) for the `hook_failure_rate` check (`hookFailureRateCheck`), which only warns by
  default (`ReputationPolicy.hookFailureRate.suspend: null`; admins can set one per org). Dashboard:
  `[envSlug]/hooks/*` (applications, endpoints, messages, event types, portal settings; `hook:*` permissions);
  "Open portal" mints a session for the signed-in member (`createHookPortalSession({ userId })`).
