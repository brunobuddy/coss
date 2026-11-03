/**
 * Base Better Auth options shared by every process (dashboard, public API, scripts, `auth` CLI).
 * Must stay free of Next.js imports — apps/web appends `nextCookies()` in its own instance.
 * Must not import "server-only" (it breaks the `auth` CLI loader).
 */

import { apiKey } from "@better-auth/api-key";
import { getCurrentAdapter, queueAfterTransactionHook } from "@better-auth/core/context";
import { passkey } from "@better-auth/passkey";
import { scim } from "@better-auth/scim";
import { sso } from "@better-auth/sso";
import { db, type Executor } from "@coss/db";
import { ID_PREFIXES, newId } from "@coss/db/id";
import * as schema from "@coss/db/schema";
import { cachedMailDomainCheck, canonicalEmail, isDisposableDomain } from "@coss/signals/email";
import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx, signUpEmail } from "better-auth/api";
import { admin, captcha, organization, twoFactor } from "better-auth/plugins";
import { and, eq, isNull } from "drizzle-orm";
import { recordOrgAudit } from "./audit.ts";
import {
  API_KEY_NAME_MAX_LENGTH,
  API_KEY_PERMISSIONS,
  API_KEY_VISIBLE_CHARACTERS,
} from "./constants.ts";
import { DISPOSABLE_EMAIL, signUpEmailRejection } from "./email-guard.ts";
import { enqueueAuthEmail, RESET_PASSWORD_LINK_TTL_S, VERIFICATION_LINK_TTL_S } from "./emails.ts";
import { cancelStaleInvitations, inviterStillAllowed } from "./invitations.ts";
import { membershipLimitFor } from "./limits.ts";
import { revokeDepartedMemberKeys } from "./member-keys.ts";
import { INVITABLE_ORG_ROLES, isOrgRole, orgAc, orgRoles } from "./permissions.ts";
import { assertSignUpNotBlocked } from "./risk.ts";
import {
  assertScimEmail,
  isScimSessionSweep,
  scimCredentialHashSecret,
  scimOrganizationIdOf,
  scimPluginOptions,
} from "./scim.ts";
import { serializedEndpoint } from "./serialized-endpoint.ts";
import { validateOrgName, validateOrgSlug } from "./slugs.ts";
import {
  isSocialCallbackPath,
  providerPicture,
  socialProvidersFromEnv,
  socialTwoFactor,
  withoutProviderTokens,
} from "./social.ts";
import { emailDomainOf, resolveSsoUser, ssoProviderIdOfPath } from "./sso.ts";

/** Better Auth model name -> TypeID prefix. */
const MODEL_ID_PREFIX: Record<string, string> = {
  user: ID_PREFIXES.user,
  session: ID_PREFIXES.session,
  account: ID_PREFIXES.account,
  verification: ID_PREFIXES.verification,
  organization: ID_PREFIXES.organization,
  member: ID_PREFIXES.member,
  invitation: ID_PREFIXES.invitation,
  apikey: ID_PREFIXES.apiKey,
  twoFactor: ID_PREFIXES.twoFactor,
  passkey: ID_PREFIXES.passkey,
  ssoProvider: ID_PREFIXES.ssoProvider,
  scimConnectionBinding: ID_PREFIXES.scimConnectionBinding,
  scimSubject: ID_PREFIXES.scimSubject,
  scimUser: ID_PREFIXES.scimUser,
  scimIdentityTombstone: ID_PREFIXES.scimIdentityTombstone,
  scimGroup: ID_PREFIXES.scimGroup,
  scimGroupMember: ID_PREFIXES.scimGroupMember,
  scimProjectionGrant: ID_PREFIXES.scimProjectionGrant,
  scimManagedConnection: ID_PREFIXES.scimManagedConnection,
  scimManagedCredential: ID_PREFIXES.scimManagedCredential,
  scimManagedConnectionEvent: ID_PREFIXES.scimManagedConnectionEvent,
};

export function generateAuthId({ model }: { model: string }): string {
  const prefix = MODEL_ID_PREFIX[model];
  if (!prefix) {
    console.warn(`[auth] No id prefix registered for model "${model}"; using "id_".`);
    return newId("id");
  }
  return newId(prefix);
}

/** Validates the name/slug of an organization being created or updated (absent = unchanged). */
function assertValidOrg(org: { name?: string | undefined; slug?: string | undefined }): void {
  const error =
    (org.name === undefined ? null : validateOrgName(org.name)) ??
    (org.slug === undefined ? null : validateOrgSlug(org.slug));
  if (error) throw new APIError("BAD_REQUEST", { message: error });
}

/**
 * Membership changes are frozen while a platform admin has the organization suspended, and once
 * its deletion is requested (which removes every member and invitation; this closes the races).
 */
async function assertOrgNotSuspended(organizationId: string): Promise<void> {
  const [[deletion], [suspension]] = await Promise.all([
    db
      .select({ id: schema.organizationDeletion.id })
      .from(schema.organizationDeletion)
      .where(
        and(
          eq(schema.organizationDeletion.organizationId, organizationId),
          eq(schema.organizationDeletion.status, "pending"),
        ),
      )
      .limit(1),
    db
      .select({ organizationId: schema.organizationSuspension.organizationId })
      .from(schema.organizationSuspension)
      .where(eq(schema.organizationSuspension.organizationId, organizationId))
      .limit(1),
  ]);
  if (deletion) throw new APIError("NOT_FOUND", { message: "This organization is being deleted." });
  if (suspension) throw new APIError("FORBIDDEN", { message: "This organization is suspended." });
}

/**
 * Endpoints that add, change or remove a sign-in factor. An impersonating admin must not be able
 * to enroll a factor the real user doesn't know about (or remove theirs), so these refuse
 * impersonation sessions — like live API keys (`liveKeyRestriction` in apps/web).
 */
const FACTOR_MANAGEMENT_PATHS: ReadonlySet<string> = new Set([
  "/two-factor/enable",
  "/two-factor/disable",
  "/two-factor/verify-totp", // with a session, this is the step that turns TOTP on
  "/two-factor/get-totp-uri",
  "/two-factor/generate-backup-codes",
  "/passkey/generate-register-options",
  "/passkey/verify-registration",
  "/passkey/update-passkey",
  "/passkey/delete-passkey",
]);

/**
 * Endpoints that change the account itself (profile, password, sessions, linked accounts). The
 * dashboard's account actions already refuse while impersonating; this holds for every caller.
 */
const ACCOUNT_CHANGE_PATHS: ReadonlySet<string> = new Set([
  "/update-user",
  "/change-password",
  "/change-email",
  "/set-password",
  "/delete-user",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/link-social",
  "/unlink-account",
  "/send-verification-email",
]);

/**
 * Organization plugin routes the browser calls (`authClient.organization.*`): creating an
 * organization (onboarding) and accepting an invitation. Every other organization route is closed
 * over HTTP: the dashboard calls them server-side (`auth.api.*`) after its own checks (SSO and 2FA
 * requirements, directory-managed members, the audit log), which Better Auth's routes skip.
 */
const ORGANIZATION_HTTP_PATHS: ReadonlySet<string> = new Set([
  "/organization/create",
  "/organization/accept-invitation",
]);

/** Every organization plugin route, from the plugin's own endpoint table. */
const ORGANIZATION_PATHS: readonly string[] = [
  "/organization/accept-invitation",
  "/organization/add-team-member",
  "/organization/cancel-invitation",
  "/organization/check-slug",
  "/organization/create",
  "/organization/create-role",
  "/organization/create-team",
  "/organization/delete",
  "/organization/delete-role",
  "/organization/get-active-member",
  "/organization/get-active-member-role",
  "/organization/get-full-organization",
  "/organization/get-invitation",
  "/organization/get-organization",
  "/organization/get-role",
  "/organization/has-permission",
  "/organization/invite-member",
  "/organization/leave",
  "/organization/list",
  "/organization/list-invitations",
  "/organization/list-members",
  "/organization/list-roles",
  "/organization/list-team-members",
  "/organization/list-teams",
  "/organization/list-user-invitations",
  "/organization/list-user-teams",
  "/organization/reject-invitation",
  "/organization/remove-member",
  "/organization/remove-team",
  "/organization/remove-team-member",
  "/organization/set-active",
  "/organization/set-active-team",
  "/organization/update",
  "/organization/update-member-role",
  "/organization/update-role",
  "/organization/update-team",
];

/** Organizations one user may own (platform admins are exempt; `user.ownedOrganizationLimit` overrides it). */
export const MAX_OWNED_ORGANIZATIONS = 5;
/** Pending invitations one organization may have at once. */
export const MAX_PENDING_INVITATIONS = 50;

/** Shared by every sign-up in this process, so common domains cost no DNS lookup. */
const checkMailDomain = cachedMailDomainCheck();

/**
 * Refuses disposable or undeliverable sign-up addresses before entering the account transaction.
 */
async function assertSignUpEmailAllowed(email: string): Promise<void> {
  const rejection = await signUpEmailRejection(email, {
    checkDomain: checkMailDomain,
    production: process.env.NODE_ENV === "production",
  });
  if (rejection) throw new APIError("BAD_REQUEST", rejection);
}

async function assertMailboxAvailable(email: string, executor: Executor): Promise<void> {
  const [existing] = await executor
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.canonicalEmail, canonicalEmail(email)))
    .limit(1);
  // Same answer as Better Auth's own duplicate check (sign-up email enumeration is accepted).
  if (existing) {
    throw new APIError("UNPROCESSABLE_ENTITY", {
      code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
      message: "User already exists. Use another email.",
    });
  }
}

/**
 * A new account from a Google or GitHub sign-in: the address must be one the provider verified
 * (it becomes the account's verified address), and passes the `/sign-up/email` guard and Risk.
 */
async function assertSocialSignUpAllowed(
  user: { email: string; emailVerified?: boolean },
  headers: Headers | null,
) {
  if (!user.emailVerified) {
    throw new APIError("FORBIDDEN", {
      code: "SOCIAL_EMAIL_NOT_VERIFIED",
      message: "Verify your email address with that provider first.",
    });
  }
  await assertSignUpEmailAllowed(user.email);
  await assertMailboxAvailable(user.email, db);
  await assertSignUpNotBlocked({ email: user.email, headers });
}

/**
 * A linked Google or GitHub account's picture becomes the user's when they have none: Better
 * Auth only copies it on sign-up. Runs after the account's transaction commits, and never fails
 * the sign-in or link it follows.
 */
async function adoptProviderPicture(userId: string, picture: string): Promise<void> {
  try {
    await db
      .update(schema.user)
      .set({ image: picture, updatedAt: new Date() })
      .where(and(eq(schema.user.id, userId), isNull(schema.user.image)));
  } catch (error) {
    console.error("[auth] could not adopt a provider picture", error);
  }
}

/** Origin of the dashboard, which hosts /api/auth (also the WebAuthn origin and RP ID). */
const dashboardUrl = process.env.BETTER_AUTH_URL ? new URL(process.env.BETTER_AUTH_URL) : undefined;

/**
 * Better Auth's passkey plugin verifies assertions with `requireUserVerification: false`. A
 * passkey sign-in skips the TOTP challenge, so it must prove both possession and the user
 * (biometric or PIN) — reject any ceremony the authenticator didn't user-verify.
 */
function assertUserVerified(userVerified: boolean): void {
  if (!userVerified) {
    throw new APIError("UNAUTHORIZED", {
      message: "Your passkey must verify you with a PIN, fingerprint or face to be used here.",
    });
  }
}

export const authOptions = {
  appName: "coss.com",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : [],
  database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
  advanced: {
    // Native joins (the drizzle relations in `@coss/db/schema/auth.ts`): without them Better Auth
    // loads each joined row with a query of its own, all at once — an N+1, and concurrent queries
    // on one connection inside its transactions (deprecated by pg).
    database: { generateId: generateAuthId, joins: true },
  },
  // Off: it counts per process and trusts any x-forwarded-for. The dashboard limits the credential
  // endpoints itself, in Valkey (apps/web/src/lib/auth-rate-limit.ts).
  rateLimit: { enabled: false },
  // OAuth callback failures that happen before the sign-in's own error URL is known (an expired
  // or forged state) land on the dashboard's sign-in page, not Better Auth's bare error page.
  onAPIError: { errorURL: dashboardUrl ? `${dashboardUrl.origin}/sign-in` : undefined },
  // Google and GitHub, when configured (`./social.ts`). Callbacks: /api/auth/callback/<provider>.
  socialProviders: socialProvidersFromEnv(),
  account: {
    accountLinking: {
      enabled: true,
      // Signing in with an address that already has an account links the provider to it only
      // when the provider verified the address and so did the account (Better Auth's default,
      // spelled out): an unverified password account may have been registered by someone else
      // ahead of the address's owner, who would then share it.
      requireLocalEmailVerified: true,
      // Never overwrite the profile the user chose with the provider's.
      updateUserInfoOnLink: false,
      // Connecting a provider from account settings (signed in) may use another address,
      // common with GitHub; it then signs in to this account. Implicit linking always matches.
      allowDifferentEmails: true,
    },
  },
  emailAndPassword: {
    enabled: true,
    // Prove mailbox ownership before creating a session or tenant resources. The response still
    // accepts sign-up email enumeration; the guard below already exposes duplicate accounts.
    requireEmailVerification: true,
    // `url` is Better Auth's /api/auth/reset-password/:token, which checks the token and redirects
    // to the client's `redirectTo` (the dashboard's /reset-password) with `?token=` or `?error=`.
    // Account emails are queued (`./emails.ts`) and sent by the worker through coss.com itself.
    sendResetPassword: async ({ user, url }) => {
      await enqueueAuthEmail({
        kind: "reset_password",
        to: user.email,
        userId: user.id,
        url,
        expiresAt: new Date(Date.now() + RESET_PASSWORD_LINK_TTL_S * 1000),
      });
    },
    resetPasswordTokenExpiresIn: RESET_PASSWORD_LINK_TTL_S,
    // A reset signs out every session, including any opened with the old (possibly compromised)
    // password.
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    // Off: a verification link must never create a session, which would skip the TOTP challenge.
    autoSignInAfterVerification: false,
    expiresIn: VERIFICATION_LINK_TTL_S,
    sendVerificationEmail: async ({ user, url }) => {
      // The outbox uses its own connection; enqueue after commit so concurrent sign-ups cannot
      // exhaust the pool while holding mailbox locks, or queue mail for rolled-back accounts.
      await queueAfterTransactionHook(() =>
        enqueueAuthEmail({
          kind: "verify_email",
          to: user.email,
          userId: user.id,
          url,
          expiresAt: new Date(Date.now() + VERIFICATION_LINK_TTL_S * 1000),
        }),
      );
    },
  },
  // Block these HTTP routes (server-side `auth.api.*` calls still work). API keys are only
  // created/listed/revoked through our server code so every key gets an environment binding.
  // Admin mutations go through the dashboard's server actions, which record the audit log.
  disabledPaths: [
    "/api-key/create",
    "/api-key/update",
    "/api-key/get",
    "/api-key/list",
    "/api-key/delete",
    // Organizations, members and invitations (incl. invitation emails, rate limited per
    // organization) change only through the dashboard's server actions; see above.
    ...ORGANIZATION_PATHS.filter((path) => !ORGANIZATION_HTTP_PATHS.has(path)),
    // Account settings and sessions go through the dashboard's server actions too (which refuse
    // while impersonating); /list-sessions would hand the browser every session's token, and the
    // linked-account routes an IdP's tokens.
    "/update-user",
    "/change-password",
    "/change-email",
    "/delete-user",
    "/list-sessions",
    "/revoke-session",
    "/revoke-sessions",
    "/revoke-other-sessions",
    "/update-session",
    "/list-accounts",
    "/link-social",
    "/unlink-account",
    "/get-access-token",
    "/refresh-token",
    "/account-info",
    "/admin/remove-user",
    "/admin/create-user",
    "/admin/update-user",
    "/admin/set-role",
    "/admin/set-user-password",
    "/admin/ban-user",
    "/admin/unban-user",
    "/admin/impersonate-user",
    "/admin/revoke-user-session",
    "/admin/revoke-user-sessions",
    // SSO providers are managed only by the dashboard's server actions (one per organization,
    // domains from the org's verified email domains) and platform admins. The plugin's own DNS
    // TXT verification is replaced by email domain verification (`./sso.ts`).
    "/sso/register",
    "/sso/update-provider",
    "/sso/delete-provider",
    "/sso/providers",
    "/sso/get-provider",
    "/sso/request-domain-verification",
    "/sso/verify-domain",
  ],
  user: {
    additionalFields: {
      // `canonicalEmail(email)`, set for every new user by the databaseHooks below; sign-up refuses
      // an address whose mailbox already has an account. Nullable: users from before the column
      // were backfilled by migration, and Better Auth tables never get NOT NULL columns.
      canonicalEmail: { type: "string", required: false, input: false, index: true },
      // Written only by `setOwnedOrganizationLimit` (@coss/tenancy/admin). Null: the default.
      ownedOrganizationLimit: { type: "number", required: false, input: false },
    },
  },
  session: {
    additionalFields: {
      // The SSO provider (`ssoProvider.providerId`) whose sign-in created this session, else null.
      // Set only by the databaseHooks below. An organization's SSO requirement and its 2FA
      // requirement accept sessions from its own provider (apps/web `requireOrgMember`).
      ssoProviderId: { type: "string", required: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Users created by an SSO sign-in: `resolveSsoUser` already checked that their address is
        // on a domain the organization verified, so they don't get a verification email. Users
        // created by a directory (SCIM) must be on the organization's SSO domains too.
        before: async (user, ctx) => {
          const data = { ...user, canonicalEmail: canonicalEmail(user.email) };
          if (ssoProviderIdOfPath(ctx?.path, ctx?.params)) {
            return { data: { ...data, emailVerified: true } };
          }
          if (isSocialCallbackPath(ctx?.path)) {
            await assertSocialSignUpAllowed(user, ctx?.headers ?? ctx?.request?.headers ?? null);
            return { data };
          }
          const scimOrganizationId = scimOrganizationIdOf(ctx);
          if (scimOrganizationId) {
            await assertScimEmail(scimOrganizationId, user.email);
            return { data: { ...data, emailVerified: true } };
          }
          return { data };
        },
      },
      update: {
        // A directory changing the address of a user it manages: only to another address on the
        // organization's SSO domains, which stays verified (the plugin would clear it, and SSO
        // sign-in can only link verified accounts).
        before: async (user, ctx) => {
          const scimOrganizationId = scimOrganizationIdOf(ctx);
          if (!scimOrganizationId || typeof user.email !== "string") return undefined;
          await assertScimEmail(scimOrganizationId, user.email);
          return {
            data: { ...user, canonicalEmail: canonicalEmail(user.email), emailVerified: true },
          };
        },
      },
    },
    account: {
      create: {
        before: async (account) => {
          const picture = providerPicture(account);
          const userId = account.userId;
          if (picture && typeof userId === "string") {
            await queueAfterTransactionHook(() => adoptProviderPicture(userId, picture));
          }
          return withoutProviderTokens(account);
        },
      },
      update: { before: async (account) => withoutProviderTokens(account) },
    },
    session: {
      create: {
        before: async (session, ctx) => {
          const ssoProviderId = ssoProviderIdOfPath(ctx?.path, ctx?.params);
          return { data: { ...session, ssoProviderId } };
        },
      },
      delete: {
        // `false` cancels the whole delete: SCIM only revokes the organization's SSO sessions.
        before: async (_session, ctx) => (isScimSessionSweep(ctx) ? false : undefined),
      },
    },
  },
  hooks: {
    // Leaving has no organization hook; cancel what the leaver sent (see ./invitations.ts) and
    // delete their personal API keys (./member-keys.ts).
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/organization/leave") return;
      const organizationId = ctx.body?.organizationId;
      if (typeof organizationId !== "string") return;
      await cancelStaleInvitations(organizationId);
      await revokeDepartedMemberKeys(organizationId);
    }),
    before: createAuthMiddleware(async (ctx) => {
      // Only the public sign-up: users created server-side (fixtures, seed, admins, SSO) skip it.
      if (ctx.path === "/sign-up/email") {
        if (typeof ctx.body?.email === "string") {
          await assertSignUpEmailAllowed(ctx.body.email);
          // coss.com Risk, when the dashboard registered it (`./risk.ts`): only `block` refuses.
          await assertSignUpNotBlocked({
            email: ctx.body.email,
            headers: ctx.headers ?? ctx.request?.headers ?? null,
          });
        }
        return;
      }
      if (FACTOR_MANAGEMENT_PATHS.has(ctx.path)) {
        const session = await getSessionFromCtx(ctx);
        if (session?.session.impersonatedBy) {
          throw new APIError("FORBIDDEN", {
            message:
              "Two-factor settings and passkeys can't be changed while impersonating a user.",
          });
        }
        return;
      }
      if (ACCOUNT_CHANGE_PATHS.has(ctx.path)) {
        const session = await getSessionFromCtx(ctx);
        if (session?.session.impersonatedBy) {
          throw new APIError("FORBIDDEN", {
            message: "Account settings can't be changed while impersonating a user.",
          });
        }
        return;
      }
      // Better Auth skips beforeCreateInvitation on resend, and leave has no organization hook.
      if (ctx.path !== "/organization/invite-member" && ctx.path !== "/organization/leave") return;
      const session = await getSessionFromCtx(ctx);
      if (!session) return;
      if (ctx.path === "/organization/invite-member") {
        // Invitation emails carry the org's name, so only a verified account may send them.
        if (!session.user.emailVerified) {
          throw new APIError("FORBIDDEN", {
            code: "EMAIL_NOT_VERIFIED",
            message: "Verify your email address before inviting people.",
          });
        }
        const domain = emailDomainOf(typeof ctx.body?.email === "string" ? ctx.body.email : "");
        if (domain && isDisposableDomain(domain)) {
          throw new APIError("BAD_REQUEST", DISPOSABLE_EMAIL);
        }
      }
      const organizationId =
        ctx.body?.organizationId ||
        (session.session as { activeOrganizationId?: string | null }).activeOrganizationId;
      if (typeof organizationId !== "string") return;
      const [membership] = await db
        .select({ id: schema.member.id })
        .from(schema.member)
        .where(
          and(
            eq(schema.member.organizationId, organizationId),
            eq(schema.member.userId, session.user.id),
          ),
        )
        .limit(1);
      if (membership) await assertOrgNotSuspended(organizationId);
    }),
  },
  plugins: [
    {
      id: "serialized-sign-up",
      endpoints: {
        signUpEmail: serializedEndpoint(
          signUpEmail(),
          async (ctx) =>
            typeof ctx.body?.email === "string"
              ? `auth:mailbox:${canonicalEmail(ctx.body.email)}`
              : null,
          async (ctx, tx) => assertMailboxAvailable(ctx.body.email, tx),
        ),
      },
    },
    serializedOrganization(),
    admin(),
    twoFactor({
      // Only TOTP (authenticator apps) and backup codes: there is no email/SMS OTP delivery.
      // Enabling needs the password and a verified code; disabling needs the password and a
      // fresh session. Sign-in challenges lock the account for 15 min after 10 failed codes.
      issuer: "coss.com",
    }),
    // The same challenge after Google and GitHub sign-ins.
    socialTwoFactor(),
    passkey({
      rpName: "coss.com",
      rpID: dashboardUrl?.hostname,
      origin: dashboardUrl?.origin,
      // Discoverable credentials power the "Sign in with a passkey" button and autofill.
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      registration: {
        afterVerification: ({ verification }) =>
          assertUserVerified(verification.registrationInfo?.userVerified ?? false),
      },
      authentication: {
        afterVerification: ({ verification }) =>
          assertUserVerified(verification.authenticationInfo.userVerified),
      },
    }),
    apiKey({
      // Keys belong to the organization (referenceId = organization id), not to their creator.
      references: "organization",
      requireName: true,
      maximumNameLength: API_KEY_NAME_MAX_LENGTH,
      startingCharactersConfig: { shouldStore: true, charactersLength: API_KEY_VISIBLE_CHARACTERS },
      // Built-in limiter defaults to 10 requests/day per key. Rate limiting will live in our API.
      rateLimit: { enabled: false },
      // Environment binding lives in our `environment_api_key` table (metadata is client-writable).
      enableMetadata: false,
      // Stored on every key, but only restricted keys are held to what they store: full-access
      // keys are checked against the current catalog (`environment_api_key.access`), so adding a
      // resource needs no backfill.
      permissions: { defaultPermissions: API_KEY_PERMISSIONS },
    }),
    sso({
      // `domainVerified` gates sign-in and trusted account linking. coss.com sets it (from the org's
      // verified email domains) instead of the plugin's TXT records; `resolveUser` re-checks
      // the domains on every sign-in, so a domain that is deleted or fails stops SSO at once.
      domainVerification: { enabled: true },
      resolveUser: resolveSsoUser,
      // Native just-in-time membership: first SSO sign-in joins the provider's organization.
      organizationProvisioning: { defaultRole: "member" },
      // One provider per organization is enforced by the dashboard; the limit counts per user.
      providersLimit: 100,
      saml: {
        // SAML2Int: Okta, Entra ID, Google Workspace… always send NotBefore/NotOnOrAfter.
        requireTimestamps: true,
        algorithms: { onDeprecated: "reject" },
      },
    }),
    // Directory sync at /api/auth/scim/v2 (`./scim.ts`). Connections and their bearer tokens are
    // managed only server-side (`auth.api.*SCIMManaged*`, serverOnly) from the dashboard.
    scim({
      ...scimPluginOptions,
      managedConnections: {
        credentialHashSecret: scimCredentialHashSecret(),
        maxActiveCredentials: 2,
      },
    }),
    // Cloudflare Turnstile on /sign-up/email, /sign-in/email and /request-password-reset (HTTP
    // only: `auth.api.*` calls skip it). The dashboard sends the token as `x-captcha-response`.
    // Fails closed while Cloudflare's siteverify is unreachable (passkeys and SSO still work).
    ...(process.env.TURNSTILE_SECRET_KEY
      ? [
          captcha({
            provider: "cloudflare-turnstile",
            secretKey: process.env.TURNSTILE_SECRET_KEY,
            allowedHostnames: dashboardUrl ? [dashboardUrl.hostname] : undefined,
          }),
        ]
      : []),
  ],
} satisfies BetterAuthOptions;

function serializedOrganization() {
  const plugin = organization({
    ac: orgAc,
    roles: orgRoles,
    creatorRole: "owner",
    disableOrganizationDeletion: true,
    schema: {
      organization: {
        additionalFields: {
          // Members without TOTP are sent to /settings until they set it up (apps/web
          // `requireOrgMember`). Written only by `setOrganizationTwoFactorRequired` (@coss/tenancy).
          requireTwoFactor: {
            type: "boolean",
            required: false,
            defaultValue: false,
            input: false,
          },
          // Members (not owners: break glass) need a session from the organization's SSO
          // provider (apps/web `requireOrgMember`). Written only by `setOrganizationSsoRequired`.
          requireSso: {
            type: "boolean",
            required: false,
            defaultValue: false,
            input: false,
          },
        },
      },
    },
    // Our custom generateId makes invitation ids predictable, so Better Auth requires a verified
    // email to read or accept invitations. Keep this defense independent of sign-up policy.
    requireEmailVerificationOnInvitation: true,
    invitationLimit: MAX_PENDING_INVITATIONS,
    // The organization's plan (accepting an invitation and adding members check it).
    membershipLimit: (_user, organization) => membershipLimitFor(organization.id),
    // `true` = limit reached. Counts organizations the user owns (the number option would count
    // memberships, so being invited to five organizations would block creating one's own).
    organizationLimit: async (user) => {
      if ((user as { role?: string | null }).role === "admin") return false;
      const adapter = await getCurrentAdapter(drizzleAdapter(db, { provider: "pg", schema })({}));
      const owned = await adapter.count({
        model: "member",
        where: [
          { field: "userId", value: user.id },
          { field: "role", value: "owner" },
        ],
      });
      // Read here, not from `user`: the session's copy can predate an admin's change.
      const account = await adapter.findOne<{ ownedOrganizationLimit: number | null }>({
        model: "user",
        where: [{ field: "id", value: user.id }],
        select: ["ownedOrganizationLimit"],
      });
      return owned >= (account?.ownedOrganizationLimit ?? MAX_OWNED_ORGANIZATIONS);
    },
    sendInvitationEmail: async ({ id, email, organization: org, role, invitation, inviter }) => {
      await enqueueAuthEmail({
        kind: "invitation",
        to: email,
        url: `${process.env.BETTER_AUTH_URL ?? ""}/accept-invitation/${id}`,
        expiresAt: invitation.expiresAt,
        data: {
          invitationId: id,
          organizationName: org.name,
          inviterName: inviter.user.name,
          inviterEmail: inviter.user.email,
          role,
          expiresAt: invitation.expiresAt.toISOString(),
        },
      });
    },
    organizationHooks: {
      beforeCreateOrganization: async ({ organization: org }) => {
        assertValidOrg(org);
      },
      beforeUpdateOrganization: async ({ organization: org, member }) => {
        await assertOrgNotSuspended(member.organizationId);
        assertValidOrg(org);
      },
      // The invite/update-role HTTP endpoints accept arbitrary role strings; only allow
      // canonical role names so Better Auth and `orgRoleCan` always agree on privileges.
      beforeCreateInvitation: async ({ invitation }) => {
        if (!(INVITABLE_ORG_ROLES as readonly string[]).includes(invitation.role)) {
          throw new APIError("BAD_REQUEST", { message: "Role must be admin or member." });
        }
        await assertOrgNotSuspended(invitation.organizationId);
      },
      beforeAcceptInvitation: async ({ invitation, organization: org }) => {
        await assertOrgNotSuspended(org.id);
        // Better Auth doesn't check that the inviter may still invite (see ./invitations.ts).
        if (
          !(await inviterStillAllowed({
            organizationId: org.id,
            inviterId: invitation.inviterId,
          }))
        ) {
          throw new APIError("FORBIDDEN", {
            message:
              "This invitation is no longer valid. Ask the organization to invite you again.",
          });
        }
      },
      afterRemoveMember: async ({ organization: org }) => {
        await cancelStaleInvitations(org.id);
        await revokeDepartedMemberKeys(org.id);
      },
      afterUpdateMemberRole: async ({ organization: org }) => {
        await cancelStaleInvitations(org.id);
      },
      afterAcceptInvitation: async ({ invitation, user, organization: org }) => {
        await recordOrgAudit({
          organizationId: org.id,
          actor: { type: "user", id: user.id, label: user.email },
          action: "invitation.accepted",
          target: { type: "invitation", id: invitation.id, label: invitation.email },
          metadata: { role: invitation.role },
        });
      },
      afterRejectInvitation: async ({ invitation, user, organization: org }) => {
        await recordOrgAudit({
          organizationId: org.id,
          actor: { type: "user", id: user.id, label: user.email },
          action: "invitation.rejected",
          target: { type: "invitation", id: invitation.id, label: invitation.email },
        });
      },
      // Better Auth cancels invitations in any status, which would rewrite an accepted (or
      // already canceled) one; only pending invitations can be canceled.
      beforeCancelInvitation: async ({ invitation }) => {
        await assertOrgNotSuspended(invitation.organizationId);
        if (invitation.status !== "pending") {
          throw new APIError("BAD_REQUEST", { message: "This invitation is no longer pending." });
        }
      },
      beforeRemoveMember: async ({ organization: org }) => {
        await assertOrgNotSuspended(org.id);
      },
      beforeUpdateMemberRole: async ({ newRole, organization: org }) => {
        if (!newRole.split(",").every(isOrgRole)) {
          throw new APIError("BAD_REQUEST", { message: "Unknown role." });
        }
        await assertOrgNotSuspended(org.id);
      },
    },
  });
  plugin.endpoints.createOrganization = serializedEndpoint(
    plugin.endpoints.createOrganization,
    async (ctx) => {
      const session = await getSessionFromCtx(ctx);
      const userId = session?.user.id ?? (!ctx.request && !ctx.headers ? ctx.body?.userId : null);
      return typeof userId === "string" ? `auth:org-owner:${userId}` : null;
    },
  );
  return plugin;
}
