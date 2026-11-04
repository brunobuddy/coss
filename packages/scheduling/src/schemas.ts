/**
 * Public wire schemas for Scheduling (snake_case). Plain zod with `.meta({ id })`, shared by the
 * public API, its OpenAPI document and the contract tests. Must not import the database (or
 * `@coss/email`): `@coss/scheduling/schemas` is safe to load anywhere.
 */
import { LATEST_API_VERSION } from "@coss/versioning";
import { z } from "zod";
import { LOGO_MAX_BYTES } from "./branding.ts";

export const SCHEDULING_BOOKING_EVENT_TYPES = [
  "scheduling.booking.created",
  "scheduling.booking.pending_approval",
  "scheduling.booking.confirmed",
  "scheduling.booking.rescheduled",
  "scheduling.booking.cancelled",
  "scheduling.booking.declined",
  "scheduling.booking.no_show",
  "scheduling.booking.external_conflict",
  "scheduling.booking.calendar_write_failed",
  "scheduling.booking.location_ready",
] as const;
export const SCHEDULING_CALENDAR_EVENT_TYPES = [
  "scheduling.calendar.connected",
  "scheduling.calendar.needs_reauth",
  "scheduling.calendar.disconnected",
] as const;
export const SCHEDULING_WEBHOOK_EVENT_TYPES = [
  ...SCHEDULING_BOOKING_EVENT_TYPES,
  ...SCHEDULING_CALENDAR_EVENT_TYPES,
] as const;
export type SchedulingWebhookEventType = (typeof SCHEDULING_WEBHOOK_EVENT_TYPES)[number];

export const MAX_SERIES_OCCURRENCES = 52;
export const MAX_SLOT_WINDOW_DAYS = 62;
export const MAX_SEARCH_HOSTS = 500;
export const MAX_GUESTS = 10;
export const HOST_CALENDAR_DETAILS = ["neutral", "full"] as const;

const Metadata = z
  .record(z.string().max(64), z.string().max(500))
  .refine((value) => Object.keys(value).length <= 25, "At most 25 keys.")
  .meta({ description: "Your own key-value pairs. Don't put sensitive data here." });

const Attributes = z
  .record(z.string().max(64), z.union([z.string().max(200), z.array(z.string().max(200)).max(50)]))
  .refine((value) => Object.keys(value).length <= 25, "At most 25 keys.")
  .meta({
    description:
      'What pools filter hosts by, such as `{ "licensed_in": ["CA", "NY"], "language": "es" }`.',
  });

const TimeZone = z
  .string()
  .min(1)
  .max(64)
  .meta({ description: "An IANA time zone name.", examples: ["America/New_York"] });

const Instant = z.string().meta({
  description: "An ISO 8601 instant with an offset.",
  examples: ["2027-01-04T15:00:00.000Z"],
});

const LocalTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, "Use HH:MM, up to 24:00.")
  .meta({ description: "A local time, `HH:MM`. `24:00` is the end of the day." });

const LocalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
  .meta({ description: "A local date in the schedule's time zone.", examples: ["2027-12-24"] });

const HostUid = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => !value.startsWith("host_"), "A uid can't start with `host_`.")
  .meta({ description: "Your own id for this host, unique in the environment." });

export const HostStatus = z.enum(["active", "disabled"]);

/** A link attendees are given to open, so never a `javascript:` or other non-web address. */
const HttpsUrl = z.url({ protocol: /^https$/, error: "Use an https:// link." }).max(2000);

export const HostLocation = z
  .discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("link").meta({ description: "A meeting link of the host's own." }),
      url: HttpsUrl.meta({ description: "The link, which must be `https`." }),
    }),
    z.strictObject({
      type: z.literal("phone").meta({ description: "A phone number of the host's own." }),
      number: z
        .string()
        .regex(/^\+[1-9]\d{6,14}$/, "Use the E.164 format, such as +12125550100.")
        .meta({ description: "The number, in E.164 format." }),
    }),
    z.strictObject({
      type: z.literal("in_person").meta({ description: "The host's own office." }),
      address: z.string().trim().min(1).max(500).meta({
        description: "The address. It can't contain a link.",
      }),
    }),
  ])
  .meta({
    id: "SchedulingHostLocation",
    description: "Where this host meets. A host has at most one of each type.",
  });
export type HostLocationOutput = z.output<typeof HostLocation>;

const HostLocations = z
  .array(HostLocation)
  .max(3)
  .refine(
    (locations) => new Set(locations.map((location) => location.type)).size === locations.length,
    "A host has at most one location of each type.",
  )
  .meta({
    description:
      "This host's own office, meeting link and phone number. An event type's location that leaves its value blank uses them.",
  });

export const CreateHostRequest = z
  .strictObject({
    uid: HostUid.optional(),
    name: z.string().min(1).max(100).meta({ description: "The host's name." }),
    email: z.email().max(320).optional().meta({
      description: "Where this host's notifications go. Not an identity, and need not be unique.",
    }),
    time_zone: TimeZone,
    attributes: Attributes.optional(),
    locations: HostLocations.optional(),
    metadata: Metadata.optional(),
  })
  .meta({
    id: "CreateHostRequest",
    examples: [
      {
        uid: "doctor_482",
        name: "Dr. Ana Reyes",
        email: "ana@example.com",
        time_zone: "America/New_York",
        attributes: { licensed_in: ["NY", "NJ"] },
        locations: [{ type: "in_person", address: "12 Main St, New York, NY" }],
      },
    ],
  });
export type CreateHostRequestOutput = z.output<typeof CreateHostRequest>;

export const UpdateHostRequest = z
  .strictObject({
    uid: HostUid.nullable().optional(),
    name: z.string().min(1).max(100).optional().meta({ description: "The host's name." }),
    email: z
      .email()
      .max(320)
      .nullable()
      .optional()
      .meta({ description: "Where this host's notifications go. `null` removes it." }),
    time_zone: TimeZone.optional(),
    attributes: Attributes.optional(),
    locations: HostLocations.optional().meta({
      description:
        "Replaces this host's own locations. Existing bookings keep the location they have.",
    }),
    metadata: Metadata.optional(),
    status: HostStatus.optional().meta({
      description: "A `disabled` host isn't offered. Its existing bookings stay.",
    }),
  })
  .meta({ id: "UpdateHostRequest", examples: [{ status: "disabled" }] });
export type UpdateHostRequestOutput = z.output<typeof UpdateHostRequest>;

/** What a host's own page sends: the whole list, which replaces what's there. */
export const UpdateHostLocationsRequest = z.strictObject({ locations: HostLocations });

const HOST_EXAMPLE = {
  object: "scheduling.host" as const,
  id: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
  uid: "doctor_482",
  name: "Dr. Ana Reyes",
  email: "ana@example.com",
  time_zone: "America/New_York",
  attributes: { licensed_in: ["NY", "NJ"] },
  locations: [{ type: "in_person" as const, address: "12 Main St, New York, NY" }],
  metadata: {},
  status: "active" as const,
  created_at: "2027-01-01T10:00:00.000Z",
  updated_at: "2027-01-01T10:00:00.000Z",
};

export const HostObject = z
  .object({
    object: z.literal("scheduling.host"),
    id: z.string(),
    uid: z.string().nullable().meta({
      description:
        "Your own id for this host, unique in the environment, accepted wherever a host id is. `null` when none is set.",
    }),
    name: z.string().meta({ description: "The host's name." }),
    email: z.string().nullable().meta({
      description:
        "Where this host's notifications go. `null` when none is set. Not an identity, and need not be unique.",
    }),
    time_zone: z.string().meta({
      description:
        "The host's IANA time zone. Their schedules default to it, and limits count days and weeks in it.",
    }),
    attributes: z
      .record(z.string(), z.union([z.string(), z.array(z.string())]))
      .meta({ description: "What pools filter hosts by, as strings or lists of strings." }),
    locations: z.array(HostLocation).meta({
      description:
        "This host's own office, meeting link and phone number. An event type's location that leaves its value blank uses them.",
    }),
    metadata: z.record(z.string(), z.string()).meta({ description: "Your own key-value pairs." }),
    status: HostStatus.meta({
      description:
        "`active`: can be offered. `disabled`: isn't offered, and keeps its existing bookings.",
    }),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .meta({ id: "SchedulingHost", examples: [HOST_EXAMPLE] });
export type HostObjectOutput = z.output<typeof HostObject>;

const listOf = <T extends z.ZodType>(item: T, id: string, example: z.output<T>) =>
  z
    .object({ object: z.literal("list"), data: z.array(item), has_more: z.boolean() })
    .meta({ id, examples: [{ object: "list", data: [example], has_more: false }] });

export const HostList = listOf(HostObject, "SchedulingHostList", HOST_EXAMPLE);

const deleted = (object: string, id: string, exampleId: string) =>
  z
    .object({ object: z.literal(object), id: z.string(), deleted: z.literal(true) })
    .meta({ id, examples: [{ object, id: exampleId, deleted: true }] });

export const DeletedHost = deleted(
  "scheduling.host",
  "DeletedSchedulingHost",
  "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
);

export const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  after: z.string().optional().meta({ description: "The last id of the previous page." }),
});

const WeeklyRule = z
  .strictObject({
    days: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .meta({ description: "Weekdays, with Sunday as 0." }),
    start: LocalTime,
    end: LocalTime,
  })
  .meta({ id: "SchedulingWeeklyRule" });

const LocalRange = z.strictObject({ start: LocalTime, end: LocalTime });

const ScheduleOverride = z
  .strictObject({
    date: LocalDate,
    ranges: z.array(LocalRange).max(10).meta({
      description: "Replaces the weekly rules that day. Empty means unavailable all day.",
    }),
  })
  .meta({ id: "SchedulingScheduleOverride" });

export const UpsertScheduleRequest = z
  .strictObject({
    name: z
      .string()
      .min(1)
      .max(100)
      .optional()
      .meta({ description: "A label for the schedule. Default on creation: `Default`." }),
    time_zone: TimeZone.optional().meta({ description: "Default: the host's." }),
    is_default: z.boolean().optional().meta({
      description:
        "`true` makes this the host's default schedule, in place of the current one. A host's first schedule is their default anyway.",
    }),
    rules: z
      .array(WeeklyRule)
      .max(50)
      .meta({ description: "Weekly hours in local time. A range can't cross midnight: use two." }),
    overrides: z.array(ScheduleOverride).max(366).optional().meta({
      description: "Replaces the schedule's overrides when given.",
    }),
  })
  .meta({
    id: "UpsertScheduleRequest",
    examples: [
      {
        name: "Clinic hours",
        rules: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }],
        overrides: [{ date: "2027-12-24", ranges: [] }],
      },
    ],
  });
export type UpsertScheduleRequestOutput = z.output<typeof UpsertScheduleRequest>;

const SCHEDULE_EXAMPLE = {
  object: "scheduling.schedule" as const,
  id: "sched_01kd2m9a0b1c2d3e4f5g6h7j8m",
  host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
  name: "Clinic hours",
  time_zone: "America/New_York",
  is_default: true,
  rules: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }],
  overrides: [{ date: "2027-12-24", ranges: [] }],
  created_at: "2027-01-01T10:00:00.000Z",
  updated_at: "2027-01-01T10:00:00.000Z",
};

export const ScheduleObject = z
  .object({
    object: z.literal("scheduling.schedule"),
    id: z.string(),
    host: z.string().meta({ description: "The id of the host this schedule belongs to." }),
    name: z
      .string()
      .meta({ description: "A label for the schedule. `Default` when none was given." }),
    time_zone: z
      .string()
      .meta({ description: "The IANA time zone its rules and overrides are local to." }),
    is_default: z.boolean().meta({
      description:
        "Whether this is the host's default schedule, used by event types that don't name one. A host's first schedule always is.",
    }),
    rules: z
      .array(
        z.object({
          days: z.array(z.number()).meta({ description: "Weekdays, with Sunday as 0." }),
          start: z.string().meta({ description: "Local start time, `HH:MM`." }),
          end: z
            .string()
            .meta({ description: "Local end time, `HH:MM`. `24:00` is the end of the day." }),
        }),
      )
      .meta({ description: "Weekly hours in local time, unchanged across daylight saving." }),
    overrides: z
      .array(
        z.object({
          date: z.string().meta({ description: "The local date, `YYYY-MM-DD`." }),
          ranges: z
            .array(
              z.object({
                start: z.string().meta({ description: "Local start time, `HH:MM`." }),
                end: z
                  .string()
                  .meta({ description: "Local end time, `HH:MM`. `24:00` is the end of the day." }),
              }),
            )
            .meta({ description: "That day's hours. Empty means unavailable all day." }),
        }),
      )
      .meta({ description: "Dates whose hours replace the weekly rules." }),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .meta({ id: "SchedulingSchedule", examples: [SCHEDULE_EXAMPLE] });
export type ScheduleObjectOutput = z.output<typeof ScheduleObject>;

export const ScheduleList = listOf(ScheduleObject, "SchedulingScheduleList", SCHEDULE_EXAMPLE);

export const DeletedSchedule = deleted(
  "scheduling.schedule",
  "DeletedSchedulingSchedule",
  "sched_01kd2m9a0b1c2d3e4f5g6h7j8m",
);

export const EVENT_TYPE_KINDS = ["one_on_one", "pool", "collective", "group"] as const;

const BookingWindow = z
  .discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("rolling"),
      days: z
        .number()
        .int()
        .min(1)
        .max(730)
        .meta({ description: "Days ahead of now that slots are offered." }),
    }),
    z.strictObject({
      kind: z.literal("range"),
      from: LocalDate.meta({ description: "The first local date offered, `YYYY-MM-DD`." }),
      to: LocalDate.meta({ description: "The last local date offered, `YYYY-MM-DD`." }),
    }),
  ])
  .meta({
    description:
      "How far ahead a slot can be booked: `rolling` for a number of days from now, or `range` for fixed dates. On an event type, `null` means no window of its own.",
    id: "SchedulingBookingWindow",
  });

const Limit = z
  .strictObject({
    period: z.enum(["day", "week"]).meta({ description: "In the host's time zone." }),
    max: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .meta({ description: "The most bookings allowed in one period." }),
    scope: z
      .enum(["event_type", "host"])
      .default("event_type")
      .meta({ description: "Count this event type's bookings, or all of the host's." }),
  })
  .meta({ description: "A cap on bookings in a day or a week.", id: "SchedulingLimit" });

const QUESTION_TYPES = [
  "text",
  "textarea",
  "select",
  "radio",
  "checkbox",
  "phone",
  "email",
  "number",
] as const;

const Question = z
  .strictObject({
    key: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,63}$/, "Use lower case letters, digits and underscores.")
      .meta({ description: "The answer's key in `answers`. Unique within the event type." }),
    type: z
      .enum(QUESTION_TYPES)
      .meta({ description: "How it's asked and which answers are valid." }),
    label: z.string().min(1).max(200).meta({ description: "The question as attendees see it." }),
    required: z.boolean().default(false).meta({ description: "Whether a booking must answer it." }),
    options: z.array(z.string().min(1).max(200)).max(50).default([]).meta({
      description:
        "The choices of a `select`, `radio` or `checkbox` question. `select` and `radio` need at least one.",
    }),
  })
  .meta({
    description:
      "Something attendees are asked when booking. Answers are encrypted, and come back only when you retrieve one booking.",
    id: "SchedulingQuestion",
  });

export const Location = z
  .discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("link"),
      url: HttpsUrl.nullable().default(null).meta({
        description:
          "The meeting link. `null` on an event type means the booking supplies its own.",
      }),
    }),
    z.strictObject({
      type: z.literal("phone"),
      number: z.string().max(32).nullable().default(null).meta({
        description:
          "The phone number to call. `null` on an event type means the booking supplies its own.",
      }),
    }),
    z.strictObject({
      type: z.literal("in_person"),
      address: z.string().max(500).nullable().default(null).meta({
        description:
          "The address to meet at. `null` on an event type means the booking supplies its own.",
      }),
    }),
    z.strictObject({ type: z.literal("google_meet") }),
    z.strictObject({ type: z.literal("microsoft_teams") }),
    z.strictObject({
      type: z.literal("zoom"),
      url: HttpsUrl.nullable().default(null).meta({
        description: "The meeting's link, once it's created on the host's Zoom account.",
      }),
    }),
  ])
  .meta({
    description:
      "Where a booking meets. `link`, `phone` and `in_person` carry their details, and on an event type, left blank, use the booked host's own if they have one; `google_meet`, `microsoft_teams` and `zoom` get a meeting made on the host's connected account.",
    id: "SchedulingLocation",
  });

const EventTypeHostInput = z
  .strictObject({
    host: z.string().meta({ description: "The host's id or uid." }),
    role: z.enum(["required", "member"]).default("member").meta({
      description: "`required` hosts must all be free; one `member` is chosen for a booking.",
    }),
    weight: z.number().int().min(1).max(10000).default(100).meta({
      description: "Share of a pool's bookings relative to other members.",
    }),
    schedule: z.string().nullable().default(null).meta({
      description: "A schedule of this host's. Default: their default schedule.",
    }),
  })
  .meta({ id: "SchedulingEventTypeHostInput" });

const eventTypeFields = {
  description: z.string().max(2000).nullable().optional().meta({
    description:
      "Plain text about the event type, shown on hosted booking pages and never in emails. Links, and anything shaped like a domain, must be on your organization's verified domains or their subdomains, and use `https`. `null` removes it.",
  }),
  title: z.string().min(1).max(120).meta({
    description:
      "Shown to attendees and in emails. Host calendars show it only with `host_calendar_details: full`.",
  }),
  duration_minutes: z
    .number()
    .int()
    .min(5)
    .max(1440)
    .meta({ description: "How long a booking lasts by default, in minutes." }),
  duration_options: z.array(z.number().int().min(5).max(1440)).max(10).optional().meta({
    description:
      "Other lengths an attendee may choose, in minutes. Empty: only `duration_minutes`.",
  }),
  step_minutes: z.number().int().min(5).max(1440).optional().meta({
    description: "How far apart slots start. Default: the duration.",
  }),
  grid_time_zone: TimeZone.nullable().optional().meta({
    description: "The zone slots align in. Default: each host's own.",
  }),
  buffer_before_minutes: z
    .number()
    .int()
    .min(0)
    .max(480)
    .optional()
    .meta({ description: "Minutes kept free before each booking. Default: 0." }),
  buffer_after_minutes: z
    .number()
    .int()
    .min(0)
    .max(480)
    .optional()
    .meta({ description: "Minutes kept free after each booking. Default: 0." }),
  min_notice_minutes: z.number().int().min(0).max(525600).optional().meta({
    description:
      "Slots starting sooner than this many minutes from now aren't offered. Default: 0.",
  }),
  booking_window: BookingWindow.nullable().optional(),
  limits: z
    .array(Limit)
    .max(4)
    .optional()
    .meta({ description: "Caps on bookings per day or week. Default: none." }),
  capacity: z.number().int().min(2).max(10000).nullable().optional().meta({
    description: "Attendees per session. Required for, and only allowed on, `group`.",
  }),
  requires_approval: z.boolean().optional().meta({
    description:
      "Bookings start as `pending_approval`, holding the time until approved or declined. Default: `false`.",
  }),
  approval_ttl_minutes: z.number().int().min(5).max(43200).optional().meta({
    description:
      "How long a booking can wait for approval before it's declined, in minutes. Default: 1440.",
  }),
  hold_ttl_seconds: z
    .number()
    .int()
    .min(60)
    .max(86400)
    .optional()
    .meta({ description: "How long a hold keeps its slot, in seconds. Default: 600." }),
  cancel_notice_minutes: z.number().int().min(0).max(525600).optional().meta({
    description: "Attendees can't cancel closer to the start than this. API keys can.",
  }),
  reschedule_notice_minutes: z.number().int().min(0).max(525600).optional().meta({
    description:
      "Attendees can't reschedule closer to the start than this. API keys can. Default: 0.",
  }),
  max_guests: z.number().int().min(0).max(MAX_GUESTS).optional().meta({
    description:
      "How many people an attendee can add to a booking. Default: 0. Guests are emailed about it. Not on `group`.",
  }),
  max_active_bookings_per_attendee: z.number().int().min(1).max(1000).nullable().optional().meta({
    description:
      "How many upcoming bookings of this event type one person can have at a time, known by `uid` or email. Default: `null`, no limit. Past this, booking answers `attendee_limit_reached`. Guests don't count, and each occurrence of a series does.",
  }),
  host_calendar_details: z.enum(HOST_CALENDAR_DETAILS).optional().meta({
    description:
      "What hosts' calendars say about a booking. `neutral` (the default): a private event titled \"Appointment\". `full`: a private event with this title and the attendee's name, plus names, emails and phone numbers in its description, which go to the host's calendar provider. Never answers. Refused in HIPAA mode.",
  }),
  questions: z
    .array(Question)
    .max(25)
    .optional()
    .meta({ description: "What attendees are asked when booking. Keys must be unique." }),
  locations: z.array(Location).max(10).optional().meta({
    description:
      "Where bookings can meet. A browser only chooses among these. A `group` event type can't use `zoom`.",
  }),
  host_filter: Attributes.nullable().optional().meta({
    description: "Pool members also include active hosts matching all of these attributes.",
  }),
  metadata: Metadata.optional().meta({ description: "Your own key-value pairs." }),
};

export const CreateEventTypeRequest = z
  .strictObject({
    uid: z.string().min(1).max(255).optional().meta({
      description:
        "Your own id for this event type, unique in the environment, accepted wherever its id is.",
    }),
    kind: z.enum(EVENT_TYPE_KINDS).default("one_on_one").meta({
      description:
        "Who a booking needs. `one_on_one`: one host. `pool`: any one of its hosts. `collective`: every `required` host, plus at most one `member`. `group`: one host, with attendees taking seats up to `capacity`. Fixed once created.",
    }),
    ...eventTypeFields,
    hosts: z.array(EventTypeHostInput).max(MAX_SEARCH_HOSTS).default([]).meta({
      description:
        "Who can be booked. `one_on_one` and `group` take one; `collective` needs at least one `required` host.",
    }),
  })
  .meta({
    id: "CreateEventTypeRequest",
    examples: [
      {
        title: "Initial consultation",
        kind: "one_on_one",
        duration_minutes: 30,
        buffer_after_minutes: 10,
        min_notice_minutes: 120,
        hosts: [{ host: "doctor_482" }],
      },
    ],
  });
export type CreateEventTypeRequestOutput = z.output<typeof CreateEventTypeRequest>;

export const UpdateEventTypeRequest = z
  .strictObject({
    uid: z
      .string()
      .min(1)
      .max(255)
      .nullable()
      .optional()
      .meta({ description: "Your own id for this event type. `null` removes it." }),
    ...eventTypeFields,
    title: eventTypeFields.title.optional(),
    duration_minutes: eventTypeFields.duration_minutes.optional(),
    status: z
      .enum(["active", "archived"])
      .optional()
      .meta({ description: "`archived` stops new bookings, and keeps existing ones." }),
    hosts: z.array(EventTypeHostInput).max(MAX_SEARCH_HOSTS).optional().meta({
      description: "Replaces the assigned hosts. Removed hosts keep their existing bookings.",
    }),
  })
  .meta({ id: "UpdateEventTypeRequest", examples: [{ min_notice_minutes: 240 }] });
export type UpdateEventTypeRequestOutput = z.output<typeof UpdateEventTypeRequest>;

const EVENT_TYPE_EXAMPLE = {
  object: "scheduling.event_type" as const,
  id: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
  uid: null,
  title: "Initial consultation",
  description: null,
  kind: "one_on_one" as const,
  status: "active" as const,
  duration_minutes: 30,
  duration_options: [],
  step_minutes: 30,
  grid_time_zone: null,
  buffer_before_minutes: 0,
  buffer_after_minutes: 10,
  min_notice_minutes: 120,
  booking_window: null,
  limits: [],
  capacity: null,
  requires_approval: false,
  approval_ttl_minutes: 1440,
  hold_ttl_seconds: 600,
  cancel_notice_minutes: 0,
  reschedule_notice_minutes: 0,
  max_guests: 0,
  max_active_bookings_per_attendee: null,
  host_calendar_details: "neutral" as const,
  questions: [],
  locations: [],
  host_filter: null,
  hosts: [
    {
      host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
      role: "member" as const,
      weight: 100,
      schedule: null,
    },
  ],
  metadata: {},
  created_at: "2027-01-01T10:00:00.000Z",
  updated_at: "2027-01-01T10:00:00.000Z",
};

export const EventTypeObject = z
  .object({
    object: z.literal("scheduling.event_type"),
    id: z.string(),
    uid: z.string().nullable().meta({
      description:
        "Your own id for this event type, accepted wherever its id is. `null` when none is set.",
    }),
    description: z.string().nullable().meta({
      description: "Plain text shown on hosted booking pages. `null` when there's none.",
    }),
    title: z.string().meta({
      description:
        "Shown to attendees and in emails. Host calendars show it only with `host_calendar_details: full`.",
    }),
    kind: z.enum(EVENT_TYPE_KINDS).meta({
      description:
        "Who a booking needs. `one_on_one`: one host. `pool`: any one of its hosts. `collective`: every `required` host, plus at most one `member`. `group`: one host, with attendees taking seats up to `capacity`.",
    }),
    status: z.enum(["active", "archived"]).meta({
      description:
        "`active`: can be booked. `archived`: new bookings answer `not_found`; existing ones stay.",
    }),
    duration_minutes: z
      .number()
      .meta({ description: "How long a booking lasts by default, in minutes." }),
    duration_options: z.array(z.number()).meta({
      description:
        "Other lengths an attendee may choose, in minutes. Empty: only `duration_minutes`.",
    }),
    step_minutes: z.number().meta({ description: "How far apart slots start, in minutes." }),
    grid_time_zone: z
      .string()
      .nullable()
      .meta({ description: "The zone slots align in. `null`: each host's own." }),
    buffer_before_minutes: z
      .number()
      .meta({ description: "Minutes kept free before each booking." }),
    buffer_after_minutes: z.number().meta({ description: "Minutes kept free after each booking." }),
    min_notice_minutes: z.number().meta({
      description: "Slots starting sooner than this many minutes from now aren't offered.",
    }),
    booking_window: BookingWindow.nullable(),
    limits: z.array(Limit).meta({ description: "Caps on bookings per day or week." }),
    capacity: z.number().nullable().meta({
      description: "Attendees per session of a `group` event type. `null` for every other kind.",
    }),
    requires_approval: z.boolean().meta({
      description:
        "Whether bookings start as `pending_approval`, holding the time until approved or declined.",
    }),
    approval_ttl_minutes: z.number().meta({
      description: "How long a booking can wait for approval before it's declined, in minutes.",
    }),
    hold_ttl_seconds: z
      .number()
      .meta({ description: "How long a hold keeps its slot, in seconds." }),
    cancel_notice_minutes: z
      .number()
      .meta({ description: "Attendees can't cancel closer to the start than this. API keys can." }),
    reschedule_notice_minutes: z.number().meta({
      description: "Attendees can't reschedule closer to the start than this. API keys can.",
    }),
    max_guests: z.number().meta({
      description: "How many people an attendee can add to a booking. Not on `group`.",
    }),
    max_active_bookings_per_attendee: z.number().nullable().meta({
      description:
        "How many upcoming bookings of this event type one person can have at a time. `null`: no limit.",
    }),
    host_calendar_details: z.enum(HOST_CALENDAR_DETAILS).meta({
      description:
        "What hosts' calendars say about a booking. `neutral`: a private event titled \"Appointment\". `full`: a private event with this title and the attendee's and guests' details.",
    }),
    questions: z.array(Question).meta({ description: "What attendees are asked when booking." }),
    locations: z
      .array(Location)
      .meta({ description: "Where bookings can meet. A browser only chooses among these." }),
    host_filter: z
      .record(z.string(), z.union([z.string(), z.array(z.string())]))
      .nullable()
      .meta({
        description:
          "Pool members also include active hosts matching all of these attributes. `null`: only `hosts`.",
      }),
    hosts: z
      .array(
        z.object({
          host: z.string().meta({ description: "The host's id." }),
          role: z.enum(["required", "member"]).meta({
            description: "`required` hosts must all be free; one `member` is chosen for a booking.",
          }),
          weight: z
            .number()
            .meta({ description: "Share of a pool's bookings relative to other members." }),
          schedule: z.string().nullable().meta({
            description:
              "The id of the schedule used for this event type. `null`: the host's default schedule.",
          }),
        }),
      )
      .meta({ description: "The hosts assigned by name." }),
    metadata: z.record(z.string(), z.string()).meta({ description: "Your own key-value pairs." }),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .meta({ id: "SchedulingEventType", examples: [EVENT_TYPE_EXAMPLE] });
export type EventTypeObjectOutput = z.output<typeof EventTypeObject>;

export const EventTypeList = listOf(EventTypeObject, "SchedulingEventTypeList", EVENT_TYPE_EXAMPLE);

export const SlotsQuery = z.object({
  start: Instant,
  end: Instant,
  host: z.string().optional().meta({ description: "Only this host's slots (id or uid)." }),
  duration_minutes: z.coerce.number().int().min(5).max(1440).optional(),
  attributes: z.string().optional().meta({
    description: 'A JSON object narrowing a pool, such as `{"licensed_in":"CA"}`.',
  }),
});

const Slot = z
  .object({
    start: z.string().meta({ description: "When the slot starts." }),
    end: z.string().meta({ description: "When the slot ends." }),
    hosts: z.array(z.string()).meta({ description: "Who could take it." }),
  })
  .meta({ id: "SchedulingSlot" });

export const SlotList = z
  .object({ object: z.literal("list"), data: z.array(Slot), has_more: z.literal(false) })
  .meta({
    id: "SchedulingSlotList",
    examples: [
      {
        object: "list",
        data: [
          {
            start: "2027-01-04T15:00:00.000Z",
            end: "2027-01-04T15:30:00.000Z",
            hosts: ["host_01kd2m9a0b1c2d3e4f5g6h7j8m"],
          },
        ],
        has_more: false,
      },
    ],
  });

export const AvailabilitySearchRequest = z
  .strictObject({
    event_type: z.string().meta({ description: "The event type's id or uid." }),
    start: Instant,
    end: Instant,
    attributes: Attributes.optional().meta({
      description: "Only hosts matching all of these.",
    }),
    hosts: z.array(z.string()).max(MAX_SEARCH_HOSTS).optional().meta({
      description: "Only these hosts (ids or uids). Default: everyone the event type could offer.",
    }),
    slots_per_host: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(3)
      .meta({ description: "How many of each host's soonest slots to return." }),
    limit: z.number().int().min(1).max(MAX_SEARCH_HOSTS).default(50).meta({
      description: "Hosts to return, soonest availability first.",
    }),
  })
  .meta({
    id: "AvailabilitySearchRequest",
    examples: [
      {
        event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
        start: "2027-01-04T00:00:00.000Z",
        end: "2027-01-18T00:00:00.000Z",
        attributes: { licensed_in: "CA" },
      },
    ],
  });
export type AvailabilitySearchRequestOutput = z.output<typeof AvailabilitySearchRequest>;

export const AvailabilitySearchResult = z
  .object({
    object: z.literal("list"),
    data: z
      .array(
        z.object({
          host: z.string().meta({ description: "The host's id." }),
          uid: z
            .string()
            .nullable()
            .meta({ description: "The host's own uid. `null` when none is set." }),
          slots: z
            .array(
              z.object({
                start: z.string().meta({ description: "When the slot starts." }),
                end: z.string().meta({ description: "When the slot ends." }),
              }),
            )
            .meta({ description: "The host's soonest slots." }),
        }),
      )
      .meta({ description: "Each host with availability, soonest first." }),
    has_more: z
      .boolean()
      .meta({ description: "Whether more hosts matched than `limit` returned." }),
  })
  .meta({
    id: "SchedulingAvailabilitySearchResult",
    examples: [
      {
        object: "list",
        data: [
          {
            host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
            uid: "doctor_482",
            slots: [{ start: "2027-01-04T15:00:00.000Z", end: "2027-01-04T15:30:00.000Z" }],
          },
        ],
        has_more: false,
      },
    ],
  });

export const BOOKING_STATUSES = [
  "held",
  "pending_approval",
  "confirmed",
  "cancelled",
  "declined",
] as const;

const AttendeeInput = z
  .strictObject({
    uid: z.string().min(1).max(255).optional().meta({
      description: "Your own id for this person, used to erase their data later.",
    }),
    name: z
      .string()
      .min(1)
      .max(100)
      .optional()
      .meta({ description: "Needed for coss.com to notify them. Can't contain a link." }),
    email: z
      .email()
      .max(320)
      .optional()
      .meta({ description: "Where coss.com emails them, if it does." }),
    phone: z
      .string()
      .regex(/^\+[1-9]\d{6,14}$/, "Use E.164.")
      .optional()
      .meta({ description: "An E.164 number, for SMS reminders." }),
    time_zone: TimeZone.meta({
      description: "Their IANA time zone. A series keeps their local time across clock changes.",
    }),
    locale: z
      .string()
      .min(2)
      .max(35)
      .optional()
      .meta({ description: "Their locale, such as `en-US`." }),
  })
  .meta({
    id: "SchedulingAttendeeInput",
    description: "Name and email are only needed if coss.com notifies this attendee.",
  });
export type AttendeeInputOutput = z.output<typeof AttendeeInput>;

const GuestInput = z
  .strictObject({
    email: z.email().max(320).meta({ description: "Where they're emailed about the booking." }),
    name: z
      .string()
      .min(1)
      .max(100)
      .optional()
      .meta({ description: "Their name, if you have it." }),
  })
  .meta({
    id: "SchedulingGuestInput",
    description:
      "Someone else coming along. They're emailed about the booking, with no manage link.",
  });
export type GuestInputOutput = z.output<typeof GuestInput>;

const Answers = z
  .record(z.string().max(64), z.union([z.string().max(5000), z.array(z.string().max(500)).max(50)]))
  .meta({
    description:
      "Answers to the event type's questions. Stored encrypted, and returned only by retrieving the booking.",
  });

const bookingFields = {
  event_type: z.string().meta({ description: "The event type's id or uid." }),
  start: Instant,
  host: z.string().optional().meta({
    description: "A specific host (id or uid). Default: chosen fairly from those free.",
  }),
  attributes: Attributes.optional().meta({
    description: "Only choose among pool hosts matching all of these.",
  }),
  duration_minutes: z.number().int().min(5).max(1440).optional().meta({
    description: "One of the event type's `duration_options`.",
  }),
  attendee: AttendeeInput,
  guests: z.array(GuestInput).max(MAX_GUESTS).optional().meta({
    description: "Up to the event type's `max_guests`.",
  }),
  answers: Answers.optional(),
  location: Location.optional().meta({
    description: "One of the event type's `locations`, with your link filled in if it has none.",
  }),
  metadata: Metadata.optional(),
};

export const CreateBookingRequest = z.strictObject(bookingFields).meta({
  id: "CreateBookingRequest",
  examples: [
    {
      event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
      start: "2027-01-04T15:00:00.000Z",
      attendee: { uid: "patient_77", name: "Sam Lee", email: "sam@example.com", time_zone: "UTC" },
    },
  ],
});
export type CreateBookingRequestOutput = z.output<typeof CreateBookingRequest>;

export const CreateHoldRequest = z.strictObject(bookingFields).meta({
  id: "CreateHoldRequest",
  examples: [
    {
      event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
      start: "2027-01-04T15:00:00.000Z",
      attendee: { uid: "patient_77", time_zone: "UTC" },
    },
  ],
});

export const ConfirmHoldRequest = z
  .strictObject({
    if_still_free: z.boolean().default(false).meta({
      description:
        "After the hold expired, book anyway if nobody else took the slot. Default: refuse with `hold_expired`.",
    }),
  })
  .meta({ id: "ConfirmHoldRequest", examples: [{ if_still_free: true }] });

export const RescheduleBookingRequest = z
  .strictObject({
    start: Instant.meta({
      description: "The new start. The old time stays booked unless this one's free.",
    }),
    host: z.string().optional().meta({
      description: "Move a pool booking to this host. Default: its current hosts.",
    }),
  })
  .meta({ id: "RescheduleBookingRequest", examples: [{ start: "2027-01-05T15:00:00.000Z" }] });

export const UpdateBookingLocationRequest = z.strictObject({ location: Location }).meta({
  id: "UpdateBookingLocationRequest",
  examples: [{ location: { type: "link", url: "https://meet.example.com/abc" } }],
});

export const CreateSeriesRequest = z
  .strictObject({
    ...bookingFields,
    recurrence: z
      .strictObject({
        frequency: z.enum(["weekly", "monthly"]).meta({ description: "Repeat weekly or monthly." }),
        interval: z
          .number()
          .int()
          .min(1)
          .max(12)
          .default(1)
          .meta({ description: "Every this many weeks or months. Default: 1." }),
        count: z
          .number()
          .int()
          .min(2)
          .max(MAX_SERIES_OCCURRENCES)
          .meta({ description: "Occurrences in total, the first included." }),
      })
      .meta({ description: "How often the booking repeats, at the attendee's local time." }),
    on_conflict: z.enum(["reject", "skip"]).default("reject").meta({
      description: "If an occurrence isn't free: book nothing, or book the rest and report it.",
    }),
  })
  .meta({
    id: "CreateSeriesRequest",
    examples: [
      {
        event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
        start: "2027-01-04T15:00:00.000Z",
        attendee: { uid: "patient_77", time_zone: "America/New_York" },
        recurrence: { frequency: "weekly", interval: 1, count: 12 },
      },
    ],
  });
export type CreateSeriesRequestOutput = z.output<typeof CreateSeriesRequest>;

export const CancelSeriesRequest = z
  .strictObject({
    from_index: z.number().int().min(0).default(0).meta({
      description: "Cancel this occurrence and those after it. Default: all of them.",
    }),
  })
  .meta({ id: "CancelSeriesRequest", examples: [{ from_index: 4 }] });

const LOGO_MAX_BASE64 = Math.ceil(LOGO_MAX_BYTES / 3) * 4;

const SettingsLogo = z
  .object({
    content_type: z
      .enum(["image/png", "image/jpeg"])
      .meta({ description: "The image's type, checked from its bytes." }),
    width: z.number().int().meta({ description: "Width in pixels." }),
    height: z.number().int().meta({ description: "Height in pixels." }),
    data_url: z.string().meta({ description: "The image, as a `data:` URL." }),
  })
  .meta({ id: "SchedulingLogo" });

export const SettingsObject = z
  .object({
    object: z.literal("scheduling.settings"),
    allowed_origins: z.array(z.string()).meta({
      description: "Sites allowed to embed coss.com's hosted pages and call the client API.",
    }),
    brand_name: z.string().nullable().meta({
      description:
        "Your name on hosted pages and on emails sent from `email_from`. `null`: none set.",
    }),
    accent_color: z.string().nullable().meta({
      description:
        "The accent color of hosted pages and emails sent from `email_from`, as `#RRGGBB`. `null`: the default.",
    }),
    logo: SettingsLogo.nullable().meta({
      description: "At the top of the hosted pages, and of emails sent from `email_from`.",
    }),
    email_from: z.string().nullable().meta({
      description: "Sender of booking emails, on a verified domain.",
    }),
    sms_from: z.string().nullable().meta({
      description: "Your approved number for SMS reminders. Without one, no SMS is sent.",
    }),
    calendar_failure_mode: z.enum(["hide", "last_known"]).meta({
      description:
        "When a host's calendar can't be read: `hide` stops offering them, `last_known` keeps offering their last known times.",
    }),
    notifications: z
      .record(
        z.string(),
        z.object({
          email_attendee: z
            .boolean()
            .optional()
            .meta({ description: "Email the attendee about this event." }),
          email_host: z
            .boolean()
            .optional()
            .meta({ description: "Email the host about this event." }),
          sms_attendee: z
            .boolean()
            .optional()
            .meta({ description: "Text the attendee about this event, if `sms_from` is set." }),
        }),
      )
      .nullable()
      .meta({ description: "Per event, overriding the defaults." }),
  })
  .meta({
    id: "SchedulingSettings",
    examples: [
      {
        object: "scheduling.settings",
        allowed_origins: ["https://app.example.com"],
        brand_name: "Acme Health",
        accent_color: null,
        logo: null,
        email_from: "appointments@example.com",
        sms_from: null,
        calendar_failure_mode: "hide",
        notifications: { reminder: { sms_attendee: true } },
      },
    ],
  });
export type SettingsObjectOutput = z.output<typeof SettingsObject>;

export const UpdateSettingsRequest = z
  .strictObject({
    allowed_origins: z.array(z.string().max(200)).max(10).optional().meta({
      description:
        "Sites allowed to embed coss.com's hosted pages and call the client API, as `https://host` origins.",
    }),
    brand_name: z.string().min(1).max(100).nullable().optional().meta({
      description:
        "Your name on hosted pages and on emails sent from `email_from`. `null` removes it.",
    }),
    accent_color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Use #RRGGBB.")
      .nullable()
      .optional()
      .meta({ description: "The accent color as `#RRGGBB`. `null` restores the default." }),
    logo: z
      .strictObject({
        content: z
          .base64()
          .max(LOGO_MAX_BASE64, "A logo can be 200 KB at most.")
          .meta({ description: "A PNG or JPEG's bytes, base64-encoded. 200 KB at most." }),
      })
      .nullable()
      .optional()
      .meta({ description: "Your logo, a PNG or JPEG. `null` removes it." }),
    email_from: z.email().max(320).nullable().optional().meta({
      description:
        "Sender of booking emails, on a verified domain. `null`: coss.com's own address.",
    }),
    sms_from: z
      .string()
      .regex(/^\+[1-9]\d{6,14}$/, "Use E.164.")
      .nullable()
      .optional()
      .meta({
        description: "Your approved number for SMS reminders, in E.164. `null`: no SMS is sent.",
      }),
    calendar_failure_mode: z.enum(["hide", "last_known"]).optional().meta({
      description:
        "When a host's calendar can't be read: `hide` stops offering them, `last_known` keeps offering their last known times.",
    }),
    notifications: z
      .record(
        z.string().max(64),
        z.strictObject({
          email_attendee: z
            .boolean()
            .optional()
            .meta({ description: "Email the attendee about this event." }),
          email_host: z
            .boolean()
            .optional()
            .meta({ description: "Email the host about this event." }),
          sms_attendee: z
            .boolean()
            .optional()
            .meta({ description: "Text the attendee about this event, if `sms_from` is set." }),
        }),
      )
      .nullable()
      .optional()
      .meta({
        description:
          "Per event (`confirmed`, `pending_approval`, `rescheduled`, `cancelled`, `declined`, `reminder`), overriding the defaults. `null` restores them.",
      }),
  })
  .meta({ id: "UpdateSchedulingSettingsRequest", examples: [{ brand_name: "Acme Health" }] });
export type UpdateSettingsRequestOutput = z.output<typeof UpdateSettingsRequest>;

export const ErasedAttendee = z
  .object({
    object: z.literal("scheduling.attendee_erasure"),
    uid: z.string().meta({ description: "The attendee's uid." }),
    erased: z
      .number()
      .meta({ description: "How many attendee records were erased, one per booking." }),
  })
  .meta({
    id: "SchedulingAttendeeErasure",
    examples: [{ object: "scheduling.attendee_erasure", uid: "patient_77", erased: 3 }],
  });

export const EraseAttendeeByEmailRequest = z
  .strictObject({
    email: z
      .email()
      .max(320)
      .meta({ description: "The address to forget, an attendee's or a guest's." }),
  })
  .meta({
    id: "EraseSchedulingAttendeeByEmailRequest",
    examples: [{ email: "sam@example.com" }],
  });

export const ErasedAttendeeByEmail = z
  .object({
    object: z.literal("scheduling.attendee_erasure"),
    erased: z.number().meta({ description: "How many attendee and guest records were erased." }),
  })
  .meta({
    id: "SchedulingAttendeeErasureByEmail",
    examples: [{ object: "scheduling.attendee_erasure", erased: 3 }],
  });

const BookingAttendee = z.object({
  id: z.string(),
  role: z.enum(["attendee", "guest"]).meta({
    description: "`attendee` booked it and comes first; a `guest` was added by them.",
  }),
  uid: z
    .string()
    .nullable()
    .meta({ description: "Your own id for this person. `null` when none was given." }),
  name: z
    .string()
    .nullable()
    .meta({ description: "`null` when not given, or after their details are erased." }),
  email: z
    .string()
    .nullable()
    .meta({ description: "`null` when not given, or after their details are erased." }),
  phone: z
    .string()
    .nullable()
    .meta({ description: "`null` when not given, or after their details are erased." }),
  time_zone: z.string().meta({ description: "Their IANA time zone." }),
  locale: z.string().nullable().meta({ description: "Their locale. `null` when not given." }),
  answers: z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .optional()
    .meta({ description: "Only when retrieving one booking." }),
});

const BOOKING_ACTOR_KINDS = [
  "api_key",
  "user",
  "host_session",
  "booker_session",
  "manage_session",
  "system",
] as const;

const BOOKING_EXAMPLE = {
  object: "scheduling.booking" as const,
  id: "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
  event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
  status: "confirmed" as const,
  title: "Initial consultation",
  start: "2027-01-04T15:00:00.000Z",
  end: "2027-01-04T15:30:00.000Z",
  hosts: ["host_01kd2m9a0b1c2d3e4f5g6h7j8m"],
  attendees: [
    {
      id: "attn_01kd2m9a0b1c2d3e4f5g6h7j8m",
      role: "attendee" as const,
      uid: "patient_77",
      name: "Sam Lee",
      email: "sam@example.com",
      phone: null,
      time_zone: "UTC",
      locale: null,
    },
  ],
  location: null,
  hold_expires_at: null,
  approval_expires_at: null,
  series: null,
  series_index: null,
  group_session: null,
  calendar_unverified: false,
  external_conflict_at: null,
  no_show_at: null,
  cancelled_at: null,
  cancelled_by: null,
  metadata: {},
  created_at: "2027-01-01T10:00:00.000Z",
  updated_at: "2027-01-01T10:00:00.000Z",
};

export const BookingObject = z
  .object({
    object: z.literal("scheduling.booking"),
    id: z.string(),
    event_type: z.string().meta({ description: "The id of the booked event type." }),
    status: z.enum(BOOKING_STATUSES).meta({
      description:
        "`held`: a hold keeping the slot until `hold_expires_at`, uncharged and known to nobody. `pending_approval`: holds the time until approved, declined or `approval_expires_at`. `confirmed`: booked. `cancelled`: cancelled, or a hold released or expired. `declined`: refused, or its approval deadline passed.",
    }),
    title: z.string().meta({ description: "The event type's title when this was booked." }),
    start: z.string().meta({ description: "When the booking starts." }),
    end: z.string().meta({ description: "When the booking ends, without buffers." }),
    hosts: z.array(z.string()).meta({ description: "The ids of the hosts taking it." }),
    attendees: z.array(BookingAttendee).meta({
      description:
        "Who's booked: the attendee first, then any guests they added. A group session's seat is its own booking.",
    }),
    location: Location.nullable(),
    hold_expires_at: z
      .string()
      .nullable()
      .meta({ description: "When a `held` booking gives up its slot. `null` otherwise." }),
    approval_expires_at: z.string().nullable().meta({
      description:
        "When a `pending_approval` booking is declined if nobody decides. `null` otherwise.",
    }),
    series: z
      .string()
      .nullable()
      .meta({ description: "The id of the series it belongs to. `null`: not part of one." }),
    series_index: z
      .number()
      .nullable()
      .meta({ description: "Its place in the series, from 0. `null`: not part of one." }),
    group_session: z
      .string()
      .nullable()
      .meta({ description: "The id of the group session whose seat this is. `null`: not a seat." }),
    calendar_unverified: z.boolean().meta({
      description:
        "Reserved for flagging a booking made on last known calendar data. Nothing sets it yet, so it's always `false`.",
    }),
    external_conflict_at: z.string().nullable().meta({
      description:
        "When something else landed on this time in the host's calendar, or the host changed the event. The booking stands. `null`: no conflict known.",
    }),
    no_show_at: z
      .string()
      .nullable()
      .meta({ description: "When the attendee was marked as a no-show. `null`: not marked." }),
    cancelled_at: z
      .string()
      .nullable()
      .meta({ description: "When it was cancelled. `null`: not cancelled." }),
    cancelled_by: z.enum(BOOKING_ACTOR_KINDS).nullable().meta({
      description:
        "Who cancelled it: `api_key`, `user` (the dashboard), `host_session`, `booker_session`, `manage_session` (the attendee's link) or `system`. `null`: not cancelled, or cancelled before this was recorded.",
    }),
    cancellation_reason: z.string().nullable().optional().meta({
      description:
        "Why, if they said. Only when retrieving one booking. It's erased with the attendee's details, and it's never in webhooks, logs or emails.",
    }),
    metadata: z.record(z.string(), z.string()).meta({ description: "Your own key-value pairs." }),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .meta({ id: "SchedulingBooking", examples: [BOOKING_EXAMPLE] });
export type BookingObjectOutput = z.output<typeof BookingObject>;

export const BookingList = listOf(BookingObject, "SchedulingBookingList", BOOKING_EXAMPLE);

export const CancelBookingRequest = z
  .strictObject({
    reason: z.string().trim().min(1).max(500).optional().meta({
      description:
        "Why it's being cancelled. Only retrieving this booking returns it: it's never in webhooks, logs or emails.",
    }),
  })
  .meta({ id: "CancelSchedulingBookingRequest", examples: [{ reason: "Feeling better" }] });

export const BookingEventObject = z
  .object({
    object: z.literal("scheduling.booking_event"),
    id: z.string(),
    sequence: z.number().meta({ description: "This booking's events count up from 1." }),
    type: z.string().meta({
      description:
        "What happened, such as `scheduling.booking.confirmed`, `scheduling.booking.rescheduled` or `scheduling.booking.cancelled`.",
    }),
    actor: z
      .object({
        kind: z.enum(BOOKING_ACTOR_KINDS),
        id: z.string().nullable().meta({
          description: "The API key, user or session's id. `null` for `system`.",
        }),
      })
      .meta({ description: "Who did it." }),
    details: z.record(z.string(), z.unknown()).meta({
      description: "More about it, such as `previous_start` on a reschedule. Never personal data.",
    }),
    occurred_at: z.string().meta({ description: "When it happened." }),
  })
  .meta({ id: "SchedulingBookingEvent" });
export type BookingEventObjectOutput = z.output<typeof BookingEventObject>;

export const BookingEventList = listOf(BookingEventObject, "SchedulingBookingEventList", {
  object: "scheduling.booking_event",
  id: "bevt_01kd2m9a0b1c2d3e4f5g6h7j8m",
  sequence: 1,
  type: "scheduling.booking.confirmed",
  actor: { kind: "api_key", id: "key_01kd2m9a0b1c2d3e4f5g6h7j8m" },
  details: {},
  occurred_at: "2027-01-02T09:00:00.000Z",
});

export const ListBookingEventsQuery = PageQuery;

export const ListBookingsQuery = PageQuery.extend({
  host: z.string().optional(),
  event_type: z.string().optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
  attendee_uid: z.string().optional(),
  start_after: Instant.optional(),
  start_before: Instant.optional(),
});

/** What a webhook carries: ids, times and statuses, never a person's details or answers. */
export const SchedulingBookingWebhookData = z
  .object({
    booking_id: z.string().meta({ description: "The booking's id." }),
    event_type_id: z.string().meta({ description: "The booked event type's id." }),
    status: z
      .enum(BOOKING_STATUSES)
      .meta({ description: "The booking's status after this event." }),
    start: z.string().meta({ description: "When the booking starts." }),
    end: z.string().meta({ description: "When the booking ends." }),
    host_ids: z.array(z.string()).meta({ description: "The ids of the hosts taking it." }),
    attendee_uids: z.array(z.string()).meta({ description: "Your uids of its attendees." }),
    series_id: z
      .string()
      .nullable()
      .meta({ description: "The id of its series. `null`: not part of one." }),
    previous_start: z
      .string()
      .optional()
      .meta({ description: "`scheduling.booking.rescheduled`: when it used to start." }),
    occurred_at: z.string().meta({ description: "When this happened." }),
  })
  .meta({
    id: "SchedulingBookingWebhookData",
    description:
      "Ids, times and statuses only. Retrieve the booking for anything about the person.",
  });

const webhookEnvelope = {
  id: z.string().meta({ description: "The event id." }),
  object: z.literal("event"),
  api_version: z
    .string()
    .meta({ description: "The API version this payload is rendered in: the endpoint's." }),
  created_at: z.iso.datetime().meta({ description: "When the event was created." }),
};

export const SchedulingBookingWebhookEvent = z
  .object({
    ...webhookEnvelope,
    type: z
      .enum(SCHEDULING_BOOKING_EVENT_TYPES)
      .meta({ description: "What happened to the booking." }),
    data: SchedulingBookingWebhookData,
  })
  .meta({
    id: "SchedulingBookingWebhookEvent",
    examples: [
      {
        id: "evt_01kd2m9a0b1c2d3e4f5g6h7j8m",
        object: "event",
        type: "scheduling.booking.confirmed",
        api_version: LATEST_API_VERSION,
        created_at: "2027-01-01T10:00:00.000Z",
        data: {
          booking_id: "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
          event_type_id: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
          status: "confirmed",
          start: "2027-01-04T15:00:00.000Z",
          end: "2027-01-04T15:30:00.000Z",
          host_ids: ["host_01kd2m9a0b1c2d3e4f5g6h7j8m"],
          attendee_uids: ["patient_77"],
          series_id: null,
          occurred_at: "2027-01-01T10:00:00.000Z",
        },
      },
    ],
  });
export type StoredSchedulingBookingWebhookEvent = Omit<
  z.output<typeof SchedulingBookingWebhookEvent>,
  "api_version"
>;
export type StoredSchedulingCalendarWebhookEvent = Omit<
  z.output<typeof SchedulingCalendarWebhookEvent>,
  "api_version"
>;

export const SchedulingCalendarWebhookEvent = z
  .object({
    ...webhookEnvelope,
    type: z.enum(SCHEDULING_CALENDAR_EVENT_TYPES).meta({
      description:
        "`connected`: a calendar account was connected. `needs_reauth`: access was lost, and the host isn't offered until it's back. `disconnected`: the connection was removed.",
    }),
    data: z
      .object({
        host_id: z.string().meta({ description: "The host's id." }),
        connection_id: z.string().meta({ description: "The calendar connection's id." }),
        provider: z.string().meta({ description: "The calendar provider, such as `google`." }),
        occurred_at: z.string().meta({ description: "When this happened." }),
      })
      .meta({ description: "The host and calendar connection this is about." }),
  })
  .meta({
    id: "SchedulingCalendarWebhookEvent",
    examples: [
      {
        id: "evt_01kd2m9a0b1c2d3e4f5g6h7j8m",
        object: "event",
        type: "scheduling.calendar.needs_reauth",
        api_version: LATEST_API_VERSION,
        created_at: "2027-01-01T10:00:00.000Z",
        data: {
          host_id: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
          connection_id: "calconn_01kd2m9a0b1c2d3e4f5g6h7j8m",
          provider: "google",
          occurred_at: "2027-01-01T10:00:00.000Z",
        },
      },
    ],
  });

export const SeriesResult = z
  .object({
    object: z.literal("scheduling.series"),
    id: z.string(),
    bookings: z
      .array(BookingObject)
      .meta({ description: "The occurrences booked, each an ordinary booking." }),
    conflicts: z
      .array(
        z.object({
          index: z.number().meta({ description: "The occurrence's place in the series, from 0." }),
          start: z.string().meta({ description: "When it would have started." }),
        }),
      )
      .meta({
        description:
          "With `on_conflict: skip`, the occurrences that weren't free and weren't booked.",
      }),
  })
  .meta({
    id: "SchedulingSeries",
    examples: [
      {
        object: "scheduling.series",
        id: "series_01kd2m9a0b1c2d3e4f5g6h7j8m",
        bookings: [BOOKING_EXAMPLE],
        conflicts: [],
      },
    ],
  });

export const SeriesPreview = z
  .object({
    object: z.literal("list"),
    data: z
      .array(
        z.object({
          start: z.string().meta({ description: "When this occurrence starts." }),
          available: z.boolean().meta({ description: "Whether it's free." }),
          reason: z.string().nullable().meta({
            description:
              "Why it isn't free, such as `host_busy`, `already_claimed`, `outside_availability` or `no_hosts`. `null` when it is.",
          }),
          hosts: z
            .array(z.string())
            .meta({ description: "The ids of the hosts who could take it." }),
        }),
      )
      .meta({ description: "Each occurrence the request would book. Nothing is booked." }),
    has_more: z.literal(false),
  })
  .meta({
    id: "SchedulingSeriesPreview",
    examples: [
      {
        object: "list",
        data: [
          {
            start: "2027-01-04T15:00:00.000Z",
            available: true,
            reason: null,
            hosts: ["host_01kd2m9a0b1c2d3e4f5g6h7j8m"],
          },
        ],
        has_more: false,
      },
    ],
  });

export const CancelledSeries = z
  .object({ object: z.literal("list"), data: z.array(BookingObject), has_more: z.literal(false) })
  .meta({
    id: "SchedulingCancelledSeries",
    examples: [{ object: "list", data: [BOOKING_EXAMPLE], has_more: false }],
  });

export const AuthorizeCalendarRequest = z
  .strictObject({
    provider: z.enum(["google", "microsoft", "zoom"]).meta({
      description: "Whose consent page to open. CalDAV connects with a password instead.",
    }),
    return_url: z.url().max(2000).optional().meta({
      description:
        "Where to send the browser afterwards, on one of the environment's allowed origins. `coss_calendar` says what happened: `connected`, `denied` or `invalid`.",
    }),
  })
  .meta({ id: "AuthorizeCalendarRequest", examples: [{ provider: "google" }] });

export const CalendarAuthorization = z
  .object({
    object: z.literal("scheduling.calendar_authorization"),
    url: z
      .string()
      .meta({ description: "Open it in a new window: providers refuse to be framed." }),
  })
  .meta({
    id: "SchedulingCalendarAuthorization",
    examples: [
      {
        object: "scheduling.calendar_authorization",
        url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc",
      },
    ],
  });

export const CreateCalendarConnectionRequest = z
  .discriminatedUnion("provider", [
    z.strictObject({
      provider: z.literal("caldav"),
      url: z.url().max(2000).meta({ description: "The server's https URL." }),
      username: z
        .string()
        .min(1)
        .max(320)
        .meta({ description: "The account's username on that server." }),
      password: z.string().min(1).max(500).meta({
        description: "An app-specific password. Encrypted, and never returned.",
      }),
    }),
    z.strictObject({ provider: z.literal("simulated") }),
  ])
  .meta({
    description:
      "`caldav` connects a server with an app-specific password; `simulated` is a sandbox calendar for tests.",
    id: "CreateCalendarConnectionRequest",
    examples: [
      {
        provider: "caldav",
        url: "https://caldav.icloud.com",
        username: "ana@example.com",
        password: "abcd-efgh-ijkl-mnop",
      },
    ],
  });
export type CreateCalendarConnectionRequestOutput = z.output<
  typeof CreateCalendarConnectionRequest
>;

const CONNECTION_EXAMPLE = {
  object: "scheduling.calendar_connection" as const,
  id: "calconn_01kd2m9a0b1c2d3e4f5g6h7j8m",
  host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
  provider: "google" as const,
  account: "ana@example.com",
  status: "active" as const,
  calendars: [
    {
      id: "cal_01kd2m9a0b1c2d3e4f5g6h7j8m",
      external_id: "ana@example.com",
      read_busy: true,
      write_target: true,
      verified_at: "2027-01-01T10:00:00.000Z",
    },
  ],
  created_at: "2027-01-01T10:00:00.000Z",
};

export const CalendarConnectionObject = z
  .object({
    object: z.literal("scheduling.calendar_connection"),
    id: z.string(),
    host: z.string().meta({ description: "The id of the host it belongs to." }),
    provider: z.enum(["google", "microsoft", "caldav", "simulated", "zoom"]).meta({
      description:
        "Where the calendar lives. `simulated` exists only in sandbox environments; `zoom` is only used for meetings, never read for busy times.",
    }),
    account: z
      .string()
      .meta({ description: "The provider's account, such as the Google address." }),
    status: z.enum(["active", "needs_reauth"]).meta({
      description: "`needs_reauth`: access was lost, and this host isn't offered until it's back.",
    }),
    calendars: z
      .array(
        z.object({
          id: z.string(),
          external_id: z.string().meta({ description: "The calendar's id at the provider." }),
          read_busy: z.boolean().meta({ description: "Whether its busy times block slots." }),
          write_target: z.boolean().meta({ description: "Whether bookings are written to it." }),
          verified_at: z
            .string()
            .nullable()
            .meta({ description: "When it was last read successfully. `null`: not read yet." }),
        }),
      )
      .meta({ description: "The account's calendars." }),
    created_at: z.string(),
  })
  .meta({ id: "SchedulingCalendarConnection", examples: [CONNECTION_EXAMPLE] });

export const CalendarConnectionList = listOf(
  CalendarConnectionObject,
  "SchedulingCalendarConnectionList",
  CONNECTION_EXAMPLE,
);

export const DeletedCalendarConnection = deleted(
  "scheduling.calendar_connection",
  "DeletedSchedulingCalendarConnection",
  "calconn_01kd2m9a0b1c2d3e4f5g6h7j8m",
);

export const UpdateCalendarRequest = z
  .strictObject({
    read_busy: z
      .boolean()
      .optional()
      .meta({ description: "Whether this calendar's busy times block slots." }),
    write_target: z.boolean().optional().meta({
      description: "Bookings are written to one calendar; setting this moves it here.",
    }),
  })
  .meta({ id: "UpdateCalendarRequest", examples: [{ read_busy: true }] });

export const SetSimulatedBusyRequest = z
  .strictObject({
    intervals: z
      .array(z.strictObject({ start: Instant, end: Instant }))
      .max(500)
      .meta({ description: "The simulated calendar's busy times." }),
  })
  .meta({
    id: "SetSimulatedBusyRequest",
    examples: [
      { intervals: [{ start: "2027-01-04T15:00:00.000Z", end: "2027-01-04T16:00:00.000Z" }] },
    ],
  });

export const minutesToLocalTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export function localTimeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}
