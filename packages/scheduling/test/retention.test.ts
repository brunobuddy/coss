import { expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { RETENTION_DAYS } from "@coss/retention";
import { createTestTenant } from "@coss/tenancy/testing";
import { eq } from "drizzle-orm";
import {
  authenticateSchedulingSession,
  createBookerSession,
  createBooking,
  createEventType,
  createHost,
  createSchedule,
  eraseAttendee,
  getBooking,
  purgeExpiredBookings,
  purgeSchedulingLeftovers,
  redactExpiredBookings,
  type SchedulingEnvironment,
} from "../src/index.ts";
import { testSchedulingDeps } from "../src/testing.ts";

const deps = testSchedulingDeps();
const actor = { kind: "system" } as const;
const START = Date.parse("2031-01-06T09:00:00Z");
const DAY = 86_400_000;

async function booked() {
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
    questions: [{ key: "reason", type: "text", label: "Reason", required: false, options: [] }],
    hosts: [{ host: host.id, role: "member", weight: 100, schedule: null }],
  } as never);
  const { booking } = await createBooking(
    env,
    {
      eventType: eventType.id,
      startMs: START,
      attendee: { uid: "p", name: "Sam", email: "sam@example.com", time_zone: "UTC" },
      answers: { reason: "headache" },
      metadata: { chart: "123" },
    },
    deps,
    actor,
  );
  return {
    env,
    booking,
    eventTypeId: eventType.id,
    scope: { organizationIds: [env.organizationId] },
  };
}

const END = START + 30 * 60_000;

test("details go 90 days after the booking ends, not before; the booking stays", async () => {
  const { env, booking, scope } = await booked();
  const early = new Date(END + (RETENTION_DAYS.schedulingPersonalData - 1) * DAY);
  expect(await redactExpiredBookings({ now: early, scope })).toBe(0);
  expect((await getBooking(env, booking.id, deps)).attendees[0]?.email).toBe("sam@example.com");
  const late = new Date(END + (RETENTION_DAYS.schedulingPersonalData + 1) * DAY);
  expect(await redactExpiredBookings({ now: late, scope })).toBe(1);
  const after = await getBooking(env, booking.id, deps);
  expect(after.status).toBe("confirmed");
  expect(after.metadata).toEqual({});
  expect(after.attendees[0]).toMatchObject({ uid: null, name: null, email: null });
  expect(after.attendees[0]?.answers).toEqual({});
  const [row] = await db
    .select()
    .from(schema.schedulingAttendee)
    .where(eq(schema.schedulingAttendee.bookingId, booking.id));
  expect(row?.encryptedContact).toBeNull();
  expect(row?.emailHmac).toBeNull();
  expect(row?.encryptedAnswers).toBeNull();
  expect(await redactExpiredBookings({ now: late, scope })).toBe(0);
});

test("the rest goes at the policy's whole period, with its children", async () => {
  const { booking, scope } = await booked();
  const early = new Date(END + (RETENTION_DAYS.schedulingBookings - 1) * DAY);
  expect(await purgeExpiredBookings({ now: early, scope })).toBe(0);
  const late = new Date(END + (RETENTION_DAYS.schedulingBookings + 1) * DAY);
  expect(await purgeExpiredBookings({ now: late, scope })).toBe(1);
  for (const table of [schema.schedulingAttendee, schema.schedulingClaim]) {
    const rows = await db.select().from(table).where(eq(table.bookingId, booking.id));
    expect(rows).toEqual([]);
  }
});

test("erasing someone reaches only them, in this environment", async () => {
  const { env, booking } = await booked();
  const other = await booked();
  expect(await eraseAttendee(env, { uid: "p" })).toBe(1);
  expect((await getBooking(env, booking.id, deps)).attendees[0]?.email).toBeNull();
  expect((await getBooking(other.env, other.booking.id, deps)).attendees[0]?.email).toBe(
    "sam@example.com",
  );
});

test("erasing someone ends the booker sessions fixed to them, and only those", async () => {
  const { env, eventTypeId } = await booked();
  const mint = (uid: string) =>
    createBookerSession(
      env,
      {
        eventType: eventTypeId,
        attributes: { specialty: "dermatology" },
        attendee: { uid, name: "Sam", email: "sam@example.com", time_zone: "UTC" },
        publicUrl: null,
      },
      deps,
    );
  const theirs = await mint("p");
  const someoneElses = await mint("q");
  const stored = async (id: string) => {
    const [row] = await db
      .select()
      .from(schema.schedulingSession)
      .where(eq(schema.schedulingSession.id, id));
    return row;
  };
  expect((await stored(theirs.id))?.encryptedAttendee).not.toBeNull();
  await eraseAttendee(env, { uid: "p" });
  const erased = await stored(theirs.id);
  expect(erased?.encryptedAttendee).toBeNull();
  expect(erased?.encryptedAttributes).toBeNull();
  expect(erased?.attendeeUid).toBeNull();
  expect(erased?.revokedAt).not.toBeNull();
  await expect(authenticateSchedulingSession(theirs.token)).rejects.toThrow();
  const kept = await stored(someoneElses.id);
  expect(kept?.encryptedAttendee).not.toBeNull();
  expect(kept?.revokedAt).toBeNull();
});

test("leftovers go in batches, and what's still in use stays", async () => {
  const { env, eventTypeId, scope } = await booked();
  const mint = (expiresIn: number, now: Date) =>
    createBookerSession(env, { eventType: eventTypeId, expiresIn, publicUrl: null, now }, deps);
  const longAgo = new Date(Date.now() - 10 * DAY);
  for (let index = 0; index < 3; index++) await mint(60, longAgo);
  const live = await mint(3600, new Date());
  const buckets = ["2020-01", "2020-02", "2020-03"].map((period) => ({
    organizationId: env.organizationId,
    scope: "host",
    scopeId: env.environmentId,
    period,
    createdAt: longAgo,
  }));
  await db.insert(schema.schedulingLimitBucket).values(buckets);
  await db.insert(schema.schedulingLimitBucket).values({
    organizationId: env.organizationId,
    scope: "host",
    scopeId: env.environmentId,
    period: "2030-01",
  });
  const now = new Date(Date.now() + 60 * DAY);
  const bucketsOf = () =>
    db
      .select()
      .from(schema.schedulingLimitBucket)
      .where(eq(schema.schedulingLimitBucket.organizationId, env.organizationId));
  const first = await purgeSchedulingLeftovers({ limit: 2, scope, now: new Date() });
  expect(first[0]).toBe(2);
  expect(Math.max(...first)).toBe(2);
  const second = await purgeSchedulingLeftovers({ limit: 2, scope, now: new Date() });
  expect(second[0]).toBe(1);
  const [kept] = await db
    .select()
    .from(schema.schedulingSession)
    .where(eq(schema.schedulingSession.id, live.id));
  expect(kept).toBeDefined();
  expect(await bucketsOf()).toHaveLength(4);
  const later = await purgeSchedulingLeftovers({ limit: 2, scope, now });
  expect(later[2]).toBe(2);
  expect(await bucketsOf()).toHaveLength(2);
});
