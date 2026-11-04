/** Holidays as time away: reading feeds, keeping entries right, and what's never said. */
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { reencryptWebhookSecrets, secretsKeyRing } from "@coss/webhooks";
import { and, eq, isNull } from "drizzle-orm";
import { holidaysFromIcs, UnreadableCalendarData } from "../src/calendar/ical.ts";
import {
  createBooking,
  createEventType,
  createHolidayCalendar,
  createHost,
  createSchedule,
  type DavTransport,
  deleteHolidayCalendar,
  deleteOutOfOffice,
  getHolidayCalendar,
  HOLIDAY_COUNTRIES,
  listEventTypeSlots,
  listHolidays,
  listOutOfOffice,
  runDueHolidayCalendars,
  type SchedulingEnvironment,
  updateHolidayCalendar,
  updateHost,
  updateOutOfOffice,
} from "../src/index.ts";
import { testSchedulingDeps } from "../src/testing.ts";

const NOW = new Date("2031-01-01T08:00:00Z");
const keys = secretsKeyRing([createHash("sha256").update("holiday-test").digest()]);
const calendars = {
  secretsKeys: keys,
  apps: { google: null, microsoft: null },
  publicUrl: "http://x",
};
const plain = { ...testSchedulingDeps({ now: () => NOW }), calendars };
const FEED_URL = "https://feeds.example.com/holidays.ics?token=secret-token";

const ics = (...events: string[]) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    ...events.flatMap((event) => ["BEGIN:VEVENT", ...event.split("\n"), "END:VEVENT"]),
    "END:VCALENDAR",
  ].join("\r\n");
const day = (date: string, name: string, extra = "") => {
  const compact = date.replaceAll("-", "");
  const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
  return [
    `UID:${date}-${name.replaceAll(" ", "")}@test`,
    `DTSTAMP:20300101T000000Z`,
    `DTSTART;VALUE=DATE:${compact}`,
    `DTEND;VALUE=DATE:${next}`,
    `SUMMARY:${name}`,
    ...(extra ? [extra] : []),
  ].join("\n");
};

async function environment(mode: "live" | "sandbox" = "live"): Promise<SchedulingEnvironment> {
  const tenant = await createTestTenant();
  return {
    organizationId: tenant.organization.id,
    projectId: tenant.project.id,
    environmentId: mode === "live" ? tenant.production.id : tenant.development.id,
    mode,
  };
}

async function host(
  env: SchedulingEnvironment,
  name: string,
  extra: { attributes?: Record<string, string>; time_zone?: string } = {},
) {
  const created = await createHost(env, { name, time_zone: "UTC", ...extra });
  await createSchedule(env, created.id, {
    rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
  });
  return created;
}

/** A feed that answers with what's in it right now, and records what it was asked. */
function feed(initial: string) {
  const state = { body: initial, status: 200, asked: [] as string[], fail: false };
  const transport: DavTransport = async (request) => {
    state.asked.push(request.url);
    if (state.fail) throw new Error(`connect failed for ${request.url}`);
    return { status: state.status, headers: {}, body: state.body };
  };
  return { state, transport };
}

/** Does something once, while the feed's being read. */
const during = (transport: DavTransport, change: () => Promise<unknown>): DavTransport => {
  let done = false;
  return async (request) => {
    if (!done) {
      done = true;
      await change();
    }
    return transport(request);
  };
};

const sync = async (env: SchedulingEnvironment, transport: DavTransport, at: Date = NOW) => {
  for (let pass = 0; pass < 20; pass++) {
    const ran = await runDueHolidayCalendars(
      { ...plain, now: () => at, transport },
      { scope: { organizationIds: [env.organizationId] } },
    );
    if (ran === 0) return;
  }
  throw new Error("still syncing after 20 passes");
};

const entriesOf = async (env: SchedulingEnvironment, hostId: string) =>
  (await listOutOfOffice(env, { hostIds: [hostId], limit: 100 }, plain)).data;
const datesOf = async (env: SchedulingEnvironment, hostId: string) =>
  (await entriesOf(env, hostId)).map((entry) => entry.all_day?.start_date).sort();

const calendar = (env: SchedulingEnvironment, hostIds: string[], extra: object = {}) =>
  createHolidayCalendar(
    env,
    { name: "Company", ics_url: FEED_URL, hosts: hostIds, ...extra } as never,
    plain,
  );

/** Due again, as the next day would make it. */
const dueAgain = (id: string) =>
  db
    .update(schema.schedulingHolidayCalendar)
    .set({ nextSyncAt: NOW, leaseUntil: null })
    .where(eq(schema.schedulingHolidayCalendar.id, id));

describe("a calendar changed while its feed is being read", () => {
  test("deleted, it makes nobody away, and goes", async () => {
    const env = await environment();
    const doctor = await host(env, "Doctor");
    const created = await calendar(env, [doctor.id]);
    const { transport } = feed(ics(day("2031-01-05", "One")));
    await sync(
      env,
      during(transport, () => deleteHolidayCalendar(env, created.id, plain)),
    );
    expect(await datesOf(env, doctor.id)).toEqual([]);
    const left = await db
      .select({ id: schema.schedulingHolidayCalendar.id })
      .from(schema.schedulingHolidayCalendar)
      .where(eq(schema.schedulingHolidayCalendar.id, created.id));
    expect(left).toEqual([]);
  });

  test("edited, it goes by the new settings, straight away", async () => {
    const env = await environment();
    const [a, b] = [await host(env, "A"), await host(env, "B")];
    const created = await calendar(env, [a.id]);
    const { transport } = feed(ics(day("2031-01-05", "One")));
    await sync(
      env,
      during(transport, () => updateHolidayCalendar(env, created.id, { hosts: [b.id] }, plain)),
    );
    expect(await datesOf(env, a.id)).toEqual([]);
    expect(await datesOf(env, b.id)).toEqual(["2031-01-05"]);
  });
});

describe("reading a feed", () => {
  test("whole days, with names, between the dates", () => {
    const found = holidaysFromIcs(
      ics(day("2031-01-05", "In range"), day("2030-12-01", "Before"), day("2031-06-01", "After")),
      "2031-01-01",
      "2031-02-01",
    );
    expect(found).toEqual([{ date: "2031-01-05", name: "In range", region: null }]);
  });

  test("reads what Google really sends, which is marked free", () => {
    // Copied from `en.uk.official`: a holiday doesn't block anyone's calendar by itself.
    const real = [
      "DTSTART;VALUE=DATE:20311226",
      "DTEND;VALUE=DATE:20311227",
      "DTSTAMP:20261104T192559Z",
      "UID:20311226_l3507k8u4mjvlo6nne1mbnrjr8@google.com",
      "CLASS:PUBLIC",
      "CREATED:20240522T090212Z",
      "DESCRIPTION:Public holiday",
      "LAST-MODIFIED:20240522T090212Z",
      "SEQUENCE:0",
      "STATUS:CONFIRMED",
      "SUMMARY:Boxing Day",
      "TRANSP:TRANSPARENT",
    ].join("\n");
    const found = holidaysFromIcs(ics(real), "2031-01-01", "2032-01-01");
    expect(found).toEqual([{ date: "2031-12-26", name: "Boxing Day", region: null }]);
  });

  test("says who a regional holiday's for", () => {
    const found = holidaysFromIcs(
      ics(
        day("2031-01-05", "Scottish", "DESCRIPTION:Public holiday in Scotland"),
        day("2031-01-06", "Everyone", "DESCRIPTION:Public holiday"),
      ),
      "2031-01-01",
      "2032-01-01",
    );
    expect(found.map((holiday) => holiday.region)).toEqual(["Scotland", null]);
  });

  test("two regions on one day are both's, and nationwide wins", () => {
    const found = holidaysFromIcs(
      ics(
        day("2031-01-05", "Scottish", "DESCRIPTION:Public holiday in Scotland"),
        day("2031-01-05", "Welsh", "DESCRIPTION:Public holiday in Wales"),
        day("2031-01-06", "Regional", "DESCRIPTION:Public holiday in Wales"),
        day("2031-01-06", "Everyone", "DESCRIPTION:Public holiday"),
      ),
      "2031-01-01",
      "2032-01-01",
    );
    expect(found[0]?.region).toBe("Scotland, Wales");
    expect(found[1]?.region).toBeNull();
  });

  test("a date's a date, in nobody's time zone", () => {
    const found = holidaysFromIcs(ics(day("2031-01-05", "Day")), "2031-01-01", "2032-01-01");
    expect(found[0]?.date).toBe("2031-01-05");
  });

  test("several days become each of them", () => {
    const event = [
      "UID:break@test",
      "DTSTAMP:20300101T000000Z",
      "DTSTART;VALUE=DATE:20310105",
      "DTEND;VALUE=DATE:20310108",
      "SUMMARY:Break",
    ].join("\n");
    const found = holidaysFromIcs(ics(event), "2031-01-01", "2032-01-01");
    expect(found.map((holiday) => holiday.date)).toEqual([
      "2031-01-05",
      "2031-01-06",
      "2031-01-07",
    ]);
  });

  test("leaves out timed events, cancellations and observances", () => {
    const timed = [
      "UID:meeting@test",
      "DTSTAMP:20300101T000000Z",
      "DTSTART:20310105T100000Z",
      "DTEND:20310105T110000Z",
      "SUMMARY:Meeting",
    ].join("\n");
    const found = holidaysFromIcs(
      ics(
        timed,
        day("2031-01-06", "Cancelled", "STATUS:CANCELLED"),
        day("2031-01-07", "Mothers Day", "DESCRIPTION:Observance\\nTo hide"),
        day("2031-01-08", "Real", "DESCRIPTION:Public holiday"),
      ),
      "2031-01-01",
      "2032-01-01",
    );
    expect(found.map((holiday) => holiday.name)).toEqual(["Real"]);
  });

  test("a yearly rule comes round, without an excluded year", () => {
    const event = [
      "UID:yearly@test",
      "DTSTAMP:20300101T000000Z",
      "DTSTART;VALUE=DATE:20290105",
      "RRULE:FREQ=YEARLY",
      "EXDATE;VALUE=DATE:20310105",
      "SUMMARY:Founders",
    ].join("\n");
    const found = holidaysFromIcs(ics(event), "2030-01-01", "2033-01-01");
    expect(found.map((holiday) => holiday.date)).toEqual(["2030-01-05", "2032-01-05"]);
  });

  test("every occurrence lasts as long as the first", () => {
    const event = [
      "UID:closure@test",
      "DTSTAMP:20300101T000000Z",
      "DTSTART;VALUE=DATE:20301224",
      "DTEND;VALUE=DATE:20301227",
      "RRULE:FREQ=YEARLY",
      "SUMMARY:Closure",
    ].join("\n");
    const found = holidaysFromIcs(ics(event), "2031-01-01", "2032-01-01");
    expect(found.map((holiday) => holiday.date)).toEqual([
      "2031-12-24",
      "2031-12-25",
      "2031-12-26",
    ]);
  });

  test("a rule too long to reach the window is a failed read, not fewer holidays", () => {
    const event = [
      "UID:daily@test",
      "DTSTAMP:20000101T000000Z",
      "DTSTART;VALUE=DATE:20000101",
      "RRULE:FREQ=DAILY",
      "SUMMARY:Every day",
    ].join("\n");
    expect(() => holidaysFromIcs(ics(event), "2031-01-01", "2032-01-01")).toThrow(
      UnreadableCalendarData,
    );
  });

  test("a moved occurrence is where it moved to", () => {
    const master = [
      "UID:yearly@test",
      "DTSTAMP:20300101T000000Z",
      "DTSTART;VALUE=DATE:20300105",
      "RRULE:FREQ=YEARLY;COUNT=2",
      "SUMMARY:Founders",
    ].join("\n");
    const moved = [
      "UID:yearly@test",
      "DTSTAMP:20300101T000000Z",
      "RECURRENCE-ID;VALUE=DATE:20310105",
      "DTSTART;VALUE=DATE:20310107",
      "SUMMARY:Founders",
    ].join("\n");
    const found = holidaysFromIcs(ics(master, moved), "2030-01-01", "2033-01-01");
    expect(found.map((holiday) => holiday.date)).toEqual(["2030-01-05", "2031-01-07"]);
  });

  test("what isn't a calendar is a failed read", () => {
    for (const text of ["not a calendar", "<html>Sign in</html>", ""]) {
      expect(() => holidaysFromIcs(text, "2031-01-01", "2032-01-01")).toThrow(
        UnreadableCalendarData,
      );
    }
  });

  test("a rule that goes on forever can't take the worker with it", () => {
    const event = [
      "UID:loop@test",
      "DTSTAMP:20300101T000000Z",
      "DTSTART;VALUE=DATE:20290101",
      "RRULE:FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30",
      "SUMMARY:Never",
    ].join("\n");
    expect(() => holidaysFromIcs(ics(event), "2031-01-01", "2032-01-01")).toThrow(
      UnreadableCalendarData,
    );
  });
});

describe("creating one", () => {
  test("says one of each", async () => {
    const env = await environment();
    const a = await host(env, "A");
    const refused = (params: object) =>
      expect(
        createHolidayCalendar(env, { name: "X", ...params } as never, plain),
      ).rejects.toMatchObject({ code: "invalid_holiday_calendar" });
    await refused({ hosts: [a.id] });
    await refused({ country: "GB", ics_url: FEED_URL, hosts: [a.id] });
    await refused({ country: "GB" });
    await refused({ country: "GB", hosts: [a.id], host_filter: { team: "x" } });
    await refused({ country: "GB", host_filter: {} });
    await refused({ country: "GB", hosts: [] });
    await refused({ country: "NOPE", hosts: [a.id] });
  });

  test("a feed has to be https, with no password", async () => {
    const env = await environment();
    const a = await host(env, "A");
    await expect(
      calendar(env, [a.id], { ics_url: "http://example.com/x.ics" }),
    ).rejects.toMatchObject({ code: "invalid_holiday_calendar" });
    await expect(
      calendar(env, [a.id], { ics_url: "https://user:pw@example.com/x.ics" }),
    ).rejects.toMatchObject({ code: "invalid_holiday_calendar" });
    const webcal = await calendar(env, [a.id], { ics_url: "webcal://example.com/x.ics" });
    expect(webcal.source).toBe("ics");
  });

  test("a feed's URL never comes back", async () => {
    const env = await environment();
    const a = await host(env, "A");
    const created = await calendar(env, [a.id]);
    expect(JSON.stringify(created)).not.toContain("secret-token");
    expect(JSON.stringify(await getHolidayCalendar(env, created.id))).not.toContain("secret-token");
    const [row] = await db
      .select({ stored: schema.schedulingHolidayCalendar.encryptedIcsUrl })
      .from(schema.schedulingHolidayCalendar)
      .where(eq(schema.schedulingHolidayCalendar.id, created.id));
    expect(row?.stored).not.toContain("secret-token");
  });

  test("a sandbox can't read feeds", async () => {
    const env = await environment("sandbox");
    const a = await host(env, "A");
    await expect(calendar(env, [a.id])).rejects.toMatchObject({
      code: "invalid_holiday_calendar",
    });
  });

  test("the country list has what's expected", () => {
    expect(HOLIDAY_COUNTRIES.GB?.name).toBe("United Kingdom");
    expect(HOLIDAY_COUNTRIES.JEWISH?.calendarId).toContain("judaism");
    expect(Object.keys(HOLIDAY_COUNTRIES).length).toBeGreaterThan(200);
  });

  test("another organization's isn't found", async () => {
    const env = await environment();
    const other = await environment();
    const a = await host(env, "A");
    const created = await calendar(env, [a.id]);
    await expect(getHolidayCalendar(other, created.id)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(deleteHolidayCalendar(other, created.id, plain)).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("syncing", () => {
  test("makes an entry per host and day, in their own zone", async () => {
    const env = await environment();
    const a = await host(env, "A", { time_zone: "America/New_York" });
    const b = await host(env, "B");
    await calendar(env, [a.id, b.id]);
    const { transport } = feed(ics(day("2031-01-05", "One"), day("2031-02-05", "Two")));
    await sync(env, transport);
    expect(await datesOf(env, a.id)).toEqual(["2031-01-05", "2031-02-05"]);
    expect(await datesOf(env, b.id)).toEqual(["2031-01-05", "2031-02-05"]);
    const [first] = (await entriesOf(env, a.id)).filter(
      (entry) => entry.all_day?.start_date === "2031-01-05",
    );
    expect(first?.start).toBe("2031-01-05T05:00:00.000Z");
    expect(first).toMatchObject({ source: "holiday", reason: "public_holiday" });
  });

  test("they aren't offered that day", async () => {
    const env = await environment();
    const a = await host(env, "A");
    const type = await createEventType(env, {
      title: "Call",
      kind: "one_on_one",
      duration_minutes: 30,
      hosts: [{ host: a.id, role: "member", weight: 100, schedule: null }],
    } as never);
    await calendar(env, [a.id]);
    await sync(env, feed(ics(day("2031-01-06", "Day"))).transport);
    const slots = await listEventTypeSlots(env, {
      eventTypeRef: type.id,
      fromMs: Date.parse("2031-01-06T00:00:00Z"),
      toMs: Date.parse("2031-01-08T00:00:00Z"),
      nowMs: NOW.getTime(),
    });
    expect(slots.map((slot) => new Date(slot.startMs).toISOString().slice(0, 10))).not.toContain(
      "2031-01-06",
    );
    expect(slots.length).toBeGreaterThan(0);
  });

  test("running again changes nothing", async () => {
    const env = await environment();
    const a = await host(env, "A");
    const created = await calendar(env, [a.id]);
    const { transport } = feed(ics(day("2031-01-05", "One")));
    await sync(env, transport);
    await dueAgain(created.id);
    await sync(env, transport);
    expect(await datesOf(env, a.id)).toEqual(["2031-01-05"]);
  });

  test("a date someone removed stays removed", async () => {
    const env = await environment();
    const a = await host(env, "A");
    const created = await calendar(env, [a.id]);
    const { transport } = feed(ics(day("2031-01-05", "One"), day("2031-02-05", "Two")));
    await sync(env, transport);
    const [entry] = (await entriesOf(env, a.id)).filter(
      (row) => row.all_day?.start_date === "2031-01-05",
    );
    await deleteOutOfOffice(env, entry?.id as string, plain);
    await dueAgain(created.id);
    await sync(env, transport);
    expect(await datesOf(env, a.id)).toEqual(["2031-02-05"]);
  });

  test("a date that's gone from the feed goes, and can come back", async () => {
    const env = await environment();
    const a = await host(env, "A");
    const created = await calendar(env, [a.id]);
    const { state, transport } = feed(ics(day("2031-01-05", "One"), day("2031-02-05", "Two")));
    await sync(env, transport);
    state.body = ics(day("2031-02-05", "Two"));
    await dueAgain(created.id);
    await sync(env, transport);
    expect(await datesOf(env, a.id)).toEqual(["2031-02-05"]);
    state.body = ics(day("2031-01-05", "One"), day("2031-02-05", "Two"));
    await dueAgain(created.id);
    await sync(env, transport);
    expect(await datesOf(env, a.id)).toEqual(["2031-01-05", "2031-02-05"]);
  });

  test("a failed read keeps what's there, and says so without the URL", async () => {
    const env = await environment();
    const a = await host(env, "A");
    const created = await calendar(env, [a.id]);
    const { state, transport } = feed(ics(day("2031-01-05", "One")));
    await sync(env, transport);
    for (const breakIt of [
      () => {
        state.fail = true;
      },
      () => {
        state.fail = false;
        state.status = 500;
      },
      () => {
        state.status = 200;
        state.body = "<html>Sign in</html>";
      },
      () => {
        // A perfectly good calendar, wherever it's pointing: a redirect is never followed.
        state.body = ics(day("2031-03-05", "Elsewhere"));
        state.status = 302;
      },
    ]) {
      breakIt();
      await dueAgain(created.id);
      await sync(env, transport);
      expect(await datesOf(env, a.id)).toEqual(["2031-01-05"]);
      const after = await getHolidayCalendar(env, created.id);
      expect(after.last_error).toBeTruthy();
      expect(after.last_error).not.toContain("secret-token");
    }
  });

  test("a feed that's suddenly empty keeps what's there", async () => {
    const env = await environment();
    const a = await host(env, "A");
    const created = await calendar(env, [a.id]);
    const { state, transport } = feed(ics(day("2031-01-05", "One")));
    await sync(env, transport);
    state.body = ics();
    await dueAgain(created.id);
    await sync(env, transport);
    expect(await datesOf(env, a.id)).toEqual(["2031-01-05"]);
    expect((await getHolidayCalendar(env, created.id)).last_error).toBeTruthy();
  });

  test("a feed with nothing in it yet is fine", async () => {
    const env = await environment();
    const a = await host(env, "A");
    const created = await calendar(env, [a.id]);
    await sync(env, feed(ics()).transport);
    expect((await getHolidayCalendar(env, created.id)).last_error).toBeNull();
  });

  test("changing who covers reaches the entries already there", async () => {
    const env = await environment();
    const [a, b, c] = [await host(env, "A"), await host(env, "B"), await host(env, "C")];
    const created = await calendar(env, [a.id], { delegates: [b.id] });
    const { transport } = feed(ics(day("2031-01-05", "One")));
    await sync(env, transport);
    expect((await entriesOf(env, a.id))[0]?.delegates).toEqual([b.id]);
    await updateHolidayCalendar(
      env,
      created.id,
      { delegates: [c.id], existing_bookings: "reassign" },
      plain,
    );
    await sync(env, transport);
    expect((await entriesOf(env, a.id))[0]).toMatchObject({
      delegates: [c.id],
      existing_bookings: "reassign",
    });
  });

  test("someone's own change to an entry isn't undone by the next sync", async () => {
    const env = await environment();
    const [a, b, c] = [await host(env, "A"), await host(env, "B"), await host(env, "C")];
    const created = await calendar(env, [a.id], { delegates: [b.id] });
    const { transport } = feed(ics(day("2031-01-05", "One")));
    await sync(env, transport);
    const [entry] = await entriesOf(env, a.id);
    await updateOutOfOffice(env, entry?.id as string, { delegates: [c.id] } as never, plain, {
      kind: "system",
    });
    await db
      .update(schema.schedulingHolidayCalendar)
      .set({ settingsChangedAt: new Date("2020-01-01T00:00:00Z") })
      .where(eq(schema.schedulingHolidayCalendar.id, created.id));
    await dueAgain(created.id);
    await sync(env, transport);
    expect((await entriesOf(env, a.id))[0]?.delegates).toEqual([c.id]);
  });

  test("a good read clears the error, and the names are on its own list", async () => {
    const env = await environment();
    const a = await host(env, "A");
    const created = await calendar(env, [a.id]);
    const { state, transport } = feed("broken");
    await sync(env, transport);
    expect((await getHolidayCalendar(env, created.id)).last_error).toBeTruthy();
    state.body = ics(day("2031-01-05", "Founders Day"));
    await dueAgain(created.id);
    await sync(env, transport);
    expect((await getHolidayCalendar(env, created.id)).last_error).toBeNull();
    expect(await listHolidays(env, created.id, plain)).toEqual([
      { date: "2031-01-05", name: "Founders Day", region: null },
    ]);
  });

  test("the name goes in no entry", async () => {
    const env = await environment();
    const a = await host(env, "A");
    await calendar(env, [a.id]);
    await sync(env, feed(ics(day("2031-01-05", "Very Secret Name"))).transport);
    expect(JSON.stringify(await entriesOf(env, a.id))).not.toContain("Very Secret Name");
  });

  test("a filter's asked again, and someone leaving loses what's to come", async () => {
    const env = await environment();
    const a = await host(env, "A", { attributes: { team: "x" } });
    const b = await host(env, "B", { attributes: { team: "y" } });
    const created = await createHolidayCalendar(
      env,
      { name: "Team", ics_url: FEED_URL, host_filter: { team: "x" } } as never,
      plain,
    );
    const { transport } = feed(ics(day("2031-01-05", "One")));
    await sync(env, transport);
    expect(await datesOf(env, a.id)).toEqual(["2031-01-05"]);
    expect(await datesOf(env, b.id)).toEqual([]);
    await updateHost(env, a.id, { attributes: { team: "y" } } as never);
    await updateHost(env, b.id, { attributes: { team: "x" } } as never);
    await dueAgain(created.id);
    await sync(env, transport);
    expect(await datesOf(env, a.id)).toEqual([]);
    expect(await datesOf(env, b.id)).toEqual(["2031-01-05"]);
    await updateHost(env, a.id, { attributes: { team: "x" } } as never);
    await dueAgain(created.id);
    await sync(env, transport);
    // Back on the team: nobody chose to remove it, so it isn't a tombstone.
    expect(await datesOf(env, a.id)).toEqual(["2031-01-05"]);
  });

  test("a disabled host gets none", async () => {
    const env = await environment();
    const [a, b] = [await host(env, "A"), await host(env, "B")];
    await updateHost(env, b.id, { status: "disabled" });
    await calendar(env, [a.id, b.id]);
    await sync(env, feed(ics(day("2031-01-05", "One"))).transport);
    expect(await datesOf(env, a.id)).toEqual(["2031-01-05"]);
    expect(await datesOf(env, b.id)).toEqual([]);
  });

  test("an empty filter reaches nobody, though it would match everyone", async () => {
    const env = await environment();
    const a = await host(env, "A");
    const created = await calendar(env, [a.id]);
    await db
      .update(schema.schedulingHolidayCalendar)
      .set({ hostIds: null, hostFilter: {} })
      .where(eq(schema.schedulingHolidayCalendar.id, created.id));
    await sync(env, feed(ics(day("2031-01-05", "One"))).transport);
    expect(await datesOf(env, a.id)).toEqual([]);
  });

  test("changing who it's for applies at the next pass", async () => {
    const env = await environment();
    const [a, b] = [await host(env, "A"), await host(env, "B")];
    const created = await calendar(env, [a.id]);
    const { transport } = feed(ics(day("2031-01-05", "One")));
    await sync(env, transport);
    await updateHolidayCalendar(env, created.id, { hosts: [b.id] }, plain);
    await sync(env, transport);
    expect(await datesOf(env, a.id)).toEqual([]);
    expect(await datesOf(env, b.id)).toEqual(["2031-01-05"]);
  });

  test("delegates and what happens to bookings come from the calendar", async () => {
    const env = await environment();
    const [a, b] = [await host(env, "A"), await host(env, "B")];
    const type = await createEventType(env, {
      title: "Call",
      kind: "pool",
      duration_minutes: 30,
      hosts: [a, b].map((entry) => ({
        host: entry.id,
        role: "member",
        weight: 100,
        schedule: null,
      })),
    } as never);
    const { booking } = await createBooking(
      env,
      {
        eventType: type.id,
        startMs: Date.parse("2031-01-06T10:00:00Z"),
        host: a.id,
        attendee: { uid: "p", name: "Sam", email: "sam@example.com", time_zone: "UTC" },
      },
      plain,
      { kind: "system" },
    );
    await calendar(env, [a.id], { delegates: [b.id], existing_bookings: "reassign" });
    await sync(env, feed(ics(day("2031-01-06", "Day"))).transport);
    const [entry] = await entriesOf(env, a.id);
    expect(entry).toMatchObject({ delegates: [b.id], existing_bookings: "reassign" });
    const [run] = await db
      .select({ strategy: schema.schedulingReassignment.strategy })
      .from(schema.schedulingReassignment)
      .where(eq(schema.schedulingReassignment.outOfOfficeId, entry?.id as string));
    expect(run?.strategy).toMatchObject({ preferred_host_ids: [b.id] });
    expect(booking.id).toBeTruthy();
  });

  test("a host naming themselves as cover is just left out", async () => {
    const env = await environment();
    const [a, b] = [await host(env, "A"), await host(env, "B")];
    await calendar(env, [a.id, b.id], { delegates: [a.id, b.id] });
    await sync(env, feed(ics(day("2031-01-06", "Day"))).transport);
    const [entryA] = await entriesOf(env, a.id);
    expect(entryA?.delegates).toEqual([b.id]);
  });

  test("more than one pass can do carries on at the next", async () => {
    const env = await environment();
    const hosts = [];
    for (let index = 0; index < 11; index++) hosts.push(await host(env, `Host ${index}`));
    const created = await calendar(
      env,
      hosts.map((entry) => entry.id),
    );
    const dates = Array.from({ length: 20 }, (_, index) =>
      day(`2031-03-${String(index + 1).padStart(2, "0")}`, `Day ${index}`),
    );
    const { transport } = feed(ics(...dates));
    await runDueHolidayCalendars(
      { ...plain, transport },
      { scope: { organizationIds: [env.organizationId] } },
    );
    const count = async () =>
      (
        await db
          .select({ id: schema.schedulingOutOfOffice.id })
          .from(schema.schedulingOutOfOffice)
          .where(
            and(
              eq(schema.schedulingOutOfOffice.environmentId, env.environmentId),
              isNull(schema.schedulingOutOfOffice.deletedAt),
            ),
          )
      ).length;
    expect(await count()).toBe(200);
    expect(created.id).toBeTruthy();
    await sync(env, transport);
    expect(await count()).toBe(220);
  }, 60_000);

  test("removing a calendar takes its days back, then itself", async () => {
    const env = await environment();
    const a = await host(env, "A");
    const created = await calendar(env, [a.id]);
    const { transport } = feed(ics(day("2031-01-05", "One")));
    await sync(env, transport);
    await deleteHolidayCalendar(env, created.id, plain);
    await expect(getHolidayCalendar(env, created.id)).rejects.toMatchObject({ code: "not_found" });
    const [row] = await db
      .select({ stored: schema.schedulingHolidayCalendar.encryptedIcsUrl })
      .from(schema.schedulingHolidayCalendar)
      .where(eq(schema.schedulingHolidayCalendar.id, created.id));
    expect(row?.stored).toBeNull();
    await sync(env, transport);
    expect(await datesOf(env, a.id)).toEqual([]);
    const left = await db
      .select({ id: schema.schedulingHolidayCalendar.id })
      .from(schema.schedulingHolidayCalendar)
      .where(eq(schema.schedulingHolidayCalendar.id, created.id));
    expect(left).toEqual([]);
  });

  test("the feed's URL is re-encrypted with the ring", async () => {
    const env = await environment();
    const a = await host(env, "A");
    const created = await calendar(env, [a.id]);
    const next = secretsKeyRing([
      createHash("sha256").update("rotated").digest(),
      keys.primary.key,
    ]);
    const result = await reencryptWebhookSecrets({
      keys: next,
      scope: { organizationIds: [env.organizationId] },
    });
    expect(result.unreadable).toEqual([]);
    const [row] = await db
      .select({ stored: schema.schedulingHolidayCalendar.encryptedIcsUrl })
      .from(schema.schedulingHolidayCalendar)
      .where(eq(schema.schedulingHolidayCalendar.id, created.id));
    expect(row?.stored?.startsWith(`v2:${next.primary.id}:`)).toBe(true);
  });
});

describe("regional holidays", () => {
  const FEED = ics(
    day("2031-01-05", "Everywhere", "DESCRIPTION:Public holiday"),
    day("2031-01-06", "Scottish", "DESCRIPTION:Public holiday in Scotland"),
    day("2031-01-07", "English", "DESCRIPTION:Public holiday in England\\, Wales"),
  );

  test("all apply by default", async () => {
    const env = await environment();
    const a = await host(env, "A");
    await calendar(env, [a.id]);
    await sync(env, feed(FEED).transport);
    expect(await datesOf(env, a.id)).toEqual(["2031-01-05", "2031-01-06", "2031-01-07"]);
  });

  test("naming one keeps it, whatever its case, and everything nationwide", async () => {
    const env = await environment();
    const a = await host(env, "A");
    const created = await calendar(env, [a.id], { regions: ["england"] });
    await sync(env, feed(FEED).transport);
    expect(await datesOf(env, a.id)).toEqual(["2031-01-05", "2031-01-07"]);
    expect((await listHolidays(env, created.id, plain)).map((holiday) => holiday.name)).toEqual([
      "Everywhere",
      "English",
    ]);
  });

  test("an empty list keeps only nationwide ones", async () => {
    const env = await environment();
    const a = await host(env, "A");
    await calendar(env, [a.id], { regions: [] });
    await sync(env, feed(FEED).transport);
    expect(await datesOf(env, a.id)).toEqual(["2031-01-05"]);
  });

  test("changing it takes effect", async () => {
    const env = await environment();
    const a = await host(env, "A");
    const created = await calendar(env, [a.id]);
    const { transport } = feed(FEED);
    await sync(env, transport);
    await updateHolidayCalendar(env, created.id, { regions: ["Scotland"] }, plain);
    await sync(env, transport);
    expect(await datesOf(env, a.id)).toEqual(["2031-01-05", "2031-01-06"]);
  });
});

describe("a country", () => {
  const GOOGLE = "calendar.google.com/calendar/ical/en.uk.official";
  const uk = (env: SchedulingEnvironment, hostIds: string[]) =>
    createHolidayCalendar(env, { name: "UK", country: "GB", hosts: hostIds } as never, plain);
  const clearCountry = async () => {
    await db
      .delete(schema.schedulingPublicHoliday)
      .where(eq(schema.schedulingPublicHoliday.countryCode, "GB"));
    await db
      .delete(schema.schedulingPublicHolidaySource)
      .where(eq(schema.schedulingPublicHolidaySource.countryCode, "GB"));
  };

  test("reads Google's list once for everyone, and applies it", async () => {
    await clearCountry();
    const env = await environment();
    const a = await host(env, "A");
    await uk(env, [a.id]);
    const { state, transport } = feed(ics(day("2031-01-05", "New Year")));
    await sync(env, transport);
    expect(state.asked.some((url) => decodeURIComponent(url).includes(GOOGLE))).toBe(true);
    expect(await datesOf(env, a.id)).toEqual(["2031-01-05"]);
    const asked = state.asked.length;

    const other = await environment();
    const b = await host(other, "B");
    await uk(other, [b.id]);
    await sync(other, transport);
    expect(state.asked.length).toBe(asked);
    expect(await datesOf(other, b.id)).toEqual(["2031-01-05"]);
  });

  test("a failed or empty read keeps what's there", async () => {
    await clearCountry();
    const env = await environment();
    const a = await host(env, "A");
    const created = await uk(env, [a.id]);
    const { state, transport } = feed(ics(day("2031-01-05", "New Year")));
    await sync(env, transport);
    const refresh = () =>
      db
        .update(schema.schedulingPublicHolidaySource)
        .set({ nextReadAt: NOW })
        .where(eq(schema.schedulingPublicHolidaySource.countryCode, "GB"));
    for (const breakIt of [
      () => {
        state.fail = true;
      },
      () => {
        state.fail = false;
        state.body = ics();
      },
    ]) {
      breakIt();
      await refresh();
      await dueAgain(created.id);
      await sync(env, transport);
      expect(await datesOf(env, a.id)).toEqual(["2031-01-05"]);
    }
  });

  test("never read yet isn't 'no holidays'", async () => {
    await clearCountry();
    const env = await environment();
    const a = await host(env, "A");
    await uk(env, [a.id]);
    const { state, transport } = feed("");
    state.fail = true;
    await sync(env, transport);
    expect(await datesOf(env, a.id)).toEqual([]);
    await clearCountry();
  });

  test("a list that's gone missing takes nothing away", async () => {
    await clearCountry();
    const env = await environment();
    const a = await host(env, "A");
    const created = await uk(env, [a.id]);
    await sync(env, feed(ics(day("2031-01-05", "New Year"))).transport);
    await db
      .delete(schema.schedulingPublicHoliday)
      .where(eq(schema.schedulingPublicHoliday.countryCode, "GB"));
    await dueAgain(created.id);
    await sync(env, feed("").transport);
    expect(await datesOf(env, a.id)).toEqual(["2031-01-05"]);
    await clearCountry();
  });

  test("works in a sandbox, which reads no customer's URL", async () => {
    await clearCountry();
    const env = await environment("sandbox");
    const a = await host(env, "A");
    await uk(env, [a.id]);
    await sync(env, feed(ics(day("2031-01-05", "New Year"))).transport);
    expect(await datesOf(env, a.id)).toEqual(["2031-01-05"]);
    await clearCountry();
  });
});
