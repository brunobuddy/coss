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
  "scheduling.booking.reassigned",
] as const;
export const SCHEDULING_CALENDAR_EVENT_TYPES = [
  "scheduling.calendar.connected",
  "scheduling.calendar.needs_reauth",
  "scheduling.calendar.disconnected",
] as const;
export const SCHEDULING_OUT_OF_OFFICE_EVENT_TYPES = [
  "scheduling.out_of_office.created",
  "scheduling.out_of_office.updated",
  "scheduling.out_of_office.deleted",
  "scheduling.out_of_office.started",
  "scheduling.out_of_office.ended",
] as const;
export type OutOfOfficeWebhookEventType = (typeof SCHEDULING_OUT_OF_OFFICE_EVENT_TYPES)[number];
export const SCHEDULING_REASSIGNMENT_EVENT_TYPES = ["scheduling.reassignment.completed"] as const;
export const SCHEDULING_WEBHOOK_EVENT_TYPES = [
  ...SCHEDULING_BOOKING_EVENT_TYPES,
  ...SCHEDULING_CALENDAR_EVENT_TYPES,
  ...SCHEDULING_OUT_OF_OFFICE_EVENT_TYPES,
  ...SCHEDULING_REASSIGNMENT_EVENT_TYPES,
] as const;
export type SchedulingWebhookEventType = (typeof SCHEDULING_WEBHOOK_EVENT_TYPES)[number];

export const MAX_SERIES_OCCURRENCES = 52;
export const MAX_SLOT_WINDOW_DAYS = 62;
export const MAX_SEARCH_HOSTS = 500;

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

export const CreateHostRequest = z
  .strictObject({
    uid: HostUid.optional(),
    name: z.string().min(1).max(100),
    email: z.email().max(320).optional().meta({
      description: "Where this host's notifications go. Not an identity, and need not be unique.",
    }),
    time_zone: TimeZone,
    attributes: Attributes.optional(),
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
      },
    ],
  });
export type CreateHostRequestOutput = z.output<typeof CreateHostRequest>;

export const UpdateHostRequest = z
  .strictObject({
    uid: HostUid.nullable().optional(),
    name: z.string().min(1).max(100).optional(),
    email: z.email().max(320).nullable().optional(),
    time_zone: TimeZone.optional(),
    attributes: Attributes.optional(),
    metadata: Metadata.optional(),
    status: HostStatus.optional().meta({
      description: "A `disabled` host isn't offered. Its existing bookings stay.",
    }),
  })
  .meta({ id: "UpdateHostRequest", examples: [{ status: "disabled" }] });
export type UpdateHostRequestOutput = z.output<typeof UpdateHostRequest>;

const HOST_EXAMPLE = {
  object: "scheduling.host" as const,
  id: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
  uid: "doctor_482",
  name: "Dr. Ana Reyes",
  email: "ana@example.com",
  time_zone: "America/New_York",
  attributes: { licensed_in: ["NY", "NJ"] },
  metadata: {},
  status: "active" as const,
  created_at: "2027-01-01T10:00:00.000Z",
  updated_at: "2027-01-01T10:00:00.000Z",
};

export const HostObject = z
  .object({
    object: z.literal("scheduling.host"),
    id: z.string(),
    uid: z.string().nullable(),
    name: z.string(),
    email: z.string().nullable(),
    time_zone: z.string(),
    attributes: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
    metadata: z.record(z.string(), z.string()),
    status: HostStatus,
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

export const MAX_OUT_OF_OFFICE_DAYS = 731;
export const MAX_OUT_OF_OFFICE_HOSTS = 500;

export const OUT_OF_OFFICE_PRESET_REASONS = [
  "unspecified",
  "vacation",
  "travel",
  "sick",
  "public_holiday",
  "parental_leave",
  "training",
  "other",
] as const;

export const OUT_OF_OFFICE_REASON_LABELS: Record<
  (typeof OUT_OF_OFFICE_PRESET_REASONS)[number],
  string
> = {
  unspecified: "No reason given",
  vacation: "Vacation",
  travel: "Travel",
  sick: "Sick",
  public_holiday: "Public holiday",
  parental_leave: "Parental leave",
  training: "Training",
  other: "Other",
};

const OutOfOfficeReasonKey = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,63}$/, "Use lower case letters, digits and underscores.")
  .meta({
    description:
      "One of `unspecified`, `vacation`, `travel`, `sick`, `public_holiday`, `parental_leave`, `training` and `other`, or a key from the settings' `out_of_office_reasons`. Only people who manage this host see it: never bookers, webhooks or calendars.",
    examples: ["vacation"],
  });

/** Either instants, for part of a day, or whole dates, ending with `end_date` itself. */
const outOfOfficeWhen = {
  start: Instant.optional(),
  end: Instant.optional(),
  start_date: LocalDate.optional().meta({
    description: "The first whole day away. Use instead of `start` and `end`.",
    examples: ["2027-08-02"],
  }),
  end_date: LocalDate.optional().meta({
    description: "The last whole day away, which is included.",
    examples: ["2027-08-13"],
  }),
  time_zone: TimeZone.optional().meta({
    description: "What the dates mean in. Default: the host's zone when this is made.",
  }),
};

const OutOfOfficeReassign = z
  .strictObject({
    to_host: z.string().optional().meta({ description: "Give them all to this host." }),
    preferred_hosts: z.array(z.string()).max(20).optional().meta({
      description: "Try these first, in order.",
    }),
    otherwise: z.enum(["auto", "leave"]).optional().meta({
      description:
        "After `preferred_hosts`: `auto` picks the fairest who's free (the default), `leave` keeps it where it is.",
    }),
  })
  .meta({ id: "SchedulingOutOfOfficeReassign" });

const outOfOfficeExisting = {
  existing_bookings: z.enum(["leave", "reassign"]).optional().meta({
    description:
      "What happens to bookings already in the way. `leave` (the default) only reports them. `reassign` moves them, and any nobody can take stay where they are.",
  }),
  reassign: OutOfOfficeReassign.optional().meta({
    description:
      "With `existing_bookings: reassign`: who they go to. Default: the fairest who's free.",
  }),
};

const outOfOfficeDelegates = z.array(z.string()).max(10).meta({
  description:
    "Who can be booked in this host's place during it, by id or uid, in the order to try them. They still have to fit how a booking's routed.",
});

const outOfOfficeDetails = {
  delegates: outOfOfficeDelegates.optional(),
  reason: OutOfOfficeReasonKey.optional(),
  notes: z.string().max(2000).optional().meta({
    description: "For people who manage this host. Encrypted, and never shown to a booker.",
  }),
  public_message: z
    .string()
    .max(300)
    .optional()
    .meta({
      description: "Shown to bookers while this host is away. Can't contain a link.",
      examples: ["Back on the 16th. Priya is seeing my patients until then."],
    }),
  show_on_calendar: z.boolean().optional().meta({
    description: 'Put a private "Out of office" event on the host\'s calendar. Default: true.',
  }),
};

export const CreateOutOfOfficeRequest = z
  .strictObject({
    host: z.string().optional().meta({ description: "One host, by id or uid." }),
    hosts: z.array(z.string()).max(MAX_OUT_OF_OFFICE_HOSTS).optional().meta({
      description: "Several hosts, by id or uid. Each gets an entry of their own.",
    }),
    host_filter: Attributes.optional().meta({
      description:
        "Every active host matching these attributes right now. A host added later isn't covered.",
    }),
    ...outOfOfficeWhen,
    ...outOfOfficeDetails,
    ...outOfOfficeExisting,
    external_id: z.string().min(1).max(255).optional().meta({
      description: "Your own id for this entry, unique in the environment. Needs one host.",
    }),
  })
  .meta({
    id: "CreateSchedulingOutOfOfficeRequest",
    examples: [
      {
        host: "doctor_482",
        start_date: "2027-08-02",
        end_date: "2027-08-13",
        reason: "vacation",
        public_message: "Back on the 16th.",
      },
    ],
  });
export type CreateOutOfOfficeRequestOutput = z.output<typeof CreateOutOfOfficeRequest>;

/** What a host says about their own time: whose it is comes from their session. */
/** A team page's: for its own people, and moving bookings is a run of its own. */
export const ManagerOutOfOfficeRequest = z
  .strictObject({
    ...outOfOfficeWhen,
    ...outOfOfficeDetails,
    hosts: z.array(z.string()).min(1).max(MAX_OUT_OF_OFFICE_HOSTS),
  })
  .meta({ id: "SchedulingManagerOutOfOfficeRequest" });

export const HostOutOfOfficeRequest = z
  .strictObject({ ...outOfOfficeWhen, ...outOfOfficeDetails })
  .meta({ id: "SchedulingHostOutOfOfficeRequest" });

export const PutOutOfOfficeRequest = z
  .strictObject({
    host: z.string().meta({ description: "The host, by id or uid." }),
    ...outOfOfficeWhen,
    ...outOfOfficeDetails,
    ...outOfOfficeExisting,
  })
  .meta({
    id: "PutSchedulingOutOfOfficeRequest",
    examples: [
      {
        host: "doctor_482",
        start_date: "2027-08-02",
        end_date: "2027-08-13",
        reason: "vacation",
      },
    ],
  });
export type PutOutOfOfficeRequestOutput = z.output<typeof PutOutOfOfficeRequest>;

export const UpdateOutOfOfficeRequest = z
  .strictObject({
    ...outOfOfficeWhen,
    reason: OutOfOfficeReasonKey.optional(),
    notes: z.string().max(2000).nullable().optional(),
    public_message: z.string().max(300).nullable().optional(),
    show_on_calendar: z.boolean().optional(),
    delegates: outOfOfficeDelegates.optional(),
    ...outOfOfficeExisting,
  })
  .meta({
    id: "UpdateSchedulingOutOfOfficeRequest",
    examples: [{ end_date: "2027-08-20" }],
  });
export type UpdateOutOfOfficeRequestOutput = z.output<typeof UpdateOutOfOfficeRequest>;

const OUT_OF_OFFICE_EXAMPLE = {
  object: "scheduling.out_of_office" as const,
  id: "ooo_01kd2m9a0b1c2d3e4f5g6h7j8m",
  host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
  start: "2027-08-02T04:00:00.000Z",
  end: "2027-08-14T04:00:00.000Z",
  all_day: { start_date: "2027-08-02", end_date: "2027-08-13", time_zone: "America/New_York" },
  reason: "vacation",
  notes: null,
  public_message: "Back on the 16th.",
  show_on_calendar: true,
  delegates: ["host_01kd2m9a0b1c2d3e4f5g6h7j8n"],
  existing_bookings: "leave" as const,
  external_id: null,
  group: null,
  source: "api" as const,
  created_at: "2027-01-01T10:00:00.000Z",
  updated_at: "2027-01-01T10:00:00.000Z",
};

export const OutOfOfficeObject = z
  .object({
    object: z.literal("scheduling.out_of_office"),
    id: z.string(),
    host: z.string(),
    start: z.string(),
    end: z.string(),
    all_day: z
      .object({ start_date: z.string(), end_date: z.string(), time_zone: z.string() })
      .nullable()
      .meta({ description: "How it was given, when it was as whole dates." }),
    reason: z.string(),
    notes: z.string().nullable(),
    public_message: z.string().nullable(),
    show_on_calendar: z.boolean(),
    delegates: z.array(z.string()).meta({ description: "Who can be booked in their place." }),
    existing_bookings: z.enum(["leave", "reassign"]),
    external_id: z.string().nullable(),
    group: z.string().nullable().meta({
      description: "Shared by the entries one request made for several hosts.",
    }),
    source: z.enum(["api", "host", "manager", "dashboard", "holiday"]),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .meta({ id: "SchedulingOutOfOffice", examples: [OUT_OF_OFFICE_EXAMPLE] });
export type OutOfOfficeObjectOutput = z.output<typeof OutOfOfficeObject>;

export const OutOfOfficeList = listOf(
  OutOfOfficeObject,
  "SchedulingOutOfOfficeList",
  OUT_OF_OFFICE_EXAMPLE,
);

export const DeletedOutOfOffice = deleted(
  "scheduling.out_of_office",
  "DeletedSchedulingOutOfOffice",
  "ooo_01kd2m9a0b1c2d3e4f5g6h7j8m",
);

export const ListOutOfOfficeQuery = PageQuery.extend({
  host: z.string().optional().meta({ description: "One host's entries, by id or uid." }),
  start_after: Instant.optional().meta({ description: "Entries ending after this." }),
  start_before: Instant.optional().meta({ description: "Entries starting before this." }),
  group: z.string().optional().meta({ description: "The entries one request made." }),
});

export const ConflictsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
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
    name: z.string().min(1).max(100).optional(),
    time_zone: TimeZone.optional().meta({ description: "Default: the host's." }),
    is_default: z.boolean().optional(),
    rules: z.array(WeeklyRule).max(50),
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
    host: z.string(),
    name: z.string(),
    time_zone: z.string(),
    is_default: z.boolean(),
    rules: z.array(z.object({ days: z.array(z.number()), start: z.string(), end: z.string() })),
    overrides: z.array(
      z.object({
        date: z.string(),
        ranges: z.array(z.object({ start: z.string(), end: z.string() })),
      }),
    ),
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
    z.strictObject({ kind: z.literal("rolling"), days: z.number().int().min(1).max(730) }),
    z.strictObject({ kind: z.literal("range"), from: LocalDate, to: LocalDate }),
  ])
  .meta({ id: "SchedulingBookingWindow" });

const Limit = z
  .strictObject({
    period: z.enum(["day", "week"]).meta({ description: "In the host's time zone." }),
    max: z.number().int().min(1).max(1000),
    scope: z
      .enum(["event_type", "host"])
      .default("event_type")
      .meta({ description: "Count this event type's bookings, or all of the host's." }),
  })
  .meta({ id: "SchedulingLimit" });

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
      .regex(/^[a-z][a-z0-9_]{0,63}$/, "Use lower case letters, digits and underscores."),
    type: z.enum(QUESTION_TYPES),
    label: z.string().min(1).max(200),
    required: z.boolean().default(false),
    options: z.array(z.string().min(1).max(200)).max(50).default([]),
  })
  .meta({ id: "SchedulingQuestion" });

export const Location = z
  .discriminatedUnion("type", [
    z.strictObject({ type: z.literal("link"), url: z.url().max(2000).nullable().default(null) }),
    z.strictObject({
      type: z.literal("phone"),
      number: z.string().max(32).nullable().default(null),
    }),
    z.strictObject({
      type: z.literal("in_person"),
      address: z.string().max(500).nullable().default(null),
    }),
    z.strictObject({ type: z.literal("google_meet") }),
    z.strictObject({ type: z.literal("microsoft_teams") }),
    z.strictObject({
      type: z.literal("zoom"),
      url: z.url().max(2000).nullable().default(null).meta({
        description: "The meeting's link, once it's created on the host's Zoom account.",
      }),
    }),
  ])
  .meta({ id: "SchedulingLocation" });

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
  title: z.string().min(1).max(120).meta({
    description: "Shown to attendees and in emails. Host calendars always show a neutral title.",
  }),
  duration_minutes: z.number().int().min(5).max(1440),
  duration_options: z.array(z.number().int().min(5).max(1440)).max(10).optional(),
  step_minutes: z.number().int().min(5).max(1440).optional().meta({
    description: "How far apart slots start. Default: the duration.",
  }),
  grid_time_zone: TimeZone.nullable().optional().meta({
    description: "The zone slots align in. Default: each host's own.",
  }),
  buffer_before_minutes: z.number().int().min(0).max(480).optional(),
  buffer_after_minutes: z.number().int().min(0).max(480).optional(),
  min_notice_minutes: z.number().int().min(0).max(525600).optional(),
  booking_window: BookingWindow.nullable().optional(),
  limits: z.array(Limit).max(4).optional(),
  capacity: z.number().int().min(2).max(10000).nullable().optional().meta({
    description: "Attendees per session. Required for, and only allowed on, `group`.",
  }),
  requires_approval: z.boolean().optional(),
  reassignment_enabled: z.boolean().optional().meta({
    description: "Whether bookings of this event type can go to another host. Default: true.",
  }),
  approval_ttl_minutes: z.number().int().min(5).max(43200).optional(),
  hold_ttl_seconds: z.number().int().min(60).max(86400).optional(),
  cancel_notice_minutes: z.number().int().min(0).max(525600).optional().meta({
    description: "Attendees can't cancel closer to the start than this. API keys can.",
  }),
  reschedule_notice_minutes: z.number().int().min(0).max(525600).optional(),
  questions: z.array(Question).max(25).optional(),
  locations: z.array(Location).max(10).optional(),
  host_filter: Attributes.nullable().optional().meta({
    description: "Pool members also include active hosts matching all of these attributes.",
  }),
  metadata: Metadata.optional(),
};

export const CreateEventTypeRequest = z
  .strictObject({
    uid: z.string().min(1).max(255).optional(),
    kind: z.enum(EVENT_TYPE_KINDS).default("one_on_one"),
    ...eventTypeFields,
    hosts: z.array(EventTypeHostInput).max(MAX_SEARCH_HOSTS).default([]),
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
    uid: z.string().min(1).max(255).nullable().optional(),
    ...eventTypeFields,
    title: eventTypeFields.title.optional(),
    duration_minutes: eventTypeFields.duration_minutes.optional(),
    status: z.enum(["active", "archived"]).optional(),
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
  reassignment_enabled: true,
  approval_ttl_minutes: 1440,
  hold_ttl_seconds: 600,
  cancel_notice_minutes: 0,
  reschedule_notice_minutes: 0,
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
    uid: z.string().nullable(),
    title: z.string(),
    kind: z.enum(EVENT_TYPE_KINDS),
    status: z.enum(["active", "archived"]),
    duration_minutes: z.number(),
    duration_options: z.array(z.number()),
    step_minutes: z.number(),
    grid_time_zone: z.string().nullable(),
    buffer_before_minutes: z.number(),
    buffer_after_minutes: z.number(),
    min_notice_minutes: z.number(),
    booking_window: BookingWindow.nullable(),
    limits: z.array(Limit),
    capacity: z.number().nullable(),
    requires_approval: z.boolean(),
    reassignment_enabled: z.boolean(),
    approval_ttl_minutes: z.number(),
    hold_ttl_seconds: z.number(),
    cancel_notice_minutes: z.number(),
    reschedule_notice_minutes: z.number(),
    questions: z.array(Question),
    locations: z.array(Location),
    host_filter: z.record(z.string(), z.union([z.string(), z.array(z.string())])).nullable(),
    hosts: z.array(
      z.object({
        host: z.string(),
        role: z.enum(["required", "member"]),
        weight: z.number(),
        schedule: z.string().nullable(),
      }),
    ),
    metadata: z.record(z.string(), z.string()),
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
    start: z.string(),
    end: z.string(),
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
    hosts: z.array(z.string()).max(MAX_SEARCH_HOSTS).optional(),
    slots_per_host: z.number().int().min(1).max(50).default(3),
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
    data: z.array(
      z.object({
        host: z.string(),
        uid: z.string().nullable(),
        slots: z.array(z.object({ start: z.string(), end: z.string() })),
      }),
    ),
    has_more: z.boolean(),
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
    name: z.string().min(1).max(100).optional(),
    email: z.email().max(320).optional(),
    phone: z
      .string()
      .regex(/^\+[1-9]\d{6,14}$/, "Use E.164.")
      .optional(),
    time_zone: TimeZone,
    locale: z.string().min(2).max(35).optional(),
  })
  .meta({
    id: "SchedulingAttendeeInput",
    description: "Name and email are only needed if coss.com notifies this attendee.",
  });
export type AttendeeInputOutput = z.output<typeof AttendeeInput>;

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
    start: Instant,
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
    recurrence: z.strictObject({
      frequency: z.enum(["weekly", "monthly"]),
      interval: z.number().int().min(1).max(12).default(1),
      count: z.number().int().min(2).max(MAX_SERIES_OCCURRENCES),
    }),
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
    content_type: z.enum(["image/png", "image/jpeg"]),
    width: z.number().int(),
    height: z.number().int(),
    data_url: z.string().meta({ description: "The image, as a `data:` URL." }),
  })
  .meta({ id: "SchedulingLogo" });

export const SettingsObject = z
  .object({
    object: z.literal("scheduling.settings"),
    allowed_origins: z.array(z.string()).meta({
      description: "Sites allowed to embed coss.com's hosted pages and call the client API.",
    }),
    brand_name: z.string().nullable(),
    accent_color: z.string().nullable(),
    logo: SettingsLogo.nullable().meta({
      description: "At the top of the hosted pages, and of emails sent from `email_from`.",
    }),
    email_from: z.string().nullable().meta({
      description: "Sender of booking emails, on a verified domain.",
    }),
    sms_from: z.string().nullable().meta({
      description: "Your approved number for SMS reminders. Without one, no SMS is sent.",
    }),
    name_host_in_attendee_emails: z.boolean().meta({
      description: "Name the new host when telling an attendee their booking has one.",
    }),
    host_reassignment: z.enum(["off", "eligible"]).meta({
      description:
        "Whether hosts can give their own bookings to someone else from their page. `eligible` lets them, to anyone free who takes that event type.",
    }),
    out_of_office_reasons: z.array(z.object({ key: z.string(), label: z.string() })).meta({
      description: "Reasons of your own for time away, on top of the preset ones.",
    }),
    calendar_failure_mode: z.enum(["hide", "last_known"]).meta({
      description:
        "When a host's calendar can't be read: stop offering them, or keep offering their last known times and flag those bookings as unverified.",
    }),
    notifications: z
      .record(
        z.string(),
        z.object({
          email_attendee: z.boolean().optional(),
          email_host: z.boolean().optional(),
          sms_attendee: z.boolean().optional(),
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
        name_host_in_attendee_emails: false,
        host_reassignment: "off",
        out_of_office_reasons: [],
        calendar_failure_mode: "hide",
        notifications: { reminder: { sms_attendee: true } },
      },
    ],
  });
export type SettingsObjectOutput = z.output<typeof SettingsObject>;

export const UpdateSettingsRequest = z
  .strictObject({
    allowed_origins: z.array(z.string().max(200)).max(10).optional(),
    brand_name: z.string().min(1).max(100).nullable().optional(),
    accent_color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Use #RRGGBB.")
      .nullable()
      .optional(),
    logo: z
      .strictObject({
        content: z
          .base64()
          .max(LOGO_MAX_BASE64, "A logo can be 200 KB at most.")
          .meta({ description: "A PNG or JPEG's bytes, base64-encoded. 200 KB at most." }),
      })
      .nullable()
      .optional(),
    email_from: z.email().max(320).nullable().optional(),
    sms_from: z
      .string()
      .regex(/^\+[1-9]\d{6,14}$/, "Use E.164.")
      .nullable()
      .optional(),
    calendar_failure_mode: z.enum(["hide", "last_known"]).optional(),
    name_host_in_attendee_emails: z.boolean().optional(),
    host_reassignment: z.enum(["off", "eligible"]).optional(),
    out_of_office_reasons: z
      .array(
        z.strictObject({
          key: OutOfOfficeReasonKey,
          label: z.string().min(1).max(60),
        }),
      )
      .max(50)
      .nullable()
      .optional()
      .meta({
        description: "Reasons of your own, on top of the preset ones. Hosts and managers see them.",
      }),
    notifications: z
      .record(
        z.string().max(64),
        z.strictObject({
          email_attendee: z.boolean().optional(),
          email_host: z.boolean().optional(),
          sms_attendee: z.boolean().optional(),
        }),
      )
      .nullable()
      .optional(),
  })
  .meta({ id: "UpdateSchedulingSettingsRequest", examples: [{ brand_name: "Acme Health" }] });
export type UpdateSettingsRequestOutput = z.output<typeof UpdateSettingsRequest>;

export const ErasedAttendee = z
  .object({ object: z.literal("scheduling.attendee_erasure"), uid: z.string(), erased: z.number() })
  .meta({
    id: "SchedulingAttendeeErasure",
    examples: [{ object: "scheduling.attendee_erasure", uid: "patient_77", erased: 3 }],
  });

const BookingAttendee = z.object({
  id: z.string(),
  uid: z.string().nullable(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  time_zone: z.string(),
  locale: z.string().nullable(),
  answers: z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .optional()
    .meta({ description: "Only when retrieving one booking." }),
});

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
  metadata: {},
  created_at: "2027-01-01T10:00:00.000Z",
  updated_at: "2027-01-01T10:00:00.000Z",
};

export const BookingObject = z
  .object({
    object: z.literal("scheduling.booking"),
    id: z.string(),
    event_type: z.string(),
    status: z.enum(BOOKING_STATUSES),
    title: z.string(),
    start: z.string(),
    end: z.string(),
    hosts: z.array(z.string()),
    attendees: z.array(BookingAttendee),
    location: Location.nullable(),
    hold_expires_at: z.string().nullable(),
    approval_expires_at: z.string().nullable(),
    series: z.string().nullable(),
    series_index: z.number().nullable(),
    group_session: z.string().nullable(),
    calendar_unverified: z.boolean(),
    external_conflict_at: z.string().nullable(),
    no_show_at: z.string().nullable(),
    cancelled_at: z.string().nullable(),
    metadata: z.record(z.string(), z.string()),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .meta({ id: "SchedulingBooking", examples: [BOOKING_EXAMPLE] });
export type BookingObjectOutput = z.output<typeof BookingObject>;

export const BookingList = listOf(BookingObject, "SchedulingBookingList", BOOKING_EXAMPLE);

export const REASSIGNMENT_REASONS = [
  "host_unavailable",
  "out_of_office",
  "workload",
  "customer_request",
  "offboarding",
  "other",
] as const;

export const REASSIGNMENT_REASON_LABELS: Record<(typeof REASSIGNMENT_REASONS)[number], string> = {
  host_unavailable: "Host unavailable",
  out_of_office: "Out of office",
  workload: "Balancing workload",
  customer_request: "Customer asked",
  offboarding: "Host leaving",
  other: "Other",
};

export const REASSIGNMENT_OVERRIDES = [
  "any_host",
  "out_of_office",
  "outside_availability",
  "host_busy",
  "limit_reached",
  "calendar_unverified",
] as const;

export const ReassignBookingRequest = z
  .strictObject({
    changes: z
      .array(
        z.strictObject({
          from_host: z.string().optional().meta({
            description: "The host leaving, by id or uid. Needed when it could be several.",
          }),
          to_host: z.string().optional().meta({
            description: "The host taking over, by id or uid. Or set `auto`.",
          }),
          auto: z.boolean().optional().meta({
            description:
              "Let coss.com pick, as a pool would: the fairest who's free and fits what the booking was routed with.",
          }),
          preferred_hosts: z.array(z.string()).max(20).optional().meta({
            description: "With `auto`: try these first, in order.",
          }),
        }),
      )
      .min(1)
      .max(10)
      .meta({ description: "A session or a one-on-one has one. A collective can change several." }),
    reason_code: z.enum(REASSIGNMENT_REASONS),
    note: z.string().max(500).optional().meta({
      description:
        "Why, in your words: required with an override of someone's availability. Encrypted, and only in the booking's history.",
    }),
    overrides: z.array(z.enum(REASSIGNMENT_OVERRIDES)).max(6).optional().meta({
      description:
        "Go ahead anyway: `any_host` for someone who doesn't take this event type, and the rest for what a candidate's `reason` said. A host who already has something at this time can never be overridden.",
    }),
    notify: z
      .strictObject({
        attendee: z.boolean().optional().meta({ description: "Tell the attendee. Default: true." }),
      })
      .optional(),
  })
  .meta({
    id: "ReassignSchedulingBookingRequest",
    examples: [
      {
        changes: [{ to_host: "doctor_518" }],
        reason_code: "out_of_office",
      },
    ],
  });
export type ReassignBookingRequestOutput = z.output<typeof ReassignBookingRequest>;

const REASSIGNMENT_NOTIFY = z
  .strictObject({
    attendees: z.boolean().optional().meta({ description: "Tell attendees. Default: true." }),
    hosts: z.enum(["digest", "each", "none"]).optional().meta({
      description: "`digest` (the default) sends each host one email for the run.",
    }),
  })
  .optional();

const REASSIGNMENT_SELECTION = z
  .strictObject({
    host: z.string().optional().meta({ description: "This host's bookings, by id or uid." }),
    out_of_office: z.string().optional().meta({
      description: "The bookings that fall in this entry.",
    }),
    booking_ids: z.array(z.string()).max(5000).optional(),
    series: z.string().optional().meta({ description: "A series' occurrences still to come." }),
    start_after: Instant.optional(),
    start_before: Instant.optional(),
    event_types: z.array(z.string()).max(100).optional(),
    external_conflict: z.boolean().optional().meta({
      description: "Only those with something else on the host's calendar at that time.",
    }),
  })
  .meta({ id: "SchedulingReassignmentSelection" });

const REASSIGNMENT_STRATEGY = z
  .strictObject({
    to_host: z.string().optional().meta({ description: "Give them all to this host." }),
    preferred_hosts: z.array(z.string()).max(20).optional().meta({
      description: "Try these first, in order.",
    }),
    otherwise: z.enum(["auto", "leave"]).optional().meta({
      description:
        "After `preferred_hosts`: `auto` picks the fairest who's free, `leave` keeps it where it is.",
    }),
    assignments: z
      .array(
        z.strictObject({
          booking: z.string(),
          to_host: z.string(),
          from_host: z.string().optional(),
        }),
      )
      .max(5000)
      .optional()
      .meta({ description: "Who each goes to: a preview, with your changes." }),
  })
  .meta({ id: "SchedulingReassignmentStrategy" });

export const PreviewReassignmentRequest = z
  .strictObject({
    selection: REASSIGNMENT_SELECTION,
    strategy: REASSIGNMENT_STRATEGY.default({}),
    overrides: z.array(z.enum(REASSIGNMENT_OVERRIDES)).max(6).optional(),
  })
  .meta({
    id: "PreviewSchedulingReassignmentRequest",
    examples: [
      {
        selection: { host: "doctor_482", start_before: "2027-08-14T00:00:00.000Z" },
        strategy: { preferred_hosts: ["doctor_518"] },
      },
    ],
  });
export type PreviewReassignmentRequestOutput = z.output<typeof PreviewReassignmentRequest>;

export const CreateReassignmentRequest = z
  .strictObject({
    selection: REASSIGNMENT_SELECTION,
    strategy: REASSIGNMENT_STRATEGY.default({}),
    reason_code: z.enum(REASSIGNMENT_REASONS),
    note: z.string().max(500).optional().meta({
      description: "Why, in your words: required with an override of someone's availability.",
    }),
    overrides: z.array(z.enum(REASSIGNMENT_OVERRIDES)).max(6).optional(),
    notify: REASSIGNMENT_NOTIFY,
  })
  .meta({
    id: "CreateSchedulingReassignmentRequest",
    examples: [
      {
        selection: { out_of_office: "ooo_01kd2m9a0b1c2d3e4f5g6h7j8m" },
        strategy: { preferred_hosts: ["doctor_518"] },
        reason_code: "out_of_office",
      },
    ],
  });
export type CreateReassignmentRequestOutput = z.output<typeof CreateReassignmentRequest>;

export const UndoReassignmentRequest = z
  .strictObject({
    reason_code: z.enum(REASSIGNMENT_REASONS).optional(),
    note: z.string().max(500).optional(),
    overrides: z.array(z.enum(REASSIGNMENT_OVERRIDES)).max(6).optional(),
    notify: REASSIGNMENT_NOTIFY,
  })
  .meta({ id: "UndoSchedulingReassignmentRequest", examples: [{ reason_code: "other" }] });
export type UndoReassignmentRequestOutput = z.output<typeof UndoReassignmentRequest>;

const REASSIGNMENT_COUNTS = {
  total: 12,
  pending: 0,
  reassigned: 11,
  skipped: 0,
  no_candidate: 1,
  failed: 0,
  cancelled: 0,
};

const ReassignmentCounts = z.object({
  total: z.number(),
  pending: z.number(),
  reassigned: z.number(),
  skipped: z.number().meta({ description: "They'd moved on since it was selected." }),
  no_candidate: z.number().meta({ description: "Nobody could take them: they stayed." }),
  failed: z.number(),
  cancelled: z.number(),
});

const REASSIGNMENT_EXAMPLE = {
  object: "scheduling.reassignment" as const,
  id: "reasn_01kd2m9a0b1c2d3e4f5g6h7j8m",
  status: "completed" as const,
  reason_code: "out_of_office" as const,
  out_of_office: "ooo_01kd2m9a0b1c2d3e4f5g6h7j8m",
  undo_of: null,
  counts: REASSIGNMENT_COUNTS,
  created_at: "2027-01-01T10:00:00.000Z",
  started_at: "2027-01-01T10:00:01.000Z",
  finished_at: "2027-01-01T10:00:09.000Z",
};

export const ReassignmentObject = z
  .object({
    object: z.literal("scheduling.reassignment"),
    id: z.string(),
    status: z.enum(["pending", "running", "completed", "cancelled"]),
    reason_code: z.enum(REASSIGNMENT_REASONS),
    out_of_office: z.string().nullable(),
    undo_of: z.string().nullable(),
    counts: ReassignmentCounts,
    created_at: z.string(),
    started_at: z.string().nullable(),
    finished_at: z.string().nullable(),
  })
  .meta({ id: "SchedulingReassignment", examples: [REASSIGNMENT_EXAMPLE] });
export type ReassignmentObjectOutput = z.output<typeof ReassignmentObject>;

export const ReassignmentList = listOf(
  ReassignmentObject,
  "SchedulingReassignmentList",
  REASSIGNMENT_EXAMPLE,
);

const REASSIGNMENT_ITEM_EXAMPLE = {
  object: "scheduling.reassignment_item" as const,
  id: "reasi_01kd2m9a0b1c2d3e4f5g6h7j8m",
  booking: "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
  from_host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
  to_host: "host_01kd2m9a0b1c2d3e4f5g6h7j8n",
  outcome: "reassigned" as const,
  error_code: null,
};

export const ReassignmentItemObject = z
  .object({
    object: z.literal("scheduling.reassignment_item"),
    id: z.string(),
    booking: z.string(),
    from_host: z.string().nullable(),
    to_host: z.string().nullable(),
    outcome: z.enum([
      "pending",
      "reassigned",
      "skipped_changed",
      "no_candidate",
      "failed",
      "cancelled",
    ]),
    error_code: z.string().nullable(),
  })
  .meta({ id: "SchedulingReassignmentItem", examples: [REASSIGNMENT_ITEM_EXAMPLE] });
export type ReassignmentItemObjectOutput = z.output<typeof ReassignmentItemObject>;

export const ReassignmentItemList = listOf(
  ReassignmentItemObject,
  "SchedulingReassignmentItemList",
  REASSIGNMENT_ITEM_EXAMPLE,
);

export const ReassignmentPreview = z
  .object({
    object: z.literal("scheduling.reassignment_preview"),
    items: z.array(
      z.object({
        booking: z.string(),
        event_type: z.string(),
        title: z.string(),
        status: z.enum(BOOKING_STATUSES),
        start: z.string(),
        end: z.string(),
        series: z.string().nullable(),
        group_session: z.string().nullable(),
        from_host: z.string().nullable(),
        to_host: z.string().nullable().meta({ description: "Null when nobody could take it." }),
        reason: z.string().nullable().meta({ description: "Why it would stay where it is." }),
      }),
    ),
    truncated: z.boolean().meta({ description: "There are more than a preview covers." }),
  })
  .meta({
    id: "SchedulingReassignmentPreview",
    examples: [
      {
        object: "scheduling.reassignment_preview",
        items: [
          {
            booking: "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
            event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
            title: "Consultation",
            status: "confirmed",
            start: "2027-08-03T15:00:00.000Z",
            end: "2027-08-03T15:30:00.000Z",
            series: null,
            group_session: null,
            from_host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
            to_host: "host_01kd2m9a0b1c2d3e4f5g6h7j8n",
            reason: null,
          },
        ],
        truncated: false,
      },
    ],
  });
export type ReassignmentPreviewOutput = z.output<typeof ReassignmentPreview>;

const HOLIDAY_CALENDAR_EXAMPLE = {
  object: "scheduling.holiday_calendar" as const,
  id: "hcal_01kd2m9a0b1c2d3e4f5g6h7j8m",
  name: "UK team",
  source: "country" as const,
  country: "GB",
  hosts: null,
  host_filter: { team: "london" },
  regions: ["England"],
  delegates: [],
  existing_bookings: "leave" as const,
  last_read_at: "2027-01-01T10:00:00.000Z",
  last_error: null,
  created_at: "2027-01-01T10:00:00.000Z",
  updated_at: "2027-01-01T10:00:00.000Z",
};

const holidayWho = {
  hosts: z.array(z.string()).max(1000).optional().meta({
    description: "These hosts, by id or uid.",
  }),
  host_filter: z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .optional()
    .meta({ description: "Everyone matching these attributes, asked again at every sync." }),
  regions: z.array(z.string().min(1).max(100)).max(50).optional().meta({
    description:
      "Which regional holidays apply, matched against how the calendar names them, such as `England`. Without this, all of them do; empty, only nationwide ones.",
  }),
  delegates: z.array(z.string()).max(10).optional().meta({
    description: "Who can be booked in their place on those days, by id or uid, in order.",
  }),
  existing_bookings: z.enum(["leave", "reassign"]).optional().meta({
    description:
      "What happens to bookings already on a holiday. `leave` (the default) only reports them. `reassign` moves them.",
  }),
};

export const CreateHolidayCalendarRequest = z
  .strictObject({
    name: z.string().min(1).max(200),
    country: z.string().optional().meta({
      description: "A code from the list of holiday calendars, such as `GB`.",
    }),
    ics_url: z.string().url().max(2000).optional().meta({
      description: "Your own feed, https or webcal, read in live environments. Stored encrypted.",
    }),
    ...holidayWho,
  })
  .meta({
    id: "CreateSchedulingHolidayCalendarRequest",
    examples: [{ name: "UK team", country: "GB", host_filter: { team: "london" } }],
  });
export type CreateHolidayCalendarRequestOutput = z.output<typeof CreateHolidayCalendarRequest>;

export const UpdateHolidayCalendarRequest = z
  .strictObject({ name: z.string().min(1).max(200).optional(), ...holidayWho })
  .meta({
    id: "UpdateSchedulingHolidayCalendarRequest",
    examples: [{ host_filter: { team: "london" } }],
  });
export type UpdateHolidayCalendarRequestOutput = z.output<typeof UpdateHolidayCalendarRequest>;

export const HolidayCalendarObject = z
  .object({
    object: z.literal("scheduling.holiday_calendar"),
    id: z.string(),
    name: z.string(),
    source: z.enum(["country", "ics"]),
    country: z.string().nullable(),
    hosts: z.array(z.string()).nullable(),
    host_filter: z.record(z.string(), z.union([z.string(), z.array(z.string())])).nullable(),
    regions: z.array(z.string()).nullable(),
    delegates: z.array(z.string()),
    existing_bookings: z.enum(["leave", "reassign"]),
    last_read_at: z.string().nullable(),
    last_error: z.string().nullable().meta({ description: "Why its feed couldn't be read." }),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .meta({ id: "SchedulingHolidayCalendar", examples: [HOLIDAY_CALENDAR_EXAMPLE] });
export type HolidayCalendarObjectOutput = z.output<typeof HolidayCalendarObject>;

export const HolidayCalendarList = listOf(
  HolidayCalendarObject,
  "SchedulingHolidayCalendarList",
  HOLIDAY_CALENDAR_EXAMPLE,
);

export const DeletedHolidayCalendar = z.object({ id: z.string(), deleted: z.literal(true) }).meta({
  id: "DeletedSchedulingHolidayCalendar",
  examples: [{ id: "hcal_01kd2m9a0b1c2d3e4f5g6h7j8m", deleted: true }],
});

export const HolidayList = z
  .object({
    object: z.literal("list"),
    data: z.array(z.object({ date: z.string(), name: z.string(), region: z.string().nullable() })),
    has_more: z.boolean(),
  })
  .meta({
    id: "SchedulingHolidayList",
    examples: [
      {
        object: "list",
        data: [{ date: "2027-12-25", name: "Christmas Day", region: null }],
        has_more: false,
      },
    ],
  });

export const ReassignCandidatesQuery = z.object({
  from_host: z.string().optional().meta({
    description: "The host who'd leave, when it could be several.",
  }),
});

const REASSIGN_CANDIDATE_EXAMPLE = {
  object: "scheduling.reassign_candidate" as const,
  host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
  uid: "doctor_518",
  name: "Dr. Priya Raman",
  member: true,
  available: true,
  reason: null,
  load: 4,
  rank: 1,
  meeting_provider_missing: false,
};

export const ReassignCandidate = z
  .object({
    object: z.literal("scheduling.reassign_candidate"),
    host: z.string(),
    uid: z.string().nullable(),
    name: z.string(),
    member: z.boolean().meta({
      description:
        "Takes this event type, and fits what the booking was routed with. Otherwise it needs `any_host`.",
    }),
    available: z.boolean(),
    reason: z.string().nullable().meta({
      description: "Why they aren't available. `already_claimed` can't be overridden.",
    }),
    load: z.number().meta({ description: "Their live bookings in the week from this one." }),
    rank: z.number().nullable().meta({
      description: "Their place in who a pool would pick next, from 1. Null for a non-member.",
    }),
    meeting_provider_missing: z.boolean().meta({
      description: "They haven't connected what this booking's meeting needs, so it'd have none.",
    }),
  })
  .meta({ id: "SchedulingReassignCandidate", examples: [REASSIGN_CANDIDATE_EXAMPLE] });

export const ReassignCandidateList = listOf(
  ReassignCandidate,
  "SchedulingReassignCandidateList",
  REASSIGN_CANDIDATE_EXAMPLE,
);

const OUT_OF_OFFICE_CONFLICT_EXAMPLE = {
  object: "scheduling.out_of_office_conflict" as const,
  booking: "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
  event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
  title: "Consultation",
  status: "confirmed" as const,
  start: "2027-08-03T15:00:00.000Z",
  end: "2027-08-03T15:30:00.000Z",
  series: null,
  group_session: null,
};

export const OutOfOfficeConflict = z
  .object({
    object: z.literal("scheduling.out_of_office_conflict"),
    booking: z.string(),
    event_type: z.string(),
    title: z.string(),
    status: z.enum(BOOKING_STATUSES),
    start: z.string(),
    end: z.string(),
    series: z.string().nullable(),
    group_session: z.string().nullable(),
  })
  .meta({ id: "SchedulingOutOfOfficeConflict", examples: [OUT_OF_OFFICE_CONFLICT_EXAMPLE] });
export type OutOfOfficeConflictOutput = z.output<typeof OutOfOfficeConflict>;

export const OutOfOfficeConflictList = listOf(
  OutOfOfficeConflict,
  "SchedulingOutOfOfficeConflictList",
  OUT_OF_OFFICE_CONFLICT_EXAMPLE,
);

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
    booking_id: z.string(),
    event_type_id: z.string(),
    status: z.enum(BOOKING_STATUSES),
    start: z.string(),
    end: z.string(),
    host_ids: z.array(z.string()),
    attendee_uids: z.array(z.string()),
    series_id: z.string().nullable(),
    previous_start: z.string().optional(),
    previous_host_ids: z.array(z.string()).optional().meta({
      description: "On `scheduling.booking.reassigned`: who had it before.",
    }),
    reassignment_id: z.string().optional().meta({
      description: "On `scheduling.booking.reassigned`: the bulk reassignment it was part of.",
    }),
    occurred_at: z.string(),
  })
  .meta({ id: "SchedulingBookingWebhookData" });

const webhookEnvelope = {
  id: z.string().meta({ description: "The event id." }),
  object: z.literal("event"),
  api_version: z.string(),
  created_at: z.iso.datetime(),
};

export const SchedulingBookingWebhookEvent = z
  .object({
    ...webhookEnvelope,
    type: z.enum(SCHEDULING_BOOKING_EVENT_TYPES),
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

export const SchedulingOutOfOfficeWebhookEvent = z
  .object({
    ...webhookEnvelope,
    type: z.enum(SCHEDULING_OUT_OF_OFFICE_EVENT_TYPES),
    data: z.object({
      out_of_office_id: z.string(),
      host_id: z.string(),
      start: z.string(),
      end: z.string(),
      group: z.string().nullable(),
      occurred_at: z.string(),
    }),
  })
  .meta({
    id: "SchedulingOutOfOfficeWebhookEvent",
    examples: [
      {
        id: "evt_01kd2m9a0b1c2d3e4f5g6h7j8m",
        object: "event",
        type: "scheduling.out_of_office.created",
        api_version: LATEST_API_VERSION,
        created_at: "2027-01-01T10:00:00.000Z",
        data: {
          out_of_office_id: "ooo_01kd2m9a0b1c2d3e4f5g6h7j8m",
          host_id: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
          start: "2027-08-02T04:00:00.000Z",
          end: "2027-08-14T04:00:00.000Z",
          group: null,
          occurred_at: "2027-01-01T10:00:00.000Z",
        },
      },
    ],
  });

export const SchedulingReassignmentWebhookEvent = z
  .object({
    ...webhookEnvelope,
    type: z.enum(SCHEDULING_REASSIGNMENT_EVENT_TYPES),
    data: z.object({
      reassignment_id: z.string(),
      status: z.enum(["completed", "cancelled"]),
      out_of_office_id: z.string().nullable(),
      counts: ReassignmentCounts,
      occurred_at: z.string(),
    }),
  })
  .meta({
    id: "SchedulingReassignmentWebhookEvent",
    examples: [
      {
        id: "evt_01kd2m9a0b1c2d3e4f5g6h7j8m",
        object: "event",
        type: "scheduling.reassignment.completed",
        api_version: LATEST_API_VERSION,
        created_at: "2027-01-01T10:00:00.000Z",
        data: {
          reassignment_id: "reasn_01kd2m9a0b1c2d3e4f5g6h7j8m",
          status: "completed",
          out_of_office_id: null,
          counts: REASSIGNMENT_COUNTS,
          occurred_at: "2027-01-01T10:00:00.000Z",
        },
      },
    ],
  });

export const SchedulingCalendarWebhookEvent = z
  .object({
    ...webhookEnvelope,
    type: z.enum(SCHEDULING_CALENDAR_EVENT_TYPES),
    data: z.object({
      host_id: z.string(),
      connection_id: z.string(),
      provider: z.string(),
      occurred_at: z.string(),
    }),
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
    bookings: z.array(BookingObject),
    conflicts: z.array(z.object({ index: z.number(), start: z.string() })),
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
    data: z.array(
      z.object({
        start: z.string(),
        available: z.boolean(),
        reason: z.string().nullable(),
        hosts: z.array(z.string()),
      }),
    ),
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
    provider: z.enum(["google", "microsoft", "zoom"]),
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
      username: z.string().min(1).max(320),
      password: z.string().min(1).max(500).meta({
        description: "An app-specific password. Encrypted, and never returned.",
      }),
    }),
    z.strictObject({ provider: z.literal("simulated") }),
  ])
  .meta({
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
    host: z.string(),
    provider: z.enum(["google", "microsoft", "caldav", "simulated", "zoom"]),
    account: z.string(),
    status: z.enum(["active", "needs_reauth"]).meta({
      description: "`needs_reauth`: access was lost, and this host isn't offered until it's back.",
    }),
    calendars: z.array(
      z.object({
        id: z.string(),
        external_id: z.string(),
        read_busy: z.boolean().meta({ description: "Whether its busy times block slots." }),
        write_target: z.boolean().meta({ description: "Whether bookings are written to it." }),
        verified_at: z.string().nullable(),
      }),
    ),
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
    read_busy: z.boolean().optional(),
    write_target: z.boolean().optional().meta({
      description: "Bookings are written to one calendar; setting this moves it here.",
    }),
  })
  .meta({ id: "UpdateCalendarRequest", examples: [{ read_busy: true }] });

export const SetSimulatedBusyRequest = z
  .strictObject({
    intervals: z.array(z.strictObject({ start: Instant, end: Instant })).max(500),
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
