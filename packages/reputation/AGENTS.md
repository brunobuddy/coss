# packages/reputation — the reputation guard

Read together with the root `AGENTS.md` (conventions, tenancy rule, tests). Paths are from the
repository root.

- **Reputation guard** (`packages/reputation`, tables `reputation_standing` + `reputation_event`, ids `repev_`): the
  worker's `reputation` loop evaluates orgs whose `next_evaluation_at` is due — `recordProviderEvent` marks an org due
  (`markReputationDue`, same transaction) on every live permanent bounce or complaint, and warned orgs are re-checked
  hourly, as are unhealthy rates below minimum volume. Claims use a separate expiring lease; standing/policy
  revisions invalidate stale evaluations. Checks (`ReputationCheck`) measure; `decide` is the only automatic policy: worst severity wins, a warning
  clears when every check is `ok`, and **a suspension is never lifted automatically — only `reinstateOrganization`
  (platform admin, note required)**. The worker never suspends coss.com's own organization (the
  `NOTIFICATIONS_ENVIRONMENT_ID`'s, passed as `systemOrganizationId` to the guard and `screenMessage`): `decide`
  turns its `suspend` results into a warning and screening downgrades its blocks to flags. Admins can't suspend it
  either: both admin suspend actions refuse it (`isSystemOrganization`) and the pages hide the buttons. Every change goes through `applyTransition` (guarded update + history row +
  `account.*` webhooks to live environments + a `reputation_notification` outbox row for warnings and suspensions,
  one transaction). Email's checks (`emailReputationChecks`) are per-recipient
  rates over live emails sent in the window (by `coalesce(sent_at, created_at)`, `SEND_TIME`, so a send scheduled weeks
  ahead counts when it goes out; default 7 days, never before the last reinstatement), excluding
  suppressed/failed/queued/canceled recipients and `SIMULATOR_DOMAIN` (unless the `countSimulatorRecipients` override is on).
  Closed hours (ended ≥ `ROLLUP_SETTLE_MS` ago) are counted once into `email_reputation_rollup` (by that send hour,
  simulator counts kept apart); `recordProviderEvent` bumps an hour's `revision` when a live event changes its counts,
  and the next evaluation recounts only stale hours (CAS on the revision read before counting) plus the window's open
  edges live. Any new write path that changes recipient statuses must invalidate the same way;
  default thresholds (`DEFAULT_REPUTATION_POLICY`) are stricter than SES's. Suspension blocks live sending only:
  `authorizeLiveSender` checks `isSuspended` **first** (`EmailError("account_suspended")`, 403 `permission_error`; an
  idempotent replay still returns) and `liveKeyRestriction` refuses new live keys. It is independent of the SES tenant
  pause (`email_tenant.sending_status`, `sending_paused`), which SES itself lifts — never fold one into the other.
- **Marketing reputation** (per stream): `emailReputationChecks` count each stream on its own
  (`email_reputation_rollup` is keyed by stream too; `countSlices`/`sendingCounts` take one). Transactional checks
  decide the standing as before; marketing checks (`marketing_bounce_rate`, `marketing_complaint_rate`, `scope:
  "marketing"`, thresholds `ReputationPolicy.marketingBounceRate`/`marketingComplaintRate`) never move it:
  `decideMarketing` turns a `suspend` result into a marketing pause (`reputation_standing.marketing_paused_at`,
  `applyMarketingTransition`: history row `marketing_paused`, notification, `account.marketing_paused` webhooks, one
  transaction). `authorizeLiveSender({ stream: "marketing" })` then refuses with `marketing_paused` (403); transactional
  mail goes on. Never lifted automatically: only `reinstateMarketing` (admin, note required), after which marketing
  rates are measured from then on (`marketingWindowStart`). coss.com's own organization is never paused. A complaint about
  a marketing email adds a `stream:marketing` suppression (`MARKETING_STREAM_SCOPE`), not `*`; permanent bounces stay `*`.
  Every `account.*` payload and `GET /v1/reputation` carry `marketing` (`toMarketingObject`).
- **Reputation notifications** (table `reputation_notification`, ids `repntf_`; `packages/reputation/src/notifications.ts`):
  the worker's `reputation-notifications` loop (`runDueReputationNotifications`, system-level) emails a warning or
  suspension to the org's owners and admins with a **verified, unbanned** address, looked up at send time — one email
  per person through a `ReputationNotifier`. The worker wires `emailNotifier` (`@coss/email`): a normal
  live send from coss.com's own environment (`NOTIFICATIONS_ENVIRONMENT_ID`/`NOTIFICATIONS_FROM`, category `account`,
  tracking off), so suppression, events and quotas of that org apply; idempotency key `<notification id>:<user id>`
  (non-expiring for these internal sends; `idempotency_key_reused` counts as sent). Only the org's latest transition
  is announced (a warning overtaken by a suspension or a recovery is `skipped`), as are ones older than 3 days or
  with nobody to receive them. Claims push
  `next_attempt_at` out by a 5-minute lease; failures back off 1, 2, 4… min and become `failed` after 8 attempts.
  Content is customer-facing: trigger label, the checks' messages, advice and a dashboard link — never screening
  scores or admin notes. Recoveries and reinstatements send no email (`NOTIFIED_TRANSITIONS`).
- **Email sub-accounts' own standing** (`packages/email/src/subaccount-reputation.ts`, columns on `email_subaccount`):
  not part of this package's tables. A sub-account's live transactional bounce and complaint rates use the
  organization's policy (`policyOf`) and window (never before its `reinstated_at`), counted live from its emails
  (`countSlices({ subaccountId })`; no rollups yet); `markSubaccountReputationDue` is called next to
  `markReputationDue` by `recordProviderEvent`, and the worker's `reputation` loop also runs
  `runDueSubaccountEvaluations` (warned ones, and unhealthy rates below minimum volume, re-checked hourly; a marker
  set during an evaluation is kept). `decideSubaccount`: `good` ⇄ `warning`, `suspend` → `paused`, never lifted
  automatically (only `reinstateSubaccount`: the customer, from the API or dashboard). Transitions bump `revision`
  (stale evaluations write nothing) and send `subaccount.*` webhooks to the sub-account's environment (live only). A
  paused sub-account never moves the organization's standing, which still counts all its sending.


- Reinstating an organization also clears its non-group `email_sender_domain_block` rows in the
  transition transaction. This is the support release path for sender-domain screening restrictions;
  neither automatic warning recovery nor domain/organization deletion clears this abuse memory.
