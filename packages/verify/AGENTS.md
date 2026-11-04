# packages/verify — Verify (one-time codes)

Read together with the root `AGENTS.md` (conventions, tenancy rule, tests). Paths are from the
repository root.

One-time codes as a service: `start` sends a code to a phone number (SMS) or an email address,
`check` compares what the end user typed. Voice is not built yet.

- **Tables** (`packages/db/src/schema/verify.ts`): `verify_request` (`vrf_`, the API's
  `verification`; Better Auth owns the `verification` prefix), `verify_send` (`vrfsend_`, each
  time a code went out, with its `sms_id`/`email_id`), `verify_check` (`vrfchk_`, keyed checks'
  answers), `verify_settings` (`vrfset_`, one per environment, created on the first change). Everything cascades from the environment.
- **Codes** (`codes.ts`): digits derived for each send (`deriveCode`: a keyed PRF of the
  verification id and the send's sequence, 4–10 digits, default 6); **sandbox environments always
  get zeros** (documented: tests can know the code). Derived, not random, so a send that never went
  out can go again with the same code; that exposes nothing the stored hash doesn't. Only
  `HMAC-SHA256(verifyCodeKey, "<vrf id>\0<code>")` is stored (`code_hash`); the key is HKDF of
  `RISK_HASH_KEY` ("coss-verify-code"), so there is no variable of its own (rotating it voids
  pending codes). Compared with `timingSafeEqual`. `code_hash` is kept until the verification
  expires (an approved one can be checked again idempotently) and cleared when it fails, expires
  on a check, or is canceled. The code itself is never stored, logged or put in a webhook: live
  SMS go out with `discardBody` (`@coss/sms`, cleared on the first event after sending) and emails
  with `discardBody` (the API's sender); with `discardBody`, both services leave the body out of
  the stored request hash too (a plain hash of a 6-digit code is a lookup table). An email's subject never carries the code: subjects are
  kept (and copied into email events and webhooks) after the body is gone.
- **Start** (`service.ts`): the `Idempotency-Key` row first (a replay answers as before; a
  blocked one is refused again), then settings and the destination (E.164 → country and line type
  via `@coss/sms`'s `parsePhoneNumber`/`phoneNumberType`; emails through `emailSyntaxProblem`);
  the country must be in `verify_settings.allowed_countries` (default US, CA). A `pending`,
  unexpired verification to the same destination and channel is **resent with a new code**
  (every claim — a new verification or a resend — happens under transaction advisory locks: the
  request's Idempotency-Key per environment first, if any, then the environment, channel and
  destination, which also looks for the Idempotency-Key and the pending
  verification again: concurrent first starts make one verification, concurrent resends each
  claim a send of their own; the resend's compare-and-set still requires `pending`, since checks
  don't take the lock) (the
  earlier code stops working; `expires_at` restarts), at most `MAX_SENDS` (5) times
  (`too_many_sends`); resends skip the fraud guard. Quotas (`@coss/ratelimit`, injected limiter):
  `verify.destination.window` (5 per 10 minutes per destination, every send) and, for live
  shared-number SMS, `verify.shared_sms.day` (per organization, overridable); refunded unless the
  fraud guard blocked. Live starts, resends and recoveries first refuse a reputation suspension
  (`account_suspended`, 403), a billing hold (`billing_hold`) or a used-up budget of the project,
  key or key owner (`budget_exceeded`), both 402 — a recovery checks the send's own key and owner: coss.com's
  senders send in coss.com's environment, so nothing downstream checks the customer's. A new
  verification runs `checkVerificationRisk` (`@coss/risk`: judged and counted in one step, so a
  concurrent burst can't all slip under a threshold) **before** anything is paid for; a start that
  then turns out not to make a verification (a replay, a resend of one another start just made, an
  error) takes back exactly what the check counted (`VerificationRisk.counted`; an allow-listed or
  degraded check counted nothing), so only new verifications count: a block stores the row `blocked` with its reasons (log line +
  `verification.blocked` webhook) and answers 422 `verification_blocked`; nothing is sent or
  billed. Live: the insert transaction checks the plan has room for `verify.verifications`
  (reserve + release: nothing is held, since most verifications are never approved; the approval
  reserves its unit) and reserves `verify.sms` by country for shared numbers, through the
  `UsageGate`. Every send is **claimed before it goes
  out**, in the transaction that sets its code: `sends` moves by compare-and-set and a
  `verify_send` row takes its `sequence` (unique per verification), so concurrent starts never send
  two codes as one send. A resend's own `Idempotency-Key` and request hash live on its
  `verify_send` row (unique per environment): a retry replays it, even after approval. The send
  runs after the commit with the channel's idempotency key `<vrf id>:send:<n>`, then fills in the
  row's `sms_id`/`email_id`; a failure marks the verification `failed` (`send_failed`, or
  `recipient_suppressed` for an opted-out number or a suppressed address) only while that send is
  still the latest (`sends` fences it). A retry with the same key whose send never got a message
  (the process stopped after the claim) and is still the latest delivers it again after 30 s, with
  the same code and channel key (errors there fail nothing) — unless the channel's key already
  made a message (sent, its id lost: `message_environment_id`), which is then linked instead
  (the settings may have changed since).
- **Routes**: SMS from the environment's own number (`sms_from`, one of the organization's
  numbers; `authorizeLiveSmsSender` and `sms.segments` billing apply as for any SMS, in the
  customer's environment) or from **coss.com's shared numbers** (`VerifyServiceOptions.sharedSms`:
  a live environment of coss.com's own organization and its numbers, `VERIFY_SMS_ENVIRONMENT_ID`
  / `VERIFY_SMS_FROM`; the SMS is coss.com's — the API never shows its id — and toll-free numbers
  only reach US/CA; never to `HIGH_RISK_SMS_COUNTRIES`; unset → 503 `shared_sender_unavailable`).
  coss.com's own SMS account must allow every country customers may reach. Sandbox SMS always go
  in the customer's sandbox environment (fake provider, body kept so the developer can read it).
  Email goes through the injected `VerifyEmailSender` (the settings' `email_from` on a verified
  domain, else coss.com's sender, "<app> via coss.com"): `@coss/verify` must not import
  `@coss/email`, which imports `@coss/verify/schemas` for the webhook event types. Messages are
  fixed text (`messages.ts`; carriers approve the shared numbers for exactly that): never anything
  else from the request.
- **Check**: by `verification_id` or by `to` (the destination's latest verification), under
  `verify.check.destination.hour`, in one transaction with the row locked (`FOR UPDATE`). A retry
  with the same `Idempotency-Key` returns the same answer without spending an attempt, whatever
  was checked in between (`verify_check`, `vrfchk_`: one row per verification and key). Wrong code → `attempts + 1`, `failed`/`max_attempts` at `max_attempts`
  (`verification.failed`). Right code → compare-and-set to `approved` with `usage_recorded_at`
  (live) and `recordUsage(verify.verifications)` + `verification.approved` in the same
  transaction; then `recordVerificationApproval` counts the approval for the fraud guard's
  conversion. A pending verification past `expires_at` reads as `expired` everywhere
  (`effectiveStatus`) and is written `expired` by the next check.
- **Fraud guard** (`packages/risk/src/verification.ts`, `VERIFICATION_REASONS` and
  `VERIFICATION_THRESHOLDS` in `@coss/risk/schemas`): the environment's Risk lists (allow wins),
  premium-rate/shared-cost numbers (`phone.premium_rate`) and numbers that can't get a text
  (`phone.not_mobile`), Tor (`ip.tor`), velocity per IP and user, per number prefix (the number
  without its last four digits) with its approval rate, and per country with its approval rate
  (pumping is codes nobody enters); shared numbers also count each prefix across environments.
  HMAC-keyed like all of Risk's memory, fails open (`degraded`). It stores no assessment.
- **Billing**: `verify.verifications` per approved verification (live only, once, by the status
  compare-and-set), attributed to its key and, for a member's personal key, the member
  (`api_key_owner_id`, captured at acceptance, for budgets; own-environment sends carry it too); `verify.sms` per segment by country for shared-number codes, recorded by the
  worker's `recordDueVerifySmsUsage` once coss.com's SMS reached a carrier (its
  `usage_recorded_at`, attributed to the key and owner that asked for that send — a resend can
  come from another key —; a send whose `sms_id` wasn't saved is found first by the channel's key in
  `message_environment_id`; failed or purged ones, and claims without a message after 15 minutes
  whose verification can't be resent any more (ended or expired), settle
  unbilled, filtered in SQL so waiting ones never fill a batch; a `dispatch_interrupted` failure
  waits, since a late carrier callback repairs and bills it). Own-number codes bill as SMS.
- **Events**: log lines (`source: verify`, type `verification.<step>`: started, sent,
  check_failed, approved, failed, blocked, canceled) and webhooks `verification.approved`,
  `verification.failed`, `verification.blocked` (`VERIFY_WEBHOOK_EVENT_TYPES`, spread into
  `@coss/email`'s `WEBHOOK_EVENT_TYPES` and the test events, mirrored by the SDK).
- **Retention**: `RETENTION_DAYS.verifications` (30) after creation (`purgeExpiredVerifications`,
  the worker's `retention` loop); organization deletion deletes them per environment.
- **API** (`apps/api/src/routes/verify.ts`, `coss.verify` in the SDK): `POST /v1/verifications`
  (201), `POST /v1/verifications/check`, list, get, `POST …/{id}/cancel`; permissions `verify`
  (`send`, `check`, `read`, `update`); `GET`/`PATCH /v1/verify/settings` (`coss.verify.settings`,
  audited `verify_settings.updated`; `email_from` checked with `authorizeLiveSender` in live
  environments, `sms_from` must be the organization's). The API wires the service in
  `createApp` with its rate limiter and the email sender `apps/api/src/verify-email.ts`
  (`NOTIFICATIONS_*` for coss.com's sender, `VERIFY_SMS_*` for the shared numbers).
- **Dashboard** (`apps/web/src/app/[orgSlug]/projects/[projectSlug]/[envSlug]/verify/`):
  verifications (list by status and destination, detail with the fraud guard's reasons and each
  send) and settings (`verify:update`, audited `verify_settings.updated`; `email_from` checked
  with `authorizeLiveSender` in live environments). Members read.
- **Docs**: `apps/site/content/docs/verify/` (overview, SMS, email, fraud guard with every reason,
  testing). The reasons table there mirrors `VERIFICATION_REASONS`: change them together.
