/**
 * Webhook endpoint wire types (endpoint management). The body coss.com posts to an endpoint is
 * `WebhookEvent` in `./webhook.ts`.
 */
import type { ApiVersion } from "../api-version.ts";
import type { EmailEventType } from "./email.ts";
import type { FormWebhookEventType } from "./forms.ts";
import type { InboxEventType } from "./inbox.ts";
import type { SchedulingWebhookEventType } from "./scheduling.ts";
import type { SignWebhookEventType } from "./sign.ts";
import type { ReceivedSmsEventType, SmsEventType } from "./sms.ts";
import type { VerifyWebhookEventType } from "./verify.ts";
import type {
  AccountEventType,
  AccountWebhookEvent,
  BillingEventType,
  BillingWebhookEvent,
  BroadcastEventType,
  ContactEventType,
  DomainEventType,
  DomainWebhookEvent,
  HookOperationalEventType,
  ReceivedEmailEventType,
  RiskEventType,
  SubaccountEventType,
  SubaccountWebhookEvent,
  WebhookEvent,
} from "./webhook.ts";

/** Every event type an endpoint can subscribe to. */
export type WebhookEventType =
  | EmailEventType
  | ReceivedEmailEventType
  | DomainEventType
  | AccountEventType
  | SubaccountEventType
  | BillingEventType
  | RiskEventType
  | HookOperationalEventType
  | ContactEventType
  | BroadcastEventType
  | InboxEventType
  | SmsEventType
  | ReceivedSmsEventType
  | SignWebhookEventType
  | VerifyWebhookEventType
  | FormWebhookEventType
  | SchedulingWebhookEventType;

/** Why an endpoint is disabled. */
export type WebhookEndpointDisabledReason = "manual" | "failing";

/** A URL of the API key's environment that receives signed event notifications. */
export interface WebhookEndpoint {
  object: "webhook_endpoint";
  id: string;
  url: string;
  description: string | null;
  /**
   * Event types delivered to this endpoint. An empty array means every event type, including
   * ones added later.
   */
  event_types: string[];
  /** The API version events are rendered in for this endpoint (each event's `api_version`). */
  api_version: string;
  /** A disabled endpoint receives nothing until it is enabled again. */
  enabled: boolean;
  /**
   * `manual`: someone disabled it. `failing`: its deliveries failed every attempt for five days,
   * so coss.com disabled it. `null` while enabled.
   */
  disabled_reason: WebhookEndpointDisabledReason | null;
  /** When it was disabled (ISO 8601); `null` while enabled. */
  disabled_at: string | null;
  /**
   * When the endpoint's current run of failed deliveries began (ISO 8601); cleared by the next
   * successful delivery. An endpoint failing for five days is disabled. `null` while healthy.
   */
  failing_since: string | null;
  /**
   * After a secret roll, deliveries are also signed with the previous secret until this time
   * (ISO 8601). `null` when only the current secret signs.
   */
  previous_secret_expires_at: string | null;
  /** ISO 8601 timestamp. */
  created_at: string;
  updated_at: string;
}

/** A freshly created endpoint, or one whose secret was just rolled: the only responses with the signing secret. */
export interface WebhookEndpointWithSecret extends WebhookEndpoint {
  /**
   * The endpoint's `whsec_…` signing secret, for `verifyWebhook`. Returned only on creation and
   * on a roll — store it now; it cannot be read back through the API.
   */
  secret: string;
}

/** Body of `POST /v1/webhook_endpoints`. */
export interface CreateWebhookEndpointParams {
  /** An `https://` URL coss.com posts events to. */
  url: string;
  /** A note for your own reference. */
  description?: string | null;
  /** Defaults to every event type, including ones added later. */
  event_types?: WebhookEventType[];
  /**
   * The API version events are rendered in. Defaults to the client's `apiVersion`, so events match
   * this SDK's `WebhookEvent` types.
   */
  api_version?: ApiVersion;
}

/** Body of `PATCH /v1/webhook_endpoints/{id}`. Omitted fields keep their current value. */
export interface UpdateWebhookEndpointParams {
  url?: string;
  /** `null` clears the description. */
  description?: string | null;
  event_types?: WebhookEventType[];
  api_version?: ApiVersion;
  enabled?: boolean;
}

/** Body of `POST /v1/webhook_endpoints/{id}/roll_secret`. */
export interface RollWebhookEndpointSecretParams {
  /**
   * Seconds the current secret keeps signing deliveries next to the new one, so receivers can
   * switch without rejecting anything. Default 86400 (a day), at most 604800 (a week). `0` stops
   * it immediately, e.g. after a leak.
   */
  previous_secret_expires_in?: number;
}

/** Body of `POST /v1/webhook_endpoints/{id}/recover`. */
export interface RecoverWebhookEndpointParams {
  /**
   * Requeue the deliveries that failed and were created at or after this time (ISO 8601 string or
   * `Date`). Deliveries are kept for 30 days.
   */
  since: string | Date;
}

/** Returned by `webhookEndpoints.recover`. */
export interface WebhookEndpointRecovery {
  object: "webhook_endpoint_recovery";
  endpoint_id: string;
  /** How many failed deliveries were queued for one more attempt (spread over the next minute). */
  requeued: number;
  /** At most 1,000 are requeued per call; `true` means call again with the same `since`. */
  has_more: boolean;
}

/** Returned by `webhookEndpoints.delete`. */
export interface DeletedWebhookEndpoint {
  object: "webhook_endpoint";
  id: string;
  deleted: true;
}

/**
 * `pending`: waiting for its next attempt. `succeeded`: the endpoint answered with a 2xx status.
 * `failed`: every attempt failed, or the endpoint was disabled.
 */
export type WebhookDeliveryStatus = "pending" | "succeeded" | "failed";

/** One HTTP request of a delivery. */
export interface WebhookAttempt {
  object: "webhook_attempt";
  id: string;
  /** ISO 8601 timestamp. */
  attempted_at: string;
  /** The endpoint's HTTP status; `null` when no response arrived. */
  status_code: number | null;
  duration_ms: number;
  /** Why the attempt failed (e.g. `HTTP 500`, a timeout); `null` on success. */
  error: string | null;
  /** At most 1 KB of the response body, as text. */
  response_excerpt: string | null;
}

/** One event sent to one endpoint, retried with backoff until it succeeds or gives up. */
export interface WebhookDelivery {
  object: "webhook_delivery";
  id: string;
  endpoint_id: string;
  /** The event's id: the `id` of the payload and the `webhook-id` header. */
  event_id: string;
  event_type: string;
  status: WebhookDeliveryStatus;
  attempt_count: number;
  /** When the next attempt is due; `null` once the delivery is finished. */
  next_attempt_at: string | null;
  last_status_code: number | null;
  last_error: string | null;
  /** The event body, exactly as posted to the endpoint (a `WebhookEvent`). */
  payload: Record<string, unknown>;
  /** Every HTTP attempt of this delivery, oldest first. */
  attempts: WebhookAttempt[];
  created_at: string;
  updated_at: string;
}

/** Query of `GET /v1/webhook_endpoints/{id}/deliveries`. */
export interface ListWebhookDeliveriesParams {
  /** Only deliveries with this status. */
  status?: WebhookDeliveryStatus;
  /** Only the delivery of this event. */
  event_id?: string;
  /** 1-100, default 50. */
  limit?: number;
  /** Cursor: the `id` of the last delivery of the previous page. */
  after?: string;
}

/** Event types a sandbox environment can send test events of: every one but the live-only ones. */
export type TestWebhookEventType = Exclude<
  WebhookEventType,
  DomainEventType | AccountEventType | SubaccountEventType | BillingEventType
>;

/** Body of `coss.webhookEvents.test()` (`POST /v1/webhook_events/test`). */
export interface SendTestWebhookEventParams {
  /** `domain.*`, `account.*` and `billing.*` only reach live environments: the API refuses them. */
  type: WebhookEventType;
  /**
   * Fields merged over the sample's `data` (objects field by field, anything else replaced), in
   * the latest API version's shape, e.g. a real `email_id`. Unknown fields are refused.
   */
  data?: Record<string, unknown>;
}

/** A test event's body: any event but the live-only ones. */
export type TestWebhookEvent = Exclude<
  WebhookEvent,
  DomainWebhookEvent | AccountWebhookEvent | SubaccountWebhookEvent | BillingWebhookEvent
>;

/** What `coss.webhookEvents.test()` sent, and to how many receivers. */
export interface WebhookTestEvent {
  object: "webhook_test_event";
  /** The event, as an endpoint on the request's API version receives it. */
  event: TestWebhookEvent;
  /** Enabled endpoints subscribed to the type, each sent it once. */
  endpoints: number;
  /** Open `coss listen` listeners subscribed to the type, each handed it once. */
  listeners: number;
}
