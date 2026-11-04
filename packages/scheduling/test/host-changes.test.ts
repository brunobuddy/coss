/** What a booking's calendars, meetings and slots do when its hosts change. */
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { db, schema } from "@coss/db";
import { uniqueSuffix } from "@coss/db/testing";
import { createTestTenant } from "@coss/tenancy/testing";
import { isEncryptedWithPrimary, secretsKeyRing } from "@coss/webhooks";
import { and, eq } from "drizzle-orm";
import {
  type CalendarDeps,
  cancelBooking,
  completeCalendarAuthorization,
  createBooking,
  createEventType,
  createHost,
  createSchedule,
  decryptRouting,
  eraseAttendee,
  getBooking,
  listRescheduleSlots,
  redactExpiredBookings,
  reencryptSchedulingData,
  rescheduleBooking,
  runDueCalendarSyncs,
  runDueCalendarWrites,
  type SchedulingEnvironment,
  startCalendarAuthorization,
  updateEventType,
  updateHost,
} from "../src/index.ts";
import { FakeGoogleCalendarApi, FakeZoomApi, testSchedulingDeps } from "../src/testing.ts";

const ms = Date.parse;
const MONDAY = "2031-01-06";
const at = (time: string) => ms(`${MONDAY}T${time}:00Z`);
const NOW = new Date(at("00:00"));
const actor = { kind: "system" } as const;
const attendee = { uid: "p", name: "Sam Lee", email: "sam@example.com", time_zone: "UTC" };
const plain = testSchedulingDeps({ now: () => NOW });
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

async function hostWithHours(
  env: SchedulingEnvironment,
  name: string,
  extra: { attributes?: Record<string, string> } = {},
  hours = { start: "09:00", end: "17:00" },
) {
  const host = await createHost(env, { name, time_zone: "UTC", ...extra });
  await createSchedule(env, host.id, { rules: [{ days: [0, 1, 2, 3, 4, 5, 6], ...hours }] });
  return host;
}

function deps(
  fetcher: CalendarDeps["fetcher"],
): CalendarDeps & { dataKeys: typeof plain.dataKeys } {
  return {
    dataKeys: plain.dataKeys,
    secretsKeys: secretsKeyRing([createHash("sha256").update("host changes").digest()]),
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
  const state = new URL(url).searchParams.get("state") as string;
  const result = await completeCalendarAuthorization(
    { provider, state, code: "code", error: null },
    calendarDeps,
  );
  expect(result.outcome).toBe("connected");
}

async function zoomPool(
  env: SchedulingEnvironment,
  required: readonly { id: string }[],
  members: readonly { id: string }[],
) {
  return createEventType(env, {
    title: "Video",
    kind: "pool",
    duration_minutes: 30,
    locations: [{ type: "zoom", url: null }],
    hosts: [
      ...required.map((host) => ({
        host: host.id,
        role: "required",
        weight: 100,
        schedule: null,
      })),
      ...members.map((host) => ({ host: host.id, role: "member", weight: 100, schedule: null })),
    ],
  } as never);
}

const urlOf = (location: unknown) => (location as { url: string | null }).url;

/** Deauthorization looks a Zoom user up across every organization, and the test database is shared. */
function zoomApi(): FakeZoomApi {
  const api = new FakeZoomApi();
  api.userId = `zoom_${uniqueSuffix()}`;
  return api;
}

describe("Zoom when a booking's hosts change", () => {
  test("a replaced member doesn't take the required host's meeting with them", async () => {
    const env = await environment();
    const required = await hostWithHours(env, "Required");
    const member = await hostWithHours(env, "Member");
    const next = await hostWithHours(env, "Next");
    const api = zoomApi();
    const calendar = deps(api.fetch);
    await connect(env, required.id, "zoom", calendar);
    const pool = await zoomPool(env, [required], [member, next]);
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("09:00"), host: member.id, attendee },
      plain,
      actor,
    );
    await runDueCalendarWrites(calendar, { scope: scope(env) });
    const link = urlOf((await getBooking(env, booking.id, plain)).location);
    expect(link).toContain("zoom.us/j/");

    const moved = await rescheduleBooking(
      env,
      booking.id,
      { startMs: at("10:00"), host: next.id },
      plain,
      actor,
    );
    expect(urlOf(moved.location)).toBe(link);
    await runDueCalendarWrites(calendar, { scope: scope(env) });
    expect(urlOf((await getBooking(env, booking.id, plain)).location)).toBe(link);
    expect(api.meetings.size).toBe(1);
  });

  test("a new member with Zoom doesn't start a second meeting", async () => {
    const env = await environment();
    // Created first, so it sorts first: the old code picked whoever sorts first.
    const next = await hostWithHours(env, "Next");
    const required = await hostWithHours(env, "Required");
    const member = await hostWithHours(env, "Member");
    const api = zoomApi();
    const calendar = deps(api.fetch);
    await connect(env, required.id, "zoom", calendar);
    const pool = await zoomPool(env, [required], [member, next]);
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("09:00"), host: member.id, attendee },
      plain,
      actor,
    );
    await runDueCalendarWrites(calendar, { scope: scope(env) });
    const link = urlOf((await getBooking(env, booking.id, plain)).location);
    await connect(env, next.id, "zoom", calendar);

    await rescheduleBooking(env, booking.id, { startMs: at("10:00"), host: next.id }, plain, actor);
    await runDueCalendarWrites(calendar, { scope: scope(env) });
    expect(urlOf((await getBooking(env, booking.id, plain)).location)).toBe(link);
    expect(api.meetings.size).toBe(1);
  });

  test("when the host running the meeting leaves, someone still here runs a new one", async () => {
    const env = await environment();
    // Whoever sorts first runs the meeting, and two ids from one millisecond can go either way.
    const [member, required] = [
      await hostWithHours(env, "Member"),
      await hostWithHours(env, "Required"),
    ].sort((a, b) => (a.id < b.id ? -1 : 1)) as [
      Awaited<ReturnType<typeof hostWithHours>>,
      Awaited<ReturnType<typeof hostWithHours>>,
    ];
    const next = await hostWithHours(env, "Next");
    const api = zoomApi();
    const calendar = deps(api.fetch);
    await connect(env, member.id, "zoom", calendar);
    await connect(env, required.id, "zoom", calendar);
    const pool = await zoomPool(env, [required], [member, next]);
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("09:00"), host: member.id, attendee },
      plain,
      actor,
    );
    await runDueCalendarWrites(calendar, { scope: scope(env) });
    const link = urlOf((await getBooking(env, booking.id, plain)).location);

    const moved = await rescheduleBooking(
      env,
      booking.id,
      { startMs: at("10:00"), host: next.id },
      plain,
      actor,
    );
    expect(urlOf(moved.location)).toBeNull();
    await runDueCalendarWrites(calendar, { scope: scope(env) });
    const after = urlOf((await getBooking(env, booking.id, plain)).location);
    expect(after).toContain("zoom.us/j/");
    expect(after).not.toBe(link);
    expect(api.meetings.size).toBe(1);
  });

  test("a booking that goes to another host and back has one meeting and a working link", async () => {
    const env = await environment();
    const first = await hostWithHours(env, "First");
    const second = await hostWithHours(env, "Second");
    const api = zoomApi();
    const calendar = deps(api.fetch);
    await connect(env, first.id, "zoom", calendar);
    await connect(env, second.id, "zoom", calendar);
    const pool = await zoomPool(env, [], [first, second]);
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("09:00"), host: first.id, attendee },
      plain,
      actor,
    );
    await runDueCalendarWrites(calendar, { scope: scope(env) });
    for (const [time, host] of [
      ["10:00", second],
      ["11:00", first],
    ] as const) {
      await rescheduleBooking(env, booking.id, { startMs: at(time), host: host.id }, plain, actor);
      await runDueCalendarWrites(calendar, { scope: scope(env) });
    }
    const link = urlOf((await getBooking(env, booking.id, plain)).location) as string;
    expect(api.meetings.size).toBe(1);
    expect(link).toContain(String([...api.meetings.keys()][0]));
  });
});

describe("Google when a booking's hosts change", () => {
  async function meetPool(env: SchedulingEnvironment, hosts: readonly { id: string }[]) {
    return createEventType(env, {
      title: "Video",
      kind: "pool",
      duration_minutes: 30,
      locations: [{ type: "google_meet" }],
      hosts: hosts.map((host) => ({ host: host.id, role: "member", weight: 100, schedule: null })),
    } as never);
  }

  test("going to another host and back makes a new event rather than reusing a deleted key", async () => {
    const env = await environment();
    const first = await hostWithHours(env, "First");
    const second = await hostWithHours(env, "Second");
    const api = new FakeGoogleCalendarApi();
    const calendar = deps(api.fetch);
    await connect(env, first.id, "google", calendar);
    await connect(env, second.id, "google", calendar);
    await runDueCalendarSyncs(calendar, { scope: scope(env) });
    const pool = await meetPool(env, [first, second]);
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("09:00"), host: first.id, attendee },
      plain,
      actor,
    );
    await runDueCalendarWrites(calendar, { scope: scope(env) });
    const [firstEvent] = [...api.events.keys()];

    await rescheduleBooking(
      env,
      booking.id,
      { startMs: at("10:00"), host: second.id },
      plain,
      actor,
    );
    await runDueCalendarWrites(calendar, { scope: scope(env) });
    api.requests.length = 0;
    await rescheduleBooking(
      env,
      booking.id,
      { startMs: at("11:00"), host: first.id },
      plain,
      actor,
    );
    await runDueCalendarWrites(calendar, { scope: scope(env) });

    expect(api.requests.filter((request) => request.startsWith("PUT"))).toEqual([]);
    expect(api.events.get(firstEvent as string)?.deleted).toBe(true);
    const live = [...api.events.values()].filter((event) => !event.deleted);
    expect(live.map((event) => event.startMs)).toEqual([at("11:00")]);
    expect((await getBooking(env, booking.id, plain)).location?.type).toBe("link");
  });

  test("a Meet link stays when someone other than its host leaves, and is never on the wire", async () => {
    const env = await environment();
    const required = await hostWithHours(env, "Required");
    const member = await hostWithHours(env, "Member");
    const next = await hostWithHours(env, "Next");
    const api = new FakeGoogleCalendarApi();
    const calendar = deps(api.fetch);
    await connect(env, required.id, "google", calendar);
    await runDueCalendarSyncs(calendar, { scope: scope(env) });
    const pool = await createEventType(env, {
      title: "Video",
      kind: "pool",
      duration_minutes: 30,
      locations: [{ type: "google_meet" }],
      hosts: [
        { host: required.id, role: "required", weight: 100, schedule: null },
        { host: member.id, role: "member", weight: 100, schedule: null },
        { host: next.id, role: "member", weight: 100, schedule: null },
      ],
    } as never);
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("09:00"), host: member.id, attendee },
      plain,
      actor,
    );
    await runDueCalendarWrites(calendar, { scope: scope(env) });
    const before = await getBooking(env, booking.id, plain);
    expect(before.location).toEqual({ type: "link", url: "https://meet.google.com/abc-defg-hij" });

    const moved = await rescheduleBooking(
      env,
      booking.id,
      { startMs: at("10:00"), host: next.id },
      plain,
      actor,
    );
    expect(moved.location).toEqual(before.location);
    const [row] = await db
      .select({ location: schema.schedulingBooking.location })
      .from(schema.schedulingBooking)
      .where(eq(schema.schedulingBooking.id, booking.id));
    expect(row?.location).toMatchObject({ conference_host_id: required.id });
  });

  test("a co-host's event gets the Meet link when another host's event made it", async () => {
    const env = await environment();
    const required = await hostWithHours(env, "Required");
    const member = await hostWithHours(env, "Member");
    const api = new FakeGoogleCalendarApi();
    const calendar = deps(api.fetch);
    await connect(env, required.id, "google", calendar);
    await connect(env, member.id, "google", calendar);
    await runDueCalendarSyncs(calendar, { scope: scope(env) });
    const pool = await createEventType(env, {
      title: "Video",
      kind: "pool",
      duration_minutes: 30,
      locations: [{ type: "google_meet" }],
      hosts: [
        { host: required.id, role: "required", weight: 100, schedule: null },
        { host: member.id, role: "member", weight: 100, schedule: null },
      ],
    } as never);
    await createBooking(
      env,
      { eventType: pool.id, startMs: at("09:00"), host: member.id, attendee },
      plain,
      actor,
    );
    // Google creates a conference asynchronously, so the first event goes out with no link.
    api.conferencePendingNext = true;
    await runDueCalendarWrites(calendar, { scope: scope(env), limit: 1 });
    expect([...api.events.values()][0]?.location).toBeUndefined();
    await runDueCalendarWrites(calendar, { scope: scope(env), limit: 1 });
    await runDueCalendarWrites(calendar, { scope: scope(env), limit: 1 });
    const [first, second] = [...api.events.values()];
    expect(first?.location).toBe("https://meet.google.com/abc-defg-hij");
    // The event that made the link already shows it, and it isn't rewritten to say so again.
    expect(second?.location).toBeUndefined();
    expect(await runDueCalendarWrites(calendar, { scope: scope(env) })).toBe(0);
  });

  test("cancelling removes an event from a calendar that's no longer the write target", async () => {
    const env = await environment();
    const host = await hostWithHours(env, "Host");
    const api = new FakeGoogleCalendarApi();
    const calendar = deps(api.fetch);
    await connect(env, host.id, "google", calendar);
    await runDueCalendarSyncs(calendar, { scope: scope(env) });
    const eventType = await createEventType(env, {
      title: "Call",
      kind: "one_on_one",
      duration_minutes: 30,
      hosts: [{ host: host.id, role: "member", weight: 100, schedule: null }],
    } as never);
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee },
      plain,
      actor,
    );
    await runDueCalendarWrites(calendar, { scope: scope(env) });
    expect([...api.events.values()].filter((event) => !event.deleted).length).toBe(1);

    await db
      .update(schema.schedulingCalendar)
      .set({ writeTarget: false })
      .where(
        and(
          eq(schema.schedulingCalendar.hostId, host.id),
          eq(schema.schedulingCalendar.writeTarget, true),
        ),
      );
    await cancelBooking(env, booking.id, plain, actor);
    await runDueCalendarWrites(calendar, { scope: scope(env) });
    expect([...api.events.values()].filter((event) => !event.deleted).length).toBe(0);
  });

  test("the fake's freeBusy only reports a calendar's own events", async () => {
    const api = new FakeGoogleCalendarApi();
    api.events.set("a", {
      id: "a",
      calendarId: "doctor@example.com",
      title: "",
      startMs: at("09:00"),
      endMs: at("10:00"),
    });
    const res = await api.fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      body: JSON.stringify({ items: [{ id: "doctor@example.com" }, { id: "team@example.com" }] }),
    });
    const body = (await res.json()) as { calendars: Record<string, { busy: unknown[] }> };
    expect(body.calendars["doctor@example.com"]?.busy.length).toBe(1);
    expect(body.calendars["team@example.com"]?.busy.length).toBe(0);
  });
});

describe("slots for moving a booking", () => {
  const window = { fromMs: at("09:00"), toMs: at("17:00"), nowMs: NOW.getTime() };

  test("come from a host a filter no longer finds, who still has the booking", async () => {
    const env = await environment();
    const host = await hostWithHours(env, "Filtered", { attributes: { team: "a" } });
    const pool = await createEventType(env, {
      title: "Filtered",
      kind: "pool",
      duration_minutes: 30,
      hosts: [],
      host_filter: { team: "a" },
    } as never);
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("09:00"), attendee },
      plain,
      actor,
    );
    await updateHost(env, host.id, { attributes: { team: "b" } });
    const slots = await listRescheduleSlots(env, booking.id, window);
    expect(slots.map((slot) => slot.startMs)).toContain(at("10:00"));
    await rescheduleBooking(env, booking.id, { startMs: at("10:00") }, plain, actor);
  });

  test("are empty for a host taken off the event type, since moving would be refused", async () => {
    const env = await environment();
    const original = await hostWithHours(env, "Original");
    const later = await hostWithHours(env, "Later");
    const eventType = await createEventType(env, {
      title: "Together",
      kind: "collective",
      duration_minutes: 30,
      hosts: [{ host: original.id, role: "required", weight: 100, schedule: null }],
    } as never);
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee },
      plain,
      actor,
    );
    await updateEventType(env, eventType.id, {
      hosts: [{ host: later.id, role: "required", weight: 100, schedule: null }],
    } as never);
    expect(await listRescheduleSlots(env, booking.id, window)).toEqual([]);
    await expect(
      rescheduleBooking(env, booking.id, { startMs: at("10:00") }, plain, actor),
    ).rejects.toMatchObject({ code: "slot_unavailable" });
  });

  test("are empty once one of the booking's hosts is disabled", async () => {
    const env = await environment();
    const host = await hostWithHours(env, "Leaving");
    const eventType = await createEventType(env, {
      title: "Call",
      kind: "one_on_one",
      duration_minutes: 30,
      hosts: [{ host: host.id, role: "member", weight: 100, schedule: null }],
    } as never);
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee },
      plain,
      actor,
    );
    await updateHost(env, host.id, { status: "disabled" });
    expect(await listRescheduleSlots(env, booking.id, window)).toEqual([]);
  });
});

describe("what a booking was routed with", () => {
  async function routed(attributes?: Record<string, string>) {
    const env = await environment();
    await hostWithHours(env, "Dermatologist", { attributes: { specialty: "dermatology" } });
    const pool = await createEventType(env, {
      title: "Filtered",
      kind: "pool",
      duration_minutes: 30,
      hosts: [],
      host_filter: { specialty: "dermatology" },
    } as never);
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("09:00"), attendee, attributes },
      plain,
      actor,
    );
    return { env, booking };
  }

  const stored = async (id: string) => {
    const [row] = await db
      .select({ value: schema.schedulingBooking.encryptedAttributes })
      .from(schema.schedulingBooking)
      .where(eq(schema.schedulingBooking.id, id));
    return row?.value ?? null;
  };

  test("is kept encrypted", async () => {
    const { booking } = await routed({ specialty: "dermatology" });
    const value = await stored(booking.id);
    expect(value).not.toContain("dermatology");
    expect(decryptRouting(value, plain)).toEqual({ specialty: "dermatology" });
  });

  test("says nothing narrowed it, which isn't the same as not knowing", async () => {
    const { booking } = await routed();
    expect(await stored(booking.id)).not.toBeNull();
    expect(decryptRouting(await stored(booking.id), plain)).toEqual({});
    expect(decryptRouting(null, plain)).toBeNull();
  });

  test("never appears on the booking's wire object", async () => {
    const { env, booking } = await routed({ specialty: "dermatology" });
    expect(JSON.stringify(await getBooking(env, booking.id, plain))).not.toContain("dermatology");
  });

  test("goes when the attendee is erased", async () => {
    const { env, booking } = await routed({ specialty: "dermatology" });
    expect(await stored(booking.id)).not.toBeNull();
    await eraseAttendee(env, { uid: "p" });
    expect(await stored(booking.id)).toBeNull();
  });

  test("goes when the booking is redacted", async () => {
    const { env, booking } = await routed({ specialty: "dermatology" });
    await redactExpiredBookings({
      now: new Date(at("09:00") + 200 * 86_400_000),
      scope: scope(env),
    });
    expect(await stored(booking.id)).toBeNull();
  });

  test("is re-encrypted when the key rotates", async () => {
    const { env, booking } = await routed({ specialty: "dermatology" });
    const next = secretsKeyRing([
      createHash("sha256").update("next data key").digest(),
      ...plain.dataKeys.keys.map((key) => key.key),
    ]);
    const result = await reencryptSchedulingData({ keys: next, scope: scope(env) });
    expect(result.unreadableCount).toBe(0);
    const value = (await stored(booking.id)) as string;
    expect(isEncryptedWithPrimary(value, next)).toBe(true);
    expect(decryptRouting(value, { dataKeys: next })).toEqual({ specialty: "dermatology" });
  });
});
