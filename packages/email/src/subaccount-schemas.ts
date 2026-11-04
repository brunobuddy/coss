/**
 * Public wire schemas of email sub-accounts (snake_case). Plain zod, no database imports: exported
 * as `@coss/email/subaccount-schemas`.
 */
import { ReputationCheckObject } from "@coss/reputation/schemas";
import { z } from "zod";

export const SUBACCOUNT_STATUSES = ["active", "disabled", "deleting"] as const;
export type SubaccountStatus = (typeof SUBACCOUNT_STATUSES)[number];
export const SUBACCOUNT_REPUTATION_STATUSES = ["good", "warning", "paused"] as const;
export type SubaccountReputationStatus = (typeof SUBACCOUNT_REPUTATION_STATUSES)[number];

/** The customer's own id for a sub-account: what a send's `subaccount` may name instead of the id. */
export const SUBACCOUNT_UID = /^[A-Za-z0-9_.:@|-]{1,256}$/;
export const SUBACCOUNT_NAME_MAX_LENGTH = 256;
export const MAX_SUBACCOUNT_METADATA_KEYS = 16;
export const DEFAULT_SUBACCOUNT_LIST_LIMIT = 50;
export const MAX_SUBACCOUNT_LIST_LIMIT = 100;
/** The highest quota a customer can set (`integer` columns; the organization's quota applies too). */
export const MAX_SUBACCOUNT_QUOTA = 100_000_000;

const SUBACCOUNT_ID = "sub_01k7c8m4q2f3e9v6t5r1n0p8yz";
const CREATED = "2026-01-15T09:30:00.000Z";

const Timestamp = z.iso.datetime();

const Metadata = z
  .record(z.string().min(1).max(40), z.string().max(500))
  .refine((value) => Object.keys(value).length <= MAX_SUBACCOUNT_METADATA_KEYS, {
    message: `At most ${MAX_SUBACCOUNT_METADATA_KEYS} metadata keys.`,
  })
  .meta({
    description: `Your own key-value pairs (at most ${MAX_SUBACCOUNT_METADATA_KEYS}; keys up to 40 characters, values up to 500).`,
    examples: [{ plan: "pro" }],
  });

/** Why `uid` can't name a sub-account, or `null` when it can. */
export function subaccountUidProblem(uid: string): string | null {
  if (!SUBACCOUNT_UID.test(uid)) return "Use 1-256 letters, digits and . _ : @ | -";
  // A path segment: URLs resolve these to another path.
  if (uid === "." || uid === "..") return "A uid can't be `.` or `..`.";
  // Calls take an id or a uid, and a `sub_…` reference is looked up as an id.
  if (uid.startsWith("sub_")) return "A uid can't start with `sub_`: sub-account ids do.";
  return null;
}

const SubaccountUid = z.string().superRefine((value, ctx) => {
  const problem = subaccountUidProblem(value);
  if (problem) ctx.addIssue({ code: "custom", message: problem });
});

const QuotaValue = z.number().int().min(1).max(MAX_SUBACCOUNT_QUOTA);

const QUOTAS_EXAMPLE = { recipients_per_day: 5000, recipients_per_second: 5, burst: 50 };

export const SubaccountQuotas = z
  .object({
    recipients_per_day: QuotaValue.nullable().meta({
      description: "Recipients it may send to per day; `null`: only your organization's quota.",
    }),
    recipients_per_second: QuotaValue.nullable().meta({
      description: "Recipients it may send to per second; `null`: only your organization's quota.",
    }),
    burst: QuotaValue.nullable().meta({
      description:
        "How many recipients a moment may take before the per-second rate applies; `null`: the per-second rate.",
    }),
  })
  .meta({
    description: "Its own sending limits.",
    id: "SubaccountQuotas",
    examples: [QUOTAS_EXAMPLE],
  });

/** Quotas in a request: every field optional, `null` removes one. */
const SubaccountQuotasInput = z
  .strictObject({
    recipients_per_day: QuotaValue.nullable()
      .optional()
      .meta({ description: "Most recipients a day. `null` removes the limit." }),
    recipients_per_second: QuotaValue.nullable()
      .optional()
      .meta({ description: "Most recipients a second. `null` removes the limit." }),
    burst: QuotaValue.nullable().optional().meta({
      description:
        "How many recipients a moment may take before the per-second rate applies. `null` removes it.",
    }),
  })
  .meta({
    description: "Fields left out keep their value; `null` removes a quota.",
    examples: [QUOTAS_EXAMPLE],
  });

const REPUTATION_EXAMPLE = {
  status: "good",
  trigger: null,
  changed_at: null,
  reinstated_at: null,
};

export const SubaccountReputation = z
  .object({
    status: z.enum(SUBACCOUNT_REPUTATION_STATUSES).meta({
      description:
        "`warning`: a rate is close to its limit. `paused`: its live sends are refused (`subaccount_paused`) until you reinstate it.",
    }),
    trigger: z.string().nullable().meta({
      description:
        "What last changed it, e.g. `bounce_rate`, `complaint_rate`, `content_screening`.",
    }),
    changed_at: Timestamp.nullable().meta({
      description: "When its status last changed. `null`: never.",
    }),
    reinstated_at: Timestamp.nullable().meta({
      description: "When it was last reinstated. `null`: never.",
    }),
  })
  .meta({
    description: "Its own sending standing.",
    id: "SubaccountReputation",
    examples: [REPUTATION_EXAMPLE],
  });

const SUBACCOUNT_EXAMPLE = {
  object: "subaccount",
  id: SUBACCOUNT_ID,
  uid: "user_8812",
  name: "Acme Bakery",
  metadata: { plan: "pro" },
  status: "active",
  quotas: QUOTAS_EXAMPLE,
  reputation: REPUTATION_EXAMPLE,
  created_at: CREATED,
  updated_at: CREATED,
};

export const Subaccount = z
  .object({
    object: z.literal("subaccount"),
    id: z.string().meta({ examples: [SUBACCOUNT_ID] }),
    uid: z.string().nullable().meta({
      description:
        "Your own id for it (e.g. your user's id), unique in the environment. Every path and send that takes a sub-account accepts its `id` or its `uid`.",
    }),
    name: z.string().meta({ description: "Your name for it." }),
    metadata: z.record(z.string(), z.string()).meta({ description: "Your own key-value pairs." }),
    status: z.enum(SUBACCOUNT_STATUSES).meta({
      description:
        "`disabled`: you turned it off (its sends are refused). `deleting`: its domains are being released.",
    }),
    quotas: SubaccountQuotas,
    reputation: SubaccountReputation,
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .meta({ id: "Subaccount", examples: [SUBACCOUNT_EXAMPLE] });
export type SubaccountOutput = z.output<typeof Subaccount>;

export const CreateSubaccountRequest = z
  .strictObject({
    name: z
      .string()
      .trim()
      .min(1)
      .max(SUBACCOUNT_NAME_MAX_LENGTH)
      .meta({ description: "A name for your own reference.", examples: ["Acme Bakery"] }),
    uid: SubaccountUid.optional().meta({
      description: "Your own id for it, to address it by instead of its `id`.",
      examples: ["user_8812"],
    }),
    metadata: Metadata.optional(),
    quotas: SubaccountQuotasInput.optional(),
  })
  .meta({
    id: "CreateSubaccountRequest",
    examples: [{ name: "Acme Bakery", uid: "user_8812", quotas: { recipients_per_day: 5000 } }],
  });
export type CreateSubaccountRequestOutput = z.output<typeof CreateSubaccountRequest>;

export const UpdateSubaccountRequest = z
  .strictObject({
    name: z
      .string()
      .trim()
      .min(1)
      .max(SUBACCOUNT_NAME_MAX_LENGTH)
      .optional()
      .meta({ description: "Your name for it." }),
    uid: SubaccountUid.nullable().optional().meta({ description: "`null` removes it." }),
    metadata: Metadata.optional().meta({ description: "Replaces the metadata." }),
    status: z.enum(["active", "disabled"]).optional().meta({
      description: "`disabled` refuses its sends until it is `active` again.",
    }),
    quotas: SubaccountQuotasInput.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update." })
  .meta({ id: "UpdateSubaccountRequest", examples: [{ status: "disabled" }] });
export type UpdateSubaccountRequestOutput = z.output<typeof UpdateSubaccountRequest>;

export const ListSubaccountsQuery = z
  .object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_SUBACCOUNT_LIST_LIMIT)
      .optional()
      .meta({
        description: `1-${MAX_SUBACCOUNT_LIST_LIMIT}, default ${DEFAULT_SUBACCOUNT_LIST_LIMIT}.`,
      }),
    after: z
      .string()
      .optional()
      .meta({ description: "The last `id` of the previous page.", examples: [SUBACCOUNT_ID] }),
  })
  .meta({ id: "ListSubaccountsQuery" });

export const SubaccountList = z
  .object({ object: z.literal("list"), data: z.array(Subaccount), has_more: z.boolean() })
  .meta({
    id: "SubaccountList",
    examples: [{ object: "list", data: [SUBACCOUNT_EXAMPLE], has_more: false }],
  });

/** How far back stats reach: emails are kept 45 days (`RETENTION_DAYS.emails`). */
export const MAX_SUBACCOUNT_STATS_DAYS = 45;

const DateOnly = z.iso.date();

export const SubaccountStatsQuery = z
  .object({
    from: DateOnly.optional().meta({
      description: "First day (UTC, `YYYY-MM-DD`); default 30 days before `to`.",
      examples: ["2026-10-01"],
    }),
    to: DateOnly.optional().meta({
      description: "Last day (UTC, `YYYY-MM-DD`), included; default today.",
      examples: ["2026-10-15"],
    }),
  })
  .meta({ id: "SubaccountStatsQuery" });

const STATS_DAY_EXAMPLE = {
  date: "2026-10-15",
  recipients: 120,
  sent: 118,
  delivered: 115,
  bounced: 2,
  complained: 0,
  failed: 0,
  suppressed: 2,
};

export const SubaccountStatsDay = z
  .object({
    date: DateOnly.meta({ description: "The UTC date." }),
    recipients: z.number().int().meta({ description: "Recipients of the emails sent that day." }),
    sent: z.number().int().meta({ description: "Handed to the provider (delivered or not)." }),
    delivered: z.number().int().meta({ description: "Deliveries that day." }),
    bounced: z.number().int().meta({ description: "Bounces that day." }),
    complained: z.number().int().meta({ description: "Complaints that day." }),
    failed: z.number().int().meta({ description: "Failures that day." }),
    suppressed: z.number().int().meta({ description: "Skipped: on a suppression list." }),
  })
  .meta({ id: "SubaccountStatsDay", examples: [STATS_DAY_EXAMPLE] });

export const SubaccountStats = z
  .object({
    object: z.literal("subaccount_stats"),
    subaccount_id: z.string().meta({ description: "The sub-account's id." }),
    from: DateOnly.meta({ description: "The first date included." }),
    to: DateOnly.meta({ description: "The last date included." }),
    data: z.array(SubaccountStatsDay).meta({
      description:
        "One entry per day with sends, oldest first; recipients count by their current status.",
    }),
  })
  .meta({
    id: "SubaccountStats",
    examples: [
      {
        object: "subaccount_stats",
        subaccount_id: SUBACCOUNT_ID,
        from: "2026-10-15",
        to: "2026-10-15",
        data: [STATS_DAY_EXAMPLE],
      },
    ],
  });
export type SubaccountStatsOutput = z.output<typeof SubaccountStats>;

/**
 * Webhook events about a sub-account's own reputation (delivered to its environment; live only,
 * like `account.*`).
 */
export const SUBACCOUNT_EVENT_TYPES = [
  "subaccount.reputation_warning",
  "subaccount.reputation_recovered",
  "subaccount.paused",
  "subaccount.reinstated",
] as const;
export type SubaccountEventType = (typeof SUBACCOUNT_EVENT_TYPES)[number];

const SUBACCOUNT_EVENT_EXAMPLE = {
  id: "evt_01k7c8m4q2f3e9v6t5r1n0p8yz",
  object: "event",
  type: "subaccount.paused",
  api_version: "2026-10-01",
  created_at: CREATED,
  data: {
    subaccount_id: SUBACCOUNT_ID,
    uid: "user_8812",
    status: "paused",
    previous_status: "warning",
    trigger: "bounce_rate",
    occurred_at: CREATED,
    checks: [
      {
        trigger: "bounce_rate",
        severity: "suspend",
        message: "Bounce rate 9.50% is at or above the 8.00% suspension threshold.",
        rate: 0.095,
        count: 19,
        volume: 200,
        warning_threshold: 0.04,
        suspend_threshold: 0.08,
        minimum_volume: 200,
      },
    ],
  },
};

export const SubaccountWebhookEvent = z
  .object({
    id: z.string().meta({ description: "The event id, also sent as the `webhook-id` header." }),
    object: z.literal("event"),
    type: z.enum(SUBACCOUNT_EVENT_TYPES).meta({ description: "What changed for the sub-account." }),
    api_version: z.string().meta({
      description:
        "The API version (`Coss-Version`) this event is rendered in: the receiving endpoint's `api_version`.",
    }),
    created_at: Timestamp.meta({ description: "When the event was created." }),
    data: z
      .object({
        subaccount_id: z.string().meta({ description: "The sub-account's id." }),
        uid: z.string().nullable().meta({ description: "Your own id for it. `null`: none." }),
        status: z
          .enum(SUBACCOUNT_REPUTATION_STATUSES)
          .meta({ description: "Its status after this event." }),
        previous_status: z
          .enum(SUBACCOUNT_REPUTATION_STATUSES)
          .meta({ description: "Its status before." }),
        trigger: z.string().nullable().meta({
          description:
            "What changed it: a check (`bounce_rate`, `complaint_rate`), `content_screening` or `reinstated`.",
        }),
        occurred_at: Timestamp.meta({ description: "When this happened." }),
        checks: z.array(ReputationCheckObject).meta({
          description:
            "The measurements behind the change (empty for reinstatements and screening).",
        }),
      })
      .meta({ description: "The sub-account's standing." }),
  })
  .meta({ id: "SubaccountWebhookEvent", examples: [SUBACCOUNT_EVENT_EXAMPLE] });
export type SubaccountWebhookEventOutput = z.output<typeof SubaccountWebhookEvent>;
/** What the outbox stores: delivery adds `api_version` when it renders the event for an endpoint. */
export type StoredSubaccountWebhookEvent = Omit<SubaccountWebhookEventOutput, "api_version">;
