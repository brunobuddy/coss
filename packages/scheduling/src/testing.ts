/** Test helpers for packages using Scheduling. */
import { createHash, createVerify, generateKeyPairSync } from "node:crypto";
import { secretsKeyRing } from "@coss/webhooks";
import type { SchedulingDeps } from "./types.ts";

const TEST_KEY = createHash("sha256").update("scheduling test key").digest();

/** Only what `parseLogo` reads: a signature and a size. */
export function testPng(width: number, height: number): string {
  const image = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(image);
  image.writeUInt32BE(13, 8);
  image.write("IHDR", 12, "latin1");
  image.writeUInt32BE(width, 16);
  image.writeUInt32BE(height, 20);
  return image.toString("base64");
}

export const TEST_PNG = testPng(400, 100);

let serviceAccount: { key: string; publicKey: string } | undefined;

/** A service account's JSON key, as Google hands them out. One per run: RSA keys are slow to make. */
export function testServiceAccount(): { key: string; publicKey: string; clientId: string } {
  const clientId = "117063284751902345678";
  if (!serviceAccount) {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    serviceAccount = {
      publicKey,
      key: JSON.stringify({
        type: "service_account",
        project_id: "test",
        private_key_id: "key",
        private_key: privateKey,
        client_email: "coss@test.iam.gserviceaccount.com",
        client_id: clientId,
        // Never to be used: a crafted key could send the signed assertion anywhere.
        token_uri: "https://attacker.example/token",
      }),
    };
  }
  return { ...serviceAccount, clientId };
}

export function testSchedulingDeps(overrides: Partial<SchedulingDeps> = {}): SchedulingDeps {
  return {
    dataKeys: secretsKeyRing([TEST_KEY]),
    lookupKey: TEST_KEY,
    ...overrides,
  };
}

type FakeEvent = {
  id: string;
  calendarId?: string;
  startMs: number;
  endMs: number;
  deleted?: boolean;
  title: string;
  location?: string | undefined;
  description?: string;
};

/**
 * Google Calendar as a `fetch`, for `CalendarDeps.fetcher`. Written events echo back as busy, as
 * the real one does, which is how double-counting our own events would show. `failNext` makes the
 * next matching request fail; `loseNextAnswer` does the write, then fails as if the answer was lost;
 * `hold` keeps the next matching request waiting, before it takes effect or before its answer.
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
  /** The next event's conference is still being created, so its answer has no link yet. */
  conferencePendingNext = false;
  refreshFails = false;
  /** A client secret Google says no to, as when it's been deleted in the Cloud console. */
  refusedSecret: string | null = null;
  /** Every OAuth exchange and refresh, with the app it was made with. */
  readonly tokenRequests: {
    grantType: string | null;
    clientId: string | null;
    clientSecret: string | null;
    redirectUri: string | null;
    refreshToken: string | null;
  }[] = [];
  emptyFreeBusy = false;
  /** Set to accept a service account's assertions, checked against this key. */
  serviceAccountPublicKey: string | null = null;
  /** What Google answers every assertion with, as when the admin takes the client ID away. */
  delegationRefused: { error: string; error_description?: string } | null = null;
  /** Mailboxes that aren't in the Workspace. */
  readonly goneMailboxes = new Set<string>();
  /** Mailboxes whose calendars don't answer: 503, every time. */
  readonly unavailableMailboxes = new Set<string>();
  /** Every mailbox a token was asked for. */
  readonly minted: string[] = [];
  /** Where each calendar's writes went, by the calendar in the path. */
  readonly writtenTo: string[] = [];
  delayMs = 0;
  /** Set to see what clients ask a provider for: nothing should read titles. */
  fieldsAsked: string[] = [];
  #holds: {
    method: string;
    path: RegExp;
    at: "before" | "after";
    arrive: () => void;
    gate: Promise<void>;
  }[] = [];

  hold(method: string, path: RegExp, at: "before" | "after" = "before") {
    let arrive = () => {};
    let release = () => {};
    const arrived = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#holds.push({ method, path, at, arrive, gate });
    return { arrived, release };
  }

  readonly fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const pathname = new URL(url).pathname;
    const index = this.#holds.findIndex(
      (hold) => hold.method === method && hold.path.test(pathname),
    );
    const held = index >= 0 ? this.#holds.splice(index, 1)[0] : undefined;
    if (held?.at === "before") {
      held.arrive();
      await held.gate;
    }
    const response = await this.#respond(url, init);
    if (held?.at === "after") {
      held.arrive();
      await held.gate;
    }
    return response;
  };

  readonly #respond = async (url: string, init?: RequestInit): Promise<Response> => {
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
      const form = new URLSearchParams(String(init?.body ?? ""));
      if (form.get("grant_type")?.endsWith("jwt-bearer")) {
        const [header, claims, signature] = (form.get("assertion") ?? "").split(".");
        const valid =
          this.serviceAccountPublicKey !== null &&
          createVerify("RSA-SHA256")
            .update(`${header}.${claims}`)
            .verify(this.serviceAccountPublicKey, signature ?? "", "base64url");
        if (!valid) {
          return json(400, { error: "invalid_grant", error_description: "Invalid JWT Signature." });
        }
        if (this.delegationRefused) return json(401, this.delegationRefused);
        const { sub } = JSON.parse(Buffer.from(claims ?? "", "base64url").toString()) as {
          sub: string;
        };
        if (this.goneMailboxes.has(sub)) {
          return json(400, {
            error: "invalid_grant",
            error_description: "Invalid email or User ID",
          });
        }
        this.minted.push(sub);
        return json(200, { access_token: `dwd:${sub}`, expires_in: 3600 });
      }
      this.tokenRequests.push({
        grantType: form.get("grant_type"),
        clientId: form.get("client_id"),
        clientSecret: form.get("client_secret"),
        redirectUri: form.get("redirect_uri"),
        refreshToken: form.get("refresh_token"),
      });
      if (form.get("client_secret") === this.refusedSecret) {
        return json(401, { error: "invalid_client" });
      }
      if (this.refreshFails) return json(400, { error: "invalid_grant" });
      return json(200, { access_token: "access", refresh_token: "refresh", expires_in: 3600 });
    }
    const path = parsed.pathname.replace("/calendar/v3", "");
    if (path === "/users/me/calendarList") {
      const bearer = new Headers(init?.headers).get("authorization") ?? "";
      const mailbox = /^Bearer dwd:(.+)$/.exec(bearer)?.[1];
      if (mailbox && this.unavailableMailboxes.has(mailbox)) return json(503, {});
      // Under `sub`, "me" is the mailbox, and its primary calendar has its address as an id.
      return json(200, {
        items: mailbox
          ? [{ id: mailbox, summary: mailbox, primary: true, accessRole: "owner" }]
          : this.calendars,
      });
    }
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
              .filter((event) => !event.deleted && event.calendarId === id)
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
    const eventMatch = /^\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(path);
    if (eventMatch) {
      const calendarId = decodeURIComponent(eventMatch[1] as string);
      const id = eventMatch[2] ? decodeURIComponent(eventMatch[2]) : undefined;
      if (method !== "GET") this.writtenTo.push(calendarId);
      const body = init?.body
        ? (JSON.parse(String(init.body)) as {
            id?: string;
            summary?: string;
            location?: string;
            description?: string;
            start?: { dateTime: string };
            end?: { dateTime: string };
            conferenceData?: unknown;
          })
        : {};
      const toEvent = (eventId: string): FakeEvent => ({
        id: eventId,
        calendarId,
        title: body.summary ?? "",
        location: body.location,
        startMs: Date.parse(body.start?.dateTime ?? ""),
        endMs: Date.parse(body.end?.dateTime ?? ""),
        ...(body.description !== undefined ? { description: body.description } : {}),
      });
      const wire = (event: FakeEvent) => {
        const pending = this.conferencePendingNext;
        if (body.conferenceData) this.conferencePendingNext = false;
        return {
          id: event.id,
          status: event.deleted ? "cancelled" : "confirmed",
          start: { dateTime: new Date(event.startMs).toISOString() },
          end: { dateTime: new Date(event.endMs).toISOString() },
          ...(body.conferenceData && !pending
            ? { hangoutLink: "https://meet.google.com/abc-defg-hij" }
            : {}),
        };
      };
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
        // PATCH leaves what it doesn't name, as Google's does; PUT replaces the event.
        if (method === "PUT") delete existing.description;
        Object.assign(existing, toEvent(existing.id), { deleted: false });
        return json(200, wire(existing));
      }
    }
    return json(404, {});
  };
}

/**
 * Microsoft Graph with an app's token, as a `fetch`: every path names a user, which is how a client
 * still on `/me` shows up. `consentRevoked` is what taking admin consent away looks like: tokens are
 * still issued, and every call is refused.
 */
export class FakeGraphApi {
  readonly requests: string[] = [];
  readonly busy = new Map<string, { start: string; end: string }[]>();
  readonly goneMailboxes = new Set<string>();
  /** Outside the app's access policy: refused with the same answer a revoked consent gets. */
  readonly deniedMailboxes = new Set<string>();
  tenantId = "7d3f1c52-8e0b-4d6e-9a27-5c4b1e7d2f60";
  clientSecret = "secret";
  consentRevoked = false;
  tokenRequests = 0;

  #json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  #answer(
    path: string,
    method: string,
    body: string | undefined,
  ): { status: number; body: unknown } {
    const refused = { error: { code: "ErrorAccessDenied", message: "Access is denied." } };
    if (this.consentRevoked) return { status: 403, body: refused };
    const match = /^\/users\/([^/]+)(\/.*)$/.exec(path);
    if (!match) return { status: 404, body: { error: { code: "ResourceNotFound" } } };
    const mailbox = decodeURIComponent(match[1] as string);
    if (this.deniedMailboxes.has(mailbox)) return { status: 403, body: refused };
    if (this.goneMailboxes.has(mailbox)) {
      return { status: 404, body: { error: { code: "ErrorInvalidUser" } } };
    }
    const rest = match[2] as string;
    if (rest === "/calendars") {
      return {
        status: 200,
        body: {
          value: [
            { id: `cal-${mailbox}`, name: "Calendar", isDefaultCalendar: true, canEdit: true },
          ],
        },
      };
    }
    if (rest.endsWith("/calendarView")) {
      return {
        status: 200,
        body: {
          value: (this.busy.get(mailbox) ?? []).map((interval) => ({
            showAs: "busy",
            start: { dateTime: interval.start, timeZone: "UTC" },
            end: { dateTime: interval.end, timeZone: "UTC" },
          })),
        },
      };
    }
    if (rest.endsWith("/events") && method === "GET") return { status: 200, body: { value: [] } };
    if (rest.endsWith("/events") && method === "POST") {
      const event = JSON.parse(body ?? "{}") as { start: unknown; end: unknown };
      return { status: 201, body: { id: `event-${mailbox}`, ...event } };
    }
    return { status: 404, body: { error: { code: "ResourceNotFound" } } };
  }

  readonly fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const parsed = new URL(url);
    const method = init?.method ?? "GET";
    this.requests.push(`${method} ${parsed.pathname}`);
    if (parsed.hostname === "login.microsoftonline.com") {
      this.tokenRequests++;
      const form = new URLSearchParams(String(init?.body ?? ""));
      if (!parsed.pathname.startsWith(`/${this.tenantId}/`)) {
        return this.#json(400, { error: "invalid_request", error_description: "AADSTS90002" });
      }
      if (form.get("client_secret") !== this.clientSecret) {
        return this.#json(401, {
          error: "invalid_client",
          error_description: "AADSTS7000222: expired",
        });
      }
      return this.#json(200, { access_token: "app-token", expires_in: 3600 });
    }
    const path = parsed.pathname.replace("/v1.0", "");
    if (path === "/$batch") {
      const { requests } = JSON.parse(String(init?.body)) as {
        requests: { id: string; url: string; method: string }[];
      };
      return this.#json(200, {
        responses: requests.map((request) => ({
          id: request.id,
          ...this.#answer(
            new URL(request.url, "https://x.test").pathname,
            request.method,
            undefined,
          ),
        })),
      });
    }
    if (path === "/subscriptions" && method === "POST") {
      if (this.consentRevoked) return this.#json(403, { error: { code: "ErrorAccessDenied" } });
      const { expirationDateTime } = JSON.parse(String(init?.body)) as {
        expirationDateTime: string;
      };
      return this.#json(201, { id: "subscription", expirationDateTime });
    }
    if (path.startsWith("/subscriptions/")) return new Response(null, { status: 204 });
    const answer = this.#answer(path, method, init?.body ? String(init.body) : undefined);
    return this.#json(answer.status, answer.body);
  };
}

type FakeZoomMeeting = {
  id: number;
  topic: string;
  start_time: string;
  duration: number;
  join_url: string;
  agenda?: string;
};

/** Zoom's API and OAuth: one-time refresh tokens, and lists that page and cut `agenda` as Zoom's do. */
export class FakeZoomApi {
  readonly meetings = new Map<number, FakeZoomMeeting>();
  readonly bodies: Record<string, unknown>[] = [];
  readonly requests: string[] = [];
  readonly revoked: string[] = [];
  /** The Basic credentials of every token request: which app asked. */
  readonly tokenAuthorizations: string[] = [];
  userId = "zoom_user_1";
  loseNextAnswer = false;
  failNext: { path: RegExp; status: number } | null = null;
  refreshToken = "zoom-refresh-0";
  listPageSize = 300;
  #nextId = 1000;
  #refreshes = 0;

  readonly fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const parsed = new URL(url);
    this.requests.push(`${method} ${parsed.pathname}`);
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    if (this.failNext?.path.test(parsed.pathname)) {
      const { status } = this.failNext;
      this.failNext = null;
      return json(status, { message: "Refused." });
    }
    if (parsed.hostname === "zoom.us") {
      if (parsed.pathname === "/oauth/revoke") {
        this.revoked.push(parsed.searchParams.get("token") ?? "");
        return json(200, { status: "success" });
      }
      const form = new URLSearchParams(String(init?.body));
      this.tokenAuthorizations.push(new Headers(init?.headers).get("authorization") ?? "");
      if (form.get("grant_type") === "refresh_token") {
        if (form.get("refresh_token") !== this.refreshToken) {
          return json(400, { error: "invalid_grant" });
        }
      }
      this.#refreshes++;
      this.refreshToken = `zoom-refresh-${this.#refreshes}`;
      return json(200, {
        access_token: `zoom-access-${this.#refreshes}`,
        refresh_token: this.refreshToken,
        expires_in: 3600,
      });
    }
    if (parsed.pathname === "/v2/users/me") return json(200, { id: this.userId });
    if (parsed.pathname === "/v2/users/me/meetings" && method === "GET") {
      const all = [...this.meetings.values()];
      const offset = Number(parsed.searchParams.get("next_page_token") ?? 0);
      const end = offset + this.listPageSize;
      const upcoming = parsed.searchParams.get("type") === "upcoming";
      return json(200, {
        meetings: all.slice(offset, end).map(({ agenda, ...meeting }) => ({
          ...meeting,
          ...(agenda && !upcoming ? { agenda: agenda.slice(0, 250) } : {}),
        })),
        next_page_token: end < all.length ? String(end) : "",
      });
    }
    if (parsed.pathname === "/v2/users/me/meetings" && method === "POST") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      this.bodies.push(body);
      const id = this.#nextId++;
      const meeting = {
        id,
        topic: String(body.topic),
        start_time: String(body.start_time),
        duration: Number(body.duration),
        join_url: `https://zoom.us/j/${id}?pwd=secret`,
        ...(typeof body.agenda === "string" ? { agenda: body.agenda } : {}),
      };
      this.meetings.set(id, meeting);
      if (this.loseNextAnswer) {
        this.loseNextAnswer = false;
        return json(503, {});
      }
      return json(201, meeting);
    }
    const id = Number(parsed.pathname.split("/").pop());
    const meeting = this.meetings.get(id);
    if (!meeting) return json(404, { code: 3001 });
    if (method === "PATCH") {
      Object.assign(meeting, JSON.parse(String(init?.body)));
      return new Response(null, { status: 204 });
    }
    if (method === "DELETE") {
      this.meetings.delete(id);
      return new Response(null, { status: 204 });
    }
    return json(200, meeting);
  };
}
