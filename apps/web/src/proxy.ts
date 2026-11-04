import { DASHBOARD_PATH } from "@coss/auth/slugs";
import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { clientIpFromForwardedFor } from "@/lib/client-ip";
import {
  answersNotFoundWhenSignedOut,
  NOT_FOUND_HEADERS,
  notFoundDocument,
} from "@/lib/signed-out";

/**
 * Reachable without a session cookie. /accept-invitation and /sso render their own signed-out state;
 * /api/health is the load balancer's health check; /api/monitoring relays browser errors to Sentry
 * (signed-out pages and the site report too); /api/billing/webhook takes Stripe's (signed) events;
 * /api/mobile is the iOS app's API (bearer tokens, checked by each handler); /api/cli/v1/token is
 * where `coss login` exchanges its one-time code (PKCE).
 */
const PUBLIC_PATH_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/sso",
  "/api/auth",
  "/api/health",
  "/api/monitoring",
  "/api/billing/webhook",
  "/api/mobile",
  "/api/cli",
  "/accept-invitation",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Behind `TRUSTED_PROXY_HOPS` proxies (CloudFront → ALB: 2), replaces `X-Forwarded-For` with the
 * one client address those proxies vouch for, so Better Auth (which only trusts a single-value
 * header) rate-limits and records sessions per client. `undefined` when no proxy is configured.
 */
function trustedRequestHeaders(request: NextRequest): Headers | undefined {
  if (env.TRUSTED_PROXY_HOPS === 0) return undefined;
  const headers = new Headers(request.headers);
  const ip = clientIpFromForwardedFor(headers.get("x-forwarded-for"), env.TRUSTED_PROXY_HOPS);
  // Not an IP, so nothing downstream trusts it (and Next won't replace it with the proxy's address).
  headers.set("x-forwarded-for", ip ?? "unknown");
  return headers;
}

/**
 * Optimistic gate: only checks that a session cookie exists (no database call). Every layout,
 * page and server action still verifies the session itself.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname) || getSessionCookie(request)) {
    const headers = trustedRequestHeaders(request);
    return headers ? NextResponse.next({ request: { headers } }) : NextResponse.next();
  }

  const signIn = new URL("/sign-in", request.url);
  if (pathname !== DASHBOARD_PATH) signIn.searchParams.set("next", `${pathname}${search}`);
  if (answersNotFoundWhenSignedOut({ method: request.method, pathname })) {
    return new NextResponse(notFoundDocument(`${signIn.pathname}${signIn.search}`), {
      status: 404,
      headers: NOT_FOUND_HEADERS,
    });
  }
  return NextResponse.redirect(signIn);
}

export const config = {
  // Skip Next internals and the two root files `next dev` proxies to the site. Paths with dots go
  // through like any other: the dashboard has no public/ folder, and their X-Forwarded-For must be
  // replaced too (rate limits, sessions and audit events read it).
  matcher: ["/((?!_next/static/|_next/image|favicon\\.ico$|icon\\.svg$).*)"],
};
