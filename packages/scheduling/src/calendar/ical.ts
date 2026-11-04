/**
 * Busy times out of iCalendar data: only start and end ever leave here. Recurrence expansion is
 * after Cal.com's `expand-recurring-events.ts`, which ignored `TRANSP` and `STATUS`: an event marked
 * free or cancelled is not busy.
 */
import ICAL from "ical.js";
import type { Interval } from "../engine/intervals.ts";

// One rule's limits: past either, the rest of its span counts as busy.
const MAX_CYCLES_PER_EVENT = 300_000;
const MAX_OCCURRENCES_PER_EVENT = 5_000;
// Past this a read fails, so a hostile server only hides its own host.
const MAX_CYCLES_PER_READ = 3_000_000;

/** Calendar data that says nothing about when its host is busy, so the read can't be trusted. */
export class UnreadableCalendarData extends Error {}

export type ExpansionBudget = { cycles: number };
export const newExpansionBudget = (): ExpansionBudget => ({ cycles: MAX_CYCLES_PER_READ });

class RuleTooExpensive extends Error {}

let cyclesLeft = Number.POSITIVE_INFINITY;

// ical.js 2.2.1 can spin forever in `next()`, and this check is in its one loop (AGENTS.md).
const checkContractingRules = ICAL.RecurIterator.prototype.check_contracting_rules;
ICAL.RecurIterator.prototype.check_contracting_rules = function (this: ICAL.RecurIterator) {
  if (--cyclesLeft < 0) throw new RuleTooExpensive();
  return checkContractingRules.call(this);
};

function countsAsBusy(event: ICAL.Component): boolean {
  const transparency = String(event.getFirstPropertyValue("transp") ?? "OPAQUE").toUpperCase();
  const status = String(event.getFirstPropertyValue("status") ?? "CONFIRMED").toUpperCase();
  return transparency !== "TRANSPARENT" && status !== "CANCELLED";
}

function instantOf(time: ICAL.Time): number {
  const ms = time.toJSDate().getTime();
  if (Number.isNaN(ms)) throw new UnreadableCalendarData();
  return ms;
}

function spanOf(event: ICAL.Event): Interval {
  if (!event.startDate) throw new UnreadableCalendarData();
  return { startMs: instantOf(event.startDate), endMs: instantOf(event.endDate) };
}

/** When a rule can last occur, if it says. `COUNT` doesn't without expanding it. */
function lastOccurrenceMs(event: ICAL.Event): number {
  const rules = event.component
    .getAllProperties("rrule")
    .map((property) => property.getFirstValue() as ICAL.Recur);
  if (event.component.hasProperty("rdate") || rules.length === 0) return Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  for (const rule of rules) {
    if (!rule.until) return Number.POSITIVE_INFINITY;
    last = Math.max(last, instantOf(rule.until));
  }
  return last;
}

function expandRecurring(
  master: ICAL.Component,
  event: ICAL.Event,
  overrides: readonly ICAL.Event[],
  fromMs: number,
  toMs: number,
  budget: ExpansionBudget,
): Interval[] {
  const slots: Interval[] = [];
  const add = (span: Interval) => {
    if (span.startMs < toMs && span.endMs > fromMs) slots.push(span);
  };
  const addOverrides = () => {
    for (const override of overrides) {
      if (countsAsBusy(override.component)) add(spanOf(override));
    }
  };
  const base = spanOf(event);
  const masterBusy = countsAsBusy(master);
  if (!masterBusy && overrides.length === 0) return slots;
  // An override can land far from its place in the series.
  let moved = 0;
  let longest = base.endMs - base.startMs;
  for (const override of overrides) {
    const span = spanOf(override);
    moved = Math.max(moved, Math.abs(span.startMs - instantOf(override.recurrenceId)));
    longest = Math.max(longest, span.endMs - span.startMs);
  }
  const allowance = Math.min(MAX_CYCLES_PER_EVENT, budget.cycles);
  if (allowance <= 0) throw new UnreadableCalendarData();
  cyclesLeft = allowance;
  let reachedMs = base.startMs;
  let occurrences = 0;
  try {
    const iterator = event.iterator();
    for (;;) {
      const next = iterator.next();
      if (!next) return slots;
      reachedMs = instantOf(next);
      if (reachedMs - moved >= toMs) return slots;
      if (reachedMs + moved + longest <= fromMs) continue;
      const details = event.getOccurrenceDetails(next);
      if (!countsAsBusy(details.item.component)) continue;
      add({ startMs: instantOf(details.startDate), endMs: instantOf(details.endDate) });
      if (++occurrences >= MAX_OCCURRENCES_PER_EVENT) throw new RuleTooExpensive();
    }
  } catch {
    // Its start and end are known, so this bounds it rather than failing the whole read.
    if (masterBusy) {
      add({
        startMs: Math.max(fromMs, reachedMs - moved),
        endMs: Math.min(toMs, lastOccurrenceMs(event) + moved + longest),
      });
    }
    addOverrides();
    return slots;
  } finally {
    budget.cycles -= allowance - Math.max(cyclesLeft, 0);
    cyclesLeft = Number.POSITIVE_INFINITY;
  }
}

/** Instances overlapping `[fromMs, toMs)`. `UnreadableCalendarData` means a failed read. */
export function busyFromIcs(
  ics: string,
  fromMs: number,
  toMs: number,
  budget: ExpansionBudget = newExpansionBudget(),
): Interval[] {
  try {
    const root = new ICAL.Component(ICAL.parse(ics));
    if (root.name !== "vcalendar") throw new UnreadableCalendarData();
    const slots: Interval[] = [];
    const add = (span: Interval) => {
      if (span.startMs < toMs && span.endMs > fromMs) slots.push(span);
    };
    // A moved or cancelled occurrence is its own VEVENT, linked by RECURRENCE-ID.
    const vevents = root.getAllSubcomponents("vevent");
    const masters = vevents.filter((vevent) => !vevent.hasProperty("recurrence-id"));
    const uidOf = (vevent: ICAL.Component) => vevent.getFirstPropertyValue("uid");
    const masterUids = new Set(masters.map(uidOf));
    for (const vevent of vevents) {
      // Someone invited to one occurrence gets it alone, with no series to hang it on.
      if (vevent.hasProperty("recurrence-id") && !masterUids.has(uidOf(vevent))) {
        if (countsAsBusy(vevent)) add(spanOf(new ICAL.Event(vevent)));
      }
    }
    for (const master of masters) {
      const event = new ICAL.Event(master);
      const overrides: ICAL.Event[] = [];
      for (const vevent of vevents) {
        if (vevent.hasProperty("recurrence-id") && uidOf(vevent) === event.uid) {
          event.relateException(vevent);
          overrides.push(new ICAL.Event(vevent));
        }
      }
      if (event.isRecurring()) {
        slots.push(...expandRecurring(master, event, overrides, fromMs, toMs, budget));
        continue;
      }
      if (countsAsBusy(master)) add(spanOf(event));
      for (const override of overrides) {
        if (countsAsBusy(override.component)) add(spanOf(override));
      }
    }
    return slots;
  } catch (error) {
    if (error instanceof UnreadableCalendarData) throw error;
    throw new UnreadableCalendarData();
  }
}

const MAX_FEED_EVENTS = 5000;
const MAX_HOLIDAY_DAYS = 400;
const MAX_HOLIDAY_SPAN_DAYS = 60;
const MAX_NAME_LENGTH = 200;
const DAY = 86_400_000;

/** A local date, as written: holidays are days, in nobody's time zone. */
function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

/**
 * Whole days in `[from, to)`, with names. A feed may mix in other things, and timed events aren't
 * holidays, so those are left out; what can't be understood at all is a failed read, and keeps what's
 * there. Google's feeds mark days nobody gets off as "Observance", which don't take anyone away.
 */
export function holidaysFromIcs(
  ics: string,
  from: string,
  to: string,
  budget: ExpansionBudget = newExpansionBudget(),
): { date: string; name: string; region: string | null }[] {
  const found = new Map<string, { name: string; region: string | null }>();
  const add = (first: string, last: string, name: string, region: string | null) => {
    for (let date = first; date < last; date = shiftDate(date, 1)) {
      if (date < from || date >= to) continue;
      const earlier = found.get(date);
      if (earlier) {
        // Nationwide wins, and two regions' holidays on one day apply to both.
        earlier.region = earlier.region && region ? `${earlier.region}, ${region}` : null;
        continue;
      }
      if (found.size >= MAX_HOLIDAY_DAYS) throw new UnreadableCalendarData();
      found.set(date, { name, region });
    }
  };
  try {
    const root = new ICAL.Component(ICAL.parse(ics));
    if (root.name !== "vcalendar") throw new UnreadableCalendarData();
    const vevents = root.getAllSubcomponents("vevent");
    if (vevents.length > MAX_FEED_EVENTS) throw new UnreadableCalendarData();
    const nameOf = (vevent: ICAL.Component) =>
      String(vevent.getFirstPropertyValue("summary") ?? "Holiday").slice(0, MAX_NAME_LENGTH);
    // Not `countsAsBusy`: holiday feeds mark every event `TRANSP:TRANSPARENT`, since a holiday
    // doesn't block anyone's calendar by itself.
    const isDayOff = (vevent: ICAL.Component) =>
      String(vevent.getFirstPropertyValue("status") ?? "CONFIRMED").toUpperCase() !== "CANCELLED" &&
      !/observance/i.test(String(vevent.getFirstPropertyValue("description") ?? ""));
    // "Public holiday in Scotland": only some of a country's people have it off.
    const regionOf = (vevent: ICAL.Component) => {
      const text = String(vevent.getFirstPropertyValue("description") ?? "");
      return (
        /^Public holiday in ([^\n]+)/i.exec(text)?.[1]?.trim().slice(0, MAX_NAME_LENGTH) ?? null
      );
    };
    const addEvent = (vevent: ICAL.Component) => {
      if (!isDayOff(vevent)) return;
      const event = new ICAL.Event(vevent);
      if (!event.startDate?.isDate) return;
      const first = event.startDate.toString();
      const end = event.endDate?.isDate ? event.endDate.toString() : shiftDate(first, 1);
      if (end > shiftDate(first, MAX_HOLIDAY_SPAN_DAYS)) throw new UnreadableCalendarData();
      add(first, end > first ? end : shiftDate(first, 1), nameOf(vevent), regionOf(vevent));
    };
    const masters = vevents.filter((vevent) => !vevent.hasProperty("recurrence-id"));
    const overridesOf = new Map<string, ICAL.Component[]>();
    for (const vevent of vevents) {
      if (!vevent.hasProperty("recurrence-id")) continue;
      addEvent(vevent);
      const uid = String(vevent.getFirstPropertyValue("uid"));
      overridesOf.set(uid, [...(overridesOf.get(uid) ?? []), vevent]);
    }
    for (const master of masters) {
      const event = new ICAL.Event(master);
      if (!event.isRecurring()) {
        addEvent(master);
        continue;
      }
      if (!isDayOff(master) || !event.startDate?.isDate) continue;
      const moved = new Set(
        (overridesOf.get(event.uid) ?? []).map((vevent) =>
          String(vevent.getFirstPropertyValue("recurrence-id")),
        ),
      );
      // Every occurrence lasts as long as the first: a three-day closure is one every year.
      const first = event.startDate.toString();
      const end = event.endDate?.isDate ? event.endDate.toString() : shiftDate(first, 1);
      if (end > shiftDate(first, MAX_HOLIDAY_SPAN_DAYS)) throw new UnreadableCalendarData();
      const days = Math.max(1, Math.round((Date.parse(end) - Date.parse(first)) / DAY));
      const iterator = event.iterator();
      cyclesLeft = budget.cycles;
      try {
        for (let next = iterator.next(), count = 0; next; next = iterator.next(), count++) {
          // Stopping here would be a partial read, and what's missing would be taken away.
          if (count > MAX_OCCURRENCES_PER_EVENT) throw new UnreadableCalendarData();
          const date = next.toString();
          if (date >= to) break;
          if (!moved.has(date)) {
            add(date, shiftDate(date, days), nameOf(master), regionOf(master));
          }
        }
      } catch (error) {
        if (error instanceof RuleTooExpensive) throw new UnreadableCalendarData();
        throw error;
      } finally {
        budget.cycles = Math.max(cyclesLeft, 0);
        cyclesLeft = Number.POSITIVE_INFINITY;
      }
    }
  } catch (error) {
    if (error instanceof UnreadableCalendarData) throw error;
    throw new UnreadableCalendarData();
  }
  return [...found.entries()]
    .map(([date, holiday]) => ({ date, ...holiday }))
    .sort((a, b) => a.date.localeCompare(b.date));
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
  description?: string | null;
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
    ...(input.description ? [`DESCRIPTION:${escapeIcsText(input.description)}`] : []),
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
