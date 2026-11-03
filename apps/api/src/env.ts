import { emailEnvShape, emailLinkEnvShape } from "@coss/email/env";
import { formsPublicEnvShape, formsStoreEnvShape } from "@coss/forms/env";
import { hookEnvShape } from "@coss/hooks/env";
import { sentryEnvShape } from "@coss/observability/env";
import { rateLimitEnvShape } from "@coss/ratelimit/env";
import { riskEnvShape, riskPhoneEnvShape } from "@coss/risk/env";
import { schedulingEnvShape } from "@coss/scheduling/env";
import { screeningEnvShape } from "@coss/screening/env";
import { signStoreEnvShape } from "@coss/sign/env";
import { smsEnvShape } from "@coss/sms/env";
import { verifyEnvShape } from "@coss/verify/env";
import { webhookEnvShape } from "@coss/webhooks/env";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/** Validated at server start (src/index.ts). Tests never import this; they use `createApp()`. */
export const env = createEnv({
  server: {
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32, "Generate one with `openssl rand -base64 32`."),
    BETTER_AUTH_URL: z.url(),
    // Public origin of this API (OpenAPI `servers`). Required in production: the request-origin
    // fallback sees the load balancer's http hop, not the client's https URL.
    API_PUBLIC_URL: process.env.NODE_ENV === "production" ? z.url() : z.url().optional(),
    // Origin of the open/click tracking links in emails (`/t/*`, served by this API whatever the
    // host). Defaults to API_PUBLIC_URL; production uses a separate domain (infra/aws/routing.ts).
    TRACKING_PUBLIC_URL: z.url().optional(),
    // Comma-separated browser origins allowed to call /v1 (the docs' API playground).
    API_CORS_ORIGINS: z
      .string()
      .default("https://coss.com")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean),
      )
      .pipe(
        z.array(
          z.url().refine((origin) => new URL(origin).origin === origin, {
            message: "Use bare origins like https://coss.com (no path or trailing slash).",
          }),
        ),
      ),
    // Encrypts webhook endpoint signing secrets; must be the same value the worker uses.
    ...webhookEnvShape,
    ...emailEnvShape,
    // The live SMS provider's name (sends only enqueue here; Twilio's callbacks are verified with
    // each subaccount's own token, so SMS needs no Twilio credentials here: risk's phone checks do).
    SMS_PROVIDER: smsEnvShape.SMS_PROVIDER,
    // Marketing email's links (the preference center is served here). Required in production.
    EMAIL_LINK_KEYS:
      process.env.NODE_ENV === "production"
        ? emailLinkEnvShape.EMAIL_LINK_KEYS.unwrap()
        : emailLinkEnvShape.EMAIL_LINK_KEYS,
    // Where Hooks portal session links point.
    ...hookEnvShape,
    // Where Sign's signing session links point (apps/sign, on a registrable domain of its own).
    // Unset in production until it is deployed: creating a session fails until then.
    // Sign's documents (with AWS_REGION); unset in production: Sign is off.
    SIGN_DOCUMENTS_BUCKET: signStoreEnvShape.SIGN_DOCUMENTS_BUCKET,
    SIGN_PUBLIC_URL:
      process.env.NODE_ENV === "production"
        ? z.url().optional()
        : z.url().default("http://localhost:3004"),
    // Verify: coss.com's shared numbers, and coss.com's own email sender (codes for environments
    // without a sender of their own). Each pair both or neither.
    ...verifyEnvShape,
    NOTIFICATIONS_ENVIRONMENT_ID: z.string().startsWith("env_").optional(),
    NOTIFICATIONS_FROM: z.string().optional(),
    // Where forms are served (`/f/<id>`, a domain of its own in production; unset there: Forms is
    // off) and where their uploads live (with AWS_REGION; unset in production: no uploads).
    ...formsPublicEnvShape,
    FORMS_FILES_BUCKET: formsStoreEnvShape.FORMS_FILES_BUCKET,
    ...rateLimitEnvShape,
    SCHEDULING_PUBLIC_URL: schedulingEnvShape.SCHEDULING_PUBLIC_URL,
    GOOGLE_CALENDAR_CLIENT_ID: schedulingEnvShape.GOOGLE_CALENDAR_CLIENT_ID,
    GOOGLE_CALENDAR_CLIENT_SECRET: schedulingEnvShape.GOOGLE_CALENDAR_CLIENT_SECRET,
    MICROSOFT_CALENDAR_CLIENT_ID: schedulingEnvShape.MICROSOFT_CALENDAR_CLIENT_ID,
    MICROSOFT_CALENDAR_CLIENT_SECRET: schedulingEnvShape.MICROSOFT_CALENDAR_CLIENT_SECRET,
    SCHEDULING_DATA_KEYS: schedulingEnvShape.SCHEDULING_DATA_KEYS,
    // Keys what risk assessments remember (velocity, duplicates, fraud reports).
    RISK_HASH_KEY:
      process.env.NODE_ENV === "production"
        ? riskEnvShape.RISK_HASH_KEY.unwrap()
        : riskEnvShape.RISK_HASH_KEY,
    // Risk's content classification (`ai`: SCREENING_MODEL through the AI Gateway).
    RISK_CLASSIFIER: riskEnvShape.RISK_CLASSIFIER,
    // VPN, proxy and relay data per address (`ipinfo`: IPinfo's privacy detection, a paid plan).
    RISK_IP_PRIVACY: riskEnvShape.RISK_IP_PRIVACY,
    IPINFO_PRIVACY_TOKEN: riskEnvShape.IPINFO_PRIVACY_TOKEN,
    // Line type, carrier and SIM swaps per number (`twilio`: Twilio Lookup with the parent account).
    ...riskPhoneEnvShape,
    TWILIO_ACCOUNT_SID: smsEnvShape.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: smsEnvShape.TWILIO_AUTH_TOKEN,
    SCREENING_MODEL: screeningEnvShape.SCREENING_MODEL,
    AI_GATEWAY_API_KEY: screeningEnvShape.AI_GATEWAY_API_KEY,
    // Error and performance monitoring; read by src/instrument.ts before this schema runs.
    ...sentryEnvShape,
    // The image's commit (Dockerfile build argument), Sentry's release.
    SENTRY_RELEASE: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
