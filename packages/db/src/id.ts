/**
 * TypeID-style identifiers: `<prefix>_<26 char Crockford base32 UUIDv7>`, e.g. `email_01k5f9…`.
 * Spec: https://github.com/jetify-com/typeid (v0.3). Time-sortable, URL-safe, dependency-free,
 * and runtime-neutral (Node, Bun, edge) — only `crypto.getRandomValues` is required.
 */

export const ID_PREFIXES = {
  user: "user",
  session: "session",
  account: "account",
  verification: "verification",
  organization: "org",
  member: "member",
  invitation: "invite",
  apiKey: "key",
  twoFactor: "tfa",
  passkey: "passkey",
  ssoProvider: "ssop",
  /** Public SSO provider ids (`ssoProvider.providerId`, in callback URLs). */
  ssoConnection: "sso",
  // @better-auth/scim models (its managed connection/credential ids are its own `ba_scim_…`).
  scimConnectionBinding: "scimbind",
  scimSubject: "scimsub",
  scimUser: "scimu",
  scimIdentityTombstone: "scimtomb",
  scimGroup: "scimg",
  scimGroupMember: "scimgm",
  scimProjectionGrant: "scimgrant",
  scimManagedConnection: "scimconn",
  scimManagedCredential: "scimcred",
  scimManagedConnectionEvent: "scimevt",
  /** Directory group → organization role mappings (`scim_group_role`). */
  scimGroupRole: "scimgr",
  project: "proj",
  environment: "env",
  email: "email",
  emailBatch: "batch",
  emailRecipient: "rcpt",
  emailAttachment: "att",
  emailEvent: "evt",
  emailSuppression: "sup",
  // Email for platforms: a customer's end user (`<SES_TENANT_PREFIX>-sub_…` must fit SES's 64 characters).
  emailSubaccount: "sub",
  emailTrackingRule: "etr",
  emailLink: "lnk",
  emailTemplate: "etpl",
  emailTemplateVersion: "etplv",
  emailTemplateContent: "etplc",
  // Contacts (marketing): the lists broadcasts go to, with consent per topic.
  contact: "contact",
  contactProperty: "cprop",
  audience: "aud",
  segment: "seg",
  topic: "topic",
  broadcast: "bcast",
  domain: "dom",
  trackingDomain: "tdom",
  receivingDomain: "rdom",
  dedicatedIpPool: "dip",
  receivedEmail: "rcvd",
  receivedEmailAttachment: "rcvdatt",
  dmarcReport: "dmarcrep",
  dmarcReportRecord: "dmarcrec",
  dmarcNotification: "dmarcntf",
  webhookEndpoint: "whep",
  webhookDelivery: "whdel",
  webhookAttempt: "whatt",
  // `coss listen`: temporary listeners the CLI pulls deliveries from.
  webhookListener: "whlis",
  webhookListenerDelivery: "whlisdel",
  // Webhook messages that announce something other than an email event (e.g. `account.suspended`).
  webhookEvent: "evt",
  reputationEvent: "repev",
  reputationNotification: "repntf",
  contentScreening: "scr",
  rateLimitOverride: "rlo",
  authEmail: "authml",
  request: "req",
  logEntry: "log",
  orgAuditEvent: "oaudit",
  logDrain: "drain",
  logDrainRecord: "drainrec",
  logDrainBatch: "drainbat",
  logDrainAttempt: "drainatt",
  adminAuditEvent: "audit",
  organizationDeletion: "orgdel",
  riskAssessment: "rsk",
  riskFeedback: "rskfb",
  riskIdentity: "rskid",
  riskReport: "rskrep",
  riskListEntry: "rskle",
  riskRule: "rskrule",
  riskUserNetwork: "rskun",
  riskLimitBucket: "rsklb",
  billingAccount: "bacct",
  billingContract: "bcon",
  billingCreditGrant: "bcg",
  billingCreditEntry: "bce",
  billingPeriod: "bper",
  billingInvoice: "inv",
  billingInvoiceLine: "invl",
  billingPayment: "bpay",
  billingCreditNote: "bcn",
  billingProviderEvent: "bpev",
  billingNotification: "bntf",
  billingBudget: "bbud",
  // Hooks (webhooks as a service).
  hookApplication: "happ",
  hookEventType: "hevtype",
  hookEndpoint: "hep",
  hookMessage: "hmsg",
  hookDelivery: "hdel",
  hookAttempt: "hatt",
  hookIdempotencyKey: "hidem",
  hookPortalSession: "hps",
  hookPortalSettings: "hpset",
  hookEndpointRecovery: "hrec",
  pushDevice: "pushdev",
  pushNotification: "pushntf",
  // coss.com's notification emails to organizations (`@coss/notifications`).
  notification: "ntf",
  // SMS.
  smsMessage: "sms",
  smsEvent: "smsevt",
  smsSuppression: "smssup",
  smsReceived: "smsin",
  smsNumber: "num",
  smsRegistration: "smsreg",
  // Sign (e-signatures, `@coss/sign`).
  signDocument: "sdoc",
  signRequest: "sreq",
  signSigner: "ssgn",
  signField: "sfld",
  signEvent: "sevt",
  signSession: "sgs",
  signSettings: "sset",
  signTemplate: "stpl",
  signTemplateField: "stfld",
  signBuilderSession: "sbs",
  // Inboxes for agents: addresses with threads (`@coss/email` inboxes).
  inbox: "inbox",
  inboxThread: "thread",
  inboxMessage: "imsg",
  // Verify (one-time codes, `@coss/verify`).
  verifyRequest: "vrf",
  verifySend: "vrfsend",
  verifySettings: "vrfset",
  verifyCheck: "vrfchk",
  // Forms (hosted form endpoints, `@coss/forms`).
  form: "form",
  formSubmission: "fsub",
  formSubmissionFile: "ffile",
  formDelivery: "fdlv",
  // Scheduling (`@coss/scheduling`).
  schedulingHost: "host",
  schedulingSchedule: "sched",
  schedulingEventType: "evtype",
  schedulingCalendarConnection: "calconn",
  schedulingCalendarDelegation: "caldlg",
  schedulingOauthApp: "calapp",
  schedulingCalendar: "cal",
  schedulingClaim: "claim",
  schedulingBooking: "book",
  schedulingGroupSession: "gsess",
  schedulingAttendee: "attn",
  schedulingSeries: "series",
  schedulingBookingEvent: "bevt",
  schedulingCalendarEvent: "calev",
  schedulingNotification: "sntf",
  schedulingReminderSync: "srsync",
  schedulingSession: "schs",
  schedulingOauthState: "soauth",
  schedulingSettings: "schset",
  schedulingLogo: "schlogo",
  schedulingOutOfOffice: "ooo",
  schedulingOutOfOfficeGroup: "ooogrp",
  schedulingHolidayCalendar: "hcal",
  schedulingReassignment: "reasn",
  schedulingReassignmentItem: "reasi",
  // Imports from another email provider (Resend, SendGrid, Postmark), `@coss/migrate`.
  migration: "mig",
  migrationItem: "migitem",
  // coss.com's support desk (`@coss/support`).
  supportTicket: "ticket",
  supportMessage: "tmsg",
  supportAttachment: "tatt",
  supportSavedReply: "tsaved",
  // A member's pinned or hidden dashboard products.
  productPreference: "prodpref",
} as const;

export type IdPrefix = (typeof ID_PREFIXES)[keyof typeof ID_PREFIXES];

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const PREFIX_RE = /^[a-z]([a-z_]{0,61}[a-z])?$/;
const SUFFIX_RE = /^[0-7][0-9a-hjkmnp-tv-z]{25}$/;

function uuidv7Bytes(now: number = Date.now()): Uint8Array {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // 48-bit big-endian unix ms timestamp
  let ts = now;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70; // version 7
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC 4122 variant
  return bytes;
}

function encodeBase32(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let out = "";
  for (let i = 0; i < 26; i++) {
    out = ALPHABET.charAt(Number(value & 31n)) + out;
    value >>= 5n;
  }
  return out;
}

/** Create a new prefixed, time-sortable id. */
export function newId(prefix: string, now?: number): string {
  if (!PREFIX_RE.test(prefix)) throw new Error(`Invalid id prefix: "${prefix}"`);
  return `${prefix}_${encodeBase32(uuidv7Bytes(now))}`;
}

/** True if `value` is a well-formed id with the given prefix. */
export function isId(prefix: string, value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith(`${prefix}_`)) return false;
  return SUFFIX_RE.test(value.slice(prefix.length + 1));
}

/**
 * The creation time (unix ms) a well-formed id encodes in its UUIDv7, or `null`. `newId(prefix,
 * now)` sets it explicitly (log entries use their `occurred_at`).
 */
export function idTimestamp(value: string): number | null {
  const suffix = value.slice(value.lastIndexOf("_") + 1);
  if (!SUFFIX_RE.test(suffix)) return null;
  let bits = 0n;
  for (const char of suffix) bits = (bits << 5n) | BigInt(ALPHABET.indexOf(char));
  // 128 UUID bits; the top 48 are the timestamp.
  return Number(bits >> 80n);
}
