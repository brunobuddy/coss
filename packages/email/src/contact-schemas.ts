/**
 * Public wire schemas of contacts, custom properties, audiences, segments, topics and marketing
 * settings (snake_case). Plain zod like `schemas.ts` (no database imports): exported through
 * `@coss/email/schemas`.
 */
import { LATEST_API_VERSION } from "@coss/versioning";
import { z } from "zod";
import { CONTACT_EVENT_TYPES } from "./contact-event-types.ts";
import { Category, emailAddressProblem, SuppressionAddress } from "./schemas.ts";

export { CONTACT_EVENT_TYPES, type ContactEventType } from "./contact-event-types.ts";

/** Custom properties per environment. */
export const MAX_CONTACT_PROPERTIES = 50;
/** Topics per environment: the preference page shows them all, and its form carries every one. */
export const MAX_TOPICS = 100;
/** Serialized size of one contact's custom properties. */
export const MAX_CONTACT_PROPERTIES_BYTES = 16 * 1024;
/** Contacts per `POST /v1/contacts/import` request (the SDK and the dashboard batch). */
export const MAX_CONTACT_IMPORT_ENTRIES = 1000;
/** Contacts added to an audience per request. */
export const MAX_AUDIENCE_CONTACTS_PER_REQUEST = 1000;
/** Audiences a contact can be added to in one upsert. */
export const MAX_CONTACT_AUDIENCES = 20;
/** Conditions in one segment filter, counting nested groups' (groups nest one level). */
export const MAX_SEGMENT_CONDITIONS = 20;
export const DEFAULT_CONTACT_LIST_LIMIT = 50;
export const MAX_CONTACT_LIST_LIMIT = 100;
export const CONTACT_NAME_MAX_LENGTH = 256;
const STRING_PROPERTY_MAX_LENGTH = 2000;
const LIST_NAME_MAX_LENGTH = 200;
const TOPIC_DESCRIPTION_MAX_LENGTH = 500;
export const MAILING_ADDRESS_MAX_LENGTH = 500;

export const CONTACT_STATUSES = ["subscribed", "unsubscribed", "pending"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];
export const CONTACT_SOURCES = ["api", "dashboard", "import", "preference_center", "form"] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];
export const CONTACT_PROPERTY_TYPES = ["string", "number", "boolean", "date"] as const;
export type ContactPropertyType = (typeof CONTACT_PROPERTY_TYPES)[number];
export const TOPIC_DEFAULT_SUBSCRIPTIONS = ["opt_in", "opt_out"] as const;
export const TOPIC_VISIBILITIES = ["public", "private"] as const;
export const CONTACT_TOPIC_STATUSES = ["opted_in", "opted_out"] as const;
export type ContactTopicStatus = (typeof CONTACT_TOPIC_STATUSES)[number];

/** `^[a-z][a-z0-9_]{0,49}$`: usable as `{{{contact.<key>}}}` in templates. */
export const CONTACT_PROPERTY_KEY = /^[a-z][a-z0-9_]{0,49}$/;
/**
 * Keys custom properties can't take: the built-in fields and every column name a contact CSV
 * reads as one (`contact-csv.ts`), so an export always imports back into the same fields.
 */
export const RESERVED_PROPERTY_KEYS: ReadonlySet<string> = new Set([
  "email",
  "address",
  "email_address",
  "first_name",
  "firstname",
  "given_name",
  "last_name",
  "lastname",
  "family_name",
  "surname",
  "status",
  "subscribed",
  "id",
  "created_at",
  "updated_at",
  // The one `Object.prototype` name the key format allows: lookups must never find it.
  "constructor",
]);

const Timestamp = z.iso.datetime();
const NullableTimestamp = Timestamp.nullable();

const ContactEmail = SuppressionAddress.meta({
  description: "The contact's address. Display names are ignored; matching is case-insensitive.",
  examples: ["ada@example.com"],
});

const PersonName = z
  .string()
  .trim()
  .min(1)
  .max(CONTACT_NAME_MAX_LENGTH)
  .refine((value) => !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value), {
    message: "Must not contain control or invisible formatting characters.",
  });

/**
 * A property value as sent: strings (dates as ISO 8601 strings), numbers and booleans; `null`
 * removes the property. Values are checked against the property's type on write.
 */
export const ContactPropertyValue = z.union([
  z.string().max(STRING_PROPERTY_MAX_LENGTH),
  z.number(),
  z.boolean(),
  z.null(),
]);
export type ContactPropertyValueOutput = z.output<typeof ContactPropertyValue>;

const PropertyKey = z
  .string()
  .regex(
    CONTACT_PROPERTY_KEY,
    "Must start with a lower-case letter and contain only a-z, 0-9 and _ (at most 50).",
  )
  .refine((value) => !RESERVED_PROPERTY_KEYS.has(value), {
    message: "This key is reserved for a built-in field.",
  });

const ContactProperties = z.record(z.string(), ContactPropertyValue).meta({
  description:
    "Custom properties by key (define them first, see contact properties). Merged into the " +
    "contact's existing properties; `null` removes one.",
  examples: [{ plan: "pro", seats: 5 }],
});

const TopicChoice = z.strictObject({
  topic: Category.meta({ description: "The topic's key." }),
  status: z
    .enum(CONTACT_TOPIC_STATUSES)
    .meta({ description: "`opted_in` or `opted_out` of the topic." }),
});

const CONTACT_ID_EXAMPLE = "contact_01k7c8m4q2f3e9v6t5r1n0p8yz";
const CONTACT_EXAMPLE = {
  object: "contact",
  id: CONTACT_ID_EXAMPLE,
  email: "ada@example.com",
  first_name: "Ada",
  last_name: "Lovelace",
  status: "subscribed",
  properties: { plan: "pro", seats: 5 },
  source: "api",
  subscribed_at: "2026-10-10T12:00:00.000Z",
  unsubscribed_at: null,
  confirmed_at: null,
  created_at: "2026-10-10T12:00:00.000Z",
  updated_at: "2026-10-10T12:00:00.000Z",
} as const;

export const Contact = z
  .object({
    object: z.literal("contact"),
    id: z.string(),
    email: z.string().meta({
      description: "The contact's address. Unique in the environment, case-insensitively.",
    }),
    first_name: z.string().nullable().meta({ description: "Their first name. `null`: not set." }),
    last_name: z.string().nullable().meta({ description: "Their last name. `null`: not set." }),
    status: z.enum(CONTACT_STATUSES).meta({
      description:
        "Consent to marketing email: `subscribed`, `unsubscribed` (never receives marketing " +
        "email; transactional email is unaffected) or `pending` (waiting for a double opt-in " +
        "confirmation).",
    }),
    properties: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .meta({ description: "Custom properties by key." }),
    source: z.enum(CONTACT_SOURCES).meta({ description: "How the contact was created." }),
    subscribed_at: NullableTimestamp.meta({
      description: "When it last became `subscribed`. `null`: it hasn't.",
    }),
    unsubscribed_at: NullableTimestamp.meta({
      description: "When it became `unsubscribed`. `null` unless it is.",
    }),
    confirmed_at: NullableTimestamp.meta({
      description: "When the contact confirmed a double opt-in.",
    }),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .meta({ id: "Contact", examples: [CONTACT_EXAMPLE] });
export type ContactOutput = z.output<typeof Contact>;

export const ContactList = z
  .object({ object: z.literal("list"), data: z.array(Contact), has_more: z.boolean() })
  .meta({
    id: "ContactList",
    examples: [{ object: "list", data: [CONTACT_EXAMPLE], has_more: false }],
  });
export type ContactListOutput = z.output<typeof ContactList>;

const ContactFields = {
  first_name: PersonName.nullable()
    .optional()
    .meta({ description: "Their first name. `null` removes it." }),
  last_name: PersonName.nullable()
    .optional()
    .meta({ description: "Their last name. `null` removes it." }),
  properties: ContactProperties.optional(),
  status: z
    .enum(["subscribed", "unsubscribed"], {
      error: 'Must be "subscribed" or "unsubscribed" (pending contacts confirm by double opt-in).',
    })
    .optional()
    .meta({
      description:
        "Sets the contact's consent. Omitted, a new contact is `subscribed` and an existing one " +
        "keeps its status.",
    }),
};

export const UpsertContactRequest = z
  .strictObject({
    email: ContactEmail,
    ...ContactFields,
    audience_ids: z
      .array(z.string())
      .max(MAX_CONTACT_AUDIENCES)
      .optional()
      .meta({ description: "Audiences to add the contact to (it stays in the others)." }),
    topics: z
      .array(TopicChoice)
      .max(100)
      .optional()
      .meta({ description: "Choices per topic; topics left out keep the contact's choice." }),
    double_opt_in: z
      .boolean()
      .optional()
      .meta({
        description:
          "Ask the contact to confirm first (default: the marketing settings' " +
          "`double_opt_in_default`): a new or unsubscribed contact becomes `pending` and gets a " +
          "confirmation email; it is `subscribed` once they click its link. Can't be combined with " +
          '`status: "subscribed"`, nor can the default (pass `false` to subscribe directly).',
      }),
  })
  .refine((value) => !(value.double_opt_in && value.status === "subscribed"), {
    path: ["status"],
    message: 'A double opt-in contact becomes subscribed when it confirms, not with "status".',
  })
  .meta({
    id: "UpsertContactRequest",
    examples: [
      {
        email: "ada@example.com",
        first_name: "Ada",
        properties: { plan: "pro" },
        topics: [{ topic: "newsletter", status: "opted_in" }],
      },
    ],
  });
export type UpsertContactRequestOutput = z.output<typeof UpsertContactRequest>;

export const UpdateContactRequest = z
  .strictObject({
    ...ContactFields,
    topics: z.array(TopicChoice).max(100).optional(),
  })
  .meta({
    id: "UpdateContactRequest",
    examples: [{ last_name: "Byron", properties: { seats: null } }],
  });
export type UpdateContactRequestOutput = z.output<typeof UpdateContactRequest>;

export const ListContactsQuery = z.strictObject({
  email: SuppressionAddress.optional().meta({ description: "Only the contact with this address." }),
  status: z.enum(CONTACT_STATUSES).optional(),
  audience_id: z.string().optional().meta({ description: "Only members of this audience." }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_CONTACT_LIST_LIMIT)
    .optional()
    .meta({ description: `1-${MAX_CONTACT_LIST_LIMIT}, default ${DEFAULT_CONTACT_LIST_LIMIT}.` }),
  after: z
    .string()
    .optional()
    .meta({ description: "Cursor: the `id` of the last contact of the previous page." }),
});
export type ListContactsQueryOutput = z.output<typeof ListContactsQuery>;

export const ExportContactsQuery = ListContactsQuery.pick({ status: true, audience_id: true });
export type ExportContactsQueryOutput = z.output<typeof ExportContactsQuery>;

/**
 * One import entry. Only its shape is checked with the request: `importContacts` validates each
 * entry on its own (as `UpsertContactRequest`), so a bad one is reported in `invalid` instead of
 * refusing the whole import.
 */
export const ContactImportEntry = z.strictObject({
  email: z.string().meta({ description: "The contact's address (validated on its own)." }),
  first_name: z.string().nullable().optional().meta({ description: "Their first name." }),
  last_name: z.string().nullable().optional().meta({ description: "Their last name." }),
  properties: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional()
    .meta({ description: "Custom properties by key, checked against their definitions." }),
  status: z
    .string()
    .optional()
    .meta({
      description:
        "`subscribed` or `unsubscribed` (anything else, like an export's `pending`, is reported in " +
        "`invalid`). Omitted, a new contact is `subscribed` and an existing one keeps its status.",
    }),
});
export type ContactImportEntryInput = z.input<typeof ContactImportEntry>;

export const ImportContactsRequest = z
  .strictObject({
    contacts: z.array(ContactImportEntry).min(1).max(MAX_CONTACT_IMPORT_ENTRIES),
    audience_id: z
      .string()
      .optional()
      .meta({ description: "Adds every imported contact to this audience." }),
  })
  .meta({
    id: "ImportContactsRequest",
    examples: [
      {
        contacts: [
          { email: "ada@example.com", first_name: "Ada", properties: { plan: "pro" } },
          { email: "grace@example.com", status: "unsubscribed" },
        ],
      },
    ],
  });

export const ContactImport = z
  .object({
    object: z.literal("contact_import"),
    created: z.int().meta({ description: "Contacts created." }),
    updated: z.int().meta({ description: "Existing contacts updated." }),
    kept_unsubscribed: z.int().meta({
      description:
        "Existing contacts the import marked `subscribed` that stay `unsubscribed`: an import " +
        "never re-subscribes anyone.",
    }),
    invalid: z
      .array(
        z.object({
          index: z.int().meta({ description: "The entry's position in `contacts`, from 0." }),
          email: z.string().meta({ description: "The address it gave." }),
          message: z.string().meta({ description: "Why it was refused." }),
        }),
      )
      .meta({
        description: "Entries that were refused. The rest of the import still went through.",
      }),
  })
  .meta({
    id: "ContactImport",
    examples: [
      {
        object: "contact_import",
        created: 1,
        updated: 1,
        kept_unsubscribed: 0,
        invalid: [{ index: 2, email: "not-an-address", message: "Must be an email address." }],
      },
    ],
  });
export type ContactImportOutput = z.output<typeof ContactImport>;

export const DeletedContact = z
  .object({ object: z.literal("contact"), id: z.string(), deleted: z.literal(true) })
  .meta({
    id: "DeletedContact",
    examples: [{ object: "contact", id: CONTACT_ID_EXAMPLE, deleted: true }],
  });

export const ContactTopics = z
  .object({
    object: z.literal("contact_topics"),
    contact_id: z.string().meta({ description: "The contact's id." }),
    topics: z
      .array(
        z.object({
          topic: z.string().meta({ description: "The topic's key." }),
          name: z.string().meta({ description: "The topic's name." }),
          subscribed: z.boolean().meta({
            description:
              "Whether emails about the topic reach the contact (its choice, else the topic's " +
              "default; an unsubscribed contact gets no marketing email at all).",
          }),
          choice: z.enum(CONTACT_TOPIC_STATUSES).nullable().meta({
            description: "The contact's explicit choice; `null`: the topic's default applies.",
          }),
        }),
      )
      .meta({ description: "Every topic of the environment, with this contact's standing." }),
  })
  .meta({
    id: "ContactTopics",
    examples: [
      {
        object: "contact_topics",
        contact_id: CONTACT_ID_EXAMPLE,
        topics: [
          { topic: "newsletter", name: "Newsletter", subscribed: true, choice: null },
          { topic: "product", name: "Product updates", subscribed: false, choice: "opted_out" },
        ],
      },
    ],
  });
export type ContactTopicsOutput = z.output<typeof ContactTopics>;

export const UpdateContactTopicsRequest = z
  .strictObject({ topics: z.array(TopicChoice).min(1).max(100) })
  .meta({
    id: "UpdateContactTopicsRequest",
    examples: [{ topics: [{ topic: "product", status: "opted_out" }] }],
  });

export const ContactConfirmation = z
  .object({
    object: z.literal("contact_confirmation"),
    contact_id: z.string().meta({ description: "The contact's id." }),
    status: z.enum(["sent", "cooldown", "limit_reached", "not_pending"]).meta({
      description:
        "`sent`; `cooldown` (one confirmation per contact per day); `limit_reached` (three " +
        "were sent and none confirmed); `not_pending` (the contact isn't waiting to confirm).",
    }),
  })
  .meta({
    id: "ContactConfirmation",
    examples: [{ object: "contact_confirmation", contact_id: CONTACT_ID_EXAMPLE, status: "sent" }],
  });
export type ContactConfirmationOutput = z.output<typeof ContactConfirmation>;

export const CreatePreferenceLinksRequest = z
  .strictObject({
    topic: Category.optional().meta({
      description: "The topic your email is about: its unsubscribe link leaves just that topic.",
    }),
  })
  .meta({ id: "CreatePreferenceLinksRequest", examples: [{ topic: "newsletter" }] });

export const PreferenceLinksObject = z
  .object({
    object: z.literal("preference_links"),
    contact_id: z.string().meta({ description: "The contact's id." }),
    preferences_url: z.string().meta({ description: "The contact's preference center." }),
    unsubscribe_url: z.string().meta({ description: "A one-button unsubscribe page." }),
  })
  .meta({
    id: "PreferenceLinks",
    examples: [
      {
        object: "preference_links",
        contact_id: CONTACT_ID_EXAMPLE,
        preferences_url: "https://track.cosslinks.com/t/u/aXyZ…",
        unsubscribe_url: "https://track.cosslinks.com/t/u/aXyZ…/unsubscribe",
      },
    ],
  });
export type PreferenceLinksOutput = z.output<typeof PreferenceLinksObject>;

// ---------------------------------------------------------------------------------------------
// Custom properties
// ---------------------------------------------------------------------------------------------

const PROPERTY_EXAMPLE = {
  object: "contact_property",
  id: "cprop_01k7c8m4q2f3e9v6t5r1n0p8yz",
  key: "plan",
  type: "string",
  fallback: "free",
  created_at: "2026-10-10T12:00:00.000Z",
  updated_at: "2026-10-10T12:00:00.000Z",
} as const;

export const ContactPropertyObject = z
  .object({
    object: z.literal("contact_property"),
    id: z.string(),
    key: z.string().meta({
      description: "How contacts and templates name it (`{{{contact.<key>}}}`). Can't change.",
    }),
    type: z.enum(CONTACT_PROPERTY_TYPES).meta({
      description: "`date` values are ISO 8601 strings.",
    }),
    fallback: z.union([z.string(), z.number(), z.boolean(), z.null()]).meta({
      description: "Used in templates for contacts without a value.",
    }),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .meta({ id: "ContactProperty", examples: [PROPERTY_EXAMPLE] });
export type ContactPropertyObjectOutput = z.output<typeof ContactPropertyObject>;

export const ContactPropertyList = z
  .object({
    object: z.literal("list"),
    data: z.array(ContactPropertyObject),
    has_more: z.boolean(),
  })
  .meta({
    id: "ContactPropertyList",
    examples: [{ object: "list", data: [PROPERTY_EXAMPLE], has_more: false }],
  });

export const CreateContactPropertyRequest = z
  .strictObject({
    key: PropertyKey.meta({
      description:
        "How contacts and templates name it. Lower-case letters, digits and `_`, starting with a letter. Can't change.",
    }),
    type: z.enum(CONTACT_PROPERTY_TYPES).meta({
      description: "What values it takes. `date` values are ISO 8601 strings. Can't change.",
    }),
    fallback: ContactPropertyValue.optional().meta({
      description: "Used in templates for contacts without a value.",
    }),
  })
  .meta({
    id: "CreateContactPropertyRequest",
    examples: [{ key: "plan", type: "string", fallback: "free" }],
  });
export type CreateContactPropertyRequestOutput = z.output<typeof CreateContactPropertyRequest>;

export const UpdateContactPropertyRequest = z
  .strictObject({
    fallback: ContactPropertyValue.meta({
      description: "Used in templates for contacts without a value. `null` removes it.",
    }),
  })
  .meta({ id: "UpdateContactPropertyRequest", examples: [{ fallback: "starter" }] });

export const DeletedContactProperty = z
  .object({ object: z.literal("contact_property"), id: z.string(), deleted: z.literal(true) })
  .meta({
    id: "DeletedContactProperty",
    examples: [{ object: "contact_property", id: PROPERTY_EXAMPLE.id, deleted: true }],
  });

// ---------------------------------------------------------------------------------------------
// Audiences (static lists)
// ---------------------------------------------------------------------------------------------

const ListName = z.string().trim().min(1).max(LIST_NAME_MAX_LENGTH);

const AUDIENCE_EXAMPLE = {
  object: "audience",
  id: "aud_01k7c8m4q2f3e9v6t5r1n0p8yz",
  name: "Beta testers",
  contact_count: 42,
  created_at: "2026-10-10T12:00:00.000Z",
  updated_at: "2026-10-10T12:00:00.000Z",
} as const;

export const Audience = z
  .object({
    object: z.literal("audience"),
    id: z.string(),
    name: z.string().meta({ description: "Your name for the list, unique in the environment." }),
    contact_count: z.int().meta({ description: "Members, whatever their status." }),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .meta({ id: "Audience", examples: [AUDIENCE_EXAMPLE] });
export type AudienceOutput = z.output<typeof Audience>;

export const AudienceList = z
  .object({ object: z.literal("list"), data: z.array(Audience), has_more: z.boolean() })
  .meta({
    id: "AudienceList",
    examples: [{ object: "list", data: [AUDIENCE_EXAMPLE], has_more: false }],
  });

export const ListQuery = z.strictObject({
  limit: ListContactsQuery.shape.limit,
  after: z
    .string()
    .optional()
    .meta({ description: "Cursor: the `id` of the last item of the previous page." }),
});
export type ListQueryOutput = z.output<typeof ListQuery>;

export const CreateAudienceRequest = z
  .strictObject({
    name: ListName.meta({ description: "Your name for the list, unique in the environment." }),
  })
  .meta({ id: "CreateAudienceRequest", examples: [{ name: "Beta testers" }] });

export const UpdateAudienceRequest = CreateAudienceRequest.meta({
  id: "UpdateAudienceRequest",
  examples: [{ name: "Early access" }],
});

export const AddAudienceContactsRequest = z
  .strictObject({
    contacts: z
      .array(z.string())
      .min(1)
      .max(MAX_AUDIENCE_CONTACTS_PER_REQUEST)
      .meta({ description: "Contact ids or addresses of existing contacts." }),
  })
  .meta({
    id: "AddAudienceContactsRequest",
    examples: [{ contacts: [CONTACT_ID_EXAMPLE, "grace@example.com"] }],
  });

export const AudienceContactsAdded = z
  .object({
    object: z.literal("audience_contacts"),
    added: z.int().meta({ description: "Contacts newly added." }),
    existing: z.int().meta({ description: "Contacts that were already members." }),
    missing: z.array(z.string()).meta({ description: "Ids or addresses of no contact." }),
  })
  .meta({
    id: "AudienceContactsAdded",
    examples: [{ object: "audience_contacts", added: 1, existing: 0, missing: [] }],
  });

export const DeletedAudience = z
  .object({ object: z.literal("audience"), id: z.string(), deleted: z.literal(true) })
  .meta({
    id: "DeletedAudience",
    examples: [{ object: "audience", id: AUDIENCE_EXAMPLE.id, deleted: true }],
  });

// ---------------------------------------------------------------------------------------------
// Segments (filters, evaluated whenever a segment is used)
// ---------------------------------------------------------------------------------------------

export const PROPERTY_OPERATORS = [
  "eq",
  "neq",
  "in",
  "not_in",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "starts_with",
  "exists",
  "not_exists",
] as const;
export type PropertyOperator = (typeof PROPERTY_OPERATORS)[number];

const Scalar = z.union([z.string().max(STRING_PROPERTY_MAX_LENGTH), z.number(), z.boolean()]);

const PropertyCondition = z.strictObject({
  field: z.literal("property"),
  key: z.string().meta({ description: "The custom property to test." }),
  op: z.enum(PROPERTY_OPERATORS).meta({
    description:
      "How to compare: `eq`, `neq`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`, `contains`, `starts_with`, or `exists` and `not_exists`, which take no value.",
  }),
  value: z
    .union([Scalar, z.array(Scalar).min(1).max(100)])
    .optional()
    .meta({ description: "A list for `in`/`not_in`; none for `exists`/`not_exists`." }),
});

const EmailCondition = z.strictObject({
  field: z.literal("email"),
  op: z
    .enum(["eq", "ends_with", "contains"])
    .meta({ description: "How to compare the contact's address." }),
  value: z.string().min(1).max(254).meta({ description: "What to compare it with." }),
});

const AudienceCondition = z.strictObject({
  field: z.literal("audience"),
  op: z.enum(["in", "not_in"]).meta({ description: "Whether the contact is in the audience." }),
  audience_id: z.string().meta({ description: "The audience's id." }),
});

const TopicCondition = z.strictObject({
  field: z.literal("topic"),
  op: z
    .enum(["subscribed", "not_subscribed"])
    .meta({ description: "Whether emails about the topic reach the contact." }),
  topic: Category.meta({ description: "The topic's key." }),
});

const CreatedAtCondition = z.strictObject({
  field: z.literal("created_at"),
  op: z
    .enum(["before", "after", "within_days"])
    .meta({ description: "`before` or `after` a time, or created `within_days` the last days." }),
  value: z.union([Timestamp, z.int().min(1).max(3650)]).meta({
    description: "A timestamp for `before`/`after`, a number of days for `within_days`.",
  }),
});

export const SegmentCondition = z.discriminatedUnion("field", [
  PropertyCondition,
  EmailCondition,
  AudienceCondition,
  TopicCondition,
  CreatedAtCondition,
]);
export type SegmentConditionOutput = z.output<typeof SegmentCondition>;

const Match = z.enum(["all", "any"]);

const SegmentGroup = z.strictObject({
  match: Match.meta({ description: "`all`: every condition must hold; `any`: one is enough." }),
  conditions: z.array(SegmentCondition).min(1).meta({ description: "The group's conditions." }),
});

export const SegmentFilter = z
  .strictObject({
    version: z.literal(1).meta({ description: "The filter's format. Always 1." }),
    match: Match.meta({ description: "`all`: every condition must hold; `any`: one is enough." }),
    conditions: z
      .array(z.union([SegmentCondition, SegmentGroup]))
      .min(1)
      .meta({
        description: "Conditions, or `{ match, conditions }` groups of them. At most 20 in all.",
      }),
  })
  .refine(
    (filter) =>
      filter.conditions.reduce(
        (total, item) => total + ("conditions" in item ? item.conditions.length : 1),
        0,
      ) <= MAX_SEGMENT_CONDITIONS,
    { message: `A filter can have at most ${MAX_SEGMENT_CONDITIONS} conditions.` },
  )
  .meta({
    id: "SegmentFilter",
    description:
      "Which contacts belong to the segment. Conditions on `property` (custom properties), " +
      "`email`, `audience` membership, `topic` subscription and `created_at`; one level of " +
      "nested `{ match, conditions }` groups.",
  });
export type SegmentFilterOutput = z.output<typeof SegmentFilter>;

const SEGMENT_FILTER_EXAMPLE = {
  version: 1,
  match: "all",
  conditions: [
    { field: "property", key: "plan", op: "eq", value: "pro" },
    {
      match: "any",
      conditions: [
        { field: "email", op: "ends_with", value: "@acme.com" },
        { field: "audience", op: "in", audience_id: AUDIENCE_EXAMPLE.id },
      ],
    },
  ],
} as const;

const SEGMENT_EXAMPLE = {
  object: "segment",
  id: "seg_01k7c8m4q2f3e9v6t5r1n0p8yz",
  name: "Pro customers",
  filter: SEGMENT_FILTER_EXAMPLE,
  created_at: "2026-10-10T12:00:00.000Z",
  updated_at: "2026-10-10T12:00:00.000Z",
} as const;

export const Segment = z
  .object({
    object: z.literal("segment"),
    id: z.string(),
    name: z.string().meta({ description: "Your name for the segment, unique in the environment." }),
    filter: SegmentFilter,
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .meta({ id: "Segment", examples: [SEGMENT_EXAMPLE] });
export type SegmentOutput = z.output<typeof Segment>;

export const SegmentList = z
  .object({ object: z.literal("list"), data: z.array(Segment), has_more: z.boolean() })
  .meta({
    id: "SegmentList",
    examples: [{ object: "list", data: [SEGMENT_EXAMPLE], has_more: false }],
  });

export const CreateSegmentRequest = z
  .strictObject({
    name: ListName.meta({ description: "Your name for the segment, unique in the environment." }),
    filter: SegmentFilter,
  })
  .meta({
    id: "CreateSegmentRequest",
    examples: [{ name: "Pro customers", filter: SEGMENT_FILTER_EXAMPLE }],
  });

export const UpdateSegmentRequest = z
  .strictObject({
    name: ListName.optional().meta({
      description: "Your name for the segment, unique in the environment.",
    }),
    filter: SegmentFilter.optional(),
  })
  .meta({ id: "UpdateSegmentRequest", examples: [{ name: "Pro and Scale customers" }] });

export const DeletedSegment = z
  .object({ object: z.literal("segment"), id: z.string(), deleted: z.literal(true) })
  .meta({
    id: "DeletedSegment",
    examples: [{ object: "segment", id: SEGMENT_EXAMPLE.id, deleted: true }],
  });

// ---------------------------------------------------------------------------------------------
// Topics (built on categories)
// ---------------------------------------------------------------------------------------------

const TOPIC_EXAMPLE = {
  object: "topic",
  id: "topic_01k7c8m4q2f3e9v6t5r1n0p8yz",
  key: "newsletter",
  name: "Newsletter",
  description: "Monthly product news.",
  default_subscription: "opt_in",
  visibility: "public",
  position: 0,
  created_at: "2026-10-10T12:00:00.000Z",
  updated_at: "2026-10-10T12:00:00.000Z",
} as const;

const TopicFields = {
  name: ListName.meta({ description: "Shown in the preference center." }),
  description: z
    .string()
    .trim()
    .max(TOPIC_DESCRIPTION_MAX_LENGTH)
    .nullable()
    .optional()
    .meta({ description: "Shown in the preference center under its name. `null`: none." }),
  default_subscription: z.enum(TOPIC_DEFAULT_SUBSCRIPTIONS).meta({
    description:
      "`opt_in`: every subscribed contact gets the topic's emails unless they opt out. " +
      "`opt_out`: only contacts who opted in do.",
  }),
  visibility: z.enum(TOPIC_VISIBILITIES).optional().meta({
    description: "`private` topics never show in the preference center (default `public`).",
  }),
  position: z.int().min(0).max(1000).optional().meta({
    description: "Order in the preference center (ascending).",
  }),
};

export const Topic = z
  .object({
    object: z.literal("topic"),
    id: z.string(),
    key: z.string().meta({
      description: "The `category` of the emails about this topic. Can't change.",
    }),
    name: z.string().meta({ description: "Shown in the preference center." }),
    description: z
      .string()
      .nullable()
      .meta({ description: "Shown in the preference center under its name. `null`: none." }),
    default_subscription: z.enum(TOPIC_DEFAULT_SUBSCRIPTIONS).meta({
      description:
        "`opt_in`: every subscribed contact gets the topic's emails unless they opt out. `opt_out`: only contacts who opted in do.",
    }),
    visibility: z
      .enum(TOPIC_VISIBILITIES)
      .meta({ description: "`private` topics never show in the preference center." }),
    position: z.int().meta({ description: "Order in the preference center (ascending)." }),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .meta({ id: "Topic", examples: [TOPIC_EXAMPLE] });
export type TopicOutput = z.output<typeof Topic>;

export const TopicList = z
  .object({ object: z.literal("list"), data: z.array(Topic), has_more: z.boolean() })
  .meta({
    id: "TopicList",
    examples: [{ object: "list", data: [TOPIC_EXAMPLE], has_more: false }],
  });

export const CreateTopicRequest = z.strictObject({ key: Category, ...TopicFields }).meta({
  id: "CreateTopicRequest",
  examples: [{ key: "newsletter", name: "Newsletter", default_subscription: "opt_in" }],
});

export const UpdateTopicRequest = z
  .strictObject({
    name: TopicFields.name.optional(),
    description: TopicFields.description,
    default_subscription: TopicFields.default_subscription.optional(),
    visibility: TopicFields.visibility,
    position: TopicFields.position,
  })
  .meta({ id: "UpdateTopicRequest", examples: [{ visibility: "private" }] });

export const DeletedTopic = z
  .object({ object: z.literal("topic"), id: z.string(), deleted: z.literal(true) })
  .meta({
    id: "DeletedTopic",
    examples: [{ object: "topic", id: TOPIC_EXAMPLE.id, deleted: true }],
  });

// ---------------------------------------------------------------------------------------------
// Marketing settings
// ---------------------------------------------------------------------------------------------

const MARKETING_SETTINGS_EXAMPLE = {
  object: "marketing_settings",
  display_name: "Acme",
  mailing_address: "Acme Inc., 548 Market St, San Francisco, CA 94104, USA",
  double_opt_in_default: true,
  confirmation_from: "Acme <news@acme.com>",
  confirmation_subject: null,
  confirmation_html: null,
  confirmation_text: null,
  confirmed_redirect_url: "https://acme.com/welcome",
} as const;

/** Where a confirmation email's link goes in customer templates. */
export const CONFIRMATION_URL_PLACEHOLDER = "{{{confirmation_url}}}";

export const MarketingSettings = z
  .object({
    object: z.literal("marketing_settings"),
    display_name: z.string().nullable().meta({
      description: "The sender's name in the preference center (default: the organization's).",
    }),
    mailing_address: z
      .string()
      .nullable()
      .meta({
        description:
          "The postal address every marketing email carries (CAN-SPAM). Marketing emails can't " +
          "be sent without one.",
      }),
    double_opt_in_default: z.boolean().meta({
      description: "Whether contacts upserted without `double_opt_in` must confirm first.",
    }),
    confirmation_from: z.string().nullable().meta({
      description: "The sender of confirmation emails (a verified domain's address for live keys).",
    }),
    confirmation_subject: z
      .string()
      .nullable()
      .meta({ description: "`null`: coss.com's default." }),
    confirmation_html: z.string().nullable().meta({
      description: "`null`: coss.com's default. Must contain `{{{confirmation_url}}}`.",
    }),
    confirmation_text: z.string().nullable().meta({
      description: "`null`: coss.com's default. Must contain `{{{confirmation_url}}}`.",
    }),
    confirmed_redirect_url: z.string().nullable().meta({
      description:
        "Where confirming sends the contact (https); `null`: a coss.com confirmation page.",
    }),
  })
  .meta({ id: "MarketingSettings", examples: [MARKETING_SETTINGS_EXAMPLE] });
export type MarketingSettingsOutput = z.output<typeof MarketingSettings>;

export const UpdateMarketingSettingsRequest = z
  .strictObject({
    display_name: z.string().trim().min(1).max(LIST_NAME_MAX_LENGTH).nullable().optional().meta({
      description: "The sender's name in the preference center. `null`: the organization's.",
    }),
    mailing_address: z
      .string()
      .trim()
      .min(1)
      .max(MAILING_ADDRESS_MAX_LENGTH)
      .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value.replaceAll("\n", "")), {
        message: "Must not contain control or invisible formatting characters.",
      })
      .nullable()
      .optional()
      .meta({
        description:
          "The postal address every marketing email carries (CAN-SPAM). Marketing emails can't be sent without one.",
      }),
    double_opt_in_default: z.boolean().optional().meta({
      description: "Whether contacts upserted without `double_opt_in` must confirm first.",
    }),
    confirmation_from: z
      .string()
      .trim()
      .superRefine((value, ctx) => {
        const problem = emailAddressProblem(value);
        if (problem) ctx.addIssue({ code: "custom", message: problem });
      })
      .nullable()
      .optional()
      .meta({
        description:
          "The sender of confirmation emails (a verified domain's address for live keys).",
      }),
    confirmation_subject: z
      .string()
      .trim()
      .min(1)
      .max(998)
      .nullable()
      .optional()
      .meta({ description: "`null`: coss.com's default." }),
    confirmation_html: z
      .string()
      .max(200_000)
      .refine((value) => value.includes(CONFIRMATION_URL_PLACEHOLDER), {
        message: `Must contain ${CONFIRMATION_URL_PLACEHOLDER}.`,
      })
      .nullable()
      .optional()
      .meta({ description: "`null`: coss.com's default. Must contain `{{{confirmation_url}}}`." }),
    confirmation_text: z
      .string()
      .max(200_000)
      .refine((value) => value.includes(CONFIRMATION_URL_PLACEHOLDER), {
        message: `Must contain ${CONFIRMATION_URL_PLACEHOLDER}.`,
      })
      .nullable()
      .optional()
      .meta({ description: "`null`: coss.com's default. Must contain `{{{confirmation_url}}}`." }),
    confirmed_redirect_url: z
      .url({ protocol: /^https$/ })
      .max(2000)
      .nullable()
      .optional(),
  })
  .meta({
    id: "UpdateMarketingSettingsRequest",
    examples: [{ mailing_address: MARKETING_SETTINGS_EXAMPLE.mailing_address }],
  });

// ---------------------------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------------------------

/** Body of a `contact.*` webhook request: who changed, never their properties or names. */
export const ContactWebhookEvent = z
  .object({
    id: z.string().meta({
      description: "The event id, and the `webhook-id` header.",
      examples: ["evt_01k7c8m4r0c2b8w9y3d5f6g7h9"],
    }),
    object: z.literal("event"),
    type: z.enum(CONTACT_EVENT_TYPES).meta({ description: "What happened to the contact." }),
    api_version: z.string().meta({
      description:
        "The API version (`Coss-Version`) this event is rendered in: the receiving endpoint's `api_version`.",
      examples: [LATEST_API_VERSION],
    }),
    created_at: Timestamp.meta({ description: "When the event was created." }),
    data: z
      .object({
        contact: z.object({
          id: z.string().meta({ description: "The contact's id." }),
          email: z.string().meta({ description: "The contact's address." }),
          status: z.enum(CONTACT_STATUSES).meta({ description: "Its consent after this event." }),
        }),
        source: z.enum(CONTACT_SOURCES).meta({ description: "How the contact was created." }),
        topic: z.string().nullable().meta({
          description:
            "`contact.unsubscribed` from one topic (its key); `null`: from marketing altogether.",
        }),
        occurred_at: Timestamp.meta({ description: "When this happened." }),
      })
      .meta({ description: "The contact, without its properties." }),
  })
  .meta({
    id: "ContactWebhookEvent",
    examples: [
      {
        id: "evt_01k7c8m4r0c2b8w9y3d5f6g7h9",
        object: "event",
        type: "contact.created",
        api_version: LATEST_API_VERSION,
        created_at: "2026-10-10T12:00:00.000Z",
        data: {
          contact: { id: CONTACT_ID_EXAMPLE, email: "ada@example.com", status: "subscribed" },
          source: "api",
          topic: null,
          occurred_at: "2026-10-10T12:00:00.000Z",
        },
      },
    ],
  });
export type ContactWebhookEventOutput = z.output<typeof ContactWebhookEvent>;
/** What the outbox stores: delivery adds `api_version` when it renders the event for an endpoint. */
export type StoredContactWebhookEvent = Omit<ContactWebhookEventOutput, "api_version">;
