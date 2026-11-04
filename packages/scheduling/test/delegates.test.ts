/** Who can be booked in someone's place: when, who, in what order, and coming back afterwards. */
import { describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { and, eq } from "drizzle-orm";
import {
  announceDueOutOfOffice,
  awayNoticeOf,
  createBooking,
  createEventType,
  createHost,
  createOutOfOffice,
  createSchedule,
  deleteOutOfOffice,
  getOutOfOffice,
  listEventTypeSlots,
  listPossibleDelegates,
  putOutOfOffice,
  type SchedulingEnvironment,
  updateHost,
  updateOutOfOffice,
} from "../src/index.ts";
import { testSchedulingDeps } from "../src/testing.ts";

const ms = Date.parse;
const MONDAY = "2031-01-06";
const TUESDAY = "2031-01-07";
const at = (time: string, day = MONDAY) => ms(`${day}T${time}:00Z`);
const iso = (time: string, day = MONDAY) => new Date(at(time, day)).toISOString();
const NOW = new Date(at("00:00"));
const plain = testSchedulingDeps({ now: () => NOW });
const actor = { kind: "system" } as const;
const attendee = { uid: "p", name: "Sam Lee", email: "sam@example.com", time_zone: "UTC" };

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
  extra: { attributes?: Record<string, string> } = {},
) {
  const created = await createHost(env, { name, time_zone: "UTC", ...extra });
  await createSchedule(env, created.id, {
    rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
  });
  return created;
}

const member = (entry: { id: string }) => ({
  host: entry.id,
  role: "member",
  weight: 100,
  schedule: null,
});

const eventType = (
  env: SchedulingEnvironment,
  kind: string,
  hosts: unknown[],
  extra: object = {},
) => createEventType(env, { title: "Call", kind, duration_minutes: 30, hosts, ...extra } as never);

/** Away for Monday, 09:00 to 13:00. */
const away = (
  env: SchedulingEnvironment,
  hostId: string,
  delegates: string[],
  extra: object = {},
) =>
  createOutOfOffice(
    env,
    { host: hostId, start: iso("09:00"), end: iso("13:00"), delegates, ...extra } as never,
    plain,
    actor,
    "api",
  );

const book = (
  env: SchedulingEnvironment,
  type: string,
  startMs: number,
  extra: object = {},
  uid = "p",
) =>
  createBooking(
    env,
    { eventType: type, startMs, attendee: { ...attendee, uid }, ...extra },
    plain,
    actor,
  );

const hostsOf = async (bookingId: string) => {
  const rows = await db
    .select({ hostId: schema.schedulingBookingHost.hostId })
    .from(schema.schedulingBookingHost)
    .where(eq(schema.schedulingBookingHost.bookingId, bookingId));
  return rows.map((row) => row.hostId).sort();
};

const slotsOf = async (
  env: SchedulingEnvironment,
  type: string,
  extra: object = {},
  from = at("00:00"),
  to = at("00:00", TUESDAY) + 86_400_000,
) =>
  (
    await listEventTypeSlots(env, {
      eventTypeRef: type,
      fromMs: from,
      toMs: to,
      nowMs: NOW.getTime(),
      ...extra,
    })
  ).map((slot) => slot.startMs);

describe("when they're offered", () => {
  test("a one-on-one stays bookable while its host is away, and goes to the delegate", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await eventType(env, "one_on_one", [member(a)]);
    await away(env, a.id, [b.id]);
    const slots = await slotsOf(env, type.id);
    expect(slots).toContain(at("10:00"));
    const { booking } = await book(env, type.id, at("10:00"));
    expect(await hostsOf(booking.id)).toEqual([b.id]);
  });

  test("without a delegate the time's simply gone", async () => {
    const env = await environment();
    const a = await host(env, "A");
    const type = await eventType(env, "one_on_one", [member(a)]);
    await away(env, a.id, []);
    expect(await slotsOf(env, type.id)).not.toContain(at("10:00"));
  });

  test("only during that time: outside it the delegate isn't offered", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await eventType(env, "one_on_one", [member(a)]);
    await away(env, a.id, [b.id]);
    const { booking } = await book(env, type.id, at("14:00"));
    expect(await hostsOf(booking.id)).toEqual([a.id]);
    // A's taken at 15:00, and B isn't covering then: nobody's left.
    await book(env, type.id, at("15:00"), {}, "q");
    await expect(book(env, type.id, at("15:00"), {}, "r")).rejects.toMatchObject({
      code: "slot_unavailable",
    });
    expect(await slotsOf(env, type.id)).not.toContain(at("15:00"));
  });

  test("a meeting that only touches the time away can still be covered", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await eventType(env, "one_on_one", [member(a)]);
    await away(env, a.id, [b.id], { start: iso("10:15"), end: iso("10:45") });
    const { booking } = await book(env, type.id, at("10:00"));
    expect(await hostsOf(booking.id)).toEqual([b.id]);
    const after = await book(env, type.id, at("10:30"), {}, "q");
    expect(await hostsOf(after.booking.id)).toEqual([b.id]);
  });

  test("a delegate who's away themselves has no slots, and it doesn't chain", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await eventType(env, "one_on_one", [member(a)]);
    await away(env, a.id, [b.id]);
    await away(env, b.id, [c.id]);
    expect(await slotsOf(env, type.id)).not.toContain(at("10:00"));
    await expect(book(env, type.id, at("10:00"))).rejects.toMatchObject({
      code: "slot_unavailable",
    });
  });

  test("two hosts naming each other don't loop", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await eventType(env, "pool", [member(a), member(b)]);
    await away(env, a.id, [b.id]);
    await away(env, b.id, [a.id]);
    expect(await slotsOf(env, type.id)).not.toContain(at("10:00"));
  });

  test("an entry that's been removed covers nothing", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await eventType(env, "one_on_one", [member(a)]);
    const [entry] = await away(env, a.id, [b.id]);
    await deleteOutOfOffice(env, entry?.id as string, plain);
    const { booking } = await book(env, type.id, at("10:00"));
    expect(await hostsOf(booking.id)).toEqual([a.id]);
    // A has it now. B would have been next, if the entry still counted.
    await expect(book(env, type.id, at("10:00"), {}, "q")).rejects.toMatchObject({
      code: "slot_unavailable",
    });
  });

  test("a delegate who's in the pool anyway keeps all their own time", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await eventType(env, "pool", [member(a), member(b)]);
    await away(env, a.id, [b.id]);
    // Outside A's time away: B isn't standing in for anyone here, they're just in the pool.
    await book(env, type.id, at("14:00"), { host: a.id });
    const { booking } = await book(env, type.id, at("14:00"), {}, "q");
    expect(await hostsOf(booking.id)).toEqual([b.id]);
  });

  test("a required host still has to be there", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await eventType(env, "collective", [
      { ...member(a), role: "required" },
      { ...member(b), role: "required" },
    ]);
    await away(env, a.id, [c.id]);
    expect(await slotsOf(env, type.id)).not.toContain(at("10:00"));
    await expect(book(env, type.id, at("10:00"))).rejects.toMatchObject({
      code: "slot_unavailable",
    });
  });

  test("a collective's member can be covered, and its required host stays", async () => {
    const env = await environment();
    const [lead, a, b] = await Promise.all([host(env, "Lead"), host(env, "A"), host(env, "B")]);
    const type = await eventType(env, "collective", [
      { ...member(lead), role: "required" },
      member(a),
    ]);
    await away(env, a.id, [b.id]);
    const { booking } = await book(env, type.id, at("10:00"));
    expect(await hostsOf(booking.id)).toEqual([lead.id, b.id].sort());
  });

  test("a disabled delegate isn't offered", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await eventType(env, "one_on_one", [member(a)]);
    await away(env, a.id, [b.id]);
    await updateHost(env, b.id, { status: "disabled" });
    expect(await slotsOf(env, type.id)).not.toContain(at("10:00"));
  });

  test("a held slot of a delegate isn't double-booked", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await eventType(env, "one_on_one", [member(a)]);
    await away(env, a.id, [b.id]);
    await book(env, type.id, at("10:00"));
    await expect(book(env, type.id, at("10:00"), {}, "q")).rejects.toMatchObject({
      code: "slot_unavailable",
    });
  });
});

describe("who fits", () => {
  const filtered = async (env: SchedulingEnvironment) => {
    const a = await host(env, "A", { attributes: { specialty: "skin" } });
    const skin = await host(env, "Skin", { attributes: { specialty: "skin" } });
    const heart = await host(env, "Heart", { attributes: { specialty: "heart" } });
    return { a, skin, heart };
  };

  test("a delegate outside a pool's filter is never offered", async () => {
    const env = await environment();
    const { a, skin, heart } = await filtered(env);
    const type = await eventType(env, "pool", [], { host_filter: { specialty: "skin" } });
    await away(env, a.id, [heart.id]);
    await away(env, skin.id, [heart.id]);
    expect(await slotsOf(env, type.id)).not.toContain(at("10:00"));
    await expect(book(env, type.id, at("10:00"))).rejects.toMatchObject({
      code: "slot_unavailable",
    });
  });

  test("a delegate inside the filter is, even if it wasn't their turn", async () => {
    const env = await environment();
    const { a, skin } = await filtered(env);
    const type = await eventType(env, "pool", [member(a)]);
    await away(env, a.id, [skin.id]);
    const { booking } = await book(env, type.id, at("10:00"));
    expect(await hostsOf(booking.id)).toEqual([skin.id]);
  });

  test("a delegate has to match what narrowed the booking", async () => {
    const env = await environment();
    const { a, skin, heart } = await filtered(env);
    const type = await eventType(env, "pool", [member(a), member(heart)]);
    await away(env, a.id, [skin.id]);
    const { booking } = await book(env, type.id, at("10:00"), {
      attributes: { specialty: "heart" },
    });
    // Heart's the only one: `a`'s not a candidate, so nobody's standing in for them.
    expect(await hostsOf(booking.id)).toEqual([heart.id]);
    await expect(
      book(env, type.id, at("10:00"), { attributes: { specialty: "heart" } }, "q"),
    ).rejects.toMatchObject({ code: "slot_unavailable" });
    const asked = await book(env, type.id, at("10:00"), { attributes: { specialty: "skin" } }, "r");
    expect(await hostsOf(asked.booking.id)).toEqual([skin.id]);
  });

  test("a delegate who doesn't match what narrowed it isn't offered", async () => {
    const env = await environment();
    const { a, heart } = await filtered(env);
    const type = await eventType(env, "pool", [member(a)]);
    await away(env, a.id, [heart.id]);
    await expect(
      book(env, type.id, at("10:00"), { attributes: { specialty: "skin" } }),
    ).rejects.toMatchObject({ code: "slot_unavailable" });
  });

  test("nobody stands in for someone the booking couldn't have gone to", async () => {
    const env = await environment();
    const { a, heart } = await filtered(env);
    const cover = await host(env, "Cover", { attributes: { specialty: "heart" } });
    const type = await eventType(env, "pool", [member(a), member(heart)]);
    await away(env, a.id, [cover.id]);
    const wanted = { attributes: { specialty: "heart" } };
    const { booking } = await book(env, type.id, at("10:00"), wanted);
    expect(await hostsOf(booking.id)).toEqual([heart.id]);
    // Cover fits, but only stands in for A, who's no heart doctor.
    await expect(book(env, type.id, at("10:00"), wanted, "q")).rejects.toMatchObject({
      code: "slot_unavailable",
    });
  });

  test("a host taken out of the event type by name stays out", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await eventType(env, "pool", [member(a), member(b), member(c)]);
    await db
      .update(schema.schedulingEventTypeHost)
      .set({ removedAt: new Date() })
      .where(
        and(
          eq(schema.schedulingEventTypeHost.eventTypeId, type.id),
          eq(schema.schedulingEventTypeHost.hostId, b.id),
        ),
      );
    await away(env, a.id, [b.id]);
    await away(env, c.id, []);
    expect(await slotsOf(env, type.id)).not.toContain(at("10:00"));
  });

  test("asking for the host by name reaches their delegates, and nobody else's", async () => {
    const env = await environment();
    const [a, b, c, d] = await Promise.all([
      host(env, "A"),
      host(env, "B"),
      host(env, "C"),
      host(env, "D"),
    ]);
    const type = await eventType(env, "pool", [member(a), member(c)]);
    await away(env, a.id, [b.id]);
    await away(env, c.id, [d.id]);
    const { booking } = await book(env, type.id, at("10:00"), { host: a.id });
    expect(await hostsOf(booking.id)).toEqual([b.id]);
    expect(await slotsOf(env, type.id, { hostRef: a.id })).toContain(at("10:30"));
    await book(env, type.id, at("10:30"), { host: a.id }, "q");
    // D's free at 10:30 but isn't A's.
    await expect(book(env, type.id, at("10:30"), { host: a.id }, "r")).rejects.toMatchObject({
      code: "slot_unavailable",
    });
  });

  test("asking for a delegate by name only works while they're covering", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await eventType(env, "one_on_one", [member(a)]);
    await away(env, a.id, [b.id]);
    const { booking } = await book(env, type.id, at("10:00"), { host: b.id });
    expect(await hostsOf(booking.id)).toEqual([b.id]);
    await expect(book(env, type.id, at("14:00"), { host: b.id }, "q")).rejects.toMatchObject({
      code: "slot_unavailable",
    });
  });
});

describe("in what order", () => {
  test("the order they were named in", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await eventType(env, "one_on_one", [member(a)]);
    await away(env, a.id, [c.id, b.id]);
    const first = await book(env, type.id, at("10:00"));
    expect(await hostsOf(first.booking.id)).toEqual([c.id]);
    const second = await book(env, type.id, at("10:00"), {}, "q");
    expect(await hostsOf(second.booking.id)).toEqual([b.id]);
  });

  test("the order they were named in for a group too", async () => {
    const env = await environment();
    const a = await host(env, "A");
    const older = await host(env, "Older");
    const newer = await host(env, "Newer");
    const type = await eventType(env, "group", [member(a)], { capacity: 3 });
    await away(env, a.id, [newer.id, older.id]);
    const { booking } = await book(env, type.id, at("10:00"));
    expect(await hostsOf(booking.id)).toEqual([newer.id]);
  });

  test("a delegate with a few past bookings isn't first until they catch up", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await eventType(env, "pool", [member(a), member(b), member(c)]);
    const units = (hostId: string, values: { fairUnits: number; assigned?: boolean }) =>
      db
        .update(schema.schedulingEventTypeHost)
        .set(values)
        .where(
          and(
            eq(schema.schedulingEventTypeHost.eventTypeId, type.id),
            eq(schema.schedulingEventTypeHost.hostId, hostId),
          ),
        );
    await units(a.id, { fairUnits: 50 });
    await units(b.id, { fairUnits: 30 });
    // Once in the pool, with 3 bookings: on their own count they'd be next for a long time.
    await units(c.id, { fairUnits: 3, assigned: false });
    await away(env, a.id, [c.id]);
    const { booking } = await book(env, type.id, at("10:00"));
    expect(await hostsOf(booking.id)).toEqual([b.id]);
  });

  test("a delegate with few bookings doesn't take everything in a pool", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await eventType(env, "pool", [member(a), member(b)]);
    const units = (hostId: string, fairUnits: number) =>
      db
        .update(schema.schedulingEventTypeHost)
        .set({ fairUnits })
        .where(
          and(
            eq(schema.schedulingEventTypeHost.eventTypeId, type.id),
            eq(schema.schedulingEventTypeHost.hostId, hostId),
          ),
        );
    await units(a.id, 50);
    await units(b.id, 20);
    await away(env, a.id, [c.id]);
    // C has none of their own, but stands where A would: B's further behind, so B goes first.
    const { booking } = await book(env, type.id, at("10:00"));
    expect(await hostsOf(booking.id)).toEqual([b.id]);
    const next = await book(env, type.id, at("10:00"), {}, "q");
    expect(await hostsOf(next.booking.id)).toEqual([c.id]);
  });
});

describe("a group", () => {
  const groupOf = (env: SchedulingEnvironment, hostId: { id: string }) =>
    eventType(env, "group", [member(hostId)], { capacity: 3 });

  test("picks its host by time, and everyone joins the same session", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await groupOf(env, a);
    await away(env, a.id, [b.id]);
    expect(await slotsOf(env, type.id)).toContain(at("10:00"));
    const first = await book(env, type.id, at("10:00"));
    const second = await book(env, type.id, at("10:00"), {}, "q");
    expect(await hostsOf(first.booking.id)).toEqual([b.id]);
    expect(await hostsOf(second.booking.id)).toEqual([b.id]);
    const seats = await db
      .select({ session: schema.schedulingBooking.groupSessionId })
      .from(schema.schedulingBooking)
      .where(eq(schema.schedulingBooking.eventTypeId, type.id));
    expect(new Set(seats.map((seat) => seat.session)).size).toBe(1);
  });

  test("outside the time away it's the host's own", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await groupOf(env, a);
    await away(env, a.id, [b.id]);
    const { booking } = await book(env, type.id, at("14:00"));
    expect(await hostsOf(booking.id)).toEqual([a.id]);
  });

  test("back early, the time's the host's own again", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await groupOf(env, a);
    const [entry] = await away(env, a.id, [b.id]);
    await book(env, type.id, at("10:00"));
    await deleteOutOfOffice(env, entry?.id as string, plain);
    const joined = await book(env, type.id, at("10:00"), {}, "q");
    expect(await hostsOf(joined.booking.id)).toEqual([a.id]);
  });

  test("a session a delegate ran can't be joined once they aren't covering it", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await groupOf(env, a);
    const [entry] = await away(env, a.id, [b.id]);
    await book(env, type.id, at("10:00"));
    // Still away, later on: B's only covering then, so asking for B at 10:00 is refused.
    await updateOutOfOffice(
      env,
      entry?.id as string,
      { start: iso("12:00"), end: iso("13:00") } as never,
      plain,
      actor,
    );
    await expect(book(env, type.id, at("10:00"), { host: b.id }, "q")).rejects.toMatchObject({
      code: "slot_unavailable",
    });
  });
});

describe("saying who", () => {
  test("they come back in order, and go with the entry", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const [entry] = await away(env, a.id, [c.id, b.id]);
    expect(entry?.delegates).toEqual([c.id, b.id]);
    const got = await getOutOfOffice(env, entry?.id as string, plain);
    expect(got.delegates).toEqual([c.id, b.id]);
    const updated = await updateOutOfOffice(
      env,
      entry?.id as string,
      { delegates: [b.id] } as never,
      plain,
      actor,
    );
    expect(updated.delegates).toEqual([b.id]);
    const untouched = await updateOutOfOffice(
      env,
      entry?.id as string,
      { notes: "Back Friday" } as never,
      plain,
      actor,
    );
    expect(untouched.delegates).toEqual([b.id]);
  });

  test("by uid, the same", async () => {
    const env = await environment();
    const a = await host(env, "A");
    const b = await createHost(env, { name: "B", uid: "bee", time_zone: "UTC" });
    const [entry] = await away(env, a.id, ["bee"]);
    expect(entry?.delegates).toEqual([b.id]);
  });

  test("nobody covers for themselves, and across many hosts each just leaves themselves out", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    await expect(away(env, a.id, [a.id])).rejects.toMatchObject({ code: "invalid_out_of_office" });
    const entries = await createOutOfOffice(
      env,
      {
        hosts: [a.id, b.id],
        start: iso("09:00"),
        end: iso("13:00"),
        delegates: [a.id, b.id],
      } as never,
      plain,
      actor,
      "api",
    );
    const of = (id: string) => entries.find((entry) => entry.host === id)?.delegates;
    expect(of(a.id)).toEqual([b.id]);
    expect(of(b.id)).toEqual([a.id]);
  });

  test("someone from another environment isn't found", async () => {
    const env = await environment();
    const other = await environment();
    const [a, theirs] = await Promise.all([host(env, "A"), host(other, "Theirs")]);
    await expect(away(env, a.id, [theirs.id])).rejects.toMatchObject({ code: "not_found" });
  });

  test("put replaces them", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const put = (delegates: string[]) =>
      putOutOfOffice(
        env,
        "hr_1",
        { host: a.id, start: iso("09:00"), end: iso("13:00"), delegates } as never,
        plain,
        actor,
      );
    expect((await put([b.id])).entry.delegates).toEqual([b.id]);
    expect((await put([c.id])).entry.delegates).toEqual([c.id]);
  });

  test("only colleagues in this environment can be named", async () => {
    const tenant = await createTestTenant();
    const live: SchedulingEnvironment = {
      organizationId: tenant.organization.id,
      projectId: tenant.project.id,
      environmentId: tenant.production.id,
      mode: "live",
    };
    const [a, b] = await Promise.all([host(live, "A"), host(live, "B")]);
    const type = await eventType(live, "pool", [member(a), member(b)]);
    await db
      .update(schema.schedulingHost)
      .set({ environmentId: tenant.development.id })
      .where(eq(schema.schedulingHost.id, b.id))
      .catch(() => undefined);
    expect(type.id).toBeTruthy();
    const possible = await listPossibleDelegates(live, a.id);
    expect(possible.map((entry) => entry.id)).not.toContain(b.id);
  });

  test("a pool staffed by a filter counts, unless someone's been taken off it by name", async () => {
    const env = await environment();
    const heart = { attributes: { team: "heart" } };
    const [a, b, c, gone] = await Promise.all([
      host(env, "A", heart),
      host(env, "B", heart),
      host(env, "C", { attributes: { team: "skin" } }),
      host(env, "Gone", heart),
    ]);
    const type = await eventType(env, "pool", [], { host_filter: { team: "heart" } });
    await db.insert(schema.schedulingEventTypeHost).values({
      eventTypeId: type.id,
      hostId: gone.id,
      organizationId: env.organizationId,
      assigned: false,
      removedAt: new Date(),
    });
    const possible = await listPossibleDelegates(env, a.id);
    expect(possible).toEqual([{ id: b.id, name: "B" }]);
    expect(await listPossibleDelegates(env, c.id)).toEqual([]);
    expect(await listPossibleDelegates(env, gone.id)).toEqual([]);
  });

  describe("taken back while a booking waits", () => {
    async function lockedDelegate() {
      const env = await environment();
      const [a, d] = await Promise.all([host(env, "A"), host(env, "D")]);
      const type = await eventType(env, "one_on_one", [member(a)]);
      const [entry] = await away(env, a.id, [d.id]);
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let locked = () => {};
      const holding = new Promise<void>((resolve) => {
        locked = resolve;
      });
      return { env, a, d, type, entry, gate, release, holding, locked };
    }

    test("a booking finding the cover gone doesn't go to who was covering", async () => {
      const { env, d, type, entry, gate, release, holding, locked } = await lockedDelegate();
      const change = db.transaction(async (tx) => {
        await tx
          .select({ id: schema.schedulingHost.id })
          .from(schema.schedulingHost)
          .where(eq(schema.schedulingHost.id, d.id))
          .for("update");
        locked();
        await gate;
        await tx
          .update(schema.schedulingOutOfOffice)
          .set({ deletedAt: NOW })
          .where(eq(schema.schedulingOutOfOffice.id, entry?.id as string));
      });
      await holding;
      const booking = book(env, type.id, at("10:00"), { host: d.id });
      await new Promise((resolve) => setTimeout(resolve, 300));
      release();
      await change;
      await expect(booking).rejects.toBeDefined();
    });

    test("covering someone else at that time doesn't keep it", async () => {
      const { env, d, type, entry, gate, release, holding, locked } = await lockedDelegate();
      const elsewhere = await host(env, "Elsewhere");
      await away(env, elsewhere.id, [d.id]);
      const change = db.transaction(async (tx) => {
        await tx
          .select({ id: schema.schedulingHost.id })
          .from(schema.schedulingHost)
          .where(eq(schema.schedulingHost.id, d.id))
          .for("update");
        locked();
        await gate;
        await tx
          .update(schema.schedulingOutOfOffice)
          .set({ deletedAt: NOW })
          .where(eq(schema.schedulingOutOfOffice.id, entry?.id as string));
      });
      await holding;
      const booking = book(env, type.id, at("10:00"), { host: d.id });
      await new Promise((resolve) => setTimeout(resolve, 300));
      release();
      await change;
      await expect(booking).rejects.toBeDefined();
    });

    test("taking it back waits for a booking that's taking it", async () => {
      const { env, d, entry, gate, release, holding, locked } = await lockedDelegate();
      const booker = db.transaction(async (tx) => {
        await tx
          .select({ id: schema.schedulingHost.id })
          .from(schema.schedulingHost)
          .where(eq(schema.schedulingHost.id, d.id))
          .for("share");
        locked();
        await gate;
      });
      await holding;
      let done = false;
      const removal = deleteOutOfOffice(env, entry?.id as string, plain).then(() => {
        done = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(done).toBe(false);
      release();
      await booker;
      await removal;
      expect(done).toBe(true);
    });
  });

  test("a host can name only those who take the same event types", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    await eventType(env, "pool", [member(a), member(b)]);
    await eventType(env, "one_on_one", [member(c)]);
    const possible = await listPossibleDelegates(env, a.id);
    expect(possible).toEqual([{ id: b.id, name: "B" }]);
    await expect(
      createOutOfOffice(
        env,
        { host: a.id, start: iso("09:00"), end: iso("13:00"), delegates: [c.id] } as never,
        plain,
        actor,
        "host",
        { allowedDelegates: possible.map((entry) => entry.id) },
      ),
    ).rejects.toMatchObject({ code: "invalid_out_of_office" });
  });
});

describe("what a booker's told", () => {
  test("someone's away, but there's cover", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    await away(env, a.id, [b.id]);
    const notice = await awayNoticeOf(env, a.id, new Date(at("10:00")));
    expect(notice).toMatchObject({ until: iso("13:00"), covered: true });
  });

  test("someone's away, and nobody's covering", async () => {
    const env = await environment();
    const a = await host(env, "A");
    await away(env, a.id, []);
    const notice = await awayNoticeOf(env, a.id, new Date(at("10:00")));
    expect(notice).toMatchObject({ covered: false });
  });

  test("a slot lost to coverage doesn't say so", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await eventType(env, "one_on_one", [member(a)]);
    await away(env, a.id, [b.id]);
    const refused = await book(env, type.id, at("14:00"), { host: b.id }).catch((error) => error);
    expect(refused.message).toBe("That time isn't available.");
  });
});

describe("going out of office with reassign", () => {
  test("a booking in the way goes to the delegate first", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await eventType(env, "pool", [member(a), member(b), member(c)]);
    await book(env, type.id, at("10:00"), { host: a.id });
    const [entry] = await away(env, a.id, [c.id], { existing_bookings: "reassign" });
    const [run] = await db
      .select({ strategy: schema.schedulingReassignment.strategy })
      .from(schema.schedulingReassignment)
      .where(eq(schema.schedulingReassignment.outOfOfficeId, entry?.id as string));
    expect(run?.strategy).toMatchObject({ kind: "auto", preferred_host_ids: [c.id] });
  });
});

describe("coming back", () => {
  async function pool() {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await eventType(env, "pool", [member(a), member(b), member(c)]);
    const setUnits = (hostId: string, fairUnits: number) =>
      db
        .update(schema.schedulingEventTypeHost)
        .set({ fairUnits })
        .where(
          and(
            eq(schema.schedulingEventTypeHost.eventTypeId, type.id),
            eq(schema.schedulingEventTypeHost.hostId, hostId),
          ),
        );
    const units = async (hostId: string) => {
      const [row] = await db
        .select({ units: schema.schedulingEventTypeHost.fairUnits })
        .from(schema.schedulingEventTypeHost)
        .where(
          and(
            eq(schema.schedulingEventTypeHost.eventTypeId, type.id),
            eq(schema.schedulingEventTypeHost.hostId, hostId),
          ),
        );
      return row?.units;
    };
    return { env, a, b, c, setUnits, units };
  }
  const after = (env: SchedulingEnvironment, time: number) =>
    announceDueOutOfOffice(
      { now: () => new Date(time) },
      { scope: { organizationIds: [env.organizationId] } },
    );

  test("they come back level with the lowest of their peers, once", async () => {
    const { env, a, b, c, setUnits, units } = await pool();
    await setUnits(a.id, 2);
    await setUnits(b.id, 40);
    await setUnits(c.id, 30);
    await away(env, a.id, []);
    await after(env, at("10:00"));
    expect(await units(a.id)).toBe(2);
    await after(env, at("14:00"));
    expect(await units(a.id)).toBe(30);
    await setUnits(a.id, 1);
    await after(env, at("15:00"));
    expect(await units(a.id)).toBe(1);
  });

  test("never downward", async () => {
    const { env, a, b, c, setUnits, units } = await pool();
    await setUnits(a.id, 50);
    await setUnits(b.id, 10);
    await setUnits(c.id, 20);
    await away(env, a.id, []);
    await after(env, at("14:00"));
    expect(await units(a.id)).toBe(50);
  });

  test("not while another entry has them away", async () => {
    const { env, a, b, c, setUnits, units } = await pool();
    await setUnits(a.id, 2);
    await setUnits(b.id, 40);
    await setUnits(c.id, 30);
    await away(env, a.id, []);
    await createOutOfOffice(
      env,
      { host: a.id, start: iso("12:00"), end: iso("18:00") } as never,
      plain,
      actor,
      "api",
    );
    await after(env, at("14:00"));
    expect(await units(a.id)).toBe(2);
    await after(env, at("19:00"));
    expect(await units(a.id)).toBe(30);
  });

  test("a peer with nothing yet doesn't hold them down", async () => {
    const { env, a, b, c, setUnits, units } = await pool();
    await setUnits(a.id, 2);
    await setUnits(b.id, 40);
    await setUnits(c.id, 0);
    await away(env, a.id, []);
    await after(env, at("14:00"));
    expect(await units(a.id)).toBe(40);
  });

  test("weights count", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await eventType(env, "pool", [
      { ...member(a), weight: 200 },
      { ...member(b), weight: 100 },
    ]);
    await db
      .update(schema.schedulingEventTypeHost)
      .set({ fairUnits: 10 })
      .where(
        and(
          eq(schema.schedulingEventTypeHost.eventTypeId, type.id),
          eq(schema.schedulingEventTypeHost.hostId, b.id),
        ),
      );
    await away(env, a.id, []);
    await after(env, at("14:00"));
    const [row] = await db
      .select({ units: schema.schedulingEventTypeHost.fairUnits })
      .from(schema.schedulingEventTypeHost)
      .where(
        and(
          eq(schema.schedulingEventTypeHost.eventTypeId, type.id),
          eq(schema.schedulingEventTypeHost.hostId, a.id),
        ),
      );
    expect(row?.units).toBe(20);
  });

  test("nobody with any bookings: nothing to level to", async () => {
    const { env, a, units } = await pool();
    await away(env, a.id, []);
    await after(env, at("14:00"));
    expect(await units(a.id)).toBe(0);
  });
});
