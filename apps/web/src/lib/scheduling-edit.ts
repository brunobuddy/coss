import type { EventTypeObjectOutput, UpdateEventTypeRequestOutput } from "@coss/scheduling/schemas";

/** The event type editor's state and what it sends. Pure, so a round trip can be tested. */

export type QuestionType = EventTypeObjectOutput["questions"][number]["type"];
export type LocationType = EventTypeObjectOutput["locations"][number]["type"];

type SavedQuestion = EventTypeObjectOutput["questions"][number];
type SavedLocation = EventTypeObjectOutput["locations"][number];

export type QuestionRow = {
  id: string;
  /**
   * What's stored, so an untouched row goes back exactly as it came: an API client's options can
   * hold line breaks and spaces, and answers are checked against them. Saved answers are stored
   * under the key, so a saved question's key doesn't change.
   */
  saved: SavedQuestion | null;
  key: string;
  type: QuestionType;
  label: string;
  required: boolean;
  options: string;
};
export type LocationRow = {
  id: string;
  /** As on a question: a stored location the form can't fully show survives an unrelated save. */
  saved: SavedLocation | null;
  type: LocationType;
  value: string;
};
export type LimitRow = {
  id: string;
  period: "day" | "week";
  max: string;
  scope: "event_type" | "host";
};
export type HostRow = {
  id: string;
  host: string;
  role: "required" | "member";
  weight: string;
  schedule: string | null;
};

export type EventTypeFormState = {
  title: string;
  description: string;
  uid: string;
  capacity: string;
  duration: string;
  durationOptions: string;
  step: string;
  gridTimeZone: string;
  bufferBefore: string;
  bufferAfter: string;
  minNotice: string;
  windowMode: "none" | "rolling" | "range";
  windowDays: string;
  windowFrom: string;
  windowTo: string;
  limits: LimitRow[];
  requiresApproval: boolean;
  approvalTtl: string;
  holdTtl: string;
  cancelNotice: string;
  rescheduleNotice: string;
  maxGuests: string;
  maxActivePerAttendee: string;
  calendarDetails: EventTypeObjectOutput["host_calendar_details"];
  questions: QuestionRow[];
  locations: LocationRow[];
  hosts: HostRow[];
};

const CHOICE_TYPES: readonly QuestionType[] = ["select", "radio", "checkbox"];
export const hasOptions = (type: QuestionType) => CHOICE_TYPES.includes(type);

function locationValue(location: SavedLocation): string {
  if (location.type === "link") return location.url ?? "";
  if (location.type === "phone") return location.number ?? "";
  if (location.type === "in_person") return location.address ?? "";
  return "";
}

export function eventTypeFormState(eventType: EventTypeObjectOutput): EventTypeFormState {
  const window = eventType.booking_window;
  return {
    title: eventType.title,
    description: eventType.description ?? "",
    uid: eventType.uid ?? "",
    capacity: eventType.capacity === null ? "" : String(eventType.capacity),
    duration: String(eventType.duration_minutes),
    durationOptions: eventType.duration_options.join(", "),
    step: String(eventType.step_minutes),
    gridTimeZone: eventType.grid_time_zone ?? "",
    bufferBefore: String(eventType.buffer_before_minutes),
    bufferAfter: String(eventType.buffer_after_minutes),
    minNotice: String(eventType.min_notice_minutes),
    windowMode: window?.kind ?? "none",
    windowDays: window?.kind === "rolling" ? String(window.days) : "60",
    windowFrom: window?.kind === "range" ? window.from : "",
    windowTo: window?.kind === "range" ? window.to : "",
    limits: eventType.limits.map((limit, index) => ({
      id: `limit-${index}`,
      period: limit.period,
      max: String(limit.max),
      scope: limit.scope,
    })),
    requiresApproval: eventType.requires_approval,
    approvalTtl: String(eventType.approval_ttl_minutes),
    holdTtl: String(eventType.hold_ttl_seconds),
    cancelNotice: String(eventType.cancel_notice_minutes),
    rescheduleNotice: String(eventType.reschedule_notice_minutes),
    maxGuests: String(eventType.max_guests),
    maxActivePerAttendee: String(eventType.max_active_bookings_per_attendee ?? ""),
    calendarDetails: eventType.host_calendar_details,
    questions: eventType.questions.map((question, index) => ({
      id: `question-${index}`,
      saved: question,
      key: question.key,
      type: question.type,
      label: question.label,
      required: question.required,
      options: question.options.join("\n"),
    })),
    locations: eventType.locations.map((location, index) => ({
      id: `location-${index}`,
      saved: location,
      type: location.type,
      value: locationValue(location),
    })),
    hosts: eventType.hosts.map((host) => ({
      id: `host-${host.host}`,
      host: host.host,
      role: host.role,
      weight: String(host.weight),
      schedule: host.schedule,
    })),
  };
}

function locationPayload(row: LocationRow): SavedLocation {
  if (row.saved?.type === row.type && locationValue(row.saved) === row.value) return row.saved;
  const value = row.value.trim() || null;
  switch (row.type) {
    case "link":
      return { type: "link", url: value };
    case "phone":
      return { type: "phone", number: value };
    case "in_person":
      return { type: "in_person", address: value };
    case "zoom":
      return { type: "zoom", url: null };
    case "google_meet":
      return { type: "google_meet" };
    case "microsoft_teams":
      return { type: "microsoft_teams" };
  }
}

const lines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

function bookingWindow(state: EventTypeFormState) {
  if (state.windowMode === "rolling") {
    return { kind: "rolling" as const, days: Number(state.windowDays) };
  }
  if (state.windowMode === "range") {
    return { kind: "range" as const, from: state.windowFrom, to: state.windowTo };
  }
  return null;
}

function questionOptions(row: QuestionRow): string[] {
  const untouched = row.saved?.type === row.type && row.saved.options.join("\n") === row.options;
  if (untouched && row.saved) return row.saved.options;
  return hasOptions(row.type) ? lines(row.options) : [];
}

/** What the form submits, before `UpdateEventTypeRequest` checks it on the server. */
export function eventTypePayload(state: EventTypeFormState, kind: EventTypeObjectOutput["kind"]) {
  return {
    title: state.title.trim(),
    description: state.description.trim() || null,
    uid: state.uid.trim() || null,
    capacity: kind === "group" ? Number(state.capacity) : null,
    duration_minutes: Number(state.duration),
    duration_options: state.durationOptions
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number),
    step_minutes: Number(state.step),
    grid_time_zone: state.gridTimeZone.trim() || null,
    buffer_before_minutes: Number(state.bufferBefore),
    buffer_after_minutes: Number(state.bufferAfter),
    min_notice_minutes: Number(state.minNotice),
    booking_window: bookingWindow(state),
    limits: state.limits.map((limit) => ({
      period: limit.period,
      max: Number(limit.max),
      scope: limit.scope,
    })),
    requires_approval: state.requiresApproval,
    approval_ttl_minutes: Number(state.approvalTtl),
    hold_ttl_seconds: Number(state.holdTtl),
    cancel_notice_minutes: Number(state.cancelNotice),
    reschedule_notice_minutes: Number(state.rescheduleNotice),
    // Each person at a group session takes a seat of their own, so it never has guests.
    max_guests: kind === "group" ? 0 : Number(state.maxGuests),
    max_active_bookings_per_attendee: state.maxActivePerAttendee.trim()
      ? Number(state.maxActivePerAttendee)
      : null,
    host_calendar_details: state.calendarDetails,
    questions: state.questions.map((question) => ({
      key: question.key.trim(),
      type: question.type,
      label: question.saved?.label === question.label ? question.label : question.label.trim(),
      required: question.required,
      options: questionOptions(question),
    })),
    locations: state.locations.map(locationPayload),
    hosts: state.hosts.map((host) => ({
      host: host.host,
      role: host.role,
      weight: Number(host.weight),
      schedule: host.schedule,
    })),
  };
}

/** A question's key from its label, unique among the others'. */
export function questionKey(label: string, taken: readonly string[]): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^[^a-z]+|_+$/g, "")
      .slice(0, 56) || "question";
  if (!taken.includes(base)) return base;
  let suffix = 2;
  while (taken.includes(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1));
    return Object.fromEntries(entries.map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a ?? null)) === JSON.stringify(canonical(b ?? null));

/**
 * Only what changed. A title or a question goes through screening and a host list takes row locks
 * against bookers, so saving one field must not resend the rest.
 */
export function eventTypeChanges(
  current: EventTypeObjectOutput,
  next: UpdateEventTypeRequestOutput,
): UpdateEventTypeRequestOutput {
  const changes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) continue;
    const stored = current[key as keyof EventTypeObjectOutput];
    const sortable = key === "hosts" && Array.isArray(value) && Array.isArray(stored);
    // The form trims what it sends, and a stored value's own spaces aren't an edit.
    const untrimmed =
      typeof value === "string" && typeof stored === "string" && value.trim() === stored.trim();
    const unchanged =
      untrimmed ||
      (sortable
        ? same(sortedHosts(value as Hosts), sortedHosts(stored as Hosts))
        : same(value, stored));
    if (!unchanged) changes[key] = value;
  }
  return changes as UpdateEventTypeRequestOutput;
}

type Hosts = readonly { host: string }[];
const sortedHosts = (hosts: Hosts) => [...hosts].sort((a, b) => (a.host < b.host ? -1 : 1));

/**
 * Attributes, a pool's filter and metadata are edited as the JSON the API takes: any value an API
 * client stored survives an unrelated save, commas and line breaks included.
 */
export function formatJsonObject(value: Record<string, unknown> | null): string {
  if (value === null) return "";
  return JSON.stringify(value, null, 2);
}

/** The same, with an empty object left blank, for what's never null. */
export const formatOptionalJson = (value: Record<string, unknown>) =>
  Object.keys(value).length === 0 ? "" : formatJsonObject(value);

/** `null` for blank. Refuses anything else that isn't an object; the schema checks the values. */
export function parseJsonObject(text: string, label: string): Record<string, unknown> | null {
  if (!text.trim()) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${label} isn't valid JSON.`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

const LIST_LABEL: Record<string, string> = {
  questions: "Question",
  locations: "Location",
  limits: "Limit",
  hosts: "Host",
};

const FIELD_LABEL: Record<string, string> = {
  title: "Title",
  description: "Description",
  uid: "Your id",
  capacity: "Capacity",
  duration_minutes: "Duration",
  duration_options: "Other durations",
  step_minutes: "Time between start times",
  grid_time_zone: "Time zone for start times",
  buffer_before_minutes: "Buffer before",
  buffer_after_minutes: "Buffer after",
  min_notice_minutes: "Minimum notice",
  booking_window: "Booking window",
  approval_ttl_minutes: "Time to approve",
  hold_ttl_seconds: "Hold length",
  cancel_notice_minutes: "Cancellation notice",
  reschedule_notice_minutes: "Reschedule notice",
  max_guests: "Guests",
  max_active_bookings_per_attendee: "Upcoming bookings per person",
  host_calendar_details: "Host calendars",
  host_filter: "Attributes to include",
  metadata: "Metadata",
  name: "Name",
  email: "Email",
  time_zone: "Time zone",
  attributes: "Attributes",
};

/** A schema issue in the form's own words: `questions.1.key` reads "Question 2". */
export function issueLabel(path: readonly PropertyKey[]): string {
  const [first, second] = path;
  if (typeof first !== "string") return "This form";
  const list = LIST_LABEL[first];
  if (list && typeof second === "number") return `${list} ${second + 1}`;
  return FIELD_LABEL[first] ?? first;
}
