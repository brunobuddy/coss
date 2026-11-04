/**
 * Why an event type shows no bookable slots, as far as the public API can tell: the event type and
 * its hosts, schedules, calendars, notice, booking window, limits and bookings. A calendar's busy
 * times aren't readable, so a full calendar can only be named as a possibility.
 * `diagnoseSchedulingSlots` is pure (callers fetch, it decides); `fetchSchedulingSlotsDiagnosis`
 * fetches first, and stops as soon as it sees a slot.
 *
 * Must match Scheduling's behaviour: `packages/scheduling/src/availability.ts` (`candidatesOf`,
 * `listEventTypeSlots`), `engine/slots.ts` (`isBookable`), `engine/calendar-verdict.ts` and
 * `packages/scheduling/AGENTS.md`: change them together. Time is computed by the API: nothing here
 * turns local times into instants, so the checks only compare what needs no time zone.
 */
import type { Coss } from "./client.ts";
import type { CossResult } from "./core/errors.ts";
import {
  type ProductDiagnosis,
  type ProductReferences,
  productReferences,
  softly,
} from "./diagnose-shared.ts";
import type {
  SchedulingBooking,
  SchedulingCalendarConnection,
  SchedulingEventType,
  SchedulingHost,
  SchedulingSchedule,
  SchedulingSettings,
  SchedulingSlot,
} from "./types/scheduling.ts";

export type SchedulingSlotsVerdict = "slots_available" | "no_slots";

export interface SchedulingSlotsFinding {
  /**
   * `certain`: this alone means no slots. `likely`: true of some hosts or days. `possible`: can't be
   * confirmed through the API.
   */
  certainty: "certain" | "likely" | "possible";
  code: string;
  explanation: string;
  next_steps: string[];
}

export interface SchedulingSlotsDiagnosis extends ProductDiagnosis<SchedulingSlotsVerdict> {
  event_type: {
    id: string;
    title: string;
    kind: SchedulingEventType["kind"];
    status: SchedulingEventType["status"];
    duration_minutes: number;
    step_minutes: number;
    min_notice_minutes: number;
    buffer_before_minutes: number;
    buffer_after_minutes: number;
    booking_window: SchedulingEventType["booking_window"];
  };
  range: { start: string; end: string };
  slot_count: number;
  first_slot: string | null;
  /** The first slot after `range`, when there are none in it. */
  next_slot: string | null;
  findings: SchedulingSlotsFinding[];
  hosts: {
    id: string;
    name: string;
    status: SchedulingHost["status"];
    role: "required" | "member" | "matched_by_filter";
    time_zone: string;
    schedules: number;
    calendars: { provider: string; status: string; read_busy: number }[];
    bookings_in_range: number | null;
  }[];
}

export interface SchedulingSlotsHostInput {
  host: SchedulingHost;
  role?: "required" | "member" | "matched_by_filter";
  /** Its schedules; `undefined`: they couldn't be read. */
  schedules?: SchedulingSchedule[];
  /** Its calendar connections; `undefined`: they couldn't be read. */
  calendars?: SchedulingCalendarConnection[];
  /** Its live bookings in the range; `undefined`: they couldn't be read. */
  bookings?: Pick<SchedulingBooking, "id" | "status">[];
}

export interface SchedulingSlotsInput {
  eventType: SchedulingEventType;
  range: { start: string; end: string };
  slots: SchedulingSlot[];
  /** The first slot after the range, if any was found. */
  nextSlot?: string | null;
  hosts?: SchedulingSlotsHostInput[];
  /** More hosts could be offered than were looked at, so findings about them can't be certain. */
  hostsTruncated?: boolean;
  settings?: Pick<SchedulingSettings, "calendar_failure_mode"> | null;
  now?: Date;
  references?: Partial<ProductReferences>;
}

/** A local `HH:MM` as minutes (`24:00` is the end of the day). */
function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function longestRule(schedules: SchedulingSchedule[]): number {
  let longest = 0;
  for (const schedule of schedules) {
    for (const rule of schedule.rules) {
      longest = Math.max(longest, minutesOf(rule.end) - minutesOf(rule.start));
    }
    for (const override of schedule.overrides) {
      for (const range of override.ranges) {
        longest = Math.max(longest, minutesOf(range.end) - minutesOf(range.start));
      }
    }
  }
  return longest;
}

/** Calendars whose busy times count: Zoom's is write-only and a simulated one is what you set. */
function readCalendars(connection: SchedulingCalendarConnection) {
  return connection.calendars.filter((calendar) => calendar.read_busy);
}

/** How long a calendar with push notifications is trusted since it was read. */
const PUSH_CALENDAR_STALE_MS = 7 * 60 * 60 * 1000;
/** The same without them. The API doesn't say which a calendar is, so between the two is unclear. */
const POLLED_CALENDAR_STALE_MS = 20 * 60 * 1000;

/** Findings that are about all of the hosts: only `likely` when some weren't looked at. */
const ABOUT_ALL_HOSTS = new Set([
  "hosts_disabled",
  "members_disabled",
  "no_schedule",
  "duration_longer_than_hours",
  "calendar_needs_reauth",
]);

function findingsFor(
  input: SchedulingSlotsInput,
  ref: ProductReferences,
): SchedulingSlotsFinding[] {
  const { eventType, range } = input;
  const now = input.now ?? new Date();
  const hosts = input.hosts ?? [];
  const findings: SchedulingSlotsFinding[] = [];
  const add = (
    certainty: SchedulingSlotsFinding["certainty"],
    code: string,
    explanation: string,
    next_steps: string[] = [],
  ) =>
    findings.push({
      certainty:
        input.hostsTruncated && certainty === "certain" && ABOUT_ALL_HOSTS.has(code)
          ? "likely"
          : certainty,
      code,
      explanation,
      next_steps,
    });

  if (eventType.status !== "active") {
    add(
      "certain",
      "event_type_archived",
      "The event type is archived, so nothing is offered for it.",
      [`Make it active again (${ref.save_scheduling_event_type}).`],
    );
  }
  const startMs = Date.parse(range.start);
  const endMs = Date.parse(range.end);
  if (endMs <= now.getTime()) {
    add("certain", "range_in_past", `The range ends in the past (${range.end}).`, [
      "Ask for a range in the future.",
    ]);
  } else if (endMs <= now.getTime() + eventType.min_notice_minutes * 60_000) {
    add(
      "certain",
      "inside_minimum_notice",
      `The whole range is inside the event type's minimum notice (${eventType.min_notice_minutes} minutes from now).`,
      [
        "Ask for a later range, or lower `min_notice_minutes` " +
          `(${ref.save_scheduling_event_type}).`,
      ],
    );
  }
  const window = eventType.booking_window;
  if (window?.kind === "rolling") {
    if (startMs >= now.getTime() + window.days * 24 * 60 * 60_000) {
      add(
        "certain",
        "outside_booking_window",
        `The range starts after the booking window, which is the next ${window.days} days.`,
        [
          `Ask for an earlier range, or widen \`booking_window\` (${ref.save_scheduling_event_type}).`,
        ],
      );
    }
  } else if (window?.kind === "range") {
    if (range.end.slice(0, 10) < window.from || range.start.slice(0, 10) > window.to) {
      add(
        "certain",
        "outside_booking_window",
        `The range is outside the booking window (${window.from} to ${window.to}).`,
        [
          `Ask for a range inside it, or change \`booking_window\` (${ref.save_scheduling_event_type}).`,
        ],
      );
    }
  }

  if (input.hosts) {
    if (hosts.length === 0) {
      add(
        "certain",
        eventType.kind === "pool" && eventType.host_filter ? "filter_matches_nobody" : "no_hosts",
        eventType.kind === "pool" && eventType.host_filter
          ? "No active host matches the pool's `host_filter`, and none are assigned by name, so nobody can be offered."
          : "The event type has no hosts, so nobody can be offered.",
        [
          `Create a host (${ref.save_scheduling_host}) and assign it (\`hosts\`, ${ref.save_scheduling_event_type}).`,
        ],
      );
    }
    const disabled = hosts.filter((entry) => entry.host.status !== "active");
    const members = hosts.filter((entry) => entry.role !== "required");
    if (hosts.length > 0 && disabled.length === hosts.length) {
      add(
        "certain",
        "hosts_disabled",
        `Every host is disabled (${disabled.map((entry) => entry.host.name).join(", ")}): a disabled host isn't offered.`,
        [`Set a host's status to active (${ref.save_scheduling_host}).`],
      );
    } else if (
      members.length > 0 &&
      members.every((entry) => entry.host.status !== "active") &&
      disabled.length < hosts.length
    ) {
      add(
        "certain",
        "members_disabled",
        `Every member is disabled (${members.map((entry) => entry.host.name).join(", ")}), and a required host is never booked alone in place of one.`,
        [`Set a member's status to active (${ref.save_scheduling_host}).`],
      );
    }
    const active = hosts.filter((entry) => entry.host.status === "active");
    const unscheduled = active.filter(
      (entry) =>
        entry.schedules !== undefined &&
        (entry.schedules.length === 0 ||
          entry.schedules.every((s) => s.rules.length === 0 && s.overrides.length === 0)),
    );
    if (unscheduled.length > 0) {
      add(
        active.length === unscheduled.length ||
          unscheduled.some((entry) => entry.role === "required")
          ? "certain"
          : "likely",
        "no_schedule",
        `${unscheduled.map((entry) => entry.host.name).join(", ")} has no working hours: a host without a schedule has no availability.`,
        [`Give them a schedule (${ref.save_scheduling_schedule}).`],
      );
    }
    const tooShort = active.filter((entry) => {
      if (!entry.schedules || entry.schedules.length === 0) return false;
      const longest = longestRule(entry.schedules);
      return longest > 0 && longest < eventType.duration_minutes;
    });
    if (tooShort.length > 0) {
      add(
        active.length === tooShort.length ? "certain" : "likely",
        "duration_longer_than_hours",
        `The event type takes ${eventType.duration_minutes} minutes, longer than any block of ${tooShort.map((entry) => entry.host.name).join(", ")}'s working hours.`,
        [
          `Lengthen the schedule (${ref.save_scheduling_schedule}) or shorten the event type (${ref.save_scheduling_event_type}).`,
        ],
      );
    }
    const hidesOnFailure = (input.settings?.calendar_failure_mode ?? "hide") === "hide";
    const needsReauth = active.filter((entry) =>
      entry.calendars?.some(
        (connection) =>
          connection.status === "needs_reauth" &&
          connection.provider !== "zoom" &&
          connection.provider !== "simulated",
      ),
    );
    if (needsReauth.length > 0) {
      add(
        hidesOnFailure
          ? active.length === needsReauth.length ||
            needsReauth.some((entry) => entry.role === "required")
            ? "certain"
            : "likely"
          : "possible",
        "calendar_needs_reauth",
        `${needsReauth.map((entry) => entry.host.name).join(", ")} lost access to a calendar${hidesOnFailure ? ", so they aren't offered until it's back: an unreadable calendar never reads as free" : "; with `calendar_failure_mode: last_known` the last known busy times are used"}.`,
        [
          `Have them connect it again (${ref.authorize_scheduling_calendar}; ${ref.list_scheduling_calendars} shows each connection).`,
        ],
      );
    }
    const readCalendarAges = (entry: SchedulingSlotsHostInput): number[] =>
      (entry.calendars ?? []).flatMap((connection) =>
        connection.provider === "zoom" || connection.provider === "simulated"
          ? []
          : readCalendars(connection).map((calendar) =>
              calendar.verified_at === null
                ? Number.POSITIVE_INFINITY
                : now.getTime() - Date.parse(calendar.verified_at),
            ),
      );
    const stale = active.filter(
      (entry) =>
        !needsReauth.includes(entry) &&
        readCalendarAges(entry).some((age) => age > PUSH_CALENDAR_STALE_MS),
    );
    if (stale.length > 0 && hidesOnFailure) {
      add(
        "likely",
        "calendar_not_verified",
        `${stale.map((entry) => entry.host.name).join(", ")} has a calendar coss.com hasn't read recently (or ever), so they're hidden until it can.`,
        [
          `Look at the connection (${ref.list_scheduling_calendars}). A new connection is read within moments; one that stays this way can be connected again (${ref.authorize_scheduling_calendar}).`,
        ],
      );
    }
    const perhapsStale = active.filter(
      (entry) =>
        !needsReauth.includes(entry) &&
        !stale.includes(entry) &&
        readCalendarAges(entry).some((age) => age > POLLED_CALENDAR_STALE_MS),
    );
    if (perhapsStale.length > 0 && hidesOnFailure) {
      add(
        "possible",
        "calendar_maybe_stale",
        `${perhapsStale.map((entry) => entry.host.name).join(", ")} has a calendar last read over 20 minutes ago. A calendar without push notifications counts as out of date after 20 minutes, which hides its host; one with them after 7 hours. The API doesn't say which this is.`,
        [`Look at the connection (${ref.list_scheduling_calendars}).`],
      );
    }
    const closed = active.flatMap((entry) =>
      (entry.schedules ?? []).flatMap((schedule) =>
        schedule.overrides
          .filter(
            (override) =>
              override.ranges.length === 0 &&
              override.date >= range.start.slice(0, 10) &&
              override.date <= range.end.slice(0, 10),
          )
          .map((override) => `${entry.host.name} on ${override.date}`),
      ),
    );
    if (closed.length > 0) {
      add(
        "likely",
        "days_off",
        `Schedule overrides mark days in the range as unavailable: ${closed.join(", ")}.`,
      );
    }
    const booked = active.reduce((sum, entry) => sum + (entry.bookings?.length ?? 0), 0);
    if (booked > 0) {
      add(
        "possible",
        "bookings_in_range",
        `The hosts already have ${booked} booking(s) in the range${eventType.buffer_before_minutes + eventType.buffer_after_minutes > 0 ? `, each also taking the event type's buffers (${eventType.buffer_before_minutes} before, ${eventType.buffer_after_minutes} after)` : ""}.`,
        [`See them (${ref.list_scheduling_bookings}).`],
      );
    }
    if (eventType.limits.length > 0) {
      add(
        "possible",
        "limits",
        `The event type limits bookings (${eventType.limits.map((limit) => `${limit.max} per ${limit.period}, ${limit.scope}`).join("; ")}), which may be used up for these days.`,
        [`See the bookings (${ref.list_scheduling_bookings}).`],
      );
    }
    const connected = active.filter((entry) =>
      entry.calendars?.some(
        (connection) => connection.provider !== "zoom" && readCalendars(connection).length > 0,
      ),
    );
    if (connected.length > 0) {
      add(
        "possible",
        "calendar_busy",
        `Busy times on ${connected.map((entry) => entry.host.name).join(", ")}'s connected calendars also hide slots, and they aren't readable through the API.`,
        ["Check with the host, or look at a wider range."],
      );
    }
  }
  return findings;
}

function hostSummaries(input: SchedulingSlotsInput): SchedulingSlotsDiagnosis["hosts"] {
  return (input.hosts ?? []).map((entry) => ({
    id: entry.host.id,
    name: entry.host.name,
    status: entry.host.status,
    role: entry.role ?? "member",
    time_zone: entry.host.time_zone,
    schedules: entry.schedules?.length ?? 0,
    calendars: (entry.calendars ?? []).map((connection) => ({
      provider: connection.provider,
      status: connection.status,
      read_busy: readCalendars(connection).length,
    })),
    bookings_in_range: entry.bookings?.length ?? null,
  }));
}

export function diagnoseSchedulingSlots(input: SchedulingSlotsInput): SchedulingSlotsDiagnosis {
  const { eventType, range, slots } = input;
  const ref = productReferences(input.references);
  const findings = slots.length > 0 ? [] : findingsFor(input, ref);
  const nextSlot = slots.length > 0 ? null : (input.nextSlot ?? null);
  const certain = findings.filter((finding) => finding.certainty === "certain");
  const top = certain[0] ?? findings[0];
  const explanation =
    slots.length > 0
      ? `${slots.length} slot(s) can be booked in the range.`
      : nextSlot
        ? `Nothing in the range, but the next slot is ${nextSlot}. ${top ? top.explanation : "The hosts' hours and bookings just don't leave a slot in that range."}`
        : top
          ? top.explanation
          : "Nothing the API shows explains it: the likeliest cause is the hosts' calendars or bookings filling the range. Try a wider range.";
  return {
    verdict: slots.length > 0 ? "slots_available" : "no_slots",
    summary:
      slots.length > 0
        ? `"${eventType.title}" has ${slots.length} slot(s) in the range, the first at ${slots[0]?.start}.`
        : `"${eventType.title}" has no slots from ${range.start} to ${range.end}.`,
    explanation,
    next_steps: findings.flatMap((finding) => finding.next_steps),
    warnings: input.hostsTruncated ? ["Only some of the hosts could be looked at."] : [],
    event_type: {
      id: eventType.id,
      title: eventType.title,
      kind: eventType.kind,
      status: eventType.status,
      duration_minutes: eventType.duration_minutes,
      step_minutes: eventType.step_minutes,
      min_notice_minutes: eventType.min_notice_minutes,
      buffer_before_minutes: eventType.buffer_before_minutes,
      buffer_after_minutes: eventType.buffer_after_minutes,
      booking_window: eventType.booking_window,
    },
    range,
    slot_count: slots.length,
    first_slot: slots[0]?.start ?? null,
    next_slot: nextSlot,
    findings,
    hosts: hostSummaries(input),
  };
}

/** Hosts looked at in detail: each costs three reads. */
const MAX_HOSTS = 10;
/** How far past the range to look for the next slot. */
const NEXT_SLOT_DAYS = 31;

/**
 * Whether a host is in a pool: for every key the filter names, the host holds at least one of the
 * wanted values (docs: Scheduling, pools and groups).
 */
function inPool(
  host: SchedulingHost,
  filter: NonNullable<SchedulingEventType["host_filter"]>,
): boolean {
  for (const key of Object.keys(filter)) {
    const held = new Set([host.attributes[key] ?? []].flat());
    if (![filter[key] ?? []].flat().some((value) => held.has(value))) return false;
  }
  return true;
}

/**
 * Reads the event type and its slots in the range. Only with no slots does it read its hosts, their
 * schedules, calendars and bookings, the settings, and the first slot after the range. Fails only
 * when the event type can't be read; the range defaults to the next 7 days.
 */
export async function fetchSchedulingSlotsDiagnosis(
  coss: Coss,
  eventTypeRef: string,
  options: {
    start?: string;
    end?: string;
    host?: string;
    durationMinutes?: number;
    signal?: AbortSignal;
    now?: Date;
    references?: Partial<ProductReferences>;
  } = {},
): Promise<CossResult<SchedulingSlotsDiagnosis>> {
  const read = { signal: options.signal };
  const now = options.now ?? new Date();
  const eventType = await coss.scheduling.eventTypes.get(eventTypeRef, read);
  if (eventType.error) return eventType;
  const range = {
    start: options.start ?? now.toISOString(),
    end: options.end ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const narrow = {
    ...(options.host ? { host: options.host } : {}),
    ...(options.durationMinutes ? { duration_minutes: options.durationMinutes } : {}),
  };
  const slots = await coss.scheduling.slots.list(
    eventTypeRef,
    { start: range.start, end: range.end, ...narrow },
    read,
  );
  if (slots.error) return slots;
  const common = { eventType: eventType.data, range, now, references: options.references };
  if (slots.data.data.length > 0) {
    return { data: diagnoseSchedulingSlots({ ...common, slots: slots.data.data }), error: null };
  }

  const assigned = eventType.data.hosts;
  const refs = options.host ? assigned.filter((entry) => entry.host === options.host) : assigned;
  const named = await Promise.all(
    (options.host && refs.length === 0 ? [options.host] : refs.map((entry) => entry.host))
      .slice(0, MAX_HOSTS)
      .map((host) => softly(coss.scheduling.hosts.get(host, read))),
  );
  const hosts: { host: SchedulingHost; role: "required" | "member" | "matched_by_filter" }[] = [];
  for (const [index, host] of named.entries()) {
    if (host) hosts.push({ host, role: refs[index]?.role ?? "member" });
  }
  let truncated = !options.host && assigned.length > MAX_HOSTS;
  // A host that couldn't be read says nothing, so "nobody is offered" needs every read to work.
  let hostsKnown = named.every((host) => host !== undefined);
  const filter = eventType.data.host_filter;
  if (!options.host && eventType.data.kind === "pool" && filter) {
    const everyone = await softly(coss.scheduling.hosts.list({ limit: 100 }, read));
    // Hosts past this page could match too.
    if (!everyone || everyone.has_more) hostsKnown = false;
    for (const host of everyone?.data ?? []) {
      if (hosts.some((entry) => entry.host.id === host.id)) continue;
      if (host.status !== "active" || !inPool(host, filter)) continue;
      if (hosts.length >= MAX_HOSTS) {
        truncated = true;
        break;
      }
      hosts.push({ host, role: "matched_by_filter" });
    }
  }
  const [details, settings, later] = await Promise.all([
    Promise.all(
      hosts.map(async (entry) => {
        const [schedules, calendars, bookings] = await Promise.all([
          softly(coss.scheduling.schedules.list(entry.host.id, read)),
          softly(coss.scheduling.calendars.list(entry.host.id, read)),
          softly(
            coss.scheduling.bookings.list(
              {
                host: entry.host.id,
                status: "confirmed",
                start_after: range.start,
                start_before: range.end,
                limit: 100,
              },
              read,
            ),
          ),
        ]);
        return {
          ...entry,
          ...(schedules ? { schedules: schedules.data } : {}),
          ...(calendars ? { calendars: calendars.data } : {}),
          ...(bookings ? { bookings: bookings.data } : {}),
        };
      }),
    ),
    softly(coss.scheduling.settings.get(read)),
    softly(
      coss.scheduling.slots.list(
        eventTypeRef,
        {
          start: range.end,
          end: new Date(
            Math.max(Date.parse(range.end), now.getTime()) + NEXT_SLOT_DAYS * 24 * 60 * 60 * 1000,
          ).toISOString(),
          ...narrow,
        },
        read,
      ),
    ),
  ]);
  return {
    data: diagnoseSchedulingSlots({
      ...common,
      slots: [],
      ...(hostsKnown || details.length > 0 ? { hosts: details } : {}),
      hostsTruncated: truncated || !hostsKnown,
      nextSlot: later?.data[0]?.start ?? null,
      ...(settings ? { settings } : {}),
    }),
    error: null,
  };
}
