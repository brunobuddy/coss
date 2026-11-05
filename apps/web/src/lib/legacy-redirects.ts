/**
 * URLs from before the site had `/products` and `/solutions`, which still rank or have links. They
 * fall through to this zone (the dashboard), so they redirect here rather than in the site. Every
 * source must be a reserved organization slug: a redirect runs before the proxy and would hide an
 * organization's pages (`test/legacy-redirects.test.ts`).
 */
export const LEGACY_REDIRECTS = [
  { source: "/scheduling", destination: "/products/scheduling" },
  { source: "/email", destination: "/products/email" },
  { source: "/sms", destination: "/products/sms" },
  { source: "/calendar", destination: "/kloq" },
  { source: "/notifications", destination: "/solutions/notifications" },
  { source: "/auth", destination: "/solutions/authentication" },
] as const;
