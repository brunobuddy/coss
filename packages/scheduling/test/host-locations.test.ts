import { describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { and, eq } from "drizzle-orm";
import {
  confirmHold,
  createBooking,
  createEventType,
  createHold,
  createHost,
  createSchedule,
  createSeries,
  getBooking,
  type NotificationDeps,
  rescheduleBooking,
  runDueSchedulingNotifications,
  type SchedulingEmail,
  type SchedulingEnvironment,
  SchedulingError,
  updateBookingLocation,
  updateEventType,
  updateHost,
} from "../src/index.ts";
import {
  CreateHostRequest,
  Location,
  UpdateBookingLocationRequest,
  UpdateHostRequest,
} from "../src/schemas.ts";
import { testSchedulingDeps } from "../src/testing.ts";

const at = (time: string, date = "2031-01-06") => Date.parse(`${date}T${time}:00Z`);
const NOW = new Date(at("00:00", "2031-01-01"));
const deps = testSchedulingDeps({ now: () => NOW });
const actor = { kind: "system" } as const;
const attendee = { uid: "p", name: "Sam Lee", email: "sam@example.com", time_zone: "UTC" };
const OFFICE_A = { type: "in_person" as const, address: "12 Main St" };
const OFFICE_B = { type: "in_person" as const, address: "9 Harbor Rd" };
const BLANK = { type: "in_person" as const, address: null };

type Locations = Parameters<typeof createHost>[1]["locations"];

async function tenantEnv(mode: "live" | "sandbox" = "sandbox"): Promise<SchedulingEnvironment> {
  const tenant = await createTestTenant();
  return {
    organizationId: tenant.organization.id,
    projectId: tenant.project.id,
    environmentId: mode === "live" ? tenant.production.id : tenant.development.id,
    mode,
  };
}

async function hostOf(env: SchedulingEnvironment, uid: string, locations?: Locations) {
  const host = await createHost(env, {
    uid,
    name: uid,
    time_zone: "UTC",
    ...(locations ? { locations } : {}),
  });
  await createSchedule(env, host.id, {
    rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
  });
  return host;
}

const eventTypeOf = (
  env: SchedulingEnvironment,
  kind: "one_on_one" | "pool" | "collective" | "group",
  hosts: readonly { id: string; role?: "required" | "member" }[],
  locations: readonly unknown[] = [BLANK],
) =>
  createEventType(env, {
    title: "Visit",
    kind,
    duration_minutes: 30,
    ...(kind === "group" ? { capacity: 2 } : {}),
    locations,
    hosts: hosts.map((host) => ({
      host: host.id,
      role: host.role ?? "member",
      weight: 100,
      schedule: null,
    })),
  } as never);

const storedLocation = async (env: SchedulingEnvironment, id: string) => {
  const [row] = await db
    .select({ location: schema.schedulingBooking.location })
    .from(schema.schedulingBooking)
    .where(
      and(
        eq(schema.schedulingBooking.id, id),
        eq(schema.schedulingBooking.organizationId, env.organizationId),
      ),
    );
  return row?.location;
};

async function code(run: Promise<unknown>): Promise<string> {
  try {
    await run;
    return "ok";
  } catch (error) {
    if (error instanceof SchedulingError) return error.code;
    throw error;
  }
}

describe("a host's own locations", () => {
  test("a booking takes the winning host's, and attendees are told in the email and invite", async () => {
    const env = await tenantEnv();
    const host = await hostOf(env, "a", [OFFICE_A]);
    const eventType = await eventTypeOf(env, "one_on_one", [host]);
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee },
      deps,
      actor,
    );
    expect(booking.location).toEqual(OFFICE_A);

    const emails: SchedulingEmail[] = [];
    const notification: NotificationDeps = {
      dataKeys: deps.dataKeys,
      publicUrl: "https://book.example.test",
      now: () => NOW,
      notifier: {
        email: async (message) => {
          emails.push(message);
        },
        sms: async () => {},
      },
    };
    await runDueSchedulingNotifications(notification, {
      scope: { organizationIds: [env.organizationId] },
    });
    const toAttendee = emails.find((email) => email.to === attendee.email);
    expect(toAttendee?.text).toContain(OFFICE_A.address);
    expect(toAttendee?.ics?.content).toContain(OFFICE_A.address);
  });

  test("each booking in a pool gets the office of the host it landed on", async () => {
    const env = await tenantEnv();
    const a = await hostOf(env, "a", [OFFICE_A]);
    const b = await hostOf(env, "b", [OFFICE_B]);
    const eventType = await eventTypeOf(env, "pool", [a, b]);
    const onA = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), host: "a", attendee },
      deps,
      actor,
    );
    const onB = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), host: "b", attendee },
      deps,
      actor,
    );
    expect(onA.booking.location).toEqual(OFFICE_A);
    expect(onB.booking.location).toEqual(OFFICE_B);
  });

  test("a value already named wins: on the event type, in the request, or an attendee's number", async () => {
    const env = await tenantEnv();
    const host = await hostOf(env, "a", [
      OFFICE_A,
      { type: "phone", number: "+12125550100" },
      { type: "link", url: "https://host.example/room" },
    ]);
    const fixed = await eventTypeOf(env, "one_on_one", [host], [OFFICE_B]);
    expect(
      (
        await createBooking(
          env,
          { eventType: fixed.id, startMs: at("09:00"), attendee },
          deps,
          actor,
        )
      ).booking.location,
    ).toEqual(OFFICE_B);

    const open = await eventTypeOf(
      env,
      "one_on_one",
      [host],
      [BLANK, { type: "phone", number: null }, { type: "link", url: null }],
    );
    const request = { eventType: open.id, attendee };
    const named = await createBooking(
      env,
      { ...request, startMs: at("10:00"), location: OFFICE_B },
      deps,
      actor,
    );
    expect(named.booking.location).toEqual(OFFICE_B);

    const theirNumber = { type: "phone" as const, number: "+15551234567" };
    const attendeeNumber = await createBooking(
      env,
      { ...request, startMs: at("11:00"), location: theirNumber, locationFromBrowser: true },
      deps,
      actor,
    );
    expect(attendeeNumber.booking.location).toEqual(theirNumber);

    const blankPhone = await createBooking(
      env,
      {
        ...request,
        startMs: at("12:00"),
        location: { type: "phone", number: null },
        locationFromBrowser: true,
      },
      deps,
      actor,
    );
    expect(blankPhone.booking.location).toEqual({ type: "phone", number: "+12125550100" });
  });

  test("a browser can't replace the host's link with its own", async () => {
    const env = await tenantEnv();
    const room = { type: "link" as const, url: "https://host.example/room" };
    const host = await hostOf(env, "a", [room]);
    const eventType = await eventTypeOf(env, "one_on_one", [host], [{ type: "link", url: null }]);
    const { booking } = await createBooking(
      env,
      {
        eventType: eventType.id,
        startMs: at("09:00"),
        attendee,
        location: { type: "link", url: "https://attacker.example" },
        locationFromBrowser: true,
      },
      deps,
      actor,
    );
    expect(booking.location).toEqual(room);
  });

  test("a host without one still gets the booking, with the location left blank", async () => {
    const env = await tenantEnv();
    const host = await hostOf(env, "a");
    const eventType = await eventTypeOf(env, "one_on_one", [host]);
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee },
      deps,
      actor,
    );
    expect(booking.status).toBe("confirmed");
    expect(booking.location).toEqual(BLANK);
  });

  test("another type of the host's doesn't stand in", async () => {
    const env = await tenantEnv();
    const host = await hostOf(env, "a", [{ type: "link", url: "https://host.example/room" }]);
    const eventType = await eventTypeOf(env, "one_on_one", [host]);
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee },
      deps,
      actor,
    );
    expect(booking.location).toEqual(BLANK);
  });

  test("every occurrence of a series has it", async () => {
    const env = await tenantEnv();
    const a = await hostOf(env, "a", [OFFICE_A]);
    const eventType = await eventTypeOf(env, "pool", [a]);
    const { result } = await createSeries(
      env,
      {
        eventType: eventType.id,
        startMs: at("09:00"),
        attendee,
        recurrence: { frequency: "weekly", interval: 1, count: 3 },
        onConflict: "reject",
      },
      deps,
      actor,
    );
    expect(result.bookings.map((booking) => booking.location)).toEqual([
      OFFICE_A,
      OFFICE_A,
      OFFICE_A,
    ]);
  });

  test("a collective booking uses the first host by id who has one", async () => {
    const env = await tenantEnv();
    // Ids made in one millisecond sort in any order, so go by the ids themselves.
    const hosts = [await hostOf(env, "x"), await hostOf(env, "y"), await hostOf(env, "z")];
    const [first, second, third] = hosts.sort((a, b) => (a.id < b.id ? -1 : 1)) as [
      (typeof hosts)[0],
      (typeof hosts)[0],
      (typeof hosts)[0],
    ];
    await updateHost(env, second.id, { locations: [OFFICE_A] });
    await updateHost(env, third.id, { locations: [OFFICE_B] });
    const eventType = await eventTypeOf(env, "collective", [
      { id: third.id, role: "required" },
      { id: first.id, role: "required" },
      { id: second.id, role: "required" },
    ]);
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee },
      deps,
      actor,
    );
    expect(booking.location).toEqual(OFFICE_A);
  });

  test("a group session's seats all see what the first seat settled", async () => {
    const env = await tenantEnv();
    const host = await hostOf(env, "a", [OFFICE_A]);
    const eventType = await eventTypeOf(env, "group", [host]);
    const seat = (uid: string) => ({
      eventType: eventType.id,
      startMs: at("09:00"),
      attendee: { ...attendee, uid },
    });
    const first = await createBooking(env, seat("one"), deps, actor);
    await updateHost(env, host.id, { locations: [OFFICE_B] });
    const second = await createBooking(env, seat("two"), deps, actor);
    expect(first.booking.location).toEqual(OFFICE_A);
    expect(second.booking.location).toEqual(OFFICE_A);
  });

  test("a hold has it from the start and keeps it when confirmed", async () => {
    const env = await tenantEnv();
    const host = await hostOf(env, "a", [OFFICE_A]);
    const eventType = await eventTypeOf(env, "one_on_one", [host]);
    const { booking: hold } = await createHold(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee },
      deps,
      actor,
    );
    expect(hold.location).toEqual(OFFICE_A);
    const done = await confirmHold(env, hold.id, { ifStillFree: true }, deps, actor);
    expect(done.location).toEqual(OFFICE_A);
  });

  test("the marker that says where it came from stays off the wire", async () => {
    const env = await tenantEnv();
    const host = await hostOf(env, "a", [OFFICE_A]);
    const eventType = await eventTypeOf(env, "one_on_one", [host]);
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee },
      deps,
      actor,
    );
    expect(await storedLocation(env, booking.id)).toEqual({
      ...OFFICE_A,
      fromHost: host.id,
    } as never);
    expect(await getBooking(env, booking.id, deps)).toMatchObject({ location: OFFICE_A });
    expect(JSON.stringify(await getBooking(env, booking.id, deps))).not.toContain("fromHost");
  });

  test("editing a host leaves existing bookings alone", async () => {
    const env = await tenantEnv();
    const host = await hostOf(env, "a", [OFFICE_A]);
    const eventType = await eventTypeOf(env, "one_on_one", [host]);
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee },
      deps,
      actor,
    );
    await updateHost(env, host.id, { locations: [OFFICE_B] });
    expect((await getBooking(env, booking.id, deps)).location).toEqual(OFFICE_A);
    const moved = await rescheduleBooking(env, booking.id, { startMs: at("10:00") }, deps, actor);
    expect(moved.location).toEqual(OFFICE_A);
  });
});

describe("moving a booking to another host", () => {
  async function poolBooking(bLocations?: Locations) {
    const env = await tenantEnv();
    const a = await hostOf(env, "a", [OFFICE_A]);
    const b = await hostOf(env, "b", bLocations);
    const eventType = await eventTypeOf(env, "pool", [a, b]);
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), host: "a", attendee },
      deps,
      actor,
    );
    expect(booking.location).toEqual(OFFICE_A);
    return { env, booking };
  }

  test("takes the new host's office", async () => {
    const { env, booking } = await poolBooking([OFFICE_B]);
    const moved = await rescheduleBooking(
      env,
      booking.id,
      { startMs: at("10:00"), host: "b" },
      deps,
      actor,
    );
    expect(moved.location).toEqual(OFFICE_B);
  });

  test("goes blank when the new host has none, never keeping the old host's address", async () => {
    const { env, booking } = await poolBooking();
    const moved = await rescheduleBooking(
      env,
      booking.id,
      { startMs: at("10:00"), host: "b" },
      deps,
      actor,
    );
    expect(moved.location).toEqual(BLANK);
    expect(await storedLocation(env, booking.id)).toEqual(BLANK);
  });

  test("a blank location gets the new host's", async () => {
    const env = await tenantEnv();
    const a = await hostOf(env, "a");
    const b = await hostOf(env, "b", [OFFICE_B]);
    const eventType = await eventTypeOf(env, "pool", [a, b]);
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), host: "a", attendee },
      deps,
      actor,
    );
    expect(booking.location).toEqual(BLANK);
    const moved = await rescheduleBooking(
      env,
      booking.id,
      { startMs: at("10:00"), host: "b" },
      deps,
      actor,
    );
    expect(moved.location).toEqual(OFFICE_B);
  });

  test("naming the host it already has keeps the location it was given", async () => {
    const { env, booking } = await poolBooking([OFFICE_B]);
    await updateHost(env, booking.hosts[0] as string, { locations: [OFFICE_B] });
    const moved = await rescheduleBooking(
      env,
      booking.id,
      { startMs: at("10:00"), host: "a" },
      deps,
      actor,
    );
    expect(moved.hosts).toEqual(booking.hosts);
    expect(moved.location).toEqual(OFFICE_A);
  });

  test("a location the customer set survives", async () => {
    const { env, booking } = await poolBooking([OFFICE_B]);
    const room = { type: "in_person" as const, address: "Conference room 4" };
    await updateBookingLocation(env, booking.id, room, deps, actor);
    const moved = await rescheduleBooking(
      env,
      booking.id,
      { startMs: at("10:00"), host: "b" },
      deps,
      actor,
    );
    expect(moved.location).toEqual(room);
  });

  test("keeps a required host's office when only the member changes", async () => {
    const env = await tenantEnv();
    const lead = await hostOf(env, "lead", [OFFICE_A]);
    const a = await hostOf(env, "a");
    const b = await hostOf(env, "b", [OFFICE_B]);
    const eventType = await eventTypeOf(env, "pool", [
      { id: lead.id, role: "required" },
      { id: a.id },
      { id: b.id },
    ]);
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), host: "a", attendee },
      deps,
      actor,
    );
    expect(booking.location).toEqual(OFFICE_A);
    const moved = await rescheduleBooking(
      env,
      booking.id,
      { startMs: at("10:00"), host: "b" },
      deps,
      actor,
    );
    expect(moved.location).toEqual(OFFICE_A);
  });
});

describe("an event type's own locations", () => {
  const room = { type: "link" as const, url: "https://video.example/room" };
  const create = (
    env: SchedulingEnvironment,
    locations: readonly unknown[],
    screen?: (input: { text: string }) => Promise<boolean>,
  ) =>
    createEventType(
      env,
      { title: "Visit", kind: "one_on_one", duration_minutes: 30, locations, hosts: [] } as never,
      screen ? { screen } : {},
    );

  test("an address can't hold a link, on create or update", async () => {
    const env = await tenantEnv();
    const links = [{ type: "in_person", address: "Go to https://evil.example/login" }];
    expect(await code(create(env, links))).toBe("content_refused");
    const eventType = await create(env, [OFFICE_A]);
    expect(await code(updateEventType(env, eventType.id, { locations: links } as never))).toBe(
      "content_refused",
    );
  });

  test("live addresses and links are screened, naming the field that was refused", async () => {
    const env = await tenantEnv("live");
    const seen: string[] = [];
    const screen = async ({ text }: { text: string }) => {
      seen.push(text);
      return !text.includes(OFFICE_B.address);
    };
    const eventType = await create(env, [OFFICE_A, room], screen);
    expect(seen).toEqual(["Visit", `${OFFICE_A.address}\n${room.url}`]);

    seen.length = 0;
    const refused = await updateEventType(env, eventType.id, { locations: [OFFICE_B] } as never, {
      screen,
    }).catch((error: SchedulingError) => error);
    expect(refused).toMatchObject({ code: "content_refused", param: "locations" });
    expect(seen).toEqual([OFFICE_B.address]);
  });

  test("nothing to read means nothing goes to the classifier", async () => {
    const env = await tenantEnv("live");
    const seen: string[] = [];
    const screen = async ({ text }: { text: string }) => {
      seen.push(text);
      return true;
    };
    const eventType = await create(env, [BLANK, { type: "phone", number: "+12125550100" }], screen);
    expect(seen).toEqual(["Visit"]);
    seen.length = 0;
    await updateEventType(env, eventType.id, { duration_minutes: 45 } as never, { screen });
    expect(seen).toEqual([]);
  });

  test("sandbox addresses aren't screened", async () => {
    const env = await tenantEnv();
    const eventType = await create(env, [OFFICE_A], async () => false);
    expect(eventType.locations).toEqual([OFFICE_A]);
  });

  test("links must be https, on an event type and on a booking", () => {
    const parse = (url: string) => Location.safeParse({ type: "link", url }).success;
    expect(parse("https://video.example/room")).toBe(true);
    expect(parse("http://video.example/room")).toBe(false);
    expect(parse("javascript:alert(1)")).toBe(false);
    expect(parse("data:text/html,hi")).toBe(false);
    expect(Location.safeParse({ type: "link", url: null }).success).toBe(true);
    expect(Location.safeParse({ type: "zoom", url: "javascript:alert(1)" }).success).toBe(false);
    expect(UpdateBookingLocationRequest.safeParse({ location: room }).success).toBe(true);
    expect(
      UpdateBookingLocationRequest.safeParse({
        location: { type: "link", url: "javascript:alert(1)" },
      }).success,
    ).toBe(false);
  });
});

describe("setting them", () => {
  const parse = (locations: unknown) =>
    UpdateHostRequest.safeParse({ locations }).success &&
    CreateHostRequest.safeParse({ name: "A", time_zone: "UTC", locations }).success;

  test("at most one of each type, https links and E.164 numbers", () => {
    expect(parse([OFFICE_A, { type: "link", url: "https://host.example/room" }])).toBe(true);
    expect(parse([OFFICE_A, OFFICE_B])).toBe(false);
    expect(parse([{ type: "link", url: "http://host.example/room" }])).toBe(false);
    expect(parse([{ type: "link", url: "javascript:alert(1)" }])).toBe(false);
    expect(parse([{ type: "phone", number: "call me" }])).toBe(false);
    expect(parse([{ type: "phone", number: "+12125550100" }])).toBe(true);
    expect(parse([{ type: "in_person", address: "   " }])).toBe(false);
    expect(parse([{ type: "google_meet" }])).toBe(false);
  });

  test("an address can't hold a link", async () => {
    const env = await tenantEnv();
    const links = [{ type: "in_person" as const, address: "Go to https://evil.example/login" }];
    expect(await code(createHost(env, { name: "A", time_zone: "UTC", locations: links }))).toBe(
      "content_refused",
    );
    const host = await createHost(env, { name: "A", time_zone: "UTC" });
    expect(await code(updateHost(env, host.id, { locations: links }))).toBe("content_refused");
  });

  test("live text is screened, and only when it's new", async () => {
    const env = await tenantEnv("live");
    const seen: string[] = [];
    let verdict = true;
    const screen = async ({ text }: { text: string }) => {
      seen.push(text);
      return verdict;
    };
    const host = await createHost(env, { name: "A", time_zone: "UTC" });
    const room = { type: "link" as const, url: "https://host.example/room" };
    await updateHost(env, host.id, { locations: [OFFICE_A, room] }, { screen });
    expect(seen).toEqual([`${OFFICE_A.address}\n${room.url}`]);

    verdict = false;
    await updateHost(env, host.id, { locations: [OFFICE_A, room] }, { screen });
    expect(seen.length).toBe(1);
    expect(await code(updateHost(env, host.id, { locations: [OFFICE_B] }, { screen }))).toBe(
      "content_refused",
    );
    expect(seen.at(-1)).toBe(OFFICE_B.address);

    const phoneOnly = [{ type: "phone" as const, number: "+12125550100" }];
    const count = seen.length;
    await updateHost(env, host.id, { locations: phoneOnly }, { screen });
    expect(seen.length).toBe(count);

    expect(
      await code(
        createHost(env, { name: "B", time_zone: "UTC", locations: [OFFICE_B] }, { screen }),
      ),
    ).toBe("content_refused");
  });

  test("sandbox text isn't screened", async () => {
    const env = await tenantEnv();
    const screen = async () => false;
    const host = await createHost(env, { name: "A", time_zone: "UTC" });
    expect(await code(updateHost(env, host.id, { locations: [OFFICE_B] }, { screen }))).toBe("ok");
  });
});
