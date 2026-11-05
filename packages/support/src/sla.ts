/** The support clock: pure, so every plan, weekend and daylight-saving change can be tested. */
import { SUPPORT_HOURS } from "@coss/billing/catalog";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

export type SupportCalendar = {
  timeZone: string;
  weekdays: readonly number[];
  startHour: number;
  endHour: number;
};

type LocalDate = { year: number; month: number; day: number };

function localParts(at: Date, timeZone: string): LocalDate & { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

/** The instant a local wall clock time happens; a second pass settles daylight-saving offsets. */
function zonedInstant(date: LocalDate, hour: number, timeZone: string): Date {
  const wall = Date.UTC(date.year, date.month - 1, date.day, hour);
  let guess = wall;
  for (let pass = 0; pass < 2; pass++) {
    const local = localParts(new Date(guess), timeZone);
    const shown = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
    guess += wall - shown;
  }
  return new Date(guess);
}

function nextDate(date: LocalDate): LocalDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day) + DAY);
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

function isoWeekday(date: LocalDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay() || 7;
}

/** `minutes` of support hours after `from`. Assumes a calendar with at least one open weekday. */
export function addBusinessMinutes(
  from: Date,
  minutes: number,
  calendar: SupportCalendar = SUPPORT_HOURS,
): Date {
  let remaining = minutes;
  let cursor = from;
  let date: LocalDate = localParts(from, calendar.timeZone);
  while (true) {
    if (calendar.weekdays.includes(isoWeekday(date))) {
      const open = zonedInstant(date, calendar.startHour, calendar.timeZone);
      const close = zonedInstant(date, calendar.endHour, calendar.timeZone);
      const start = cursor > open ? cursor : open;
      if (start < close) {
        const available = (close.getTime() - start.getTime()) / MINUTE;
        if (remaining <= available) return new Date(start.getTime() + remaining * MINUTE);
        remaining -= available;
      }
    }
    date = nextDate(date);
    cursor = zonedInstant(date, 0, calendar.timeZone);
  }
}

/** When a response is due for a customer waiting since `from`. */
export function responseDueAt(input: {
  from: Date;
  minutes: number;
  allHours: boolean;
  calendar?: SupportCalendar;
}): Date {
  return input.allHours
    ? new Date(input.from.getTime() + input.minutes * MINUTE)
    : addBusinessMinutes(input.from, input.minutes, input.calendar);
}

/** "Tue, Nov 4, 2:00 PM CST": a promise a customer can read, in the support team's zone. */
export function formatSupportTime(at: Date, calendar: SupportCalendar = SUPPORT_HOURS): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: calendar.timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(at);
}
