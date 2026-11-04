import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { secretsKeyRing } from "@coss/webhooks";
import { eq, sql } from "drizzle-orm";
import {
  approveBooking,
  type CalendarDeps,
  cancelBooking,
  checkHostEditedEvents,
  completeCalendarAuthorization,
  confirmHold,
  createBooking,
  createEventType,
  createHold,
  createHost,
  createSchedule,
  deleteHost,
  expireDueBookings,
  flagExternalConflicts,
  getBooking,
  listEventTypeSlots,
  type NotificationDeps,
  redactExpiredBookings,
  runDueCalendarSyncs,
  runDueCalendarWrites,
  runDueSchedulingNotifications,
  type SchedulingEmail,
  type SchedulingEnvironment,
  SchedulingError,
  startCalendarAuthorization,
  updateBookingLocation,
} from "../src/index.ts";
import { FakeGoogleCalendarApi, testSchedulingDeps } from "../src/testing.ts";

const deps = testSchedulingDeps();
const actor = { kind: "system" } as const;
const MONDAY = "2031-01-06";
const at = (time: string) => Date.parse(`${MONDAY}T${time}:00Z`);
const NOW = new Date(at("00:00"));
const scope = (env: SchedulingEnvironment) => ({ organizationIds: [env.organizationId] });
const seat = (eventType: string, uid: string, extra: Record<string, unknown> = {}) => ({
  eventType,
  startMs: at("09:00"),
  attendee: { uid, email: `${uid}@example.com`, time_zone: "UTC" },
  ...extra,
});

async function tenantEnv(): Promise<SchedulingEnvironment> {
  const tenant = await createTestTenant();
  return {
    organizationId: tenant.organization.id,
    projectId: tenant.project.id,
    environmentId: tenant.development.id,
    mode: "sandbox",
  };
}

async function hostWithHours(env: SchedulingEnvironment) {
  const host = await createHost(env, { name: "Dr. Reyes", time_zone: "UTC" });
  await createSchedule(env, host.id, {
    rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
  });
  return host;
}

async function groupOf(
  env: SchedulingEnvironment,
  hostId: string,
  overrides: Record<string, unknown> = {},
) {
  return createEventType(env, {
    title: "Class",
    kind: "group",
    capacity: 2,
    duration_minutes: 30,
    hosts: [{ host: hostId, role: "member", weight: 100, schedule: null }],
    ...overrides,
  } as never);
}

const soloOf = (env: SchedulingEnvironment, hostId: string) =>
  createEventType(env, {
    title: "Consultation",
    kind: "one_on_one",
    duration_minutes: 30,
    hosts: [{ host: hostId, role: "member", weight: 100, schedule: null }],
  } as never);

async function code(run: Promise<unknown>): Promise<string> {
  try {
    await run;
    return "ok";
  } catch (error) {
    if (error instanceof SchedulingError) return error.code;
    throw error;
  }
}

async function claimsOf(sessionId: string | null) {
  return db
    .select()
    .from(schema.schedulingClaim)
    .where(eq(schema.schedulingClaim.groupSessionId, sessionId as string));
}

/** A session's claim and these seats ran out an hour ago, with no sweep having run. */
async function expireSeats(sessionId: string | null, seatIds: readonly string[]) {
  const until = sql`clock_timestamp() - interval '1 hour'`;
  await db.execute(sql`
    update scheduling_claim set live_from = ${until} - interval '30 minutes', live_until = ${until}
    where group_session_id = ${sessionId}`);
  for (const id of seatIds) {
    await db.execute(sql`
      update scheduling_booking
      set hold_expires_at = case when status = 'held' then ${until} end,
        approval_expires_at = case when status = 'pending_approval' then ${until} end
      where id = ${id}`);
  }
}

const statuses = (env: SchedulingEnvironment, ids: readonly string[]) =>
  Promise.all(ids.map(async (id) => (await getBooking(env, id, deps)).status));

describe("converting a seat", () => {
  test("an expired hold can't take a seat others have filled", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await groupOf(env, host.id);
    const { booking: hold } = await createHold(env, seat(eventType.id, "a"), deps, actor);
    await expireSeats(hold.group_session, [hold.id]);
    const { booking: b } = await createBooking(env, seat(eventType.id, "b"), deps, actor);
    const { booking: c } = await createBooking(env, seat(eventType.id, "c"), deps, actor);
    expect(b.group_session).toBe(hold.group_session);
    expect(await code(confirmHold(env, hold.id, { ifStillFree: true }, deps, actor))).toBe(
      "slot_unavailable",
    );
    expect(await statuses(env, [hold.id, b.id, c.id])).toEqual(["held", "confirmed", "confirmed"]);
  });

  test("an expired hold converts when a seat is free, on the one claim", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await groupOf(env, host.id);
    const { booking: hold } = await createHold(env, seat(eventType.id, "a"), deps, actor);
    await expireSeats(hold.group_session, [hold.id]);
    await createBooking(env, seat(eventType.id, "b"), deps, actor);
    const done = await confirmHold(env, hold.id, { ifStillFree: true }, deps, actor);
    expect(done.status).toBe("confirmed");
    const claims = await claimsOf(hold.group_session);
    expect(claims.length).toBe(1);
    expect(claims[0]?.liveUntil).toBeNull();
  });

  test("two expired holds racing for the last seat: one wins", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await groupOf(env, host.id);
    const { booking: a } = await createHold(env, seat(eventType.id, "a"), deps, actor);
    const { booking: b } = await createHold(env, seat(eventType.id, "b"), deps, actor);
    await expireSeats(a.group_session, [a.id, b.id]);
    await createBooking(env, seat(eventType.id, "c"), deps, actor);
    const outcomes = await Promise.all(
      [a.id, b.id].map((id) => code(confirmHold(env, id, { ifStillFree: true }, deps, actor))),
    );
    expect(outcomes.sort()).toEqual(["ok", "slot_unavailable"]);
    const { rows } = await db.execute(sql`
      select count(*)::int as seats from scheduling_booking
      where group_session_id = ${a.group_session} and status = 'confirmed'`);
    expect((rows[0] as { seats: number }).seats).toBe(2);
  });

  test("converting, leaving and joining at once neither deadlock nor overfill", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await groupOf(env, host.id, { capacity: 3 });
    for (let round = 0; round < 5; round++) {
      const startMs = at("09:00") + round * 3_600_000;
      const inRound = (uid: string) => seat(eventType.id, uid, { startMs });
      const { booking: hold } = await createHold(env, inRound("h"), deps, actor);
      const { booking: firm } = await createBooking(env, inRound("f"), deps, actor);
      const [converted, cancelled, ...joins] = await Promise.all([
        code(confirmHold(env, hold.id, {}, deps, actor)),
        code(cancelBooking(env, firm.id, deps, actor)),
        code(createBooking(env, inRound("j1"), deps, actor)),
        code(createBooking(env, inRound("j2"), deps, actor)),
      ]);
      expect([converted, cancelled]).toEqual(["ok", "ok"]);
      // Both joins can land before the cancel, and then the session is full for the second.
      const joined = joins.filter((outcome) => outcome === "ok").length;
      expect(joined).toBeGreaterThanOrEqual(1);
      expect(joins.filter((outcome) => outcome !== "ok")).toEqual(
        joined === 1 ? ["slot_unavailable"] : [],
      );
      const { rows } = await db.execute(sql`
        select count(*)::int as seats from scheduling_booking
        where group_session_id = ${hold.group_session} and status = 'confirmed'`);
      expect((rows[0] as { seats: number }).seats).toBe(1 + joined);
      const claims = await claimsOf(hold.group_session);
      expect(claims.length).toBe(1);
      expect(claims[0]?.liveUntil).toBeNull();
    }
  });

  test("an expired hold can't convert over someone who took the host's time", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await groupOf(env, host.id);
    const solo = await soloOf(env, host.id);
    const { booking: hold } = await createHold(env, seat(eventType.id, "a"), deps, actor);
    await expireSeats(hold.group_session, [hold.id]);
    await createBooking(env, seat(solo.id, "s"), deps, actor);
    expect(await code(confirmHold(env, hold.id, { ifStillFree: true }, deps, actor))).toBe(
      "slot_unavailable",
    );
  });

  test("an approval-required hold converts on the session's one claim", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await groupOf(env, host.id, { requires_approval: true });
    const { booking: hold } = await createHold(env, seat(eventType.id, "a"), deps, actor);
    const pending = await confirmHold(env, hold.id, {}, deps, actor);
    expect(pending.status).toBe("pending_approval");
    const claims = await claimsOf(hold.group_session);
    expect(claims.length).toBe(1);
    expect(claims[0]?.liveUntil?.getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
    expect((await approveBooking(env, hold.id, deps, actor)).status).toBe("confirmed");
    expect((await claimsOf(hold.group_session))[0]?.liveUntil).toBeNull();
  });

  test("going to approval keeps a firm session firm", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await groupOf(env, host.id, { requires_approval: true, capacity: 3 });
    const { booking: firm } = await createBooking(env, seat(eventType.id, "a"), deps, actor);
    await approveBooking(env, firm.id, deps, actor);
    const { booking: hold } = await createHold(env, seat(eventType.id, "b"), deps, actor);
    await confirmHold(env, hold.id, {}, deps, actor);
    expect((await claimsOf(hold.group_session))[0]?.liveUntil).toBeNull();
  });

  test("going to approval keeps a longer seat's expiry", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await groupOf(env, host.id, {
      requires_approval: true,
      approval_ttl_minutes: 5,
      hold_ttl_seconds: 7200,
    });
    const { booking: a } = await createHold(env, seat(eventType.id, "a"), deps, actor);
    const { booking: b } = await createHold(env, seat(eventType.id, "b"), deps, actor);
    const before = (await claimsOf(a.group_session))[0]?.liveUntil;
    await confirmHold(env, a.id, {}, deps, actor);
    expect((await claimsOf(b.group_session))[0]?.liveUntil).toEqual(before as Date);
  });

  test("an expired approval-required hold starts its claim again from now", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await groupOf(env, host.id, { requires_approval: true });
    const { booking: hold } = await createHold(env, seat(eventType.id, "a"), deps, actor);
    await expireSeats(hold.group_session, [hold.id]);
    const pending = await confirmHold(env, hold.id, { ifStillFree: true }, deps, actor);
    expect(pending.status).toBe("pending_approval");
    const [claim] = await claimsOf(hold.group_session);
    expect(claim?.liveFrom.getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(claim?.liveUntil?.getTime()).toBeGreaterThan(Date.now());
  });

  test("an approval past its deadline gives up its seat, and a late approval rechecks", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await groupOf(env, host.id, { requires_approval: true });
    const { booking: late } = await createBooking(env, seat(eventType.id, "a"), deps, actor);
    await expireSeats(late.group_session, [late.id]);
    const { booking: b } = await createBooking(env, seat(eventType.id, "b"), deps, actor);
    const { booking: c } = await createBooking(env, seat(eventType.id, "c"), deps, actor);
    expect([b.status, c.status]).toEqual(["pending_approval", "pending_approval"]);
    expect(await code(approveBooking(env, late.id, deps, actor))).toBe("slot_unavailable");
  });
});

describe("a booking that lost a host", () => {
  async function expiredHold(env: SchedulingEnvironment, hostIds: string[]) {
    const eventType = await createEventType(env, {
      title: "Panel",
      kind: hostIds.length > 1 ? "collective" : "one_on_one",
      duration_minutes: 30,
      hosts: hostIds.map((host) => ({
        host,
        role: hostIds.length > 1 ? "required" : "member",
        weight: 100,
        schedule: null,
      })),
    } as never);
    const { booking } = await createHold(env, seat(eventType.id, "a"), deps, actor);
    const until = sql`clock_timestamp() - interval '1 hour'`;
    await db.execute(sql`
      update scheduling_claim set live_from = ${until} - interval '30 minutes', live_until = ${until}
      where booking_id = ${booking.id}`);
    await db.execute(sql`
      update scheduling_booking set hold_expires_at = ${until} where id = ${booking.id}`);
    return booking;
  }

  test("an unswept expired hold keeps its host from being deleted", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const hold = await expiredHold(env, [host.id]);
    expect(await code(deleteHost(env, host.id))).toBe("host_has_live_bookings");
    await expireDueBookings({}, { scope: scope(env) });
    expect((await deleteHost(env, host.id)).id).toBe(host.id);
    expect(await code(confirmHold(env, hold.id, { ifStillFree: true }, deps, actor))).toBe(
      "booking_not_changeable",
    );
  });

  test("so does each host of an expired collective hold", async () => {
    const env = await tenantEnv();
    const [a, b] = await Promise.all([hostWithHours(env), hostWithHours(env)]);
    const hold = await expiredHold(env, [a.id, b.id]);
    expect(await code(deleteHost(env, a.id))).toBe("host_has_live_bookings");
    expect(await code(deleteHost(env, b.id))).toBe("host_has_live_bookings");
    const done = await confirmHold(env, hold.id, { ifStillFree: true }, deps, actor);
    expect(done.hosts.length).toBe(2);
  });

  test("an approval past its deadline keeps its host too", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await groupOf(env, host.id, { requires_approval: true });
    const { booking } = await createBooking(env, seat(eventType.id, "a"), deps, actor);
    await expireSeats(booking.group_session, [booking.id]);
    expect(await code(deleteHost(env, host.id))).toBe("host_has_live_bookings");
  });

  test("a hold whose host is already gone refuses to convert", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const hold = await expiredHold(env, [host.id]);
    await db.delete(schema.schedulingHost).where(eq(schema.schedulingHost.id, host.id));
    expect(await code(confirmHold(env, hold.id, { ifStillFree: true }, deps, actor))).toBe(
      "slot_unavailable",
    );
    expect((await getBooking(env, hold.id, deps)).status).toBe("held");
  });
});

describe("the session's claim follows its seats", () => {
  test("stops being firm with the last confirmed seat, and ends with the last hold", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await groupOf(env, host.id);
    const solo = await soloOf(env, host.id);
    const { booking: firm } = await createBooking(env, seat(eventType.id, "a"), deps, actor);
    const { booking: hold } = await createHold(env, seat(eventType.id, "b"), deps, actor);
    expect((await claimsOf(firm.group_session))[0]?.liveUntil).toBeNull();
    await cancelBooking(env, firm.id, deps, actor);
    const [claim] = await claimsOf(firm.group_session);
    expect(claim?.liveUntil?.toISOString()).toBe(hold.hold_expires_at as string);
    await db.execute(sql`
      update scheduling_booking set hold_expires_at = clock_timestamp() - interval '1 minute'
      where id = ${hold.id}`);
    await db.execute(sql`
      update scheduling_claim set live_from = clock_timestamp() - interval '2 minutes',
        live_until = clock_timestamp() - interval '1 minute'
      where group_session_id = ${firm.group_session} and live_until is not null`);
    const { booking } = await createBooking(env, seat(solo.id, "s"), deps, actor);
    expect(booking.status).toBe("confirmed");
  });

  test("stays firm while a confirmed seat remains", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await groupOf(env, host.id, { capacity: 3 });
    const { booking: a } = await createBooking(env, seat(eventType.id, "a"), deps, actor);
    await createBooking(env, seat(eventType.id, "b"), deps, actor);
    await createHold(env, seat(eventType.id, "c"), deps, actor);
    await cancelBooking(env, a.id, deps, actor);
    expect((await claimsOf(a.group_session))[0]?.liveUntil).toBeNull();
  });

  test("takes the latest remaining expiry when the longest seat leaves", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await groupOf(env, host.id);
    const { booking: a } = await createHold(env, seat(eventType.id, "a"), deps, actor);
    const { booking: b } = await createHold(env, seat(eventType.id, "b"), deps, actor);
    const shorter = new Date(Date.now() + 120_000);
    await db
      .update(schema.schedulingBooking)
      .set({ holdExpiresAt: shorter })
      .where(eq(schema.schedulingBooking.id, a.id));
    await cancelBooking(env, b.id, deps, actor);
    expect((await claimsOf(a.group_session))[0]?.liveUntil).toEqual(shorter);
  });

  test("goes with the last seat", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await groupOf(env, host.id);
    const { booking: firm } = await createBooking(env, seat(eventType.id, "a"), deps, actor);
    await cancelBooking(env, firm.id, deps, actor);
    expect((await claimsOf(firm.group_session)).length).toBe(0);
  });
});

describe("a group session on a calendar", () => {
  function calendarDeps(api: FakeGoogleCalendarApi): CalendarDeps {
    return {
      secretsKeys: secretsKeyRing([createHash("sha256").update("calendar test").digest()]),
      apps: {
        google: { clientId: "google-client", clientSecret: "google-secret" },
        microsoft: { clientId: "ms-client", clientSecret: "ms-secret" },
      },
      publicUrl: "https://api.example.test",
      fetcher: api.fetch,
      now: () => NOW,
    };
  }

  async function connected(overrides: Record<string, unknown> = {}) {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const api = new FakeGoogleCalendarApi();
    const calendars = calendarDeps(api);
    const { url } = await startCalendarAuthorization(
      env,
      host.id,
      { provider: "google", returnUrl: null },
      calendars,
    );
    const state = new URL(url).searchParams.get("state") as string;
    await completeCalendarAuthorization(
      { provider: "google", state, code: "code", error: null },
      calendars,
    );
    await runDueCalendarSyncs(calendars, { scope: scope(env) });
    const eventType = await groupOf(env, host.id, {
      locations: [{ type: "google_meet" }],
      ...overrides,
    });
    const plain = testSchedulingDeps({ now: () => NOW });
    const write = () =>
      runDueCalendarWrites({ ...calendars, dataKeys: deps.dataKeys }, { scope: scope(env) });
    const shown = () => [...api.events.values()].filter((event) => !event.deleted);
    return { env, host, api, calendars, eventType, plain, write, shown };
  }

  const MEET = { type: "link" as const, url: "https://meet.google.com/abc-defg-hij" };

  test("with details on, a session's event has its title and nobody's name", async () => {
    const c = await connected({ title: "Yoga", host_calendar_details: "full" });
    await createBooking(c.env, seat(c.eventType.id, "a"), c.plain, actor);
    await c.write();
    const [event] = c.shown();
    expect(event?.title).toBe("Yoga");
    expect(event?.description).toBeUndefined();
    // Marked all the same: HIPAA mode has to find a title like this to take it off.
    const [row] = await db
      .select({ detailsWritten: schema.schedulingCalendarEvent.detailsWritten })
      .from(schema.schedulingCalendarEvent)
      .where(eq(schema.schedulingCalendarEvent.hostId, c.host.id));
    expect(row?.detailsWritten).toBe(true);
  });

  test("direct seats share one event and one Meet link", async () => {
    const c = await connected();
    const { booking: a } = await createBooking(c.env, seat(c.eventType.id, "a"), c.plain, actor);
    const { booking: b } = await createBooking(c.env, seat(c.eventType.id, "b"), c.plain, actor);
    await c.write();
    expect(c.shown().length).toBe(1);
    expect((await getBooking(c.env, a.id, c.plain)).location).toEqual(MEET);
    expect((await getBooking(c.env, b.id, c.plain)).location).toEqual(MEET);
  });

  test("a seat joining after the link exists has it too", async () => {
    const c = await connected({ capacity: 3 });
    await createBooking(c.env, seat(c.eventType.id, "a"), c.plain, actor);
    await c.write();
    const { booking: b } = await createBooking(c.env, seat(c.eventType.id, "b"), c.plain, actor);
    await c.write();
    expect(b.location).toEqual(MEET);
    expect(c.shown().length).toBe(1);
  });

  test("the event stays until the last confirmed seat, whichever leaves first", async () => {
    const c = await connected();
    const { booking: a } = await createBooking(c.env, seat(c.eventType.id, "a"), c.plain, actor);
    const { booking: b } = await createBooking(c.env, seat(c.eventType.id, "b"), c.plain, actor);
    await c.write();
    await cancelBooking(c.env, a.id, c.plain, actor);
    await c.write();
    expect(c.shown().length).toBe(1);
    expect((await getBooking(c.env, b.id, c.plain)).location).toEqual(MEET);
    await cancelBooking(c.env, b.id, c.plain, actor);
    await c.write();
    expect(c.shown().length).toBe(0);
  });

  test("hold conversions and approvals write one event between them", async () => {
    const c = await connected({ requires_approval: true });
    const { booking: a } = await createHold(c.env, seat(c.eventType.id, "a"), c.plain, actor);
    const { booking: b } = await createBooking(c.env, seat(c.eventType.id, "b"), c.plain, actor);
    await confirmHold(c.env, a.id, {}, c.plain, actor);
    await c.write();
    expect(c.shown().length).toBe(0);
    await approveBooking(c.env, a.id, c.plain, actor);
    await approveBooking(c.env, b.id, c.plain, actor);
    await c.write();
    expect(c.shown().length).toBe(1);
    expect((await getBooking(c.env, a.id, c.plain)).location).toEqual(MEET);
    expect((await getBooking(c.env, b.id, c.plain)).location).toEqual(MEET);
  });

  test("a session emptied and booked again gets its event back", async () => {
    const c = await connected();
    const { booking: a } = await createBooking(c.env, seat(c.eventType.id, "a"), c.plain, actor);
    await c.write();
    await cancelBooking(c.env, a.id, c.plain, actor);
    await c.write();
    expect(c.shown().length).toBe(0);
    const { booking: b } = await createBooking(c.env, seat(c.eventType.id, "b"), c.plain, actor);
    await c.write();
    expect(c.shown().length).toBe(1);
    expect((await getBooking(c.env, b.id, c.plain)).location).toEqual(MEET);
  });

  test("a foreign event flags each confirmed seat, once", async () => {
    const c = await connected({ capacity: 3 });
    const { booking: a } = await createBooking(c.env, seat(c.eventType.id, "a"), c.plain, actor);
    const { booking: b } = await createBooking(c.env, seat(c.eventType.id, "b"), c.plain, actor);
    const { booking: held } = await createHold(c.env, seat(c.eventType.id, "h"), c.plain, actor);
    c.api.busy.set("doctor@example.com", [
      { start: new Date(at("09:00")).toISOString(), end: new Date(at("09:15")).toISOString() },
    ]);
    await db
      .update(schema.schedulingCalendar)
      .set({ nextSyncAt: NOW })
      .where(eq(schema.schedulingCalendar.hostId, c.host.id));
    await runDueCalendarSyncs(c.calendars, { scope: scope(c.env) });
    for (const id of [a.id, b.id]) {
      const after = await getBooking(c.env, id, c.plain);
      expect(after.status).toBe("confirmed");
      expect(after.external_conflict_at).not.toBeNull();
    }
    expect((await getBooking(c.env, held.id, c.plain)).external_conflict_at).toBeNull();
    expect(await flagExternalConflicts(c.host.id, c.env.organizationId, NOW)).toBe(0);
    const { rows } = await db.execute(sql`
      select count(*)::int as lines from log_entry
      where environment_id = ${c.env.environmentId}
        and type = 'scheduling.booking.external_conflict'`);
    expect((rows[0] as { lines: number }).lines).toBe(2);
  });

  test("the session's own event isn't a foreign one", async () => {
    const c = await connected();
    const { booking: a } = await createBooking(c.env, seat(c.eventType.id, "a"), c.plain, actor);
    await c.write();
    await db
      .update(schema.schedulingCalendar)
      .set({ nextSyncAt: NOW })
      .where(eq(schema.schedulingCalendar.hostId, c.host.id));
    await runDueCalendarSyncs(c.calendars, { scope: scope(c.env) });
    expect((await getBooking(c.env, a.id, c.plain)).external_conflict_at).toBeNull();
  });

  test("a host deleting the event flags every confirmed seat", async () => {
    const c = await connected();
    const { booking: a } = await createBooking(c.env, seat(c.eventType.id, "a"), c.plain, actor);
    const { booking: b } = await createBooking(c.env, seat(c.eventType.id, "b"), c.plain, actor);
    await c.write();
    const [event] = c.shown();
    if (event) event.deleted = true;
    await db
      .update(schema.schedulingCalendarEvent)
      .set({ updatedAt: new Date(NOW.getTime() - 7_200_000) })
      .where(eq(schema.schedulingCalendarEvent.hostId, c.host.id));
    await checkHostEditedEvents(c.calendars, { scope: scope(c.env) });
    expect((await getBooking(c.env, a.id, c.plain)).external_conflict_at).not.toBeNull();
    expect((await getBooking(c.env, b.id, c.plain)).external_conflict_at).not.toBeNull();
  });

  test("a failed write tells every confirmed seat", async () => {
    const c = await connected({ locations: [] });
    await createBooking(c.env, seat(c.eventType.id, "a"), c.plain, actor);
    await createBooking(c.env, seat(c.eventType.id, "b"), c.plain, actor);
    c.api.failNext = { path: /\/events/, status: 400 };
    await c.write();
    const { rows } = await db.execute(sql`
      select count(distinct resource_id)::int as seats from log_entry
      where environment_id = ${c.env.environmentId}
        and type = 'scheduling.booking.calendar_write_failed'`);
    expect((rows[0] as { seats: number }).seats).toBe(2);
  });

  test("the link's webhook reaches every confirmed seat, once", async () => {
    const c = await connected();
    await createBooking(c.env, seat(c.eventType.id, "a"), c.plain, actor);
    await createBooking(c.env, seat(c.eventType.id, "b"), c.plain, actor);
    await c.write();
    await c.write();
    const { rows } = await db.execute(sql`
      select count(*)::int as lines, count(distinct resource_id)::int as seats from log_entry
      where environment_id = ${c.env.environmentId}
        and type = 'scheduling.booking.location_ready'`);
    expect(rows[0]).toEqual({ lines: 2, seats: 2 });
  });

  test("every seat's confirmation carries the shared link", async () => {
    const c = await connected();
    await createBooking(c.env, seat(c.eventType.id, "a"), c.plain, actor);
    await createBooking(c.env, seat(c.eventType.id, "b"), c.plain, actor);
    await c.write();
    const emails: SchedulingEmail[] = [];
    const notification: NotificationDeps = {
      dataKeys: c.plain.dataKeys,
      publicUrl: "https://book.example.test",
      now: () => new Date(NOW.getTime() + 3_600_000),
      notifier: {
        email: async (message) => {
          emails.push(message);
        },
        sms: async () => {},
      },
    };
    await runDueSchedulingNotifications(notification, { scope: scope(c.env) });
    const text = JSON.stringify(emails);
    expect(emails.length).toBeGreaterThanOrEqual(2);
    expect(text).toContain("b@example.com");
    for (const email of emails) expect(JSON.stringify(email)).toContain(MEET.url);
  });
});

describe("what a session lists", () => {
  test("a seat past its approval deadline leaves the slot open", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await groupOf(env, host.id, { requires_approval: true, capacity: 1 });
    const { booking } = await createBooking(env, seat(eventType.id, "a"), deps, actor);
    await expireSeats(booking.group_session, [booking.id]);
    const slots = await listEventTypeSlots(env, {
      eventTypeRef: eventType.id,
      fromMs: at("09:00"),
      toMs: at("09:30"),
      nowMs: at("00:00"),
    });
    expect(slots.map((slot) => slot.startMs)).toEqual([at("09:00")]);
  });
});

describe("a session's location", () => {
  const room = { type: "link" as const, url: "https://video.example.com/class" };
  const elsewhere = { type: "link" as const, url: "https://evil.example.com/join" };

  test("the first seat's is everyone's, and a later seat can't choose another", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await groupOf(env, host.id, {
      capacity: 3,
      locations: [
        { type: "link", url: null },
        { type: "in_person", address: "1 Main St" },
      ],
    });
    const { booking: a } = await createBooking(
      env,
      seat(eventType.id, "a", { location: room }),
      deps,
      actor,
    );
    const { booking: b } = await createBooking(env, seat(eventType.id, "b"), deps, actor);
    expect(a.location).toEqual(room);
    expect(b.location).toEqual(room);
    expect(
      await code(
        createBooking(
          env,
          seat(eventType.id, "c", { location: { type: "in_person", address: "1 Main St" } }),
          deps,
          actor,
        ),
      ),
    ).toBe("invalid_event_type");
  });

  test("an emptied session can meet somewhere else", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await groupOf(env, host.id, {
      locations: [
        { type: "link", url: null },
        { type: "in_person", address: "1 Main St" },
      ],
    });
    const { booking: a } = await createBooking(
      env,
      seat(eventType.id, "a", { location: room }),
      deps,
      actor,
    );
    await cancelBooking(env, a.id, deps, actor);
    const place = { type: "in_person" as const, address: "1 Main St" };
    const { booking: b } = await createBooking(
      env,
      seat(eventType.id, "b", { location: place }),
      deps,
      actor,
    );
    expect(b.location).toEqual(place);
  });

  test("a booker's browser can't put its own link in front of the others", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await groupOf(env, host.id, { locations: [room] });
    const booker = { kind: "booker_session", id: "sess_1" } as const;
    await createBooking(
      env,
      seat(eventType.id, "a", { location: elsewhere, locationFromBrowser: true }),
      deps,
      booker,
    );
    const { booking: b } = await createBooking(env, seat(eventType.id, "b"), deps, booker);
    expect(b.location).toEqual(room);
  });

  test("one attendee's phone number isn't shown to the others", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await groupOf(env, host.id, { locations: [{ type: "phone", number: null }] });
    await createBooking(
      env,
      seat(eventType.id, "a", { location: { type: "phone", number: "+15551234567" } }),
      deps,
      actor,
    );
    const { booking: b } = await createBooking(env, seat(eventType.id, "b"), deps, actor);
    expect(b.location).toEqual({ type: "phone", number: null });
  });

  test("changing one seat's location changes the session's, and tells the others", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await groupOf(env, host.id, { locations: [{ type: "link", url: null }] });
    const { booking: a } = await createBooking(env, seat(eventType.id, "a"), deps, actor);
    const { booking: b } = await createBooking(env, seat(eventType.id, "b"), deps, actor);
    await updateBookingLocation(env, a.id, room, deps, actor);
    expect((await getBooking(env, b.id, deps)).location).toEqual(room);
    const { rows } = await db.execute(sql`
      select count(distinct resource_id)::int as seats from log_entry
      where environment_id = ${env.environmentId}
        and type = 'scheduling.booking.location_ready'`);
    expect((rows[0] as { seats: number }).seats).toBe(2);
  });

  test("is redacted with its seats' details", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await groupOf(env, host.id, { locations: [room] });
    const { booking } = await createBooking(env, seat(eventType.id, "a"), deps, actor);
    await redactExpiredBookings({
      now: new Date(at("10:00") + 91 * 86_400_000),
      scope: scope(env),
    });
    const [session] = await db
      .select()
      .from(schema.schedulingGroupSession)
      .where(eq(schema.schedulingGroupSession.id, booking.group_session as string));
    expect(session?.location).toBeNull();
    expect((await getBooking(env, booking.id, deps)).location).toBeNull();
  });
});

test("a host with past group seats can be deleted, and the seats stay", async () => {
  const env = await tenantEnv();
  const host = await hostWithHours(env);
  const eventType = await groupOf(env, host.id);
  const { booking } = await createBooking(env, seat(eventType.id, "p1"), deps, actor);
  await cancelBooking(env, booking.id, deps, actor);
  await deleteHost(env, host.id);
  const after = await getBooking(env, booking.id, deps);
  expect(after.status).toBe("cancelled");
  expect(after.group_session).toBeNull();
});

test("someone who left a session isn't shown where its next meeting is", async () => {
  const env = await tenantEnv();
  const host = await hostWithHours(env);
  const eventType = await createEventType(env, {
    title: "Class",
    kind: "group",
    duration_minutes: 30,
    capacity: 3,
    locations: [{ type: "link", url: "https://meet.example.com/room" }],
    hosts: [{ host: host.id, role: "member", weight: 100, schedule: null }],
  } as never);
  const { booking } = await createBooking(env, seat(eventType.id, "a"), deps, actor);
  await cancelBooking(env, booking.id, deps, actor);
  expect((await getBooking(env, booking.id, deps)).location).toBeNull();
});

test("an expired seat reviving a session is held to hours again", async () => {
  const env = await tenantEnv();
  const host = await hostWithHours(env);
  const eventType = await groupOf(env, host.id);
  const { booking: hold } = await createHold(env, seat(eventType.id, "a"), deps, actor);
  await expireSeats(hold.group_session, [hold.id]);
  await db
    .update(schema.schedulingSchedule)
    .set({ rules: [{ days: [0, 1, 2, 3, 4, 5, 6], startMinute: 780, endMinute: 1020 }] })
    .where(eq(schema.schedulingSchedule.hostId, host.id));
  expect(await code(confirmHold(env, hold.id, { ifStillFree: true }, deps, actor))).toBe(
    "slot_unavailable",
  );
});
