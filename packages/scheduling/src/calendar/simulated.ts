import type { CalendarClient, RemoteCalendar } from "./client.ts";

export const SIMULATED_CALENDAR_ID = "simulated";

/**
 * Sandbox only: a calendar nobody hosts. Its busy times are set through the API, so a sync leaves
 * them alone (`fetchBusy` reports nothing to replace them with), and writes just succeed.
 */
export function simulatedCalendarClient(): CalendarClient {
  const calendars: RemoteCalendar[] = [
    {
      externalId: SIMULATED_CALENDAR_ID,
      name: "Simulated calendar",
      primary: true,
      writable: true,
    },
  ];
  return {
    listCalendars: async () => calendars,
    fetchBusy: async () => ({}),
    createEvent: async (_calendarId, event) => ({
      providerEventId: event.key,
      meetingUrl:
        event.conference === "google_meet"
          ? `https://meet.google.com/sim-${event.key.slice(0, 8)}`
          : event.conference === "microsoft_teams"
            ? `https://teams.microsoft.com/l/meetup-join/sim-${event.key.slice(0, 8)}`
            : event.conference === "zoom"
              ? `https://zoom.us/j/sim-${event.key.slice(0, 8)}`
              : null,
    }),
    updateEvent: async (_calendarId, providerEventId) => ({ providerEventId, meetingUrl: null }),
    deleteEvent: async () => {},
    deleteEventByKey: async () => {},
    getEvent: async () => null,
  };
}
