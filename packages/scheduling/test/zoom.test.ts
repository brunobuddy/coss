import { describe, expect, test } from "bun:test";
import { createHash, createHmac } from "node:crypto";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { secretsKeyRing } from "@coss/webhooks";
import { and, eq } from "drizzle-orm";
import {
  type CalendarDeps,
  cancelBooking,
  completeCalendarAuthorization,
  connectSimulated,
  createBooking,
  createEventType,
  createHost,
  createSchedule,
  getBooking,
  handleZoomDeauthorization,
  listConnections,
  listEventTypeSlots,
  refreshIdleZoomConnections,
  rescheduleBooking,
  runDueCalendarSyncs,
  runDueCalendarWrites,
  type SchedulingEnvironment,
  startCalendarAuthorization,
  updateCalendar,
  verifyZoomEvent,
  zoomUrlValidation,
} from "../src/index.ts";
import { FakeGoogleCalendarApi, FakeZoomApi, testSchedulingDeps } from "../src/testing.ts";

const ms = Date.parse;
const MONDAY = "2031-01-06";
const at = (time: string) => ms(`${MONDAY}T${time}:00Z`);
const NOW = new Date(at("00:00"));
const actor = { kind: "system" } as const;
const attendee = { uid: "p", name: "Sam Lee", email: "sam@example.com", time_zone: "UTC" };
const scopeOf = (env: SchedulingEnvironment) => ({ organizationIds: [env.organizationId] });

function zoomDeps(api: FakeZoomApi, now: () => Date = () => NOW): CalendarDeps {
  return {
    secretsKeys: secretsKeyRing([createHash("sha256").update("zoom test").digest()]),
    apps: {
      google: null,
      microsoft: null,
      zoom: { clientId: "zoom-client", clientSecret: "zoom-secret", webhookSecret: "token" },
    },
    publicUrl: "https://api.example.test",
    fetcher: api.fetch,
    now,
  };
}

async function hostWithHours(env: SchedulingEnvironment) {
  const host = await createHost(env, { name: "Dr. Reyes", time_zone: "UTC" });
  await createSchedule(env, host.id, {
    rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
  });
  return host;
}

async function setUp(mode: "live" | "sandbox" = "live") {
  const tenant = await createTestTenant();
  const environment = mode === "live" ? tenant.production : tenant.development;
  const env: SchedulingEnvironment = {
    organizationId: tenant.organization.id,
    projectId: tenant.project.id,
    environmentId: environment.id,
    mode,
  };
  const host = await hostWithHours(env);
  const eventType = await createEventType(env, {
    title: "Consultation",
    kind: "one_on_one",
    duration_minutes: 30,
    locations: [{ type: "zoom", url: null }],
    hosts: [{ host: host.id, role: "member", weight: 100, schedule: null }],
  } as never);
  return { env, host, eventType };
}

async function connectZoom(env: SchedulingEnvironment, hostId: string, deps: CalendarDeps) {
  const { url } = await startCalendarAuthorization(
    env,
    hostId,
    { provider: "zoom", returnUrl: null },
    deps,
  );
  const state = new URL(url).searchParams.get("state") as string;
  const result = await completeCalendarAuthorization(
    { provider: "zoom", state, code: "code", error: null },
    deps,
  );
  expect(result.outcome).toBe("connected");
  return url;
}

const book = (env: SchedulingEnvironment, eventType: string, time = "09:00", extra = {}) =>
  createBooking(
    env,
    { eventType, startMs: at(time), attendee, ...extra },
    testSchedulingDeps({ now: () => NOW }),
    actor,
  );

const webhookTypes = async (env: SchedulingEnvironment) => {
  const rows = await db
    .select({ type: schema.logEntry.type })
    .from(schema.logEntry)
    .where(eq(schema.logEntry.environmentId, env.environmentId));
  return rows.map((row) => row.type);
};

describe("connecting", () => {
  test("consents without a scope list, and shows no calendars", async () => {
    const { env, host } = await setUp();
    const api = new FakeZoomApi();
    const url = new URL(await connectZoom(env, host.id, zoomDeps(api)));
    expect(url.origin).toBe("https://zoom.us");
    expect(url.searchParams.has("scope")).toBe(false);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const [connection] = await listConnections(env, host.id);
    expect(connection).toMatchObject({ provider: "zoom", account: "zoom_user_1", calendars: [] });
  });

  test("its calendar row can't be turned on, and doesn't touch availability", async () => {
    const { env, host, eventType } = await setUp();
    const api = new FakeZoomApi();
    const before = await listEventTypeSlots(env, {
      eventTypeRef: eventType.id,
      fromMs: at("09:00"),
      toMs: at("10:00"),
      nowMs: NOW.getTime(),
    });
    await connectZoom(env, host.id, zoomDeps(api));
    const after = await listEventTypeSlots(env, {
      eventTypeRef: eventType.id,
      fromMs: at("09:00"),
      toMs: at("10:00"),
      nowMs: NOW.getTime(),
    });
    expect(after).toEqual(before);
    const [row] = await db
      .select()
      .from(schema.schedulingCalendar)
      .where(eq(schema.schedulingCalendar.hostId, host.id));
    expect(row).toMatchObject({ readBusy: false, writeTarget: false });
    await expect(
      updateCalendar(env, host.id, row?.id as string, { read_busy: true }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("meetings", () => {
  test("a booking gets a meeting with nothing personal in it, and its link", async () => {
    const { env, host, eventType } = await setUp();
    const api = new FakeZoomApi();
    const deps = zoomDeps(api);
    await connectZoom(env, host.id, deps);
    const { booking } = await book(env, eventType.id);
    expect(booking.location).toEqual({ type: "zoom", url: null });
    await runDueCalendarWrites(deps, { scope: scopeOf(env) });
    expect(JSON.stringify(api.bodies)).not.toContain("Sam");
    expect(JSON.stringify(api.bodies)).not.toContain("sam@example.com");
    expect(api.bodies[0]).toMatchObject({
      topic: "Appointment",
      start_time: "2031-01-06T09:00:00Z",
      duration: 30,
      settings: { waiting_room: true, auto_recording: "none" },
    });
    const after = await getBooking(env, booking.id, testSchedulingDeps());
    expect(after.location).toMatchObject({ type: "zoom" });
    expect((after.location as { url: string }).url).toStartWith("https://zoom.us/j/");
    expect(await webhookTypes(env)).toContain("scheduling.booking.location_ready");
  });

  test("the host's calendar event gets the link once the meeting exists", async () => {
    const { env, host, eventType } = await setUp();
    const zoom = new FakeZoomApi();
    const google = new FakeGoogleCalendarApi();
    const googleWrites: string[] = [];
    const deps: CalendarDeps = {
      ...zoomDeps(zoom),
      apps: {
        ...zoomDeps(zoom).apps,
        google: { clientId: "google-client", clientSecret: "google-secret" },
      },
      fetcher: (url, init) => {
        if (url.includes("zoom.us")) return zoom.fetch(url, init);
        if (init?.body) googleWrites.push(String(init.body));
        return google.fetch(url, init);
      },
    };
    await connectZoom(env, host.id, deps);
    const { url } = await startCalendarAuthorization(
      env,
      host.id,
      { provider: "google", returnUrl: null },
      deps,
    );
    await completeCalendarAuthorization(
      {
        provider: "google",
        state: new URL(url).searchParams.get("state") as string,
        code: "c",
        error: null,
      },
      deps,
    );
    await runDueCalendarSyncs(deps, { scope: scopeOf(env) });
    const { booking } = await book(env, eventType.id);
    await runDueCalendarWrites(deps, { scope: scopeOf(env) });
    await runDueCalendarWrites(deps, { scope: scopeOf(env) });
    const after = await getBooking(env, booking.id, testSchedulingDeps());
    const link = (after.location as { url: string }).url;
    expect(link).toContain("zoom.us/j/");
    expect(googleWrites.at(-1)).toContain(link.split("?")[0] as string);
  });

  test("whoever's booking can't choose the link", async () => {
    const { env, eventType } = await setUp();
    const { booking } = await book(env, eventType.id, "09:00", {
      location: { type: "zoom", url: "https://evil.example/join" },
    });
    expect(booking.location).toEqual({ type: "zoom", url: null });
  });

  test("a reschedule moves the meeting and keeps its link; a cancel deletes it", async () => {
    const { env, host, eventType } = await setUp();
    const api = new FakeZoomApi();
    const deps = zoomDeps(api);
    await connectZoom(env, host.id, deps);
    const { booking } = await book(env, eventType.id);
    await runDueCalendarWrites(deps, { scope: scopeOf(env) });
    const link = (await getBooking(env, booking.id, testSchedulingDeps())).location;
    await rescheduleBooking(
      env,
      booking.id,
      { startMs: at("11:00") },
      testSchedulingDeps({ now: () => NOW }),
      actor,
    );
    await runDueCalendarWrites(deps, { scope: scopeOf(env) });
    expect([...api.meetings.values()][0]?.start_time).toBe("2031-01-06T11:00:00Z");
    expect(api.meetings.size).toBe(1);
    expect((await getBooking(env, booking.id, testSchedulingDeps())).location).toEqual(link);
    await cancelBooking(env, booking.id, testSchedulingDeps({ now: () => NOW }), actor);
    await runDueCalendarWrites(deps, { scope: scopeOf(env) });
    expect(api.meetings.size).toBe(0);
  });

  test("a retry after a lost answer adopts the meeting instead of making another", async () => {
    const { env, host, eventType } = await setUp();
    const api = new FakeZoomApi();
    const later = () => new Date(NOW.getTime() + 3_600_000);
    await connectZoom(env, host.id, zoomDeps(api));
    const { booking } = await book(env, eventType.id);
    api.loseNextAnswer = true;
    await runDueCalendarWrites(zoomDeps(api), { scope: scopeOf(env) });
    await db
      .update(schema.schedulingCalendarEvent)
      .set({ leaseUntil: null, nextAttemptAt: NOW })
      .where(eq(schema.schedulingCalendarEvent.bookingId, booking.id));
    await runDueCalendarWrites(zoomDeps(api, later), { scope: scopeOf(env) });
    expect(api.meetings.size).toBe(1);
    const after = await getBooking(env, booking.id, testSchedulingDeps());
    expect((after.location as { url: string | null }).url).toContain("zoom.us/j/");
  });

  test("a pool that changes host gets the new host a new meeting", async () => {
    const { env, host } = await setUp();
    const other = await hostWithHours(env);
    const pool = await createEventType(env, {
      title: "Pool",
      kind: "pool",
      duration_minutes: 30,
      locations: [{ type: "zoom", url: null }],
      hosts: [host, other].map((entry) => ({
        host: entry.id,
        role: "member",
        weight: 100,
        schedule: null,
      })),
    } as never);
    const api = new FakeZoomApi();
    const deps = zoomDeps(api);
    await connectZoom(env, host.id, deps);
    await connectZoom(env, other.id, deps);
    const { booking } = await book(env, pool.id);
    await runDueCalendarWrites(deps, { scope: scopeOf(env) });
    const before = await getBooking(env, booking.id, testSchedulingDeps());
    const firstLink = (before.location as { url: string }).url;
    expect(firstLink).toContain("zoom.us/j/");
    const next = before.hosts[0] === host.id ? other.id : host.id;
    await rescheduleBooking(
      env,
      booking.id,
      { startMs: at("11:00"), host: next },
      testSchedulingDeps({ now: () => NOW }),
      actor,
    );
    expect((await getBooking(env, booking.id, testSchedulingDeps())).location).toEqual({
      type: "zoom",
      url: null,
    });
    await runDueCalendarWrites(deps, { scope: scopeOf(env) });
    const after = await getBooking(env, booking.id, testSchedulingDeps());
    expect(after.hosts).toEqual([next]);
    expect((after.location as { url: string }).url).toContain("zoom.us/j/");
    expect((after.location as { url: string }).url).not.toBe(firstLink);
    expect(api.meetings.size).toBe(1);
  });

  test("with no Zoom connected the booking stands, and the customer is told", async () => {
    const { env, eventType } = await setUp();
    const { booking } = await book(env, eventType.id);
    expect(booking.status).toBe("confirmed");
    expect(await webhookTypes(env)).toContain("scheduling.booking.calendar_write_failed");
  });

  test("a sandbox's simulated calendar makes a pretend link", async () => {
    const { env, host, eventType } = await setUp("sandbox");
    const api = new FakeZoomApi();
    await connectSimulated(env, host.id, { now: () => NOW });
    const { booking } = await book(env, eventType.id);
    await runDueCalendarWrites(zoomDeps(api), { scope: scopeOf(env) });
    const after = await getBooking(env, booking.id, testSchedulingDeps());
    expect((after.location as { url: string }).url).toStartWith("https://zoom.us/j/sim-");
    expect(await webhookTypes(env)).not.toContain("scheduling.booking.calendar_write_failed");
  });

  test("a group event type refuses Zoom", async () => {
    const { env, host } = await setUp();
    await expect(
      createEventType(env, {
        title: "Class",
        kind: "group",
        capacity: 5,
        duration_minutes: 30,
        locations: [{ type: "zoom", url: null }],
        hosts: [{ host: host.id, role: "member", weight: 100, schedule: null }],
      } as never),
    ).rejects.toMatchObject({ code: "invalid_event_type", param: "locations" });
  });
});

describe("losing access", () => {
  test("a refused token asks the host to reconnect, and they're still offered", async () => {
    const { env, host, eventType } = await setUp();
    const api = new FakeZoomApi();
    const deps = zoomDeps(api);
    await connectZoom(env, host.id, deps);
    const { booking } = await book(env, eventType.id);
    api.failNext = { path: /meetings/, status: 401 };
    await runDueCalendarWrites(deps, { scope: scopeOf(env) });
    const [connection] = await listConnections(env, host.id);
    expect(connection?.status).toBe("needs_reauth");
    const notifications = await db
      .select({ kind: schema.schedulingNotification.kind })
      .from(schema.schedulingNotification)
      .where(eq(schema.schedulingNotification.hostId, host.id));
    expect(notifications.map((row) => row.kind)).toContain("zoom_needs_reauth");
    expect((await getBooking(env, booking.id, testSchedulingDeps())).status).toBe("confirmed");
    const slots = await listEventTypeSlots(env, {
      eventTypeRef: eventType.id,
      fromMs: at("10:00"),
      toMs: at("11:00"),
      nowMs: NOW.getTime(),
    });
    expect(slots.length).toBeGreaterThan(0);
  });

  test("removing the app in Zoom removes that user's connections", async () => {
    const { env, host } = await setUp();
    const api = new FakeZoomApi();
    const deps = zoomDeps(api);
    await connectZoom(env, host.id, deps);
    expect(await handleZoomDeauthorization("someone_else", deps)).toBe(0);
    expect(await listConnections(env, host.id)).toHaveLength(1);
    expect(await handleZoomDeauthorization("zoom_user_1", deps)).toBeGreaterThanOrEqual(1);
    expect(await listConnections(env, host.id)).toHaveLength(0);
  });

  test("a refresh token another worker just used isn't a lost connection", async () => {
    const { env, host, eventType } = await setUp();
    const api = new FakeZoomApi();
    const later = () => new Date(NOW.getTime() + 2 * 3_600_000);
    await connectZoom(env, host.id, zoomDeps(api));
    const [stale] = await db
      .select()
      .from(schema.schedulingCalendarConnection)
      .where(eq(schema.schedulingCalendarConnection.hostId, host.id));
    await book(env, eventType.id);
    await runDueCalendarWrites(zoomDeps(api, later), { scope: scopeOf(env) });
    const { clientFor } = await import("../src/index.ts");
    await clientFor(stale as NonNullable<typeof stale>, zoomDeps(api, later));
    const [connection] = await listConnections(env, host.id);
    expect(connection?.status).toBe("active");
  });

  test("a connection nobody's used is refreshed before its token expires", async () => {
    const { env, host } = await setUp();
    const api = new FakeZoomApi();
    await connectZoom(
      env,
      host.id,
      zoomDeps(api, () => new Date()),
    );
    const stored = () =>
      db
        .select({ updatedAt: schema.schedulingCalendarConnection.updatedAt })
        .from(schema.schedulingCalendarConnection)
        .where(
          and(
            eq(schema.schedulingCalendarConnection.hostId, host.id),
            eq(schema.schedulingCalendarConnection.provider, "zoom"),
          ),
        );
    const scope = scopeOf(env);
    expect(
      await refreshIdleZoomConnections(
        zoomDeps(api, () => new Date()),
        { scope },
      ),
    ).toBe(0);
    const inAMonth = () => new Date(Date.now() + 31 * 24 * 3_600_000);
    expect(await refreshIdleZoomConnections(zoomDeps(api, inAMonth), { scope })).toBe(1);
    const [row] = await stored();
    expect(Date.now() - (row?.updatedAt.getTime() ?? 0)).toBeLessThan(60_000);
    expect(api.refreshToken).toBe("zoom-refresh-2");
  });
});

describe("Zoom's events", () => {
  const signed = (body: string, timestamp: string, secret = "token") =>
    `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`;
  const nowMs = 1_800_000_000_000;
  const timestamp = String(nowMs / 1000);

  test("only a fresh signature with the secret token passes", () => {
    const body = '{"event":"app_deauthorized"}';
    const check = (signature: string, at = timestamp, text = body) =>
      verifyZoomEvent({ secret: "token", timestamp: at, signature, body: text, nowMs });
    expect(check(signed(body, timestamp))).toBe(true);
    expect(check(signed(body, timestamp, "other"))).toBe(false);
    expect(check(signed(body, timestamp), timestamp, `${body} `)).toBe(false);
    const old = String(nowMs / 1000 - 600);
    expect(check(signed(body, old), old)).toBe(false);
  });

  test("the endpoint check answers as Zoom specifies", () => {
    expect(zoomUrlValidation("plain", "token")).toEqual({
      plainToken: "plain",
      encryptedToken: createHmac("sha256", "token").update("plain").digest("hex"),
    });
  });
});
