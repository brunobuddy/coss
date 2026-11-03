/**
 * How long coss.com keeps each kind of data: the single source of the worker's purges (each in the
 * package that owns the tables) and of the published policy (docs and dashboard). Client-safe:
 * no dependencies, never imports `@coss/db`.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days each purged kind of data is kept, counted from `RETENTION_POLICY`'s `after`. */
export const RETENTION_DAYS = {
  /** Emails with their recipients, events, links and attachment metadata (not queued or scheduled). */
  emails: 45,
  /** Received emails with their headers, bodies, raw message and attachments. */
  receivedEmails: 30,
  /** SMS messages with their delivery events (not queued or scheduled). */
  smsMessages: 45,
  /** SMS received on an organization's numbers. */
  receivedSms: 30,
  /** DMARC aggregate reports about a domain, with their rows. */
  dmarcReports: 90,
  /** Settled DMARC notification emails (readiness for a stricter policy, failing mail). */
  dmarcNotifications: 90,
  /** Webhook messages with their deliveries and attempts (once none is pending). */
  webhookDeliveries: 30,
  /** `coss listen` listeners and what they were handed, once the listener has expired or was closed. */
  webhookListeners: 1,
  /** Log drain batches with their lines and attempt logs (once finished). */
  logDrainBatches: 7,
  /** Lines queued for a log drain that never got into a batch (e.g. while its organization is suspended). */
  logDrainBacklog: 3,
  /** Hourly reputation counts: the longest reputation window (30 days) plus a day. */
  reputationRollups: 31,
  /** Hourly delivery counts per dedicated IP (warm-up progress looks at the last 7 days). */
  dedicatedIpRollups: 31,
  /** Content screening verdicts. */
  contentScreenings: 90,
  /** Settled reputation notification emails. */
  reputationNotifications: 90,
  /** Standing changes (an organization's latest one is always kept). */
  reputationHistory: 730,
  /** Platform admin actions. */
  adminAuditLog: 730,
  /** Load balancer, CDN and network flow logs, expired by their bucket's lifecycle rule. */
  accessLogs: 90,
  /** Sessions, verification tokens and invitations, counted from their expiry. */
  expiredAuth: 7,
  /** Risk assessments with their reasons, signals and feedback. */
  riskAssessments: 365,
  /** The email address, IP address and user agent on a risk assessment (removed before the rest). */
  riskPersonalData: 90,
  /** What an environment remembers (hashed mailboxes and reported identifiers), since last seen. */
  riskMemory: 365,
  /** Invoices, with their lines, payments and credit notes: what tax law needs (they outlive the account). */
  invoices: 3650,
  /** Hourly metered usage (invoices keep each month's totals). */
  billingUsage: 400,
  /** Events received from the payment provider, once processed. */
  billingProviderEvents: 30,
  /** Settled billing notification emails (usage alerts, payment reminders). */
  billingNotifications: 90,
  /** Settled notification emails to owners and admins (e.g. an SMS sender's registration). */
  notifications: 90,
  /** Settled push notifications to the iOS app (what was sent, not its text). */
  pushNotifications: 30,
  /**
   * Hooks messages with their deliveries and attempts: whole days are dropped (by message day),
   * including deliveries still held for a suspended organization and messages of deleted
   * applications.
   */
  hookMessages: 30,
  /** Hooks portal sessions, counted from their expiry. */
  hookPortalSessions: 1,
  /** Sign's signing and builder sessions, counted from their expiry. */
  signSessions: 7,
  /** Verify's verification requests: the phone number or email address and what happened. */
  verifications: 30,
  /** Finished Hooks endpoint recoveries. */
  hookRecoveries: 7,
  /** Contacts that never confirmed a double opt-in, counted from when it was requested. */
  pendingContacts: 30,
  /** Finished imports from another provider (their report), counted from when they started. */
  migrations: 90,
  /** Imports never started (the provider's key they hold included). */
  migrationDrafts: 1,
  /** Accepted form submissions (with their files), counted from when they were received. */
  formSubmissions: 90,
  /** Form submissions flagged as spam, held, or never confirmed by the submitter. */
  formSpam: 14,
  /** Attendees' details and answers on a booking, counted from when the booking ended. */
  schedulingPersonalData: 90,
  /** What's left of a booking once redacted (time, host, status), counted from when it ended. */
  schedulingBookings: 395,
} as const satisfies Record<string, number>;

export type RetentionPeriod =
  | { days: number; after: "creation" | "expiry" | "booking_end" }
  | { until: "sent" | "deleted" | "closed" };

export type RetentionRule = {
  id: string;
  label: string;
  description: string;
  period: RetentionPeriod;
};

/** The published policy, in display order. */
export const RETENTION_POLICY: readonly RetentionRule[] = [
  {
    id: "emails",
    label: "Emails",
    description:
      "Subject, bodies, addresses, headers, tags, recipient statuses, delivery events, opens, clicks and attachment names. Queued and scheduled emails are kept until they are sent or canceled, and a broadcast's emails until the broadcast is finished.",
    period: { days: RETENTION_DAYS.emails, after: "creation" },
  },
  {
    id: "attachment_content",
    label: "Attachment content",
    description:
      "The bytes of attachments; only their name, type, size and checksum stay with the email.",
    period: { until: "sent" },
  },
  {
    id: "discarded_email_content",
    label: "Email content without content storage",
    description:
      "In environments whose content storage is set to discard: the subject, bodies, headers, template variables and attachment names. The rest of the email (addresses, tags, recipient statuses, events) is kept like any other.",
    period: { until: "sent" },
  },
  {
    id: "received_emails",
    label: "Received emails",
    description:
      "Emails sent to your receiving addresses: the raw message, headers, bodies, attachments and spam and authentication verdicts. You can also delete one right away.",
    period: { days: RETENTION_DAYS.receivedEmails, after: "creation" },
  },
  {
    id: "sms_messages",
    label: "SMS messages",
    description:
      "Text, phone numbers, tags, segment counts and delivery events. Queued and scheduled messages are kept until they are sent or canceled.",
    period: { days: RETENTION_DAYS.smsMessages, after: "creation" },
  },
  {
    id: "received_sms",
    label: "Received SMS",
    description:
      "Replies and other messages sent to your phone numbers: the text and the sender's number.",
    period: { days: RETENTION_DAYS.receivedSms, after: "creation" },
  },
  {
    id: "verifications",
    label: "Verifications",
    description:
      "One-time code requests: the phone number or email address, the channel, the status, attempts and why one was blocked. Codes are never stored, only a keyed hash until they expire.",
    period: { days: RETENTION_DAYS.verifications, after: "creation" },
  },
  {
    id: "dmarc_reports",
    label: "DMARC reports",
    description:
      "Aggregate reports mailbox providers send about your domains: the reporting organization, source IP addresses, message counts and authentication results. The report emails themselves are not kept.",
    period: { days: RETENTION_DAYS.dmarcReports, after: "creation" },
  },
  {
    id: "idempotency_keys",
    label: "Idempotency keys",
    description: "A request repeated with the same Idempotency-Key replays the first response.",
    period: { days: 1, after: "creation" },
  },
  {
    id: "webhook_deliveries",
    label: "Webhook deliveries",
    description:
      "Event payloads, delivery statuses and attempt logs (including response excerpts). Deliveries still being retried are kept until they finish.",
    period: { days: RETENTION_DAYS.webhookDeliveries, after: "creation" },
  },
  {
    id: "webhook_listeners",
    label: "CLI webhook listeners",
    description:
      "Listeners `coss listen` opens to receive the environment's events, and the forwarding status (local status code, duration, error) the CLI reports for each event. The events themselves are kept as webhook deliveries.",
    period: { days: RETENTION_DAYS.webhookListeners, after: "expiry" },
  },
  {
    id: "hook_messages",
    label: "Hooks messages",
    description:
      "Messages you send to your applications (payloads), their deliveries and attempt logs (including response excerpts). Deleting an application stops access to its messages at once; they are deleted with the rest of their day.",
    period: { days: RETENTION_DAYS.hookMessages, after: "creation" },
  },
  {
    id: "hook_portal_sessions",
    label: "Hooks portal sessions",
    description:
      "Sign-ins to the portal you create for your applications' users (never the token itself).",
    period: { days: RETENTION_DAYS.hookPortalSessions, after: "expiry" },
  },
  {
    id: "log_drain_batches",
    label: "Log drain batches",
    description: `The lines sent to your log drains and their delivery attempts (including response excerpts). Lines that could not be sent within ${RETENTION_DAYS.logDrainBacklog} days are dropped.`,
    period: { days: RETENTION_DAYS.logDrainBatches, after: "creation" },
  },
  {
    id: "content_screenings",
    label: "Content screening results",
    description:
      "Verdicts of the automated abuse screening. The screened content itself is never stored.",
    period: { days: RETENTION_DAYS.contentScreenings, after: "creation" },
  },
  {
    id: "reputation_statistics",
    label: "Reputation statistics",
    description:
      "Hourly bounce, complaint and Hooks delivery failure counts behind your account standing.",
    period: { days: RETENTION_DAYS.reputationRollups, after: "creation" },
  },
  {
    id: "dedicated_ip_statistics",
    label: "Dedicated IP statistics",
    description: "Hourly delivery counts per sending IP of your dedicated IPs.",
    period: { days: RETENTION_DAYS.dedicatedIpRollups, after: "creation" },
  },
  {
    id: "reputation_notifications",
    label: "Standing notification emails",
    description: "Records of the emails sent to owners and admins about a warning or suspension.",
    period: { days: RETENTION_DAYS.reputationNotifications, after: "creation" },
  },
  {
    id: "dmarc_notifications",
    label: "DMARC notification emails",
    description:
      "Records of the emails sent to owners and admins when a domain is ready for a stricter DMARC policy, or its mail fails DMARC.",
    period: { days: RETENTION_DAYS.dmarcNotifications, after: "creation" },
  },
  {
    id: "reputation_history",
    label: "Account standing history",
    description:
      "Warnings, suspensions and reinstatements. The latest change is kept while the organization exists.",
    period: { days: RETENTION_DAYS.reputationHistory, after: "creation" },
  },
  {
    id: "risk_assessments",
    label: "Risk assessments",
    description:
      "Decisions, scores, reasons, signals (ASN, country, counts) and the feedback you sent. Your user id stays until you ask coss.com to forget the user.",
    period: { days: RETENTION_DAYS.riskAssessments, after: "creation" },
  },
  {
    id: "risk_personal_data",
    label: "Risk assessment personal data",
    description:
      "The email address, IP address and user agent you sent with an assessment. Only keyed hashes remain afterwards.",
    period: { days: RETENTION_DAYS.riskPersonalData, after: "creation" },
  },
  {
    id: "risk_memory",
    label: "Risk memory",
    description:
      "Keyed hashes of mailboxes that have an account and of identifiers you reported as fraud or abuse (IP addresses count for 30 days), and the countries and networks each user logged in from (by keyed hash of your user id), counted from when they were last seen.",
    period: { days: RETENTION_DAYS.riskMemory, after: "creation" },
  },
  {
    id: "admin_audit_log",
    label: "Admin audit log",
    description: "Actions coss.com staff take on organizations and users.",
    period: { days: RETENTION_DAYS.adminAuditLog, after: "creation" },
  },
  {
    id: "access_logs",
    label: "Network and access logs",
    description:
      "Our load balancer, CDN and network flow logs: IP addresses, requested URLs, user agents and connection details, kept to investigate abuse and security incidents.",
    period: { days: RETENTION_DAYS.accessLogs, after: "creation" },
  },
  {
    id: "expired_auth",
    label: "Expired sessions and invitations",
    description:
      "Sign-in sessions (with the iOS app's push notification registration), verification and reset tokens, and invitations that were never accepted.",
    period: { days: RETENTION_DAYS.expiredAuth, after: "expiry" },
  },
  {
    id: "invoices",
    label: "Invoices and payments",
    description:
      "Invoices with their line items, payments and credit notes, as tax law requires. Kept after your account is closed.",
    period: { days: RETENTION_DAYS.invoices, after: "creation" },
  },
  {
    id: "billing_usage",
    label: "Usage records",
    description:
      "Hourly counts of billable usage per environment, and which project, API key and member (for personal keys) each came from. Each invoice keeps its month's totals.",
    period: { days: RETENTION_DAYS.billingUsage, after: "creation" },
  },
  {
    id: "billing_notifications",
    label: "Billing notification emails",
    description: "Records of usage alerts and payment reminders sent to your billing contacts.",
    period: { days: RETENTION_DAYS.billingNotifications, after: "creation" },
  },
  {
    id: "notifications",
    label: "Notification emails",
    description:
      "Records of the emails sent to owners and admins about what to do next, such as registering an SMS sender and the outcome of its review.",
    period: { days: RETENTION_DAYS.notifications, after: "creation" },
  },
  {
    id: "push_notifications",
    label: "Push notifications",
    description:
      "Records of the notifications sent to the iOS app: their kind, subject and how many devices received them, never their text.",
    period: { days: RETENTION_DAYS.pushNotifications, after: "creation" },
  },
  {
    id: "payment_provider_events",
    label: "Payment provider events",
    description: "Notifications from our payment processor about invoices and payments.",
    period: { days: RETENTION_DAYS.billingProviderEvents, after: "creation" },
  },
  {
    id: "suppressions",
    label: "Suppressions",
    description:
      "Email addresses and phone numbers that sends skip, including SMS opt-outs. Never removed automatically, so a bounced address or an opted-out number stays protected.",
    period: { until: "deleted" },
  },
  {
    id: "inboxes",
    label: "Inboxes",
    description:
      "Inboxes with their addresses and names, and their threads' subjects and participants. Each message of a thread goes with its email (sent or received, as above), and a thread goes a day after its last message did.",
    period: { until: "deleted" },
  },
  {
    id: "contacts",
    label: "Contacts",
    description:
      "Your contacts with their custom properties, audience memberships, topic choices and consent timestamps (when they subscribed, unsubscribed or confirmed). Kept until you delete them.",
    period: { until: "deleted" },
  },
  {
    id: "pending_contacts",
    label: "Unconfirmed contacts",
    description:
      "Contacts asked to confirm their subscription (double opt-in) who never did, deleted with their memberships and choices. One who had opted out (unsubscribed before, or left a topic) is kept, unsubscribed.",
    period: { days: RETENTION_DAYS.pendingContacts, after: "creation" },
  },
  {
    id: "broadcasts",
    label: "Broadcasts",
    description:
      "Broadcasts with their content and their counters (recipients, deliveries, bounces, complaints, opens, clicks, unsubscribes). Kept until you delete them; each email they made is kept like any other email once the broadcast is finished.",
    period: { until: "deleted" },
  },
  {
    id: "signing_sessions",
    label: "Signing and builder sessions",
    description:
      "Links to the signing page and the template builder you create (never the token itself), and the ones emailed to signers.",
    period: { days: RETENTION_DAYS.signSessions, after: "expiry" },
  },
  {
    id: "signature_requests",
    label: "Signature requests",
    description:
      "Documents uploaded for signing, and signature requests with their signers, the fields they filled and their audit trail (with the addresses and browsers they signed from). Kept until you delete them: they are your records of what was signed.",
    period: { until: "deleted" },
  },
  {
    id: "form_submissions",
    label: "Form submissions",
    description:
      "What was submitted to your forms, with uploaded files, the submitter's address, browser and the page it came from. Submissions you delete, and files of submissions you delete, are removed right away.",
    period: { days: RETENTION_DAYS.formSubmissions, after: "creation" },
  },
  {
    id: "form_spam",
    label: "Spam and unconfirmed form submissions",
    description:
      "Form submissions flagged as spam or held for review that you didn't release, and submissions whose submitter never confirmed their email address.",
    period: { days: RETENTION_DAYS.formSpam, after: "creation" },
  },
  {
    id: "scheduling_personal_data",
    label: "Booking attendee details",
    description:
      "The attendee's name, email address and phone number, their answers to booking questions and the booking's metadata. You can also erase an attendee right away.",
    period: { days: RETENTION_DAYS.schedulingPersonalData, after: "booking_end" },
  },
  {
    id: "scheduling_bookings",
    label: "Bookings",
    description:
      "A booking's time, host, event type, status and history, without its attendee's details. Calendars contribute only busy times, which are replaced as calendars change and deleted when a calendar is disconnected.",
    period: { days: RETENTION_DAYS.schedulingBookings, after: "booking_end" },
  },
  {
    id: "migrations",
    label: "Imports from other providers",
    description: `Reports of imports from Resend, SendGrid or Postmark: what was found, what was imported and what needs attention. The provider's API key is deleted as soon as an import finishes or is canceled, and an import that is never started is deleted after ${formatRetentionDays(RETENTION_DAYS.migrationDrafts)}. What it imported is kept like anything you create yourself.`,
    period: { days: RETENTION_DAYS.migrations, after: "creation" },
  },
  {
    id: "account",
    label: "Account and configuration",
    description:
      "Users, organizations, projects, environments, API keys, domains, SMS phone numbers and carrier registrations (with the business details they were registered with), email templates (with every published version), webhook endpoints, log drains, Hooks applications, event types and endpoints, risk allow and block lists, forms, scheduling hosts, schedules, event types and connected calendars, contact properties, audiences, segments, topics, settings, and billing details (plan, contracts and credits). Items you delete (a key, a domain, a template, an endpoint, a drain, an application) are removed right away.",
    period: { until: "closed" },
  },
];

/** The moment before which data kept for `days` is due for deletion. */
export function retentionCutoff(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

/** A human-readable duration: "24 hours", "45 days", "2 years". */
export function formatRetentionDays(days: number): string {
  if (days === 1) return "24 hours";
  if (days % 365 === 0) return days === 365 ? "1 year" : `${days / 365} years`;
  return `${days} days`;
}

/** How long a rule keeps its data, e.g. "45 days", "7 days after expiry", "Until sent". */
export function formatRetentionPeriod(period: RetentionPeriod): string {
  if ("until" in period) {
    if (period.until === "sent") return "Until the email is sent";
    return period.until === "deleted" ? "Until you delete it" : "While your account exists";
  }
  const duration = formatRetentionDays(period.days);
  if (period.after === "booking_end") return `${duration} after the booking ends`;
  return period.after === "expiry" ? `${duration} after expiry` : duration;
}
