import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { eq, sql } from "drizzle-orm";
import {
  createBooking,
  createEventType,
  createHold,
  createHost,
  createSchedule,
  getBooking,
  getEventType,
  listEventTypeSlots,
  listUpcomingHostBookings,
  rescheduleBooking,
  type SchedulingEnvironment,
  SchedulingError,
  searchAvailability,
  updateEventType,
  updateHost,
} from "../src/index.ts";
import { testSchedulingDeps } from "../src/testing.ts";

const at = (time: string, date = "2031-01-06") => Date.parse(`${date}T${time}:00Z`);
const NOW = new Date(at("00:00", "2031-01-01"));
const deps = testSchedulingDeps({ now: () => NOW });
const actor = { kind: "system" } as const;

function attendee(uid: string) {
  return { uid, name: "Sam Lee", email: `${uid}@example.com`, time_zone: "UTC" };
}

type Attributes = Record<string, string | string[]>;

async function setUp(
  doctors: Record<string, { attributes: Attributes; hours?: [string, string] }>,
) {
  const tenant = await createTestTenant();
  const env: SchedulingEnvironment = {
    organizationId: tenant.organization.id,
    projectId: tenant.project.id,
    environmentId: tenant.development.id,
    mode: "sandbox",
  };
  const ids: Record<string, string> = {};
  for (const [name, doctor] of Object.entries(doctors)) {
    const host = await createHost(env, {
      uid: name,
      name,
      time_zone: "UTC",
      attributes: doctor.attributes,
    } as never);
    const [start, end] = doctor.hours ?? ["09:00", "17:00"];
    await createSchedule(env, host.id, {
      rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start, end }],
    } as never);
    ids[name] = host.id;
  }
  return { env, ids };
}

async function pool(
  env: SchedulingEnvironment,
  ids: Record<string, string>,
  extra: Record<string, unknown> = {},
) {
  return createEventType(env, {
    title: "Consultation",
    kind: "pool",
    duration_minutes: 30,
    hosts: Object.values(ids).map((host) => ({
      host,
      role: "member",
      weight: 100,
      schedule: null,
    })),
    ...extra,
  } as never);
}

async function hostOf(env: SchedulingEnvironment, id: string): Promise<string | undefined> {
  return (await getBooking(env, id, deps)).hosts[0];
}

async function failure(run: () => Promise<unknown>): Promise<SchedulingError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof SchedulingError) return error;
    throw error;
  }
  throw new Error("It didn't fail.");
}

const CLINIC = {
  derm_ca: { attributes: { specialty: "dermatology", licensed_in: ["CA", "NY"] } },
  derm_tx: { attributes: { specialty: "dermatology", licensed_in: ["TX"] } },
  cardio_ca: { attributes: { specialty: "cardiology", licensed_in: ["CA"] } },
};

describe("routing to a specialist", () => {
  test("a booking only ever goes to a host matching every attribute", async () => {
    const { env, ids } = await setUp(CLINIC);
    const eventType = await pool(env, ids);
    const attributes = { specialty: "dermatology", licensed_in: "CA" };
    for (const [index, time] of ["09:00", "10:00", "11:00", "12:00"].entries()) {
      const { booking } = await createBooking(
        env,
        { eventType: eventType.id, startMs: at(time), attributes, attendee: attendee(`p${index}`) },
        deps,
        actor,
      );
      expect(await hostOf(env, booking.id)).toBe(ids.derm_ca);
    }
  });

  test("when the only match is taken, the slot is lost: it never falls back to someone else", async () => {
    const { env, ids } = await setUp(CLINIC);
    const eventType = await pool(env, ids);
    const attributes = { specialty: "cardiology" };
    await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attributes, attendee: attendee("first") },
      deps,
      actor,
    );
    const lost = await failure(() =>
      createBooking(
        env,
        { eventType: eventType.id, startMs: at("09:00"), attributes, attendee: attendee("second") },
        deps,
        actor,
      ),
    );
    expect(lost.code).toBe("slot_unavailable");
    // Someone else was free at that time, for a different need.
    const { booking } = await createBooking(
      env,
      {
        eventType: eventType.id,
        startMs: at("09:00"),
        attributes: { specialty: "dermatology" },
        attendee: attendee("third"),
      },
      deps,
      actor,
    );
    expect([ids.derm_ca, ids.derm_tx]).toContain(await hostOf(env, booking.id));
  });

  test("slots are only those a match can take", async () => {
    const { env, ids } = await setUp({
      morning: { attributes: { specialty: "dermatology" }, hours: ["09:00", "10:00"] },
      afternoon: { attributes: { specialty: "cardiology" }, hours: ["14:00", "15:00"] },
    });
    const eventType = await pool(env, ids);
    const slots = (attributes?: Attributes) =>
      listEventTypeSlots(env, {
        eventTypeRef: eventType.id,
        fromMs: at("00:00"),
        toMs: at("23:59"),
        nowMs: NOW.getTime(),
        attributes,
      });
    expect((await slots()).length).toBe(4);
    expect((await slots({ specialty: "dermatology" })).map((slot) => slot.startMs)).toEqual([
      at("09:00"),
      at("09:30"),
    ]);
    expect((await slots({ specialty: "cardiology" })).map((slot) => slot.startMs)).toEqual([
      at("14:00"),
      at("14:30"),
    ]);
    expect(await slots({ specialty: "neurology" })).toEqual([]);
  });

  test("nobody matching: no slots, and a booking is refused, not given to someone else", async () => {
    const { env, ids } = await setUp(CLINIC);
    const eventType = await pool(env, ids);
    const refused = await failure(() =>
      createBooking(
        env,
        {
          eventType: eventType.id,
          startMs: at("09:00"),
          attributes: { specialty: "neurology" },
          attendee: attendee("p"),
        },
        deps,
        actor,
      ),
    );
    expect(refused.code).toBe("slot_unavailable");
    expect(refused.message).toContain("no_hosts");
  });

  test("a list asks for any of them; several keys ask for all of them", async () => {
    const { env, ids } = await setUp(CLINIC);
    const eventType = await pool(env, ids);
    const search = (attributes: Attributes) =>
      searchAvailability(env, {
        eventTypeRef: eventType.id,
        fromMs: at("00:00"),
        toMs: at("23:59"),
        nowMs: NOW.getTime(),
        attributes,
        slotsPerHost: 1,
        limit: 10,
      });
    const who = async (attributes: Attributes) =>
      (await search(attributes)).data.map((row) => row.uid).sort();
    expect(await who({ licensed_in: ["TX", "NY"] })).toEqual(["derm_ca", "derm_tx"]);
    expect(await who({ specialty: "dermatology", licensed_in: "TX" })).toEqual(["derm_tx"]);
    expect(await who({ specialty: ["dermatology", "cardiology"], licensed_in: "CA" })).toEqual([
      "cardio_ca",
      "derm_ca",
    ]);
    expect(await who({ specialty: "Dermatology" })).toEqual([]);
  });

  test("among matches, bookings are shared fairly, by weight", async () => {
    const { env, ids } = await setUp({
      senior: { attributes: { specialty: "dermatology" } },
      junior: { attributes: { specialty: "dermatology" } },
      other: { attributes: { specialty: "cardiology" } },
    });
    const eventType = await createEventType(env, {
      title: "Consultation",
      kind: "pool",
      duration_minutes: 30,
      hosts: [
        { host: ids.senior, role: "member", weight: 300, schedule: null },
        { host: ids.junior, role: "member", weight: 100, schedule: null },
        { host: ids.other, role: "member", weight: 100, schedule: null },
      ],
    } as never);
    const counts: Record<string, number> = {};
    for (let hour = 0; hour < 8; hour++) {
      const startMs = at("09:00", `2031-01-${String(6 + hour).padStart(2, "0")}`);
      const { booking } = await createBooking(
        env,
        {
          eventType: eventType.id,
          startMs,
          attributes: { specialty: "dermatology" },
          attendee: attendee(`p${hour}`),
        },
        deps,
        actor,
      );
      const host = (await hostOf(env, booking.id)) as string;
      counts[host] = (counts[host] ?? 0) + 1;
    }
    expect(counts[ids.senior as string]).toBe(6);
    expect(counts[ids.junior as string]).toBe(2);
    expect(counts[ids.other as string]).toBeUndefined();
  });

  test("a filter finds new hosts as they appear; a changed attribute counts from then on", async () => {
    const { env, ids } = await setUp({
      first: { attributes: { team: "urgent-care", specialty: "dermatology" } },
    });
    const eventType = await createEventType(env, {
      title: "Consultation",
      kind: "pool",
      duration_minutes: 30,
      hosts: [],
      host_filter: { team: "urgent-care" },
    } as never);
    const who = async () =>
      (
        await searchAvailability(env, {
          eventTypeRef: eventType.id,
          fromMs: at("00:00"),
          toMs: at("23:59"),
          nowMs: NOW.getTime(),
          slotsPerHost: 1,
          limit: 10,
        })
      ).data
        .map((row) => row.uid)
        .sort();
    expect(await who()).toEqual(["first"]);
    const second = await createHost(env, {
      uid: "second",
      name: "second",
      time_zone: "UTC",
      attributes: { team: "urgent-care" },
    } as never);
    await createSchedule(env, second.id, {
      rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
    } as never);
    expect(await who()).toEqual(["first", "second"]);

    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), host: "first", attendee: attendee("p") },
      deps,
      actor,
    );
    await updateHost(env, ids.first as string, { attributes: { team: "elsewhere" } } as never);
    expect(await who()).toEqual(["second"]);
    // The booking they already have stays theirs.
    expect(await hostOf(env, booking.id)).toBe(ids.first);
  });

  test("someone a filter found isn't listed as a host, and survives a change to the list", async () => {
    const { env, ids } = await setUp({
      named: { attributes: { team: "other" } },
      found: { attributes: { team: "urgent-care" } },
    });
    const eventType = await createEventType(env, {
      title: "Consultation",
      kind: "pool",
      duration_minutes: 30,
      hosts: [{ host: ids.named, role: "member", weight: 100, schedule: null }],
      host_filter: { team: "urgent-care" },
    } as never);
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), host: "found", attendee: attendee("p") },
      deps,
      actor,
    );
    expect(await hostOf(env, booking.id)).toBe(ids.found);
    expect((await getEventType(env, eventType.id)).hosts.map((host) => host.host)).toEqual([
      ids.named as string,
    ]);

    // Changing the list leaves them bookable: listing them and booking them still agree.
    const updated = await updateEventType(env, eventType.id, {
      hosts: [{ host: ids.named, role: "member", weight: 100, schedule: null }],
    } as never);
    expect(updated.hosts.map((host) => host.host)).toEqual([ids.named as string]);
    const next = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("10:00"), host: "found", attendee: attendee("q") },
      deps,
      actor,
    );
    expect(await hostOf(env, next.booking.id)).toBe(ids.found);
  });

  test("the backfill unassigns only hosts a filter found", async () => {
    const { env, ids } = await setUp({
      named: { attributes: { team: "other" } },
      found: { attributes: { team: "urgent-care" } },
    });
    const eventType = await createEventType(env, {
      title: "Consultation",
      kind: "pool",
      duration_minutes: 30,
      hosts: [{ host: ids.named, role: "member", weight: 100, schedule: null }],
      host_filter: { team: "urgent-care" },
    } as never);
    for (const [host, start] of [
      ["found", "09:00"],
      ["named", "10:00"],
    ] as const) {
      await createBooking(
        env,
        { eventType: eventType.id, startMs: at(start), host, attendee: attendee(host) },
        deps,
        actor,
      );
    }
    const rows = eq(schema.schedulingEventTypeHost.eventTypeId, eventType.id);
    // What migration 0121 left: every existing row looked named.
    await db.update(schema.schedulingEventTypeHost).set({ assigned: true }).where(rows);

    const migrations = fileURLToPath(new URL("../../db/migrations/", import.meta.url));
    const file = readdirSync(migrations).find((name) =>
      name.endsWith("_scheduling_unassign_filter_hosts.sql"),
    );
    await db.execute(sql.raw(readFileSync(`${migrations}${file}`, "utf8")));

    const assigned = await db
      .select({
        host: schema.schedulingEventTypeHost.hostId,
        assigned: schema.schedulingEventTypeHost.assigned,
      })
      .from(schema.schedulingEventTypeHost)
      .where(rows);
    expect(Object.fromEntries(assigned.map((row) => [row.host, row.assigned]))).toEqual({
      [ids.named as string]: true,
      [ids.found as string]: false,
    });
    await updateHost(env, ids.found as string, { attributes: { team: "elsewhere" } } as never);
    const search = await searchAvailability(env, {
      eventTypeRef: eventType.id,
      fromMs: at("00:00"),
      toMs: at("23:59"),
      nowMs: NOW.getTime(),
      slotsPerHost: 1,
      limit: 10,
    });
    expect(search.data.map((row) => row.uid)).toEqual(["named"]);
  });

  test("taken off the list by name stays off, whatever the filter says", async () => {
    const { env, ids } = await setUp({
      keep: { attributes: { team: "urgent-care" } },
      gone: { attributes: { team: "urgent-care" } },
    });
    const eventType = await createEventType(env, {
      title: "Consultation",
      kind: "pool",
      duration_minutes: 30,
      hosts: [
        { host: ids.keep, role: "member", weight: 100, schedule: null },
        { host: ids.gone, role: "member", weight: 100, schedule: null },
      ],
      host_filter: { team: "urgent-care" },
    } as never);
    await updateEventType(env, eventType.id, {
      hosts: [{ host: ids.keep, role: "member", weight: 100, schedule: null }],
    } as never);
    const { data } = await searchAvailability(env, {
      eventTypeRef: eventType.id,
      fromMs: at("00:00"),
      toMs: at("23:59"),
      nowMs: NOW.getTime(),
      slotsPerHost: 1,
      limit: 10,
    });
    expect(data.map((row) => row.uid)).toEqual(["keep"]);
    const refused = await failure(() =>
      createBooking(
        env,
        { eventType: eventType.id, startMs: at("09:00"), host: "gone", attendee: attendee("p") },
        deps,
        actor,
      ),
    );
    expect(refused.code).toBe("slot_unavailable");
  });

  test("a booking can only be moved to a host who could have taken it", async () => {
    const { env, ids } = await setUp({
      member: { attributes: {} },
      colleague: { attributes: {} },
    });
    const outsider = await createHost(env, {
      uid: "outsider",
      name: "o",
      time_zone: "UTC",
    } as never);
    await createSchedule(env, outsider.id, {
      rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
    } as never);
    const eventType = await pool(env, ids);
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), host: "member", attendee: attendee("p") },
      deps,
      actor,
    );
    const refused = await failure(() =>
      rescheduleBooking(env, booking.id, { startMs: at("10:00"), host: "outsider" }, deps, actor),
    );
    expect(refused.param).toBe("host");
    const moved = await rescheduleBooking(
      env,
      booking.id,
      { startMs: at("10:00"), host: "colleague" },
      deps,
      actor,
    );
    expect(moved.hosts).toEqual([ids.colleague as string]);
  });

  test("your own ranking: search, choose, and book that host", async () => {
    const { env, ids } = await setUp(CLINIC);
    const filtered = await createEventType(env, {
      title: "Filtered",
      kind: "pool",
      duration_minutes: 30,
      hosts: [],
      host_filter: { specialty: "dermatology" },
    } as never);
    const { data } = await searchAvailability(env, {
      eventTypeRef: filtered.id,
      fromMs: at("00:00"),
      toMs: at("23:59"),
      nowMs: NOW.getTime(),
      attributes: { licensed_in: "TX" },
      slotsPerHost: 3,
      limit: 10,
    });
    expect(data.map((row) => row.uid)).toEqual(["derm_tx"]);
    const slot = data[0]?.slots[0];
    const { booking } = await createBooking(
      env,
      {
        eventType: filtered.id,
        startMs: slot?.startMs as number,
        host: data[0]?.hostId,
        attendee: attendee("p"),
      },
      deps,
      actor,
    );
    expect(await hostOf(env, booking.id)).toBe(ids.derm_tx);
  });

  test("a hold keeps to matches too", async () => {
    const { env, ids } = await setUp(CLINIC);
    const eventType = await pool(env, ids);
    const { booking } = await createHold(
      env,
      {
        eventType: eventType.id,
        startMs: at("09:00"),
        attributes: { specialty: "cardiology" },
        attendee: attendee("p"),
      },
      deps,
      actor,
    );
    expect(await hostOf(env, booking.id)).toBe(ids.cardio_ca);
  });

  test("rescheduling stays with the same host, so the match survives", async () => {
    const { env, ids } = await setUp(CLINIC);
    const eventType = await pool(env, ids);
    const { booking } = await createBooking(
      env,
      {
        eventType: eventType.id,
        startMs: at("09:00"),
        attributes: { specialty: "cardiology" },
        attendee: attendee("p"),
      },
      deps,
      actor,
    );
    const moved = await rescheduleBooking(env, booking.id, { startMs: at("10:00") }, deps, actor);
    expect(moved.hosts).toEqual([ids.cardio_ca as string]);
  });
});

describe("a pool with a required host", () => {
  async function withRequired() {
    const { env, ids } = await setUp({
      lead: { attributes: { role: "supervisor" } },
      derm: { attributes: { specialty: "dermatology" } },
    });
    const eventType = await createEventType(env, {
      title: "Supervised visit",
      kind: "pool",
      duration_minutes: 30,
      hosts: [
        { host: ids.lead, role: "required", weight: 100, schedule: null },
        { host: ids.derm, role: "member", weight: 100, schedule: null },
      ],
    } as never);
    return { env, ids, eventType };
  }

  test("never books the required host alone when no member matches", async () => {
    const { env, eventType } = await withRequired();
    await expect(
      createBooking(
        env,
        {
          eventType: eventType.id,
          startMs: at("09:00"),
          attributes: { specialty: "cardiology" },
          attendee: attendee("p"),
        },
        deps,
        actor,
      ),
    ).rejects.toMatchObject({ code: "slot_unavailable" });
    const slots = await listEventTypeSlots(env, {
      eventTypeRef: eventType.id,
      fromMs: at("09:00"),
      toMs: at("10:00"),
      nowMs: NOW.getTime(),
      attributes: { specialty: "cardiology" },
    });
    expect(slots).toEqual([]);
  });

  test("books the required host and the matching member together", async () => {
    const { env, ids, eventType } = await withRequired();
    const { booking } = await createBooking(
      env,
      {
        eventType: eventType.id,
        startMs: at("09:00"),
        attributes: { specialty: "dermatology" },
        attendee: attendee("p"),
      },
      deps,
      actor,
    );
    expect([...(await getBooking(env, booking.id, deps)).hosts].sort()).toEqual(
      [ids.lead as string, ids.derm as string].sort(),
    );
  });
});

test("a host's coming bookings page by start time, however they were created", async () => {
  const { env, ids } = await setUp({ only: { attributes: {} } });
  const eventType = await pool(env, ids);
  const host = ids.only as string;
  for (const [index, time] of ["13:00", "09:00", "11:00", "10:00", "12:00"].entries()) {
    await createBooking(
      env,
      { eventType: eventType.id, startMs: at(time), attendee: attendee(`p${index}`) },
      deps,
      actor,
    );
  }
  const seen: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 3; page++) {
    const { data, nextCursor } = await listUpcomingHostBookings(
      env,
      { hostId: host, now: NOW, limit: 2, cursor },
      deps,
    );
    seen.push(...data.map((booking) => booking.start.slice(11, 16)));
    cursor = nextCursor ?? undefined;
    if (page < 2) expect(nextCursor).not.toBeNull();
    else expect(nextCursor).toBeNull();
  }
  expect(seen).toEqual(["09:00", "10:00", "11:00", "12:00", "13:00"]);
});
