/** Test helpers for packages using Scheduling. */
import { createHash } from "node:crypto";
import { secretsKeyRing } from "@coss/webhooks";
import type { SchedulingDeps } from "./types.ts";

const TEST_KEY = createHash("sha256").update("scheduling test key").digest();

export function testSchedulingDeps(overrides: Partial<SchedulingDeps> = {}): SchedulingDeps {
  return {
    dataKeys: secretsKeyRing([TEST_KEY]),
    lookupKey: TEST_KEY,
    ...overrides,
  };
}

type FakeEvent = { id: string; startMs: number; endMs: number; deleted?: boolean; title: string };

/**
 * Google Calendar as a `fetch`, for `CalendarDeps.fetcher`. Written events echo back as busy, as
 * the real one does, which is how double-counting our own events would show. `failNext` makes the
 * next matching request fail; `loseNextAnswer` does the write, then fails as if the answer was lost.
 */
export class FakeGoogleCalendarApi {
  readonly busy = new Map<string, { start: string; end: string }[]>();
  readonly events = new Map<string, FakeEvent>();
  readonly calendars: { id: string; summary: string; primary?: boolean; accessRole: string }[] = [
    { id: "doctor@example.com", summary: "Dr. Reyes", primary: true, accessRole: "owner" },
    { id: "team@example.com", summary: "Team", accessRole: "reader" },
  ];
  readonly requests: string[] = [];
  readonly erroredCalendars = new Set<string>();
  failNext: { path: RegExp; status: number; body?: unknown } | null = null;
  loseNextAnswer = false;
  refreshFails = false;
  emptyFreeBusy = false;
  delayMs = 0;
  /** Set to see what clients ask a provider for: nothing should read titles. */
  fieldsAsked: string[] = [];

  readonly fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const parsed = new URL(url);
    this.requests.push(`${method} ${parsed.pathname}`);
    if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    if (this.failNext?.path.test(parsed.pathname)) {
      const fail = this.failNext;
      this.failNext = null;
      return json(fail.status, fail.body ?? {});
    }
    if (parsed.hostname === "oauth2.googleapis.com") {
      if (parsed.pathname === "/revoke") return json(200, {});
      if (this.refreshFails) return json(400, { error: "invalid_grant" });
      return json(200, { access_token: "access", refresh_token: "refresh", expires_in: 3600 });
    }
    const path = parsed.pathname.replace("/calendar/v3", "");
    if (path === "/users/me/calendarList") return json(200, { items: this.calendars });
    if (path === "/freeBusy") {
      if (this.emptyFreeBusy) return json(200, {});
      const body = JSON.parse(String(init?.body)) as { items: { id: string }[] };
      const calendars: Record<string, unknown> = {};
      for (const { id } of body.items) {
        if (this.erroredCalendars.has(id)) {
          calendars[id] = { errors: [{ reason: "notFound" }], busy: [] };
          continue;
        }
        calendars[id] = {
          busy: [
            ...(this.busy.get(id) ?? []),
            ...[...this.events.values()]
              .filter((event) => !event.deleted)
              .map((event) => ({
                start: new Date(event.startMs).toISOString(),
                end: new Date(event.endMs).toISOString(),
              })),
          ],
        };
      }
      return json(200, { calendars });
    }
    const watch = /^\/calendars\/[^/]+\/events\/watch$/.test(path);
    if (watch) {
      const body = JSON.parse(String(init?.body)) as { id: string; expiration: string };
      return json(200, { id: body.id, resourceId: "resource", expiration: body.expiration });
    }
    if (path === "/channels/stop") return new Response(null, { status: 204 });
    const eventMatch = /^\/calendars\/[^/]+\/events(?:\/([^/]+))?$/.exec(path);
    if (eventMatch) {
      const id = eventMatch[1] ? decodeURIComponent(eventMatch[1]) : undefined;
      const body = init?.body
        ? (JSON.parse(String(init.body)) as {
            id?: string;
            summary?: string;
            start?: { dateTime: string };
            end?: { dateTime: string };
            conferenceData?: unknown;
          })
        : {};
      const toEvent = (eventId: string): FakeEvent => ({
        id: eventId,
        title: body.summary ?? "",
        startMs: Date.parse(body.start?.dateTime ?? ""),
        endMs: Date.parse(body.end?.dateTime ?? ""),
      });
      const wire = (event: FakeEvent) => ({
        id: event.id,
        status: event.deleted ? "cancelled" : "confirmed",
        start: { dateTime: new Date(event.startMs).toISOString() },
        end: { dateTime: new Date(event.endMs).toISOString() },
        ...(body.conferenceData ? { hangoutLink: "https://meet.google.com/abc-defg-hij" } : {}),
      });
      if (method === "POST") {
        const eventId = body.id as string;
        const existing = this.events.get(eventId);
        if (existing) return json(409, { error: { errors: [{ reason: "duplicate" }] } });
        const event = toEvent(eventId);
        this.events.set(eventId, event);
        if (this.loseNextAnswer) {
          this.loseNextAnswer = false;
          return json(503, {});
        }
        return json(200, wire(event));
      }
      const existing = id ? this.events.get(id) : undefined;
      if (!existing) return json(404, { error: { errors: [{ reason: "notFound" }] } });
      if (method === "GET") return json(200, wire(existing));
      if (method === "DELETE") {
        existing.deleted = true;
        return new Response(null, { status: 204 });
      }
      if (method === "PATCH" || method === "PUT") {
        Object.assign(existing, toEvent(existing.id), { deleted: false });
        return json(200, wire(existing));
      }
    }
    return json(404, {});
  };
}
