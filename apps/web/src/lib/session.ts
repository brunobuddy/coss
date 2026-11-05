import "server-only";
import { orgAccess, SIGN_IN_PATH } from "@coss/auth/org-access";
import { type OrgPermissions, orgRoleCan } from "@coss/auth/permissions";
import { getMembership, type Membership, touchHipaaSession } from "@coss/tenancy";
import type { AdminActor } from "@coss/tenancy/admin";
import { setTag, setUser } from "@sentry/nextjs";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { ActionError, ForbiddenError } from "./actions";
import { auth, type Session } from "./auth";
import { memberCan } from "./member-can";

export type OrgContext = Membership & {
  session: Session;
  /**
   * Whether the member may do this: their role allows it and, while the organization is
   * suspended, it only reads. Use it to gate controls; actions re-check via `requireOrgPermission`.
   */
  can: (permissions: OrgPermissions) => boolean;
  /** The session came from the organization's SSO provider. */
  viaSso: boolean;
  /** An owner signed in without SSO while the organization requires it (break-glass access). */
  ssoBreakGlass: boolean;
};

/**
 * Request headers for session-bound Better Auth calls made while rendering. The Cookie header comes
 * from `cookies()`: after a server action replaces the session cookie (e.g. changing the password),
 * Next re-renders with the new cookies but the original request headers.
 */
export async function authHeaders(): Promise<Headers> {
  const requestHeaders = new Headers(await headers());
  requestHeaders.set("cookie", (await cookies()).toString());
  return requestHeaders;
}

/** The current session (deduplicated per request), or `null` when signed out. */
/**
 * The user's own unexpired sessions (tokens included: never send them to the browser). Better
 * Auth's `listSessions` endpoint needs a fresh session (signed in within a day), which would
 * break account settings for everyone else.
 */
export async function listOwnSessions(userId: string) {
  const context = await auth.$context;
  const sessions = await context.internalAdapter.listSessions(userId, { onlyActiveSessions: true });
  const now = new Date();
  return sessions.filter((session) => session.expiresAt > now) as Session["session"][];
}

export const getSession = cache(async (): Promise<Session | null> => {
  const session = await auth.api.getSession({ headers: await authHeaders() });
  // Errors reported while serving this request name the user by id only (never the email).
  if (session) setUser({ id: session.user.id });
  return session;
});

/** The current session; redirects to /sign-in when signed out. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(SIGN_IN_PATH);
  return session;
}

/**
 * Resolves the organization from the URL slug and the signed-in user's membership in it.
 * Non-members get a 404 so org slugs can't be probed. Never uses the session's active org.
 * Members are sent to /sso when the organization requires SSO and the session didn't come from
 * its provider (owners keep break-glass access), and to /settings/security when it requires two-factor
 * authentication they haven't set up (an SSO session from its provider counts instead). This
 * guards every org page, layout and server action.
 */
export const requireOrgMember = cache(async (orgSlug: string): Promise<OrgContext> => {
  const session = await requireSession();
  const membership = await getMembership({ userId: session.user.id, organizationSlug: orgSlug });
  if (!membership) notFound();
  setTag("organization_id", membership.organization.id);
  if (membership.hipaaMode) {
    // Also covers an impersonation that began before the mode was turned on.
    if (session.session.impersonatedBy) notFound();
    if ((await touchHipaaSession(session.session)) === "idle") redirect(SIGN_IN_PATH);
  }
  const access = orgAccess(membership, session);
  if (access.kind === "redirect") redirect(access.to);
  const can = memberCan(membership);
  return { session, ...membership, can, viaSso: access.viaSso, ssoBreakGlass: access.breakGlass };
});

/**
 * `requireOrgMember` plus a role check; throws `ForbiddenError` (an action error) if denied, or
 * an `ActionError` for anything but reads while the organization is suspended.
 */
export async function requireOrgPermission(
  orgSlug: string,
  permissions: OrgPermissions,
): Promise<OrgContext> {
  const context = await requireOrgMember(orgSlug);
  if (!orgRoleCan(context.member.role, permissions)) throw new ForbiddenError();
  if (!context.can(permissions)) {
    throw new ActionError("This organization is suspended, so changes are disabled.");
  }
  return context;
}

/** Platform admin (Better Auth admin plugin role; roles may be comma-joined). */
export function isPlatformAdmin(session: Session): boolean {
  return (session.user.role ?? "").split(",").some((role) => role.trim() === "admin");
}

export type AdminContext = { session: Session; actor: AdminActor };

function adminContext(session: Session): AdminContext {
  return { session, actor: { userId: session.user.id, email: session.user.email } };
}

/**
 * The signed-in platform admin, for /admin pages. Everyone else gets a 404 so the console's
 * existence isn't revealed. An impersonation session is the impersonated user's, so it fails too.
 */
export async function requirePlatformAdmin(): Promise<AdminContext> {
  const session = await requireSession();
  if (!isPlatformAdmin(session)) notFound();
  return adminContext(session);
}

/** `requirePlatformAdmin` for server actions: throws `ForbiddenError` instead of a 404. */
export async function requirePlatformAdminAction(): Promise<AdminContext> {
  const session = await getSession();
  if (!session || !isPlatformAdmin(session)) {
    throw new ForbiddenError("Only platform admins can do that.");
  }
  return adminContext(session);
}
