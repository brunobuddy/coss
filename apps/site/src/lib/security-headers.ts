import spec from "@coss/api/openapi.json";
import { DEV_API_ORIGIN } from "./site.ts";

/**
 * Response headers for every site response (next.config.ts). The site shares coss.com with the
 * dashboard: any script running here can call `/api/auth/*` and the dashboard's server actions as
 * the signed-in user. So the policy allows no script origin but this one; third-party scripts need
 * the same review as dashboard code (apps/site/AGENTS.md).
 *
 * Scripts keep 'unsafe-inline': the pages are static (served from the CDN), so there is no
 * per-request nonce, and Next's inline bootstrap/RSC scripts differ per page, so hashes would need
 * a per-page policy. Inline injection is therefore not blocked by CSP; the site renders no
 * user-supplied HTML.
 */
export function contentSecurityPolicy({ dev }: { dev: boolean }): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // `next dev` evaluates modules for fast refresh.
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    // The API reference's playground calls the API from the browser.
    "connect-src": ["'self'", ...apiOrigins({ dev }), ...(dev ? ["ws:"] : [])],
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

/** Origins the playground may call: the OpenAPI document's `servers` (plus the local API in dev). */
export function apiOrigins({ dev }: { dev: boolean }): string[] {
  const servers = (spec.servers ?? []).map((server) => new URL(server.url).origin);
  return [...new Set([...(dev ? [DEV_API_ORIGIN] : []), ...servers])];
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
