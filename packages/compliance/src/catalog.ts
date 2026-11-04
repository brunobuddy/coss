/**
 * What HIPAA mode is, as data: enforcement and the customer's compliance page both read this, so
 * they can't disagree. When a vendor signs a BAA, its entry here is the change. Client-safe: no imports.
 */

export const HIPAA_IDLE_TIMEOUT_MINUTES = 15;

/** Twilio's HIPAA-eligible SMS covers US numbers only. */
export const HIPAA_SMS_COUNTRIES: readonly string[] = ["US"];

export type HipaaVendorStatus =
  /** Handles PHI for these organizations under a signed BAA. */
  | "under_baa"
  /** Never reached for these organizations: the mode turns that use off. */
  | "not_used"
  /** Reached, without a BAA, for something that shouldn't hold PHI. */
  | "no_phi_expected"
  /** Reached without a BAA and could hold PHI. A real gap, so the page says so. */
  | "no_baa";

export type HipaaVendor = {
  name: string;
  purpose: string;
  status: HipaaVendorStatus;
  note?: string;
};

export const HIPAA_VENDORS = {
  aws: {
    name: "Amazon Web Services",
    purpose: "Hosting, database, file storage and email delivery (SES)",
    status: "under_baa",
  },
  twilio_messaging: {
    name: "Twilio Programmable Messaging",
    purpose: "SMS delivery",
    status: "under_baa",
    note: "US numbers only, which is what Twilio's BAA covers.",
  },
  ai_gateway: {
    name: "Vercel AI Gateway",
    purpose: "AI content screening and classification",
    status: "not_used",
  },
  twilio_lookup: {
    name: "Twilio Lookup",
    purpose: "Phone number checks",
    status: "not_used",
  },
  apple_push: {
    name: "Apple Push Notification service",
    purpose: "Notifications to the iOS app",
    status: "not_used",
  },
  stripe: {
    name: "Stripe",
    purpose: "Payments",
    status: "no_phi_expected",
    note: "Receives billing contacts and invoices only.",
  },
  google_workspace: {
    name: "Google Workspace",
    purpose: "Mail sent to support@coss.com",
    status: "under_baa",
  },
  sentry: {
    name: "Sentry",
    purpose: "Error reports",
    status: "no_baa",
    note: "Content, email addresses and phone numbers are removed from reports, but error text can't be guaranteed free of PHI.",
  },
} as const satisfies Record<string, HipaaVendor>;

export type HipaaVendorId = keyof typeof HIPAA_VENDORS;

/** Whether coss.com may send PHI to this vendor. */
export function hipaaVendorCovered(id: HipaaVendorId): boolean {
  return HIPAA_VENDORS[id].status === "under_baa";
}

export const HIPAA_CONTROL_GROUPS = [
  "Sharing",
  "Stored data",
  "Access",
  "Transmission",
  "Records",
] as const;

export type HipaaControlGroup = (typeof HIPAA_CONTROL_GROUPS)[number];

export type HipaaControlId =
  | "ai_screening"
  | "ai_classification"
  | "phone_lookup"
  | "push"
  | "sms_scope"
  | "email_content"
  | "tracking"
  | "request_logs"
  | "two_factor"
  | "idle_logoff"
  | "staff_access"
  | "required_tls"
  | "audit_log";

export type HipaaControl = {
  id: HipaaControlId;
  group: HipaaControlGroup;
  label: string;
  description: string;
};

export const HIPAA_CONTROLS: readonly HipaaControl[] = [
  {
    id: "ai_screening",
    group: "Sharing",
    label: "AI screening off",
    description: "Your messages are never sampled or sent to an AI model.",
  },
  {
    id: "ai_classification",
    group: "Sharing",
    label: "AI classification off",
    description:
      "Risk, Forms and Scheduling never send text to an AI model. Form submissions and assessments continue without content scores.",
  },
  {
    id: "phone_lookup",
    group: "Sharing",
    label: "Phone lookups off",
    description: "Live phone checks are refused, so numbers aren't sent to Twilio Lookup.",
  },
  {
    id: "push",
    group: "Sharing",
    label: "Push notifications off",
    description: "Your organization's and projects' names don't pass through Apple.",
  },
  {
    id: "sms_scope",
    group: "Sharing",
    label: "SMS limited to US numbers",
    description:
      "Live SMS goes to US numbers only, message bodies aren't kept after sending, and Verify codes need your own number.",
  },
  {
    id: "email_content",
    group: "Stored data",
    label: "Email content discarded",
    description:
      "Subjects, bodies, headers and template variables of live emails are deleted as soon as each email is finished.",
  },
  {
    id: "tracking",
    group: "Stored data",
    label: "Open and click tracking off",
    description:
      "Live emails have no tracking pixel or rewritten links, so link URLs aren't stored. Unsubscribe links still work.",
  },
  {
    id: "request_logs",
    group: "Stored data",
    label: "Request bodies not logged",
    description:
      "API logs and log drains keep metadata such as the path and status, with no request or response bodies or query strings.",
  },
  {
    id: "two_factor",
    group: "Access",
    label: "Two-factor authentication required",
    description: "Every member needs two-factor authentication, or SSO through your own provider.",
  },
  {
    id: "idle_logoff",
    group: "Access",
    label: "Automatic logoff",
    description: `Dashboard sessions end after ${HIPAA_IDLE_TIMEOUT_MINUTES} minutes without activity. Activity in organizations outside HIPAA mode doesn't count.`,
  },
  {
    id: "staff_access",
    group: "Access",
    label: "coss.com staff can't view content",
    description:
      "Staff can't reveal email content or impersonate your members, and internal email lists hide subjects and recipients.",
  },
  {
    id: "required_tls",
    group: "Transmission",
    label: "Encrypted delivery required",
    description:
      "Email is sent only over TLS. A message is dropped rather than delivered unencrypted if the receiving server doesn't support it.",
  },
  {
    id: "audit_log",
    group: "Records",
    label: "Audit log kept",
    description:
      "Changes in your organization, including anything coss.com support does, are recorded and kept for as long as your account exists.",
  },
];

/** What coss.com can't control, shown to the customer. */
export const HIPAA_RESPONSIBILITIES: readonly string[] = [
  "Only send PHI once your BAA is in place, and only from live environments. Sandbox environments keep test emails and aren't covered by the controls above.",
  "Discarding only covers sent email and SMS. Received email and SMS, broadcasts, contacts, form submissions and bookings stay stored under your BAA for their normal retention periods.",
  "Keep PHI out of email subject lines and metadata such as tags and categories. Discarding removes a subject only once the email is finished, and tags and categories are kept.",
  "Webhook endpoints and log drains deliver to services you choose, so you need your own BAA with them where they receive PHI. Form submission webhooks include what was submitted.",
  "Calendars connected to Scheduling (Google, Microsoft, CalDAV) and Zoom receive event titles, under your own agreements with those providers.",
  "A captcha you configure on a form sends the submitter's address to that captcha provider.",
];
