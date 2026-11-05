/**
 * Zoom as a write-only calendar: a connection has one calendar row that's never read for busy
 * times, and a booking's meeting is an event in the write ledger, which gives it the same retries
 * and desired state. Nothing here reads a meeting's contents or attendees.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { schema } from "@coss/db";
import { sql } from "drizzle-orm";
import {
  type CalendarClient,
  CalendarError,
  type CalendarEventWrite,
  errorFromStatus,
  type HttpFetch,
} from "./client.ts";

const API = "https://api.zoom.us/v2";
export const ZOOM_CALENDAR_ID = "zoom";
const EVENT_MAX_AGE_MS = 5 * 60_000;

/** A ledger row that's a real calendar's event, not a Zoom meeting. */
export const notZoomMeeting = () =>
  sql`not exists (select 1 from scheduling_calendar c
    where c.id = ${schema.schedulingCalendarEvent.calendarId} and c.external_id = ${ZOOM_CALENDAR_ID})`;

type ZoomMeeting = {
  id: number | string;
  topic?: string;
  start_time?: string;
  duration?: number;
  join_url?: string;
  agenda?: string;
};

const errorOf = (res: Response) =>
  errorFromStatus(res.status, `zoom_${res.status}`, res.headers.get("retry-after"));

const minutes = (event: CalendarEventWrite) => Math.round((event.endMs - event.startMs) / 60_000);
const zoomTime = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/** Zoom has no idempotency key, so a meeting carries this: a hash, as the host can read it. */
const meetingMarker = (key: string) =>
  `coss.com appointment ${createHash("sha256").update(key).digest("hex")}`;

export function zoomCalendarClient(input: {
  accessToken: string;
  fetcher: HttpFetch;
}): CalendarClient {
  const call = async (method: string, path: string, body?: unknown): Promise<Response> => {
    try {
      return await input.fetcher(`${API}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${input.accessToken}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new CalendarError("transient", "zoom_unreachable", "Couldn't reach Zoom.");
    }
  };
  const meetingBody = (event: CalendarEventWrite) => ({
    topic: event.title,
    start_time: zoomTime(event.startMs),
    duration: minutes(event),
  });
  // `upcoming` is reported to leave out the agenda; `scheduled` has it, cut to 250 characters.
  const meetingsWithKey = async (key: string): Promise<ZoomMeeting[]> => {
    const marker = meetingMarker(key);
    const found: ZoomMeeting[] = [];
    let token = "";
    do {
      const page = token ? `&next_page_token=${encodeURIComponent(token)}` : "";
      const listed = await call("GET", `/users/me/meetings?type=scheduled&page_size=300${page}`);
      if (!listed.ok) throw errorOf(listed);
      const body = (await listed.json()) as { meetings?: ZoomMeeting[]; next_page_token?: string };
      found.push(...(body.meetings ?? []).filter((meeting) => meeting.agenda?.includes(marker)));
      token = body.next_page_token ?? "";
    } while (token);
    return found;
  };
  const updateMeeting = async (providerEventId: string, event: CalendarEventWrite) => {
    const res = await call(
      "PATCH",
      `/meetings/${encodeURIComponent(providerEventId)}`,
      meetingBody(event),
    );
    if (!res.ok) throw errorOf(res);
  };
  const deleteMeeting = async (providerEventId: string) => {
    const res = await call(
      "DELETE",
      `/meetings/${encodeURIComponent(providerEventId)}?schedule_for_reminder=false`,
    );
    if (!res.ok && res.status !== 404) throw errorOf(res);
  };
  return {
    listCalendars: async () => [
      { externalId: ZOOM_CALENDAR_ID, name: "Zoom", primary: false, writable: true },
    ],
    fetchBusy: async () => ({}),
    createEvent: async (_calendarId, event) => {
      const [existing] = await meetingsWithKey(event.key);
      if (existing) {
        const id = String(existing.id);
        if (
          existing.start_time !== zoomTime(event.startMs) ||
          existing.duration !== minutes(event)
        ) {
          await updateMeeting(id, event);
        }
        return { providerEventId: id, meetingUrl: existing.join_url ?? null };
      }
      const res = await call("POST", "/users/me/meetings", {
        ...meetingBody(event),
        agenda: meetingMarker(event.key),
        type: 2,
        default_password: true,
        settings: {
          waiting_room: true,
          join_before_host: false,
          auto_recording: "none",
          registrants_email_notification: false,
        },
      });
      if (!res.ok) throw errorOf(res);
      const created = (await res.json()) as ZoomMeeting;
      return { providerEventId: String(created.id), meetingUrl: created.join_url ?? null };
    },
    updateEvent: async (_calendarId, providerEventId, event) => {
      await updateMeeting(providerEventId, event);
      return { providerEventId, meetingUrl: null };
    },
    deleteEvent: (_calendarId, providerEventId) => deleteMeeting(providerEventId),
    deleteEventByKey: async (_calendarId, key) => {
      for (const meeting of await meetingsWithKey(key)) await deleteMeeting(String(meeting.id));
    },
  };
}

/** The Zoom user's id: what a deauthorization names, and no personal data. */
export async function zoomUserId(accessToken: string, fetcher: HttpFetch): Promise<string> {
  const res = await fetcher(`${API}/users/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw errorOf(res);
  const { id } = (await res.json()) as { id?: string };
  if (!id) throw new CalendarError("transient", "no_account", "Couldn't read the Zoom account.");
  return id;
}

const zoomHmac = (secret: string, value: string) =>
  createHmac("sha256", secret).update(value).digest("hex");

export function verifyZoomEvent(input: {
  secret: string;
  timestamp: string | undefined;
  signature: string | undefined;
  body: string;
  nowMs: number;
}): boolean {
  const seconds = Number(input.timestamp);
  if (!input.signature || !Number.isFinite(seconds)) return false;
  if (Math.abs(input.nowMs - seconds * 1000) > EVENT_MAX_AGE_MS) return false;
  const expected = Buffer.from(
    `v0=${zoomHmac(input.secret, `v0:${input.timestamp}:${input.body}`)}`,
  );
  const given = Buffer.from(input.signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Zoom's check that the endpoint is ours, when it's saved and every few days after. */
export function zoomUrlValidation(plainToken: string, secret: string) {
  return { plainToken, encryptedToken: zoomHmac(secret, plainToken) };
}
