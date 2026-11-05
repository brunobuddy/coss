import "server-only";
// The base instance: the dashboard's (with `nextCookies()`) would put refreshed session cookies on
// the app's responses.
import { auth } from "@coss/auth";
import { mobileSessionHeaders } from "@coss/auth/mobile";
import { orgAccess } from "@coss/auth/org-access";
import { type OrgPermissions, orgRoleCan } from "@coss/auth/permissions";
import type { MobileErrorBody, MobileErrorCode } from "@coss/companion";
import { getEnvironment, getMembership, type Membership, touchHipaaSession } from "@coss/tenancy";
import { setTag, setUser } from "@sentry/nextjs";
import { memberCan } from "./member-can";
import { rateLimitRuntime } from "./rate-limit-runtime";

export type MobileSession = typeof auth.$Infer.Session;

export type MobileOrgContext = Membership & {
  session: MobileSession;
  can: (permissions: OrgPermissions) => boolean;
};

export class MobileApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: MobileErrorCode,
    message: string,
    readonly extra: { url?: string; retryAfterS?: number } = {},
  ) {
    super(message);
  }
}

const NO_STORE = { "Cache-Control": "no-store" };

export function mobileErrorResponse(error: MobileApiError): Response {
  const body: MobileErrorBody = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.extra.url && { url: error.extra.url }),
    },
  };
  const headers = new Headers(NO_STORE);
  if (error.extra.retryAfterS) headers.set("Retry-After", String(error.extra.retryAfterS));
  return Response.json(body, { status: error.status, headers });
}

/** Wraps a handler: JSON responses that are never cached, errors as `MobileErrorBody`. */
export function mobileRoute<Context>(
  handler: (request: Request, context: Context) => Promise<unknown>,
): (request: Request, context: Context) => Promise<Response> {
  return async (request, context) => {
    try {
      return Response.json(await handler(request, context), { headers: NO_STORE });
    } catch (error) {
      if (error instanceof MobileApiError) return mobileErrorResponse(error);
      console.error("[mobile-api] request failed", error);
      return mobileErrorResponse(
        new MobileApiError(500, "internal_error", "Something went wrong."),
      );
    }
  };
}

/** The `after` cursor of a paged list (ids are short; anything longer is no cursor). */
export function cursorParam(request: Request): string | undefined {
  const after = new URL(request.url).searchParams.get("after");
  return after && after.length <= 64 ? after : undefined;
}

export function bearerToken(request: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  return match?.[1] ?? null;
}

export async function chargeRateLimit(bucket: "mobile.api" | "mobile.token.ip", subject: string) {
  const decision = await rateLimitRuntime().limiter.consume({ buckets: [bucket], subject });
  if (decision.allowed) return;
  throw new MobileApiError(429, "rate_limited", "Too many requests. Try again shortly.", {
    retryAfterS: Math.max(1, Math.ceil((decision.retryAfterMs ?? 60_000) / 1000)),
  });
}

export async function requireMobileSession(request: Request): Promise<MobileSession> {
  const token = bearerToken(request);
  const headers = token
    ? await mobileSessionHeaders(token, request.headers.get("user-agent"))
    : null;
  const session = headers ? await auth.api.getSession({ headers }) : null;
  if (!session)
    throw new MobileApiError(401, "unauthorized", "Your session has ended. Sign in again.");
  setUser({ id: session.user.id });
  await chargeRateLimit("mobile.api", session.user.id);
  return session;
}

/**
 * `requireOrgMember` for the app: non-members get a 404, and an organization's SSO or two-factor
 * requirement a 403 naming the dashboard page that resolves it.
 */
export async function requireMobileOrgMember(
  request: Request,
  orgSlug: string,
): Promise<MobileOrgContext> {
  const session = await requireMobileSession(request);
  const membership = await getMembership({ userId: session.user.id, organizationSlug: orgSlug });
  if (!membership) throw new MobileApiError(404, "not_found", "Organization not found.");
  setTag("organization_id", membership.organization.id);
  if (membership.hipaaMode && (await touchHipaaSession(session.session)) === "idle") {
    throw new MobileApiError(401, "unauthorized", "Your session has ended. Sign in again.");
  }
  const access = orgAccess(membership, session);
  if (access.kind === "redirect") {
    throw access.to.startsWith("/sso")
      ? new MobileApiError(403, "sso_required", "This organization requires single sign-on.", {
          url: access.to,
        })
      : new MobileApiError(
          403,
          "two_factor_required",
          "This organization requires two-factor authentication.",
          { url: access.to },
        );
  }
  return { session, ...membership, can: memberCan(membership) };
}

export function requireMobilePermission(context: MobileOrgContext, permissions: OrgPermissions) {
  if (!context.can(permissions)) {
    throw new MobileApiError(403, "forbidden", "Your role can't see this.");
  }
}

/** `requireOrgPermission` for the app's few changes: the role, then the suspension. */
export function requireMobileWrite(context: MobileOrgContext, permissions: OrgPermissions) {
  if (!orgRoleCan(context.member.role, permissions)) {
    throw new MobileApiError(403, "forbidden", "Your role can't do this.");
  }
  if (!context.can(permissions)) {
    throw new MobileApiError(
      403,
      "forbidden",
      "This organization is suspended, so changes are disabled.",
    );
  }
}

export async function requireMobileEnvironment(
  request: Request,
  params: { orgSlug: string; projectSlug: string; envSlug: string },
  permissions: OrgPermissions,
) {
  const context = await requireMobileOrgMember(request, params.orgSlug);
  requireMobilePermission(context, permissions);
  const found = await getEnvironment({
    organizationId: context.organization.id,
    projectSlug: params.projectSlug,
    envSlug: params.envSlug,
  });
  if (!found) throw new MobileApiError(404, "not_found", "Environment not found.");
  return {
    ...context,
    ...found,
    scope: { organizationId: context.organization.id, environmentId: found.environment.id },
  };
}
