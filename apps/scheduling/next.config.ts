// Order matters: load the root .env, then validate it (t3-env throws on missing variables).
import "./load-root-env.ts";
import "./src/env.ts";
import path from "node:path";
import { sentryBuildOptions } from "@coss/observability/build";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Internal packages ship TypeScript source (no build step).
  transpilePackages: [
    "@coss/ui",
    "@coss/billing",
    "@coss/db",
    "@coss/email-layout",
    "@coss/logs",
    "@coss/observability",
    "@coss/push",
    "@coss/retention",
    "@coss/scheduling",
    "@coss/versioning",
    "@coss/webhooks",
  ],
  serverExternalPackages: ["ical.js", "fast-xml-parser"],
  // A self-contained server (.next/standalone) for the container image, traced from the monorepo
  // root so Bun's isolated node_modules (node_modules/.bun) are copied in.
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  // Same build → same id on every instance (the image build passes the commit).
  generateBuildId: async () => process.env.NEXT_DEPLOYMENT_ID || null,
  poweredByHeader: false,
  // CI's typecheck job already runs `tsc` over this app; its build job sets SKIP_BUILD_TYPECHECK.
  typescript: { ignoreBuildErrors: process.env.SKIP_BUILD_TYPECHECK === "1" },
};

// Injects the release and uploads source maps (with SENTRY_AUTH_TOKEN).
export default withSentryConfig(nextConfig, sentryBuildOptions());
