# syntax=docker/dockerfile:1.7
# SMTP relay (apps/smtp) on Bun, run from TypeScript source. Build from the repository root:
#   docker build -f apps/smtp/Dockerfile --build-arg SENTRY_RELEASE="$(git rev-parse HEAD)" .
# One image for every stage: the server reads and validates its environment when it starts
# (README.md, "Deploying to AWS").

# Keep in step with package.json (`packageManager`, `devDependencies.turbo`); infra/test checks.
ARG BUN_VERSION=1.4.2
# Base images: Docker Hub by default; deploys pass mirrors (Docker Hub limits anonymous pulls).
ARG BUN_IMAGE=oven/bun
ARG TURBO_VERSION=2.11.7

FROM ${BUN_IMAGE}:${BUN_VERSION}-slim AS bun

# The workspaces @coss/smtp needs at runtime (--production drops dev-only ones, like nodemailer used
# by tests), and their slice of bun.lock.
FROM bun AS prune
ARG TURBO_VERSION
ENV TURBO_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY . .
RUN bunx turbo@${TURBO_VERSION} prune @coss/smtp --docker --production --out-dir /pruned

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
ENV NODE_ENV=production NO_COLOR=1 SENTRY_RELEASE=${SENTRY_RELEASE} \
    SMTP_IMPLICIT_TLS_PORT=2465 SMTP_STARTTLS_PORT=2587
# Root-owned and read-only for the app. No .env exists here (.dockerignore), so Bun's automatic
# .env loading and the scripts' --env-file are no-ops: configuration comes from the task.
WORKDIR /app
COPY --from=install /app ./
USER bun
# Unprivileged ports (USER bun): the load balancer maps 465 and 587 onto them.
EXPOSE 2465 2587
# SIGTERM: stops accepting connections, finishes messages in progress, closes the pg pool.
CMD ["bun", "apps/smtp/src/index.ts"]
