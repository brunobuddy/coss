/** What a plan unlocks: features, resource limits and send rates. Contracts can override each. */

export const FEATURE_KEYS = [
  "trackingDomains",
  "auditLog",
  "logDrains",
  "sso",
  "scim",
  "dedicatedIps",
  "subaccounts",
  "schedulingOauthApps",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const LIMIT_KEYS = [
  "domains",
  "members",
  "webhookEndpointsPerEnvironment",
  "contactsPerEnvironment",
  "smsNumbers",
  "inboxes",
  "subaccounts",
] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

/** Rate limit buckets (`@coss/ratelimit`) a plan sets; an organization's override still wins. */
export const RATE_LIMIT_KEYS = [
  "email.recipients.second",
  "email.recipients.day",
  "email.marketing.recipients.second",
  "email.inbound.megabytes.day",
  "sms.segments.second",
  "sms.segments.day",
  "risk.assess",
] as const;
export type RateLimitKey = (typeof RATE_LIMIT_KEYS)[number];

/** The same shape as `@coss/ratelimit`'s rule (this module has no dependencies). */
export type RateLimitRule = { limit: number; periodMs: number; burst?: number };

export type Entitlements = {
  features: Readonly<Record<FeatureKey, boolean>>;
  /** `null` = unlimited. */
  limits: Readonly<Record<LimitKey, number | null>>;
  rateLimits: Readonly<Record<RateLimitKey, RateLimitRule>>;
};

export type EntitlementOverrides = {
  features?: Partial<Record<FeatureKey, boolean>>;
  limits?: Partial<Record<LimitKey, number | null>>;
  rateLimits?: Partial<Record<RateLimitKey, RateLimitRule>>;
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  trackingDomains: "Custom tracking domains",
  auditLog: "Audit log",
  logDrains: "Log drains",
  sso: "Single sign-on (SAML, OIDC)",
  scim: "Directory sync (SCIM)",
  dedicatedIps: "Dedicated IPs",
  subaccounts: "Email for platforms (sub-accounts)",
  schedulingOauthApps: "Bring-your-own OAuth apps for Scheduling",
};

export const LIMIT_LABELS: Record<LimitKey, string> = {
  domains: "Domains",
  members: "Team members",
  webhookEndpointsPerEnvironment: "Webhook endpoints per environment",
  contactsPerEnvironment: "Contacts per environment",
  smsNumbers: "SMS phone numbers",
  inboxes: "Inboxes",
  subaccounts: "Email sub-accounts",
};

const SECOND = 1000;
const DAY = 24 * 60 * 60 * 1000;

export function perSecond(limit: number, burst: number): RateLimitRule {
  return { limit, periodMs: SECOND, burst };
}

export function perDay(limit: number): RateLimitRule {
  return { limit, periodMs: DAY };
}

export function mergeEntitlements(
  base: Entitlements,
  overrides: EntitlementOverrides | undefined,
): Entitlements {
  if (!overrides) return base;
  return {
    features: { ...base.features, ...overrides.features },
    limits: { ...base.limits, ...overrides.limits },
    rateLimits: { ...base.rateLimits, ...overrides.rateLimits },
  };
}

/**
 * What both grant: used while a downgrade is scheduled, so nothing created in the meantime is
 * taken away when it applies. Rate limits are the current contract's (`a`): they gate traffic,
 * not resources.
 */
export function lowerEntitlements(a: Entitlements, b: Entitlements): Entitlements {
  const features = { ...a.features };
  for (const key of Object.keys(features) as FeatureKey[]) {
    features[key] = a.features[key] && b.features[key];
  }
  const limits = { ...a.limits };
  for (const key of Object.keys(limits) as LimitKey[]) {
    const x = a.limits[key];
    const y = b.limits[key];
    limits[key] = x === null ? y : y === null ? x : Math.min(x, y);
  }
  return { features, limits, rateLimits: a.rateLimits };
}

/** Whether `count` more of a limited resource still fit (`current` already exist). */
export function withinLimit(limit: number | null, current: number, count = 1): boolean {
  return limit === null || current + count <= limit;
}
