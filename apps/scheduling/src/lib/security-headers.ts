/**
 * Response headers of every page (set by src/proxy.ts, per request). The app runs on its own
 * registrable domain, so no cookie or script of coss.com ever reaches it, and it sets no cookies.
 * Two parts are per request: `frame-ancestors`, the origins a session's environment allows to embed
 * it, and `connect-src`, which is the client API and nothing else.
 */
export function contentSecurityPolicy(opts: {
  dev: boolean;
  frameAncestors: readonly string[];
  apiOrigin: string | null;
}): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(opts.dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:"],
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      ...(opts.apiOrigin ? [opts.apiOrigin] : []),
      ...(opts.dev ? ["ws:"] : []),
    ],
    "frame-ancestors": opts.frameAncestors.length > 0 ? [...opts.frameAncestors] : ["'none'"],
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    ...(opts.dev ? {} : { "upgrade-insecure-requests": [] }),
  };
  return Object.entries(directives)
    .map(([name, values]) => [name, ...values].join(" "))
    .join("; ");
}

export function securityHeaders(opts: {
  dev: boolean;
  frameAncestors: readonly string[];
  apiOrigin: string | null;
}): Record<string, string> {
  return {
    "Content-Security-Policy": contentSecurityPolicy(opts),
    // CSP's frame-ancestors governs framing; X-Frame-Options can't express an allow-list.
    "X-Content-Type-Options": "nosniff",
    // These URLs carry the session id; never send them anywhere.
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cache-Control": "no-store",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  };
}
