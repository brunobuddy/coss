# syntax=docker/dockerfile:1.7
# Dashboard (apps/web): the Next.js standalone server on Node. Build from the repository root:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_DEPLOYMENT_ID="$(git rev-parse HEAD)" \
#     --secret id=sentry_auth_token,env=SENTRY_AUTH_TOKEN .
# The Sentry token (optional) uploads source maps to Sentry; they are deleted from the image.
# One image for every stage: nothing stage-specific is built in; the server reads and validates its
# environment when it starts (README.md, "Deploying to AWS").

# Keep in step with package.json (`packageManager`, `devDependencies.turbo`); infra/test checks.
ARG BUN_VERSION=1.4.2
# Base images: Docker Hub by default; deploys pass mirrors (Docker Hub limits anonymous pulls).
ARG BUN_IMAGE=oven/bun
ARG NODE_VERSION=24
ARG NODE_IMAGE=node
ARG TURBO_VERSION=2.11.7

FROM ${BUN_IMAGE}:${BUN_VERSION}-slim AS bun

# A partial monorepo with only the workspaces @coss/web needs, and their slice of bun.lock.
FROM bun AS prune
ARG TURBO_VERSION
ENV TURBO_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY . .
RUN bunx turbo@${TURBO_VERSION} prune @coss/web --docker --out-dir /pruned

# Next builds on Node; Bun installs. The install layer is reused until a manifest or the lockfile changes.
FROM ${NODE_IMAGE}:${NODE_VERSION}-slim AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
ENV TURBO_TELEMETRY_DISABLED=1 NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY --from=prune /pruned/json/ .
RUN bun install --frozen-lockfile
COPY --from=prune /pruned/full/ .
# The commit: Next's build id and version-skew protection (deploymentId). Not stage-specific.
ARG NEXT_DEPLOYMENT_ID=""
ENV NEXT_DEPLOYMENT_ID=${NEXT_DEPLOYMENT_ID} SKIP_ENV_VALIDATION=1
# The commit is also the Sentry release. The token is a BuildKit secret: never in a layer.
RUN --mount=type=secret,id=sentry_auth_token,required=false \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" \
    bun x turbo run build --filter=@coss/web

# Only the traced server (.next/standalone keeps Bun's isolated node_modules as relative symlinks)
# and the static assets. No package manager, no sources.
FROM ${NODE_IMAGE}:${NODE_VERSION}-slim AS runtime
# Debian's security fixes, refreshed weekly by BASE_PATCH_WEEK; nothing here runs Perl.
ARG BASE_PATCH_WEEK=""
RUN DEBIAN_FRONTEND=noninteractive apt-get update -qq \
  && DEBIAN_FRONTEND=noninteractive apt-get -y -qq upgrade \
  && dpkg --purge --force-remove-essential --force-depends perl-base \
  && rm -rf /var/lib/apt/lists/*
# Postgres TLS: DATABASE_URL=…?sslmode=verify-full&sslrootcert=/etc/ssl/certs/rds-global-bundle.pem
# The directory first: ADD would create missing parents with the file's mode (644), and Node
# exits when /etc/ssl exists but can't be read (its OpenSSL config is looked up there).
RUN mkdir -p /etc/ssl/certs
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    TLS_PORT=4000 \
    KEEP_ALIVE_TIMEOUT=75000
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY infra/runtime/tls-entry.mjs ./tls-entry.mjs
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
# Next writes its cache under .next at runtime; everything else stays root-owned and read-only.
RUN mkdir -p apps/web/.next/cache && chown node:node apps/web/.next/cache
USER node
EXPOSE 3000 4000
# SIGTERM: Next stops accepting connections and finishes in-flight requests before exiting.
CMD ["node", "tls-entry.mjs", "apps/web/server.js"]
