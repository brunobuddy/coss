/** Log wire types (hand-written mirrors of the API's schemas). */

/**
 * `api`: a request to the API. `email`: an email event. `webhook`: a webhook delivery attempt.
 * `risk`: a risk assessment or its feedback.
 */
export type LogSource =
  | "api"
  | "email"
  | "webhook"
  | "risk"
  | "smtp"
  | "sms"
  | "sign"
  | "verify"
  | "forms"
  | "scheduling";

/**
 * `error`: 5xx responses, bounces, complaints, failures. `warning`: 4xx responses, delays,
 * suppressions, failed webhook attempts that will be retried. `info`: everything else.
 */
export type LogLevel = "info" | "warning" | "error";

/** One line of the API key's environment's log. */
export interface Log {
  object: "log";
  id: string;
  /** ISO 8601 timestamp. */
  occurred_at: string;
  source: LogSource;
  level: LogLevel;
  /** `api.request`, `webhook.attempt`, `webhook.forward` (`coss listen`), or an email event type such as `email.delivered`. */
  type: string;
  /** A one-line summary. */
  message: string;
  /** The `X-Request-Id` of the API request this line belongs to. */
  request_id: string | null;
  api_key_id: string | null;
  method: string | null;
  path: string | null;
  /** The matched route, e.g. `/v1/emails/:id`. */
  route: string | null;
  /** The API response status, or the webhook endpoint's response status. */
  status_code: number | null;
  duration_ms: number | null;
  client_ip: string | null;
  user_agent: string | null;
  error_code: string | null;
  /** What the line is about: `email`, `domain`, `webhook_endpoint`… */
  resource_type: string | null;
  resource_id: string | null;
  recipient: string | null;
  /**
   * Details: redacted request and response bodies for API requests, event data for emails and
   * webhooks.
   */
  attributes: Record<string, unknown>;
}

type OneOrMany<T> = T | readonly T[];

/** Query of `GET /v1/logs`. Lists may be given as arrays or comma-separated strings. */
export interface ListLogsParams {
  /** Start of the range (inclusive). Defaults to an hour before `to`. */
  from?: string | Date;
  /** End of the range (exclusive). Defaults to now. At most 31 days after `from`. */
  to?: string | Date;
  source?: OneOrMany<LogSource>;
  level?: OneOrMany<LogLevel>;
  /** e.g. `"email.bounced"`. */
  type?: OneOrMany<string>;
  /** Status codes or classes, e.g. `["4xx", "503"]`. */
  status?: OneOrMany<string | number>;
  method?: OneOrMany<string>;
  /** Routes such as `/v1/emails/:id`. */
  route?: OneOrMany<string>;
  api_key_id?: OneOrMany<string>;
  request_id?: string;
  /** Only lines about this resource, e.g. an `email_…` id. */
  resource_id?: string;
  /** Free text, matched against the message, path, ids and recipient. */
  q?: string;
  /** 1-100, default 50. */
  limit?: number;
  /** The `id` of the last line of the previous page. */
  after?: string;
}
