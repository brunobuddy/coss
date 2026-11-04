/**
 * What customers can write into a reminder: a fixed catalog of `{{variables}}`, the same syntax as
 * email templates without their loops and conditions. A name outside the catalog is refused when
 * it's saved, so it can never reach someone's inbox as literal text.
 *
 * Client-safe (no imports), so the dashboard's preview runs the same code as the worker. Not
 * `@coss/email/templates`: `email` imports `@coss/scheduling/schemas`, so that'd be a package cycle.
 */

export const REMINDER_VARIABLES = {
  event_title: "The event type's title",
  brand: "Your brand name",
  booking_id: "The booking's id",
  location: "Where it happens, such as the meeting link",
  time_until: 'How long until it starts, such as "in 1 hour"',
  date: "The date, in the recipient's time zone and language",
  time: "The start time, the same way",
  end_time: "The end time, the same way",
  time_zone: "The recipient's time zone",
  attendee_name: "The attendee's name",
  attendee_first_name: "The attendee's first name",
  host_name: "The host's name",
} as const;

export type ReminderVariable = keyof typeof REMINDER_VARIABLES;
export type ReminderValues = Record<ReminderVariable, string>;

/** SMS is sampled by content screening, so a person's name stays out of it. */
export const REMINDER_NAME_VARIABLES: readonly ReminderVariable[] = [
  "attendee_name",
  "attendee_first_name",
  "host_name",
];

/** A button's URL takes only this: everything else in it is what was checked at setup. */
export const REMINDER_URL_VARIABLES: readonly ReminderVariable[] = ["booking_id"];

/** The standard words of an email, for the news it brings. */
export type CopyKind =
  | "confirmed"
  | "pending_approval"
  | "rescheduled"
  | "cancelled"
  | "declined"
  | "reminder"
  | "happening"
  | "finished"
  | "no_show";

export const STANDARD_SUBJECTS: Record<CopyKind, (title: string) => string> = {
  confirmed: (title) => `Confirmed: ${title}`,
  pending_approval: (title) => `Requested: ${title}`,
  rescheduled: (title) => `Rescheduled: ${title}`,
  cancelled: (title) => `Cancelled: ${title}`,
  declined: (title) => `Not confirmed: ${title}`,
  reminder: (title) => `Reminder: ${title}`,
  happening: (title) => `Happening now: ${title}`,
  finished: (title) => `Follow-up: ${title}`,
  no_show: (title) => `We missed you: ${title}`,
};

export const STANDARD_LEADS: Record<CopyKind, { attendee: string; host: string; guest: string }> = {
  // Guests hear nothing until there's something to come to, and a no-show isn't about them, so they
  // have no line for these.
  confirmed: {
    attendee: "Your booking is confirmed.",
    host: "You have a new booking.",
    guest: "You've been added to this booking.",
  },
  pending_approval: {
    attendee: "Your request has been received. You'll hear back once it's approved.",
    host: "A new booking is waiting for approval.",
    guest: "",
  },
  rescheduled: {
    attendee: "Your booking has moved.",
    host: "A booking has moved.",
    guest: "A booking you're a guest of has moved.",
  },
  cancelled: {
    attendee: "Your booking is cancelled.",
    host: "A booking was cancelled.",
    guest: "A booking you're a guest of was cancelled.",
  },
  declined: {
    attendee: "Your request couldn't be confirmed.",
    host: "A request was declined.",
    guest: "",
  },
  reminder: {
    attendee: "This is coming up.",
    host: "This is coming up.",
    guest: "This is coming up.",
  },
  happening: {
    attendee: "This is happening now.",
    host: "This is happening now.",
    guest: "This is happening now.",
  },
  finished: {
    attendee: "Thanks for your time.",
    host: "This has finished.",
    guest: "Thanks for your time.",
  },
  no_show: {
    attendee: "We missed you.",
    host: "The attendee was marked as a no-show.",
    guest: "",
  },
};

/** "This is coming up." would be wrong after a meeting: the standard words follow the timing. */
export function reminderCopyKind(rule: {
  anchor: string;
  before_minutes: number | null;
}): CopyKind {
  switch (rule.anchor) {
    case "start":
      return rule.before_minutes ? "reminder" : "happening";
    case "end":
      return rule.before_minutes ? "happening" : "finished";
    default:
      return rule.anchor as CopyKind;
  }
}

/** A list's key for a rule that has none: stable, since it's what its rows are found by. */
export function reminderKeyOf(rule: {
  key?: string | undefined;
  anchor: string;
  before_minutes?: number | null | undefined;
  after_minutes?: number | null | undefined;
}): string {
  if (rule.key) return rule.key;
  if (rule.before_minutes != null) return `${rule.anchor}-${rule.before_minutes}`;
  return `${rule.anchor}-after-${rule.after_minutes ?? 0}`;
}

// The name's spaces are trimmed after matching: matching them here backtracks badly on long runs.
const VARIABLE = /\{\{([^{}]*)\}\}/g;

export const URL_LIKE =
  /https?:\/\/|www\.|(?<![a-z0-9-])[a-z0-9-]+\.(com|net|org|io|ru|xyz|top|info|biz|co)\b/i;

/** The names used in this text, in order. */
export function reminderVariablesIn(text: string): string[] {
  return [...text.matchAll(VARIABLE)].map((match) => (match[1] ?? "").trim());
}

/** What's wrong with this text's variables; `allowed` narrows the catalog. */
export function reminderCopyProblem(
  text: string,
  allowed: readonly string[] = Object.keys(REMINDER_VARIABLES),
): string | null {
  for (const name of reminderVariablesIn(text)) {
    if (allowed.includes(name)) continue;
    return name in REMINDER_VARIABLES
      ? `{{${name}}} can't be used here.`
      : `{{${name}}} isn't a variable. Use one of: ${allowed.join(", ")}.`;
  }
  return null;
}

/** Single pass: a value holding `{{…}}` stays text. */
export function renderReminderCopy(text: string, values: ReminderValues): string {
  return text.replace(VARIABLE, (_, name: string) => values[name.trim() as ReminderVariable] ?? "");
}

/**
 * Stricter than `URL_LIKE`, which knows a few endings: `attacker.dev` is a link to anyone who'd click
 * it. A name that merely looks like one ("St.John") loses out too, and it's only a greeting.
 */
const ADDRESS_LIKE = /[\p{L}\p{N}-]+\.\p{L}{2,}/u;

/**
 * A booker types their own name, and could aim the email at anyone: a name with a link in it renders
 * as nothing, or it's phishing from the customer's own domain.
 */
export function safeName(name: string | null | undefined): string {
  const line = (name ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 100);
  return URL_LIKE.test(line) || ADDRESS_LIKE.test(line) ? "" : line;
}

export const firstNameOf = (name: string): string => name.split(/\s+/)[0] ?? "";

/** What the dashboard's preview fills in, so a preview never needs a real booking. */
export const REMINDER_SAMPLE_VALUES: ReminderValues = {
  event_title: "Initial consultation",
  brand: "Acme Health",
  booking_id: "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
  location: "https://video.example.com/room/abc",
  time_until: "in 1 hour",
  date: "Monday, January 4, 2027",
  time: "3:00 PM",
  end_time: "3:30 PM",
  time_zone: "America/New_York",
  attendee_name: "Sam Lee",
  attendee_first_name: "Sam",
  host_name: "Dr. Ana Reyes",
};

export function timeUntil(startMs: number, nowMs: number): string {
  const minutes = Math.round((startMs - nowMs) / 60_000);
  if (minutes <= 0) return "now";
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `in ${days} days`;
}
