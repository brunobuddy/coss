/**
 * Busy times out of iCalendar data: only start and end ever leave here. Recurrence expansion is
 * after Cal.com's `expand-recurring-events.ts`, which ignored `TRANSP` and `STATUS`: an event marked
 * free or cancelled is not busy.
 */
import ICAL from "ical.js";
import type { Interval } from "../engine/intervals.ts";

const EXCESSIVE_FREQUENCIES = ["HOURLY", "MINUTELY", "SECONDLY"];
const CLIP_MARGIN_MS = 86_400_000;
const MAX_ITERATIONS = 20_000;

function countsAsBusy(event: ICAL.Component): boolean {
  const transparency = String(event.getFirstPropertyValue("transp") ?? "OPAQUE").toUpperCase();
  const status = String(event.getFirstPropertyValue("status") ?? "CONFIRMED").toUpperCase();
  return transparency !== "TRANSPARENT" && status !== "CANCELLED";
}

function register(root: ICAL.Component): void {
  for (const vtimezone of root.getAllSubcomponents("vtimezone")) {
    const timezone = new ICAL.Timezone(vtimezone);
    if (!ICAL.TimezoneService.has(timezone.tzid)) ICAL.TimezoneService.register(timezone);
  }
}

/** Instances overlapping `[fromMs, toMs)`. Data that can't be parsed gives none for that object. */
export function busyFromIcs(ics: string, fromMs: number, toMs: number): Interval[] {
  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(ics));
    register(root);
  } catch {
    return [];
  }
  const slots: Interval[] = [];
  // A moved or cancelled occurrence is its own VEVENT, linked by RECURRENCE-ID.
  const masters = root.getAllSubcomponents("vevent");
  const exceptions = masters.filter((vevent) => vevent.hasProperty("recurrence-id"));
  for (const vevent of masters) {
    if (vevent.hasProperty("recurrence-id")) continue;
    let event: ICAL.Event;
    try {
      event = new ICAL.Event(vevent);
    } catch {
      continue;
    }
    for (const exception of exceptions) {
      if (exception.getFirstPropertyValue("uid") === event.uid) {
        event.relateException(exception);
      }
    }
    if (!event.startDate || !event.endDate) continue;
    if (!event.isRecurring()) {
      if (!countsAsBusy(vevent)) continue;
      const startMs = event.startDate.toJSDate().getTime();
      const endMs = event.endDate.toJSDate().getTime();
      if (startMs < toMs && endMs > fromMs) slots.push({ startMs, endMs });
      continue;
    }
    const types = event.getRecurrenceTypes() as unknown as Record<string, boolean>;
    if (EXCESSIVE_FREQUENCIES.some((frequency) => types[frequency])) continue;
    const iterator = event.iterator();
    const clipFrom = fromMs - CLIP_MARGIN_MS;
    for (let count = 0; count < MAX_ITERATIONS; count++) {
      const next = iterator.next();
      if (!next) break;
      const at = next.toJSDate().getTime();
      if (at >= toMs) break;
      if (at < clipFrom) continue;
      let details: ReturnType<ICAL.Event["getOccurrenceDetails"]>;
      try {
        details = event.getOccurrenceDetails(next);
      } catch {
        continue;
      }
      if (!countsAsBusy(details.item.component)) continue;
      const startMs = details.startDate.toJSDate().getTime();
      const endMs = details.endDate.toJSDate().getTime();
      if (startMs < toMs && endMs > fromMs) slots.push({ startMs, endMs });
    }
  }
  return slots;
}

const ICS_DATE = (ms: number) =>
  new Date(ms)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

/** Long lines fold at 75 octets (RFC 5545), with the continuation indented. */
function fold(line: string): string {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  parts.push(rest);
  return parts.join("\r\n");
}

export const escapeIcsText = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/**
 * One event in UTC, never floating local time. `method` makes it an invitation an email client
 * offers to add (`REQUEST`) or remove (`CANCEL`); `sequence` is how it knows which is newest.
 */
export function buildIcs(input: {
  uid: string;
  title: string;
  startMs: number;
  endMs: number;
  stampMs: number;
  sequence?: number;
  method?: "REQUEST" | "CANCEL" | null;
  location?: string | null;
  url?: string | null;
  organizer?: { name: string; email: string } | null;
  attendee?: { name: string | null; email: string } | null;
  private?: boolean;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//coss.com//Scheduling//EN",
    "CALSCALE:GREGORIAN",
    ...(input.method ? [`METHOD:${input.method}`] : []),
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${ICS_DATE(input.stampMs)}`,
    `DTSTART:${ICS_DATE(input.startMs)}`,
    `DTEND:${ICS_DATE(input.endMs)}`,
    `SEQUENCE:${input.sequence ?? 0}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    `STATUS:${input.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    ...(input.private ? ["CLASS:PRIVATE"] : []),
    ...(input.location ? [`LOCATION:${escapeIcsText(input.location)}`] : []),
    ...(input.url ? [`URL:${input.url}`] : []),
    ...(input.organizer
      ? [`ORGANIZER;CN=${escapeIcsText(input.organizer.name)}:mailto:${input.organizer.email}`]
      : []),
    ...(input.attendee
      ? [
          `ATTENDEE;CN=${escapeIcsText(input.attendee.name ?? input.attendee.email)};RSVP=FALSE:mailto:${input.attendee.email}`,
        ]
      : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
