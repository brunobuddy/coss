/**
 * Response headers for every dashboard page (next.config.ts). The dashboard shares coss.com with
 * the site, so these also guard what the site could do to it: no framing, and no script origin
 * other than this one and Cloudflare Turnstile's.
 *
 * Scripts keep 'unsafe-inline': Next inlines its bootstrap and RSC payload scripts, and nonces
 * would need the proxy to render every page dynamically. The policy still blocks every other
 * third-party script origin, plugins, framing and form posts elsewhere.
 */

/** Cloudflare Turnstile's script and challenge iframe (sign-up, sign-in, password reset). */
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

export function contentSecurityPolicy({ dev }: { dev: boolean }): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // `next dev` evaluates modules for fast refresh.
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      TURNSTILE_ORIGIN,
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    // The email preview is a srcdoc iframe, which inherits this policy: customers' emails load
    // https images and fonts (its own CSP, PREVIEW_HEAD, blocks everything else).
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:", "https:"],
    "connect-src": ["'self'", ...(dev ? ["ws:"] : [])],
    "frame-src": ["'self'", TURNSTILE_ORIGIN],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    ...(dev ? {} : { "upgrade-insecure-requests": [] }),
  };
  return Object.entries(directives)
    .map(([name, values]) => [name, ...values].join(" "))
    .join("; ");
}

export function securityHeaders({ dev }: { dev: boolean }): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy({ dev }) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ];
}

/**
 * Received emails' raw messages and attachments: third-party files served from the dashboard's
 * origin. Always downloads (the route handlers set `attachment` + `nosniff`); this policy also
 * sandboxes them should a browser render one anyway. Config-level headers replace a route's own,
 * so it is applied in `next.config.ts`, after the default policy.
 */
export const RECEIVED_CONTENT_PATHS = [
  "/:orgSlug/:projectSlug/:envSlug/email/received/:receivedId/raw",
  "/:orgSlug/:projectSlug/:envSlug/email/received/:receivedId/attachments/:attachmentId",
  "/:orgSlug/support/attachments/:attachmentId",
  "/admin/support/attachments/:attachmentId",
];

export const RECEIVED_CONTENT_CSP = "sandbox; default-src 'none'";

/**
 * Organization logos: images from the organization's own website (SVG included), served from the
 * dashboard's origin. Sandboxed with no scripts should one be opened directly; inline styles stay,
 * since many SVG logos style themselves (light and dark variants).
 */
export const LOGO_PATH = "/:orgSlug/settings/logo";

export const LOGO_CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:";
