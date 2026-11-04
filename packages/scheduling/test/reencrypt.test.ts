import { describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedWithPrimary,
  secretsKeyRing,
} from "@coss/webhooks";
import { eq, sql } from "drizzle-orm";
import {
  createBookerSession,
  createBooking,
  createEventType,
  createHost,
  createSchedule,
  eraseAttendee,
  fixedAttendee,
  getBooking,
  reencryptSchedulingData,
  SCHEDULING_DATA_KEY_COLUMNS,
  type SchedulingDeps,
  type SchedulingEnvironment,
  sessionAttributes,
} from "../src/index.ts";
import { schedulingDataKeysFromEnv } from "../src/runtime.ts";
import { testSchedulingDeps } from "../src/testing.ts";

const { schedulingAttendee, schedulingSession } = schema;

const OLD_KEY = Buffer.alloc(32, 21);
const NEW_KEY = Buffer.alloc(32, 22);
const OTHER_KEY = Buffer.alloc(32, 23);
const before = secretsKeyRing([OLD_KEY]);
const during = secretsKeyRing([NEW_KEY, OLD_KEY]);
const after = secretsKeyRing([NEW_KEY]);

const depsWith = (dataKeys: SchedulingDeps["dataKeys"]) => testSchedulingDeps({ dataKeys });
const actor = { kind: "system" } as const;
const MONDAY = Date.parse("2031-01-06T00:00:00Z");
const HOUR = 3_600_000;
const SECRETS = ["Sam Lee", "sam@example.com", "peanuts"];

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
    rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59" }],
  });
  const eventType = await createEventType(env, {
    title: "Consultation",
    kind: "one_on_one",
    duration_minutes: 30,
    questions: [
      { key: "allergies", label: "Allergies", type: "text", required: false, options: [] },
    ],
    hosts: [{ host: host.id, role: "member", weight: 100, schedule: null }],
  } as never);
  return { env, eventType, scope: { organizationIds: [env.organizationId] } };
}

type Fixture = Awaited<ReturnType<typeof setUp>>;

async function book(
  fixture: Fixture,
  hour: number,
  keys: SchedulingDeps["dataKeys"],
  uid?: string,
) {
  const { booking } = await createBooking(
    fixture.env,
    {
      eventType: fixture.eventType.id,
      startMs: MONDAY + hour * HOUR,
      attendee: { uid, name: "Sam Lee", email: "sam@example.com", time_zone: "UTC" },
      answers: { allergies: "peanuts" },
    },
    depsWith(keys),
    actor,
  );
  return booking;
}

const attendeeRow = async (bookingId: string) => {
  const [row] = await db
    .select()
    .from(schedulingAttendee)
    .where(eq(schedulingAttendee.bookingId, bookingId));
  if (!row) throw new Error("no attendee");
  return row;
};

const bookerSession = (fixture: Fixture, keys: SchedulingDeps["dataKeys"]) =>
  createBookerSession(
    fixture.env,
    {
      eventType: fixture.eventType.id,
      attendee: { name: "Sam Lee", email: "sam@example.com", time_zone: "UTC" },
      publicUrl: null,
    },
    depsWith(keys),
  );

const sessionRow = async (id: string) => {
  const [row] = await db.select().from(schedulingSession).where(eq(schedulingSession.id, id));
  if (!row) throw new Error("no session");
  return row;
};

describe("reencryptSchedulingData", () => {
  test("lists every column this key ring encrypts, and no other", async () => {
    const { rows } = await db.execute<{ name: string }>(sql`
      select table_name || '.' || column_name as name
      from information_schema.columns
      where table_schema = 'public' and table_name like 'scheduling\\_%'
        and column_name like 'encrypted\\_%'
      order by 1
    `);
    // These hold the webhook key ring's values (`CalendarDeps.secretsKeys`).
    const onWebhookKeys = [
      "scheduling_calendar_connection.encrypted_credentials",
      "scheduling_holiday_calendar.encrypted_ics_url",
      "scheduling_calendar_delegation.encrypted_credentials",
      "scheduling_oauth_state.encrypted_code_verifier",
    ];
    expect(rows.map((row) => row.name)).toEqual(
      [...SCHEDULING_DATA_KEY_COLUMNS, ...onWebhookKeys].sort(),
    );
  });

  test("a dry run changes nothing, the real run moves old rows, and a rerun is a no-op", async () => {
    const fixture = await setUp();
    const { scope } = fixture;
    const old = await book(fixture, 9, before);
    const current = await book(fixture, 11, during);
    const oldSession = await bookerSession(fixture, before);
    await bookerSession(fixture, during);
    const oldRow = await attendeeRow(old.id);
    const currentRow = await attendeeRow(current.id);
    const oldSessionRow = await sessionRow(oldSession.id);

    // Two each of attendees, bookings and sessions, one of each on the old key.
    const planned = {
      checked: 6,
      reencrypted: 3,
      unreadableCount: 0,
      unreadable: [],
      conflicts: 0,
    };
    expect(await reencryptSchedulingData({ keys: during, scope, dryRun: true })).toEqual(planned);
    expect(await attendeeRow(old.id)).toEqual(oldRow);
    expect(await sessionRow(oldSession.id)).toEqual(oldSessionRow);

    expect(await reencryptSchedulingData({ keys: during, scope })).toEqual(planned);
    const moved = await attendeeRow(old.id);
    expect(moved.encryptedContact).not.toBe(oldRow.encryptedContact);
    expect(isEncryptedWithPrimary(moved.encryptedContact as string, during)).toBe(true);
    expect(isEncryptedWithPrimary(moved.encryptedAnswers as string, during)).toBe(true);
    expect(await attendeeRow(current.id)).toEqual(currentRow);

    const settled = await attendeeRow(old.id);
    const settledSession = await sessionRow(oldSession.id);
    expect(await reencryptSchedulingData({ keys: during, scope })).toEqual({
      ...planned,
      reencrypted: 0,
    });
    expect(await attendeeRow(old.id)).toEqual(settled);
    expect(await sessionRow(oldSession.id)).toEqual(settledSession);
  });

  test("the old key can go afterwards, and everything still decrypts through the product", async () => {
    const fixture = await setUp();
    const { env, scope } = fixture;
    const old = await book(fixture, 9, before);
    const session = await bookerSession(fixture, before);

    await expect(getBooking(env, old.id, depsWith(after))).rejects.toThrow();
    await reencryptSchedulingData({ keys: during, scope });

    const read = await getBooking(env, old.id, depsWith(after));
    expect(read.attendees[0]).toMatchObject({
      name: "Sam Lee",
      email: "sam@example.com",
      answers: { allergies: "peanuts" },
    });
    expect(fixedAttendee(await sessionRow(session.id), depsWith(after))).toMatchObject({
      name: "Sam Lee",
      email: "sam@example.com",
    });
    expect(await reencryptSchedulingData({ keys: after, scope })).toMatchObject({
      reencrypted: 0,
      unreadableCount: 0,
    });
  });

  test("a value with no answers keeps none, and a redacted attendee isn't looked at", async () => {
    const fixture = await setUp();
    const { env, scope } = fixture;
    const { booking } = await createBooking(
      env,
      {
        eventType: fixture.eventType.id,
        startMs: MONDAY + 9 * HOUR,
        attendee: { name: "Sam Lee", time_zone: "UTC" },
      },
      depsWith(before),
      actor,
    );
    const erased = await book(fixture, 11, before, "patient_erased");
    await eraseAttendee(env, { uid: "patient_erased" });

    // One attendee and its booking: erasing took what the other booking was routed with too.
    expect(await reencryptSchedulingData({ keys: during, scope })).toMatchObject({
      checked: 2,
      reencrypted: 2,
    });
    const row = await attendeeRow(booking.id);
    expect(row.encryptedAnswers).toBeNull();
    expect(isEncryptedWithPrimary(row.encryptedContact as string, during)).toBe(true);
    expect((await attendeeRow(erased.id)).encryptedContact).toBeNull();
  });

  test("reports a value no listed key decrypts, leaves that row alone, and finishes the rest", async () => {
    const fixture = await setUp();
    const { scope } = fixture;
    const unknown = secretsKeyRing([OTHER_KEY]);
    const lost = await book(fixture, 9, unknown);
    const fine = await book(fixture, 11, before);
    const lostRow = await attendeeRow(lost.id);
    const lostSession = await bookerSession(fixture, unknown);

    const result = await reencryptSchedulingData({ keys: during, scope });
    // The fine attendee and booking move. The lost attendee's two columns, booking and session don't.
    expect(result).toMatchObject({ checked: 5, reencrypted: 2, unreadableCount: 4, conflicts: 0 });
    expect(result.unreadable).toEqual(
      expect.arrayContaining([
        {
          id: lostRow.id,
          organizationId: fixture.env.organizationId,
          column: "scheduling_attendee.encrypted_contact",
          error: `Encrypted with key ${unknown.primary.id}, which is not in SCHEDULING_DATA_KEYS.`,
        },
        expect.objectContaining({
          column: "scheduling_attendee.encrypted_answers",
          id: lostRow.id,
        }),
        expect.objectContaining({
          column: "scheduling_session.encrypted_attendee",
          id: lostSession.id,
        }),
      ]),
    );
    expect(await attendeeRow(lost.id)).toEqual(lostRow);
    expect(
      isEncryptedWithPrimary((await attendeeRow(fine.id)).encryptedContact as string, during),
    ).toBe(true);
  });

  test("one readable column doesn't move while its neighbour can't be read", async () => {
    const fixture = await setUp();
    const { scope } = fixture;
    const booking = await book(fixture, 9, before);
    const row = await attendeeRow(booking.id);
    await db
      .update(schedulingAttendee)
      .set({ encryptedAnswers: encryptSecret("{}", secretsKeyRing([OTHER_KEY])) })
      .where(eq(schedulingAttendee.id, row.id));

    const result = await reencryptSchedulingData({ keys: during, scope });
    // Only the booking, whose one column can be read.
    expect(result).toMatchObject({ reencrypted: 1, unreadableCount: 1 });
    expect((await attendeeRow(booking.id)).encryptedContact).toBe(row.encryptedContact);
  });

  test("corrupt values are reported, not fatal", async () => {
    const fixture = await setUp();
    const { scope } = fixture;
    const booking = await book(fixture, 9, before);
    const row = await attendeeRow(booking.id);
    await db
      .update(schedulingAttendee)
      .set({ encryptedAnswers: "not a ciphertext" })
      .where(eq(schedulingAttendee.id, row.id));
    const result = await reencryptSchedulingData({ keys: during, scope });
    expect(result.unreadable).toEqual([
      {
        id: row.id,
        organizationId: fixture.env.organizationId,
        column: "scheduling_attendee.encrypted_answers",
        error: "No key in SCHEDULING_DATA_KEYS decrypts this value, or it's corrupt.",
      },
    ]);
  });

  test("an attendee erased while it runs stays erased", async () => {
    const fixture = await setUp();
    const { env, scope } = fixture;
    const booking = await book(fixture, 9, before, "patient_racing");
    const result = await reencryptSchedulingData({
      keys: during,
      scope,
      beforeWrite: async () => {
        await eraseAttendee(env, { uid: "patient_racing" });
      },
    });
    expect(result).toMatchObject({ reencrypted: 0, conflicts: 1 });
    const row = await attendeeRow(booking.id);
    expect(row.encryptedContact).toBeNull();
    expect(row.encryptedAnswers).toBeNull();
    expect(await reencryptSchedulingData({ keys: during, scope })).toMatchObject({
      checked: 0,
      conflicts: 0,
    });
  });

  test("racing erasures and new bookings for real, nothing erased comes back", async () => {
    const fixture = await setUp();
    const { env, scope } = fixture;
    const existing = [];
    for (let hour = 0; hour < 40; hour++) {
      existing.push(await book(fixture, hour, before, `patient_${hour}`));
    }
    const erased = existing.filter((_, index) => index % 2 === 0);
    const kept = existing.filter((_, index) => index % 2 === 1);

    const [first] = await Promise.all([
      reencryptSchedulingData({ keys: during, scope, batchSize: 5 }),
      ...existing.flatMap((_, index) =>
        index % 2 === 0 ? [eraseAttendee(env, { uid: `patient_${index}` })] : [],
      ),
      ...[40, 41, 42, 43, 44].map((hour) => book(fixture, hour, during)),
    ]);
    expect(first.unreadableCount).toBe(0);

    expect(await reencryptSchedulingData({ keys: during, scope })).toMatchObject({
      reencrypted: first.conflicts > 0 ? expect.any(Number) : 0,
      conflicts: 0,
      unreadableCount: 0,
    });
    for (const booking of erased) {
      const row = await attendeeRow(booking.id);
      expect(row.encryptedContact).toBeNull();
      expect(row.encryptedAnswers).toBeNull();
    }
    for (const booking of kept) {
      const read = await getBooking(env, booking.id, depsWith(after));
      expect(read.attendees[0]).toMatchObject({
        name: "Sam Lee",
        answers: { allergies: "peanuts" },
      });
    }
  });

  test("a session deleted while it runs is a conflict, and doesn't stop the run", async () => {
    const fixture = await setUp();
    const { scope } = fixture;
    const session = await bookerSession(fixture, before);
    const survivor = await bookerSession(fixture, before);
    const result = await reencryptSchedulingData({
      keys: during,
      scope,
      beforeWrite: async (id) => {
        if (id === session.id) {
          await db.delete(schedulingSession).where(eq(schedulingSession.id, session.id));
        }
      },
    });
    expect(result).toMatchObject({ reencrypted: 1, conflicts: 1 });
    expect(
      isEncryptedWithPrimary((await sessionRow(survivor.id)).encryptedAttendee as string, during),
    ).toBe(true);
  });

  test("a session's routing moves too, with or without an attendee", async () => {
    const fixture = await setUp();
    const routed = (attendee: boolean) =>
      createBookerSession(
        fixture.env,
        {
          eventType: fixture.eventType.id,
          attributes: { specialty: "dermatology" },
          ...(attendee ? { attendee: { name: "Sam", time_zone: "UTC" } } : {}),
          publicUrl: null,
        },
        depsWith(before),
      );
    const alone = await routed(false);
    const withAttendee = await routed(true);
    const result = await reencryptSchedulingData({ keys: during, scope: fixture.scope });
    expect(result).toMatchObject({ reencrypted: 2, conflicts: 0, unreadableCount: 0 });
    for (const session of [alone, withAttendee]) {
      const row = await sessionRow(session.id);
      expect(row.encryptedAttributes).not.toContain("dermatology");
      expect(isEncryptedWithPrimary(row.encryptedAttributes as string, during)).toBe(true);
      expect(sessionAttributes(row, depsWith(during))).toEqual({ specialty: "dermatology" });
    }
    expect((await sessionRow(alone.id)).encryptedAttendee).toBeNull();
  });

  test("batches reach every row, and the result holds no content or keys", async () => {
    const fixture = await setUp();
    const { scope } = fixture;
    for (const hour of [1, 3, 5, 7, 9]) await book(fixture, hour, before);
    await book(fixture, 11, secretsKeyRing([OTHER_KEY]));
    const result = await reencryptSchedulingData({ keys: during, scope, batchSize: 2 });
    expect(result).toMatchObject({ checked: 12, reencrypted: 10, unreadableCount: 3 });

    const reported = JSON.stringify(result);
    for (const secret of [
      ...SECRETS,
      ...[OLD_KEY, NEW_KEY, OTHER_KEY].map((key) => key.toString("base64")),
    ]) {
      expect(reported).not.toContain(secret);
    }
  });

  test("only the given organizations are touched", async () => {
    const fixture = await setUp();
    const other = await setUp();
    const booking = await book(other, 9, before);
    const row = await attendeeRow(booking.id);
    expect(await reencryptSchedulingData({ keys: during, scope: fixture.scope })).toMatchObject({
      checked: 0,
    });
    expect(await attendeeRow(booking.id)).toEqual(row);
  });
});

test("a missing key's error names the variable to look at", () => {
  const ring = (key: Buffer) =>
    schedulingDataKeysFromEnv({ SCHEDULING_DATA_KEYS: key.toString("base64") });
  const oldRing = ring(OLD_KEY);
  const newRing = ring(NEW_KEY);
  if (!oldRing || !newRing) throw new Error("Expected key rings.");
  expect(() => decryptSecret(encryptSecret("someone", oldRing), newRing)).toThrow(
    "which is not in SCHEDULING_DATA_KEYS",
  );
});
