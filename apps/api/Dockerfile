# syntax=docker/dockerfile:1.7
# Public API (apps/api): Hono on Bun, run from TypeScript source. Build from the repository root:
#   docker build -f apps/api/Dockerfile --build-arg SENTRY_RELEASE="$(git rev-parse HEAD)" .
# One image for every stage: the server reads and validates its environment when it starts
# (README.md, "Deploying to AWS"). One-off tasks reuse it, e.g. the first platform admin:
#   bun packages/tenancy/scripts/create-admin.ts --email you@example.com

# Keep in step with package.json (`packageManager`, `devDependencies.turbo`); infra/test checks.
ARG BUN_VERSION=1.4.2
# Base images: Docker Hub by default; deploys pass mirrors (Docker Hub limits anonymous pulls).
ARG BUN_IMAGE=oven/bun
ARG NODE_VERSION=24
ARG NODE_IMAGE=node
ARG TURBO_VERSION=2.11.7

FROM ${BUN_IMAGE}:${BUN_VERSION}-slim AS bun

# The workspaces @coss/api needs at runtime (--production drops dev-only ones, like the CLI used by
# contract tests), and their slice of bun.lock.
FROM bun AS prune
ARG TURBO_VERSION
ENV TURBO_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY . .
RUN bunx turbo@${TURBO_VERSION} prune @coss/api --docker --production --out-dir /pruned
RUN bunx turbo@${TURBO_VERSION} prune coss-mcp --docker --out-dir /pruned-mcp

# The hosted MCP server: coss-mcp and the SDK under it are the two workspaces that run from built
# output, since they're published that way. They build with their dev dependencies, on Node like the
# dashboard's copy of the SDK, and only their dist reaches the image.
FROM ${NODE_IMAGE}:${NODE_VERSION}-slim AS build-mcp
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
ENV TURBO_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY --from=prune /pruned-mcp/json/ .
RUN bun install --frozen-lockfile
COPY --from=prune /pruned-mcp/full/ .
RUN bun x turbo run build --filter=coss-mcp

FROM bun AS install
WORKDIR /app
COPY --from=prune /pruned/json/ .
RUN bun install --frozen-lockfile --production
COPY --from=prune /pruned/full/ .
COPY --from=build-mcp /repo/packages/sdk/dist packages/sdk/dist
COPY --from=build-mcp /repo/packages/mcp/dist packages/mcp/dist

FROM bun AS runtime
# Debian's security fixes, refreshed weekly by BASE_PATCH_WEEK; nothing here runs Perl.
ARG BASE_PATCH_WEEK=""
RUN DEBIAN_FRONTEND=noninteractive apt-get update -qq \
  && DEBIAN_FRONTEND=noninteractive apt-get -y -qq upgrade \
  && dpkg --purge --force-remove-essential --force-depends perl-base \
  && rm -rf /var/lib/apt/lists/*
# The commit: Sentry's release. Not stage-specific.
ARG SENTRY_RELEASE=""
# Postgres TLS: DATABASE_URL=…?sslmode=verify-full&sslrootcert=/etc/ssl/certs/rds-global-bundle.pem
# The directory first: ADD would create missing parents with the file's mode (644), and Node
# exits when /etc/ssl exists but can't be read (its OpenSSL config is looked up there).
RUN mkdir -p /etc/ssl/certs
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
ENV NODE_ENV=production NO_COLOR=1 SENTRY_RELEASE=${SENTRY_RELEASE} API_PORT=3001
# Root-owned and read-only for the app. No .env exists here (.dockerignore), so Bun's automatic
# .env loading and the scripts' --env-file are no-ops: configuration comes from the task.
WORKDIR /app
COPY --from=install /app ./
COPY infra/runtime/tls-entry.mjs ./tls-entry.mjs
USER bun
ENV TLS_PORT=4001
EXPOSE 3001 4001
# SIGTERM: stops accepting connections, finishes in-flight requests, closes the pg pool.
CMD ["bun", "tls-entry.mjs", "apps/api/src/index.ts"]
