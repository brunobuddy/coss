import type {
  SchedulingBookingStatus,
  SchedulingEventTypeKind,
  SchedulingHostCalendar,
  SchedulingLocationSummary,
} from "@coss/companion";
import {
  Globe,
  type LucideIcon,
  Phone,
  Presentation,
  User,
  Users,
  UsersRound,
  Video,
} from "lucide-react-native";
import type { ColorToken, Tone } from "./theme";

// apps/web/src/app/[orgSlug]/[projectSlug]/[envSlug]/scheduling/page.tsx.
export const BOOKING_STATUS_LABELS: Record<SchedulingBookingStatus, string> = {
  confirmed: "Confirmed",
  held: "Held",
  pending_approval: "Awaiting approval",
  cancelled: "Cancelled",
  declined: "Declined",
};

export const BOOKING_STATUS_TONE: Record<SchedulingBookingStatus, Tone> = {
  confirmed: "success",
  held: "neutral",
  pending_approval: "warning",
  cancelled: "neutral",
  declined: "neutral",
};

/** The rule beside a booking on the agenda; a confirmed one takes Scheduling's colour instead. */
export const BOOKING_RULE: Record<Exclude<SchedulingBookingStatus, "confirmed">, ColorToken> = {
  held: "mutedForeground",
  pending_approval: "warning",
  cancelled: "input",
  declined: "input",
};

export const EVENT_TYPE_KIND_LABELS: Record<SchedulingEventTypeKind, string> = {
  one_on_one: "One-on-one",
  pool: "Pool",
  collective: "Collective",
  group: "Group",
};

export const EVENT_TYPE_KIND_ICONS: Record<SchedulingEventTypeKind, LucideIcon> = {
  one_on_one: User,
  pool: Users,
  collective: UsersRound,
  group: Presentation,
};

export const LOCATION_LABELS: Record<SchedulingLocationSummary["type"], string> = {
  link: "Link",
  phone: "Phone",
  in_person: "In person",
  google_meet: "Google Meet",
  microsoft_teams: "Microsoft Teams",
  zoom: "Zoom",
};

export const LOCATION_ICONS: Record<SchedulingLocationSummary["type"], LucideIcon> = {
  link: Globe,
  phone: Phone,
  in_person: Users,
  google_meet: Video,
  microsoft_teams: Video,
  zoom: Video,
};

export const CALENDAR_PROVIDER_LABELS: Record<SchedulingHostCalendar["provider"], string> = {
  google: "Google Calendar",
  microsoft: "Microsoft 365",
  caldav: "CalDAV",
  simulated: "Simulated",
  zoom: "Zoom",
};

export const CALENDAR_FAILURE_LABELS = {
  hide: "Stop offering the host",
  last_known: "Keep last known times and flag those bookings",
} as const;
