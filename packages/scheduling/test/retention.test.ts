import { expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { RETENTION_DAYS } from "@coss/retention";
import { createTestTenant } from "@coss/tenancy/testing";
import { eq } from "drizzle-orm";
import {
  createBooking,
  createEventType,
  createHost,
  createSchedule,
  eraseAttendee,
  getBooking,
  purgeExpiredBookings,
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
  return { env, booking, scope: { organizationIds: [env.organizationId] } };
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
