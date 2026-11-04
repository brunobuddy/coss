/** Microsoft 365 calendars over Graph, on an injected `fetch` so tests run on a fake. */
import { type Interval, normalizeIntervals } from "../engine/intervals.ts";
import {
  type CalendarChannel,
  type CalendarClient,
  CalendarError,
  type CalendarEventState,
  type CalendarEventWrite,
  type CalendarEventWritten,
  errorFromStatus,
  type HttpFetch,
  type RemoteCalendar,
} from "./client.ts";
import { isMailboxGoneCode } from "./delegation-tokens.ts";

const API = "https://graph.microsoft.com/v1.0";
const GRAPH_BATCH = 20;
// Graph allows a calendar subscription at most about three days.
const MAX_SUBSCRIPTION_SECONDS = 4200 * 60;
// A retried `transactionId`'s answer is undocumented and it can't be filtered on; this can.
const EVENT_KEY_PROPERTY = "String {3f1c7a52-8e0b-4d6e-9a27-5c4b1e7d2f60} Name cossEventKey";

type GraphDate = { dateTime: string; timeZone: string };
type GraphEvent = {
  id: string;
  isCancelled?: boolean;
  showAs?: string;
  isAllDay?: boolean;
  start: GraphDate;
  end: GraphDate;
  location?: { displayName?: string } | null;
  onlineMeeting?: { joinUrl?: string } | null;
};

// We ask for UTC with `Prefer`, so naive timestamps are UTC.
function instantOf(date: GraphDate): number {
  const hasZone = /(Z|[+-]\d\d:\d\d)$/.test(date.dateTime);
  return Date.parse(hasZone ? date.dateTime : `${date.dateTime}Z`);
}

function toBody(event: CalendarEventWrite) {
  return {
    subject: event.title,
    sensitivity: "private",
    showAs: "busy",
    responseRequested: false,
    ...(event.description !== undefined
      ? { body: { contentType: "text", content: event.description ?? "" } }
      : {}),
    start: { dateTime: new Date(event.startMs).toISOString(), timeZone: "UTC" },
    end: { dateTime: new Date(event.endMs).toISOString(), timeZone: "UTC" },
    ...(event.location ? { location: { displayName: event.location } } : {}),
    ...(event.conference === "microsoft_teams"
      ? { isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" }
      : {}),
  };
}

function saysTheSame(existing: GraphEvent, event: CalendarEventWrite): boolean {
  return (
    // We don't read what an event says: if a lost attempt wrote details, only a write settles it.
    event.description === undefined &&
    instantOf(existing.start) === event.startMs &&
    instantOf(existing.end) === event.endMs &&
    (!event.location || existing.location?.displayName === event.location)
  );
}

function written(event: GraphEvent): CalendarEventWritten {
  return { providerEventId: event.id, meetingUrl: event.onlineMeeting?.joinUrl ?? null };
}

const UTC_PREFER = { Prefer: 'outlook.timezone="UTC"' };

export function microsoftCalendarClient(input: {
  accessToken: string;
  fetcher: HttpFetch;
  /** A delegation's: its token isn't anyone's, so every path has to say whose mailbox it means. */
  mailbox?: string;
}): CalendarClient {
  const { accessToken, fetcher, mailbox } = input;
  const owner = mailbox ? `/users/${encodeURIComponent(mailbox)}` : "/me";

  const call = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const url = path.startsWith("http") ? path : `${API}${path}`;
    const res = await fetcher(url, {
      ...init,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });
    if (res.status === 204) return undefined as T;
    if (!res.ok) {
      const code = await res
        .json()
        .then((body: { error?: { code?: string } }) => body.error?.code)
        .catch(() => undefined);
      // A revoked or suspended account comes back as 403 with one of these.
      if (code === "InvalidAuthenticationToken" || code === "ErrorAccessDenied") {
        throw new CalendarError("auth", code, "The calendar refused our access.");
      }
      if (mailbox && code && isMailboxGoneCode(code)) {
        throw new CalendarError("auth", code, "This mailbox can't be reached.");
      }
      throw errorFromStatus(res.status, code ?? "graph_error", res.headers.get("retry-after"));
    }
    return (await res.json()) as T;
  };

  const encode = encodeURIComponent;

  const eventsWithKey = async (key: string): Promise<GraphEvent[]> => {
    const value = key.replace(/'/g, "''");
    const filter = `singleValueExtendedProperties/Any(ep: ep/id eq '${EVENT_KEY_PROPERTY}' and ep/value eq '${value}')`;
    const page = await call<{ value?: GraphEvent[] }>(
      `${owner}/events?$filter=${encode(filter)}&$select=id,start,end,location,onlineMeeting`,
      { headers: UTC_PREFER },
    );
    return page.value ?? [];
  };

  return {
    async listCalendars(): Promise<RemoteCalendar[]> {
      const calendars: RemoteCalendar[] = [];
      let next: string | undefined =
        `${owner}/calendars?$select=id,name,isDefaultCalendar,canEdit&$top=100`;
      while (next) {
        const page: {
          value?: { id: string; name?: string; isDefaultCalendar?: boolean; canEdit?: boolean }[];
          "@odata.nextLink"?: string;
        } = await call(next);
        for (const item of page.value ?? []) {
          calendars.push({
            externalId: item.id,
            name: item.name ?? null,
            primary: item.isDefaultCalendar === true,
            writable: item.canEdit !== false,
          });
        }
        next = page["@odata.nextLink"];
      }
      return calendars;
    },

    async fetchBusy({ calendarIds, fromMs, toMs }) {
      const from = encode(new Date(fromMs).toISOString());
      const to = encode(new Date(toMs).toISOString());
      // `$select` is what keeps titles out: Graph has no narrower read scope.
      const query = `?startDateTime=${from}&endDateTime=${to}&$select=showAs,start,end,isCancelled&$top=999`;
      const result: Record<string, Interval[]> = {};

      const collect = (events: GraphEvent[], into: Interval[]) => {
        for (const event of events) {
          if (event.isCancelled || event.showAs === "free") continue;
          into.push({ startMs: instantOf(event.start), endMs: instantOf(event.end) });
        }
      };

      for (let index = 0; index < calendarIds.length; index += GRAPH_BATCH) {
        const batch = calendarIds.slice(index, index + GRAPH_BATCH);
        const response = await call<{
          responses?: {
            id: string;
            status: number;
            body?: { value?: GraphEvent[]; "@odata.nextLink"?: string; error?: { code?: string } };
          }[];
        }>("/$batch", {
          method: "POST",
          body: JSON.stringify({
            requests: batch.map((calendarId, position) => ({
              id: String(position),
              method: "GET",
              url: `${owner}/calendars/${calendarId}/calendarView${query}`,
              headers: UTC_PREFER,
            })),
          }),
        });
        if (!response.responses) {
          throw new CalendarError("transient", "no_responses", "Graph returned no responses.");
        }
        for (const item of response.responses) {
          const id = batch[Number(item.id)];
          // With a delegation's token this is a revocation, which must not pass as one failed read.
          if (mailbox && (item.status === 401 || item.status === 403)) {
            throw new CalendarError(
              "auth",
              item.body?.error?.code ?? "graph_refused",
              "The calendar refused our access.",
            );
          }
          if (mailbox && isMailboxGoneCode(item.body?.error?.code)) {
            throw new CalendarError(
              "auth",
              item.body?.error?.code ?? "graph_refused",
              "This mailbox can't be reached.",
            );
          }
          // Left out, not empty: a failure must not read as free.
          if (!id || item.status !== 200 || !item.body) continue;
          const intervals: Interval[] = [];
          collect(item.body.value ?? [], intervals);
          let next = item.body["@odata.nextLink"];
          let failed = false;
          while (next) {
            try {
              const page: { value?: GraphEvent[]; "@odata.nextLink"?: string } = await call(next, {
                headers: UTC_PREFER,
              });
              collect(page.value ?? [], intervals);
              next = page["@odata.nextLink"];
            } catch {
              failed = true;
              break;
            }
          }
          if (!failed) result[id] = normalizeIntervals(intervals);
        }
      }
      return result;
    },

    async createEvent(calendarId, event) {
      const [found] = await eventsWithKey(event.key);
      const existing =
        found ??
        (await call<GraphEvent>(`${owner}/calendars/${calendarId}/events`, {
          method: "POST",
          headers: UTC_PREFER,
          body: JSON.stringify({
            ...toBody(event),
            transactionId: event.key,
            singleValueExtendedProperties: [{ id: EVENT_KEY_PROPERTY, value: event.key }],
          }),
        }));
      return saysTheSame(existing, event)
        ? written(existing)
        : this.updateEvent(calendarId, existing.id, event);
    },

    async updateEvent(_calendarId, providerEventId, event) {
      return written(
        await call<GraphEvent>(`${owner}/events/${encode(providerEventId)}`, {
          method: "PATCH",
          body: JSON.stringify(toBody(event)),
        }),
      );
    },

    async deleteEvent(_calendarId, providerEventId) {
      try {
        await call(`${owner}/events/${encode(providerEventId)}`, { method: "DELETE" });
      } catch (error) {
        if (error instanceof CalendarError && error.status === 404) return;
        throw error;
      }
    },

    async deleteEventByKey(calendarId, key) {
      for (const event of await eventsWithKey(key)) {
        await this.deleteEvent(calendarId, event.id);
      }
    },

    async getEvent(_calendarId, providerEventId): Promise<CalendarEventState | null> {
      try {
        const event = await call<GraphEvent>(
          `${owner}/events/${encode(providerEventId)}?$select=start,end,isCancelled`,
          { headers: UTC_PREFER },
        );
        if (event.isCancelled) return { state: "deleted" };
        return {
          state: "present",
          startMs: instantOf(event.start),
          endMs: instantOf(event.end),
        };
      } catch (error) {
        if (error instanceof CalendarError && error.status === 404) {
          return { state: "deleted" };
        }
        throw error;
      }
    },

    async subscribe({ calendarId, webhookUrl, token, ttlSeconds }): Promise<CalendarChannel> {
      const seconds = Math.min(ttlSeconds, MAX_SUBSCRIPTION_SECONDS);
      const created = await call<{ id: string; expirationDateTime?: string }>("/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          changeType: "created,updated,deleted",
          notificationUrl: webhookUrl,
          resource: `${owner}/calendars/${calendarId}/events`,
          expirationDateTime: new Date(Date.now() + seconds * 1000).toISOString(),
          clientState: token,
        }),
      });
      return {
        channelId: created.id,
        resourceId: null,
        expiresAtMs: created.expirationDateTime ? Date.parse(created.expirationDateTime) : null,
      };
    },

    async unsubscribe({ channelId }) {
      await call(`/subscriptions/${encode(channelId)}`, { method: "DELETE" });
    },
  };
}
