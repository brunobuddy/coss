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
  /** The mailbox a calendar delegation connects, when it isn't `email`. */
  calendar_account?: string | null;
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
  /** Moves a delegated calendar to this mailbox. Refused while bookings are still to come. */
  calendar_account?: string | null;
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
  calendar_account: string | null;
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
  /** The calendar delegation that manages it, which can't be disconnected or reconnected by itself. */
  delegation: string | null;
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

export type CreateSchedulingCalendarDelegationParams =
  | {
      provider: "google";
      domain: string;
      /** Whether a host's `email` picks their mailbox when `calendar_account` isn't set. */
      match_host_email?: boolean;
      /** The whole JSON key of a service account in your Google Cloud project. */
      service_account_key: string;
    }
  | {
      provider: "microsoft";
      domain: string;
      /** Whether a host's `email` picks their mailbox when `calendar_account` isn't set. */
      match_host_email?: boolean;
      tenant_id: string;
      client_id: string;
      client_secret: string;
      /** Owners and admins are warned 14 days before. */
      secret_expires_at?: string;
    };

export interface UpdateSchedulingCalendarDelegationParams {
  match_host_email?: boolean;
  /** Tried on the verified mailbox before it replaces the old one. */
  service_account_key?: string;
  /** Tried on the verified mailbox before it replaces the old one. */
  client_secret?: string;
  secret_expires_at?: string | null;
}

export interface VerifySchedulingCalendarDelegationParams {
  /** A real mailbox on the domain to try. */
  account: string;
}

export interface SchedulingCalendarDelegation {
  object: "scheduling.calendar_delegation";
  id: string;
  provider: "google" | "microsoft";
  domain: string;
  /**
   * `pending`: not verified yet. `failing`: the provider refused access, and its hosts aren't offered
   * until it's back. `deleting`: its connections are being removed.
   */
  status: "pending" | "active" | "failing" | "deleting";
  match_host_email: boolean;
  /** Google: the numeric client ID your Workspace admin authorizes. */
  client_id: string;
  tenant_id: string | null;
  /** What to authorize: OAuth scopes in Google's Admin console, the permission in Entra. */
  scopes: string[];
  verified_account: string | null;
  last_error_code: string | null;
  failing_since: string | null;
  secret_expires_at: string | null;
  hosts_connected: number;
  hosts_failed: number;
  created_at: string;
  updated_at: string;
}

export interface DeletedSchedulingCalendarDelegation {
  object: "scheduling.calendar_delegation";
  id: string;
  deleted: true;
}

export interface SetSchedulingSimulatedBusyParams {
  intervals: { start: string; end: string }[];
}

export interface CreateSchedulingHostSessionParams {
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
  | "scheduling.booking.location_ready";

export type SchedulingCalendarWebhookEventType =
  | "scheduling.calendar.connected"
  | "scheduling.calendar.needs_reauth"
  | "scheduling.calendar.disconnected";

export type SchedulingCalendarDelegationWebhookEventType =
  | "scheduling.calendar_delegation.failing"
  | "scheduling.calendar_delegation.restored";

export type SchedulingWebhookEventType =
  | SchedulingBookingWebhookEventType
  | SchedulingCalendarWebhookEventType
  | SchedulingCalendarDelegationWebhookEventType;

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

export interface SchedulingCalendarDelegationWebhookEvent {
  id: string;
  object: "event";
  type: SchedulingCalendarDelegationWebhookEventType;
  api_version: string;
  created_at: string;
  data: {
    delegation_id: string;
    provider: string;
    domain: string;
    /** What the provider said, when it refused. */
    code: string | null;
    occurred_at: string;
  };
}
