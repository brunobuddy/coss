import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { pool } from "@coss/db";
import type { LogWriter } from "@coss/logs";
import { memoryLogWriter } from "@coss/logs/testing";
import { memoryLimiter } from "@coss/ratelimit/testing";
import {
  createBookerSession,
  createDashboardSession,
  createEventType,
  createHostSession,
  createManageSession,
  getBookingOverview,
  listBookableEventTypes,
  listEventTypes,
  runDueReassignments,
} from "@coss/scheduling";
import { testPng, testSchedulingDeps } from "@coss/scheduling/testing";
import { createTestTenant, type TestTenant } from "@coss/tenancy/testing";
import { Hono } from "hono";
import { createSchedulingCallbackRoutes } from "../src/routes/scheduling-callbacks.ts";
import type { AppEnv } from "../src/types.ts";
import { createTestApp, errorOf, type TestApp, waitForLogLines } from "./helpers.ts";

const MONDAY = "2031-01-06";
const at = (time: string) => `${MONDAY}T${time}:00.000Z`;
// Cutoffs reach a year at most, so testing one needs a booking closer than 2031.
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const soon = (time: string) => `${tomorrow}T${time}:00.000Z`;

function call(
  app: TestApp,
  key: string,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return Promise.resolve(
    app.request(`/v1/scheduling${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
}

async function setUp(opts: { logWriter?: LogWriter } = {}): Promise<{
  tenant: TestTenant;
  app: TestApp;
  key: string;
  eventType: string;
  host: string;
}> {
  const tenant = await createTestTenant();
  const { app } = createTestApp(opts);
  const key = tenant.sandboxKey;
  const hostRes = await call(app, key, "POST", "/hosts", {
    uid: "doctor_1",
    name: "Dr. Reyes",
    time_zone: "UTC",
  });
  expect(hostRes.status).toBe(201);
  const host = (await hostRes.json()) as { id: string };
  const scheduleRes = await call(app, key, "POST", "/hosts/doctor_1/schedules", {
    rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
  });
  expect(scheduleRes.status).toBe(201);
  const eventRes = await call(app, key, "POST", "/event_types", {
    title: "Consultation",
    duration_minutes: 30,
    hosts: [{ host: "doctor_1" }],
    questions: [{ key: "reason", type: "text", label: "Reason", required: false }],
  });
  expect(eventRes.status).toBe(201);
  const eventType = (await eventRes.json()) as { id: string };
  return { tenant, app, key, eventType: eventType.id, host: host.id };
}

const booking = (eventType: string, start: string, extra: object = {}) => ({
  event_type: eventType,
  start,
  attendee: { uid: "patient_1", name: "Sam Lee", email: "sam@example.com", time_zone: "UTC" },
  ...extra,
});

describe("scheduling API", () => {
  test("a host, slots, a booking, and the slot gone", async () => {
    const { app, key, eventType, host } = await setUp();
    const slots = () =>
      call(
        app,
        key,
        "GET",
        `/event_types/${eventType}/slots?start=${at("09:00")}&end=${at("10:00")}`,
      );
    const before = (await (await slots()).json()) as { data: { start: string; hosts: string[] }[] };
    expect(before.data.map((slot) => slot.start)).toEqual([at("09:00"), at("09:30")]);
    expect(before.data[0]?.hosts).toEqual([host]);
    const created = await call(app, key, "POST", "/bookings", booking(eventType, at("09:00")));
    expect(created.status).toBe(201);
    const body = (await created.json()) as { id: string; status: string; hosts: string[] };
    expect(body.status).toBe("confirmed");
    expect(body.hosts).toEqual([host]);
    const after = (await (await slots()).json()) as { data: { start: string }[] };
    expect(after.data.map((slot) => slot.start)).toEqual([at("09:30")]);
  });

  test("a lost slot is a 422, never the 409 the SDK would retry", async () => {
    const { app, key, eventType } = await setUp();
    await call(app, key, "POST", "/bookings", booking(eventType, at("09:00")));
    const res = await call(app, key, "POST", "/bookings", booking(eventType, at("09:00")));
    expect(res.status).toBe(422);
    expect((await errorOf(res)).code).toBe("slot_unavailable");
  });

  test("Idempotency-Key replays with the header, and refuses another body", async () => {
    const { app, key, eventType } = await setUp();
    const headers = { "Idempotency-Key": "abc-1" };
    const first = await call(
      app,
      key,
      "POST",
      "/bookings",
      booking(eventType, at("09:00")),
      headers,
    );
    const second = await call(
      app,
      key,
      "POST",
      "/bookings",
      booking(eventType, at("09:00")),
      headers,
    );
    expect(second.status).toBe(201);
    expect(second.headers.get("Idempotent-Replayed")).toBe("true");
    expect(((await second.json()) as { id: string }).id).toBe(
      ((await first.json()) as { id: string }).id,
    );
    const other = await call(
      app,
      key,
      "POST",
      "/bookings",
      booking(eventType, at("09:30")),
      headers,
    );
    expect(other.status).toBe(422);
    expect((await errorOf(other)).code).toBe("idempotency_key_reused");
  });

  test("hold, confirm, reschedule, cancel", async () => {
    const { app, key, eventType } = await setUp();
    const hold = (await (
      await call(app, key, "POST", "/holds", booking(eventType, at("09:00")))
    ).json()) as { id: string; status: string };
    expect(hold.status).toBe("held");
    const confirmed = await call(app, key, "POST", `/holds/${hold.id}/confirm`, {});
    expect(((await confirmed.json()) as { status: string }).status).toBe("confirmed");
    const moved = await call(app, key, "POST", `/bookings/${hold.id}/reschedule`, {
      start: at("10:00"),
    });
    expect(((await moved.json()) as { start: string }).start).toBe(at("10:00"));
    const cancelled = await call(app, key, "POST", `/bookings/${hold.id}/cancel`);
    expect(((await cancelled.json()) as { status: string }).status).toBe("cancelled");
  });

  test("answers come back only when retrieving one booking", async () => {
    const { app, key, eventType } = await setUp();
    const created = (await (
      await call(
        app,
        key,
        "POST",
        "/bookings",
        booking(eventType, at("09:00"), { answers: { reason: "headache" } }),
      )
    ).json()) as { id: string; attendees: object[] };
    expect(created.attendees[0]).not.toHaveProperty("answers");
    const list = (await (await call(app, key, "GET", "/bookings")).json()) as {
      data: { attendees: object[] }[];
    };
    expect(list.data[0]?.attendees[0]).not.toHaveProperty("answers");
    const one = (await (await call(app, key, "GET", `/bookings/${created.id}`)).json()) as {
      attendees: { answers: object }[];
    };
    expect(one.attendees[0]?.answers).toEqual({ reason: "headache" });
  });

  test("log lines carry ids and times, never a person's details or answers", async () => {
    const { app, key, eventType } = await setUp();
    await call(
      app,
      key,
      "POST",
      "/bookings",
      booking(eventType, at("09:00"), { answers: { reason: "headache" } }),
    );
    const res = await app.request("/v1/logs?source=scheduling", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const logged = JSON.stringify(await res.json());
    expect(logged).toContain("scheduling.booking.confirmed");
    for (const secret of ["sam@example.com", "Sam Lee", "headache"]) {
      expect(logged).not.toContain(secret);
    }
  });

  test("a guest is erased by address, and the address isn't kept in the audit log", async () => {
    const { app, key, eventType, tenant } = await setUp();
    await call(app, key, "PATCH", `/event_types/${eventType}`, { max_guests: 1 });
    const created = (await (
      await call(app, key, "POST", "/bookings", {
        ...booking(eventType, at("09:00")),
        guests: [{ email: "jo@example.com" }],
      })
    ).json()) as { id: string };
    const erased = await call(app, key, "POST", "/attendees/erase", { email: "jo@example.com" });
    expect(erased.status).toBe(200);
    expect(await erased.json()).toEqual({ object: "scheduling.attendee_erasure", erased: 1 });
    const one = (await (await call(app, key, "GET", `/bookings/${created.id}`)).json()) as {
      attendees: { email: string | null }[];
    };
    expect(one.attendees.map((person) => person.email)).toEqual(["sam@example.com", null]);
    const audited = await pool.query(
      "select action, target_id, metadata from org_audit_event where organization_id = $1 and action = 'scheduling_attendee.erased'",
      [tenant.organization.id],
    );
    expect(audited.rows.length).toBe(1);
    expect(JSON.stringify(audited.rows)).not.toContain("jo@example.com");
  });

  test("erasing an attendee removes their details, and keeps the booking", async () => {
    const { app, key, eventType } = await setUp();
    const created = (await (
      await call(app, key, "POST", "/bookings", booking(eventType, at("09:00")))
    ).json()) as { id: string };
    const erased = await call(app, key, "DELETE", "/attendees/patient_1");
    expect(((await erased.json()) as { erased: number }).erased).toBe(1);
    const one = (await (await call(app, key, "GET", `/bookings/${created.id}`)).json()) as {
      status: string;
      attendees: { email: string | null; uid: string | null }[];
    };
    expect(one.status).toBe("confirmed");
    expect(one.attendees[0]?.email).toBeNull();
    expect(one.attendees[0]?.uid).toBeNull();
  });

  test("a restricted key without scheduling is refused, and another tenant sees nothing", async () => {
    const { app, eventType } = await setUp();
    const other = await createTestTenant();
    const res = await call(app, other.sandboxKey, "GET", `/event_types/${eventType}`);
    expect(res.status).toBe(404);
    const unauthenticated = await app.request(`/v1/scheduling/event_types/${eventType}`);
    expect(unauthenticated.status).toBe(401);
  });

  test("settings: origins must be https, and a bad zone is refused", async () => {
    const { app, key } = await setUp();
    const good = await call(app, key, "PATCH", "/settings", {
      allowed_origins: ["https://app.example.com"],
      calendar_failure_mode: "last_known",
    });
    expect(good.status).toBe(200);
    const settings = (await (await call(app, key, "GET", "/settings")).json()) as {
      allowed_origins: string[];
      calendar_failure_mode: string;
    };
    expect(settings.allowed_origins).toEqual(["https://app.example.com"]);
    expect(settings.calendar_failure_mode).toBe("last_known");
    const bad = await call(app, key, "PATCH", "/settings", {
      allowed_origins: ["http://evil.test"],
    });
    expect(bad.status).toBe(422);
    const zone = await call(app, key, "POST", "/hosts", { name: "x", time_zone: "Mars/Olympus" });
    expect((await errorOf(zone)).code).toBe("invalid_time_zone");
  });
});

test("without its key, Scheduling answers 503 and everything else works", async () => {
  const tenant = await createTestTenant();
  const { app } = createTestApp({ scheduling: null });
  const res = await call(app, tenant.sandboxKey, "GET", "/hosts");
  expect(res.status).toBe(503);
  expect((await errorOf(res)).code).toBe("scheduling_unavailable");
  expect((await app.request("/health")).status).toBe(200);
  expect((await app.request("/scheduling/client/session")).status).toBe(404);
  const environment = await app.request("/v1/environment", {
    headers: { Authorization: `Bearer ${tenant.sandboxKey}` },
  });
  expect(environment.status).toBe(200);
});

describe("reads for the dashboard", () => {
  test("every active event type can be chosen, archived ones can't, and a host's are theirs", async () => {
    const s = await setUp();
    const scope = {
      organizationId: s.tenant.organization.id,
      environmentId: s.tenant.development.id,
    };
    // Directly, since this many through the API would hit its rate limit.
    const env = { ...scope, projectId: s.tenant.project.id, mode: "sandbox" as const };
    const made: string[] = [];
    for (let index = 0; index < 105; index += 1) {
      const eventType = await createEventType(env, {
        title: `Type ${index}`,
        kind: "one_on_one",
        duration_minutes: 30,
        hosts: [],
      });
      made.push(eventType.id);
    }
    await call(s.app, s.key, "PATCH", `/event_types/${made[0]}`, { status: "archived" });
    const bookable = (await listBookableEventTypes(scope)).map((row) => row.id);
    expect(bookable).toHaveLength(105);
    expect(bookable).toContain(s.eventType);
    expect(bookable).not.toContain(made[0] as string);

    const assigned = await listEventTypes(scope, { limit: 100, hostId: s.host });
    expect(assigned.data.map((row) => row.id)).toEqual([s.eventType]);
    await call(s.app, s.key, "PATCH", `/event_types/${s.eventType}`, { hosts: [] });
    expect((await listEventTypes(scope, { limit: 100, hostId: s.host })).data).toEqual([]);
  });
});

describe("client API", () => {
  const client = (
    app: TestApp,
    token: string,
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    Promise.resolve(
      app.request(`/scheduling/client${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
    );

  async function bookerSession(s: Awaited<ReturnType<typeof setUp>>, extra: object = {}) {
    const res = await call(s.app, s.key, "POST", "/booker_sessions", {
      event_type: s.eventType,
      ...extra,
    });
    expect(res.status).toBe(201);
    return (await res.json()) as { id: string; token: string };
  }

  test("the logo a customer sets reaches every page through the session, and a bad one is refused", async () => {
    const s = await setUp();
    const refused = await call(s.app, s.key, "PATCH", "/settings", {
      logo: { content: Buffer.from("<svg></svg>").toString("base64") },
    });
    expect(refused.status).toBe(422);
    expect((await errorOf(refused)).code).toBe("invalid_logo");
    const notBase64 = await call(s.app, s.key, "PATCH", "/settings", {
      logo: { content: "<svg></svg>" },
    });
    expect(notBase64.status).toBe(422);

    const png = testPng(400, 100);
    const saved = await call(s.app, s.key, "PATCH", "/settings", { logo: { content: png } });
    expect(saved.status).toBe(200);
    const { token } = await bookerSession(s);
    const session = (await (await client(s.app, token, "GET", "/session")).json()) as {
      logo: { data_url: string; width: number; height: number } | null;
    };
    expect(session.logo).toEqual({
      data_url: `data:image/png;base64,${png}`,
      width: 400,
      height: 100,
    });
  });

  test("a booker sees times and books, but not who else is in the pool", async () => {
    const s = await setUp();
    const { token } = await bookerSession(s);
    const session = (await (await client(s.app, token, "GET", "/session")).json()) as {
      kind: string;
      event_type: { title: string };
    };
    expect(session.kind).toBe("booker");
    expect(session.event_type.title).toBe("Consultation");
    const slots = await client(
      s.app,
      token,
      "GET",
      `/slots?start=${at("09:00")}&end=${at("10:00")}`,
    );
    const body = (await slots.json()) as { data: { start: string }[] };
    expect(JSON.stringify(body)).not.toContain("host_");
    const booked = await client(s.app, token, "POST", "/bookings", {
      start: body.data[0]?.start,
      attendee: { name: "Sam", email: "sam@example.com", time_zone: "UTC" },
    });
    expect(booked.status).toBe(201);
    const booking = await booked.json();
    expect(JSON.stringify(booking)).not.toContain("host_");
    expect(JSON.stringify(booking)).not.toContain("sam@example.com");
  });

  test("a booker can add guests the event type allows, and sees only the attendee back", async () => {
    const s = await setUp();
    await call(s.app, s.key, "PATCH", `/event_types/${s.eventType}`, { max_guests: 1 });
    const { token } = await bookerSession(s);
    const session = (await (await client(s.app, token, "GET", "/session")).json()) as {
      event_type: { max_guests: number };
    };
    expect(session.event_type.max_guests).toBe(1);
    const attendee = { name: "Sam", email: "sam@example.com", time_zone: "UTC" };
    const tooMany = await client(s.app, token, "POST", "/bookings", {
      start: new Date(at("09:00")).toISOString(),
      attendee,
      guests: [{ email: "a@example.com" }, { email: "b@example.com" }],
    });
    expect(tooMany.status).toBe(422);
    expect((await errorOf(tooMany)).code).toBe("invalid_attendee");
    const booked = await client(s.app, token, "POST", "/bookings", {
      start: new Date(at("09:00")).toISOString(),
      attendee,
      guests: [{ email: "jo@example.com", name: "Jo Park" }],
    });
    expect(booked.status).toBe(201);
    const booking = (await booked.json()) as { id: string; attendees: { name: string }[] };
    expect(booking.attendees).toEqual([{ name: "Sam", time_zone: "UTC" }] as never);
    const full = (await (await call(s.app, s.key, "GET", `/bookings/${booking.id}`)).json()) as {
      attendees: { role: string; email: string }[];
    };
    expect(full.attendees.map((person) => [person.role, person.email])).toEqual([
      ["attendee", "sam@example.com"],
      ["guest", "jo@example.com"],
    ]);
  });

  test("a session routes to a specialist: the browser can't see or widen it", async () => {
    const s = await setUp();
    for (const [uid, specialty] of [
      ["derm", "dermatology"],
      ["cardio", "cardiology"],
    ] as const) {
      await call(s.app, s.key, "POST", "/hosts", {
        uid,
        name: uid,
        time_zone: "UTC",
        attributes: { specialty },
      });
      await call(s.app, s.key, "POST", `/hosts/${uid}/schedules`, {
        rules: [
          uid === "derm"
            ? { days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "10:00" }
            : { days: [0, 1, 2, 3, 4, 5, 6], start: "14:00", end: "15:00" },
        ],
      });
    }
    const pool = (await (
      await call(s.app, s.key, "POST", "/event_types", {
        title: "See a specialist",
        kind: "pool",
        duration_minutes: 30,
        hosts: [{ host: "derm" }, { host: "cardio" }],
      })
    ).json()) as { id: string };
    const { token } = await bookerSession(
      { ...s, eventType: pool.id },
      { attributes: { specialty: "cardiology" } },
    );

    const session = await (await client(s.app, token, "GET", "/session")).text();
    expect(session).not.toContain("cardiology");

    const range = "?start=2031-01-06T00:00:00Z&end=2031-01-07T00:00:00Z";
    const { data } = (await (await client(s.app, token, "GET", `/slots${range}`)).json()) as {
      data: { start: string }[];
    };
    expect(data.map((slot) => slot.start)).toEqual([
      "2031-01-06T14:00:00.000Z",
      "2031-01-06T14:30:00.000Z",
    ]);

    const widened = await client(s.app, token, "POST", "/bookings", {
      start: "2031-01-06T09:00:00Z",
      attributes: { specialty: "dermatology" },
      attendee: { uid: "p", name: "Sam", email: "sam@example.com", time_zone: "UTC" },
    });
    expect(widened.status).toBe(422);
    const dermTime = await client(s.app, token, "POST", "/bookings", {
      start: "2031-01-06T09:00:00Z",
      attendee: { uid: "p", name: "Sam", email: "sam@example.com", time_zone: "UTC" },
    });
    expect((await errorOf(dermTime)).code).toBe("slot_unavailable");
    const booked = await client(s.app, token, "POST", "/bookings", {
      start: "2031-01-06T14:00:00Z",
      attendee: { uid: "p", name: "Sam", email: "sam@example.com", time_zone: "UTC" },
    });
    expect(booked.status).toBe(201);
    const { id: bookingId } = (await booked.json()) as { id: string };
    const full = (await (await call(s.app, s.key, "GET", `/bookings/${bookingId}`)).json()) as {
      hosts: string[];
    };
    const cardio = (await (await call(s.app, s.key, "GET", "/hosts/cardio")).json()) as {
      id: string;
    };
    expect(full.hosts).toEqual([cardio.id]);
  });

  test("a booking says whether the attendee will be emailed, so the page never promises it wrongly", async () => {
    const s = await setUp();
    const book = async (start: string, extra: object = {}) => {
      const { token } = await bookerSession(s, extra);
      const res = await client(s.app, token, "POST", "/bookings", {
        start,
        ...("attendee" in extra
          ? {}
          : { attendee: { uid: "p", name: "Sam", email: "sam@example.com", time_zone: "UTC" } }),
      });
      expect(res.status).toBe(201);
      return ((await res.json()) as { attendee_emailed: boolean }).attendee_emailed;
    };
    expect(await book(at("09:00"))).toBe(true);
    expect(
      await book(at("10:00"), { attendee: { uid: "no_address", name: "Sam", time_zone: "UTC" } }),
    ).toBe(false);
    await call(s.app, s.key, "PATCH", "/settings", {
      notifications: { confirmed: { email_attendee: false } },
    });
    expect(await book(at("11:00"))).toBe(false);
  });

  test("a browser chooses among the locations offered, but can't supply its own", async () => {
    const s = await setUp();
    const meeting = (await (
      await call(s.app, s.key, "POST", "/event_types", {
        title: "Video visit",
        duration_minutes: 30,
        hosts: [{ host: s.host }],
        locations: [
          { type: "link", url: "https://trusted.example/room" },
          { type: "phone", number: null },
        ],
      })
    ).json()) as { id: string };
    const { token } = await bookerSession({ ...s, eventType: meeting.id });
    const book = async (start: string, location: object) => {
      const res = await client(s.app, token, "POST", "/bookings", {
        start,
        location,
        attendee: { uid: "p", name: "Sam", email: "sam@example.com", time_zone: "UTC" },
      });
      expect(res.status).toBe(201);
      return ((await res.json()) as { location: unknown }).location;
    };
    expect(await book(at("09:00"), { type: "link", url: "https://attacker.example" })).toEqual({
      type: "link",
      url: "https://trusted.example/room",
    });
    expect(await book(at("10:00"), { type: "phone", number: "+15551234567" })).toEqual({
      type: "phone",
      number: "+15551234567",
    });
  });

  test("a host sets their own locations, and a booker only sees them once booked", async () => {
    const s = await setUp();
    const hostSession = async (body: object) => {
      const res = await call(s.app, s.key, "POST", `/hosts/${s.host}/sessions`, body);
      expect(res.status).toBe(201);
      return ((await res.json()) as { token: string }).token;
    };
    const token = await hostSession({});
    const office = { type: "in_person", address: "12 Main St" };

    const empty = await client(s.app, token, "GET", "/host/locations");
    expect(((await empty.json()) as { data: unknown[] }).data).toEqual([]);
    const saved = await client(s.app, token, "PUT", "/host/locations", { locations: [office] });
    expect(saved.status).toBe(200);
    expect(((await saved.json()) as { data: unknown[] }).data).toEqual([office]);

    const http = await client(s.app, token, "PUT", "/host/locations", {
      locations: [{ type: "link", url: "http://host.example/room" }],
    });
    expect(http.status).toBe(422);
    const linkInAddress = await client(s.app, token, "PUT", "/host/locations", {
      locations: [{ type: "in_person", address: "https://evil.example/login" }],
    });
    expect((await errorOf(linkInAddress)).code).toBe("content_refused");

    const readOnly = await hostSession({ read_only: true });
    const refused = await client(s.app, readOnly, "PUT", "/host/locations", { locations: [] });
    expect(refused.status).toBe(403);
    const read = await client(s.app, readOnly, "GET", "/host/locations");
    expect(read.status).toBe(200);

    const host = (await (await call(s.app, s.key, "GET", "/hosts/doctor_1")).json()) as {
      locations: unknown[];
    };
    expect(host.locations).toEqual([office]);

    const visit = (await (
      await call(s.app, s.key, "POST", "/event_types", {
        title: "Visit",
        duration_minutes: 30,
        hosts: [{ host: s.host }],
        locations: [{ type: "in_person", address: null }],
      })
    ).json()) as { id: string };
    const { token: booker } = await bookerSession({ ...s, eventType: visit.id });
    const session = await (await client(s.app, booker, "GET", "/session")).text();
    expect(session).not.toContain(office.address);
    const booked = await client(s.app, booker, "POST", "/bookings", {
      start: at("09:00"),
      attendee: { uid: "p", name: "Sam", email: "sam@example.com", time_zone: "UTC" },
    });
    expect(booked.status).toBe(201);
    const body = (await booked.json()) as { location: unknown };
    expect(body.location).toEqual(office);
  });

  test("an event type's or booking's link must be https, and an address can't hold a link", async () => {
    const s = await setUp();
    const create = (locations: object[]) =>
      call(s.app, s.key, "POST", "/event_types", {
        title: "Video visit",
        duration_minutes: 30,
        hosts: [{ host: s.host }],
        locations,
      });
    expect((await create([{ type: "link", url: "javascript:alert(1)" }])).status).toBe(422);
    expect((await create([{ type: "link", url: "http://video.example/room" }])).status).toBe(422);
    const inAddress = await create([{ type: "in_person", address: "https://evil.example/login" }]);
    expect(await errorOf(inAddress)).toMatchObject({ code: "content_refused", param: "locations" });

    const created = await call(
      s.app,
      s.key,
      "POST",
      "/bookings",
      booking(s.eventType, at("09:00")),
    );
    const { id } = (await created.json()) as { id: string };
    const update = (url: string) =>
      call(s.app, s.key, "PATCH", `/bookings/${id}/location`, { location: { type: "link", url } });
    const refused = await update("javascript:alert(1)");
    expect(refused.status).toBe(422);
    expect((await update("https://video.example/room")).status).toBe(200);
  });

  test("a booker can't read or change a host's locations", async () => {
    const s = await setUp();
    const { token } = await bookerSession(s);
    expect((await client(s.app, token, "GET", "/host/locations")).status).toBe(404);
    const put = await client(s.app, token, "PUT", "/host/locations", { locations: [] });
    expect(put.status).toBe(404);
  });

  test("a host's portal lists coming bookings soonest first, leaving out cancelled ones", async () => {
    const s = await setUp();
    const ids: string[] = [];
    for (const [index, time] of ["11:00", "09:00", "10:00"].entries()) {
      const res = await call(
        s.app,
        s.key,
        "POST",
        "/bookings",
        booking(s.eventType, at(time), {
          attendee: { uid: `p${index}`, name: "Sam", time_zone: "UTC" },
        }),
      );
      ids.push(((await res.json()) as { id: string }).id);
    }
    await call(s.app, s.key, "POST", `/bookings/${ids[0]}/cancel`);
    const { token } = (await (
      await call(s.app, s.key, "POST", `/hosts/${s.host}/sessions`, {})
    ).json()) as { token: string };
    const page = (await (await client(s.app, token, "GET", "/host/bookings")).json()) as {
      data: { id: string }[];
      next_cursor: string | null;
    };
    expect(page.data.map((item) => item.id)).toEqual([ids[1] as string, ids[2] as string]);
    expect(page.next_cursor).toBeNull();
  });

  test("a manage page offers the booked hosts' times, with a required host in the pool", async () => {
    const s = await setUp();
    for (const [uid, start, end] of [
      ["member", "09:00", "12:00"],
      ["other", "14:00", "15:00"],
    ] as const) {
      await call(s.app, s.key, "POST", "/hosts", { uid, name: uid, time_zone: "UTC" });
      await call(s.app, s.key, "POST", `/hosts/${uid}/schedules`, {
        rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start, end }],
      });
    }
    const pool = (await (
      await call(s.app, s.key, "POST", "/event_types", {
        title: "Supervised",
        kind: "pool",
        duration_minutes: 30,
        hosts: [{ host: s.host, role: "required" }, { host: "member" }, { host: "other" }],
      })
    ).json()) as { id: string };
    const created = (await (
      await call(
        s.app,
        s.key,
        "POST",
        "/bookings",
        booking(pool.id, at("09:00"), { host: "member" }),
      )
    ).json()) as { id: string };
    const manage = (await (
      await call(s.app, s.key, "POST", `/bookings/${created.id}/manage_sessions`)
    ).json()) as { token: string };
    const times = async (from: string, to: string) =>
      (
        (await (
          await client(s.app, manage.token, "GET", `/booking/slots?start=${at(from)}&end=${at(to)}`)
        ).json()) as { data: unknown[] }
      ).data.length;
    expect(await times("10:00", "11:00")).toBeGreaterThan(0);
    expect(await times("13:00", "16:00")).toBe(0);
  });

  test("a fixed attendee can't be replaced from the browser", async () => {
    const s = await setUp();
    const { token } = await bookerSession(s, {
      attendee: { uid: "patient_9", name: "Real", time_zone: "UTC" },
    });
    const res = await client(s.app, token, "POST", "/bookings", {
      start: at("09:00"),
      attendee: { uid: "someone_else", name: "Fake", time_zone: "UTC" },
    });
    const { id } = (await res.json()) as { id: string };
    const stored = (await (await call(s.app, s.key, "GET", `/bookings/${id}`)).json()) as {
      attendees: { uid: string; name: string }[];
    };
    expect(stored.attendees[0]?.uid).toBe("patient_9");
    expect(stored.attendees[0]?.name).toBe("Real");
  });

  describe("a host's own bookings", () => {
    const hostToken = async (s: Awaited<ReturnType<typeof setUp>>, extra: object = {}) =>
      (
        (await (await call(s.app, s.key, "POST", `/hosts/${s.host}/sessions`, extra)).json()) as {
          token: string;
        }
      ).token;
    const book = async (s: Awaited<ReturnType<typeof setUp>>, start: string, extra: object = {}) =>
      (
        (await (
          await call(s.app, s.key, "POST", "/bookings", booking(s.eventType, start, extra))
        ).json()) as { id: string }
      ).id;

    test("a host moves one to a time the slots offer, past the attendee's cutoff", async () => {
      const s = await setUp();
      await call(s.app, s.key, "PATCH", `/event_types/${s.eventType}`, {
        reschedule_notice_minutes: 525600,
      });
      const id = await book(s, soon("09:00"));
      const token = await hostToken(s);
      const slots = (await (
        await client(
          s.app,
          token,
          "GET",
          `/host/bookings/${id}/slots?start=${soon("09:00")}&end=${soon("12:00")}`,
        )
      ).json()) as { data: { start: string; hosts?: unknown }[] };
      expect(slots.data.map((slot) => slot.start)).toContain(soon("10:00"));
      expect(slots.data.map((slot) => slot.start)).not.toContain(soon("09:00"));
      expect(slots.data[0]?.hosts).toBeUndefined();
      const moved = await client(s.app, token, "POST", `/host/bookings/${id}/reschedule`, {
        start: soon("10:00"),
      });
      expect(moved.status).toBe(200);
      const body = (await moved.json()) as Record<string, unknown>;
      expect(body.start).toBe(soon("10:00"));
      expect(body.answers).toBeUndefined();
      const after = (await (await call(s.app, s.key, "GET", `/bookings/${id}`)).json()) as {
        start: string;
      };
      expect(after.start).toBe(soon("10:00"));
    });

    test("a taken time is refused, and a browser can't choose another host", async () => {
      const s = await setUp();
      const id = await book(s, at("09:00"));
      await book(s, at("10:00"), { attendee: { uid: "p2", time_zone: "UTC" } });
      const token = await hostToken(s);
      const taken = await client(s.app, token, "POST", `/host/bookings/${id}/reschedule`, {
        start: at("10:00"),
      });
      expect(taken.status).toBe(422);
      expect((await errorOf(taken)).code).toBe("slot_unavailable");
      const elsewhere = await client(s.app, token, "POST", `/host/bookings/${id}/reschedule`, {
        start: at("11:00"),
        host: "doctor_1",
      });
      expect(elsewhere.status).toBe(422);
    });

    test("only the session's host can reach them, and a read-only session can only read", async () => {
      const s = await setUp();
      const id = await book(s, at("09:00"));
      const other = await call(s.app, s.key, "POST", "/hosts", {
        name: "Dr. Other",
        time_zone: "UTC",
      });
      const otherHost = ((await other.json()) as { id: string }).id;
      const { token: stranger } = (await (
        await call(s.app, s.key, "POST", `/hosts/${otherHost}/sessions`, {})
      ).json()) as { token: string };
      const range = `start=${at("09:00")}&end=${at("12:00")}`;
      for (const [method, path, body] of [
        ["GET", `/host/bookings/${id}/slots?${range}`, undefined],
        ["POST", `/host/bookings/${id}/reschedule`, { start: at("10:00") }],
        ["POST", `/host/bookings/${id}/no_show`, undefined],
      ] as const) {
        expect((await client(s.app, stranger, method, path, body)).status).toBe(404);
      }
      const reader = await hostToken(s, { read_only: true });
      expect(
        (await client(s.app, reader, "GET", `/host/bookings/${id}/slots?${range}`)).status,
      ).toBe(200);
      expect(
        (
          await client(s.app, reader, "POST", `/host/bookings/${id}/reschedule`, {
            start: at("10:00"),
          })
        ).status,
      ).toBe(403);
      expect((await client(s.app, reader, "POST", `/host/bookings/${id}/no_show`)).status).toBe(
        403,
      );
    });

    test("a no-show waits for the start, shows in the past list, and counts once", async () => {
      const tenant = await createTestTenant();
      let nowMs = Date.parse(`${MONDAY}T08:00:00.000Z`);
      const { app } = createTestApp({
        scheduling: testSchedulingDeps({ now: () => new Date(nowMs) }),
      });
      const key = tenant.sandboxKey;
      const host = (await (
        await call(app, key, "POST", "/hosts", { name: "Dr. Reyes", time_zone: "UTC" })
      ).json()) as { id: string };
      await call(app, key, "POST", `/hosts/${host.id}/schedules`, {
        rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
      });
      const eventType = (await (
        await call(app, key, "POST", "/event_types", {
          title: "Consultation",
          duration_minutes: 30,
          hosts: [{ host: host.id }],
        })
      ).json()) as { id: string };
      const created = (await (
        await call(app, key, "POST", "/bookings", booking(eventType.id, at("09:00")))
      ).json()) as { id: string };
      const env = {
        organizationId: tenant.organization.id,
        projectId: tenant.project.id,
        environmentId: tenant.development.id,
        mode: "sandbox" as const,
      };
      // The clock is the test's, and a session's expiry has to come from it too.
      const { token } = await createHostSession(env, {
        host: host.id,
        publicUrl: null,
        now: new Date(nowMs),
        expiresIn: 86_400,
      });
      const early = await client(app, token, "POST", `/host/bookings/${created.id}/no_show`);
      expect(early.status).toBe(422);
      const pastList = async () =>
        (await (await client(app, token, "GET", "/host/bookings?when=past")).json()) as {
          data: { id: string; no_show_at: string | null }[];
        };
      expect((await pastList()).data).toEqual([]);

      nowMs = Date.parse(at("09:45"));
      const upcoming = (await (await client(app, token, "GET", "/host/bookings")).json()) as {
        data: unknown[];
      };
      expect(upcoming.data).toEqual([]);
      expect((await pastList()).data.map((item) => item.id)).toEqual([created.id]);
      const marked = await client(app, token, "POST", `/host/bookings/${created.id}/no_show`);
      expect(marked.status).toBe(200);
      const first = (await pastList()).data[0]?.no_show_at;
      expect(first).toBe(at("09:45"));

      nowMs = Date.parse(at("09:50"));
      const again = await client(app, token, "POST", `/host/bookings/${created.id}/no_show`);
      expect(again.status).toBe(200);
      expect((await pastList()).data[0]?.no_show_at).toBe(first ?? "");
      const { events } = await getBookingOverview(env, created.id, testSchedulingDeps());
      expect(events.filter((event) => event.type === "scheduling.booking.no_show")).toHaveLength(1);

      nowMs = Date.parse(at("09:45")) + 31 * 86_400_000;
      const later = await createHostSession(env, {
        host: host.id,
        publicUrl: null,
        now: new Date(nowMs),
      });
      const aged = (await (
        await client(app, later.token, "GET", "/host/bookings?when=past")
      ).json()) as { data: unknown[] };
      expect(aged.data).toEqual([]);
    });

    test("a group seat can't be moved", async () => {
      const s = await setUp();
      const group = (await (
        await call(s.app, s.key, "POST", "/event_types", {
          title: "Class",
          kind: "group",
          capacity: 3,
          duration_minutes: 30,
          hosts: [{ host: s.host }],
        })
      ).json()) as { id: string };
      const seat = (await (
        await call(s.app, s.key, "POST", "/bookings", booking(group.id, at("09:00")))
      ).json()) as { id: string };
      const token = await hostToken(s);
      const moved = await client(s.app, token, "POST", `/host/bookings/${seat.id}/reschedule`, {
        start: at("10:00"),
      });
      expect(moved.status).toBe(422);
      expect((await errorOf(moved)).code).toBe("booking_not_changeable");
    });

    describe("the times offered for a move are the ones the move accepts", () => {
      const offered = async (
        s: Awaited<ReturnType<typeof setUp>>,
        token: string,
        id: string,
        from = "09:00",
        to = "13:00",
      ) =>
        (
          (await (
            await client(
              s.app,
              token,
              "GET",
              `/host/bookings/${id}/slots?start=${at(from)}&end=${at(to)}`,
            )
          ).json()) as { data: { start: string }[] }
        ).data.map((slot) => slot.start);
      const move = (s: Awaited<ReturnType<typeof setUp>>, token: string, id: string, to: string) =>
        client(s.app, token, "POST", `/host/bookings/${id}/reschedule`, { start: to });

      test("a booking doesn't count against a limit it would give back", async () => {
        const s = await setUp();
        await call(s.app, s.key, "PATCH", `/event_types/${s.eventType}`, {
          limits: [{ period: "day", max: 1 }],
        });
        const id = await book(s, at("09:00"));
        const token = await hostToken(s);
        expect(await offered(s, token, id)).toContain(at("10:00"));
        expect((await move(s, token, id, at("10:00"))).status).toBe(200);
      });

      test("nor does it block a time overlapping its own", async () => {
        const s = await setUp();
        await call(s.app, s.key, "PATCH", `/event_types/${s.eventType}`, { step_minutes: 15 });
        const id = await book(s, at("09:00"));
        const token = await hostToken(s);
        const times = await offered(s, token, id);
        expect(times).toContain(at("09:15"));
        expect(times).not.toContain(at("09:00"));
        expect((await move(s, token, id, at("09:15"))).status).toBe(200);
      });

      test("its buffers are the ones it was booked with", async () => {
        const s = await setUp();
        await call(s.app, s.key, "PATCH", `/event_types/${s.eventType}`, {
          buffer_after_minutes: 60,
        });
        const id = await book(s, at("09:00"));
        await call(s.app, s.key, "PATCH", `/event_types/${s.eventType}`, {
          buffer_after_minutes: 0,
        });
        await book(s, at("12:00"), { attendee: { uid: "p2", time_zone: "UTC" } });
        const token = await hostToken(s);
        const times = await offered(s, token, id);
        expect(times).toContain(at("10:30"));
        expect(times).not.toContain(at("11:00"));
        expect((await move(s, token, id, at("11:00"))).status).toBe(422);
        expect((await move(s, token, id, at("10:30"))).status).toBe(200);
      });

      test("a required host added since doesn't hold it back", async () => {
        const s = await setUp();
        const pool = (await (
          await call(s.app, s.key, "POST", "/event_types", {
            title: "Pool",
            kind: "pool",
            duration_minutes: 30,
            hosts: [{ host: s.host }],
          })
        ).json()) as { id: string };
        const created = (await (
          await call(s.app, s.key, "POST", "/bookings", booking(pool.id, at("09:00")))
        ).json()) as { id: string };
        await call(s.app, s.key, "POST", "/hosts", { uid: "late", name: "Late", time_zone: "UTC" });
        await call(s.app, s.key, "POST", "/hosts/late/schedules", {
          rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "16:00", end: "17:00" }],
        });
        await call(s.app, s.key, "PATCH", `/event_types/${pool.id}`, {
          hosts: [{ host: s.host }, { host: "late", role: "required" }],
        });
        const token = await hostToken(s);
        expect(await offered(s, token, created.id)).toContain(at("10:00"));
        expect((await move(s, token, created.id, at("10:00"))).status).toBe(200);
      });

      test("a host taken off the event type has nothing to offer, and the move agrees", async () => {
        const s = await setUp();
        const id = await book(s, at("09:00"));
        await call(s.app, s.key, "POST", "/hosts", { uid: "new", name: "New", time_zone: "UTC" });
        await call(s.app, s.key, "PATCH", `/event_types/${s.eventType}`, {
          hosts: [{ host: "new" }],
        });
        const token = await hostToken(s);
        expect(await offered(s, token, id)).toEqual([]);
        expect((await move(s, token, id, at("10:00"))).status).toBe(422);
      });

      test("a disabled host has nothing to offer, and the move agrees", async () => {
        const s = await setUp();
        const id = await book(s, at("09:00"));
        const token = await hostToken(s);
        await call(s.app, s.key, "PATCH", `/hosts/${s.host}`, { status: "disabled" });
        expect(await offered(s, token, id)).toEqual([]);
        expect((await move(s, token, id, at("10:00"))).status).toBe(422);
      });
    });

    test("moving keeps a booking's length after its event type changes", async () => {
      const s = await setUp();
      const id = await book(s, at("09:00"));
      await call(s.app, s.key, "PATCH", `/event_types/${s.eventType}`, { duration_minutes: 45 });
      const token = await hostToken(s);
      const range = `start=${at("09:00")}&end=${at("12:00")}`;
      const offered = await client(s.app, token, "GET", `/host/bookings/${id}/slots?${range}`);
      expect(offered.status).toBe(200);
      const first = ((await offered.json()) as { data: { start: string; end: string }[] }).data[0];
      expect(first ? Date.parse(first.end) - Date.parse(first.start) : 0).toBe(30 * 60_000);
      const manage = (await (
        await call(s.app, s.key, "POST", `/bookings/${id}/manage_sessions`)
      ).json()) as { token: string };
      expect((await client(s.app, manage.token, "GET", `/booking/slots?${range}`)).status).toBe(
        200,
      );
    });
  });

  test("a browser can't set a group's shared location, even on a session a member opened", async () => {
    const s = await setUp();
    const group = (await (
      await call(s.app, s.key, "POST", "/event_types", {
        title: "Class",
        kind: "group",
        capacity: 3,
        duration_minutes: 30,
        hosts: [{ host: s.host }],
        locations: [{ type: "link", url: "https://meet.example.com/real" }],
      })
    ).json()) as { id: string };
    const env = {
      organizationId: s.tenant.organization.id,
      projectId: s.tenant.project.id,
      environmentId: s.tenant.development.id,
      mode: "sandbox" as const,
    };
    const session = await createBookerSession(
      env,
      { eventType: group.id, createdByUserId: s.tenant.owner.id, publicUrl: null },
      testSchedulingDeps(),
    );
    const seat = await client(s.app, session.token, "POST", "/bookings", {
      start: at("09:00"),
      attendee: { name: "Sam", email: "sam@example.com", time_zone: "UTC" },
      location: { type: "link", url: "https://evil.example.com/" },
    });
    expect(seat.status).toBe(201);
    const { location } = (await seat.json()) as { location: { url: string } };
    expect(location.url).toBe("https://meet.example.com/real");
    const { events } = await getBookingOverview(
      env,
      (
        (await (await call(s.app, s.key, "GET", `/bookings?event_type=${group.id}`)).json()) as {
          data: { id: string }[];
        }
      ).data[0]?.id as string,
      testSchedulingDeps(),
    );
    expect(events.at(-1)?.actor).toBe("user");
  });

  test("a manage session a dashboard member opened acts as them, past the cutoffs", async () => {
    const s = await setUp();
    await call(s.app, s.key, "PATCH", `/event_types/${s.eventType}`, {
      cancel_notice_minutes: 525600,
      reschedule_notice_minutes: 525600,
    });
    const id = (
      (await (
        await call(s.app, s.key, "POST", "/bookings", booking(s.eventType, soon("09:00")))
      ).json()) as { id: string }
    ).id;
    const attendee = (await (
      await call(s.app, s.key, "POST", `/bookings/${id}/manage_sessions`)
    ).json()) as { token: string };
    const refused = await client(s.app, attendee.token, "POST", "/booking/reschedule", {
      start: soon("10:00"),
    });
    expect(refused.status).toBe(422);

    const env = {
      organizationId: s.tenant.organization.id,
      projectId: s.tenant.project.id,
      environmentId: s.tenant.development.id,
      mode: "sandbox" as const,
    };
    const session = await createManageSession(env, {
      bookingId: id,
      createdByUserId: s.tenant.owner.id,
      publicUrl: null,
    });
    expect(session.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(3_600_000);
    const moved = await client(s.app, session.token, "POST", "/booking/reschedule", {
      start: soon("10:00"),
    });
    expect(moved.status).toBe(200);
    const { events } = await getBookingOverview(env, id, testSchedulingDeps());
    expect(events[0]?.type).toBe("scheduling.booking.rescheduled");
    expect(events[0]?.actor).toBe("user");
  });

  test("a session reaches only its scope", async () => {
    const s = await setUp();
    const { token: booker } = await bookerSession(s);
    expect((await client(s.app, booker, "GET", "/host/schedules")).status).toBe(404);
    expect((await client(s.app, booker, "GET", "/booking")).status).toBe(404);
    const host = (await (
      await call(s.app, s.key, "POST", `/hosts/${s.host}/sessions`, {})
    ).json()) as { token: string };
    expect((await client(s.app, host.token, "GET", "/slots?start=a&end=b")).status).toBe(404);
    expect((await client(s.app, host.token, "GET", "/booking")).status).toBe(404);
    const other = await setUp();
    const created = (await (
      await call(other.app, other.key, "POST", "/bookings", booking(other.eventType, at("09:00")))
    ).json()) as { id: string };
    expect(
      (await client(s.app, host.token, "POST", `/host/bookings/${created.id}/approve`)).status,
    ).toBe(404);
    expect((await client(s.app, "cossch_nonsense", "GET", "/session")).status).toBe(404);
    expect((await s.app.request("/scheduling/client/session")).status).toBe(404);
  });

  test("a host manages their hours; a read-only session can't", async () => {
    const s = await setUp();
    const host = (await (
      await call(s.app, s.key, "POST", `/hosts/${s.host}/sessions`, {})
    ).json()) as { token: string };
    const schedules = (await (
      await client(s.app, host.token, "GET", "/host/schedules")
    ).json()) as { data: { id: string }[] };
    const id = schedules.data[0]?.id as string;
    const updated = await client(s.app, host.token, "PUT", `/host/schedules/${id}`, {
      rules: [{ days: [1], start: "10:00", end: "12:00" }],
    });
    expect(updated.status).toBe(200);
    const slots = (await (
      await call(
        s.app,
        s.key,
        "GET",
        `/event_types/${s.eventType}/slots?start=${at("09:00")}&end=${at("11:00")}`,
      )
    ).json()) as { data: { start: string }[] };
    expect(slots.data[0]?.start).toBe(at("10:00"));
    const reader = (await (
      await call(s.app, s.key, "POST", `/hosts/${s.host}/sessions`, { read_only: true })
    ).json()) as { token: string };
    const refused = await client(s.app, reader.token, "PUT", `/host/schedules/${id}`, {
      rules: [],
    });
    expect(refused.status).toBe(403);
    expect((await client(s.app, reader.token, "GET", "/host/schedules")).status).toBe(200);
  });

  test("a manage link reschedules within the cutoffs, and dies on cancel", async () => {
    const s = await setUp();
    const created = (await (
      await call(s.app, s.key, "POST", "/bookings", booking(s.eventType, at("09:00")))
    ).json()) as { id: string };
    const manage = (await (
      await call(s.app, s.key, "POST", `/bookings/${created.id}/manage_sessions`)
    ).json()) as { token: string };
    const moved = await client(s.app, manage.token, "POST", "/booking/reschedule", {
      start: at("10:00"),
    });
    expect(((await moved.json()) as { start: string }).start).toBe(at("10:00"));
    expect((await client(s.app, manage.token, "POST", "/booking/cancel")).status).toBe(200);
    expect((await client(s.app, manage.token, "GET", "/booking")).status).toBe(404);
  });

  test("origins: preflight is open, real requests are checked", async () => {
    const s = await setUp();
    const { token } = await bookerSession(s);
    const preflight = await s.app.request("/scheduling/client/session", {
      method: "OPTIONS",
      headers: { Origin: "https://anywhere.example", "Access-Control-Request-Method": "GET" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    const refused = await client(s.app, token, "GET", "/session", undefined, {
      Origin: "https://evil.example",
    });
    expect(refused.status).toBe(403);
    await call(s.app, s.key, "PATCH", "/settings", {
      allowed_origins: ["https://app.example.com"],
    });
    const allowed = await client(s.app, token, "GET", "/session", undefined, {
      Origin: "https://app.example.com",
    });
    expect(allowed.status).toBe(200);
    const local = await client(s.app, token, "GET", "/session", undefined, {
      Origin: "http://localhost:5173",
    });
    expect(local.status).toBe(200);
  });

  test("session tokens and attendees' details never reach the request log", async () => {
    const writer = memoryLogWriter();
    const s = await setUp({ logWriter: writer });
    const { token } = await bookerSession(s, {
      attendee: { uid: "p", name: "Sam Lee", email: "sam@example.com", time_zone: "UTC" },
    });
    const session = await s.app.request("/scheduling/client/session", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(session.status).toBe(200);
    const lines = await waitForLogLines(writer, 1);
    const logged = JSON.stringify(lines);
    expect(logged).toContain("/v1/scheduling/booker_sessions");
    expect(logged).not.toContain(token);
    expect(logged).not.toContain("sam@example.com");
  });
});

describe("Zoom's events", () => {
  const SECRET = "zoom-secret-token";
  const routes = () => {
    const app = new Hono<AppEnv>();
    app.use(async (c, next) => {
      c.set("rateLimiter", memoryLimiter());
      c.set("clientIp", null);
      await next();
    });
    app.route(
      "/",
      createSchedulingCallbackRoutes({
        calendars: {
          secretsKeys: testSchedulingDeps().dataKeys,
          apps: {
            google: null,
            microsoft: null,
            zoom: { clientId: "id", clientSecret: "secret", webhookSecret: SECRET },
          },
          publicUrl: "https://api.example.test",
        },
      }),
    );
    return app;
  };
  const post = (
    body: string,
    signature: string,
    timestamp = String(Math.floor(Date.now() / 1000)),
  ) =>
    routes().request("/zoom/events", {
      method: "POST",
      headers: { "x-zm-signature": signature, "x-zm-request-timestamp": timestamp },
      body,
    });
  const sign = (body: string, secret = SECRET) => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const hash = createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex");
    return { signature: `v0=${hash}`, timestamp };
  };

  test("answers Zoom's endpoint check", async () => {
    const body = JSON.stringify({
      event: "endpoint.url_validation",
      payload: { plainToken: "plain" },
    });
    const { signature, timestamp } = sign(body);
    const res = await post(body, signature, timestamp);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      plainToken: "plain",
      encryptedToken: createHmac("sha256", SECRET).update("plain").digest("hex"),
    });
  });

  test("refuses a bad signature, and acts on nothing it can't verify", async () => {
    const body = JSON.stringify({ event: "app_deauthorized", payload: { user_id: "zoom_user" } });
    const { signature, timestamp } = sign(body, "wrong");
    expect((await post(body, signature, timestamp)).status).toBe(401);
  });

  test("accepts a signed deauthorization", async () => {
    const body = JSON.stringify({ event: "app_deauthorized", payload: { user_id: "nobody_here" } });
    const { signature, timestamp } = sign(body);
    expect((await post(body, signature, timestamp)).status).toBe(200);
  });
});

describe("out of office", () => {
  async function booker() {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const key = tenant.sandboxKey;
    const send = (path: string, method: string, body?: unknown, auth = key) =>
      app.request(`/v1/scheduling${path}`, {
        method,
        headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const host = (await (
      await send("/hosts", "POST", { name: "Dr. Reyes", time_zone: "UTC", uid: "doctor_1" })
    ).json()) as { id: string };
    await send("/hosts/doctor_1/schedules", "POST", {
      rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
    });
    const eventType = (await (
      await send("/event_types", "POST", {
        title: "Consultation",
        duration_minutes: 30,
        hosts: [{ host: "doctor_1" }],
      })
    ).json()) as { id: string };
    const tokenFor = async (path: string, body: unknown) =>
      ((await (await send(path, "POST", body)).json()) as { token: string }).token;
    const client =
      (token: string) =>
      (path: string, method = "GET", body?: unknown) =>
        app.request(`/scheduling/client${path}`, {
          method,
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
    return { app, tenant, send, host, eventType, tokenFor, client };
  }

  const FAR = { start: "2031-01-06T00:00:00.000Z", end: "2031-01-07T00:00:00.000Z" };

  test("needs the right permissions, and a bad window is a 422", async () => {
    const { send } = await booker();
    const refused = await send("/out_of_office", "POST", { host: "doctor_1" });
    expect(refused.status).toBe(422);
    expect((await errorOf(refused)).code).toBe("invalid_time");
    const anonymous = await send("/out_of_office", "GET", undefined, "coss_test_nope");
    expect(anonymous.status).toBe(401);
  });

  test("a host session manages only its own time, and can't name another host", async () => {
    const { send, host, tokenFor, client } = await booker();
    const other = (await (
      await send("/hosts", "POST", { name: "Dr. Chen", time_zone: "UTC" })
    ).json()) as { id: string };
    const mine = client(await tokenFor(`/hosts/${host.id}/sessions`, {}));
    const theirs = client(await tokenFor(`/hosts/${other.id}/sessions`, {}));

    const created = await mine("/host/out_of_office", "POST", {
      start_date: "2031-01-06",
      end_date: "2031-01-06",
      reason: "vacation",
    });
    expect(created.status).toBe(201);
    const entry = (await created.json()) as { id: string; host: string; source: string };
    expect(entry.host).toBe(host.id);
    expect(entry.source).toBe("host");

    const naming = await mine("/host/out_of_office", "POST", {
      host: other.id,
      start_date: "2031-01-06",
      end_date: "2031-01-06",
    });
    expect(naming.status).toBe(422);

    const list = (await (await mine("/host/out_of_office")).json()) as {
      data: { id: string }[];
      reasons: { key: string }[];
    };
    expect(list.data.map((row) => row.id)).toEqual([entry.id]);
    expect(list.reasons.map((reason) => reason.key)).toContain("vacation");
    expect(
      ((await (await theirs("/host/out_of_office")).json()) as { data: unknown[] }).data,
    ).toEqual([]);
    expect((await theirs(`/host/out_of_office/${entry.id}`, "DELETE")).status).toBe(404);
    expect((await theirs(`/host/out_of_office/${entry.id}`, "PATCH", { notes: "x" })).status).toBe(
      404,
    );
    expect((await theirs(`/host/out_of_office/${entry.id}/conflicts`)).status).toBe(404);
    expect((await mine(`/host/out_of_office/${entry.id}`, "DELETE")).status).toBe(204);
  });

  test("a host names who covers for them, only from those they share work with", async () => {
    const { send, host, tokenFor, client } = await booker();
    const peer = (await (
      await send("/hosts", "POST", { name: "Dr. Peer", time_zone: "UTC" })
    ).json()) as { id: string };
    const stranger = (await (
      await send("/hosts", "POST", { name: "Dr. Stranger", time_zone: "UTC" })
    ).json()) as { id: string };
    await send("/event_types", "POST", {
      title: "Shared",
      kind: "pool",
      duration_minutes: 30,
      hosts: [{ host: host.id }, { host: peer.id }],
    });
    const mine = client(await tokenFor(`/hosts/${host.id}/sessions`, {}));
    const listed = (await (await mine("/host/delegates")).json()) as {
      data: Record<string, unknown>[];
    };
    // Only what it takes to choose: no attributes, emails or anything else about them.
    expect(listed.data).toEqual([{ id: peer.id, name: "Dr. Peer" }]);

    const when = { start_date: "2031-01-06", end_date: "2031-01-06" };
    const named = await mine("/host/out_of_office", "POST", { ...when, delegates: [peer.id] });
    expect(named.status).toBe(201);
    const entry = (await named.json()) as { id: string; delegates: string[] };
    expect(entry.delegates).toEqual([peer.id]);
    const refused = await mine("/host/out_of_office", "POST", {
      ...when,
      delegates: [stranger.id],
    });
    expect(refused.status).toBe(422);
    const changing = await mine(`/host/out_of_office/${entry.id}`, "PATCH", {
      delegates: [stranger.id],
    });
    expect(changing.status).toBe(422);
  });

  describe("a team page", () => {
    async function team(extra: Record<string, unknown> = {}) {
      const base = await booker();
      const { send, host, eventType } = base;
      const rules = [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }];
      const add = async (name: string, attributes?: Record<string, string>) => {
        const created = (await (
          await send("/hosts", "POST", { name, time_zone: "UTC", attributes })
        ).json()) as { id: string };
        await send(`/hosts/${created.id}/schedules`, "POST", { rules });
        return created;
      };
      const peer = await add("Dr. Peer", { team: "heart" });
      const outsider = await add("Dr. Outsider", { team: "skin" });
      const pool = (await (
        await send("/event_types", "POST", {
          title: "Shared",
          kind: "pool",
          duration_minutes: 30,
          hosts: [{ host: host.id }, { host: peer.id }, { host: outsider.id }],
        })
      ).json()) as { id: string };
      const tokenRes = await send("/manager_sessions", "POST", {
        hosts: [host.id, peer.id],
        ...extra,
      });
      expect(tokenRes.status).toBe(201);
      const session = (await tokenRes.json()) as { token: string; url: string | null };
      const lead = base.client(session.token);
      const bookFor = async (hostId: string, start: string) =>
        (await (
          await send("/bookings", "POST", {
            event_type: pool.id,
            start,
            host: hostId,
            attendee: {
              uid: `p-${start}-${hostId}`,
              name: "Private Person",
              email: "private@example.com",
              time_zone: "UTC",
            },
          })
        ).json()) as { id: string };
      return { ...base, host, eventType, peer, outsider, pool, lead, bookFor, session };
    }
    const START = "2031-01-06T10:00:00.000Z";
    const WHEN = { start_date: "2031-01-20", end_date: "2031-01-20" };

    test("the dashboard's team page reaches every host, as the member who opened it", async () => {
      const { tenant, send, peer, outsider, bookFor, host } = await team();
      const env = {
        organizationId: tenant.organization.id,
        projectId: tenant.project.id,
        environmentId: tenant.development.id,
        mode: "sandbox" as const,
      };
      const session = await createDashboardSession(env, {
        createdByUserId: tenant.owner.id,
        publicUrl: "https://book.example.com",
      });
      expect(session.url).toContain(`/t/${session.id}#`);
      const { app } = createTestApp();
      const asMember = (method: string, path: string, body?: unknown) =>
        app.request(`/scheduling/client/manager${path}`, {
          method,
          headers: {
            authorization: `Bearer ${session.token}`,
            "content-type": "application/json",
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      const hosts = (await (await asMember("GET", "/hosts")).json()) as { data: { id: string }[] };
      expect(hosts.data.map((found) => found.id).sort()).toEqual(
        [host.id, peer.id, outsider.id].sort(),
      );

      // A link to one booking finds it, whatever else is coming up.
      const booked = await bookFor(host.id, START);
      const later = await bookFor(host.id, "2031-01-07T10:00:00.000Z");
      const one = (await (await asMember("GET", `/bookings?booking=${later.id}`)).json()) as {
        data: { id: string }[];
      };
      expect(one.data.map((found) => found.id)).toEqual([later.id]);

      // Who's free is worked out here, and whoever's chosen is whoever's asked for.
      const candidates = (await (
        await asMember("GET", `/bookings/${booked.id}/reassign_candidates`)
      ).json()) as { data: { host: string; available: boolean }[] };
      expect(candidates.data.map((found) => found.host).sort()).toEqual(
        [peer.id, outsider.id].sort(),
      );
      const moved = await asMember("POST", `/bookings/${booked.id}/reassign`, {
        changes: [{ to_host: outsider.id }],
        reason_code: "other",
        note: "They asked",
        notify: { attendee: false },
      });
      expect(moved.status).toBe(200);
      expect(((await moved.json()) as { hosts: string[] }).hosts).toEqual([outsider.id]);

      // Time away, on the member's say-so, in whole days and in hours.
      const during = await bookFor(host.id, "2031-01-20T10:00:00.000Z");
      const days = await asMember("POST", "/out_of_office", {
        hosts: [host.id],
        ...WHEN,
        reason: "vacation",
        public_message: "Back soon",
        notes: "Private",
        show_on_calendar: false,
        delegates: [peer.id],
      });
      expect(days.status).toBe(201);
      const [entry] = ((await days.json()) as { data: { id: string; source: string }[] }).data;
      expect(entry?.source).toBe("dashboard");
      const hours = await asMember("POST", "/out_of_office", {
        hosts: [peer.id],
        start: "2031-02-03T09:00:00.000Z",
        end: "2031-02-03T12:00:00.000Z",
      });
      expect(hours.status).toBe(201);

      // Moving what's in someone's time away, as the page does.
      const preview = await asMember("POST", "/reassignments/preview", {
        selection: { out_of_office: entry?.id },
        strategy: {},
      });
      expect(preview.status).toBe(200);
      const items = (
        (await preview.json()) as {
          items: { booking: string; to_host: string | null; from_host: string | null }[];
        }
      ).items;
      expect(items.map((item) => item.booking)).toEqual([during.id]);
      expect(items[0]?.to_host).not.toBeNull();
      const run = await asMember("POST", "/reassignments", {
        selection: { out_of_office: entry?.id },
        strategy: {
          assignments: [
            { booking: during.id, to_host: items[0]?.to_host, from_host: items[0]?.from_host },
          ],
        },
        reason_code: "out_of_office",
        notify: { attendees: false },
      });
      expect(run.status).toBe(202);
      await runDueReassignments(testSchedulingDeps(), {
        scope: { organizationIds: [tenant.organization.id] },
      });
      const after = await send(`/bookings/${during.id}`, "GET");
      expect(((await after.json()) as { hosts: string[] }).hosts).toEqual([
        items[0]?.to_host as string,
      ]);
    });

    test("an empty scope is refused, and so is giving both", async () => {
      const { send, host } = await booker();
      const empty = await send("/manager_sessions", "POST", { host_filter: {} });
      expect(empty.status).toBe(422);
      expect((await errorOf(empty)).code).toBe("invalid_session");
      expect((await send("/manager_sessions", "POST", { hosts: [] })).status).toBe(422);
      expect((await send("/manager_sessions", "POST", {})).status).toBe(422);
      const both = await send("/manager_sessions", "POST", {
        hosts: [host.id],
        host_filter: { team: "x" },
      });
      expect(both.status).toBe(422);
    });

    test("its url is its own kind of page", async () => {
      const { session } = await team();
      if (session.url) expect(session.url).toContain("/t/schs_");
    });

    test("sees its own people, and only what it takes to choose them", async () => {
      const { lead, host, peer, outsider } = await team();
      const { data } = (await (await lead("/manager/hosts")).json()) as {
        data: Record<string, unknown>[];
      };
      expect(data.map((row) => row.id)).toEqual(expect.arrayContaining([host.id, peer.id]));
      expect(data.map((row) => row.id)).not.toContain(outsider.id);
      expect(Object.keys(data[0] as object).sort()).toEqual(
        ["id", "name", "object", "status", "time_zone", "uid"].sort(),
      );
    });

    test("a filter's asked again on every request", async () => {
      const { send, booker: _unused, client, ...rest } = { ...(await team()), booker: null };
      const { outsider } = rest;
      const session = (await (
        await send("/manager_sessions", "POST", { host_filter: { team: "skin" } })
      ).json()) as { token: string };
      const lead = client(session.token);
      const ids = async () =>
        ((await (await lead("/manager/hosts")).json()) as { data: { id: string }[] }).data.map(
          (row) => row.id,
        );
      expect(await ids()).toEqual([outsider.id]);
      await send(`/hosts/${outsider.id}`, "PATCH", { attributes: { team: "heart" } });
      expect(await ids()).toEqual([]);
    });

    test("another kind of session can't use it, nor it theirs", async () => {
      const { lead, client, host, tokenFor } = await team();
      const hostPage = client(await tokenFor(`/hosts/${host.id}/sessions`, {}));
      expect((await hostPage("/manager/hosts")).status).toBe(404);
      expect((await lead("/host/out_of_office")).status).toBe(404);
    });

    test("bookings carry no attendee", async () => {
      const { lead, host, bookFor } = await team();
      const booking = await bookFor(host.id, START);
      const response = await lead("/manager/bookings");
      const text = await response.text();
      expect(text).toContain(booking.id);
      expect(text).not.toContain("Private Person");
      expect(text).not.toContain("private@example.com");
      expect(text).not.toContain("attendee");
    });

    test("what needs cover: someone's away during it", async () => {
      const { lead, host, peer, bookFor, send } = await team();
      const away = await bookFor(host.id, START);
      const fine = await bookFor(peer.id, START);
      await send("/out_of_office", "POST", {
        host: host.id,
        start: START,
        end: "2031-01-06T12:00:00.000Z",
      });
      const { data } = (await (await lead("/manager/bookings?needs_cover=true")).json()) as {
        data: { id: string; host_away: boolean }[];
      };
      expect(data.map((row) => row.id)).toContain(away.id);
      expect(data.map((row) => row.id)).not.toContain(fine.id);
      expect(data.find((row) => row.id === away.id)?.host_away).toBe(true);
    });

    test("someone else's booking doesn't exist", async () => {
      const { lead, outsider, peer, bookFor } = await team();
      const theirs = await bookFor(outsider.id, START);
      expect((await lead(`/manager/bookings/${theirs.id}/reassign_candidates`)).status).toBe(404);
      const taking = await lead(`/manager/bookings/${theirs.id}/reassign`, "POST", {
        changes: [{ to_host: peer.id }],
        reason_code: "other",
      });
      expect(taking.status).toBe(404);
    });

    test("moves a booking among its own people, and no further", async () => {
      const { lead, host, peer, outsider, bookFor, send } = await team();
      const mine = await bookFor(host.id, START);
      const candidates = (await (
        await lead(`/manager/bookings/${mine.id}/reassign_candidates`)
      ).json()) as { data: { host: string }[] };
      expect(candidates.data.map((row) => row.host)).toEqual([peer.id]);
      const outward = await lead(`/manager/bookings/${mine.id}/reassign`, "POST", {
        changes: [{ to_host: outsider.id }],
        reason_code: "other",
      });
      expect(outward.status).toBe(422);
      const moved = await lead(`/manager/bookings/${mine.id}/reassign`, "POST", {
        changes: [{ to_host: peer.id }],
        reason_code: "other",
      });
      expect(moved.status).toBe(200);
      expect(await moved.text()).not.toContain("private@example.com");
      const after = (await (await send(`/bookings/${mine.id}`, "GET")).json()) as {
        hosts: string[];
      };
      expect(after.hosts).toEqual([peer.id]);
    });

    test("auto stays on the team", async () => {
      const { lead, host, peer, bookFor } = await team();
      const mine = await bookFor(host.id, START);
      const moved = await lead(`/manager/bookings/${mine.id}/reassign`, "POST", {
        changes: [{ auto: true }],
        reason_code: "other",
      });
      expect(moved.status).toBe(200);
      expect(((await moved.json()) as { hosts: string[] }).hosts).toEqual([peer.id]);
    });

    test("time off for its own people, naming only them", async () => {
      const { lead, host, peer, outsider, client, send } = await team();
      const created = await lead("/manager/out_of_office", "POST", {
        ...WHEN,
        hosts: [host.id],
        delegates: [peer.id],
      });
      expect(created.status).toBe(201);
      const { data } = (await created.json()) as {
        data: { id: string; source: string; delegates: string[] }[];
      };
      expect(data[0]).toMatchObject({ source: "manager", delegates: [peer.id] });

      const notMine = await lead("/manager/out_of_office", "POST", {
        ...WHEN,
        hosts: [outsider.id],
      });
      expect(notMine.status).toBe(404);
      const delegate = await lead("/manager/out_of_office", "POST", {
        ...WHEN,
        hosts: [host.id],
        delegates: [outsider.id],
      });
      expect(delegate.status).toBe(422);

      const theirs = (await (
        await send("/out_of_office", "POST", { ...WHEN, host: outsider.id })
      ).json()) as { data: { id: string }[] };
      const theirId = theirs.data[0]?.id as string;
      expect((await lead(`/manager/out_of_office/${theirId}`, "DELETE")).status).toBe(404);
      expect((await lead(`/manager/out_of_office/${theirId}/conflicts`)).status).toBe(404);
      const list = (await (await lead("/manager/out_of_office")).json()) as {
        data: { id: string }[];
      };
      expect(list.data.map((row) => row.id)).not.toContain(theirId);
      expect(client).toBeTruthy();
      expect((await lead(`/manager/out_of_office/${data[0]?.id}`, "DELETE")).status).toBe(204);
    });

    test("can't start moving bookings from an entry", async () => {
      const { lead, host } = await team();
      const asked = await lead("/manager/out_of_office", "POST", {
        ...WHEN,
        hosts: [host.id],
        existing_bookings: "reassign",
      });
      expect(asked.status).toBe(422);
    });

    test("moving an entry that moves bookings doesn't start a run", async () => {
      const { lead, send, host, outsider, bookFor } = await team();
      const created = (await (
        await send("/out_of_office", "POST", {
          host: host.id,
          start_date: "2031-03-03",
          end_date: "2031-03-03",
          existing_bookings: "reassign",
          reassign: { to_host: outsider.id },
        })
      ).json()) as { data: { id: string }[] };
      await bookFor(host.id, START);
      const moved = await lead(`/manager/out_of_office/${created.data[0]?.id}`, "PATCH", {
        start_date: "2031-01-06",
        end_date: "2031-01-06",
      });
      expect(moved.status).toBe(200);
      const runs = (await (await send("/reassignments", "GET")).json()) as { data: unknown[] };
      expect(runs.data).toEqual([]);
    });

    test("a run stays on the team, and says who each goes to", async () => {
      const { lead, host, peer, outsider, bookFor } = await team();
      const mine = await bookFor(host.id, START);
      const theirs = await bookFor(outsider.id, START);
      const run = (body: unknown) => lead("/manager/reassignments", "POST", body);
      const fromOutside = await run({
        selection: { host: outsider.id },
        strategy: { to_host: peer.id },
        reason_code: "other",
      });
      expect(fromOutside.status).toBe(422);
      const toOutside = await run({
        selection: { host: host.id },
        strategy: { to_host: outsider.id },
        reason_code: "other",
      });
      expect(toOutside.status).toBe(422);
      const anyone = await run({
        selection: { host: host.id },
        strategy: { preferred_hosts: [peer.id] },
        reason_code: "other",
      });
      expect(anyone.status).toBe(422);
      const byId = await run({
        selection: { booking_ids: [theirs.id] },
        strategy: { to_host: peer.id },
        reason_code: "other",
      });
      expect(byId.status).toBe(422);

      const preview = await lead("/manager/reassignments/preview", "POST", {
        selection: { host: host.id },
        strategy: { preferred_hosts: [outsider.id] },
      });
      expect(preview.status).toBe(422);
      const fine = await lead("/manager/reassignments/preview", "POST", {
        selection: { host: host.id },
        strategy: { preferred_hosts: [peer.id] },
      });
      const { items } = (await fine.json()) as { items: { booking: string; to_host: string }[] };
      expect(items[0]).toMatchObject({ booking: mine.id, to_host: peer.id });
      expect(await (await lead("/manager/bookings")).text()).not.toContain("private@example.com");

      const started = await run({
        selection: { host: host.id },
        strategy: { assignments: [{ booking: mine.id, to_host: peer.id, from_host: host.id }] },
        reason_code: "other",
      });
      expect(started.status).toBe(202);
      const { id } = (await started.json()) as { id: string };
      expect((await lead(`/manager/reassignments/${id}`)).status).toBe(200);
      const list = (await (await lead("/manager/reassignments")).json()) as {
        data: { id: string }[];
      };
      expect(list.data.map((row) => row.id)).toEqual([id]);
    });

    test("can't name someone off the team as who leaves a booking", async () => {
      const { lead, host, peer, outsider, send } = await team();
      const panel = (await (
        await send("/event_types", "POST", {
          title: "Panel",
          kind: "collective",
          duration_minutes: 30,
          hosts: [
            { host: host.id, role: "required" },
            { host: outsider.id, role: "required" },
          ],
        })
      ).json()) as { id: string };
      const booking = (await (
        await send("/bookings", "POST", {
          event_type: panel.id,
          start: START,
          attendee: { uid: "p", name: "Sam", email: "sam@example.com", time_zone: "UTC" },
        })
      ).json()) as { id: string };
      const refused = await lead("/manager/reassignments", "POST", {
        selection: { host: host.id },
        strategy: {
          assignments: [{ booking: booking.id, to_host: peer.id, from_host: outsider.id }],
        },
        reason_code: "other",
        overrides: ["any_host"],
      });
      expect(refused.status).toBe(422);
    });

    test("undoing only gives back between its own people", async () => {
      const { tenant, lead, host, peer, outsider, bookFor, send } = await team();
      const mine = await bookFor(host.id, START);
      const later = await bookFor(host.id, "2031-01-06T11:00:00.000Z");
      // Someone with an API key moved them, one on the team and one off it.
      const made = (await (
        await send("/reassignments", "POST", {
          selection: { host: host.id },
          strategy: {
            assignments: [
              { booking: mine.id, to_host: peer.id, from_host: host.id },
              { booking: later.id, to_host: outsider.id, from_host: host.id },
            ],
          },
          reason_code: "other",
        })
      ).json()) as { id: string };
      const testDeps = testSchedulingDeps();
      const scope = { organizationIds: [tenant.organization.id] };
      await runDueReassignments(testDeps, { scope });
      const undone = await lead(`/manager/reassignments/${made.id}/undo`, "POST", {});
      expect(undone.status).toBe(202);
      await runDueReassignments(testDeps, { scope });
      const hostsOf = async (id: string) =>
        ((await (await send(`/bookings/${id}`, "GET")).json()) as { hosts: string[] }).hosts;
      expect(await hostsOf(mine.id)).toEqual([host.id]);
      expect(await hostsOf(later.id)).toEqual([outsider.id]);

      // Undoing that is still this team's, and so is what comes of it.
      const undoneRun = (await undone.json()) as { id: string };
      const again = await lead(`/manager/reassignments/${undoneRun.id}/undo`, "POST", {});
      expect(again.status).toBe(202);
      const againRun = (await again.json()) as { id: string };
      await runDueReassignments(testDeps, { scope });
      expect(await hostsOf(mine.id)).toEqual([peer.id]);
      expect((await lead(`/manager/reassignments/${againRun.id}`, "GET")).status).toBe(200);
      const runs = (await (await lead("/manager/reassignments", "GET")).json()) as {
        data: { id: string }[];
      };
      expect(runs.data.map((run) => run.id)).toEqual(
        expect.arrayContaining([made.id, undoneRun.id, againRun.id]),
      );
    });

    test("another team's run doesn't exist", async () => {
      const { send, host, peer, client, outsider, lead } = await team();
      const other = (await (
        await send("/reassignments", "POST", {
          selection: { host: outsider.id },
          strategy: { to_host: peer.id },
          reason_code: "other",
        })
      ).json()) as { id: string };
      expect((await lead(`/manager/reassignments/${other.id}`)).status).toBe(404);
      expect((await lead(`/manager/reassignments/${other.id}/items`)).status).toBe(404);
      expect((await lead(`/manager/reassignments/${other.id}/cancel`, "POST")).status).toBe(404);
      expect((await lead(`/manager/reassignments/${other.id}/undo`, "POST", {})).status).toBe(404);
      const list = (await (await lead("/manager/reassignments")).json()) as { data: unknown[] };
      expect(list.data).toEqual([]);
      expect(client).toBeTruthy();
      expect(host).toBeTruthy();
    });

    test("read-only looks and doesn't touch", async () => {
      const { lead, host, peer, bookFor } = await team({ read_only: true });
      const mine = await bookFor(host.id, START);
      expect((await lead("/manager/bookings")).status).toBe(200);
      const refusals = [
        await lead("/manager/out_of_office", "POST", { ...WHEN, hosts: [host.id] }),
        await lead(`/manager/bookings/${mine.id}/reassign`, "POST", {
          changes: [{ to_host: peer.id }],
          reason_code: "other",
        }),
        await lead("/manager/reassignments", "POST", {
          selection: { host: host.id },
          strategy: { to_host: peer.id },
          reason_code: "other",
        }),
      ];
      for (const refused of refusals) {
        expect(refused.status).toBe(403);
        expect((await errorOf(refused)).code).toBe("read_only_session");
      }
    });
  });

  describe("a host giving away their own booking", () => {
    async function setup() {
      const base = await booker();
      const { send, host } = base;
      const rules = [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }];
      const add = async (name: string) => {
        const created = (await (
          await send("/hosts", "POST", { name, time_zone: "UTC" })
        ).json()) as { id: string };
        await send(`/hosts/${created.id}/schedules`, "POST", { rules });
        return created;
      };
      const peer = await add("Dr. Peer");
      const stranger = await add("Dr. Stranger");
      const pool = (await (
        await send("/event_types", "POST", {
          title: "Shared",
          kind: "pool",
          duration_minutes: 30,
          hosts: [{ host: host.id }, { host: peer.id }],
        })
      ).json()) as { id: string };
      const booking = (await (
        await send("/bookings", "POST", {
          event_type: pool.id,
          start: "2031-01-06T10:00:00.000Z",
          host: host.id,
          attendee: {
            uid: "p",
            name: "Private Person",
            email: "private@example.com",
            time_zone: "UTC",
          },
        })
      ).json()) as { id: string };
      const mine = base.client(await base.tokenFor(`/hosts/${host.id}/sessions`, {}));
      return { ...base, peer, stranger, booking, mine };
    }

    test("is off until the environment says so, and then nothing's there", async () => {
      const { mine, booking, peer } = await setup();
      expect((await mine(`/host/bookings/${booking.id}/reassign_candidates`)).status).toBe(404);
      const refused = await mine(`/host/bookings/${booking.id}/reassign`, "POST", {
        to_host: peer.id,
      });
      expect(refused.status).toBe(404);
      const session = (await (await mine("/session")).json()) as { can_reassign: boolean };
      expect(session.can_reassign).toBe(false);
    });

    test("sees names only, and only those free who take it", async () => {
      const { send, mine, booking, peer } = await setup();
      await send("/settings", "PATCH", { host_reassignment: "eligible" });
      const { data } = (await (
        await mine(`/host/bookings/${booking.id}/reassign_candidates`)
      ).json()) as { data: Record<string, unknown>[] };
      expect(data).toEqual([{ host: peer.id, name: "Dr. Peer" }]);
    });

    test("can give it to them, and to nobody else", async () => {
      const { send, mine, booking, peer, stranger } = await setup();
      await send("/settings", "PATCH", { host_reassignment: "eligible" });
      const toStranger = await mine(`/host/bookings/${booking.id}/reassign`, "POST", {
        to_host: stranger.id,
      });
      expect(toStranger.status).toBe(422);
      const past = await mine(`/host/bookings/${booking.id}/reassign`, "POST", {
        to_host: peer.id,
        overrides: ["any_host"],
      });
      expect(past.status).toBe(422);
      const moved = await mine(`/host/bookings/${booking.id}/reassign`, "POST", {
        to_host: peer.id,
      });
      expect(moved.status).toBe(200);
      // It isn't theirs any more, and it looks like it.
      const again = await mine(`/host/bookings/${booking.id}/reassign`, "POST", {
        to_host: peer.id,
      });
      expect(again.status).toBe(404);
    });

    test("someone else's can't be given away", async () => {
      const { send, tokenFor, client, booking, peer } = await setup();
      await send("/settings", "PATCH", { host_reassignment: "eligible" });
      const theirs = client(await tokenFor(`/hosts/${peer.id}/sessions`, {}));
      expect((await theirs(`/host/bookings/${booking.id}/reassign_candidates`)).status).toBe(404);
      const refused = await theirs(`/host/bookings/${booking.id}/reassign`, "POST", {
        to_host: peer.id,
      });
      expect(refused.status).toBe(404);
    });

    test("read-only can't", async () => {
      const { send, tokenFor, client, host, booking, peer } = await setup();
      await send("/settings", "PATCH", { host_reassignment: "eligible" });
      const session = client(await tokenFor(`/hosts/${host.id}/sessions`, { read_only: true }));
      const refused = await session(`/host/bookings/${booking.id}/reassign`, "POST", {
        to_host: peer.id,
      });
      expect(refused.status).toBe(403);
    });

    test("a host's own list has no contact details", async () => {
      const { mine, booking } = await setup();
      const response = await mine("/host/bookings");
      const text = await response.text();
      expect(text).toContain(booking.id);
      expect(text).toContain("Private Person");
      expect(text).not.toContain("private@example.com");
      const { data } = JSON.parse(text) as { data: Record<string, unknown>[] };
      expect(Object.keys(data[0] as object).sort()).toEqual(
        [
          "attendees",
          "end",
          "group_session",
          "id",
          "no_show_at",
          "start",
          "status",
          "title",
        ].sort(),
      );
    });
  });

  test("a host's session can't start moving bookings by changing an entry", async () => {
    const { host, tokenFor, client } = await booker();
    const mine = client(await tokenFor(`/hosts/${host.id}/sessions`, {}));
    const created = await mine("/host/out_of_office", "POST", {
      start_date: "2031-01-06",
      end_date: "2031-01-06",
    });
    const entry = (await created.json()) as { id: string };
    const refused = await mine(`/host/out_of_office/${entry.id}`, "PATCH", {
      existing_bookings: "reassign",
    });
    expect(refused.status).toBe(422);
  });

  test("a host's session moving an entry that moves bookings doesn't start a run", async () => {
    const { host, tokenFor, client, send, eventType } = await booker();
    const mine = client(await tokenFor(`/hosts/${host.id}/sessions`, {}));
    const created = (await (
      await send("/out_of_office", "POST", {
        host: host.id,
        start_date: "2031-03-03",
        end_date: "2031-03-03",
        existing_bookings: "reassign",
      })
    ).json()) as { data: { id: string }[] };
    await send("/bookings", "POST", {
      event_type: eventType.id,
      start: "2031-01-06T10:00:00.000Z",
      attendee: { uid: "p", name: "Sam Lee", email: "sam@example.com", time_zone: "UTC" },
    });
    const moved = await mine(`/host/out_of_office/${created.data[0]?.id}`, "PATCH", {
      start_date: "2031-01-06",
      end_date: "2031-01-06",
    });
    expect(moved.status).toBe(200);
    const runs = (await (await send("/reassignments", "GET")).json()) as { data: unknown[] };
    expect(runs.data).toEqual([]);
  });

  test("a read-only host session can look but not change anything", async () => {
    const { host, tokenFor, client } = await booker();
    const session = client(await tokenFor(`/hosts/${host.id}/sessions`, { read_only: true }));
    expect((await session("/host/out_of_office")).status).toBe(200);
    const refused = await session("/host/out_of_office", "POST", {
      start_date: "2031-01-06",
      end_date: "2031-01-06",
    });
    expect(refused.status).toBe(403);
  });

  test("other kinds of session can't reach a host's time", async () => {
    const { eventType, tokenFor, client } = await booker();
    const session = client(await tokenFor("/booker_sessions", { event_type: eventType.id }));
    expect((await session("/host/out_of_office")).status).toBe(404);
    expect(
      (
        await session("/host/out_of_office", "POST", {
          start_date: "2031-01-06",
          end_date: "2031-01-06",
        })
      ).status,
    ).toBe(404);
  });

  test("a booker sees a message and a return date while the only host is away, never why", async () => {
    const { send, eventType, tokenFor, client } = await booker();
    const now = Date.now();
    await send("/out_of_office", "POST", {
      host: "doctor_1",
      start: new Date(now - 3_600_000).toISOString(),
      end: new Date(now + 3_600_000).toISOString(),
      reason: "sick",
      notes: "Recovering from surgery",
      public_message: "Back this afternoon.",
    });
    const session = client(await tokenFor("/booker_sessions", { event_type: eventType.id }));
    const query = new URLSearchParams(FAR).toString();
    const response = await session(`/slots?${query}`);
    const body = await response.text();
    expect(response.status).toBe(200);
    const parsed = JSON.parse(body) as { away: { until: string; message: string } | null };
    expect(parsed.away?.message).toBe("Back this afternoon.");
    expect(body).not.toContain("sick");
    expect(body).not.toContain("surgery");
  });

  test("a booker gets no notice when nobody's away", async () => {
    const { eventType, tokenFor, client } = await booker();
    const session = client(await tokenFor("/booker_sessions", { event_type: eventType.id }));
    const response = await session(`/slots?${new URLSearchParams(FAR).toString()}`);
    expect(((await response.json()) as { away: unknown }).away).toBeNull();
  });
});
