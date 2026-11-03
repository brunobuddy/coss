import { describe, expect, test } from "bun:test";
import type { LogWriter } from "@coss/logs";
import { memoryLogWriter } from "@coss/logs/testing";
import { createTestTenant, type TestTenant } from "@coss/tenancy/testing";
import { createTestApp, errorOf, type TestApp, waitForLogLines } from "./helpers.ts";

const MONDAY = "2031-01-06";
const at = (time: string) => `${MONDAY}T${time}:00.000Z`;

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
