/**
 * Every rate limit coss.com enforces. A bucket holds `burst` tokens and refills `limit` per `periodMs`
 * (GCRA, see `gcra.ts`): `burst` requests can arrive at once, then the long-run rate applies.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * What a bucket counts per: one API key (or another opaque id, like a Hooks endpoint), organization,
 * environment, email sub-account, client IP, email address, or destination host of outgoing
 * requests.
 */
export type BucketScope =
  | "key"
  | "org"
  | "environment"
  | "subaccount"
  | "ip"
  | "email"
  | "destination";

export type LimitRule = {
  /** Tokens added per `periodMs`. */
  limit: number;
  periodMs: number;
  /** Bucket size: how many can be spent at once. Defaults to `limit`. */
  burst?: number;
};

export type BucketDefinition = LimitRule & {
  scope: BucketScope;
  /** Organizations can get a different rule (`rate_limit_override`). Only org-owned scopes. */
  overridable: boolean;
  /** What to do when the shared store is unavailable. Security and cost controls deny. */
  failureMode: "allow" | "deny";
};

export const BUCKETS = {
  // Public API requests per key, by route class.
  "api.read": {
    scope: "key",
    limit: 50,
    periodMs: SECOND,
    burst: 100,
    overridable: true,
    failureMode: "allow",
  },
  "api.write": {
    scope: "key",
    limit: 10,
    periodMs: SECOND,
    burst: 30,
    overridable: true,
    failureMode: "deny",
  },
  "api.send": {
    scope: "key",
    limit: 20,
    periodMs: SECOND,
    burst: 50,
    overridable: true,
    failureMode: "deny",
  },
  // Risk assessments (`POST /v1/risk/assessments`) sit in customers' sign-up and login paths, so
  // they get far more room than other writes. Denies on a store outage like every write (the
  // authentication buckets before it deny then anyway); integrations are told to fail open.
  "risk.assess": {
    scope: "key",
    limit: 100,
    periodMs: SECOND,
    burst: 200,
    overridable: true,
    failureMode: "deny",
  },
  // Content classification (`POST /v1/risk/content/classify`, and assessments with `content`):
  // every call asks an AI model, so it is capped per organization as well as by the key's
  // `risk.assess` bucket. Assessments over it go without content (`degraded`) instead of failing.
  "risk.classify": {
    scope: "org",
    limit: 10,
    periodMs: SECOND,
    burst: 20,
    overridable: true,
    failureMode: "deny",
  },
  "risk.classify.day": {
    scope: "org",
    limit: 10_000,
    periodMs: DAY,
    overridable: true,
    failureMode: "deny",
  },
  // Phone checks (`POST /v1/risk/phone/check`): every live one is a paid lookup (Twilio), so it
  // is capped per organization as well as by the key's `risk.assess` bucket.
  "risk.phone": {
    scope: "org",
    limit: 5,
    periodMs: SECOND,
    burst: 10,
    overridable: true,
    failureMode: "deny",
  },
  "risk.phone.day": {
    scope: "org",
    limit: 1_000,
    periodMs: DAY,
    overridable: true,
    failureMode: "deny",
  },
  // Rate limiting as a service (`POST /v1/risk/limits`): the call itself, per key. Customers' own
  // buckets decide what a store outage means for them, so this one lets the request through.
  "risk.limit": {
    scope: "key",
    limit: 500,
    periodMs: SECOND,
    burst: 1000,
    overridable: true,
    failureMode: "allow",
  },
  // Database-backed API key verification. These run before the key lookup, so a valid or
  // attacker-chosen key cannot turn the database pool into the first line of rate limiting.
  "api.authentication.key": {
    scope: "key",
    limit: 50,
    periodMs: SECOND,
    burst: 100,
    overridable: false,
    failureMode: "deny",
  },
  "api.authentication.ip": {
    scope: "ip",
    limit: 100,
    periodMs: SECOND,
    burst: 200,
    overridable: false,
    failureMode: "deny",
  },
  // New SMTP relay connections per client IP, charged before the banner (TLS handshakes and
  // AUTH attempts cost CPU and a database lookup). Authenticated sessions then share the API's
  // buckets: `api.authentication.*` for AUTH, `api.send` per message.
  "smtp.connections.ip": {
    scope: "ip",
    limit: 20,
    periodMs: SECOND,
    burst: 60,
    overridable: false,
    failureMode: "deny",
  },
  // Recipients sent per organization (live) or environment (sandbox), across all keys. The burst
  // of the per-second bucket must stay at least MAX_RECIPIENTS (50), or a full email never fits.
  "email.recipients.second": {
    scope: "org",
    limit: 14,
    periodMs: SECOND,
    burst: 100,
    overridable: true,
    failureMode: "deny",
  },
  // Broadcasts' pace per organization (the worker's fan-out charges it with the daily bucket), so
  // marketing never takes the whole send rate. Plans set it.
  "email.marketing.recipients.second": {
    scope: "org",
    limit: 2,
    periodMs: SECOND,
    burst: 10,
    overridable: true,
    failureMode: "deny",
  },
  "email.recipients.day": {
    scope: "org",
    limit: 10_000,
    periodMs: DAY,
    overridable: true,
    failureMode: "deny",
  },
  "email.sandbox_recipients.day": {
    scope: "environment",
    limit: 500,
    periodMs: DAY,
    overridable: true,
    failureMode: "deny",
  },
  // Quotas a customer sets on one of its email sub-accounts, on top of the organization's. Every
  // charge carries the sub-account's own rule (`rule`); these defaults are never used.
  "email.subaccount_recipients.second": {
    scope: "subaccount",
    limit: 14,
    periodMs: SECOND,
    burst: 100,
    overridable: false,
    failureMode: "deny",
  },
  "email.subaccount_recipients.day": {
    scope: "subaccount",
    limit: 10_000,
    periodMs: DAY,
    overridable: false,
    failureMode: "deny",
  },
  // SMS segments sent per organization (live) or environment (sandbox), across all keys. The
  // burst of the per-second bucket must stay at least MAX_SMS_SEGMENTS (10), or a long message
  // never fits. Plans set the live ones.
  "sms.segments.second": {
    scope: "org",
    limit: 10,
    periodMs: SECOND,
    burst: 50,
    overridable: true,
    failureMode: "deny",
  },
  "sms.segments.day": {
    scope: "org",
    limit: 1_000,
    periodMs: DAY,
    overridable: true,
    failureMode: "deny",
  },
  "sms.sandbox_segments.day": {
    scope: "environment",
    limit: 200,
    periodMs: DAY,
    overridable: true,
    failureMode: "deny",
  },
  // Messages per organization to one phone number (hashed): a sign-up form looping one-time
  // codes to a number (or pumping fraud through it) stops here, whatever the daily quota.
  "sms.recipient.hour": {
    scope: "destination",
    limit: 10,
    periodMs: HOUR,
    burst: 10,
    overridable: true,
    failureMode: "deny",
  },
  // Verify: codes sent to one destination (an environment's phone number or email address, hashed),
  // resends included. Real users wait for a code; a loop doesn't.
  "verify.destination.window": {
    scope: "destination",
    limit: 5,
    periodMs: 10 * MINUTE,
    burst: 5,
    overridable: true,
    failureMode: "deny",
  },
  // Verify: checks per destination, across its verifications (each also allows only a few attempts).
  "verify.check.destination.hour": {
    scope: "destination",
    limit: 60,
    periodMs: HOUR,
    burst: 30,
    overridable: true,
    failureMode: "deny",
  },
  // Verify: codes an organization sends from coss.com's shared numbers (coss.com pays the carrier
  // before the organization's invoice does). Raised per organization by admins.
  "verify.shared_sms.day": {
    scope: "org",
    limit: 1_000,
    periodMs: DAY,
    overridable: true,
    failureMode: "deny",
  },
  // Received emails accepted per organization (the worker charges one per environment a message
  // is delivered to). Over the limit, messages are dropped and counted. Fails open: a store outage
  // must never lose a customer's mail.
  "email.inbound.day": {
    scope: "org",
    limit: 10_000,
    periodMs: DAY,
    burst: 10_000,
    overridable: true,
    failureMode: "allow",
  },
  // DMARC aggregate reports accepted per organization (one per report message). Report addresses
  // are published in DNS, so anyone can mail them: this bounds what they can make coss.com store.
  // Fails open like received mail: a store outage must not lose reports.
  "email.dmarc_reports.day": {
    scope: "org",
    limit: 2_000,
    periodMs: DAY,
    burst: 2_000,
    overridable: true,
    failureMode: "allow",
  },
  // Invitations sent (and resent) per organization: each one emails an address the org chose.
  "dashboard.invitations": {
    scope: "org",
    limit: 50,
    periodMs: DAY,
    burst: 20,
    overridable: true,
    failureMode: "deny",
  },
  // Provider keys checked for imports from another provider, per organization: each check calls
  // the provider, so coss.com mustn't become a way to test stolen keys.
  "dashboard.migration_connections": {
    scope: "org",
    limit: 20,
    periodMs: DAY,
    burst: 5,
    overridable: true,
    failureMode: "deny",
  },
  // Failed API key authentications per client IP (bad keys are rejected before the key lookup).
  "api.auth_failure": {
    scope: "ip",
    limit: 30,
    periodMs: MINUTE,
    overridable: false,
    failureMode: "deny",
  },
  // Dashboard authentication (Better Auth endpoints), per client IP and per email address.
  "auth.sign_in.ip": {
    scope: "ip",
    limit: 20,
    periodMs: MINUTE,
    overridable: false,
    failureMode: "deny",
  },
  "auth.sign_in.email": {
    scope: "email",
    limit: 5,
    periodMs: MINUTE,
    overridable: false,
    failureMode: "deny",
  },
  "auth.sign_up.ip": {
    scope: "ip",
    limit: 5,
    periodMs: HOUR,
    overridable: false,
    failureMode: "deny",
  },
  "auth.password_reset.ip": {
    scope: "ip",
    limit: 5,
    periodMs: HOUR,
    overridable: false,
    failureMode: "deny",
  },
  "auth.password_reset.email": {
    scope: "email",
    limit: 3,
    periodMs: HOUR,
    overridable: false,
    failureMode: "deny",
  },
  "auth.verification_email.ip": {
    scope: "ip",
    limit: 5,
    periodMs: HOUR,
    overridable: false,
    failureMode: "deny",
  },
  "auth.verification_email.email": {
    scope: "email",
    limit: 3,
    periodMs: HOUR,
    overridable: false,
    failureMode: "deny",
  },
  "auth.reset_password.ip": {
    scope: "ip",
    limit: 10,
    periodMs: HOUR,
    overridable: false,
    failureMode: "deny",
  },
  // Second factor (TOTP / backup code) and passkey sign-ins. Better Auth also locks an account
  // for 15 minutes after 10 failed codes, and each challenge allows 5 attempts.
  "auth.two_factor.ip": {
    scope: "ip",
    limit: 20,
    periodMs: MINUTE,
    overridable: false,
    failureMode: "deny",
  },
  "auth.passkey.ip": {
    scope: "ip",
    limit: 20,
    periodMs: MINUTE,
    overridable: false,
    failureMode: "deny",
  },
  // SSO: starting a sign-in (each one stores state and redirects to the IdP) and SAML responses
  // posted back by the IdP. OIDC callbacks are GETs, which the dashboard doesn't limit.
  "auth.sso.ip": {
    scope: "ip",
    limit: 20,
    periodMs: MINUTE,
    overridable: false,
    failureMode: "deny",
  },
  // Starting a Google or GitHub sign-in (each one stores state and redirects to the provider).
  // Their callbacks are GETs, which the dashboard doesn't limit.
  "auth.social.ip": {
    scope: "ip",
    limit: 20,
    periodMs: MINUTE,
    overridable: false,
    failureMode: "deny",
  },
  // SCIM (directory sync) requests, every method. Identity providers send every customer's
  // traffic from a few shared addresses, so the per-IP bucket is wide; each directory token gets
  // its own (keyed by the token's public credential id).
  "auth.scim.ip": {
    scope: "ip",
    limit: 100,
    periodMs: SECOND,
    burst: 500,
    overridable: false,
    failureMode: "deny",
  },
  "auth.scim.token": {
    scope: "key",
    limit: 25,
    periodMs: SECOND,
    burst: 200,
    overridable: false,
    failureMode: "deny",
  },
  // Organizations created per client IP (each user may also own at most 5, see @coss/auth).
  "auth.org_create.ip": {
    scope: "ip",
    limit: 10,
    periodMs: DAY,
    overridable: false,
    failureMode: "deny",
  },
  // The iOS app's code exchange (`/api/mobile/v1/auth/token`), per client IP.
  "mobile.token.ip": {
    scope: "ip",
    limit: 10,
    periodMs: MINUTE,
    overridable: false,
    failureMode: "deny",
  },
  // The CLI's code exchange (`/api/cli/v1/token`, `coss login`), per client IP.
  "cli.token.ip": {
    scope: "ip",
    limit: 10,
    periodMs: MINUTE,
    overridable: false,
    failureMode: "deny",
  },
  // The iOS app's read-only dashboard API, per user id.
  "mobile.api": {
    scope: "key",
    limit: 20,
    periodMs: SECOND,
    burst: 60,
    overridable: false,
    failureMode: "allow",
  },
  // Public telemetry ingress. This is intentionally per process/IP as well as bounded by its body
  // limit; a monitoring outage must not become an unlimited relay or connection sink.
  "monitoring.envelopes": {
    scope: "ip",
    limit: 30,
    periodMs: MINUTE,
    burst: 60,
    overridable: false,
    failureMode: "deny",
  },
  // The payment provider's webhooks (the dashboard's `/api/billing/webhook`): signatures are
  // checked before anything is stored, so this only bounds the work forged requests cause. Stripe
  // retries what is refused, so a store outage allows rather than drops events.
  "billing.webhooks": {
    scope: "ip",
    limit: 50,
    periodMs: SECOND,
    burst: 200,
    overridable: false,
    failureMode: "allow",
  },
  // Twilio's status and inbound callbacks (`/sms/twilio/*`): signatures are checked before
  // anything is stored, so this only bounds the work forged requests cause. A store outage allows
  // rather than drops delivery reports and replies.
  // A browser session's calls, per session, and per address before the token is even looked up.
  "scheduling.session": {
    scope: "key",
    limit: 20,
    periodMs: SECOND,
    burst: 60,
    overridable: false,
    failureMode: "deny",
  },
  "scheduling.ip": {
    scope: "ip",
    limit: 50,
    periodMs: SECOND,
    burst: 150,
    overridable: false,
    failureMode: "deny",
  },
  "scheduling.callbacks": {
    scope: "ip",
    limit: 200,
    periodMs: SECOND,
    burst: 1_000,
    overridable: false,
    failureMode: "allow",
  },
  "sms.callbacks": {
    scope: "ip",
    limit: 200,
    periodMs: SECOND,
    burst: 1_000,
    overridable: false,
    failureMode: "allow",
  },
  // Public recipient-facing tracking endpoints. The token bucket always bounds database work for
  // one message; the IP bucket also limits callers when the deployment has a trusted client IP.
  "tracking.token": {
    scope: "key",
    limit: 10,
    periodMs: SECOND,
    burst: 30,
    overridable: false,
    failureMode: "deny",
  },
  "tracking.ip": {
    scope: "ip",
    limit: 30,
    periodMs: SECOND,
    burst: 100,
    overridable: false,
    failureMode: "deny",
  },
  // The preference center (`/t/u/*`): per link and per client IP. Fail open: an unsubscribe must
  // never depend on Valkey (and a bad link costs one decryption, before any database work).
  "preferences.token": {
    scope: "key",
    limit: 5,
    periodMs: SECOND,
    burst: 20,
    overridable: false,
    failureMode: "allow",
  },
  "preferences.ip": {
    scope: "ip",
    limit: 20,
    periodMs: SECOND,
    burst: 60,
    overridable: false,
    failureMode: "allow",
  },
  // Double opt-in confirmations are the customer's own sends, capped per organization, and per
  // address across every organization so nobody can be mail-bombed through many senders.
  "contacts.confirmations.second": {
    scope: "org",
    limit: 2,
    periodMs: SECOND,
    burst: 20,
    overridable: true,
    failureMode: "deny",
  },
  "contacts.confirmations.day": {
    scope: "org",
    limit: 1000,
    periodMs: DAY,
    overridable: true,
    failureMode: "deny",
  },
  "contacts.confirmation.address": {
    scope: "email",
    limit: 3,
    periodMs: DAY,
    overridable: false,
    failureMode: "deny",
  },
  // Hooks sends: messages per organization, deliveries (a message's fan-out) per day, and a much
  // smaller allowance for sandbox environments (which deliver to real URLs too).
  "hooks.messages.second": {
    scope: "org",
    limit: 50,
    periodMs: SECOND,
    burst: 200,
    overridable: true,
    failureMode: "deny",
  },
  "hooks.deliveries.day": {
    scope: "org",
    limit: 100_000,
    periodMs: DAY,
    overridable: true,
    failureMode: "deny",
  },
  "hooks.sandbox_deliveries.day": {
    scope: "environment",
    limit: 2_000,
    periodMs: DAY,
    overridable: true,
    failureMode: "deny",
  },
  // Hooks delivery attempts (charged by the worker; a denied attempt is rescheduled, not failed):
  // per endpoint (its own `rate_limit_per_second` replaces this rule), per organization and
  // destination host (subject `<org>:<host>`), and a global ceiling per destination host so no
  // set of organizations can turn coss.com into a request cannon against one site. They fail open:
  // the send quotas above already bound what can be queued.
  "hooks.endpoint.attempts": {
    scope: "key",
    limit: 20,
    periodMs: SECOND,
    burst: 50,
    overridable: true,
    failureMode: "allow",
  },
  "hooks.destination.attempts": {
    scope: "destination",
    limit: 50,
    periodMs: SECOND,
    burst: 100,
    overridable: true,
    failureMode: "allow",
  },
  "hooks.host.attempts": {
    scope: "destination",
    limit: 500,
    periodMs: SECOND,
    burst: 1_000,
    overridable: false,
    failureMode: "allow",
  },
  // The Hooks portal's JSON routes: per session (checked before its token, so guessing a token is
  // slow) and per client IP.
  "portal.session": {
    scope: "key",
    limit: 20,
    periodMs: SECOND,
    burst: 60,
    overridable: false,
    failureMode: "deny",
  },
  // Forms' public endpoint (`/f/:id`): per form (checked before any database work), per client IP,
  // and per organization per day (once the form is known). Public ingress: deny on store errors.
  "forms.submit.form": {
    scope: "key",
    limit: 10,
    periodMs: SECOND,
    burst: 50,
    overridable: false,
    failureMode: "deny",
  },
  "forms.submit.ip": {
    scope: "ip",
    limit: 20,
    periodMs: MINUTE,
    burst: 20,
    overridable: false,
    failureMode: "deny",
  },
  "forms.submissions.day": {
    scope: "org",
    limit: 10_000,
    periodMs: DAY,
    overridable: true,
    failureMode: "deny",
  },
  // Submitter verification emails: the customer's sends, capped per organization and per address
  // across every organization (like double opt-in confirmations).
  "forms.verifications.day": {
    scope: "org",
    limit: 1000,
    periodMs: DAY,
    overridable: true,
    failureMode: "deny",
  },
  "forms.verification.address": {
    scope: "email",
    limit: 3,
    periodMs: DAY,
    overridable: false,
    failureMode: "deny",
  },
  "portal.ip": {
    scope: "ip",
    limit: 50,
    periodMs: SECOND,
    burst: 150,
    overridable: false,
    failureMode: "deny",
  },
  // Sign's signing page JSON routes (apps/sign): per session (checked before its token) and per
  // client IP. A signer loads a few documents and signs once; nothing needs more.
  "sign.session": {
    scope: "key",
    limit: 10,
    periodMs: SECOND,
    burst: 60,
    overridable: false,
    failureMode: "deny",
  },
  "sign.ip": {
    scope: "ip",
    limit: 30,
    periodMs: SECOND,
    burst: 120,
    overridable: false,
    failureMode: "deny",
  },
} as const satisfies Record<string, BucketDefinition>;

export type BucketName = keyof typeof BUCKETS;

export const BUCKET_NAMES = Object.keys(BUCKETS) as BucketName[];

export function isBucketName(value: string): value is BucketName {
  return Object.hasOwn(BUCKETS, value);
}

export function isOverridableBucket(value: string): value is BucketName {
  return isBucketName(value) && BUCKETS[value].overridable;
}

export function bucketDefinition(name: BucketName): BucketDefinition {
  return BUCKETS[name];
}

/** Largest value a rule field can hold (`rate_limit_override` stores them as `integer`). */
export const MAX_RULE_VALUE = 2_147_483_647;

/** Validates a rule (from code or an override row): positive integers up to `MAX_RULE_VALUE`. */
export function assertValidRule(rule: LimitRule): void {
  const { limit, periodMs, burst = limit } = rule;
  for (const [name, value] of [
    ["limit", limit],
    ["periodMs", periodMs],
    ["burst", burst],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new RangeError(`Rate limit ${name} must be a positive integer (got ${value}).`);
    }
    if (value > MAX_RULE_VALUE) {
      throw new RangeError(`Rate limit ${name} must be at most ${MAX_RULE_VALUE} (got ${value}).`);
    }
  }
}
