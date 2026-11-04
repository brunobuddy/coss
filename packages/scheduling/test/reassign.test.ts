/** Giving a booking to another host: every kind, what's refused, races, and who's told what. */
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { db, schema } from "@coss/db";
import { uniqueSuffix } from "@coss/db/testing";
import { createTestTenant } from "@coss/tenancy/testing";
import { LATEST_API_VERSION } from "@coss/versioning";
import { createWebhookEndpoint, secretsKeyRing } from "@coss/webhooks";
import { testManagementDeps } from "@coss/webhooks/testing";
import { and, eq, inArray } from "drizzle-orm";
import {
  approveBooking,
  type CalendarDeps,
  cancelBooking,
  completeCalendarAuthorization,
  confirmHold,
  createBooking,
  createEventType,
  createHold,
  createHost,
  createOutOfOffice,
  createSchedule,
  eraseAttendee,
  getBooking,
  listEventTypeSlots,
  listReassignCandidates,
  reassignBooking,
  redactExpiredBookings,
  reencryptSchedulingData,
  rescheduleBooking,
  runDueCalendarSyncs,
  runDueCalendarWrites,
  runDueSchedulingNotifications,
  type SchedulingEmail,
  type SchedulingEnvironment,
  startCalendarAuthorization,
  updateEventType,
  updateHost,
  updateSettings,
} from "../src/index.ts";
import type { ReassignBookingRequestOutput } from "../src/schemas.ts";
import { FakeGoogleCalendarApi, FakeZoomApi, testSchedulingDeps } from "../src/testing.ts";

const ms = Date.parse;
const MONDAY = "2031-01-06";
const at = (time: string, day = MONDAY) => ms(`${day}T${time}:00Z`);
const NOW = new Date(at("00:00"));
const plain = testSchedulingDeps({ now: () => NOW });
const actor = { kind: "system" } as const;
const attendee = { uid: "p", name: "Sam Lee", email: "sam@example.com", time_zone: "UTC" };
const scope = (env: SchedulingEnvironment) => ({ organizationIds: [env.organizationId] });

async function environment(): Promise<SchedulingEnvironment> {
  const tenant = await createTestTenant();
  return {
    organizationId: tenant.organization.id,
    projectId: tenant.project.id,
    environmentId: tenant.production.id,
    mode: "live",
  };
}

async function host(
  env: SchedulingEnvironment,
  name: string,
  extra: { attributes?: Record<string, string>; email?: string } = {},
  hours = { start: "09:00", end: "17:00" },
) {
  const created = await createHost(env, { name, time_zone: "UTC", ...extra });
  await createSchedule(env, created.id, { rules: [{ days: [0, 1, 2, 3, 4, 5, 6], ...hours }] });
  return created;
}

const member = (entry: { id: string }) => ({
  host: entry.id,
  role: "member",
  weight: 100,
  schedule: null,
});
const required = (entry: { id: string }) => ({ ...member(entry), role: "required" });

const eventTypeWith = (
  env: SchedulingEnvironment,
  kind: string,
  hosts: unknown[],
  extra: Record<string, unknown> = {},
) => createEventType(env, { title: "Call", kind, duration_minutes: 30, hosts, ...extra } as never);

const change = (
  to: string | { auto: true; preferred_hosts?: string[] },
  extra: Partial<ReassignBookingRequestOutput> = {},
  from?: string,
): ReassignBookingRequestOutput => ({
  changes: [
    {
      ...(typeof to === "string" ? { to_host: to } : to),
      ...(from ? { from_host: from } : {}),
    },
  ],
  reason_code: "other",
  ...extra,
});

const reassign = (
  env: SchedulingEnvironment,
  id: string,
  input: ReassignBookingRequestOutput,
  deps = plain,
) => reassignBooking(env, id, input, deps, actor);

const claimsOf = (bookingId: string) =>
  db
    .select({ hostId: schema.schedulingClaim.hostId, liveUntil: schema.schedulingClaim.liveUntil })
    .from(schema.schedulingClaim)
    .where(eq(schema.schedulingClaim.bookingId, bookingId));

const fairUnits = async (eventTypeId: string, hostId: string) => {
  const [row] = await db
    .select({ units: schema.schedulingEventTypeHost.fairUnits })
    .from(schema.schedulingEventTypeHost)
    .where(
      and(
        eq(schema.schedulingEventTypeHost.eventTypeId, eventTypeId),
        eq(schema.schedulingEventTypeHost.hostId, hostId),
      ),
    );
  return row?.units;
};

/** Every future live booking of this environment has exactly one claim for each of its hosts. */
async function auditClaims(env: SchedulingEnvironment) {
  const bookings = await db
    .select()
    .from(schema.schedulingBooking)
    .where(
      and(
        eq(schema.schedulingBooking.environmentId, env.environmentId),
        inArray(schema.schedulingBooking.status, ["confirmed", "pending_approval", "held"]),
      ),
    );
  for (const booking of bookings) {
    if (booking.groupSessionId || booking.startAt <= NOW) continue;
    const hosts = await db
      .select({ hostId: schema.schedulingBookingHost.hostId })
      .from(schema.schedulingBookingHost)
      .where(eq(schema.schedulingBookingHost.bookingId, booking.id));
    const claims = await claimsOf(booking.id);
    expect(claims.map((claim) => claim.hostId).sort()).toEqual(
      hosts.map((row) => row.hostId).sort(),
    );
  }
}

async function oneOnOneBooking(extra: Record<string, unknown> = {}) {
  const env = await environment();
  const first = await host(env, "First");
  const second = await host(env, "Second");
  const eventType = await eventTypeWith(env, "one_on_one", [member(first)], extra);
  const { booking } = await createBooking(
    env,
    { eventType: eventType.id, startMs: at("10:00"), attendee },
    plain,
    actor,
  );
  return { env, first, second, eventType, booking };
}

async function poolBooking(attributes?: Record<string, string>) {
  const env = await environment();
  const first = await host(env, "First", { attributes: { specialty: "skin" } });
  const second = await host(env, "Second", { attributes: { specialty: "skin" } });
  const third = await host(env, "Third", { attributes: { specialty: "heart" } });
  const pool = await eventTypeWith(env, "pool", [member(first), member(second), member(third)]);
  const { booking } = await createBooking(
    env,
    { eventType: pool.id, startMs: at("10:00"), host: first.id, attendee, attributes },
    plain,
    actor,
  );
  return { env, first, second, third, pool, booking };
}

describe("a one-on-one", () => {
  test("goes to someone else, and keeps its id, time and attendee", async () => {
    const { env, first, second, eventType, booking } = await oneOnOneBooking();
    const moved = await reassign(env, booking.id, change(second.id, { overrides: ["any_host"] }));
    expect(moved.id).toBe(booking.id);
    expect(moved.hosts).toEqual([second.id]);
    expect(moved.start).toBe(booking.start);
    expect(moved.attendees[0]?.uid).toBe("p");
    expect((await claimsOf(booking.id)).map((claim) => claim.hostId)).toEqual([second.id]);
    await auditClaims(env);
    // The old host's time is free again, and the new host's isn't.
    const offered = await listEventTypeSlots(env, {
      eventTypeRef: eventType.id,
      fromMs: at("09:00"),
      toMs: at("17:00"),
      nowMs: NOW.getTime(),
    });
    expect(offered.map((slot) => slot.startMs)).toContain(at("10:00"));
    expect(first.id).not.toBe(second.id);
  });

  test("needs saying so when the new host doesn't take this event type", async () => {
    const { env, second, booking } = await oneOnOneBooking();
    await expect(reassign(env, booking.id, change(second.id))).rejects.toMatchObject({
      code: "invalid_reassignment",
    });
    expect((await getBooking(env, booking.id, plain)).hosts).not.toContain(second.id);
  });

  test("can be given back", async () => {
    const { env, first, second, booking } = await oneOnOneBooking();
    const anyHost = { overrides: ["any_host"] as const };
    await reassign(env, booking.id, change(second.id, { overrides: [...anyHost.overrides] }));
    const back = await reassign(env, booking.id, change(first.id, {}));
    expect(back.hosts).toEqual([first.id]);
    await auditClaims(env);
  });

  test("doesn't care that it's too soon or off the grid: it already exists", async () => {
    const env = await environment();
    const [first, second] = [await host(env, "First"), await host(env, "Second")];
    const eventType = await eventTypeWith(env, "one_on_one", [member(first)], {
      min_notice_minutes: 600,
    });
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("10:00"), attendee },
      testSchedulingDeps({ now: () => new Date(at("00:00")) }),
      actor,
    );
    const close = testSchedulingDeps({ now: () => new Date(at("09:55")) });
    const moved = await reassign(
      env,
      booking.id,
      change(second.id, { overrides: ["any_host"] }),
      close,
    );
    expect(moved.hosts).toEqual([second.id]);
  });
});

describe("what a host says about their time", () => {
  test("is checked, and says why not", async () => {
    const env = await environment();
    const first = await host(env, "First");
    const late = await host(env, "Late", {}, { start: "14:00", end: "17:00" });
    const pool = await eventTypeWith(env, "pool", [member(first), member(late)]);
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("10:00"), host: first.id, attendee },
      plain,
      actor,
    );
    await expect(reassign(env, booking.id, change(late.id))).rejects.toMatchObject({
      code: "reassign_target_unavailable",
      message: expect.stringContaining("outside_availability"),
    });
    expect((await getBooking(env, booking.id, plain)).hosts).toEqual([first.id]);
    await auditClaims(env);
  });

  test("can be overridden, with a note saying why", async () => {
    const env = await environment();
    const first = await host(env, "First");
    const late = await host(env, "Late", {}, { start: "14:00", end: "17:00" });
    const pool = await eventTypeWith(env, "pool", [member(first), member(late)]);
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("10:00"), host: first.id, attendee },
      plain,
      actor,
    );
    await expect(
      reassign(env, booking.id, change(late.id, { overrides: ["outside_availability"] })),
    ).rejects.toMatchObject({ code: "invalid_reassignment", param: "note" });
    const moved = await reassign(
      env,
      booking.id,
      change(late.id, { overrides: ["outside_availability"], note: "They agreed to come in." }),
    );
    expect(moved.hosts).toEqual([late.id]);
  });

  test("time off counts, and is overridable", async () => {
    const env = await environment();
    const [first, second] = [await host(env, "First"), await host(env, "Second")];
    const pool = await eventTypeWith(env, "pool", [member(first), member(second)]);
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("10:00"), host: first.id, attendee },
      plain,
      actor,
    );
    await createOutOfOffice(
      env,
      {
        host: second.id,
        start: new Date(at("09:00")).toISOString(),
        end: new Date(at("17:00")).toISOString(),
      },
      plain,
      actor,
      "api",
    );
    await expect(reassign(env, booking.id, change(second.id))).rejects.toMatchObject({
      code: "reassign_target_unavailable",
      message: expect.stringContaining("out_of_office"),
    });
    const moved = await reassign(
      env,
      booking.id,
      change(second.id, { overrides: ["out_of_office"], note: "They offered." }),
    );
    expect(moved.hosts).toEqual([second.id]);
  });

  test("someone already booked can never be overridden, whatever's asked", async () => {
    const env = await environment();
    const [first, second] = [await host(env, "First"), await host(env, "Second")];
    const pool = await eventTypeWith(env, "pool", [member(first), member(second)]);
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("10:00"), host: first.id, attendee },
      plain,
      actor,
    );
    await createBooking(
      env,
      {
        eventType: pool.id,
        startMs: at("10:00"),
        host: second.id,
        attendee: { ...attendee, uid: "q" },
      },
      plain,
      actor,
    );
    await expect(
      reassign(
        env,
        booking.id,
        change(second.id, {
          overrides: [
            "any_host",
            "out_of_office",
            "outside_availability",
            "host_busy",
            "limit_reached",
            "calendar_unverified",
          ],
          note: "Please.",
        }),
      ),
    ).rejects.toMatchObject({
      code: "reassign_target_unavailable",
      message: "That host already has something at this time.",
    });
    expect((await getBooking(env, booking.id, plain)).hosts).toEqual([first.id]);
    await auditClaims(env);
  });
});

describe("what's refused", () => {
  test("an ended booking", async () => {
    const { env, second, booking } = await oneOnOneBooking();
    await cancelBooking(env, booking.id, plain, actor);
    await expect(
      reassign(env, booking.id, change(second.id, { overrides: ["any_host"] })),
    ).rejects.toMatchObject({ code: "booking_not_changeable" });
  });

  test("an event type that says no", async () => {
    const { env, second, booking } = await oneOnOneBooking({ reassignment_enabled: false });
    await expect(
      reassign(env, booking.id, change(second.id, { overrides: ["any_host"] })),
    ).rejects.toMatchObject({ code: "booking_not_changeable" });
  });

  test("the host it already has, and someone who isn't on it", async () => {
    const { env, first, second, booking } = await oneOnOneBooking();
    await expect(
      reassign(env, booking.id, change(first.id, { overrides: ["any_host"] })),
    ).rejects.toMatchObject({ code: "invalid_reassignment" });
    await expect(
      reassign(env, booking.id, change(first.id, { overrides: ["any_host"] }, second.id)),
    ).rejects.toMatchObject({ code: "invalid_reassignment", param: "from_host" });
  });

  test("a disabled target, but not a disabled source: that's how someone leaves", async () => {
    const { env, first, second, booking } = await oneOnOneBooking();
    await updateHost(env, second.id, { status: "disabled" });
    await expect(
      reassign(env, booking.id, change(second.id, { overrides: ["any_host"] })),
    ).rejects.toMatchObject({ code: "reassign_target_unavailable" });
    await updateHost(env, second.id, { status: "active" });
    await updateHost(env, first.id, { status: "disabled" });
    const moved = await reassign(env, booking.id, change(second.id, { overrides: ["any_host"] }));
    expect(moved.hosts).toEqual([second.id]);
  });

  test("a change that doesn't say who, or says both", async () => {
    const { env, second, booking } = await oneOnOneBooking();
    const bad = (changes: ReassignBookingRequestOutput["changes"]) =>
      expect(reassign(env, booking.id, { changes, reason_code: "other" })).rejects.toMatchObject({
        code: "invalid_reassignment",
      });
    await bad([{}]);
    await bad([{ to_host: second.id, auto: true }]);
    await bad([{ to_host: second.id, preferred_hosts: [second.id] }]);
  });

  test("anything in another environment or organization", async () => {
    const { first, second, booking } = await oneOnOneBooking();
    const other = await environment();
    await expect(
      reassign(other, booking.id, change(second.id, { overrides: ["any_host"] })),
    ).rejects.toMatchObject({ code: "not_found" });
    const { env, booking: mine } = await oneOnOneBooking();
    await expect(
      reassign(env, mine.id, change(first.id, { overrides: ["any_host"] })),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("a pool", () => {
  test("moves its count with the booking, so nobody's owed one for it", async () => {
    const { env, first, second, pool, booking } = await poolBooking();
    expect(await fairUnits(pool.id, first.id)).toBe(1);
    expect(await fairUnits(pool.id, second.id)).toBe(0);
    await reassign(env, booking.id, change(second.id));
    expect(await fairUnits(pool.id, first.id)).toBe(0);
    expect(await fairUnits(pool.id, second.id)).toBe(1);
  });

  test("picks by itself: free, fair, and never who has it", async () => {
    const { env, first, booking } = await poolBooking();
    const moved = await reassign(env, booking.id, change({ auto: true }));
    expect(moved.hosts).not.toContain(first.id);
    expect(moved.hosts.length).toBe(1);
    await auditClaims(env);
  });

  test("tries who you'd prefer first, and goes on if they can't", async () => {
    const env = await environment();
    const first = await host(env, "First");
    const busy = await host(env, "Busy");
    const free = await host(env, "Free");
    const pool = await eventTypeWith(env, "pool", [member(first), member(busy), member(free)]);
    await createBooking(
      env,
      { eventType: pool.id, startMs: at("10:00"), host: busy.id, attendee },
      plain,
      actor,
    );
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("10:00"), host: first.id, attendee },
      plain,
      actor,
    );
    const moved = await reassign(
      env,
      booking.id,
      change({ auto: true, preferred_hosts: [busy.id, free.id] }),
    );
    expect(moved.hosts).toEqual([free.id]);
  });

  test("says so when nobody can take it, and leaves the booking alone", async () => {
    const env = await environment();
    const first = await host(env, "First");
    const late = await host(env, "Late", {}, { start: "14:00", end: "17:00" });
    const pool = await eventTypeWith(env, "pool", [member(first), member(late)]);
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("10:00"), host: first.id, attendee },
      plain,
      actor,
    );
    await expect(reassign(env, booking.id, change({ auto: true }))).rejects.toMatchObject({
      code: "no_reassign_candidate",
    });
    expect((await getBooking(env, booking.id, plain)).status).toBe("confirmed");
    await auditClaims(env);
  });

  test("keeps to what the booking was routed with", async () => {
    const { env, second, third, booking } = await poolBooking({ specialty: "skin" });
    const moved = await reassign(env, booking.id, change({ auto: true }));
    expect(moved.hosts).toEqual([second.id]);
    await expect(reassign(env, booking.id, change(third.id))).rejects.toMatchObject({
      code: "invalid_reassignment",
    });
  });

  test("won't guess when a booking can't say what it was routed with", async () => {
    const { env, second, booking } = await poolBooking();
    await db
      .update(schema.schedulingBooking)
      .set({ encryptedAttributes: null })
      .where(eq(schema.schedulingBooking.id, booking.id));
    await expect(reassign(env, booking.id, change({ auto: true }))).rejects.toMatchObject({
      code: "invalid_reassignment",
    });
    // Someone choosing a host by name knows who they're choosing.
    expect((await reassign(env, booking.id, change(second.id))).hosts).toEqual([second.id]);
  });
});

describe("a collective", () => {
  async function collective() {
    const env = await environment();
    const lead = await host(env, "Lead");
    const other = await host(env, "Other");
    const spare = await host(env, "Spare");
    const spare2 = await host(env, "Spare 2");
    const eventType = await eventTypeWith(env, "collective", [required(lead), required(other)]);
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("10:00"), attendee },
      plain,
      actor,
    );
    return { env, lead, other, spare, spare2, booking };
  }

  test("replaces one required host, leaving the other's claim alone", async () => {
    const { env, lead, other, spare, booking } = await collective();
    const before = await claimsOf(booking.id);
    const moved = await reassign(
      env,
      booking.id,
      change(spare.id, { overrides: ["any_host"] }, lead.id),
    );
    expect(moved.hosts.sort()).toEqual([other.id, spare.id].sort());
    const after = await claimsOf(booking.id);
    expect(after.map((claim) => claim.hostId).sort()).toEqual([other.id, spare.id].sort());
    expect(before.length).toBe(2);
    await auditClaims(env);
  });

  test("has to say which one", async () => {
    const { env, spare, booking } = await collective();
    await expect(
      reassign(env, booking.id, change(spare.id, { overrides: ["any_host"] })),
    ).rejects.toMatchObject({ code: "invalid_reassignment", param: "from_host" });
  });

  test("replaces several at once, or none of them", async () => {
    const { env, lead, other, spare, spare2, booking } = await collective();
    const both: ReassignBookingRequestOutput = {
      changes: [
        { from_host: lead.id, to_host: spare.id },
        { from_host: other.id, to_host: spare2.id },
      ],
      reason_code: "other",
      overrides: ["any_host"],
    };
    await db
      .update(schema.schedulingHost)
      .set({ status: "disabled" })
      .where(eq(schema.schedulingHost.id, spare2.id));
    await expect(reassign(env, booking.id, both)).rejects.toMatchObject({
      code: "reassign_target_unavailable",
    });
    expect((await getBooking(env, booking.id, plain)).hosts.sort()).toEqual(
      [lead.id, other.id].sort(),
    );
    await db
      .update(schema.schedulingHost)
      .set({ status: "active" })
      .where(eq(schema.schedulingHost.id, spare2.id));
    expect((await reassign(env, booking.id, both)).hosts.sort()).toEqual(
      [spare.id, spare2.id].sort(),
    );
    await auditClaims(env);
  });
});

describe("someone taken off the event type", () => {
  test("`any_host` can name them, without putting them back on it", async () => {
    const env = await environment();
    const [first, second, former] = [
      await host(env, "First"),
      await host(env, "Second"),
      await host(env, "Former"),
    ];
    const pool = await eventTypeWith(env, "pool", [member(first), member(second), member(former)]);
    await updateEventType(env, pool.id, { hosts: [member(first), member(second)] } as never);
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("10:00"), host: first.id, attendee },
      plain,
      actor,
    );
    await expect(reassign(env, booking.id, change(former.id))).rejects.toBeDefined();
    const moved = await reassign(
      env,
      booking.id,
      change(former.id, { overrides: ["any_host"], note: "They said they'd take it" }),
    );
    expect(moved.hosts).toEqual([former.id]);
    const [membership] = await db
      .select({ removedAt: schema.schedulingEventTypeHost.removedAt })
      .from(schema.schedulingEventTypeHost)
      .where(
        and(
          eq(schema.schedulingEventTypeHost.eventTypeId, pool.id),
          eq(schema.schedulingEventTypeHost.hostId, former.id),
        ),
      );
    expect(membership?.removedAt).not.toBeNull();
    await auditClaims(env);
  });
});

const ANY_HOST = { overrides: ["any_host" as const], note: "They said they'd take it" };

describe("holds and requests", () => {
  // A hold's expiry comes from the database's clock, so these run on the real one.
  const real = testSchedulingDeps();
  const future = Date.now() + 40 * 86_400_000;
  const dayOf = new Date(future).toISOString().slice(0, 10);

  async function pair(extra: Record<string, unknown> = {}) {
    const env = await environment();
    const [first, second] = [await host(env, "First"), await host(env, "Second")];
    const pool = await eventTypeWith(env, "pool", [member(first), member(second)], extra);
    return { env, first, second, pool };
  }

  test("a hold keeps its expiry, and can still be confirmed", async () => {
    const { env, first, second, pool } = await pair();
    const { booking: hold } = await createHold(
      env,
      { eventType: pool.id, startMs: at("10:00", dayOf), host: first.id, attendee },
      real,
      actor,
    );
    const [before] = await claimsOf(hold.id);
    const moved = await reassign(env, hold.id, change(second.id), real);
    expect(moved.status).toBe("held");
    const [after] = await claimsOf(hold.id);
    expect(after?.hostId).toBe(second.id);
    expect(after?.liveUntil?.getTime()).toBeLessThanOrEqual(before?.liveUntil?.getTime() as number);
    expect(Date.parse(moved.hold_expires_at as string)).toBeLessThanOrEqual(
      Date.parse(hold.hold_expires_at as string),
    );
    const confirmed = await confirmHold(env, hold.id, {}, real, actor);
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.hosts).toEqual([second.id]);
    await auditClaims(env);
  });

  test("waiting for the new host's lock comes out of a hold's time", async () => {
    const { env, first, second, pool } = await pair();
    const { booking: hold } = await createHold(
      env,
      { eventType: pool.id, startMs: at("12:00", dayOf), host: first.id, attendee },
      real,
      actor,
    );
    const [before] = await claimsOf(hold.id);
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked = () => {};
    const holding = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const blocker = db.transaction(async (tx) => {
      await tx
        .select({ id: schema.schedulingHost.id })
        .from(schema.schedulingHost)
        .where(eq(schema.schedulingHost.id, second.id))
        .for("update");
      locked();
      await gate;
    });
    await holding;
    const moving = reassign(env, hold.id, change(second.id), real);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    release();
    await blocker;
    await moving;
    const [after] = await claimsOf(hold.id);
    expect(after?.hostId).toBe(second.id);
    expect(after?.liveUntil?.getTime()).toBeLessThanOrEqual(before?.liveUntil?.getTime() as number);
  });

  test("a hold that's run out can't move, rather than getting more time", async () => {
    const { env, first, second, pool } = await pair();
    const { booking: hold } = await createHold(
      env,
      { eventType: pool.id, startMs: at("11:00", dayOf), host: first.id, attendee },
      real,
      actor,
    );
    await db
      .update(schema.schedulingClaim)
      .set({
        liveFrom: new Date(Date.now() - 120_000),
        liveUntil: new Date(Date.now() - 60_000),
      })
      .where(eq(schema.schedulingClaim.bookingId, hold.id));
    await expect(reassign(env, hold.id, change(second.id), real)).rejects.toMatchObject({
      code: "hold_expired",
    });
  });

  test("a request's new host is who gets to approve it", async () => {
    const { env, first, second, pool } = await pair({ requires_approval: true });
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("12:00", dayOf), host: first.id, attendee },
      real,
      actor,
    );
    expect(booking.status).toBe("pending_approval");
    const moved = await reassign(env, booking.id, change(second.id), real);
    expect(moved.status).toBe("pending_approval");
    expect(moved.hosts).toEqual([second.id]);
    const approved = await approveBooking(env, booking.id, real, actor);
    expect(approved.hosts).toEqual([second.id]);
    expect(approved.status).toBe("confirmed");
    await auditClaims(env);
  });
});

describe("one that's already started", () => {
  test("changes for the record: no claim, no calendar, nobody told", async () => {
    const { env, second, booking } = await oneOnOneBooking();
    const later = testSchedulingDeps({ now: () => new Date(at("12:00")) });
    const moved = await reassign(
      env,
      booking.id,
      change(second.id, { overrides: ["any_host"] }),
      later,
    );
    expect(moved.hosts).toEqual([second.id]);
    expect(await claimsOf(booking.id)).toEqual([]);
    const notices = await db
      .select()
      .from(schema.schedulingNotification)
      .where(
        and(
          eq(schema.schedulingNotification.bookingId, booking.id),
          eq(schema.schedulingNotification.kind, "reassigned"),
        ),
      );
    expect(notices).toEqual([]);
  });

  test("doesn't move the pool's count: that was decided when it happened", async () => {
    const { env, first, second, pool, booking } = await poolBooking();
    const later = testSchedulingDeps({ now: () => new Date(at("12:00")) });
    await reassign(env, booking.id, change(second.id), later);
    expect(await fairUnits(pool.id, first.id)).toBe(1);
    expect(await fairUnits(pool.id, second.id)).toBe(0);
  });
});

describe("a group session", () => {
  async function session() {
    const env = await environment();
    const first = await host(env, "First");
    const second = await host(env, "Second");
    const group = await eventTypeWith(env, "group", [member(first)], { capacity: 5 });
    const book = (uid: string) =>
      createBooking(
        env,
        { eventType: group.id, startMs: at("10:00"), attendee: { ...attendee, uid } },
        plain,
        actor,
      ).then((result) => result.booking);
    const seats = [await book("a"), await book("b"), await book("c")];
    return { env, first, second, group, seats };
  }

  test("moves as a whole, from any seat", async () => {
    const { env, first, second, seats } = await session();
    const [one, two, three] = seats as [(typeof seats)[0], (typeof seats)[0], (typeof seats)[0]];
    const moved = await reassign(env, two.id, change(second.id, { overrides: ["any_host"] }));
    expect(moved.id).toBe(two.id);
    expect(moved.hosts).toEqual([second.id]);
    for (const seat of [one, three]) {
      expect((await getBooking(env, seat.id, plain)).hosts).toEqual([second.id]);
    }
    const sessionId = one.group_session as string;
    const [row] = await db
      .select()
      .from(schema.schedulingGroupSession)
      .where(eq(schema.schedulingGroupSession.id, sessionId));
    expect(row?.hostId).toBe(second.id);
    const claims = await db
      .select()
      .from(schema.schedulingClaim)
      .where(eq(schema.schedulingClaim.groupSessionId, sessionId));
    expect(claims.map((claim) => claim.hostId)).toEqual([second.id]);
    expect(first.id).not.toBe(second.id);
  });

  test("leaves a seat that's already gone as it was", async () => {
    const { env, first, second, seats } = await session();
    const [one, two] = seats as [(typeof seats)[0], (typeof seats)[0]];
    await cancelBooking(env, one.id, plain, actor);
    await reassign(env, two.id, change(second.id, { overrides: ["any_host"] }));
    const gone = await getBooking(env, one.id, plain);
    expect(gone.status).toBe("cancelled");
    expect(gone.hosts).toEqual([first.id]);
  });

  test("can be joined afterwards, with its new host", async () => {
    const { env, second, group, seats } = await session();
    await reassign(
      env,
      (seats[0] as (typeof seats)[0]).id,
      change(second.id, { overrides: ["any_host"] }),
    );
    await db
      .insert(schema.schedulingEventTypeHost)
      .values({
        eventTypeId: group.id,
        hostId: second.id,
        organizationId: env.organizationId,
        assigned: true,
      })
      .onConflictDoUpdate({
        target: [schema.schedulingEventTypeHost.eventTypeId, schema.schedulingEventTypeHost.hostId],
        set: { assigned: true },
      });
    const slots = await listEventTypeSlots(env, {
      eventTypeRef: group.id,
      fromMs: at("09:00"),
      toMs: at("11:00"),
      nowMs: NOW.getTime(),
      hostRef: second.id,
    });
    expect(slots.map((slot) => slot.startMs)).toContain(at("10:00"));
  });

  test("can't land on a session its new host is already running", async () => {
    const env = await environment();
    const [first, second] = [await host(env, "First"), await host(env, "Second")];
    const groupA = await eventTypeWith(env, "group", [member(first)], { capacity: 5 });
    const groupB = await eventTypeWith(env, "group", [member(second)], { capacity: 5 });
    const { booking } = await createBooking(
      env,
      { eventType: groupA.id, startMs: at("10:00"), attendee },
      plain,
      actor,
    );
    await createBooking(
      env,
      { eventType: groupB.id, startMs: at("10:00"), attendee },
      plain,
      actor,
    );
    await expect(
      reassign(env, booking.id, change(second.id, { overrides: ["any_host"] })),
    ).rejects.toMatchObject({ code: "reassign_target_unavailable" });
    expect((await getBooking(env, booking.id, plain)).hosts).toEqual([first.id]);
  });

  test("clears the way if its new host only had an empty old one at this time", async () => {
    const { env, first, second, group, seats } = await session();
    const [dead] = await db
      .insert(schema.schedulingGroupSession)
      .values({
        organizationId: env.organizationId,
        environmentId: env.environmentId,
        eventTypeId: group.id,
        hostId: second.id,
        startAt: new Date(at("10:00")),
        endAt: new Date(at("10:30")),
        capacity: 5,
      })
      .returning();
    const moved = await reassign(
      env,
      (seats[0] as (typeof seats)[0]).id,
      change(second.id, { overrides: ["any_host"] }),
    );
    expect(moved.hosts).toEqual([second.id]);
    const left = await db
      .select()
      .from(schema.schedulingGroupSession)
      .where(eq(schema.schedulingGroupSession.id, dead?.id as string));
    expect(left).toEqual([]);
    expect(first.id).not.toBe(second.id);
  });

  test("stays with its host once it's started", async () => {
    const { env, second, seats } = await session();
    await expect(
      reassign(
        env,
        (seats[0] as (typeof seats)[0]).id,
        change(second.id, { overrides: ["any_host"] }),
        testSchedulingDeps({ now: () => new Date(at("12:00")) }),
      ),
    ).rejects.toMatchObject({ code: "booking_not_changeable" });
  });

  test("tells the hosts once, and each seat's attendee", async () => {
    const { env, second, seats } = await session();
    await reassign(
      env,
      (seats[0] as (typeof seats)[0]).id,
      change(second.id, { overrides: ["any_host"] }),
    );
    const notices = await db
      .select()
      .from(schema.schedulingNotification)
      .where(
        and(
          eq(schema.schedulingNotification.organizationId, env.organizationId),
          eq(schema.schedulingNotification.kind, "reassigned"),
        ),
      );
    expect(notices.filter((row) => row.recipient === "host").length).toBe(2);
    expect(notices.filter((row) => row.recipient === "attendee").length).toBe(3);
  });
});

describe("races, on real Postgres", () => {
  test("many bookings going to one host at one time: only one gets there", async () => {
    // Enough at once that several pass the check before any has claimed, so it's the exclusion
    // constraint that decides, and whoever lost has to notice.
    for (let round = 0; round < 3; round++) {
      const env = await environment();
      const target = await host(env, "Target");
      const sources = [];
      for (let index = 0; index < 16; index++) sources.push(await host(env, `Source ${index}`));
      const pool = await eventTypeWith(env, "pool", [target, ...sources].map(member));
      const bookings = [];
      for (const [index, source] of sources.entries()) {
        const { booking } = await createBooking(
          env,
          {
            eventType: pool.id,
            startMs: at("10:00"),
            host: source.id,
            attendee: { ...attendee, uid: `a${index}` },
          },
          plain,
          actor,
        );
        bookings.push(booking);
      }
      const results = await Promise.allSettled(
        bookings.map((booking) => reassign(env, booking.id, change(target.id))),
      );
      expect(results.filter((result) => result.status === "fulfilled").length).toBe(1);
      const held = await db
        .select({ bookingId: schema.schedulingClaim.bookingId })
        .from(schema.schedulingClaim)
        .where(eq(schema.schedulingClaim.hostId, target.id));
      expect(held.length).toBe(1);
      await auditClaims(env);
    }
  });

  test("one booking going to two hosts at once ends up with one of them", async () => {
    for (let round = 0; round < 5; round++) {
      const { env, first, second, third, booking } = await poolBooking();
      const results = await Promise.allSettled([
        reassign(env, booking.id, change(second.id)),
        reassign(env, booking.id, change(third.id)),
      ]);
      expect(results.some((result) => result.status === "fulfilled")).toBe(true);
      const after = await getBooking(env, booking.id, plain);
      expect(after.hosts.length).toBe(1);
      expect(after.hosts[0]).not.toBe(first.id);
      await auditClaims(env);
    }
  });

  test("reassigning against cancelling and rescheduling leaves nothing out of step", async () => {
    for (let round = 0; round < 5; round++) {
      const { env, second, third, booking } = await poolBooking();
      await Promise.allSettled([
        reassign(env, booking.id, change(second.id)),
        round % 2
          ? cancelBooking(env, booking.id, plain, actor)
          : rescheduleBooking(env, booking.id, { startMs: at("11:00") }, plain, actor),
        reassign(env, booking.id, change(third.id)),
      ]);
      await auditClaims(env);
    }
  });

  test("swapping two hosts' bookings over at once can't deadlock them for good", async () => {
    for (let round = 0; round < 5; round++) {
      const env = await environment();
      const [a, b] = [await host(env, "A"), await host(env, "B")];
      const pool = await eventTypeWith(env, "pool", [member(a), member(b)]);
      const book = (id: string, time: string, uid: string) =>
        createBooking(
          env,
          {
            eventType: pool.id,
            startMs: at(time),
            host: id,
            attendee: { ...attendee, uid },
          },
          plain,
          actor,
        ).then((result) => result.booking);
      const [one, two] = [await book(a.id, "10:00", "x"), await book(b.id, "11:00", "y")];
      const results = await Promise.allSettled([
        reassign(env, one.id, change(b.id)),
        reassign(env, two.id, change(a.id)),
      ]);
      expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
      await auditClaims(env);
    }
  });
});

describe("preferred hosts and routing", () => {
  test("preferring someone doesn't make them fit how it was routed", async () => {
    const { env, third, booking } = await poolBooking({ specialty: "skin" });
    await expect(
      reassign(env, booking.id, change({ auto: true, preferred_hosts: [third.id] })),
    ).resolves.toMatchObject({ hosts: expect.not.arrayContaining([third.id]) });
  });

  test("with no one else, it's refused rather than going to them", async () => {
    const env = await environment();
    const first = await host(env, "First", { attributes: { specialty: "skin" } });
    const heart = await host(env, "Heart", { attributes: { specialty: "heart" } });
    const pool = await eventTypeWith(env, "pool", [member(first), member(heart)]);
    const { booking } = await createBooking(
      env,
      {
        eventType: pool.id,
        startMs: at("10:00"),
        host: first.id,
        attendee,
        attributes: { specialty: "skin" },
      },
      plain,
      actor,
    );
    await expect(
      reassign(env, booking.id, change({ auto: true, preferred_hosts: [heart.id] })),
    ).rejects.toMatchObject({ code: "no_reassign_candidate" });
    const moved = await reassign(
      env,
      booking.id,
      change({ auto: true, preferred_hosts: [heart.id] }, { overrides: ["any_host"] }),
    );
    expect(moved.hosts).toEqual([heart.id]);
  });

  test("a whole session keeps to its event type too", async () => {
    const env = await environment();
    const first = await host(env, "First");
    const outsider = await host(env, "Outsider");
    const group = await eventTypeWith(env, "group", [member(first)], { capacity: 3 });
    const { booking } = await createBooking(
      env,
      { eventType: group.id, startMs: at("10:00"), attendee },
      plain,
      actor,
    );
    await expect(
      reassign(env, booking.id, change({ auto: true, preferred_hosts: [outsider.id] })),
    ).rejects.toMatchObject({ code: "no_reassign_candidate" });
  });

  test("an event type that keeps its hosts can't change one by rescheduling either", async () => {
    const env = await environment();
    const first = await host(env, "First");
    const second = await host(env, "Second");
    const pool = await eventTypeWith(env, "pool", [member(first), member(second)], {
      reassignment_enabled: false,
    });
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("10:00"), host: first.id, attendee },
      plain,
      actor,
    );
    await expect(
      rescheduleBooking(env, booking.id, { startMs: at("11:00"), host: second.id }, plain, actor),
    ).rejects.toMatchObject({ code: "booking_not_changeable" });
    const same = await rescheduleBooking(
      env,
      booking.id,
      { startMs: at("11:00"), host: first.id },
      plain,
      actor,
    );
    expect(same.hosts).toEqual([first.id]);
  });
});

describe("where it happens", () => {
  /** A one-on-one that leaves its address to the host. */
  async function atHostsOffice(secondLocations: object[]) {
    const env = await environment();
    const first = await host(env, "First");
    const second = await host(env, "Second");
    await updateHost(env, first.id, {
      locations: [{ type: "in_person", address: "1 First Street" }],
    } as never);
    await updateHost(env, second.id, { locations: secondLocations } as never);
    const eventType = await eventTypeWith(env, "pool", [member(first), member(second)], {
      locations: [{ type: "in_person", address: null }],
    });
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("10:00"), host: first.id, attendee },
      plain,
      actor,
    );
    return { env, first, second, eventType, booking };
  }

  test("a host's own office goes with them, to the new host's", async () => {
    const { env, second, booking } = await atHostsOffice([
      { type: "in_person", address: "2 Second Street" },
    ]);
    expect(booking.location).toEqual({ type: "in_person", address: "1 First Street" });
    const moved = await reassign(env, booking.id, change(second.id));
    expect(moved.location).toEqual({ type: "in_person", address: "2 Second Street" });
  });

  test("a new host with no office of their own leaves it blank, not the old one's", async () => {
    const { env, second, booking } = await atHostsOffice([]);
    const moved = await reassign(env, booking.id, change(second.id));
    expect(moved.location).toEqual({ type: "in_person", address: null });
  });

  test("an address the event type names itself stays", async () => {
    const env = await environment();
    const first = await host(env, "First");
    const second = await host(env, "Second");
    const eventType = await eventTypeWith(env, "pool", [member(first), member(second)], {
      locations: [{ type: "in_person", address: "9 Clinic Road" }],
    });
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("10:00"), host: first.id, attendee },
      plain,
      actor,
    );
    const moved = await reassign(env, booking.id, change(second.id));
    expect(moved.location).toEqual({ type: "in_person", address: "9 Clinic Road" });
  });

  test("a whole session moves to the new host's office", async () => {
    const env = await environment();
    const first = await host(env, "First");
    const second = await host(env, "Second");
    await updateHost(env, first.id, {
      locations: [{ type: "in_person", address: "1 First Street" }],
    } as never);
    await updateHost(env, second.id, {
      locations: [{ type: "in_person", address: "2 Second Street" }],
    } as never);
    const group = await eventTypeWith(env, "group", [member(first)], {
      capacity: 3,
      locations: [{ type: "in_person", address: null }],
    });
    const { booking } = await createBooking(
      env,
      { eventType: group.id, startMs: at("10:00"), attendee },
      plain,
      actor,
    );
    expect(booking.location).toEqual({ type: "in_person", address: "1 First Street" });
    const moved = await reassign(env, booking.id, change(second.id, { overrides: ["any_host"] }));
    expect(moved.location).toEqual({ type: "in_person", address: "2 Second Street" });
  });

  test("a delegate's own office is the one that's used", async () => {
    const env = await environment();
    const first = await host(env, "First");
    const cover = await host(env, "Cover");
    await updateHost(env, first.id, {
      locations: [{ type: "in_person", address: "1 First Street" }],
    } as never);
    await updateHost(env, cover.id, {
      locations: [{ type: "in_person", address: "3 Cover Street" }],
    } as never);
    const eventType = await eventTypeWith(env, "one_on_one", [member(first)], {
      locations: [{ type: "in_person", address: null }],
    });
    await createOutOfOffice(
      env,
      {
        host: first.id,
        start: new Date(at("09:00")).toISOString(),
        end: new Date(at("13:00")).toISOString(),
        delegates: [cover.id],
      } as never,
      plain,
      actor,
      "api",
    );
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("10:00"), attendee },
      plain,
      actor,
    );
    expect(booking.hosts).toEqual([cover.id]);
    expect(booking.location).toEqual({ type: "in_person", address: "3 Cover Street" });
  });
});

describe("who's told", () => {
  const sender = () => {
    const sent: SchedulingEmail[] = [];
    return {
      sent,
      deps: {
        dataKeys: plain.dataKeys,
        now: () => NOW,
        publicUrl: "https://book.example.test",
        notifier: {
          email: async (message: SchedulingEmail) => {
            sent.push(message);
          },
        },
      },
    };
  };

  async function pair() {
    const env = await environment();
    const first = await host(env, "Dr. First", { email: "first@example.com" });
    const second = await host(env, "Dr. Second", { email: "second@example.com" });
    const pool = await eventTypeWith(env, "pool", [member(first), member(second)]);
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("10:00"), host: first.id, attendee },
      plain,
      actor,
    );
    const { deps: quiet } = sender();
    // What the booking itself sent isn't what's being looked at.
    await runDueSchedulingNotifications(quiet as never, { scope: scope(env) });
    return { env, first, second, pool, booking };
  }

  const subjectsTo = (sent: SchedulingEmail[], to: string) =>
    sent.filter((message) => message.to === to).map((message) => message.subject);

  test("both hosts and the attendee, each with what's theirs", async () => {
    const { env, second, booking } = await pair();
    await reassign(env, booking.id, change(second.id));
    const { sent, deps } = sender();
    await runDueSchedulingNotifications(deps as never, { scope: scope(env) });
    expect(subjectsTo(sent, "second@example.com")).toEqual(["Assigned to you: Call"]);
    expect(subjectsTo(sent, "first@example.com")).toEqual(["No longer yours: Call"]);
    expect(subjectsTo(sent, "sam@example.com")).toEqual(["New host: Call"]);
    const toFormer = sent.find((message) => message.to === "first@example.com");
    expect(toFormer?.ics?.method).toBe("CANCEL");
    const toNew = sent.find((message) => message.to === "second@example.com");
    expect(toNew?.ics?.method).toBe("REQUEST");
    const toAttendee = sent.find((message) => message.to === "sam@example.com");
    expect(toAttendee?.ics?.method).toBe("REQUEST");
    expect(toAttendee?.text).toContain("Reschedule or cancel");
  });

  test("a co-host who isn't changing hears nothing", async () => {
    const env = await environment();
    const lead = await host(env, "Lead", { email: "lead@example.com" });
    const other = await host(env, "Other", { email: "other@example.com" });
    const spare = await host(env, "Spare", { email: "spare@example.com" });
    const eventType = await eventTypeWith(env, "collective", [required(lead), required(other)]);
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("10:00"), attendee },
      plain,
      actor,
    );
    const { deps: quiet } = sender();
    await runDueSchedulingNotifications(quiet as never, { scope: scope(env) });
    await reassign(env, booking.id, change(spare.id, { overrides: ["any_host"] }, lead.id));
    const { sent, deps } = sender();
    await runDueSchedulingNotifications(deps as never, { scope: scope(env) });
    expect(subjectsTo(sent, "other@example.com")).toEqual([]);
    expect(subjectsTo(sent, "lead@example.com").length).toBe(1);
    expect(subjectsTo(sent, "spare@example.com").length).toBe(1);
  });

  test("the attendee can be left out, on request or by policy", async () => {
    const { env, second, booking } = await pair();
    await reassign(env, booking.id, change(second.id, { notify: { attendee: false } }));
    const { sent, deps } = sender();
    await runDueSchedulingNotifications(deps as never, { scope: scope(env) });
    expect(subjectsTo(sent, "sam@example.com")).toEqual([]);
    expect(subjectsTo(sent, "second@example.com").length).toBe(1);

    const other = await pair();
    await updateSettings(other.env, {
      notifications: { reassigned: { email_attendee: false, email_host: false } },
    });
    await reassign(other.env, other.booking.id, change(other.second.id));
    const second2 = sender();
    await runDueSchedulingNotifications(second2.deps as never, { scope: scope(other.env) });
    expect(second2.sent).toEqual([]);
  });

  test("going there and straight back says nothing stale", async () => {
    const { env, first, second, booking } = await pair();
    await reassign(env, booking.id, change(second.id));
    await reassign(env, booking.id, change(first.id));
    const { sent, deps } = sender();
    await runDueSchedulingNotifications(deps as never, { scope: scope(env) });
    // Nobody had heard about the first change, and the second undid it.
    expect(sent).toEqual([]);
  });

  test("going on to a third still tells the first, and not the one in between", async () => {
    const { env, booking, second } = await pair();
    const third = await host(env, "Dr. Third", { email: "third@example.com" });
    await reassign(env, booking.id, change(second.id));
    await reassign(env, booking.id, change(third.id, ANY_HOST));
    const { sent, deps } = sender();
    await runDueSchedulingNotifications(deps as never, { scope: scope(env) });
    expect(subjectsTo(sent, "first@example.com")).toEqual(["No longer yours: Call"]);
    expect(subjectsTo(sent, "second@example.com")).toEqual([]);
    expect(subjectsTo(sent, "third@example.com")).toEqual(["Assigned to you: Call"]);
    expect(subjectsTo(sent, "sam@example.com").length).toBe(1);
  });

  test("someone who heard they had it hears they've lost it", async () => {
    const { env, booking, second } = await pair();
    const third = await host(env, "Dr. Third", { email: "third@example.com" });
    await reassign(env, booking.id, change(second.id));
    const { sent, deps } = sender();
    await runDueSchedulingNotifications(deps as never, { scope: scope(env) });
    await reassign(env, booking.id, change(third.id, ANY_HOST));
    await runDueSchedulingNotifications(deps as never, { scope: scope(env) });
    expect(subjectsTo(sent, "second@example.com")).toEqual([
      "Assigned to you: Call",
      "No longer yours: Call",
    ]);
  });

  test("a reminder still goes, after the booking changes hands", async () => {
    const env = await environment();
    const first = await host(env, "Dr. First", { email: "first@example.com" });
    const second = await host(env, "Dr. Second", { email: "second@example.com" });
    const pool = await eventTypeWith(env, "pool", [member(first), member(second)]);
    // Far enough off to have a reminder at all.
    const day = "2031-01-10";
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("10:00", day), host: first.id, attendee },
      plain,
      actor,
    );
    await reassign(env, booking.id, change(second.id));
    const { deps: quiet } = sender();
    await runDueSchedulingNotifications(quiet as never, { scope: scope(env) });
    const { sent, deps } = sender();
    const later = new Date(at("10:00", "2031-01-09") + 60_000);
    await runDueSchedulingNotifications({ ...deps, now: () => later } as never, {
      scope: scope(env),
    });
    expect(sent.map((message) => message.subject)).toEqual(["Reminder: Call"]);
  });

  test("names the host only if the environment asks", async () => {
    const { env, second, booking } = await pair();
    await reassign(env, booking.id, change(second.id));
    const first = sender();
    await runDueSchedulingNotifications(first.deps as never, { scope: scope(env) });
    const quiet = first.sent.find((message) => message.to === "sam@example.com");
    expect(quiet?.text).not.toContain("Dr. Second");

    const other = await pair();
    await updateSettings(other.env, { name_host_in_attendee_emails: true });
    await reassign(other.env, other.booking.id, change(other.second.id));
    const next = sender();
    await runDueSchedulingNotifications(next.deps as never, { scope: scope(other.env) });
    const named = next.sent.find((message) => message.to === "sam@example.com");
    expect(named?.text).toContain("Your booking is now with Dr. Second");
  });

  test("a held booking tells nobody", async () => {
    const env = await environment();
    const [first, second] = [await host(env, "First"), await host(env, "Second")];
    const pool = await eventTypeWith(env, "pool", [member(first), member(second)]);
    const real = testSchedulingDeps();
    const day = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    const { booking } = await createHold(
      env,
      { eventType: pool.id, startMs: at("10:00", day), host: first.id, attendee },
      real,
      actor,
    );
    await reassign(env, booking.id, change(second.id), real);
    const notices = await db
      .select()
      .from(schema.schedulingNotification)
      .where(eq(schema.schedulingNotification.bookingId, booking.id));
    expect(notices).toEqual([]);
  });
});

describe("the reason and note", () => {
  async function withEndpoint() {
    const fixture = await poolBooking();
    await createWebhookEndpoint(
      {
        organizationId: fixture.env.organizationId,
        environmentId: fixture.env.environmentId,
        url: "https://hooks.example.com/coss",
        eventTypes: ["scheduling.booking.reassigned"],
        apiVersion: LATEST_API_VERSION,
        userId: null,
      },
      testManagementDeps,
    );
    return fixture;
  }

  const history = async (bookingId: string) =>
    db
      .select()
      .from(schema.schedulingBookingEvent)
      .where(
        and(
          eq(schema.schedulingBookingEvent.bookingId, bookingId),
          eq(schema.schedulingBookingEvent.type, "scheduling.booking.reassigned"),
        ),
      );

  test("say who had it in the webhook, and never why", async () => {
    const { env, first, second, booking } = await withEndpoint();
    await reassign(
      env,
      booking.id,
      change(second.id, { reason_code: "customer_request", note: "Patient asked for Dr. Second" }),
    );
    const [message] = await db
      .select()
      .from(schema.webhookMessage)
      .where(
        and(
          eq(schema.webhookMessage.organizationId, env.organizationId),
          eq(schema.webhookMessage.type, "scheduling.booking.reassigned"),
        ),
      );
    expect(message?.payload).toMatchObject({
      data: { host_ids: [second.id], previous_host_ids: [first.id], booking_id: booking.id },
    });
    const logs = await db
      .select()
      .from(schema.logEntry)
      .where(eq(schema.logEntry.organizationId, env.organizationId));
    const everything = JSON.stringify([message, logs]);
    expect(everything).not.toContain("Patient asked");
    expect(everything).not.toContain("customer_request");
  });

  test("the note's encrypted, and goes with the attendee's details", async () => {
    const { env, second, booking } = await poolBooking();
    await reassign(env, booking.id, change(second.id, { note: "Patient asked for Dr. Second" }));
    const [row] = await history(booking.id);
    expect(row?.encryptedNote).toBeTruthy();
    expect(row?.encryptedNote).not.toContain("Patient");
    expect(JSON.stringify(row?.details)).not.toContain("Patient");
    await eraseAttendee(env, { uid: "p" });
    expect((await history(booking.id))[0]?.encryptedNote).toBeNull();
  });

  test("and goes when the booking's redacted", async () => {
    const { env, second, booking } = await poolBooking();
    await reassign(env, booking.id, change(second.id, { note: "Patient asked" }));
    await redactExpiredBookings({
      now: new Date(at("10:00") + 200 * 86_400_000),
      scope: scope(env),
    });
    expect((await history(booking.id))[0]?.encryptedNote).toBeNull();
    // A redacted booking has nothing left to hand over.
    await expect(reassign(env, booking.id, change(second.id))).rejects.toMatchObject({
      code: "booking_not_changeable",
    });
  });

  test("the note's re-encrypted when the key rotates", async () => {
    const { env, second, booking } = await poolBooking();
    await reassign(env, booking.id, change(second.id, { note: "Patient asked" }));
    const next = secretsKeyRing([
      createHash("sha256").update("rotated").digest(),
      ...plain.dataKeys.keys.map((key) => key.key),
    ]);
    const result = await reencryptSchedulingData({ keys: next, scope: scope(env) });
    expect(result.unreadableCount).toBe(0);
    const [row] = await history(booking.id);
    expect(row?.encryptedNote?.startsWith(`v2:${next.primary.id}:`)).toBe(true);
  });
});

describe("meetings and calendars", () => {
  function deps(
    fetcher: CalendarDeps["fetcher"],
  ): CalendarDeps & { dataKeys: typeof plain.dataKeys } {
    return {
      dataKeys: plain.dataKeys,
      secretsKeys: secretsKeyRing([createHash("sha256").update("reassign").digest()]),
      apps: {
        google: { clientId: "google-client", clientSecret: "google-secret" },
        microsoft: null,
        zoom: { clientId: "zoom-client", clientSecret: "zoom-secret", webhookSecret: "token" },
      },
      publicUrl: "https://api.example.test",
      fetcher,
      now: () => NOW,
    };
  }

  async function connect(
    env: SchedulingEnvironment,
    hostId: string,
    provider: "google" | "zoom",
    calendarDeps: CalendarDeps,
  ) {
    const { url } = await startCalendarAuthorization(
      env,
      hostId,
      { provider, returnUrl: null },
      calendarDeps,
    );
    await completeCalendarAuthorization(
      {
        provider,
        state: new URL(url).searchParams.get("state") as string,
        code: "code",
        error: null,
      },
      calendarDeps,
    );
  }

  test("the old host's event goes and the new host's comes", async () => {
    const env = await environment();
    const [first, second] = [await host(env, "First"), await host(env, "Second")];
    const api = new FakeGoogleCalendarApi();
    const calendar = deps(api.fetch);
    await connect(env, first.id, "google", calendar);
    await connect(env, second.id, "google", calendar);
    await runDueCalendarSyncs(calendar, { scope: scope(env) });
    const pool = await eventTypeWith(env, "pool", [member(first), member(second)]);
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("10:00"), host: first.id, attendee },
      plain,
      actor,
    );
    await runDueCalendarWrites(calendar, { scope: scope(env) });
    const [original] = [...api.events.keys()];
    await reassign(env, booking.id, change(second.id));
    await runDueCalendarWrites(calendar, { scope: scope(env) });
    expect(api.events.get(original as string)?.deleted).toBe(true);
    const live = [...api.events.values()].filter((event) => !event.deleted);
    expect(live.length).toBe(1);
    expect(live[0]?.startMs).toBe(at("10:00"));
  });

  test("a Zoom meeting on someone staying survives, and one on who's leaving is remade", async () => {
    const env = await environment();
    const owner = await host(env, "Owner");
    const member1 = await host(env, "Member");
    const next = await host(env, "Next");
    const api = new FakeZoomApi();
    api.userId = `zoom_${uniqueSuffix()}`;
    const calendar = deps(api.fetch);
    await connect(env, owner.id, "zoom", calendar);
    const pool = await eventTypeWith(
      env,
      "pool",
      [required(owner), member(member1), member(next)],
      { locations: [{ type: "zoom", url: null }] },
    );
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("10:00"), host: member1.id, attendee },
      plain,
      actor,
    );
    await runDueCalendarWrites(calendar, { scope: scope(env) });
    const link = (await getBooking(env, booking.id, plain)).location;
    await reassign(env, booking.id, change(next.id, {}, member1.id));
    await runDueCalendarWrites(calendar, { scope: scope(env) });
    expect((await getBooking(env, booking.id, plain)).location).toEqual(link);
    expect(api.meetings.size).toBe(1);
  });
});

describe("rescheduling with a new host", () => {
  test("is a reassignment too, as far as anyone watching is concerned", async () => {
    const env = await environment();
    const first = await host(env, "First", { email: "first@example.com" });
    const second = await host(env, "Second", { email: "second@example.com" });
    const pool = await eventTypeWith(env, "pool", [member(first), member(second)]);
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("10:00"), host: first.id, attendee },
      plain,
      actor,
    );
    await rescheduleBooking(
      env,
      booking.id,
      { startMs: at("11:00"), host: second.id },
      plain,
      actor,
    );
    const history = await db
      .select({ type: schema.schedulingBookingEvent.type })
      .from(schema.schedulingBookingEvent)
      .where(eq(schema.schedulingBookingEvent.bookingId, booking.id));
    expect(history.map((row) => row.type)).toContain("scheduling.booking.reassigned");
    expect(await fairUnits(pool.id, second.id)).toBe(1);
    expect(await fairUnits(pool.id, first.id)).toBe(0);
    const sent: SchedulingEmail[] = [];
    await runDueSchedulingNotifications(
      {
        dataKeys: plain.dataKeys,
        now: () => NOW,
        publicUrl: null,
        notifier: {
          email: async (message: SchedulingEmail) => {
            sent.push(message);
          },
        },
      } as never,
      { scope: scope(env) },
    );
    expect(
      sent.some(
        (message) =>
          message.to === "first@example.com" && message.subject.startsWith("No longer yours"),
      ),
    ).toBe(true);
  });

  test("asking for the host it has just moves it", async () => {
    const { env, first, pool, booking } = await poolBooking();
    const before = await fairUnits(pool.id, first.id);
    const moved = await rescheduleBooking(
      env,
      booking.id,
      { startMs: at("11:00"), host: first.id },
      plain,
      actor,
    );
    expect(moved.hosts).toEqual([first.id]);
    expect(await fairUnits(pool.id, first.id)).toBe(before as number);
  });
});

describe("candidates", () => {
  test("say who's free, who isn't and why, members first, never who has it", async () => {
    const env = await environment();
    const first = await host(env, "First");
    const free = await host(env, "Free");
    const late = await host(env, "Late", {}, { start: "14:00", end: "17:00" });
    const outsider = await host(env, "Outsider");
    const away = await host(env, "Away");
    const pool = await eventTypeWith(env, "pool", [
      member(first),
      member(free),
      member(late),
      member(away),
    ]);
    await createOutOfOffice(
      env,
      {
        host: away.id,
        start: new Date(at("09:00")).toISOString(),
        end: new Date(at("17:00")).toISOString(),
      },
      plain,
      actor,
      "api",
    );
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("10:00"), host: first.id, attendee },
      plain,
      actor,
    );
    const { data } = await listReassignCandidates(env, booking.id, {}, plain);
    const byId = new Map(data.map((candidate) => [candidate.host, candidate]));
    expect(byId.has(first.id)).toBe(false);
    expect(byId.get(free.id)).toMatchObject({ member: true, available: true, reason: null });
    expect(byId.get(late.id)).toMatchObject({ available: false, reason: "outside_availability" });
    expect(byId.get(away.id)).toMatchObject({ available: false, reason: "out_of_office" });
    expect(byId.get(outsider.id)).toMatchObject({ member: false, rank: null });
    const lastMember = Math.max(
      ...data.flatMap((candidate, index) => (candidate.member ? [index] : [])),
    );
    const firstOther = data.findIndex((candidate) => !candidate.member);
    expect(lastMember).toBeLessThan(firstOther);
  });

  test("say when they'd leave it with no meeting", async () => {
    const env = await environment();
    const [first, second] = [await host(env, "First"), await host(env, "Second")];
    const pool = await eventTypeWith(env, "pool", [member(first), member(second)], {
      locations: [{ type: "zoom", url: null }],
    });
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("10:00"), host: first.id, attendee },
      plain,
      actor,
    );
    const { data } = await listReassignCandidates(env, booking.id, {}, plain);
    expect(data.find((candidate) => candidate.host === second.id)?.meeting_provider_missing).toBe(
      true,
    );
  });

  test("agree with what reassigning then does", async () => {
    const env = await environment();
    const first = await host(env, "First");
    const free = await host(env, "Free");
    const late = await host(env, "Late", {}, { start: "14:00", end: "17:00" });
    const pool = await eventTypeWith(env, "pool", [member(first), member(free), member(late)]);
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("10:00"), host: first.id, attendee },
      plain,
      actor,
    );
    const { data } = await listReassignCandidates(env, booking.id, {}, plain);
    for (const candidate of data) {
      const attempt = reassign(env, booking.id, change(candidate.host));
      if (candidate.available) {
        await attempt;
        await reassign(env, booking.id, change(first.id));
      } else {
        await expect(attempt).rejects.toMatchObject({ code: "reassign_target_unavailable" });
      }
    }
  });

  test("can't be read from another environment", async () => {
    const { booking } = await oneOnOneBooking();
    const other = await environment();
    await expect(listReassignCandidates(other, booking.id, {}, plain)).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
