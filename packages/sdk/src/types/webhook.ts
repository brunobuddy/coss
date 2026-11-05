/**
 * Webhook wire types (hand-written mirrors of the API's `EmailWebhookEvent`,
 * `ReceivedEmailWebhookEvent`, `DomainWebhookEvent`, `AccountWebhookEvent`, `BillingWebhookEvent`,
 * `RiskWebhookEvent`, `HookEndpointWebhookEvent`, `ContactWebhookEvent` and `BroadcastWebhookEvent`).
 */

import type { BillingHoldReason, Credit, InvoiceSummary, Meter, PlanKey } from "./billing.ts";
import type { BroadcastStats, BroadcastStatus } from "./broadcast.ts";
import type { ContactSource, ContactStatus } from "./contact.ts";
import type { EmailEventData, EmailEventType, EmailTag } from "./email.ts";
import type { FormSubmissionWebhookEvent } from "./forms.ts";
import type { InboxMessageReceivedWebhookEvent } from "./inbox.ts";
import type { ReceivedEmailVerdicts } from "./received-email.ts";
import type { MarketingStanding, ReputationCheck, ReputationStatus } from "./reputation.ts";
import type { RiskDecision, RiskEvent, RiskOutcome, RiskReason } from "./risk.ts";
import type {
  SchedulingBookingWebhookEvent,
  SchedulingCalendarDelegationWebhookEvent,
  SchedulingCalendarWebhookEvent,
} from "./scheduling.ts";
import type { SignRequestWebhookEvent } from "./sign.ts";
import type {
  ReceivedSmsEventType,
  SmsEventData,
  SmsEventType,
  SmsKeyword,
  SmsTag,
} from "./sms.ts";
import type { VerificationWebhookEvent } from "./verify.ts";

/** What a webhook says about the email; never its content, cc or bcc. */
export interface EmailWebhookEventData extends EmailEventData {
  email_id: string;
  from: string;
  to: string[];
  subject: string;
  tags: EmailTag[];
  category: string | null;
  /** `true` for emails sent with a sandbox (`coss_test_…`) key. */
  sandbox: boolean;
  /** The recipient this event is about; `null` for the whole email. */
  recipient: string | null;
  /** ISO 8601 timestamp of the event itself (deliveries can arrive later, and out of order). */
  occurred_at: string;
  /** Only for an email sent for a sub-account: its id. */
  subaccount_id?: string;
  /**
   * Only for an email sent with a W3C `traceparent` header (the SDK sends its OpenTelemetry span's):
   * that trace context, also sent as the webhook request's `traceparent` header.
   */
  traceparent?: string;
}

/** An email event. `id` equals the `webhook-id` header and `EmailEvent.id`. */
export interface EmailWebhookEvent {
  id: string;
  object: "event";
  type: EmailEventType;
  /** The API version this event is rendered in: the receiving endpoint's `api_version`. */
  api_version: string;
  /** ISO 8601 timestamp. */
  created_at: string;
  data: EmailWebhookEventData;
}

/** Events about received (inbound) emails. */
export type ReceivedEmailEventType = "email.received";

/** What a webhook says about a received email; never its content, headers or cc. */
export interface ReceivedEmailWebhookEventData {
  /** Retrieve the email (bodies, headers, attachments) with `coss.email.received.get`. */
  received_email_id: string;
  /** The `From` header. */
  from: string | null;
  /** The `To` header's addresses. */
  to: string[];
  /** The envelope recipients this environment received it for. */
  recipients: string[];
  subject: string | null;
  message_id: string | null;
  attachment_count: number;
  size: number;
  /** Whether the spam verdict is `fail`. */
  spam: boolean;
  verdicts: ReceivedEmailVerdicts;
  sandbox: boolean;
  /** ISO 8601 timestamp. */
  received_at: string;
}

/** An email arrived. `id` equals the `webhook-id` header. */
export interface ReceivedEmailWebhookEvent {
  id: string;
  object: "event";
  type: ReceivedEmailEventType;
  /** The API version this event is rendered in: the receiving endpoint's `api_version`. */
  api_version: string;
  /** ISO 8601 timestamp. */
  created_at: string;
  data: ReceivedEmailWebhookEventData;
}

/** Events about the organization's domains (sent to live environments only). */
export type DomainEventType = "domain.dmarc_report_received";

/** What a webhook says about a DMARC report; never its rows or source addresses. */
export interface DomainWebhookEventData {
  organization_id: string;
  domain_id: string;
  domain: string;
  /** Retrieve the report (its rows) with `coss.domains.dmarc.reports.get`. */
  dmarc_report_id: string;
  /** The reporting organization (`org_name`). */
  reporter: string;
  /** ISO 8601 timestamps of the period the report covers. */
  period_start: string;
  period_end: string;
  messages: number;
  passing: number;
  /** ISO 8601 timestamp. */
  occurred_at: string;
}

/** A DMARC aggregate report about a domain arrived. `id` equals the `webhook-id` header. */
export interface DomainWebhookEvent {
  id: string;
  object: "event";
  type: DomainEventType;
  /** The API version this event is rendered in: the receiving endpoint's `api_version`. */
  api_version: string;
  /** ISO 8601 timestamp. */
  created_at: string;
  data: DomainWebhookEventData;
}

/**
 * Changes of the organization's reputation standing, and of its marketing stream's
 * (`account.marketing_*`; sent to live environments only).
 */
export type AccountEventType =
  | "account.reputation_warning"
  | "account.reputation_recovered"
  | "account.suspended"
  | "account.reinstated"
  | "account.marketing_paused"
  | "account.marketing_reinstated";

export interface AccountWebhookEventData {
  organization_id: string;
  status: ReputationStatus;
  previous_status: ReputationStatus;
  /** The trigger behind a `warning` or `suspended` status, e.g. `complaint_rate`. */
  reason: string | null;
  /** ISO 8601 timestamp. */
  occurred_at: string;
  /** The measurements behind the change (see `coss.reputation.get()`). */
  checks: ReputationCheck[];
  /** The marketing stream's standing after the change. */
  marketing: MarketingStanding;
}

/** A reputation change. `id` equals the `webhook-id` header. */
export interface AccountWebhookEvent {
  id: string;
  object: "event";
  type: AccountEventType;
  /** The API version this event is rendered in: the receiving endpoint's `api_version`. */
  api_version: string;
  /** ISO 8601 timestamp. */
  created_at: string;
  data: AccountWebhookEventData;
}

/** A sub-account's own reputation changes (sent to its environment; live only). */
export type SubaccountEventType =
  | "subaccount.reputation_warning"
  | "subaccount.reputation_recovered"
  | "subaccount.paused"
  | "subaccount.reinstated";

export interface SubaccountWebhookEventData {
  subaccount_id: string;
  /** Your own id for it. */
  uid: string | null;
  status: "good" | "warning" | "paused";
  previous_status: "good" | "warning" | "paused";
  /** What changed it: a check (`bounce_rate`, `complaint_rate`), `content_screening` or `reinstated`. */
  trigger: string | null;
  /** ISO 8601 timestamp. */
  occurred_at: string;
  /** The measurements behind the change (empty for reinstatements and screening). */
  checks: ReputationCheck[];
}

/** A sub-account's reputation change. `id` equals the `webhook-id` header. */
export interface SubaccountWebhookEvent {
  id: string;
  object: "event";
  type: SubaccountEventType;
  /** The API version this event is rendered in: the receiving endpoint's `api_version`. */
  api_version: string;
  /** ISO 8601 timestamp. */
  created_at: string;
  data: SubaccountWebhookEventData;
}

/** Billing events (organization-wide; sent to live environments only). */
export type BillingEventType =
  | "billing.invoice_finalized"
  | "billing.invoice_paid"
  | "billing.invoice_payment_failed"
  | "billing.invoice_voided"
  | "billing.plan_changed"
  | "billing.usage_threshold_reached"
  | "billing.hold_placed"
  | "billing.hold_lifted"
  | "billing.credit_granted"
  | "billing.budget_threshold_reached"
  | "billing.budget_hold_placed"
  | "billing.budget_hold_lifted";

/** What a budget is for: a member's personal API keys (`user`), a project or an API key. */
export type BudgetScope = "user" | "project" | "api_key";

interface BillingEventFields {
  /** Equals the `webhook-id` header. */
  id: string;
  object: "event";
  /** The API version this event is rendered in: the receiving endpoint's `api_version`. */
  api_version: string;
  /** ISO 8601 timestamp. */
  created_at: string;
}

/** Every billing event's `data` has these. */
interface BillingEventData {
  organization_id: string;
  /** When it happened (ISO 8601): sort events by it. */
  occurred_at: string;
}

/** A billing event; narrow on `type` for its `data`. */
export type BillingWebhookEvent =
  | (BillingEventFields & {
      type: "billing.invoice_finalized" | "billing.invoice_paid" | "billing.invoice_voided";
      data: BillingEventData & { invoice: InvoiceSummary };
    })
  | (BillingEventFields & {
      type: "billing.invoice_payment_failed";
      data: BillingEventData & { invoice: InvoiceSummary; failure: { message: string } };
    })
  | (BillingEventFields & {
      type: "billing.plan_changed";
      data: BillingEventData & {
        /**
         * `upgrade` (in effect now), `downgrade`/`cancellation` (scheduled), `reverted` (a
         * scheduled change was undone), `contract` (a contract changed).
         */
        change: "upgrade" | "downgrade" | "cancellation" | "reverted" | "contract";
        /** The plan from `effective_at`. */
        plan: PlanKey;
        previous_plan: PlanKey;
        effective_at: string;
      };
    })
  | (BillingEventFields & {
      type: "billing.usage_threshold_reached";
      data: BillingEventData & {
        /** The threshold crossed, e.g. 80. */
        percent: number;
        /** `credit`: the month's usage credit; `allowance`: a capped plan's included units. */
        of: "credit" | "allowance";
        meter: Meter | null;
        period: { start: string; end: string };
      };
    })
  | (BillingEventFields & {
      type: "billing.hold_placed" | "billing.hold_lifted";
      data: BillingEventData & { reason: BillingHoldReason };
    })
  | (BillingEventFields & {
      type: "billing.credit_granted";
      data: BillingEventData & { credit: Credit };
    })
  | (BillingEventFields & {
      type: "billing.budget_threshold_reached";
      data: BillingEventData & {
        scope: BudgetScope;
        /** The user, project or API key id. */
        target_id: string;
        /** The threshold crossed, e.g. 80. */
        percent: number;
        /** The monthly budget, in cents. */
        amount: number;
        /** Spent this month when it was crossed, in cents. */
        spent: number;
        period: { start: string; end: string };
      };
    })
  | (BillingEventFields & {
      type: "billing.budget_hold_placed" | "billing.budget_hold_lifted";
      data: BillingEventData & {
        scope: BudgetScope;
        /** The user, project or API key id. */
        target_id: string;
      };
    });

/** Risk events: `review` decisions, and their resolution, for a queue you work through. */
export type RiskEventType = "risk.assessment.review" | "risk.assessment.reviewed";

export interface RiskWebhookEventData {
  assessment_id: string;
  event: RiskEvent;
  event_name: string | null;
  decision: RiskDecision;
  score: number;
  reasons: RiskReason[];
  /** Your user id, if the assessment had one. Never the email or IP address. */
  user_id: string | null;
  /** `risk.assessment.reviewed`: the outcome that resolved the review. */
  outcome: RiskOutcome | null;
  /** ISO 8601 timestamp. */
  occurred_at: string;
}

/** A risk review opened or resolved. `id` equals the `webhook-id` header. */
export interface RiskWebhookEvent {
  id: string;
  object: "event";
  type: RiskEventType;
  /** The API version this event is rendered in: the receiving endpoint's `api_version`. */
  api_version: string;
  /** ISO 8601 timestamp. */
  created_at: string;
  data: RiskWebhookEventData;
}

/** Events about Hooks: an endpoint of one of your applications was disabled for failing. */
export type HookOperationalEventType = "hook_endpoint.disabled";

export interface HookEndpointWebhookEventData {
  application_id: string;
  /** Your uid for the application, when it has one. */
  application_uid: string | null;
  endpoint_id: string;
  url: string;
  /** ISO 8601 timestamp: when its deliveries started failing every attempt. */
  failing_since: string;
  /** ISO 8601 timestamp. */
  occurred_at: string;
}

/** A Hooks endpoint of one of your applications was disabled. `id` equals the `webhook-id` header. */
export interface HookEndpointWebhookEvent {
  id: string;
  object: "event";
  type: HookOperationalEventType;
  /** The API version this event is rendered in: the receiving endpoint's `api_version`. */
  api_version: string;
  /** ISO 8601 timestamp. */
  created_at: string;
  data: HookEndpointWebhookEventData;
}

/** Contact events (sent to the contact's environment). */
export type ContactEventType =
  | "contact.created"
  | "contact.updated"
  | "contact.deleted"
  | "contact.unsubscribed"
  | "contact.confirmed";

export interface ContactWebhookEventData {
  /** Who changed; never their properties or names. */
  contact: { id: string; email: string; status: ContactStatus };
  source: ContactSource;
  /** `contact.unsubscribed` from one topic (its key); `null`: from marketing altogether. */
  topic: string | null;
  /** ISO 8601 timestamp. */
  occurred_at: string;
}

/** A contact was created, updated or deleted. `id` equals the `webhook-id` header. */
export interface ContactWebhookEvent {
  id: string;
  object: "event";
  type: ContactEventType;
  /** The API version this event is rendered in: the receiving endpoint's `api_version`. */
  api_version: string;
  /** ISO 8601 timestamp. */
  created_at: string;
  data: ContactWebhookEventData;
}

/** Broadcast events (sent to the broadcast's environment). */
export type BroadcastEventType =
  | "broadcast.sending"
  | "broadcast.sent"
  | "broadcast.paused"
  | "broadcast.canceled"
  | "broadcast.failed";

export interface BroadcastWebhookEventData {
  broadcast: { id: string; name: string; status: BroadcastStatus };
  /** Set on `broadcast.paused`: see `Broadcast.pause_reason`. */
  pause_reason: string | null;
  /** Set on `broadcast.failed`. */
  error: { code: string; message: string } | null;
  stats: BroadcastStats;
  /** ISO 8601 timestamp. */
  occurred_at: string;
}

/** A broadcast started, finished, paused, was canceled or failed. */
export interface BroadcastWebhookEvent {
  id: string;
  object: "event";
  type: BroadcastEventType;
  /** The API version this event is rendered in: the receiving endpoint's `api_version`. */
  api_version: string;
  /** ISO 8601 timestamp. */
  created_at: string;
  data: BroadcastWebhookEventData;
}

/** The JSON body of a webhook request; narrow on `type`. */
/** What an `sms.*` webhook says about a sent message; never its text (`coss.sms.get` has it). */
export interface SmsWebhookEventData extends SmsEventData {
  sms_id: string;
  from: string;
  to: string;
  country: string;
  segments: number;
  tags: SmsTag[];
  sandbox: boolean;
  occurred_at: string;
  /**
   * Only for a message sent with a W3C `traceparent` header (the SDK sends its OpenTelemetry
   * span's): that trace context, also sent as the webhook request's `traceparent` header.
   */
  traceparent?: string;
}

export interface SmsWebhookEvent {
  id: string;
  object: "event";
  type: SmsEventType;
  api_version: string;
  created_at: string;
  data: SmsWebhookEventData;
}

/** `sms.received`, `sms.opted_out` and `sms.opted_in`; never the text (`coss.sms.received.get`). */
export interface ReceivedSmsWebhookEventData {
  /** `null` for an opt-out to a number whose replies go to no environment. */
  received_sms_id: string | null;
  from: string;
  to: string;
  keyword: SmsKeyword | null;
  sandbox: boolean;
  occurred_at: string;
}

export interface ReceivedSmsWebhookEvent {
  id: string;
  object: "event";
  type: ReceivedSmsEventType;
  api_version: string;
  created_at: string;
  data: ReceivedSmsWebhookEventData;
}

export type WebhookEvent =
  | EmailWebhookEvent
  | ReceivedEmailWebhookEvent
  | DomainWebhookEvent
  | AccountWebhookEvent
  | SubaccountWebhookEvent
  | BillingWebhookEvent
  | RiskWebhookEvent
  | HookEndpointWebhookEvent
  | ContactWebhookEvent
  | BroadcastWebhookEvent
  | InboxMessageReceivedWebhookEvent
  | SmsWebhookEvent
  | ReceivedSmsWebhookEvent
  | SignRequestWebhookEvent
  | VerificationWebhookEvent
  | FormSubmissionWebhookEvent
  | SchedulingBookingWebhookEvent
  | SchedulingCalendarWebhookEvent
  | SchedulingCalendarDelegationWebhookEvent;
