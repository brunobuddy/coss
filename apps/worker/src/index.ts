import { schedulingCalendarAppsFromEnv, schedulingDataKeysFromEnv } from "@coss/scheduling/runtime";
/**
 * Background worker: dispatches queued emails, delivers webhooks, re-checks domains, recovers
 * lost or interrupted sends, sends account and reputation emails and (with `EMAIL_PROVIDER=ses`)
 * ingests SES delivery events and received emails. Safe to run several instances.
 */
// First: monitoring reports failures while starting, too.
import "./instrument.ts";
import type { AuthEmailSender } from "@coss/auth/emails";
import {
  type BillingNotifier,
  createPlanGate,
  createUsageGate,
  logBillingNotifier,
  planRateLimits,
  supportPlanAt,
} from "@coss/billing";
import { createBillingRuntime } from "@coss/billing/runtime";
import { closeDb } from "@coss/db";
import { startJobBoss } from "@coss/db/jobs";
import {
  authorizeLiveSender,
  createEmailService,
  EmailError,
  emailNotifier,
  extractReplyText,
  htmlToText,
  notificationEnvironment,
} from "@coss/email";
import {
  EMAIL_DISPATCH_MARKETING_QUEUE,
  ensureEmailDispatchQueues,
  pgBossDispatchQueue,
  workEmailDispatchQueue,
} from "@coss/email/dispatch";
import { createEmailRuntime, emailRuntimeConfig, linkKeysFromEnv } from "@coss/email/runtime";
import { createS3Api } from "@coss/email/ses";
import { formsStoreFromEnv } from "@coss/forms/runtime";
import { recordHookDeliveryOutcomes } from "@coss/hooks";
import { logPushSender, type PushSender } from "@coss/push";
import { type ApnsSender, createApnsSender } from "@coss/push/apns";
import { createRateLimitRuntime } from "@coss/ratelimit";
import { logReputationNotifier, type ReputationNotifier } from "@coss/reputation";
import { type ScreenInput, screenMessage } from "@coss/screening";
import { createClassifier } from "@coss/screening/runtime";
import { sealerFromEnv, signStoreFromEnv } from "@coss/sign/runtime";
import { createSmsService } from "@coss/sms";
import {
  ensureSmsDispatchQueue,
  pgBossSmsDispatchQueue,
  workSmsDispatchQueue,
} from "@coss/sms/dispatch";
import { createSmsRuntime } from "@coss/sms/runtime";
import { logSupportMailer, supportStoreFromEnv } from "@coss/support";
import { createWebhookSender, parseSecretsKeys } from "@coss/webhooks";
import * as Sentry from "@sentry/bun";
import {
  broadcastPlanRate,
  broadcastThrottle,
  broadcastThrottleRefund,
} from "./broadcast-throttle.ts";
import { env } from "./env.ts";
import { formContactSink } from "./form-contacts.ts";
import { formMailer, formVerificationQuota } from "./form-mailer.ts";
import { hookThrottle } from "./hooks-throttle.ts";
import {
  dmarcReportQuota,
  inboundDataQuota,
  inboundQuota,
  type SesInboundDeps,
} from "./inbound.ts";
import { type SupportWorkerDeps, startJobs, WORKER_LOOP_NAMES } from "./jobs.ts";
import { monitoredDispatch } from "./monitoring.ts";
import { schedulingNotifier } from "./scheduling-notifier.ts";
import { createShutdown } from "./shutdown.ts";
import { addressOf, signMailer } from "./sign-mailer.ts";
import { createSqsApi } from "./sqs.ts";
import { supportMailer } from "./support-mailer.ts";

const unknownLoops = [...(env.WORKER_LOOPS ?? [])].filter(
  (name) => !(WORKER_LOOP_NAMES as readonly string[]).includes(name),
);
if (unknownLoops.length > 0) {
  throw new Error(
    `WORKER_LOOPS names unknown loops: ${unknownLoops.join(", ")} (known: ${WORKER_LOOP_NAMES.join(", ")}).`,
  );
}
const runs = (name: string) => !env.WORKER_LOOPS || env.WORKER_LOOPS.has(name);
const config = emailRuntimeConfig(env);
const email = createEmailRuntime(config);
const billing = createBillingRuntime(env);
const classifier = createClassifier(env);
const controller = new AbortController();
let sesEvents: Parameters<typeof startJobs>[0]["sesEvents"];
if (config.provider === "ses") {
  if (!env.SES_EVENTS_QUEUE_URL) {
    throw new Error(
      "EMAIL_PROVIDER=ses requires SES_EVENTS_QUEUE_URL (see `bun run ses:bootstrap`).",
    );
  }
  sesEvents = {
    sqs: createSqsApi(config.ses.region, env.SES_EVENTS_QUEUE_URL),
    tenantPrefix: config.ses.tenantPrefix,
  };
}
// Rate limits counted in Valkey: receiving's daily inbound limit per organization, and Hooks
// delivery attempts per endpoint and destination host. Then (SES) the receipt notification queue.
// Plan rules: broadcasts are paced by the organization's plan (`email.marketing.recipients.second`).
let planSystemOrganizationId: string | null = null;
const rateLimits = createRateLimitRuntime(
  {
    VALKEY_URL: env.VALKEY_URL,
    VALKEY_CLUSTER: env.VALKEY_CLUSTER,
    RATE_LIMIT_KEY_PREFIX: env.RATE_LIMIT_KEY_PREFIX,
    TRUSTED_PROXY_COUNT: 1,
  },
  {
    planRules: (organizationId) =>
      planRateLimits(organizationId, { systemOrganizationId: planSystemOrganizationId }),
  },
);
await rateLimits.ready();
if (!env.NOTIFICATIONS_ENVIRONMENT_ID !== !env.NOTIFICATIONS_FROM) {
  throw new Error("Set both NOTIFICATIONS_ENVIRONMENT_ID and NOTIFICATIONS_FROM, or neither.");
}
// coss.com's own organization sends account and notification emails: neither the reputation guard
// nor content screening may suspend it (an admin still can).
const systemEnvironment = env.NOTIFICATIONS_ENVIRONMENT_ID
  ? await notificationEnvironment(env.NOTIFICATIONS_ENVIRONMENT_ID)
  : null;
const systemOrganizationId = systemEnvironment?.organizationId ?? null;
planSystemOrganizationId = systemOrganizationId;
// Email dispatch runs on pg-boss (its own pool, woken by NOTIFY when a send commits).
const jobs = await startJobBoss({ worker: true });
await ensureEmailDispatchQueues(jobs);
const dispatchQueue = pgBossDispatchQueue(jobs);
const screen = classifier
  ? (input: ScreenInput) => screenMessage(input, { classifier, systemOrganizationId })
  : undefined;
const usage = createUsageGate({ systemOrganizationId });
let sesInbound: SesInboundDeps | undefined;
if (config.provider === "ses" && email.inbound && config.inbound?.bucket) {
  if (!env.SES_INBOUND_QUEUE_URL) {
    throw new Error(
      "Receiving with EMAIL_PROVIDER=ses requires SES_INBOUND_QUEUE_URL (see `bun run ses:bootstrap`).",
    );
  }
  sesInbound = {
    sqs: createSqsApi(config.ses.region, env.SES_INBOUND_QUEUE_URL, "ses-inbound"),
    s3: createS3Api(config.ses.region),
    bucket: config.inbound.bucket,
    inbound: {
      store: email.inbound.store,
      managedDomain: email.inbound.managedDomain,
      quota: inboundQuota(rateLimits.limiter),
      dataQuota: inboundDataQuota(rateLimits.limiter),
      dmarcQuota: dmarcReportQuota(rateLimits.limiter),
      // Free's allowance of received email.
      billing: usage,
    },
  };
}
const emailService = createEmailService({
  liveProvider: email.liveProvider,
  sandboxProvider: email.sandboxProvider,
  queue: dispatchQueue,
  trackingBaseUrl:
    env.TRACKING_PUBLIC_URL ?? env.API_PUBLIC_URL ?? `http://localhost:${env.API_PORT}`,
  // Emails from a domain with an active custom tracking domain are tracked through it.
  trackingDomainProvider: email.trackingHostnames.name,
  screen,
  screeningFailureAllowlist: systemOrganizationId ? new Set([systemOrganizationId]) : undefined,
  // Internal sends count against their organization's allowance (coss.com's own is never capped).
  billing: usage,
  // Unsubscribe headers and footers of marketing and topic emails, added at dispatch.
  linkKeys: linkKeysFromEnv(env),
});
if (runs("email-dispatch")) await workEmailDispatchQueue(jobs, monitoredDispatch(emailService));
// Fewer at once: marketing must leave most of the account's SES send rate to transactional mail.
if (runs("email-dispatch-marketing")) {
  await workEmailDispatchQueue(jobs, monitoredDispatch(emailService), {
    name: EMAIL_DISPATCH_MARKETING_QUEUE,
    concurrency: 4,
  });
}
// SMS: live messages go to Twilio (or the fake), reporting to the API's `/sms/twilio/status`.
const sms = createSmsRuntime(env);
const smsSecretsKeys = parseSecretsKeys(env.WEBHOOK_SECRETS_KEY);
await ensureSmsDispatchQueue(jobs);
const smsQueue = pgBossSmsDispatchQueue(jobs);
const smsService = createSmsService({
  liveProvider: sms.liveProvider,
  sandboxProvider: sms.sandboxProvider,
  queue: smsQueue,
  callbackBaseUrl: env.API_PUBLIC_URL ?? `http://localhost:${env.API_PORT}`,
  screen,
  screeningFailureAllowlist: systemOrganizationId ? new Set([systemOrganizationId]) : undefined,
  billing: usage,
});
if (runs("sms-dispatch")) await workSmsDispatchQueue(jobs, smsService);
const dispatching = ["email-dispatch", "email-dispatch-marketing", "sms-dispatch"].filter(runs);

// Account emails (verification, password resets, invitations) and reputation notifications go
// out through coss.com's own email product. Without a configured environment, reputation
// notifications are printed in development and both are held in production (sent once
// configured); the dashboard prints account email links itself outside production.
let notifier: ReputationNotifier | null = logReputationNotifier;
let billingNotifier: BillingNotifier | null = logBillingNotifier;
let authEmailSender: AuthEmailSender | null = null;
if (systemEnvironment && env.NOTIFICATIONS_FROM) {
  const sender = {
    service: emailService,
    environment: systemEnvironment,
    from: env.NOTIFICATIONS_FROM,
  };
  notifier = emailNotifier(sender);
  billingNotifier = notifier;
  // Their links are secrets: the stored email keeps no body once it is sent.
  authEmailSender = emailNotifier({ ...sender, discardBody: true });
} else if (process.env.NODE_ENV === "production") {
  console.warn(
    "[worker] NOTIFICATIONS_ENVIRONMENT_ID and NOTIFICATIONS_FROM are unset: account emails " +
      "(sign-up verification, password resets, invitations) and reputation notifications are " +
      "held until they are configured.",
  );
  notifier = null;
  billingNotifier = null;
}

// Push notifications to the iOS app: printed in development without APNs, held in production.
const apnsCredentials = [env.APNS_KEY_ID, env.APNS_TEAM_ID, env.APNS_PRIVATE_KEY];
if (apnsCredentials.some(Boolean) && !apnsCredentials.every(Boolean)) {
  throw new Error("Set APNS_KEY_ID, APNS_TEAM_ID and APNS_PRIVATE_KEY together, or none of them.");
}
let apns: ApnsSender | null = null;
let pushSender: PushSender | null = logPushSender;
if (env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_PRIVATE_KEY) {
  apns = createApnsSender({
    keyId: env.APNS_KEY_ID,
    teamId: env.APNS_TEAM_ID,
    privateKey: env.APNS_PRIVATE_KEY,
    topic: env.APNS_TOPIC,
    environments: env.APNS_ENVIRONMENTS,
  });
  pushSender = apns;
} else if (process.env.NODE_ENV === "production") {
  console.warn("[worker] APNS_* is unset: push notifications to the iOS app are held.");
  pushSender = null;
}

const secretsKeys = parseSecretsKeys(env.WEBHOOK_SECRETS_KEY);
// The dashboard accepts local endpoints outside production; let them be reached there too.
const send = createWebhookSender({ allowPrivateNetworks: process.env.NODE_ENV !== "production" });

// Sign: completed requests are sealed here (live ones with the CA's certificate, sandbox ones with a
// self-signed test seal).
const signSeal = await sealerFromEnv(env);
const signStore = signStoreFromEnv(env);
const signCompletion = signSeal && signStore ? { store: signStore, ...signSeal } : null;
// Sign's emails go out through the email product (sign-mailer.ts).
const signFallbackAddress =
  env.SIGN_NOTIFICATIONS_FROM ??
  (env.NOTIFICATIONS_FROM ? addressOf(env.NOTIFICATIONS_FROM) : null);
const signNotifications =
  signStore && env.SIGN_PUBLIC_URL
    ? {
        store: signStore,
        signUrl: env.SIGN_PUBLIC_URL,
        mailer: signMailer({
          service: emailService,
          fallback:
            systemEnvironment && signFallbackAddress
              ? { environment: systemEnvironment, address: signFallbackAddress }
              : null,
        }),
      }
    : null;

const schedulingDataKeys = schedulingDataKeysFromEnv({
  SCHEDULING_DATA_KEYS: env.SCHEDULING_DATA_KEYS,
  NODE_ENV: process.env.NODE_ENV,
});

// Forms: files of deleted and purged submissions, and organization deletion; notifications,
// contacts and verification emails through the email product (form-mailer.ts, form-contacts.ts).
const supportStore = supportStoreFromEnv(env);
const supportMail = [
  env.SUPPORT_ENVIRONMENT_ID,
  env.SUPPORT_FROM_ADDRESS,
  env.SUPPORT_REPLY_DOMAIN,
].filter(Boolean).length;
if (supportMail !== 0 && supportMail !== 3) {
  throw new Error(
    "Set SUPPORT_ENVIRONMENT_ID, SUPPORT_FROM_ADDRESS and SUPPORT_REPLY_DOMAIN together, or none.",
  );
}
const supportEnvironment = env.SUPPORT_ENVIRONMENT_ID
  ? await notificationEnvironment(env.SUPPORT_ENVIRONMENT_ID)
  : null;
const support: SupportWorkerDeps = {
  intake:
    supportEnvironment && env.SUPPORT_FROM_ADDRESS
      ? {
          environmentId: supportEnvironment.environmentId,
          planFor: supportPlanAt,
          ownAddresses: [
            env.SUPPORT_FROM_ADDRESS,
            ...(env.NOTIFICATIONS_FROM ? [addressOf(env.NOTIFICATIONS_FROM)] : []),
          ],
          extractReplyText: (text) => extractReplyText(text) ?? "",
          htmlToText,
        }
      : null,
  delivery:
    supportEnvironment && env.SUPPORT_FROM_ADDRESS && env.SUPPORT_REPLY_DOMAIN
      ? {
          mailer: supportMailer({
            service: emailService,
            environment: supportEnvironment,
            fromAddress: env.SUPPORT_FROM_ADDRESS,
          }),
          store: supportStore,
          replyDomain: env.SUPPORT_REPLY_DOMAIN,
          dashboardUrl: env.BETTER_AUTH_URL ?? "http://localhost:3000",
        }
      : process.env.NODE_ENV === "production"
        ? null
        : {
            mailer: logSupportMailer,
            store: supportStore,
            replyDomain: "reply.coss.test",
            dashboardUrl: env.BETTER_AUTH_URL ?? "http://localhost:3000",
          },
  inbound: email.inbound?.store ?? null,
  store: supportStore,
  alertsOrganizationId: systemOrganizationId,
};
if (!support.delivery) {
  console.warn(
    "[worker] SUPPORT_ENVIRONMENT_ID, SUPPORT_FROM_ADDRESS and SUPPORT_REPLY_DOMAIN are unset: " +
      "support emails wait until they are configured.",
  );
}
const formsStore = formsStoreFromEnv(env);
const formsFallbackAddress =
  env.FORMS_NOTIFICATIONS_FROM ??
  (env.NOTIFICATIONS_FROM ? addressOf(env.NOTIFICATIONS_FROM) : null);
const formDeliveries = env.FORMS_PUBLIC_URL
  ? {
      formsUrl: env.FORMS_PUBLIC_URL,
      dashboardUrl: env.BETTER_AUTH_URL ?? "http://localhost:3000",
      mailer: formMailer({
        service: emailService,
        limiter: rateLimits.limiter,
        fallback:
          systemEnvironment && formsFallbackAddress
            ? { environment: systemEnvironment, address: formsFallbackAddress }
            : null,
      }),
      contacts: formContactSink({
        emailService,
        limiter: rateLimits.limiter,
        linkKeys: linkKeysFromEnv(env),
        linkBaseUrl:
          env.TRACKING_PUBLIC_URL ?? env.API_PUBLIC_URL ?? `http://localhost:${env.API_PORT}`,
        plans: createPlanGate({ systemOrganizationId }),
      }),
      admitVerification: formVerificationQuota(rateLimits.limiter),
      async verifiedAddress({
        organizationId,
        address,
      }: {
        organizationId: string;
        address: string;
      }) {
        try {
          await authorizeLiveSender({
            organizationId,
            from: address,
            provider: email.liveProvider.name,
          });
          return true;
        } catch (error) {
          // Only "not a verified domain" drops the recipient; a hold, a paused tenant or a
          // database error is thrown, so the delivery is retried rather than sent without them.
          if (error instanceof EmailError && error.code === "domain_not_verified") return false;
          throw error;
        }
      },
    }
  : null;

const loops = startJobs({
  systemOrganizationId,
  dispatchQueue,
  sesEvents,
  inbound: email.inbound,
  sesInbound,
  signal: controller.signal,
  domains: email.domainDeps,
  email: emailService,
  sms: {
    service: smsService,
    queue: smsQueue,
    senders: {
      provider: sms.provider,
      twilio: sms.twilio,
      secretsKeys: smsSecretsKeys,
      subaccountPrefix: sms.subaccountPrefix,
      callbackBaseUrl: env.API_PUBLIC_URL ?? `http://localhost:${env.API_PORT}`,
      // Production never registers or buys anything at the fake provider.
      provisioningDisabled: sms.provider === "fake" && process.env.NODE_ENV === "production",
    },
  },
  broadcasts: {
    queue: dispatchQueue,
    liveProvider: email.liveProvider.name,
    billing: usage,
    throttle: broadcastThrottle(rateLimits.limiter),
    refundThrottle: broadcastThrottleRefund(rateLimits.limiter),
    planRate: broadcastPlanRate({ systemOrganizationId: () => systemOrganizationId }),
    screen,
  },
  authEmails: authEmailSender && { sender: authEmailSender },
  notifications: notifier && {
    notifier,
    dashboardUrl: env.BETTER_AUTH_URL ?? "http://localhost:3000",
  },
  push: pushSender && { sender: pushSender },
  signCompletion,
  signNotifications,
  signStore,
  formsStore,
  formDeliveries,
  support,
  schedulingNotifications: schedulingDataKeys && {
    dataKeys: schedulingDataKeys,
    publicUrl: env.SCHEDULING_PUBLIC_URL ?? null,
    notifier: schedulingNotifier({
      service: emailService,
      sms: smsService,
      limiter: rateLimits.limiter,
      fallback:
        systemEnvironment && env.NOTIFICATIONS_FROM
          ? { environment: systemEnvironment, address: addressOf(env.NOTIFICATIONS_FROM) }
          : null,
    }),
  },
  scheduling: schedulingDataKeys && {
    dataKeys: schedulingDataKeys,
    calendars: {
      secretsKeys,
      apps: schedulingCalendarAppsFromEnv(env),
      publicUrl: env.API_PUBLIC_URL ?? "http://localhost:3001",
    },
  },
  webhooks: { secretsKeys, send },
  migrations: {
    secretsKeys,
    plans: createPlanGate({ systemOrganizationId }),
    webhooks: {
      secretsKeys,
      allowInsecureUrls: process.env.NODE_ENV !== "production",
      plans: createPlanGate({ systemOrganizationId }),
    },
  },
  hooks: {
    secretsKeys,
    send,
    throttle: hookThrottle(rateLimits.limiter),
    // Live delivery outcomes feed the `hook_failure_rate` reputation check.
    onFinished: (finished) => recordHookDeliveryOutcomes(finished),
  },
  logRetentionDays: env.LOG_RETENTION_DAYS,
  ipinfoToken: env.IPINFO_TOKEN ?? null,
  billing: {
    providers: billing.providers,
    defaultProvider: billing.defaultProvider,
    dashboardUrl: env.BETTER_AUTH_URL ?? "http://localhost:3000",
    notifier: billingNotifier,
    usage,
  },
  loops: env.WORKER_LOOPS,
});
console.info(
  `[worker] started (${[...dispatching, ...loops.map((loop) => loop.name)].join(", ")}; ` +
    `content screening: ${env.SCREENING_CLASSIFIER === "ai" ? env.SCREENING_MODEL : env.SCREENING_CLASSIFIER})`,
);

const shutdown = createShutdown({
  controller,
  loops: [
    ...loops,
    // One pg-boss instance works every dispatch queue.
    { name: "email-dispatch", stop: () => jobs.stop({ graceful: true, timeout: 30_000 }) },
  ],
  close: async () => {
    apns?.close();
    await Promise.all([closeDb(), rateLimits.limiter.close()]);
    await Sentry.close(2_000);
  },
});
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.info(`[worker] ${signal}: finishing current runs…`);
    void shutdown().then(
      () => {
        console.info("[worker] stopped");
        process.exit(0);
      },
      (error: unknown) => {
        console.error("[worker] shutdown failed:", error);
        process.exit(1);
      },
    );
  });
}
