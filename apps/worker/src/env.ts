import { billingEnvShape } from "@coss/billing/env";
import { emailWorkerEnvShape } from "@coss/email/env";
import {
  formsNotificationsEnvShape,
  formsPublicEnvShape,
  formsStoreEnvShape,
} from "@coss/forms/env";
import { sentryEnvShape } from "@coss/observability/env";
import { rateLimitEnvShape } from "@coss/ratelimit/env";
import { riskDatasetEnvShape } from "@coss/risk/env";
import { schedulingEnvShape } from "@coss/scheduling/env";
import { screeningEnvShape } from "@coss/screening/env";
import { signSealEnvShape, signStoreEnvShape } from "@coss/sign/env";
import { smsEnvShape } from "@coss/sms/env";
import { webhookEnvShape } from "@coss/webhooks/env";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/** Validated at start (src/index.ts). Tests never import this; they call the jobs directly. */
export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    // The public API serves the tracking URLs embedded by the dispatch worker.
    API_PUBLIC_URL: process.env.NODE_ENV === "production" ? z.url() : z.url().optional(),
    // Origin of the tracking links, when they shouldn't use API_PUBLIC_URL (production's own domain).
    TRACKING_PUBLIC_URL: z.url().optional(),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    ...emailWorkerEnvShape,
    // Counted in Valkey: the daily inbound limit per organization (`email.inbound.day`) and Hooks
    // delivery attempts (per endpoint and destination host).
    VALKEY_URL: rateLimitEnvShape.VALKEY_URL,
    VALKEY_CLUSTER: rateLimitEnvShape.VALKEY_CLUSTER,
    RATE_LIMIT_KEY_PREFIX: rateLimitEnvShape.RATE_LIMIT_KEY_PREFIX,
    // AI content screening of sampled live emails before they are sent (@coss/screening).
    ...screeningEnvShape,
    // Sign: what seals completed documents (a KMS key and its certificate chain, or a local key in
    // development) and the time-stamping authority. Unset in production: completions wait.
    ...signSealEnvShape,
    // Sign's documents (with AWS_REGION); unset in production: Sign is off.
    SIGN_DOCUMENTS_BUCKET: signStoreEnvShape.SIGN_DOCUMENTS_BUCKET,
    // Where Sign's emailed signing links point (apps/sign); unset in production until it is deployed.
    SIGN_PUBLIC_URL:
      process.env.NODE_ENV === "production"
        ? z.url().optional()
        : z.url().default("http://localhost:3004"),
    // coss.com's own sender of Sign emails ("<requester> via coss.com"), an address on a verified
    // domain of NOTIFICATIONS_ENVIRONMENT_ID's organization; default: NOTIFICATIONS_FROM's address.
    SIGN_NOTIFICATIONS_FROM: z.email().optional(),
    // Files uploaded to forms (with AWS_REGION); unset in production: forms refuse uploads.
    FORMS_FILES_BUCKET: formsStoreEnvShape.FORMS_FILES_BUCKET,
    // Where forms' verification links point; unset in production: Forms is off.
    ...formsPublicEnvShape,
    // coss.com's own sender of form notifications ("<form name> via coss.com"), an address on a
    // verified domain of NOTIFICATIONS_ENVIRONMENT_ID's organization; default: NOTIFICATIONS_FROM's.
    FORMS_NOTIFICATIONS_FROM: formsNotificationsEnvShape.FORMS_NOTIFICATIONS_FROM,
    // Comma-separated loops this worker runs (`WORKER_LOOP_NAMES` in src/jobs.ts), e.g. `hooks` for
    // tasks dedicated to Hooks deliveries; unset runs every loop.
    WORKER_LOOPS: z
      .string()
      .optional()
      .transform((value) =>
        value
          ? new Set(
              value
                .split(",")
                .map((name) => name.trim())
                .filter(Boolean),
            )
          : undefined,
      ),
    // Scheduling: attendee data, and coss.com's OAuth apps for calendars.
    ...schedulingEnvShape,
    // IPinfo Lite (ASN and country for risk assessments); without it those signals are missing.
    ...riskDatasetEnvShape,
    // Days of environment logs kept (@coss/logs); expired days are dropped hourly.
    LOG_RETENTION_DAYS: z.coerce.number().int().min(1).max(31).default(30),
    // Reputation notification emails (warnings, suspensions) to organization owners and admins,
    // sent from a live environment of coss.com's own organization with an address on one of its
    // verified domains. Unset: printed in development, held (not sent) in production.
    NOTIFICATIONS_ENVIRONMENT_ID: z.string().startsWith("env_").optional(),
    NOTIFICATIONS_FROM: z.string().optional(),
    // Push notifications to the iOS app through APNs, with a token-based (`.p8`) key of the Apple
    // Developer team that owns the app. All three or none; unset: printed in development, held
    // in production. The key may use `\n` for its line breaks.
    APNS_KEY_ID: z.string().optional(),
    APNS_TEAM_ID: z.string().optional(),
    APNS_PRIVATE_KEY: z
      .string()
      .optional()
      .transform((value) => value?.replaceAll("\\n", "\n")),
    // The app's bundle id.
    APNS_TOPIC: z.string().default("com.coss.ios"),
    // The gateways the key is configured for (`production`, `sandbox`, or both, comma-separated);
    // devices registered for another (a development build signed in to production) are skipped.
    APNS_ENVIRONMENTS: z
      .string()
      .default("production,sandbox")
      .transform((value) => value.split(",").map((name) => name.trim()))
      .pipe(z.array(z.enum(["production", "sandbox"])).min(1)),
    // The dashboard's origin, for links in notification emails.
    BETTER_AUTH_URL: process.env.NODE_ENV === "production" ? z.url() : z.url().optional(),
    // Decrypts webhook signing secrets (same value as the dashboard's and the API's).
    ...webhookEnvShape,
    // Billing (@coss/billing): the payment provider new accounts use, and Stripe's API key.
    ...billingEnvShape,
    // SMS: the live provider (Twilio's parent account and ISV profile) and subaccount names.
    ...smsEnvShape,
    // Error monitoring; read by src/instrument.ts before this schema runs.
    ...sentryEnvShape,
    // The image's commit (Dockerfile build argument), Sentry's release.
    SENTRY_RELEASE: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
