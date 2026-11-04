import path from "node:path";
import { SITE_ASSET_PREFIX } from "@coss/auth/slugs";
import { sentryBuildOptions } from "@coss/observability/build";
import { SENTRY_TUNNEL_PATH } from "@coss/observability/tunnel";
import { withSentryConfig } from "@sentry/nextjs/config";
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers.ts";
import { DEV_DASHBOARD_ORIGIN } from "./src/lib/site.ts";

// Read when `next build`/`next dev` loads this file: the standalone server reuses the serialized
// result and never runs it again, so nothing stage-specific may be decided here.
const dev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  // Internal packages ship TypeScript source (no build step).
  transpilePackages: [
    "@coss/ui",
    "@coss/auth",
    "@coss/versioning",
    "@coss/retention",
    "@coss/risk",
    "@coss/billing",
    "@coss/observability",
    "@coss/ratelimit",
    "@coss/reputation",
    "@coss/sms",
    "kloq",
  ],
  // Twoslash drives the TypeScript compiler while MDX compiles; it must not be bundled.
  serverExternalPackages: ["typescript"],
  // This app is a zone of coss.com next to the dashboard (the default zone, which owns bare
  // /_next/*): its own assets live under a prefix the load balancer routes here.
  assetPrefix: SITE_ASSET_PREFIX,
  // A self-contained server (.next/standalone) for the container image, traced from the monorepo
  // root so Bun's isolated node_modules (node_modules/.bun) are copied in.
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  // Same build → same id on every instance. The image build passes the commit as
  // NEXT_DEPLOYMENT_ID, which also turns on Next's version-skew protection.
  generateBuildId: async () => process.env.NEXT_DEPLOYMENT_ID || null,
  poweredByHeader: false,
  // CI's typecheck job already runs `tsc` over this app; its build job sets SKIP_BUILD_TYPECHECK so
  // `next build` doesn't check the same project again. Image builds keep the check.
  typescript: { ignoreBuildErrors: process.env.SKIP_BUILD_TYPECHECK === "1" },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders({ dev }) },
      // Mail clients load the emails' font from another origin.
      {
        source: "/site-assets/email/:file*",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
  async rewrites() {
    return [
      // Every docs page as Markdown, for coding agents (/llms.txt links these): `<page>.md`, and
      // `/docs/index.md` for the docs home. Checked before the docs' catch-all page.
      { source: "/docs/index.md", destination: "/docs/md" },
      { source: "/docs/:path+.md", destination: "/docs/md/:path+" },
      // The product, solution and comparison pages too (/llms.txt lists them).
      { source: "/products/:slug.md", destination: "/products/md/:slug" },
      { source: "/solutions/:slug.md", destination: "/solutions/md/:slug" },
      { source: "/compare/:slug.md", destination: "/compare/md/:slug" },
      { source: "/pricing.md", destination: "/pricing/md" },
      { source: "/about.md", destination: "/about/md" },
      // In production the dashboard's zone serves /api/auth and browser monitoring on the same origin.
      ...(dev
        ? [
            { source: "/api/auth/:path*", destination: `${DEV_DASHBOARD_ORIGIN}/api/auth/:path*` },
            {
              source: SENTRY_TUNNEL_PATH,
              destination: `${DEV_DASHBOARD_ORIGIN}${SENTRY_TUNNEL_PATH}`,
            },
          ]
        : []),
    ];
  },
};

// Collections are declared with `fumadocs-mdx/macro` (src/lib/collections.ts); global MDX options
// (Shiki, Twoslash) live in source.config.ts. The macro transform only touches modules importing it.
const withMDX = createMDX();

// Injects the release and uploads source maps (with SENTRY_AUTH_TOKEN) to the dashboard's project,
// whose DSN the browser SDK gets at runtime (src/instrumentation-client.ts).
export default withSentryConfig(withMDX(nextConfig), sentryBuildOptions());
