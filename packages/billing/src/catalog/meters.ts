/** What coss.com meters: one meter per billable unit of a product. */

export const PRODUCTS = [
  "email",
  "sms",
  "sign",
  "risk",
  "verify",
  "forms",
  "video",
  "scheduling",
  "hooks",
] as const;
export type Product = (typeof PRODUCTS)[number];

export type MeterDefinition = {
  product: Product;
  label: string;
  /** Singular and plural unit names, e.g. "recipient" / "recipients". */
  unit: string;
  units: string;
  /** Prices are shown per this many units ("$0.40 per 1,000 recipients"). */
  displayPer: number;
  /** Dimensions usage is recorded with and rates can vary by, e.g. `country` for SMS. */
  dimensions: readonly string[];
  /** `commitment`: only usable under a contract with a commitment covering this meter. */
  requires: "plan" | "commitment";
  /** The units measure the usage ("1,000 MB of form uploads") rather than count it. */
  measure?: true;
};

export const METERS = {
  "email.recipients": {
    product: "email",
    label: "Email",
    unit: "recipient",
    units: "recipients",
    displayPer: 1000,
    dimensions: [],
    requires: "plan",
  },
  // Email sent through an organization's dedicated IPs (the Dedicated IPs add-on), on top of
  // `email.recipients`.
  "email.dedicated_ip": {
    product: "email",
    label: "Email via dedicated IPs",
    unit: "recipient",
    units: "recipients",
    displayPer: 1000,
    dimensions: [],
    requires: "plan",
  },
  // Attachments past `EMAIL_DATA_INCLUDED_MB` per email, per recipient billed, in MB: SES charges
  // for attachment data on top of the message, so large ones would otherwise sell below cost.
  "email.attachment_data": {
    product: "email",
    label: "Email attachments",
    unit: "MB",
    units: "MB",
    displayPer: 1000,
    dimensions: [],
    requires: "plan",
    measure: true,
  },
  // Mail received through the receiving provider (SES), in any environment: routed messages
  // stored (not dropped), except those with a spam or virus verdict.
  "email.received": {
    product: "email",
    label: "Received email",
    unit: "email",
    units: "emails",
    displayPer: 1000,
    dimensions: [],
    requires: "plan",
  },
  // Received messages past `EMAIL_DATA_INCLUDED_MB`, per copy billed as `email.received`, in MB:
  // SES charges per 256 KB received and the content is kept for the messages' retention.
  "email.received_data": {
    product: "email",
    label: "Received email data",
    unit: "MB",
    units: "MB",
    displayPer: 1000,
    dimensions: [],
    requires: "plan",
    measure: true,
  },
  // Live inboxes, per day each one exists (a day is charged when it starts: on creation, then
  // daily). Priced per 30 inbox-days, an inbox for a month.
  "email.inboxes": {
    product: "email",
    label: "Inboxes",
    unit: "inbox-day",
    units: "inbox-days",
    displayPer: 30,
    dimensions: [],
    requires: "plan",
  },
  // Priced by destination country; a country without a rate can't be sent to.
  "sms.segments": {
    product: "sms",
    label: "SMS",
    unit: "segment",
    units: "segments",
    displayPer: 1,
    dimensions: ["country"],
    requires: "plan",
  },
  // Replies and opt-outs received on an organization's numbers, by the number's country.
  "sms.received_segments": {
    product: "sms",
    label: "SMS received",
    unit: "segment",
    units: "segments",
    displayPer: 1,
    dimensions: ["country"],
    requires: "plan",
  },
  // Phone numbers, per month held (`type=local` or `type=toll_free`), passed through at cost.
  "sms.numbers": {
    product: "sms",
    label: "SMS phone numbers",
    unit: "number-month",
    units: "number-months",
    displayPer: 1,
    dimensions: ["type"],
    requires: "plan",
  },
  // Carrier registration fees (US A2P 10DLC brands and campaigns), passed through at cost.
  "sms.registrations": {
    product: "sms",
    label: "SMS registration fees",
    unit: "fee",
    units: "fees",
    displayPer: 1,
    dimensions: ["fee"],
    requires: "plan",
  },
  // Sign: a signature request every signer signed, once its sealed document exists. Not priced yet:
  // until a rate card prices it, invoices show the usage as an uncharged line.
  "sign.completed_requests": {
    product: "sign",
    label: "Signature requests",
    unit: "completed request",
    units: "completed requests",
    displayPer: 1,
    dimensions: [],
    requires: "plan",
  },
  // Risk: a live phone check that got an answer from the phone data provider (Twilio Lookup).
  // Invalid numbers, failed lookups and sandbox checks are free.
  "risk.phone_checks": {
    product: "risk",
    label: "Risk phone",
    unit: "check",
    units: "checks",
    displayPer: 1,
    dimensions: [],
    requires: "plan",
  },
  // Verify: a verification whose code was checked correctly (failed, blocked and expired ones are
  // free). The channel's own cost is billed on its own meter.
  "verify.verifications": {
    product: "verify",
    label: "Verifications",
    unit: "verification",
    units: "verifications",
    displayPer: 1,
    dimensions: [],
    requires: "plan",
  },
  // Verify's codes sent from coss.com's shared numbers, priced like SMS by destination country (an
  // organization's own numbers bill `sms.segments` instead).
  "verify.sms": {
    product: "verify",
    label: "Verification SMS",
    unit: "segment",
    units: "segments",
    displayPer: 1,
    dimensions: ["country"],
    requires: "plan",
  },
  // Forms: a submission accepted for delivery (spam, held and unconfirmed ones aren't counted
  // until released or confirmed).
  "forms.submissions": {
    product: "forms",
    label: "Form submissions",
    unit: "submission",
    units: "submissions",
    displayPer: 1000,
    dimensions: [],
    requires: "plan",
  },
  // The files of an accepted submission, in MB (2^20 bytes, rounded up per submission), counted
  // with it: the price covers keeping them for the submissions' retention.
  "forms.file_uploads": {
    product: "forms",
    label: "Form uploads",
    unit: "MB",
    units: "MB",
    displayPer: 1000,
    dimensions: [],
    requires: "plan",
    measure: true,
  },
  "video.participant_minutes": {
    product: "video",
    label: "Video",
    unit: "participant-minute",
    units: "participant-minutes",
    displayPer: 1000,
    dimensions: [],
    requires: "plan",
  },
  "scheduling.bookings": {
    product: "scheduling",
    label: "Scheduling",
    unit: "booking",
    units: "bookings",
    displayPer: 1,
    dimensions: [],
    requires: "plan",
  },
  // Hooks: a live message accepted, once whatever its fan-out. Retries, recoveries, test sends and
  // sandbox are free; delivery quotas bound the fan-out.
  "hooks.messages": {
    product: "hooks",
    label: "Hooks",
    unit: "message",
    units: "messages",
    displayPer: 1000,
    dimensions: [],
    requires: "plan",
  },
} as const satisfies Record<string, MeterDefinition>;

/** The size of an email that its per-email price covers; the rest is on the data meters. */
export const EMAIL_DATA_INCLUDED_MB = 1;

/**
 * What `bytes` of an email bill on a data meter (`email.attachment_data` per recipient,
 * `email.received_data` per copy): whole MB (2^20 bytes) past the included size, rounded up.
 */
export function billableEmailMegabytes(bytes: number): number {
  return Math.max(0, Math.ceil(bytes / 2 ** 20 - EMAIL_DATA_INCLUDED_MB));
}

export type MeterKey = keyof typeof METERS;
export const METER_KEYS = Object.keys(METERS) as [MeterKey, ...MeterKey[]];

export function isMeterKey(value: string): value is MeterKey {
  return Object.hasOwn(METERS, value);
}

/**
 * What a meter's units are called in a sentence: "email recipients", "form submissions" (a
 * label that already names them isn't followed by them again), "MB of form uploads".
 */
export function meterUnitsName(meter: MeterKey): string {
  const definition: MeterDefinition = METERS[meter];
  const name = definition.label.toLowerCase();
  if (definition.measure) return `${definition.units} of ${name}`;
  return name.endsWith(definition.units) ? name : `${name} ${definition.units}`;
}

/** "3,000 email recipients", "1,000 MB of form uploads". */
export function meterAmount(meter: MeterKey, quantity: number): string {
  return `${quantity.toLocaleString("en-US")} ${meterUnitsName(meter)}`;
}

/**
 * The canonical form of a usage dimension: `""` for none, else sorted `name=value` pairs joined
 * by `&` (`country=US`). Rates and usage rows are keyed by it.
 */
export function dimensionKey(dimensions: Readonly<Record<string, string>> | undefined): string {
  if (!dimensions) return "";
  return Object.keys(dimensions)
    .sort()
    .map((name) => `${name}=${dimensions[name]}`)
    .join("&");
}

/** How dimension values other than country codes read on invoices and price lists. */
const DIMENSION_VALUE_LABELS: Readonly<Record<string, string>> = {
  local: "local",
  toll_free: "toll-free",
  brand: "brand registration",
  brand_vetting: "brand vetting",
  campaign_vetting: "campaign vetting",
  campaign_monthly: "campaign, monthly",
  campaign_monthly_low_volume: "low-volume campaign, monthly",
};

/** "country=US" → "US"; "type=toll_free" → "toll-free"; "" → "". */
export function formatDimension(key: string): string {
  return key
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const value = pair.slice(pair.indexOf("=") + 1);
      return DIMENSION_VALUE_LABELS[value] ?? value;
    })
    .join(", ");
}
