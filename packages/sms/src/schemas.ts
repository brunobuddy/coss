/**
 * Public wire schemas for SMS (snake_case). Plain zod with `.meta({ id })`, shared by the public
 * API, its OpenAPI document and the contract tests. Must not import the database:
 * `@coss/sms/schemas` is safe to load anywhere (the email product's `WEBHOOK_EVENT_TYPES` spreads
 * the event types from here).
 */
import { LATEST_API_VERSION } from "@coss/versioning";
import { TRACEPARENT_PATTERN } from "@coss/webhooks/schemas";
import { z } from "zod";
import { countSegments, MAX_SMS_BODY_LENGTH, MAX_SMS_SEGMENTS } from "./segments.ts";

export { MAX_SMS_BODY_LENGTH, MAX_SMS_SEGMENTS };

export const SMS_STATUSES = [
  "queued",
  "scheduled",
  "sent",
  "delivered",
  "undelivered",
  "failed",
  "canceled",
] as const;
export type SmsStatus = (typeof SMS_STATUSES)[number];

/** Events about a sent message (`sms_event` rows). */
export const SMS_EVENT_TYPES = [
  "sms.scheduled",
  "sms.sent",
  "sms.delivered",
  "sms.undelivered",
  "sms.failed",
  "sms.suppressed",
  "sms.canceled",
] as const;
export type SmsEventType = (typeof SMS_EVENT_TYPES)[number];

/** Events about messages received on the organization's numbers (and the opt-outs among them). */
export const RECEIVED_SMS_EVENT_TYPES = ["sms.received", "sms.opted_out", "sms.opted_in"] as const;
export type ReceivedSmsEventType = (typeof RECEIVED_SMS_EVENT_TYPES)[number];

/** Every `sms.*` webhook event type. */
export const SMS_WEBHOOK_EVENT_TYPES = [...SMS_EVENT_TYPES, ...RECEIVED_SMS_EVENT_TYPES] as const;

export const SMS_SUPPRESSION_REASONS = ["opt_out", "manual", "invalid_number"] as const;
export type SmsSuppressionReason = (typeof SMS_SUPPRESSION_REASONS)[number];

export const SMS_NUMBER_KINDS = ["local", "toll_free"] as const;
export const SMS_NUMBER_STATUSES = ["pending", "active", "releasing"] as const;
export const SMS_REGISTRATION_KINDS = ["us_10dlc", "toll_free"] as const;
export const SMS_REGISTRATION_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "approved",
  "rejected",
  "failed",
] as const;

/** Opt-out keywords carriers and Twilio recognize (case-insensitive, the whole message). */
export const OPT_OUT_KEYWORDS = [
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
  "REVOKE",
  "OPTOUT",
] as const;
export const OPT_IN_KEYWORDS = ["START", "YES", "UNSTOP"] as const;
export const HELP_KEYWORDS = ["HELP", "INFO"] as const;
export type SmsKeyword = "stop" | "start" | "help";

/** The keyword a received message is, if any (`" Stop "` is `stop`; `"Stop it"` is none). */
export function smsKeyword(body: string): SmsKeyword | null {
  const word = body.trim().toUpperCase();
  if ((OPT_OUT_KEYWORDS as readonly string[]).includes(word)) return "stop";
  if ((OPT_IN_KEYWORDS as readonly string[]).includes(word)) return "start";
  if ((HELP_KEYWORDS as readonly string[]).includes(word)) return "help";
  return null;
}

/**
 * The SMS simulator: numbers sandbox environments (and the fake provider) answer as below,
 * without sending anything. Any other number is delivered.
 */
export const SMS_SIMULATOR = {
  delivered: "+15005550006",
  invalidNumber: "+15005550001",
  carrierFiltered: "+15005550004",
  optedOut: "+15005550009",
  reply: "+15005550008",
} as const;

export const DEFAULT_SMS_LIST_LIMIT = 20;
export const MAX_SMS_LIST_LIMIT = 100;
export const MAX_SMS_TAGS = 10;
const MAX_SCHEDULE_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;

const E164 = /^\+[1-9]\d{6,14}$/;
const TAG_PART = /^[A-Za-z0-9_-]{1,256}$/;
const CONTROL_CHARACTER = /\p{Cc}/u;

/** Control characters other than line breaks (which carriers deliver). */
function hasControlCharacters(value: string): boolean {
  for (const char of value) {
    if (char !== "\n" && char !== "\r" && CONTROL_CHARACTER.test(char)) return true;
  }
  return false;
}

const ID_EXAMPLE = "sms_01k7c8m4q2f3e9v6t5r1n0p8yz";
const FROM_EXAMPLE = "+14155550123";
const TO_EXAMPLE = "+14155550199";

export const PhoneNumber = z
  .string()
  .regex(E164, "Expected a phone number in E.164 form, e.g. +14155550123.");

const TagPart = z
  .string()
  .regex(TAG_PART, "Must be 1-256 characters: ASCII letters, numbers, underscores or dashes.");

const Tag = z.strictObject({
  name: TagPart.meta({ description: "The tag's name, unique on the message." }),
  value: TagPart.meta({ description: "The tag's value." }),
});

const Tags = z
  .array(Tag)
  .max(MAX_SMS_TAGS, `At most ${MAX_SMS_TAGS} tags are allowed.`)
  .superRefine((tags, ctx) => {
    const seen = new Set<string>();
    for (const [index, tag] of tags.entries()) {
      if (seen.has(tag.name)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "name"],
          message: `Duplicate tag name "${tag.name}".`,
        });
      }
      seen.add(tag.name);
    }
  });

const Body = z
  .string()
  .min(1, "Body must not be empty.")
  .max(MAX_SMS_BODY_LENGTH, `Body can be at most ${MAX_SMS_BODY_LENGTH} characters.`)
  .refine((value) => !hasControlCharacters(value), {
    message: "Body must not contain control characters other than line breaks.",
  })
  // Counted as from a toll-free number (the smaller segments): the limit holds for every sender.
  .refine((value) => countSegments(value, { tollFree: true }).segments <= MAX_SMS_SEGMENTS, {
    message: `Body can be at most ${MAX_SMS_SEGMENTS} segments (1,520 GSM-7 or 660 Unicode characters).`,
  });

const ScheduledAt = z.iso.datetime({
  offset: true,
  error: "Expected an ISO 8601 date-time with a time zone offset.",
});

export const SendSmsRequest = z
  .strictObject({
    from: PhoneNumber.meta({
      description:
        "One of your organization's phone numbers, in E.164 form. Sandbox environments accept any number.",
      examples: [FROM_EXAMPLE],
    }),
    to: PhoneNumber.meta({
      description: "The recipient's mobile number, in E.164 form.",
      examples: [TO_EXAMPLE],
    }),
    body: Body.meta({
      description:
        "The text. Messages are split into segments of 153 GSM-7 or 67 Unicode characters (152 or 66 from a toll-free number; 160 or 70 for a single one), each billed; at most 10 (1,520 GSM-7 or 660 Unicode characters).",
      examples: ["Your Acme code is 482913"],
    }),
    tags: Tags.optional().meta({ description: `Up to ${MAX_SMS_TAGS} tags.` }),
    scheduled_at: ScheduledAt.optional().meta({
      description:
        "Send at this time instead of now (ISO 8601 with an offset, at most 30 days ahead). A time that is not in the future sends immediately.",
      example: "2026-11-11T09:00:00Z",
    }),
  })
  .superRefine((value, ctx) => {
    if (value.scheduled_at && Date.parse(value.scheduled_at) > Date.now() + MAX_SCHEDULE_AHEAD_MS) {
      ctx.addIssue({
        code: "custom",
        path: ["scheduled_at"],
        message: "An SMS can be scheduled at most 30 days ahead.",
      });
    }
  })
  // Absent fields stay absent, so request hashes of older requests stay valid.
  .transform((value) => ({
    from: value.from,
    to: value.to,
    body: value.body,
    ...(value.tags?.length ? { tags: value.tags } : {}),
    ...(value.scheduled_at ? { scheduled_at: new Date(value.scheduled_at).toISOString() } : {}),
  }))
  .meta({
    id: "SendSmsRequest",
    examples: [
      {
        from: FROM_EXAMPLE,
        to: TO_EXAMPLE,
        body: "Your Acme code is 482913",
        tags: [{ name: "flow", value: "sign_in" }],
      },
    ],
  });

export type SendSmsRequestOutput = z.output<typeof SendSmsRequest>;

const Failure = z
  .object({
    code: z.string().meta({ description: "Machine-readable reason." }),
    message: z.string().meta({ description: "Human-readable explanation." }),
  })
  .meta({ description: "Why the message failed or wasn't delivered." });

export const SmsObject = z
  .object({
    object: z.literal("sms"),
    id: z.string().meta({ examples: [ID_EXAMPLE] }),
    from: z.string().meta({ description: "The number it's sent from, in E.164." }),
    to: z.string().meta({ description: "The recipient's number, in E.164." }),
    body: z.string().meta({ description: "The text. Empty once discarded." }),
    status: z.enum(SMS_STATUSES).meta({
      description:
        "`queued` until handed to the carrier (`sent`), then `delivered` or `undelivered` once the carrier reports. `failed`: never sent. `scheduled` and `canceled`: scheduled sends.",
    }),
    segments: z.number().int().meta({ description: "Segments the body takes (what is billed)." }),
    encoding: z.enum(["gsm7", "ucs2"]).meta({
      description:
        "`gsm7` fits the basic alphabet; `ucs2` is used for anything else, with smaller segments.",
    }),
    country: z.string().meta({ description: "ISO 3166 country of `to`.", examples: ["US"] }),
    tags: z
      .array(
        z.object({
          name: z.string().meta({ description: "The tag's name." }),
          value: z.string().meta({ description: "The tag's value." }),
        }),
      )
      .meta({ description: "Your tags on the message." }),
    failure: Failure.nullable(),
    sandbox: z.boolean().meta({ description: "Sent from a sandbox environment: simulated." }),
    scheduled_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When it's set to send. `null`: it was sent at once." }),
    sent_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When it was handed to the carrier. `null`: not yet." }),
    delivered_at: z.iso.datetime().nullable().meta({
      description: "When the carrier reported delivery. `null`: not delivered, or not reported.",
    }),
    created_at: z.iso.datetime(),
  })
  .meta({
    id: "Sms",
    examples: [
      {
        object: "sms",
        id: ID_EXAMPLE,
        from: FROM_EXAMPLE,
        to: TO_EXAMPLE,
        body: "Your Acme code is 482913",
        status: "delivered",
        segments: 1,
        encoding: "gsm7",
        country: "US",
        tags: [{ name: "flow", value: "sign_in" }],
        failure: null,
        sandbox: false,
        scheduled_at: null,
        sent_at: "2026-11-10T12:00:01.000Z",
        delivered_at: "2026-11-10T12:00:04.000Z",
        created_at: "2026-11-10T12:00:00.000Z",
      },
    ],
  });

export type SmsObjectOutput = z.output<typeof SmsObject>;

export const SmsList = z
  .object({
    object: z.literal("list"),
    data: z.array(SmsObject),
    has_more: z.boolean(),
  })
  .meta({ id: "SmsList", examples: [{ object: "list", data: [], has_more: false }] });

export type SmsListOutput = z.output<typeof SmsList>;

function csvEnum<const T extends readonly [string, ...string[]]>(values: T, description: string) {
  const item = z.enum(values);
  return z
    .string()
    .transform((value, ctx) => {
      const out: T[number][] = [];
      for (const part of value.split(",").map((piece) => piece.trim())) {
        if (part.length === 0) continue;
        const parsed = item.safeParse(part);
        if (!parsed.success) {
          ctx.addIssue({ code: "custom", message: `Invalid value "${part}".` });
          return z.NEVER;
        }
        out.push(parsed.data);
      }
      return out;
    })
    .optional()
    .meta({ description });
}

const ListLimit = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_SMS_LIST_LIMIT)
  .optional()
  .meta({ description: `1-${MAX_SMS_LIST_LIMIT}, default ${DEFAULT_SMS_LIST_LIMIT}.` });

const After = z
  .string()
  .max(64)
  .optional()
  .meta({ description: "Cursor: the `id` of the last item of the previous page." });

export const ListSmsQuery = z
  .strictObject({
    to: PhoneNumber.optional().meta({ description: "Only messages to this number." }),
    status: csvEnum(SMS_STATUSES, "Only messages in these statuses, comma-separated: `failed`."),
    created_after: z.iso
      .datetime({ offset: true })
      .optional()
      .meta({ description: "Only messages created at or after this time." }),
    created_before: z.iso
      .datetime({ offset: true })
      .optional()
      .meta({ description: "Only messages created before this time." }),
    limit: ListLimit,
    after: After,
  })
  .meta({ description: "Messages are returned newest first." });

export type ListSmsQueryOutput = z.output<typeof ListSmsQuery>;

export const SmsEventData = z
  .object({
    failure: Failure.optional(),
    provider_error_code: z
      .string()
      .nullable()
      .optional()
      .meta({ description: "The provider's or carrier's own error code, e.g. `30007`." }),
    suppression: z
      .object({
        id: z.string().meta({ description: "The suppression's id." }),
        reason: z
          .enum(SMS_SUPPRESSION_REASONS)
          .meta({ description: "Why the number is suppressed." }),
      })
      .optional()
      .meta({ description: "`sms.suppressed`: the entry that made coss.com skip the number." }),
  })
  .meta({ id: "SmsEventData", description: "Details of the event, where it has any." });

export type SmsEventDataOutput = z.output<typeof SmsEventData>;

const DELIVERED_EVENT_EXAMPLE = {
  object: "sms_event" as const,
  id: "smsevt_01k7c8m4r0c2b8w9y3d5f6g7h8",
  sms_id: ID_EXAMPLE,
  type: "sms.delivered" as const,
  occurred_at: "2026-11-10T12:00:04.000Z",
  data: {},
};

export const SmsEvent = z
  .object({
    object: z.literal("sms_event"),
    id: z.string(),
    sms_id: z.string().meta({ description: "The id of the message." }),
    type: z.enum(SMS_EVENT_TYPES).meta({
      description:
        "What happened: `sms.scheduled`, `sms.sent`, `sms.delivered`, `sms.undelivered`, `sms.failed`, `sms.suppressed` or `sms.canceled`.",
    }),
    occurred_at: z.iso.datetime().meta({ description: "When it happened." }),
    data: SmsEventData,
  })
  .meta({ id: "SmsEvent", examples: [DELIVERED_EVENT_EXAMPLE] });

export type SmsEventOutput = z.output<typeof SmsEvent>;

export const SmsEventList = z
  .object({
    object: z.literal("list"),
    data: z.array(SmsEvent),
    has_more: z.boolean(),
  })
  .meta({
    id: "SmsEventList",
    examples: [{ object: "list", data: [DELIVERED_EVENT_EXAMPLE], has_more: false }],
  });

export type SmsEventListOutput = z.output<typeof SmsEventList>;

const ApiVersion = z.string().meta({
  description:
    "The API version (`Coss-Version`) this event is rendered in: the receiving endpoint's `api_version`.",
  examples: [LATEST_API_VERSION],
});

/** Body of an `sms.*` webhook about a sent message. Never the text: read it with the id. */
export const SmsWebhookEvent = z
  .object({
    id: z.string().meta({ description: "The event id: the same as `SmsEvent.id`." }),
    object: z.literal("event"),
    type: z.enum(SMS_EVENT_TYPES).meta({ description: "What happened to the message." }),
    api_version: ApiVersion,
    created_at: z.iso.datetime().meta({ description: "When the event was created." }),
    data: SmsEventData.extend({
      sms_id: z.string().meta({ description: "The id of the message." }),
      from: z.string().meta({ description: "The number it's sent from." }),
      to: z.string().meta({ description: "The recipient's number." }),
      country: z.string().meta({ description: "The recipient's country (ISO 3166-1 alpha-2)." }),
      segments: z.number().int().meta({ description: "Segments the body takes (what is billed)." }),
      tags: z
        .array(
          z.object({
            name: z.string().meta({ description: "The tag's name." }),
            value: z.string().meta({ description: "The tag's value." }),
          }),
        )
        .meta({ description: "Your tags on the message." }),
      sandbox: z
        .boolean()
        .meta({ description: "Whether it was sent from a sandbox environment: simulated." }),
      occurred_at: z.iso.datetime().meta({ description: "When it happened." }),
      traceparent: z
        .string()
        .regex(TRACEPARENT_PATTERN)
        .optional()
        .meta({
          description:
            "Only for a message sent with a W3C `traceparent` header: that trace context (normalized to version `00`), also sent as this request's `traceparent` header, so handling the event joins the sender's trace.",
          examples: ["00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"],
        }),
    }),
  })
  .meta({
    id: "SmsWebhookEvent",
    examples: [
      {
        id: DELIVERED_EVENT_EXAMPLE.id,
        object: "event",
        type: "sms.delivered",
        api_version: LATEST_API_VERSION,
        created_at: "2026-11-10T12:00:04.100Z",
        data: {
          sms_id: ID_EXAMPLE,
          from: FROM_EXAMPLE,
          to: TO_EXAMPLE,
          country: "US",
          segments: 1,
          tags: [{ name: "flow", value: "sign_in" }],
          sandbox: false,
          occurred_at: DELIVERED_EVENT_EXAMPLE.occurred_at,
        },
      },
    ],
  });

export type SmsWebhookEventOutput = z.output<typeof SmsWebhookEvent>;
/** What the outbox stores: delivery adds `api_version` when it renders the event for an endpoint. */
export type StoredSmsWebhookEvent = Omit<SmsWebhookEventOutput, "api_version">;

const RECEIVED_ID_EXAMPLE = "smsin_01k7c8m4q2f3e9v6t5r1n0p8yz";

export const ReceivedSmsObject = z
  .object({
    object: z.literal("received_sms"),
    id: z.string().meta({ examples: [RECEIVED_ID_EXAMPLE] }),
    from: z.string().meta({ description: "Who sent it." }),
    to: z.string().meta({ description: "Your number that received it." }),
    body: z.string().meta({ description: "The text." }),
    segments: z.number().int().meta({ description: "Segments the text took." }),
    keyword: z.enum(["stop", "start", "help"]).nullable().meta({
      description:
        "`stop`: an opt-out (the sender is suppressed in every live environment), `start`: an opt-in again, `help`: a request for help. Twilio answers each.",
    }),
    sandbox: z
      .boolean()
      .meta({ description: "Whether it's a simulated message of a sandbox environment." }),
    created_at: z.iso.datetime(),
  })
  .meta({
    id: "ReceivedSms",
    examples: [
      {
        object: "received_sms",
        id: RECEIVED_ID_EXAMPLE,
        from: TO_EXAMPLE,
        to: FROM_EXAMPLE,
        body: "Thanks, see you then!",
        segments: 1,
        keyword: null,
        sandbox: false,
        created_at: "2026-11-10T12:05:00.000Z",
      },
    ],
  });

export type ReceivedSmsObjectOutput = z.output<typeof ReceivedSmsObject>;

export const ReceivedSmsList = z
  .object({
    object: z.literal("list"),
    data: z.array(ReceivedSmsObject),
    has_more: z.boolean(),
  })
  .meta({ id: "ReceivedSmsList", examples: [{ object: "list", data: [], has_more: false }] });

export type ReceivedSmsListOutput = z.output<typeof ReceivedSmsList>;

export const ListReceivedSmsQuery = z
  .strictObject({
    from: PhoneNumber.optional().meta({ description: "Only messages from this number." }),
    to: PhoneNumber.optional().meta({ description: "Only messages to this number of yours." }),
    created_after: z.iso.datetime({ offset: true }).optional(),
    created_before: z.iso.datetime({ offset: true }).optional(),
    limit: ListLimit,
    after: After,
  })
  .meta({ description: "Messages are returned newest first." });

export type ListReceivedSmsQueryOutput = z.output<typeof ListReceivedSmsQuery>;

/** Body of `sms.received`, `sms.opted_out` and `sms.opted_in` webhooks. Never the text. */
export const ReceivedSmsWebhookEvent = z
  .object({
    id: z.string().meta({ description: "The event id." }),
    object: z.literal("event"),
    type: z.enum(RECEIVED_SMS_EVENT_TYPES).meta({
      description:
        "`sms.received`: a message arrived. `sms.opted_out`: the sender replied with an opt-out keyword. `sms.opted_in`: the sender replied with an opt-in keyword.",
    }),
    api_version: ApiVersion,
    created_at: z.iso.datetime().meta({ description: "When the event was created." }),
    data: z.object({
      received_sms_id: z.string().nullable().meta({
        description:
          "The received message; `null` for an opt-out to a number whose replies go to no environment.",
      }),
      from: z.string().meta({ description: "Who sent it." }),
      to: z.string().meta({ description: "Your number that received it." }),
      keyword: z.enum(["stop", "start", "help"]).nullable().meta({
        description: "The keyword it is, if any: `stop`, `start` or `help`. `null`: none.",
      }),
      sandbox: z
        .boolean()
        .meta({ description: "Whether it's a simulated message of a sandbox environment." }),
      occurred_at: z.iso.datetime().meta({ description: "When it happened." }),
    }),
  })
  .meta({
    id: "ReceivedSmsWebhookEvent",
    examples: [
      {
        id: "evt_01k7c8m4q2f3e9v6t5r1n0p8yz",
        object: "event",
        type: "sms.received",
        api_version: LATEST_API_VERSION,
        created_at: "2026-11-10T12:05:00.100Z",
        data: {
          received_sms_id: RECEIVED_ID_EXAMPLE,
          from: TO_EXAMPLE,
          to: FROM_EXAMPLE,
          keyword: null,
          sandbox: false,
          occurred_at: "2026-11-10T12:05:00.000Z",
        },
      },
    ],
  });

export type ReceivedSmsWebhookEventOutput = z.output<typeof ReceivedSmsWebhookEvent>;
export type StoredReceivedSmsWebhookEvent = Omit<ReceivedSmsWebhookEventOutput, "api_version">;

const SUPPRESSION_ID_EXAMPLE = "smssup_01k7c8m4q2f3e9v6t5r1n0p8yz";

export const SmsSuppression = z
  .object({
    object: z.literal("sms_suppression"),
    id: z.string().meta({ examples: [SUPPRESSION_ID_EXAMPLE] }),
    phone_number: z.string().meta({ description: "The suppressed number, in E.164." }),
    reason: z.enum(SMS_SUPPRESSION_REASONS).meta({
      description:
        "`opt_out`: the number replied STOP (or the carrier says it opted out). `invalid_number`: not a number that can receive SMS. `manual`: added by you.",
    }),
    sms_id: z
      .string()
      .nullable()
      .meta({ description: "The message whose failure added it, if any." }),
    created_at: z.iso.datetime(),
  })
  .meta({
    description: "A number sends skip.",
    id: "SmsSuppression",
    examples: [
      {
        object: "sms_suppression",
        id: SUPPRESSION_ID_EXAMPLE,
        phone_number: TO_EXAMPLE,
        reason: "opt_out",
        sms_id: null,
        created_at: "2026-11-10T12:05:00.000Z",
      },
    ],
  });

export type SmsSuppressionOutput = z.output<typeof SmsSuppression>;

export const SmsSuppressionList = z
  .object({
    object: z.literal("list"),
    data: z.array(SmsSuppression),
    has_more: z.boolean(),
  })
  .meta({ id: "SmsSuppressionList", examples: [{ object: "list", data: [], has_more: false }] });

export type SmsSuppressionListOutput = z.output<typeof SmsSuppressionList>;

export const CreateSmsSuppressionRequest = z
  .strictObject({
    phone_number: PhoneNumber.meta({ description: "The number to suppress, in E.164." }),
  })
  .meta({ id: "CreateSmsSuppressionRequest", examples: [{ phone_number: TO_EXAMPLE }] });

export const ListSmsSuppressionsQuery = z.strictObject({
  phone_number: PhoneNumber.optional().meta({ description: "Only this number's entry." }),
  limit: ListLimit,
  after: After,
});

export type ListSmsSuppressionsQueryOutput = z.output<typeof ListSmsSuppressionsQuery>;

export const CheckSmsSuppressionQuery = z.strictObject({ phone_number: PhoneNumber });

export const SmsSuppressionCheck = z
  .object({
    object: z.literal("sms_suppression_check"),
    phone_number: z.string().meta({ description: "The number checked, in E.164." }),
    suppressed: z
      .boolean()
      .meta({ description: "Whether a send to this number would be skipped." }),
    suppression: SmsSuppression.nullable(),
  })
  .meta({
    id: "SmsSuppressionCheck",
    examples: [
      {
        object: "sms_suppression_check",
        phone_number: TO_EXAMPLE,
        suppressed: false,
        suppression: null,
      },
    ],
  });

export type SmsSuppressionCheckOutput = z.output<typeof SmsSuppressionCheck>;

export const DeletedSmsSuppression = z
  .object({
    object: z.literal("sms_suppression"),
    id: z.string(),
    deleted: z.literal(true),
  })
  .meta({
    id: "DeletedSmsSuppression",
    examples: [{ object: "sms_suppression", id: SUPPRESSION_ID_EXAMPLE, deleted: true }],
  });

export const SmsNumberObject = z
  .object({
    object: z.literal("sms_number"),
    id: z.string().meta({ examples: ["num_01k7c8m4q2f3e9v6t5r1n0p8yz"] }),
    phone_number: z.string().meta({ description: "The number, in E.164." }),
    kind: z.enum(SMS_NUMBER_KINDS).meta({
      description:
        "`local` (US A2P 10DLC) or `toll_free` (toll-free verification, and sends only to the US and Canada).",
    }),
    country: z.string().meta({ description: "Its country (ISO 3166-1 alpha-2)." }),
    status: z.enum(SMS_NUMBER_STATUSES).meta({
      description:
        "`pending`: not ready yet. `active`: ready, once its registration is approved. `releasing`: being given up.",
    }),
    registration_status: z.enum(SMS_REGISTRATION_STATUSES).nullable().meta({
      description: "Its carrier registration's status; live sends need `approved`.",
    }),
    can_send: z.boolean().meta({ description: "Whether live sends can go from it now." }),
    receives_here: z.boolean().meta({
      description: "Whether replies to it arrive in the environment of the key making the request.",
    }),
    created_at: z.iso.datetime(),
  })
  .meta({
    id: "SmsNumber",
    examples: [
      {
        object: "sms_number",
        id: "num_01k7c8m4q2f3e9v6t5r1n0p8yz",
        phone_number: FROM_EXAMPLE,
        kind: "local",
        country: "US",
        status: "active",
        registration_status: "approved",
        can_send: true,
        receives_here: true,
        created_at: "2026-11-01T09:00:00.000Z",
      },
    ],
  });

export type SmsNumberObjectOutput = z.output<typeof SmsNumberObject>;

export const SmsNumberList = z
  .object({
    object: z.literal("list"),
    data: z.array(SmsNumberObject),
    has_more: z.boolean(),
  })
  .meta({ id: "SmsNumberList", examples: [{ object: "list", data: [], has_more: false }] });

// ---------------------------------------------------------------------------------------------
// Sender registration (the dashboard's forms; not part of the public API).
// ---------------------------------------------------------------------------------------------

/** A2P campaign use cases coss.com offers (Twilio's `UsAppToPersonUsecase` values). */
export const SMS_USE_CASES = [
  "2FA",
  "ACCOUNT_NOTIFICATION",
  "CUSTOMER_CARE",
  "DELIVERY_NOTIFICATION",
  "FRAUD_ALERT",
  "MARKETING",
  "MIXED",
  "LOW_VOLUME",
] as const;

export const SMS_USE_CASE_LABELS: Record<(typeof SMS_USE_CASES)[number], string> = {
  "2FA": "One-time codes",
  ACCOUNT_NOTIFICATION: "Account notifications",
  CUSTOMER_CARE: "Customer care",
  DELIVERY_NOTIFICATION: "Delivery notifications",
  FRAUD_ALERT: "Fraud alerts",
  MARKETING: "Marketing",
  MIXED: "Mixed",
  LOW_VOLUME: "Low volume mixed (under 2,000 segments a day)",
};

/** Toll-free verification's `MessageVolume`: Twilio accepts only these, written exactly so. */
export const SMS_MONTHLY_VOLUMES = [
  "10",
  "100",
  "1,000",
  "10,000",
  "100,000",
  "250,000",
  "500,000",
  "750,000",
  "1,000,000",
  "5,000,000",
  "10,000,000+",
] as const;

export const SMS_COMPANY_TYPES = ["PRIVATE_PROFIT", "PUBLIC_PROFIT", "NON_PROFIT"] as const;

const Text = (max: number) => z.string().trim().min(1, "Required.").max(max);

export const SmsBusinessProfileInput = z.object({
  legalName: Text(255),
  companyType: z.enum(SMS_COMPANY_TYPES),
  taxId: Text(64),
  taxIdType: z.enum(["EIN", "CBN", "VAT", "DUNS"]).default("EIN"),
  industry: Text(64),
  website: z.url().max(500),
  street: Text(255),
  city: Text(128),
  region: Text(64),
  postalCode: Text(32),
  country: z.string().regex(/^[A-Z]{2}$/, "An ISO country code, e.g. US."),
  stockExchange: z.string().trim().max(32).nullish(),
  stockTicker: z.string().trim().max(16).nullish(),
  contact: z.object({
    firstName: Text(64),
    lastName: Text(64),
    email: z.email(),
    phone: PhoneNumber,
    title: Text(64),
    jobPosition: z.enum(["Director", "GM", "VP", "CEO", "CFO", "General Counsel", "Other"]),
  }),
});

export const SmsCampaignInput = z.object({
  useCase: z.enum(SMS_USE_CASES),
  description: z
    .string()
    .trim()
    .min(40, "Describe the messages in at least 40 characters.")
    .max(4096),
  messageFlow: z
    .string()
    .trim()
    .min(40, "Describe how people opt in, in at least 40 characters.")
    .max(2048),
  samples: z
    .array(z.string().trim().min(20, "Samples are at least 20 characters.").max(1024))
    .min(2, "Give at least two sample messages.")
    .max(5),
  hasEmbeddedLinks: z.boolean(),
  hasEmbeddedPhone: z.boolean(),
  optInProofUrl: z.url().nullish(),
  monthlyVolume: z.enum(SMS_MONTHLY_VOLUMES).nullish(),
  /** The business's privacy policy (toll-free verification requires one). */
  privacyPolicyUrl: z.url().max(2048).nullish(),
  termsUrl: z.url().max(2048).nullish(),
});

export const SmsRegistrationInput = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("us_10dlc"),
      brandType: z.enum(["standard", "low_volume_standard"]),
      profile: SmsBusinessProfileInput,
      campaign: SmsCampaignInput,
    }),
    z.object({
      kind: z.literal("toll_free"),
      /** The organization's toll-free number to verify. */
      numberId: z.string().min(1),
      profile: SmsBusinessProfileInput,
      campaign: SmsCampaignInput.extend({
        optInProofUrl: z.url("A public URL showing where people opt in."),
        privacyPolicyUrl: z.url("A public URL of your privacy policy.").max(2048),
      }),
    }),
  ])
  .superRefine((value, ctx) => {
    // Carriers take only the low-volume mixed use case from a low-volume standard brand: anything
    // else fails at campaign creation, after the brand's fee.
    if (
      value.kind === "us_10dlc" &&
      value.brandType === "low_volume_standard" &&
      value.campaign.useCase !== "LOW_VOLUME"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["campaign", "useCase"],
        message: "Low-volume standard brands register the low-volume mixed use case.",
      });
    }
  });

export type SmsRegistrationInputOutput = z.output<typeof SmsRegistrationInput>;
