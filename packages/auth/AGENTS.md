# packages/auth — Better Auth, sign-in, SSO, SCIM, the iOS app, account emails

Read together with the root `AGENTS.md` (conventions, tenancy rule, tests). Paths are from the
repository root.

Better Auth (`packages/auth`) and the dashboard actions, mobile API routes, tenancy functions and tests that call `auth.api.*`.

- **Better Auth:** `better-auth`, `@better-auth/core`, `@better-auth/api-key`, `@better-auth/passkey`,
  `@better-auth/sso`, `@better-auth/scim` and `auth` (CLI) stay on one identical exact version (catalog) — bump them together.
  - The api-key plugin is `@better-auth/api-key` (not `better-auth/plugins`). Keys are org-owned
    (`references: "organization"`); `referenceId` has **no FK**. A key is an organization key or a **personal
    key** (`environment_api_key.owner_user_id`, its usage is that member's spend): the plugin checks
    `apiKey:create` for the creator, so members hold it, and `keyCreationAllowed` (`@coss/tenancy`) decides which
    keys: organization keys and keys for others need `apiKey:manage` (owners, admins), a member's own personal
    key an environment with `personal_keys` on. Personal keys hold `ORG_SCOPED_KEY_PERMISSIONS` (domain
    changes, billing, audit) only while the owner's current role does (`personalKeyPermissions`, applied by
    `effectiveKeyPermissions`); `authenticateApiKey` refuses them once the owner is no longer a member or is
    banned, and `revokeDepartedMemberKeys` (`./member-keys`) deletes them on leave/removal (both hooks below)
    while `reconcileScimMembership` deletes them in its transaction. Members revoke their own with
    `revokePersonalApiKey` (Better Auth's delete checks `apiKey:delete`). Deliberate settings: built-in rate limit off
    (`rateLimit: { enabled: false }`), `enableMetadata: false` (the environment binding lives only in
    `environment_api_key`; metadata is client-writable),
    `defaultPermissions: API_KEY_PERMISSIONS`, prefixes
    `coss_live_` / `coss_test_` by environment mode (`API_KEY_PREFIX`), key format `/^coss_(live|test)_[A-Za-z]{64}$/`.
  - **Scoped keys:** every binding has an `access` (`environment_api_key.access`; `createEnvironmentApiKey` always sets it, the `full` default only covers older writers mid-rollout). `full` keys are checked
    against the current `API_KEY_PERMISSIONS` on every request (their stored `apikey.permissions` is ignored, so new
    products need no backfill); `restricted` keys hold exactly the stored subset, validated at creation by
    `normalizeKeyPermissions` (`./api-key-permissions`: known resources/actions only, at least one) and passed to
    Better Auth's server-only `permissions`. Both checks (`authenticateApiKey`, `apiKeyHasPermissions`) go through
    `effectiveKeyPermissions`. Restricted keys never gain permissions: never backfill them. The dashboard's presets
    (`full`, `sending` = `email:send`, `read_only` = every `read`, `custom`) are only ways to fill the set; CLI
    sign-in, the seed and test fixtures create `full` keys (CLI keys are personal keys of the approving member). Permissions can't be edited after creation (a new key).
  - Keys are created only by `createEnvironmentApiKey` (server-side, no headers) and authenticated only by
    `authenticateApiKey`; keys without an `environment_api_key` binding fail closed. `authenticateApiKey` never calls
    Better Auth's `verifyApiKey` (it writes the key row on every request): one SELECT checks enabled, expiry, org,
    prefix/mode and permissions, rejects keys with a usage quota (`remaining`), and refreshes `last_request` at most
    once a minute (`LAST_USED_RESOLUTION_MS`). Re-check it against `validateApiKey` when bumping Better Auth or
    using a new key option (quotas, refills, per-key rate limits). Revocation: `getKeyBinding`
    ownership check, then `auth.api.deleteApiKey` with session headers.
  - `disabledPaths` blocks the HTTP routes `/api-key/{create,update,get,list,delete}`, **every organization-plugin
    route except `/organization/create` and `/organization/accept-invitation`** (`ORGANIZATION_PATHS` minus
    `ORGANIZATION_HTTP_PATHS` — Better Auth's routes skip `orgAccess` (SSO/2FA requirements), the directory-managed
    member lock and the audit log, which the dashboard's actions apply before calling `auth.api.*`; add a new
    plugin route to `ORGANIZATION_PATHS`), the account routes (`/update-user`, `/change-password`,
    `/change-email`, `/delete-user`, `/list-sessions` — it returns every session's token —, `/revoke-session(s)`,
    `/revoke-other-sessions`, `/update-session`, linked accounts and their tokens), every admin-plugin mutation
    (`/admin/{create-user,update-user,remove-user,set-role,set-user-password,ban-user,
    unban-user,impersonate-user,revoke-user-session,revoke-user-sessions}`) and SSO provider management
    (`/sso/{register,update-provider,delete-provider,providers,get-provider,request-domain-verification,verify-domain}`)
    (server-side `auth.api.*` still works; the browser's `authClient` calls only sign-in/up, password reset,
    verification email, two-factor, passkeys and those two organization routes).
    Admin mutations go only through `apps/web/src/app/admin/actions.ts`, which records the audit log. Never re-enable
    them to "simplify" things. Impersonation sessions are also refused account changes (`ACCOUNT_CHANGE_PATHS` in
    `hooks.before`) for every caller, like factor management.
  - Invitations follow their inviter (`packages/auth/src/invitations.ts`): Better Auth accepts any pending one,
    so `beforeAcceptInvitation` refuses it unless the inviter is still a member allowed to invite, and
    `cancelStaleInvitations` cancels the rest after a member is removed, demoted (`afterRemoveMember`,
    `afterUpdateMemberRole`) or leaves (a `hooks.after` on `/organization/leave`, which has no org hook).
  - `organizationHooks` validate org slugs on create/update, only allow canonical roles (`INVITABLE_ORG_ROLES`,
    `isOrgRole`), only cancel `pending` invitations (Better Auth would rewrite accepted ones) and refuse invitations,
    accepting/canceling them, organization updates and member changes while the org is suspended;
    a before middleware also guards invitation resends and leaving (Better Auth skips the hooks for these); `orgRoleCan` matches
    role names exactly. Better Auth trims and normalizes roles before these hooks and on every write, so stored
    roles are canonical; a padded value it never wrote gains nothing in the dashboard. `assignableOrgRoles` mirrors Better Auth's update-member-role
    rules (only owners change owners or grant owner; Better Auth alone enforces "the last owner can't step down").
  - **Abuse prevention.** Turnstile: Better Auth's `captcha` plugin (only when `TURNSTILE_SECRET_KEY` is set) checks
    `/sign-up/email`, `/sign-in/email` and `/request-password-reset` (HTTP only; `auth.api.*` skips it); the forms
    get the token from `useTurnstile` (`apps/web/src/components/turnstile.tsx`) and send it as `x-captcha-response`.
    It fails closed while siteverify is unreachable (passkeys and SSO still sign in). The sign-up guard runs on
    `/sign-up/email` only — never in `databaseHooks`, so fixtures (`@coss.test`), the seed,
    admins and SSO users skip it: disposable domains (vendored list, parent domains included), domains that
    definitively can't receive mail (NXDOMAIN, null MX, no MX/A/AAAA; system resolver, 1 s, in-process cache;
    lookup failures allow; special-use TLDs like `.test` allowed outside production only), and a second account
    for the same mailbox (`user.canonicalEmail`, set for every new user; its rules are mirrored in SQL by
    migration `0033` — change both together). The sign-up endpoint holds a Postgres advisory lock per
    canonical mailbox through the account transaction; organization creation holds one per owner through
    the organization and membership transaction (`serialized-endpoint.ts`). Invitations: inviter must have a verified email, no disposable
    invitees (both checked in middleware, including resends), at most `MAX_PENDING_INVITATIONS` pending per org, and the dashboard action charges the org's
    `dashboard.invitations` bucket (refunded when Better Auth refuses). Organizations: a user owns at most
    `MAX_OWNED_ORGANIZATIONS` (platform admins exempt; memberships don't count; `user.owned_organization_limit`
    overrides it, set only by `setOwnedOrganizationLimit` from the admin console's user page), and `/organization/create` is
    limited per IP (`auth.org_create.ip`).
  - Password reset: `sendResetPassword` emails Better Auth's `/api/auth/reset-password/:token` link, which redirects to
    the dashboard's `/reset-password?token=…` (the client passes `redirectTo`); `revokeSessionsOnPasswordReset: true`.
  - Org roles spread `ownerAc.statements` / `adminAc.statements` / `memberAc.statements` (custom roles replace defaults).
  - `requireEmailVerificationOnInvitation: true` must stay on (custom ids make invitation ids predictable).
  - Never add NOT NULL columns to Better Auth tables (runtime schema validation rejects every auth request).
  - **Two-factor / passkeys:** TOTP + backup codes only (no email/SMS OTP). The challenge only guards password sign-in
    (`/sign-in/email`), so nothing else may create a session for a password user: `autoSignInAfterVerification` stays
    `false`. Passkey sign-in skips TOTP, so `authenticatorSelection.userVerification` stays `"required"`, which the plugin
    enforces on registration and authentication; `assertUserVerified` (both `afterVerification` hooks) checks it again. Passkey `rpID`/`origin`
    come from `BETTER_AUTH_URL` (changing its host invalidates every passkey). The `hooks.before` guard refuses
    `FACTOR_MANAGEMENT_PATHS` to impersonation sessions; add new factor-changing endpoints there. Code and passkey
    verification are limited per IP in `auth-rate-limit.ts` (Better Auth also locks an account for 15 min after 10
    failed codes).
  - **Google / GitHub sign-in** (`packages/auth/src/social.ts`, Better Auth `socialProviders`, `/sign-in/social` +
    `/callback/:id`; Google's id-token sign-in is off): the two-factor plugin doesn't challenge OAuth callbacks, so
    `socialTwoFactor` swaps a TOTP user's new session for the plugin's `two_factor` challenge (it mirrors the
    plugin's cookie and verification rows — re-check it when bumping Better Auth; `packages/tenancy/test/social.test.ts`
    runs it) and redirects to `/sign-in?step=two-factor`. New users from a callback need a provider-verified address
    and pass the sign-up guard (disposable/undeliverable domains, one account per canonical mailbox) in
    `databaseHooks.user.create`. Implicit linking by address needs both sides verified (`requireLocalEmailVerified`,
    keep it on: an unverified password account may belong to whoever registered someone else's address); keep
    `trustedProviders` empty. Explicit linking (account settings, `allowDifferentEmails`) and adding a first password
    need a session younger than `freshAge` (the actions check; `/link-social`, `/unlink-account` stay closed over
    HTTP). Provider tokens are never stored (`withoutProviderTokens`). Profile pictures: Better Auth copies
    the provider's into `user.image` at sign-up; a linked account's becomes it when there is none
    (`providerPicture` in `account.create.before`, written after commit; the name still never syncs). The
    dashboard shows only `*.googleusercontent.com`/`avatars.githubusercontent.com` pictures (an SSO IdP's
    `picture` could point anywhere), else the verified address's Gravatar (`d=404`), else initials
    (`avatarUrl`, `apps/web/src/lib/avatars.ts`; `UserAvatar` loads it without a referrer). `?error=` codes are mapped by
    `apps/web/src/lib/social-errors.ts` (never show `error_description`). `/sign-in/social` is limited per IP
    (`auth.social.ip`).
  - **SSO** (`@better-auth/sso`, `packages/auth/src/sso.ts`, `packages/tenancy/src/sso.ts`): one provider per
    organization (enforced by the dashboard action), registered/updated/deleted only through `auth.api.*` from
    `[orgSlug]/settings/sso/actions.ts` (`sso:update`: owners and admins; the plugin itself re-checks owner/admin).
    Its `providerId` is `ssoProviderIdFor(organizationId)` (`sso_<org suffix>`), so callback URLs exist before saving.
    Domain trust replaces the plugin's TXT verification: `domainVerified` is set by `syncSsoDomainVerification` (every
    provider domain is a `verified` email domain of the org) after every save — the plugin resets it when domains
    change — and `resolveSsoUser` (the plugin's `resolveUser`, runs before any write) re-checks on every sign-in that
    the IdP's address falls under the most specific non-failed email domain, owned by that org and listed on the
    provider (the `authorizeLiveSender` rule), and refuses new members of suspended orgs (the plugin's org
    provisioning writes `member` directly, bypassing the organization hooks). Users created by an SSO callback are
    created `emailVerified` (`databaseHooks.user`); linking an existing account keeps Better Auth's rules (trusted
    provider + verified local email). Never put SSO provider ids in `trustedProviders` or IdP origins in
    `trustedOrigins` (that also allows redirects to them): the dashboard runs OIDC discovery itself
    (`apps/web/src/lib/sso.ts`, public https hosts only) and registers with `skipDiscovery`.
  - **SSO sessions and enforcement:** `session.ssoProviderId` (additional field, `input: false`) is set by
    `databaseHooks.session` only for sessions created on `/sso/callback/:providerId` or `/sso/saml2/sp/acs/:providerId`.
    `organization.requireSso` (written only by `setOrganizationSsoRequired`; turning it on needs `sso:require` —
    owners only — an active provider, the actor's own SSO session and a password) makes `requireOrgMember` send
    members whose session didn't come from the org's provider to `/sso?org=…` (`orgAccess`,
    `apps/web/src/lib/org-access.ts`). Owners keep break-glass access (password, plus TOTP if 2FA is required) and
    see a banner; impersonation sessions are exempt. An SSO session from the org's own provider also satisfies its
    `requireTwoFactor` (the IdP owns MFA); another org's provider satisfies neither. API keys are unaffected.
    Admin recovery (audited, `@coss/tenancy/admin`): `unlinkUserSso`, `disableOrganizationSsoRequirement`,
    `disableOrganizationSso` (clears `domainVerified`; saving again re-enables). A domain the org's provider
    lists can't be deleted (`deleteDomain` → `domain_in_use_by_sso`, 422): it would end SSO sign-in and, with
    `requireSso`, lock members out; it must come off the provider first. Disabling or removing a provider
    also signs out the sessions it created (`revokeSsoProviderSessions`): Better Auth keeps them, they would still
    count as SSO for the org's requirements, and a later provider gets the same derived id.
  - **SCIM (directory sync)** (`@better-auth/scim`, `packages/auth/src/scim.ts`, `packages/tenancy/src/scim.ts`,
    endpoints at `/api/auth/scim/v2`): one **managed** connection per organization (`provisioningDomainId` = the
    organization id), created/rotated/revoked/decommissioned only through the plugin's serverOnly `auth.api.*`
    (`connectScim` & co., `scim:update`: owners and admins); tokens are HMAC digests keyed by a secret derived from
    `BETTER_AUTH_SECRET` (`scimCredentialHashSecret` — rotating that secret invalidates every SCIM token). Connecting
    needs an active SSO provider: `resolveScimUser` only provisions addresses under the provider's domains
    (`ssoDomainForEmail`, also enforced on create/update in `databaseHooks.user` so directory users stay
    `emailVerified`), links an existing account only when it is verified (keep this independent of sign-up policy:
    an unverified account would hand membership to whoever registered it) and never lets the directory rewrite a linked account
    (`profile: "preserve"`). The plugin has no organizations: `reconcileScimMembership` (its `projection`) writes
    `member` rows through the transaction it is given — active = member, admin when a group is mapped to admin in
    `scim_group_role` (normalized displayName); inactive/deleted = membership removed and that org's SSO sessions
    deleted. **Owners are never changed**, nobody is added or promoted while the org is suspended (removals apply).
    The plugin deletes *every* session of a globally inactive user; the `session.delete.before` hook vetoes that
    (`isScimSessionSweep`) during SCIM requests and inside `preservingScimMembers` (coss.com's decommission/replay
    calls, which also keep members whose only source was the disconnected directory). While a connection is
    active, `resolveSsoUser` admits only users with an active SCIM user there (matched by email, not the IdP
    subject) and existing owners (`scimBlocksSsoSignIn`). The dashboard refuses manual removal/role changes of
    directory-managed members (except making them owner), and removing the SSO provider while a directory is
    connected. Every method of `/scim/v2/*` is limited per IP and per token (`withScimRateLimit`). Admin recovery:
    `disableOrganizationScim` (audited `organization.disable_scim`).
  - **2FA enforcement:** `organization.requireTwoFactor` (additional field, `input: false`; written only by
    `setOrganizationTwoFactorRequired` from org settings, which needs `organization:update` and an actor with 2FA).
    `requireOrgMember` redirects members without `user.twoFactorEnabled` to `/settings/security` — passkeys don't satisfy it
    (the password still works without a code). API keys are unaffected. Admin recovery: `resetUserTwoFactor` (audited).
  - `packages/auth` must not import `next/*` or `"server-only"` (the `auth` CLI loads `src/auth.ts` on Node).
    `nextCookies()` is appended last, only in `apps/web/src/lib/auth.ts`.
- **iOS app sign-in** (`@coss/auth/mobile`, `apps/web/src/app/app/authorize`, `apps/web/src/lib/mobile-api.ts`): the app
  opens `/app/authorize?code_challenge&state` in an ephemeral browser sheet; the signed-in user approves (refused while
  impersonating or unverified) and gets a 60-second one-time code bound to the PKCE S256 challenge, stored hashed in
  Better Auth's `verification` table (`mobile-auth:` identifiers) and consumed by one `DELETE … RETURNING`. `POST
  /api/mobile/v1/auth/token` (`mobile.token.ip`) opens an ordinary Better Auth session (listed and revocable in
  `/settings/sessions`, ended by password resets; it copies the approving session's `ssoProviderId`) and returns a
  mobile-only credential, `cm1.<session token>.<HMAC over "coss-mobile-session:" + token>` — never Better Auth's
  signed cookie value, which a browser could replay to use the whole dashboard. Better Auth's `bearer` plugin stays
  off — it would expose every web session token in a `set-auth-token` header —, so the credential works only on
  `/api/mobile/*` (public in `proxy.ts`): `requireMobileSession` verifies it, signs the session cookie server-side
  and reads it with the base `@coss/auth` instance (the
  dashboard's `nextCookies()` would set cookies on the app's responses); request cookies never authenticate there.
  The exchange checks bans itself before `createSession`, whose own ban check would throw instead of refusing the code.
  `requireMobileOrgMember` applies `getMembership` + `orgAccess` + `memberCan` like `requireOrgMember`, as JSON:
  404 for non-members, 403 `sso_required`/`two_factor_required` with the dashboard page to fix it, and a `mobile.api`
  bucket per user. Responses are `@coss/companion` types built from the public objects (webhook rows only through
  `toWebhookEndpointObject`, never secrets); reputation history leaves out policy changes, admin identities and
  notes (like the customer page), sent/received email detail never includes the HTML body, and Hooks endpoints
  and log drains never include secrets. The app's only changes (POST: retry a webhook delivery, recover an
  endpoint's failed deliveries, enable or disable an endpoint, cancel or reschedule a scheduled email,
  report a risk outcome, also from the review queue, approve, decline or cancel a booking) repeat the dashboard action's
  checks (`requireMobileWrite`: role, then suspension; the environment owns the endpoint) and record the same audit
  event with `recordAudit`; a new one must too. Deleting the account (`POST /api/mobile/v1/account/deletion`) is
  `deleteAccountAction`'s twin: the typed address, a session younger than Better Auth's `freshAge` (else 403
  `reauthentication_required`: the app signs in again) and `deleteAccount` (`apps/web/src/lib/account-deletion.ts`).
- **CLI sign-in** (`coss login`; `@coss/auth/cli`, `packages/tenancy/src/cli-auth.ts`, `apps/web/src/app/app/authorize/cli`,
  `apps/web/src/app/api/cli/v1/token/route.ts`): the CLI opens `/app/authorize/cli?code_challenge&state&host` plus
  either `port` (its loopback server; the redirect is built as `http://127.0.0.1:<port>/callback` from the port
  alone, never a URL from the request, RFC 8252) or `mode=code` (a remote machine: the page shows the code to paste).
  `coss init` adds `project=<name>`: the page then lists sandbox environments only and names the key
  `<project> · coss init` (a presentation hint; the CLI itself revokes a live key it gets).
  The page lists environments where the member may create a personal key (`keyCreationAllowed`) and the session meets `orgAccess`
  (others are named, not listed), shows `cliVerificationCode(challenge)` — the same code the terminal prints, so
  a user approving a link someone else started can tell — and refuses impersonation. `authorizeCli` repeats the
  key action's checks (`requireOrgPermission(apiKey:create)`, `keyCreationAllowed`, `liveKeyRestriction`) and stores a one-time code
  bound to the S256 challenge (`cli-auth:` identifiers in `verification`, 60 s, 5 min for display codes): it records
  what was approved, never a key. `POST /api/cli/v1/token` (public, `cli.token.ip`) consumes it once
  (`redeemCliAuthorization`: ban, membership by slug + id, role, suspension, `orgAccess` with the approving
  session's `ssoProviderId` and the user's current `twoFactorEnabled`, the environment, verified email for live),
  checks reputation suspension for live keys, then creates the approver's personal key (`createEnvironmentApiKey`) and records
  `api_key.created` with `via: "cli"` (`recordUserAudit`, no session). Keys revoke themselves with
  `DELETE /v1/api_key` (`revokeEnvironmentApiKey`, audited by the key), which `coss logout --revoke` calls.
- **Account emails** (table `auth_email`, ids `authml_`; `packages/auth/src/emails.ts`): Better Auth's
  `sendVerificationEmail`/`sendResetPassword`/`sendInvitationEmail` only queue a row (`enqueueAuthEmail`, outside
  Better Auth's transaction — so `user_id` has no FK, and a missing user is retried for 5 minutes before it is
  skipped); outside production they also print the link to the dashboard's console as `[auth] …` lines. The worker's
  `auth-emails` loop (`runDueAuthEmails`, every 2 s, only when `NOTIFICATIONS_*` are set) sends them through
  `emailNotifier({ discardBody: true })` with the row id as idempotency key — the same lease/backoff/attempts as
  reputation notifications. Links are secrets: the row's `url` is cleared when it settles, and `discardBody` makes
  `purgeSendContent` clear the stored email's `html`/`text` when it leaves `queued`/`scheduled` (internal sends only;
  never expose it on the API). Skipped: expired links (verification and reset: 1 h, `VERIFICATION_LINK_TTL_S`/
  `RESET_PASSWORD_LINK_TTL_S`, also passed to Better Auth; invitations: their `expiresAt`), already-verified
  addresses, banned or changed accounts, invitations no longer pending. User-chosen names are escaped and kept on one
  line in subjects.
