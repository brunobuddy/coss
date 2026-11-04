export type RiskErrorCode =
  | "not_found"
  | "invalid_list_value"
  | "invalid_settings"
  | "too_many_rules"
  | "too_many_limit_buckets"
  | "limit_bucket_name_taken"
  | "classification_unavailable"
  | "phone_lookup_unavailable"
  | "billing_hold"
  | "budget_exceeded"
  | "idempotency_key_reused"
  | "request_in_progress";

/** Expected failures of risk operations; messages are safe to show to the user. */
export class RiskError extends Error {
  readonly code: RiskErrorCode;
  readonly param: string | undefined;

  constructor(code: RiskErrorCode, message: string, opts: { param?: string } = {}) {
    super(message);
    this.name = "RiskError";
    this.code = code;
    this.param = opts.param;
  }
}
