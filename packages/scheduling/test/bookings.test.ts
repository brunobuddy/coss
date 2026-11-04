import { describe, expect, spyOn, test } from "bun:test";
import { db, pool, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { and, eq, sql } from "drizzle-orm";
import {
  approveBooking,
  cancelBooking,
  confirmHold,
  createBookerSession,
  createBooking,
  createEventType,
  createHold,
  createHost,
  createSchedule,
  createSeries,
  declineBooking,
  deleteHost,
  eraseAttendeeByEmail,
  expireDueBookings,
  getBooking,
  getBookingOverview,
  listBookings,
  listEventTypeSlots,
  previewSeries,
  rescheduleBooking,
  type SchedulingEnvironment,
  SchedulingError,
  searchAvailability,
  updateEventType,
  updateHost,
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

describe("the dashboard's reads", () => {
  test("an overview names the host and has its history, but never answers", async () => {
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
    await cancelBooking(env, booking.id, deps, actor);
    const overview = await getBookingOverview(env, booking.id, deps);
    expect(overview.eventTypeTitle).toBe("Consultation");
    expect(overview.hosts).toEqual([{ id: host.id, name: "Dr. Reyes" }]);
    expect(overview.booking.attendees[0]?.email).toBe("sam@example.com");
    expect(overview.booking.attendees[0]).not.toHaveProperty("answers");
    expect(JSON.stringify(overview)).not.toContain("chest pain");
    expect(overview.events.map((event) => event.type).at(0)).toBe("scheduling.booking.cancelled");
    expect(overview.events.every((event) => event.actor === "system")).toBe(true);
  });

  test("an overview stays in its environment", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }]);
    const { booking } = await createBooking(env, request(eventType.id, at("09:00")), deps, actor);
    const other = await tenantEnv();
    expect(await code(getBookingOverview(other, booking.id, deps))).toBe("not_found");
    expect(await code(getBookingOverview(env, "book_nope", deps))).toBe("not_found");
  });

  test("the list filters by status and finds an attendee by email or uid", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }]);
    const { booking: first } = await createBooking(
      env,
      request(eventType.id, at("09:00")),
      deps,
      actor,
    );
    const { booking: second } = await createBooking(
      env,
      request(eventType.id, at("10:00"), {
        attendee: { uid: "patient_2", email: "Ada@Example.com", time_zone: "UTC" },
      }),
      deps,
      actor,
    );
    await cancelBooking(env, first.id, deps, actor);
    const ids = async (query: Parameters<typeof listBookings>[1]) =>
      (await listBookings(env, query, deps)).data.map((booking) => booking.id);
    expect(await ids({ limit: 10, status: "cancelled" })).toEqual([first.id]);
    expect(await ids({ limit: 10, status: "confirmed" })).toEqual([second.id]);
    expect(await ids({ limit: 10, attendeeEmail: "ada@example.com" })).toEqual([second.id]);
    expect(await ids({ limit: 10, attendeeUid: "patient_2" })).toEqual([second.id]);
    expect(await ids({ limit: 10, status: "cancelled", attendeeUid: "patient_2" })).toEqual([]);
  });
});

describe("listing by start time", () => {
  async function agenda() {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }]);
    const times = ["13:00", "09:00", "11:00", "15:00", "10:00"];
    const booked = [];
    for (const time of times) {
      booked.push((await createBooking(env, request(eventType.id, at(time)), deps, actor)).booking);
    }
    return { env, booked };
  }
  const starts = (rows: { start: string }[]) => rows.map((row) => row.start.slice(11, 16));

  test("pages forward and backward by start, not by when it was made", async () => {
    const { env } = await agenda();
    const first = await listBookings(env, { limit: 2, order: "start_asc" }, deps);
    expect(starts(first.data)).toEqual(["09:00", "10:00"]);
    expect(first.hasMore).toBe(true);
    const second = await listBookings(
      env,
      { limit: 2, order: "start_asc", after: first.data.at(-1)?.id },
      deps,
    );
    expect(starts(second.data)).toEqual(["11:00", "13:00"]);
    const third = await listBookings(
      env,
      { limit: 2, order: "start_asc", after: second.data.at(-1)?.id },
      deps,
    );
    expect(starts(third.data)).toEqual(["15:00"]);
    expect(third.hasMore).toBe(false);

    const backwards = await listBookings(env, { limit: 2, order: "start_desc" }, deps);
    expect(starts(backwards.data)).toEqual(["15:00", "13:00"]);
    const rest = await listBookings(
      env,
      { limit: 5, order: "start_desc", after: backwards.data.at(-1)?.id },
      deps,
    );
    expect(starts(rest.data)).toEqual(["11:00", "10:00", "09:00"]);
  });

  test("the default stays newest first", async () => {
    const { env, booked } = await agenda();
    const { data } = await listBookings(env, { limit: 5 }, deps);
    expect(data.map((row) => row.id)).toEqual(booked.map((row) => row.id).reverse());
  });

  test("filters by end time and several statuses", async () => {
    const { env, booked } = await agenda();
    const cancelled = booked[0];
    if (!cancelled) throw new Error("no booking");
    await cancelBooking(env, cancelled.id, deps, actor);
    const live = await listBookings(
      env,
      { limit: 10, order: "start_asc", statuses: ["confirmed", "held"] },
      deps,
    );
    expect(starts(live.data)).toEqual(["09:00", "10:00", "11:00", "15:00"]);
    const after = await listBookings(
      env,
      { limit: 10, order: "start_asc", endAfter: new Date(at("11:15")) },
      deps,
    );
    expect(starts(after.data)).toEqual(["11:00", "13:00", "15:00"]);
    const before = await listBookings(
      env,
      { limit: 10, order: "start_desc", endBefore: new Date(at("11:00")) },
      deps,
    );
    expect(starts(before.data)).toEqual(["10:00", "09:00"]);
  });

  test("another environment's booking is no cursor", async () => {
    const { env } = await agenda();
    const other = await agenda();
    const foreign = other.booked[0];
    const { data } = await listBookings(
      env,
      { limit: 5, order: "start_asc", after: foreign?.id },
      deps,
    );
    expect(data).toEqual([]);
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

  test("an expired hold can't convert past a limit, or outside new hours", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const limited = await createEventType(env, {
      title: "Limited",
      kind: "one_on_one",
      duration_minutes: 30,
      hosts: [{ host: host.id, role: "member", weight: 100, schedule: null }],
      limits: [{ period: "day", max: 1, scope: "event_type" }],
    } as never);
    const hold = await expiredHold(env, limited.id, at("09:00"));
    await createBooking(env, request(limited.id, at("11:00")), deps, actor);
    expect(await code(confirmHold(env, hold.id, { ifStillFree: true }, deps, actor))).toBe(
      "slot_unavailable",
    );

    const other = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: other.id }]);
    const late = await expiredHold(env, eventType.id, at("09:00"));
    await db
      .update(schema.schedulingSchedule)
      .set({ rules: [{ days: [0, 1, 2, 3, 4, 5, 6], startMinute: 780, endMinute: 1020 }] })
      .where(eq(schema.schedulingSchedule.hostId, other.id));
    expect(await code(confirmHold(env, late.id, { ifStillFree: true }, deps, actor))).toBe(
      "slot_unavailable",
    );
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
  test("each host tried and lost leaves nothing behind in the transaction", async () => {
    const env = await tenantEnv("live");
    const free = await hostWithHours(env);
    const noHours = [];
    for (let index = 0; index < 12; index++) {
      noHours.push(await createHost(env, { name: `No hours ${index}`, time_zone: "UTC" }));
    }
    const eventType = await eventTypeFor(
      env,
      [free, ...noHours].map((host) => ({ host: host.id })),
      { kind: "pool" },
    );
    // Assigned most recently, so it's tried last.
    await db
      .update(schema.schedulingEventTypeHost)
      .set({ lastAssignedAt: new Date() })
      .where(
        and(
          eq(schema.schedulingEventTypeHost.eventTypeId, eventType.id),
          eq(schema.schedulingEventTypeHost.hostId, free.id),
        ),
      );
    let transactionIds = -1;
    const { booking } = await createBooking(
      env,
      request(eventType.id, at("09:00")),
      testSchedulingDeps({
        billing: {
          async reserve(tx) {
            const { rows } = await tx.execute<{ locks: number }>(sql`
              select count(*)::int as locks from pg_locks
              where pid = pg_backend_pid() and locktype = 'transactionid'
            `);
            transactionIds = rows[0]?.locks ?? -1;
          },
        },
      }),
      actor,
    );
    expect(booking.hosts).toEqual([free.id]);
    expect(transactionIds).toBeGreaterThan(0);
    expect(transactionIds).toBeLessThanOrEqual(2);
  });

  test("a slot nobody can take costs one attempt and one read, not one per host", async () => {
    const env = await tenantEnv("live");
    const hosts = [];
    for (let index = 0; index < 30; index++) {
      hosts.push(await createHost(env, { name: `No hours ${index}`, time_zone: "UTC" }));
    }
    const eventType = await eventTypeFor(
      env,
      hosts.map((host) => ({ host: host.id })),
      { kind: "pool" },
    );
    const client = await pool.connect();
    const query = spyOn(Object.getPrototypeOf(client), "query");
    client.release();
    query.mockClear();
    try {
      await expect(
        createBooking(env, request(eventType.id, at("09:00")), deps, actor),
      ).rejects.toMatchObject({ code: "slot_unavailable" });
      expect(query.mock.calls.length).toBeLessThan(60);
    } finally {
      query.mockRestore();
    }
    await auditClaims(env);
  });

  test("a required host who can't make it ends a pool's search at once", async () => {
    const env = await tenantEnv();
    const required = await createHost(env, { name: "No hours", time_zone: "UTC" });
    const members = await Promise.all([hostWithHours(env), hostWithHours(env), hostWithHours(env)]);
    const eventType = await eventTypeFor(
      env,
      [
        { host: required.id, role: "required" },
        ...members.map((host) => ({ host: host?.id as string })),
      ],
      { kind: "pool" },
    );
    await expect(
      createBooking(env, request(eventType.id, at("09:00")), deps, actor),
    ).rejects.toMatchObject({ code: "slot_unavailable" });
  });

  test("a pool's narrowing keeps rank order and finds the one who's free", async () => {
    const env = await tenantEnv();
    const free = await hostWithHours(env);
    const noHours = [];
    for (let index = 0; index < 5; index++) {
      noHours.push(await createHost(env, { name: `No hours ${index}`, time_zone: "UTC" }));
    }
    const eventType = await eventTypeFor(
      env,
      [free, ...noHours].map((host) => ({ host: host?.id as string })),
      { kind: "pool" },
    );
    await db
      .update(schema.schedulingEventTypeHost)
      .set({ lastAssignedAt: new Date() })
      .where(
        and(
          eq(schema.schedulingEventTypeHost.eventTypeId, eventType.id),
          eq(schema.schedulingEventTypeHost.hostId, free?.id as string),
        ),
      );
    const { booking } = await createBooking(env, request(eventType.id, at("09:00")), deps, actor);
    expect(booking.hosts).toEqual([free?.id as string]);
    await auditClaims(env);
  });

  test("a search over many hosts lets other requests run", async () => {
    const env = await tenantEnv();
    const hosts = [];
    for (let index = 0; index < 60; index++) {
      hosts.push(await createHost(env, { name: `Host ${index}`, time_zone: "UTC" }));
    }
    const eventType = await eventTypeFor(
      env,
      hosts.map((host) => ({ host: host.id })),
      { kind: "pool" },
    );
    const turns = spyOn(globalThis, "setImmediate");
    try {
      await searchAvailability(env, {
        eventTypeRef: eventType.id,
        fromMs: at("00:00"),
        toMs: at("00:00") + 7 * 86_400_000,
        nowMs: at("00:00"),
        slotsPerHost: 1,
        limit: 10,
      });
      expect(turns.mock.calls.length).toBeGreaterThanOrEqual(4);
    } finally {
      turns.mockRestore();
    }
  });

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

  describe("joining a pool that's already running", () => {
    const fairUnits = async (eventTypeId: string, hostId: string) => {
      const [row] = await db
        .select({ units: schema.schedulingEventTypeHost.fairUnits })
        .from(schema.schedulingEventTypeHost)
        .where(
          and(
            eq(schema.schedulingEventTypeHost.eventTypeId, eventTypeId),
            eq(schema.schedulingEventTypeHost.hostId, hostId),
          ),
        );
      return row?.units;
    };
    const setUnits = (eventTypeId: string, units: number, hostId?: string) =>
      db
        .update(schema.schedulingEventTypeHost)
        .set({ fairUnits: units, lastAssignedAt: new Date() })
        .where(
          and(
            eq(schema.schedulingEventTypeHost.eventTypeId, eventTypeId),
            hostId ? eq(schema.schedulingEventTypeHost.hostId, hostId) : undefined,
          ),
        );
    const member = (host: string, weight = 100) => ({
      host,
      role: "member" as const,
      weight,
      schedule: null,
    });
    const poolOf = (env: SchedulingEnvironment, hosts: string[]) =>
      eventTypeFor(
        env,
        hosts.map((host) => ({ host })),
        { kind: "pool", duration_minutes: 15 },
      );
    const bookTurns = async (env: SchedulingEnvironment, eventTypeId: string, turns: number) => {
      const counts = new Map<string, number>();
      for (let index = 0; index < turns; index++) {
        const start = at("09:00") + index * 15 * 60_000;
        const { booking } = await createBooking(env, request(eventTypeId, start), deps, actor);
        const hostId = booking.hosts[0] as string;
        counts.set(hostId, (counts.get(hostId) ?? 0) + 1);
      }
      return counts;
    };
    const threeHosts = async (env: SchedulingEnvironment) => {
      const hosts = await Promise.all([hostWithHours(env), hostWithHours(env), hostWithHours(env)]);
      return hosts.map((host) => host?.id as string) as [string, string, string];
    };

    test("a new host takes their turn instead of every booking", async () => {
      const env = await tenantEnv();
      const [a, b, late] = await threeHosts(env);
      const eventType = await poolOf(env, [a, b]);
      await setUnits(eventType.id, 50);
      await updateEventType(env, eventType.id, { hosts: [member(a), member(b), member(late)] });

      const counts = await bookTurns(env, eventType.id, 9);

      expect(await fairUnits(eventType.id, late)).toBe(53);
      expect(counts.get(a)).toBe(3);
      expect(counts.get(b)).toBe(3);
      expect(counts.get(late)).toBe(3);
    });

    test("a new host's weight still counts once they've joined", async () => {
      const env = await tenantEnv();
      const [a, heavy] = await threeHosts(env);
      const eventType = await poolOf(env, [a]);
      await setUnits(eventType.id, 10);
      await updateEventType(env, eventType.id, { hosts: [member(a), member(heavy, 300)] });

      const counts = await bookTurns(env, eventType.id, 8);

      expect(counts.get(heavy)).toBe(6);
      expect(counts.get(a)).toBe(2);
    });

    test("someone removed and added back owes nothing", async () => {
      const env = await tenantEnv();
      const [a, back] = await threeHosts(env);
      const eventType = await poolOf(env, [a, back]);
      await setUnits(eventType.id, 5);
      await updateEventType(env, eventType.id, { hosts: [member(a)] });
      await setUnits(eventType.id, 40, a);
      await updateEventType(env, eventType.id, { hosts: [member(a), member(back)] });
      expect(await fairUnits(eventType.id, back)).toBe(40);

      const counts = await bookTurns(env, eventType.id, 4);

      expect(counts.get(a)).toBe(2);
      expect(counts.get(back)).toBe(2);
    });

    test("a host a filter finds later joins level too", async () => {
      const env = await tenantEnv();
      const [a] = await threeHosts(env);
      const eventType = await eventTypeFor(env, [{ host: a }], {
        kind: "pool",
        duration_minutes: 15,
        host_filter: { team: "urgent" },
      });
      await setUnits(eventType.id, 30);
      const found = await createHost(env, {
        name: "Found",
        time_zone: "UTC",
        attributes: { team: "urgent" },
      });
      await createSchedule(env, found.id, {
        rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
      });

      const counts = await bookTurns(env, eventType.id, 6);

      expect(counts.get(a)).toBe(3);
      expect(counts.get(found.id)).toBe(3);
      expect(await fairUnits(eventType.id, found.id)).toBe(33);
    });

    test("a pool's first members aren't treated as joining", async () => {
      const env = await tenantEnv();
      const [a, b] = await threeHosts(env);
      const eventType = await poolOf(env, [a, b]);
      expect(await fairUnits(eventType.id, a)).toBe(0);
      expect(await fairUnits(eventType.id, b)).toBe(0);
    });

    test("changing a weight keeps everyone's place", async () => {
      const env = await tenantEnv();
      const [a, b] = await threeHosts(env);
      const eventType = await poolOf(env, [a, b]);
      await setUnits(eventType.id, 50);
      await updateEventType(env, eventType.id, { hosts: [member(a, 200), member(b)] });
      expect(await fairUnits(eventType.id, a)).toBe(100);
      expect(await fairUnits(eventType.id, b)).toBe(50);

      const counts = await bookTurns(env, eventType.id, 6);

      expect(counts.get(a)).toBe(4);
      expect(counts.get(b)).toBe(2);
    });

    test("a weight taken right down and back loses nothing", async () => {
      const env = await tenantEnv();
      const [a, b] = await threeHosts(env);
      const eventType = await poolOf(env, [a, b]);
      await setUnits(eventType.id, 40);
      await updateEventType(env, eventType.id, { hosts: [member(a, 1), member(b)] });
      expect(await fairUnits(eventType.id, a)).toBeCloseTo(0.4);
      await updateEventType(env, eventType.id, { hosts: [member(a), member(b)] });
      expect(await fairUnits(eventType.id, a)).toBeCloseTo(40);

      const counts = await bookTurns(env, eventType.id, 4);

      expect(counts.get(a)).toBe(2);
      expect(counts.get(b)).toBe(2);
    });

    test("big counters and weights fit", async () => {
      const env = await tenantEnv();
      const [a, late] = await threeHosts(env);
      const eventType = await poolOf(env, [a]);
      await updateEventType(env, eventType.id, { hosts: [member(a, 1)] });
      await setUnits(eventType.id, 214_749);
      await updateEventType(env, eventType.id, {
        hosts: [member(a, 1), member(late, 10_000)],
      });
      expect(await fairUnits(eventType.id, late)).toBe(2_147_490_000);
      await updateEventType(env, eventType.id, {
        hosts: [member(a, 10_000), member(late, 10_000)],
      });
      expect(await fairUnits(eventType.id, a)).toBe(2_147_490_000);
    });

    test("someone taking bookings starts against who'll be in the pool, not who's leaving", async () => {
      const env = await tenantEnv();
      const [x, y, z] = await threeHosts(env);
      const eventType = await eventTypeFor(
        env,
        [{ host: x }, { host: y }, { host: z, role: "required" }],
        { kind: "pool", duration_minutes: 15 },
      );
      await setUnits(eventType.id, 100, x);
      await setUnits(eventType.id, 1, y);

      await updateEventType(env, eventType.id, {
        hosts: [member(x), { ...member(y), role: "required" }, member(z)],
      });

      expect(await fairUnits(eventType.id, z)).toBe(100);
    });

    test("a disabled host doesn't set where someone starts", async () => {
      const env = await tenantEnv();
      const [a, off, late] = await threeHosts(env);
      const eventType = await poolOf(env, [a, off]);
      await setUnits(eventType.id, 50, a);
      await setUnits(eventType.id, 1, off);
      await updateHost(env, off, { status: "disabled" });

      await updateEventType(env, eventType.id, {
        hosts: [member(a), member(off), member(late)],
      });

      expect(await fairUnits(eventType.id, late)).toBe(50);
    });

    test("cancelling after a weight change gives back what the booking took", async () => {
      const env = await tenantEnv();
      const [a, b] = await threeHosts(env);
      const eventType = await poolOf(env, [a, b]);
      await setUnits(eventType.id, 50);
      await setUnits(eventType.id, 60, b);
      const { booking } = await createBooking(env, request(eventType.id, at("09:00")), deps, actor);
      expect(booking.hosts).toEqual([a]);
      expect(await fairUnits(eventType.id, a)).toBe(51);

      await updateEventType(env, eventType.id, { hosts: [member(a, 1), member(b)] });
      expect(await fairUnits(eventType.id, a)).toBeCloseTo(0.51);
      await cancelBooking(env, booking.id, deps, actor);
      expect(await fairUnits(eventType.id, a)).toBeCloseTo(0.5);

      await updateEventType(env, eventType.id, { hosts: [member(a), member(b)] });
      expect(await fairUnits(eventType.id, a)).toBeCloseTo(50);
    });

    test("rescheduling to the same host keeps what the booking took", async () => {
      const env = await tenantEnv();
      const [a, b] = await threeHosts(env);
      const eventType = await poolOf(env, [a, b]);
      await setUnits(eventType.id, 50);
      await setUnits(eventType.id, 60, b);
      const { booking } = await createBooking(env, request(eventType.id, at("09:00")), deps, actor);
      await updateEventType(env, eventType.id, { hosts: [member(a, 1), member(b)] });

      await rescheduleBooking(env, booking.id, { startMs: at("10:00"), host: a }, deps, actor);
      await cancelBooking(env, booking.id, deps, actor);

      expect(await fairUnits(eventType.id, a)).toBeCloseTo(0.5);
    });

    test("a booking from before this was recorded gives back one", async () => {
      const env = await tenantEnv();
      const [a] = await threeHosts(env);
      const eventType = await poolOf(env, [a]);
      await setUnits(eventType.id, 20);
      const { booking } = await createBooking(env, request(eventType.id, at("09:00")), deps, actor);
      await db
        .update(schema.schedulingBookingHost)
        .set({ fairShare: null })
        .where(eq(schema.schedulingBookingHost.bookingId, booking.id));
      await cancelBooking(env, booking.id, deps, actor);
      expect(await fairUnits(eventType.id, a)).toBe(20);
    });

    test("adding a host a booker is just counting keeps their count", async () => {
      const env = await tenantEnv();
      const [a, found] = await threeHosts(env);
      const eventType = await poolOf(env, [a]);
      await setUnits(eventType.id, 50);
      let added: Promise<unknown> = Promise.resolve();
      await db.transaction(async (tx) => {
        await tx.insert(schema.schedulingEventTypeHost).values({
          eventTypeId: eventType.id,
          hostId: found,
          organizationId: env.organizationId,
          assigned: false,
          fairUnits: 51,
        });
        added = updateEventType(env, eventType.id, { hosts: [member(a), member(found, 200)] });
        await new Promise((resolve) => setTimeout(resolve, 150));
      });
      await added;
      expect(await fairUnits(eventType.id, found)).toBe(102);
    });

    test("a cancellation before the start gives the turn back", async () => {
      const env = await tenantEnv();
      const [a, late] = await threeHosts(env);
      const eventType = await poolOf(env, [a]);
      await setUnits(eventType.id, 20);
      await updateEventType(env, eventType.id, { hosts: [member(a), member(late)] });
      const { booking } = await createBooking(env, request(eventType.id, at("09:00")), deps, actor);
      expect(booking.hosts).toEqual([late]);
      expect(await fairUnits(eventType.id, late)).toBe(21);

      await cancelBooking(env, booking.id, deps, actor);

      expect(await fairUnits(eventType.id, late)).toBe(20);
    });
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

  const noHoursPool = async (env: SchedulingEnvironment, count: number) => {
    const hosts = [];
    for (let index = 0; index < count; index++) {
      hosts.push(await createHost(env, { name: `No hours ${index}`, time_zone: "UTC" }));
    }
    return hosts;
  };
  const seriesOf = (eventType: string, onConflict: "reject" | "skip") => ({
    eventType,
    startMs: at("09:00"),
    attendee: { uid: "p", time_zone: "UTC" },
    recurrence,
    onConflict,
  });

  test("a large pool nobody can serve refuses a series without trying each host", async () => {
    const env = await tenantEnv("live");
    const hosts = await noHoursPool(env, 30);
    const eventType = await eventTypeFor(
      env,
      hosts.map((host) => ({ host: host.id })),
      { kind: "pool" },
    );
    const client = await pool.connect();
    const query = spyOn(Object.getPrototypeOf(client), "query");
    client.release();
    query.mockClear();
    try {
      await expect(
        createSeries(env, seriesOf(eventType.id, "reject"), deps, actor),
      ).rejects.toMatchObject({ code: "slot_unavailable" });
      expect(query.mock.calls.length).toBeLessThan(30);
    } finally {
      query.mockRestore();
    }
  });

  test("a large pool's series goes to the one free for all of it", async () => {
    const env = await tenantEnv();
    const [busy, free, ...others] = await Promise.all([
      hostWithHours(env),
      hostWithHours(env),
      hostWithHours(env),
      hostWithHours(env),
    ]);
    const eventType = await eventTypeFor(
      env,
      [busy, free, ...others].map((host) => ({ host: host?.id as string })),
      { kind: "pool" },
    );
    for (const host of [busy, ...others]) {
      const blocker = await eventTypeFor(env, [{ host: host?.id as string }]);
      await createBooking(env, request(blocker.id, at("09:00") + 7 * 86_400_000), deps, actor);
    }
    const { result } = await createSeries(env, seriesOf(eventType.id, "reject"), deps, actor);
    expect(new Set(result.bookings.flatMap((booking) => booking.hosts))).toEqual(
      new Set([free?.id as string]),
    );
    await auditClaims(env);
  });

  test("with skip, a large pool's series goes to who has the fewest conflicts", async () => {
    const env = await tenantEnv();
    const hosts = await Promise.all([
      hostWithHours(env),
      hostWithHours(env),
      hostWithHours(env),
      hostWithHours(env),
    ]);
    const eventType = await eventTypeFor(
      env,
      hosts.map((host) => ({ host: host?.id as string })),
      { kind: "pool" },
    );
    for (const [index, host] of hosts.entries()) {
      const blocker = await eventTypeFor(env, [{ host: host?.id as string }]);
      await createBooking(env, request(blocker.id, at("09:00") + 7 * 86_400_000), deps, actor);
      if (index === 0) continue;
      await createBooking(
        env,
        request(blocker.id, at("09:00") + 14 * 86_400_000, {
          attendee: { uid: "other", time_zone: "UTC" },
        }),
        deps,
        actor,
      );
    }
    const { result } = await createSeries(env, seriesOf(eventType.id, "skip"), deps, actor);
    expect(new Set(result.bookings.flatMap((booking) => booking.hosts))).toEqual(
      new Set([hosts[0]?.id as string]),
    );
    expect(result.conflicts).toHaveLength(1);
    await auditClaims(env);
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

describe("guests", () => {
  async function allowing(maxGuests: number) {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    const eventType = await eventTypeFor(env, [{ host: host.id }], { max_guests: maxGuests });
    return { env, eventType };
  }
  const request = (eventType: string, guests: { email: string; name?: string }[]) => ({
    eventType,
    startMs: at("09:00"),
    attendee,
    guests,
  });

  test("they come after the attendee, with no uid of their own", async () => {
    const { env, eventType } = await allowing(2);
    const guests = [{ email: "jo@example.com", name: "Jo Park" }, { email: "kai@example.com" }];
    const { booking } = await createBooking(env, request(eventType.id, guests), deps, actor);
    expect(booking.attendees.map((person) => person.role)).toEqual(["attendee", "guest", "guest"]);
    expect(booking.attendees[0]?.uid).toBe("patient_1");
    const jo = booking.attendees.find((person) => person.email === "jo@example.com");
    expect(jo).toMatchObject({ name: "Jo Park", uid: null, phone: null, time_zone: "UTC" });
  });

  test("an event type allows none by default, and never more than it says", async () => {
    const none = await allowing(0);
    expect(
      await code(
        createBooking(none.env, request(none.eventType.id, [{ email: "a@b.co" }]), deps, actor),
      ),
    ).toBe("invalid_attendee");
    const one = await allowing(1);
    expect(
      await code(
        createBooking(
          one.env,
          request(one.eventType.id, [{ email: "a@b.co" }, { email: "c@d.co" }]),
          deps,
          actor,
        ),
      ),
    ).toBe("invalid_attendee");
  });

  test("everyone needs their own address, and a name can't hold a link", async () => {
    const { env, eventType } = await allowing(3);
    for (const guests of [
      [{ email: "SAM@example.com" }],
      [{ email: "a@b.co" }, { email: "A@b.co" }],
      [{ email: "a@b.co", name: "see https://evil.example/x" }],
    ]) {
      expect(await code(createBooking(env, request(eventType.id, guests), deps, actor))).toBe(
        "invalid_attendee",
      );
    }
  });

  test("a lost slot leaves no guests behind", async () => {
    const { env, eventType } = await allowing(1);
    await createBooking(env, request(eventType.id, [{ email: "a@b.co" }]), deps, actor);
    expect(
      await code(createBooking(env, request(eventType.id, [{ email: "c@d.co" }]), deps, actor)),
    ).toBe("slot_unavailable");
    const rows = await db
      .select()
      .from(schema.schedulingAttendee)
      .where(eq(schema.schedulingAttendee.environmentId, env.environmentId));
    expect(rows.length).toBe(2);
  });

  test("a series takes them to every occurrence", async () => {
    const { env, eventType } = await allowing(1);
    const { result } = await createSeries(
      env,
      {
        ...request(eventType.id, [{ email: "a@b.co" }]),
        recurrence: { frequency: "weekly", interval: 1, count: 2 },
        onConflict: "reject",
      },
      deps,
      actor,
    );
    const rows = await db
      .select({ role: schema.schedulingAttendee.role })
      .from(schema.schedulingAttendee)
      .where(eq(schema.schedulingAttendee.environmentId, env.environmentId));
    expect(result.bookings.length).toBe(2);
    expect(rows.filter((row) => row.role === "guest").length).toBe(2);
  });

  test("a group event type can't have them: each person takes a seat", async () => {
    const env = await tenantEnv();
    const host = await hostWithHours(env);
    expect(
      await code(
        eventTypeFor(env, [{ host: host.id }], { kind: "group", capacity: 5, max_guests: 1 }),
      ),
    ).toBe("invalid_event_type");
  });

  test("an address erases a guest, without touching the attendee or the booking", async () => {
    const { env, eventType } = await allowing(1);
    const { booking } = await createBooking(
      env,
      request(eventType.id, [{ email: "jo@example.com", name: "Jo Park" }]),
      deps,
      actor,
    );
    expect(await eraseAttendeeByEmail(env, { email: "Jo@Example.com" }, deps)).toBe(1);
    const after = await getBooking(env, booking.id, deps);
    expect(after.status).toBe("confirmed");
    expect(after.attendees[0]?.email).toBe("sam@example.com");
    expect(after.attendees[1]).toMatchObject({ role: "guest", email: null, name: null });
  });

  test("an address ends a session fixed to it, even with no uid and no booking", async () => {
    const { env, eventType } = await allowing(0);
    const session = await createBookerSession(
      env,
      {
        eventType: eventType.id,
        attendee: { email: "kai@example.com", time_zone: "UTC" },
        publicUrl: null,
      },
      deps,
    );
    expect(await eraseAttendeeByEmail(env, { email: "KAI@example.com" }, deps)).toBe(0);
    const [row] = await db
      .select()
      .from(schema.schedulingSession)
      .where(eq(schema.schedulingSession.id, session.id));
    expect(row?.revokedAt).not.toBeNull();
    expect(row?.encryptedAttendee).toBeNull();
    expect(row?.attendeeEmailHmac).toBeNull();
  });

  test("an address ends a booker session fixed to the person it finds", async () => {
    const { env, eventType } = await allowing(0);
    await createBooking(env, request(eventType.id, []), deps, actor);
    const session = await createBookerSession(
      env,
      { eventType: eventType.id, attendee, publicUrl: null },
      deps,
    );
    expect(await eraseAttendeeByEmail(env, { email: "sam@example.com" }, deps)).toBe(1);
    const [row] = await db
      .select({ revokedAt: schema.schedulingSession.revokedAt })
      .from(schema.schedulingSession)
      .where(eq(schema.schedulingSession.id, session.id));
    expect(row?.revokedAt).not.toBeNull();
  });
});
