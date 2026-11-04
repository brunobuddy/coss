# packages/compliance — HIPAA mode

Read together with the root `AGENTS.md` (conventions, tenancy rule, tests). Paths are from the
repository root.

One per-organization switch for customers with a signed Business Associate Agreement. It narrows
where PHI can go and who at coss.com can reach it, and shows the customer what they have.

- **State**: `organization_hipaa_mode` (presence is the mode). Written only by
  `enableHipaaMode`/`disableHipaaMode` (`@coss/tenancy/admin`, from the admin console's organization
  page, audited in `admin_audit_event` and through `supportAudit` in the customer's own log). It is
  **never a billing entitlement**: a contract ending or a scheduled downgrade must not lift
  safeguards with nobody deciding to. Sales bills it as a custom add-on on the contract. Turning it
  on needs the plan's `auditLog`, the BAA's date and reference, and a reason; it also sets
  `requireTwoFactor` and updates what's waiting to go out (emails' snapshots, SMS bodies, pending
  pushes) in the same transaction.
- **The catalog** (`./catalog`, client-safe, no imports): `HIPAA_CONTROLS`, `HIPAA_VENDORS`,
  `HIPAA_RESPONSIBILITIES`. Enforcement and `/<org>/settings/compliance` both read it. When a vendor
  signs a BAA, change its `status` here (`hipaaVendorCovered`). Never write "HIPAA compliant": the
  controls support the customer's compliance, which also depends on how they use coss.com. The
  public docs (`apps/site/content/docs/(platform)/hipaa.mdx`) restate the catalog and the refusals
  by hand: change them together.
- **Reading it**: packages call `isHipaaMode`/`hipaaModeApplies` themselves. Never inject them: a
  missing wire would leave a safeguard off, and a database failure must fail the operation rather
  than skip the check. `authenticateApiKey` and `getMembership` carry `hipaaMode`, so requests add
  no query. `hipaaModeSql` is for queries that need it inline. This package imports only `@coss/db`,
  so anything may import it; its tests are catalog-only because `@coss/tenancy`'s fixtures would be
  a dependency cycle. Each gated package tests its own gate (`test/hipaa-mode.test.ts`, with
  `enableTestHipaaMode` from `./testing`).
- **Refusals**: `HipaaModeError` (code `hipaa_mode_restriction`): 403 `permission_error` from
  `toApiError`, not 402 (paying wouldn't help), 550 from the SMTP relay, the message as-is from
  `runAction`.

## What it enforces

Sandbox environments reach no vendor and keep test messages for developers to read, so the stored
data limits apply to live environments only (`hipaaModeApplies`).

- **AI**: `screenMessage` returns `SEND` first, before any policy, so a message is never held and an
  admin's override can't turn it back on. `classifyContent` refuses;
  `assessmentContentScores` answers no scores, not degraded and uncharged; `hostedPageScreening` and
  `screenSetup` skip it.
- **Mail through coss.com's organization** (Forms, Sign, Verify and Scheduling fallbacks): the row
  belongs to coss.com, so the mode's checks can't see it. Each sender passes `hipaaOrigin` when the
  originating organization is in the mode (`email.hipaa_origin`): not screened, no stored content,
  required TLS and never coss.com's dedicated pool, hidden from staff. A new sender that can fall
  back to coss.com's environment must do the same.
- **Turning it on while messages wait**: settings are snapshotted at acceptance, so they're read
  again where they matter: `claimRouting` and `hipaaAtClaim` at the claim, and `purgeSendContent` and
  `discardSmsBody` for a message that finishes without one (canceled, refused).
- **SMS**: live messages to `HIPAA_SMS_COUNTRIES` only (checked at acceptance and again at dispatch),
  always `discardBody`. Verify's shared numbers are refused. Scheduling skips a number it can't text
  rather than retrying.
- **Phone lookups**: refused until `twilio_lookup` is covered. **Push**: `enqueuePush` does nothing.
- **Email**: `getStorageSettings` answers `discard` (`lockedByHipaaMode`), `resolveTracking` turns
  opens and clicks off and refuses asking for them, because `email_link` URLs survive discard.
  Unsubscribe links stay. Broadcasts apply it when each email is made.
- **Request logs**: no bodies or query strings (`request-log.ts`), so log drains get metadata only.
- **Two-factor**: `setOrganizationTwoFactorRequired` refuses turning it off.
- **Idle logoff**: `touchHipaaSession` in `requireOrgMember` and `requireMobileOrgMember`, on
  `hipaa_session_activity`. Not `session.updated_at`: Better Auth moves that when it extends a
  session, which a browser left open overnight triggers on its next request. A session with no
  record is measured from when it began, so moving here from another organization after the timeout
  means signing in again. Polling pages count as activity. It stays out of `orgAccess`, whose push
  and CLI callers have no last activity.
- **Staff**: `revealEmailContentAction` and `impersonateUserAction` refuse; `requireOrgMember` refuses
  an impersonation that was already running; `listEmailsForAdmin` and the admin email page hide
  subjects, recipients and events. There is no override. Suspension and takedown still work.
- **Required TLS**: `email.require_tls`, decided at the claim like `dedicated_pool`.
  `SesEmailProvider` then uses `requiredTlsSetFor` (`<set>-tls`, `TlsPolicy: REQUIRE`), which
  `ses:bootstrap` creates and every tenant is associated with (`ensureTenant`, and bootstrap for
  existing ones), so turning the mode on needs no SES call. A dedicated pool's sets get the policy
  from `reconcilePoolTls` in the `dedicated-ips` loop (`dedicated_ip_pool.tls_required_at`), and
  `dedicatedPoolSql` keeps the organization's mail on the shared TLS sets until then. **Run
  `ses:bootstrap` (keep `--managed-domain`: without it the policies lose inbound mail's permissions)
  before turning the mode on for anyone**: a send naming an unassociated set is refused. The
  script is in the image, so it follows the rollout; until it has run, `ensureTenant` only warns
  when it can't reach the TLS set, and bootstrap associates every tenant that missed it.

## Known gaps

- **Sentry has no BAA**: error text can hold PHI even with addresses and numbers masked. The SDK is
  process-wide and `organization_id` is only a tag some events carry (not worker loops, public form
  posts or traces), so it can't be guaranteed off per customer. Its row in `HIPAA_VENDORS` says
  `no_baa` until one is signed.
- A push already being sent as the mode turns on can still reach Apple: organization and project
  names only, in a window of milliseconds, before the customer has sent any PHI.
- What `REQUIRE` does on a real send: AWS documents that SES drops the message, not whether an event
  follows. Without one, the recipient stays `sent`. Test it against a server without TLS.
