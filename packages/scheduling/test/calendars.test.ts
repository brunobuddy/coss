import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { secretsKeyRing } from "@coss/webhooks";
import { eq, sql } from "drizzle-orm";
import {
  caldavCalendarClient,
  type DavRequest,
  pinnedDavTransport,
} from "../src/calendar/caldav.ts";
import { googleCalendarClient } from "../src/calendar/google.ts";
import { busyFromIcs } from "../src/calendar/ical.ts";
import { microsoftCalendarClient } from "../src/calendar/microsoft.ts";
import {
  buildIcs,
  type CalendarDeps,
  cancelBooking,
  checkHostEditedEvents,
  completeCalendarAuthorization,
  connectSimulated,
  createBooking,
  createEventType,
  createHost,
  createSchedule,
  disconnectCalendar,
  flagExternalConflicts,
  getBooking,
  handleCalendarPush,
  listConnections,
  listEventTypeSlots,
  renewDueCalendarChannels,
  rescheduleBooking,
  runDueCalendarSyncs,
  runDueCalendarWrites,
  type SchedulingEnvironment,
  SchedulingError,
  setSimulatedBusy,
  startCalendarAuthorization,
  updateCalendar,
} from "../src/index.ts";
import { FakeGoogleCalendarApi, testSchedulingDeps } from "../src/testing.ts";

const ms = Date.parse;
const MONDAY = "2031-01-06";
const at = (time: string) => ms(`${MONDAY}T${time}:00Z`);
const NOW = new Date(at("00:00"));
const scope = (env: SchedulingEnvironment) => ({ organizationIds: [env.organizationId] });
const actor = { kind: "system" } as const;
const attendee = { uid: "p", time_zone: "UTC" };

async function setUp(mode: "live" | "sandbox" = "sandbox") {
  const tenant = await createTestTenant();
  const environment = mode === "live" ? tenant.production : tenant.development;
  const env: SchedulingEnvironment = {
    organizationId: tenant.organization.id,
    projectId: tenant.project.id,
    environmentId: environment.id,
    mode,
  };
  const host = await createHost(env, { name: "Dr. Reyes", time_zone: "UTC" });
  await createSchedule(env, host.id, {
    rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
  });
  const eventType = await createEventType(env, {
    title: "Consultation",
    kind: "one_on_one",
    duration_minutes: 30,
    hosts: [{ host: host.id, role: "member", weight: 100, schedule: null }],
  } as never);
  return { env, host, eventType };
}

function calendarDeps(api: FakeGoogleCalendarApi, now: () => Date = () => NOW): CalendarDeps {
  return {
    secretsKeys: secretsKeyRing([createHash("sha256").update("calendar test").digest()]),
    apps: {
      google: { clientId: "google-client", clientSecret: "google-secret" },
      microsoft: { clientId: "ms-client", clientSecret: "ms-secret" },
    },
    publicUrl: "https://api.example.test",
    fetcher: api.fetch,
    now,
  };
}

async function connectGoogle(
  env: SchedulingEnvironment,
  hostId: string,
  deps: CalendarDeps,
): Promise<void> {
  const { url } = await startCalendarAuthorization(
    env,
    hostId,
    { provider: "google", returnUrl: null },
    deps,
  );
  const state = new URL(url).searchParams.get("state") as string;
  const result = await completeCalendarAuthorization(
    { provider: "google", state, code: "code", error: null },
    deps,
  );
  expect(result.outcome).toBe("connected");
}

async function primaryCalendar(hostId: string) {
  const rows = await db
    .select()
    .from(schema.schedulingCalendar)
    .where(eq(schema.schedulingCalendar.hostId, hostId));
  return rows.find((row) => row.readBusy);
}

const slotStarts = (env: SchedulingEnvironment, eventType: string) =>
  listEventTypeSlots(env, {
    eventTypeRef: eventType,
    fromMs: at("09:00"),
    toMs: at("10:30"),
    nowMs: NOW.getTime(),
  }).then((slots) => slots.map((slot) => new Date(slot.startMs).toISOString().slice(11, 16)));

async function code(run: Promise<unknown>): Promise<string> {
  try {
    await run;
    return "ok";
  } catch (error) {
    if (error instanceof SchedulingError) return error.code;
    throw error;
  }
}

describe("connecting", () => {
  test("the consent URL asks only for least-privilege scopes, with PKCE", async () => {
    const { env, host } = await setUp();
    const deps = calendarDeps(new FakeGoogleCalendarApi());
    const { url } = await startCalendarAuthorization(
      env,
      host.id,
      { provider: "google", returnUrl: null },
      deps,
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get("scope")?.split(" ").sort()).toEqual([
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
      "https://www.googleapis.com/auth/calendar.events.freebusy",
      "https://www.googleapis.com/auth/calendar.events.owned",
    ]);
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://api.example.test/scheduling/oauth/google/callback",
    );
  });

  test("a state works once, and holds no token", async () => {
    const { env, host } = await setUp();
    const deps = calendarDeps(new FakeGoogleCalendarApi());
    const { url } = await startCalendarAuthorization(
      env,
      host.id,
      { provider: "google", returnUrl: "https://app.example.com/done" },
      deps,
    );
    const state = new URL(url).searchParams.get("state") as string;
    const [row] = await db
      .select()
      .from(schema.schedulingOauthState)
      .where(eq(schema.schedulingOauthState.hostId, host.id));
    expect(row?.stateHash).not.toBe(state);
    expect(row?.encryptedCodeVerifier).not.toContain(
      new URL(url).searchParams.get("code_challenge") as string,
    );
    const first = await completeCalendarAuthorization(
      { provider: "google", state, code: "c", error: null },
      deps,
    );
    expect(first).toMatchObject({
      outcome: "connected",
      returnUrl: "https://app.example.com/done",
    });
    const second = await completeCalendarAuthorization(
      { provider: "google", state, code: "c", error: null },
      deps,
    );
    expect(second.outcome).toBe("invalid");
  });

  test("an expired state or a refusal connects nothing", async () => {
    const { env, host } = await setUp();
    const deps = calendarDeps(new FakeGoogleCalendarApi());
    const later = calendarDeps(
      new FakeGoogleCalendarApi(),
      () => new Date(NOW.getTime() + 11 * 60_000),
    );
    const a = await startCalendarAuthorization(
      env,
      host.id,
      { provider: "google", returnUrl: null },
      deps,
    );
    expect(
      (
        await completeCalendarAuthorization(
          {
            provider: "google",
            state: new URL(a.url).searchParams.get("state") as string,
            code: "c",
            error: null,
          },
          later,
        )
      ).outcome,
    ).toBe("invalid");
    const b = await startCalendarAuthorization(
      env,
      host.id,
      { provider: "google", returnUrl: null },
      deps,
    );
    expect(
      (
        await completeCalendarAuthorization(
          {
            provider: "google",
            state: new URL(b.url).searchParams.get("state") as string,
            code: null,
            error: "access_denied",
          },
          deps,
        )
      ).outcome,
    ).toBe("denied");
    expect(await listConnections(env, host.id)).toEqual([]);
  });

  test("the primary calendar is read and written; others wait to be chosen", async () => {
    const { env, host } = await setUp();
    const deps = calendarDeps(new FakeGoogleCalendarApi());
    await connectGoogle(env, host.id, deps);
    const [connection] = await listConnections(env, host.id);
    expect(connection?.account).toBe("doctor@example.com");
    const byId = new Map(connection?.calendars.map((c) => [c.external_id, c]));
    expect(byId.get("doctor@example.com")).toMatchObject({ read_busy: true, write_target: true });
    expect(byId.get("team@example.com")).toMatchObject({ read_busy: false, write_target: false });
  });

  test("credentials are encrypted at rest", async () => {
    const { env, host } = await setUp();
    const deps = calendarDeps(new FakeGoogleCalendarApi());
    await connectGoogle(env, host.id, deps);
    const [row] = await db
      .select()
      .from(schema.schedulingCalendarConnection)
      .where(eq(schema.schedulingCalendarConnection.hostId, host.id));
    expect(row?.encryptedCredentials).not.toContain("refresh");
    expect(row?.encryptedCredentials?.startsWith("v2:")).toBe(true);
  });
});

describe("availability follows the calendar", () => {
  async function synced() {
    const setup = await setUp();
    const api = new FakeGoogleCalendarApi();
    const deps = calendarDeps(api);
    await connectGoogle(setup.env, setup.host.id, deps);
    await runDueCalendarSyncs(deps, { scope: scope(setup.env) });
    return { ...setup, api, deps };
  }

  test("an unsynced calendar hides the host until it's read", async () => {
    const { env, host, eventType } = await setUp();
    const deps = calendarDeps(new FakeGoogleCalendarApi());
    await connectGoogle(env, host.id, deps);
    expect(await slotStarts(env, eventType.id)).toEqual([]);
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    expect(await slotStarts(env, eventType.id)).toEqual(["09:00", "09:30", "10:00"]);
  });

  test("an external event removes the slot after a push", async () => {
    const { env, eventType, api, deps, host } = await synced();
    await renewDueCalendarChannels(deps, { scope: scope(env) });
    const calendar = await primaryCalendar(host.id);
    expect(calendar?.channelId).toBeTruthy();
    api.busy.set("doctor@example.com", [
      { start: new Date(at("09:00")).toISOString(), end: new Date(at("09:30")).toISOString() },
    ]);
    // Nothing yet: the read happens when the provider says it changed.
    expect(await slotStarts(env, eventType.id)).toContain("09:00");
    const bad = await handleCalendarPush({
      channelId: calendar?.channelId as string,
      token: "wrong",
    });
    expect(bad).toBe("invalid");
    const unknown = await handleCalendarPush({ channelId: "nope", token: "x" });
    expect(unknown).toBe("unknown");
    await db
      .update(schema.schedulingCalendar)
      .set({ dirtyAt: NOW, nextSyncAt: NOW })
      .where(eq(schema.schedulingCalendar.id, calendar?.id as string));
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    expect(await slotStarts(env, eventType.id)).toEqual(["09:30", "10:00"]);
  });

  test("a new channel re-reads the calendar, so nothing before it is missed", async () => {
    const { env, eventType, api, deps } = await synced();
    api.busy.set("doctor@example.com", [
      { start: new Date(at("09:00")).toISOString(), end: new Date(at("09:30")).toISOString() },
    ]);
    await renewDueCalendarChannels(deps, { scope: scope(env) });
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    expect(await slotStarts(env, eventType.id)).toEqual(["09:30", "10:00"]);
  });

  test("two workers renewing together create one channel", async () => {
    const { env, api, deps } = await synced();
    api.delayMs = 100;
    await Promise.all([
      renewDueCalendarChannels(deps, { scope: scope(env) }),
      renewDueCalendarChannels(deps, { scope: scope(env) }),
    ]);
    expect(api.requests.filter((request) => request.endsWith("/events/watch"))).toHaveLength(1);
  });

  test("only busy times are stored: no titles, attendees or event ids", async () => {
    const { host, api, deps, env } = await synced();
    api.busy.set("doctor@example.com", [
      { start: new Date(at("09:00")).toISOString(), end: new Date(at("09:30")).toISOString() },
    ]);
    await db
      .update(schema.schedulingCalendar)
      .set({ nextSyncAt: NOW })
      .where(eq(schema.schedulingCalendar.hostId, host.id));
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    const [row] = await db
      .select()
      .from(schema.schedulingBusyInterval)
      .where(eq(schema.schedulingBusyInterval.hostId, host.id));
    expect(Object.keys(row as object).sort()).toEqual([
      "calendarId",
      "endAt",
      "hostId",
      "id",
      "organizationId",
      "startAt",
    ]);
    expect(
      api.requests.some((request) => /events\?/.test(request) && request.startsWith("GET")),
    ).toBe(false);
  });

  test("an errored calendar never reads as free: old busy times stay, and it goes stale", async () => {
    const { env, eventType, host, api, deps } = await synced();
    api.busy.set("doctor@example.com", [
      { start: new Date(at("09:00")).toISOString(), end: new Date(at("09:30")).toISOString() },
    ]);
    await db
      .update(schema.schedulingCalendar)
      .set({ nextSyncAt: NOW })
      .where(eq(schema.schedulingCalendar.hostId, host.id));
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    expect(await slotStarts(env, eventType.id)).toEqual(["09:30", "10:00"]);
    api.erroredCalendars.add("doctor@example.com");
    await db
      .update(schema.schedulingCalendar)
      .set({ nextSyncAt: NOW })
      .where(eq(schema.schedulingCalendar.hostId, host.id));
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    expect(await slotStarts(env, eventType.id)).toEqual(["09:30", "10:00"]);
    const calendar = await primaryCalendar(host.id);
    expect(calendar?.syncFailures).toBe(1);
    await db
      .update(schema.schedulingCalendar)
      .set({ verifiedAt: new Date(NOW.getTime() - 3 * 3_600_000) })
      .where(eq(schema.schedulingCalendar.hostId, host.id));
    expect(await slotStarts(env, eventType.id)).toEqual([]);
  });

  test("an empty 200 from the provider isn't believed", async () => {
    const { host, env, api, deps } = await synced();
    api.emptyFreeBusy = true;
    await db
      .update(schema.schedulingCalendar)
      .set({ nextSyncAt: NOW })
      .where(eq(schema.schedulingCalendar.hostId, host.id));
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    const calendar = await primaryCalendar(host.id);
    expect(calendar?.syncFailures).toBe(1);
  });

  test("a revoked token hides the host at once, alerts once, and last_known keeps them offered", async () => {
    const { env, eventType, host, api } = await synced();
    // The stored token expired, and refreshing is refused.
    const expired = calendarDeps(api, () => new Date(NOW.getTime() + 2 * 3_600_000));
    api.refreshFails = true;
    await db
      .update(schema.schedulingCalendar)
      .set({ nextSyncAt: NOW })
      .where(eq(schema.schedulingCalendar.hostId, host.id));
    await runDueCalendarSyncs(expired, { scope: scope(env) });
    await db
      .update(schema.schedulingCalendar)
      .set({ nextSyncAt: NOW })
      .where(eq(schema.schedulingCalendar.hostId, host.id));
    await runDueCalendarSyncs(expired, { scope: scope(env) });
    const [connection] = await listConnections(env, host.id);
    expect(connection?.status).toBe("needs_reauth");
    expect(await slotStarts(env, eventType.id)).toEqual([]);
    const notes = await db
      .select()
      .from(schema.schedulingNotification)
      .where(eq(schema.schedulingNotification.hostId, host.id));
    expect(notes.map((note) => note.kind)).toEqual(["calendar_needs_reauth"]);
    const { rows } = await db.execute(
      sql`select count(*)::int n from log_entry where environment_id = ${env.environmentId} and type = 'scheduling.calendar.needs_reauth'`,
    );
    expect((rows[0] as { n: number }).n).toBe(1);
    await db.insert(schema.schedulingSettings).values({
      organizationId: env.organizationId,
      projectId: env.projectId,
      environmentId: env.environmentId,
      calendarFailureMode: "last_known",
    });
    expect(await slotStarts(env, eventType.id)).toEqual(["09:00", "09:30", "10:00"]);
  });

  test("the live check catches an event made since the last sync", async () => {
    const { env, eventType, api, deps } = await synced();
    api.busy.set("doctor@example.com", [
      { start: new Date(at("09:00")).toISOString(), end: new Date(at("09:30")).toISOString() },
    ]);
    const withLive = testSchedulingDeps({ calendars: deps, now: () => NOW });
    expect(
      await code(
        createBooking(
          env,
          { eventType: eventType.id, startMs: at("09:00"), attendee },
          withLive,
          actor,
        ),
      ),
    ).toBe("slot_unavailable");
    await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:30"), attendee },
      withLive,
      actor,
    );
  });

  test("a slow provider doesn't stop a booking: synced data has to do", async () => {
    const { env, eventType, api, deps } = await synced();
    api.delayMs = 3000;
    const withLive = testSchedulingDeps({ calendars: deps, now: () => NOW });
    const started = performance.now();
    await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee },
      withLive,
      actor,
    );
    expect(performance.now() - started).toBeLessThan(2800);
    api.delayMs = 0;
  }, 8000);

  test("a late external event flags the booking, and never cancels it", async () => {
    const { env, eventType, host, api, deps } = await synced();
    const plain = testSchedulingDeps({ now: () => NOW });
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee },
      plain,
      actor,
    );
    api.busy.set("doctor@example.com", [
      { start: new Date(at("09:00")).toISOString(), end: new Date(at("09:15")).toISOString() },
    ]);
    await db
      .update(schema.schedulingCalendar)
      .set({ nextSyncAt: NOW })
      .where(eq(schema.schedulingCalendar.hostId, host.id));
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    const after = await getBooking(env, booking.id, plain);
    expect(after.status).toBe("confirmed");
    expect(after.external_conflict_at).not.toBeNull();
    // Once only.
    expect(await flagExternalConflicts(host.id, env.organizationId, NOW)).toBe(0);
  });

  test("a booking's own event, mid-write, isn't mistaken for a conflict", async () => {
    const { env, eventType, host, api, deps } = await synced();
    const plain = testSchedulingDeps({ now: () => NOW });
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee },
      plain,
      actor,
    );
    api.busy.set("doctor@example.com", [
      { start: new Date(at("09:00")).toISOString(), end: new Date(at("09:30")).toISOString() },
    ]);
    await db
      .update(schema.schedulingCalendar)
      .set({ nextSyncAt: NOW })
      .where(eq(schema.schedulingCalendar.hostId, host.id));
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    expect((await getBooking(env, booking.id, plain)).external_conflict_at).toBeNull();
  });
});

describe("writing to calendars", () => {
  async function writable() {
    const setup = await setUp();
    const api = new FakeGoogleCalendarApi();
    const deps = calendarDeps(api);
    await connectGoogle(setup.env, setup.host.id, deps);
    await runDueCalendarSyncs(deps, { scope: scope(setup.env) });
    const plain = testSchedulingDeps({ now: () => NOW });
    return { ...setup, api, deps, plain };
  }

  const book = (w: Awaited<ReturnType<typeof writable>>, time = "09:00") =>
    createBooking(
      w.env,
      { eventType: w.eventType.id, startMs: at(time), attendee },
      w.plain,
      actor,
    );

  test("the event says only 'Appointment', privately", async () => {
    const w = await writable();
    await book(w);
    await runDueCalendarWrites(w.deps, { scope: scope(w.env) });
    const [event] = [...w.api.events.values()];
    expect(event?.title).toBe("Appointment");
    expect(event?.startMs).toBe(at("09:00"));
  });

  test("our own event doesn't count as busy against itself", async () => {
    const w = await writable();
    const { booking } = await book(w);
    await runDueCalendarWrites(w.deps, { scope: scope(w.env) });
    await db
      .update(schema.schedulingCalendar)
      .set({ nextSyncAt: NOW })
      .where(eq(schema.schedulingCalendar.hostId, w.host.id));
    await runDueCalendarSyncs(w.deps, { scope: scope(w.env) });
    // The provider echoes it back as busy, but it's not an external conflict...
    expect((await getBooking(w.env, booking.id, w.plain)).external_conflict_at).toBeNull();
    // ...and rescheduling onto an overlapping time isn't blocked by it.
    const moved = await rescheduleBooking(
      w.env,
      booking.id,
      { startMs: at("09:30") },
      w.plain,
      actor,
    );
    expect(moved.status).toBe("confirmed");
  });

  test("create, move and cancel in quick succession converge on the latest", async () => {
    const w = await writable();
    const { booking } = await book(w);
    await rescheduleBooking(w.env, booking.id, { startMs: at("10:00") }, w.plain, actor);
    await cancelBooking(w.env, booking.id, w.plain, actor);
    await runDueCalendarWrites(w.deps, { scope: scope(w.env) });
    expect([...w.api.events.values()].filter((event) => !event.deleted)).toEqual([]);
    const [row] = await db
      .select()
      .from(schema.schedulingCalendarEvent)
      .where(eq(schema.schedulingCalendarEvent.bookingId, booking.id));
    expect(row?.appliedVersion).toBe(row?.desiredVersion as number);
  });

  test("a move updates the same event", async () => {
    const w = await writable();
    const { booking } = await book(w);
    await runDueCalendarWrites(w.deps, { scope: scope(w.env) });
    await rescheduleBooking(w.env, booking.id, { startMs: at("10:00") }, w.plain, actor);
    await runDueCalendarWrites(w.deps, { scope: scope(w.env) });
    expect(w.api.events.size).toBe(1);
    expect([...w.api.events.values()][0]?.startMs).toBe(at("10:00"));
  });

  test("a lost answer doesn't make a second event", async () => {
    const w = await writable();
    await book(w);
    w.api.loseNextAnswer = true;
    await runDueCalendarWrites(w.deps, { scope: scope(w.env) });
    expect(w.api.events.size).toBe(1);
    await db
      .update(schema.schedulingCalendarEvent)
      .set({ nextAttemptAt: NOW })
      .where(eq(schema.schedulingCalendarEvent.hostId, w.host.id));
    await runDueCalendarWrites(w.deps, { scope: scope(w.env) });
    expect(w.api.events.size).toBe(1);
    const [row] = await db
      .select()
      .from(schema.schedulingCalendarEvent)
      .where(eq(schema.schedulingCalendarEvent.hostId, w.host.id));
    expect(row?.providerEventId).toBeTruthy();
    expect(row?.appliedVersion).toBe(row?.desiredVersion as number);
  });

  test("a permanent failure leaves the booking valid and tells the customer", async () => {
    const w = await writable();
    const { booking } = await book(w);
    w.api.failNext = {
      path: /\/events$/,
      status: 403,
      body: { error: { errors: [{ reason: "forbidden" }] } },
    };
    await runDueCalendarWrites(w.deps, { scope: scope(w.env) });
    expect((await getBooking(w.env, booking.id, w.plain)).status).toBe("confirmed");
    const { rows } = await db.execute(
      sql`select count(*)::int n from log_entry where environment_id = ${w.env.environmentId} and type = 'scheduling.booking.calendar_write_failed'`,
    );
    expect((rows[0] as { n: number }).n).toBe(1);
  });

  test("a Meet link comes back onto the booking", async () => {
    const setup = await setUp();
    const api = new FakeGoogleCalendarApi();
    const deps = calendarDeps(api);
    await connectGoogle(setup.env, setup.host.id, deps);
    await runDueCalendarSyncs(deps, { scope: scope(setup.env) });
    const meet = await createEventType(setup.env, {
      title: "Video",
      kind: "one_on_one",
      duration_minutes: 30,
      locations: [{ type: "google_meet" }],
      hosts: [{ host: setup.host.id, role: "member", weight: 100, schedule: null }],
    } as never);
    const plain = testSchedulingDeps({ now: () => NOW });
    const { booking } = await createBooking(
      setup.env,
      { eventType: meet.id, startMs: at("09:00"), attendee },
      plain,
      actor,
    );
    await runDueCalendarWrites(deps, { scope: scope(setup.env) });
    expect((await getBooking(setup.env, booking.id, plain)).location).toEqual({
      type: "link",
      url: "https://meet.google.com/abc-defg-hij",
    });
  });

  test("a host deleting the event is recorded, and the booking stays", async () => {
    const w = await writable();
    const { booking } = await book(w);
    await runDueCalendarWrites(w.deps, { scope: scope(w.env) });
    const [event] = [...w.api.events.values()];
    if (event) event.deleted = true;
    await db
      .update(schema.schedulingCalendarEvent)
      .set({ updatedAt: new Date(NOW.getTime() - 7_200_000) })
      .where(eq(schema.schedulingCalendarEvent.hostId, w.host.id));
    await checkHostEditedEvents(w.deps, { scope: scope(w.env) });
    const after = await getBooking(w.env, booking.id, w.plain);
    expect(after.status).toBe("confirmed");
    expect(after.external_conflict_at).not.toBeNull();
    const [row] = await db
      .select()
      .from(schema.schedulingCalendarEvent)
      .where(eq(schema.schedulingCalendarEvent.hostId, w.host.id));
    expect(row?.externalState).toBe("deleted");
  });

  test("disconnecting removes busy times, stops channels and revokes access", async () => {
    const w = await writable();
    await renewDueCalendarChannels(w.deps, { scope: scope(w.env) });
    const [connection] = await listConnections(w.env, w.host.id);
    await disconnectCalendar(w.env, w.host.id, connection?.id as string, w.deps);
    expect(await listConnections(w.env, w.host.id)).toEqual([]);
    expect(w.api.requests).toContain("POST /revoke");
    expect(w.api.requests.some((request) => request.endsWith("/channels/stop"))).toBe(true);
    expect(await slotStarts(w.env, w.eventType.id)).toEqual(["09:00", "09:30", "10:00"]);
  });

  test("choosing another calendar to read means reading it before trusting it", async () => {
    const w = await writable();
    const [connection] = await listConnections(w.env, w.host.id);
    const team = connection?.calendars.find((c) => c.external_id === "team@example.com");
    await updateCalendar(w.env, w.host.id, team?.id as string, { read_busy: true });
    expect(await slotStarts(w.env, w.eventType.id)).toEqual([]);
    await runDueCalendarSyncs(w.deps, { scope: scope(w.env) });
    expect(await slotStarts(w.env, w.eventType.id)).toEqual(["09:00", "09:30", "10:00"]);
  });
});

describe("the fetch fence", () => {
  test("a slower, older fetch can't overwrite a newer one", async () => {
    const { env, host, eventType } = await setUp();
    const api = new FakeGoogleCalendarApi();
    const deps = calendarDeps(api);
    await connectGoogle(env, host.id, deps);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow: CalendarDeps = {
      ...deps,
      fetcher: async (url, init) => {
        const response = await api.fetch(url, init);
        if (url.includes("freeBusy")) await gate;
        return response;
      },
    };
    const older = runDueCalendarSyncs(slow, { scope: scope(env) });
    await new Promise((resolve) => setTimeout(resolve, 30));
    // Meanwhile: something gets booked outside, and a newer read happens.
    api.busy.set("doctor@example.com", [
      { start: new Date(at("09:00")).toISOString(), end: new Date(at("09:30")).toISOString() },
    ]);
    const later = new Date(NOW.getTime() + 60_000);
    await db
      .update(schema.schedulingCalendar)
      .set({ leaseUntil: null, nextSyncAt: NOW })
      .where(eq(schema.schedulingCalendar.hostId, host.id));
    await runDueCalendarSyncs(
      calendarDeps(api, () => later),
      { scope: scope(env) },
    );
    release();
    await older;
    expect((await slotStarts(env, eventType.id)).includes("09:00")).toBe(false);
  });
});

describe("simulated calendars (sandbox)", () => {
  test("busy times are set directly, and live environments refuse it", async () => {
    const { env, host, eventType } = await setUp();
    await connectSimulated(env, host.id, { now: () => NOW });
    expect(await slotStarts(env, eventType.id)).toEqual(["09:00", "09:30", "10:00"]);
    await setSimulatedBusy(env, host.id, [{ startMs: at("09:00"), endMs: at("09:30") }]);
    expect(await slotStarts(env, eventType.id)).toEqual(["09:30", "10:00"]);
    const live = await setUp("live");
    expect(await code(connectSimulated(live.env, live.host.id, { now: () => NOW }))).toBe(
      "calendar_unavailable",
    );
  });
});

test("a simulated calendar doesn't go stale, though nothing syncs it", async () => {
  const { env, host, eventType } = await setUp();
  await connectSimulated(env, host.id, { now: () => NOW });
  const month = 30 * 86_400_000;
  const slots = await listEventTypeSlots(env, {
    eventTypeRef: eventType.id,
    fromMs: at("09:00") + month,
    toMs: at("10:00") + month,
    nowMs: NOW.getTime() + month,
  });
  expect(slots.length).toBe(2);
});

test("a host's calendar is read far enough ahead for a 52-week series", async () => {
  const { env, host, eventType } = await setUp();
  const deps = calendarDeps(new FakeGoogleCalendarApi());
  await connectGoogle(env, host.id, deps);
  await runDueCalendarSyncs(deps, { scope: scope(env) });
  const year = at("09:00") + 364 * 86_400_000;
  const slots = await listEventTypeSlots(env, {
    eventTypeRef: eventType.id,
    fromMs: year,
    toMs: year + 3_600_000,
    nowMs: NOW.getTime(),
  });
  expect(slots.length).toBe(2);
});

describe("microsoft", () => {
  const graph =
    (handler: (url: string, init?: RequestInit) => unknown) =>
    async (url: string, init?: RequestInit) => {
      const body = handler(url, init);
      if (body instanceof Response) return body;
      return new Response(JSON.stringify(body), { status: 200 });
    };

  test("asks Graph only for times, and a failed calendar is left out", async () => {
    let asked = "";
    const client = microsoftCalendarClient({
      accessToken: "t",
      fetcher: graph((_url, init) => {
        const body = JSON.parse(String(init?.body)) as { requests: { url: string }[] };
        asked = body.requests[0]?.url ?? "";
        return {
          responses: [
            {
              id: "0",
              status: 200,
              body: {
                value: [
                  {
                    showAs: "busy",
                    start: { dateTime: "2031-01-06T09:00:00.0000000", timeZone: "UTC" },
                    end: { dateTime: "2031-01-06T09:30:00.0000000", timeZone: "UTC" },
                  },
                  {
                    showAs: "free",
                    start: { dateTime: "2031-01-06T10:00:00.0000000", timeZone: "UTC" },
                    end: { dateTime: "2031-01-06T11:00:00.0000000", timeZone: "UTC" },
                  },
                  {
                    showAs: "busy",
                    isCancelled: true,
                    start: { dateTime: "2031-01-06T12:00:00.0000000", timeZone: "UTC" },
                    end: { dateTime: "2031-01-06T13:00:00.0000000", timeZone: "UTC" },
                  },
                ],
              },
            },
            { id: "1", status: 404, body: { error: { code: "ErrorItemNotFound" } } },
          ],
        };
      }),
    });
    const busy = await client.fetchBusy({
      calendarIds: ["a", "b"],
      fromMs: at("00:00"),
      toMs: at("23:00"),
    });
    expect(asked).toContain("$select=showAs,start,end,isCancelled");
    expect(asked).not.toContain("subject");
    expect(busy.a).toEqual([{ startMs: at("09:00"), endMs: at("09:30") }]);
    expect(busy).not.toHaveProperty("b");
  });

  test("a retry of a create carries the same transactionId", async () => {
    const seen: string[] = [];
    const client = microsoftCalendarClient({
      accessToken: "t",
      fetcher: graph((_url, init) => {
        const body = JSON.parse(String(init?.body)) as {
          transactionId: string;
          sensitivity: string;
        };
        seen.push(body.transactionId);
        expect(body.sensitivity).toBe("private");
        return { id: "evt", start: {}, end: {} };
      }),
    });
    const event = {
      key: "book_1-cal_1",
      title: "Appointment",
      startMs: at("09:00"),
      endMs: at("09:30"),
      conference: null,
      location: null,
    };
    await client.createEvent("cal", event);
    await client.createEvent("cal", event);
    expect(seen).toEqual(["book_1-cal_1", "book_1-cal_1"]);
  });
});

describe("google", () => {
  test("wide windows are read in contiguous chunks, leaving no hole", async () => {
    const api = new FakeGoogleCalendarApi();
    const windows: [string, string][] = [];
    const client = googleCalendarClient({
      accessToken: "t",
      fetcher: (url, init) => {
        if (url.includes("freeBusy")) {
          const body = JSON.parse(String(init?.body)) as { timeMin: string; timeMax: string };
          windows.push([body.timeMin, body.timeMax]);
        }
        return api.fetch(url, init);
      },
    });
    await client.fetchBusy({
      calendarIds: ["x"],
      fromMs: at("00:00"),
      toMs: at("00:00") + 200 * 86_400_000,
    });
    expect(windows.length).toBe(3);
    expect(windows[1]?.[0]).toBe(windows[0]?.[1] as string);
    expect(windows[2]?.[0]).toBe(windows[1]?.[1] as string);
  });

  test("a calendar erroring in any chunk stays out of the result", async () => {
    const api = new FakeGoogleCalendarApi();
    api.erroredCalendars.add("bad");
    const client = googleCalendarClient({ accessToken: "t", fetcher: api.fetch });
    const busy = await client.fetchBusy({
      calendarIds: ["good", "bad"],
      fromMs: at("00:00"),
      toMs: at("12:00"),
    });
    expect(busy).toHaveProperty("good");
    expect(busy).not.toHaveProperty("bad");
  });
});

describe("caldav", () => {
  const calendarUrl = "https://dav.example.test/cal/me/work/";
  const multistatus = (entries: string) =>
    `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${entries}</d:multistatus>`;
  const ok = (body: string, status = 207) => ({ status, headers: {}, body });

  const ics = (lines: string[]) =>
    ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//t//t//EN", ...lines, "END:VCALENDAR"].join(
      "\r\n",
    );
  const vevent = (uid: string, start: string, end: string, extra: string[] = []) => [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    "DTSTAMP:20310101T000000Z",
    `DTSTART:${start}`,
    `DTEND:${end}`,
    "SUMMARY:Secret therapy session",
    ...extra,
    "END:VEVENT",
  ];

  test("free and cancelled events aren't busy, and titles never come out", () => {
    const data = ics([
      ...vevent("a", "20310106T090000Z", "20310106T093000Z"),
      ...vevent("b", "20310106T100000Z", "20310106T103000Z", ["TRANSP:TRANSPARENT"]),
      ...vevent("c", "20310106T110000Z", "20310106T113000Z", ["STATUS:CANCELLED"]),
    ]);
    const busy = busyFromIcs(data, at("00:00"), at("23:00"));
    expect(busy).toEqual([{ startMs: at("09:00"), endMs: at("09:30") }]);
    expect(JSON.stringify(busy)).not.toContain("Secret");
  });

  test("recurring events expand, with exceptions", () => {
    const data = ics([
      ...vevent("r", "20310106T090000Z", "20310106T093000Z", [
        "RRULE:FREQ=DAILY;COUNT=3",
        "EXDATE:20310107T090000Z",
      ]),
    ]);
    const busy = busyFromIcs(data, at("00:00"), at("00:00") + 5 * 86_400_000);
    expect(busy.map((slot) => new Date(slot.startMs).toISOString().slice(0, 10))).toEqual([
      "2031-01-06",
      "2031-01-08",
    ]);
  });

  test("a deleted calendar is left out, never read as free", async () => {
    const client = caldavCalendarClient({
      url: calendarUrl,
      username: "me",
      password: "pw",
      transport: async () => ok("", 404),
    });
    const busy = await client.fetchBusy({
      calendarIds: [calendarUrl],
      fromMs: at("00:00"),
      toMs: at("23:00"),
    });
    expect(busy).not.toHaveProperty(calendarUrl);
  });

  test("a refused password is an auth failure", async () => {
    const client = caldavCalendarClient({
      url: calendarUrl,
      username: "me",
      password: "pw",
      transport: async () => ok("", 401),
    });
    expect(
      client.fetchBusy({ calendarIds: [calendarUrl], fromMs: at("00:00"), toMs: at("23:00") }),
    ).rejects.toMatchObject({ kind: "auth" });
  });

  test("discovers calendars, skipping task lists", async () => {
    const calls: DavRequest[] = [];
    const client = caldavCalendarClient({
      url: "https://dav.example.test/",
      username: "me",
      password: "pâss",
      transport: async (request) => {
        calls.push(request);
        if (request.body?.includes("current-user-principal")) {
          return ok(
            multistatus(
              `<d:response><d:href>/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/p/me/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`,
            ),
          );
        }
        if (request.body?.includes("calendar-home-set")) {
          return ok(
            multistatus(
              `<d:response><d:href>/p/me/</d:href><d:propstat><d:prop><c:calendar-home-set><d:href>/cal/me/</d:href></c:calendar-home-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`,
            ),
          );
        }
        return ok(
          multistatus(`
          <d:response><d:href>/cal/me/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
          <d:response><d:href>/cal/me/work/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>Work</d:displayname><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
          <d:response><d:href>/cal/me/tasks/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>Tasks</d:displayname><c:supported-calendar-component-set><c:comp name="VTODO"/></c:supported-calendar-component-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
        `),
        );
      },
    });
    const calendars = await client.listCalendars();
    expect(calendars.map((c) => c.name)).toEqual(["Work"]);
    expect(calendars[0]?.externalId).toBe("https://dav.example.test/cal/me/work/");
    expect(calls[0]?.headers.authorization).toBe(
      `Basic ${Buffer.from("me:pâss", "utf8").toString("base64")}`,
    );
  });

  test("a redirect elsewhere is refused: the password stays where the host sent it", async () => {
    const client = caldavCalendarClient({
      url: calendarUrl,
      username: "me",
      password: "pw",
      transport: async () => ({
        status: 302,
        headers: { location: "https://evil.example/steal" },
        body: "",
      }),
    });
    expect(client.listCalendars()).rejects.toMatchObject({ code: "redirected_away" });
  });

  test("private addresses and plain http are refused before anything's sent", async () => {
    const transport = pinnedDavTransport();
    expect(
      transport({ url: "http://dav.example.test/", method: "PROPFIND", headers: {} }),
    ).rejects.toMatchObject({ code: "insecure_url" });
    expect(
      transport({ url: "https://127.0.0.1/", method: "PROPFIND", headers: {} }),
    ).rejects.toThrow();
    expect(
      transport({ url: "https://localhost/", method: "PROPFIND", headers: {} }),
    ).rejects.toThrow();
  });

  test("a retry after a lost answer finds the event, rather than making another", async () => {
    const puts: Record<string, string>[] = [];
    const client = caldavCalendarClient({
      url: calendarUrl,
      username: "me",
      password: "pw",
      transport: async (request) => {
        puts.push(request.headers);
        return { status: 412, headers: {}, body: "" };
      },
    });
    const written = await client.createEvent(calendarUrl, {
      key: "book-1",
      title: "Appointment",
      startMs: at("09:00"),
      endMs: at("09:30"),
      conference: null,
      location: null,
    });
    expect(written.providerEventId).toBe("book-1");
    expect(puts[0]?.["if-none-match"]).toBe("*");
  });
});

describe("ics", () => {
  test("is in UTC, escapes text and folds long lines", () => {
    const ics = buildIcs({
      uid: "book_1@coss.com",
      title: "Consult, with; care",
      startMs: at("09:00"),
      endMs: at("09:30"),
      stampMs: at("00:00"),
      sequence: 2,
      method: "REQUEST",
      location:
        "https://meet.example.com/a-really-long-meeting-link-that-goes-on-and-on-and-on-past-the-limit",
    });
    expect(ics).toContain("DTSTART:20310106T090000Z");
    expect(ics).toContain("SEQUENCE:2");
    expect(ics).toContain("SUMMARY:Consult\\, with; care");
    for (const line of ics.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75);
    expect(ics.endsWith("\r\n")).toBe(true);
  });
});
