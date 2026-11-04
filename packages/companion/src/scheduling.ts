export type SchedulingBookingStatus =
  | "held"
  | "pending_approval"
  | "confirmed"
  | "cancelled"
  | "declined";

export type SchedulingBookingView = "upcoming" | "past" | "pending";

/** Name or uid only, as on the dashboard: a booking's contact details and answers stay in the API. */
export type SchedulingAttendee = {
  name: string | null;
  uid: string | null;
  time_zone: string;
};

export type SchedulingLocationSummary = {
  type: "link" | "phone" | "in_person" | "google_meet" | "microsoft_teams" | "zoom";
  /** The link, number or address, once there is one. */
  detail: string | null;
};

export type SchedulingBooking = {
  id: string;
  title: string;
  status: SchedulingBookingStatus;
  start: string;
  end: string;
  attendees: SchedulingAttendee[];
  hosts: { id: string; name: string }[];
  location: SchedulingLocationSummary | null;
  approval_expires_at: string | null;
  hold_expires_at: string | null;
  external_conflict_at: string | null;
  calendar_unverified: boolean;
  no_show_at: string | null;
  cancelled_at: string | null;
  series_index: number | null;
  event_type: string;
};

export type SchedulingHostStatus = "active" | "disabled";

export type SchedulingHost = {
  id: string;
  uid: string | null;
  name: string;
  time_zone: string;
  status: SchedulingHostStatus;
};

export type SchedulingScheduleRule = { days: number[]; start: string; end: string };

export type SchedulingHostSchedule = {
  id: string;
  name: string;
  time_zone: string;
  is_default: boolean;
  rules: SchedulingScheduleRule[];
  overrides: number;
};

/** The account's address stays out: a calendar here is only whether it works. */
export type SchedulingHostCalendar = {
  id: string;
  provider: "google" | "microsoft" | "caldav" | "simulated" | "zoom";
  status: "active" | "needs_reauth";
  calendars: number;
  reading_busy: number;
  unverified: number;
};

export type SchedulingHostResponse = {
  host: SchedulingHost;
  schedules: SchedulingHostSchedule[];
  calendars: SchedulingHostCalendar[];
};

export type SchedulingEventTypeKind = "one_on_one" | "pool" | "collective" | "group";

export type SchedulingEventType = {
  id: string;
  uid: string | null;
  title: string;
  kind: SchedulingEventTypeKind;
  status: "active" | "archived";
  duration_minutes: number;
  duration_options: number[];
  hosts: number;
  requires_approval: boolean;
  approval_ttl_minutes: number;
  capacity: number | null;
  min_notice_minutes: number;
  cancel_notice_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  step_minutes: number;
  locations: SchedulingLocationSummary["type"][];
};

export type SchedulingSettings = {
  brand_name: string | null;
  accent_color: string | null;
  email_from: string | null;
  sms_from: string | null;
  calendar_failure_mode: "hide" | "last_known";
  allowed_origins: string[];
};

export type SchedulingBookingActionResponse = { booking: SchedulingBooking };
