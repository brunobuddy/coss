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
import { busyFromIcs, escapeIcsText } from "../src/calendar/ical.ts";
import { microsoftCalendarClient } from "../src/calendar/microsoft.ts";
import { normalizeIntervals } from "../src/engine/intervals.ts";
import {
  buildIcs,
  type CalendarDeps,
  cancelBooking,
  checkHostEditedEvents,
  completeCalendarAuthorization,
  connectCaldav,
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

  const ledgerRow = async (bookingId: string) => {
    const [row] = await db
      .select()
      .from(schema.schedulingCalendarEvent)
      .where(eq(schema.schedulingCalendarEvent.bookingId, bookingId));
    return row as NonNullable<typeof row>;
  };

  test("a lost answer then a move puts the one event at the new time", async () => {
    const w = await writable();
    const { booking } = await book(w);
    w.api.loseNextAnswer = true;
    await runDueCalendarWrites(w.deps, { scope: scope(w.env) });
    expect((await ledgerRow(booking.id)).providerEventId).toBeNull();
    await rescheduleBooking(w.env, booking.id, { startMs: at("10:00") }, w.plain, actor);
    await runDueCalendarWrites(w.deps, { scope: scope(w.env) });
    expect(w.api.events.size).toBe(1);
    expect([...w.api.events.values()][0]?.startMs).toBe(at("10:00"));
    const row = await ledgerRow(booking.id);
    expect(row.appliedVersion).toBe(row.desiredVersion);
  });

  test("a lost answer then a cancel deletes the event it can't name", async () => {
    const w = await writable();
    const { booking } = await book(w);
    w.api.loseNextAnswer = true;
    await runDueCalendarWrites(w.deps, { scope: scope(w.env) });
    await cancelBooking(w.env, booking.id, w.plain, actor);
    await runDueCalendarWrites(w.deps, { scope: scope(w.env) });
    expect([...w.api.events.values()].filter((event) => !event.deleted)).toEqual([]);
    const row = await ledgerRow(booking.id);
    expect(row.appliedVersion).toBe(row.desiredVersion);
  });

  test("a cancel of an event that was never written still finishes", async () => {
    const w = await writable();
    const { booking } = await book(w);
    await cancelBooking(w.env, booking.id, w.plain, actor);
    await runDueCalendarWrites(w.deps, { scope: scope(w.env) });
    const row = await ledgerRow(booking.id);
    expect(row.appliedVersion).toBe(row.desiredVersion);
    expect(row.lastErrorCode).toBeNull();
  });

  describe("expired leases", () => {
    const minutes = (count: number) => () => new Date(NOW.getTime() + count * 60_000);

    async function moved(w: Awaited<ReturnType<typeof writable>>, time = "10:00") {
      const { booking } = await book(w);
      await runDueCalendarWrites(w.deps, { scope: scope(w.env) });
      await rescheduleBooking(w.env, booking.id, { startMs: at(time) }, w.plain, actor);
      return booking;
    }

    test("an old write landing last is put right, whatever order the workers finish in", async () => {
      const w = await writable();
      const booking = await moved(w);
      const stale = w.api.hold("PATCH", /events/);
      const workerA = runDueCalendarWrites(w.deps, { scope: scope(w.env) });
      await stale.arrived;
      await rescheduleBooking(w.env, booking.id, { startMs: at("11:00") }, w.plain, actor);
      const current = w.api.hold("PATCH", /events/, "after");
      const workerB = runDueCalendarWrites(calendarDeps(w.api, minutes(3)), {
        scope: scope(w.env),
      });
      await current.arrived;
      expect([...w.api.events.values()][0]?.startMs).toBe(at("11:00"));
      stale.release();
      await workerA;
      expect([...w.api.events.values()][0]?.startMs).toBe(at("10:00"));
      current.release();
      await workerB;
      const row = await ledgerRow(booking.id);
      expect(row.appliedVersion).toBeLessThan(row.desiredVersion);
      await runDueCalendarWrites(calendarDeps(w.api, minutes(4)), { scope: scope(w.env) });
      expect([...w.api.events.values()][0]?.startMs).toBe(at("11:00"));
      const settled = await ledgerRow(booking.id);
      expect(settled.appliedVersion).toBe(settled.desiredVersion);
      expect(w.api.events.size).toBe(1);
    });

    test("a stale worker's completion marks nothing applied", async () => {
      const w = await writable();
      const booking = await moved(w);
      const stale = w.api.hold("PATCH", /events/);
      const workerA = runDueCalendarWrites(w.deps, { scope: scope(w.env) });
      await stale.arrived;
      await rescheduleBooking(w.env, booking.id, { startMs: at("11:00") }, w.plain, actor);
      await runDueCalendarWrites(calendarDeps(w.api, minutes(3)), { scope: scope(w.env) });
      const applied = (await ledgerRow(booking.id)).appliedVersion;
      stale.release();
      await workerA;
      const row = await ledgerRow(booking.id);
      expect(row.appliedVersion).toBe(applied);
      expect(row.appliedVersion).toBeLessThan(row.desiredVersion);
    });

    test("a stale worker's failure doesn't give up on a row someone else holds", async () => {
      const w = await writable();
      const booking = await moved(w);
      const stale = w.api.hold("PATCH", /events/);
      const workerA = runDueCalendarWrites(w.deps, { scope: scope(w.env) });
      await stale.arrived;
      w.api.failNext = { path: /events/, status: 403 };
      await db
        .update(schema.schedulingCalendarEvent)
        .set({ leaseUntil: new Date(minutes(5)().getTime()) })
        .where(eq(schema.schedulingCalendarEvent.bookingId, booking.id));
      stale.release();
      await workerA;
      const row = await ledgerRow(booking.id);
      expect(row.appliedVersion).toBeLessThan(row.desiredVersion);
      expect(row.leaseUntil?.getTime()).toBe(minutes(5)().getTime());
    });

    test("a batch that outlived its lease skips rows another worker took", async () => {
      const w = await writable();
      await book(w, "09:00");
      await book(w, "11:00");
      const stale = w.api.hold("POST", /events$/);
      const workerA = runDueCalendarWrites(w.deps, { scope: scope(w.env) });
      await stale.arrived;
      await runDueCalendarWrites(calendarDeps(w.api, minutes(3)), { scope: scope(w.env) });
      const before = w.api.requests.length;
      stale.release();
      await workerA;
      const creates = w.api.requests
        .slice(before)
        .filter((request) => request.startsWith("POST") && request.endsWith("/events"));
      expect(creates).toHaveLength(1);
    });

    test("a request that hangs is given up on before the lease runs out", async () => {
      const w = await writable();
      const { booking } = await book(w);
      const deps: CalendarDeps = {
        ...w.deps,
        requestTimeoutMs: 20,
        fetcher: (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          }),
      };
      expect(await runDueCalendarWrites(deps, { scope: scope(w.env) })).toBe(1);
      const row = await ledgerRow(booking.id);
      expect(row.lastErrorCode).toBe("unreachable");
      expect(row.attempts).toBe(1);
      expect(row.appliedVersion).toBeLessThan(row.desiredVersion);
      expect(row.leaseUntil).toBeNull();
    });
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

  test("moving a Meet booking to another host doesn't keep the old host's link", async () => {
    const setup = await setUp();
    const api = new FakeGoogleCalendarApi();
    const deps = calendarDeps(api);
    const other = await createHost(setup.env, { name: "Dr. Chen", time_zone: "UTC" });
    await createSchedule(setup.env, other.id, {
      rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
    });
    await connectGoogle(setup.env, setup.host.id, deps);
    await runDueCalendarSyncs(deps, { scope: scope(setup.env) });
    const meet = await createEventType(setup.env, {
      title: "Video",
      kind: "pool",
      duration_minutes: 30,
      locations: [{ type: "google_meet" }],
      hosts: [
        { host: setup.host.id, role: "member", weight: 100, schedule: null },
        { host: other.id, role: "member", weight: 100, schedule: null },
      ],
    } as never);
    const plain = testSchedulingDeps({ now: () => NOW });
    const { booking } = await createBooking(
      setup.env,
      { eventType: meet.id, startMs: at("09:00"), host: setup.host.id, attendee },
      plain,
      actor,
    );
    await runDueCalendarWrites(deps, { scope: scope(setup.env) });
    expect((await getBooking(setup.env, booking.id, plain)).location?.type).toBe("link");
    const moved = await rescheduleBooking(
      setup.env,
      booking.id,
      { startMs: at("10:00"), host: other.id },
      plain,
      actor,
    );
    expect(moved.location).toEqual({ type: "google_meet" });
  });

  test("a slow answer from the old host can't put their link on a moved booking", async () => {
    const setup = await setUp();
    const api = new FakeGoogleCalendarApi();
    const other = await createHost(setup.env, { name: "Dr. Chen", time_zone: "UTC" });
    await createSchedule(setup.env, other.id, {
      rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
    });
    const meet = await createEventType(setup.env, {
      title: "Video",
      kind: "pool",
      duration_minutes: 30,
      locations: [{ type: "google_meet" }],
      hosts: [
        { host: setup.host.id, role: "member", weight: 100, schedule: null },
        { host: other.id, role: "member", weight: 100, schedule: null },
      ],
    } as never);
    const plain = testSchedulingDeps({ now: () => NOW });
    let bookingId = "";
    let moved = false;
    const deps: CalendarDeps = {
      ...calendarDeps(api),
      fetcher: async (input, init) => {
        const res = await api.fetch(input, init);
        if (bookingId && !moved && init?.method === "POST" && String(input).includes("/events")) {
          moved = true;
          await rescheduleBooking(
            setup.env,
            bookingId,
            { startMs: at("10:00"), host: other.id },
            plain,
            actor,
          );
        }
        return res;
      },
    };
    await connectGoogle(setup.env, setup.host.id, deps);
    await runDueCalendarSyncs(deps, { scope: scope(setup.env) });
    const { booking } = await createBooking(
      setup.env,
      { eventType: meet.id, startMs: at("09:00"), host: setup.host.id, attendee },
      plain,
      actor,
    );
    bookingId = booking.id;
    await runDueCalendarWrites(deps, { scope: scope(setup.env) });
    expect(moved).toBe(true);
    expect((await getBooking(setup.env, booking.id, plain)).location).toEqual({
      type: "google_meet",
    });
  });

  test("an event made for a ledger row that's gone doesn't stay on the calendar", async () => {
    const w = await writable();
    await book(w);
    let dropped = false;
    const deps: CalendarDeps = {
      ...w.deps,
      fetcher: async (input, init) => {
        const res = await w.api.fetch(input, init);
        if (!dropped && init?.method === "POST" && String(input).includes("/events")) {
          dropped = true;
          await db
            .delete(schema.schedulingCalendarEvent)
            .where(eq(schema.schedulingCalendarEvent.hostId, w.host.id));
        }
        return res;
      },
    };
    await runDueCalendarWrites(deps, { scope: scope(w.env) });
    expect(dropped).toBe(true);
    expect([...w.api.events.values()].filter((event) => !event.deleted)).toEqual([]);
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
        if (!init?.body) return { value: [] };
        const body = JSON.parse(String(init.body)) as {
          transactionId: string;
          sensitivity: string;
          start: unknown;
          end: unknown;
        };
        seen.push(body.transactionId);
        expect(body.sensitivity).toBe("private");
        return { id: "evt", start: body.start, end: body.end };
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

  type GraphStored = {
    id: string;
    transactionId: string;
    marker: string | undefined;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
    location?: { displayName: string };
  };

  /** Graph's documented lookups only; a repeated `transactionId` returns the first event as it was. */
  function fakeGraph() {
    const events = new Map<string, GraphStored>();
    const state = { loseNextAnswer: false, filters: [] as string[] };
    const reply = (status: number, body?: unknown) =>
      new Response(body === undefined ? null : JSON.stringify(body), { status });
    const fetcher = async (url: string, init?: RequestInit) => {
      const parsed = new URL(url);
      const method = init?.method ?? "GET";
      const body = (init?.body ? JSON.parse(String(init.body)) : {}) as Pick<
        GraphStored,
        "transactionId" | "start" | "end"
      > & { singleValueExtendedProperties?: { value: string }[] };
      if (method === "POST" && /\/calendars\/[^/]+\/events$/.test(parsed.pathname)) {
        const existing = [...events.values()].find(
          (event) => event.transactionId === body.transactionId,
        );
        if (existing) return reply(201, existing);
        const created: GraphStored = {
          id: `evt_${events.size + 1}`,
          transactionId: body.transactionId,
          marker: body.singleValueExtendedProperties?.[0]?.value,
          start: body.start,
          end: body.end,
        };
        events.set(created.id, created);
        if (state.loseNextAnswer) {
          state.loseNextAnswer = false;
          return reply(503, {});
        }
        return reply(201, created);
      }
      if (method === "GET" && parsed.pathname.endsWith("/me/events")) {
        const filter = parsed.searchParams.get("$filter") ?? "";
        state.filters.push(filter);
        const value = /ep\/value eq '([^']+)'/.exec(filter)?.[1];
        return reply(200, {
          value: [...events.values()].filter((event) => event.marker === value),
        });
      }
      const id = decodeURIComponent(parsed.pathname.split("/").pop() as string);
      const event = events.get(id);
      if (!event) return reply(404, { error: { code: "ErrorItemNotFound" } });
      if (method === "PATCH") {
        Object.assign(event, body);
        return reply(200, event);
      }
      if (method === "DELETE") {
        events.delete(id);
        return reply(204);
      }
      return reply(200, event);
    };
    return { events, state, fetcher };
  }

  const graphEvent = (time: string) => ({
    key: "book_1-cal_1",
    title: "Appointment",
    startMs: at(time),
    endMs: at(time) + 1_800_000,
    conference: null,
    location: null,
  });

  test("a lost answer then a move leaves one event, at the new time", async () => {
    const graphApi = fakeGraph();
    const client = microsoftCalendarClient({ accessToken: "t", fetcher: graphApi.fetcher });
    graphApi.state.loseNextAnswer = true;
    await expect(client.createEvent("cal", graphEvent("09:00"))).rejects.toMatchObject({
      kind: "transient",
    });
    const written = await client.createEvent("cal", graphEvent("10:00"));
    expect(graphApi.events.size).toBe(1);
    expect(written.providerEventId).toBe("evt_1");
    expect(Date.parse(`${graphApi.events.get("evt_1")?.start.dateTime}`)).toBe(at("10:00"));
  });

  test("a lost answer then a cancel finds the event by its marker", async () => {
    const graphApi = fakeGraph();
    const client = microsoftCalendarClient({ accessToken: "t", fetcher: graphApi.fetcher });
    graphApi.state.loseNextAnswer = true;
    await expect(client.createEvent("cal", graphEvent("09:00"))).rejects.toBeDefined();
    await client.deleteEventByKey("cal", "book_1-cal_1");
    expect(graphApi.events.size).toBe(0);
    expect(graphApi.state.filters[0]).toContain("singleValueExtendedProperties/Any");
  });

  test("a cancel of an event that was never made finds nothing, and succeeds", async () => {
    const graphApi = fakeGraph();
    const client = microsoftCalendarClient({ accessToken: "t", fetcher: graphApi.fetcher });
    await client.deleteEventByKey("cal", "book_1-cal_1");
    expect(graphApi.events.size).toBe(0);
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
    expect(Object.keys(busy)).toEqual([]);
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
        return { status: request.headers["if-none-match"] ? 412 : 204, headers: {}, body: "" };
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

  describe("a lost create", () => {
    function davObjects() {
      const objects = new Map<string, string>();
      const transport = async (request: DavRequest) => {
        if (request.method === "PUT") {
          if (request.headers["if-none-match"] === "*" && objects.has(request.url)) {
            return ok("", 412);
          }
          objects.set(request.url, request.body ?? "");
          return ok("", 201);
        }
        if (request.method === "DELETE") {
          return ok("", objects.delete(request.url) ? 204 : 404);
        }
        return ok("", 404);
      };
      return { objects, transport };
    }
    const event = (time: string) => ({
      key: "book-1",
      title: "Appointment",
      startMs: at(time),
      endMs: at(time) + 1_800_000,
      conference: null,
      location: null,
    });

    test("then a move rewrites the event that's already there", async () => {
      const dav = davObjects();
      const client = caldavCalendarClient({
        url: calendarUrl,
        username: "me",
        password: "pw",
        transport: dav.transport,
      });
      await client.createEvent(calendarUrl, event("09:00"));
      const written = await client.createEvent(calendarUrl, event("10:00"));
      expect(written.providerEventId).toBe("book-1");
      expect(dav.objects.size).toBe(1);
      const [stored] = [...dav.objects.values()];
      expect(busyFromIcs(stored as string, at("00:00"), at("23:00"))).toEqual([
        { startMs: at("10:00"), endMs: at("10:30") },
      ]);
    });

    test("then a cancel deletes it by key", async () => {
      const dav = davObjects();
      const client = caldavCalendarClient({
        url: calendarUrl,
        username: "me",
        password: "pw",
        transport: dav.transport,
      });
      await client.createEvent(calendarUrl, event("09:00"));
      await client.deleteEventByKey(calendarUrl, "book-1");
      expect(dav.objects.size).toBe(0);
      await client.deleteEventByKey(calendarUrl, "book-1");
    });
  });

  describe("reads with missing data", () => {
    const day = 86_400_000;
    const object = (data: string) =>
      `<d:response><d:href>/cal/me/work/x.ics</d:href><d:propstat><d:prop><c:calendar-data>${data}</c:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
    const good = ics(vevent("a", "20310106T090000Z", "20310106T093000Z"));
    const read = (body: string, status = 207) =>
      caldavCalendarClient({
        url: calendarUrl,
        username: "me",
        password: "pw",
        transport: async () => ok(body, status),
      }).fetchBusy({ calendarIds: [calendarUrl], fromMs: at("00:00"), toMs: at("23:00") });

    test("a complete read is believed, and an empty one is an empty calendar", async () => {
      expect((await read(multistatus(object(good))))[calendarUrl]).toEqual([
        { startMs: at("09:00"), endMs: at("09:30") },
      ]);
      expect((await read(multistatus("")))[calendarUrl]).toEqual([]);
      expect(
        (await read(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"/>`))[calendarUrl],
      ).toEqual([]);
    });

    for (const [name, body] of [
      [
        "an object that can't be parsed",
        multistatus(object(good) + object("BEGIN:VCALENDAR garbage")),
      ],
      [
        "an object that isn't a calendar",
        multistatus(object("BEGIN:VEVENT\r\nUID:a\r\nEND:VEVENT")),
      ],
      [
        "an event with no start",
        multistatus(
          object(ics(["BEGIN:VEVENT", "UID:a", "DTSTAMP:20310101T000000Z", "END:VEVENT"])),
        ),
      ],
      [
        "a failed propstat",
        multistatus(
          `${object(good)}<d:response><d:href>/cal/me/work/y.ics</d:href><d:propstat><d:prop><c:calendar-data/></d:prop><d:status>HTTP/1.1 500 Internal Server Error</d:status></d:propstat></d:response>`,
        ),
      ],
      [
        "an object the server won't hand over",
        multistatus(
          `${object(good)}<d:response><d:href>/cal/me/work/y.ics</d:href><d:status>HTTP/1.1 403 Forbidden</d:status></d:response>`,
        ),
      ],
      [
        "a truncated result set",
        multistatus(
          `${object(good)}<d:response><d:href>/cal/me/work/</d:href><d:status>HTTP/1.1 507 Insufficient Storage</d:status></d:response>`,
        ),
      ],
      ["a 207 that isn't a multistatus", "<html><body>Maintenance</body></html>"],
      ["a body cut off midway", multistatus(object(good)).slice(0, -30)],
      ["a body cut off between objects", multistatus(object(good)).replace("</d:multistatus>", "")],
      ["an empty 207", ""],
    ] as const) {
      test(`${name} leaves the calendar out`, async () => {
        expect(Object.keys(await read(body))).toEqual([]);
      });
    }

    test("a status with no reason phrase still counts as a success", async () => {
      const body = multistatus(object(good)).replace("HTTP/1.1 200 OK", "HTTP/1.1 200");
      expect((await read(body))[calendarUrl]).toHaveLength(1);
    });

    const from = at("00:00");
    const to = at("00:00") + 2 * day;
    const days = (slots: { startMs: number }[]) => slots.length;

    test("hourly events expand", () => {
      const data = ics(
        vevent("h", "20310106T090000Z", "20310106T091500Z", ["RRULE:FREQ=HOURLY;COUNT=3"]),
      );
      expect(busyFromIcs(data, from, to)).toEqual([
        { startMs: at("09:00"), endMs: at("09:15") },
        { startMs: at("10:00"), endMs: at("10:15") },
        { startMs: at("11:00"), endMs: at("11:15") },
      ]);
    });

    test("an hourly event from years ago still reaches the window, exactly", () => {
      const data = ics(vevent("h", "20150101T000000Z", "20150101T001500Z", ["RRULE:FREQ=HOURLY"]));
      const busy = busyFromIcs(data, from, from + 3_600_000 * 3);
      expect(busy).toEqual(
        [0, 1, 2].map((hour) => ({
          startMs: from + hour * 3_600_000,
          endMs: from + hour * 3_600_000 + 900_000,
        })),
      );
    });

    test("a daily event from decades ago isn't cut off by the iteration cap", () => {
      const data = ics(vevent("d", "19500102T090000Z", "19500102T093000Z", ["RRULE:FREQ=DAILY"]));
      expect(busyFromIcs(data, at("00:00"), at("23:00"))).toEqual([
        { startMs: at("09:00"), endMs: at("09:30") },
      ]);
    });

    test("a multi-day occurrence starting long before the window still counts", () => {
      const data = ics(
        vevent("m", "20301201T000000Z", "20301215T000000Z", ["RRULE:FREQ=MONTHLY;COUNT=4"]),
      );
      const window = [ms("2031-01-10T00:00:00Z"), ms("2031-01-11T00:00:00Z")] as const;
      expect(busyFromIcs(data, ...window)).toEqual([
        { startMs: ms("2031-01-01T00:00:00Z"), endMs: ms("2031-01-15T00:00:00Z") },
      ]);
    });

    test("an occurrence moved into the window from far away counts, from either side", () => {
      for (const original of ["20300107T090000Z", "20320105T090000Z"]) {
        const data = ics([
          ...vevent("x", "20290101T090000Z", "20290101T093000Z", [
            "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20330101T000000Z",
          ]),
          ...vevent("x", "20310107T140000Z", "20310107T150000Z", [`RECURRENCE-ID:${original}`]),
        ]);
        const busy = busyFromIcs(data, ms("2031-01-07T00:00:00Z"), ms("2031-01-08T00:00:00Z"));
        expect(busy).toEqual([
          { startMs: ms("2031-01-07T14:00:00Z"), endMs: ms("2031-01-07T15:00:00Z") },
        ]);
      }
    });

    test("an occurrence moved out of the window no longer counts there", () => {
      const data = ics([
        ...vevent("x", "20310106T090000Z", "20310106T093000Z", ["RRULE:FREQ=DAILY;COUNT=3"]),
        ...vevent("x", "20310206T140000Z", "20310206T150000Z", ["RECURRENCE-ID:20310107T090000Z"]),
      ]);
      const busy = busyFromIcs(data, ms("2031-01-07T00:00:00Z"), ms("2031-01-08T00:00:00Z"));
      expect(busy).toEqual([]);
    });

    test("a single occurrence shared without its series still counts", () => {
      const data = ics(
        vevent("o", "20310106T140000Z", "20310106T150000Z", ["RECURRENCE-ID:20310105T090000Z"]),
      );
      expect(busyFromIcs(data, at("00:00"), at("23:00"))).toEqual([
        { startMs: at("14:00"), endMs: at("15:00") },
      ]);
    });

    test("a free occurrence of a busy series isn't busy, and the reverse", () => {
      const data = ics([
        ...vevent("x", "20310106T090000Z", "20310106T093000Z", ["RRULE:FREQ=DAILY;COUNT=2"]),
        ...vevent("x", "20310107T090000Z", "20310107T093000Z", [
          "RECURRENCE-ID:20310107T090000Z",
          "TRANSP:TRANSPARENT",
        ]),
      ]);
      expect(days(busyFromIcs(data, from, to))).toBe(1);
    });

    test("a dense rule is exact up to a bound, then busy, and stops where the rule does", () => {
      const forever = ics(
        vevent("s", "20310106T000000Z", "20310106T000001Z", ["RRULE:FREQ=SECONDLY"]),
      );
      const busy = normalizeIntervals(busyFromIcs(forever, from, to));
      expect(busy.at(-1)?.endMs).toBe(to);
      expect(busy.length).toBeLessThan(10_000);
      const ending = ics(
        vevent("s", "20310106T000000Z", "20310106T000001Z", [
          "RRULE:FREQ=SECONDLY;UNTIL=20310106T120000Z",
        ]),
      );
      const until = normalizeIntervals(busyFromIcs(ending, from, to));
      expect(until.at(-1)?.endMs).toBeLessThanOrEqual(at("12:00") + 1000);
      expect(until.at(-1)?.endMs).toBeGreaterThan(at("11:59"));
    });

    test("a dense rule that's marked free stays free", () => {
      const data = ics(
        vevent("s", "20310106T000000Z", "20310106T000001Z", [
          "RRULE:FREQ=SECONDLY",
          "TRANSP:TRANSPARENT",
        ]),
      );
      expect(busyFromIcs(data, from, to)).toEqual([]);
    });

    test("a rule that can never match can't hang the process, and reads as busy", () => {
      for (const rule of [
        "FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30",
        "FREQ=HOURLY;BYMONTH=2;BYMONTHDAY=30",
        "FREQ=MINUTELY;BYMONTH=2;BYMONTHDAY=30",
        "FREQ=SECONDLY;BYMONTH=2;BYMONTHDAY=30",
      ]) {
        const data = ics(vevent("n", "20250101T000000Z", "20250101T003000Z", [`RRULE:${rule}`]));
        const began = performance.now();
        expect(normalizeIntervals(busyFromIcs(data, from, to))).toEqual([
          { startMs: from, endMs: to },
        ]);
        expect(performance.now() - began).toBeLessThan(5000);
      }
    }, 30_000);

    test("one odd event doesn't hide the rest of the calendar", async () => {
      const odd = ics(
        vevent("n", "20310105T000000Z", "20310105T003000Z", [
          "RRULE:FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30;UNTIL=20310106T020000Z",
        ]),
      );
      const result = await read(multistatus(object(odd) + object(good)));
      expect(result[calendarUrl]).toEqual([
        { startMs: at("00:00"), endMs: at("02:30") },
        { startMs: at("09:00"), endMs: at("09:30") },
      ]);
    });

    test("a calendar of nothing but expensive rules fails the read, within its budget", async () => {
      const costly = ics(
        vevent("n", "20250101T000000Z", "20250101T003000Z", [
          "RRULE:FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30",
        ]),
      );
      const began = performance.now();
      const result = await read(multistatus(object(costly).repeat(200)));
      expect(Object.keys(result)).toEqual([]);
      expect(performance.now() - began).toBeLessThan(20_000);
    }, 30_000);

    test("expanding a costly calendar leaves room for timers to fire", async () => {
      const costly = ics(
        vevent("n", "20250101T000000Z", "20250101T003000Z", [
          "RRULE:FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30",
        ]),
      );
      let fired = false;
      setTimeout(() => {
        fired = true;
      }, 0);
      await read(multistatus(object(costly).repeat(3)));
      expect(fired).toBe(true);
    }, 30_000);

    test("a sync that can't read everything keeps old times and isn't trusted", async () => {
      const { env, host } = await setUp("live");
      let objects = [good];
      const transport = async (request: DavRequest) => {
        if (request.method === "REPORT") {
          return ok(multistatus(objects.map(object).join("")));
        }
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
          multistatus(
            `<d:response><d:href>/cal/me/work/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>Work</d:displayname></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`,
          ),
        );
      };
      const deps: CalendarDeps = {
        ...calendarDeps(new FakeGoogleCalendarApi()),
        davTransport: transport,
      };
      await connectCaldav(
        env,
        host.id,
        { url: "https://dav.example.test/", username: "me", password: "pw" },
        deps,
      );
      await runDueCalendarSyncs(deps, { scope: scope(env) });
      const first = await primaryCalendar(host.id);
      const busyRows = () =>
        db
          .select()
          .from(schema.schedulingBusyInterval)
          .where(eq(schema.schedulingBusyInterval.hostId, host.id));
      expect(first?.syncFailures).toBe(0);
      expect(first?.verifiedAt).not.toBeNull();
      expect(await busyRows()).toHaveLength(1);

      objects = [good, "BEGIN:VCALENDAR garbage"];
      await db
        .update(schema.schedulingCalendar)
        .set({ nextSyncAt: NOW })
        .where(eq(schema.schedulingCalendar.hostId, host.id));
      const later = new Date(NOW.getTime() + 60_000);
      await runDueCalendarSyncs({ ...deps, now: () => later }, { scope: scope(env) });
      const second = await primaryCalendar(host.id);
      expect(second?.syncFailures).toBe(1);
      expect(second?.verifiedAt).toEqual(first?.verifiedAt as Date);
      expect(await busyRows()).toHaveLength(1);
    });

    test("a sync stores more busy times than one Postgres statement can carry", async () => {
      const { env, host } = await setUp("live");
      const dense = [
        ics(vevent("a", "20301201T000000Z", "20301201T001500Z", ["RRULE:FREQ=HOURLY"])),
        ics(vevent("b", "20301201T003000Z", "20301201T004500Z", ["RRULE:FREQ=HOURLY"])),
      ];
      const transport = async (request: DavRequest) => {
        if (request.method === "REPORT") return ok(multistatus(dense.map(object).join("")));
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
          multistatus(
            `<d:response><d:href>/cal/me/work/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><c:calendar/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`,
          ),
        );
      };
      const deps: CalendarDeps = {
        ...calendarDeps(new FakeGoogleCalendarApi()),
        davTransport: transport,
      };
      await connectCaldav(
        env,
        host.id,
        { url: "https://dav.example.test/", username: "me", password: "pw" },
        deps,
      );
      await runDueCalendarSyncs(deps, { scope: scope(env) });
      const [{ count } = { count: 0 }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.schedulingBusyInterval)
        .where(eq(schema.schedulingBusyInterval.hostId, host.id));
      expect(count).toBeGreaterThan(11_000);
      expect((await primaryCalendar(host.id))?.syncFailures).toBe(0);
    });
  });

  describe("where the password goes", () => {
    const discovery = (hrefs: { principal: string; home: string; calendar: string }) => {
      const calls: DavRequest[] = [];
      const transport = async (request: DavRequest) => {
        calls.push(request);
        if (request.body?.includes("current-user-principal")) {
          return ok(
            multistatus(
              `<d:response><d:href>/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>${hrefs.principal}</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`,
            ),
          );
        }
        if (request.body?.includes("calendar-home-set")) {
          return ok(
            multistatus(
              `<d:response><d:href>/p/</d:href><d:propstat><d:prop><c:calendar-home-set><d:href>${hrefs.home}</d:href></c:calendar-home-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`,
            ),
          );
        }
        return ok(
          multistatus(
            `<d:response><d:href>${hrefs.calendar}</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>Work</d:displayname></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`,
          ),
        );
      };
      return { calls, transport };
    };
    const hostsCalled = (calls: DavRequest[]) => [
      ...new Set(calls.map((c) => new URL(c.url).host)),
    ];
    const local = { principal: "/p/me/", home: "/cal/me/", calendar: "/cal/me/work/" };

    for (const [name, hrefs] of [
      ["a principal", { ...local, principal: "https://evil.example/p/" }],
      ["a calendar home", { ...local, home: "https://evil.example/cal/" }],
      ["a downgrade to http", { ...local, home: "http://dav.example.test/cal/" }],
      ["another port", { ...local, home: "https://dav.example.test:8443/cal/" }],
      [
        "a lookalike with userinfo",
        { ...local, home: "https://dav.example.test@evil.example/cal/" },
      ],
    ] as const) {
      test(`${name} elsewhere gets no credentials`, async () => {
        const { calls, transport } = discovery(hrefs);
        const client = caldavCalendarClient({
          url: "https://dav.example.test/",
          username: "me",
          password: "pw",
          transport,
        });
        await expect(client.listCalendars()).rejects.toMatchObject({ code: "untrusted_origin" });
        expect(hostsCalled(calls)).toEqual(["dav.example.test"]);
      });
    }

    test("a calendar elsewhere isn't offered, and the others still are", async () => {
      const { calls, transport } = discovery({
        ...local,
        calendar: "https://evil.example/cal/me/work/",
      });
      const client = caldavCalendarClient({
        url: "https://dav.example.test/",
        username: "me",
        password: "pw",
        transport,
      });
      expect(await client.listCalendars()).toEqual([]);
      expect(hostsCalled(calls)).toEqual(["dav.example.test"]);
    });

    test("a stored calendar elsewhere is refused before anything's sent", async () => {
      const { calls, transport } = discovery(local);
      const client = caldavCalendarClient({
        url: "https://dav.example.test/",
        username: "me",
        password: "pw",
        transport,
      });
      const elsewhere = "https://evil.example/cal/";
      await expect(
        client.fetchBusy({ calendarIds: [elsewhere], fromMs: at("00:00"), toMs: at("23:00") }),
      ).rejects.toMatchObject({ code: "untrusted_origin" });
      await expect(client.deleteEvent(elsewhere, "book-1")).rejects.toMatchObject({
        code: "untrusted_origin",
      });
      expect(calls).toEqual([]);
    });

    test("iCloud's move to a partition host keeps working", async () => {
      const partition = "https://p42-caldav.icloud.com";
      const { calls, transport } = discovery({
        principal: `${partition}/123/principal/`,
        home: `${partition}:443/123/calendars/`,
        calendar: "/123/calendars/home/",
      });
      const client = caldavCalendarClient({
        url: "https://caldav.icloud.com/",
        username: "me@icloud.com",
        password: "app-password",
        transport,
      });
      const calendars = await client.listCalendars();
      expect(calendars[0]?.externalId).toBe(`${partition}/123/calendars/home/`);
      expect(hostsCalled(calls)).toEqual(["caldav.icloud.com", "p42-caldav.icloud.com"]);
      expect(calls.every((call) => call.headers.authorization?.startsWith("Basic "))).toBe(true);
      await client.fetchBusy({
        calendarIds: [calendars[0]?.externalId as string],
        fromMs: at("00:00"),
        toMs: at("23:00"),
      });
      expect(calls.at(-1)?.url).toBe(`${partition}/123/calendars/home/`);
    });

    test("an iCloud redirect to a partition host keeps working", async () => {
      const calls: string[] = [];
      const client = caldavCalendarClient({
        url: "https://caldav.icloud.com/",
        username: "me",
        password: "pw",
        transport: async (request) => {
          calls.push(request.url);
          if (request.url === "https://caldav.icloud.com/") {
            return {
              status: 301,
              headers: { location: "https://p7-caldav.icloud.com/" },
              body: "",
            };
          }
          return ok("", 404);
        },
      });
      await expect(client.listCalendars()).rejects.toBeDefined();
      expect(calls).toEqual(["https://caldav.icloud.com/", "https://p7-caldav.icloud.com/"]);
    });

    for (const target of [
      "https://www.icloud.com/x/",
      "https://evil.icloud.com/x/",
      "https://xp42-caldav.icloud.com/x/",
      "https://p42-caldav.icloud.com.evil.example/x/",
      "https://p42-caldav.icloud.com:8443/x/",
      "http://p42-caldav.icloud.com/x/",
      "https://p-caldav.icloud.com/x/",
    ]) {
      test(`from iCloud, ${target} gets no credentials`, async () => {
        const { calls, transport } = discovery({ ...local, home: target });
        const client = caldavCalendarClient({
          url: "https://caldav.icloud.com/",
          username: "me",
          password: "pw",
          transport,
        });
        await expect(client.listCalendars()).rejects.toMatchObject({ code: "untrusted_origin" });
        expect(hostsCalled(calls)).toEqual(["caldav.icloud.com"]);
      });
    }

    test("another server can't borrow iCloud's rule", async () => {
      const { calls, transport } = discovery({
        ...local,
        home: "https://p42-caldav.icloud.com/x/",
      });
      const client = caldavCalendarClient({
        url: "https://dav.example.test/",
        username: "me",
        password: "pw",
        transport,
      });
      await expect(client.listCalendars()).rejects.toMatchObject({ code: "untrusted_origin" });
      expect(hostsCalled(calls)).toEqual(["dav.example.test"]);
    });

    test("iCloud's rule doesn't skip the address checks", async () => {
      const seen: string[] = [];
      const pinned = pinnedDavTransport();
      const client = caldavCalendarClient({
        url: "https://caldav.icloud.com/",
        username: "me",
        password: "pw",
        transport: (request) => {
          seen.push(request.url);
          return pinned({ ...request, url: request.url.replace("caldav.icloud.com", "127.0.0.1") });
        },
      });
      await expect(client.listCalendars()).rejects.toMatchObject({ code: "unreachable" });
      expect(seen).toHaveLength(1);
    });
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
    expect(ics).toContain("SUMMARY:Consult\\, with\\; care");
    for (const line of ics.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75);
    expect(ics.endsWith("\r\n")).toBe(true);
  });
});

test("iCalendar text escapes what RFC 5545 reserves", () => {
  expect(escapeIcsText("a;b,c\\d\ne")).toBe("a\\;b\\,c\\\\d\\ne");
});
