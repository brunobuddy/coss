# packages/email — the email product

Read together with the root `AGENTS.md` (conventions, tenancy rule, tests). Paths are from the
repository root.

Sending (SES, suppressions, tracking, unsubscribe, scheduled and batch sends, attachments, text parts, templates), reads, receiving and DMARC reports.

- **Streams** (`email.stream`, `transactional` | `marketing`; `EMAIL_STREAMS` in `@coss/email`): each stream has its
  own SES configuration set (`SES_CONFIGURATION_SET` and `<it>-marketing`, `configurationSetsFor`), its own SES tenant
  per organization (`email_tenant` is keyed by organization + stream; `tenantNameFor(prefix, org, stream)` adds
  `-marketing`) and its own pg-boss dispatch queue (`email-dispatch`, `email-dispatch-marketing`, worked with less
  concurrency; both are `WORKER_LOOPS` names). Domain identities are associated with every tenant of their
  organization (a shared assignment: `createDomainIdentity({ tenants })` refuses only tenants outside that set).
  `authorizeLiveSender({ stream })` checks that stream's tenant pause. A tenant missing for an organization set up
  before its stream is created by `ensureMissingStreamTenants` (run by `ses:bootstrap`), which associates the
  identities before storing the row (only identities provisioned for the organization: a domain still being claimed
  goes through `createDomainIdentity`'s ownership checks first) and re-associates existing stream tenants with
  domains added since; marketing tenants are stored `suppression_migrated_at` set (born without SES
  suppression), so bootstrap's suppression migration never imports into them. Every write path that enqueues a
  dispatch job passes the email's `stream`.
- **SES:** only the `coss_email_id` tag is ever set on SES messages — never forward customer tags (events are mapped
  back by that tag, and ingestion also checks provider + message id). `SendEmail` is not idempotent: the SES client has
  `maxAttempts: 1` and only throttling is retried. An outcome SES may have accepted (a timeout, a reset connection,
  a 5xx, anything but a documented rejection or a 4xx) is an `UncertainSendError`: the email stays claimed (`queued`
  + provider) for SES's `Send` event or the stale-claim sweep, never failed on the spot or sent again; a `Send` event
  also repairs `provider_error`. A whole-message `Reject`/`Rendering Failure` after acceptance fails the email (usage
  recorded at `sent` stays). Never adopt an existing SES identity held by another tenant
  (`IdentityTakenError`), and only recreate/delete identities tagged `coss_managed=<tenant prefix>` (orphans coss.com
  created get fresh DKIM keys; identities managed outside coss.com in the same account are never touched). The most specific verified domain across all orgs
  decides who may send from a From domain. Use one AWS account (or region) per stage. IAM policies live in
  `apps/worker/scripts/ses-policies.ts` (applied by `ses:bootstrap`): tag conditions can't apply to `SendEmail`
  (SES authorizes it against the sender address, verified live), only to identity changes.
- **Suppressions** (`packages/email/src/suppressions.ts`, table `email_suppression`, ids `sup_`): one list per
  environment; an entry's `scope` is `*` (`ALL_CATEGORIES`) or a category, matched against the send's `category`.
  coss.com keeps the only list: SES tenants and the configuration set are created with suppression off
  (`TENANT_SUPPRESSION`; `ses:bootstrap` migrates existing tenants before disabling their protection) —
  never turn SES suppression back on, or removing
  a coss.com entry or scoping one to a category stops working. Bootstrap imports historical SES events and
  account/tenant lists into live environments, atomically marking `email_tenant.suppression_migrated_at`
  so reruns preserve removals; pause sends/domain changes and drain events for the upgrade (README).
  Runtime domain setup must not disable an existing tenant's protection. Sends store suppressed recipients as
  `suppressed` with a
  coss.com-source `email.suppressed` event (in the insert transaction) and `deliver` leaves them out of the provider
  message; an email with no recipient left is `failed`/`all_recipients_suppressed` without calling the provider.
  `recordProviderEvent` adds `*` entries for permanent bounces (not SES-suppressed ones) and complaints, never for
  `SIMULATOR_DOMAIN` addresses. The parsed send request omits `category` when absent so older request hashes stay valid.
  Bulk import/export is synchronous: `importSuppressions` validates each entry on its own (invalid ones are skipped
  and reported, reason `import` — imports from other providers (`@coss/migrate`) pass the provider's own
  reason and date per entry); the API takes 1,000 entries per request (the SDK batches), the dashboard a CSV of
  up to 10,000 rows (`serverActions.bodySizeLimit` in `apps/web/next.config.ts` leaves room for its 2 MB). Exports
  stream CSV page by page (`suppressionsCsvStream`, `suppression-csv.ts`) and guard formula-like cells with `'`, which
  `parseSuppressionCsv` strips again.
- **Open/click tracking** (`packages/email/src/tracking*.ts`, tables `email_tracking_rule` (ids `etr_`) and
  `email_link` (ids `lnk_`)): coss.com-owned, provider-independent (SES's own open/click tracking stays off — the
  configuration set must not subscribe to `OPEN`/`CLICK`). Per field, a send's `tracking` wins, then its category's rule,
  then the environment default (the rule with a NULL category), then off; the result is snapshotted on the `email` row
  (`track_opens`/`track_clicks` + a random `tracking_token`) at send. `email.html` always keeps the original:
  `deliver` instruments only the provider's copy (`instrumentHtml` splices the original string — never re-serialize
  customer HTML), storing the links first. Clicks redirect only to stored URLs. `email.opened`/`email.clicked` go through
  `recordProviderEvent` (source `coss`, deduplicated per UTC day and link) and never change a recipient's status;
  they name a recipient only when the email had exactly one non-suppressed recipient. Events store the user agent,
  never the IP. Settings need `environment:update` in the dashboard; over the API (`/v1/tracking_settings`,
  `coss.email.tracking`: `PATCH`/`DELETE` `…/default` and `…/categories/{category}`, unset fields keep their value)
  reads need `email:read` and changes `email:send` (a sender already overrides them per send; no new permission),
  audited as `tracking_rule.saved`/`.deleted` like the dashboard. The parsed send request omits `tracking` when absent (request hashes).
- **One-click unsubscribe** (RFC 8058, `packages/email/src/unsubscribe.ts`, `email.unsubscribe`,
  `email_tracking_rule.unsubscribe`): a third field of the tracking rules (send's `tracking.unsubscribe`, then the
  category's rule, then the default, then off), snapshotted at send and true only for an email with a `category`, a
  single distinct recipient, no customer `list-unsubscribe`/`list-unsubscribe-post` header and at most
  `MAX_HEADERS_WITH_UNSUBSCRIBE` (13) custom headers, so SES's 15 still fit (an explicit
  `tracking.unsubscribe: true` breaking one of those is a 422; a rule just doesn't apply). It reuses the email's
  `tracking_token` (minted when opens, clicks or unsubscribe is on). `instrument` adds `List-Unsubscribe:
  <base/t/u/token>` + `List-Unsubscribe-Post` to the provider's copy only (base as for links, custom tracking domain
  included). `GET /t/u/:token` only shows a confirmation page (scanners follow links) — **never write on GET**;
  `POST` with `List-Unsubscribe=One-Click` (`recordUnsubscribe`) records `email.unsubscribed` (once per email, never
  changes the recipient's status) and adds a suppression scoped to the category (`reason` `unsubscribe`, re-added
  on every POST), in one transaction; never a redirect.
- **Preference center and consent at send** (`packages/email/src/{link-tokens,preferences,preference-center-html,double-opt-in,send-eligibility,marketing-footer}.ts`,
  `apps/api/src/routes/preferences.ts`): links are stateless AES-256-GCM tokens (`mintLinkToken`/`readLinkToken`,
  `EMAIL_LINK_KEYS`; kind `preferences` or `confirmation` bound as AAD; confirmations expire after 7 days, preference
  links never) carrying environment, address, email and topic — nothing is stored at send, links survive the email
  purge, and the address never appears in a URL. Holding a link is a consent capability: minting one
  (`POST /v1/contacts/{id}/preference_links`) needs `contact:update`. `/t/u/:token` (page; a POST of exactly `List-Unsubscribe=One-Click`
  is RFC 8058), `/t/u/:token/unsubscribe`, `/t/u/confirm/:token`: plain Hono under the tracking host (any `Host`),
  outside `/v1`, mounted before `/t` (a 32-character tracking token on `/t/u/:token` is one-click unsubscribe's
  and falls through to `/t`; the two token shapes never overlap); **no GET or HEAD ever changes anything** (scanners fetch every link); a bad
  token is a plain 404 before any database work; pages have no script and a nonce'd style (strict CSP,
  `frame-ancestors 'none'`); `preferences.*` buckets fail open (an opt-out must never depend on Valkey). A
  non-contact who changes anything becomes an `unsubscribed` contact (`source: preference_center`, counted but never
  refused by the plan limit). `skippedRecipients` (both send paths: acceptance and the scheduled claim) applies
  consent: transactional email skips only explicit opt-outs of its category's topic (a password reset ignores
  `contact.status`); marketing email skips contacts that aren't `subscribed` or that its topic doesn't reach, plus
  `stream:marketing` suppressions — recorded as `email.suppressed` with `data.unsubscribe`. At dispatch (`complete()`,
  after tracking so the footer's links are never redirects) marketing email, and single-recipient email whose
  category is a topic, get `List-Unsubscribe` + `List-Unsubscribe-Post` pointing at the preference center, replacing
  one-click unsubscribe's per-category headers (the customer's own header, or more than
  `MAX_HEADERS_WITH_UNSUBSCRIBE` of them, wins on transactional email; marketing refuses both at validation and never
  snapshots `email.unsubscribe`); marketing also gets `applyMarketingFooter` (placeholders
  `{{{unsubscribe_url}}}`, `{{{preferences_url}}}`, `{{{mailing_address}}}`, else a footer; stored templates
  keep them undeclared, `MARKETING_PLACEHOLDERS`) on the provider's copy
  only. Marketing sends (`stream: "marketing"`) need exactly one recipient and the environment's postal address (422
  `mailing_address_required` at send; a `DispatchRefusal` fails the email if it vanished by dispatch, as does a missing
  key ring, `marketing_unavailable`). Double opt-in: `upsertContact({ doubleOptIn })` makes new or unsubscribed
  contacts `pending` and refuses `status: "subscribed"` (`double_opt_in_status`, for the environment's default too); the API checks `confirmation_from` (and, live, `authorizeLiveSender`) first, charges
  `contacts.confirmations.*` + the cross-org `contacts.confirmation.address` bucket, then `sendConfirmation` (the
  customer's own send, `discardBody`, idempotency key `contact-confirmation:<id>:<n>`, a reused one counts as sent: each attempt mints a new link, ≤ 1/day, ≤ 3 before
  confirming); `confirmContact` only confirms a contact pending since before the link. Unconfirmed contacts are purged
  after `RETENTION_DAYS.pendingContacts` (`purgeExpiredPendingContacts`, counters given back).
- **Custom tracking domains** (`packages/email/src/tracking-domains.ts`, table `tracking_domain`, ids `tdom_`):
  at most one per sending domain, a strict subdomain of it outside its MAIL FROM subdomain, and the hostname's most
  specific domain across orgs must be that domain. Served by a `TrackingHostnameProvider` (`DomainDeps.tracking`):
  tenants of a CloudFront multi-tenant distribution (`cloudfront/tenants.ts`: one per hostname, with a managed
  certificate, through the injectable `CloudFrontTenantsApi`) or the fake. The provider alone decides `active`
  (tenant enabled, domain active, certificate issued); the CNAME check (`checkTrackingRecord`) is only shown to
  the customer. Never adopt a hostname already registered at CloudFront (`TrackingHostnameTakenError` →
  `tracking_domain_taken`), except what the same claim created: tenant names are bound to the tracking domain's id
  (`tenantName(hostname, claim)`), so after a lost answer or a crash the claim stays, and asking again or the worker
  (`resumeProvisioning`, after 2 minutes) finds the tenant under that name. A claim still without an id after an hour
  is released (its tenant removed, status `failed`, restartable). An issued managed certificate serves nothing until it is attached to the tenant
  (`Customizations.Certificate`), so the provider's `get` attaches it, and a stale ETag just waits for the next check.
  Removing a tenant takes two passes: CloudFront refuses to delete it until the disable
  has deployed (minutes), so the first `delete` disables it and throws; `checkTrackingDomain` retries in 10 minutes
  and `deleteTrackingDomain`/`deleteDomain` ask the user to try again shortly. Lifecycle mirrors domains (`pending` → `active`; an active one that stops →
  `temporary_failure`; never active within 72 h, or given up/unknown at the provider → `failed`, hostname released;
  restart via the domain's verify). The worker's `domains` loop re-checks them. `deleteDomain` releases the hostname
  first (the row cascades). The URL is resolved **at dispatch** in `instrument` (`trackingBaseUrlFor`, only when
  the email service has `trackingDomainProvider`, wired by the worker): the From domain's most specific domain must
  be the org's and its tracking domain `active` with that provider, else `trackingBaseUrl`. Nothing is stored on the
  email, and the `/t/*` routes ignore `Host`. Removing one breaks links in emails already sent through it. API:
  `POST`/`DELETE /v1/domains/{id}/tracking` (`domain:create`/`domain:delete`, no new permission), `Domain.tracking`
  (a `z.union([…, z.null()])`: `.nullable()` loses `null` in the OpenAPI document). Edge: `track.cosslinks.com`
  (the default tracking host, `TRACKING_PUBLIC_URL`) and customer domains (a CNAME to the connection group's routing
  endpoint, `TRACKING_CNAME_TARGET`) → CloudFront → ALB rule `/t/*` + `X-Tracking-Origin-Verify` → api
  (`infra/aws/routing.ts`). Domain Connect's template fixes the target at `track.cosslinks.com`, so it skips the
  tracking record for any other target and customers publish that CNAME by hand.
- **Domain Connect** (`packages/email/src/domain-connect.ts`, `@coss/email/domain-connect`; the dashboard's
  `apps/web/src/lib/domain-connect.ts`): one-click DNS setup through the customer's DNS provider, synchronous flow
  only and always signed (`DOMAIN_CONNECT_PRIVATE_KEY`; providers check `sig` against the TXT records at
  `<DOMAIN_CONNECT_KEY_ID>.coss.com`). `domain-connect/coss.com.email.json` is the contract with every DNS provider
  (submitted to github.com/Domain-Connect/Templates; providers onboard it one by one, and until then discovery's
  template check is a 404 and no button shows): once merged there, change it only with a new `version` (providers
  import a version once; until then the open PR is updated in place), the conformance test in
  `test/domain-connect.test.ts` (the template applied must equal `expectedRecords` + the tracking CNAME) and a PR
  upstream. Groups: `dkim`, `mail_from`, `dmarc` (only when the domain has no DMARC record and inherits none, asked of DNS
  each time, never from the stored check — a `p=none` subdomain record would weaken an enforced parent), `tracking` (fixed target `track.cosslinks.com`);
  only groups with unverified records are applied, and applies are additive per group, so the template is not
  `multiInstance` (a provider that keeps applied-template state then replaces a re-applied group's records, e.g.
  stale DKIM CNAMEs, instead of keeping both). Never put receiving MX records in it (they'd take over the
  domain's mail). Discovery reads the customer's `_domainconnect` TXT record and fetches the URL it names, so it
  goes only through `publicHttpGetter` (https, public addresses pinned with `publicAddressLookup` from
  `@coss/webhooks`, no redirects, 16 KB, 3 s) and fails closed (`null`, never throws). The dashboard caches
  discovery per name for 10 minutes and works out the apply link again in `connectDnsAction` (audited
  `domain.dns_connect_started`); there is no API surface.
- **BIMI** (`packages/email/src/bimi.ts`, `domain.bimi` jsonb, wire `Domain.bimi`): a DNS-only check run by
  `checkDomain` next to `checkRecords` (so the worker's re-checks and verify refresh it). It reads the DMARC policy
  (RFC 7489: the domain's own `p`, else the organizational domain's `sp ?? p`; the organizational domain — `tldts`'
  public suffix list, ICANN section — must have an enforced record of its own too; `pct` < 100 or `t=y` is partial;
  two records, a repeated or malformed tag = no record) and `default._bimi.<domain>`, else the organizational
  domain's (unrelated TXT records ignored). Statuses `not_checked` (no resolver or a lookup failure — never `missing` on a DNS error), `missing`,
  `invalid`, `configured`. Rows store issue codes only; `toBimiObject` renders `BIMI_ISSUE_MESSAGES` on read. Never
  fetch the logo (`l=`) or certificate (`a=`) — they are customer URLs (SSRF) and the VMC/CMC is the customer's to
  validate; the dashboard never renders the logo either. The docs page (`/docs/email/bimi`) lists the statuses and
  codes: change them together.
- **Dedicated IPs** (`packages/email/src/dedicated-ips.ts`, `ses/dedicated-ips.ts`, tables `dedicated_ip_pool` (ids
  `dip_`) and `dedicated_ip_delivery_rollup`; the `dedicated_ips` add-on): one SES **managed** dedicated IP pool per
  organization (SES leases, scales and warms its IPs up per mailbox provider, spilling what they can't take yet to
  shared IPs) and, per stream, a configuration set sending through it: the pool and the transactional set are named
  `tenantNameFor(prefix, org)`, the marketing set `tenantNameFor(prefix, org, "marketing")`; all tagged
  `coss_managed=<prefix>`, each set associated with its stream's tenant and carrying copies of its stream's shared
  set's event destinations. Both streams share the pool's IPs (events and reputation stay per stream); marketing
  joins once its set exists (`marketing_configured_at`, set at provisioning when the marketing tenant exists, else
  by a later `warming`/`ready` check), and until then marketing sends stay on shared IPs. Never adopt or delete a pool or set without that tag (`DedicatedIpTakenError`). Billing decides,
  the worker's `dedicated-ips` loop (`reconcileDedicatedIpPools` with `organizationsEntitledTo("dedicatedIps")`)
  follows: entitled → `provisioning` (needs the org's tenant, i.e. a domain: the worker never creates tenants; past
  `MAX_DEDICATED_IP_POOLS` = 45 → `waiting`, a `console.error`) → `warming` (live sends use the pool from here) ⇄
  `ready` (≥ 95% of the last 7 days' deliveries, ≥ 1,000, left from the pool's IPs — `ses:outgoing-ip` of `Delivery`
  events counted per hour and IP in the rollup, only for emails with `dedicated_pool`); not entitled → `releasing`
  at once (sends back on shared IPs) and released `RELEASE_DELAY_MS` (a day) later — association, then
  configuration set of each stream, then pool — unless the entitlement returns first (`release_started_at` is set before the
  provider calls: a later return waits for the release and gets a new pool). Organizations pending deletion are
  never entitled, and a provisioning step that finds one (or its row gone) releases what it just created: the
  teardown may have released before it. A send decides at claim
  (`dedicatedPoolSql(org, provider, stream)`, stored in `email.dedicated_pool`; `SesEmailProvider` then uses the
  org's configuration set of the email's stream).
  SES allows **50 pools per region, a hard limit**: the dashboard's purchase preflight (`dedicatedIpSlotAvailable`,
  in the purchase's transaction under the lock new pools are created under) counts organizations with a pool, an
  entitlement or an unpaid purchase against the 45. IAM (`ses-policies.ts`): only the worker manages pools/sets (`<prefix>-*`, tag
  conditions); api and worker may send with `configuration-set/<prefix>-*`; the SNS topic accepts events from those
  sets (`ses:bootstrap` — re-run it in production before deploying a change to either). Sandbox never uses a pool.
- **Scheduled sends** (`scheduled_at`, ISO 8601 with an offset, ≤ 30 days ahead; a past time sends now): stored as
  `scheduled` with a coss.com-source `email.scheduled` event and sent by the worker's `dispatchDue` (every 5 s).
  It claims straight from `scheduled` (compare-and-set to `queued` + `provider`), after
  re-running `authorizeLiveSender` (failure → `failed` + `email.failed`) and, in the claim transaction, the
  suppression list. `cancel` is a compare-and-set `scheduled` → `canceled` (recipients `canceled`, whole-message
  `email.canceled`); repeating it returns the email, any other status is 422 `email_not_cancelable` (not 409: the SDK
  retries those). `reschedule` (`POST /v1/emails/{id}/reschedule`, `rescheduleEmail`) locks the still-`scheduled`
  row (`FOR UPDATE`), so a dispatcher's claim waits and its compare-and-set re-checks the new `scheduled_at`; it
  records `email.rescheduled` (`data.reschedule`, a random `sourceId` so every move is its own event), the same time
  again is a no-op, anything not `scheduled` is 422 `email_not_reschedulable`. Only the time changes (content changes
  are cancel + send). Scheduled sends are held while their organization is suspended. Cancel and reschedule need
  `email:send`.
  `scheduled_at` is omitted from the parsed request when absent (request hashes).
- **Email templates** (`packages/email/src/{templates,template-language,template-schemas}.ts`, tables
  `email_template` (ids `etpl_`), `email_template_version` (`etplv_`), `email_template_content` (`etplc_`),
  `/v1/email_templates`, `coss.email.templates`, permission `emailTemplate` (backfilled by `0064`)): per
  environment; one draft per template (`version` NULL, `revision` counts saves) and immutable published versions
  numbered from 1 (`published_version` is what sends use). A version holds the typed variables, sample values
  and one subject/HTML/text per locale (canonical BCP 47, ≤ 30), published together. Sends name a template by id
  **or alias** (`template_id`, plus `variables`, `template_version`, `locale`; never with `subject`/`html`/`text`)
  and are **rendered at send** (`renderTemplateForSend` in `prepareSend`, a per-request version cache in
  batches): the `email` row stores the rendered content and `template_id`/`template_version`/`template_locale`
  (no FK), so dispatch, screening, tracking and reads are unchanged and later publishes never alter stored or
  scheduled emails. The request hash covers the request (template + variables), never the output, and the
  transform adds template keys only when present (old hashes stay valid); template errors fall back to the
  idempotent replay like `authorizeLiveSender`. The language (`@coss/email/templates`, also the dashboard's live
  preview) is a Mustache subset: `{{v}}` (HTML-escaped in `html` only), `{{{v}}}` (HTML only), `#if`/`#each`
  with `{{else}}`, comments, `\{{`; no code runs, output and work are capped while rendering (2 MB and 1,000,000
  steps a field, nesting 10). Publishing needs a parse-clean draft whose names are all declared and content for
  the default locale; re-publishing an unchanged draft returns the current version. Draft saves and restores are
  never retried by the SDK, and publishes only with a `revision` (a retry must not save or publish twice). Variables
  are checked strictly (unknown names refused, `null` = absent, defaults applied, lists ≤ 1,000 objects,
  `variables` ≤ 64 KB); errors are 422 `invalid_request_error` codes (`template_*`, `invalid_template_variables`
  with `issues`), never 404/409. Only the dashboard's test sends render a draft (`SendEmailInput.templateDraft`,
  only at the revision the editor checked; `version: null` on the email): they need `email:send`, go to verified
  members only (`listVerifiedMemberEmails`), and are charged `emailSendQuota` (`@coss/ratelimit`, shared with the
  API and the SMTP relay) through the dashboard's own email service (`apps/web/src/lib/email-service.ts`, a pg-boss
  producer). `sample_variables` is in `OPAQUE_FIELDS`.
- **Batch sends** (`POST /v1/emails/batch`, `EmailService.sendBatch`, table `email_batch`, ids `batch_`): ≤ 100
  emails (`MAX_BATCH_EMAILS`), each a full `SendEmailRequest`, all or nothing. Every distinct `from` is authorized
  first (a failure names `emails.N.from`), then the batch row and every email go through the same
  `insertPrepared` as a single send, in **one transaction**. The batch row holds the `Idempotency-Key` and request
  hash (`hashSendBatchRequest`, same TTL/loop via `withIdempotencyKey`); its emails' own keys stay NULL, so batch and
  single-send keys never collide. Emails carry `batch_id` + `batch_index` (request order). The route shares the 40 MB
  send body limit (`hasOwnBodyLimit`) and charges the recipients of every email as **one** quota consume (refunded on
  replays/errors), so a batch above a bucket's burst (live default: 100 recipients/s) is refused without
  `Retry-After`. The SDK's `sendBatch` never chunks (that would break atomicity under one key).
- **Attachments** (`packages/email/src/attachments.ts`, table `email_attachment`, ids `att_`): base64 in the send
  request only (coss.com never fetches URLs), ≤ 20 per email and 25 MB decoded combined; filenames need an extension and
  SES-refused extensions are rejected at validation. Bytes live in `email_attachment.content` (bytea) only while the
  email is `scheduled` or `queued` — cancellation, sender rejection, delivery, provider-event ingestion and
  the worker sweeps null them in the transaction that moves it to a terminal status. Reads select metadata columns only; API/SDK/dashboard and webhook payloads never
  expose content. A queued email whose content is gone fails with `attachments_unavailable` rather than sending without
  it. The parsed request omits `attachments` when empty (request hashes). SES gets them as `Simple.Attachments`
  (`content_id` → `INLINE`); the fake provider keeps sha256 digests, not bytes.
- **Content storage** (`packages/email/src/storage-settings.ts`, table `email_storage_settings` keyed by environment,
  `/v1/storage_settings`, `coss.email.storage`, the dashboard's `[envSlug]/content-storage`): `store` (default, no
  row) or `discard`, resolved once per send/batch/broadcast step and snapshotted as `email.store_content`. In the
  transaction that moves an email to a terminal status `purgeSendContent` clears a `store_content = false` email's
  subject (to `''`; it is NOT NULL and its wire type stays `string`), `html`/`text`, `headers`, `variables` and
  attachment filenames, and sets `content_discarded_at` (the wire `content_storage: { mode, discarded_at }`);
  `withRenderedBody` never re-renders a discarded broadcast email. Every terminal transition already calls
  `purgeSendContent`: a new one must too. `recordProviderEvent` reads the subject as `''` for these emails from
  the start, so webhook payloads and event log lines never hold it; the API's request log redacts
  `EMAIL_CONTENT_KEYS` (`@coss/logs`) on `/v1/emails*` for such emails (`markEmailContent` in each route that
  returns emails) and while the environment is `discard`. Not covered (documented):
  click tracking's `email_link` URLs, received email, a broadcast's own content, tags and categories. The
  fake provider never logs subjects. `discard_body` (internal auth emails and Verify's codes) stays a separate, body-only flag; with it,
  `hashSendRequest` leaves `html`/`text` out of the stored request hash (a code's hash would
  confirm guesses).
- **HIPAA mode** (`packages/compliance/AGENTS.md`): live environments of an organization in the mode
  always `discard`, never track opens or clicks (asking is a 403) and send through configuration sets
  that require TLS (`email.require_tls`, `requiredTlsSetFor`).
- **Generated text parts** (`packages/email/src/html-text.ts`, `htmlToText`): an email sent with `html` and no
  `text` gets a plain-text part built from the original HTML in `toOutbound`, for the provider's copy only (like
  tracking: `email.text` stays `null`, so API reads, request hashes and webhooks are unchanged). It is built before
  `instrument`, so its links are the real targets, never click redirects. Hidden content (`display:none`, `hidden`)
  is left out; nesting deep enough to exhaust the stack sends the email without one, as before.
- **Email reads** (`packages/email/src/read.ts`): `GET /v1/emails` (`listEmailSummariesPage`, `coss.email.list`)
  shares `listConditions` with the dashboard's list and never selects content (`EmailSummary`: no `html`, `text`,
  `headers`, `attachments`); `to` matches `email_recipient.address` through `(organization_id, address)`. An email's
  `failure` (`emailFailure`) is set only while it is `failed` — an error code on a queued email is a screening hold —
  and `provider_error` always shows `PROVIDER_ERROR_MESSAGE`, never the provider's own text (it can name internals).
- **Receiving email** (`packages/email/src/{inbound,inbound-mime,inbound-store,inbound-address,received-emails,receiving-domains}.ts`,
  `ses/inbound.ts`; tables `received_email` (ids `rcvd_`), `received_email_attachment` (`rcvdatt_`),
  `receiving_domain` (`rdom_`), `environment_inbound_address`, `inbound_drop_counter`, `inbound_fake_object`):
  SES has one catch-all receipt rule (`ses:bootstrap --managed-domain`: spam/virus scan, S3 action to `landing/` +
  SNS → the `<name>-inbound` queue), so it accepts mail for every verified domain of the account and the worker
  routes (`receiveEmail`, the `ses-inbound` loop). Route by the **envelope** recipients (`receipt.recipients`, never
  `mail.destination`): `<label>.<INBOUND_MANAGED_DOMAIN>` → its environment; a `receiving_domain.hostname` (exact
  match) → its environment while the parent domain is `verified`/`temporary_failure` **and still the most specific
  non-failed domain** across orgs (re-checked on every message). Unroutable recipients are dropped silently (no
  backscatter); organizations pending deletion receive nothing; suspended ones still receive (webhooks held). One
  row per environment with **only its recipients** — copies of a shared message drop SES's `X-SES-RECEIPT`/
  `X-SES-DKIM-SIGNATURE` headers and other environments' `Received: … for <addr>` clauses (`scrubEnvelopeHeaders`),
  so Bcc'd addresses never leak across tenants. Content goes to the `InboundContentStore` first
  (`orgs/<org>/<env>/<id>/raw.eml`, `…/att/<attachment id>`), then the row, attachments, a log line (source `email`,
  type `email.received`) and the `email.received` webhook in one transaction; `(environment, provider, provider
  message id)` is unique, so redelivered notifications record once (written content is deleted again). A virus
  verdict stores a `blocked` row (envelope, sender, subject, verdicts; no content, no webhook); spam and auth
  failures are stored and flagged. **Billing**: every stored copy is `email.received` (`recordUsage` in the insert's
  transaction, any environment: sandbox ones receive real mail) unless its provider is `fake` (the dashboard's test
  emails) or it has a spam or virus verdict (`isBillableReceipt`); `InboundDeps.billing` (the worker's `UsageGate`)
  reserves Free's allowance in the transaction that stores the copy (a failed attempt reserves nothing), and past it
  the copy and its written content are dropped and counted like one over the daily limit (`over_limit`). The `email.received` payload is metadata only (no bodies, headers or cc).
  `received_email.text`/`html` are cut at 2 MB and headers at 64 KB (`truncated`); the raw message is whole. The
  dashboard previews received HTML with `UNTRUSTED_PREVIEW_HEAD` (`apps/web/src/lib/email-preview.ts`; `img-src data:` only — no remote images, they are
  tracking pixels) and serves raw/attachment downloads as `attachment` + `nosniff` + `CSP: sandbox`; the API
  serves attachments as `application/octet-stream`. Reads need `email:read`; deleting (`DELETE
  /v1/received_emails/{id}`, content too) `receivedEmail:delete` (owners, admins, every key; backfilled by `0049`).
  Receiving domains: one per domain, the domain or a subdomain, never its `send.` MAIL FROM subdomain, its tracking
  hostname or the managed domain; API `POST`/`DELETE /v1/domains/{id}/receiving` (the key's environment receives),
  `Domain.receiving`. The managed domain's SES identity is tagged `coss_inbound`, never `coss_managed` (the apps'
  IAM policies may delete those). The dashboard's **Send a test email** (`receiveFakeEmail`) is for sandbox
  environments, or any while the dashboard runs the fake provider, and only to the environment's own addresses.
- **Inboxes** (`packages/email/src/{inboxes,inbox-send,inbox-text,inbox-schemas}.ts`, tables `inbox` (ids
  `inbox_`), `inbox_thread` (`thread_`), `inbox_message` (`imsg_`); `/v1/inboxes`, `coss.inboxes`, permission
  `inbox`): addresses for agents, `<username>@<domain>` (lower-cased, unique per environment: mail is routed to an environment first, so a
  receiving domain that moves takes its addresses along and the old environment's inboxes keep their threads), the domain being the
  environment's managed one (`inboundAddressFor`, kind `managed`) or one of **its** receiving domains (`domain`);
  `username+tag@` reaches the inbox (`inboxAddressOf`). `client_id` (unique per environment) makes create return
  the existing inbox (200); at most the plan's `inboxes` (`PlanGate`, the organization's inboxes in every environment, counted under an
  organization-wide advisory lock). **Billing**: a live inbox is `email.inboxes`, one unit per day it exists — the first in
  the insert's transaction (reserved first through the `UsageGate`: Free's included inbox-days), then the worker's
  `inbox-fees` loop (`chargeDueInboxFees`: `next_fee_at` moves a day per charge, one day per run, so a backlog catches up
  run by run; each day is reserved too, so churn can't outlast Free's inbox-days, and days past them are written off), and
  `deleteInbox` charges (and reserves) the days that started since the last charge; sandbox inboxes have no
  `next_fee_at`. Under the organization lock a `client_id` is looked up again before the
  limit is checked (a concurrent create with it may have just committed).
  Receiving is `receiveEmail`'s: in its transaction, after `email.received`, `recordInboundInboxMessages` files the
  row into every inbox of that environment among the **envelope** recipients (never parsed `To`) and enqueues
  `inbox.message.received` (metadata only, like `email.received`; blocked messages never reach an inbox).
  Threading (`findThread`): an `In-Reply-To`/`References` id matching an inbound message's stored `Message-ID`
  (`rfc_message_id`, normalized `<id>` by `messageIdKey`; ids over 512 characters are neither stored nor matched) or an outbound email's `provider_message_id` (the local
  part of SES's `Message-ID`), else the same `subjectKey` (a SHA-256 of `normalizeSubject`: senders' subjects are unbounded, index entries
  aren't, and a failing insert would roll back the received email) with the sender already a participant and
  activity within `SUBJECT_MATCH_WINDOW_MS`, else a new thread, under an inbox-scoped advisory lock taken in
  inbox id order (two messages arriving together must not each start a thread); the thread row is locked
  (`FOR UPDATE`) while its participants and `last_message_at` move. Reads left-join the received email and the
  email: each projection leads with its non-null `id` (Drizzle nulls a joined object whose first column is null). Sends and replies (`inbox-send.ts`) are `EmailService.send` with
  `SendEmailInput.afterInsert`, which files the email in its insert transaction (never for a replay);
  `Idempotency-Key`s are namespaced `inbox:<id>:<key>` so they never meet `POST /v1/emails`' keys, and are
  checked against the inbox request's own hash (`SendEmailInput.requestHash`), never the derived parameters
  (a parent's `Message-ID` appears once it is dispatched, the display name can change); the API charges
  `emailSendQuota` through `InboxSendQuota` once the reply's recipients are known (refunded on replays and
  refusals). Inbox sends never track (no pixel, no rewritten links) and take no custom headers: replies set
  `In-Reply-To` and `References` (`replyReferences`, one header line); a follow-up to the inbox's own message
  references its provider `Message-ID` (`EmailService.messageIdOf`, `EmailProvider.messageId`: SES's
  `<id@<region>.amazonses.com>`, `email.amazonses.com` in us-east-1). A send under content storage `discard`
  starts a thread without a subject (the thread would outlive the purged content), and the API marks inbox send
  responses with the email's snapshot (`markEmailContent`), so replays never log discarded content. **Live inboxes at the managed domain only
  receive** (`canSend`: sandbox, or kind `domain`; live sending still needs `authorizeLiveSender` to pass) — sending
  from coss.com's inbound domain would put every customer on one shared sender reputation. Messages hold no
  content: they point at the `received_email` or `email` and cascade with it (retention, deletes);
  `purgeEmptyInboxThreads` (the worker's retention loop) drops threads empty for a day, and organization deletion
  deletes threads per environment after the emails. Deleting an inbox or thread keeps the emails. The API's
  request log never copies `/v1/inboxes` responses (received content) and redacts send bodies like `/v1/emails`'
  when content storage is `discard`. `extractReplyText` (a heuristic: attribution lines, `-----Original
  Message-----`, Outlook separators, trailing `>` blocks, the `-- ` signature) is client-safe; the docs describe it.
- **DMARC reports** (`packages/email/src/dmarc-{record,report-xml,reports,guidance,notifications,sample}.ts`; tables
  `dmarc_report` (ids `dmarcrep_`), `dmarc_report_record` (`dmarcrec_`), `dmarc_notification` (`dmarcntf_`), and
  `domain.dmarc_report_token`/`dmarc_record`/`dmarc_policy_changed_at`): each domain's `rua` address is
  `dmarc-<token>@<INBOUND_MANAGED_DOMAIN>` (`dmarcReportAddress`; the bare managed domain, which `managedLabelOf`
  never matches), recommended by `expectedRecords` (`DomainDeps.dmarcReportDomain`, `null` with receiving off).
  Reporters only mail an address on another domain when `<domain>._report._dmarc.<managed domain>` says
  `v=DMARC1`: coss.com publishes the wildcard `*._report._dmarc.inbound.coss.com` (README, receiving). `receiveEmail`
  splits report recipients off before routing (`splitDmarcReportRecipients`); they never become received emails.
  Addresses are public, so `ingestDmarcReports` trusts nothing unchecked: a live domain's token, SPF or DKIM `pass`
  on the message, `policy_published.domain` under the domain, a plausible recent period, the org's
  `email.dmarc_reports.day` budget (fails open, like inbound mail), at most `MAX_DMARC_REPORT_RECORDS` rows;
  `(domain, reporter, report id)` is unique. Only the parsed report is stored, never the message. Unpacking is
  `node:zlib` with `maxOutputLength` (gzip, and zip by hand) and XML is read by a small parser that refuses DTDs:
  never swap in an XML library that resolves entities. `via_coss` (the domain's DKIM selectors or MAIL FROM domain)
  is decided at ingest. `checkDomain` stores the one published `v=DMARC1` value (two records count as none), and
  for a subdomain with no `v=DMARC1` record at all its organizational domain's (`dmarc_inherited_record`, applied
  as `sp ?? p`, `appliedDmarcRecord`); `parseDmarcRecord` refuses a repeated tag or a part that isn't `tag=value`
  (no policy, like BIMI). It moves `dmarc_policy_changed_at` only when `dmarcPolicyKey` of the applied record
  changes (policy or partial enforcement) and only when DNS answered. A truncated report in the window blocks
  readiness (check `complete`). Guidance (`dmarcGuidance`, thresholds in `DMARC_READINESS`) is pure and computed on every read:
  none → quarantine → reject, no `pct` ramp. Ingest queues `dmarc_notification` rows (readiness once per policy
  epoch; coss.com mail failing under enforcement once per epoch and week), sent by the worker's `dmarc-notifications`
  loop through the reputation notifier (skipped when the policy changed since; a readiness email
  re-runs the guidance and sends the record built from DNS as it is then, or is skipped when no longer ready). The dashboard's "Send a sample
  report" (`receiveSampleDmarcReport`) exists only with the fake provider. API (`domain:read`):
  `GET /v1/domains/{id}/dmarc`, `…/dmarc/reports[/{report_id}]`, `coss.domains.dmarc`; event
  `domain.dmarc_report_received` (`DOMAIN_EVENT_TYPES`, live environments only, no rows or IPs).
- **Contacts** (`packages/email/src/{contacts,contact-properties,audiences,segments,topics,audience-resolution,marketing-settings,contact-csv}.ts`,
  tables `contact` (ids `contact_`), `contact_property` (`cprop_`), `audience` (`aud_`) + `audience_member`, `segment`
  (`seg_`), `topic` (`topic_`) + `contact_topic`, `marketing_settings`, `contact_counter`; permission `contact`, backfilled
  by `0075`): one contact per environment and address (bare, lower-cased). **Consent lives on contacts, deliverability
  in suppressions**: `contact.status` (`subscribed`/`unsubscribed`/`pending`) and `contact_topic` (explicit
  `opted_in`/`opted_out`; no row = the topic's `default_subscription`) say who wants marketing, while bounces and
  complaints stay suppressions. A contact's or topic's opt-out is never written as a suppression, and a re-subscribe never deletes one.
  A topic's `key` is a send's `category` (immutable). Custom properties are typed definitions (`contact_property`,
  ≤ 50, key and type immutable; dates stored canonical ISO); `mergeProperties` validates every write (unknown key or
  wrong type → `ContactError`, 422, `param: properties.<key>`). The plan's `contactsPerEnvironment` is enforced by a
  conditional update of `contact_counter` (`reserveContacts`/`releaseContacts`, same transaction as every insert and
  delete — never a `count(*)`). Imports never re-subscribe anyone and send no webhooks (entries may carry topic choices, only from
  `@coss/migrate`: opt-outs apply, opt-ins never replace a recorded choice); single changes send
  `contact.created/updated/deleted` (contact id, email, status, source — never properties). Segments are JSON filters
  (`SegmentFilter`, ≤ 20 conditions, one nested level) compiled to SQL at every use (`compileSegmentFilter`: values
  bound, keys only from definitions, `contains` via `position()`); deleting a property, audience or topic a segment
  references is refused (`…_in_use`). `resolveRecipients` (keyset by contact id, bounded by `before`) is the only way
  marketing recipients are chosen: `subscribed`, the topic reaches them, and no `*`/`stream:marketing`/topic
  suppression. `ContactError` is mapped in `toApiError` (404 for `not_found`, else 422 — never 409).
- **Broadcasts** (`packages/email/src/{broadcasts,broadcast-render,broadcast-content,broadcast-stats,broadcast-references,broadcast-schemas}.ts`,
  `apps/api/src/routes/broadcasts.ts`, `coss.email.broadcasts`; tables `broadcast` (ids `bcast_`) + `broadcast_stat`;
  permission `broadcast`, backfilled by `0077`): `draft` → `scheduled` → `sending` ⇄ `paused` → `sent`, or
  `canceled`/`failed`. Content that could render past `MAX_RENDERED_LENGTH` with the longest contact values is refused
  (`content_too_large`); placeholders read only the variables' own keys. Only drafts are edited; deleting needs a draft or a cancel before any email was made. Starting
  (create with `send`/`scheduled_at`, or `/send`, `/resume`) checks the postal address and, live,
  `authorizeLiveSender({ stream: "marketing" })`. The worker's `broadcasts` loop (`runDueBroadcasts`, system-level)
  claims each due broadcast with a lease (`lease_until`, bound from a JS `Date`; every write is fenced on it, so a
  worker whose lease was taken over writes nothing): a `scheduled` one is screened **once** (`ScreenInput.force`,
  product `broadcast`; an error holds it and retries each minute, failing `content_screening_unavailable` after an
  hour; a block fails it `content_rejected` and screening suspends the org), then freezes its target
  (`contact_upper_bound` = a `newId` at start, `recipients_estimated`) and moves to `sending`. Each step makes at most
  `min(500, rate × 5 s)` emails (rate: `rate_per_second` capped by the plan's `email.marketing.recipients.second`),
  waits while `BROADCAST_BACKLOG` of its emails are still queued (the unclaimed sweep would fail a bigger backlog),
  charges `email.marketing.recipients.second` + `email.recipients.day` (live only; a denial puts it off, a batch
  larger than the bucket is halved; what the step doesn't make is refunded, `refundThrottle`), then in one transaction: `resolveRecipients` page → one email + recipient per
  contact (`ON CONFLICT (broadcast_id, contact_id) DO NOTHING`: reruns never duplicate) → dispatch jobs on the
  marketing queue → `UsageGate.reserve` → `recipients` counter → cursor. It is `sent` once nothing is left to make or
  queued. Pausing or canceling deletes the emails nobody claimed yet (`queued`, no provider), gives back their
  reservation (`UsageGate.release`) and counters; a pause rewinds the cursor before them (from the contacts, never
  the retained emails). A broadcast's emails are kept past email retention until it finishes
  (`purgeExpiredEmails`): their rows are what keeps a resume from sending anyone a second one. The worker pauses on its own:
  `billing_hold`/`usage_limit`/`sending_paused` retry each minute (dropping and rewinding the unclaimed emails the
  same way, so a hold stops the queue too), `marketing_paused`/`account_suspended`/
  `mailing_address_required` wait for Resume; an unverified From fails it. Creating a draft needs `broadcast:create`;
  starting one (`send`, `scheduled_at`) also `broadcast:send` (`apiKeyHasPermissions`). **Broadcast emails store no body**: the
  rendered subject, `variables` (only the template's `{{{contact.<key>|fallback}}}` keys) and `contact_id`; dispatch
  and every read render the broadcast's frozen content (`withRenderedBody`; dispatch caches it per process), then
  the marketing footer and tracking apply as for any marketing email; they skip per-email screening unless personalized (an email with contact values is sampled like any send:
  the values could carry any text or link), marketing email's consent (and the marketing pause: a paused organization's queued marketing email
  is failed `marketing_paused`, a broadcast's left to its worker to drop) is checked again at its dispatch claim
  (`skippedRecipients`, as for scheduled sends: a broadcast's queue can be minutes long), and an SES
  throttle (`ThrottledSendError`) hands a marketing email back for a later dispatch instead of failing it. Counters
  (`broadcast_stat`, 16 shards by email id, summed on read; they outlive the emails): `recipients` at fan-out,
  `sent`/`delivered`/`bounced`/`complained`/`failed` from **recipient status moves** in `recordProviderEvent`
  (`recipientMoveCounts`: each status counts toward fixed counters, a move adds the new ones and takes the old ones
  away, so the shards always equal `recountBroadcastStats`), `opened`/`clicked` on an email's first open or click,
  `unsubscribed` when its link actually unsubscribed a subscribed contact. An unfinished broadcast's audience, segment
  or topic can't be deleted (`…_in_use`). `BroadcastError` maps to 404 (`not_found`) or 422 (never 409);
  `broadcast.sending/sent/paused/canceled/failed` webhooks carry the stats, never content. Dashboard:
  `[envSlug]/broadcasts` (list, editor, sandboxed preview with `PREVIEW_HEAD`, stats, controls; `broadcast:*`
  permissions); its test sends go only to verified members (`listVerifiedMemberEmails`, like template test sends),
  through the dashboard's email service (`apps/web/src/lib/email-service.ts`), and are charged `emailSendQuota` like
  the API's `POST /v1/broadcasts/{id}/test`.
- **Sub-accounts** (email for platforms; `packages/email/src/{subaccounts,subaccount-reputation,subaccount-schemas}.ts`,
  table `email_subaccount` (ids `sub_`), `/v1/subaccounts`, `coss.email.subaccounts`, permission `subaccount`, the
  dashboard's `[envSlug]/subaccounts`): a customer's end user, per environment, addressed by id **or** the customer's
  `uid` (unique per environment). Live ones need the plan's `subaccounts` feature and count against its
  `subaccounts` limit (`PlanGate`); sandbox ones are free (`MAX_SANDBOX_SUBACCOUNTS`), have no domains and use the
  fake provider like every sandbox send. A send names one with `subaccount` (API, batch per email, SMTP
  `X-Coss-Subaccount`; omitted from the parsed request when absent, so older request hashes stay valid), resolved in
  `prepareSend` (`sendingSubaccount`: unknown or deleting → 422 `subaccount_not_found`, `disabled` → 403
  `subaccount_disabled`, reputation `paused` → 403 `subaccount_paused`) and checked again at the scheduled claim
  (`assertSubaccountStillSends`); transactional only. The email stores `subaccount_id` (no FK: emails outlive the
  sub-account) and carries it in reads, webhook event data and log lines. **Domains**: a domain may belong to a live
  sub-account (`domain.subaccount_id`, ≤ `MAX_SUBACCOUNT_DOMAINS`, its own pending cap, outside the plan's `domains`
  count). Its first one creates the sub-account's own transactional tenant (`ensureSubaccountTenant`, `email_tenant`
  row with `subaccount_id`, named `tenantNameFor(prefix, sub_id)`, born `suppression_migrated_at` set) and its
  identities are associated with that tenant only; organization functions (`getEmailTenant`, `listEmailTenants`,
  `associateOrgDomains`, `ensureMissingStreamTenants`) see only the organization's own (`subaccount_id` NULL).
  `authorizeLiveSender({ subaccountId })`: only the sub-account sends from its domains (the organization must name it
  too), and sub-accounts send from the organization's domains only with `shared_with_subaccounts` (`PATCH
  /v1/domains/{id}`, never on a sub-account's domain); the matching tenant's pause applies. The claim decides
  `subaccount_tenant` (`subaccountTenantSql`: the From domain's most specific domain is the sub-account's and its
  tenant exists; `claimRouting`): `SesEmailProvider` then sends `TenantName` of the sub-account, on shared IPs (the
  organization's dedicated pool's configuration set can't take that tenant); otherwise (a shared domain) it goes
  out like the organization's own mail, through its dedicated pool when it has one. Sub-account domains never count for SSO and have no
  tracking or receiving domains. **Suppressions**: `email_suppression.subaccount_id`; management functions work on
  exactly one list (`inList`), sends and `check` apply the sub-account's list plus the environment's
  (`inSendLists`), and its bounces, complaints and one-click unsubscribes go on its list only (`autoSuppress` skips
  a deleted sub-account's). Contacts' consent never applies to sub-account sends (contacts are the environment's own
  audience). **Quotas**: `recipients_per_day`/`recipients_per_second`/`burst` on the row, charged after the
  organization's through `emailSendQuotas` + `consumeAll` (`@coss/ratelimit`, buckets
  `email.subaccount_recipients.*` with the row's rule; API and SMTP). **Reputation and screening**: see
  `packages/reputation/AGENTS.md` and `packages/screening/AGENTS.md` (a screening block pauses the sub-account,
  `pauseSubaccount`). **Stats** (`subaccountStats`, `GET /v1/subaccounts/{subaccount}/stats`): recipients per UTC
  send day by current status, counted from its emails (`email_subaccount_send_time_idx`), so at most
  `MAX_SUBACCOUNT_STATS_DAYS` (email retention). **Deletion**: `deleteSubaccount` sets `deleting` (sends refused,
  scheduled ones fail at their claim), the worker's `subaccount-deletions` loop (`runDueSubaccountDeletions`, leased,
  backing off) runs `releaseSubaccountEmailResources` (identities, domain rows, tenant) and deletes the row (cascading
  its suppressions); organization deletion releases sub-accounts' identities and tenants with the rest. A downgrade
  to a plan without sub-accounts is refused while live ones exist (`hasLiveSubaccounts`).

- **Screening images and sender-domain memory** (`screening.ts`, `screening-images.ts`): short HTML
  bodies (<200 visible body characters, excluding alt text and hidden padding) with images are always screened, even beyond
  the normal sample. Sampled emails and broadcasts load image sources, CSS backgrounds, data images
  and CID attachments (before attachment purging). Inspect every discovered image or hold the email;
  never silently truncate: at most 16 images/animation frames, 2 MiB each, 8 MiB total.
  Sharp validates raster metadata under a 16-megapixel cap, enlarges/pads small images to at least
  512×512 for the pinned endpoint, and extracts every animation frame (or holds over-limit animations). Remote HTTP(S) fetches use
  `publicAddressLookup`, check IP literals, forbid credentials and nonstandard ports, and follow no
  redirects. Unsupported, unavailable or oversized images enter the existing screening-error retry path.
  `recordScreeningDomainBlock` records an enforced block's verified sender domain in
  `email_sender_domain_block` in the screening transaction. No domain/org FK: deletion or transfer
  must not erase it. A sub-account can restrict only its own domain, never a shared platform domain.
  `authorizeLiveSender` refuses that domain and descendants across organizations (`sending_paused`);
  immediate queued sends now recheck live authorization at dispatch, as scheduled sends already do.
  Org/sub-account reinstatement clears only its own restrictions. After deploying the schema, use
  `scripts/backfill-screening-domains.ts` (dry-run; `--apply` to write) to seed still-active historical
  org screening suspensions, including From domains whose identity has since been deleted.

  The operator-only `scripts/release-screening-domain.ts --domain <name> --admin <user id> --note <reason>`
  clears a restriction after a transfer or deletion of the source organization; it requires an active
  platform admin and records `email.domain_screening_released` in the admin audit log.
