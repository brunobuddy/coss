import { describe, expect, spyOn, test } from "bun:test";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { eq } from "drizzle-orm";
import {
  cancelBooking,
  createBooking,
  createEventType,
  createHost,
  createSchedule,
  eraseAttendee,
  getBooking,
  listBookingEvents,
  listBookings,
  redactExpiredBookings,
  rescheduleBooking,
  type SchedulingEnvironment,
  SchedulingError,
} from "../src/index.ts";
import { testSchedulingDeps } from "../src/testing.ts";

const deps = testSchedulingDeps();
const apiKey = { kind: "api_key", id: "key_test" } as const;
const attendee = { uid: "patient_1", name: "Sam Lee", email: "sam@example.com", time_zone: "UTC" };
const at = (time: string, date = "2031-01-06") => Date.parse(`${date}T${time}:00Z`);
const SECRET = "the-word-only-the-reason-has";

async function setUp() {
  const tenant = await createTestTenant();
  const env: SchedulingEnvironment = {
    organizationId: tenant.organization.id,
    projectId: tenant.project.id,
    environmentId: tenant.development.id,
    mode: "sandbox",
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
  const { booking } = await createBooking(
    env,
    { eventType: eventType.id, startMs: at("09:00"), attendee },
    deps,
    apiKey,
  );
  return { tenant, env, booking };
}

describe("a booking's history", () => {
  test("lists what happened, oldest first, and who did it", async () => {
    const { env, booking } = await setUp();
    await rescheduleBooking(env, booking.id, { startMs: at("10:00") }, deps, {
      kind: "manage_session",
      id: "sess_test",
    });
    await cancelBooking(env, booking.id, deps, { kind: "system" });

    const { data, hasMore } = await listBookingEvents(env, booking.id, { limit: 20 });

    expect(hasMore).toBe(false);
    expect(data.map((event) => event.sequence)).toEqual([1, 2, 3]);
    expect(data.map((event) => event.type)).toEqual([
      "scheduling.booking.confirmed",
      "scheduling.booking.rescheduled",
      "scheduling.booking.cancelled",
    ]);
    expect(data.map((event) => event.actor)).toEqual([
      { kind: "api_key", id: "key_test" },
      { kind: "manage_session", id: "sess_test" },
      { kind: "system", id: null },
    ]);
    expect(data[1]?.details).toEqual({ previous_start: new Date(at("09:00")).toISOString() });
    expect(data[0]?.object).toBe("scheduling.booking_event");
  });

  test("pages by the last id", async () => {
    const { env, booking } = await setUp();
    await rescheduleBooking(env, booking.id, { startMs: at("10:00") }, deps, apiKey);
    await rescheduleBooking(env, booking.id, { startMs: at("11:00") }, deps, apiKey);

    const first = await listBookingEvents(env, booking.id, { limit: 2 });
    expect(first.hasMore).toBe(true);
    const second = await listBookingEvents(env, booking.id, {
      limit: 2,
      after: first.data[1]?.id,
    });
    expect(second.hasMore).toBe(false);
    expect(second.data.map((event) => event.sequence)).toEqual([3]);
  });

  test("another environment's booking isn't there", async () => {
    const { booking } = await setUp();
    const other = await setUp();
    await expect(listBookingEvents(other.env, booking.id, { limit: 20 })).rejects.toBeInstanceOf(
      SchedulingError,
    );
  });
});

describe("cancelling", () => {
  test("says who did it, on every read", async () => {
    const { env, booking } = await setUp();
    expect(booking.cancelled_by).toBeNull();
    const cancelled = await cancelBooking(env, booking.id, deps, {
      kind: "manage_session",
      id: "sess_test",
    });
    expect(cancelled.cancelled_by).toBe("manage_session");
    const { data } = await listBookings(env, { limit: 5 }, deps);
    expect(data[0]?.cancelled_by).toBe("manage_session");
  });

  test("a second cancel changes neither who nor why", async () => {
    const { env, booking } = await setUp();
    await cancelBooking(env, booking.id, deps, apiKey, { reason: "first" });
    await cancelBooking(env, booking.id, deps, { kind: "system" }, { reason: "second" });
    const read = await getBooking(env, booking.id, deps);
    expect(read.cancelled_by).toBe("api_key");
    expect(read.cancellation_reason).toBe("first");
  });

  test("a reason comes back only from retrieving that booking", async () => {
    const { env, booking } = await setUp();
    const cancelled = await cancelBooking(env, booking.id, deps, apiKey, { reason: SECRET });

    expect(cancelled.cancellation_reason).toBeUndefined();
    expect((await getBooking(env, booking.id, deps)).cancellation_reason).toBe(SECRET);
    const { data: listed } = await listBookings(env, { limit: 5 }, deps);
    expect(listed[0]?.cancellation_reason).toBeUndefined();
    expect(JSON.stringify(await listBookingEvents(env, booking.id, { limit: 20 }))).not.toContain(
      SECRET,
    );
  });

  test("a reason is encrypted, and nothing else holds it", async () => {
    const { env, booking } = await setUp();
    const logged = spyOn(console, "log");
    await cancelBooking(env, booking.id, deps, apiKey, { reason: SECRET });
    const [row] = await db
      .select({ stored: schema.schedulingBooking.encryptedCancellationReason })
      .from(schema.schedulingBooking)
      .where(eq(schema.schedulingBooking.id, booking.id));
    expect(row?.stored).not.toContain(SECRET);
    const lines = await db
      .select()
      .from(schema.logEntry)
      .where(eq(schema.logEntry.environmentId, env.environmentId));
    expect(lines.length).toBeGreaterThan(0);
    expect(JSON.stringify(lines)).not.toContain(SECRET);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(SECRET);
    logged.mockRestore();
  });

  test("a blank reason is no reason", async () => {
    const { env, booking } = await setUp();
    await cancelBooking(env, booking.id, deps, apiKey, { reason: "   " });
    expect((await getBooking(env, booking.id, deps)).cancellation_reason).toBeNull();
  });

  test("a reason goes with the attendee's details", async () => {
    const { env, booking } = await setUp();
    await cancelBooking(env, booking.id, deps, apiKey, { reason: SECRET });
    await eraseAttendee(env, { uid: "patient_1" });
    expect((await getBooking(env, booking.id, deps)).cancellation_reason).toBeNull();
  });

  test("a booking whose details are gone takes no new reason", async () => {
    const redacted = await setUp();
    await redactExpiredBookings({
      now: new Date(at("09:00", "2033-01-01")),
      scope: { organizationIds: [redacted.tenant.organization.id] },
    });
    await cancelBooking(redacted.env, redacted.booking.id, deps, apiKey, { reason: SECRET });
    expect(
      (await getBooking(redacted.env, redacted.booking.id, deps)).cancellation_reason,
    ).toBeNull();

    const erased = await setUp();
    await eraseAttendee(erased.env, { uid: "patient_1" });
    await cancelBooking(erased.env, erased.booking.id, deps, apiKey, { reason: SECRET });
    expect((await getBooking(erased.env, erased.booking.id, deps)).cancellation_reason).toBeNull();
    expect((await getBooking(erased.env, erased.booking.id, deps)).status).toBe("cancelled");
  });

  test("erasing, redacting and cancelling at once don't deadlock", async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { env, tenant, booking } = await setUp();
      await Promise.all([
        cancelBooking(env, booking.id, deps, apiKey, { reason: SECRET }),
        eraseAttendee(env, { uid: "patient_1" }),
        redactExpiredBookings({
          now: new Date(at("09:00", "2033-01-01")),
          scope: { organizationIds: [tenant.organization.id] },
        }),
      ]);
      expect((await getBooking(env, booking.id, deps)).cancellation_reason).toBeNull();
    }
  });

  test("a reason goes when the booking's details expire", async () => {
    const { env, tenant, booking } = await setUp();
    await cancelBooking(env, booking.id, deps, apiKey, { reason: SECRET });
    await redactExpiredBookings({
      now: new Date(at("09:00", "2033-01-01")),
      scope: { organizationIds: [tenant.organization.id] },
    });
    expect((await getBooking(env, booking.id, deps)).cancellation_reason).toBeNull();
    expect((await getBooking(env, booking.id, deps)).cancelled_by).toBe("api_key");
  });
});
