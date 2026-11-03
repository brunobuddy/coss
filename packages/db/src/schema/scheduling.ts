/**
 * Scheduling (`@coss/scheduling`): an environment's hosts, what they offer and when, the calendars
 * they connect, and bookings. `scheduling_claim` is what prevents double-booking: its exclusion
 * constraint (`scheduling_claim_no_overlap`, a custom migration drizzle can't declare) is the only
 * enforcement, and every live booking holds a claim per host.
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { ID_PREFIXES, newId } from "../id.ts";
import { environment } from "./domain.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const instant = (name: string) => timestamp(name, { withTimezone: true });

/** One weekly availability rule: minutes past local midnight, `end` up to 1440. Sunday is 0. */
export type SchedulingWeeklyRule = { days: number[]; startMinute: number; endMinute: number };
export type SchedulingMinuteRange = { startMinute: number; endMinute: number };

export type SchedulingBookingWindow =
  | { kind: "rolling"; days: number }
  | { kind: "range"; from: string; to: string };

export type SchedulingLimit = {
  period: "day" | "week";
  /** Bookings per period, per host, across all or just this event type. */
  max: number;
  scope: "event_type" | "host";
};

export type SchedulingQuestion = {
  key: string;
  type: "text" | "textarea" | "select" | "radio" | "checkbox" | "phone" | "email" | "number";
  label: string;
  required: boolean;
  options: string[];
};

export type SchedulingLocation =
  | { type: "link"; url: string | null }
  | { type: "phone"; number: string | null }
  | { type: "in_person"; address: string | null }
  | { type: "google_meet" }
  | { type: "microsoft_teams" }
  | { type: "zoom" };

/** `true`/`false` per recipient and channel; absent events use the default policy. */
export type SchedulingNotificationPolicy = Record<
  string,
  { emailAttendee?: boolean; emailHost?: boolean; smsAttendee?: boolean }
>;

export type SchedulingActor =
  | { kind: "api_key"; id: string }
  | { kind: "user"; id: string }
  | { kind: "host_session"; id: string }
  | { kind: "booker_session"; id: string }
  | { kind: "manage_session"; id: string }
  | { kind: "system" };

export const schedulingHostStatus = pgEnum("scheduling_host_status", ["active", "disabled"]);
export const schedulingEventTypeKind = pgEnum("scheduling_event_type_kind", [
  "one_on_one",
  "pool",
  "collective",
  "group",
]);
export const schedulingEventTypeStatus = pgEnum("scheduling_event_type_status", [
  "active",
  "archived",
]);
export const schedulingHostRole = pgEnum("scheduling_host_role", ["required", "member"]);
export const schedulingCalendarProvider = pgEnum("scheduling_calendar_provider", [
  "google",
  "microsoft",
  "caldav",
  "simulated",
]);
export const schedulingConnectionStatus = pgEnum("scheduling_connection_status", [
  "active",
  "needs_reauth",
]);
export const schedulingBookingStatus = pgEnum("scheduling_booking_status", [
  "held",
  "pending_approval",
  "confirmed",
  "cancelled",
  "declined",
]);
export const schedulingCalendarEventState = pgEnum("scheduling_calendar_event_state", [
  "present",
  "absent",
]);
export const schedulingExternalState = pgEnum("scheduling_external_state", [
  "in_sync",
  "moved",
  "deleted",
]);
export const schedulingNotificationChannel = pgEnum("scheduling_notification_channel", [
  "email",
  "sms",
]);
export const schedulingNotificationRecipient = pgEnum("scheduling_notification_recipient", [
  "attendee",
  "host",
]);
export const schedulingSessionKind = pgEnum("scheduling_session_kind", [
  "host",
  "booker",
  "manage",
]);
export const schedulingCalendarFailureMode = pgEnum("scheduling_calendar_failure_mode", [
  "hide",
  "last_known",
]);

/** A person who can be booked, one of the customer's end users. Addressed by its id or `uid`. */
export const schedulingHost = pgTable(
  "scheduling_host",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.schedulingHost)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    uid: text("uid"),
    name: text("name").notNull(),
    // Where notifications go; never an identity, and not unique.
    email: text("email"),
    timeZone: text("time_zone").notNull(),
    attributes: jsonb("attributes")
      .$type<Record<string, string | string[]>>()
      .notNull()
      .default({}),
    metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
    status: schedulingHostStatus("status").notNull().default("active"),
    screenedAt: instant("screened_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "scheduling_host_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    unique("scheduling_host_environment_uid_unique").on(t.environmentId, t.uid),
    unique("scheduling_host_id_organization_unique").on(t.id, t.organizationId),
    index("scheduling_host_environment_created_at_idx").on(t.environmentId, t.createdAt, t.id),
    index("scheduling_host_attributes_idx").using("gin", t.attributes.op("jsonb_path_ops")),
  ],
);

export const schedulingSchedule = pgTable(
  "scheduling_schedule",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.schedulingSchedule)),
    organizationId: text("organization_id").notNull(),
    environmentId: text("environment_id").notNull(),
    hostId: text("host_id").notNull(),
    name: text("name").notNull(),
    timeZone: text("time_zone").notNull(),
    rules: jsonb("rules").$type<SchedulingWeeklyRule[]>().notNull().default([]),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "scheduling_schedule_host_fk",
      columns: [t.hostId, t.organizationId],
      foreignColumns: [schedulingHost.id, schedulingHost.organizationId],
    }).onDelete("cascade"),
    unique("scheduling_schedule_id_organization_unique").on(t.id, t.organizationId),
    uniqueIndex("scheduling_schedule_host_default_unique").on(t.hostId).where(sql`${t.isDefault}`),
    index("scheduling_schedule_host_idx").on(t.hostId),
  ],
);

/** One local date of a schedule, replacing its weekly rules; no ranges means unavailable. */
export const schedulingScheduleOverride = pgTable(
  "scheduling_schedule_override",
  {
    scheduleId: text("schedule_id").notNull(),
    organizationId: text("organization_id").notNull(),
    // The schedule's local date, never an instant: it must not pass through `Date`.
    date: date("date", { mode: "string" }).notNull(),
    ranges: jsonb("ranges").$type<SchedulingMinuteRange[]>().notNull().default([]),
  },
  (t) => [
    primaryKey({ columns: [t.scheduleId, t.date] }),
    foreignKey({
      name: "scheduling_schedule_override_schedule_fk",
      columns: [t.scheduleId, t.organizationId],
      foreignColumns: [schedulingSchedule.id, schedulingSchedule.organizationId],
    }).onDelete("cascade"),
  ],
);

/** What can be booked. Bookings snapshot what they need, so edits never change an existing one. */
export const schedulingEventType = pgTable(
  "scheduling_event_type",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.schedulingEventType)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    uid: text("uid"),
    title: text("title").notNull(),
    kind: schedulingEventTypeKind("kind").notNull().default("one_on_one"),
    status: schedulingEventTypeStatus("status").notNull().default("active"),
    durationMinutes: integer("duration_minutes").notNull(),
    // Other durations an attendee may choose; empty: only `durationMinutes`.
    durationOptions: jsonb("duration_options").$type<number[]>().notNull().default([]),
    stepMinutes: integer("step_minutes").notNull(),
    // The zone slots align in; null: each host's own.
    gridTimeZone: text("grid_time_zone"),
    bufferBeforeMinutes: integer("buffer_before_minutes").notNull().default(0),
    bufferAfterMinutes: integer("buffer_after_minutes").notNull().default(0),
    minNoticeMinutes: integer("min_notice_minutes").notNull().default(0),
    bookingWindow: jsonb("booking_window").$type<SchedulingBookingWindow | null>(),
    limits: jsonb("limits").$type<SchedulingLimit[]>().notNull().default([]),
    capacity: integer("capacity"),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    approvalTtlMinutes: integer("approval_ttl_minutes").notNull().default(1440),
    holdTtlSeconds: integer("hold_ttl_seconds").notNull().default(600),
    cancelNoticeMinutes: integer("cancel_notice_minutes").notNull().default(0),
    rescheduleNoticeMinutes: integer("reschedule_notice_minutes").notNull().default(0),
    questions: jsonb("questions").$type<SchedulingQuestion[]>().notNull().default([]),
    locations: jsonb("locations").$type<SchedulingLocation[]>().notNull().default([]),
    // Attributes a host must have to be in this pool, on top of explicit members.
    hostFilter: jsonb("host_filter").$type<Record<string, string | string[]> | null>(),
    notifications: jsonb("notifications").$type<SchedulingNotificationPolicy | null>(),
    metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
    screenedAt: instant("screened_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "scheduling_event_type_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    unique("scheduling_event_type_environment_uid_unique").on(t.environmentId, t.uid),
    unique("scheduling_event_type_id_organization_unique").on(t.id, t.organizationId),
    index("scheduling_event_type_environment_created_at_idx").on(
      t.environmentId,
      t.createdAt,
      t.id,
    ),
    check("scheduling_event_type_duration_positive", sql`${t.durationMinutes} > 0`),
    check("scheduling_event_type_step_positive", sql`${t.stepMinutes} > 0`),
    check(
      "scheduling_event_type_capacity",
      sql`${t.capacity} IS NULL OR (${t.kind} = 'group' AND ${t.capacity} > 0)`,
    ),
  ],
);

export const schedulingEventTypeHost = pgTable(
  "scheduling_event_type_host",
  {
    eventTypeId: text("event_type_id").notNull(),
    hostId: text("host_id").notNull(),
    organizationId: text("organization_id").notNull(),
    role: schedulingHostRole("role").notNull().default("member"),
    weight: integer("weight").notNull().default(100),
    // Bookings assigned, net of cancellations before the start: the pool's fairness counter.
    fairUnits: integer("fair_units").notNull().default(0),
    lastAssignedAt: instant("last_assigned_at"),
    // Null: the host's default schedule.
    scheduleId: text("schedule_id"),
    // Set instead of deleting, so a removal can't race a booking that's already choosing the host.
    removedAt: instant("removed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.eventTypeId, t.hostId] }),
    foreignKey({
      name: "scheduling_event_type_host_event_type_fk",
      columns: [t.eventTypeId, t.organizationId],
      foreignColumns: [schedulingEventType.id, schedulingEventType.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "scheduling_event_type_host_host_fk",
      columns: [t.hostId, t.organizationId],
      foreignColumns: [schedulingHost.id, schedulingHost.organizationId],
    }).onDelete("cascade"),
    index("scheduling_event_type_host_host_idx").on(t.hostId),
    check("scheduling_event_type_host_weight_positive", sql`${t.weight} > 0`),
  ],
);

export const schedulingCalendarConnection = pgTable(
  "scheduling_calendar_connection",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.schedulingCalendarConnection)),
    organizationId: text("organization_id").notNull(),
    environmentId: text("environment_id").notNull(),
    hostId: text("host_id").notNull(),
    provider: schedulingCalendarProvider("provider").notNull(),
    // The provider's name for the account (an address, or a CalDAV user and URL).
    accountId: text("account_id").notNull(),
    // `encryptSecret`, and listed in `reencryptWebhookSecrets`. Null for the simulated provider.
    encryptedCredentials: text("encrypted_credentials"),
    status: schedulingConnectionStatus("status").notNull().default("active"),
    lastErrorCode: text("last_error_code"),
    lastErrorAt: instant("last_error_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "scheduling_calendar_connection_host_fk",
      columns: [t.hostId, t.organizationId],
      foreignColumns: [schedulingHost.id, schedulingHost.organizationId],
    }).onDelete("cascade"),
    unique("scheduling_calendar_connection_id_organization_unique").on(t.id, t.organizationId),
    unique("scheduling_calendar_connection_account_unique").on(t.hostId, t.provider, t.accountId),
  ],
);

/** One calendar of a connection. Holds no name or description: only what sync needs. */
export const schedulingCalendar = pgTable(
  "scheduling_calendar",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.schedulingCalendar)),
    organizationId: text("organization_id").notNull(),
    environmentId: text("environment_id").notNull(),
    hostId: text("host_id").notNull(),
    connectionId: text("connection_id").notNull(),
    externalId: text("external_id").notNull(),
    readBusy: boolean("read_busy").notNull().default(true),
    writeTarget: boolean("write_target").notNull().default(false),
    // When its busy times were last known to be right, and how far ahead they reach.
    verifiedAt: instant("verified_at"),
    coveredUntil: instant("covered_until"),
    dirtyAt: instant("dirty_at"),
    // Fences replacement: a slower, older fetch can't overwrite a newer one's intervals.
    lastFetchStartedAt: instant("last_fetch_started_at"),
    nextSyncAt: instant("next_sync_at").notNull().defaultNow(),
    leaseUntil: instant("lease_until"),
    syncFailures: integer("sync_failures").notNull().default(0),
    channelId: text("channel_id"),
    channelResourceId: text("channel_resource_id"),
    channelTokenHash: text("channel_token_hash"),
    channelExpiresAt: instant("channel_expires_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "scheduling_calendar_connection_fk",
      columns: [t.connectionId, t.organizationId],
      foreignColumns: [
        schedulingCalendarConnection.id,
        schedulingCalendarConnection.organizationId,
      ],
    }).onDelete("cascade"),
    unique("scheduling_calendar_id_organization_unique").on(t.id, t.organizationId),
    unique("scheduling_calendar_connection_external_unique").on(t.connectionId, t.externalId),
    uniqueIndex("scheduling_calendar_host_write_target_unique")
      .on(t.hostId)
      .where(sql`${t.writeTarget}`),
    index("scheduling_calendar_host_idx").on(t.hostId),
    index("scheduling_calendar_channel_idx").on(t.channelId),
    index("scheduling_calendar_next_sync_idx").on(t.nextSyncAt),
  ],
);

/** A time a calendar is busy. Never anything else: no title, attendee or event id. */
export const schedulingBusyInterval = pgTable(
  "scheduling_busy_interval",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    organizationId: text("organization_id").notNull(),
    calendarId: text("calendar_id").notNull(),
    hostId: text("host_id").notNull(),
    startAt: instant("start_at").notNull(),
    endAt: instant("end_at").notNull(),
  },
  (t) => [
    foreignKey({
      name: "scheduling_busy_interval_calendar_fk",
      columns: [t.calendarId, t.organizationId],
      foreignColumns: [schedulingCalendar.id, schedulingCalendar.organizationId],
    }).onDelete("cascade"),
    index("scheduling_busy_interval_host_idx").on(t.hostId, t.endAt, t.startAt),
    index("scheduling_busy_interval_calendar_idx").on(t.calendarId),
  ],
);

export const schedulingGroupSession = pgTable(
  "scheduling_group_session",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.schedulingGroupSession)),
    organizationId: text("organization_id").notNull(),
    environmentId: text("environment_id").notNull(),
    eventTypeId: text("event_type_id").notNull(),
    hostId: text("host_id").notNull(),
    startAt: instant("start_at").notNull(),
    endAt: instant("end_at").notNull(),
    capacity: integer("capacity").notNull(),
    usageRecordedAt: instant("usage_recorded_at"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "scheduling_group_session_event_type_fk",
      columns: [t.eventTypeId, t.organizationId],
      foreignColumns: [schedulingEventType.id, schedulingEventType.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "scheduling_group_session_host_fk",
      columns: [t.hostId, t.organizationId],
      foreignColumns: [schedulingHost.id, schedulingHost.organizationId],
    }).onDelete("cascade"),
    unique("scheduling_group_session_id_organization_unique").on(t.id, t.organizationId),
    unique("scheduling_group_session_slot_unique").on(t.eventTypeId, t.hostId, t.startAt),
  ],
);

/** A recurring booking's creation record; each occurrence is an ordinary booking. */
export const schedulingSeries = pgTable(
  "scheduling_series",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.schedulingSeries)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    eventTypeId: text("event_type_id").notNull(),
    rule: jsonb("rule")
      .$type<{ frequency: "weekly" | "monthly"; interval: number; count: number }>()
      .notNull(),
    // Occurrences keep this zone's wall clock across DST changes.
    anchorTimeZone: text("anchor_time_zone").notNull(),
    idempotencyKey: text("idempotency_key"),
    requestHash: text("request_hash"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "scheduling_series_event_type_fk",
      columns: [t.eventTypeId, t.organizationId],
      foreignColumns: [schedulingEventType.id, schedulingEventType.organizationId],
    }).onDelete("cascade"),
    unique("scheduling_series_id_organization_unique").on(t.id, t.organizationId),
    unique("scheduling_series_environment_idempotency_unique").on(
      t.environmentId,
      t.idempotencyKey,
    ),
    index("scheduling_series_environment_idx").on(t.environmentId, t.createdAt),
  ],
);

/** A hold is a `held` booking, so converting one is a single compare-and-set on this row. */
export const schedulingBooking = pgTable(
  "scheduling_booking",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.schedulingBooking)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    eventTypeId: text("event_type_id").notNull(),
    status: schedulingBookingStatus("status").notNull(),
    startAt: instant("start_at").notNull(),
    endAt: instant("end_at").notNull(),
    // Snapshots: an edited event type never changes what an existing booking occupies.
    title: text("title").notNull(),
    bufferBeforeMinutes: integer("buffer_before_minutes").notNull(),
    bufferAfterMinutes: integer("buffer_after_minutes").notNull(),
    location: jsonb("location").$type<SchedulingLocation | null>(),
    holdExpiresAt: instant("hold_expires_at"),
    approvalExpiresAt: instant("approval_expires_at"),
    seriesId: text("series_id"),
    seriesIndex: integer("series_index"),
    groupSessionId: text("group_session_id"),
    // Bumped by every change; notifications and calendar writes compare against it.
    version: integer("version").notNull().default(1),
    metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
    idempotencyKey: text("idempotency_key"),
    requestHash: text("request_hash"),
    usageRecordedAt: instant("usage_recorded_at"),
    // Booked without verified calendars (`last_known` mode).
    calendarUnverified: boolean("calendar_unverified").notNull().default(false),
    externalConflictAt: instant("external_conflict_at"),
    noShowAt: instant("no_show_at"),
    cancelledAt: instant("cancelled_at"),
    redactedAt: instant("redacted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "scheduling_booking_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "scheduling_booking_event_type_fk",
      columns: [t.eventTypeId, t.organizationId],
      foreignColumns: [schedulingEventType.id, schedulingEventType.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "scheduling_booking_series_fk",
      columns: [t.seriesId, t.organizationId],
      foreignColumns: [schedulingSeries.id, schedulingSeries.organizationId],
    }).onDelete("set null"),
    foreignKey({
      name: "scheduling_booking_group_session_fk",
      columns: [t.groupSessionId, t.organizationId],
      foreignColumns: [schedulingGroupSession.id, schedulingGroupSession.organizationId],
    }).onDelete("set null"),
    unique("scheduling_booking_id_organization_unique").on(t.id, t.organizationId),
    unique("scheduling_booking_environment_idempotency_unique").on(
      t.environmentId,
      t.idempotencyKey,
    ),
    index("scheduling_booking_environment_start_idx").on(t.environmentId, t.startAt, t.id),
    index("scheduling_booking_event_type_start_idx").on(t.eventTypeId, t.startAt),
    index("scheduling_booking_series_idx").on(t.seriesId, t.seriesIndex),
    index("scheduling_booking_group_session_idx").on(t.groupSessionId),
    index("scheduling_booking_end_idx").on(t.endAt),
    index("scheduling_booking_hold_expiry_idx")
      .on(t.holdExpiresAt)
      .where(sql`${t.status} = 'held'`),
    index("scheduling_booking_approval_expiry_idx")
      .on(t.approvalExpiresAt)
      .where(sql`${t.status} = 'pending_approval'`),
    check("scheduling_booking_time_order", sql`${t.startAt} < ${t.endAt}`),
    check(
      "scheduling_booking_hold_has_expiry",
      sql`${t.status} <> 'held' OR ${t.holdExpiresAt} IS NOT NULL`,
    ),
    check(
      "scheduling_booking_approval_has_expiry",
      sql`${t.status} <> 'pending_approval' OR ${t.approvalExpiresAt} IS NOT NULL`,
    ),
  ],
);

export const schedulingBookingHost = pgTable(
  "scheduling_booking_host",
  {
    bookingId: text("booking_id").notNull(),
    hostId: text("host_id").notNull(),
    organizationId: text("organization_id").notNull(),
    role: schedulingHostRole("role").notNull().default("member"),
  },
  (t) => [
    primaryKey({ columns: [t.bookingId, t.hostId] }),
    foreignKey({
      name: "scheduling_booking_host_booking_fk",
      columns: [t.bookingId, t.organizationId],
      foreignColumns: [schedulingBooking.id, schedulingBooking.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "scheduling_booking_host_host_fk",
      columns: [t.hostId, t.organizationId],
      foreignColumns: [schedulingHost.id, schedulingHost.organizationId],
    }).onDelete("cascade"),
    index("scheduling_booking_host_host_idx").on(t.hostId),
  ],
);

/**
 * A host's occupied time. Exactly one live claim per host per live booking (or group session).
 * `live_until` is null for a booking and the expiry for a hold or pending approval, computed in
 * SQL because a value before `live_from` raises an error rather than a conflict.
 */
export const schedulingClaim = pgTable(
  "scheduling_claim",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.schedulingClaim)),
    organizationId: text("organization_id").notNull(),
    environmentId: text("environment_id").notNull(),
    hostId: text("host_id").notNull(),
    eventTypeId: text("event_type_id").notNull(),
    bookingId: text("booking_id"),
    groupSessionId: text("group_session_id"),
    occupiedStart: instant("occupied_start").notNull(),
    occupiedEnd: instant("occupied_end").notNull(),
    liveFrom: instant("live_from").notNull(),
    liveUntil: instant("live_until"),
    // The host's local day and Monday-started week of the start, for limits.
    limitDay: date("limit_day", { mode: "string" }).notNull(),
    limitWeek: date("limit_week", { mode: "string" }).notNull(),
  },
  (t) => [
    foreignKey({
      name: "scheduling_claim_host_fk",
      columns: [t.hostId, t.organizationId],
      foreignColumns: [schedulingHost.id, schedulingHost.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "scheduling_claim_booking_fk",
      columns: [t.bookingId, t.organizationId],
      foreignColumns: [schedulingBooking.id, schedulingBooking.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "scheduling_claim_group_session_fk",
      columns: [t.groupSessionId, t.organizationId],
      foreignColumns: [schedulingGroupSession.id, schedulingGroupSession.organizationId],
    }).onDelete("cascade"),
    index("scheduling_claim_booking_idx").on(t.bookingId),
    index("scheduling_claim_group_session_idx").on(t.groupSessionId),
    index("scheduling_claim_host_day_idx").on(t.hostId, t.limitDay),
    index("scheduling_claim_host_week_idx").on(t.hostId, t.limitWeek),
    check("scheduling_claim_occupied_order", sql`${t.occupiedStart} < ${t.occupiedEnd}`),
    check(
      "scheduling_claim_live_order",
      sql`${t.liveUntil} IS NULL OR ${t.liveFrom} < ${t.liveUntil}`,
    ),
    check(
      "scheduling_claim_one_owner",
      sql`(${t.bookingId} IS NULL) <> (${t.groupSessionId} IS NULL)`,
    ),
  ],
);

/** A row that exists only to be locked while a limit period's live claims are counted. */
export const schedulingLimitBucket = pgTable(
  "scheduling_limit_bucket",
  {
    organizationId: text("organization_id").notNull(),
    scope: text("scope").notNull(),
    scopeId: text("scope_id").notNull(),
    period: text("period").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.scope, t.scopeId, t.period] }),
    index("scheduling_limit_bucket_organization_idx").on(t.organizationId),
    index("scheduling_limit_bucket_created_at_idx").on(t.createdAt),
  ],
);

/** A booking's attendee. Contact details and answers are encrypted; lookups use the HMAC. */
export const schedulingAttendee = pgTable(
  "scheduling_attendee",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.schedulingAttendee)),
    organizationId: text("organization_id").notNull(),
    environmentId: text("environment_id").notNull(),
    bookingId: text("booking_id").notNull(),
    // The customer's own id for this person.
    uid: text("uid"),
    encryptedContact: text("encrypted_contact"),
    emailHmac: text("email_hmac"),
    encryptedAnswers: text("encrypted_answers"),
    timeZone: text("time_zone").notNull(),
    locale: text("locale"),
    redactedAt: instant("redacted_at"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "scheduling_attendee_booking_fk",
      columns: [t.bookingId, t.organizationId],
      foreignColumns: [schedulingBooking.id, schedulingBooking.organizationId],
    }).onDelete("cascade"),
    index("scheduling_attendee_booking_idx").on(t.bookingId),
    index("scheduling_attendee_environment_uid_idx").on(t.environmentId, t.uid),
    index("scheduling_attendee_environment_email_idx").on(t.environmentId, t.emailHmac),
  ],
);

/** Append-only history of a booking, sequenced under its row lock. No personal data. */
export const schedulingBookingEvent = pgTable(
  "scheduling_booking_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.schedulingBookingEvent)),
    organizationId: text("organization_id").notNull(),
    bookingId: text("booking_id").notNull(),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    actor: jsonb("actor").$type<SchedulingActor>().notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: instant("occurred_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "scheduling_booking_event_booking_fk",
      columns: [t.bookingId, t.organizationId],
      foreignColumns: [schedulingBooking.id, schedulingBooking.organizationId],
    }).onDelete("cascade"),
    unique("scheduling_booking_event_sequence_unique").on(t.bookingId, t.sequence),
  ],
);

/**
 * What a host's calendar should show for a booking, and what it was last made to show. The worker
 * converges on the latest desired state, so a quick create, move and cancel can't reorder. Also how
 * sync recognises coss.com's own events, which `freeBusy` can't identify.
 */
export const schedulingCalendarEvent = pgTable(
  "scheduling_calendar_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.schedulingCalendarEvent)),
    organizationId: text("organization_id").notNull(),
    environmentId: text("environment_id").notNull(),
    bookingId: text("booking_id").notNull(),
    hostId: text("host_id").notNull(),
    calendarId: text("calendar_id").notNull(),
    desiredStart: instant("desired_start").notNull(),
    desiredEnd: instant("desired_end").notNull(),
    desiredState: schedulingCalendarEventState("desired_state").notNull().default("present"),
    desiredVersion: integer("desired_version").notNull().default(1),
    appliedVersion: integer("applied_version").notNull().default(0),
    providerEventId: text("provider_event_id"),
    externalState: schedulingExternalState("external_state").notNull().default("in_sync"),
    nextAttemptAt: instant("next_attempt_at").notNull().defaultNow(),
    leaseUntil: instant("lease_until"),
    attempts: integer("attempts").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "scheduling_calendar_event_booking_fk",
      columns: [t.bookingId, t.organizationId],
      foreignColumns: [schedulingBooking.id, schedulingBooking.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "scheduling_calendar_event_calendar_fk",
      columns: [t.calendarId, t.organizationId],
      foreignColumns: [schedulingCalendar.id, schedulingCalendar.organizationId],
    }).onDelete("cascade"),
    unique("scheduling_calendar_event_target_unique").on(t.bookingId, t.hostId, t.calendarId),
    index("scheduling_calendar_event_host_idx").on(t.hostId, t.desiredEnd, t.desiredStart),
    index("scheduling_calendar_event_due_idx")
      .on(t.nextAttemptAt)
      .where(sql`${t.appliedVersion} < ${t.desiredVersion}`),
  ],
);

/** A notification owed. Holds no content: it's rendered at send time, and dropped if stale. */
export const schedulingNotification = pgTable(
  "scheduling_notification",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.schedulingNotification)),
    organizationId: text("organization_id").notNull(),
    environmentId: text("environment_id").notNull(),
    bookingId: text("booking_id"),
    hostId: text("host_id"),
    kind: text("kind").notNull(),
    channel: schedulingNotificationChannel("channel").notNull(),
    recipient: schedulingNotificationRecipient("recipient").notNull(),
    // Null for news about a host rather than a booking.
    bookingVersion: integer("booking_version"),
    dedupeKey: text("dedupe_key").notNull(),
    dueAt: instant("due_at").notNull(),
    leaseUntil: instant("lease_until"),
    attempts: integer("attempts").notNull().default(0),
    finishedAt: instant("finished_at"),
    outcome: text("outcome"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "scheduling_notification_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "scheduling_notification_booking_fk",
      columns: [t.bookingId, t.organizationId],
      foreignColumns: [schedulingBooking.id, schedulingBooking.organizationId],
    }).onDelete("cascade"),
    unique("scheduling_notification_dedupe_unique").on(t.environmentId, t.dedupeKey),
    index("scheduling_notification_due_idx").on(t.dueAt).where(sql`${t.finishedAt} IS NULL`),
    index("scheduling_notification_booking_idx").on(t.bookingId),
  ],
);

/** A browser's authority, created by the customer's backend. Only the token's sha256 is kept. */
export const schedulingSession = pgTable(
  "scheduling_session",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.schedulingSession)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    kind: schedulingSessionKind("kind").notNull(),
    tokenHash: text("token_hash").notNull(),
    hostId: text("host_id"),
    eventTypeId: text("event_type_id"),
    bookingId: text("booking_id"),
    // A fixed identity for a booker session, so the browser can't book as someone else.
    encryptedAttendee: text("encrypted_attendee"),
    // The fixed identity's `uid`, in the clear like `scheduling_attendee.uid`: how erasure finds it.
    attendeeUid: text("attendee_uid"),
    readOnly: boolean("read_only").notNull().default(false),
    apiKeyId: text("api_key_id"),
    createdByUserId: text("created_by_user_id"),
    expiresAt: instant("expires_at").notNull(),
    revokedAt: instant("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "scheduling_session_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "scheduling_session_host_fk",
      columns: [t.hostId, t.organizationId],
      foreignColumns: [schedulingHost.id, schedulingHost.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "scheduling_session_event_type_fk",
      columns: [t.eventTypeId, t.organizationId],
      foreignColumns: [schedulingEventType.id, schedulingEventType.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "scheduling_session_booking_fk",
      columns: [t.bookingId, t.organizationId],
      foreignColumns: [schedulingBooking.id, schedulingBooking.organizationId],
    }).onDelete("cascade"),
    unique("scheduling_session_token_hash_unique").on(t.tokenHash),
    index("scheduling_session_expires_at_idx").on(t.expiresAt),
    index("scheduling_session_booking_idx").on(t.bookingId),
    index("scheduling_session_attendee_uid_idx")
      .on(t.environmentId, t.attendeeUid)
      .where(sql`${t.attendeeUid} IS NOT NULL`),
    check(
      "scheduling_session_scope",
      sql`(${t.kind} = 'host' AND ${t.hostId} IS NOT NULL)
        OR (${t.kind} = 'booker' AND (${t.eventTypeId} IS NOT NULL OR ${t.hostId} IS NOT NULL))
        OR (${t.kind} = 'manage' AND ${t.bookingId} IS NOT NULL)`,
    ),
  ],
);

/** One calendar consent in progress. Single-use, and it's never a credential: `state` is random. */
export const schedulingOauthState = pgTable(
  "scheduling_oauth_state",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.schedulingOauthState)),
    organizationId: text("organization_id").notNull(),
    environmentId: text("environment_id").notNull(),
    hostId: text("host_id").notNull(),
    provider: schedulingCalendarProvider("provider").notNull(),
    stateHash: text("state_hash").notNull(),
    encryptedCodeVerifier: text("encrypted_code_verifier").notNull(),
    returnUrl: text("return_url"),
    expiresAt: instant("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "scheduling_oauth_state_host_fk",
      columns: [t.hostId, t.organizationId],
      foreignColumns: [schedulingHost.id, schedulingHost.organizationId],
    }).onDelete("cascade"),
    unique("scheduling_oauth_state_hash_unique").on(t.stateHash),
    index("scheduling_oauth_state_expires_at_idx").on(t.expiresAt),
  ],
);

export const schedulingSettings = pgTable(
  "scheduling_settings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.schedulingSettings)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    allowedOrigins: jsonb("allowed_origins").$type<string[]>().notNull().default([]),
    brandName: text("brand_name"),
    accentColor: text("accent_color"),
    emailFrom: text("email_from"),
    smsFrom: text("sms_from"),
    notifications: jsonb("notifications").$type<SchedulingNotificationPolicy | null>(),
    calendarFailureMode: schedulingCalendarFailureMode("calendar_failure_mode")
      .notNull()
      .default("hide"),
    screenedAt: instant("screened_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "scheduling_settings_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    unique("scheduling_settings_environment_unique").on(t.environmentId),
  ],
);
