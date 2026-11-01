import {
  buildSeedEvents,
  type CalEvent,
  type CalendarAccount,
  type CalendarSource,
} from "expo-kloq";

export const ACCOUNTS: CalendarAccount[] = [
  {
    id: "work",
    label: "work@example.com",
    provider: "google",
    providerLabel: "Google",
    isDefault: true,
  },
  { id: "home", label: "me@example.com", provider: "icloud", providerLabel: "iCloud" },
];

export const CALENDARS: CalendarSource[] = [
  { id: "work", name: "Work", color: "blue", accountId: "work", isDefault: true },
  { id: "team", name: "Team", color: "violet", accountId: "work" },
  { id: "personal", name: "Personal", color: "emerald", accountId: "home" },
  { id: "holidays", name: "Holidays", color: "rose", accountId: "home", readOnly: true },
];

/** Which calendar each of kloq's own seed events belongs to. */
const CALENDAR_OF: Record<string, string> = {
  "seed-standup": "work",
  "seed-design": "team",
  "seed-deep": "work",
  "seed-interview": "team",
  "seed-vendor": "work",
  "seed-oneone": "work",
  "seed-lunch": "personal",
  "seed-release": "team",
  "seed-ooo": "holidays",
};

const pad = (n: number) => String(n).padStart(2, "0");

/** A local wall-clock time `days` from today, as an offset-qualified instant. */
function at(today: Date, days: number, hour: number, minute = 0): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days, hour, minute);
  const off = -d.getTimezoneOffset();
  const sign = off < 0 ? "-" : "+";
  const zone =
    off === 0 ? "Z" : `${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${zone}`;
}

function day(today: Date, days: number): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** kloq's sample week (anchored on this week) plus a few weeks of events around today. */
export function seedEvents(today: Date = new Date()): CalEvent[] {
  const week = buildSeedEvents(today).map((e) => ({
    ...e,
    calendarId: CALENDAR_OF[e.id] ?? "work",
  }));
  const more: CalEvent[] = [
    {
      id: "ex-gym",
      title: "Gym",
      calendarId: "personal",
      rrule: "FREQ=WEEKLY;BYDAY=TU,TH",
      start: at(today, -14, 7, 0),
      end: at(today, -14, 8, 0),
    },
    {
      id: "ex-planning",
      title: "Sprint planning",
      calendarId: "team",
      rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO",
      start: at(today, -21, 10, 0),
      end: at(today, -21, 11, 30),
      location: "Room 2",
      reminders: [{ minutesBefore: 15 }],
    },
    {
      id: "ex-dentist",
      title: "Dentist",
      calendarId: "personal",
      start: at(today, 2, 16, 0),
      end: at(today, 2, 16, 45),
    },
    {
      id: "ex-offsite",
      title: "Team offsite",
      calendarId: "team",
      allDay: true,
      start: day(today, 9),
      end: day(today, 11),
      location: "Lisbon",
    },
    {
      id: "ex-review",
      title: "Quarterly review",
      calendarId: "work",
      start: at(today, 12, 14, 0),
      end: at(today, 12, 15, 30),
    },
    {
      id: "ex-dinner",
      title: "Dinner with Alex",
      calendarId: "personal",
      start: at(today, 5, 19, 30),
      end: at(today, 5, 21, 0),
    },
    {
      id: "ex-flight",
      title: "Flight to Berlin",
      calendarId: "personal",
      start: at(today, 18, 8, 15),
      end: at(today, 18, 11, 0),
    },
    {
      id: "ex-holiday",
      title: "Public holiday",
      calendarId: "holidays",
      allDay: true,
      readOnly: true,
      start: day(today, 24),
      end: day(today, 25),
    },
    {
      id: "ex-call",
      title: "Call with Priya",
      calendarId: "work",
      start: at(today, 0, 17, 0),
      end: at(today, 0, 17, 30),
    },
  ];
  return [...week, ...more];
}
