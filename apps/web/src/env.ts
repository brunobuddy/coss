import { billingEnvShape } from "@coss/billing/env";
import { emailEnvShape } from "@coss/email/env";
import { formsPublicEnvShape, formsStoreEnvShape } from "@coss/forms/env";
import { hookEnvShape } from "@coss/hooks/env";
import { sentryEnvShape } from "@coss/observability/env";
import { rateLimitEnvShape } from "@coss/ratelimit/env";
import { riskEnvShape } from "@coss/risk/env";
import { schedulingEnvShape } from "@coss/scheduling/env";
import { screeningEnvShape } from "@coss/screening/env";
import { signStoreEnvShape } from "@coss/sign/env";
import { smsEnvShape } from "@coss/sms/env";
import { supportStoreEnvShape } from "@coss/support/env";
import { webhookEnvShape } from "@coss/webhooks/env";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/** A base64 key of one of `lengths` bytes (`openssl rand -base64 32`). */
function base64Key(...lengths: number[]) {
  return z
    .string()
    .refine(
      (value) => lengths.includes(Buffer.from(value, "base64").length),
      `Must be ${lengths.join(", ")} bytes, base64.`,
    );
}

/**
 * Validated when the server starts (src/instrumentation.ts) and when next.config loads. Builds set
 * SKIP_ENV_VALIDATION: images are built once and configured per stage at runtime, so nothing here
 * is inlined into the bundle (no NEXT_PUBLIC_ variables).
 */
export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    // Public origin of the API, shown in the quick-start snippets.
    API_PUBLIC_URL: z.url(),
    // The SMTP relay's host (apps/smtp), shown with its settings on environment pages. Unset in
    // production until smtp.coss.com resolves: the settings are hidden.
    SMTP_PUBLIC_HOST:
      process.env.NODE_ENV === "production"
        ? z.string().optional()
        : z.string().default("localhost"),
    ...emailEnvShape,
    ...rateLimitEnvShape,
    ...webhookEnvShape,
    // Reads attendees' details on the bookings pages; session links go to the hosted app.
    SCHEDULING_DATA_KEYS: schedulingEnvShape.SCHEDULING_DATA_KEYS,
    SCHEDULING_PUBLIC_URL: schedulingEnvShape.SCHEDULING_PUBLIC_URL,
    // Where the Hooks portal is served ("Open portal" links).
    ...hookEnvShape,
    // Sign: where signing and builder links point, and its documents (S3, with AWS_REGION).
    SIGN_PUBLIC_URL:
      process.env.NODE_ENV === "production"
        ? z.url().optional()
        : z.url().default("http://localhost:3004"),
    SIGN_DOCUMENTS_BUCKET: signStoreEnvShape.SIGN_DOCUMENTS_BUCKET,
    // Forms: where forms are served (endpoints, hosted pages; unset in production: Forms is off)
    // and their uploads (S3, with AWS_REGION).
    ...formsPublicEnvShape,
    FORMS_FILES_BUCKET: formsStoreEnvShape.FORMS_FILES_BUCKET,
    // Support: attachments of tickets (S3, with AWS_REGION).
    ...supportStoreEnvShape,
    // Keys risk's memory; the dashboard hashes identifiers when it records feedback. Required in
    // production (src/instrumentation.ts).
    ...riskEnvShape,
    // With RISK_CLASSIFIER=ai, live hosted form pages are screened when published here too
    // (SCREENING_MODEL through the AI Gateway), as through the API.
    SCREENING_MODEL: screeningEnvShape.SCREENING_MODEL,
    AI_GATEWAY_API_KEY: screeningEnvShape.AI_GATEWAY_API_KEY,
    // Payment provider of new billing accounts (`fake` or `stripe`), Checkout and the Customer
    // Portal; the Stripe webhook route verifies signatures with STRIPE_WEBHOOK_SECRET.
    ...billingEnvShape,
    // SMS: numbers and carrier registrations are bought and submitted from the dashboard.
    ...smsEnvShape,
    // Server Actions encrypt closed-over variables with this key; every instance of a stage must
    // share it. Without it, each build embeds its own random key. Builds don't need it; production
    // servers refuse to start without it (src/instrumentation.ts).
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: base64Key(16, 24, 32).optional(),
    // Proxies in front of the app that append to X-Forwarded-For (CloudFront → ALB: 2). 0 trusts
    // no forwarded address (local development).
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    // Cloudflare Turnstile on sign-up, sign-in and password reset (both or neither; required in
    // production, see src/instrumentation.ts). The site key is public: pages pass it to the
    // widget. The secret key is read by @coss/auth (`captcha` plugin).
    TURNSTILE_SITE_KEY: z.string().optional(),
    TURNSTILE_SECRET_KEY: z.string().optional(),
    // Sign-in with Google / GitHub (OAuth clients whose callback is
    // `${BETTER_AUTH_URL}/api/auth/callback/<provider>`). Read by @coss/auth; each provider is on
    // when both of its values are set (src/instrumentation.ts refuses half of a pair).
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    // The admin console's deploys page (src/lib/deploys.ts): the coss.com Deploy GitHub App's id and
    // private key (both or neither, src/instrumentation.ts). Unset: the page explains the setup.
    // The admin console's security page (src/lib/security-posture.ts). Unset: it explains the setup.
    SECURITY_MANAGEMENT_ROLE_ARN: z.string().startsWith("arn:aws:iam::").optional(),
    SECURITY_ALERTS_TOPIC_ARN: z.string().startsWith("arn:aws:sns:").optional(),
    SECURITY_ACCESS_LOGS_BUCKET: z.string().optional(),
    SECURITY_DATABASE_LOG_GROUP: z.string().optional(),
    DEPLOY_GITHUB_APP_ID: z.string().regex(/^\d+$/, "The app's numeric id.").optional(),
    DEPLOY_GITHUB_APP_PRIVATE_KEY: z.string().includes("PRIVATE KEY").optional(),
    // Domain Connect (src/lib/domain-connect.ts): the RSA key apply links are signed with, and the
    // TXT host its public half is published at under coss.com (`bun run domain-connect:key`). Both
    // or neither (src/instrumentation.ts). Unset: domain pages only list the records.
    DOMAIN_CONNECT_PRIVATE_KEY: z.string().includes("PRIVATE KEY").optional(),
    DOMAIN_CONNECT_KEY_ID: z
      .string()
      .regex(/^_[a-z0-9-]{1,32}$/i, "A TXT host label like _dck1.")
      .optional(),
    // Error and performance monitoring of the dashboard's server and, through /api/monitoring,
    // of browsers on both zones (dashboard and site).
    ...sentryEnvShape,
    // A live environment of coss.com's own organization (the worker sends account emails from it):
    // admins can't suspend that organization.
    NOTIFICATIONS_ENVIRONMENT_ID: z.string().startsWith("env_").optional(),
    // A live environment of coss.com's own organization that coss.com Risk assesses sign-ups in
    // (dogfooding: `block` refuses the sign-up, `review` lands in that environment's queue).
    // Unset: sign-ups aren't assessed.
    RISK_SIGNUP_ENVIRONMENT_ID: z.string().startsWith("env_").optional(),
  },
  client: {},
  experimental__runtimeEnv: {},
  emptyStringAsUndefined: true,
  skipValidation: Boolean(process.env.SKIP_ENV_VALIDATION),
});
