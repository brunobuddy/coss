import { describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { eq } from "drizzle-orm";
import {
  approveBooking,
  cancelBooking,
  confirmHold,
  createBooking,
  createEventType,
  createHold,
  createHost,
  createSchedule,
  createSeries,
  rescheduleBooking,
  type SchedulingEnvironment,
  SchedulingError,
  updateEventType,
} from "../src/index.ts";
import { testSchedulingDeps } from "../src/testing.ts";

const deps = testSchedulingDeps();
const actor = { kind: "system" } as const;
const sam = { uid: "patient_1", name: "Sam Lee", email: "sam@example.com", time_zone: "UTC" };
const at = (time: string, date = "2031-01-06") => Date.parse(`${date}T${time}:00Z`);

async function setUp(limit: number | null, overrides: Record<string, unknown> = {}) {
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
    max_active_bookings_per_attendee: limit,
    ...overrides,
  } as never);
  const book = (time: string, attendee: Record<string, unknown> = sam, extra = {}) =>
    createBooking(
      env,
      { eventType: eventType.id, startMs: at(time), attendee: attendee as never, ...extra },
      deps,
      actor,
    );
  return { env, host, eventType, book };
}

async function code(run: Promise<unknown>): Promise<string> {
  try {
    await run;
    return "ok";
  } catch (error) {
    if (error instanceof SchedulingError) return error.code;
    throw error;
  }
}

describe("a limit on one person's bookings", () => {
  test("is off by default", async () => {
    const { book, eventType } = await setUp(null);
    expect(eventType.max_active_bookings_per_attendee).toBeNull();
    expect(await code(book("09:00"))).toBe("ok");
    expect(await code(book("10:00"))).toBe("ok");
  });

  test("refuses past the limit, and says nothing about their bookings", async () => {
    const { book } = await setUp(1);
    await book("09:00");
    let refusal: unknown;
    await book("10:00").catch((error) => {
      refusal = error;
    });
    expect(refusal).toBeInstanceOf(SchedulingError);
    expect((refusal as SchedulingError).code).toBe("attendee_limit_reached");
    expect((refusal as SchedulingError).status).toBe(422);
    expect((refusal as SchedulingError).message).not.toContain("2031");
    expect((refusal as SchedulingError).message).not.toContain("09:00");
  });

  test("knows someone by uid or by email, however it's written", async () => {
    const byUid = await setUp(1);
    await byUid.book("09:00");
    expect(await code(byUid.book("10:00", { uid: "patient_1", name: "S", time_zone: "UTC" }))).toBe(
      "attendee_limit_reached",
    );

    const byEmail = await setUp(1);
    await byEmail.book("09:00", { name: "Sam", email: "Sam@Example.com", time_zone: "UTC" });
    expect(
      await code(
        byEmail.book("10:00", { name: "Sam", email: " sam@example.COM ", time_zone: "UTC" }),
      ),
    ).toBe("attendee_limit_reached");
  });

  test("counts someone else separately, and can't count someone with no identity", async () => {
    const { book } = await setUp(1);
    await book("09:00");
    expect(
      await code(book("10:00", { uid: "patient_2", email: "kim@example.com", time_zone: "UTC" })),
    ).toBe("ok");
    expect(await code(book("11:00", { name: "Nameless", time_zone: "UTC" }))).toBe("ok");
    expect(await code(book("12:00", { name: "Nameless", time_zone: "UTC" }))).toBe("ok");
  });

  test("only counts this event type", async () => {
    const { env, host, book } = await setUp(1);
    await book("09:00");
    const other = await createEventType(env, {
      title: "Follow-up",
      kind: "one_on_one",
      duration_minutes: 30,
      hosts: [{ host: host.id, role: "member", weight: 100, schedule: null }],
      max_active_bookings_per_attendee: 1,
    } as never);
    expect(
      await code(
        createBooking(
          env,
          { eventType: other.id, startMs: at("10:00"), attendee: sam },
          deps,
          actor,
        ),
      ),
    ).toBe("ok");
  });

  test("gives the place back on cancelling, and once a booking has started", async () => {
    const { env, book } = await setUp(1);
    const { booking } = await book("09:00");
    expect(await code(book("10:00"))).toBe("attendee_limit_reached");

    await cancelBooking(env, booking.id, deps, actor);
    const { booking: second } = await book("10:00");

    await db
      .update(schema.schedulingBooking)
      .set({ startAt: new Date("2020-01-01T00:00:00Z"), endAt: new Date("2020-01-01T00:30:00Z") })
      .where(eq(schema.schedulingBooking.id, second.id));
    expect(await code(book("11:00"))).toBe("ok");
  });

  test("a guest on a booking isn't counted", async () => {
    const { book } = await setUp(1, { max_guests: 1 });
    await book("09:00", sam, { guests: [{ email: "kim@example.com" }] });
    expect(
      await code(book("10:00", { uid: "patient_2", email: "kim@example.com", time_zone: "UTC" })),
    ).toBe("ok");
  });

  test("a hold counts while it lasts, and confirming an expired one checks again", async () => {
    const { env, eventType, book } = await setUp(1);
    const { booking: hold } = await createHold(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee: sam },
      deps,
      actor,
    );
    expect(await code(book("10:00"))).toBe("attendee_limit_reached");

    await db
      .update(schema.schedulingBooking)
      .set({ holdExpiresAt: new Date("2020-01-01T00:00:00Z") })
      .where(eq(schema.schedulingBooking.id, hold.id));
    await db
      .update(schema.schedulingClaim)
      .set({
        liveFrom: new Date("2019-12-31T00:00:00Z"),
        liveUntil: new Date("2020-01-01T00:00:00Z"),
      })
      .where(eq(schema.schedulingClaim.bookingId, hold.id));
    expect(await code(book("10:00"))).toBe("ok");

    expect(await code(confirmHold(env, hold.id, { ifStillFree: true }, deps, actor))).toBe(
      "attendee_limit_reached",
    );
  });

  test("an expired seat in a session someone else keeps alive still has to fit", async () => {
    const { env, eventType, book } = await setUp(1, { kind: "group", capacity: 5 });
    const { booking: hold } = await createHold(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee: sam },
      deps,
      actor,
    );
    await book("09:00", { uid: "patient_2", email: "kim@example.com", time_zone: "UTC" });
    await db
      .update(schema.schedulingBooking)
      .set({ holdExpiresAt: new Date("2020-01-01T00:00:00Z") })
      .where(eq(schema.schedulingBooking.id, hold.id));
    expect(await code(book("10:00"))).toBe("ok");

    expect(await code(confirmHold(env, hold.id, { ifStillFree: true }, deps, actor))).toBe(
      "attendee_limit_reached",
    );
  });

  test("approving a request that lapsed has to fit, and one still waiting doesn't count twice", async () => {
    const { env, book } = await setUp(1, { requires_approval: true });
    const { booking: lapsed } = await book("09:00");
    expect(await code(book("10:00"))).toBe("attendee_limit_reached");
    await db
      .update(schema.schedulingBooking)
      .set({ approvalExpiresAt: new Date("2020-01-01T00:00:00Z") })
      .where(eq(schema.schedulingBooking.id, lapsed.id));
    await db
      .update(schema.schedulingClaim)
      .set({
        liveFrom: new Date("2019-12-31T00:00:00Z"),
        liveUntil: new Date("2020-01-01T00:00:00Z"),
      })
      .where(eq(schema.schedulingClaim.bookingId, lapsed.id));
    const { booking: second } = await book("10:00");

    expect(await code(approveBooking(env, lapsed.id, deps, actor))).toBe("attendee_limit_reached");
    expect(await code(approveBooking(env, second.id, deps, actor))).toBe("ok");
  });

  test("moving a past booking into the future has to fit, and moving a coming one doesn't", async () => {
    const { env, book } = await setUp(1);
    const { booking: past } = await book("09:00");
    await db
      .update(schema.schedulingBooking)
      .set({ startAt: new Date("2020-01-01T00:00:00Z"), endAt: new Date("2020-01-01T00:30:00Z") })
      .where(eq(schema.schedulingBooking.id, past.id));
    const { booking: coming } = await book("10:00");

    expect(await code(rescheduleBooking(env, past.id, { startMs: at("11:00") }, deps, actor))).toBe(
      "attendee_limit_reached",
    );
    expect(
      await code(rescheduleBooking(env, coming.id, { startMs: at("12:00") }, deps, actor)),
    ).toBe("ok");
  });

  test("a hold being confirmed and a new booking can't both take the last place", async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { env, eventType, book } = await setUp(1);
      const { booking: hold } = await createHold(
        env,
        { eventType: eventType.id, startMs: at("09:00"), attendee: sam },
        deps,
        actor,
      );
      const outcomes = await Promise.all([
        code(confirmHold(env, hold.id, {}, deps, actor)),
        code(book("10:00")),
      ]);
      expect(outcomes.filter((outcome) => outcome === "ok")).toHaveLength(1);
    }
  });

  test("confirming a live hold doesn't count it twice", async () => {
    const { env, eventType } = await setUp(1);
    const { booking: hold } = await createHold(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee: sam },
      deps,
      actor,
    );
    expect(await code(confirmHold(env, hold.id, {}, deps, actor))).toBe("ok");
  });

  test("a series counts each occurrence, and is refused whole", async () => {
    const { env, eventType, book } = await setUp(2);
    const series = (attendee: typeof sam) =>
      createSeries(
        env,
        {
          eventType: eventType.id,
          startMs: at("09:00", "2031-02-03"),
          attendee,
          recurrence: { frequency: "weekly", interval: 1, count: 3 },
          onConflict: "reject",
        } as never,
        deps,
        actor,
      );

    expect(await code(series(sam))).toBe("attendee_limit_reached");
    expect(await code(book("09:00"))).toBe("ok");
    expect(await code(book("10:00"))).toBe("ok");
    expect(await code(book("11:00"))).toBe("attendee_limit_reached");
  });

  test("two tabs racing for the last place get one booking", async () => {
    const { book } = await setUp(1);
    const outcomes = await Promise.all([
      code(book("09:00")),
      code(book("10:00")),
      code(book("11:00")),
      code(book("12:00")),
    ]);
    expect(outcomes.filter((outcome) => outcome === "ok")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === "attendee_limit_reached")).toHaveLength(3);
  });

  test("a retry with the same key replays instead of being refused", async () => {
    const { book } = await setUp(1);
    const first = await book("09:00", sam, { idempotencyKey: "retry-1" });
    const second = await book("09:00", sam, { idempotencyKey: "retry-1" });
    expect(second.booking.id).toBe(first.booking.id);
    expect(second.replayed).toBe(true);
  });

  test("can be raised and cleared", async () => {
    const { env, eventType, book } = await setUp(1);
    await book("09:00");
    expect(await code(book("10:00"))).toBe("attendee_limit_reached");

    const raised = await updateEventType(env, eventType.id, {
      max_active_bookings_per_attendee: 2,
    });
    expect(raised.max_active_bookings_per_attendee).toBe(2);
    expect(await code(book("10:00"))).toBe("ok");
    expect(await code(book("11:00"))).toBe("attendee_limit_reached");

    await updateEventType(env, eventType.id, { max_active_bookings_per_attendee: null });
    expect(await code(book("11:00"))).toBe("ok");
  });
});
