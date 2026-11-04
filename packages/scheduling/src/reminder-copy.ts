/**
 * What customers can write into a reminder: a fixed catalog of `{{variables}}`, the same syntax as
 * email templates without their loops and conditions. A name outside the catalog is refused when
 * it's saved, so it can never reach someone's inbox as literal text.
 *
 * Client-safe (only the catalogs, which import nothing), so the dashboard's preview runs the same
 * code as the worker. Not `@coss/email/templates`: `email` imports `@coss/scheduling/schemas`, so
 * that'd be a package cycle.
 */

import { dateLocale, type MessageKey, translator } from "./i18n.ts";

export const REMINDER_VARIABLES = {
  event_title: "The event type's title",
  brand: "Your brand name",
  booking_id: "The booking's id",
  location: "Where it happens, such as the meeting link",
  time_until: 'How long until it starts, such as "in 1 hour", in the recipient\'s language',
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

const SUBJECT_KEYS: Record<CopyKind, MessageKey> = {
  confirmed: "subject_confirmed",
  pending_approval: "subject_pending_approval",
  rescheduled: "subject_rescheduled",
  cancelled: "subject_cancelled",
  declined: "subject_declined",
  reminder: "subject_reminder",
  happening: "subject_happening",
  finished: "subject_finished",
  no_show: "subject_no_show",
};

// Guests hear nothing until there's something to come to, and a no-show isn't about them, so they
// have no line for these.
const LEAD_KEYS: Record<
  CopyKind,
  { attendee: MessageKey; host: MessageKey; guest: MessageKey | null }
> = {
  confirmed: {
    attendee: "lead_confirmed_attendee",
    host: "lead_confirmed_host",
    guest: "lead_confirmed_guest",
  },
  pending_approval: {
    attendee: "lead_pending_approval_attendee",
    host: "lead_pending_approval_host",
    guest: null,
  },
  rescheduled: {
    attendee: "lead_rescheduled_attendee",
    host: "lead_rescheduled_host",
    guest: "lead_rescheduled_guest",
  },
  cancelled: {
    attendee: "lead_cancelled_attendee",
    host: "lead_cancelled_host",
    guest: "lead_cancelled_guest",
  },
  declined: { attendee: "lead_declined_attendee", host: "lead_declined_host", guest: null },
  reminder: { attendee: "lead_reminder", host: "lead_reminder", guest: "lead_reminder" },
  happening: { attendee: "lead_happening", host: "lead_happening", guest: "lead_happening" },
  finished: {
    attendee: "lead_finished_attendee",
    host: "lead_finished_host",
    guest: "lead_finished_attendee",
  },
  no_show: { attendee: "lead_no_show_attendee", host: "lead_no_show_host", guest: null },
};

export type CopyAudience = "attendee" | "host" | "guest";

/** The standard subject of an email or text, in the recipient's language. */
export function standardSubject(
  kind: CopyKind,
  title: string,
  locale: string | null | undefined = null,
): string {
  return translator(locale)(SUBJECT_KEYS[kind], { title });
}

/** The standard first line of an email, in the recipient's language. */
export function standardLead(
  kind: CopyKind,
  audience: CopyAudience,
  locale: string | null | undefined = null,
): string {
  const key = LEAD_KEYS[kind][audience];
  return key ? translator(locale)(key) : "";
}

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
 * `attacker。dev` is `attacker.dev` to a browser, and invisible characters don't break up a host. Only
 * for checking, like `linkedHosts`: the marks it drops are part of plenty of people's names.
 */
const asBrowsersReadIt = (text: string): string =>
  text
    .normalize("NFKC")
    .replace(/[\p{Cf}\p{Mn}\p{Me}]/gu, "")
    .replace(/[\u3002\uff0e\uff61]/g, ".");

/**
 * A booker types their own name, and could aim the email at anyone: a name with a link in it renders
 * as nothing, or it's phishing from the customer's own domain.
 */
export function safeName(name: string | null | undefined): string {
  const line = (name ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 100);
  const seen = asBrowsersReadIt(line);
  return URL_LIKE.test(seen) || ADDRESS_LIKE.test(seen) ? "" : line;
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

export function timeUntil(
  startMs: number,
  nowMs: number,
  locale: string | null | undefined = null,
): string {
  const language = dateLocale(locale);
  const minutes = Math.round((startMs - nowMs) / 60_000);
  if (minutes <= 0) {
    return new Intl.RelativeTimeFormat(language, { numeric: "auto" }).format(0, "second");
  }
  const relative = new Intl.RelativeTimeFormat(language, { numeric: "always" });
  if (minutes < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 48) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}
