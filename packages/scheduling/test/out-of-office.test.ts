/** Time a host is away: what stops being offered, what doesn't change, and who's told what. */
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { LATEST_API_VERSION } from "@coss/versioning";
import { createWebhookEndpoint, secretsKeyRing } from "@coss/webhooks";
import { testManagementDeps } from "@coss/webhooks/testing";
import { and, eq, like } from "drizzle-orm";
import { type HostInputs, isBookable, listSlots, type SlotRule } from "../src/engine/slots.ts";
import {
  announceDueOutOfOffice,
  awayNoticeOf,
  type CalendarDeps,
  completeCalendarAuthorization,
  createBooking,
  createEventType,
  createHold,
  createHost,
  createOutOfOffice,
  createSchedule,
  deleteOutOfOffice,
  flagExternalConflicts,
  getBooking,
  getOutOfOffice,
  listEventTypeSlots,
  listOutOfOffice,
  listOutOfOfficeConflicts,
  purgeExpiredOutOfOffice,
  putOutOfOffice,
  redactExpiredOutOfOffice,
  reencryptSchedulingData,
  rescheduleBooking,
  runDueCalendarSyncs,
  runDueCalendarWrites,
  runDueSchedulingNotifications,
  type SchedulingEmail,
  type SchedulingEnvironment,
  startCalendarAuthorization,
  updateOutOfOffice,
  updateSettings,
} from "../src/index.ts";
import { FakeGoogleCalendarApi, testSchedulingDeps } from "../src/testing.ts";

const ms = Date.parse;
const MONDAY = "2031-01-06";
const at = (time: string, day = MONDAY) => ms(`${day}T${time}:00Z`);
const iso = (time: string, day = MONDAY) => new Date(at(time, day)).toISOString();
const NOW = new Date(at("00:00"));
const plain = testSchedulingDeps({ now: () => NOW });
const actor = { kind: "system" } as const;
const attendee = { uid: "p", name: "Sam Lee", email: "sam@example.com", time_zone: "UTC" };
const scope = (env: SchedulingEnvironment) => ({ organizationIds: [env.organizationId] });
const window = { fromMs: at("09:00"), toMs: at("17:00"), nowMs: NOW.getTime() };

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
  name = "Dr. Reyes",
  extra: { attributes?: Record<string, string>; email?: string } = {},
) {
  const created = await createHost(env, { name, time_zone: "UTC", ...extra });
  await createSchedule(env, created.id, {
    rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
  });
  return created;
}

const oneOnOne = (env: SchedulingEnvironment, hostId: string) =>
  createEventType(env, {
    title: "Call",
    kind: "one_on_one",
    duration_minutes: 30,
    hosts: [{ host: hostId, role: "member", weight: 100, schedule: null }],
  } as never);

const starts = async (env: SchedulingEnvironment, eventType: string) =>
  (await listEventTypeSlots(env, { eventTypeRef: eventType, ...window })).map(
    (slot) => slot.startMs,
  );

const away = (
  env: SchedulingEnvironment,
  params: Parameters<typeof createOutOfOffice>[1],
  who: Parameters<typeof createOutOfOffice>[3] = actor,
) => createOutOfOffice(env, params, plain, who, "api");

const announcedTypes = async (env: SchedulingEnvironment) =>
  (
    await db
      .select({ type: schema.logEntry.type })
      .from(schema.logEntry)
      .where(
        and(
          eq(schema.logEntry.environmentId, env.environmentId),
          like(schema.logEntry.type, "scheduling.out_of_office.%"),
        ),
      )
  ).map((row) => row.type);

describe("the engine", () => {
  const rule: SlotRule = {
    durationMinutes: 30,
    stepMinutes: 30,
    gridTimeZone: "UTC",
    bufferBeforeMinutes: 15,
    bufferAfterMinutes: 15,
    minNoticeMinutes: 0,
    bookingWindow: null,
    limits: [],
  };
  const inputs = (extra: Partial<HostInputs>): HostInputs => ({
    timeZone: "UTC",
    availability: [{ startMs: at("09:00"), endMs: at("17:00") }],
    externalBusy: [],
    claims: [],
    limitUsage: {},
    calendarVerified: true,
    ...extra,
  });
  const verdict = (time: string, host: HostInputs) =>
    isBookable(at(time), { nowMs: NOW.getTime(), rule, host });

  test("refuses a meeting that overlaps time away", () => {
    const host = inputs({ away: [{ startMs: at("12:00"), endMs: at("13:00") }] });
    expect(verdict("12:00", host)).toEqual({ ok: false, reason: "out_of_office" });
    expect(verdict("11:45", { ...host, away: host.away })).toEqual({
      ok: false,
      reason: "not_on_grid",
    });
    expect(verdict("11:30", host).ok).toBe(true);
    expect(verdict("13:00", host).ok).toBe(true);
  });

  test("buffers can run into time away, since it's the meeting that can't", () => {
    const host = inputs({ away: [{ startMs: at("12:00"), endMs: at("13:00") }] });
    // 11:30 to 12:00 has a 15 minute buffer that runs past 12:00.
    expect(verdict("11:30", host).ok).toBe(true);
  });

  test("says out of office rather than a calendar problem, which reconnecting wouldn't fix", () => {
    const host = inputs({
      away: [{ startMs: at("12:00"), endMs: at("13:00") }],
      calendarVerified: false,
    });
    expect(verdict("12:00", host)).toEqual({ ok: false, reason: "out_of_office" });
  });

  test("stops a session being joined", () => {
    const host = inputs({
      away: [{ startMs: at("12:00"), endMs: at("13:00") }],
      sessions: [
        {
          startMs: at("12:00"),
          occupied: { startMs: at("12:00"), endMs: at("12:30") },
          seatsLeft: 3,
        },
      ],
    });
    expect(verdict("12:00", host)).toEqual({ ok: false, reason: "out_of_office" });
  });

  test("lists around it", () => {
    const slots = listSlots({
      nowMs: NOW.getTime(),
      rule,
      host: inputs({ away: [{ startMs: at("09:30"), endMs: at("16:00") }] }),
      fromMs: at("09:00"),
      toMs: at("17:00"),
    });
    expect(slots).toEqual([at("09:00"), at("16:00"), at("16:30")]);
  });
});

describe("entries", () => {
  test("stop a host being offered, for part of a day", async () => {
    const env = await environment();
    const doctor = await host(env);
    const eventType = await oneOnOne(env, doctor.id);
    await away(env, { host: doctor.id, start: iso("12:00"), end: iso("13:00") });
    const offered = await starts(env, eventType.id);
    expect(offered).toContain(at("11:30"));
    expect(offered).not.toContain(at("12:00"));
    expect(offered).not.toContain(at("12:30"));
    expect(offered).toContain(at("13:00"));
    await expect(
      createBooking(env, { eventType: eventType.id, startMs: at("12:00"), attendee }, plain, actor),
    ).rejects.toMatchObject({ code: "slot_unavailable" });
  });

  test("whole dates mean whole local days, the last one included", async () => {
    const env = await environment();
    const doctor = await createHost(env, { name: "Dr. Reyes", time_zone: "America/New_York" });
    const [entry] = await away(env, {
      host: doctor.id,
      start_date: "2031-01-06",
      end_date: "2031-01-07",
    });
    expect(entry?.start).toBe("2031-01-06T05:00:00.000Z");
    expect(entry?.end).toBe("2031-01-08T05:00:00.000Z");
    expect(entry?.all_day).toEqual({
      start_date: "2031-01-06",
      end_date: "2031-01-07",
      time_zone: "America/New_York",
    });
  });

  test("whole dates can cross a clock change without losing an hour", async () => {
    const env = await environment();
    const doctor = await createHost(env, { name: "Dr. Reyes", time_zone: "America/New_York" });
    const [entry] = await away(env, {
      host: doctor.id,
      start_date: "2031-03-09",
      end_date: "2031-03-09",
    });
    // The second Sunday of March: that day has 23 hours in New York.
    expect(entry?.start).toBe("2031-03-09T05:00:00.000Z");
    expect(entry?.end).toBe("2031-03-10T04:00:00.000Z");
  });

  test("a zone can be given for the dates, and a date has to exist", async () => {
    const env = await environment();
    const doctor = await host(env);
    const [entry] = await away(env, {
      host: doctor.id,
      start_date: "2031-01-06",
      end_date: "2031-01-06",
      time_zone: "Asia/Tokyo",
    });
    expect(entry?.start).toBe("2031-01-05T15:00:00.000Z");
    await expect(
      away(env, { host: doctor.id, start_date: "2031-02-31", end_date: "2031-03-01" }),
    ).rejects.toMatchObject({ code: "invalid_time", param: "start_date" });
  });

  test("a window has to make sense", async () => {
    const env = await environment();
    const doctor = await host(env);
    const refused = (params: Partial<Parameters<typeof createOutOfOffice>[1]>) =>
      expect(away(env, { host: doctor.id, ...params })).rejects.toMatchObject({
        code: "invalid_time",
      });
    await refused({});
    await refused({ start: iso("13:00"), end: iso("12:00") });
    await refused({ start: iso("12:00") });
    await refused({ start: iso("12:00"), end: iso("13:00"), start_date: "2031-01-06" });
    await refused({ start_date: "2031-01-07", end_date: "2031-01-06" });
    await refused({ start_date: "2031-01-01", end_date: "2035-01-01" });
  });

  test("overlapping entries both count, and removing one leaves the other", async () => {
    const env = await environment();
    const doctor = await host(env);
    const eventType = await oneOnOne(env, doctor.id);
    const [first] = await away(env, { host: doctor.id, start: iso("12:00"), end: iso("14:00") });
    await away(env, { host: doctor.id, start: iso("13:00"), end: iso("15:00") });
    await deleteOutOfOffice(env, first?.id as string, plain);
    const offered = await starts(env, eventType.id);
    expect(offered).toContain(at("12:00"));
    expect(offered).not.toContain(at("13:00"));
    expect(offered).not.toContain(at("14:30"));
  });

  test("once deleted, the time can be booked and the entry's gone from reads", async () => {
    const env = await environment();
    const doctor = await host(env);
    const eventType = await oneOnOne(env, doctor.id);
    const [entry] = await away(env, { host: doctor.id, start: iso("12:00"), end: iso("13:00") });
    await deleteOutOfOffice(env, entry?.id as string, plain);
    expect(await starts(env, eventType.id)).toContain(at("12:00"));
    await expect(getOutOfOffice(env, entry?.id as string, plain)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(deleteOutOfOffice(env, entry?.id as string, plain)).rejects.toMatchObject({
      code: "not_found",
    });
    expect((await listOutOfOffice(env, { limit: 10 }, plain)).data).toEqual([]);
  });

  test("moving an entry moves what's blocked, and half a window keeps the other half", async () => {
    const env = await environment();
    const doctor = await host(env);
    const eventType = await oneOnOne(env, doctor.id);
    const [entry] = await away(env, { host: doctor.id, start: iso("12:00"), end: iso("13:00") });
    const moved = await updateOutOfOffice(
      env,
      entry?.id as string,
      { end: iso("15:00") },
      plain,
      actor,
    );
    expect(moved.start).toBe(iso("12:00"));
    expect(moved.end).toBe(iso("15:00"));
    expect(await starts(env, eventType.id)).not.toContain(at("14:00"));
  });

  test("an entry in another environment or organization can't be reached", async () => {
    const env = await environment();
    const other = await environment();
    const doctor = await host(env);
    const [entry] = await away(env, { host: doctor.id, start: iso("12:00"), end: iso("13:00") });
    await expect(getOutOfOffice(other, entry?.id as string, plain)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      updateOutOfOffice(other, entry?.id as string, { notes: "x" }, plain, actor),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(deleteOutOfOffice(other, entry?.id as string, plain)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      away(other, { host: doctor.id, start_date: "2031-01-06", end_date: "2031-01-06" }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  test("a host session reaches only its own entries", async () => {
    const env = await environment();
    const doctor = await host(env);
    const colleague = await host(env, "Dr. Chen");
    const [entry] = await away(env, { host: doctor.id, start: iso("12:00"), end: iso("13:00") });
    const only = { hostId: colleague.id };
    await expect(getOutOfOffice(env, entry?.id as string, plain, only)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      updateOutOfOffice(env, entry?.id as string, { notes: "x" }, plain, actor, only),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(deleteOutOfOffice(env, entry?.id as string, plain, only)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      listOutOfOfficeConflicts(env, entry?.id as string, { limit: 10 }, plain, only),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("many hosts at once", () => {
  test("a list gets one entry each, sharing a group", async () => {
    const env = await environment();
    const [one, two] = [await host(env, "One"), await host(env, "Two")];
    const entries = await away(env, {
      hosts: [one.id, two.id, one.id],
      start_date: "2031-01-06",
      end_date: "2031-01-06",
    });
    expect(entries.map((entry) => entry.host).sort()).toEqual([one.id, two.id].sort());
    expect(entries[0]?.group).toMatch(/^ooogrp_/);
    expect(entries[0]?.group).toBe(entries[1]?.group as string);
    const listed = await listOutOfOffice(
      env,
      { group: entries[0]?.group as string, limit: 10 },
      plain,
    );
    expect(listed.data.length).toBe(2);
  });

  test("a filter reaches who matches now, and only active hosts", async () => {
    const env = await environment();
    const berlin = await host(env, "Berlin", { attributes: { office: "berlin" } });
    await host(env, "Paris", { attributes: { office: "paris" } });
    const gone = await host(env, "Gone", { attributes: { office: "berlin" } });
    await db
      .update(schema.schedulingHost)
      .set({ status: "disabled" })
      .where(eq(schema.schedulingHost.id, gone.id));
    const entries = await away(env, {
      host_filter: { office: "berlin" },
      start_date: "2031-01-06",
      end_date: "2031-01-06",
    });
    expect(entries.map((entry) => entry.host)).toEqual([berlin.id]);
  });

  test("an empty filter means nobody, not everybody", async () => {
    const env = await environment();
    await host(env);
    await expect(
      away(env, { host_filter: {}, start_date: "2031-01-06", end_date: "2031-01-06" }),
    ).rejects.toMatchObject({ code: "invalid_out_of_office", param: "host_filter" });
  });

  test("exactly one way of naming hosts", async () => {
    const env = await environment();
    const doctor = await host(env);
    for (const hosts of [
      {},
      { host: doctor.id, hosts: [doctor.id] },
      { host: doctor.id, host_filter: { a: "b" } },
    ]) {
      await expect(
        away(env, { ...hosts, start_date: "2031-01-06", end_date: "2031-01-06" }),
      ).rejects.toMatchObject({ code: "invalid_out_of_office" });
    }
  });

  test("an external id names one entry", async () => {
    const env = await environment();
    const [one, two] = [await host(env, "One"), await host(env, "Two")];
    await expect(
      away(env, {
        hosts: [one.id, two.id],
        external_id: "leave_1",
        start_date: "2031-01-06",
        end_date: "2031-01-06",
      }),
    ).rejects.toMatchObject({ code: "invalid_out_of_office", param: "external_id" });
  });

  test("one host's bad data leaves nobody with an entry", async () => {
    const env = await environment();
    const one = await host(env, "One");
    await expect(
      away(env, {
        hosts: [one.id, "host_nobody"],
        start_date: "2031-01-06",
        end_date: "2031-01-06",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect((await listOutOfOffice(env, { limit: 10 }, plain)).data).toEqual([]);
  });
});

describe("syncing from a system of record", () => {
  test("the same id sent twice at once leaves one entry, and neither fails", async () => {
    const env = await environment();
    const doctor = await host(env);
    const params = { host: doctor.id, start_date: "2031-01-06", end_date: "2031-01-07" };
    const answers = await Promise.all([
      putOutOfOffice(env, "leave_race", params, plain, actor),
      putOutOfOffice(env, "leave_race", params, plain, actor),
    ]);
    expect(answers.map((answer) => answer.created).sort()).toEqual([false, true]);
    expect(answers[0]?.entry.id).toBe(answers[1]?.entry.id as string);
  });

  test("sending the same id twice leaves one entry, with the latest of what it says", async () => {
    const env = await environment();
    const doctor = await host(env);
    const params = { host: doctor.id, start_date: "2031-01-06", end_date: "2031-01-07" };
    const first = await putOutOfOffice(env, "leave_1", params, plain, actor);
    expect(first.created).toBe(true);
    const second = await putOutOfOffice(
      env,
      "leave_1",
      { ...params, end_date: "2031-01-09", reason: "sick" },
      plain,
      actor,
    );
    expect(second.created).toBe(false);
    expect(second.entry.id).toBe(first.entry.id);
    expect(second.entry.reason).toBe("sick");
    expect(second.entry.all_day?.end_date).toBe("2031-01-09");
    expect((await listOutOfOffice(env, { limit: 10 }, plain)).data.length).toBe(1);
  });

  test("an id can be used again once its entry's deleted", async () => {
    const env = await environment();
    const doctor = await host(env);
    const params = { host: doctor.id, start_date: "2031-01-06", end_date: "2031-01-07" };
    const first = await putOutOfOffice(env, "leave_1", params, plain, actor);
    await deleteOutOfOffice(env, first.entry.id, plain);
    const second = await putOutOfOffice(env, "leave_1", params, plain, actor);
    expect(second.created).toBe(true);
    expect(second.entry.id).not.toBe(first.entry.id);
  });

  test("two environments can use the same id, but one can't use it twice", async () => {
    const env = await environment();
    const other = await environment();
    const [one, elsewhere] = [await host(env), await host(other)];
    const when = { start_date: "2031-01-06", end_date: "2031-01-07" };
    await putOutOfOffice(env, "leave_1", { host: one.id, ...when }, plain, actor);
    await putOutOfOffice(other, "leave_1", { host: elsewhere.id, ...when }, plain, actor);
    await expect(
      away(env, { host: one.id, external_id: "leave_1", ...when }),
    ).rejects.toMatchObject({ code: "invalid_out_of_office", param: "external_id" });
  });
});

describe("reasons and what they can reveal", () => {
  test("only known reasons, including an environment's own", async () => {
    const env = await environment();
    const doctor = await host(env);
    const when = { host: doctor.id, start_date: "2031-01-06", end_date: "2031-01-06" };
    await expect(away(env, { ...when, reason: "sabbatical" })).rejects.toMatchObject({
      code: "invalid_out_of_office",
      param: "reason",
    });
    await updateSettings(env, {
      out_of_office_reasons: [{ key: "sabbatical", label: "Sabbatical" }],
    });
    const [entry] = await away(env, { ...when, reason: "sabbatical" });
    expect(entry?.reason).toBe("sabbatical");
  });

  test("a reason's label and a public message can't hold a link", async () => {
    const env = await environment();
    const doctor = await host(env);
    await expect(
      updateSettings(env, {
        out_of_office_reasons: [{ key: "x", label: "See https://phish.example" }],
      }),
    ).rejects.toMatchObject({ code: "content_refused" });
    await expect(
      away(env, {
        host: doctor.id,
        start_date: "2031-01-06",
        end_date: "2031-01-06",
        public_message: "Book at evil.com instead",
      }),
    ).rejects.toMatchObject({ code: "content_refused", param: "public_message" });
  });

  test("a public message is screened, in a live environment", async () => {
    const env = await environment();
    const doctor = await host(env);
    const refusing = testSchedulingDeps({ now: () => NOW, screenSetup: async () => false });
    await expect(
      createOutOfOffice(
        env,
        {
          host: doctor.id,
          start_date: "2031-01-06",
          end_date: "2031-01-06",
          public_message: "Send me your password",
        },
        refusing,
        actor,
        "api",
      ),
    ).rejects.toMatchObject({ code: "content_refused" });
  });

  test("notes are encrypted, and read back only for whoever can see the entry", async () => {
    const env = await environment();
    const doctor = await host(env);
    const [entry] = await away(env, {
      host: doctor.id,
      start_date: "2031-01-06",
      end_date: "2031-01-06",
      notes: "Recovering from surgery",
    });
    expect(entry?.notes).toBe("Recovering from surgery");
    const [row] = await db
      .select()
      .from(schema.schedulingOutOfOffice)
      .where(eq(schema.schedulingOutOfOffice.id, entry?.id as string));
    expect(row?.encryptedNotes).not.toContain("surgery");
  });

  test("webhooks and logs say when, never why", async () => {
    const env = await environment();
    const doctor = await host(env);
    await createWebhookEndpoint(
      {
        organizationId: env.organizationId,
        environmentId: env.environmentId,
        url: "https://hooks.example.com/coss",
        eventTypes: ["scheduling.out_of_office.created"],
        apiVersion: LATEST_API_VERSION,
        userId: null,
      },
      testManagementDeps,
    );
    const [entry] = await away(env, {
      host: doctor.id,
      start_date: "2031-01-06",
      end_date: "2031-01-06",
      reason: "sick",
      notes: "Recovering from surgery",
      public_message: "Back soon",
    });
    const messages = await db
      .select()
      .from(schema.webhookMessage)
      .where(eq(schema.webhookMessage.organizationId, env.organizationId));
    const logs = await db
      .select()
      .from(schema.logEntry)
      .where(eq(schema.logEntry.organizationId, env.organizationId));
    expect(messages.length).toBeGreaterThan(0);
    expect(logs.some((line) => line.resourceId === entry?.id)).toBe(true);
    const everything = JSON.stringify([messages, logs]);
    for (const secret of ["sick", "surgery", "Back soon"]) {
      expect(everything).not.toContain(secret);
    }
  });

  test("someone booking is never told a host is out of office by an error", async () => {
    const env = await environment();
    const doctor = await host(env);
    const eventType = await oneOnOne(env, doctor.id);
    await away(env, { host: doctor.id, start: iso("12:00"), end: iso("13:00") });
    const error = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("12:00"), attendee },
      plain,
      actor,
    ).catch((caught: Error) => caught);
    expect((error as Error).message).not.toContain("out_of_office");
    expect((error as Error).message).not.toMatch(/office|away/i);
  });
});

describe("existing bookings", () => {
  test("stay as they are, and are listed as conflicts", async () => {
    const env = await environment();
    const doctor = await host(env);
    const eventType = await oneOnOne(env, doctor.id);
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("12:00"), attendee },
      plain,
      actor,
    );
    const [entry] = await away(env, { host: doctor.id, start: iso("09:00"), end: iso("17:00") });
    const after = await getBooking(env, booking.id, plain);
    expect(after.status).toBe("confirmed");
    expect(after.hosts).toEqual([doctor.id]);
    const conflicts = await listOutOfOfficeConflicts(
      env,
      entry?.id as string,
      { limit: 10 },
      plain,
    );
    expect(conflicts.data.map((conflict) => conflict.booking)).toEqual([booking.id]);
    expect(JSON.stringify(conflicts.data)).not.toContain("sam@example.com");
    expect(JSON.stringify(conflicts.data)).not.toContain("Sam Lee");
  });

  test("a request whose time to approve has run out isn't in the way", async () => {
    const env = await environment();
    const doctor = await host(env);
    const eventType = await createEventType(env, {
      title: "Call",
      kind: "one_on_one",
      duration_minutes: 30,
      hosts: [{ host: doctor.id, role: "member", weight: 100, schedule: null }],
      requires_approval: true,
    } as never);
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("12:00"), attendee },
      plain,
      actor,
    );
    const [entry] = await away(env, { host: doctor.id, start: iso("09:00"), end: iso("17:00") });
    const conflicts = () =>
      listOutOfOfficeConflicts(env, entry?.id as string, { limit: 10 }, plain);
    // Its deadline comes from the database's clock, and this test's is fixed.
    const deadline = (at: Date) =>
      db
        .update(schema.schedulingBooking)
        .set({ approvalExpiresAt: at })
        .where(eq(schema.schedulingBooking.id, booking.id));
    await deadline(new Date(NOW.getTime() + 60_000));
    expect((await conflicts()).data.map((conflict) => conflict.booking)).toEqual([booking.id]);
    await deadline(new Date(NOW.getTime() - 1000));
    expect((await conflicts()).data).toEqual([]);
  });

  test("a hold counts while it lasts, and a booking outside the entry never does", async () => {
    const env = await environment();
    const doctor = await host(env);
    const eventType = await oneOnOne(env, doctor.id);
    const { booking: hold } = await createHold(
      env,
      { eventType: eventType.id, startMs: at("12:00"), attendee },
      plain,
      actor,
    );
    await createBooking(
      env,
      { eventType: eventType.id, startMs: at("15:00"), attendee },
      plain,
      actor,
    );
    const [entry] = await away(env, { host: doctor.id, start: iso("11:00"), end: iso("13:00") });
    // A hold's expiry comes from the database's clock, so "while it lasts" means the real one.
    const conflicts = await listOutOfOfficeConflicts(
      env,
      entry?.id as string,
      { limit: 10 },
      testSchedulingDeps(),
    );
    expect(conflicts.data.map((conflict) => conflict.booking)).toEqual([hold.id]);
    // And `plain`'s clock is years past that expiry.
    const expired = await listOutOfOfficeConflicts(env, entry?.id as string, { limit: 10 }, plain);
    expect(expired.data).toEqual([]);
  });

  test("a booking can't be moved into someone's time away", async () => {
    const env = await environment();
    const doctor = await host(env);
    const eventType = await oneOnOne(env, doctor.id);
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee },
      plain,
      actor,
    );
    await away(env, { host: doctor.id, start: iso("12:00"), end: iso("13:00") });
    await expect(
      rescheduleBooking(env, booking.id, { startMs: at("12:00") }, plain, actor),
    ).rejects.toMatchObject({ code: "slot_unavailable" });
  });

  test("the race: a booking and an entry for the same time never both go unnoticed", async () => {
    const env = await environment();
    const doctor = await host(env);
    const eventType = await oneOnOne(env, doctor.id);
    for (let round = 0; round < 10; round++) {
      const hour = String(9 + (round % 8)).padStart(2, "0");
      const day = `2031-01-${String(10 + round).padStart(2, "0")}`;
      const [booked, entries] = await Promise.allSettled([
        createBooking(
          env,
          { eventType: eventType.id, startMs: at(`${hour}:00`, day), attendee },
          plain,
          actor,
        ),
        away(env, {
          host: doctor.id,
          start: iso(`${hour}:00`, day),
          end: iso(`${hour}:30`, day),
        }),
      ]);
      expect(entries.status).toBe("fulfilled");
      const entry = entries.status === "fulfilled" ? entries.value[0] : undefined;
      const conflicts = await listOutOfOfficeConflicts(
        env,
        entry?.id as string,
        { limit: 10 },
        plain,
      );
      // Either the booking lost, or it won and the entry can see it.
      expect(conflicts.data.length).toBe(booked.status === "fulfilled" ? 1 : 0);
    }
  });
});

describe("group sessions", () => {
  test("a running session can't be joined once its host is away", async () => {
    const env = await environment();
    const doctor = await host(env);
    const group = await createEventType(env, {
      title: "Class",
      kind: "group",
      duration_minutes: 30,
      capacity: 5,
      hosts: [{ host: doctor.id, role: "member", weight: 100, schedule: null }],
    } as never);
    await createBooking(env, { eventType: group.id, startMs: at("12:00"), attendee }, plain, actor);
    await away(env, { host: doctor.id, start: iso("12:00"), end: iso("13:00") });
    expect(await starts(env, group.id)).not.toContain(at("12:00"));
    await expect(
      createBooking(
        env,
        { eventType: group.id, startMs: at("12:00"), attendee: { ...attendee, uid: "q" } },
        plain,
        actor,
      ),
    ).rejects.toMatchObject({ code: "slot_unavailable" });
  });
});

describe("pools", () => {
  test("someone away is passed over, and the booking goes to someone else", async () => {
    const env = await environment();
    const [out, here] = [await host(env, "Out"), await host(env, "Here")];
    const pool = await createEventType(env, {
      title: "Pool",
      kind: "pool",
      duration_minutes: 30,
      hosts: [out, here].map((entry) => ({
        host: entry.id,
        role: "member",
        weight: 100,
        schedule: null,
      })),
    } as never);
    await away(env, { host: out.id, start: iso("09:00"), end: iso("17:00") });
    const { booking } = await createBooking(
      env,
      { eventType: pool.id, startMs: at("12:00"), attendee },
      plain,
      actor,
    );
    expect(booking.hosts).toEqual([here.id]);
  });

  test("a required host being away takes the slot with them", async () => {
    const env = await environment();
    const [required, member] = [await host(env, "Required"), await host(env, "Member")];
    const pool = await createEventType(env, {
      title: "Pool",
      kind: "pool",
      duration_minutes: 30,
      hosts: [
        { host: required.id, role: "required", weight: 100, schedule: null },
        { host: member.id, role: "member", weight: 100, schedule: null },
      ],
    } as never);
    await away(env, { host: required.id, start: iso("12:00"), end: iso("13:00") });
    expect(await starts(env, pool.id)).not.toContain(at("12:00"));
  });
});

describe("telling bookers", () => {
  test("says when they're back and what they left, never why", async () => {
    const env = await environment();
    const doctor = await host(env);
    const later = new Date(at("12:30"));
    await away(env, {
      host: doctor.id,
      start: iso("12:00"),
      end: iso("13:00"),
      reason: "sick",
      public_message: "Back after lunch",
    });
    expect(await awayNoticeOf(env, doctor.id, NOW)).toBeNull();
    expect(await awayNoticeOf(env, doctor.id, later)).toEqual({
      until: iso("13:00"),
      message: "Back after lunch",
      covered: false,
    });
  });

  test("entries that run into each other are one absence", async () => {
    const env = await environment();
    const doctor = await host(env);
    await away(env, { host: doctor.id, start: iso("12:00"), end: iso("13:00") });
    await away(env, { host: doctor.id, start: iso("13:00"), end: iso("14:00") });
    await away(env, { host: doctor.id, start: iso("16:00"), end: iso("17:00") });
    expect((await awayNoticeOf(env, doctor.id, new Date(at("12:30"))))?.until).toBe(iso("14:00"));
  });
});

describe("telling customers when it happens", () => {
  test("says started and ended once each", async () => {
    const env = await environment();
    const doctor = await host(env);
    await away(env, { host: doctor.id, start: iso("12:00"), end: iso("13:00") });
    const run = (time: string) =>
      announceDueOutOfOffice({ now: () => new Date(at(time)) }, { scope: scope(env) });
    expect(await run("11:00")).toBe(0);
    expect(await run("12:00")).toBe(1);
    expect(await run("12:30")).toBe(0);
    expect(await run("13:00")).toBe(1);
    expect(await run("14:00")).toBe(0);
    expect((await announcedTypes(env)).sort()).toEqual([
      "scheduling.out_of_office.created",
      "scheduling.out_of_office.ended",
      "scheduling.out_of_office.started",
    ]);
  });

  test("says nothing about an entry that's already over when it's made", async () => {
    const env = await environment();
    const doctor = await host(env);
    await createOutOfOffice(
      env,
      { host: doctor.id, start: iso("01:00"), end: iso("02:00") },
      testSchedulingDeps({ now: () => new Date(at("10:00")) }),
      actor,
      "api",
    );
    expect(
      await announceDueOutOfOffice({ now: () => new Date(at("10:00")) }, { scope: scope(env) }),
    ).toBe(0);
  });

  test("an entry moved into the future will start again", async () => {
    const env = await environment();
    const doctor = await host(env);
    const [entry] = await away(env, { host: doctor.id, start: iso("12:00"), end: iso("14:00") });
    const noon = () => new Date(at("12:00"));
    await announceDueOutOfOffice({ now: noon }, { scope: scope(env) });
    await updateOutOfOffice(
      env,
      entry?.id as string,
      { start: iso("15:00"), end: iso("16:00") },
      testSchedulingDeps({ now: noon }),
      actor,
    );
    expect(
      await announceDueOutOfOffice({ now: () => new Date(at("15:00")) }, { scope: scope(env) }),
    ).toBe(1);
  });
});

describe("the host's email about conflicts", () => {
  const sender = () => {
    const sent: SchedulingEmail[] = [];
    return {
      sent,
      deps: {
        now: () => NOW,
        publicUrl: "https://book.example.test",
        notifier: {
          email: async (message: SchedulingEmail) => {
            sent.push(message);
          },
        },
      },
    };
  };

  async function conflicted(env: SchedulingEnvironment) {
    const doctor = await host(env, "Dr. Reyes", { email: "doctor@example.com" });
    const eventType = await oneOnOne(env, doctor.id);
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("12:00"), attendee },
      plain,
      actor,
    );
    return { doctor, booking };
  }

  const toHost = (sent: SchedulingEmail[]) =>
    sent.filter(
      (message) =>
        message.to === "doctor@example.com" && message.subject.includes("during your time off"),
    );

  test("goes when an entry lands on a booking, naming only a count", async () => {
    const env = await environment();
    const { doctor } = await conflicted(env);
    await away(env, {
      host: doctor.id,
      start: iso("09:00"),
      end: iso("17:00"),
      reason: "sick",
      notes: "Recovering from surgery",
    });
    const { sent, deps } = sender();
    await runDueSchedulingNotifications(deps as never, { scope: scope(env) });
    const [message] = toHost(sent);
    expect(message?.text).toContain("Bookings in your time off: 1");
    for (const secret of ["sick", "surgery", "Sam Lee", "sam@example.com"]) {
      expect(message?.text).not.toContain(secret);
      expect(message?.html).not.toContain(secret);
    }
  });

  test("doesn't go when the host did this themselves, on the page that shows it", async () => {
    const env = await environment();
    const { doctor } = await conflicted(env);
    await away(
      env,
      { host: doctor.id, start: iso("09:00"), end: iso("17:00") },
      { kind: "host_session", id: "schs_1" },
    );
    const { sent, deps } = sender();
    await runDueSchedulingNotifications(deps as never, { scope: scope(env) });
    expect(toHost(sent)).toEqual([]);
  });

  test("doesn't go with no bookings in the way", async () => {
    const env = await environment();
    const doctor = await host(env, "Dr. Reyes", { email: "doctor@example.com" });
    await away(env, { host: doctor.id, start: iso("09:00"), end: iso("17:00") });
    const { sent, deps } = sender();
    await runDueSchedulingNotifications(deps as never, { scope: scope(env) });
    expect(toHost(sent)).toEqual([]);
  });

  test("doesn't go if the conflict's gone by the time it's due", async () => {
    const env = await environment();
    const { doctor, booking } = await conflicted(env);
    await away(env, { host: doctor.id, start: iso("12:00"), end: iso("13:00") });
    await rescheduleBooking(env, booking.id, { startMs: at("15:00") }, plain, actor);
    const { sent, deps } = sender();
    await runDueSchedulingNotifications(deps as never, { scope: scope(env) });
    expect(toHost(sent)).toEqual([]);
  });
});

describe("the host's calendar", () => {
  function calendarDeps(
    api: FakeGoogleCalendarApi,
  ): CalendarDeps & { dataKeys: typeof plain.dataKeys } {
    return {
      dataKeys: plain.dataKeys,
      secretsKeys: secretsKeyRing([createHash("sha256").update("out of office").digest()]),
      apps: {
        google: { clientId: "google-client", clientSecret: "google-secret" },
        microsoft: null,
      },
      publicUrl: "https://api.example.test",
      fetcher: api.fetch,
      now: () => NOW,
    };
  }

  async function connected() {
    const env = await environment();
    const doctor = await host(env);
    const api = new FakeGoogleCalendarApi();
    const deps = calendarDeps(api);
    const { url } = await startCalendarAuthorization(
      env,
      doctor.id,
      { provider: "google", returnUrl: null },
      deps,
    );
    await completeCalendarAuthorization(
      {
        provider: "google",
        state: new URL(url).searchParams.get("state") as string,
        code: "code",
        error: null,
      },
      deps,
    );
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    return { env, doctor, api, deps };
  }

  const live = (api: FakeGoogleCalendarApi) =>
    [...api.events.values()].filter((event) => !event.deleted);

  test("gets a private block that never says why, and it goes when the entry does", async () => {
    const { env, doctor, api, deps } = await connected();
    const [entry] = await away(env, {
      host: doctor.id,
      start: iso("12:00"),
      end: iso("13:00"),
      reason: "sick",
      notes: "Recovering from surgery",
    });
    await runDueCalendarWrites(deps, { scope: scope(env) });
    expect(live(api).map((event) => event.title)).toEqual(["Out of office"]);
    expect(live(api)[0]?.startMs).toBe(at("12:00"));

    await updateOutOfOffice(env, entry?.id as string, { end: iso("14:00") }, plain, actor);
    await runDueCalendarWrites(deps, { scope: scope(env) });
    expect(live(api)[0]?.endMs).toBe(at("14:00"));

    await deleteOutOfOffice(env, entry?.id as string, plain);
    await runDueCalendarWrites(deps, { scope: scope(env) });
    expect(live(api)).toEqual([]);
  });

  test("a block on a calendar that's stopped being written to goes", async () => {
    const { env, doctor, deps } = await connected();
    const [entry] = await away(env, { host: doctor.id, start: iso("12:00"), end: iso("13:00") });
    await runDueCalendarWrites(deps, { scope: scope(env) });
    const [old] = await db
      .select({
        id: schema.schedulingCalendar.id,
        connectionId: schema.schedulingCalendar.connectionId,
      })
      .from(schema.schedulingCalendar)
      .where(
        and(
          eq(schema.schedulingCalendar.hostId, doctor.id),
          eq(schema.schedulingCalendar.writeTarget, true),
        ),
      );
    // Only one can be the write target.
    await db
      .update(schema.schedulingCalendar)
      .set({ writeTarget: false })
      .where(eq(schema.schedulingCalendar.id, old?.id as string));
    const [other] = await db
      .insert(schema.schedulingCalendar)
      .values({
        organizationId: env.organizationId,
        environmentId: env.environmentId,
        hostId: doctor.id,
        connectionId: old?.connectionId as string,
        externalId: "second-calendar",
        name: "Second",
        writeTarget: true,
      } as never)
      .returning({ id: schema.schedulingCalendar.id });
    await updateOutOfOffice(env, entry?.id as string, { end: iso("14:00") }, plain, actor);
    const rows = await db
      .select({
        calendarId: schema.schedulingCalendarEvent.calendarId,
        state: schema.schedulingCalendarEvent.desiredState,
      })
      .from(schema.schedulingCalendarEvent)
      .where(eq(schema.schedulingCalendarEvent.outOfOfficeId, entry?.id as string));
    expect(Object.fromEntries(rows.map((row) => [row.calendarId, row.state]))).toEqual({
      [old?.id as string]: "absent",
      [other?.id as string]: "present",
    });
  });

  test("can be left alone", async () => {
    const { env, doctor, api, deps } = await connected();
    const [entry] = await away(env, {
      host: doctor.id,
      start: iso("12:00"),
      end: iso("13:00"),
      show_on_calendar: false,
    });
    await runDueCalendarWrites(deps, { scope: scope(env) });
    expect(live(api)).toEqual([]);
    await updateOutOfOffice(env, entry?.id as string, { show_on_calendar: true }, plain, actor);
    await runDueCalendarWrites(deps, { scope: scope(env) });
    expect(live(api).length).toBe(1);
    await updateOutOfOffice(env, entry?.id as string, { show_on_calendar: false }, plain, actor);
    await runDueCalendarWrites(deps, { scope: scope(env) });
    expect(live(api)).toEqual([]);
  });

  test("turning it back on makes a new event rather than reusing a deleted key", async () => {
    const { env, doctor, api, deps } = await connected();
    const [entry] = await away(env, { host: doctor.id, start: iso("12:00"), end: iso("13:00") });
    await runDueCalendarWrites(deps, { scope: scope(env) });
    await updateOutOfOffice(env, entry?.id as string, { show_on_calendar: false }, plain, actor);
    await runDueCalendarWrites(deps, { scope: scope(env) });
    api.requests.length = 0;
    await updateOutOfOffice(env, entry?.id as string, { show_on_calendar: true }, plain, actor);
    await runDueCalendarWrites(deps, { scope: scope(env) });
    expect(api.requests.filter((request) => request.startsWith("PUT"))).toEqual([]);
    expect(live(api).length).toBe(1);
  });

  test("its own block isn't a conflict with a booking that's already there", async () => {
    const { env, doctor, api, deps } = await connected();
    const eventType = await oneOnOne(env, doctor.id);
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: at("12:00"), attendee },
      plain,
      actor,
    );
    await away(env, { host: doctor.id, start: iso("09:00"), end: iso("17:00") });
    await runDueCalendarWrites(deps, { scope: scope(env) });
    await runDueCalendarSyncs(
      { ...deps, now: () => new Date(NOW.getTime() + 3_600_000) },
      { scope: scope(env) },
    );
    await flagExternalConflicts(doctor.id, env.organizationId, NOW);
    expect((await getBooking(env, booking.id, plain)).external_conflict_at).toBeNull();
    expect(live(api).length).toBe(2);
  });

  test("deleting an entry keeps its row until the calendar event has gone", async () => {
    const { env, doctor, deps, api } = await connected();
    const [entry] = await away(env, { host: doctor.id, start: iso("12:00"), end: iso("13:00") });
    await runDueCalendarWrites(deps, { scope: scope(env) });
    await deleteOutOfOffice(env, entry?.id as string, plain);
    const [row] = await db
      .select()
      .from(schema.schedulingOutOfOffice)
      .where(eq(schema.schedulingOutOfOffice.id, entry?.id as string));
    expect(row?.deletedAt).not.toBeNull();
    await runDueCalendarWrites(deps, { scope: scope(env) });
    expect(live(api)).toEqual([]);
  });
});

describe("how long it's kept", () => {
  const DAY = 86_400_000;
  const rowOf = async (id: string) => {
    const [row] = await db
      .select()
      .from(schema.schedulingOutOfOffice)
      .where(eq(schema.schedulingOutOfOffice.id, id));
    return row;
  };
  const after = (days: number) => new Date(at("13:00") + days * DAY);

  async function entryWithNotes() {
    const env = await environment();
    const doctor = await host(env);
    const [entry] = await away(env, {
      host: doctor.id,
      start: iso("12:00"),
      end: iso("13:00"),
      notes: "Recovering from surgery",
      public_message: "Back soon",
    });
    return { env, id: entry?.id as string };
  }

  test("notes and messages go first, and the fact of it later", async () => {
    const { env, id } = await entryWithNotes();
    await redactExpiredOutOfOffice({ now: after(89), scope: scope(env) });
    expect((await rowOf(id))?.encryptedNotes).not.toBeNull();
    await redactExpiredOutOfOffice({ now: after(91), scope: scope(env) });
    const redacted = await rowOf(id);
    expect(redacted?.encryptedNotes).toBeNull();
    expect(redacted?.publicMessage).toBeNull();
    await purgeExpiredOutOfOffice({ now: after(394), scope: scope(env) });
    expect(await rowOf(id)).toBeDefined();
    await purgeExpiredOutOfOffice({ now: after(396), scope: scope(env) });
    expect(await rowOf(id)).toBeUndefined();
  });

  test("deleting one takes what was written about it at once", async () => {
    const { env, id } = await entryWithNotes();
    await deleteOutOfOffice(env, id, plain);
    const deleted = await rowOf(id);
    expect(deleted?.encryptedNotes).toBeNull();
    expect(deleted?.publicMessage).toBeNull();
  });

  test("a deleted entry goes within a month, unless it's a holiday's tombstone", async () => {
    const { env, id } = await entryWithNotes();
    const tombstone = await entryWithNotes();
    await deleteOutOfOffice(env, id, plain);
    await deleteOutOfOffice(tombstone.env, tombstone.id, plain);
    await db
      .update(schema.schedulingOutOfOffice)
      .set({ source: "holiday" })
      .where(eq(schema.schedulingOutOfOffice.id, tombstone.id));
    const soon = new Date(NOW.getTime() + 31 * DAY);
    await purgeExpiredOutOfOffice({ now: soon, scope: scope(env) });
    await purgeExpiredOutOfOffice({ now: soon, scope: scope(tombstone.env) });
    expect(await rowOf(id)).toBeUndefined();
    expect(await rowOf(tombstone.id)).toBeDefined();
  });

  test("notes are re-encrypted when the key rotates", async () => {
    const { env, id } = await entryWithNotes();
    const next = secretsKeyRing([
      createHash("sha256").update("rotated").digest(),
      ...plain.dataKeys.keys.map((key) => key.key),
    ]);
    expect(await reencryptSchedulingData({ keys: next, scope: scope(env) })).toMatchObject({
      reencrypted: 1,
      unreadableCount: 0,
    });
    const read = await getOutOfOffice(env, id, { dataKeys: next });
    expect(read.notes).toBe("Recovering from surgery");
  });
});
