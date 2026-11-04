import { describe, expect, test } from "bun:test";
import { createTestTenant } from "@coss/tenancy/testing";
import {
  createBooking,
  createEventType,
  createHost,
  createSchedule,
  explainSlot,
  listEventTypeSlots,
  type SchedulingEnvironment,
  SchedulingError,
  updateEventType,
} from "../src/index.ts";
import { testSchedulingDeps } from "../src/testing.ts";

const deps = testSchedulingDeps();
const actor = { kind: "system" } as const;
const attendee = { uid: "patient_1", name: "Sam Lee", email: "sam@example.com", time_zone: "UTC" };
const at = (time: string, date = "2031-01-06") => Date.parse(`${date}T${time}:00Z`);
const NOW = Date.parse("2031-01-05T00:00:00Z");

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

type HostInput = { host: string; role: "member" | "required"; weight: number; schedule: null };

const member = (host: string): HostInput => ({ host, role: "member", weight: 100, schedule: null });
const required = (host: string): HostInput => ({ ...member(host), role: "required" });

async function eventTypeFor(
  env: SchedulingEnvironment,
  hosts: HostInput[],
  overrides: Record<string, unknown> = {},
) {
  return createEventType(env, {
    title: "Consultation",
    kind: "one_on_one",
    duration_minutes: 30,
    hosts,
    ...overrides,
  } as never);
}

describe("explaining a slot", () => {
  test("says a free start is free", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [member(host.id)]);
    const startMs = at("09:00");

    const explained = await explainSlot(env, {
      eventTypeRef: eventType.id,
      startMs,
      nowMs: NOW,
    });

    expect(explained).toEqual({
      startMs,
      endMs: startMs + 30 * 60_000,
      available: true,
      reason: null,
      hosts: [
        {
          hostId: host.id,
          required: false,
          available: true,
          reason: null,
          calendarReason: null,
        },
      ],
    });
  });

  test("gives each of the engine's reasons", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [member(host.id)], {
      min_notice_minutes: 60,
    });
    await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee },
      deps,
      actor,
    );
    const reason = async (startMs: number, nowMs = NOW) =>
      (await explainSlot(env, { eventTypeRef: eventType.id, startMs, nowMs })).reason;

    expect(await reason(at("09:00"))).toBe("already_claimed");
    expect(await reason(at("10:07"))).toBe("not_on_grid");
    expect(await reason(at("20:00"))).toBe("outside_availability");
    expect(await reason(at("10:00"), at("09:30"))).toBe("too_soon");
  });

  test("agrees with the slot list across a day", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [member(host.id)]);
    await createBooking(
      env,
      { eventType: eventType.id, startMs: at("11:00"), attendee },
      deps,
      actor,
    );
    const slots = await listEventTypeSlots(env, {
      eventTypeRef: eventType.id,
      fromMs: at("00:00"),
      toMs: at("23:59"),
      nowMs: NOW,
    });
    const listed = new Set(slots.map((slot) => slot.startMs));

    for (let startMs = at("00:00"); startMs < at("23:59"); startMs += 30 * 60_000) {
      const { available } = await explainSlot(env, {
        eventTypeRef: eventType.id,
        startMs,
        nowMs: NOW,
      });
      expect(available).toBe(listed.has(startMs));
    }
  });

  test("a pool is free if one member is, and says who isn't", async () => {
    const env = await tenantEnv();
    const [busy, free] = await Promise.all([hostWithHours(env), hostWithHours(env)]);
    const eventType = await eventTypeFor(env, [member(busy.id), member(free.id)], {
      kind: "pool",
    });
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee },
      deps,
      actor,
    );
    const taken = booking.hosts[0];

    const explained = await explainSlot(env, {
      eventTypeRef: eventType.id,
      startMs: at("09:00"),
      nowMs: NOW,
    });

    expect(explained.available).toBe(true);
    expect(explained.reason).toBeNull();
    const byHost = new Map(explained.hosts.map((host) => [host.hostId, host]));
    expect(byHost.get(taken as string)?.reason).toBe("already_claimed");
    expect(explained.hosts.filter((host) => host.available)).toHaveLength(1);
  });

  test("a collective booking needs every required host", async () => {
    const env = await tenantEnv();
    const [lead, other] = await Promise.all([hostWithHours(env), hostWithHours(env)]);
    const eventType = await eventTypeFor(env, [required(lead.id), required(other.id)], {
      kind: "collective",
    });
    const solo = await eventTypeFor(env, [member(other.id)]);
    await createBooking(env, { eventType: solo.id, startMs: at("09:00"), attendee }, deps, actor);

    const explained = await explainSlot(env, {
      eventTypeRef: eventType.id,
      startMs: at("09:00"),
      nowMs: NOW,
    });

    expect(explained.available).toBe(false);
    expect(explained.reason).toBe("already_claimed");
    expect(explained.hosts.find((host) => host.hostId === lead.id)?.available).toBe(true);
    expect(explained.hosts.find((host) => host.hostId === other.id)?.reason).toBe(
      "already_claimed",
    );
  });

  test("names an event type that can't be booked at all", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [member(host.id)]);
    await updateEventType(env, eventType.id, { status: "archived" } as never);

    const inactive = await explainSlot(env, {
      eventTypeRef: eventType.id,
      startMs: at("09:00"),
      nowMs: NOW,
    });

    expect(inactive).toMatchObject({ available: false, reason: "event_type_inactive", hosts: [] });

    const empty = await eventTypeFor(env, [member(host.id)]);
    await updateEventType(env, empty.id, { hosts: [] });
    expect(
      await explainSlot(env, { eventTypeRef: empty.id, startMs: at("09:00"), nowMs: NOW }),
    ).toMatchObject({ available: false, reason: "no_hosts", hosts: [] });
  });

  test("refuses a length the event type doesn't offer", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [member(host.id)]);

    await expect(
      explainSlot(env, {
        eventTypeRef: eventType.id,
        startMs: at("09:00"),
        nowMs: NOW,
        durationMinutes: 45,
      }),
    ).rejects.toBeInstanceOf(SchedulingError);
  });
});

describe("seats left on slots", () => {
  test("counts down for a group session, and only a group has them", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [member(host.id)], {
      kind: "group",
      capacity: 3,
    });
    const seatsAt = async (startMs: number) => {
      const slots = await listEventTypeSlots(env, {
        eventTypeRef: eventType.id,
        fromMs: at("00:00"),
        toMs: at("23:59"),
        nowMs: NOW,
      });
      return slots.find((slot) => slot.startMs === startMs);
    };

    expect((await seatsAt(at("09:00")))?.seatsLeft).toBe(3);
    for (const [index, seatsLeft] of [2, 1].entries()) {
      await createBooking(
        env,
        {
          eventType: eventType.id,
          startMs: at("09:00"),
          attendee: { ...attendee, uid: `seat_${index}`, email: `seat${index}@example.com` },
        },
        deps,
        actor,
      );
      expect((await seatsAt(at("09:00")))?.seatsLeft).toBe(seatsLeft);
    }
    await createBooking(
      env,
      {
        eventType: eventType.id,
        startMs: at("09:00"),
        attendee: { ...attendee, uid: "seat_last", email: "last@example.com" },
      },
      deps,
      actor,
    );
    expect(await seatsAt(at("09:00"))).toBeUndefined();

    const solo = await eventTypeFor(env, [member(host.id)]);
    const [slot] = await listEventTypeSlots(env, {
      eventTypeRef: solo.id,
      fromMs: at("13:00"),
      toMs: at("14:00"),
      nowMs: NOW,
    });
    expect(slot?.seatsLeft).toBeNull();
  });
});
