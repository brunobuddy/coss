# packages/screening — content screening

The one exemption from screening a sample of live email is `screeningExempt` on `EmailService.send`:
internal callers only, unreachable from the public API or SMTP, and only for fixed templates whose
variable text was itself screened at setup (Scheduling's booking emails, `packages/scheduling/src/screening.ts`).
A new caller needs the same: no customer HTML, no links but its own, and its text screened another way.

Read together with the root `AGENTS.md` (conventions, tenancy rule, tests). Paths are from the
repository root.

- **Content screening** (`packages/screening`, tables `content_screening` (ids `scr_`) + `content_screening_counter`):
  `screenMessage` runs in the worker for **live** messages only, inside `complete()` right before `provider.send` (after
  the claim, so the stale-claim sweep covers a crash) — the `screen` option of `createEmailService`, wired only by the
  worker. A product passes `product` + `subjectId` + a lazy `content(signal)` (bounded text and optional image bytes, `prepareText`/`prepareLinks`:
  truncated to 8,000 chars, link hosts+paths without query strings); the screening package never imports a product, so
  SMS reuses it as is. Sampling (`ReputationPolicy.contentScreening`, per-org overrides in the admin `PolicyForm`): the
  first `alwaysFirst`, the `milestones`, then `sampleRate` at random — never make it fully predictable. The position
  comes from one `INSERT … ON CONFLICT … RETURNING new.seen, old.owed` (Postgres 18). Classifier errors/timeouts
  (10 s, shared by content preparation and classification) record an `error` verdict. Enforced screening **holds** that email: the claim is given back (`provider` NULL,
  `error_code = 'content_screening_unavailable'` as the marker) and it is dispatched again in
  `SCREENING_RETRY_DELAY_S`, its retry screened again at its old position (`retry`, never counted twice), until it is
  sent or the unclaimed sweep fails it `content_screening_unavailable` an hour after it was due (`UNCLAIMED_FAIL_MS`,
  from `scheduled_at` for scheduled sends) — an unscreened sample is never sent. Shadow mode and coss.com's own
  notification organization send it and owe the sample to the next message, once (an owed or retried sample that
  fails passes nothing on, so an outage doesn't put every message through the classifier). An unexpected `screen`
  throw follows the same default-deny rule (held), with that notification organization as the only allowlist entry.
  Highest category score ≥ `blockThreshold` → `blocked`: the email fails `content_rejected` and
  `suspendOrganization(trigger "content_screening")` in the verdict's transaction; ≥ `flagThreshold` → `flagged`
  (sent, `markReputationDue`); `contentScreeningCheck` turns enforced verdicts in the window into `suspend`/`warning`.
  A **group** (`ScreenInput.group`, an email sub-account) is sampled on its own counter row
  (`content_screening_counter.group_id`, so its first messages are always screened), its verdicts carry `group_id`, and
  a block calls the group's `onBlock` (email pauses the sub-account) instead of suspending the organization;
  `contentScreeningCheck` leaves group verdicts out. `enforce: false` is shadow mode (record only); `enabled: false` screens nothing. Verdict rows never store content;
  scores are admin-only (customers see `content_rejected` and the standing, never an oracle). The AI adapter asks one
  boolean question per category with `experimental_decide` (renamed from `experimental_evaluate`), passes the message
  as JSON state with "untrusted data" in every instruction, and always requests Gateway `zeroDataRetention`.

- **Escalation**: any active enforced flag forces screening of every subsequent message in that
  organization's scope (or group), across products, within the reputation window. The second distinct
  subject scoring at least `REPEATED_FLAG_THRESHOLD` (0.90), while still below the configured block
  threshold, is recorded as `blocked` and stopped immediately. The verdict transaction takes an advisory
  lock per org/group before counting flags; concurrent flags cannot all pass as the first. Retries count
  once; expired flags, shadow verdicts and pre-reinstatement flags do not count. Groups supply a transaction-aware `reinstatedAt` reader that locks their standing row; parent and sibling flags never affect them. System organizations never escalate.
- **Email images**: the email product resolves image bytes before classification with public-address
  checks, pinned DNS, no redirects, byte/count limits and the same abort signal. Jev's unversioned alias
  is text-only; the AI adapter routes messages with image bytes to `DEFAULT_SCREENING_IMAGE_MODEL`
  (`typesafe-ai/jev-1.14.0`, advertised as vision-capable in the live Gateway catalog). It sends JSON
  state plus file parts, always with ZDR, never raw customer image URLs. Text-only screening keeps
  `SCREENING_MODEL`. Images, generic alt text and unsubscribe footers are explicitly untrusted.
  Products may supply `ScreenInput.onBlock(tx, now)` for abuse memory written in the verdict transaction;
  it runs only for enforced blocks, including escalation, and never for system-organization flags.

  Reinstatement is re-read under the verdict transaction's scope lock before escalation. Block hooks
  run after the standing transition so their lock order matches reinstatement and backfill (standing,
  then sender-domain memory).
