/**
 * Public wire schemas for webhook endpoint management (snake_case). Plain zod, no database
 * imports: `@coss/webhooks/schemas` is safe to load anywhere.
 *
 * The set of subscribable event types belongs to the products, not here, so the request bodies
 * are built by `webhookEndpointRequests(eventTypes)` — the public API passes `WEBHOOK_EVENT_TYPES`.
 */
import { API_VERSIONS, LATEST_API_VERSION } from "@coss/versioning";
import { z } from "zod";

export * from "./log-drain-schemas.ts";
export { parseTraceparent, TRACEPARENT_PATTERN } from "./trace-context.ts";

export const WEBHOOK_URL_MAX_LENGTH = 2048;
export const DESCRIPTION_MAX_LENGTH = 256;
/** How long, in seconds, a rolled secret keeps signing next to the new one: a day by default, at most a week. */
export const DEFAULT_PREVIOUS_SECRET_EXPIRES_IN = 24 * 60 * 60;
export const MAX_PREVIOUS_SECRET_EXPIRES_IN = 7 * 24 * 60 * 60;
export const WEBHOOK_ENDPOINT_DISABLED_REASONS = ["manual", "failing"] as const;

/**
 * Webhook events about Hooks (sent to the customer's own webhook endpoints): an endpoint of one of
 * their applications was disabled because it kept failing.
 */
export const HOOK_OPERATIONAL_EVENT_TYPES = ["hook_endpoint.disabled"] as const;
export type HookOperationalEventType = (typeof HOOK_OPERATIONAL_EVENT_TYPES)[number];
export type WebhookEndpointDisabledReason = (typeof WEBHOOK_ENDPOINT_DISABLED_REASONS)[number];

const EVENT_TYPES_DESCRIPTION =
  "Event types delivered to this endpoint. An empty array means every event type, including " +
  "ones added later.";

const API_VERSION_DESCRIPTION =
  "The API version (`Coss-Version`) events are rendered in for this endpoint. Each event carries it as " +
  "`api_version`.";

const ENDPOINT_ID_EXAMPLE = "whep_01k7c8m4q2f3e9v6t5r1n0p8yz";
const ENDPOINT_EXAMPLE = {
  object: "webhook_endpoint",
  id: ENDPOINT_ID_EXAMPLE,
  url: "https://example.com/webhooks/coss",
  description: "Production receiver",
  event_types: ["email.delivered", "email.bounced"],
  api_version: LATEST_API_VERSION,
  enabled: true,
  disabled_reason: null,
  disabled_at: null,
  failing_since: null,
  previous_secret_expires_at: null,
  created_at: "2026-01-15T09:30:00.000Z",
  updated_at: "2026-01-15T09:30:00.000Z",
};

export const WebhookEndpointObject = z
  .object({
    object: z.literal("webhook_endpoint"),
    id: z.string().meta({ examples: [ENDPOINT_ID_EXAMPLE] }),
    url: z.string().meta({
      description: "Where events are posted.",
      examples: ["https://example.com/webhooks/coss"],
    }),
    description: z.string().nullable().meta({ description: "Your note about it. `null`: none." }),
    event_types: z.array(z.string()).meta({ description: EVENT_TYPES_DESCRIPTION }),
    api_version: z
      .string()
      .meta({ description: API_VERSION_DESCRIPTION, examples: [LATEST_API_VERSION] }),
    enabled: z
      .boolean()
      .meta({ description: "A disabled endpoint receives nothing until it is enabled again." }),
    disabled_reason: z
      .enum(WEBHOOK_ENDPOINT_DISABLED_REASONS)
      .nullable()
      .meta({
        description:
          "`manual`: someone disabled it. `failing`: its deliveries failed every attempt for five " +
          "days, so coss.com disabled it. `null` while enabled.",
      }),
    disabled_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When it was disabled. `null` while enabled." }),
    failing_since: z.iso
      .datetime()
      .nullable()
      .meta({
        description:
          "When the endpoint's current run of failed deliveries began (a delivery that failed every " +
          "attempt); cleared by the next successful delivery. An endpoint failing for five days is " +
          "disabled. `null` while healthy.",
      }),
    previous_secret_expires_at: z.iso
      .datetime()
      .nullable()
      .meta({
        description:
          "After a secret roll, deliveries are also signed with the previous secret until this time. " +
          "`null` when only the current secret signs.",
      }),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .meta({ id: "WebhookEndpoint", examples: [ENDPOINT_EXAMPLE] });

export type WebhookEndpointObjectOutput = z.output<typeof WebhookEndpointObject>;

export const WebhookEndpointWithSecret = WebhookEndpointObject.extend({
  secret: z.string().meta({
    description:
      "The endpoint's `whsec_…` signing secret, used to verify the requests coss.com sends. " +
      "Returned only when the endpoint is created and when its secret is rolled — store it now; " +
      "it cannot be read back through the API.",
    examples: ["whsec_6Jk…"],
  }),
}).meta({
  id: "WebhookEndpointWithSecret",
  examples: [{ ...ENDPOINT_EXAMPLE, secret: "whsec_6Jk…" }],
});

export type WebhookEndpointWithSecretOutput = z.output<typeof WebhookEndpointWithSecret>;

export const RollWebhookEndpointSecretRequest = z
  .strictObject({
    previous_secret_expires_in: z
      .number()
      .int()
      .min(0)
      .max(MAX_PREVIOUS_SECRET_EXPIRES_IN)
      .optional()
      .meta({
        description:
          "Seconds the current secret keeps signing deliveries next to the new one, so receivers " +
          `can switch without rejecting anything. Default ${DEFAULT_PREVIOUS_SECRET_EXPIRES_IN} ` +
          `(a day), at most ${MAX_PREVIOUS_SECRET_EXPIRES_IN} (a week). \`0\` stops it ` +
          "immediately, e.g. after a leak.",
      }),
  })
  .meta({
    id: "RollWebhookEndpointSecretRequest",
    examples: [{ previous_secret_expires_in: 3600 }],
  });

export type RollWebhookEndpointSecretRequestOutput = z.output<
  typeof RollWebhookEndpointSecretRequest
>;

export const RecoverWebhookEndpointRequest = z
  .strictObject({
    since: z.iso.datetime({ offset: true }).meta({
      description:
        "Requeue the endpoint's deliveries that failed and were created at or after this time " +
        "(ISO 8601). Deliveries are kept for 30 days.",
      examples: ["2026-01-15T09:00:00.000Z"],
    }),
  })
  .meta({
    id: "RecoverWebhookEndpointRequest",
    examples: [{ since: "2026-01-15T09:00:00.000Z" }],
  });

export type RecoverWebhookEndpointRequestOutput = z.output<typeof RecoverWebhookEndpointRequest>;

export const RecoverWebhookEndpointResult = z
  .object({
    object: z.literal("webhook_endpoint_recovery"),
    endpoint_id: z.string().meta({ examples: [ENDPOINT_ID_EXAMPLE] }),
    requeued: z
      .number()
      .int()
      .meta({
        description:
          "How many failed deliveries were queued for one more attempt. Their attempts are spread " +
          "over the next minute.",
      }),
    has_more: z.boolean().meta({
      description:
        "At most 1,000 are requeued per call; `true` means call again with the same `since`.",
    }),
  })
  .meta({
    id: "WebhookEndpointRecovery",
    examples: [
      {
        object: "webhook_endpoint_recovery",
        endpoint_id: ENDPOINT_ID_EXAMPLE,
        requeued: 12,
        has_more: false,
      },
    ],
  });

export type RecoverWebhookEndpointResultOutput = z.output<typeof RecoverWebhookEndpointResult>;

export const WebhookEndpointList = z
  .object({
    object: z.literal("list"),
    data: z.array(WebhookEndpointObject),
    has_more: z.boolean(),
  })
  .meta({
    id: "WebhookEndpointList",
    examples: [{ object: "list", data: [ENDPOINT_EXAMPLE], has_more: false }],
  });

export type WebhookEndpointListOutput = z.output<typeof WebhookEndpointList>;

export const DeletedWebhookEndpoint = z
  .object({
    object: z.literal("webhook_endpoint"),
    id: z.string(),
    deleted: z.literal(true),
  })
  .meta({
    id: "DeletedWebhookEndpoint",
    examples: [{ object: "webhook_endpoint", id: ENDPOINT_ID_EXAMPLE, deleted: true }],
  });

export type DeletedWebhookEndpointOutput = z.output<typeof DeletedWebhookEndpoint>;

const Url = z
  .string()
  .min(1, "Enter a full URL, like https://example.com/webhooks/coss.")
  .max(WEBHOOK_URL_MAX_LENGTH, `URLs can be at most ${WEBHOOK_URL_MAX_LENGTH} characters.`)
  .meta({
    description: "An `https://` URL coss.com posts events to.",
    examples: ["https://example.com/webhooks/coss"],
  });

const ApiVersion = z.enum(API_VERSIONS).meta({ description: API_VERSION_DESCRIPTION });

const Description = z
  .string()
  .max(DESCRIPTION_MAX_LENGTH, `Can be at most ${DESCRIPTION_MAX_LENGTH} characters.`)
  .meta({ description: "A note for your own reference. `null` clears it." });

/**
 * The create and update bodies for one set of subscribable event types. Called once per process
 * (the schemas carry fixed OpenAPI ids).
 */
export function webhookEndpointRequests<const T extends readonly [string, ...string[]]>(
  eventTypes: T,
) {
  const EventTypes = z
    .array(z.enum(eventTypes))
    .max(eventTypes.length)
    .meta({ description: EVENT_TYPES_DESCRIPTION });

  const CreateWebhookEndpointRequest = z
    .strictObject({
      url: Url,
      description: Description.nullish(),
      event_types: EventTypes.optional().meta({
        description: `${EVENT_TYPES_DESCRIPTION} Defaults to every event type.`,
      }),
      api_version: ApiVersion.optional().meta({
        description: `${API_VERSION_DESCRIPTION} Defaults to the version of the request that creates the endpoint.`,
      }),
    })
    .meta({
      id: "CreateWebhookEndpointRequest",
      examples: [
        {
          url: "https://example.com/webhooks/coss",
          description: "Production receiver",
          event_types: eventTypes.slice(0, 2),
        },
      ],
    });

  const UpdateWebhookEndpointRequest = z
    .strictObject({
      url: Url.optional(),
      description: Description.nullish(),
      event_types: EventTypes.optional(),
      api_version: ApiVersion.optional(),
      enabled: z.boolean().optional(),
    })
    .refine((value) => Object.values(value).some((field) => field !== undefined), {
      error: "Provide at least one field to update.",
    })
    .meta({ id: "UpdateWebhookEndpointRequest", examples: [{ enabled: false }] });

  return { CreateWebhookEndpointRequest, UpdateWebhookEndpointRequest };
}

export const WEBHOOK_DELIVERY_STATUSES = ["pending", "succeeded", "failed"] as const;
export const DEFAULT_DELIVERY_LIST_LIMIT = 50;
export const MAX_DELIVERY_LIST_LIMIT = 100;

const DELIVERY_ID_EXAMPLE = "whdel_01k7c8n2b5d7f9h1k3m5p7r9tv";
const EVENT_ID_EXAMPLE = "evt_01k7c8n1z4c6e8g0j2l4n6q8sa";
const ATTEMPT_EXAMPLE = {
  object: "webhook_attempt",
  id: "whatt_01k7c8n2c9e1g3j5l7n9q1s3uw",
  attempted_at: "2026-01-15T09:30:01.000Z",
  status_code: 200,
  duration_ms: 182,
  error: null,
  response_excerpt: "ok",
};
const DELIVERY_EXAMPLE = {
  object: "webhook_delivery",
  id: DELIVERY_ID_EXAMPLE,
  endpoint_id: ENDPOINT_ID_EXAMPLE,
  event_id: EVENT_ID_EXAMPLE,
  event_type: "email.delivered",
  status: "succeeded",
  attempt_count: 1,
  next_attempt_at: null,
  last_status_code: 200,
  last_error: null,
  payload: {
    id: EVENT_ID_EXAMPLE,
    object: "event",
    type: "email.delivered",
    created_at: "2026-01-15T09:30:00.000Z",
    data: { email_id: "email_01k7c8m9x3a5c7e9g1j3l5n7q9", recipient: "user@example.com" },
  },
  attempts: [ATTEMPT_EXAMPLE],
  created_at: "2026-01-15T09:30:00.000Z",
  updated_at: "2026-01-15T09:30:01.000Z",
};

export const WebhookDeliveryStatusEnum = z.enum(WEBHOOK_DELIVERY_STATUSES).meta({
  id: "WebhookDeliveryStatus",
  description:
    "`pending`: waiting for its next attempt. `succeeded`: the endpoint answered with a 2xx " +
    "status. `failed`: every attempt failed, or the endpoint was disabled.",
});

export const WebhookAttemptObject = z
  .object({
    object: z.literal("webhook_attempt"),
    id: z.string(),
    attempted_at: z.iso.datetime().meta({ description: "When the attempt ran." }),
    status_code: z
      .number()
      .int()
      .nullable()
      .meta({ description: "The endpoint's HTTP status; `null` when no response arrived." }),
    duration_ms: z.number().int().meta({ description: "How long it took, in milliseconds." }),
    error: z.string().nullable().meta({
      description: "Why the attempt failed (e.g. `HTTP 500`, a timeout); `null` on success.",
    }),
    response_excerpt: z
      .string()
      .nullable()
      .meta({ description: "At most 1 KB of the response body, as text." }),
  })
  .meta({ id: "WebhookAttempt", examples: [ATTEMPT_EXAMPLE] });

export type WebhookAttemptObjectOutput = z.output<typeof WebhookAttemptObject>;

export const WebhookDeliveryObject = z
  .object({
    object: z.literal("webhook_delivery"),
    id: z.string().meta({ examples: [DELIVERY_ID_EXAMPLE] }),
    endpoint_id: z.string().meta({ description: "The id of the endpoint it's delivered to." }),
    event_id: z.string().meta({
      description: "The event's id: the `id` of the payload and the `webhook-id` header.",
    }),
    event_type: z.string().meta({ examples: ["email.delivered"] }),
    status: WebhookDeliveryStatusEnum,
    attempt_count: z.number().int().meta({ description: "How many attempts were made so far." }),
    next_attempt_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When the next attempt is due; `null` once the delivery is finished." }),
    last_status_code: z.number().int().nullable().meta({
      description:
        "The endpoint's HTTP status on the latest attempt. `null`: no response arrived, or no attempt yet.",
    }),
    last_error: z.string().nullable().meta({
      description: "Why the latest attempt failed. `null`: it didn't, or no attempt yet.",
    }),
    payload: z
      .record(z.string(), z.unknown())
      .meta({ description: "The event body, exactly as posted to the endpoint." }),
    attempts: z
      .array(WebhookAttemptObject)
      .meta({ description: "Every HTTP attempt of this delivery, oldest first." }),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .meta({ id: "WebhookDelivery", examples: [DELIVERY_EXAMPLE] });

export type WebhookDeliveryObjectOutput = z.output<typeof WebhookDeliveryObject>;

export const WebhookDeliveryList = z
  .object({
    object: z.literal("list"),
    data: z.array(WebhookDeliveryObject),
    has_more: z.boolean(),
  })
  .meta({
    id: "WebhookDeliveryList",
    examples: [{ object: "list", data: [DELIVERY_EXAMPLE], has_more: false }],
  });

export type WebhookDeliveryListOutput = z.output<typeof WebhookDeliveryList>;

export const ListWebhookDeliveriesQuery = z.strictObject({
  status: WebhookDeliveryStatusEnum.optional().meta({
    description: "Only deliveries with this status.",
  }),
  event_id: z.string().optional().meta({ description: "Only the delivery of this event." }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_DELIVERY_LIST_LIMIT)
    .optional()
    .meta({ description: `1-${MAX_DELIVERY_LIST_LIMIT}, default ${DEFAULT_DELIVERY_LIST_LIMIT}.` }),
  after: z
    .string()
    .optional()
    .meta({ description: "Cursor: the `id` of the last delivery of the previous page." }),
});

export type ListWebhookDeliveriesQueryOutput = z.output<typeof ListWebhookDeliveriesQuery>;

export const HookEndpointWebhookEvent = z
  .object({
    id: z.string().meta({
      description: "The event id, also sent as the `webhook-id` header.",
      examples: ["evt_01k7c8m4q2f3e9v6t5r1n0p8yz"],
    }),
    object: z.literal("event"),
    type: z.enum(HOOK_OPERATIONAL_EVENT_TYPES),
    api_version: z.string().meta({
      description:
        "The API version (`Coss-Version`) this event is rendered in: the receiving endpoint's `api_version`.",
    }),
    created_at: z.iso.datetime(),
    data: z.object({
      application_id: z.string(),
      application_uid: z.string().nullable(),
      endpoint_id: z.string(),
      url: z.string(),
      failing_since: z.iso.datetime(),
      occurred_at: z.iso.datetime(),
    }),
  })
  .meta({
    id: "HookEndpointWebhookEvent",
    examples: [
      {
        id: "evt_01k7c8m4q2f3e9v6t5r1n0p8yz",
        object: "event",
        type: "hook_endpoint.disabled",
        api_version: LATEST_API_VERSION,
        created_at: "2026-01-20T09:30:00.000Z",
        data: {
          application_id: "happ_01k7c8m4q2f3e9v6t5r1n0p8yz",
          application_uid: "customer_8812",
          endpoint_id: "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
          url: "https://example.com/webhooks",
          failing_since: "2026-01-15T09:30:00.000Z",
          occurred_at: "2026-01-20T09:30:00.000Z",
        },
      },
    ],
  });
export type HookEndpointWebhookEventOutput = z.output<typeof HookEndpointWebhookEvent>;
/** What the outbox stores: delivery adds `api_version` when it renders the event for an endpoint. */
export type StoredHookEndpointWebhookEvent = Omit<HookEndpointWebhookEventOutput, "api_version">;

/** `coss listen`: the most acknowledgements one poll carries, and the most deliveries it returns. */
export const MAX_LISTENER_POLL_LIMIT = 50;
/** The longest a poll waits for deliveries: well under CloudFront's and the ALB's 60 s. */
export const MAX_LISTENER_WAIT_MS = 25_000;
export const DEFAULT_LISTENER_WAIT_MS = 20_000;
export const DEFAULT_LISTENER_POLL_LIMIT = 10;

const LISTENER_ID_EXAMPLE = "whlis_01k7c8m4q2f3e9v6t5r1n0p8yz";
const LISTENER_DELIVERY_ID_EXAMPLE = "whlisdel_01k7c8n2b5d7f9h1k3m5p7r9tv";
const LISTENER_EXAMPLE = {
  object: "webhook_listener",
  id: LISTENER_ID_EXAMPLE,
  api_version: LATEST_API_VERSION,
  event_types: ["email.delivered", "email.bounced"],
  description: "bailey-mbp → localhost:3000/webhooks",
  expires_at: "2026-01-15T09:40:00.000Z",
  created_at: "2026-01-15T09:30:00.000Z",
};
const LISTENER_DELIVERY_EXAMPLE = {
  object: "webhook_listener_delivery",
  id: LISTENER_DELIVERY_ID_EXAMPLE,
  ack_token: "mfz3k2a8",
  event_id: EVENT_ID_EXAMPLE,
  event_type: "email.delivered",
  attempt: 1,
  body: JSON.stringify({
    id: EVENT_ID_EXAMPLE,
    object: "event",
    type: "email.delivered",
    api_version: LATEST_API_VERSION,
    created_at: "2026-01-15T09:30:00.000Z",
    data: { email_id: "email_01k7c8m9x3a5c7e9g1j3l5n7q9", recipient: "user@example.com" },
  }),
  created_at: "2026-01-15T09:30:00.000Z",
};

export const WebhookListenerObject = z
  .object({
    object: z.literal("webhook_listener"),
    id: z.string().meta({ examples: [LISTENER_ID_EXAMPLE] }),
    api_version: z.string().meta({
      description: "The API version (`Coss-Version`) the listener's events are rendered in.",
      examples: [LATEST_API_VERSION],
    }),
    event_types: z.array(z.string()).meta({
      description: "Event types the listener receives. An empty array means every event type.",
    }),
    description: z
      .string()
      .nullable()
      .meta({ description: "Your note about it, such as the machine it's on. `null`: none." }),
    expires_at: z.iso.datetime().meta({
      description:
        "When the listener closes unless it is polled again; every poll moves it 10 minutes ahead.",
    }),
    created_at: z.iso.datetime(),
  })
  .meta({ id: "WebhookListener", examples: [LISTENER_EXAMPLE] });

export type WebhookListenerObjectOutput = z.output<typeof WebhookListenerObject>;

export const WebhookListenerDeliveryObject = z
  .object({
    object: z.literal("webhook_listener_delivery"),
    id: z.string().meta({ examples: [LISTENER_DELIVERY_ID_EXAMPLE] }),
    ack_token: z.string().meta({
      description: "Send it back with the delivery's acknowledgement in a later poll.",
    }),
    event_id: z.string().meta({
      description:
        "The event's id: the `id` of the body, and the `webhook-id` header endpoints receive.",
    }),
    event_type: z.string().meta({ examples: ["email.delivered"] }),
    attempt: z.number().int().meta({
      description:
        "How many polls have handed it out: more than 1 when an earlier answer was never acknowledged.",
    }),
    body: z.string().meta({
      description:
        "The event body, exactly as an endpoint with the listener's API version would receive it.",
    }),
    created_at: z.iso.datetime(),
  })
  .meta({ id: "WebhookListenerDelivery", examples: [LISTENER_DELIVERY_EXAMPLE] });

export type WebhookListenerDeliveryObjectOutput = z.output<typeof WebhookListenerDeliveryObject>;

export const WebhookListenerPoll = z
  .object({
    object: z.literal("webhook_listener_poll"),
    listener: WebhookListenerObject,
    deliveries: z.array(WebhookListenerDeliveryObject).meta({
      description:
        "Events to forward, oldest first. Empty when none arrived while the poll waited. A " +
        "delivery not acknowledged within two minutes is handed out again.",
    }),
    acknowledged: z
      .number()
      .int()
      .meta({ description: "How many of the request's acknowledgements were recorded." }),
  })
  .meta({
    id: "WebhookListenerPoll",
    examples: [
      {
        object: "webhook_listener_poll",
        listener: LISTENER_EXAMPLE,
        deliveries: [LISTENER_DELIVERY_EXAMPLE],
        acknowledged: 0,
      },
    ],
  });

export type WebhookListenerPollOutput = z.output<typeof WebhookListenerPoll>;

export const DeletedWebhookListener = z
  .object({
    object: z.literal("webhook_listener"),
    id: z.string(),
    deleted: z.literal(true),
  })
  .meta({
    id: "DeletedWebhookListener",
    examples: [{ object: "webhook_listener", id: LISTENER_ID_EXAMPLE, deleted: true }],
  });

export type DeletedWebhookListenerOutput = z.output<typeof DeletedWebhookListener>;

export const WebhookListenerAckRequest = z
  .strictObject({
    delivery_id: z.string().meta({ examples: [LISTENER_DELIVERY_ID_EXAMPLE] }),
    ack_token: z.string().max(64).meta({ description: "The delivery's `ack_token`." }),
    status_code: z.number().int().min(100).max(599).nullable().meta({
      description:
        "What the local URL answered; `null` when nothing answered, or when the event was only printed.",
    }),
    duration_ms: z.number().int().min(0).max(3_600_000),
    error: z.string().max(500).nullable().meta({
      description: "Why forwarding failed (e.g. `connection refused`); `null` if it didn't.",
    }),
  })
  .meta({ id: "WebhookListenerAck" });

export const PollWebhookListenerRequest = z
  .strictObject({
    acks: z
      .array(WebhookListenerAckRequest)
      .max(MAX_LISTENER_POLL_LIMIT)
      .optional()
      .meta({
        description:
          "What happened to deliveries handed out earlier. A delivery is finished once acknowledged: " +
          "a 2xx status (or none, with no error) succeeds; anything else fails. Neither is retried.",
      }),
    wait_ms: z
      .number()
      .int()
      .min(0)
      .max(MAX_LISTENER_WAIT_MS)
      .optional()
      .meta({
        description: `How long to wait for deliveries when none is pending, in milliseconds. Default ${DEFAULT_LISTENER_WAIT_MS}, at most ${MAX_LISTENER_WAIT_MS}.`,
      }),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_LISTENER_POLL_LIMIT)
      .optional()
      .meta({
        description: `The most deliveries to hand out. Default ${DEFAULT_LISTENER_POLL_LIMIT}, at most ${MAX_LISTENER_POLL_LIMIT}.`,
      }),
  })
  .meta({
    id: "PollWebhookListenerRequest",
    examples: [
      {
        acks: [
          {
            delivery_id: LISTENER_DELIVERY_ID_EXAMPLE,
            ack_token: "mfz3k2a8",
            status_code: 200,
            duration_ms: 12,
            error: null,
          },
        ],
        wait_ms: DEFAULT_LISTENER_WAIT_MS,
      },
    ],
  });

export type PollWebhookListenerRequestOutput = z.output<typeof PollWebhookListenerRequest>;

/** The create body for one set of subscribable event types (called once per process). */
export function webhookListenerRequests<const T extends readonly [string, ...string[]]>(
  eventTypes: T,
) {
  const CreateWebhookListenerRequest = z
    .strictObject({
      event_types: z
        .array(z.enum(eventTypes))
        .max(eventTypes.length)
        .optional()
        .meta({ description: "Event types to receive. Defaults to every event type." }),
      api_version: ApiVersion.optional().meta({
        description:
          "The API version events are rendered in. Defaults to the version of the request that creates the listener.",
      }),
      description: Description.nullish().meta({
        description: "Where the events go, for your own reference (shown in the log).",
      }),
    })
    .meta({
      id: "CreateWebhookListenerRequest",
      examples: [{ event_types: eventTypes.slice(0, 2), description: "localhost:3000/webhooks" }],
    });
  return { CreateWebhookListenerRequest };
}
