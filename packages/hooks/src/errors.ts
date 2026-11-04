export type HookErrorCode =
  | "account_suspended"
  | "application_not_found"
  | "billing_hold"
  | "budget_exceeded"
  | "endpoint_disabled"
  | "event_type_exists"
  | "idempotency_key_reused"
  | "invalid_event_type"
  | "invalid_origin"
  | "invalid_secret"
  | "invalid_url"
  | "not_found"
  | "payload_too_large"
  | "request_in_progress"
  | "too_many_applications"
  | "too_many_endpoints"
  | "too_many_event_types"
  | "uid_taken"
  | "unknown_event_type";

const STATUS: Record<HookErrorCode, number> = {
  account_suspended: 403,
  application_not_found: 404,
  billing_hold: 402,
  budget_exceeded: 402,
  endpoint_disabled: 422,
  event_type_exists: 422,
  idempotency_key_reused: 422,
  invalid_event_type: 422,
  invalid_origin: 422,
  invalid_secret: 422,
  invalid_url: 422,
  not_found: 404,
  payload_too_large: 422,
  request_in_progress: 409,
  too_many_applications: 422,
  too_many_endpoints: 422,
  too_many_event_types: 422,
  uid_taken: 422,
  unknown_event_type: 422,
};

/** Expected failures of Hooks; messages are safe to show to the user (and to their end users). */
export class HookError extends Error {
  readonly code: HookErrorCode;
  readonly status: number;
  /** The request field at fault, when there is one. */
  readonly param: string | undefined;

  constructor(code: HookErrorCode, message: string, param?: string) {
    super(message);
    this.name = "HookError";
    this.code = code;
    this.status = STATUS[code];
    this.param = param;
  }
}
