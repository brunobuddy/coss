# syntax=docker/dockerfile:1.7
# Background worker (apps/worker) on Bun, run from TypeScript source. Build from the repository root:
#   docker build -f apps/worker/Dockerfile --build-arg SENTRY_RELEASE="$(git rev-parse HEAD)" .
# One image for every stage: the worker reads and validates its environment when it starts
# (README.md, "Deploying to AWS"). One-off tasks reuse it:
#   bun packages/db/src/migrate.ts             database migrations (before every deploy)
#   bun apps/worker/scripts/ses-bootstrap.ts   shared SES/SNS/SQS resources (needs AWS admin rights)
#   bun apps/worker/scripts/webhooks-reencrypt.ts   webhook secrets onto the newest WEBHOOK_SECRETS_KEY

# Keep in step with package.json (`packageManager`, `devDependencies.turbo`); infra/test checks.
ARG BUN_VERSION=1.4.2
# Base images: Docker Hub by default; deploys pass mirrors (Docker Hub limits anonymous pulls).
ARG BUN_IMAGE=oven/bun
ARG TURBO_VERSION=2.11.7

FROM ${BUN_IMAGE}:${BUN_VERSION}-slim AS bun

# The workspaces @coss/worker needs at runtime (--production drops the test fixtures and the SDK),
# and their slice of bun.lock. packages/db brings its migrations.
FROM bun AS prune
ARG TURBO_VERSION
ENV TURBO_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY . .
RUN bunx turbo@${TURBO_VERSION} prune @coss/worker --docker --production --out-dir /pruned

FROM bun AS install
WORKDIR /app
COPY --from=prune /pruned/json/ .
RUN bun install --frozen-lockfile --production
COPY --from=prune /pruned/full/ .

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
ENV NODE_ENV=production NO_COLOR=1 SENTRY_RELEASE=${SENTRY_RELEASE}
# Root-owned and read-only for the app. No .env exists here (.dockerignore), so Bun's automatic
# .env loading and the scripts' --env-file are no-ops: configuration comes from the task.
WORKDIR /app
COPY --from=install /app ./
USER bun
# SIGTERM: ends the SQS long poll, lets each loop finish its current item, closes the pg pool.
CMD ["bun", "apps/worker/src/index.ts"]
