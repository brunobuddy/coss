/**
 * Public wire schemas for Hooks (snake_case). Plain zod, no database imports: `@coss/hooks/schemas`
 * is safe to load anywhere (the dashboard, the portal, the docs).
 */
import { z } from "zod";

/** A message's payload, serialized: at most 256 KB. */
export const MAX_PAYLOAD_BYTES = 256 * 1024;
export const MAX_METADATA_KEYS = 16;
export const URL_MAX_LENGTH = 2048;
export const DESCRIPTION_MAX_LENGTH = 256;
export const NAME_MAX_LENGTH = 256;
/** An event type's schema and examples together, serialized. */
export const MAX_EVENT_TYPE_DOCS_BYTES = 64 * 1024;
export const MAX_EXAMPLES = 5;
export const MAX_RATE_LIMIT_PER_SECOND = 1000;
export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 100;
export const DEFAULT_PREVIOUS_SECRET_EXPIRES_IN = 24 * 60 * 60;
export const MAX_PREVIOUS_SECRET_EXPIRES_IN = 7 * 24 * 60 * 60;
export const DEFAULT_PORTAL_SESSION_EXPIRES_IN = 60 * 60;
export const MAX_PORTAL_SESSION_EXPIRES_IN = 24 * 60 * 60;
export const MAX_PORTAL_ORIGINS = 10;

export const EVENT_TYPE_NAME = /^[A-Za-z0-9_.-]{1,64}$/;
export const APPLICATION_UID = /^[A-Za-z0-9_.:@|-]{1,256}$/;

export const HOOK_DELIVERY_STATUSES = ["pending", "succeeded", "failed"] as const;
export type HookDeliveryStatus = (typeof HOOK_DELIVERY_STATUSES)[number];
export const HOOK_ENDPOINT_DISABLED_REASONS = ["manual", "failing"] as const;
export type HookEndpointDisabledReason = (typeof HOOK_ENDPOINT_DISABLED_REASONS)[number];
export const PORTAL_THEMES = ["system", "light", "dark"] as const;
export type PortalTheme = (typeof PORTAL_THEMES)[number];

const CREATED = "2026-01-15T09:30:00.000Z";
const APPLICATION_ID = "happ_01k7c8m4q2f3e9v6t5r1n0p8yz";
const ENDPOINT_ID = "hep_01k7c8m4q2f3e9v6t5r1n0p8yz";
const MESSAGE_ID = "hmsg_01k7c8m4q2f3e9v6t5r1n0p8yz";
const DELIVERY_ID = "hdel_01k7c8m4q2f3e9v6t5r1n0p8yz";
const ATTEMPT_ID = "hatt_01k7c8m4q2f3e9v6t5r1n0p8yz";
const RECOVERY_ID = "hrec_01k7c8m4q2f3e9v6t5r1n0p8yz";
const SESSION_ID = "hps_01k7c8m4q2f3e9v6t5r1n0p8yz";
const PAYLOAD_EXAMPLE = { invoice_id: "in_1042", amount: 4200, currency: "usd" };

const Metadata = z
  .record(z.string().min(1).max(40), z.string().max(500))
  .refine((value) => Object.keys(value).length <= MAX_METADATA_KEYS, {
    message: `At most ${MAX_METADATA_KEYS} metadata keys.`,
  })
  .meta({
    description: `Your own key-value pairs (at most ${MAX_METADATA_KEYS}; keys up to 40 characters, values up to 500).`,
    examples: [{ plan: "pro" }],
  });

const ListLimit = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_LIST_LIMIT)
  .optional()
  .meta({ description: `1-${MAX_LIST_LIMIT}, default ${DEFAULT_LIST_LIMIT}.` });

function listOf<T extends z.ZodType>(item: T, id: string, example: unknown) {
  return z
    .object({ object: z.literal("list"), data: z.array(item), has_more: z.boolean() })
    .meta({ id, examples: [{ object: "list", data: [example], has_more: false }] });
}

// Applications.

const APPLICATION_EXAMPLE = {
  object: "hook_application",
  id: APPLICATION_ID,
  uid: "customer_8812",
  name: "Acme Corp",
  metadata: { plan: "pro" },
  created_at: CREATED,
  updated_at: CREATED,
};

const ApplicationUid = z.string().regex(APPLICATION_UID, {
  message: "Use 1-256 letters, digits and . _ : @ | -",
});

export const HookApplicationObject = z
  .object({
    object: z.literal("hook_application"),
    id: z.string().meta({ examples: [APPLICATION_ID] }),
    uid: z
      .string()
      .nullable()
      .meta({
        description:
          "Your own id for it (e.g. your customer's id), unique in the environment. Every path that " +
          "takes an application accepts its `id` or its `uid`.",
      }),
    name: z.string().meta({ description: "Shown to the application's users in the portal." }),
    metadata: z.record(z.string(), z.string()).meta({ description: "Your own key-value pairs." }),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .meta({ id: "HookApplication", examples: [APPLICATION_EXAMPLE] });
export type HookApplicationObjectOutput = z.output<typeof HookApplicationObject>;

export const CreateHookApplicationRequest = z
  .strictObject({
    name: z
      .string()
      .trim()
      .min(1)
      .max(NAME_MAX_LENGTH)
      .meta({
        description: "Shown to the application's users in the portal.",
        examples: ["Acme Corp"],
      }),
    uid: ApplicationUid.optional().meta({
      description: "Your own id for it, to address it by in every path instead of its `id`.",
      examples: ["customer_8812"],
    }),
    metadata: Metadata.optional(),
  })
  .meta({
    id: "CreateHookApplicationRequest",
    examples: [{ name: "Acme Corp", uid: "customer_8812", metadata: { plan: "pro" } }],
  });
export type CreateHookApplicationRequestOutput = z.output<typeof CreateHookApplicationRequest>;

export const UpdateHookApplicationRequest = z
  .strictObject({
    name: z
      .string()
      .trim()
      .min(1)
      .max(NAME_MAX_LENGTH)
      .optional()
      .meta({ description: "Shown to the application's users in the portal." }),
    uid: ApplicationUid.nullable().optional().meta({ description: "`null` removes it." }),
    metadata: Metadata.optional().meta({ description: "Replaces the metadata." }),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update." })
  .meta({ id: "UpdateHookApplicationRequest", examples: [{ name: "Acme Corporation" }] });
export type UpdateHookApplicationRequestOutput = z.output<typeof UpdateHookApplicationRequest>;

export const HookApplicationList = listOf(
  HookApplicationObject,
  "HookApplicationList",
  APPLICATION_EXAMPLE,
);
export type HookApplicationListOutput = z.output<typeof HookApplicationList>;

export const ListHookApplicationsQuery = z.strictObject({
  limit: ListLimit,
  after: z
    .string()
    .optional()
    .meta({ description: "Cursor: the `id` of the last application of the previous page." }),
});
export type ListHookApplicationsQueryOutput = z.output<typeof ListHookApplicationsQuery>;

export const DeletedHookApplication = z
  .object({ object: z.literal("hook_application"), id: z.string(), deleted: z.literal(true) })
  .meta({
    id: "DeletedHookApplication",
    examples: [{ object: "hook_application", id: APPLICATION_ID, deleted: true }],
  });
export type DeletedHookApplicationOutput = z.output<typeof DeletedHookApplication>;

// Event types.

const EVENT_TYPE_EXAMPLE = {
  object: "hook_event_type",
  name: "invoice.paid",
  description: "An invoice was paid in full.",
  schema: {
    type: "object",
    properties: { invoice_id: { type: "string" }, amount: { type: "integer" } },
  },
  examples: [PAYLOAD_EXAMPLE],
  archived: false,
  created_at: CREATED,
  updated_at: CREATED,
};

const EventTypeName = z.string().regex(EVENT_TYPE_NAME, {
  message: "Use 1-64 letters, digits and . _ -",
});
const JsonSchema = z
  .record(z.string(), z.unknown())
  .meta({ description: "A JSON Schema of the payload, shown to your users (not enforced)." });
const Examples = z
  .array(z.record(z.string(), z.unknown()))
  .max(MAX_EXAMPLES)
  .meta({
    description: `Up to ${MAX_EXAMPLES} example payloads; the first is what a test send delivers.`,
  });

export const HookEventTypeObject = z
  .object({
    object: z.literal("hook_event_type"),
    name: z.string().meta({
      description: "The type's name, which messages send as `event_type`.",
      examples: ["invoice.paid"],
    }),
    description: z
      .string()
      .nullable()
      .meta({ description: "What this event means, shown to your users. `null`: none." }),
    schema: z.record(z.string(), z.unknown()).nullable().meta({
      description:
        "A JSON Schema of the payload, shown to your users (not enforced). `null`: none.",
    }),
    examples: z
      .array(z.record(z.string(), z.unknown()))
      .meta({ description: "Sample payloads, shown to your users. Test sends use the first." }),
    archived: z.boolean().meta({
      description:
        "Archived types are hidden from the portal and can't be subscribed to; messages of the " +
        "type are still delivered to endpoints that subscribed before.",
    }),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .meta({ id: "HookEventType", examples: [EVENT_TYPE_EXAMPLE] });
export type HookEventTypeObjectOutput = z.output<typeof HookEventTypeObject>;

export const CreateHookEventTypeRequest = z
  .strictObject({
    name: EventTypeName.meta({
      description:
        "The type's name, which messages send as `event_type`. Letters, digits and `. _ -`.",
      examples: ["invoice.paid"],
    }),
    description: z
      .string()
      .trim()
      .max(DESCRIPTION_MAX_LENGTH)
      .optional()
      .meta({ description: "What this event means, shown to your users." }),
    schema: JsonSchema.optional(),
    examples: Examples.optional(),
  })
  .meta({
    id: "CreateHookEventTypeRequest",
    examples: [
      {
        name: "invoice.paid",
        description: "An invoice was paid in full.",
        examples: [PAYLOAD_EXAMPLE],
      },
    ],
  });
export type CreateHookEventTypeRequestOutput = z.output<typeof CreateHookEventTypeRequest>;

export const UpdateHookEventTypeRequest = z
  .strictObject({
    description: z
      .string()
      .trim()
      .max(DESCRIPTION_MAX_LENGTH)
      .nullable()
      .optional()
      .meta({ description: "What this event means, shown to your users. `null` removes it." }),
    schema: JsonSchema.nullable().optional(),
    examples: Examples.optional(),
    archived: z.boolean().optional().meta({ description: "`false` restores an archived type." }),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update." })
  .meta({ id: "UpdateHookEventTypeRequest", examples: [{ archived: false }] });
export type UpdateHookEventTypeRequestOutput = z.output<typeof UpdateHookEventTypeRequest>;

export const HookEventTypeList = listOf(
  HookEventTypeObject,
  "HookEventTypeList",
  EVENT_TYPE_EXAMPLE,
);
export type HookEventTypeListOutput = z.output<typeof HookEventTypeList>;

export const ListHookEventTypesQuery = z.strictObject({
  include_archived: z
    .enum(["true", "false"])
    .optional()
    .meta({ description: "Also list archived types (default `false`)." }),
  limit: ListLimit,
  after: z
    .string()
    .optional()
    .meta({ description: "Cursor: the `name` of the last type of the previous page." }),
});
export type ListHookEventTypesQueryOutput = z.output<typeof ListHookEventTypesQuery>;

// Endpoints.

const ENDPOINT_EXAMPLE = {
  object: "hook_endpoint",
  id: ENDPOINT_ID,
  application_id: APPLICATION_ID,
  url: "https://example.com/webhooks",
  description: "Production",
  filter_types: ["invoice.paid"],
  rate_limit_per_second: null,
  enabled: true,
  disabled_reason: null,
  disabled_at: null,
  failing_since: null,
  previous_secret_expires_at: null,
  metadata: {},
  created_at: CREATED,
  updated_at: CREATED,
};

const FilterTypes = z
  .array(EventTypeName)
  .max(250)
  .meta({
    description:
      "Event types delivered to this endpoint (existing, unarchived ones). An empty array means " +
      "every type, including ones added later.",
    examples: [["invoice.paid"]],
  });
const RateLimit = z
  .number()
  .int()
  .min(1)
  .max(MAX_RATE_LIMIT_PER_SECOND)
  .meta({ description: "At most this many requests per second to this endpoint." });

export const HookEndpointObject = z
  .object({
    object: z.literal("hook_endpoint"),
    id: z.string().meta({ examples: [ENDPOINT_ID] }),
    application_id: z.string().meta({ description: "The id of the application it belongs to." }),
    url: z.string().meta({ description: "Where deliveries are sent." }),
    description: z.string().nullable().meta({ description: "Your note about it. `null`: none." }),
    filter_types: z
      .array(z.string())
      .meta({ description: "Only these event types are delivered. Empty: every type." }),
    rate_limit_per_second: z.number().int().nullable().meta({
      description:
        "At most this many requests per second to this endpoint. `null`: no limit of its own.",
    }),
    enabled: z.boolean().meta({ description: "Whether new messages are delivered to it." }),
    disabled_reason: z
      .enum(HOOK_ENDPOINT_DISABLED_REASONS)
      .nullable()
      .meta({
        description:
          "`manual`: disabled by you or its user. `failing`: its deliveries failed every attempt for " +
          "five days, so coss.com disabled it. `null` while enabled.",
      }),
    disabled_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When it was disabled. `null`: it's enabled." }),
    failing_since: z.iso
      .datetime()
      .nullable()
      .meta({
        description:
          "When its current run of failed deliveries began; cleared by the next success. `null` " +
          "while healthy.",
      }),
    previous_secret_expires_at: z.iso.datetime().nullable().meta({
      description:
        "After a secret roll, requests are also signed with the previous secret until then.",
    }),
    metadata: z.record(z.string(), z.string()).meta({ description: "Your own key-value pairs." }),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .meta({ id: "HookEndpoint", examples: [ENDPOINT_EXAMPLE] });
export type HookEndpointObjectOutput = z.output<typeof HookEndpointObject>;

export const HookEndpointWithSecret = HookEndpointObject.extend({
  secret: z.string().meta({
    description: "The endpoint's `whsec_…` signing secret (Standard Webhooks).",
    examples: ["whsec_6Jk…"],
  }),
}).meta({
  id: "HookEndpointWithSecret",
  examples: [{ ...ENDPOINT_EXAMPLE, secret: "whsec_6Jk…" }],
});
export type HookEndpointWithSecretOutput = z.output<typeof HookEndpointWithSecret>;

export const CreateHookEndpointRequest = z
  .strictObject({
    url: z
      .string()
      .max(URL_MAX_LENGTH)
      .meta({ examples: ["https://example.com/webhooks"] }),
    description: z
      .string()
      .trim()
      .max(DESCRIPTION_MAX_LENGTH)
      .optional()
      .meta({ description: "Your note about it." }),
    filter_types: FilterTypes.optional(),
    secret: z
      .string()
      .optional()
      .meta({
        description:
          "A `whsec_` + base64 secret of 24-64 bytes to sign with, e.g. when migrating from another " +
          "provider. Generated when omitted.",
      }),
    rate_limit_per_second: RateLimit.optional(),
    metadata: Metadata.optional(),
    enabled: z.boolean().optional().meta({
      description: "Default `true`. `false` creates it disabled, with `disabled_reason: manual`.",
    }),
  })
  .meta({
    id: "CreateHookEndpointRequest",
    examples: [{ url: "https://example.com/webhooks", filter_types: ["invoice.paid"] }],
  });
export type CreateHookEndpointRequestOutput = z.output<typeof CreateHookEndpointRequest>;

export const UpdateHookEndpointRequest = z
  .strictObject({
    url: z
      .string()
      .max(URL_MAX_LENGTH)
      .optional()
      .meta({ description: "Where deliveries are sent." }),
    description: z
      .string()
      .trim()
      .max(DESCRIPTION_MAX_LENGTH)
      .nullable()
      .optional()
      .meta({ description: "Your note about it. `null` removes it." }),
    filter_types: FilterTypes.optional(),
    rate_limit_per_second: RateLimit.nullable().optional(),
    metadata: Metadata.optional(),
    enabled: z.boolean().optional().meta({
      description:
        "`false` disables it with `disabled_reason: manual`; `true` enables it again and clears the reason.",
    }),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update." })
  .meta({ id: "UpdateHookEndpointRequest", examples: [{ enabled: false }] });
export type UpdateHookEndpointRequestOutput = z.output<typeof UpdateHookEndpointRequest>;

export const HookEndpointList = listOf(HookEndpointObject, "HookEndpointList", ENDPOINT_EXAMPLE);
export type HookEndpointListOutput = z.output<typeof HookEndpointList>;

export const DeletedHookEndpoint = z
  .object({ object: z.literal("hook_endpoint"), id: z.string(), deleted: z.literal(true) })
  .meta({
    id: "DeletedHookEndpoint",
    examples: [{ object: "hook_endpoint", id: ENDPOINT_ID, deleted: true }],
  });
export type DeletedHookEndpointOutput = z.output<typeof DeletedHookEndpoint>;

export const HookEndpointSecret = z
  .object({
    object: z.literal("hook_endpoint_secret"),
    secret: z
      .string()
      .meta({ description: "The endpoint's `whsec_…` signing secret (Standard Webhooks)." }),
  })
  .meta({
    id: "HookEndpointSecret",
    examples: [{ object: "hook_endpoint_secret", secret: "whsec_6Jk…" }],
  });
export type HookEndpointSecretOutput = z.output<typeof HookEndpointSecret>;

export const RollHookEndpointSecretRequest = z
  .strictObject({
    previous_secret_expires_in: z
      .number()
      .int()
      .min(0)
      .max(MAX_PREVIOUS_SECRET_EXPIRES_IN)
      .optional()
      .meta({
        description:
          "Seconds the current secret keeps signing next to the new one. Default " +
          `${DEFAULT_PREVIOUS_SECRET_EXPIRES_IN} (a day), at most ${MAX_PREVIOUS_SECRET_EXPIRES_IN} ` +
          "(a week); `0` stops it immediately.",
      }),
  })
  .meta({ id: "RollHookEndpointSecretRequest", examples: [{ previous_secret_expires_in: 3600 }] });
export type RollHookEndpointSecretRequestOutput = z.output<typeof RollHookEndpointSecretRequest>;

const RECOVERY_EXAMPLE = {
  object: "hook_endpoint_recovery",
  id: RECOVERY_ID,
  endpoint_id: ENDPOINT_ID,
  since: "2026-01-15T00:00:00.000Z",
  until: CREATED,
  status: "pending",
  requeued: 0,
  created_at: CREATED,
  completed_at: null,
};

export const RecoverHookEndpointRequest = z
  .strictObject({
    since: z.iso.datetime({ offset: true }).meta({
      description: "Requeue deliveries that failed, of messages sent from this time until now.",
      examples: ["2026-01-15T00:00:00.000Z"],
    }),
  })
  .meta({ id: "RecoverHookEndpointRequest", examples: [{ since: "2026-01-15T00:00:00.000Z" }] });
export type RecoverHookEndpointRequestOutput = z.output<typeof RecoverHookEndpointRequest>;

export const HookEndpointRecoveryObject = z
  .object({
    object: z.literal("hook_endpoint_recovery"),
    id: z.string().meta({ examples: [RECOVERY_ID] }),
    endpoint_id: z.string().meta({ description: "The id of the endpoint being recovered." }),
    since: z.iso
      .datetime()
      .meta({ description: "Deliveries of messages sent from this time on are requeued." }),
    until: z.iso
      .datetime()
      .meta({ description: "Up to this time: when the recovery was asked for." }),
    status: z.enum(["pending", "completed"]).meta({
      description: "`pending` while coss.com is still requeueing deliveries (in the background).",
    }),
    requeued: z.number().int().meta({ description: "Deliveries requeued so far." }),
    created_at: z.iso.datetime(),
    completed_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When requeueing finished. `null`: still `pending`." }),
  })
  .meta({ id: "HookEndpointRecovery", examples: [RECOVERY_EXAMPLE] });
export type HookEndpointRecoveryObjectOutput = z.output<typeof HookEndpointRecoveryObject>;

export const SendHookTestRequest = z
  .strictObject({
    event_type: EventTypeName.meta({
      description: "The event type to send as.",
      examples: ["invoice.paid"],
    }),
    payload: z.record(z.string(), z.unknown()).optional().meta({
      description: "Defaults to the event type's first example.",
    }),
  })
  .meta({ id: "SendHookTestRequest", examples: [{ event_type: "invoice.paid" }] });
export type SendHookTestRequestOutput = z.output<typeof SendHookTestRequest>;

// Messages, deliveries, attempts.

const MESSAGE_EXAMPLE = {
  object: "hook_message",
  id: MESSAGE_ID,
  application_id: APPLICATION_ID,
  event_type: "invoice.paid",
  payload: PAYLOAD_EXAMPLE,
  created_at: CREATED,
};

export const HookMessageObject = z
  .object({
    object: z.literal("hook_message"),
    id: z.string().meta({
      description: "Also the `webhook-id` header of every request delivering it.",
      examples: [MESSAGE_ID],
    }),
    application_id: z.string().meta({ description: "The id of the application it was sent to." }),
    event_type: z.string().meta({ description: "The event type it was sent as." }),
    payload: z.record(z.string(), z.unknown()).meta({
      description: "The JSON body delivered to each endpoint.",
    }),
    created_at: z.iso.datetime(),
  })
  .meta({ id: "HookMessage", examples: [MESSAGE_EXAMPLE] });
export type HookMessageObjectOutput = z.output<typeof HookMessageObject>;

export const SendHookMessageRequest = z
  .strictObject({
    event_type: EventTypeName.meta({
      description:
        "What happened, e.g. `invoice.paid`. Endpoints that filter by type only get the types they " +
        "chose. The type doesn't have to be registered.",
      examples: ["invoice.paid"],
    }),
    payload: z.record(z.string(), z.unknown()).meta({
      description:
        `The JSON object delivered as the request body (at most ${MAX_PAYLOAD_BYTES / 1024} KB ` +
        "serialized). It is parsed and serialized again: send integers beyond 2^53 as strings.",
      examples: [PAYLOAD_EXAMPLE],
    }),
  })
  .meta({
    id: "SendHookMessageRequest",
    examples: [{ event_type: "invoice.paid", payload: PAYLOAD_EXAMPLE }],
  });
export type SendHookMessageRequestOutput = z.output<typeof SendHookMessageRequest>;

export const HookMessageList = listOf(HookMessageObject, "HookMessageList", MESSAGE_EXAMPLE);
export type HookMessageListOutput = z.output<typeof HookMessageList>;

export const ListHookMessagesQuery = z.strictObject({
  event_type: EventTypeName.optional().meta({ description: "Only messages of this type." }),
  limit: ListLimit,
  after: z
    .string()
    .optional()
    .meta({ description: "Cursor: the `id` of the last message of the previous page." }),
});
export type ListHookMessagesQueryOutput = z.output<typeof ListHookMessagesQuery>;

const DELIVERY_EXAMPLE = {
  object: "hook_delivery",
  id: DELIVERY_ID,
  application_id: APPLICATION_ID,
  message_id: MESSAGE_ID,
  endpoint_id: ENDPOINT_ID,
  status: "succeeded",
  attempt_count: 1,
  next_attempt_at: null,
  last_status_code: 200,
  last_error: null,
  created_at: CREATED,
  finished_at: CREATED,
};

export const HookDeliveryObject = z
  .object({
    object: z.literal("hook_delivery"),
    id: z.string().meta({ examples: [DELIVERY_ID] }),
    application_id: z.string().meta({ description: "The id of the application." }),
    message_id: z.string().meta({ description: "The id of the message being delivered." }),
    endpoint_id: z.string().meta({ description: "The id of the endpoint it's delivered to." }),
    status: z.enum(HOOK_DELIVERY_STATUSES).meta({
      description:
        "`pending`: waiting for its next attempt. `succeeded`: the endpoint answered 2xx. `failed`: " +
        "every attempt failed, or the endpoint was disabled or deleted.",
    }),
    attempt_count: z.number().int().meta({ description: "How many attempts were made so far." }),
    next_attempt_at: z.iso.datetime().nullable().meta({
      description: "When the next attempt runs. `null`: none is due, because it finished.",
    }),
    last_status_code: z.number().int().nullable().meta({
      description:
        "The endpoint's HTTP status on the latest attempt. `null`: no response arrived, or no attempt yet.",
    }),
    last_error: z.string().nullable().meta({
      description: "Why the latest attempt failed. `null`: it didn't, or no attempt yet.",
    }),
    created_at: z.iso.datetime(),
    finished_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When it `succeeded` or `failed`. `null`: still `pending`." }),
  })
  .meta({ id: "HookDelivery", examples: [DELIVERY_EXAMPLE] });
export type HookDeliveryObjectOutput = z.output<typeof HookDeliveryObject>;

export const HookDeliveryList = listOf(HookDeliveryObject, "HookDeliveryList", DELIVERY_EXAMPLE);
export type HookDeliveryListOutput = z.output<typeof HookDeliveryList>;

export const ListHookDeliveriesQuery = z.strictObject({
  status: z
    .enum(HOOK_DELIVERY_STATUSES)
    .optional()
    .meta({ description: "Only deliveries with this status." }),
  limit: ListLimit,
  after: z
    .string()
    .optional()
    .meta({ description: "Cursor: the `id` of the last delivery of the previous page." }),
});
export type ListHookDeliveriesQueryOutput = z.output<typeof ListHookDeliveriesQuery>;

const ATTEMPT_EXAMPLE = {
  object: "hook_attempt",
  id: ATTEMPT_ID,
  delivery_id: DELIVERY_ID,
  endpoint_id: ENDPOINT_ID,
  attempted_at: CREATED,
  status_code: 200,
  duration_ms: 182,
  error: null,
  response_excerpt: "ok",
};

export const HookAttemptObject = z
  .object({
    object: z.literal("hook_attempt"),
    id: z.string().meta({ examples: [ATTEMPT_ID] }),
    delivery_id: z
      .string()
      .meta({ description: "The id of the delivery this attempt belongs to." }),
    endpoint_id: z.string().meta({ description: "The id of the endpoint it was sent to." }),
    attempted_at: z.iso.datetime().meta({ description: "When the attempt ran." }),
    status_code: z.number().int().nullable().meta({
      description: "The endpoint's HTTP status; `null` when no response arrived.",
    }),
    duration_ms: z.number().int().meta({ description: "How long it took, in milliseconds." }),
    error: z.string().nullable().meta({ description: "Why it failed. `null`: it didn't." }),
    response_excerpt: z.string().nullable().meta({
      description: "At most 1 KB of the response body, as text.",
    }),
  })
  .meta({ id: "HookAttempt", examples: [ATTEMPT_EXAMPLE] });
export type HookAttemptObjectOutput = z.output<typeof HookAttemptObject>;

export const HookAttemptList = listOf(HookAttemptObject, "HookAttemptList", ATTEMPT_EXAMPLE);
export type HookAttemptListOutput = z.output<typeof HookAttemptList>;

// Portal.

const SESSION_EXAMPLE = {
  object: "hook_portal_session",
  id: SESSION_ID,
  application_id: APPLICATION_ID,
  url: `https://portal.example/s/${SESSION_ID}#cossp_…`,
  token: "cossp_…",
  read_only: false,
  expires_at: "2026-01-15T10:30:00.000Z",
};

export const CreateHookPortalSessionRequest = z
  .strictObject({
    expires_in: z
      .number()
      .int()
      .min(60)
      .max(MAX_PORTAL_SESSION_EXPIRES_IN)
      .optional()
      .meta({
        description: `Seconds until it expires: default ${DEFAULT_PORTAL_SESSION_EXPIRES_IN}, at most ${MAX_PORTAL_SESSION_EXPIRES_IN}.`,
      }),
    read_only: z
      .boolean()
      .optional()
      .meta({ description: "The user can look but not change anything." }),
  })
  .meta({ id: "CreateHookPortalSessionRequest", examples: [{ expires_in: 3600 }] });
export type CreateHookPortalSessionRequestOutput = z.output<typeof CreateHookPortalSessionRequest>;

export const HookPortalSessionObject = z
  .object({
    object: z.literal("hook_portal_session"),
    id: z.string().meta({ examples: [SESSION_ID] }),
    application_id: z
      .string()
      .meta({ description: "The id of the application this session manages." }),
    url: z.string().meta({
      description:
        "Open it or embed it in an iframe (from an allowed origin). The token is in the URL " +
        "fragment, so it never reaches a server log: hand the URL only to that application's user.",
    }),
    token: z.string().meta({ description: "The secret part of `url`, shown only here." }),
    read_only: z.boolean().meta({ description: "Whether the user can only look." }),
    expires_at: z.iso.datetime().meta({ description: "When the session stops working." }),
  })
  .meta({ id: "HookPortalSession", examples: [SESSION_EXAMPLE] });
export type HookPortalSessionObjectOutput = z.output<typeof HookPortalSessionObject>;
