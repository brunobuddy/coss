/**
 * Public wire schemas for Scheduling (snake_case). Plain zod with `.meta({ id })`, shared by the
 * public API, its OpenAPI document and the contract tests. Must not import the database (or
 * `@coss/email`): `@coss/scheduling/schemas` is safe to load anywhere.
 */
import { LATEST_API_VERSION } from "@coss/versioning";
import { z } from "zod";
import { LOGO_MAX_BYTES } from "./branding.ts";
import {
  REMINDER_NAME_VARIABLES,
  REMINDER_URL_VARIABLES,
  REMINDER_VARIABLES,
  reminderCopyProblem,
  reminderKeyOf,
} from "./reminder-copy.ts";

export { reminderKeyOf };

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
  "scheduling.booking.started",
  "scheduling.booking.ended",
  "scheduling.booking.reminder",
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

const E164 = z.string().regex(/^\+[1-9]\d{6,14}$/, "Use E.164.");

export const CreateHostRequest = z
  .strictObject({
    uid: HostUid.optional(),
    name: z.string().min(1).max(100),
    email: z.email().max(320).optional().meta({
      description: "Where this host's notifications go. Not an identity, and need not be unique.",
    }),
    phone: E164.optional().meta({
      description: "Where this host's SMS reminders go, in E.164.",
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
    phone: E164.nullable().optional(),
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
  phone: null,
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
    phone: z.string().nullable(),
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

export const REMINDER_ANCHORS = [
  "start",
  "end",
  "confirmed",
  "rescheduled",
  "cancelled",
  "declined",
  "pending_approval",
  "no_show",
] as const;
export const REMINDER_SENDS = [
  "email_attendee",
  "email_host",
  "sms_attendee",
  "sms_host",
  "webhook",
] as const;
export const MAX_REMINDERS = 10;
/** Without `email_from` these go out from coss.com's own address, at coss.com's cost. */
export const MAX_REMINDER_EMAILS_FROM_COSS = 2;
const MAX_BEFORE_MINUTES = 525600;
// Inside the 90 days after which an attendee's details are erased.
const MAX_AFTER_MINUTES = 60 * 24 * 60;
const REMINDER_LOCATION_TYPES = [
  "link",
  "phone",
  "in_person",
  "google_meet",
  "microsoft_teams",
  "zoom",
] as const;

const SMS_VARIABLES = Object.keys(REMINDER_VARIABLES).filter(
  (name) => !(REMINDER_NAME_VARIABLES as readonly string[]).includes(name),
);
const REMINDER_KEY = /^[a-z0-9_-]{1,64}$/;

const ReminderButton = z
  .strictObject({
    label: z.string().min(1).max(40),
    url: z
      .string()
      .min(1)
      .max(500)
      .meta({
        description:
          "https, on one of your verified domains (live environments). May use `{{booking_id}}`.",
        examples: ["https://example.com/feedback?booking={{booking_id}}"],
      }),
  })
  .meta({ id: "SchedulingReminderButton" });

const ReminderOnlyIf = z
  .strictObject({
    metadata: z.record(z.string().max(64), z.string().max(500)).nullable().optional().meta({
      description: "The booking's metadata must have all of these.",
    }),
    location_types: z
      .array(z.enum(REMINDER_LOCATION_TYPES))
      .min(1)
      .max(6)
      .nullable()
      .optional()
      .meta({
        description: "The booking's location must be one of these.",
      }),
  })
  .meta({ id: "SchedulingReminderCondition" });

/** Rules that hold whatever else is in the list. Who may send what is checked by `reminders.ts`. */
const ReminderInput = z
  .strictObject({
    key: z.string().regex(REMINDER_KEY, "Use up to 64 of a-z, 0-9, _ and -.").optional().meta({
      description:
        "Names this reminder in webhooks and on the booking. Default: from its timing, like `start-1440`.",
    }),
    anchor: z.enum(REMINDER_ANCHORS).meta({ description: "The moment this is timed from." }),
    before_minutes: z.number().int().min(0).max(MAX_BEFORE_MINUTES).nullable().optional().meta({
      description: "How long before the anchor. Only for `start` and `end`.",
    }),
    after_minutes: z.number().int().min(0).max(MAX_AFTER_MINUTES).nullable().optional().meta({
      description: "How long after the anchor, up to 60 days. Default for other anchors: 0.",
    }),
    send: z.array(z.enum(REMINDER_SENDS)).max(REMINDER_SENDS.length).optional().meta({
      description: "Who hears about it. `webhook` fires `scheduling.booking.reminder`.",
    }),
    email_to: z.array(z.email().max(320)).max(5).optional().meta({
      description:
        "Fixed addresses to email as well: verified members of your organization, or addresses on your verified domains (live environments).",
    }),
    subject: z.string().min(1).max(200).nullable().optional().meta({
      description: "Your own subject, with `{{variables}}`. Needs `email_from`.",
    }),
    message: z.string().min(1).max(2000).nullable().optional().meta({
      description:
        "Your own words in place of the standard first line, with `{{variables}}` and no links. The booking's details stay below it. Needs `email_from`.",
    }),
    sms_message: z.string().min(1).max(320).nullable().optional().meta({
      description:
        "Your own text, with `{{variables}}` other than names, and no links. `Reply STOP to opt out.` is always added.",
    }),
    button: ReminderButton.nullable().optional().meta({
      description: "One button in the email. Needs `email_from`.",
    }),
    include_invite: z.boolean().optional().meta({
      description: "Attach the calendar invitation to the emails.",
    }),
    send_if_late: z.boolean().optional().meta({
      description:
        "If it was booked after this reminder's moment, send it right away instead of skipping it, as long as the meeting is still ahead. Only for `before_minutes` on `start`.",
    }),
    skip_no_show: z.boolean().optional().meta({
      description: "Don't send it once the booking is marked a no-show. Default: true on `end`.",
    }),
    only_if: ReminderOnlyIf.nullable().optional().meta({
      description: "Only for bookings matching all of this, checked when it's due.",
    }),
  })
  .superRefine((rule, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    const timed = rule.anchor === "start" || rule.anchor === "end";
    const before = rule.before_minutes != null;
    const after = rule.after_minutes != null;
    if (before && after) {
      issue("before_minutes", "Set `before_minutes` or `after_minutes`, not both.");
    }
    if (timed && !before && !after) {
      issue("before_minutes", `\`${rule.anchor}\` needs \`before_minutes\` or \`after_minutes\`.`);
    }
    if (!timed && before) {
      issue("before_minutes", `\`${rule.anchor}\` has already happened: use \`after_minutes\`.`);
    }
    const send = rule.send ?? [];
    if (new Set(send).size !== send.length) issue("send", "List each one once.");
    const emails =
      send.some((item) => item.startsWith("email_")) || (rule.email_to?.length ?? 0) > 0;
    if (send.length === 0 && !rule.email_to?.length) {
      issue("send", "Choose who this goes to, with `send` or `email_to`.");
    }
    if (!emails) {
      for (const field of ["subject", "message", "button", "include_invite"] as const) {
        if (rule[field]) issue(field, `\`${field}\` needs an email in \`send\` or \`email_to\`.`);
      }
    }
    if (rule.sms_message && !send.some((item) => item.startsWith("sms_"))) {
      issue("sms_message", "`sms_message` needs an SMS in `send`.");
    }
    if (rule.send_if_late && !(rule.anchor === "start" && before)) {
      issue("send_if_late", "Only a reminder before `start` can be late.");
    }
    const inviteAnchors = ["confirmed", "rescheduled", "cancelled", "declined"];
    if (
      rule.include_invite &&
      !inviteAnchors.includes(rule.anchor) &&
      !(rule.anchor === "start" && before)
    ) {
      issue("include_invite", "An invitation goes with a reminder before `start`, or with news.");
    }
    for (const field of ["subject", "message"] as const) {
      const problem = rule[field] ? reminderCopyProblem(rule[field] as string) : null;
      if (problem) issue(field, problem);
    }
    const smsProblem = rule.sms_message
      ? reminderCopyProblem(rule.sms_message, SMS_VARIABLES)
      : null;
    if (smsProblem) issue("sms_message", smsProblem);
    if (rule.button) {
      const problem = reminderCopyProblem(rule.button.label);
      if (problem) issue("button", problem);
      const urlProblem = reminderCopyProblem(rule.button.url, REMINDER_URL_VARIABLES);
      if (urlProblem) issue("button", urlProblem);
      else if (!reminderUrlHost(rule.button.url))
        issue("button", "The button's URL must be https.");
    }
  })
  .meta({ id: "SchedulingReminderInput" });
export type ReminderInputOutput = z.output<typeof ReminderInput>;

/** The host a button's URL points at, or `null` if it isn't a plain https URL. */
export function reminderUrlHost(url: string): string | null {
  try {
    const parsed = new URL(url.replace(/\{\{\s*booking_id\s*\}\}/g, "x"));
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export const Reminders = z
  .array(ReminderInput)
  .max(MAX_REMINDERS)
  .superRefine((rules, ctx) => {
    const seen = new Set<string>();
    for (const [index, rule] of rules.entries()) {
      const key = reminderKeyOf(rule);
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "key"],
          message: `Two reminders are called "${key}". Give one a \`key\` of its own.`,
        });
      }
      seen.add(key);
    }
  });

const ReminderObject = z
  .object({
    key: z.string(),
    anchor: z.enum(REMINDER_ANCHORS),
    before_minutes: z.number().nullable(),
    after_minutes: z.number().nullable(),
    send: z.array(z.enum(REMINDER_SENDS)),
    email_to: z.array(z.string()),
    subject: z.string().nullable(),
    message: z.string().nullable(),
    sms_message: z.string().nullable(),
    button: z.object({ label: z.string(), url: z.string() }).nullable(),
    include_invite: z.boolean(),
    send_if_late: z.boolean(),
    skip_no_show: z.boolean(),
    only_if: z
      .object({
        metadata: z.record(z.string(), z.string()).nullable(),
        location_types: z.array(z.string()).nullable(),
      })
      .nullable(),
  })
  .meta({ id: "SchedulingReminder" });
export type ReminderObjectOutput = z.output<typeof ReminderObject>;

const NotificationPolicy = z.record(
  z.string().max(64),
  z.strictObject({
    email_attendee: z.boolean().optional(),
    email_host: z.boolean().optional(),
    sms_attendee: z.boolean().optional(),
  }),
);
const NotificationPolicyOutput = z.record(
  z.string(),
  z.object({
    email_attendee: z.boolean().optional(),
    email_host: z.boolean().optional(),
    sms_attendee: z.boolean().optional(),
  }),
);

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
  approval_ttl_minutes: z.number().int().min(5).max(43200).optional(),
  hold_ttl_seconds: z.number().int().min(60).max(86400).optional(),
  cancel_notice_minutes: z.number().int().min(0).max(525600).optional().meta({
    description: "Attendees can't cancel closer to the start than this. API keys can.",
  }),
  reschedule_notice_minutes: z.number().int().min(0).max(525600).optional(),
  max_guests: z.number().int().min(0).max(MAX_GUESTS).optional().meta({
    description:
      "How many people an attendee can add to a booking. Default: 0. Guests are emailed about it. Not on `group`.",
  }),
  host_calendar_details: z.enum(HOST_CALENDAR_DETAILS).optional().meta({
    description:
      "What hosts' calendars say about a booking. `neutral` (the default): a private event titled \"Appointment\". `full`: a private event with this title and the attendee's name, plus names, emails and phone numbers in its description, which go to the host's calendar provider. Never answers. Refused in HIPAA mode.",
  }),
  questions: z.array(Question).max(25).optional(),
  locations: z.array(Location).max(10).optional(),
  host_filter: Attributes.nullable().optional().meta({
    description: "Pool members also include active hosts matching all of these attributes.",
  }),
  notifications: NotificationPolicy.nullable().optional().meta({
    description: "Per event, overriding your settings for this event type.",
  }),
  reminders: Reminders.nullable().optional().meta({
    description:
      "Replaces your settings' `reminders` for this event type. `null` inherits them; an empty list means none.",
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
  approval_ttl_minutes: 1440,
  hold_ttl_seconds: 600,
  cancel_notice_minutes: 0,
  reschedule_notice_minutes: 0,
  max_guests: 0,
  host_calendar_details: "neutral" as const,
  questions: [],
  locations: [],
  host_filter: null,
  notifications: null,
  reminders: null,
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
    approval_ttl_minutes: z.number(),
    hold_ttl_seconds: z.number(),
    cancel_notice_minutes: z.number(),
    reschedule_notice_minutes: z.number(),
    max_guests: z.number(),
    host_calendar_details: z.enum(HOST_CALENDAR_DETAILS),
    questions: z.array(Question),
    locations: z.array(Location),
    host_filter: z.record(z.string(), z.union([z.string(), z.array(z.string())])).nullable(),
    notifications: NotificationPolicyOutput.nullable(),
    reminders: z.array(ReminderObject).nullable(),
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

const GuestInput = z
  .strictObject({
    email: z.email().max(320),
    name: z.string().min(1).max(100).optional(),
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
    email_reply_to: z.string().nullable(),
    reminders: z.array(ReminderObject).nullable().meta({
      description:
        "What goes out around a booking, unless an event type has its own. `null`: a reminder a day before, on the channels `notifications.reminder` chooses.",
    }),
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
        email_reply_to: null,
        reminders: null,
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
    email_reply_to: z.email().max(320).nullable().optional().meta({
      description: "Where replies go, for emails from `email_from`.",
    }),
    notifications: NotificationPolicy.nullable().optional(),
    reminders: Reminders.nullable().optional().meta({
      description:
        "What goes out around a booking, unless an event type has its own. `null` goes back to a reminder a day before.",
    }),
  })
  .meta({ id: "UpdateSchedulingSettingsRequest", examples: [{ brand_name: "Acme Health" }] });
export type UpdateSettingsRequestOutput = z.output<typeof UpdateSettingsRequest>;

export const BookingNotificationObject = z
  .object({
    object: z.literal("scheduling.booking_notification"),
    id: z.string(),
    kind: z.string().meta({
      description:
        "`reminder` for an entry of `reminders`; otherwise a standard notification, or `started`/`ended`.",
    }),
    reminder_key: z.string().nullable(),
    channel: z.enum(["email", "sms", "webhook"]),
    recipient: z.enum(["attendee", "host", "endpoint", "address"]),
    due_at: z.string(),
    finished_at: z.string().nullable(),
    outcome: z.string().nullable().meta({
      description:
        "`null` while it's waiting. `sent`, or why not: `too_late`, `filtered`, `no_show`, `no_address`, `no_sender`, `stale`, `superseded`, `failed`.",
    }),
  })
  .meta({
    id: "SchedulingBookingNotification",
    examples: [
      {
        object: "scheduling.booking_notification",
        id: "sntf_01kd2m9a0b1c2d3e4f5g6h7j8m",
        kind: "reminder",
        reminder_key: "start-1440",
        channel: "email",
        recipient: "attendee",
        due_at: "2027-01-03T15:00:00.000Z",
        finished_at: null,
        outcome: null,
      },
    ],
  });
export type BookingNotificationObjectOutput = z.output<typeof BookingNotificationObject>;

export const BookingNotificationList = listOf(
  BookingNotificationObject,
  "SchedulingBookingNotificationList",
  {
    object: "scheduling.booking_notification" as const,
    id: "sntf_01kd2m9a0b1c2d3e4f5g6h7j8m",
    kind: "reminder",
    reminder_key: "start-1440",
    channel: "email" as const,
    recipient: "attendee" as const,
    due_at: "2027-01-03T15:00:00.000Z",
    finished_at: null,
    outcome: null,
  },
);

export const ErasedAttendee = z
  .object({ object: z.literal("scheduling.attendee_erasure"), uid: z.string(), erased: z.number() })
  .meta({
    id: "SchedulingAttendeeErasure",
    examples: [{ object: "scheduling.attendee_erasure", uid: "patient_77", erased: 3 }],
  });

export const EraseAttendeeByEmailRequest = z.strictObject({ email: z.email().max(320) }).meta({
  id: "EraseSchedulingAttendeeByEmailRequest",
  examples: [{ email: "sam@example.com" }],
});

export const ErasedAttendeeByEmail = z
  .object({ object: z.literal("scheduling.attendee_erasure"), erased: z.number() })
  .meta({
    id: "SchedulingAttendeeErasureByEmail",
    examples: [{ object: "scheduling.attendee_erasure", erased: 3 }],
  });

const BookingAttendee = z.object({
  id: z.string(),
  role: z.enum(["attendee", "guest"]).meta({
    description: "`attendee` booked it and comes first; a `guest` was added by them.",
  }),
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
    reminder: z
      .object({
        key: z.string(),
        anchor: z.enum(REMINDER_ANCHORS),
        before_minutes: z.number().nullable(),
        after_minutes: z.number().nullable(),
        scheduled_for: z.string(),
      })
      .optional()
      .meta({ description: "Which reminder this is, on `scheduling.booking.reminder`." }),
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
