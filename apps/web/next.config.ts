// Order matters: load the root .env, then validate it (t3-env throws on missing variables).
import "./load-root-env.ts";
import "./src/env.ts";
import path from "node:path";
import { DASHBOARD_PATH } from "@coss/auth/slugs";
import { sentryBuildOptions } from "@coss/observability/build";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import {
  LOGO_CSP,
  LOGO_PATH,
  RECEIVED_CONTENT_CSP,
  RECEIVED_CONTENT_PATHS,
  securityHeaders,
} from "./src/lib/security-headers.ts";

// Read when `next build`/`next dev` loads this file: the standalone server reuses the serialized
// result and never runs it again, so nothing stage-specific may be decided here.
const dev = process.env.NODE_ENV === "development";

/** apps/site in `next dev` (in production the load balancer routes its paths on coss.com). */
const DEV_SITE_ORIGIN = "http://localhost:3002";

const nextConfig: NextConfig = {
  // Internal packages ship TypeScript source (no build step).
  transpilePackages: [
    "@coss/ui",
    "@coss/auth",
    "@coss/tenancy",
    "@coss/reputation",
    "@coss/db",
    "@coss/email",
    "@coss/logs",
    "@coss/webhooks",
    "@coss/hooks",
    "@coss/ratelimit",
    "@coss/screening",
    "@coss/versioning",
    "@coss/retention",
    "@coss/signals",
    "@coss/risk",
    "@coss/observability",
    "@coss/billing",
    "@coss/companion",
    "@coss/dashboard-routes",
    "@coss/push",
    "@coss/sms",
    "@coss/migrate",
    "@coss/sign",
    "@coss/verify",
    "@coss/forms",
    "@coss/notifications",
    "@coss/email-layout",
  ],
  // pdf.js and pdf-lib (through @coss/sign) are plain npm packages: Node loads them as they are.
  serverExternalPackages: ["pdfjs-dist", "pdf-lib"],
  // A self-contained server (.next/standalone) for the container image. Tracing starts at the
  // monorepo root so workspace packages and Bun's isolated node_modules (node_modules/.bun) are
  // copied in; Next runs from cwd = apps/web, which next.config compiles relative to.
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
      // Later rules win for the same header: received emails' files never run in our origin.
      ...RECEIVED_CONTENT_PATHS.map((source) => ({
        source,
        headers: [{ key: "Content-Security-Policy", value: RECEIVED_CONTENT_CSP }],
      })),
      { source: LOGO_PATH, headers: [{ key: "Content-Security-Policy", value: LOGO_CSP }] },
    ];
  },
  async redirects() {
    // In production `/` is the site's landing page. Locally, the dashboard's port opens the dashboard.
    // The docs are the site's (`/docs` in ZONE_ROUTES); locally it runs on its own port.
    if (!dev) return [];
    return [
      { source: "/", destination: DASHBOARD_PATH, permanent: false },
      { source: "/docs/:path*", destination: `${DEV_SITE_ORIGIN}/docs/:path*`, permanent: false },
      // The site's legal pages (linked from sign-up), on its own port locally.
      { source: "/legal/:path*", destination: `${DEV_SITE_ORIGIN}/legal/:path*`, permanent: false },
    ];
  },
  async rewrites() {
    // The site owns the icon (see ZONE_ROUTES); locally it runs on its own port.
    if (!dev) return [];
    return [{ source: "/icon.svg", destination: `${DEV_SITE_ORIGIN}/icon.svg` }];
  },
  experimental: {
    // Suppression CSV imports upload up to 2 MB (`import-limits.ts`) plus multipart overhead.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

// Injects the release, uploads source maps (with SENTRY_AUTH_TOKEN) and instruments the server.
// Sentry itself is configured at runtime: src/instrumentation.ts and src/instrumentation-client.ts.
export default withSentryConfig(nextConfig, sentryBuildOptions());
