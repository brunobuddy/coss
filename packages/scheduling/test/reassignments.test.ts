/** Moving many bookings: what's selected, who they go to, what's reported, and undoing it. */
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { LATEST_API_VERSION } from "@coss/versioning";
import { createWebhookEndpoint, secretsKeyRing } from "@coss/webhooks";
import { testManagementDeps } from "@coss/webhooks/testing";
import { and, eq, inArray } from "drizzle-orm";
import {
  cancelBooking,
  cancelReassignment,
  completeCalendarAuthorization,
  createBooking,
  createEventType,
  createHost,
  createOutOfOffice,
  createReassignment,
  createSchedule,
  deleteOutOfOffice,
  eraseAttendee,
  getReassignment,
  listReassignmentItems,
  listReassignments,
  previewReassignment,
  purgeExpiredReassignments,
  putOutOfOffice,
  reencryptSchedulingData,
  rescheduleBooking,
  runDueCalendarSyncs,
  runDueReassignments,
  runDueSchedulingNotifications,
  type SchedulingEmail,
  type SchedulingEnvironment,
  startCalendarAuthorization,
  undoReassignment,
  updateHost,
  updateOutOfOffice,
} from "../src/index.ts";
import { expand } from "../src/reassignments.ts";
import type { CreateReassignmentRequestOutput } from "../src/schemas.ts";
import { FakeGoogleCalendarApi, testSchedulingDeps } from "../src/testing.ts";

const ms = Date.parse;
const MONDAY = "2031-01-06";
const at = (time: string, day = MONDAY) => ms(`${day}T${time}:00Z`);
const iso = (time: string, day = MONDAY) => new Date(at(time, day)).toISOString();
const NOW = new Date(at("00:00"));
const plain = testSchedulingDeps({ now: () => NOW });
const actor = { kind: "system" } as const;
const attendee = { uid: "p", name: "Sam Lee", email: "sam@example.com", time_zone: "UTC" };
const scopeOf = (env: SchedulingEnvironment) => ({
  scope: { organizationIds: [env.organizationId] },
});

async function environment(): Promise<SchedulingEnvironment> {
  const tenant = await createTestTenant();
  return {
    organizationId: tenant.organization.id,
    projectId: tenant.project.id,
    environmentId: tenant.production.id,
    mode: "live",
  };
}

async function host(env: SchedulingEnvironment, name: string, extra: { email?: string } = {}) {
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

const pool = (env: SchedulingEnvironment, hosts: { id: string }[], extra: object = {}) =>
  createEventType(env, {
    title: "Call",
    kind: "pool",
    duration_minutes: 30,
    hosts: hosts.map(member),
    ...extra,
  } as never);

const book = async (
  env: SchedulingEnvironment,
  eventTypeId: string,
  startMs: number,
  hostId: string,
  extra: object = {},
) =>
  (
    await createBooking(
      env,
      { eventType: eventTypeId, startMs, attendee, host: hostId, ...extra },
      plain,
      actor,
    )
  ).booking;

const request = (
  selection: CreateReassignmentRequestOutput["selection"],
  strategy: CreateReassignmentRequestOutput["strategy"] = {},
  extra: Partial<CreateReassignmentRequestOutput> = {},
): CreateReassignmentRequestOutput => ({
  selection,
  strategy,
  reason_code: "other",
  ...extra,
});

const start = (
  env: SchedulingEnvironment,
  body: CreateReassignmentRequestOutput,
  opts: Parameters<typeof createReassignment>[4] = {},
) => createReassignment(env, body, plain, actor, opts);

/** Works until nothing's due, as the worker's loop does. */
async function drain(env: SchedulingEnvironment, deps = plain) {
  for (let pass = 0; pass < 50; pass++) {
    if ((await runDueReassignments(deps, scopeOf(env))) === 0) return;
  }
  throw new Error("still running after 50 passes");
}

const hostsOf = async (bookingId: string) => {
  const rows = await db
    .select({ hostId: schema.schedulingBookingHost.hostId })
    .from(schema.schedulingBookingHost)
    .where(eq(schema.schedulingBookingHost.bookingId, bookingId));
  return rows.map((row) => row.hostId).sort();
};

const claimsOf = async (bookingId: string) => {
  const rows = await db
    .select({ hostId: schema.schedulingClaim.hostId })
    .from(schema.schedulingClaim)
    .where(eq(schema.schedulingClaim.bookingId, bookingId));
  return rows.map((row) => row.hostId).sort();
};

const itemsOf = async (env: SchedulingEnvironment, id: string) =>
  (await listReassignmentItems(env, id, { limit: 100 })).data;

const outcomeOf = async (env: SchedulingEnvironment, id: string, bookingId: string) =>
  (await itemsOf(env, id)).find((item) => item.booking === bookingId);

function recordingDeps() {
  const sent: SchedulingEmail[] = [];
  const deps = {
    dataKeys: plain.dataKeys,
    now: () => NOW,
    publicUrl: "https://book.example.test",
    notifier: {
      email: async (message: SchedulingEmail) => {
        sent.push(message);
      },
    },
  };
  return { sent, deps };
}

describe("what a run covers", () => {
  test("one host's bookings in a window, leaving others and other times alone", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await pool(env, [a, b, c]);
    const inside = await book(env, type.id, at("10:00"), a.id);
    const later = await book(env, type.id, at("10:00", "2031-01-07"), a.id);
    const someoneElse = await book(env, type.id, at("11:00"), c.id);
    const { reassignment } = await start(
      env,
      request({ host: a.id, start_before: iso("23:00") }, { to_host: b.id }),
    );
    expect(reassignment.status).toBe("pending");
    await drain(env);
    expect(await hostsOf(inside.id)).toEqual([b.id]);
    expect(await hostsOf(later.id)).toEqual([a.id]);
    expect(await hostsOf(someoneElse.id)).toEqual([c.id]);
    const done = await getReassignment(env, reassignment.id);
    expect(done.status).toBe("completed");
    expect(done.counts).toMatchObject({ total: 1, reassigned: 1 });
    expect(done.finished_at).not.toBeNull();
  });

  test("refuses a selection that would mean everyone", async () => {
    const env = await environment();
    await expect(start(env, request({ start_before: iso("23:00") }))).rejects.toMatchObject({
      code: "invalid_reassignment",
    });
  });

  test("another environment's host, entry or event type is unknown", async () => {
    const env = await environment();
    const other = await environment();
    const theirs = await host(other, "Theirs");
    await expect(start(env, request({ host: theirs.id }))).rejects.toMatchObject({
      code: "not_found",
    });
  });

  test("bookings of another organization are never selected, even by id", async () => {
    const env = await environment();
    const other = await environment();
    const [a, b] = await Promise.all([host(other, "A"), host(other, "B")]);
    const type = await pool(other, [a, b]);
    const theirs = await book(other, type.id, at("10:00"), a.id);
    const mine = await host(env, "Mine");
    const { reassignment } = await start(
      env,
      request({ booking_ids: [theirs.id] }, { to_host: mine.id }),
    );
    await drain(env);
    expect(await hostsOf(theirs.id)).toEqual([a.id]);
    expect((await getReassignment(env, reassignment.id)).counts.total).toBe(0);
  });

  test("another environment's bookings aren't selected, even in one organization", async () => {
    const tenant = await createTestTenant();
    const live: SchedulingEnvironment = {
      organizationId: tenant.organization.id,
      projectId: tenant.project.id,
      environmentId: tenant.production.id,
      mode: "live",
    };
    const other: SchedulingEnvironment = {
      ...live,
      environmentId: tenant.development.id,
      mode: "sandbox",
    };
    const [a, b] = await Promise.all([host(other, "A"), host(other, "B")]);
    const type = await pool(other, [a, b]);
    const theirs = await book(other, type.id, at("10:00"), a.id);
    const { items } = await previewReassignment(live, request({ booking_ids: [theirs.id] }), plain);
    expect(items).toEqual([]);
  });

  test("a calendar read only so far doesn't count against a booking before then", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const api = new FakeGoogleCalendarApi();
    const calendars = {
      dataKeys: plain.dataKeys,
      secretsKeys: secretsKeyRing([createHash("sha256").update("previews").digest()]),
      apps: {
        google: { clientId: "google-client", clientSecret: "google-secret" },
        microsoft: null,
      },
      publicUrl: "https://api.example.test",
      fetcher: api.fetch,
      now: () => NOW,
    };
    const { url } = await startCalendarAuthorization(
      env,
      b.id,
      { provider: "google", returnUrl: null },
      calendars,
    );
    await completeCalendarAuthorization(
      {
        provider: "google",
        state: new URL(url).searchParams.get("state") as string,
        code: "code",
        error: null,
      },
      calendars,
    );
    await runDueCalendarSyncs(calendars, scopeOf(env));
    const type = await pool(env, [a, b]);
    const soon = await book(env, type.id, at("10:00"), a.id);
    const later = await book(env, type.id, at("10:00") + 40 * 24 * 3_600_000, a.id);
    await db
      .update(schema.schedulingCalendar)
      .set({ coveredUntil: new Date(at("10:00") + 7 * 24 * 3_600_000) })
      .where(eq(schema.schedulingCalendar.hostId, b.id));
    const { items } = await previewReassignment(
      env,
      request({ host: a.id }, { to_host: b.id }),
      plain,
    );
    const of = (id: string) => items.find((item) => item.booking === id);
    expect(of(soon.id)).toMatchObject({ to_host: b.id, reason: null });
    expect(of(later.id)).toMatchObject({ to_host: null, reason: "calendar_unverified" });
  });

  test("doesn't propose someone disabled, whom the run would refuse", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a]);
    const booking = await book(env, type.id, at("10:00"), a.id);
    await updateHost(env, b.id, { status: "disabled" } as never);
    const { items } = await previewReassignment(
      env,
      request({ booking_ids: [booking.id] }, { to_host: b.id }, { overrides: ["any_host"] }),
      plain,
    );
    expect(items[0]).toMatchObject({ to_host: null, reason: "host_unavailable" });
  });

  test("someone moved away is free for the next one, as they'd be by then", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const limits = [{ period: "day", max: 1, scope: "event_type" }];
    const type = await pool(env, [a, b, c], { limits });
    // Two at one time go in id order, and those can come out either way within a millisecond.
    const ordered = [
      { id: (await book(env, type.id, at("10:00"), a.id)).id, host: a.id },
      { id: (await book(env, type.id, at("10:00"), c.id)).id, host: c.id },
    ].sort((x, y) => (x.id < y.id ? -1 : 1));
    const first = ordered[0] as { id: string; host: string };
    const second = ordered[1] as { id: string; host: string };
    const assignments = [
      { booking: first.id, to_host: b.id, from_host: first.host },
      { booking: second.id, to_host: first.host, from_host: second.host },
    ];
    const selection = { booking_ids: [first.id, second.id] };
    const { items } = await previewReassignment(env, request(selection, { assignments }), plain);
    expect(Object.fromEntries(items.map((item) => [item.booking, item.to_host]))).toEqual({
      [first.id]: b.id,
      [second.id]: first.host,
    });
    await start(env, request(selection, { assignments }));
    await drain(env);
    expect(await hostsOf(first.id)).toEqual([b.id]);
    expect(await hostsOf(second.id)).toEqual([first.host]);
  });

  test("takes them in the run's order, whatever their event type", async () => {
    const env = await environment();
    const [a, c, b] = await Promise.all([host(env, "A"), host(env, "C"), host(env, "B")]);
    const limits = [{ period: "day", max: 2, scope: "host" }];
    const x = await pool(env, [a, b], { limits });
    const y = await pool(env, [c, b], { limits });
    const nine = await book(env, x.id, at("09:00"), a.id);
    const noon = await book(env, x.id, at("12:00"), a.id);
    const ten = await book(env, y.id, at("10:00"), c.id);
    const selection = { booking_ids: [nine.id, noon.id, ten.id] };
    const strategy = { to_host: b.id };
    const { items } = await previewReassignment(env, request(selection, strategy), plain);
    const proposed = Object.fromEntries(items.map((item) => [item.booking, item.to_host]));
    expect(proposed).toEqual({ [nine.id]: b.id, [ten.id]: b.id, [noon.id]: null });
    await start(env, request(selection, strategy));
    await drain(env);
    expect(await hostsOf(nine.id)).toEqual([b.id]);
    expect(await hostsOf(ten.id)).toEqual([b.id]);
    expect(await hostsOf(noon.id)).toEqual([a.id]);
  });

  test("a pool's counts go down for whoever a booking leaves, as they will", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await pool(env, [a, b, c]);
    const fromA = await book(env, type.id, at("10:00"), a.id);
    const fromB = await book(env, type.id, at("11:00"), b.id);
    const counts = [
      [a.id, 3],
      [b.id, 5],
      [c.id, 1],
    ] as const;
    for (const [hostId, units] of counts) {
      await db
        .update(schema.schedulingEventTypeHost)
        .set({ fairUnits: units })
        .where(
          and(
            eq(schema.schedulingEventTypeHost.eventTypeId, type.id),
            eq(schema.schedulingEventTypeHost.hostId, hostId),
          ),
        );
    }
    const selection = { booking_ids: [fromA.id, fromB.id] };
    const { items } = await previewReassignment(env, request(selection), plain);
    const proposed = Object.fromEntries(items.map((item) => [item.booking, item.to_host]));
    expect(proposed[fromA.id]).toBe(c.id);
    await start(env, request(selection));
    await drain(env);
    expect(await hostsOf(fromA.id)).toEqual([proposed[fromA.id] as string]);
    expect(await hostsOf(fromB.id)).toEqual([proposed[fromB.id] as string]);
  });

  test("a limit on an event type only counts what's proposed from it", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const limits = [{ period: "day", max: 1, scope: "event_type" }];
    const first = await pool(env, [a, b], { limits });
    const second = await pool(env, [a, b], { limits });
    const one = await book(env, first.id, at("10:00"), a.id);
    const two = await book(env, second.id, at("11:00"), a.id);
    const { items } = await previewReassignment(
      env,
      request({ host: a.id }, { to_host: b.id }),
      plain,
    );
    expect(Object.fromEntries(items.map((item) => [item.booking, item.to_host]))).toEqual({
      [one.id]: b.id,
      [two.id]: b.id,
    });
    await start(env, request({ host: a.id }, { to_host: b.id }));
    await drain(env);
    expect(await hostsOf(one.id)).toEqual([b.id]);
    expect(await hostsOf(two.id)).toEqual([b.id]);
  });

  test("a limit on a host counts what's proposed from any event type", async () => {
    const env = await environment();
    const [a, c, b] = await Promise.all([host(env, "A"), host(env, "C"), host(env, "B")]);
    const limits = [{ period: "day", max: 1, scope: "host" }];
    const first = await pool(env, [a, b], { limits });
    const second = await pool(env, [c, b], { limits });
    const one = await book(env, first.id, at("10:00"), a.id);
    const two = await book(env, second.id, at("11:00"), c.id);
    const { items } = await previewReassignment(
      env,
      request({ booking_ids: [one.id, two.id] }, { to_host: b.id }),
      plain,
    );
    expect(items.filter((item) => item.to_host === b.id).length).toBe(1);
  });

  test("someone covering only counts for those the booking could have gone to", async () => {
    const env = await environment();
    const inTeam = { attributes: { team: "heart" } };
    const [principal, other, current, delegate] = await Promise.all([
      createHost(env, { name: "Principal", time_zone: "UTC", ...inTeam }),
      createHost(env, { name: "Other", time_zone: "UTC", attributes: { team: "skin" } }),
      createHost(env, { name: "Current", time_zone: "UTC", ...inTeam }),
      createHost(env, { name: "Delegate", time_zone: "UTC", ...inTeam }),
    ]);
    for (const entry of [principal, other, current, delegate]) {
      await createSchedule(env, entry.id, {
        rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
      });
    }
    const type = await pool(env, [principal, other, current]);
    const booking = await book(env, type.id, at("14:00"), current.id, {
      attributes: { team: "heart" },
    });
    // They cover the principal in the morning, and someone this booking couldn't go to now.
    const cover = (hostId: string, from: string, to: string) =>
      createOutOfOffice(
        env,
        { host: hostId, start: iso(from), end: iso(to), delegates: [delegate.id] } as never,
        plain,
        actor,
        "api",
      );
    await cover(principal.id, "09:00", "10:00");
    await cover(other.id, "13:00", "15:00");
    const { items } = await previewReassignment(
      env,
      request(
        { booking_ids: [booking.id] },
        { preferred_hosts: [delegate.id], otherwise: "leave" },
      ),
      plain,
    );
    expect(items[0]?.to_host ?? null).toBeNull();
  });

  test("by event type, by id and by what's in an out of office entry", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const first = await pool(env, [a, b]);
    const second = await pool(env, [a, b]);
    const one = await book(env, first.id, at("10:00"), a.id);
    const two = await book(env, second.id, at("11:00"), a.id);
    const three = await book(env, first.id, at("12:00"), a.id);
    const away = await book(env, second.id, at("15:00"), a.id);
    const entry = await createOutOfOffice(
      env,
      { host: a.id, start: iso("14:00"), end: iso("16:00") } as never,
      plain,
      actor,
      "api",
    );
    const entryId = entry[0]?.id;

    const byType = await previewReassignment(
      env,
      request({ host: a.id, event_types: [first.id] }),
      plain,
    );
    expect(byType.items.map((item) => item.booking).sort()).toEqual([one.id, three.id].sort());
    const byId = await previewReassignment(env, request({ booking_ids: [two.id] }), plain);
    expect(byId.items.map((item) => item.booking)).toEqual([two.id]);
    const byEntry = await previewReassignment(
      env,
      request({ out_of_office: entryId as string }),
      plain,
    );
    expect(byEntry.items.map((item) => item.booking)).toEqual([away.id]);
    expect(byEntry.items[0]?.from_host).toBe(a.id);
  });

  test("the cap counts what's selected, not everything the host has", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    await book(env, type.id, at("10:00"), a.id);
    await book(env, type.id, at("11:00"), a.id);
    await book(env, type.id, at("10:00", "2031-01-07"), a.id);
    await expect(
      start(env, request({ host: a.id }, { to_host: b.id }), { maxBookings: 2 }),
    ).rejects.toMatchObject({ code: "invalid_reassignment" });
    const narrowed = await start(
      env,
      request({ host: a.id, start_before: iso("23:00") }, { to_host: b.id }),
      { maxBookings: 2 },
    );
    expect(narrowed.reassignment.id).toStartWith("reasn_");
  });

  test("what's over, cancelled or run out isn't selected", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    const cancelled = await book(env, type.id, at("10:00"), a.id);
    await cancelBooking(env, cancelled.id, plain, actor);
    const fine = await book(env, type.id, at("11:00"), a.id);
    const expiredHold = await book(env, type.id, at("12:00"), a.id);
    await db
      .update(schema.schedulingBooking)
      .set({ status: "held", holdExpiresAt: new Date(NOW.getTime() - 1000) })
      .where(eq(schema.schedulingBooking.id, expiredHold.id));
    const expiredRequest = await book(env, type.id, at("13:00"), a.id);
    await db
      .update(schema.schedulingBooking)
      .set({ status: "pending_approval", approvalExpiresAt: new Date(NOW.getTime() - 1000) })
      .where(eq(schema.schedulingBooking.id, expiredRequest.id));
    const over = await book(env, type.id, at("14:00"), a.id);
    await db
      .update(schema.schedulingBooking)
      .set({ startAt: new Date(NOW.getTime() - 60_000) })
      .where(eq(schema.schedulingBooking.id, over.id));
    const preview = await previewReassignment(env, request({ host: a.id }), plain);
    expect(preview.items.map((item) => item.booking)).toEqual([fine.id]);
  });
});

describe("who they go to", () => {
  test("preferred hosts first, then the fairest who's free", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await pool(env, [a, b, c]);
    const first = await book(env, type.id, at("10:00"), a.id);
    // B's taken at this one, so it falls through to C.
    await book(env, type.id, at("11:00"), b.id);
    const second = await book(env, type.id, at("11:00"), a.id);
    const { reassignment } = await start(env, request({ host: a.id }, { preferred_hosts: [b.id] }));
    await drain(env);
    expect(await hostsOf(first.id)).toEqual([b.id]);
    expect(await hostsOf(second.id)).toEqual([c.id]);
    expect(await claimsOf(second.id)).toEqual([c.id]);
    const item = await outcomeOf(env, reassignment.id, second.id);
    expect(item).toMatchObject({ outcome: "reassigned", from_host: a.id, to_host: c.id });
  });

  test("`then: leave` stops at the preferred hosts", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await pool(env, [a, b, c]);
    await book(env, type.id, at("11:00"), b.id);
    const booking = await book(env, type.id, at("11:00"), a.id);
    const { reassignment } = await start(
      env,
      request({ host: a.id }, { preferred_hosts: [b.id], otherwise: "leave" }),
    );
    await drain(env);
    expect(await hostsOf(booking.id)).toEqual([a.id]);
    expect((await outcomeOf(env, reassignment.id, booking.id))?.outcome).toBe("no_candidate");
  });

  test("nobody free: it stays put, still confirmed, and says so", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    await book(env, type.id, at("10:00"), b.id);
    const stuck = await book(env, type.id, at("10:00"), a.id);
    const moves = await book(env, type.id, at("11:00"), a.id);
    const { reassignment } = await start(env, request({ host: a.id }));
    await drain(env);
    expect(await hostsOf(stuck.id)).toEqual([a.id]);
    expect(await claimsOf(stuck.id)).toEqual([a.id]);
    const [row] = await db
      .select({ status: schema.schedulingBooking.status })
      .from(schema.schedulingBooking)
      .where(eq(schema.schedulingBooking.id, stuck.id));
    expect(row?.status).toBe("confirmed");
    expect(await hostsOf(moves.id)).toEqual([b.id]);
    const done = await getReassignment(env, reassignment.id);
    expect(done.status).toBe("completed");
    expect(done.counts).toMatchObject({ total: 2, reassigned: 1, no_candidate: 1 });
  });

  test("assignments: each to whoever was chosen, from whoever was named", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await pool(env, [a, b, c]);
    const one = await book(env, type.id, at("10:00"), a.id);
    const two = await book(env, type.id, at("11:00"), a.id);
    const three = await book(env, type.id, at("12:00"), a.id);
    await start(
      env,
      request(
        {},
        {
          assignments: [
            { booking: one.id, to_host: b.id },
            { booking: two.id, to_host: c.id, from_host: a.id },
          ],
        },
      ),
    );
    await drain(env);
    expect(await hostsOf(one.id)).toEqual([b.id]);
    expect(await hostsOf(two.id)).toEqual([c.id]);
    expect(await hostsOf(three.id)).toEqual([a.id]);
  });

  test("overriding someone's availability needs a note", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    await pool(env, [a, b]);
    await expect(
      start(env, request({ host: a.id }, { to_host: b.id }, { overrides: ["out_of_office"] })),
    ).rejects.toMatchObject({ code: "invalid_reassignment" });
  });

  test("overrides reach each booking, and only let through what they name", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    const booking = await book(env, type.id, at("10:00"), a.id);
    await createOutOfOffice(
      env,
      { host: b.id, start: iso("09:00"), end: iso("12:00") } as never,
      plain,
      actor,
      "api",
    );
    const refused = await start(env, request({ host: a.id }, { to_host: b.id }));
    await drain(env);
    expect((await outcomeOf(env, refused.reassignment.id, booking.id))?.outcome).toBe(
      "no_candidate",
    );
    expect(await hostsOf(booking.id)).toEqual([a.id]);
    await start(
      env,
      request(
        { host: a.id },
        { to_host: b.id },
        { overrides: ["out_of_office"], note: "They said they'd cover" },
      ),
    );
    await drain(env);
    expect(await hostsOf(booking.id)).toEqual([b.id]);
  });

  test("a series stays on one host where it can", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await pool(env, [a, b, c]);
    const seriesRows = [];
    const [series] = await db
      .insert(schema.schedulingSeries)
      .values({
        organizationId: env.organizationId,
        projectId: env.projectId,
        environmentId: env.environmentId,
        eventTypeId: type.id,
        rule: { frequency: "weekly", interval: 1, count: 3 },
        anchorTimeZone: "UTC",
      } as never)
      .returning({ id: schema.schedulingSeries.id });
    const seriesId = series?.id as string;
    for (const day of ["2031-01-06", "2031-01-07", "2031-01-08"]) {
      const booking = await book(env, type.id, at("10:00", day), a.id);
      await db
        .update(schema.schedulingBooking)
        .set({ seriesId })
        .where(eq(schema.schedulingBooking.id, booking.id));
      seriesRows.push(booking);
    }
    await start(env, request({ series: seriesId }));
    await drain(env);
    const moved = await Promise.all(seriesRows.map((row) => hostsOf(row.id)));
    expect(new Set(moved.flat()).size).toBe(1);
    expect(moved[0]).not.toEqual([a.id]);
  });

  test("undoing a session whose first seat has cancelled still gives it back", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await createEventType(env, {
      title: "Class",
      kind: "group",
      duration_minutes: 30,
      capacity: 5,
      hosts: [member(a)],
    } as never);
    const seat = (uid: string) =>
      createBooking(
        env,
        { eventType: type.id, startMs: at("10:00"), attendee: { ...attendee, uid }, host: a.id },
        plain,
        actor,
      ).then((result) => result.booking);
    const seats = [await seat("one"), await seat("two")].sort((x, y) => (x.id < y.id ? -1 : 1));
    const { reassignment } = await start(
      env,
      request({ host: a.id }, { to_host: b.id }, { overrides: ["any_host"], note: "Cover" }),
    );
    await drain(env);
    expect(await hostsOf(seats[1]?.id as string)).toEqual([b.id]);
    await cancelBooking(env, seats[0]?.id as string, plain, actor);
    await undoReassignment(env, reassignment.id, {}, plain, actor);
    await drain(env);
    expect(await hostsOf(seats[1]?.id as string)).toEqual([a.id]);
  });

  test("a group session is one item, and every seat moves", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await createEventType(env, {
      title: "Class",
      kind: "group",
      duration_minutes: 30,
      capacity: 5,
      hosts: [member(a)],
    } as never);
    const seat = (uid: string) =>
      createBooking(
        env,
        { eventType: type.id, startMs: at("10:00"), attendee: { ...attendee, uid }, host: a.id },
        plain,
        actor,
      ).then((result) => result.booking);
    const first = await seat("one");
    const second = await seat("two");
    const { reassignment } = await start(
      env,
      request({ host: a.id }, { to_host: b.id }, { overrides: ["any_host"] }),
    );
    await drain(env);
    const done = await getReassignment(env, reassignment.id);
    expect(done.counts).toMatchObject({ total: 1, reassigned: 1 });
    expect(await hostsOf(first.id)).toEqual([b.id]);
    expect(await hostsOf(second.id)).toEqual([b.id]);
  });
});

describe("previews", () => {
  test("writes nothing", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    const booking = await book(env, type.id, at("10:00"), a.id);
    const preview = await previewReassignment(env, request({ host: a.id }), plain);
    expect(preview.items[0]).toMatchObject({ booking: booking.id, from_host: a.id, to_host: b.id });
    expect(await hostsOf(booking.id)).toEqual([a.id]);
    expect((await listReassignments(env, { limit: 10 })).data).toEqual([]);
  });

  test("can't promise one free hour twice, or a booking its own host", async () => {
    const env = await environment();
    const [a, b, c, d] = await Promise.all([
      host(env, "A"),
      host(env, "B"),
      host(env, "C"),
      host(env, "D"),
    ]);
    const type = await pool(env, [a, b, c]);
    const collides = await book(env, type.id, at("10:00"), a.id);
    const other = await book(env, type.id, at("10:00"), c.id);
    const { items } = await previewReassignment(
      env,
      request(
        { booking_ids: [collides.id, other.id] },
        { preferred_hosts: [b.id], otherwise: "leave" },
      ),
      plain,
    );
    const proposed = items.map((item) => item.to_host);
    expect(proposed.filter((to) => to === b.id)).toHaveLength(1);
    expect(proposed.filter((to) => to === null)).toHaveLength(1);
    expect(items.find((item) => item.to_host === null)?.reason).toBe("no_candidate");
    const { items: toOutsider } = await previewReassignment(
      env,
      request({ booking_ids: [collides.id] }, { to_host: d.id }),
      plain,
    );
    expect(toOutsider[0]).toMatchObject({ to_host: null, reason: "not_a_member" });
    const { items: toSelf } = await previewReassignment(
      env,
      request({ booking_ids: [collides.id] }, { to_host: a.id }),
      plain,
    );
    expect(toSelf[0]).toMatchObject({ to_host: null, reason: "already_a_host" });
  });

  test("buffers count, as they would for a claim", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await pool(env, [a, b, c], { buffer_after_minutes: 30 });
    const one = await book(env, type.id, at("10:00"), a.id);
    const two = await book(env, type.id, at("10:30"), c.id);
    const { items } = await previewReassignment(
      env,
      request({ booking_ids: [one.id, two.id] }, { preferred_hosts: [b.id], otherwise: "leave" }),
      plain,
    );
    expect(items.filter((item) => item.to_host === b.id)).toHaveLength(1);
  });

  test("agrees with the run", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await pool(env, [a, b, c]);
    await book(env, type.id, at("11:00"), b.id);
    const bookings = [
      await book(env, type.id, at("10:00"), a.id),
      await book(env, type.id, at("11:00"), a.id),
      await book(env, type.id, at("12:00"), a.id),
    ];
    const selection = { host: a.id };
    const strategy = { preferred_hosts: [b.id] };
    const { items } = await previewReassignment(env, request(selection, strategy), plain);
    await start(env, request(selection, strategy));
    await drain(env);
    for (const booking of bookings) {
      const proposed = items.find((item) => item.booking === booking.id);
      expect(await hostsOf(booking.id)).toEqual([proposed?.to_host as string]);
    }
  });

  test("counts limits as it goes", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await pool(env, [a, b, c], {
      limits: [{ period: "day", max: 1, scope: "event_type" }],
    });
    const one = await book(env, type.id, at("10:00"), a.id);
    const two = await book(env, type.id, at("11:00"), c.id);
    const { items } = await previewReassignment(
      env,
      request({ booking_ids: [one.id, two.id] }, { preferred_hosts: [b.id], otherwise: "leave" }),
      plain,
    );
    expect(items.filter((item) => item.to_host === b.id)).toHaveLength(1);
    expect(items.find((item) => item.to_host === null)?.reason).toBe("no_candidate");
  });

  test("shares them out across a pool, as the run would", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await pool(env, [a, b, c]);
    // Someone with nothing yet counts as level with the pool, so both need a booking to be ranked.
    await book(env, type.id, at("10:00", "2031-01-20"), b.id);
    await book(env, type.id, at("10:00", "2031-01-20"), c.id);
    for (const time of ["09:00", "10:00", "11:00", "12:00"]) {
      await book(env, type.id, at(time), a.id);
    }
    const { items } = await previewReassignment(env, request({ host: a.id }), plain);
    const counts = [b.id, c.id].map((id) => items.filter((item) => item.to_host === id).length);
    expect(counts).toEqual([2, 2]);
  });

  test("keeps to what each booking was routed with", async () => {
    const env = await environment();
    const a = await createHost(env, {
      name: "A",
      time_zone: "UTC",
      attributes: { specialty: "skin" },
    });
    const b = await createHost(env, {
      name: "B",
      time_zone: "UTC",
      attributes: { specialty: "skin" },
    });
    const c = await createHost(env, {
      name: "C",
      time_zone: "UTC",
      attributes: { specialty: "heart" },
    });
    for (const entry of [a, b, c]) {
      await createSchedule(env, entry.id, {
        rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
      });
    }
    const type = await pool(env, [a, b, c]);
    await book(env, type.id, at("10:00"), a.id, { attributes: { specialty: "skin" } });
    const { items } = await previewReassignment(env, request({ host: a.id }), plain);
    expect(items[0]?.to_host).toBe(b.id);
    const { items: named } = await previewReassignment(
      env,
      request({ host: a.id }, { to_host: c.id }),
      plain,
    );
    expect(named[0]).toMatchObject({ to_host: null, reason: "not_a_member" });
  });

  test("a pool's booking that can't say how it was routed needs someone to choose", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    const booking = await book(env, type.id, at("10:00"), a.id);
    await db
      .update(schema.schedulingBooking)
      .set({ encryptedAttributes: null })
      .where(eq(schema.schedulingBooking.id, booking.id));
    const { items } = await previewReassignment(env, request({ host: a.id }), plain);
    expect(items[0]).toMatchObject({ to_host: null, reason: "routing_unknown" });
    const { reassignment } = await start(env, request({ host: a.id }));
    await drain(env);
    expect(await outcomeOf(env, reassignment.id, booking.id)).toMatchObject({
      outcome: "no_candidate",
      error_code: "invalid_reassignment",
    });
    expect(await hostsOf(booking.id)).toEqual([a.id]);
  });

  test("overrides let a proposal go past what they name, and nothing else", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    const booking = await book(env, type.id, at("10:00"), a.id);
    await createOutOfOffice(
      env,
      { host: b.id, start: iso("09:00"), end: iso("12:00") } as never,
      plain,
      actor,
      "api",
    );
    const without = await previewReassignment(
      env,
      request({ booking_ids: [booking.id] }, { to_host: b.id }),
      plain,
    );
    expect(without.items[0]).toMatchObject({ to_host: null, reason: "out_of_office" });
    const past = await previewReassignment(
      env,
      {
        selection: { booking_ids: [booking.id] },
        strategy: { to_host: b.id },
        overrides: ["out_of_office"],
      },
      plain,
    );
    expect(past.items[0]?.to_host).toBe(b.id);
  });

  test("keeps a series to one host", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await pool(env, [a, b, c]);
    const [series] = await db
      .insert(schema.schedulingSeries)
      .values({
        organizationId: env.organizationId,
        projectId: env.projectId,
        environmentId: env.environmentId,
        eventTypeId: type.id,
        rule: { frequency: "weekly", interval: 1, count: 3 },
        anchorTimeZone: "UTC",
      } as never)
      .returning({ id: schema.schedulingSeries.id });
    for (const time of ["09:00", "10:00", "11:00", "12:00"]) {
      const booking = await book(env, type.id, at(time), a.id);
      await db
        .update(schema.schedulingBooking)
        .set({ seriesId: series?.id })
        .where(eq(schema.schedulingBooking.id, booking.id));
    }
    const { items } = await previewReassignment(
      env,
      request({ series: series?.id as string }),
      plain,
    );
    expect(new Set(items.map((item) => item.to_host)).size).toBe(1);
  });

  test("an edited proposal goes back as assignments", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await pool(env, [a, b, c]);
    const booking = await book(env, type.id, at("10:00"), a.id);
    const { items } = await previewReassignment(env, request({ host: a.id }), plain);
    const item = items[0];
    const changed = item?.to_host === b.id ? c.id : b.id;
    await start(
      env,
      request(
        {},
        {
          assignments: [
            { booking: booking.id, to_host: changed, from_host: item?.from_host as string },
          ],
        },
      ),
    );
    await drain(env);
    expect(await hostsOf(booking.id)).toEqual([changed]);
  });

  test("says when an event type's bookings stay with their hosts", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b], { reassignment_enabled: false });
    await book(env, type.id, at("10:00"), a.id);
    const { items } = await previewReassignment(env, request({ host: a.id }), plain);
    expect(items[0]).toMatchObject({ to_host: null, reason: "reassignment_disabled" });
  });
});

describe("running", () => {
  test("a booking cancelled after its item was made is skipped_changed", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    const gone = await book(env, type.id, at("10:00"), a.id);
    const stays = await book(env, type.id, at("11:00"), a.id);
    const { reassignment } = await start(env, request({ host: a.id }, { to_host: b.id }));
    await db.insert(schema.schedulingReassignmentItem).values({
      organizationId: env.organizationId,
      reassignmentId: reassignment.id,
      bookingId: gone.id,
      fromHostId: a.id,
      toHostId: b.id,
      startAt: new Date(at("10:00")),
    });
    await db.insert(schema.schedulingReassignmentItem).values({
      organizationId: env.organizationId,
      reassignmentId: reassignment.id,
      bookingId: stays.id,
      fromHostId: a.id,
      toHostId: b.id,
      startAt: new Date(at("11:00")),
    });
    await db
      .update(schema.schedulingReassignment)
      .set({ expandedAt: NOW })
      .where(eq(schema.schedulingReassignment.id, reassignment.id));
    await cancelBooking(env, gone.id, plain, actor);
    await drain(env);
    const item = await outcomeOf(env, reassignment.id, gone.id);
    expect(item).toMatchObject({
      outcome: "skipped_changed",
      error_code: "booking_not_changeable",
    });
    expect(await hostsOf(stays.id)).toEqual([b.id]);
  });

  test("two workers: each booking moves once, and the claims are right", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    const bookings = [];
    for (const time of ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]) {
      bookings.push(await book(env, type.id, at(time), a.id));
    }
    const { reassignment } = await start(env, request({ host: a.id }, { to_host: b.id }));
    await Promise.all([
      runDueReassignments(plain, scopeOf(env)),
      runDueReassignments(plain, scopeOf(env)),
      runDueReassignments(plain, scopeOf(env)),
    ]);
    await drain(env);
    for (const booking of bookings) {
      expect(await claimsOf(booking.id)).toEqual([b.id]);
      expect(await hostsOf(booking.id)).toEqual([b.id]);
    }
    const events = await db
      .select({ type: schema.schedulingBookingEvent.type })
      .from(schema.schedulingBookingEvent)
      .where(
        and(
          inArray(
            schema.schedulingBookingEvent.bookingId,
            bookings.map((row) => row.id),
          ),
          eq(schema.schedulingBookingEvent.type, "scheduling.booking.reassigned"),
        ),
      );
    expect(events).toHaveLength(bookings.length);
    expect((await getReassignment(env, reassignment.id)).counts.reassigned).toBe(bookings.length);
  });

  test("a held lease isn't taken, and a dead worker's is", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    const booking = await book(env, type.id, at("10:00"), a.id);
    const { reassignment } = await start(env, request({ host: a.id }, { to_host: b.id }));
    await db
      .update(schema.schedulingReassignment)
      .set({ status: "running", leaseUntil: new Date(NOW.getTime() + 60_000) })
      .where(eq(schema.schedulingReassignment.id, reassignment.id));
    expect(await runDueReassignments(plain, scopeOf(env))).toBe(0);
    expect(await hostsOf(booking.id)).toEqual([a.id]);
    const later = testSchedulingDeps({ now: () => new Date(NOW.getTime() + 120_000) });
    expect(await runDueReassignments(later, scopeOf(env))).toBe(1);
    expect(await hostsOf(booking.id)).toEqual([b.id]);
  });

  test("a worker that lost its lease mid-move can't move what the next one is moving", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await pool(env, [a, b, c]);
    const booking = await book(env, type.id, at("10:00"), a.id);
    const created = await start(
      env,
      request({ booking_ids: [booking.id] }, { preferred_hosts: [b.id, c.id] }),
    );
    // The first worker waits on its target's lock, holding the booking, past the end of its lease.
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked = () => {};
    const holding = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const blocker = db.transaction(async (tx) => {
      await tx
        .select({ id: schema.schedulingHost.id })
        .from(schema.schedulingHost)
        .where(eq(schema.schedulingHost.id, b.id))
        .for("update");
      locked();
      await gate;
    });
    await holding;
    const first = runDueReassignments(plain, scopeOf(env));
    await new Promise((resolve) => setTimeout(resolve, 500));
    await db
      .update(schema.schedulingReassignment)
      .set({ leaseUntil: new Date(NOW.getTime() - 1000) })
      .where(eq(schema.schedulingReassignment.id, created.reassignment.id));
    // The next one takes the run over, and waits for the booking.
    const second = runDueReassignments(plain, scopeOf(env));
    await new Promise((resolve) => setTimeout(resolve, 500));
    release();
    await blocker;
    await Promise.all([first, second]);
    await drain(env);
    expect(await hostsOf(booking.id)).toEqual([b.id]);
    const items = await db
      .select()
      .from(schema.schedulingReassignmentItem)
      .where(eq(schema.schedulingReassignmentItem.reassignmentId, created.reassignment.id));
    expect(items.length).toBe(1);
    expect(items[0]).toMatchObject({ outcome: "reassigned", fromHostId: a.id, toHostId: b.id });
  });

  test("a queued run's note isn't written about someone erased since", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    const booking = await book(env, type.id, at("10:00"), a.id);
    await start(
      env,
      request({ booking_ids: [booking.id] }, { to_host: b.id }, { note: "They have a condition" }),
    );
    await eraseAttendee(env, { uid: attendee.uid });
    await drain(env);
    expect(await hostsOf(booking.id)).toEqual([b.id]);
    const events = await db
      .select({ note: schema.schedulingBookingEvent.encryptedNote })
      .from(schema.schedulingBookingEvent)
      .where(eq(schema.schedulingBookingEvent.bookingId, booking.id));
    expect(events.length).toBeGreaterThan(0);
    expect(events.filter((event) => event.note !== null)).toEqual([]);
  });

  test("a run cancelled while it's being worked out gets no items", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    await book(env, type.id, at("10:00"), a.id);
    const created = await start(env, request({ host: a.id }, { to_host: b.id }));
    // What a worker read when it claimed the run, before someone cancelled it.
    const where = eq(schema.schedulingReassignment.id, created.reassignment.id);
    const [claimed] = await db
      .update(schema.schedulingReassignment)
      .set({ status: "running", leaseUntil: new Date(NOW.getTime() + 60_000) })
      .where(where)
      .returning();
    await cancelReassignment(env, created.reassignment.id, plain);
    await expand(claimed as never, NOW);
    const items = await db
      .select({ id: schema.schedulingReassignmentItem.id })
      .from(schema.schedulingReassignmentItem)
      .where(eq(schema.schedulingReassignmentItem.reassignmentId, created.reassignment.id));
    expect(items).toEqual([]);
  });

  test("a booking moved out of what was selected stays where it is", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    const first = await book(env, type.id, at("10:00"), a.id);
    const second = await book(env, type.id, at("11:00"), a.id);
    const created = await start(
      env,
      request({ host: a.id, start_before: iso("12:00") }, { to_host: b.id }),
    );
    // The worker waits on the first, having worked out both, while the second moves out of the window.
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked = () => {};
    const holding = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const blocker = db.transaction(async (tx) => {
      await tx
        .select({ id: schema.schedulingHost.id })
        .from(schema.schedulingHost)
        .where(eq(schema.schedulingHost.id, b.id))
        .for("update");
      locked();
      await gate;
    });
    await holding;
    const running = runDueReassignments(plain, scopeOf(env));
    await new Promise((resolve) => setTimeout(resolve, 500));
    await rescheduleBooking(env, second.id, { startMs: at("14:00") }, plain, actor);
    release();
    await blocker;
    await running;
    await drain(env);
    expect(await hostsOf(first.id)).toEqual([b.id]);
    expect(await hostsOf(second.id)).toEqual([a.id]);
    const items = await db
      .select()
      .from(schema.schedulingReassignmentItem)
      .where(eq(schema.schedulingReassignmentItem.reassignmentId, created.reassignment.id));
    expect(items.find((item) => item.bookingId === second.id)?.outcome).toBe("skipped_changed");
  });

  test("a worker that lost its lease stops, and leaves the rest to whoever has it", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    const days = ["2031-01-06", "2031-01-07", "2031-01-08"];
    const times = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"];
    for (const day of days) {
      for (const time of times) await book(env, type.id, at(time, day), a.id);
    }
    const { reassignment } = await start(env, request({ host: a.id }, { to_host: b.id }));
    const running = runDueReassignments(plain, scopeOf(env));
    const moved = async () => (await getReassignment(env, reassignment.id)).counts.reassigned;
    while ((await moved()) === 0) await Bun.sleep(1);
    // Another worker takes it over, with a lease of its own.
    await db
      .update(schema.schedulingReassignment)
      .set({ leaseUntil: new Date(NOW.getTime() + 500_000) })
      .where(eq(schema.schedulingReassignment.id, reassignment.id));
    await running;
    const atTheEnd = await getReassignment(env, reassignment.id);
    expect(atTheEnd.status).toBe("running");
    expect(atTheEnd.counts.reassigned).toBeLessThan(days.length * times.length);
    expect(atTheEnd.counts.pending).toBeGreaterThan(0);
  }, 30_000);

  test("a run bigger than a batch finishes across passes", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    const days = ["2031-01-06", "2031-01-07", "2031-01-08", "2031-01-09"];
    const times = [
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
      "12:00",
      "12:30",
      "13:00",
      "13:30",
      "14:00",
      "14:30",
      "15:00",
      "15:30",
    ];
    for (const day of days) {
      for (const time of times) await book(env, type.id, at(time, day), a.id);
    }
    const { reassignment } = await start(env, request({ host: a.id }, { to_host: b.id }));
    await runDueReassignments(plain, scopeOf(env));
    const midway = await getReassignment(env, reassignment.id);
    expect(midway.status).toBe("running");
    expect(midway.counts.reassigned).toBe(50);
    await drain(env);
    const done = await getReassignment(env, reassignment.id);
    expect(done.status).toBe("completed");
    expect(done.counts.reassigned).toBe(days.length * times.length);
  }, 60_000);

  test("nothing selected still finishes", async () => {
    const env = await environment();
    const a = await host(env, "A");
    const { reassignment } = await start(env, request({ host: a.id }));
    await drain(env);
    const done = await getReassignment(env, reassignment.id);
    expect(done.status).toBe("completed");
    expect(done.counts.total).toBe(0);
  });
});

describe("cancelling", () => {
  test("what's done stays done, and what isn't doesn't happen", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    const days = ["2031-01-06", "2031-01-07", "2031-01-08", "2031-01-09"];
    const times = [
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
      "12:00",
      "12:30",
      "13:00",
      "13:30",
      "14:00",
      "14:30",
      "15:00",
      "15:30",
    ];
    const bookings = [];
    for (const day of days) {
      for (const time of times) bookings.push(await book(env, type.id, at(time, day), a.id));
    }
    const { reassignment } = await start(env, request({ host: a.id }, { to_host: b.id }));
    await runDueReassignments(plain, scopeOf(env));
    const cancelled = await cancelReassignment(env, reassignment.id, plain);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.counts.reassigned).toBe(50);
    expect(cancelled.counts.cancelled).toBe(bookings.length - 50);
    await drain(env);
    expect((await getReassignment(env, reassignment.id)).counts.reassigned).toBe(50);
    const last = bookings.at(-1) as { id: string };
    expect(await hostsOf(last.id)).toEqual([a.id]);
  }, 60_000);

  test("repeating it, or cancelling what's finished, changes nothing", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    await book(env, type.id, at("10:00"), a.id);
    const { reassignment } = await start(env, request({ host: a.id }, { to_host: b.id }));
    await drain(env);
    const cancelled = await cancelReassignment(env, reassignment.id, plain);
    expect(cancelled.status).toBe("completed");
  });

  test("before the worker's seen it: nothing moves", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    const booking = await book(env, type.id, at("10:00"), a.id);
    const { reassignment } = await start(env, request({ host: a.id }, { to_host: b.id }));
    await cancelReassignment(env, reassignment.id, plain);
    await drain(env);
    expect(await hostsOf(booking.id)).toEqual([a.id]);
  });

  test("another organization's run is not found", async () => {
    const env = await environment();
    const other = await environment();
    const a = await host(env, "A");
    const { reassignment } = await start(env, request({ host: a.id }));
    await expect(cancelReassignment(other, reassignment.id, plain)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(getReassignment(other, reassignment.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("undoing", () => {
  test("gives back what moved, as a new run", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    const one = await book(env, type.id, at("10:00"), a.id);
    const two = await book(env, type.id, at("11:00"), a.id);
    const { reassignment } = await start(env, request({ host: a.id }, { to_host: b.id }));
    await drain(env);
    const undo = await undoReassignment(env, reassignment.id, {}, plain, actor);
    expect(undo.undo_of).toBe(reassignment.id);
    expect(undo.id).not.toBe(reassignment.id);
    await drain(env);
    expect(await hostsOf(one.id)).toEqual([a.id]);
    expect(await hostsOf(two.id)).toEqual([a.id]);
    expect(await claimsOf(one.id)).toEqual([a.id]);
    expect((await getReassignment(env, undo.id)).counts.reassigned).toBe(2);
  });

  test("only what moved, and what's moved on since stays where it went", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await pool(env, [a, b, c]);
    await book(env, type.id, at("10:00"), b.id);
    const stayed = await book(env, type.id, at("10:00"), a.id);
    const onward = await book(env, type.id, at("11:00"), a.id);
    const back = await book(env, type.id, at("12:00"), a.id);
    const first = await start(
      env,
      request({ booking_ids: [stayed.id, onward.id, back.id], host: a.id }, { to_host: b.id }),
    );
    await drain(env);
    expect(await hostsOf(stayed.id)).toEqual([a.id]);
    // Onward to C since: B isn't its host now, so undoing has nothing to give back.
    await start(env, request({ booking_ids: [onward.id] }, { to_host: c.id }));
    await drain(env);
    const undo = await undoReassignment(env, first.reassignment.id, {}, plain, actor);
    await drain(env);
    expect(await hostsOf(onward.id)).toEqual([c.id]);
    expect(await hostsOf(back.id)).toEqual([a.id]);
    const counts = (await getReassignment(env, undo.id)).counts;
    expect(counts).toMatchObject({ total: 2, reassigned: 1, skipped: 1 });
  });

  test("a booking with several hosts goes back to who left, from who took it", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await createEventType(env, {
      title: "Panel",
      kind: "collective",
      duration_minutes: 30,
      hosts: [a, b, c].map((entry) => ({ ...member(entry), role: "required" })),
    } as never);
    const { booking } = await createBooking(
      env,
      { eventType: type.id, startMs: at("10:00"), attendee },
      plain,
      actor,
    );
    const d = await host(env, "D");
    const { reassignment } = await start(
      env,
      request({ host: b.id }, { to_host: d.id }, { overrides: ["any_host"] }),
    );
    await drain(env);
    expect(await hostsOf(booking.id)).toEqual([a.id, c.id, d.id].sort());
    await undoReassignment(env, reassignment.id, {}, plain, actor);
    await drain(env);
    expect(await hostsOf(booking.id)).toEqual([a.id, b.id, c.id].sort());
  });

  test("refused while it's running", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    await pool(env, [a, b]);
    const { reassignment } = await start(env, request({ host: a.id }, { to_host: b.id }));
    await expect(undoReassignment(env, reassignment.id, {}, plain, actor)).rejects.toMatchObject({
      code: "reassignment_not_finished",
    });
  });

  test("a cancelled run gives back the part it did", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    const booking = await book(env, type.id, at("10:00"), a.id);
    const { reassignment } = await start(env, request({ host: a.id }, { to_host: b.id }));
    await drain(env);
    await db
      .update(schema.schedulingReassignment)
      .set({ status: "cancelled" })
      .where(eq(schema.schedulingReassignment.id, reassignment.id));
    await undoReassignment(env, reassignment.id, {}, plain, actor);
    await drain(env);
    expect(await hostsOf(booking.id)).toEqual([a.id]);
  });
});

describe("asking twice", () => {
  test("the same key and body is the same run", async () => {
    const env = await environment();
    const a = await host(env, "A");
    const body = request({ host: a.id });
    const first = await start(env, body, { idempotencyKey: "same" });
    const second = await start(env, body, { idempotencyKey: "same" });
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.reassignment.id).toBe(first.reassignment.id);
    expect((await listReassignments(env, { limit: 10 })).data).toHaveLength(1);
  });

  test("the same key with another body is refused", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    await start(env, request({ host: a.id }), { idempotencyKey: "same" });
    await expect(
      start(env, request({ host: b.id }), { idempotencyKey: "same" }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
  });

  test("keys are per environment", async () => {
    const env = await environment();
    const other = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(other, "B")]);
    const first = await start(env, request({ host: a.id }), { idempotencyKey: "same" });
    const second = await start(other, request({ host: b.id }), { idempotencyKey: "same" });
    expect(second.reassignment.id).not.toBe(first.reassignment.id);
  });
});

describe("telling people", () => {
  test("each host gets one email for the run, and attendees hear per booking", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([
      host(env, "A", { email: "a@example.com" }),
      host(env, "B", { email: "b@example.com" }),
    ]);
    const type = await pool(env, [a, b]);
    await book(env, type.id, at("10:00"), a.id);
    await book(env, type.id, at("11:00"), a.id);
    await start(env, request({ host: a.id }, { to_host: b.id }, { note: "Secret reason" }));
    await drain(env);
    const rows = await db
      .select()
      .from(schema.schedulingNotification)
      .where(
        and(
          eq(schema.schedulingNotification.environmentId, env.environmentId),
          inArray(schema.schedulingNotification.kind, ["reassignment_summary", "reassigned"]),
        ),
      );
    const summaries = rows.filter((row) => row.kind === "reassignment_summary");
    expect(summaries.map((row) => row.hostId).sort()).toEqual([a.id, b.id].sort());
    expect(rows.filter((row) => row.kind === "reassigned" && row.recipient === "host")).toEqual([]);
    expect(
      rows.filter((row) => row.kind === "reassigned" && row.recipient === "attendee"),
    ).toHaveLength(2);
  });

  test("the digest counts, and says nothing about why", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([
      host(env, "A", { email: "a@example.com" }),
      host(env, "B", { email: "b@example.com" }),
    ]);
    const type = await pool(env, [a, b]);
    await book(env, type.id, at("10:00"), a.id);
    await book(env, type.id, at("11:00"), a.id);
    await start(
      env,
      request(
        { host: a.id },
        { to_host: b.id },
        { note: "Secret reason", notify: { attendees: false } },
      ),
    );
    await drain(env);
    const { sent, deps } = recordingDeps();
    await runDueSchedulingNotifications(deps, scopeOf(env));
    const digests = sent.filter((email) => email.subject === "Your bookings have changed");
    expect(digests.map((email) => email.to).sort()).toEqual(["a@example.com", "b@example.com"]);
    const toB = digests.find((email) => email.to === "b@example.com");
    const toA = digests.find((email) => email.to === "a@example.com");
    expect(toB?.text).toContain("Bookings that came to you: 2");
    expect(toA?.text).toContain("Bookings that went to someone else: 2");
    expect(JSON.stringify(digests)).not.toContain("Sam Lee");
    expect(JSON.stringify(sent)).not.toContain("Secret reason");
  });

  test("`each` tells hosts per booking, `none` not at all, and attendees can be left out", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    const one = await book(env, type.id, at("10:00"), a.id);
    await start(env, request({ host: a.id }, { to_host: b.id }, { notify: { hosts: "each" } }));
    await drain(env);
    const each = await db
      .select()
      .from(schema.schedulingNotification)
      .where(
        and(
          eq(schema.schedulingNotification.bookingId, one.id),
          eq(schema.schedulingNotification.kind, "reassigned"),
          eq(schema.schedulingNotification.recipient, "host"),
        ),
      );
    expect(each).toHaveLength(2);

    const env2 = await environment();
    const [c, d] = await Promise.all([host(env2, "C"), host(env2, "D")]);
    const type2 = await pool(env2, [c, d]);
    await book(env2, type2.id, at("10:00"), c.id);
    await start(
      env2,
      request({ host: c.id }, { to_host: d.id }, { notify: { hosts: "none", attendees: false } }),
    );
    await drain(env2);
    const none = await db
      .select()
      .from(schema.schedulingNotification)
      .where(
        and(
          eq(schema.schedulingNotification.environmentId, env2.environmentId),
          inArray(schema.schedulingNotification.kind, ["reassignment_summary", "reassigned"]),
        ),
      );
    expect(none).toEqual([]);
  });

  test("the completed webhook has ids and counts, never the reason or note", async () => {
    const env = await environment();
    await createWebhookEndpoint(
      {
        organizationId: env.organizationId,
        environmentId: env.environmentId,
        url: "https://hooks.example.com/coss",
        eventTypes: ["scheduling.reassignment.completed"],
        apiVersion: LATEST_API_VERSION,
        userId: null,
      },
      testManagementDeps,
    );
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    await book(env, type.id, at("10:00"), a.id);
    const { reassignment } = await start(
      env,
      request(
        { host: a.id },
        { to_host: b.id },
        { note: "Secret reason", reason_code: "out_of_office" },
      ),
    );
    await drain(env);
    const messages = await db
      .select()
      .from(schema.webhookMessage)
      .where(
        and(
          eq(schema.webhookMessage.organizationId, env.organizationId),
          eq(schema.webhookMessage.type, "scheduling.reassignment.completed"),
        ),
      );
    expect(messages).toHaveLength(1);
    const payload = JSON.stringify(messages[0]?.payload);
    expect(payload).toContain(reassignment.id);
    expect(payload).not.toContain("Secret reason");
    expect(payload).not.toContain('out_of_office"');
    const lines = await db
      .select()
      .from(schema.logEntry)
      .where(
        and(
          eq(schema.logEntry.environmentId, env.environmentId),
          eq(schema.logEntry.type, "scheduling.reassignment.completed"),
        ),
      );
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines)).not.toContain("Secret reason");
  });

  test("each booking's history says which run moved it, with the note encrypted", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    const booking = await book(env, type.id, at("10:00"), a.id);
    const { reassignment } = await start(
      env,
      request({ host: a.id }, { to_host: b.id }, { note: "Secret reason" }),
    );
    await drain(env);
    const [event] = await db
      .select()
      .from(schema.schedulingBookingEvent)
      .where(
        and(
          eq(schema.schedulingBookingEvent.bookingId, booking.id),
          eq(schema.schedulingBookingEvent.type, "scheduling.booking.reassigned"),
        ),
      );
    expect(event?.details).toMatchObject({ reassignment_id: reassignment.id });
    expect(event?.encryptedNote).not.toBeNull();
    expect(JSON.stringify(event)).not.toContain("Secret reason");
  });
});

describe("going out of office", () => {
  const away = (env: SchedulingEnvironment, hostId: string, extra: object = {}) =>
    createOutOfOffice(
      env,
      { host: hostId, start: iso("09:00"), end: iso("18:00"), ...extra } as never,
      plain,
      actor,
      "api",
    );
  const runsOf = async (env: SchedulingEnvironment) =>
    (await listReassignments(env, { limit: 10 })).data;

  test("`reassign` moves what's in the way", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    const booking = await book(env, type.id, at("10:00"), a.id);
    const entry = await away(env, a.id, { existing_bookings: "reassign" });
    const [run] = await runsOf(env);
    expect(run).toMatchObject({ out_of_office: entry[0]?.id, status: "pending" });
    await drain(env);
    expect(await hostsOf(booking.id)).toEqual([b.id]);
  });

  test("sending an entry to another host moves what's in the way of theirs", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await pool(env, [a, b, c]);
    const theirs = await book(env, type.id, at("10:00"), b.id);
    const window = { start: iso("09:00"), end: iso("12:00") };
    await putOutOfOffice(
      env,
      "leave_host",
      { host: a.id, ...window, existing_bookings: "reassign" } as never,
      plain,
      actor,
    );
    await drain(env);
    await putOutOfOffice(
      env,
      "leave_host",
      { host: b.id, ...window, existing_bookings: "reassign" } as never,
      plain,
      actor,
    );
    await drain(env);
    expect(await hostsOf(theirs.id)).not.toEqual([b.id]);
  });

  test("time away taken back before its run gets there moves nothing", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    const booking = await book(env, type.id, at("10:00"), a.id);
    const [entry] = await away(env, a.id, { existing_bookings: "reassign" });
    await deleteOutOfOffice(env, entry?.id as string, plain);
    await drain(env);
    expect(await hostsOf(booking.id)).toEqual([a.id]);
  });

  test("a new target needs no repeating that bookings move", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await pool(env, [a, b, c]);
    const booking = await book(env, type.id, at("15:00"), a.id);
    const [entry] = await away(env, a.id, {
      end: iso("12:00"),
      existing_bookings: "reassign",
      reassign: { to_host: b.id },
    });
    await updateOutOfOffice(
      env,
      entry?.id as string,
      { end: iso("18:00"), reassign: { to_host: c.id } },
      plain,
      actor,
    );
    await drain(env);
    expect(await hostsOf(booking.id)).toEqual([c.id]);
  });

  test("a change that starts a run goes to the cover it sets", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await pool(env, [a, b, c]);
    const booking = await book(env, type.id, at("10:00"), a.id);
    const [entry] = await away(env, a.id, { delegates: [b.id] });
    await updateOutOfOffice(
      env,
      entry?.id as string,
      { delegates: [c.id], existing_bookings: "reassign" },
      plain,
      actor,
    );
    await drain(env);
    expect(await hostsOf(booking.id)).toEqual([c.id]);
  });

  test("with who it goes to", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await pool(env, [a, b, c]);
    const booking = await book(env, type.id, at("10:00"), a.id);
    await away(env, a.id, { existing_bookings: "reassign", reassign: { to_host: c.id } });
    await drain(env);
    expect(await hostsOf(booking.id)).toEqual([c.id]);
  });

  test("the default leaves them alone, and nothing in the way starts no run", async () => {
    const env = await environment();
    const [a, b, c] = await Promise.all([host(env, "A"), host(env, "B"), host(env, "C")]);
    const type = await pool(env, [a, b, c]);
    const booking = await book(env, type.id, at("10:00"), a.id);
    await away(env, a.id);
    expect(await runsOf(env)).toEqual([]);
    expect(await hostsOf(booking.id)).toEqual([a.id]);
    await away(env, b.id, { existing_bookings: "reassign" });
    expect(await runsOf(env)).toEqual([]);
  });

  test("changing the times starts another run, and changing notes doesn't", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    await book(env, type.id, at("10:00"), a.id);
    await book(env, type.id, at("10:00", "2031-01-07"), b.id);
    const later = await book(env, type.id, at("11:00", "2031-01-07"), a.id);
    const [entry] = await away(env, a.id, { existing_bookings: "reassign" });
    if (!entry) throw new Error("no entry");
    await drain(env);
    await updateOutOfOffice(env, entry.id, { notes: "Back Friday" } as never, plain, actor);
    expect(await runsOf(env)).toHaveLength(1);
    await updateOutOfOffice(
      env,
      entry.id,
      { end: iso("18:00", "2031-01-07") } as never,
      plain,
      actor,
    );
    expect(await runsOf(env)).toHaveLength(2);
    await drain(env);
    expect(await hostsOf(later.id)).toEqual([b.id]);
  });

  test("the conflicts email waits for the run, and only says what's left", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([
      host(env, "A", { email: "a@example.com" }),
      host(env, "B", { email: "b@example.com" }),
    ]);
    const type = await pool(env, [a, b]);
    await book(env, type.id, at("10:00"), a.id);
    await away(env, a.id, { existing_bookings: "reassign" });
    const [row] = await db
      .select()
      .from(schema.schedulingNotification)
      .where(
        and(
          eq(schema.schedulingNotification.environmentId, env.environmentId),
          eq(schema.schedulingNotification.kind, "out_of_office_conflicts"),
        ),
      );
    expect(row?.dueAt.getTime()).toBeGreaterThan(NOW.getTime());
  });

  test("racing a reschedule doesn't deadlock", async () => {
    const env = await environment();
    const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
    const type = await pool(env, [a, b]);
    const bookings = [];
    for (const time of ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00"]) {
      bookings.push(await book(env, type.id, at(time), a.id));
    }
    const results = await Promise.allSettled([
      away(env, a.id, { existing_bookings: "reassign", start: iso("08:00") }),
      ...bookings.map((booking, index) =>
        rescheduleBooking(
          env,
          booking.id,
          { startMs: at("15:00") + index * 30 * 60_000 },
          plain,
          actor,
        ),
      ),
    ]);
    for (const result of results) {
      if (result.status === "rejected") {
        expect(String(result.reason?.code ?? result.reason)).not.toContain("40P01");
      }
    }
    await drain(env);
  }, 30_000);
});

describe("keeping it tidy", () => {
  test("a run's note goes when it finishes, and its report with its bookings' rows", async () => {
    const env = await environment();
    const a = await host(env, "A");
    const { reassignment } = await start(env, request({ host: a.id }, {}, { note: "Why" }));
    const note = async () =>
      (
        await db
          .select({ note: schema.schedulingReassignment.encryptedNote })
          .from(schema.schedulingReassignment)
          .where(eq(schema.schedulingReassignment.id, reassignment.id))
      )[0]?.note;
    expect(await note()).not.toBeNull();
    await drain(env);
    expect(await note()).toBeNull();
    const days = 86_400_000;
    const after = (count: number) => ({
      now: new Date(Date.now() + count * days),
      limit: 10,
      ...scopeOf(env),
    });
    expect(await purgeExpiredReassignments(after(1))).toBe(0);
    await getReassignment(env, reassignment.id);
    expect(await purgeExpiredReassignments(after(396))).toBe(1);
    await expect(getReassignment(env, reassignment.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  test("a run still going is never purged", async () => {
    const env = await environment();
    const a = await host(env, "A");
    const { reassignment } = await start(env, request({ host: a.id }));
    expect(
      await purgeExpiredReassignments({
        now: new Date(Date.now() + 500 * 86_400_000),
        limit: 10,
        ...scopeOf(env),
      }),
    ).toBe(0);
    expect((await getReassignment(env, reassignment.id)).status).toBe("pending");
  });

  test("the note's re-encrypted with the ring", async () => {
    const env = await environment();
    const a = await host(env, "A");
    const { reassignment } = await start(env, request({ host: a.id }, {}, { note: "Why" }));
    const [before] = await db
      .select({ note: schema.schedulingReassignment.encryptedNote })
      .from(schema.schedulingReassignment)
      .where(eq(schema.schedulingReassignment.id, reassignment.id));
    const next = secretsKeyRing([
      createHash("sha256").update("rotated").digest(),
      ...plain.dataKeys.keys.map((key) => key.key),
    ]);
    const result = await reencryptSchedulingData({ keys: next, ...scopeOf(env) });
    expect(result.unreadableCount).toBe(0);
    const [after] = await db
      .select({ note: schema.schedulingReassignment.encryptedNote })
      .from(schema.schedulingReassignment)
      .where(eq(schema.schedulingReassignment.id, reassignment.id));
    expect(after?.note).not.toBe(before?.note);
    expect(after?.note?.startsWith(`v2:${next.primary.id}:`)).toBe(true);
  });
});

test("a disabled host's bookings can still leave them", async () => {
  const env = await environment();
  const [a, b] = await Promise.all([host(env, "A"), host(env, "B")]);
  const type = await pool(env, [a, b]);
  const booking = await book(env, type.id, at("10:00"), a.id);
  await updateHost(env, a.id, { status: "disabled" });
  await start(env, request({ host: a.id }, { to_host: b.id }));
  await drain(env);
  expect(await hostsOf(booking.id)).toEqual([b.id]);
});
