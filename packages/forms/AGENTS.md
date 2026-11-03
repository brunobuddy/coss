# packages/forms — Forms (hosted form endpoints)

Read together with the root `AGENTS.md` (conventions, tenancy rule, tests). Paths are from the
repository root.

Formspree-like form endpoints: customers point an HTML `<form action>` (or `coss/forms`, or a
hosted page) at `<FORMS_PUBLIC_URL>/f/<form id>`; every submission is screened (honeypot, Risk,
the content check, captcha) and accepted ones go to webhooks, notification emails and contacts,
optionally after the submitter confirms their address. The package never imports `@coss/email`
(email imports `@coss/forms/schemas` for `WEBHOOK_EVENT_TYPES`): mail and contacts go through the
injected `FormMailer` and `FormContactSink`, which the worker implements.

- **Tables** (`packages/db/src/schema/forms.ts`): `form` (`form_`: settings, `fields` jsonb
  definitions or `null` = any field, `contacts`/`files`/`hosted` jsonb configs read through
  `contactsOf`/`filesOf`/`hostedOf` defaults, `disabled_by_admin_at`), `form_submission` (`fsub_`:
  status, `data` jsonb, submitter email, IP, user agent, origin, referrer, the Risk assessment id,
  decision and score, `spam_reason`, the verification token's sha256 and expiry,
  `usage_recorded_at`), `form_submission_file` (`ffile_`, bytes in the store), `form_delivery`
  (`fdlv_`, one per submission and kind: `notification`, `contact`, `verification`),
  `form_store_cleanup` (store keys to delete) and `form_fake_object` (bytes without a bucket).
  Everything cascades from the environment and the form. At most `MAX_FORMS_PER_ENVIRONMENT`
  forms (counted under a per-environment advisory lock).
- **Settings** (`forms.ts`): `createForm`/`updateForm` merge partial groups (`spam`,
  `submitter`, `notifications`, `contacts`, `files`, `hosted`) and validate: unique field names,
  options only on `select`/`radio`/`checkbox`, `file` fields need `files.enabled` (and uploads
  can't be turned off while one remains), `checkedFormOrigin` (https, plus `http://localhost` in
  sandbox, no path), https redirects, blocked file types, the honeypot not a defined field, a
  captcha in the environment's risk settings for `captcha: required`, contacts' audiences, topics
  and properties existing in the environment (and mapped fields defined), a marketing
  `confirmation_from` when contacts use double opt-in, and in live environments senders
  (`notification_from`, `confirmation_from`, required with `verify_submitter`) on verified domains
  and notification recipients that are verified members or on verified domains (`FormChecks`,
  injected: the apps call `authorizeLiveSender`). Hosted pages need non-hidden fields and refuse
  names/labels matching `FORBIDDEN_HOSTED_FIELD_PATTERN` (passwords, codes, cards, SSNs, seed
  phrases); a live page is screened when published (`screenHostedPage`, `hostedPageScreening`:
  Risk's content classification, refused at `HOSTED_PAGE_REFUSAL_SCORE`, fails open).
- **Submitting** (`submit.ts`, `parse.ts`; system-level, the org comes from the form):
  `submitForm` refuses unknown, disabled, admin-disabled forms and suspended or deleting
  organizations (`unavailable`), posts from outside `allowed_origins` (the `Origin` header, else
  the `Referer`'s; the forms host itself is always allowed for hosted pages), then charges the
  injected `admit` (the org's daily bucket). `parseSubmission` drops every `_` name (controls:
  `_next`, `_coss_device`, the honeypot, captcha tokens), caps fields/values/text, validates
  defined fields, files (count, size, types, blocked extensions, `safeFilename`). The honeypot →
  `spam`/`honeypot` without Risk or files. Otherwise `assessRisk` in the form's environment
  (`custom`, `event_name: form_submission`, email, IP, user agent, captcha, device, the text as
  `label: value` lines; a throw fails open): `block` → `spam`/`risk_block`, the highest content
  score ≥ `content_threshold` (default 0.9) → `spam`/`content`, `review` → `held`/`risk_review`
  unless `on_review: deliver`, else `accepted` or `pending_confirmation` with `verify_submitter`.
  A required captcha that didn't pass (failed, or couldn't be checked: no provider answer, no
  captcha set up) is a visible error — never let through. Files go to the store before the row; one
  transaction stores the submission, its files and what its status records (`record.ts`):
  `recordAccepted` (usage `forms.submissions` once, live only, compare-and-set on
  `usage_recorded_at`; `form.submission.received`; the deliveries; a log line, source `forms`),
  `recordFlagged` (`form.submission.flagged`, except honeypot catches; a warning line),
  `recordPendingConfirmation` (the verification delivery). Spam is answered exactly like a
  success, and a verifying form says "pending" for spam too.
- **Public endpoint** (`apps/api/src/routes/forms-public.ts`, mounted at `/f` outside `/v1`; never
  the error envelope): `POST /f/:id` (urlencoded, multipart, JSON; `Accept: application/json` or a
  JSON body → `{ ok, … }` with CORS: `*`, or the matching allowed origin, never credentials),
  `OPTIONS` preflight, `GET /f/:id` (the hosted page), `GET|POST /f/c/:token` (verification: a
  GET never changes anything). Own body limits (text 512 KB, multipart the files' 25 MB + 2 MB;
  `hasOwnBodyLimit` skips the global one). In production `hostOnly`: only requests whose URL host is
  `FORMS_PUBLIC_URL`'s (a registrable domain of its own) are served, so api.coss.com/f/… is a 404.
  Buckets: `forms.submit.form` (per form, before any database work), `forms.submit.ip`,
  `forms.submissions.day` (org, overridable); all deny on store errors.
- **Hosted pages** (`hosted.ts`): server-rendered from `fields` with the honeypot and a
  `_hosted` marker (a refused post re-renders the page with its values and errors), nonce'd style,
  no script but the captcha widget's (`CAPTCHA_ORIGINS`, its site key `captcha_site_key`, the
  provider from risk settings). CSP `frame-ancestors` = `allowed_origins` (else `'none'`),
  `form-action` self + the redirect's origin. `noindex`, "Report abuse" (`FORMS_ABUSE_ADDRESS`).
  `hosted_published_at` is set when a page is turned on or what it shows changes.
- **Deliveries** (`deliveries.ts`, the worker's `forms` loop, `runDueFormDeliveries`): leased by
  moving `next_attempt_at` (5 min), backoff 1, 2, 4… minutes up to 6 hours,
  `MAX_DELIVERY_ATTEMPTS` then `failed`; a suspended organization's rows wait. `notification`:
  `notificationContent` (escaped) to `notify_recipients` still allowed at send (live: verified
  members or addresses on verified domains, `verifiedAddress`), reply-to the submitter, a dashboard
  link; claims skip suspended organizations (re-checked by every claim);
  `contact`: `FormContactSink.add` with the form's mapping; `verification`: a fresh `cossf_` token
  per attempt (only its sha256 stored, 7 days, `storeConfirmationToken`), idempotency key
  `form-verification:<id>:<hash prefix>`, after `admitVerification` (the worker's
  `forms.verifications.day` + the cross-org `forms.verification.address`). The worker's
  `formMailer` (`apps/worker/src/form-mailer.ts`) sends in the form's environment from its own
  sender, else (or when that domain stops being verified) notifications from coss.com
  (`FORMS_NOTIFICATIONS_FROM`, default `NOTIFICATIONS_FROM`'s address) as "<form name> via
  coss.com"; **verification emails never fall back to coss.com** (`customerOnly`); sandbox always
  sends in its own environment; tracking off, bodies discarded in live environments (a sandbox
  keeps them, so its emails page shows the links to test with). `formContactSink`
  (`form-contacts.ts`) upserts the contact (`source: form`; property strings coerced by type,
  misfits dropped; without double opt-in a new contact is `subscribed`, an existing one keeps its
  status) and sends the confirmation with the API's charges (org confirmation buckets, the
  address's, the send quota; refunded unless sent).
- **Release** (`release.ts`): `confirmFormSubmission` (system-level, by token, row-locked:
  `pending_confirmation` → `accepted`, once), `findConfirmation` (read-only, the GET page), and
  `releaseSubmission` (held/spam → accepted, `released_by` `user:`/`api_key:`, verification
  skipped, then `recordRiskFeedback` `legitimate` after the commit, never failing the release).
- **Reads** (`submissions.ts`): list (status filter, keyset), get, delete (files to cleanup in
  the transaction), `readFormSubmissionFile` (served as `application/octet-stream` +
  `Content-Disposition: attachment` + `CSP: sandbox`; files are untrusted).
- **Store** (`store.ts`, `s3-store.ts`, `store-cleanup.ts`): `FormFileStore`, keys
  `orgs/<org>/<env>/forms/<form>/<submission>/<file>`; `formsStoreFromEnv` (`./runtime`): S3 with
  `FORMS_FILES_BUCKET` (+ `AWS_REGION`), else the fake store outside production, else `null` (no
  uploads). Deleting a form or submission and the purge record keys in `form_store_cleanup` in the
  deleting transaction; `runDueFormStoreCleanup` (the `forms` loop) retries with backoff.
- **Retention** (`retention.ts`): `purgeExpiredFormSubmissions` (`RETENTION_DAYS.formSubmissions`
  for accepted, `formSpam` for the rest; files to cleanup), `purgeExpiredFormFakeObjects`. The
  bucket's lifecycle rule expires objects after the longest retention + 1 day.
- **Deletion**: `deleteOrganizationData` deletes submissions per environment, fake objects and
  cleanup rows; `releaseProviderResources` deletes the store's org prefix.
- **API** (`apps/api/src/routes/forms.ts`, permission `form`): `/v1/forms` CRUD, submissions list,
  get, delete, release, file; audited (`form.*`, `form_submission.*`); 503 `forms_unavailable`
  without `FORMS_PUBLIC_URL`. SDK `coss.forms`, `coss.forms.submissions`, browser `coss/forms`
  (`attachForm`, `submitForm`).
- **Dashboard** (`apps/web/src/app/[orgSlug]/projects/[projectSlug]/[envSlug]/forms/`, gated by
  the `form` permissions, audited like the API): the list and "New form" (opens the builder), a
  form's page (endpoint, HTML and `coss/forms` snippets, Inbox/Held/Spam/Unconfirmed, CSV export
  through `[formId]/export`), a submission (fields, files downloaded through
  `…/files/[fileId]` as `application/octet-stream` + `CSP: sandbox`, Risk's assessment, release
  and delete), `builder` (the fields editor and hosted page, with a preview of the page as saved in
  a `sandbox=""` iframe) and `settings`. `apps/web/src/lib/forms.ts` builds the store, the links
  and the save checks (`authorizeLiveSender`, `hostedPageScreening`). **Admin console**
  (`/admin/forms`, `listFormsForAdmin`, `setFormDisabledByAdmin`): every organization's forms
  (hosted pages first) and "Disable form", recorded as `form.disable`/`form.enable` in the admin
  audit log in the same transaction; a disabled form and its page answer like missing ones.
- **Billing**: meters `forms.submissions` (accepted submissions, live; $1 per 1,000, 1,000 a month
  on Free) and `forms.file_uploads` (their files in whole MB of 2^20 bytes, rounded up per
  submission, `uploadMegabytes`; $0.25 per 1,000 MB, which pays for the 90 days they're kept;
  1,000 MB a month on Free), both recorded by `recordAccepted` once and reserved there through the
  `UsageGate` (Free's caps). Past the uploads cap a post with files is `invalid` with
  `files_not_accepted` on the file field (`isUploadLimitError`), so the form still takes it
  without them; past the submissions cap the form answers `unavailable`.

## Production

Live at `https://cossforms.com` (`FORMS_PUBLIC_URL`; a CloudFront distribution of its own → the
ALB's `/f/*` rule to the api with `X-Forms-Origin-Verify`, its ACM certificate on the listener;
README, "Deploying to AWS"), uploads in `FORMS_FILES_BUCKET` (SSE-KMS, no public
access, objects expire after `RETENTION_DAYS.formSubmissions` + 1 days), IAM for api, worker and
web. Never move it to a coss.com subdomain: phishing reports would land on coss.com.
`FORMS_NOTIFICATIONS_FROM` (worker) is optional. Anything on the domain outside `/f/*` (the apex
included) redirects to `https://coss.com/docs/forms` (a CloudFront function). Still to do:
the `abuse@coss.com` mailbox the pages link to, watched (the admin console's "Disable form"
takes a form down).
