import { DASHBOARD_PATH } from "@coss/auth/slugs";

/**
 * The dashboard's own top-level pages (and its API): a signed-out request for one of these is
 * always answered with a redirect to sign in. Everything else could be an organization's page or
 * nothing at all, which only the database knows.
 */
const DASHBOARD_PATH_PREFIXES = [
  DASHBOARD_PATH,
  "/settings",
  "/admin",
  "/onboarding",
  "/app",
  "/api",
];

/**
 * A signed-out GET of a path that isn't one of the dashboard's own answers 404, so search engines
 * don't treat a mistyped or dead URL as a redirect to /sign-in. Real and made-up organizations get
 * the same answer (no database call, and nothing to enumerate slugs with), and a browser still
 * lands on sign-in through `notFoundDocument`'s refresh. That covers client-side navigations too:
 * Next hides `rsc` from the proxy, and its router loads the URL as a document when a response isn't
 * a flight payload. Other methods (server actions) keep the redirect.
 */
export function answersNotFoundWhenSignedOut({
  method,
  pathname,
}: {
  method: string;
  pathname: string;
}): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  return !DASHBOARD_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Takes the path and query of the sign-in URL (`URLSearchParams` percent-encodes `next`). */
export function notFoundDocument(signInPath: string): string {
  const href = signInPath.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${href}"><title>Not found · coss.com</title></head><body><p><a href="${href}">Sign in to continue</a></p></body></html>`;
}

/** The same `Cache-Control` as Next's own 404s: CloudFront doesn't keep these for the next visitor. */
export const NOT_FOUND_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
};
