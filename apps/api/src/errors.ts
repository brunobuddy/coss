/**
 * The public error envelope. Every non-2xx response is
 * `{ "error": { type, code, message, param?, issues?, hint?, request_id } }`, built only here.
 * `hint` is optional and additive: it names a fix (often with a docs URL) for the errors an
 * agent hits first. Compute it here so every constructor does not have to.
 */

import { BillingError } from "@coss/billing";
import { HIPAA_MODE_RESTRICTION, HipaaModeError } from "@coss/compliance";
import {
  BroadcastError,
  ContactError,
  DomainError,
  EmailError,
  InboxError,
  SubaccountError,
} from "@coss/email";
import { FormError } from "@coss/forms";
import { HookError } from "@coss/hooks";
import { RiskError } from "@coss/risk";
import { SchedulingError } from "@coss/scheduling";
import { SignError } from "@coss/sign";
import { SmsError } from "@coss/sms";
import { VerifyError } from "@coss/verify";
import { WebhookError } from "@coss/webhooks";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import type { AppEnv } from "./types.ts";

export const ERROR_TYPES = [
  "invalid_request_error",
  "authentication_error",
  "permission_error",
  "not_found_error",
  "idempotency_error",
  "rate_limit_error",
  "billing_error",
  "api_error",
] as const;

export type ApiErrorType = (typeof ERROR_TYPES)[number];

export type ApiErrorIssue = { path: string; message: string };

export const ErrorEnvelope = z
  .object({
    error: z.object({
      type: z.enum(ERROR_TYPES),
      code: z.string().meta({ description: "Machine-readable reason, e.g. `invalid_api_key`." }),
      message: z.string().meta({ description: "Human-readable explanation. May change." }),
      param: z
        .string()
        .optional()
        .meta({ description: "The request field or header the error relates to." }),
      issues: z
        .array(
          z.object({
            path: z.string().meta({ description: "Dot-separated field path, e.g. `to.1`." }),
            message: z.string(),
          }),
        )
        .optional()
        .meta({
          description:
            "Every problem: of the request (`validation_error`) or of a template " +
            "(`invalid_template_variables`, `template_invalid`).",
        }),
      hint: z.string().optional().meta({
        description:
          "What to try next. Present when coss.com can name a fix, and often includes a docs URL.",
      }),
      request_id: z.string().meta({ examples: ["req_01k7c8m4q2f3e9v6t5r1n0p8yz"] }),
    }),
  })
  .meta({ id: "Error" });

export type ErrorEnvelopeBody = z.output<typeof ErrorEnvelope>;

type ApiErrorDetails = {
  type: ApiErrorType;
  code: string;
  message: string;
  param?: string;
  issues?: ApiErrorIssue[];
  /** Overrides the hint `errorResponse` would derive from `code`. */
  hint?: string;
};

/** An expected failure with a public envelope. Throw it anywhere; `app.onError` renders it. */
export class ApiError extends Error {
  readonly status: ContentfulStatusCode;
  readonly type: ApiErrorType;
  readonly code: string;
  readonly param?: string;
  readonly issues?: ApiErrorIssue[];
  readonly hint?: string;
  readonly headers?: Record<string, string>;

  constructor(
    status: ContentfulStatusCode,
    details: ApiErrorDetails,
    headers?: Record<string, string>,
  ) {
    super(details.message);
    this.name = "ApiError";
    this.status = status;
    this.type = details.type;
    this.code = details.code;
    this.param = details.param;
    this.issues = details.issues;
    this.hint = details.hint;
    this.headers = headers;
  }
}

const DOCS = {
  domains: "https://coss.com/docs/email/domains.md",
  environments: "https://coss.com/docs/environments.md",
  delivery: "https://coss.com/docs/email/delivery.md",
  sdk: "https://coss.com/docs/sdk.md",
  sending: "https://coss.com/docs/email/sending.md",
} as const;

/**
 * The fix for an error an agent can act on, derived from the code (and, for reserved headers,
 * from the issue text — those share `validation_error` with every other bad field).
 */
export function hintFor(error: {
  code: string;
  issues?: { message: string }[];
  hint?: string;
}): string | undefined {
  if (error.hint) return error.hint;
  switch (error.code) {
    case "domain_not_verified":
      return (
        "A live key can only send from a verified domain. A sandbox key accepts any from " +
        `address. ${DOCS.domains}`
      );
    case "sandbox_only":
      return `This only works with a sandbox key. ${DOCS.environments}`;
    case HIPAA_MODE_RESTRICTION:
      return (
        "This organization's HIPAA mode refuses this, to keep PHI within its BAA. Its compliance " +
        "settings page lists what the mode changes."
      );
    case "organization_suspended":
    case "account_suspended":
      return (
        "This organization is suspended, so sending and changes are refused until it is " +
        `reinstated. ${DOCS.delivery}`
      );
    case "idempotency_key_reused":
    case "request_in_progress":
      return `Reuse an Idempotency-Key only for the same request. ${DOCS.sdk}`;
    case "validation_error":
      if (error.issues?.some((issue) => issue.message.includes("set by coss.com"))) {
        return `Those headers are set by coss.com and cannot be overridden. ${DOCS.sending}`;
      }
      return undefined;
    default:
      return undefined;
  }
}

export function errorResponse(c: Context<AppEnv>, error: ApiError): Response {
  const hint = hintFor(error);
  const body: ErrorEnvelopeBody = {
    error: {
      type: error.type,
      code: error.code,
      message: error.message,
      ...(error.param !== undefined && { param: error.param }),
      ...(error.issues !== undefined && { issues: error.issues }),
      ...(hint !== undefined && { hint }),
      request_id: c.var.requestId,
    },
  };
  return c.json(body, error.status, error.headers);
}

// Hono's JSON validator throws `HTTPException(400, "Malformed JSON in request body")`.
const MALFORMED_JSON = /malformed json/i;

// Keeps the documented type <-> status pairing for exceptions thrown by Hono or its middleware.
const TYPE_BY_STATUS: Partial<Record<number, ApiErrorType>> = {
  401: "authentication_error",
  403: "permission_error",
  404: "not_found_error",
  429: "rate_limit_error",
};

function fromHttpException(error: HTTPException): ApiError {
  const { status } = error;
  if (status === 400 && MALFORMED_JSON.test(error.message)) {
    return new ApiError(400, {
      type: "invalid_request_error",
      code: "invalid_json",
      message: "The request body is not valid JSON.",
    });
  }
  if (status === 413) return payloadTooLarge();
  if (status === 415) {
    // Thrown by @hono/zod-openapi when Content-Type does not match the route's declared body.
    return new ApiError(415, {
      type: "invalid_request_error",
      code: "unsupported_media_type",
      message: "Send the request body as JSON with `Content-Type: application/json`.",
    });
  }
  return new ApiError(status, {
    type: TYPE_BY_STATUS[status] ?? "invalid_request_error",
    code: "invalid_request",
    message: error.message || "The request could not be processed.",
  });
}

function fromIdempotencyError(error: {
  code: "request_in_progress" | "idempotency_key_reused";
  message: string;
}): ApiError {
  switch (error.code) {
    case "request_in_progress":
      // Concurrent requests keep taking over the key; the SDK retries after Retry-After.
      return new ApiError(
        409,
        { type: "idempotency_error", code: error.code, message: error.message },
        { "Retry-After": "1" },
      );
    case "idempotency_key_reused":
      return new ApiError(422, {
        type: "idempotency_error",
        code: error.code,
        message: error.message,
        param: "Idempotency-Key",
      });
  }
}

function fromEmailError(error: EmailError): ApiError {
  switch (error.code) {
    case "request_in_progress":
    case "idempotency_key_reused":
      return fromIdempotencyError({ code: error.code, message: error.message });
    case "not_found":
      return new ApiError(error.status, {
        type: "not_found_error",
        code: error.code,
        message: error.message,
      });
    case "domain_not_verified":
      return new ApiError(error.status, {
        type: "invalid_request_error",
        code: error.code,
        message: error.message,
        param: error.param ?? "from",
      });
    case "sending_paused":
    case "account_suspended":
    case "marketing_paused":
    case "sandbox_only":
    case "subaccount_disabled":
    case "subaccount_paused":
      return new ApiError(error.status, {
        type: "permission_error",
        code: error.code,
        message: error.message,
      });
    case "billing_hold":
    case "budget_exceeded":
      return new ApiError(402, { type: "billing_error", code: error.code, message: error.message });
    case "email_not_cancelable":
    case "email_not_reschedulable":
    case "template_limit_reached":
      return invalidRequest(error.code, error.message);
    case "template_not_found":
    case "template_not_published":
      return invalidRequest(error.code, error.message, error.param ?? "template_id");
    case "template_version_not_found":
      return invalidRequest(error.code, error.message, error.param ?? "template_version");
    case "template_render_failed":
      return invalidRequest(error.code, error.message, error.param ?? "variables");
    case "template_alias_taken":
      return invalidRequest(error.code, error.message, error.param ?? "alias");
    case "template_revision_mismatch":
      return invalidRequest(error.code, error.message, error.param ?? "revision");
    case "live_only_event_type":
      return invalidRequest(error.code, error.message, error.param ?? "type");
    case "invalid_template_variables":
    case "template_invalid":
    case "invalid_test_event":
      return new ApiError(422, {
        type: "invalid_request_error",
        code: error.code,
        message: error.message,
        ...(error.param && { param: error.param }),
        ...(error.issues && { issues: error.issues }),
      });
    case "mailing_address_required":
      return invalidRequest(error.code, error.message, error.param ?? "stream");
    case "subaccount_not_found":
      return invalidRequest(error.code, error.message, error.param ?? "subaccount");
  }
}

function fromSmsError(error: SmsError): ApiError {
  switch (error.code) {
    case "request_in_progress":
    case "idempotency_key_reused":
      return fromIdempotencyError({ code: error.code, message: error.message });
    case "not_found":
      return new ApiError(404, {
        type: "not_found_error",
        code: error.code,
        message: error.message,
      });
    case "account_suspended":
      return new ApiError(403, {
        type: "permission_error",
        code: error.code,
        message: error.message,
      });
    case "billing_hold":
    case "budget_exceeded":
    case "plan_required":
      return new ApiError(402, { type: "billing_error", code: error.code, message: error.message });
    case "provider_unavailable":
      return new ApiError(503, { type: "api_error", code: error.code, message: error.message });
    default:
      return invalidRequest(error.code, error.message, error.param);
  }
}

function fromSignError(error: SignError): ApiError {
  switch (error.code) {
    case "request_in_progress":
    case "idempotency_key_reused":
      return fromIdempotencyError({ code: error.code, message: error.message });
    case "not_found":
      // A document named in a request body is a field at fault, not a missing resource.
      if (error.param) return invalidRequest(error.code, error.message, error.param);
      return new ApiError(404, {
        type: "not_found_error",
        code: error.code,
        message: error.message,
      });
    case "account_suspended":
      return new ApiError(403, {
        type: "permission_error",
        code: error.code,
        message: error.message,
      });
    default:
      return invalidRequest(error.code, error.message, error.param);
  }
}

function fromVerifyError(error: VerifyError): ApiError {
  switch (error.code) {
    case "request_in_progress":
    case "idempotency_key_reused":
      return fromIdempotencyError({ code: error.code, message: error.message });
    case "not_found":
      return new ApiError(404, {
        type: "not_found_error",
        code: error.code,
        message: error.message,
        ...(error.param && { param: error.param }),
      });
    case "quota_exceeded": {
      const retryAfterMs = error.decision?.retryAfterMs;
      return new ApiError(
        429,
        { type: "rate_limit_error", code: error.code, message: error.message },
        retryAfterMs === null || retryAfterMs === undefined
          ? {}
          : { "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) },
      );
    }
    case "shared_sender_unavailable":
      return new ApiError(503, { type: "api_error", code: error.code, message: error.message });
    case "billing_hold":
    case "budget_exceeded":
      return new ApiError(402, { type: "billing_error", code: error.code, message: error.message });
    case "account_suspended":
      return new ApiError(403, {
        type: "permission_error",
        code: error.code,
        message: error.message,
      });
    default:
      return invalidRequest(error.code, error.message, error.param);
  }
}

function fromFormError(error: FormError): ApiError {
  switch (error.code) {
    case "not_found":
      return new ApiError(404, {
        type: "not_found_error",
        code: error.code,
        message: error.message,
      });
    case "account_suspended":
      return new ApiError(403, {
        type: "permission_error",
        code: error.code,
        message: error.message,
      });
    case "forms_unavailable":
      return new ApiError(503, { type: "api_error", code: error.code, message: error.message });
    case "form_conflict":
      // Concurrent updates of the same form kept racing; the SDK retries after Retry-After.
      return new ApiError(
        409,
        { type: "api_error", code: error.code, message: error.message },
        { "Retry-After": "1" },
      );
    default:
      return invalidRequest(error.code, error.message, error.param);
  }
}

function fromSchedulingError(error: SchedulingError): ApiError {
  switch (error.code) {
    case "not_found":
      return new ApiError(404, {
        type: "not_found_error",
        code: error.code,
        message: error.message,
      });
    case "account_suspended":
      return new ApiError(403, {
        type: "permission_error",
        code: error.code,
        message: error.message,
      });
    case "idempotency_in_progress":
      return new ApiError(
        409,
        { type: "api_error", code: error.code, message: error.message },
        { "Retry-After": "1" },
      );
    case "scheduling_unavailable":
      return new ApiError(503, { type: "api_error", code: error.code, message: error.message });
    default:
      return invalidRequest(error.code, error.message, error.param);
  }
}

function invalidRequest(code: string, message: string, param?: string): ApiError {
  return new ApiError(422, {
    type: "invalid_request_error",
    code,
    message,
    ...(param && { param }),
  });
}

function fromDomainError(error: DomainError): ApiError {
  switch (error.code) {
    case "invalid_domain":
      return invalidRequest(error.code, error.message, "name");
    case "domain_taken":
      // Not a 409: the SDK retries those, and a claimed name does not free up on its own.
      return invalidRequest(error.code, error.message, "name");
    case "too_many_pending_domains":
    case "domain_in_use_by_sso":
    case "tracking_domain_exists":
      return invalidRequest(error.code, error.message);
    case "invalid_tracking_hostname":
    case "tracking_domain_taken":
    case "invalid_receiving_hostname":
    case "receiving_domain_taken":
      return invalidRequest(error.code, error.message, "hostname");
    case "receiving_domain_exists":
    case "receiving_unavailable":
      return invalidRequest(error.code, error.message);
    case "not_found":
      return new ApiError(404, {
        type: "not_found_error",
        code: error.code,
        message: error.message,
      });
    case "provider_error":
      // The delivery provider, not the caller, is at fault: retryable.
      return new ApiError(502, { type: "api_error", code: error.code, message: error.message });
    case "subaccount_not_found":
    case "subaccount_not_live":
      return invalidRequest(error.code, error.message, "subaccount");
    case "too_many_subaccount_domains":
    case "subaccount_domain":
    case "not_shareable":
      return invalidRequest(error.code, error.message);
  }
}

function fromContactError(error: ContactError): ApiError {
  if (error.code === "not_found") {
    return new ApiError(404, { type: "not_found_error", code: error.code, message: error.message });
  }
  // Conflicts (`property_exists`, `name_taken`, `…_in_use`) are 422, not 409: the SDK retries
  // those, and they never resolve on their own.
  return invalidRequest(error.code, error.message, error.param);
}

function fromInboxError(error: InboxError): ApiError {
  if (error.code.endsWith("not_found")) {
    return new ApiError(404, {
      type: "not_found_error",
      code: "not_found",
      message: error.message,
    });
  }
  // Conflicts (`address_taken`) are 422, not 409: the SDK retries those.
  return invalidRequest(error.code, error.message, error.param);
}

function fromBroadcastError(error: BroadcastError): ApiError {
  switch (error.code) {
    case "not_found":
      return new ApiError(404, {
        type: "not_found_error",
        code: error.code,
        message: error.message,
      });
    case "request_in_progress":
    case "idempotency_key_reused":
      return fromIdempotencyError({ code: error.code, message: error.message });
    default:
      // State conflicts (`broadcast_not_editable`, …) are 422: the SDK retries 409s.
      return invalidRequest(error.code, error.message, error.param);
  }
}

function fromWebhookError(error: WebhookError): ApiError {
  switch (error.code) {
    case "invalid_url":
      return invalidRequest(error.code, error.message, "url");
    case "invalid_api_version":
      return invalidRequest(error.code, error.message, "api_version");
    case "invalid_auth_header":
      return invalidRequest(error.code, error.message, "auth_header");
    case "too_many_endpoints":
    case "too_many_listeners":
    case "too_many_log_drains":
    case "endpoint_disabled":
      return invalidRequest(error.code, error.message);
    case "not_found":
      return new ApiError(404, {
        type: "not_found_error",
        code: error.code,
        message: error.message,
      });
  }
}

function fromRiskError(error: RiskError): ApiError {
  switch (error.code) {
    case "request_in_progress":
      // Concurrent requests keep taking over the key; the SDK retries after Retry-After.
      return new ApiError(
        409,
        { type: "idempotency_error", code: error.code, message: error.message },
        { "Retry-After": "1" },
      );
    case "idempotency_key_reused":
      return new ApiError(422, {
        type: "idempotency_error",
        code: error.code,
        message: error.message,
        param: "Idempotency-Key",
      });
    case "invalid_list_value":
      return invalidRequest(error.code, error.message, error.param ?? "value");
    case "invalid_settings":
    case "too_many_rules":
    case "too_many_limit_buckets":
    case "limit_bucket_name_taken":
      return invalidRequest(error.code, error.message, error.param);
    case "billing_hold":
      // As billing's own holds: 402, never retried by the SDK.
      return new ApiError(402, { type: "billing_error", code: error.code, message: error.message });
    case "classification_unavailable":
    case "phone_lookup_unavailable":
      // The model failed or timed out, or there is no phone data provider: worth a retry (the SDK
      // retries 503s).
      return new ApiError(503, { type: "api_error", code: error.code, message: error.message });
    case "not_found":
      return new ApiError(404, {
        type: "not_found_error",
        code: error.code,
        message: error.message,
        ...(error.param ? { param: error.param } : {}),
      });
  }
}

function fromBillingError(error: BillingError): ApiError {
  // The plan or the account's billing stands in the way: 402, never retried by the SDK.
  if (error.status === 402) {
    return new ApiError(402, { type: "billing_error", code: error.code, message: error.message });
  }
  if (error.status === 404) {
    return new ApiError(404, { type: "not_found_error", code: error.code, message: error.message });
  }
  if (error.status === 403) {
    return new ApiError(403, {
      type: "permission_error",
      code: error.code,
      message: error.message,
    });
  }
  if (error.status >= 500) {
    return new ApiError(503, { type: "api_error", code: error.code, message: error.message });
  }
  return invalidRequest(error.code, error.message);
}

function fromHookError(error: HookError): ApiError {
  if (error.code === "request_in_progress" || error.code === "idempotency_key_reused") {
    return fromIdempotencyError({ code: error.code, message: error.message });
  }
  if (error.status === 402) {
    return new ApiError(402, { type: "billing_error", code: error.code, message: error.message });
  }
  if (error.status === 404) {
    return new ApiError(404, { type: "not_found_error", code: error.code, message: error.message });
  }
  if (error.status === 403) {
    return new ApiError(403, {
      type: "permission_error",
      code: error.code,
      message: error.message,
    });
  }
  return invalidRequest(error.code, error.message, error.param);
}

function fromSubaccountError(error: SubaccountError): ApiError {
  if (error.status === 404) {
    return new ApiError(404, {
      type: "not_found_error",
      code: error.code,
      message: error.message,
      ...(error.param !== undefined && { param: error.param }),
    });
  }
  return invalidRequest(error.code, error.message, error.param);
}

/** Maps known error classes to their envelope; `null` means unexpected (a bug or an outage). */
export function toApiError(error: unknown): ApiError | null {
  if (error instanceof ApiError) return error;
  if (error instanceof HipaaModeError) {
    return new ApiError(403, {
      type: "permission_error",
      code: error.code,
      message: error.message,
    });
  }
  if (error instanceof BillingError) return fromBillingError(error);
  if (error instanceof EmailError) return fromEmailError(error);
  if (error instanceof HookError) return fromHookError(error);
  if (error instanceof SubaccountError) return fromSubaccountError(error);
  if (error instanceof DomainError) return fromDomainError(error);
  if (error instanceof ContactError) return fromContactError(error);
  if (error instanceof BroadcastError) return fromBroadcastError(error);
  if (error instanceof InboxError) return fromInboxError(error);
  if (error instanceof WebhookError) return fromWebhookError(error);
  if (error instanceof RiskError) return fromRiskError(error);
  if (error instanceof SmsError) return fromSmsError(error);
  if (error instanceof SignError) return fromSignError(error);
  if (error instanceof VerifyError) return fromVerifyError(error);
  if (error instanceof FormError) return fromFormError(error);
  if (error instanceof SchedulingError) return fromSchedulingError(error);
  // A 5xx exception is a server fault: left to the caller to log and answer with a generic 500.
  if (error instanceof HTTPException && error.status < 500) return fromHttpException(error);
  return null;
}

export function payloadTooLarge(limitBytes?: number): ApiError {
  return new ApiError(413, {
    type: "invalid_request_error",
    code: "payload_too_large",
    message:
      limitBytes === undefined
        ? "The request body is too large."
        : `The request body is larger than the ${limitBytes / 1024 / 1024} MB limit.`,
  });
}

export function internalError(): ApiError {
  return new ApiError(500, {
    type: "api_error",
    code: "internal_error",
    message:
      "Something went wrong on our end. Retry the request; if it keeps failing, contact support " +
      "with the request_id.",
  });
}

export function notFound(message: string): ApiError {
  return new ApiError(404, { type: "not_found_error", code: "not_found", message });
}
