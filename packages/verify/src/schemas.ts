/**
 * Public wire schemas for Verify (snake_case). Plain zod with `.meta({ id })`, shared by the public
 * API, its OpenAPI document and the contract tests. Must not import the database:
 * `@coss/verify/schemas` is safe to load anywhere.
 */
import { LATEST_API_VERSION } from "@coss/versioning";
import { z } from "zod";

export const VERIFY_CHANNELS = ["sms", "email"] as const;
export type VerifyChannel = (typeof VERIFY_CHANNELS)[number];

export const VERIFICATION_STATUSES = [
  "pending",
  "approved",
  "expired",
  "canceled",
  "failed",
  "blocked",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VERIFY_SEND_ROUTES = ["own_number", "shared_number", "email", "coss_email"] as const;
export type VerifySendRoute = (typeof VERIFY_SEND_ROUTES)[number];

/** `verification.*` webhook events. */
export const VERIFY_WEBHOOK_EVENT_TYPES = [
  "verification.approved",
  "verification.failed",
  "verification.blocked",
] as const;
export type VerifyWebhookEventType = (typeof VERIFY_WEBHOOK_EVENT_TYPES)[number];

export const MIN_CODE_LENGTH = 4;
export const MAX_CODE_LENGTH = 10;
export const MIN_TTL_SECONDS = 60;
export const MAX_TTL_SECONDS = 30 * 60;
export const MAX_ATTEMPTS_LIMIT = 10;
/** Codes sent per verification (the first and its resends). */
export const MAX_SENDS = 5;
export const MAX_VERIFY_TAGS = 10;
export const DEFAULT_VERIFY_LIST_LIMIT = 20;
export const MAX_VERIFY_LIST_LIMIT = 100;
export const MAX_APP_NAME_LENGTH = 40;

/** Defaults of an environment without settings. */
export const DEFAULT_VERIFY_SETTINGS = {
  codeLength: 6,
  ttlSeconds: 600,
  maxAttempts: 5,
  allowedCountries: ["US", "CA"],
} as const;

const E164 = /^\+[1-9]\d{6,14}$/;
const TAG_PART = /^[A-Za-z0-9_-]{1,256}$/;

const ID_EXAMPLE = "vrf_01k8e2m4q2f3e9v6t5r1n0p8yz";
const SMS_ID_EXAMPLE = "sms_01k8e2m4q2f3e9v6t5r1n0p8yz";
const EVENT_ID_EXAMPLE = "evt_01k8e2m4q2f3e9v6t5r1n0p8yz";
const TO_EXAMPLE = "+14155550199";

/** Whether `to` is a phone number (E.164) rather than an email address. */
export function isPhoneDestination(to: string): boolean {
  return E164.test(to);
}

const TagPart = z
  .string()
  .regex(TAG_PART, "Must be 1-256 characters: ASCII letters, numbers, underscores or dashes.");

const Tags = z
  .array(z.strictObject({ name: TagPart, value: TagPart }))
  .max(MAX_VERIFY_TAGS, `At most ${MAX_VERIFY_TAGS} tags are allowed.`)
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

const Destination = z
  .string()
  .trim()
  .min(1)
  .max(320)
  .refine((value) => isPhoneDestination(value) || z.email().safeParse(value).success, {
    message: "Expected a phone number in E.164 form (+14155550123) or an email address.",
  });

export const StartVerificationRequest = z
  .strictObject({
    to: Destination.meta({
      description:
        "Where the code goes: a mobile number in E.164 form, or an email address. A pending verification to the same destination and channel is reused: its code is sent again.",
      examples: [TO_EXAMPLE],
    }),
    channel: z.enum(VERIFY_CHANNELS).optional().meta({
      description: "`sms` or `email`. Default: `sms` for a phone number, `email` for an address.",
    }),
    ip: z
      .string()
      .max(64)
      .optional()
      .meta({
        description:
          "The end user's IP address. The fraud guard uses it (velocity, Tor); recommended.",
        examples: ["203.0.113.7"],
      }),
    user_id: z
      .string()
      .min(1)
      .max(256)
      .optional()
      .meta({
        description:
          "Your id for the end user, for the fraud guard's velocity and your Risk lists.",
        examples: ["user_42"],
      }),
    tags: Tags.optional().meta({ description: `Up to ${MAX_VERIFY_TAGS} tags.` }),
  })
  .superRefine((value, ctx) => {
    const phone = isPhoneDestination(value.to);
    if (value.channel === "sms" && !phone) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "SMS needs a phone number in E.164 form, e.g. +14155550123.",
      });
    }
    if (value.channel === "email" && phone) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "Email needs an email address." });
    }
  })
  // Absent fields stay absent, so request hashes stay stable.
  .transform((value) => ({
    to: isPhoneDestination(value.to) ? value.to : value.to.toLowerCase(),
    channel:
      value.channel ?? (isPhoneDestination(value.to) ? ("sms" as const) : ("email" as const)),
    ...(value.ip ? { ip: value.ip } : {}),
    ...(value.user_id ? { user_id: value.user_id } : {}),
    ...(value.tags?.length ? { tags: value.tags } : {}),
  }))
  .meta({
    id: "StartVerificationRequest",
    examples: [{ to: TO_EXAMPLE, ip: "203.0.113.7", user_id: "user_42" }],
  });

export type StartVerificationRequestInput = z.input<typeof StartVerificationRequest>;
export type StartVerificationRequestOutput = z.output<typeof StartVerificationRequest>;

export const CheckVerificationRequest = z
  .strictObject({
    verification_id: z
      .string()
      .max(64)
      .optional()
      .meta({
        description: "The verification to check. Give this or `to`.",
        examples: [ID_EXAMPLE],
      }),
    to: Destination.optional().meta({
      description:
        "The destination the code was sent to: checks its most recent verification. Give this or `verification_id`.",
      examples: [TO_EXAMPLE],
    }),
    code: z
      .string()
      .trim()
      .regex(/^\d{4,10}$/, "Codes are 4-10 digits.")
      .meta({ description: "The code the end user entered.", examples: ["482913"] }),
  })
  .superRefine((value, ctx) => {
    if ((value.verification_id === undefined) === (value.to === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["verification_id"],
        message: "Give either `verification_id` or `to`.",
      });
    }
  })
  .transform((value) => ({
    ...(value.verification_id ? { verification_id: value.verification_id } : {}),
    ...(value.to ? { to: isPhoneDestination(value.to) ? value.to : value.to.toLowerCase() } : {}),
    code: value.code,
  }))
  .meta({ id: "CheckVerificationRequest", examples: [{ to: TO_EXAMPLE, code: "482913" }] });

export type CheckVerificationRequestInput = z.input<typeof CheckVerificationRequest>;
export type CheckVerificationRequestOutput = z.output<typeof CheckVerificationRequest>;

const VerificationSend = z
  .object({
    channel: z.enum(VERIFY_CHANNELS).meta({ description: "`sms` or `email`." }),
    route: z.enum(VERIFY_SEND_ROUTES).meta({
      description:
        "`own_number`: one of your numbers; `shared_number`: coss.com's; `email`: your sender; `coss_email`: coss.com's sender.",
    }),
    sms_id: z.string().nullable().meta({
      description:
        "The SMS, in your environment: `own_number`, or any in a sandbox environment (`null` for coss.com's shared numbers' messages).",
    }),
    email_id: z.string().nullable().meta({ description: "The email (`email` route only)." }),
    created_at: z.iso.datetime(),
  })
  .meta({ id: "VerificationSend" });

const Reason = z
  .object({
    code: z.string(),
    value: z.number().optional(),
  })
  .meta({ description: "A fraud guard reason (see the docs' list)." });

export const VerificationObject = z
  .object({
    object: z.literal("verification"),
    id: z.string().meta({ examples: [ID_EXAMPLE] }),
    channel: z.enum(VERIFY_CHANNELS).meta({ description: "`sms` or `email`." }),
    to: z.string().meta({ description: "The phone number (E.164) or address the code goes to." }),
    country: z.string().nullable().meta({ description: "ISO 3166 country of a phone number." }),
    status: z.enum(VERIFICATION_STATUSES).meta({
      description:
        "`pending` until the right code is checked (`approved`) or it ends: `expired`, `canceled`, `failed` (too many wrong codes, or the code couldn't be sent) or `blocked` (the fraud guard stopped it before anything was sent).",
    }),
    failure: z
      .object({
        code: z.string().meta({ description: "Machine-readable reason." }),
        message: z.string().meta({ description: "Human-readable explanation." }),
      })
      .nullable()
      .meta({ description: "Why it `failed`." }),
    reasons: z.array(Reason).meta({ description: "Why it was `blocked` (empty otherwise)." }),
    attempts: z.number().int().meta({ description: "Wrong codes checked so far." }),
    max_attempts: z.number().int().meta({ description: "How many wrong codes end it." }),
    sends: z.array(VerificationSend).meta({ description: "Each time the code was sent." }),
    tags: z
      .array(
        z.object({
          name: z.string().meta({ description: "The tag's name." }),
          value: z.string().meta({ description: "The tag's value." }),
        }),
      )
      .meta({ description: "Your tags on the verification." }),
    sandbox: z.boolean().meta({
      description: "Made in a sandbox environment: simulated, and the code is always zeros.",
    }),
    expires_at: z.iso.datetime().meta({ description: "When the code stops working." }),
    approved_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When the right code was checked. `null`: it wasn't." }),
    created_at: z.iso.datetime(),
  })
  .meta({
    id: "Verification",
    examples: [
      {
        object: "verification",
        id: ID_EXAMPLE,
        channel: "sms",
        to: TO_EXAMPLE,
        country: "US",
        status: "pending",
        failure: null,
        reasons: [],
        attempts: 0,
        max_attempts: 5,
        sends: [
          {
            channel: "sms",
            route: "shared_number",
            sms_id: SMS_ID_EXAMPLE,
            email_id: null,
            created_at: "2026-11-10T12:00:00.000Z",
          },
        ],
        tags: [],
        sandbox: false,
        expires_at: "2026-11-10T12:10:00.000Z",
        approved_at: null,
        created_at: "2026-11-10T12:00:00.000Z",
      },
    ],
  });

export type VerificationObjectOutput = z.output<typeof VerificationObject>;

export const VerificationCheckObject = z
  .object({
    object: z.literal("verification_check"),
    valid: z.boolean().meta({
      description:
        "Whether the code is right. Only `true` proves the end user has the phone or mailbox; checking an approved verification again with its code stays `true` until it expires.",
    }),
    verification: VerificationObject,
  })
  .meta({
    id: "VerificationCheck",
    examples: [
      {
        object: "verification_check",
        valid: true,
        verification: {
          object: "verification",
          id: ID_EXAMPLE,
          channel: "sms",
          to: TO_EXAMPLE,
          country: "US",
          status: "approved",
          failure: null,
          reasons: [],
          attempts: 0,
          max_attempts: 5,
          sends: [],
          tags: [],
          sandbox: false,
          expires_at: "2026-11-10T12:10:00.000Z",
          approved_at: "2026-11-10T12:00:41.000Z",
          created_at: "2026-11-10T12:00:00.000Z",
        },
      },
    ],
  });

export type VerificationCheckOutput = z.output<typeof VerificationCheckObject>;

export const VerificationList = z
  .object({
    object: z.literal("list"),
    data: z.array(VerificationObject),
    has_more: z.boolean(),
  })
  .meta({ id: "VerificationList", examples: [{ object: "list", data: [], has_more: false }] });

export type VerificationListOutput = z.output<typeof VerificationList>;

export const ListVerificationsQuery = z
  .strictObject({
    to: Destination.optional().meta({ description: "Only verifications to this destination." }),
    status: z
      .enum(VERIFICATION_STATUSES)
      .optional()
      .meta({ description: "Only verifications in this status." }),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_VERIFY_LIST_LIMIT)
      .optional()
      .meta({ description: `1-${MAX_VERIFY_LIST_LIMIT}, default ${DEFAULT_VERIFY_LIST_LIMIT}.` }),
    after: z
      .string()
      .max(64)
      .optional()
      .meta({ description: "Cursor: the `id` of the last item of the previous page." }),
  })
  .meta({ description: "Verifications are returned newest first." });

export type ListVerificationsQueryOutput = z.output<typeof ListVerificationsQuery>;

// Settings.

export const VerifySettingsObject = z
  .object({
    object: z.literal("verify_settings"),
    app_name: z.string().meta({ description: "The name codes are sent for." }),
    app_name_is_default: z
      .boolean()
      .meta({ description: "Whether `app_name` is the project's: no name of its own is set." }),
    code_length: z.number().int().meta({ description: "Digits in a code." }),
    ttl_seconds: z.number().int().meta({ description: "How long a code works." }),
    max_attempts: z
      .number()
      .int()
      .meta({ description: "Wrong codes before a verification fails." }),
    sms_from: z.string().nullable().meta({
      description: "One of the organization's numbers; `null`: coss.com's shared numbers.",
    }),
    email_from: z.string().nullable().meta({
      description: "An address on one of the organization's verified domains; `null`: coss.com's.",
    }),
    allowed_countries: z.array(z.string()).meta({
      description: "ISO 3166 countries SMS codes may go to.",
    }),
  })
  .meta({
    id: "VerifySettings",
    description: "An environment's Verify settings.",
    examples: [
      {
        object: "verify_settings",
        app_name: "Acme",
        app_name_is_default: false,
        code_length: 6,
        ttl_seconds: 600,
        max_attempts: 5,
        sms_from: "+14155550100",
        email_from: "codes@acme.com",
        allowed_countries: ["CA", "US"],
      },
    ],
  });

export const UpdateVerifySettingsRequest = z
  .strictObject({
    app_name: z
      .string()
      .trim()
      .min(1)
      .max(MAX_APP_NAME_LENGTH)
      .nullable()
      .optional()
      .meta({ description: "The name codes are sent for; `null`: the project's." }),
    code_length: z
      .number()
      .int()
      .min(MIN_CODE_LENGTH)
      .max(MAX_CODE_LENGTH)
      .optional()
      .meta({ description: `Digits in a code, ${MIN_CODE_LENGTH}-${MAX_CODE_LENGTH}.` }),
    ttl_seconds: z
      .number()
      .int()
      .min(MIN_TTL_SECONDS)
      .max(MAX_TTL_SECONDS)
      .optional()
      .meta({ description: `How long a code works, ${MIN_TTL_SECONDS}-${MAX_TTL_SECONDS} s.` }),
    max_attempts: z
      .number()
      .int()
      .min(1)
      .max(MAX_ATTEMPTS_LIMIT)
      .optional()
      .meta({ description: `Wrong codes before a verification fails, 1-${MAX_ATTEMPTS_LIMIT}.` }),
    sms_from: z.string().regex(E164).nullable().optional().meta({
      description: "One of the organization's numbers; `null`: coss.com's shared numbers.",
    }),
    email_from: z.email().nullable().optional().meta({
      description:
        "An address on one of the organization's verified domains (live keys); `null`: coss.com's.",
    }),
    allowed_countries: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .max(250)
      .optional()
      .meta({ description: "ISO 3166 countries SMS codes may go to." }),
  })
  .meta({
    id: "UpdateVerifySettingsRequest",
    description: "Only the fields given change.",
    examples: [{ sms_from: "+14155550100", allowed_countries: ["CA", "GB", "US"] }],
  });

export type VerifySettingsWire = z.output<typeof VerifySettingsObject>;

export type UpdateVerifySettingsRequestOutput = z.output<typeof UpdateVerifySettingsRequest>;

// Webhook events.

export const VerificationWebhookEvent = z
  .object({
    id: z.string(),
    object: z.literal("event"),
    type: z
      .enum(VERIFY_WEBHOOK_EVENT_TYPES)
      .meta({ description: "What happened to the verification." }),
    api_version: z.string().meta({
      description: "The API version the payload is rendered in (your endpoint's version).",
      examples: [LATEST_API_VERSION],
    }),
    created_at: z.iso.datetime().meta({ description: "When the event was created." }),
    data: z
      .object({
        verification_id: z.string().meta({ description: "The verification's id." }),
        channel: z.enum(VERIFY_CHANNELS).meta({ description: "`sms` or `email`." }),
        to: z
          .string()
          .meta({ description: "The phone number (E.164) or address the code goes to." }),
        status: z.enum(VERIFICATION_STATUSES).meta({ description: "Its status after this event." }),
        failure: z
          .object({
            code: z.string().meta({ description: "Machine-readable reason." }),
            message: z.string().meta({ description: "Human-readable explanation." }),
          })
          .nullable()
          .meta({ description: "Why it `failed`. `null` otherwise." }),
        reasons: z.array(Reason).meta({ description: "Why it was `blocked`. Empty otherwise." }),
        tags: z
          .array(
            z.object({
              name: z.string().meta({ description: "The tag's name." }),
              value: z.string().meta({ description: "The tag's value." }),
            }),
          )
          .meta({ description: "Your tags on the verification." }),
        sandbox: z
          .boolean()
          .meta({ description: "Whether it's made in a sandbox environment: simulated." }),
        occurred_at: z.iso.datetime().meta({ description: "When this happened." }),
      })
      .meta({ description: "The verification. Never its code." }),
  })
  .meta({
    id: "VerificationWebhookEvent",
    examples: [
      {
        id: EVENT_ID_EXAMPLE,
        object: "event",
        type: "verification.approved",
        api_version: LATEST_API_VERSION,
        created_at: "2026-11-10T12:00:41.100Z",
        data: {
          verification_id: ID_EXAMPLE,
          channel: "sms",
          to: TO_EXAMPLE,
          status: "approved",
          failure: null,
          reasons: [],
          tags: [],
          sandbox: false,
          occurred_at: "2026-11-10T12:00:41.000Z",
        },
      },
    ],
  });

export type VerificationWebhookEventOutput = z.output<typeof VerificationWebhookEvent>;
export type StoredVerificationWebhookEvent = Omit<VerificationWebhookEventOutput, "api_version">;
