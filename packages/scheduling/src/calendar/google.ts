/** Google Calendar over its REST API, on an injected `fetch` so tests run on a fake. */
import { createHash, randomUUID } from "node:crypto";
import { normalizeIntervals } from "../engine/intervals.ts";
import {
  type CalendarChannel,
  type CalendarClient,
  CalendarError,
  type CalendarEventState,
  type CalendarEventWrite,
  type CalendarEventWritten,
  chunkRange,
  errorFromStatus,
  type HttpFetch,
  type RemoteCalendar,
} from "./client.ts";

const API = "https://www.googleapis.com/calendar/v3";
const FREEBUSY_MAX_DAYS = 88;
const FREEBUSY_BATCH = 50;
// With a delegation's token a 403 with these says the admin took something away, not that this one
// request isn't allowed: a write would otherwise give up for good.
const DELEGATION_LOST_REASONS = new Set([
  "insufficientPermissions",
  "accessNotConfigured",
  "authError",
]);
const QUOTA_REASONS = new Set(["quotaExceeded", "dailyLimitExceeded"]);

/** Google lets clients choose an event's id, which is what makes a create safe to retry. */
export function googleEventId(key: string): string {
  return `c${createHash("sha256").update(key).digest("hex")}`;
}

type GoogleEvent = {
  id?: string;
  status?: string;
  hangoutLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  conferenceData?: {
    entryPoints?: { entryPointType?: string; uri?: string }[];
    createRequest?: { status?: { statusCode?: string } };
  };
};

function toBody(event: CalendarEventWrite) {
  return {
    summary: event.title,
    start: { dateTime: new Date(event.startMs).toISOString() },
    end: { dateTime: new Date(event.endMs).toISOString() },
    visibility: "private",
    ...(event.location ? { location: event.location } : {}),
    ...(event.conference === "google_meet"
      ? {
          conferenceData: {
            createRequest: {
              requestId: event.key.slice(0, 64),
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }
      : {}),
  };
}

function written(event: GoogleEvent): CalendarEventWritten {
  const video = event.conferenceData?.entryPoints?.find(
    (entry) => entry.entryPointType === "video",
  );
  return {
    providerEventId: event.id as string,
    meetingUrl: event.hangoutLink ?? video?.uri ?? null,
  };
}

export function googleCalendarClient(input: {
  accessToken: string;
  fetcher: HttpFetch;
  delegated?: boolean;
}): CalendarClient {
  const { accessToken, fetcher, delegated } = input;

  const call = async <T>(
    path: string,
    init: RequestInit = {},
    code = "google_error",
  ): Promise<T> => {
    const res = await fetcher(`${API}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });
    if (res.status === 204) return undefined as T;
    if (!res.ok) {
      const reason = await res
        .json()
        .then(
          (body: { error?: { errors?: { reason?: string }[] } }) => body.error?.errors?.[0]?.reason,
        )
        .catch(() => undefined);
      // Google reports both quota and "rate limited" as a 403 with a reason.
      if (reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") {
        throw errorFromStatus(429, reason, res.headers.get("retry-after"));
      }
      if (delegated && reason) {
        if (QUOTA_REASONS.has(reason)) {
          throw errorFromStatus(429, reason, res.headers.get("retry-after"));
        }
        if (DELEGATION_LOST_REASONS.has(reason)) {
          throw new CalendarError("auth", reason, "The calendar refused our access.");
        }
      }
      throw errorFromStatus(res.status, reason ?? code, res.headers.get("retry-after"));
    }
    return (await res.json()) as T;
  };

  const encode = encodeURIComponent;

  return {
    async listCalendars(): Promise<RemoteCalendar[]> {
      const calendars: RemoteCalendar[] = [];
      let pageToken: string | undefined;
      do {
        const page = await call<{
          nextPageToken?: string;
          items?: { id: string; summary?: string; primary?: boolean; accessRole?: string }[];
        }>(
          `/users/me/calendarList?maxResults=250${pageToken ? `&pageToken=${encode(pageToken)}` : ""}`,
        );
        for (const item of page.items ?? []) {
          calendars.push({
            externalId: item.id,
            name: item.summary ?? null,
            primary: item.primary === true,
            writable: item.accessRole === "owner",
          });
        }
        pageToken = page.nextPageToken;
      } while (pageToken);
      return calendars;
    },

    async fetchBusy({ calendarIds, fromMs, toMs }) {
      const collected = new Map<string, { startMs: number; endMs: number }[]>(
        calendarIds.map((id) => [id, []]),
      );
      // A calendar that errored in any chunk stays out: partial busy times would hide meetings.
      const errored = new Set<string>();
      for (let index = 0; index < calendarIds.length; index += FREEBUSY_BATCH) {
        const batch = calendarIds.slice(index, index + FREEBUSY_BATCH);
        for (const [from, to] of chunkRange(fromMs, toMs, FREEBUSY_MAX_DAYS)) {
          const response = await call<{
            calendars?: Record<
              string,
              { errors?: unknown[]; busy?: { start: string; end: string }[] }
            >;
          }>("/freeBusy", {
            method: "POST",
            body: JSON.stringify({
              timeMin: new Date(from).toISOString(),
              timeMax: new Date(to).toISOString(),
              items: batch.map((id) => ({ id })),
            }),
          });
          if (!response.calendars) {
            throw new CalendarError("transient", "no_calendars", "freeBusy returned no calendars.");
          }
          for (const id of batch) {
            const calendar = response.calendars[id];
            if (!calendar || (calendar.errors?.length ?? 0) > 0) {
              errored.add(id);
              continue;
            }
            for (const busy of calendar.busy ?? []) {
              collected
                .get(id)
                ?.push({ startMs: Date.parse(busy.start), endMs: Date.parse(busy.end) });
            }
          }
        }
      }
      const result: Record<string, { startMs: number; endMs: number }[]> = {};
      for (const [id, intervals] of collected) {
        if (!errored.has(id)) result[id] = normalizeIntervals(intervals);
      }
      return result;
    },

    async createEvent(calendarId, event) {
      const id = googleEventId(event.key);
      const conference = event.conference === "google_meet" ? "?conferenceDataVersion=1" : "?";
      const query = `${conference}&sendUpdates=none`;
      try {
        return written(
          await call<GoogleEvent>(`/calendars/${encode(calendarId)}/events${query}`, {
            method: "POST",
            body: JSON.stringify({ ...toBody(event), id }),
          }),
        );
      } catch (error) {
        // 409: a lost attempt made it, or it was deleted since, and it may say something older.
        if (!(error instanceof CalendarError) || error.status !== 409) throw error;
        return written(
          await call<GoogleEvent>(`/calendars/${encode(calendarId)}/events/${encode(id)}${query}`, {
            method: "PUT",
            body: JSON.stringify({ ...toBody(event), status: "confirmed" }),
          }),
        );
      }
    },

    async updateEvent(calendarId, providerEventId, event) {
      return written(
        await call<GoogleEvent>(
          `/calendars/${encode(calendarId)}/events/${encode(providerEventId)}?sendUpdates=none`,
          { method: "PATCH", body: JSON.stringify(toBody(event)) },
        ),
      );
    },

    async deleteEvent(calendarId, providerEventId) {
      try {
        await call(
          `/calendars/${encode(calendarId)}/events/${encode(providerEventId)}?sendUpdates=none`,
          { method: "DELETE" },
        );
      } catch (error) {
        if (error instanceof CalendarError && (error.status === 404 || error.status === 410))
          return;
        throw error;
      }
    },

    async deleteEventByKey(calendarId, key) {
      await this.deleteEvent(calendarId, googleEventId(key));
    },

    async getEvent(calendarId, providerEventId): Promise<CalendarEventState | null> {
      try {
        const event = await call<GoogleEvent>(
          `/calendars/${encode(calendarId)}/events/${encode(providerEventId)}?fields=status,start,end`,
        );
        if (event.status === "cancelled") return { state: "deleted" };
        return {
          state: "present",
          startMs: Date.parse(event.start?.dateTime ?? event.start?.date ?? ""),
          endMs: Date.parse(event.end?.dateTime ?? event.end?.date ?? ""),
        };
      } catch (error) {
        if (error instanceof CalendarError && (error.status === 404 || error.status === 410)) {
          return { state: "deleted" };
        }
        throw error;
      }
    },

    async subscribe({ calendarId, webhookUrl, token, ttlSeconds }): Promise<CalendarChannel> {
      const id = randomUUID();
      const channel = await call<{ id?: string; resourceId?: string; expiration?: string }>(
        `/calendars/${encode(calendarId)}/events/watch`,
        {
          method: "POST",
          body: JSON.stringify({
            id,
            type: "web_hook",
            address: webhookUrl,
            token,
            expiration: String(Date.now() + ttlSeconds * 1000),
          }),
        },
      );
      return {
        channelId: channel.id ?? id,
        resourceId: channel.resourceId ?? null,
        expiresAtMs: channel.expiration ? Number(channel.expiration) : null,
      };
    },

    async unsubscribe({ channelId, resourceId }) {
      await call("/channels/stop", {
        method: "POST",
        body: JSON.stringify({ id: channelId, resourceId: resourceId ?? undefined }),
      });
    },
  };
}
