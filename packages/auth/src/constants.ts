/** Client-safe constants shared by the dashboard and server code. */

/** Better Auth api-key plugin enforces `maximumNameLength` (we set it explicitly). */
export const API_KEY_NAME_MAX_LENGTH = 32;

/** Key prefix by environment mode. Secret scanners can match `coss_(live|test)_[A-Za-z]{64}`. */
export const API_KEY_PREFIX = {
  live: "coss_live_",
  sandbox: "coss_test_",
} as const;

/** Prefix + this many characters are stored/displayed (`coss_live_AbCd`). */
export const API_KEY_VISIBLE_CHARACTERS = 14;

/**
 * Every permission an API key can hold: what a full-access key has, resolved on every request (so
 * a new action reaches existing full-access keys without a backfill). Restricted keys hold a
 * subset chosen at creation and never gain new ones. Labels for each resource and action live in
 * `./api-key-permissions.ts` (a test fails when they disagree).
 */
export const API_KEY_PERMISSIONS: Record<string, string[]> = {
  email: ["send", "read"],
  emailTemplate: ["create", "read", "update", "delete", "publish"],
  receivedEmail: ["delete"],
  domain: ["create", "read", "verify", "delete"],
  webhook: ["create", "read", "update", "delete"],
  suppression: ["create", "read", "delete"],
  contact: ["create", "read", "update", "delete"],
  broadcast: ["create", "read", "update", "delete", "send"],
  subaccount: ["create", "read", "update", "delete"],
  reputation: ["read"],
  log: ["read"],
  // The organization's audit log. Personal keys hold it only while their owner may read it
  // (`ORG_SCOPED_KEY_PERMISSIONS`).
  audit: ["read"],
  logDrain: ["create", "read", "update", "delete"],
  risk: ["assess", "read", "feedback", "update"],
  riskList: ["create", "read", "delete"],
  riskRule: ["create", "read", "update", "delete"],
  // The organization's plan, usage, invoices and credits (read only; changes need the dashboard).
  billing: ["read"],
  hook: ["create", "read", "update", "delete", "send"],
  sms: ["send", "read"],
  smsSuppression: ["create", "read", "delete"],
  sign: ["create", "read", "update", "delete", "send"],
  inbox: ["create", "read", "update", "delete", "send"],
  verify: ["send", "check", "read", "update"],
  form: ["create", "read", "update", "delete"],
  scheduling: ["create", "read", "update", "delete"],
};

/** The header the dashboard's sign-up form carries `coss/device`'s token in (coss.com Risk). */
export const DEVICE_TOKEN_HEADER = "x-coss-device";

/** Social sign-in providers coss.com supports (each enabled only when its client id + secret are set). */
export const SOCIAL_PROVIDERS = ["google", "github"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const SOCIAL_PROVIDER_LABELS: Record<SocialProvider, string> = {
  google: "Google",
  github: "GitHub",
};

export function isSocialProvider(value: unknown): value is SocialProvider {
  return (SOCIAL_PROVIDERS as readonly unknown[]).includes(value);
}
