/**
 * Environment variables of the email runtime, for each app's t3-env schema. Imports only zod:
 * app env modules (and `next.config.ts`) load it before anything touches the database.
 */
import { z } from "zod";

/** Values of `EMAIL_PROVIDER`: the provider used by live (production) environments. */
export const EMAIL_PROVIDERS = ["fake", "ses"] as const;

export type EmailProviderName = (typeof EMAIL_PROVIDERS)[number];

/** Values of `TRACKING_DOMAIN_PROVIDER`: what serves custom tracking hostnames over HTTPS. */
export const TRACKING_DOMAIN_PROVIDERS = ["fake", "cloudfront"] as const;

export type TrackingDomainProviderName = (typeof TRACKING_DOMAIN_PROVIDERS)[number];

/** The fake provider's CNAME target when `TRACKING_CNAME_TARGET` is unset. Nothing serves it. */
export const DEFAULT_FAKE_TRACKING_CNAME_TARGET = "track.coss.test";

/**
 * SES tenant names are `<prefix>-<organization id>[-marketing]` and at most 64 characters, so the
 * prefix leaves room for a 30-character organization id and the stream suffix.
 */
export const SES_TENANT_PREFIX_PATTERN = /^[A-Za-z0-9_-]{1,23}$/;

/**
 * SES configuration set names are at most 64 characters, and the marketing stream's is
 * `<SES_CONFIGURATION_SET>-marketing`.
 */
export const SES_CONFIGURATION_SET_PATTERN = /^[A-Za-z0-9_-]{1,54}$/;

/** Comma-separated 32-byte base64 keys (`EMAIL_LINK_KEYS`), checked without decoding them here. */
const LinkKeys = z
  .string()
  .regex(
    /^\s*[A-Za-z0-9+/]{43}=\s*(,\s*[A-Za-z0-9+/]{43}=\s*)*$/,
    "EMAIL_LINK_KEYS must be comma-separated 32-byte base64 keys (openssl rand -base64 32).",
  );

export const emailEnvShape = {
  // Provider for live environments. Sandbox environments always use the fake provider.
  EMAIL_PROVIDER: z.enum(EMAIL_PROVIDERS).default("fake"),
  // Required with EMAIL_PROVIDER=ses (printed by `bun run ses:bootstrap`). AWS credentials come
  // from the default provider chain (env vars, profile, or the instance/task role).
  AWS_REGION: z.string().optional(),
  // The transactional stream's; the marketing stream's is `<name>-marketing`.
  SES_CONFIGURATION_SET: z.string().regex(SES_CONFIGURATION_SET_PATTERN).optional(),
  SES_TENANT_PREFIX: z.string().regex(SES_TENANT_PREFIX_PATTERN).optional(),
  // Custom tracking domains: tenants of a CloudFront multi-tenant distribution in production (the
  // three below are required with `cloudfront`), an in-memory fake otherwise.
  TRACKING_DOMAIN_PROVIDER: z.enum(TRACKING_DOMAIN_PROVIDERS).default("fake"),
  TRACKING_DISTRIBUTION_ID: z.string().optional(),
  TRACKING_CONNECTION_GROUP_ID: z.string().optional(),
  // The connection group's routing endpoint, which customers point their tracking CNAME at.
  TRACKING_CNAME_TARGET: z.string().optional(),
  // Receiving: coss.com's managed inbound domain (`<label>.<domain>` addresses per environment;
  // default `inbound.coss.test` with the fake provider) and, with SES, the bucket received
  // messages are stored in (both printed by `bun run ses:bootstrap`; unset → no receiving).
  INBOUND_MANAGED_DOMAIN: z.string().optional(),
  SES_INBOUND_BUCKET: z.string().optional(),
};

/**
 * The API (preference center, confirmations) and the worker (links added at dispatch) encrypt
 * marketing email's links: a key ring, newest first (the first encrypts). Required in production;
 * never drop a key whose links may still be clicked.
 */
export const emailLinkEnvShape = {
  EMAIL_LINK_KEYS: LinkKeys.optional(),
};

/** Only the worker consumes delivery events and receipt notifications. */
export const emailWorkerEnvShape = {
  ...emailEnvShape,
  ...emailLinkEnvShape,
  SES_EVENTS_QUEUE_URL: z.url().optional(),
  SES_INBOUND_QUEUE_URL: z.url().optional(),
};

/** The managed inbound domain used with the fake provider when none is configured. */
export const DEFAULT_FAKE_INBOUND_DOMAIN = "inbound.coss.test";

export type EmailEnv = {
  EMAIL_PROVIDER: EmailProviderName;
  AWS_REGION?: string | undefined;
  SES_CONFIGURATION_SET?: string | undefined;
  SES_TENANT_PREFIX?: string | undefined;
  TRACKING_DOMAIN_PROVIDER?: TrackingDomainProviderName | undefined;
  TRACKING_DISTRIBUTION_ID?: string | undefined;
  TRACKING_CONNECTION_GROUP_ID?: string | undefined;
  TRACKING_CNAME_TARGET?: string | undefined;
  INBOUND_MANAGED_DOMAIN?: string | undefined;
  SES_INBOUND_BUCKET?: string | undefined;
};
