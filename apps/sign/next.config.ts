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
    "@coss/db",
    "@coss/email-layout",
    "@coss/logs",
    "@coss/observability",
    "@coss/push",
    "@coss/ratelimit",
    "@coss/retention",
    "@coss/sign",
    "@coss/versioning",
    "@coss/webhooks",
  ],
  // pdf.js (and pdf-lib, through @coss/sign) are plain npm packages: Node loads them as they are.
  serverExternalPackages: ["pdfjs-dist", "pdf-lib"],
  // A self-contained server (.next/standalone) for the container image, traced from the monorepo
  // root so Bun's isolated node_modules (node_modules/.bun) are copied in.
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  // pdf.js's data files, served by /pdfjs/<folder>/<file> (nothing imports them, so tracing
  // wouldn't copy them).
  outputFileTracingIncludes: {
    "/pdfjs/**": ["cmaps", "standard_fonts", "iccs", "wasm"].map(
      (folder) => `../../node_modules/.bun/pdfjs-dist@*/node_modules/pdfjs-dist/${folder}/**`,
    ),
  },
  // Same build → same id on every instance (the image build passes the commit).
  generateBuildId: async () => process.env.NEXT_DEPLOYMENT_ID || null,
  poweredByHeader: false,
  experimental: {
    // `src/proxy.ts` runs on every request, and Next buffers bodies for it only up to this (10 MB
    // by default, then truncates): the builder's uploads take up to 36 MB (builder-api.ts).
    proxyClientMaxBodySize: "37mb",
  },
  // CI's typecheck job already runs `tsc` over this app; its build job sets SKIP_BUILD_TYPECHECK.
  typescript: { ignoreBuildErrors: process.env.SKIP_BUILD_TYPECHECK === "1" },
};

// Injects the release and uploads source maps (with SENTRY_AUTH_TOKEN).
export default withSentryConfig(nextConfig, sentryBuildOptions());
