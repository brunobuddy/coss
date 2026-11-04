/**
 * Scheduling wire types (hand-written mirrors of the API's schemas, kept equal by the contract
 * tests).
 */

export type SchedulingAttributes = Record<string, string | string[]>;

/** A host's own place to meet. `url` must be https, and `number` in E.164 format. */
export type SchedulingHostLocation =
  | { type: "link"; url: string }
  | { type: "phone"; number: string }
  | { type: "in_person"; address: string };

export type SchedulingHostStatus = "active" | "disabled";

export interface CreateSchedulingHostParams {
  /** Your own id for this host, unique in the environment. */
  uid?: string;
  name: string;
  /** Where this host's notifications go. Not an identity, and need not be unique. */
  email?: string;
  time_zone: string;
  /** What pools filter hosts by, such as `{ licensed_in: ["CA", "NY"] }`. */
  attributes?: SchedulingAttributes;
  /**
   * This host's own office, meeting link and phone number, at most one of each. An event type's
   * location that leaves its value blank uses them.
   */
  locations?: SchedulingHostLocation[];
  metadata?: Record<string, string>;
}

export interface UpdateSchedulingHostParams {
  uid?: string | null;
  name?: string;
  email?: string | null;
  time_zone?: string;
  attributes?: SchedulingAttributes;
  /** Replaces this host's own locations. Existing bookings keep the location they have. */
  locations?: SchedulingHostLocation[];
  metadata?: Record<string, string>;
  /** A `disabled` host isn't offered. Its existing bookings stay. */
  status?: SchedulingHostStatus;
}

export interface SchedulingHost {
  object: "scheduling.host";
  id: string;
  uid: string | null;
  name: string;
  email: string | null;
  time_zone: string;
  attributes: SchedulingAttributes;
  locations: SchedulingHostLocation[];
  metadata: Record<string, string>;
  status: SchedulingHostStatus;
  created_at: string;
  updated_at: string;
}

export interface DeletedSchedulingHost {
  object: "scheduling.host";
  id: string;
  deleted: true;
}

export interface SchedulingPageParams {
  limit?: number;
  after?: string;
}

export interface SchedulingWeeklyRule {
  /** Weekdays, with Sunday as 0. */
  days: number[];
  /** A local time, `HH:MM`. `24:00` is the end of the day. */
  start: string;
  end: string;
}

export interface SchedulingScheduleOverride {
  /** A local date in the schedule's time zone. */
  date: string;
  /** Replaces the weekly rules that day. Empty means unavailable all day. */
  ranges: { start: string; end: string }[];
}

export interface UpsertSchedulingScheduleParams {
  name?: string;
  /** Default: the host's. */
  time_zone?: string;
  is_default?: boolean;
  rules: SchedulingWeeklyRule[];
  /** Replaces the schedule's overrides when given. */
  overrides?: SchedulingScheduleOverride[];
}

export interface SchedulingSchedule {
  object: "scheduling.schedule";
  id: string;
  host: string;
  name: string;
  time_zone: string;
  is_default: boolean;
  rules: { days: number[]; start: string; end: string }[];
  overrides: { date: string; ranges: { start: string; end: string }[] }[];
  created_at: string;
  updated_at: string;
}

export interface DeletedSchedulingSchedule {
  object: "scheduling.schedule";
  id: string;
  deleted: true;
}

export type SchedulingEventTypeKind = "one_on_one" | "pool" | "collective" | "group";

export type SchedulingBookingWindow =
  | { kind: "rolling"; days: number }
  | { kind: "range"; from: string; to: string };

export interface SchedulingLimitInput {
  period: "day" | "week";
  max: number;
  /** Default `event_type`. */
  scope?: "event_type" | "host";
}

export interface SchedulingLimit {
  period: "day" | "week";
  max: number;
  scope: "event_type" | "host";
}

export type SchedulingQuestionType =
  | "text"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "phone"
  | "email"
  | "number";

export interface SchedulingQuestionInput {
  key: string;
  type: SchedulingQuestionType;
  label: string;
  required?: boolean;
  options?: string[];
}

export interface SchedulingQuestion {
  key: string;
  type: SchedulingQuestionType;
  label: string;
  required: boolean;
  options: string[];
}

export type SchedulingLocationInput =
  | { type: "link"; url?: string | null }
  | { type: "phone"; number?: string | null }
  | { type: "in_person"; address?: string | null }
  | { type: "google_meet" }
  | { type: "microsoft_teams" }
  | { type: "zoom"; url?: string | null };

export type SchedulingLocation =
  | { type: "link"; url: string | null }
  | { type: "phone"; number: string | null }
  | { type: "in_person"; address: string | null }
  | { type: "google_meet" }
  | { type: "microsoft_teams" }
  | { type: "zoom"; url: string | null };

export interface SchedulingEventTypeHostInput {
  /** The host's id or uid. */
  host: string;
  /** `required` hosts must all be free; one `member` is chosen for a booking. */
  role?: "required" | "member";
  weight?: number;
  /** A schedule of this host's. Default: their default schedule. */
  schedule?: string | null;
}

interface SchedulingEventTypeFields {
  duration_options?: number[];
  step_minutes?: number;
  grid_time_zone?: string | null;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  min_notice_minutes?: number;
  booking_window?: SchedulingBookingWindow | null;
  limits?: SchedulingLimitInput[];
  capacity?: number | null;
  requires_approval?: boolean;
  /** Whether bookings of this event type can go to another host. Default: true. */
  reassignment_enabled?: boolean;
  approval_ttl_minutes?: number;
  hold_ttl_seconds?: number;
  cancel_notice_minutes?: number;
  reschedule_notice_minutes?: number;
  /** How many people an attendee can add to a booking. Default: 0. Not on `group`. */
  max_guests?: number;
  /**
   * What hosts' calendars say about a booking. `neutral` (the default): a private event titled
   * "Appointment". `full`: this title with the attendee's name, plus who's coming in its
   * description, which go to the host's calendar provider. Refused in HIPAA mode.
   */
  host_calendar_details?: SchedulingHostCalendarDetails;
  questions?: SchedulingQuestionInput[];
  locations?: SchedulingLocationInput[];
  host_filter?: SchedulingAttributes | null;
  metadata?: Record<string, string>;
}

export interface CreateSchedulingEventTypeParams extends SchedulingEventTypeFields {
  uid?: string;
  kind?: SchedulingEventTypeKind;
  title: string;
  duration_minutes: number;
  hosts?: SchedulingEventTypeHostInput[];
}

export interface UpdateSchedulingEventTypeParams extends SchedulingEventTypeFields {
  uid?: string | null;
  title?: string;
  duration_minutes?: number;
  status?: "active" | "archived";
  /** Replaces the assigned hosts. Removed hosts keep their existing bookings. */
  hosts?: SchedulingEventTypeHostInput[];
}

export interface SchedulingEventType {
  object: "scheduling.event_type";
  id: string;
  uid: string | null;
  title: string;
  kind: SchedulingEventTypeKind;
  status: "active" | "archived";
  duration_minutes: number;
  duration_options: number[];
  step_minutes: number;
  grid_time_zone: string | null;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  min_notice_minutes: number;
  booking_window: SchedulingBookingWindow | null;
  limits: SchedulingLimit[];
  capacity: number | null;
  requires_approval: boolean;
  reassignment_enabled: boolean;
  approval_ttl_minutes: number;
  hold_ttl_seconds: number;
  cancel_notice_minutes: number;
  reschedule_notice_minutes: number;
  max_guests: number;
  host_calendar_details: SchedulingHostCalendarDetails;
  questions: SchedulingQuestion[];
  locations: SchedulingLocation[];
  host_filter: SchedulingAttributes | null;
  hosts: {
    host: string;
    role: "required" | "member";
    weight: number;
    schedule: string | null;
  }[];
  metadata: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface ListSchedulingSlotsParams {
  start: string;
  end: string;
  /** Only this host's slots (id or uid). */
  host?: string;
  duration_minutes?: number;
  /** A JSON object narrowing a pool, such as `{"licensed_in":"CA"}`. */
  attributes?: string;
}

export interface SchedulingSlot {
  start: string;
  end: string;
  /** Who could take it. */
  hosts: string[];
}

export interface SchedulingSlotList {
  object: "list";
  data: SchedulingSlot[];
  has_more: false;
}

export interface SearchSchedulingAvailabilityParams {
  event_type: string;
  start: string;
  end: string;
  attributes?: SchedulingAttributes;
  hosts?: string[];
  slots_per_host?: number;
  limit?: number;
}

export interface SchedulingAvailabilitySearchResult {
  object: "list";
  data: { host: string; uid: string | null; slots: { start: string; end: string }[] }[];
  has_more: boolean;
}

export type SchedulingBookingStatus =
  | "held"
  | "pending_approval"
  | "confirmed"
  | "cancelled"
  | "declined";

/** Someone else coming along. They're emailed about the booking, with no manage link. */
export interface SchedulingGuestInput {
  email: string;
  name?: string;
}

export interface SchedulingAttendeeInput {
  /** Your own id for this person, used to erase their data later. */
  uid?: string;
  name?: string;
  email?: string;
  phone?: string;
  time_zone: string;
  locale?: string;
}

export interface CreateSchedulingBookingParams {
  event_type: string;
  start: string;
  /** A specific host (id or uid). Default: chosen fairly from those free. */
  host?: string;
  attributes?: SchedulingAttributes;
  duration_minutes?: number;
  attendee: SchedulingAttendeeInput;
  /** Up to the event type's `max_guests`. */
  guests?: SchedulingGuestInput[];
  answers?: Record<string, string | string[]>;
  location?: SchedulingLocationInput;
  metadata?: Record<string, string>;
}

export type CreateSchedulingHoldParams = CreateSchedulingBookingParams;

export type SchedulingHostCalendarDetails = "neutral" | "full";

export interface SchedulingBookingAttendee {
  id: string;
  /** `attendee` booked it and comes first; a `guest` was added by them. */
  role: "attendee" | "guest";
  uid: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  time_zone: string;
  locale: string | null;
  /** Only when retrieving one booking. */
  answers?: Record<string, string | string[]>;
}

export interface SchedulingBooking {
  object: "scheduling.booking";
  id: string;
  event_type: string;
  status: SchedulingBookingStatus;
  title: string;
  start: string;
  end: string;
  hosts: string[];
  attendees: SchedulingBookingAttendee[];
  location: SchedulingLocation | null;
  hold_expires_at: string | null;
  approval_expires_at: string | null;
  series: string | null;
  series_index: number | null;
  group_session: string | null;
  calendar_unverified: boolean;
  external_conflict_at: string | null;
  no_show_at: string | null;
  cancelled_at: string | null;
  metadata: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface ListSchedulingBookingsParams {
  limit?: number;
  after?: string;
  host?: string;
  event_type?: string;
  status?: SchedulingBookingStatus;
  attendee_uid?: string;
  start_after?: string;
  start_before?: string;
}

export interface RescheduleSchedulingBookingParams {
  start: string;
  /** Move a pool booking to this host. Default: its current hosts. */
  host?: string;
}

export interface UpdateSchedulingBookingLocationParams {
  location: SchedulingLocationInput;
}

export interface ConfirmSchedulingHoldParams {
  /** After the hold expired, book anyway if nobody else took the slot. */
  if_still_free?: boolean;
}

export interface CreateSchedulingSeriesParams extends CreateSchedulingBookingParams {
  recurrence: { frequency: "weekly" | "monthly"; interval?: number; count: number };
  /** If an occurrence isn't free: book nothing, or book the rest and report it. */
  on_conflict?: "reject" | "skip";
}

export interface SchedulingSeries {
  object: "scheduling.series";
  id: string;
  bookings: SchedulingBooking[];
  conflicts: { index: number; start: string }[];
}

export interface SchedulingSeriesPreview {
  object: "list";
  data: { start: string; available: boolean; reason: string | null; hosts: string[] }[];
  has_more: false;
}

export interface CancelSchedulingSeriesParams {
  /** Cancel this occurrence and those after it. Default: all of them. */
  from_index?: number;
}

export interface SchedulingCancelledSeries {
  object: "list";
  data: SchedulingBooking[];
  has_more: false;
}

export interface SchedulingAttendeeErasure {
  object: "scheduling.attendee_erasure";
  uid: string;
  erased: number;
}

export interface SchedulingAttendeeEmailErasure {
  object: "scheduling.attendee_erasure";
  erased: number;
}

export interface SchedulingNotificationSettings {
  email_attendee?: boolean;
  email_host?: boolean;
  sms_attendee?: boolean;
}

export interface SchedulingLogo {
  content_type: "image/png" | "image/jpeg";
  width: number;
  height: number;
  data_url: string;
}

export interface SchedulingSettings {
  object: "scheduling.settings";
  allowed_origins: string[];
  brand_name: string | null;
  accent_color: string | null;
  logo: SchedulingLogo | null;
  email_from: string | null;
  sms_from: string | null;
  /** Reasons of your own for time away, on top of the preset ones. */
  /** Name the new host when telling an attendee their booking has one. */
  name_host_in_attendee_emails: boolean;
  /** Whether hosts can give their own bookings to someone else from their page. */
  host_reassignment: "off" | "eligible";
  out_of_office_reasons: { key: string; label: string }[];
  calendar_failure_mode: "hide" | "last_known";
  notifications: Record<string, SchedulingNotificationSettings> | null;
}

export interface UpdateSchedulingSettingsParams {
  allowed_origins?: string[];
  brand_name?: string | null;
  accent_color?: string | null;
  /** `content` is a PNG or JPEG's bytes, base64-encoded, 200 KB at most. */
  logo?: { content: string } | null;
  email_from?: string | null;
  sms_from?: string | null;
  name_host_in_attendee_emails?: boolean;
  host_reassignment?: "off" | "eligible";
  out_of_office_reasons?: { key: string; label: string }[] | null;
  calendar_failure_mode?: "hide" | "last_known";
  notifications?: Record<string, SchedulingNotificationSettings> | null;
}

export interface AuthorizeSchedulingCalendarParams {
  provider: "google" | "microsoft" | "zoom";
  /** Where to send the browser afterwards, on one of the environment's allowed origins. */
  return_url?: string;
}

export interface SchedulingCalendarAuthorization {
  object: "scheduling.calendar_authorization";
  /** Open it in a new window: providers refuse to be framed. */
  url: string;
}

export type CreateSchedulingCalendarConnectionParams =
  | { provider: "caldav"; url: string; username: string; password: string }
  | { provider: "simulated" };

export interface SchedulingCalendarConnection {
  object: "scheduling.calendar_connection";
  id: string;
  host: string;
  provider: "google" | "microsoft" | "caldav" | "simulated" | "zoom";
  account: string;
  /** `needs_reauth`: access was lost, and this host isn't offered until it's back. */
  status: "active" | "needs_reauth";
  calendars: {
    id: string;
    external_id: string;
    read_busy: boolean;
    write_target: boolean;
    verified_at: string | null;
  }[];
  created_at: string;
}

export interface DeletedSchedulingCalendarConnection {
  object: "scheduling.calendar_connection";
  id: string;
  deleted: true;
}

export interface UpdateSchedulingCalendarParams {
  read_busy?: boolean;
  write_target?: boolean;
}

export interface SetSchedulingSimulatedBusyParams {
  intervals: { start: string; end: string }[];
}

export interface CreateSchedulingHostSessionParams {
  /** Seconds until it stops working. At most a day. */
  expires_in?: number;
  read_only?: boolean;
}

export interface SchedulingHolidayCalendarWho {
  /** These hosts, by id or uid. */
  hosts?: string[];
  /** Everyone matching these attributes, asked again at every sync. */
  host_filter?: Record<string, string | string[]>;
  /**
   * Which regional holidays apply, matched against how the calendar names them, such as `England`.
   * Without this, all of them do; empty, only nationwide ones.
   */
  regions?: string[];
  /** Who can be booked in their place on those days, in order. */
  delegates?: string[];
  /** Bookings already on a holiday: `leave` (the default) only reports them. */
  existing_bookings?: "leave" | "reassign";
}

/** Give one of `country` and `ics_url`, and one of `hosts` and `host_filter`. */
export interface CreateSchedulingHolidayCalendarParams extends SchedulingHolidayCalendarWho {
  name: string;
  /** A code from the list of holiday calendars, such as `GB`. */
  country?: string;
  /** Your own feed, https or webcal, read in live environments. Stored encrypted. */
  ics_url?: string;
}

export interface UpdateSchedulingHolidayCalendarParams extends SchedulingHolidayCalendarWho {
  name?: string;
}

export interface SchedulingHolidayCalendar {
  object: "scheduling.holiday_calendar";
  id: string;
  name: string;
  source: "country" | "ics";
  country: string | null;
  hosts: string[] | null;
  host_filter: Record<string, string | string[]> | null;
  regions: string[] | null;
  delegates: string[];
  existing_bookings: "leave" | "reassign";
  last_read_at: string | null;
  /** Why its feed couldn't be read. */
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface SchedulingHoliday {
  date: string;
  name: string;
  /** Who has it, when it's not everyone: as the calendar says it. */
  region: string | null;
}

/** Give one of `hosts` and `host_filter`. */
export interface CreateSchedulingManagerSessionParams {
  /** The hosts this page can reach, by id or uid. */
  hosts?: string[];
  /** Everyone matching these attributes, asked again on every request. */
  host_filter?: Record<string, string | string[]>;
  /** Seconds until it stops working. At most a day. */
  expires_in?: number;
  read_only?: boolean;
}

export interface CreateSchedulingBookerSessionParams {
  event_type: string;
  /** Only this host (id or uid). */
  host?: string;
  /** Only offer times, and book, among pool hosts matching all of these. */
  attributes?: SchedulingAttributes;
  /** Who's booking, if you already know: the browser then can't change it. */
  attendee?: SchedulingAttendeeInput;
  expires_in?: number;
}

export interface SchedulingSession {
  object: "scheduling.session";
  id: string;
  /** Shown only now. A bearer token for the client API. */
  token: string;
  /** coss.com's hosted page, with the token in its fragment. */
  url: string | null;
  expires_at: string;
}

export type SchedulingBookingWebhookEventType =
  | "scheduling.booking.created"
  | "scheduling.booking.pending_approval"
  | "scheduling.booking.confirmed"
  | "scheduling.booking.rescheduled"
  | "scheduling.booking.cancelled"
  | "scheduling.booking.declined"
  | "scheduling.booking.no_show"
  | "scheduling.booking.external_conflict"
  | "scheduling.booking.calendar_write_failed"
  | "scheduling.booking.location_ready"
  | "scheduling.booking.reassigned";

export type SchedulingCalendarWebhookEventType =
  | "scheduling.calendar.connected"
  | "scheduling.calendar.needs_reauth"
  | "scheduling.calendar.disconnected";

export type SchedulingOutOfOfficeWebhookEventType =
  | "scheduling.out_of_office.created"
  | "scheduling.out_of_office.updated"
  | "scheduling.out_of_office.deleted"
  | "scheduling.out_of_office.started"
  | "scheduling.out_of_office.ended";

export type SchedulingReassignmentWebhookEventType = "scheduling.reassignment.completed";

export type SchedulingWebhookEventType =
  | SchedulingBookingWebhookEventType
  | SchedulingCalendarWebhookEventType
  | SchedulingOutOfOfficeWebhookEventType
  | SchedulingReassignmentWebhookEventType;

/** Ids, times and statuses only: a person's details and answers come from retrieving the booking. */
export interface SchedulingBookingWebhookEventData {
  booking_id: string;
  event_type_id: string;
  status: SchedulingBookingStatus;
  start: string;
  end: string;
  host_ids: string[];
  attendee_uids: string[];
  series_id: string | null;
  previous_start?: string;
  /** On `scheduling.booking.reassigned`: who had it before. */
  previous_host_ids?: string[];
  /** On `scheduling.booking.reassigned`: the bulk reassignment it was part of. */
  reassignment_id?: string;
  occurred_at: string;
}

export interface SchedulingBookingWebhookEvent {
  id: string;
  object: "event";
  type: SchedulingBookingWebhookEventType;
  api_version: string;
  created_at: string;
  data: SchedulingBookingWebhookEventData;
}

export interface SchedulingCalendarWebhookEvent {
  id: string;
  object: "event";
  type: SchedulingCalendarWebhookEventType;
  api_version: string;
  created_at: string;
  data: { host_id: string; connection_id: string; provider: string; occurred_at: string };
}

/** Ids and times only: why someone's away is never in a webhook. */
export interface SchedulingOutOfOfficeWebhookEvent {
  id: string;
  object: "event";
  type: SchedulingOutOfOfficeWebhookEventType;
  api_version: string;
  created_at: string;
  data: {
    out_of_office_id: string;
    host_id: string;
    start: string;
    end: string;
    group: string | null;
    occurred_at: string;
  };
}

/** Ids and counts only: why they moved is never in a webhook. */
export interface SchedulingReassignmentWebhookEvent {
  id: string;
  object: "event";
  type: SchedulingReassignmentWebhookEventType;
  api_version: string;
  created_at: string;
  data: {
    reassignment_id: string;
    status: "completed" | "cancelled";
    out_of_office_id: string | null;
    counts: SchedulingReassignmentCounts;
    occurred_at: string;
  };
}

export interface SchedulingReassignmentCounts {
  total: number;
  pending: number;
  reassigned: number;
  /** They'd moved on since it was selected. */
  skipped: number;
  /** Nobody could take them: they stayed. */
  no_candidate: number;
  failed: number;
  cancelled: number;
}

export interface SchedulingReassignmentSelection {
  /** This host's bookings, by id or uid. */
  host?: string;
  /** The bookings that fall in this entry. */
  out_of_office?: string;
  booking_ids?: string[];
  /** A series' occurrences still to come. */
  series?: string;
  start_after?: string;
  start_before?: string;
  event_types?: string[];
  /** Only those with something else on the host's calendar at that time. */
  external_conflict?: boolean;
}

export interface SchedulingReassignmentStrategy {
  /** Give them all to this host. */
  to_host?: string;
  /** Try these first, in order. */
  preferred_hosts?: string[];
  /** After `preferred_hosts`: `auto` picks the fairest who's free, `leave` keeps it where it is. */
  otherwise?: "auto" | "leave";
  /** Who each goes to: a preview, with your changes. */
  assignments?: { booking: string; to_host: string; from_host?: string }[];
}

export interface PreviewSchedulingReassignmentParams {
  selection: SchedulingReassignmentSelection;
  strategy?: SchedulingReassignmentStrategy;
  overrides?: ReassignSchedulingBookingParams["overrides"];
}

export interface CreateSchedulingReassignmentParams extends PreviewSchedulingReassignmentParams {
  reason_code: ReassignSchedulingBookingParams["reason_code"];
  /** Why, in your words: required with an override of someone's availability. */
  note?: string;
  notify?: {
    /** Tell attendees. Default: true. */
    attendees?: boolean;
    /** `digest` (the default) sends each host one email for the run. */
    hosts?: "digest" | "each" | "none";
  };
}

export interface UndoSchedulingReassignmentParams {
  reason_code?: ReassignSchedulingBookingParams["reason_code"];
  note?: string;
  overrides?: ReassignSchedulingBookingParams["overrides"];
  notify?: CreateSchedulingReassignmentParams["notify"];
}

export interface SchedulingReassignment {
  object: "scheduling.reassignment";
  id: string;
  status: "pending" | "running" | "completed" | "cancelled";
  reason_code: ReassignSchedulingBookingParams["reason_code"];
  /** The entry that started it, if one did. */
  out_of_office: string | null;
  /** The run this gives back. */
  undo_of: string | null;
  counts: SchedulingReassignmentCounts;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface SchedulingReassignmentItem {
  object: "scheduling.reassignment_item";
  id: string;
  booking: string;
  from_host: string | null;
  to_host: string | null;
  outcome: "pending" | "reassigned" | "skipped_changed" | "no_candidate" | "failed" | "cancelled";
  error_code: string | null;
}

export interface SchedulingReassignmentPreview {
  object: "scheduling.reassignment_preview";
  items: {
    booking: string;
    event_type: string;
    title: string;
    status: SchedulingBookingStatus;
    start: string;
    end: string;
    series: string | null;
    group_session: string | null;
    from_host: string | null;
    /** Null when nobody could take it. */
    to_host: string | null;
    /** Why it would stay where it is. */
    reason: string | null;
  }[];
  /** There are more than a preview covers. */
  truncated: boolean;
}

/** Either instants, for part of a day, or whole dates, ending with `end_date` itself. */
interface SchedulingOutOfOfficeWhen {
  start?: string;
  end?: string;
  start_date?: string;
  end_date?: string;
  /** What the dates mean in. Default: the host's zone when this is made. */
  time_zone?: string;
}

interface SchedulingOutOfOfficeDetails {
  /** A preset reason, or a key from the settings' `out_of_office_reasons`. Never shown to bookers. */
  reason?: string;
  /** For people who manage this host. Encrypted, and never shown to a booker. */
  notes?: string;
  /** Shown to bookers while this host is away. Can't contain a link. */
  public_message?: string;
  /** Put a private "Out of office" event on the host's calendar. Default: true. */
  show_on_calendar?: boolean;
  /** Who can be booked in this host's place during it, in the order to try them. */
  delegates?: string[];
  /** Bookings already in the way: `leave` (the default) only reports them, `reassign` moves them. */
  existing_bookings?: "leave" | "reassign";
  /** With `existing_bookings: reassign`: who they go to. Default: the fairest who's free. */
  reassign?: {
    to_host?: string;
    preferred_hosts?: string[];
    otherwise?: "auto" | "leave";
  };
}

/** Give exactly one of `host`, `hosts` and `host_filter`. */
export interface CreateSchedulingOutOfOfficeParams
  extends SchedulingOutOfOfficeWhen,
    SchedulingOutOfOfficeDetails {
  host?: string;
  hosts?: string[];
  /** Every active host matching these attributes right now. */
  host_filter?: Record<string, string | string[]>;
  /** Your own id for this entry, unique in the environment. Needs one host. */
  external_id?: string;
}

export interface PutSchedulingOutOfOfficeParams
  extends SchedulingOutOfOfficeWhen,
    SchedulingOutOfOfficeDetails {
  host: string;
}

export interface UpdateSchedulingOutOfOfficeParams extends SchedulingOutOfOfficeWhen {
  reason?: string;
  notes?: string | null;
  public_message?: string | null;
  show_on_calendar?: boolean;
  delegates?: string[];
  existing_bookings?: "leave" | "reassign";
  reassign?: SchedulingOutOfOfficeDetails["reassign"];
}

export interface ListSchedulingOutOfOfficeParams extends SchedulingPageParams {
  host?: string;
  /** Entries ending after this. */
  start_after?: string;
  /** Entries starting before this. */
  start_before?: string;
  /** The entries one request made. */
  group?: string;
}

export interface SchedulingOutOfOffice {
  object: "scheduling.out_of_office";
  id: string;
  host: string;
  start: string;
  end: string;
  /** How it was given, when it was as whole dates. */
  all_day: { start_date: string; end_date: string; time_zone: string } | null;
  reason: string;
  notes: string | null;
  public_message: string | null;
  show_on_calendar: boolean;
  /** Who can be booked in their place. */
  delegates: string[];
  existing_bookings: "leave" | "reassign";
  external_id: string | null;
  /** Shared by the entries one request made for several hosts. */
  group: string | null;
  source: "api" | "host" | "manager" | "dashboard" | "holiday";
  created_at: string;
  updated_at: string;
}

export interface DeletedSchedulingOutOfOffice {
  object: "scheduling.out_of_office";
  id: string;
  deleted: true;
}

/** A live booking that falls in an entry, which never changed it. */
export interface SchedulingOutOfOfficeConflict {
  object: "scheduling.out_of_office_conflict";
  booking: string;
  event_type: string;
  title: string;
  status: SchedulingBookingStatus;
  start: string;
  end: string;
  series: string | null;
  group_session: string | null;
}

export type SchedulingReassignmentReason =
  | "host_unavailable"
  | "out_of_office"
  | "workload"
  | "customer_request"
  | "offboarding"
  | "other";

export type SchedulingReassignmentOverride =
  | "any_host"
  | "out_of_office"
  | "outside_availability"
  | "host_busy"
  | "limit_reached"
  | "calendar_unverified";

export interface ReassignSchedulingBookingParams {
  /** A session or a one-on-one has one. A collective can change several. */
  changes: {
    /** The host leaving, by id or uid. Needed when it could be several. */
    from_host?: string;
    /** The host taking over, by id or uid. Or set `auto`. */
    to_host?: string;
    /** Let coss.com pick, as a pool would: the fairest who's free and fits the booking's routing. */
    auto?: boolean;
    /** With `auto`: try these first, in order. */
    preferred_hosts?: string[];
  }[];
  reason_code: SchedulingReassignmentReason;
  /** Why, in your words: required with an override of someone's availability. Encrypted. */
  note?: string;
  /** Go ahead anyway. A host who already has something at this time can never be overridden. */
  overrides?: SchedulingReassignmentOverride[];
  notify?: { attendee?: boolean };
}

export interface SchedulingReassignCandidate {
  object: "scheduling.reassign_candidate";
  host: string;
  uid: string | null;
  name: string;
  /** Takes this event type and fits the booking's routing. Otherwise it needs `any_host`. */
  member: boolean;
  available: boolean;
  /** Why they aren't available. `already_claimed` can't be overridden. */
  reason: string | null;
  /** Their live bookings in the week from this one. */
  load: number;
  /** Their place in who a pool would pick next, from 1. Null for a non-member. */
  rank: number | null;
  /** They haven't connected what this booking's meeting needs, so it'd have none. */
  meeting_provider_missing: boolean;
}
