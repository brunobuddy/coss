/**
 * Risk's public wire schemas (snake_case), the reason catalog and the default policy. Plain zod,
 * no database or Node imports: `@coss/risk/schemas` is safe to load anywhere (the docs render the
 * reason catalog from it).
 */
import { z } from "zod";

export const RISK_EVENTS = ["signup", "login", "message", "checkout", "custom"] as const;
export type RiskEvent = (typeof RISK_EVENTS)[number];

export const RISK_DECISIONS = ["allow", "review", "block"] as const;
export type RiskDecision = (typeof RISK_DECISIONS)[number];

export const RISK_OUTCOMES = ["legitimate", "fraud", "abuse"] as const;
export type RiskOutcome = (typeof RISK_OUTCOMES)[number];

export const RISK_REVIEW_STATUSES = ["open", "resolved"] as const;
export const RISK_LISTS = ["allow", "block"] as const;
export type RiskList = (typeof RISK_LISTS)[number];
export const RISK_LIST_ENTRY_TYPES = ["email", "domain", "ip", "asn", "country", "user"] as const;
export type RiskListEntryType = (typeof RISK_LIST_ENTRY_TYPES)[number];

/**
 * Signal groups that can be missing from an assessment (a lookup failed or timed out), and
 * `usage_limit`: it ran reduced, past the plan's allowance, on a billing hold or over a budget.
 */
export const RISK_DEGRADED_SIGNALS = [
  "email_dns",
  "domain_age",
  "ip_data",
  "velocity",
  "captcha",
  "content",
  "ip_privacy",
  "usage_limit",
] as const;
export type RiskDegradedSignal = (typeof RISK_DEGRADED_SIGNALS)[number];

/**
 * What content classification scores (the same categories as coss.com's own content screening). A
 * score is the model's probability that the content belongs to the category; coss.com never turns it
 * into a verdict on its own: you set the thresholds.
 */
export const CONTENT_CATEGORIES = ["spam", "phishing", "malware", "fraud"] as const;
export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

/** The longest `content.text` accepted; the model reads the first 8,000 characters. */
export const MAX_CONTENT_TEXT_CHARS = 50_000;

/** Webhook event types: `review` decisions, and their resolution, for a queue you work through. */
export const RISK_EVENT_TYPES = ["risk.assessment.review", "risk.assessment.reviewed"] as const;
export type RiskEventType = (typeof RISK_EVENT_TYPES)[number];

// ---------------------------------------------------------------------------------------------
// The default policy: reason weights, velocity thresholds and decision thresholds.
// ---------------------------------------------------------------------------------------------

/** The windows velocity is counted over. */
export const VELOCITY_WINDOWS = ["1h", "24h"] as const;
export type VelocityWindow = (typeof VELOCITY_WINDOWS)[number];

/** What velocity is counted per (always per environment and event). */
export const VELOCITY_DIMENSIONS = [
  "ip",
  "subnet",
  "email_domain",
  "mailbox",
  "user",
  "card",
  "device",
] as const;
export type VelocityDimension = (typeof VELOCITY_DIMENSIONS)[number];

/** Which events a velocity rule watches: `other` is message and custom events. */
type VelocityEventGroup = "signup" | "login" | "checkout" | "other";

export type VelocityRule = {
  code: string;
  events: VelocityEventGroup;
  dimension: VelocityDimension;
  window: VelocityWindow;
  /** The reason fires when the count (this event included) reaches this. */
  threshold: number;
};

export const VELOCITY_RULES: readonly VelocityRule[] = [
  {
    code: "velocity.signups_per_ip_1h",
    events: "signup",
    dimension: "ip",
    window: "1h",
    threshold: 5,
  },
  {
    code: "velocity.signups_per_ip_24h",
    events: "signup",
    dimension: "ip",
    window: "24h",
    threshold: 20,
  },
  {
    code: "velocity.signups_per_subnet_1h",
    events: "signup",
    dimension: "subnet",
    window: "1h",
    threshold: 15,
  },
  {
    code: "velocity.signups_per_email_domain_1h",
    events: "signup",
    dimension: "email_domain",
    window: "1h",
    threshold: 20,
  },
  {
    code: "velocity.signups_per_mailbox_24h",
    events: "signup",
    dimension: "mailbox",
    window: "24h",
    threshold: 3,
  },
  {
    code: "velocity.signups_per_device_24h",
    events: "signup",
    dimension: "device",
    window: "24h",
    threshold: 3,
  },
  {
    code: "velocity.logins_per_ip_1h",
    events: "login",
    dimension: "ip",
    window: "1h",
    threshold: 30,
  },
  {
    code: "velocity.logins_per_user_1h",
    events: "login",
    dimension: "user",
    window: "1h",
    threshold: 10,
  },
  {
    code: "velocity.checkouts_per_ip_1h",
    events: "checkout",
    dimension: "ip",
    window: "1h",
    threshold: 10,
  },
  {
    code: "velocity.checkouts_per_user_1h",
    events: "checkout",
    dimension: "user",
    window: "1h",
    threshold: 10,
  },
  {
    code: "velocity.checkouts_per_card_24h",
    events: "checkout",
    dimension: "card",
    window: "24h",
    threshold: 10,
  },
  {
    code: "velocity.events_per_ip_1h",
    events: "other",
    dimension: "ip",
    window: "1h",
    threshold: 60,
  },
  {
    code: "velocity.events_per_user_1h",
    events: "other",
    dimension: "user",
    window: "1h",
    threshold: 60,
  },
];

/** Which velocity dimensions an event counts. */
export function velocityDimensionsFor(event: RiskEvent): VelocityDimension[] {
  const group = velocityGroup(event);
  return [...new Set(VELOCITY_RULES.filter((r) => r.events === group).map((r) => r.dimension))];
}

export function velocityGroup(event: RiskEvent): VelocityEventGroup {
  return event === "signup" || event === "login" || event === "checkout" ? event : "other";
}

export type ReasonDefinition = {
  /** Contribution to the score: `score = 1 − Π(1 − weight)` over the reasons that fired. */
  weight: number;
  /** What it means, for developers (never show reasons to the people being assessed). */
  description: string;
};

/**
 * Every reason an assessment can give. Reasons with weight 0 don't move the score: they explain a
 * decision made by a list, or point at a likely integration mistake.
 */
export const REASONS = {
  "email.invalid": {
    weight: 0.6,
    description: "The email address is not syntactically valid.",
  },
  "email.disposable": {
    weight: 0.7,
    description: "The email domain (or a parent domain) belongs to a disposable-mail service.",
  },
  "email.undeliverable": {
    weight: 0.6,
    description:
      "The email domain can't receive mail: it doesn't exist, has a null MX, or has no MX, A or AAAA record.",
  },
  "email.role_account": {
    weight: 0.15,
    description:
      "A shared or system mailbox (`info@`, `admin@`, `noreply@`…) rather than a person.",
  },
  "email.typo": {
    weight: 0.2,
    description:
      "The domain looks like a typo of a popular one; `suggestion` holds the likely domain, which you may show the user.",
  },
  "email.domain_new": {
    weight: 0.35,
    description:
      "The email domain was registered in the last 30 days (from its registry, over RDAP).",
  },
  "ip.tor": { weight: 0.5, description: "The IP address is a Tor exit node." },
  "ip.vpn_network": {
    weight: 0.3,
    description:
      "The IP address belongs to a network mostly used by commercial VPN and proxy services (`provider`).",
  },
  "ip.hosting_provider": {
    weight: 0.25,
    description:
      "The IP address belongs to a cloud or hosting provider (`provider`): usually a script or a proxy, rarely a person.",
  },
  "ip.vpn": {
    weight: 0.35,
    description:
      "The IP address is a commercial VPN's exit, according to the IP privacy data provider (`provider`: the VPN service, when known).",
  },
  "ip.proxy": {
    weight: 0.45,
    description:
      "The IP address is an open or commercial proxy (residential proxies included), according to the IP privacy data provider.",
  },
  "ip.relay": {
    weight: 0.05,
    description:
      "The IP address is a privacy relay's (iCloud Private Relay and similar): usually an ordinary person who turned on their device's privacy feature.",
  },
  "ip.private": {
    weight: 0,
    description:
      "The IP address is private or reserved: you probably passed your load balancer's or proxy's address instead of the client's.",
  },
  "velocity.signups_per_ip_1h": {
    weight: 0.35,
    description: "Many sign-ups from this IP address in the last hour (`value`).",
  },
  "velocity.signups_per_ip_24h": {
    weight: 0.3,
    description: "Many sign-ups from this IP address in the last 24 hours (`value`).",
  },
  "velocity.signups_per_subnet_1h": {
    weight: 0.25,
    description: "Many sign-ups from this IPv4 /24 or IPv6 /64 in the last hour (`value`).",
  },
  "velocity.signups_per_email_domain_1h": {
    weight: 0.2,
    description: "Many sign-ups with this (non-free) email domain in the last hour (`value`).",
  },
  "velocity.signups_per_mailbox_24h": {
    weight: 0.3,
    description:
      "Repeated sign-up attempts for the same mailbox (dots and `+tags` folded) in the last 24 hours (`value`).",
  },
  "velocity.signups_per_device_24h": {
    weight: 0.4,
    description: "Many sign-ups from this browser (its device id) in the last 24 hours (`value`).",
  },
  "velocity.checkouts_per_ip_1h": {
    weight: 0.35,
    description:
      "Many checkouts from this IP address in the last hour (`value`): the shape of card testing.",
  },
  "velocity.checkouts_per_user_1h": {
    weight: 0.3,
    description: "Many checkouts by this user in the last hour (`value`).",
  },
  "velocity.checkouts_per_card_24h": {
    weight: 0.25,
    description: "Many checkouts with this card in the last 24 hours (`value`).",
  },
  "velocity.logins_per_ip_1h": {
    weight: 0.3,
    description: "Many logins from this IP address in the last hour (`value`).",
  },
  "velocity.logins_per_user_1h": {
    weight: 0.3,
    description: "Many logins to this user in the last hour (`value`).",
  },
  "velocity.events_per_ip_1h": {
    weight: 0.25,
    description: "Many events of this kind from this IP address in the last hour (`value`).",
  },
  "velocity.events_per_user_1h": {
    weight: 0.25,
    description: "Many events of this kind from this user in the last hour (`value`).",
  },
  "duplicate.canonical_mailbox": {
    weight: 0.5,
    description:
      "Another sign-up in this environment already used the same mailbox, with dots and `+tags` folded (`previous_user`, `previous_assessment`).",
  },
  "duplicate.device": {
    weight: 0.4,
    description:
      "This browser (its device id) already signed up another account in this environment (`previous_user`, `previous_assessment`).",
  },
  "history.fraud_mailbox": {
    weight: 0.7,
    description: "This mailbox was in an assessment you reported as fraud or abuse.",
  },
  "history.fraud_user": {
    weight: 0.8,
    description: "This user was in an assessment you reported as fraud or abuse.",
  },
  "history.fraud_ip": {
    weight: 0.45,
    description:
      "This IP address was in an assessment you reported as fraud or abuse in the last 30 days.",
  },
  "history.fraud_subnet": {
    weight: 0.2,
    description:
      "This IPv4 /24 or IPv6 /64 was in an assessment you reported as fraud or abuse in the last 30 days.",
  },
  "history.fraud_card": {
    weight: 0.8,
    description: "This payment card was in an assessment you reported as fraud or abuse.",
  },
  "history.fraud_device": {
    weight: 0.7,
    description:
      "This browser (its device id) was in an assessment you reported as fraud or abuse.",
  },
  "checkout.card_country_mismatch": {
    weight: 0.3,
    description:
      "The card was issued in another country than the IP address is in (`checkout.card.country` against the IP's country).",
  },
  "checkout.billing_country_mismatch": {
    weight: 0.25,
    description: "The billing address is in another country than the card was issued in.",
  },
  "checkout.prepaid_card": {
    weight: 0.2,
    description:
      "The card is prepaid (`checkout.card.funding`): popular with card testing and resellers.",
  },
  "device.automation": {
    weight: 0.7,
    description:
      "The browser is automated: it reports WebDriver control or a headless browser (Puppeteer, Playwright, Selenium…).",
  },
  "device.invalid": {
    weight: 0.3,
    description:
      "The device token is malformed (not one `coss/device` made) or more than a day old.",
  },
  "login.new_country": {
    weight: 0.3,
    description:
      "A login from a country this user never logged in from before in this environment.",
  },
  "login.new_network": {
    weight: 0.15,
    description:
      "A login from a network (ASN) this user never logged in from before in this environment.",
  },
  "captcha.failed": {
    weight: 0.6,
    description:
      "The captcha token was refused by the provider (expired, reused, or never solved).",
  },
  "captcha.missing": {
    weight: 0.4,
    description: "No captcha token, while your settings require one (`captcha.required`).",
  },
  "content.spam": {
    weight: 0.5,
    description:
      "The content's spam score reached the threshold you set (`value`, `threshold`). Never fires without one.",
  },
  "content.phishing": {
    weight: 0.8,
    description:
      "The content's phishing score reached the threshold you set (`value`, `threshold`). Never fires without one.",
  },
  "content.malware": {
    weight: 0.8,
    description:
      "The content's malware score reached the threshold you set (`value`, `threshold`). Never fires without one.",
  },
  "content.fraud": {
    weight: 0.7,
    description:
      "The content's fraud (scam) score reached the threshold you set (`value`, `threshold`). Never fires without one.",
  },
  "rule.matched": {
    weight: 0,
    description:
      "One of your rules matched (`rule`, `name`): its action is the decision, unless a list decided.",
  },
  "list.blocked": {
    weight: 0,
    description: "An entry of your block list matched (`entry`, `type`): the decision is `block`.",
  },
  "list.allowed": {
    weight: 0,
    description:
      "An entry of your allow list matched (`entry`, `type`): the decision is `allow`, whatever else fired.",
  },
} as const satisfies Record<string, ReasonDefinition>;

export type RiskReasonCode = keyof typeof REASONS;
export const RISK_REASON_CODES = Object.keys(REASONS) as [RiskReasonCode, ...RiskReasonCode[]];

/**
 * Why Verify's fraud guard (`checkVerificationRisk`) blocked a verification before sending its
 * code. Not assessment reasons: they never score, and the guard creates no assessment.
 */
export const VERIFICATION_REASONS = {
  "list.blocked": "An entry of the environment's Risk block list matched.",
  "ip.tor": "The end user's IP address is a Tor exit node.",
  "phone.premium_rate":
    "A premium-rate or shared-cost number: texting it earns its owner money (SMS pumping).",
  "phone.not_mobile": "A toll-free, pager, voicemail or similar number that can't get a text.",
  "verify.prefix_velocity":
    "Many verifications to numbers sharing this one's prefix in the last hour (`value`).",
  "verify.prefix_low_conversion":
    "Verifications to numbers sharing this one's prefix are rarely approved (`value`: percent approved in the last hour).",
  "verify.country_low_conversion":
    "Verifications to this country are rarely approved (`value`: percent approved in the last hour).",
  "velocity.verifications_per_ip_1h":
    "Many verifications from the end user's IP address in the last hour (`value`).",
  "velocity.verifications_per_user_1h":
    "Many verifications for the same user in the last hour (`value`).",
} as const;
export type VerificationReasonCode = keyof typeof VERIFICATION_REASONS;

/** The guard's thresholds (per environment; `sharedPrefixPerHour` across coss.com's shared numbers). */
export const VERIFICATION_THRESHOLDS = {
  ipPerHour: 20,
  userPerHour: 10,
  prefixPerHour: 30,
  sharedPrefixPerHour: 100,
  /** Low conversion counts once this many verifications went to the prefix (or country) in an hour. */
  prefixMinimum: 10,
  prefixMinApprovalRate: 0.2,
  countryMinimum: 50,
  countryMinApprovalRate: 0.1,
} as const;

/** At or above: `review`; at or above `block`: `block` (unless a list or a rule decided). */
export const DEFAULT_THRESHOLDS = { review: 0.5, block: 0.85 } as const;

/** Reasons that report a decision rather than a signal: they can't be turned off. */
export const DECISION_REASON_CODES = ["list.blocked", "list.allowed", "rule.matched"] as const;
/** Reasons whose weight an environment can change (`reason_weights`): every signal reason. */
export const WEIGHTABLE_REASON_CODES = RISK_REASON_CODES.filter(
  (code) => !(DECISION_REASON_CODES as readonly string[]).includes(code),
) as [RiskReasonCode, ...RiskReasonCode[]];
/** The highest weight an environment can give a reason (1 would make it decide alone). */
export const MAX_REASON_WEIGHT = 0.99;

/** Every other reason, except `content.*`: those only fire at thresholds you set (`content_thresholds`). */
export const DISABLEABLE_REASON_CODES = RISK_REASON_CODES.filter(
  (code) =>
    !(DECISION_REASON_CODES as readonly string[]).includes(code) && !code.startsWith("content."),
) as [RiskReasonCode, ...RiskReasonCode[]];

/** How long a domain counts as new (`email.domain_new`). */
export const NEW_DOMAIN_DAYS = 30;

// ---------------------------------------------------------------------------------------------
// Rules: the fields a condition can test (evaluated by `rules.ts`).
// ---------------------------------------------------------------------------------------------

export type RuleFieldType = "boolean" | "number" | "string";

export const RULE_FIELDS = {
  "email.valid": { type: "boolean", label: "Email is valid" },
  "email.disposable": { type: "boolean", label: "Email is disposable" },
  "email.undeliverable": { type: "boolean", label: "Email domain can't receive mail" },
  "email.role_account": { type: "boolean", label: "Email is a role account" },
  "email.free_provider": { type: "boolean", label: "Email is at a free provider" },
  "email.typo": { type: "boolean", label: "Email domain looks like a typo" },
  "email.domain_new": { type: "boolean", label: "Email domain is new" },
  "email.domain": { type: "string", label: "Email domain" },
  "email.domain_age_days": { type: "number", label: "Email domain age (days)" },
  "ip.tor": { type: "boolean", label: "IP is a Tor exit" },
  "ip.hosting": { type: "boolean", label: "IP is a cloud or hosting network" },
  "ip.vpn": { type: "boolean", label: "IP is a VPN" },
  "ip.proxy": { type: "boolean", label: "IP is a proxy" },
  "ip.relay": { type: "boolean", label: "IP is a privacy relay" },
  "ip.private": { type: "boolean", label: "IP is private" },
  "ip.country": { type: "string", label: "IP country (ISO code)" },
  "ip.asn": { type: "string", label: "IP network (AS number)" },
  "ip.hosting_provider": { type: "string", label: "IP hosting provider" },
  "captcha.passed": { type: "boolean", label: "Captcha passed" },
  "duplicate.canonical_mailbox": { type: "boolean", label: "Mailbox already has an account" },
  "duplicate.device": { type: "boolean", label: "Device already has an account" },
  "history.fraud": { type: "boolean", label: "Seen in fraud before" },
  "login.new_country": { type: "boolean", label: "Login from a new country" },
  "login.new_network": { type: "boolean", label: "Login from a new network" },
  "content.spam": { type: "number", label: "Content spam score (0-1)" },
  "content.phishing": { type: "number", label: "Content phishing score (0-1)" },
  "content.malware": { type: "number", label: "Content malware score (0-1)" },
  "content.fraud": { type: "number", label: "Content fraud score (0-1)" },
  "checkout.amount": { type: "number", label: "Checkout amount (minor units)" },
  "checkout.currency": { type: "string", label: "Checkout currency (ISO code)" },
  "checkout.card_country": { type: "string", label: "Card country (ISO code)" },
  "checkout.card_funding": { type: "string", label: "Card funding (credit, debit, prepaid)" },
  "checkout.billing_country": { type: "string", label: "Billing country (ISO code)" },
  "checkout.shipping_country": { type: "string", label: "Shipping country (ISO code)" },
  "device.automation": { type: "boolean", label: "Browser is automated" },
  "device.timezone": { type: "string", label: "Browser time zone (IANA)" },
  "device.language": { type: "string", label: "Browser language" },
  score: { type: "number", label: "Score (0-1)" },
  "velocity.ip_1h": { type: "number", label: "Events from the IP (1 h)" },
  "velocity.ip_24h": { type: "number", label: "Events from the IP (24 h)" },
  "velocity.subnet_1h": { type: "number", label: "Events from the subnet (1 h)" },
  "velocity.subnet_24h": { type: "number", label: "Events from the subnet (24 h)" },
  "velocity.email_domain_1h": { type: "number", label: "Events with the email domain (1 h)" },
  "velocity.email_domain_24h": { type: "number", label: "Events with the email domain (24 h)" },
  "velocity.mailbox_1h": { type: "number", label: "Events with the mailbox (1 h)" },
  "velocity.mailbox_24h": { type: "number", label: "Events with the mailbox (24 h)" },
  "velocity.user_1h": { type: "number", label: "Events of the user (1 h)" },
  "velocity.user_24h": { type: "number", label: "Events of the user (24 h)" },
  "velocity.card_1h": { type: "number", label: "Events with the card (1 h)" },
  "velocity.card_24h": { type: "number", label: "Events with the card (24 h)" },
  "velocity.device_1h": { type: "number", label: "Events from the device (1 h)" },
  "velocity.device_24h": { type: "number", label: "Events from the device (24 h)" },
} as const satisfies Record<string, { type: RuleFieldType; label: string }>;

export type RuleField = keyof typeof RULE_FIELDS;
export const RULE_FIELD_NAMES = Object.keys(RULE_FIELDS) as [RuleField, ...RuleField[]];

export const RULE_OPERATORS = {
  boolean: ["is"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte"],
  string: ["eq", "neq", "in", "not_in"],
} as const satisfies Record<RuleFieldType, readonly string[]>;

export const MAX_RISK_RULES = 50;
export const MAX_RULE_CONDITIONS = 20;

// ---------------------------------------------------------------------------------------------
// Wire schemas.
// ---------------------------------------------------------------------------------------------

const ASSESSMENT_ID_EXAMPLE = "rsk_01k7c8m4q2f3e9v6t5r1n0p8yz";

export const RiskEventEnum = z.enum(RISK_EVENTS).meta({
  id: "RiskEvent",
  description:
    "What is being assessed. `custom` events are named by `event_name`; velocity is counted per event.",
});
export const RiskDecisionEnum = z.enum(RISK_DECISIONS).meta({
  id: "RiskDecision",
  description:
    "`allow`: go ahead. `review`: suspicious; let it through with limits, or hold it for a person. `block`: refuse it.",
});
export const RiskOutcomeEnum = z.enum(RISK_OUTCOMES).meta({
  id: "RiskOutcome",
  description:
    "What really happened: `legitimate`, `fraud`, or `abuse` (spam, free-tier abuse and the like).",
});
export const RiskListEnum = z
  .enum(RISK_LISTS)
  .meta({ description: "Which list: `allow` or `block`.", id: "RiskList" });
export const RiskListEntryTypeEnum = z.enum(RISK_LIST_ENTRY_TYPES).meta({
  id: "RiskListEntryType",
  description:
    "`email` (matched by mailbox, dots and `+tags` folded), `domain` (subdomains included), `ip` (an address or CIDR range), `asn`, `country` (ISO 3166-1 alpha-2), `user` (your user id).",
});

const UserId = z.string().min(1).max(256);
const Country = z
  .string()
  .regex(/^[A-Z]{2}$/, "Use an upper-case ISO 3166-1 alpha-2 code.")
  .meta({ description: "ISO 3166-1 alpha-2, upper-case (`GB`)." });

export const CARD_FUNDING = ["credit", "debit", "prepaid", "unknown"] as const;

/** Device tokens older than this are `device.invalid`: make one per form submission. */
export const DEVICE_TOKEN_MAX_AGE_MS = 24 * 60 * 60_000;
/** The longest device token accepted. */
export const MAX_DEVICE_TOKEN_CHARS = 4096;

const CheckoutRequest = z
  .strictObject({
    amount: z.number().int().min(0).max(1e12).meta({
      description: "The amount in the currency's minor unit (cents for USD: 1999 is $19.99).",
    }),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, "Use an upper-case ISO 4217 code.")
      .meta({ description: "ISO 4217, upper-case (`USD`)." }),
    card: z
      .strictObject({
        fingerprint: z.string().min(1).max(256).optional().meta({
          description:
            "Your payment processor's fingerprint of the card number (Stripe: `card.fingerprint`). Counted and remembered as a keyed hash only; never send the card number.",
        }),
        country: Country.optional().meta({ description: "Where the card was issued." }),
        funding: z.enum(CARD_FUNDING).optional(),
      })
      .optional()
      .meta({ description: "What your payment processor tells you about the card." }),
    billing_country: Country.optional(),
    shipping_country: Country.optional(),
  })
  .meta({
    id: "RiskCheckoutRequest",
    description: "Only with `checkout` events: what is being paid for, and with which card.",
  });
const EventName = z
  .string()
  .regex(/^[a-z0-9][a-z0-9._-]{0,63}$/, "Use 1-64 lower-case letters, digits, `.`, `_` or `-`.");

export const CreateRiskAssessmentRequest = z
  .strictObject({
    event: RiskEventEnum,
    event_name: EventName.optional().meta({
      description: "Required for `custom` events (e.g. `invite_sent`), not allowed otherwise.",
    }),
    user: z
      .strictObject({
        id: UserId.optional().meta({
          description:
            "Your id for the user, when it exists (logins always; sign-ups once the account is created).",
        }),
        email: z.string().min(1).max(320).optional().meta({
          description: "The email address the user gave. Checked as given, even if invalid.",
        }),
      })
      .optional(),
    ip: z
      .union([z.ipv4(), z.ipv6()])
      .optional()
      .meta({ description: "The client's IP address (not your server's or proxy's)." }),
    user_agent: z.string().max(1024).optional().meta({ description: "The client's user agent." }),
    captcha: z
      .strictObject({
        token: z.string().min(1).max(4096).meta({
          description:
            "The token your captcha widget (Turnstile or hCaptcha, set in the environment's risk settings) gave the browser. Verified once: don't reuse it.",
        }),
      })
      .optional(),
    checkout: CheckoutRequest.optional(),
    device: z
      .strictObject({
        token: z.string().min(1).max(MAX_DEVICE_TOKEN_CHARS).meta({
          description:
            "What `collectDevice()` from `coss/device` returned in the user's browser, passed through your server.",
        }),
      })
      .optional()
      .meta({
        description:
          "The browser the event came from: recognizes it across accounts (`duplicate.device`, device velocity, fraud memory) and spots automation.",
      }),
    content: z
      .strictObject({
        text: z.string().min(1).max(MAX_CONTENT_TEXT_CHARS).meta({
          description:
            "Text the user wrote (a profile bio, a message, a listing). Classified by an AI model with zero data retention and never stored: only its scores are.",
        }),
      })
      .optional()
      .meta({
        description:
          "Content to classify with the event. Its scores go in `signals.content` and rules can test them; `content.*` reasons fire only at thresholds you set.",
      }),
  })
  .superRefine((value, ctx) => {
    if (value.event === "custom" && !value.event_name) {
      ctx.addIssue({
        code: "custom",
        path: ["event_name"],
        message: "Name custom events with `event_name`.",
      });
    }
    if (value.event !== "custom" && value.event_name !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["event_name"],
        message: "`event_name` is only for `custom` events.",
      });
    }
    if (value.event !== "checkout" && value.checkout !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["checkout"],
        message: "`checkout` is only for `checkout` events.",
      });
    }
  })
  .meta({
    id: "CreateRiskAssessmentRequest",
    examples: [
      {
        event: "signup",
        user: { email: "ada@gmail.con" },
        ip: "203.0.113.7",
        user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15",
      },
    ],
  });
export type CreateRiskAssessmentRequestInput = z.input<typeof CreateRiskAssessmentRequest>;
export type CreateRiskAssessmentRequestOutput = z.output<typeof CreateRiskAssessmentRequest>;

export const RiskReason = z
  .object({
    code: z
      .enum(RISK_REASON_CODES)
      .meta({ description: "The reason's code, listed under Risk's reasons in the docs." }),
    message: z.string().meta({ description: "What it means, in words. May change." }),
    value: z.number().optional().meta({
      description: "The count behind a `velocity.*` reason, or the score behind a `content.*` one.",
    }),
    threshold: z
      .number()
      .optional()
      .meta({ description: "What a `velocity.*` or `content.*` reason fires at." }),
    window: z
      .enum(VELOCITY_WINDOWS)
      .optional()
      .meta({ description: "`velocity.*`: the window it's counted over." }),
    suggestion: z.string().optional().meta({ description: "`email.typo`: the likely domain." }),
    provider: z.string().optional().meta({
      description:
        "`ip.hosting_provider`, `ip.vpn_network`: the network's operator; `ip.vpn`: the VPN service.",
    }),
    previous_user: z.string().nullable().optional().meta({
      description:
        "`duplicate.canonical_mailbox`, `duplicate.device`: your id of the user who has the mailbox or device, if known.",
    }),
    previous_assessment: z.string().optional().meta({
      description:
        "`duplicate.canonical_mailbox`, `duplicate.device`: the assessment that first saw the mailbox or device.",
    }),
    entry: z.string().optional().meta({ description: "`list.*`: the matching list entry." }),
    rule: z.string().optional().meta({ description: "`rule.matched`: the rule's id." }),
    name: z.string().optional().meta({ description: "`rule.matched`: the rule's name." }),
    type: RiskListEntryTypeEnum.optional().meta({ description: "`list.*`: what matched." }),
  })
  .meta({ id: "RiskReason" });
export type RiskReasonOutput = z.output<typeof RiskReason>;

export const RiskEmailSignals = z
  .object({
    domain: z.string().nullable().meta({
      description: "`null` once the address is removed (90 days after the assessment).",
    }),
    valid: z.boolean().meta({ description: "Whether it's syntactically valid." }),
    disposable: z.boolean().meta({ description: "Whether its domain is a known burner service." }),
    deliverability: z.enum(["deliverable", "undeliverable", "unknown"]).meta({
      description: "From DNS (MX, A, AAAA). `unknown` when the lookup failed or timed out.",
    }),
    role_account: z.boolean().meta({ description: "Whether it's a role mailbox, like `info@`." }),
    free_provider: z
      .boolean()
      .meta({ description: "Whether its domain is a free mailbox provider." }),
    suggestion: z
      .string()
      .nullable()
      .meta({ description: "`email.typo`: the likely intended domain. `null` otherwise." }),
    domain_age_days: z.number().int().nullable().meta({
      description:
        "Days since the domain was registered (RDAP); `null` when unknown or not looked up (free providers, disposable domains).",
    }),
  })
  .meta({
    description: "What the address says. `null` on an assessment with no email.",
    id: "RiskEmailSignals",
  });

export const RiskCaptchaSignals = z
  .object({
    provided: z.boolean().meta({ description: "Whether the request carried a token." }),
    passed: z.boolean().nullable().meta({
      description:
        "`null` when it couldn't be checked (no captcha configured, or the provider was unreachable).",
    }),
  })
  .meta({
    description: "How the captcha went. `null` when no captcha applies.",
    id: "RiskCaptchaSignals",
  });

export const RiskLoginSignals = z
  .object({
    new_country: z.boolean().meta({
      description: "Whether this user never logged in from this country in this environment.",
    }),
    new_network: z.boolean().meta({
      description: "Whether this user never logged in from this network (ASN) in this environment.",
    }),
  })
  .meta({
    id: "RiskLoginSignals",
    description: "Logins of a user with history: whether the country or network is new for them.",
  });

export const RiskIpSignals = z
  .object({
    version: z.union([z.literal(4), z.literal(6)]).meta({ description: "IPv4 or IPv6." }),
    private: z.boolean().meta({ description: "Whether it's a private or reserved address." }),
    tor: z.boolean().meta({ description: "Whether it's a Tor exit." }),
    hosting: z.boolean().meta({ description: "Whether it's in a cloud, hosting or VPN network." }),
    hosting_provider: z
      .string()
      .nullable()
      .meta({ description: "That network's operator. `null` when it isn't one." }),
    hosting_kind: z
      .enum(["cloud", "hosting", "vpn"])
      .nullable()
      .meta({ description: "`cloud`, `hosting` or `vpn`. `null` when it isn't one." }),
    asn: z
      .number()
      .int()
      .nullable()
      .meta({ description: "The network's autonomous system number. `null` when unknown." }),
    as_name: z
      .string()
      .nullable()
      .meta({ description: "The network's name. `null` when unknown." }),
    country: z.string().nullable().meta({ description: "ISO 3166-1 alpha-2." }),
    privacy: z
      .union([
        z
          .object({
            vpn: z.boolean().meta({ description: "Whether it's a VPN exit." }),
            proxy: z.boolean().meta({ description: "Whether it's a proxy." }),
            relay: z.boolean().meta({ description: "Whether it's a privacy relay." }),
            service: z.string().nullable().meta({ description: "The VPN or proxy service." }),
          })
          .meta({ id: "RiskIpPrivacy" }),
        z.null(),
      ])
      .meta({
        description:
          "From coss.com's IP privacy data provider (VPNs, proxies, relays). `null` when it isn't available or was not asked (private addresses).",
      }),
  })
  .meta({
    description: "What the address says. `null` on an assessment with no IP.",
    id: "RiskIpSignals",
  });

const ContentScores = Object.fromEntries(
  CONTENT_CATEGORIES.map((category) => [
    category,
    z
      .number()
      .min(0)
      .max(1)
      .meta({ description: `The model's probability (0-1) that it's ${category}.` }),
  ]),
) as Record<ContentCategory, z.ZodNumber>;

export const RiskContentSignals = z.object(ContentScores).meta({
  id: "RiskContentSignals",
  description:
    "Per category, the model's probability (0-1) that the content belongs to it. Scores are not calibrated: pick thresholds by looking at your own traffic.",
});

export const RiskCheckoutSignals = z
  .object({
    amount: z
      .number()
      .int()
      .meta({ description: "The amount you sent, in the currency's smallest unit." }),
    currency: z.string().meta({ description: "The currency you sent." }),
    card_country: z
      .string()
      .nullable()
      .meta({ description: "The card's country. `null` when not given." }),
    card_funding: z
      .enum(CARD_FUNDING)
      .nullable()
      .meta({ description: "The card's funding type. `null` when not given." }),
    billing_country: z
      .string()
      .nullable()
      .meta({ description: "The billing country. `null` when not given." }),
    shipping_country: z
      .string()
      .nullable()
      .meta({ description: "The shipping country. `null` when not given." }),
  })
  .meta({
    id: "RiskCheckoutSignals",
    description: "What you sent in `checkout` (never the card).",
  });

export const RiskDeviceSignals = z
  .object({
    valid: z.boolean().meta({ description: "`false`: the token was malformed or too old." }),
    automation: z.boolean().meta({ description: "WebDriver control or a headless browser." }),
    timezone: z.string().nullable().meta({ description: "IANA time zone (`Europe/London`)." }),
    language: z.string().nullable().meta({ description: "The browser's first language." }),
    platform: z
      .string()
      .nullable()
      .meta({ description: "The browser's reported platform. `null` when it reported none." }),
    screen: z.string().nullable().meta({ description: "`<width>x<height>` in CSS pixels." }),
    touch: z
      .boolean()
      .nullable()
      .meta({ description: "Whether the device has a touch screen. `null` when it didn't say." }),
  })
  .meta({
    id: "RiskDeviceSignals",
    description:
      "What the browser reported through `coss/device` (its device id is only kept as a keyed hash).",
  });

export const RiskVelocitySignals = z.record(z.string(), z.number().int()).meta({
  id: "RiskVelocitySignals",
  description:
    "Events of the same kind in this environment, this one included, keyed `<dimension>_<window>` (e.g. `ip_1h`, `mailbox_24h`).",
});

const ASSESSMENT_EXAMPLE = {
  object: "risk_assessment",
  id: ASSESSMENT_ID_EXAMPLE,
  event: "signup",
  event_name: null,
  decision: "review",
  score: 0.62,
  reasons: [
    {
      code: "email.typo",
      message: "The domain looks like a typo of gmail.com.",
      suggestion: "gmail.com",
    },
    {
      code: "velocity.signups_per_ip_1h",
      message: "7 sign-ups from this IP address in the last hour.",
      value: 7,
      threshold: 5,
      window: "1h",
    },
  ],
  signals: {
    email: {
      domain: "gmail.con",
      valid: true,
      disposable: false,
      deliverability: "deliverable",
      role_account: false,
      free_provider: false,
      suggestion: "gmail.com",
      domain_age_days: 9,
    },
    ip: {
      version: 4,
      private: false,
      tor: false,
      hosting: false,
      hosting_provider: null,
      hosting_kind: null,
      asn: 64500,
      as_name: "Example Broadband",
      country: "GB",
      privacy: null,
    },
    velocity: { ip_1h: 7, ip_24h: 9, subnet_1h: 7, mailbox_24h: 1 },
    captcha: { provided: true, passed: true },
    login: null,
    content: null,
    checkout: null,
    device: null,
  },
  user: { id: null, email: "ada@gmail.con" },
  ip: "203.0.113.7",
  degraded: [],
  outcome: null,
  review_status: "open",
  created_at: "2026-01-15T09:30:00.000Z",
} as const;

export const RiskAssessment = z
  .object({
    object: z.literal("risk_assessment"),
    id: z.string().meta({ examples: [ASSESSMENT_ID_EXAMPLE] }),
    event: RiskEventEnum,
    event_name: z
      .string()
      .nullable()
      .meta({ description: "Your name for a `custom` event. `null`: none." }),
    decision: RiskDecisionEnum,
    score: z.number().min(0).max(1).meta({
      description:
        "0-1: how risky the signals are together. Lists can decide regardless of the score.",
    }),
    reasons: z.array(RiskReason).meta({ description: "Why, most significant first." }),
    signals: z
      .object({
        email: z
          .union([RiskEmailSignals, z.null()])
          .meta({ description: "What the address says. `null`: no email was given." }),
        ip: z
          .union([RiskIpSignals, z.null()])
          .meta({ description: "What the IP address says. `null`: none was given." }),
        velocity: z.union([RiskVelocitySignals, z.null()]).meta({
          description: "`null` when velocity was unavailable (see `degraded`).",
        }),
        captcha: z
          .union([RiskCaptchaSignals, z.null()])
          .meta({ description: "How the captcha went. `null`: no captcha applied." }),
        login: z.union([RiskLoginSignals, z.null()]).meta({
          description:
            "Whether a login is new for this user. `null`: not a login of a user with history.",
        }),
        content: z.union([RiskContentSignals, z.null()]).meta({
          description: "`null` when no content was given or it couldn't be classified.",
        }),
        checkout: z
          .union([RiskCheckoutSignals, z.null()])
          .meta({ description: "What you sent in `checkout`. `null`: not given." }),
        device: z
          .union([RiskDeviceSignals, z.null()])
          .meta({ description: "What the device token said. `null`: none was given." }),
      })
      .meta({
        description:
          "What the assessment saw, by group. A group is `null` when it had nothing to go on.",
      }),
    user: z
      .object({
        id: z.string().nullable().meta({ description: "Your user id. `null`: none given." }),
        email: z.string().nullable().meta({
          description: "`null` once removed (90 days after the assessment) or when none was given.",
        }),
      })
      .meta({ description: "Who it's about." }),
    ip: z.string().nullable().meta({ description: "`null` once removed (90 days after)." }),
    degraded: z.array(z.enum(RISK_DEGRADED_SIGNALS)).meta({
      description:
        "Signal groups that were unavailable for this assessment (it was made without them). " +
        "`usage_limit` means the plan's included assessments are used up, or a billing hold or " +
        "budget applies: the assessment was free and made without velocity, memory of earlier " +
        "events, content or address-level IP data.",
    }),
    outcome: z.union([RiskOutcomeEnum, z.null()]).meta({
      description: "The latest outcome you reported with feedback.",
    }),
    review_status: z.union([z.enum(RISK_REVIEW_STATUSES), z.null()]).meta({
      description: "`open` for `review` decisions until you send feedback, then `resolved`.",
    }),
    created_at: z.iso.datetime(),
  })
  .meta({ id: "RiskAssessment", examples: [ASSESSMENT_EXAMPLE] });
export type RiskAssessmentOutput = z.output<typeof RiskAssessment>;

export const DEFAULT_RISK_LIST_LIMIT = 50;
export const MAX_RISK_LIST_LIMIT = 100;

const Limit = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_RISK_LIST_LIMIT)
  .optional()
  .meta({ description: `1-${MAX_RISK_LIST_LIMIT}, default ${DEFAULT_RISK_LIST_LIMIT}.` });
const After = z
  .string()
  .optional()
  .meta({ description: "Cursor: the `id` of the last entry of the previous page." });

export const ListRiskAssessmentsQuery = z.strictObject({
  event: RiskEventEnum.optional(),
  decision: RiskDecisionEnum.optional(),
  user_id: UserId.optional().meta({ description: "Only assessments of this user." }),
  review_status: z
    .enum(RISK_REVIEW_STATUSES)
    .optional()
    .meta({ description: "`open`: the review queue." }),
  limit: Limit,
  after: After,
});
export type ListRiskAssessmentsQueryOutput = z.output<typeof ListRiskAssessmentsQuery>;

export const RiskAssessmentList = z
  .object({
    object: z.literal("list"),
    data: z.array(RiskAssessment),
    has_more: z.boolean(),
  })
  .meta({
    id: "RiskAssessmentList",
    examples: [{ object: "list", data: [ASSESSMENT_EXAMPLE], has_more: false }],
  });
export type RiskAssessmentListOutput = z.output<typeof RiskAssessmentList>;

export const CreateRiskFeedbackRequest = z
  .strictObject({
    outcome: RiskOutcomeEnum,
    note: z.string().max(500).optional().meta({ description: "For your team; never shared." }),
  })
  .meta({ id: "CreateRiskFeedbackRequest", examples: [{ outcome: "fraud" }] });
export type CreateRiskFeedbackRequestOutput = z.output<typeof CreateRiskFeedbackRequest>;

export const CreateRiskListEntryRequest = z
  .strictObject({
    list: RiskListEnum,
    type: RiskListEntryTypeEnum,
    value: z.string().min(1).max(320).meta({
      description:
        "What to match: the address, domain, IP, CIDR range, ASN or other value of its `type`.",
    }),
    note: z.string().max(500).optional().meta({ description: "Your note about it." }),
    expires_at: z.iso
      .datetime({ offset: true })
      .optional()
      .meta({ description: "The entry stops matching at this time (it is kept until deleted)." }),
  })
  .meta({
    id: "CreateRiskListEntryRequest",
    examples: [{ list: "block", type: "domain", value: "evil.example", note: "Card testing" }],
  });
export type CreateRiskListEntryRequestOutput = z.output<typeof CreateRiskListEntryRequest>;

const LIST_ENTRY_EXAMPLE = {
  object: "risk_list_entry",
  id: "rskle_01k7c8m4q2f3e9v6t5r1n0p8yz",
  list: "block",
  type: "domain",
  value: "evil.example",
  note: "Card testing",
  expires_at: null,
  created_at: "2026-01-15T09:30:00.000Z",
} as const;

export const RiskListEntry = z
  .object({
    object: z.literal("risk_list_entry"),
    id: z.string(),
    list: RiskListEnum,
    type: RiskListEntryTypeEnum,
    value: z.string().meta({
      description: "Normalized: emails as their mailbox, CIDR ranges canonical, ASNs as numbers.",
    }),
    note: z.string().nullable().meta({ description: "Your note about it. `null`: none." }),
    expires_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When it stops matching. `null`: never." }),
    created_at: z.iso.datetime(),
  })
  .meta({ id: "RiskListEntry", examples: [LIST_ENTRY_EXAMPLE] });
export type RiskListEntryOutput = z.output<typeof RiskListEntry>;

export const ListRiskListEntriesQuery = z.strictObject({
  list: RiskListEnum.optional(),
  type: RiskListEntryTypeEnum.optional(),
  limit: Limit,
  after: After,
});
export type ListRiskListEntriesQueryOutput = z.output<typeof ListRiskListEntriesQuery>;

export const RiskListEntryList = z
  .object({ object: z.literal("list"), data: z.array(RiskListEntry), has_more: z.boolean() })
  .meta({
    id: "RiskListEntryList",
    examples: [{ object: "list", data: [LIST_ENTRY_EXAMPLE], has_more: false }],
  });
export type RiskListEntryListOutput = z.output<typeof RiskListEntryList>;

export const DeletedRiskListEntry = z
  .object({ object: z.literal("risk_list_entry"), id: z.string(), deleted: z.literal(true) })
  .meta({ id: "DeletedRiskListEntry" });

export const ForgottenRiskUser = z
  .object({
    object: z.literal("risk_user"),
    id: z.string().meta({ description: "Your user id." }),
    deleted: z.literal(true),
  })
  .meta({
    id: "ForgottenRiskUser",
    examples: [{ object: "risk_user", id: "u_42", deleted: true }],
  });

export const RiskWebhookEvent = z
  .object({
    id: z.string().meta({
      description: "The event id, also sent as the `webhook-id` header.",
      example: "evt_01k7c8m4q2f3e9v6t5r1n0p8yz",
    }),
    object: z.literal("event"),
    type: z.enum(RISK_EVENT_TYPES).meta({ description: "What happened to the assessment." }),
    api_version: z.string().meta({
      description:
        "The API version (`Coss-Version`) this event is rendered in: the receiving endpoint's `api_version`.",
    }),
    created_at: z.iso.datetime(),
    data: z
      .object({
        assessment_id: z.string().meta({ description: "The assessment's id." }),
        event: RiskEventEnum,
        event_name: z
          .string()
          .nullable()
          .meta({ description: "Your name for a `custom` event. `null`: none." }),
        decision: RiskDecisionEnum,
        score: z.number().meta({ description: "0-1: how risky the signals are together." }),
        reasons: z.array(RiskReason).meta({ description: "Why, most significant first." }),
        user_id: z.string().nullable().meta({ description: "Your user id. `null`: none given." }),
        outcome: z.union([RiskOutcomeEnum, z.null()]).meta({
          description: "`risk.assessment.reviewed`: the outcome that resolved the review.",
        }),
        occurred_at: z.iso.datetime().meta({ description: "When this happened." }),
      })
      .meta({ description: "The assessment, without its signals." }),
  })
  .meta({ id: "RiskWebhookEvent" });
export type RiskWebhookEventOutput = z.output<typeof RiskWebhookEvent>;
/** What the outbox stores: delivery adds `api_version` when it renders the event for an endpoint. */
export type StoredRiskWebhookEvent = Omit<RiskWebhookEventOutput, "api_version">;

// ---------------------------------------------------------------------------------------------
// Settings.
// ---------------------------------------------------------------------------------------------

export const RISK_CAPTCHA_PROVIDERS = ["turnstile", "hcaptcha"] as const;
export type RiskCaptchaProvider = (typeof RISK_CAPTCHA_PROVIDERS)[number];

const Threshold = z.number().gt(0).max(1);

const SETTINGS_EXAMPLE = {
  object: "risk_settings",
  review_threshold: 0.5,
  block_threshold: 0.85,
  disabled_reasons: ["email.role_account"],
  captcha: { provider: "turnstile", required: true },
  content_thresholds: { spam: null, phishing: 0.8, malware: 0.8, fraud: 0.9 },
  reason_weights: { "ip.hosting_provider": 0.1 },
  updated_at: "2026-01-15T09:30:00.000Z",
} as const;

const ReasonWeight = z.number().min(0).max(MAX_REASON_WEIGHT);

const ContentThresholdsOutput = z
  .object(
    Object.fromEntries(
      CONTENT_CATEGORIES.map((category) => [
        category,
        z.union([z.number(), z.null()]).meta({
          description: `The score at which \`content.${category}\` fires. \`null\`: never.`,
        }),
      ]),
    ) as Record<ContentCategory, z.ZodUnion<[z.ZodNumber, z.ZodNull]>>,
  )
  .meta({
    description:
      "Per content category, the score at which `content.<category>` fires; `null`: never (the score is still in `signals.content` for your rules).",
  });

const ContentThresholdsInput = z
  .strictObject(
    Object.fromEntries(
      CONTENT_CATEGORIES.map((category) => [
        category,
        z
          .union([Threshold, z.null()])
          .optional()
          .meta({
            description: `The score at which \`content.${category}\` fires. \`null\` removes it.`,
          }),
      ]),
    ) as Record<ContentCategory, z.ZodOptional<z.ZodUnion<[typeof Threshold, z.ZodNull]>>>,
  )
  .meta({
    description:
      "Changes the categories given: a score in (0, 1] sets the threshold, `null` removes it.",
  });

export const RiskSettings = z
  .object({
    object: z.literal("risk_settings"),
    review_threshold: z.number().meta({ description: "Scores at or above it are `review`." }),
    block_threshold: z.number().meta({ description: "Scores at or above it are `block`." }),
    disabled_reasons: z.array(z.enum(DISABLEABLE_REASON_CODES)).meta({
      description: "Reasons that never fire in this environment (they don't count in the score).",
    }),
    captcha: z
      .union([
        z.object({
          provider: z.enum(RISK_CAPTCHA_PROVIDERS).meta({ description: "The captcha provider." }),
          required: z.boolean().meta({
            description: "Whether assessments without a token get `captcha.missing`.",
          }),
        }),
        z.null(),
      ])
      .meta({
        description: "The captcha provider assessments verify tokens with (never the secret).",
      }),
    content_thresholds: ContentThresholdsOutput,
    reason_weights: z
      .partialRecord(
        z.enum(WEIGHTABLE_REASON_CODES),
        z.number().meta({ description: "This reason's weight in this environment." }),
      )
      .meta({
        description:
          "Reasons whose weight this environment changed (from calibration or by hand); the rest weigh what the reason catalog says.",
      }),
    updated_at: z.iso.datetime().nullable().meta({ description: "`null` while on the defaults." }),
  })
  .meta({ id: "RiskSettings", examples: [SETTINGS_EXAMPLE] });
export type RiskSettingsOutput = z.output<typeof RiskSettings>;

export const UpdateRiskSettingsRequest = z
  .strictObject({
    review_threshold: Threshold.optional().meta({
      description: "Scores at or above it are `review`.",
    }),
    block_threshold: Threshold.optional().meta({
      description: "Scores at or above it are `block`.",
    }),
    disabled_reasons: z.array(z.enum(DISABLEABLE_REASON_CODES)).max(100).optional().meta({
      description: "Reasons that never fire in this environment. Replaces the list.",
    }),
    captcha: z
      .union([
        z.strictObject({
          provider: z.enum(RISK_CAPTCHA_PROVIDERS).meta({ description: "The captcha provider." }),
          secret: z.string().min(1).max(1024).optional().meta({
            description:
              "The provider's secret key. Required when setting a provider for the first time or changing it; stored encrypted and never returned.",
          }),
          required: z.boolean().optional().meta({
            description:
              "Assessments without a `captcha` token get `captcha.missing`. Default false.",
          }),
        }),
        z.null(),
      ])
      .optional()
      .meta({ description: "`null` turns captcha verification off and deletes the secret." }),
    content_thresholds: ContentThresholdsInput.optional(),
    reason_weights: z
      .partialRecord(
        z.enum(WEIGHTABLE_REASON_CODES),
        z
          .union([ReasonWeight, z.null()])
          .meta({ description: "This reason's new weight. `null` restores its default." }),
      )
      .optional()
      .meta({
        description: `Changes the reasons given: a weight in [0, ${MAX_REASON_WEIGHT}] replaces the default, \`null\` goes back to it.`,
      }),
  })
  .meta({
    id: "UpdateRiskSettingsRequest",
    examples: [
      {
        block_threshold: 0.9,
        captcha: { provider: "turnstile", secret: "0x4AAA…", required: true },
      },
    ],
  });
export type UpdateRiskSettingsRequestOutput = z.output<typeof UpdateRiskSettingsRequest>;

// ---------------------------------------------------------------------------------------------
// Rules.
// ---------------------------------------------------------------------------------------------

const RuleValue = z.union([
  z.boolean(),
  z.number(),
  z.string().max(320),
  z.array(z.string().max(320)).min(1).max(100),
]);

export const RiskRuleCondition = z
  .strictObject({
    field: z
      .enum(RULE_FIELD_NAMES)
      .meta({ description: "The signal to test, such as `email.disposable` or `ip.country`." }),
    operator: z.enum(["is", "eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in"]).meta({
      description:
        "How to compare. Booleans use `is`, numbers `eq` to `lte`, and strings `eq`, `neq`, `in` and `not_in`.",
    }),
    value: RuleValue.meta({
      description:
        "What to compare it with: its type follows the field, and `in` and `not_in` take a list of strings.",
    }),
  })
  .superRefine((condition, ctx) => {
    const { type } = RULE_FIELDS[condition.field];
    const operators: readonly string[] = RULE_OPERATORS[type];
    if (!operators.includes(condition.operator)) {
      ctx.addIssue({
        code: "custom",
        path: ["operator"],
        message: `${condition.field} takes ${operators.join(", ")}.`,
      });
      return;
    }
    const value = condition.value;
    const ok =
      type === "boolean"
        ? typeof value === "boolean"
        : type === "number"
          ? typeof value === "number" && Number.isFinite(value)
          : condition.operator === "in" || condition.operator === "not_in"
            ? Array.isArray(value)
            : typeof value === "string";
    if (!ok) {
      const expected =
        type === "boolean"
          ? "true or false"
          : type === "number"
            ? "a number"
            : condition.operator === "in" || condition.operator === "not_in"
              ? "a list of strings"
              : "a string";
      ctx.addIssue({ code: "custom", path: ["value"], message: `Expected ${expected}.` });
    }
  })
  .meta({
    id: "RiskRuleCondition",
    description:
      "A test of one field. A field without a value (no IP, no email…) never matches, whatever the operator.",
  });
export type RiskRuleConditionOutput = z.output<typeof RiskRuleCondition>;

const RuleName = z.string().trim().min(1).max(100);

const RULE_EXAMPLE = {
  object: "risk_rule",
  id: "rskrule_01k7c8m4q2f3e9v6t5r1n0p8yz",
  name: "Disposable email from a data center",
  enabled: true,
  position: 0,
  events: ["signup"],
  match: "all",
  conditions: [
    { field: "email.disposable", operator: "is", value: true },
    { field: "ip.hosting", operator: "is", value: true },
  ],
  action: "block",
  created_at: "2026-01-15T09:30:00.000Z",
  updated_at: "2026-01-15T09:30:00.000Z",
} as const;

export const RiskRule = z
  .object({
    object: z.literal("risk_rule"),
    id: z.string(),
    name: z
      .string()
      .meta({ description: "Your name for the rule, returned with reasons when it decides." }),
    enabled: z.boolean().meta({ description: "`false`: it's kept, and no assessment applies it." }),
    position: z.number().int().meta({ description: "Rules are tried in ascending order." }),
    events: z
      .array(RiskEventEnum)
      .meta({ description: "Events it applies to; empty: every event." }),
    match: z.enum(["all", "any"]).meta({
      description: "`all`: every condition must hold. `any`: one is enough.",
    }),
    conditions: z.array(RiskRuleCondition).meta({ description: "What must hold, by `match`." }),
    action: RiskDecisionEnum,
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .meta({ id: "RiskRule", examples: [RULE_EXAMPLE] });
export type RiskRuleOutput = z.output<typeof RiskRule>;

export const CreateRiskRuleRequest = z
  .strictObject({
    name: RuleName.meta({
      description: "Your name for the rule, returned with reasons when it decides.",
    }),
    enabled: z.boolean().optional().meta({ description: "Default `true`." }),
    position: z.number().int().min(0).max(10_000).optional().meta({ description: "Default 0." }),
    events: z
      .array(RiskEventEnum)
      .max(RISK_EVENTS.length)
      .optional()
      .meta({ description: "Events it applies to. Default: every event." }),
    match: z.enum(["all", "any"]).optional().meta({ description: "Default `all`." }),
    conditions: z
      .array(RiskRuleCondition)
      .min(1)
      .max(MAX_RULE_CONDITIONS)
      .meta({ description: "What must hold, by `match`." }),
    action: RiskDecisionEnum,
  })
  .meta({
    id: "CreateRiskRuleRequest",
    examples: [
      {
        name: "Disposable email from a data center",
        events: ["signup"],
        conditions: [
          { field: "email.disposable", operator: "is", value: true },
          { field: "ip.hosting", operator: "is", value: true },
        ],
        action: "block",
      },
    ],
  });
export type CreateRiskRuleRequestOutput = z.output<typeof CreateRiskRuleRequest>;

export const UpdateRiskRuleRequest = z
  .strictObject({
    name: RuleName.optional().meta({ description: "Your name for the rule." }),
    enabled: z
      .boolean()
      .optional()
      .meta({ description: "`false` keeps it, and stops applying it." }),
    position: z
      .number()
      .int()
      .min(0)
      .max(10_000)
      .optional()
      .meta({ description: "Rules are tried in ascending order." }),
    events: z
      .array(RiskEventEnum)
      .max(RISK_EVENTS.length)
      .optional()
      .meta({ description: "Events it applies to. Empty: every event." }),
    match: z
      .enum(["all", "any"])
      .optional()
      .meta({ description: "`all`: every condition must hold. `any`: one is enough." }),
    conditions: z
      .array(RiskRuleCondition)
      .min(1)
      .max(MAX_RULE_CONDITIONS)
      .optional()
      .meta({ description: "What must hold, by `match`." }),
    action: RiskDecisionEnum.optional(),
  })
  .meta({ id: "UpdateRiskRuleRequest", examples: [{ enabled: false }] });
export type UpdateRiskRuleRequestOutput = z.output<typeof UpdateRiskRuleRequest>;

export const RiskRuleList = z
  .object({ object: z.literal("list"), data: z.array(RiskRule), has_more: z.literal(false) })
  .meta({
    id: "RiskRuleList",
    description: `Every rule of the environment (at most ${MAX_RISK_RULES}), in evaluation order.`,
    examples: [{ object: "list", data: [RULE_EXAMPLE], has_more: false }],
  });
export type RiskRuleListOutput = z.output<typeof RiskRuleList>;

export const DeletedRiskRule = z
  .object({ object: z.literal("risk_rule"), id: z.string(), deleted: z.literal(true) })
  .meta({ id: "DeletedRiskRule" });

// ---------------------------------------------------------------------------------------------
// Building blocks: stateless lookups (nothing is stored or counted).
// ---------------------------------------------------------------------------------------------

export const RiskEmailCheckRequest = z
  .strictObject({
    email: z.string().min(1).max(320).meta({ description: "The address to check, as given." }),
  })
  .meta({ id: "RiskEmailCheckRequest", examples: [{ email: "ada@gnail.com" }] });
export type RiskEmailCheckRequestOutput = z.output<typeof RiskEmailCheckRequest>;

export const RiskEmailCheck = z
  .object({
    object: z.literal("risk_email_check"),
    email: z.string().meta({ description: "The address checked." }),
    valid: z.boolean().meta({ description: "Syntactically valid (the rest assumes it is)." }),
    domain: z.string().nullable().meta({ description: "Its domain. `null` when it isn't valid." }),
    canonical: z.string().nullable().meta({
      description:
        "The mailbox with the provider's aliasing folded (dots and `+tags` at Gmail…): two addresses with the same canonical form reach one inbox.",
    }),
    disposable: z.boolean().meta({ description: "Whether its domain is a known burner service." }),
    deliverability: z.enum(["deliverable", "undeliverable", "unknown"]).meta({
      description: "From DNS (MX, A, AAAA). `unknown` when the lookup failed or timed out.",
    }),
    role_account: z.boolean().meta({ description: "Whether it's a role mailbox, like `info@`." }),
    free_provider: z
      .boolean()
      .meta({ description: "Whether its domain is a free mailbox provider." }),
    suggestion: z.string().nullable().meta({
      description: "The likely intended domain when this one looks like a typo of a popular one.",
    }),
    domain_age_days: z.number().int().nullable().meta({
      description:
        "Days since the domain was registered (RDAP); `null` when unknown or not looked up (free providers, disposable domains).",
    }),
    degraded: z.array(z.enum(["email_dns", "domain_age"])).meta({
      description: "Lookups that failed or timed out (their fields are `unknown`/`null`).",
    }),
  })
  .meta({
    id: "RiskEmailCheck",
    examples: [
      {
        object: "risk_email_check",
        email: "ada@gnail.com",
        valid: true,
        domain: "gnail.com",
        canonical: "ada@gnail.com",
        disposable: false,
        deliverability: "deliverable",
        role_account: false,
        free_provider: false,
        suggestion: "gmail.com",
        domain_age_days: 7300,
        degraded: [],
      },
    ],
  });
export type RiskEmailCheckOutput = z.output<typeof RiskEmailCheck>;

export const RiskIpCheckRequest = z
  .strictObject({
    ip: z.union([z.ipv4(), z.ipv6()]).meta({ description: "The address to check." }),
  })
  .meta({ id: "RiskIpCheckRequest", examples: [{ ip: "185.220.101.1" }] });
export type RiskIpCheckRequestOutput = z.output<typeof RiskIpCheckRequest>;

export const RiskIpCheck = RiskIpSignals.extend({
  object: z.literal("risk_ip_check"),
  ip: z.string().meta({ description: "The address checked." }),
  degraded: z.array(z.enum(["ip_data", "ip_privacy"])).meta({
    description:
      "`ip_data` when some IP data (Tor exits, cloud ranges, networks and countries) is unavailable at the moment; `ip_privacy` when the privacy data provider failed or timed out.",
  }),
}).meta({
  id: "RiskIpCheck",
  examples: [
    {
      object: "risk_ip_check",
      ip: "185.220.101.1",
      version: 4,
      private: false,
      tor: true,
      hosting: false,
      hosting_provider: null,
      hosting_kind: null,
      asn: 60729,
      as_name: "Stiftung Erneuerbare Freiheit",
      country: "DE",
      privacy: null,
      degraded: [],
    },
  ],
});
export type RiskIpCheckOutput = z.output<typeof RiskIpCheck>;

/** Line types phone checks tell apart (Twilio's, in snake_case). */
export const PHONE_LINE_TYPES = [
  "mobile",
  "landline",
  "fixed_voip",
  "non_fixed_voip",
  "toll_free",
  "premium",
  "shared_cost",
  "personal",
  "uan",
  "voicemail",
  "pager",
  "unknown",
] as const;
export type PhoneLineType = (typeof PHONE_LINE_TYPES)[number];

export const RiskPhoneCheckRequest = z
  .strictObject({
    phone: z.string().min(1).max(32).meta({
      description:
        "The number in E.164 (`+14155550123`); spaces, dashes, dots and brackets are ignored. Anything else is `valid: false`.",
    }),
  })
  .meta({ id: "RiskPhoneCheckRequest", examples: [{ phone: "+14155550123" }] });
export type RiskPhoneCheckRequestOutput = z.output<typeof RiskPhoneCheckRequest>;

export const RiskPhoneCheck = z
  .object({
    object: z.literal("risk_phone_check"),
    phone: z.string().meta({ description: "The number in E.164, or as given when it isn't." }),
    valid: z.boolean().meta({
      description:
        "A possible number in its country's numbering plan. When the lookup failed (`degraded`), only the E.164 syntax was checked.",
    }),
    country: z.string().nullable().meta({ description: "ISO 3166-1 alpha-2." }),
    line_type: z.enum(PHONE_LINE_TYPES).nullable().meta({
      description:
        "`fixed_voip` numbers belong to an address (cable, business lines); `non_fixed_voip` ones can be had online in minutes (Google Voice, app numbers), the kind used for throwaway accounts. `null` when it couldn't be looked up.",
    }),
    carrier: z
      .union([
        z
          .object({
            name: z.string().nullable(),
            mobile_country_code: z.string().nullable(),
            mobile_network_code: z.string().nullable().meta({
              description: "Only for mobile numbers.",
            }),
          })
          .meta({ id: "RiskPhoneCarrier" }),
        z.null(),
      ])
      .meta({
        description:
          "The network the number is on now (after any port). `null` when unknown, and for toll-free, premium and personal numbers.",
      }),
    sim_swap: z
      .union([
        z
          .object({
            recent: z.boolean().meta({
              description:
                "The SIM changed within `period`: someone may have taken the number over.",
            }),
            swapped_at: z.string().nullable().meta({
              description: "The last SIM change, where the carrier tells the date.",
            }),
            period: z.string().nullable().meta({
              description: "What `recent` means, as an ISO 8601 duration (`PT48H`).",
            }),
          })
          .meta({ id: "RiskPhoneSimSwap" }),
        z.null(),
      ])
      .meta({
        description:
          "The mobile number's last SIM change. `null` where coss.com doesn't have that data (not every country and carrier).",
      }),
    degraded: z.array(z.enum(["phone_data", "sim_swap"])).meta({
      description:
        "`phone_data` when the lookup failed or timed out (or had no line type for the number); `sim_swap` when the carrier didn't answer about the SIM.",
    }),
  })
  .meta({
    id: "RiskPhoneCheck",
    examples: [
      {
        object: "risk_phone_check",
        phone: "+14155550123",
        valid: true,
        country: "US",
        line_type: "mobile",
        carrier: {
          name: "T-Mobile USA, Inc.",
          mobile_country_code: "310",
          mobile_network_code: "260",
        },
        sim_swap: null,
        degraded: [],
      },
    ],
  });
export type RiskPhoneCheckOutput = z.output<typeof RiskPhoneCheck>;

export const RiskContentClassifyRequest = z
  .strictObject({
    text: z.string().min(1).max(MAX_CONTENT_TEXT_CHARS).meta({
      description:
        "The text to classify (a profile bio, a comment, a listing). The model reads the first 8,000 characters.",
    }),
  })
  .meta({
    id: "RiskContentClassifyRequest",
    examples: [{ text: "Earn $5,000 a week from home! DM me on Telegram: t.me/fast-cash" }],
  });
export type RiskContentClassifyRequestOutput = z.output<typeof RiskContentClassifyRequest>;

export const RiskContentClassification = z
  .object({
    object: z.literal("risk_content_classification"),
    scores: RiskContentSignals,
    truncated: z.boolean().meta({
      description: "The text was longer than the model reads: only its beginning was classified.",
    }),
  })
  .meta({
    id: "RiskContentClassification",
    description:
      "Scores only: coss.com never decides what they mean for you. Neither the text nor the scores are stored.",
    examples: [
      {
        object: "risk_content_classification",
        scores: { spam: 0.91, phishing: 0.04, malware: 0.01, fraud: 0.86 },
        truncated: false,
      },
    ],
  });
export type RiskContentClassificationOutput = z.output<typeof RiskContentClassification>;

// ---------------------------------------------------------------------------------------------
// Rate limiting as a service: your buckets, charged per key.
// ---------------------------------------------------------------------------------------------

export const RISK_LIMIT_FAILURE_MODES = ["allow", "deny"] as const;
export type RiskLimitFailureMode = (typeof RISK_LIMIT_FAILURE_MODES)[number];
export const MAX_RISK_LIMIT_BUCKETS = 100;
/** Bounds of a bucket's numbers (tokens and seconds). */
export const MAX_RISK_LIMIT = 1_000_000;
export const MAX_RISK_LIMIT_PERIOD_SECONDS = 86_400;

const BUCKET_ID_EXAMPLE = "rsklb_01k7c8m4q2f3e9v6t5r1n0p8yz";
const BucketName = z
  .string()
  .regex(/^[a-z0-9][a-z0-9._-]{0,63}$/, "Use 1-64 lower-case letters, digits, `.`, `_` or `-`.");
const Tokens = z.number().int().min(1).max(MAX_RISK_LIMIT);
const PeriodSeconds = z.number().int().min(1).max(MAX_RISK_LIMIT_PERIOD_SECONDS);

const LIMIT_BUCKET_EXAMPLE = {
  object: "risk_limit_bucket",
  id: BUCKET_ID_EXAMPLE,
  name: "password_reset",
  limit: 5,
  period_seconds: 3600,
  burst: 5,
  on_failure: "allow",
  created_at: "2026-01-15T09:30:00.000Z",
  updated_at: "2026-01-15T09:30:00.000Z",
} as const;

export const RiskLimitBucket = z
  .object({
    object: z.literal("risk_limit_bucket"),
    id: z.string().meta({ examples: [BUCKET_ID_EXAMPLE] }),
    name: z.string().meta({ description: "What `POST /v1/risk/limits` names it by." }),
    limit: z.number().int().meta({ description: "Tokens added per `period_seconds`." }),
    period_seconds: z
      .number()
      .int()
      .meta({ description: "How many seconds `limit` tokens take to be added." }),
    burst: z.number().int().meta({
      description: "The bucket's size: how many requests a key can make at once.",
    }),
    on_failure: z.enum(RISK_LIMIT_FAILURE_MODES).meta({
      description:
        "The answer while coss.com can't count (its store is unavailable): `allow` (fail open) or `deny`.",
    }),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .meta({ id: "RiskLimitBucket", examples: [LIMIT_BUCKET_EXAMPLE] });
export type RiskLimitBucketOutput = z.output<typeof RiskLimitBucket>;

export const CreateRiskLimitBucketRequest = z
  .strictObject({
    name: BucketName.meta({ description: "Unique in the environment; can't be changed." }),
    limit: Tokens.meta({ description: "Tokens added per `period_seconds`." }),
    period_seconds: PeriodSeconds.meta({ description: "1 second to 1 day." }),
    burst: Tokens.optional().meta({
      description: "How many requests a key can make at once. Defaults to `limit`.",
    }),
    on_failure: z.enum(RISK_LIMIT_FAILURE_MODES).optional().meta({
      description: "The answer while coss.com can't count. Defaults to `allow`.",
    }),
  })
  .meta({
    id: "CreateRiskLimitBucketRequest",
    examples: [{ name: "password_reset", limit: 5, period_seconds: 3600 }],
  });
export type CreateRiskLimitBucketRequestOutput = z.output<typeof CreateRiskLimitBucketRequest>;

export const UpdateRiskLimitBucketRequest = z
  .strictObject({
    limit: Tokens.optional().meta({ description: "Tokens added per `period_seconds`." }),
    period_seconds: PeriodSeconds.optional().meta({
      description: "How many seconds `limit` tokens take to be added.",
    }),
    burst: Tokens.optional().meta({
      description: "The bucket's size: how many requests a key can make at once.",
    }),
    on_failure: z
      .enum(RISK_LIMIT_FAILURE_MODES)
      .optional()
      .meta({ description: "The answer while coss.com can't count: `allow` or `deny`." }),
  })
  .meta({ id: "UpdateRiskLimitBucketRequest", examples: [{ limit: 10, burst: 20 }] });
export type UpdateRiskLimitBucketRequestOutput = z.output<typeof UpdateRiskLimitBucketRequest>;

export const RiskLimitBucketList = z
  .object({
    object: z.literal("list"),
    data: z.array(RiskLimitBucket),
    has_more: z.literal(false),
  })
  .meta({
    id: "RiskLimitBucketList",
    description: `Every bucket of the environment (at most ${MAX_RISK_LIMIT_BUCKETS}), by name.`,
    examples: [{ object: "list", data: [LIMIT_BUCKET_EXAMPLE], has_more: false }],
  });
export type RiskLimitBucketListOutput = z.output<typeof RiskLimitBucketList>;

export const DeletedRiskLimitBucket = z
  .object({ object: z.literal("risk_limit_bucket"), id: z.string(), deleted: z.literal(true) })
  .meta({ id: "DeletedRiskLimitBucket" });

export const CheckRiskLimitRequest = z
  .strictObject({
    bucket: BucketName.meta({ description: "The bucket's name." }),
    key: z.string().min(1).max(512).meta({
      description:
        "Who or what is limited: a user id, an email address, an IP address… coss.com keeps only a keyed hash of it.",
    }),
    cost: z.number().int().min(1).max(MAX_RISK_LIMIT).optional().meta({
      description: "Tokens this request takes. Default 1.",
    }),
  })
  .meta({
    id: "CheckRiskLimitRequest",
    examples: [{ bucket: "password_reset", key: "ada@example.com" }],
  });
export type CheckRiskLimitRequestOutput = z.output<typeof CheckRiskLimitRequest>;

export const RiskLimit = z
  .object({
    object: z.literal("risk_limit"),
    bucket: z.string().meta({ description: "The bucket's name." }),
    allowed: z.boolean().meta({
      description: "Whether to let the request through. Denied requests take no tokens.",
    }),
    limit: z.number().int().meta({ description: "The bucket's size (`burst`)." }),
    remaining: z.number().int().meta({ description: "Tokens left for this key." }),
    reset_ms: z
      .number()
      .int()
      .meta({ description: "Milliseconds until the key's bucket is full again." }),
    retry_after_ms: z.number().int().nullable().meta({
      description:
        "When denied: milliseconds until the same request would be allowed; `null` when it never would (`cost` above the bucket's size). 0 when allowed.",
    }),
    degraded: z.boolean().meta({
      description:
        "coss.com couldn't count (its store was unavailable): `allowed` is the bucket's `on_failure`.",
    }),
  })
  .meta({
    id: "RiskLimit",
    examples: [
      {
        object: "risk_limit",
        bucket: "password_reset",
        allowed: true,
        limit: 5,
        remaining: 4,
        reset_ms: 720000,
        retry_after_ms: 0,
        degraded: false,
      },
    ],
  });
export type RiskLimitOutput = z.output<typeof RiskLimit>;

// ---------------------------------------------------------------------------------------------
// Calibration: what feedback says about the environment's reasons and rules.
// ---------------------------------------------------------------------------------------------

/** How far back calibration reads assessments. */
export const CALIBRATION_WINDOW_DAYS = 90;
/** A reason needs this many assessments with feedback before calibration suggests a weight. */
export const MIN_CALIBRATION_FEEDBACK = 20;

const RiskCalibrationCounts = {
  fraud: z.number().int().meta({ description: "With feedback `fraud` or `abuse`." }),
  legitimate: z.number().int().meta({ description: "With feedback `legitimate`." }),
  precision: z.number().nullable().meta({
    description:
      "`fraud / (fraud + legitimate)`: how often it was right when you told coss.com. `null` without feedback.",
  }),
};

export const RiskCalibration = z
  .object({
    object: z.literal("risk_calibration"),
    window_days: z.number().int().meta({ description: "How many days back it looks." }),
    assessments: z.number().int().meta({ description: "Assessments in the window." }),
    labeled: z.number().int().meta({ description: "Of those, with feedback." }),
    reasons: z
      .array(
        z
          .object({
            code: z.enum(WEIGHTABLE_REASON_CODES).meta({ description: "The reason's code." }),
            fired: z.number().int().meta({ description: "Assessments it fired in." }),
            ...RiskCalibrationCounts,
            default_weight: z
              .number()
              .meta({ description: "Its weight unless this environment changes it." }),
            weight: z.number().meta({ description: "Its weight in this environment now." }),
            suggested_weight: z
              .number()
              .nullable()
              .meta({
                description: `The weight feedback supports: its precision, pulled toward the default while there is little feedback. \`null\` below ${MIN_CALIBRATION_FEEDBACK} assessments with feedback.`,
              }),
          })
          .meta({ id: "RiskCalibrationReason" }),
      )
      .meta({ description: "How each reason did against your feedback." }),
    rules: z
      .array(
        z
          .object({
            rule: z.string().meta({ description: "The rule's id." }),
            name: z.string().meta({ description: "The rule's name." }),
            matched: z.number().int().meta({ description: "Assessments it decided." }),
            ...RiskCalibrationCounts,
          })
          .meta({ id: "RiskCalibrationRule" }),
      )
      .meta({ description: "How each rule did against your feedback." }),
  })
  .meta({
    id: "RiskCalibration",
    description:
      "Feedback against the reasons and rules that fired, over the last 90 days. Feedback you give mostly on reviews and blocks over-represents those: read precision as a guide, not a measurement.",
    examples: [
      {
        object: "risk_calibration",
        window_days: CALIBRATION_WINDOW_DAYS,
        assessments: 1840,
        labeled: 212,
        reasons: [
          {
            code: "ip.hosting_provider",
            fired: 96,
            fraud: 4,
            legitimate: 38,
            precision: 0.095,
            default_weight: 0.25,
            weight: 0.25,
            suggested_weight: 0.16,
          },
        ],
        rules: [
          {
            rule: "rskrule_01k7c8m4q2f3e9v6t5r1n0p8yz",
            name: "Disposable email from a data center",
            matched: 31,
            fraud: 12,
            legitimate: 1,
            precision: 0.923,
          },
        ],
      },
    ],
  });
export type RiskCalibrationOutput = z.output<typeof RiskCalibration>;
