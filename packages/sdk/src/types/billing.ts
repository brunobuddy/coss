/**
 * Billing wire types (hand-written mirrors of the API's `Billing`, `Usage`, `Invoice` and `Credit`
 * schemas). Amounts are integers in cents (USD); unit prices are dollar decimal strings.
 */

export type PlanKey = "free" | "pro" | "scale" | "enterprise";

export type Meter =
  | "email.recipients"
  | "email.dedicated_ip"
  | "email.received"
  | "email.inboxes"
  | "sms.segments"
  | "sms.received_segments"
  | "sms.numbers"
  | "sms.registrations"
  | "sign.completed_requests"
  | "risk.phone_checks"
  | "risk.assessments"
  | "risk.content_checks"
  | "verify.verifications"
  | "verify.sms"
  | "forms.submissions"
  | "forms.file_uploads"
  | "video.participant_minutes"
  | "scheduling.bookings"
  | "hooks.messages";

export type BillingHoldReason = "delinquent" | "spend_limit" | "admin";

/** `GET /v1/billing`: the organization's plan, the current month so far, and its standing. */
export interface Billing {
  object: "billing";
  organization_id: string;
  /** The plan in effect now (`free` without a contract). */
  plan: PlanKey;
  /** The contract in effect; `null` on the Free plan. */
  contract: {
    id: string;
    kind: "self_serve" | "sales" | "internal";
    effective_from: string;
    effective_until: string | null;
    /** End of a committed term. */
    term_end: string | null;
    auto_renew: boolean;
  } | null;
  /** A plan change that takes effect later (a downgrade, a cancellation). */
  scheduled_change: { effective_at: string; plan: PlanKey } | null;
  /** `past_due`: an invoice is overdue; `delinquent`: past its grace period (live sending is held). */
  status: "active" | "past_due" | "delinquent";
  /** Billing holds on live sending (sandbox keys keep working). */
  holds: { reason: BillingHoldReason; since: string }[];
  currency: "usd";
  /** The current billing month (UTC). */
  period: { start: string; end: string };
  usage: {
    meter: Meter;
    quantity: number;
    /** The plan's monthly allowance where usage stops (Free), else `null`. */
    included: number | null;
  }[];
  /** This month so far, as it would be invoiced if it ended now (cents). */
  estimate: { usage: number; discount: number; credit: number; total: number };
  /** Unused credit usable this month (cents). */
  credit_remaining: number;
  /** Usage beyond the credit past which live sending is held (cents); `null`: none. */
  spend_limit: number | null;
  payment_method: { type: string; brand: string | null; last4: string | null } | null;
  /** Add-ons of the contract in effect, charged on top of the plan. */
  add_ons: {
    /** e.g. `dedicated_ips`. */
    key: string;
    name: string;
    quantity: number;
    /** The price per unit and interval (cents). */
    unit_amount: number;
    interval: "month" | "quarter" | "year";
  }[];
  features: {
    tracking_domains: boolean;
    audit_log: boolean;
    log_drains: boolean;
    sso: boolean;
    scim: boolean;
    dedicated_ips: boolean;
  };
  /** Resource limits (`null`: unlimited). */
  limits: {
    domains: number | null;
    members: number | null;
    webhook_endpoints_per_environment: number | null;
    contacts_per_environment: number | null;
    /** Inboxes across the organization's environments. */
    inboxes: number | null;
  };
}

/** Billable usage of one meter in one bucket. */
export interface Usage {
  object: "usage";
  meter: Meter;
  /** e.g. `country=US` for SMS; `null` for none. */
  dimension: string | null;
  /** Set with `group_by: "environment"`. */
  environment_id: string | null;
  /** Set with `group_by: "project"` (`null`: usage recorded before projects were). */
  project_id: string | null;
  /** Set with `group_by: "api_key"` (`null`: the dashboard, or usage recorded before keys were). */
  api_key_id: string | null;
  /**
   * Set with `group_by: "user"`: the member whose personal API key caused it (`null`: organization
   * keys and the dashboard).
   */
  user_id: string | null;
  start: string;
  end: string;
  quantity: number;
}

export interface ListUsageParams {
  /** Start (inclusive, ISO 8601). Defaults to the start of the current billing month. */
  from?: string;
  /** End (exclusive). Defaults to now. At most 400 days after `from` (7 by hour). */
  to?: string;
  /** Bucket size (UTC). Defaults to `day`. */
  granularity?: "hour" | "day" | "month";
  /** Split each bucket per environment, project, API key or user (whose personal key it was). */
  group_by?: "environment" | "project" | "api_key" | "user";
  /** Only this meter. */
  meter?: Meter;
}

export type InvoiceStatus = "open" | "paid" | "void" | "uncollectible";

export type InvoiceLineKind =
  | "plan_fee"
  | "proration"
  | "usage"
  | "credit"
  | "discount"
  | "commitment_fee"
  | "commitment_shortfall"
  | "add_on"
  | "adjustment"
  | "write_off";

export interface InvoiceLine {
  object: "invoice_line";
  id: string;
  kind: InvoiceLineKind;
  description: string;
  meter: Meter | null;
  dimension: string | null;
  quantity: number | null;
  /** Units covered by an allowance or committed volume (not charged). */
  included_quantity: number | null;
  /** Dollars per unit, e.g. `"0.0004"`; `null` when the price varies by volume. */
  unit_price: string | null;
  /** Cents. */
  amount: number;
  period: { start: string; end: string };
}

/** An invoice without its lines (lists and webhook events). Amounts in cents. */
export interface InvoiceSummary {
  object: "invoice";
  id: string;
  number: string | null;
  kind: "period" | "plan_change" | "one_off" | "final";
  status: InvoiceStatus;
  currency: "usd";
  period: { start: string; end: string };
  subtotal: number;
  discount: number;
  credit: number;
  tax: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  collection_method: "charge_automatically" | "send_invoice";
  due_at: string | null;
  finalized_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  /** A page to view (and pay) the invoice. */
  hosted_url: string | null;
  pdf_url: string | null;
}

export interface Invoice extends InvoiceSummary {
  lines: InvoiceLine[];
}

export interface ListInvoicesParams {
  /** Only invoices in this status. */
  status?: InvoiceStatus;
  /** Continue after this id (the last of the previous page). */
  after?: string;
  /** At most this many (1-100, default 20). */
  limit?: number;
}

/** Credit the organization can spend: dollars (cents) or free units of a meter. */
export interface Credit {
  object: "credit";
  id: string;
  /** `amount`: dollars (`amount` and `remaining` in cents); `units`: free units of `meter`. */
  kind: "amount" | "units";
  amount: number;
  remaining: number;
  /** What a `units` credit covers. */
  meter: Meter | null;
  /** What an `amount` credit pays for (`null`: any usage). */
  meters: Meter[] | null;
  /** `any`: also fees and other charges. */
  applies_to: "usage" | "any";
  source: "fee" | "commitment" | "support" | "promotion" | "refund" | "sla";
  description: string;
  effective_at: string;
  expires_at: string | null;
  voided_at: string | null;
  created_at: string;
}

export interface ListCreditsParams {
  /** `active` (default): usable now or later, with something left; `all`: every credit. */
  status?: "active" | "all";
  /** Continue after this id (the last of the previous page). */
  after?: string;
  /** At most this many (1-100, default 20). */
  limit?: number;
}
