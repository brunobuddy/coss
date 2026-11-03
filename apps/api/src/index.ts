/** Server entry: `bun src/index.ts`. Validates the environment, serves the API, drains on SIGTERM. */

// First: monitoring must be set up before the server starts.
import "./instrument.ts";
import { createPlanGate, createUsageGate, planRateLimits } from "@coss/billing";
import { closeDb } from "@coss/db";
import { startJobBoss } from "@coss/db/jobs";
import { createEmailService, notificationEnvironment } from "@coss/email";
import { ensureEmailDispatchQueues, pgBossDispatchQueue } from "@coss/email/dispatch";
import { linkKeysFromEnv } from "@coss/email/runtime";
import { formsStoreFromEnv } from "@coss/forms/runtime";
import { createLogWriter } from "@coss/logs";
import { createRateLimitRuntime } from "@coss/ratelimit";
import { createRiskDeps, riskHashKeyFromEnv } from "@coss/risk/runtime";
import { schedulingCalendarAppsFromEnv, schedulingDataKeysFromEnv } from "@coss/scheduling/runtime";
import { createSignService } from "@coss/sign";
import { signStoreFromEnv } from "@coss/sign/runtime";
import { createSmsService } from "@coss/sms";
import { ensureSmsDispatchQueue, pgBossSmsDispatchQueue } from "@coss/sms/dispatch";
import { verifyCodeKey } from "@coss/verify";
import { parseSecretsKeys } from "@coss/webhooks";
import * as Sentry from "@sentry/bun";
import { createApp } from "./app.ts";
import { env } from "./env.ts";
import { createDefaultEmailRuntime } from "./runtime.ts";
import { startServer } from "./server.ts";

const publicUrl = env.API_PUBLIC_URL ?? `http://localhost:${env.API_PORT}`;
if (!env.NOTIFICATIONS_ENVIRONMENT_ID !== !env.NOTIFICATIONS_FROM) {
  throw new Error("Set both NOTIFICATIONS_ENVIRONMENT_ID and NOTIFICATIONS_FROM, or neither.");
}
if (!env.VERIFY_SMS_ENVIRONMENT_ID !== !env.VERIFY_SMS_FROM?.length) {
  throw new Error("Set both VERIFY_SMS_ENVIRONMENT_ID and VERIFY_SMS_FROM, or neither.");
}
// coss.com's own environments: its email sender and its shared numbers (Verify), both of its own
// organization, which plans and caps never limit.
const cossEnvironment = env.NOTIFICATIONS_ENVIRONMENT_ID
  ? await notificationEnvironment(env.NOTIFICATIONS_ENVIRONMENT_ID)
  : null;
const verifySmsEnvironment = env.VERIFY_SMS_ENVIRONMENT_ID
  ? await notificationEnvironment(env.VERIFY_SMS_ENVIRONMENT_ID)
  : null;
if (
  cossEnvironment &&
  verifySmsEnvironment &&
  cossEnvironment.organizationId !== verifySmsEnvironment.organizationId
) {
  throw new Error(
    "VERIFY_SMS_ENVIRONMENT_ID must be an environment of coss.com's own organization.",
  );
}
const systemOrganizationId =
  cossEnvironment?.organizationId ?? verifySmsEnvironment?.organizationId ?? null;
// Plans: features and resource limits, Free's capped allowance, and plan rate limits.
const plans = createPlanGate({ systemOrganizationId });
const email = createDefaultEmailRuntime(env, { plans });
// Sends only enqueue (the worker dispatches).
const jobs = await startJobBoss();
await ensureEmailDispatchQueues(jobs);
await ensureSmsDispatchQueue(jobs);
const rateLimits = createRateLimitRuntime(env, {
  planRules: (organizationId) => planRateLimits(organizationId),
});
await rateLimits.ready();
const logWriter = createLogWriter();
const secretsKeys = parseSecretsKeys(env.WEBHOOK_SECRETS_KEY);
// Ends open long polls (`coss listen`) when draining starts, so they don't hold the drain up.
const shutdown = new AbortController();
// Marketing email's links: the preference center is served here, under the tracking host.
const linkKeys = linkKeysFromEnv(env);
const trackingUrl = env.TRACKING_PUBLIC_URL ?? publicUrl;

const usage = createUsageGate({ systemOrganizationId });
const signStore = signStoreFromEnv(env);
const schedulingDataKeys = schedulingDataKeysFromEnv({
  SCHEDULING_DATA_KEYS: env.SCHEDULING_DATA_KEYS,
  NODE_ENV: process.env.NODE_ENV,
});
const app = createApp({
  emailService: createEmailService({
    liveProvider: email.liveProvider,
    sandboxProvider: email.sandboxProvider,
    queue: pgBossDispatchQueue(jobs),
    trackingBaseUrl: trackingUrl,
    trackingDomainProvider: email.trackingHostnames.name,
    billing: usage,
    linkKeys,
  }),
  smsService: createSmsService({
    // Sends only enqueue here: the provider is named (numbers are the live provider's), never called.
    liveProvider: { name: env.SMS_PROVIDER, send: () => Promise.reject(new Error("Not here.")) },
    sandboxProvider: { name: "fake", send: () => Promise.reject(new Error("Not here.")) },
    queue: pgBossSmsDispatchQueue(jobs),
    billing: usage,
  }),
  verify: {
    codeKey: verifyCodeKey(riskHashKeyFromEnv(env)),
    sharedSms:
      verifySmsEnvironment && env.VERIFY_SMS_FROM
        ? { environment: verifySmsEnvironment, numbers: env.VERIFY_SMS_FROM }
        : null,
    cossEmail:
      cossEnvironment && env.NOTIFICATIONS_FROM
        ? { environment: cossEnvironment, address: addressOf(env.NOTIFICATIONS_FROM) }
        : null,
  },
  // Documents live in SIGN_DOCUMENTS_BUCKET; production without it has no Sign (never Postgres).
  signService: signStore ? createSignService({ store: signStore }) : null,
  billing: usage,
  links: { keys: linkKeys, baseUrl: trackingUrl },
  domainDeps: email.domainDeps,
  inbound: email.inbound,
  webhookDeps: {
    secretsKeys,
    allowInsecureUrls: process.env.NODE_ENV !== "production",
    plans,
  },
  // Velocity counters and customers' rate limit buckets share the rate limiter's Valkey
  // connection; classifications charge its `risk.classify*` buckets; captcha secrets are
  // encrypted with the webhook key ring; phone checks reserve capped plans' allowance.
  riskDeps: createRiskDeps(env, {
    valkey: rateLimits.valkey,
    limiter: rateLimits.limiter,
    secretsKeys,
    usage,
  }),
  plans,
  scheduling: schedulingDataKeys && {
    publicUrl:
      env.SCHEDULING_PUBLIC_URL ??
      (process.env.NODE_ENV === "production" ? null : "http://localhost:3005"),
    dataKeys: schedulingDataKeys,
    lookupKey: Buffer.from(riskHashKeyFromEnv(env)),
    calendars: {
      secretsKeys,
      apps: schedulingCalendarAppsFromEnv(env),
      publicUrl: env.API_PUBLIC_URL ?? publicUrl,
    },
  },
  publicUrl: env.API_PUBLIC_URL,
  portalUrl: env.PORTAL_PUBLIC_URL ?? null,
  signUrl: env.SIGN_PUBLIC_URL ?? null,
  // Forms' public endpoint answers only on FORMS_PUBLIC_URL's host in production.
  forms: {
    url: env.FORMS_PUBLIC_URL ?? null,
    store: formsStoreFromEnv(env),
    hostOnly: process.env.NODE_ENV === "production",
  },
  rateLimiter: rateLimits.limiter,
  clientIp: rateLimits.clientIp,

  corsOrigins: env.API_CORS_ORIGINS,
  logWriter,
  shutdownSignal: shutdown.signal,
});

/** The bare address of `Name <address>` or `address`. */
function addressOf(from: string): string {
  return /<([^>]+)>/.exec(from)?.[1]?.trim() ?? from.trim();
}

const server = startServer({
  fetch: app.fetch,
  port: env.API_PORT,
  onDrained: async () => {
    await Promise.all([jobs.stop({ graceful: true }), logWriter.close()]);
    await Promise.all([closeDb(), rateLimits.limiter.close(), Sentry.close(2_000)]);
  },
});
console.info(`[api] listening on ${server.url}`);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.info(`[api] ${signal}: draining in-flight requests…`);
    shutdown.abort();
    void server.shutdown().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error("[api] shutdown failed:", error);
        process.exit(1);
      },
    );
  });
}
