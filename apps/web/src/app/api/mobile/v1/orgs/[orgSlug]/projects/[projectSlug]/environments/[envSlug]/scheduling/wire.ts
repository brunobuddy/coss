import "server-only";
import type {
  SchedulingBooking,
  SchedulingEventType,
  SchedulingHost,
  SchedulingHostCalendar,
  SchedulingHostSchedule,
  SchedulingLocationSummary,
  SchedulingSettings,
} from "@coss/companion";
import { getHost, type SchedulingDeps, SchedulingError } from "@coss/scheduling";
import type {
  BookingObjectOutput,
  EventTypeObjectOutput,
  HostObjectOutput,
  ScheduleObjectOutput,
  SettingsObjectOutput,
} from "@coss/scheduling/schemas";
import { MobileApiError } from "@/lib/mobile-api";
import { schedulingDeps } from "@/lib/scheduling";

export const SCHEDULING_PAGE = 50;

/** Without its keys the dashboard's Scheduling pages don't exist either. */
export function requireSchedulingDeps(): SchedulingDeps {
  const deps = schedulingDeps();
  if (!deps) {
    throw new MobileApiError(404, "not_found", "Scheduling isn't available yet.");
  }
  return deps;
}

/** Product errors carry messages written for people. */
export function schedulingError(error: unknown): unknown {
  if (!(error instanceof SchedulingError)) return error;
  return error.code === "not_found"
    ? new MobileApiError(404, "not_found", error.message)
    : new MobileApiError(error.status, "invalid_request", error.message);
}

function toLocation(location: BookingObjectOutput["location"]): SchedulingLocationSummary | null {
  if (!location) return null;
  switch (location.type) {
    case "link":
    case "zoom":
      return { type: location.type, detail: location.url };
    case "phone":
      return { type: "phone", detail: location.number };
    case "in_person":
      return { type: "in_person", detail: location.address };
    default:
      return { type: location.type, detail: null };
  }
}

/**
 * Name or uid only, as on the dashboard. `getBooking` decrypts answers, email and phone for the
 * public API; none of them, nor metadata, may reach the app.
 */
export function toMobileBooking(
  booking: BookingObjectOutput,
  hostNames: ReadonlyMap<string, string>,
): SchedulingBooking {
  return {
    id: booking.id,
    title: booking.title,
    status: booking.status,
    start: booking.start,
    end: booking.end,
    attendees: booking.attendees.map((attendee) => ({
      name: attendee.name,
      uid: attendee.uid,
      time_zone: attendee.time_zone,
    })),
    hosts: booking.hosts.map((id) => ({ id, name: hostNames.get(id) ?? "Removed host" })),
    location: toLocation(booking.location),
    approval_expires_at: booking.approval_expires_at,
    hold_expires_at: booking.hold_expires_at,
    external_conflict_at: booking.external_conflict_at,
    calendar_unverified: booking.calendar_unverified,
    no_show_at: booking.no_show_at,
    cancelled_at: booking.cancelled_at,
    series_index: booking.series_index,
    event_type: booking.event_type,
  };
}

/** The names of the hosts on these bookings: one lookup per host, however many bookings. */
export async function hostNamesOf(
  scope: { organizationId: string; environmentId: string },
  bookings: BookingObjectOutput[],
): Promise<Map<string, string>> {
  const ids = [...new Set(bookings.flatMap((booking) => booking.hosts))];
  const entries = await Promise.all(
    ids.map(async (id) => {
      const host = await getHost(scope, id).catch(() => null);
      return host ? ([id, host.name] as const) : null;
    }),
  );
  return new Map(entries.filter((entry) => entry !== null));
}

export function toMobileHost(host: HostObjectOutput): SchedulingHost {
  return {
    id: host.id,
    uid: host.uid,
    name: host.name,
    time_zone: host.time_zone,
    status: host.status,
  };
}

export function toMobileSchedule(schedule: ScheduleObjectOutput): SchedulingHostSchedule {
  return {
    id: schedule.id,
    name: schedule.name,
    time_zone: schedule.time_zone,
    is_default: schedule.is_default,
    rules: schedule.rules,
    overrides: schedule.overrides.length,
  };
}

export function toMobileCalendar(connection: {
  id: string;
  provider: SchedulingHostCalendar["provider"];
  status: SchedulingHostCalendar["status"];
  calendars: { read_busy: boolean; verified_at: string | null }[];
}): SchedulingHostCalendar {
  return {
    id: connection.id,
    provider: connection.provider,
    status: connection.status,
    calendars: connection.calendars.length,
    reading_busy: connection.calendars.filter((calendar) => calendar.read_busy).length,
    unverified: connection.calendars.filter((calendar) => !calendar.verified_at).length,
  };
}

export function toMobileEventType(eventType: EventTypeObjectOutput): SchedulingEventType {
  return {
    id: eventType.id,
    uid: eventType.uid,
    title: eventType.title,
    kind: eventType.kind,
    status: eventType.status,
    duration_minutes: eventType.duration_minutes,
    duration_options: eventType.duration_options,
    hosts: eventType.hosts.length,
    requires_approval: eventType.requires_approval,
    approval_ttl_minutes: eventType.approval_ttl_minutes,
    capacity: eventType.capacity,
    min_notice_minutes: eventType.min_notice_minutes,
    cancel_notice_minutes: eventType.cancel_notice_minutes,
    buffer_before_minutes: eventType.buffer_before_minutes,
    buffer_after_minutes: eventType.buffer_after_minutes,
    step_minutes: eventType.step_minutes,
    locations: eventType.locations.map((location) => location.type),
  };
}

export function toMobileSchedulingSettings(settings: SettingsObjectOutput): SchedulingSettings {
  return {
    brand_name: settings.brand_name,
    accent_color: settings.accent_color,
    email_from: settings.email_from,
    sms_from: settings.sms_from,
    calendar_failure_mode: settings.calendar_failure_mode,
    allowed_origins: settings.allowed_origins,
  };
}
