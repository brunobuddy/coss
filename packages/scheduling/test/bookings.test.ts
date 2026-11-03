import { describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { and, eq, sql } from "drizzle-orm";
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
  declineBooking,
  deleteHost,
  expireDueBookings,
  getBooking,
  listEventTypeSlots,
  previewSeries,
  rescheduleBooking,
  type SchedulingEnvironment,
  SchedulingError,
  searchAvailability,
  updateEventType,
} from "../src/index.ts";
import { testSchedulingDeps } from "../src/testing.ts";

const deps = testSchedulingDeps();
const actor = { kind: "system" } as const;
const ms = Date.parse;
const attendee = { uid: "patient_1", name: "Sam Lee", email: "sam@example.com", time_zone: "UTC" };

// A Monday far enough ahead that minimum notice never matters.
const MONDAY = "2031-01-06";
const at = (time: string, date = MONDAY) => ms(`${date}T${time}:00Z`);

async function tenantEnv(mode: "live" | "sandbox" = "sandbox"): Promise<SchedulingEnvironment> {
  const tenant = await createTestTenant();
  const environment = mode === "live" ? tenant.production : tenant.development;
  return {
    organizationId: tenant.organization.id,
    projectId: tenant.project.id,
    environmentId: environment.id,
    mode,
  };
}

async function hostWithHours(env: SchedulingEnvironment, timeZone = "UTC") {
  const host = await createHost(env, { name: "Dr. Reyes", time_zone: timeZone });
  await createSchedule(env, host.id, {
    rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
  });
  return host;
}

async function eventTypeFor(
  env: SchedulingEnvironment,
  hosts: { host: string; role?: "member" | "required"; weight?: number }[],
  overrides: Record<string, unknown> = {},
) {
  return createEventType(env, {
    title: "Consultation",
    kind: "one_on_one",
    duration_minutes: 30,
    hosts: hosts.map((host) => ({
      host: host.host,
      role: host.role ?? "member",
      weight: host.weight ?? 100,
      schedule: null,
    })),
    ...overrides,
  } as never);
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

const request = (eventType: string, startMs: number, extra: Record<string, unknown> = {}) => ({
  eventType,
  startMs,
  attendee,
  ...extra,
});

/** Every live booking holds exactly one claim per host, and nothing else holds one. */
async function auditClaims(env: SchedulingEnvironment): Promise<void> {
  const { rows } = await db.execute(sql`
    select b.id, b.status,
      (select count(*)::int from scheduling_booking_host h where h.booking_id = b.id) as hosts,
      (select count(*)::int from scheduling_claim c where c.booking_id = b.id) as claims
    from scheduling_booking b
    where b.organization_id = ${env.organizationId} and b.group_session_id is null
  `);
  for (const row of rows as { status: string; hosts: number; claims: number }[]) {
    if (row.status === "cancelled" || row.status === "declined") expect(row.claims).toBe(0);
    else expect(row.claims).toBe(row.hosts);
  }
}

describe("the constraint", () => {
  test("exists, and is an exclusion constraint drizzle can't see", async () => {
    const { rows } = await db.execute(
      sql`select contype from pg_constraint where conname = 'scheduling_claim_no_overlap'`,
    );
    expect((rows[0] as { contype: string }).contype).toBe("x");
  });
});

describe("booking", () => {
  test("lists a slot, books it, and it's gone", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }]);
    const slots = () =>
      listEventTypeSlots(env, {
        eventTypeRef: eventType.id,
        fromMs: at("09:00"),
        toMs: at("10:00"),
        nowMs: at("00:00"),
      });
    expect((await slots()).map((slot) => slot.startMs)).toEqual([at("09:00"), at("09:30")]);
    const { booking } = await createBooking(env, request(eventType.id, at("09:00")), deps, actor);
    expect(booking.status).toBe("confirmed");
    expect(booking.hosts).toEqual([host.id]);
    expect(booking.attendees[0]?.email).toBe("sam@example.com");
    expect((await slots()).map((slot) => slot.startMs)).toEqual([at("09:30")]);
    await auditClaims(env);
  });

  test("attendee details and answers are encrypted at rest", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }], {
      questions: [{ key: "reason", type: "text", label: "Reason", required: true, options: [] }],
    });
    const { booking } = await createBooking(
      env,
      request(eventType.id, at("09:00"), { answers: { reason: "chest pain" } }),
      deps,
      actor,
    );
    const [row] = await db
      .select()
      .from(schema.schedulingAttendee)
      .where(eq(schema.schedulingAttendee.bookingId, booking.id));
    expect(row?.encryptedContact).not.toContain("sam@example.com");
    expect(row?.encryptedAnswers).not.toContain("chest pain");
    expect(booking.attendees[0]).not.toHaveProperty("answers");
    const fetched = await getBooking(env, booking.id, deps);
    expect(fetched.attendees[0]?.answers).toEqual({ reason: "chest pain" });
    expect(await code(createBooking(env, request(eventType.id, at("10:00")), deps, actor))).toBe(
      "invalid_answers",
    );
  });

  test("an unknown answer, or a link in a name, is refused", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }]);
    expect(
      await code(
        createBooking(
          env,
          request(eventType.id, at("09:00"), { answers: { x: "y" } }),
          deps,
          actor,
        ),
      ),
    ).toBe("invalid_answers");
    expect(
      await code(
        createBooking(
          env,
          {
            eventType: eventType.id,
            startMs: at("09:00"),
            attendee: { name: "Click https://evil.example", time_zone: "UTC" },
          },
          deps,
          actor,
        ),
      ),
    ).toBe("invalid_attendee");
  });

  test("tenancy: another environment can't see or book it", async () => {
    const env = await tenantEnv();
    const other = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }]);
    const { booking } = await createBooking(env, request(eventType.id, at("09:00")), deps, actor);
    expect(await code(getBooking(other, booking.id, deps))).toBe("not_found");
    expect(await code(cancelBooking(other, booking.id, deps, actor))).toBe("not_found");
    expect(await code(createBooking(other, request(eventType.id, at("10:00")), deps, actor))).toBe(
      "not_found",
    );
  });

  test("off the grid or outside hours is refused", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }]);
    expect(await code(createBooking(env, request(eventType.id, at("09:10")), deps, actor))).toBe(
      "slot_unavailable",
    );
    expect(await code(createBooking(env, request(eventType.id, at("20:00")), deps, actor))).toBe(
      "slot_unavailable",
    );
  });

  test("an idempotency key replays, and refuses a different request", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }]);
    const first = await createBooking(
      env,
      request(eventType.id, at("09:00"), { idempotencyKey: "abc" }),
      deps,
      actor,
    );
    const second = await createBooking(
      env,
      request(eventType.id, at("09:00"), { idempotencyKey: "abc" }),
      deps,
      actor,
    );
    expect(second.replayed).toBe(true);
    expect(second.booking.id).toBe(first.booking.id);
    expect(
      await code(
        createBooking(
          env,
          request(eventType.id, at("09:30"), { idempotencyKey: "abc" }),
          deps,
          actor,
        ),
      ),
    ).toBe("idempotency_key_reused");
  });

  test("a lost slot leaves its idempotency key free", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }]);
    await createBooking(env, request(eventType.id, at("09:00")), deps, actor);
    expect(
      await code(
        createBooking(
          env,
          request(eventType.id, at("09:00"), { idempotencyKey: "lost" }),
          deps,
          actor,
        ),
      ),
    ).toBe("slot_unavailable");
    const [row] = await db
      .select()
      .from(schema.schedulingBooking)
      .where(
        and(
          eq(schema.schedulingBooking.environmentId, env.environmentId),
          eq(schema.schedulingBooking.idempotencyKey, "lost"),
        ),
      );
    expect(row).toBeUndefined();
  });
});

describe("races", () => {
  test("N parallel bookings for one slot: exactly one wins", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }]);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        code(createBooking(env, request(eventType.id, at("09:00")), deps, actor)),
      ),
    );
    expect(results.filter((result) => result === "ok").length).toBe(1);
    expect(results.filter((result) => result === "slot_unavailable").length).toBe(7);
    await auditClaims(env);
  });

  test("a 30 and a 60 minute booking at the same start can't both win", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }], {
      duration_options: [60],
      step_minutes: 30,
    });
    const results = await Promise.all([
      code(createBooking(env, request(eventType.id, at("09:00")), deps, actor)),
      code(
        createBooking(
          env,
          request(eventType.id, at("09:00"), { durationMinutes: 60 }),
          deps,
          actor,
        ),
      ),
    ]);
    expect(results.filter((result) => result === "ok").length).toBe(1);
  });

  test("a limit under load: exactly L win", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }], {
      limits: [{ period: "day", max: 3, scope: "event_type" }],
    });
    const starts = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"];
    const results = await Promise.all(
      starts.map((time) => code(createBooking(env, request(eventType.id, at(time)), deps, actor))),
    );
    expect(results.filter((result) => result === "ok").length).toBe(3);
  });

  test("a pool under load: every host used once, then the slot is gone", async () => {
    const env = await tenantEnv();
    const hosts = await Promise.all([hostWithHours(env), hostWithHours(env), hostWithHours(env)]);
    const eventType = await eventTypeFor(
      env,
      hosts.map((host) => ({ host: host.id })),
      { kind: "pool" },
    );
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        createBooking(env, request(eventType.id, at("09:00")), deps, actor).catch((e) => e),
      ),
    );
    const won = results.filter((result) => !(result instanceof SchedulingError));
    expect(won.length).toBe(3);
    const hostsUsed = won.map((result) => result.booking.hosts[0]);
    expect(new Set(hostsUsed).size).toBe(3);
    await auditClaims(env);
  });

  test("collective bookings in parallel don't deadlock, and one wins per slot", async () => {
    const env = await tenantEnv();
    const [a, b, c] = await Promise.all([
      hostWithHours(env),
      hostWithHours(env),
      hostWithHours(env),
    ]);
    const forward = await eventTypeFor(
      env,
      [a, b, c].map((host) => ({ host: host?.id as string, role: "required" as const })),
      { kind: "collective" },
    );
    const backward = await eventTypeFor(
      env,
      [c, b, a].map((host) => ({ host: host?.id as string, role: "required" as const })),
      { kind: "collective" },
    );
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        code(
          createBooking(
            env,
            request(index % 2 ? forward.id : backward.id, at("09:00")),
            deps,
            actor,
          ),
        ),
      ),
    );
    expect(results.filter((result) => result === "ok").length).toBe(1);
    expect(results.filter((result) => result === "slot_unavailable").length).toBe(9);
    await auditClaims(env);
  });

  test("a group session never exceeds capacity", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }], { kind: "group", capacity: 3 });
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        code(
          createBooking(
            env,
            {
              eventType: eventType.id,
              startMs: at("09:00"),
              attendee: { uid: `p${index}`, time_zone: "UTC" },
            },
            deps,
            actor,
          ),
        ),
      ),
    );
    expect(results.filter((result) => result === "ok").length).toBe(3);
    const slots = await listEventTypeSlots(env, {
      eventTypeRef: eventType.id,
      fromMs: at("09:00"),
      toMs: at("09:30"),
      nowMs: at("00:00"),
    });
    expect(slots).toEqual([]);
  });
});

describe("holds", () => {
  test("a hold blocks others, then converts", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }]);
    const { booking: hold } = await createHold(
      env,
      request(eventType.id, at("09:00")),
      deps,
      actor,
    );
    expect(hold.status).toBe("held");
    expect(hold.hold_expires_at).not.toBeNull();
    expect(await code(createBooking(env, request(eventType.id, at("09:00")), deps, actor))).toBe(
      "slot_unavailable",
    );
    const confirmed = await confirmHold(env, hold.id, {}, deps, actor);
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.hold_expires_at).toBeNull();
    await auditClaims(env);
  });

  // `hoursAgo`: holds on one slot took turns, so their live ranges can't overlap.
  async function expiredHold(
    env: SchedulingEnvironment,
    eventTypeId: string,
    startMs: number,
    hoursAgo = 1,
  ) {
    const { booking: hold } = await createHold(env, request(eventTypeId, startMs), deps, actor);
    const until = sql`clock_timestamp() - (${hoursAgo}::int * interval '1 hour')`;
    await db.execute(sql`
      update scheduling_claim set live_from = ${until} - interval '30 minutes', live_until = ${until}
      where booking_id = ${hold.id}`);
    await db.execute(sql`
      update scheduling_booking set hold_expires_at = ${until} where id = ${hold.id}`);
    return hold;
  }

  test("an expired hold blocks nobody, with no sweep having run", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }]);
    await expiredHold(env, eventType.id, at("09:00"));
    const { booking } = await createBooking(env, request(eventType.id, at("09:00")), deps, actor);
    expect(booking.status).toBe("confirmed");
  });

  test("an expired hold refuses to convert, unless still free and asked", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }]);
    const hold = await expiredHold(env, eventType.id, at("09:00"));
    expect(await code(confirmHold(env, hold.id, {}, deps, actor))).toBe("hold_expired");
    const confirmed = await confirmHold(env, hold.id, { ifStillFree: true }, deps, actor);
    expect(confirmed.status).toBe("confirmed");
  });

  test("an expired hold can't convert over someone who took the slot", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }]);
    const hold = await expiredHold(env, eventType.id, at("09:00"));
    await createBooking(env, request(eventType.id, at("09:00")), deps, actor);
    expect(await code(confirmHold(env, hold.id, { ifStillFree: true }, deps, actor))).toBe(
      "slot_unavailable",
    );
    await auditClaims(env);
  });

  test("two expired holds on one slot don't falsely conflict on conversion", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }]);
    const first = await expiredHold(env, eventType.id, at("09:00"), 4);
    await expiredHold(env, eventType.id, at("09:00"), 2);
    const confirmed = await confirmHold(env, first.id, { ifStillFree: true }, deps, actor);
    expect(confirmed.status).toBe("confirmed");
  });

  test("the sweep cancels expired holds, and only those", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }]);
    const expired = await expiredHold(env, eventType.id, at("09:00"));
    const { booking: live } = await createHold(
      env,
      request(eventType.id, at("10:00")),
      deps,
      actor,
    );
    const scope = { organizationIds: [env.organizationId] };
    await expireDueBookings(deps, { scope });
    expect((await getBooking(env, expired.id, deps)).status).toBe("cancelled");
    expect((await getBooking(env, live.id, deps)).status).toBe("held");
    await auditClaims(env);
  });
});

describe("changing a booking", () => {
  test("reschedule overlapping its own old time works, and keeps the id", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }], {
      duration_minutes: 60,
      step_minutes: 30,
    });
    const { booking } = await createBooking(env, request(eventType.id, at("09:00")), deps, actor);
    const moved = await rescheduleBooking(env, booking.id, { startMs: at("09:30") }, deps, actor);
    expect(moved.id).toBe(booking.id);
    expect(moved.start).toBe(new Date(at("09:30")).toISOString());
    await auditClaims(env);
  });

  test("a lost reschedule keeps the original booking and its claim", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }]);
    const { booking } = await createBooking(env, request(eventType.id, at("09:00")), deps, actor);
    await createBooking(env, request(eventType.id, at("10:00")), deps, actor);
    expect(
      await code(rescheduleBooking(env, booking.id, { startMs: at("10:00") }, deps, actor)),
    ).toBe("slot_unavailable");
    const after = await getBooking(env, booking.id, deps);
    expect(after.start).toBe(new Date(at("09:00")).toISOString());
    expect(await code(createBooking(env, request(eventType.id, at("09:00")), deps, actor))).toBe(
      "slot_unavailable",
    );
    await auditClaims(env);
  });

  test("a reschedule uses the booking's snapshot, not the edited event type", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }]);
    const { booking } = await createBooking(env, request(eventType.id, at("09:00")), deps, actor);
    await updateEventType(env, eventType.id, { duration_minutes: 90, step_minutes: 30 });
    const moved = await rescheduleBooking(env, booking.id, { startMs: at("10:00") }, deps, actor);
    expect(new Date(moved.end).getTime() - new Date(moved.start).getTime()).toBe(30 * 60_000);
  });

  test("cancel frees the time, and attendee cutoffs apply only when asked", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }], {
      cancel_notice_minutes: 60,
    });
    const { booking } = await createBooking(env, request(eventType.id, at("09:00")), deps, actor);
    const close = testSchedulingDeps({ now: () => new Date(at("08:30")) });
    expect(await code(cancelBooking(env, booking.id, close, actor, { enforceCutoffs: true }))).toBe(
      "notice_too_short",
    );
    const cancelled = await cancelBooking(env, booking.id, close, actor);
    expect(cancelled.status).toBe("cancelled");
    await createBooking(env, request(eventType.id, at("09:00")), deps, actor);
    await auditClaims(env);
  });

  test("approval: blocks while pending; decline frees it; approve firms it up", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }], { requires_approval: true });
    const { booking: first } = await createBooking(
      env,
      request(eventType.id, at("09:00")),
      deps,
      actor,
    );
    expect(first.status).toBe("pending_approval");
    expect(await code(createBooking(env, request(eventType.id, at("09:00")), deps, actor))).toBe(
      "slot_unavailable",
    );
    expect((await declineBooking(env, first.id, deps, actor)).status).toBe("declined");
    const { booking: second } = await createBooking(
      env,
      request(eventType.id, at("09:00")),
      deps,
      actor,
    );
    expect((await approveBooking(env, second.id, deps, actor)).status).toBe("confirmed");
    await auditClaims(env);
  });

  test("a host with upcoming bookings can't be deleted", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }]);
    const { booking } = await createBooking(env, request(eventType.id, at("09:00")), deps, actor);
    expect(await code(deleteHost(env, host.id))).toBe("host_has_live_bookings");
    await cancelBooking(env, booking.id, deps, actor);
    expect((await deleteHost(env, host.id)).id).toBe(host.id);
  });

  test("a host removed from a pool keeps its bookings but gets no new ones", async () => {
    const env = await tenantEnv();
    const [a, b] = await Promise.all([hostWithHours(env), hostWithHours(env)]);
    const eventType = await eventTypeFor(
      env,
      [{ host: a?.id as string }, { host: b?.id as string }],
      { kind: "pool" },
    );
    await updateEventType(env, eventType.id, {
      hosts: [{ host: b?.id as string, role: "member", weight: 100, schedule: null }],
    });
    const { booking } = await createBooking(env, request(eventType.id, at("09:00")), deps, actor);
    expect(booking.hosts).toEqual([b?.id as string]);
  });
});

describe("pools", () => {
  test("bookings spread by weight", async () => {
    const env = await tenantEnv();
    const [a, b] = await Promise.all([hostWithHours(env), hostWithHours(env)]);
    const eventType = await eventTypeFor(
      env,
      [
        { host: a?.id as string, weight: 300 },
        { host: b?.id as string, weight: 100 },
      ],
      { kind: "pool" },
    );
    const counts = new Map<string, number>();
    for (let index = 0; index < 16; index++) {
      const start = at("09:00") + index * 30 * 60_000;
      const { booking } = await createBooking(env, request(eventType.id, start), deps, actor);
      const hostId = booking.hosts[0] as string;
      counts.set(hostId, (counts.get(hostId) ?? 0) + 1);
    }
    expect(counts.get(a?.id as string)).toBeGreaterThanOrEqual(11);
    expect(counts.get(b?.id as string)).toBeGreaterThanOrEqual(3);
  });

  test("attributes narrow who can be chosen", async () => {
    const env = await tenantEnv();
    const ny = await createHost(env, {
      name: "NY",
      time_zone: "UTC",
      attributes: { licensed_in: ["NY"] },
    });
    const ca = await createHost(env, {
      name: "CA",
      time_zone: "UTC",
      attributes: { licensed_in: ["CA", "OR"] },
    });
    for (const host of [ny, ca]) {
      await createSchedule(env, host.id, {
        rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
      });
    }
    const eventType = await eventTypeFor(env, [{ host: ny.id }, { host: ca.id }], { kind: "pool" });
    const { booking } = await createBooking(
      env,
      request(eventType.id, at("09:00"), { attributes: { licensed_in: "CA" } }),
      deps,
      actor,
    );
    expect(booking.hosts).toEqual([ca.id]);
    const found = await searchAvailability(env, {
      eventTypeRef: eventType.id,
      fromMs: at("09:00"),
      toMs: at("12:00"),
      nowMs: at("00:00"),
      attributes: { licensed_in: "NY" },
      slotsPerHost: 2,
      limit: 10,
    });
    expect(found.data.map((row) => row.hostId)).toEqual([ny.id]);
    expect(found.data[0]?.slots.length).toBe(2);
  });

  test("a host filter brings in matching hosts with no explicit assignment", async () => {
    const env = await tenantEnv();
    const host = await createHost(env, {
      name: "Filter",
      time_zone: "UTC",
      attributes: { team: "urgent" },
    });
    await createSchedule(env, host.id, {
      rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
    });
    const eventType = await eventTypeFor(env, [], {
      kind: "pool",
      host_filter: { team: "urgent" },
    });
    const { booking } = await createBooking(env, request(eventType.id, at("09:00")), deps, actor);
    expect(booking.hosts).toEqual([host.id]);
  });
});

describe("collective", () => {
  test("every required host must be free", async () => {
    const env = await tenantEnv();
    const [a, b] = await Promise.all([hostWithHours(env), hostWithHours(env)]);
    const solo = await eventTypeFor(env, [{ host: a?.id as string }]);
    const both = await eventTypeFor(
      env,
      [
        { host: a?.id as string, role: "required" },
        { host: b?.id as string, role: "required" },
      ],
      { kind: "collective" },
    );
    await createBooking(env, request(solo.id, at("09:00")), deps, actor);
    const slots = await listEventTypeSlots(env, {
      eventTypeRef: both.id,
      fromMs: at("09:00"),
      toMs: at("10:00"),
      nowMs: at("00:00"),
    });
    expect(slots.map((slot) => slot.startMs)).toEqual([at("09:30")]);
    expect(await code(createBooking(env, request(both.id, at("09:00")), deps, actor))).toBe(
      "slot_unavailable",
    );
    const { booking } = await createBooking(env, request(both.id, at("09:30")), deps, actor);
    expect(booking.hosts.sort()).toEqual([a?.id as string, b?.id as string].sort());
    await auditClaims(env);
  });
});

describe("group sessions", () => {
  test("seats share one claim, and the claim goes with the last seat", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }], { kind: "group", capacity: 2 });
    const seat = (uid: string) => ({
      eventType: eventType.id,
      startMs: at("09:00"),
      attendee: { uid, time_zone: "UTC" },
    });
    const { booking: one } = await createBooking(env, seat("a"), deps, actor);
    const { booking: two } = await createBooking(env, seat("b"), deps, actor);
    expect(one.group_session).toBe(two.group_session);
    expect(await code(createBooking(env, seat("c"), deps, actor))).toBe("slot_unavailable");
    await cancelBooking(env, one.id, deps, actor);
    const { booking: three } = await createBooking(env, seat("c"), deps, actor);
    expect(three.group_session).toBe(two.group_session);
    const claims = await db
      .select()
      .from(schema.schedulingClaim)
      .where(eq(schema.schedulingClaim.groupSessionId, two.group_session as string));
    expect(claims.length).toBe(1);
    await cancelBooking(env, two.id, deps, actor);
    await cancelBooking(env, three.id, deps, actor);
    const after = await db
      .select()
      .from(schema.schedulingClaim)
      .where(eq(schema.schedulingClaim.groupSessionId, two.group_session as string));
    expect(after.length).toBe(0);
  });

  test("a session blocks the host's other event types, and overlapping starts", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const group = await eventTypeFor(env, [{ host: host.id }], {
      kind: "group",
      capacity: 2,
      duration_minutes: 60,
      step_minutes: 30,
    });
    const solo = await eventTypeFor(env, [{ host: host.id }]);
    await createBooking(
      env,
      { eventType: group.id, startMs: at("09:00"), attendee: { uid: "a", time_zone: "UTC" } },
      deps,
      actor,
    );
    expect(await code(createBooking(env, request(solo.id, at("09:00")), deps, actor))).toBe(
      "slot_unavailable",
    );
    expect(
      await code(
        createBooking(
          env,
          { eventType: group.id, startMs: at("09:30"), attendee: { uid: "b", time_zone: "UTC" } },
          deps,
          actor,
        ),
      ),
    ).toBe("slot_unavailable");
    const slots = await listEventTypeSlots(env, {
      eventTypeRef: group.id,
      fromMs: at("09:00"),
      toMs: at("11:00"),
      nowMs: at("00:00"),
    });
    expect(slots.map((slot) => slot.startMs)).toEqual([at("09:00"), at("10:00"), at("10:30")]);
  });
});

describe("series", () => {
  const recurrence = { frequency: "weekly" as const, interval: 1, count: 4 };

  test("keeps wall clock across a DST change, in the attendee's zone", async () => {
    const env = await tenantEnv();
    const host = await createHost(env, { name: "NY", time_zone: "America/New_York" });
    await createSchedule(env, host.id, {
      rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "24:00" }],
    });
    const eventType = await eventTypeFor(env, [{ host: host.id }]);
    const { result } = await createSeries(
      env,
      {
        eventType: eventType.id,
        startMs: ms("2031-10-20T14:00:00Z"),
        attendee: { uid: "p", time_zone: "America/New_York" },
        recurrence,
        onConflict: "reject",
      },
      deps,
      actor,
    );
    // 10:00 New York: 14:00Z before the change on 2 November 2031, then 15:00Z.
    expect(result.bookings.map((booking) => booking.start.slice(11, 16))).toEqual([
      "14:00",
      "14:00",
      "15:00",
      "15:00",
    ]);
    expect(result.bookings.map((booking) => booking.series_index)).toEqual([0, 1, 2, 3]);
  });

  test("reject takes nothing when an occurrence conflicts; skip reports it", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }]);
    const second = at("09:00") + 7 * 86_400_000;
    await createBooking(env, request(eventType.id, second), deps, actor);
    const base = {
      eventType: eventType.id,
      startMs: at("09:00"),
      attendee: { uid: "p", time_zone: "UTC" },
      recurrence,
    };
    expect(await code(createSeries(env, { ...base, onConflict: "reject" }, deps, actor))).toBe(
      "slot_unavailable",
    );
    const free = await listEventTypeSlots(env, {
      eventTypeRef: eventType.id,
      fromMs: at("09:00"),
      toMs: at("09:30"),
      nowMs: at("00:00"),
    });
    expect(free.length).toBe(1);
    const preview = await previewSeries(env, { ...base, onConflict: "skip" }, deps);
    expect(preview.map((item) => item.available)).toEqual([true, false, true, true]);
    const { result } = await createSeries(env, { ...base, onConflict: "skip" }, deps, actor);
    expect(result.bookings.length).toBe(3);
    expect(result.conflicts.map((conflict) => conflict.index)).toEqual([1]);
    await auditClaims(env);
  });

  test("a pool keeps one host for the whole series", async () => {
    const env = await tenantEnv();
    const [a, b] = await Promise.all([hostWithHours(env), hostWithHours(env)]);
    const eventType = await eventTypeFor(
      env,
      [{ host: a?.id as string }, { host: b?.id as string }],
      {
        kind: "pool",
      },
    );
    const blocker = await eventTypeFor(env, [{ host: a?.id as string }]);
    await createBooking(env, request(blocker.id, at("09:00") + 14 * 86_400_000), deps, actor);
    const { result } = await createSeries(
      env,
      {
        eventType: eventType.id,
        startMs: at("09:00"),
        attendee: { uid: "p", time_zone: "UTC" },
        recurrence,
        onConflict: "reject",
      },
      deps,
      actor,
    );
    expect(new Set(result.bookings.flatMap((booking) => booking.hosts))).toEqual(
      new Set([b?.id as string]),
    );
  });

  test("replaying a series returns the same bookings", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }]);
    const input = {
      eventType: eventType.id,
      startMs: at("09:00"),
      attendee: { uid: "p", time_zone: "UTC" },
      recurrence,
      onConflict: "reject" as const,
      idempotencyKey: "series-key",
    };
    const first = await createSeries(env, input, deps, actor);
    const second = await createSeries(env, input, deps, actor);
    expect(second.replayed).toBe(true);
    expect(second.result.seriesId).toBe(first.result.seriesId);
    expect(second.result.bookings.map((booking) => booking.id)).toEqual(
      first.result.bookings.map((booking) => booking.id),
    );
  });
});

describe("billing", () => {
  test("one unit when confirmed, none for holds or sandbox, and never twice", async () => {
    const env = await tenantEnv("live");
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }]);
    const reserved: number[] = [];
    const billed = testSchedulingDeps({
      billing: {
        reserve: async (_tx, input) => {
          reserved.push(input.quantity);
        },
      },
    });
    const usage = async () => {
      const { rows } = await db.execute(sql`
        select coalesce(sum(quantity), 0)::int as n from billing_usage
        where organization_id = ${env.organizationId} and meter = 'scheduling.bookings'`);
      return (rows[0] as { n: number }).n;
    };
    const { booking: hold } = await createHold(
      env,
      request(eventType.id, at("09:00")),
      billed,
      actor,
    );
    expect(await usage()).toBe(0);
    await confirmHold(env, hold.id, {}, billed, actor);
    expect(await usage()).toBe(1);
    await confirmHold(env, hold.id, {}, billed, actor);
    expect(await usage()).toBe(1);
    await rescheduleBooking(env, hold.id, { startMs: at("10:00") }, billed, actor);
    expect(await usage()).toBe(1);
    await cancelBooking(env, hold.id, billed, actor);
    expect(await usage()).toBe(1);
    expect(reserved).toEqual([1]);
  });

  test("a group session is one unit, however many seats", async () => {
    const env = await tenantEnv("live");
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }], { kind: "group", capacity: 5 });
    for (const uid of ["a", "b", "c"]) {
      await createBooking(
        env,
        { eventType: eventType.id, startMs: at("09:00"), attendee: { uid, time_zone: "UTC" } },
        deps,
        actor,
      );
    }
    const { rows } = await db.execute(sql`
      select coalesce(sum(quantity), 0)::int as n from billing_usage
      where organization_id = ${env.organizationId} and meter = 'scheduling.bookings'`);
    expect((rows[0] as { n: number }).n).toBe(1);
  });
});
