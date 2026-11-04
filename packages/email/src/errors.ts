export type EmailErrorCode =
  | "idempotency_key_reused"
  | "request_in_progress"
  | "not_found"
  | "domain_not_verified"
  | "sending_paused"
  | "account_suspended"
  | "marketing_paused"
  | "billing_hold"
  | "budget_exceeded"
  | "email_not_cancelable"
  | "email_not_reschedulable"
  | "template_not_found"
  | "template_not_published"
  | "template_version_not_found"
  | "invalid_template_variables"
  | "template_render_failed"
  | "template_invalid"
  | "template_alias_taken"
  | "template_limit_reached"
  | "template_revision_mismatch"
  | "mailing_address_required"
  | "sandbox_only"
  | "live_only_event_type"
  | "invalid_test_event"
  | "subaccount_not_found"
  | "subaccount_disabled"
  | "subaccount_paused";

const STATUS_BY_CODE = {
  idempotency_key_reused: 422,
  request_in_progress: 409,
  not_found: 404,
  domain_not_verified: 422,
  sending_paused: 403,
  account_suspended: 403,
  marketing_paused: 403,
  // Payment required: an overdue invoice or the spend limit (`@coss/billing`).
  billing_hold: 402,
  // A member's, project's or API key's monthly budget is used up (`@coss/billing` budgets).
  budget_exceeded: 402,
  // Not 409: the SDK retries those.
  email_not_cancelable: 422,
  email_not_reschedulable: 422,
  // A template referenced from a send body is a bad request, not a missing resource.
  template_not_found: 422,
  template_not_published: 422,
  template_version_not_found: 422,
  invalid_template_variables: 422,
  template_render_failed: 422,
  template_invalid: 422,
  template_alias_taken: 422,
  template_limit_reached: 422,
  // Not 409: the SDK would retry it, and another save won't happen by waiting.
  template_revision_mismatch: 422,
  mailing_address_required: 422,
  // Test webhook events: only sandbox environments send them, and only of types they can receive.
  sandbox_only: 403,
  live_only_event_type: 422,
  invalid_test_event: 422,
  // A sub-account named in a send body is a field at fault, not a missing resource.
  subaccount_not_found: 422,
  subaccount_disabled: 403,
  subaccount_paused: 403,
} as const satisfies Record<EmailErrorCode, number>;

/** Expected failures of the email service; `status` is the HTTP status the API should use. */
export class EmailError extends Error {
  readonly code: EmailErrorCode;
  /** The request field at fault, when it differs from the code's usual one (e.g. `emails.3.from`). */
  readonly param: string | undefined;
  /** Every problem, for errors about several fields (`invalid_template_variables`). */
  readonly issues: { path: string; message: string }[] | undefined;

  constructor(
    code: EmailErrorCode,
    message: string,
    opts?: { param?: string; issues?: { path: string; message: string }[] },
  ) {
    super(message);
    this.name = "EmailError";
    this.code = code;
    this.param = opts?.param;
    this.issues = opts?.issues;
  }

  get status(): (typeof STATUS_BY_CODE)[EmailErrorCode] {
    return STATUS_BY_CODE[this.code];
  }
}

export type DomainErrorCode =
  | "invalid_domain"
  | "domain_taken"
  | "too_many_pending_domains"
  | "invalid_tracking_hostname"
  | "tracking_domain_exists"
  | "tracking_domain_taken"
  | "invalid_receiving_hostname"
  | "receiving_domain_exists"
  | "receiving_domain_taken"
  | "receiving_unavailable"
  | "not_found"
  | "domain_in_use_by_sso"
  | "provider_error"
  | "subaccount_not_found"
  | "subaccount_not_live"
  | "too_many_subaccount_domains"
  | "subaccount_domain"
  | "not_shareable";

/** Expected failures of domain management; messages are safe to show to the user. */
export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export type ContactErrorCode =
  | "not_found"
  | "unknown_property"
  | "invalid_property"
  | "too_many_properties"
  | "property_exists"
  | "property_in_use"
  | "name_taken"
  | "topic_exists"
  | "too_many_topics"
  | "topic_in_use"
  | "audience_in_use"
  | "segment_in_use"
  | "audience_not_found"
  | "topic_not_found"
  | "invalid_filter"
  | "confirmation_sender_required"
  | "double_opt_in_status";

/**
 * Expected failures of contacts, audiences, segments and topics; messages are safe to show.
 * `param` is the request field at fault. Only `not_found` is a 404; the rest are 422 (not 409:
 * the SDK retries those, and these conflicts never resolve on their own).
 */
export class ContactError extends Error {
  readonly code: ContactErrorCode;
  readonly param: string | undefined;

  constructor(code: ContactErrorCode, message: string, opts?: { param?: string }) {
    super(message);
    this.name = "ContactError";
    this.code = code;
    this.param = opts?.param;
  }
}

export type InboxErrorCode =
  | "billing_hold"
  | "budget_exceeded"
  | "not_found"
  | "thread_not_found"
  | "message_not_found"
  | "receiving_unavailable"
  | "unknown_domain"
  | "address_taken"
  | "invalid_address"
  | "inbox_cannot_send"
  | "no_reply_recipient"
  | "invalid_message";

/**
 * Expected failures of inboxes; messages are safe to show. `param` is the request field at fault.
 * The `*not_found` codes are 404s; the rest are 422 (not 409: the SDK retries those, and these
 * conflicts never resolve on their own).
 */
export class InboxError extends Error {
  readonly code: InboxErrorCode;
  readonly param: string | undefined;

  constructor(code: InboxErrorCode, message: string, opts?: { param?: string }) {
    super(message);
    this.name = "InboxError";
    this.code = code;
    this.param = opts?.param;
  }
}

export type SubaccountErrorCode =
  | "subaccount_not_found"
  | "uid_taken"
  | "invalid_uid"
  | "too_many_subaccounts"
  | "subaccount_deleting"
  | "invalid_quotas"
  | "invalid_range";

const SUBACCOUNT_STATUS_BY_CODE = {
  subaccount_not_found: 404,
  // Not 409: the SDK retries those, and these conflicts never resolve on their own.
  uid_taken: 422,
  invalid_uid: 422,
  too_many_subaccounts: 422,
  subaccount_deleting: 422,
  invalid_quotas: 422,
  invalid_range: 422,
} as const satisfies Record<SubaccountErrorCode, number>;

/** Expected failures of sub-account management; messages are safe to show. */
export class SubaccountError extends Error {
  readonly code: SubaccountErrorCode;
  readonly param: string | undefined;

  constructor(code: SubaccountErrorCode, message: string, opts?: { param?: string }) {
    super(message);
    this.name = "SubaccountError";
    this.code = code;
    this.param = opts?.param;
  }

  get status(): (typeof SUBACCOUNT_STATUS_BY_CODE)[SubaccountErrorCode] {
    return SUBACCOUNT_STATUS_BY_CODE[this.code];
  }
}
