import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { LATEST_API_VERSION } from "@coss/versioning";
import { createWebhookEndpoint } from "@coss/webhooks";
import { testManagementDeps } from "@coss/webhooks/testing";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  approveBooking,
  cancelBooking,
  createBooking,
  createEventType,
  createHost,
  createSchedule,
  listBookingNotifications,
  markNoShow,
  type NotificationDeps,
  rescheduleBooking,
  runDueReminderSyncs,
  runDueSchedulingNotifications,
  type SchedulingEmail,
  type SchedulingEnvironment,
  SchedulingError,
  type SchedulingSms,
  sendTimedWebhook,
  updateBookingLocation,
  updateEventType,
  updateHost,
  updateSettings,
} from "../src/index.ts";
import {
  REMINDER_SAMPLE_VALUES,
  reminderVariablesIn,
  renderReminderCopy,
  safeName,
  timeUntil,
} from "../src/reminder-copy.ts";
import { normalizeReminders } from "../src/reminders.ts";
import { Reminders, UpdateSettingsRequest } from "../src/schemas.ts";
import { testSchedulingDeps } from "../src/testing.ts";

const ms = Date.parse;
const MINUTE = 60_000;
const at = (time: string, date = "2031-01-06") => ms(`${date}T${time}:00Z`);
const NOW = new Date(at("00:00", "2031-01-01"));
const deps = testSchedulingDeps({ now: () => NOW });
const actor = { kind: "system" } as const;
const START = at("09:00");
const END = at("09:30");
const attendee = {
  uid: "p",
  name: "Sam Lee",
  email: "sam@example.com",
  phone: "+15551234567",
  time_zone: "America/New_York",
};

async function setUp(extra: Record<string, unknown> = {}) {
  const tenant = await createTestTenant();
  const env: SchedulingEnvironment = {
    organizationId: tenant.organization.id,
    projectId: tenant.project.id,
    environmentId: tenant.development.id,
    mode: "sandbox",
  };
  const host = await createHost(env, {
    name: "Dr. Reyes",
    email: "reyes@example.com",
    time_zone: "UTC",
  });
  await createSchedule(env, host.id, {
    rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
  });
  const eventType = await createEventType(env, {
    title: "Consultation",
    kind: "one_on_one",
    duration_minutes: 30,
    hosts: [{ host: host.id, role: "member", weight: 100, schedule: null }],
    ...extra,
  } as never);
  return { env, host, eventType };
}

function notifier(clock: () => Date) {
  const emails: SchedulingEmail[] = [];
  const texts: SchedulingSms[] = [];
  const notification: NotificationDeps = {
    dataKeys: deps.dataKeys,
    publicUrl: "https://book.example.test",
    now: clock,
    notifier: {
      email: async (message) => {
        emails.push(message);
      },
      sms: async (message) => {
        texts.push(message);
      },
    },
  };
  return { emails, texts, notification };
}

type Setup = Awaited<ReturnType<typeof setUp>>;

const book = (s: Setup, time = "09:00", extra: Record<string, unknown> = {}, clockDeps = deps) =>
  createBooking(
    s.env,
    { eventType: s.eventType.id, startMs: at(time), attendee, ...extra },
    clockDeps,
    actor,
  );

/** Runs the worker as of `when`, as often as it takes, and says what went out. */
async function runAt(s: Setup, when: number) {
  const n = notifier(() => new Date(when));
  for (let index = 0; index < 5; index++) {
    await runDueSchedulingNotifications(n.notification, {
      scope: { organizationIds: [s.env.organizationId] },
    });
  }
  return n;
}

const subjects = (n: ReturnType<typeof notifier>) => n.emails.map((email) => email.subject);

async function rows(s: Setup, bookingId: string) {
  return (await listBookingNotifications(s.env, bookingId, { limit: 100 })).data;
}

const rule = (input: Record<string, unknown>) => input as never;

const webhookMessages = (s: Setup) =>
  db
    .select()
    .from(schema.schedulingBookingEvent)
    .where(eq(schema.schedulingBookingEvent.organizationId, s.env.organizationId));

describe("when a reminder goes out", () => {
  test("before the start, at each offset, in the order they're due", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      reminders: [
        rule({ anchor: "start", before_minutes: 60, send: ["email_attendee"] }),
        rule({ anchor: "start", before_minutes: 1440, send: ["email_attendee"] }),
      ],
    });
    await book(s);
    expect(subjects(await runAt(s, START - 1441 * MINUTE)).filter(isReminder)).toEqual([]);
    expect(subjects(await runAt(s, START - 1440 * MINUTE)).filter(isReminder).length).toBe(1);
    expect(subjects(await runAt(s, START - 61 * MINUTE)).filter(isReminder)).toEqual([]);
    expect(subjects(await runAt(s, START - 60 * MINUTE)).filter(isReminder).length).toBe(1);
  });

  test("after the end, with words that fit having already happened", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      reminders: [rule({ anchor: "end", after_minutes: 120, send: ["email_attendee"] })],
    });
    await book(s);
    const n = await runAt(s, END + 120 * MINUTE);
    const email = n.emails.find((message) => message.subject.startsWith("Follow-up"));
    expect(email?.text).toContain("Thanks for your time");
    // Too late to reschedule, so there's no link to.
    expect(email?.text).not.toContain("Reschedule or cancel");
  });

  test("from a moment in the booking's life, after a delay", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      reminders: [
        rule({
          key: "winback",
          anchor: "cancelled",
          after_minutes: 1440,
          send: ["email_attendee"],
        }),
      ],
    });
    const { booking } = await book(s);
    await cancelBooking(s.env, booking.id, deps, actor);
    const soon = await runAt(s, NOW.getTime() + 60 * MINUTE);
    expect(soon.emails.filter((email) => email.subject.startsWith("Cancelled")).length).toBe(2);
    const later = await runAt(s, NOW.getTime() + 1440 * MINUTE);
    expect(later.emails.length).toBe(1);
    expect((await rows(s, booking.id)).find((row) => row.reminder_key === "winback")?.outcome).toBe(
      "sent",
    );
  });

  test("a pending request's reminder isn't timed until it's approved", async () => {
    const s = await setUp({ requires_approval: true });
    await updateSettings(s.env, {
      reminders: [
        rule({ key: "day", anchor: "start", before_minutes: 1440, send: ["email_attendee"] }),
        rule({ key: "asked", anchor: "pending_approval", send: ["email_host"] }),
      ],
    });
    const { booking } = await book(s);
    const pending = await rows(s, booking.id);
    expect(pending.some((row) => row.reminder_key === "day")).toBe(false);
    expect(pending.some((row) => row.reminder_key === "asked")).toBe(true);
    await approveBooking(s.env, booking.id, deps, actor);
    expect((await rows(s, booking.id)).some((row) => row.reminder_key === "day")).toBe(true);
    // Approved: the request's own news went stale.
    await runAt(s, NOW.getTime() + 1000);
    expect((await rows(s, booking.id)).find((row) => row.reminder_key === "asked")?.outcome).toBe(
      "stale",
    );
  });

  test("booked inside its window, it's recorded as too late", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      reminders: [
        rule({ key: "day", anchor: "start", before_minutes: 1440, send: ["email_attendee"] }),
      ],
    });
    const lateDeps = testSchedulingDeps({ now: () => new Date(START - 120 * MINUTE) });
    const { booking } = await book(s, "09:00", {}, lateDeps);
    const row = (await rows(s, booking.id)).find((found) => found.reminder_key === "day");
    expect(row?.outcome).toBe("too_late");
    expect(row?.finished_at).not.toBeNull();
    const n = await runAt(s, START - 119 * MINUTE);
    expect(subjects(n).filter(isReminder)).toEqual([]);
  });

  test("`send_if_late` sends it right away instead", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      reminders: [
        rule({
          key: "day",
          anchor: "start",
          before_minutes: 43200,
          send: ["email_attendee"],
          send_if_late: true,
        }),
      ],
    });
    const lateDeps = testSchedulingDeps({ now: () => new Date(START - 120 * MINUTE) });
    await book(s, "09:00", {}, lateDeps);
    const n = await runAt(s, START - 119 * MINUTE);
    expect(subjects(n).filter(isReminder).length).toBe(1);
  });

  test("a worker that was down doesn't send a reminder after its meeting", async () => {
    const s = await setUp();
    const { booking } = await book(s);
    const n = await runAt(s, START + MINUTE);
    expect(subjects(n).filter(isReminder)).toEqual([]);
    expect(
      (await rows(s, booking.id)).find((row) => row.reminder_key === "reminder")?.outcome,
    ).toBe("too_late");
  });

  test("anything else more than a day late is dropped", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      reminders: [
        rule({ key: "after", anchor: "end", after_minutes: 60, send: ["email_attendee"] }),
      ],
    });
    const { booking } = await book(s);
    await runAt(s, END + 60 * MINUTE + 1441 * MINUTE);
    expect((await rows(s, booking.id)).find((row) => row.reminder_key === "after")?.outcome).toBe(
      "too_late",
    );
  });
});

const isReminder = (subject: string) => subject.startsWith("Reminder");

describe("when a booking changes", () => {
  const list = [
    rule({ key: "day", anchor: "start", before_minutes: 1440, send: ["email_attendee"] }),
  ];

  test("a move drops the old time's reminder right away, and queues the new", async () => {
    const s = await setUp();
    await updateSettings(s.env, { reminders: list });
    const { booking } = await book(s);
    await rescheduleBooking(s.env, booking.id, { startMs: at("10:00") }, deps, actor);
    const found = (await rows(s, booking.id)).filter((row) => row.reminder_key === "day");
    expect(found.map((row) => row.outcome).sort()).toEqual([null, "superseded"].sort() as never);
  });

  test("moving away and back gets the reminder back, once", async () => {
    const s = await setUp();
    await updateSettings(s.env, { reminders: list });
    const { booking } = await book(s);
    await rescheduleBooking(s.env, booking.id, { startMs: at("10:00") }, deps, actor);
    await rescheduleBooking(s.env, booking.id, { startMs: at("09:00") }, deps, actor);
    const n = await runAt(s, START - 1440 * MINUTE);
    expect(subjects(n).filter(isReminder).length).toBe(1);
  });

  test("a reminder already sent isn't sent again by moving back", async () => {
    const s = await setUp();
    await updateSettings(s.env, { reminders: list });
    const { booking } = await book(s);
    const sentAt = START - 1440 * MINUTE;
    const first = await runAt(s, sentAt);
    expect(subjects(first).filter(isReminder).length).toBe(1);
    const moveDeps = testSchedulingDeps({ now: () => new Date(sentAt + MINUTE) });
    await rescheduleBooking(s.env, booking.id, { startMs: at("10:00") }, moveDeps, actor);
    await rescheduleBooking(s.env, booking.id, { startMs: at("09:00") }, moveDeps, actor);
    const second = await runAt(s, sentAt + 2 * MINUTE);
    expect(subjects(second).filter(isReminder)).toEqual([]);
  });

  test("a cancellation drops everything timed from the meeting", async () => {
    const s = await setUp();
    await updateSettings(s.env, { reminders: list });
    const { booking } = await book(s);
    await cancelBooking(s.env, booking.id, deps, actor);
    const timed = (await rows(s, booking.id)).filter(
      (row) => row.reminder_key === "day" || row.kind === "started" || row.kind === "ended",
    );
    expect(timed.length).toBe(3);
    expect(timed.every((row) => row.outcome === "superseded")).toBe(true);
  });

  test("a location change and a no-show mark leave reminders alone", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      reminders: [
        rule({
          key: "after",
          anchor: "end",
          after_minutes: 60,
          send: ["email_attendee"],
          skip_no_show: false,
        }),
      ],
    });
    const { booking } = await book(s);
    await updateBookingLocation(
      s.env,
      booking.id,
      { type: "link", url: "https://meet.example.com/abc" },
      deps,
      actor,
    );
    const afterStart = testSchedulingDeps({ now: () => new Date(START + MINUTE) });
    await markNoShow(s.env, booking.id, afterStart, actor);
    const n = await runAt(s, END + 60 * MINUTE);
    expect(n.emails.filter((email) => email.subject.startsWith("Follow-up")).length).toBe(1);
  });
});

describe("no-shows", () => {
  test("a follow-up skips a booking marked a no-show, and a no-show rule goes instead", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      email_from: "appointments@example.com",
      reminders: [
        rule({ key: "after", anchor: "end", after_minutes: 60, send: ["email_attendee"] }),
        rule({
          key: "missed",
          anchor: "no_show",
          after_minutes: 15,
          send: ["email_attendee"],
          message: "Sorry we missed you, {{attendee_first_name}}.",
        }),
      ],
    });
    const { booking } = await book(s);
    const afterStart = testSchedulingDeps({ now: () => new Date(START + 5 * MINUTE) });
    await markNoShow(s.env, booking.id, afterStart, actor);
    const n = await runAt(s, END + 60 * MINUTE);
    const found = await rows(s, booking.id);
    expect(found.find((row) => row.reminder_key === "after")?.outcome).toBe("no_show");
    expect(found.find((row) => row.reminder_key === "missed")?.outcome).toBe("sent");
    const missed = n.emails.find((email) => email.text.includes("Sorry we missed you, Sam."));
    expect(missed?.subject).toStartWith("We missed you");
  });

  test("marking twice is one event, and sends nothing twice", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      reminders: [rule({ key: "missed", anchor: "no_show", send: ["email_attendee"] })],
    });
    const { booking } = await book(s);
    const first = testSchedulingDeps({ now: () => new Date(START + 5 * MINUTE) });
    const second = testSchedulingDeps({ now: () => new Date(START + 9 * MINUTE) });
    const once = await markNoShow(s.env, booking.id, first, actor);
    const twice = await markNoShow(s.env, booking.id, second, actor);
    expect(twice.no_show_at).toBe(once.no_show_at);
    const events = await webhookMessages(s);
    expect(events.filter((event) => event.type === "scheduling.booking.no_show").length).toBe(1);
    const missed = (await rows(s, booking.id)).filter((row) => row.reminder_key === "missed");
    expect(missed.length).toBe(1);
  });
});

describe("who it goes to", () => {
  test("hosts by email and by SMS", async () => {
    const s = await setUp();
    await updateHost(s.env, s.host.id, { phone: "+15550002222" });
    await updateSettings(s.env, {
      sms_from: "+15550001111",
      reminders: [rule({ anchor: "start", before_minutes: 30, send: ["email_host", "sms_host"] })],
    });
    await book(s);
    const n = await runAt(s, START - 30 * MINUTE);
    const reminders = n.emails.filter((email) => isReminder(email.subject));
    expect(reminders.map((email) => email.to)).toEqual(["reyes@example.com"]);
    expect(n.texts.map((text) => text.to)).toEqual(["+15550002222"]);
  });

  test("`reminder.email_host` now does what it says", async () => {
    const s = await setUp();
    await updateSettings(s.env, { notifications: { reminder: { email_host: true } } });
    await book(s);
    const n = await runAt(s, START - 1440 * MINUTE);
    expect(
      n.emails
        .filter((email) => isReminder(email.subject))
        .map((email) => email.to)
        .sort(),
    ).toEqual(["reyes@example.com", "sam@example.com"]);
  });

  test("fixed addresses", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      reminders: [
        rule({
          anchor: "start",
          before_minutes: 30,
          email_to: ["Ops@Example.com", "desk@example.com"],
        }),
      ],
    });
    const { booking } = await book(s);
    const n = await runAt(s, START - 30 * MINUTE);
    expect(n.emails.filter((email) => isReminder(email.subject)).map((email) => email.to)).toEqual([
      "ops@example.com",
      "desk@example.com",
    ]);
    const row = (await rows(s, booking.id)).find((found) => found.recipient === "address");
    expect(row?.outcome).toBe("sent");
    // A key of its own for each, that doesn't depend on where it is in the list.
    const keys = n.emails
      .filter((email) => isReminder(email.subject))
      .map((email) => (email.idempotencyKey.split(":").at(-1) as string).length);
    expect(keys).toEqual([32, 32]);
    // What a booking says about its sends never says who they went to.
    expect(JSON.stringify(row)).not.toContain("example.com");
  });

  test("one event type's list replaces the environment's, and empty means none", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      reminders: [
        rule({ key: "env", anchor: "start", before_minutes: 60, send: ["email_attendee"] }),
      ],
    });
    await updateEventType(s.env, s.eventType.id, {
      reminders: [
        rule({ key: "own", anchor: "start", before_minutes: 30, send: ["email_attendee"] }),
      ],
    });
    const { booking } = await book(s);
    const keys = (await rows(s, booking.id)).flatMap((row) => row.reminder_key ?? []);
    expect(keys).toEqual(["own"]);

    await updateEventType(s.env, s.eventType.id, { reminders: [] });
    const { booking: none } = await book(s, "11:00");
    expect((await rows(s, none.id)).flatMap((row) => row.reminder_key ?? [])).toEqual([]);

    await updateEventType(s.env, s.eventType.id, { reminders: null });
    const { booking: inherits } = await book(s, "12:00");
    expect((await rows(s, inherits.id)).flatMap((row) => row.reminder_key ?? [])).toEqual(["env"]);
  });

  test("an event type's policy can be set, as the docs say", async () => {
    const s = await setUp({ notifications: { confirmed: { email_host: false } } });
    expect(s.eventType.notifications).toEqual({ confirmed: { email_host: false } });
    await book(s);
    const n = await runAt(s, NOW.getTime() + 1000);
    expect(n.emails.filter((email) => email.to === "reyes@example.com")).toEqual([]);
  });
});

describe("only_if", () => {
  test("matches the booking's metadata and location when it's due", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      reminders: [
        rule({
          key: "pro",
          anchor: "start",
          before_minutes: 30,
          send: ["email_attendee"],
          only_if: { metadata: { plan: "pro" } },
        }),
        rule({
          key: "zoom",
          anchor: "start",
          before_minutes: 20,
          send: ["email_attendee"],
          only_if: { location_types: ["zoom"] },
        }),
      ],
    });
    const { booking } = await book(s, "09:00", { metadata: { plan: "pro" } });
    const outcome = async (id: string, key: string) =>
      (await rows(s, id)).find((row) => row.reminder_key === key)?.outcome;
    await runAt(s, START - 25 * MINUTE);
    expect(await outcome(booking.id, "pro")).toBe("sent");
    await runAt(s, START - 15 * MINUTE);
    expect(await outcome(booking.id, "zoom")).toBe("filtered");
    const s2 = await setUp();
    await updateSettings(s2.env, {
      reminders: [
        rule({
          key: "pro",
          anchor: "end",
          after_minutes: 60,
          send: ["email_attendee"],
          only_if: { metadata: { plan: "pro" } },
        }),
      ],
    });
    const { booking: pro } = await book(s2, "09:00", { metadata: { plan: "pro" } });
    const { booking: other } = await book(s2, "11:00", { metadata: { plan: "free" } });
    await runAt(s2, at("13:00"));
    expect((await rows(s2, pro.id)).find((row) => row.reminder_key === "pro")?.outcome).toBe(
      "sent",
    );
    expect((await rows(s2, other.id)).find((row) => row.reminder_key === "pro")?.outcome).toBe(
      "filtered",
    );
  });
});

describe("changing a list", () => {
  const scope = (s: Setup) => ({ scope: { organizationIds: [s.env.organizationId] } });
  const day = rule({ key: "day", anchor: "start", before_minutes: 1440, send: ["email_attendee"] });
  const hour = rule({ key: "hour", anchor: "start", before_minutes: 60, send: ["email_attendee"] });

  test("an edit reaches its rows without a rebuild", async () => {
    const s = await setUp();
    await updateSettings(s.env, { reminders: [day], email_from: "appointments@example.com" });
    await book(s);
    await updateSettings(s.env, {
      reminders: [
        rule({
          key: "day",
          anchor: "start",
          before_minutes: 1440,
          send: ["email_attendee"],
          message: "New words.",
        }),
      ],
    });
    const n = await runAt(s, START - 1440 * MINUTE);
    expect(n.emails.some((email) => email.text.includes("New words."))).toBe(true);
  });

  test("recipients changed just before it's due, with the walk still to come", async () => {
    const s = await setUp();
    const to = (send: string[]) =>
      rule({ key: "day", anchor: "start", before_minutes: 1440, send });
    await updateSettings(s.env, { reminders: [to(["email_attendee"])] });
    const { booking } = await book(s);
    await updateSettings(s.env, { reminders: [to(["email_host"])] });
    const when = START - 1440 * MINUTE;
    // The worker gets there first.
    const n = await runAt(s, when);
    expect(n.emails.filter((email) => isReminder(email.subject)).map((email) => email.to)).toEqual([
      "reyes@example.com",
    ]);
    // Then the walk: it changes nothing, and nothing goes twice.
    await runDueReminderSyncs({ now: () => new Date(when + MINUTE) }, scope(s));
    const again = await runAt(s, when + 2 * MINUTE);
    expect(subjects(again).filter(isReminder)).toEqual([]);
    const day = (await rows(s, booking.id)).filter((row) => row.reminder_key === "day");
    expect(day.map((row) => [row.recipient, row.outcome]).sort()).toEqual([
      ["attendee", "stale"],
      ["host", "sent"],
    ]);
  });

  test("timing changed to sooner, with the walk still to come", async () => {
    const s = await setUp();
    const at = (before_minutes: number) =>
      rule({ key: "day", anchor: "start", before_minutes, send: ["email_attendee"] });
    await updateSettings(s.env, { reminders: [at(60)] });
    await book(s);
    await updateSettings(s.env, { reminders: [at(120)] });
    // Its new moment has passed by the time anyone looks: it goes, late, rather than never.
    const n = await runAt(s, START - 60 * MINUTE);
    expect(subjects(n).filter(isReminder).length).toBe(1);
  });

  test("timing changed to later: one reminder, whichever gets there first", async () => {
    const s = await setUp();
    const at = (before_minutes: number) =>
      rule({ key: "day", anchor: "start", before_minutes, send: ["email_attendee"] });
    await updateSettings(s.env, { reminders: [at(120)] });
    await book(s);
    await updateSettings(s.env, { reminders: [at(60)] });
    // The worker moves its row, then the walk replaces it.
    await runAt(s, START - 120 * MINUTE);
    await runDueReminderSyncs({ now: () => new Date(START - 119 * MINUTE) }, scope(s));
    const n = await runAt(s, START - 60 * MINUTE);
    expect(subjects(n).filter(isReminder).length).toBe(1);
  });

  const timedAt = (before_minutes: number) =>
    rule({ key: "day", anchor: "start", before_minutes, send: ["email_attendee"] });

  test("made sooner than now, it isn't lost when the walk gets there", async () => {
    const s = await setUp();
    await updateSettings(s.env, { reminders: [timedAt(60)] });
    const { booking } = await book(s);
    await updateSettings(s.env, { reminders: [timedAt(120)] });
    // Its new moment is already behind the walk, and saving a list sends nothing at once.
    await runDueReminderSyncs({ now: () => new Date(START - 90 * MINUTE) }, scope(s));
    const waiting = (await rows(s, booking.id)).filter((row) => row.reminder_key === "day");
    expect(waiting.map((row) => row.outcome)).toEqual([null]);
    expect(subjects(await runAt(s, START - 89 * MINUTE)).filter(isReminder)).toEqual([]);
    // So it goes at the moment it had.
    expect(subjects(await runAt(s, START - 60 * MINUTE)).filter(isReminder).length).toBe(1);
  });

  test("made later after it went out, it doesn't go again", async () => {
    const s = await setUp();
    await updateSettings(s.env, { reminders: [timedAt(120)] });
    await book(s);
    expect(subjects(await runAt(s, START - 120 * MINUTE)).filter(isReminder).length).toBe(1);
    await updateSettings(s.env, { reminders: [timedAt(60)] });
    await runDueReminderSyncs({ now: () => new Date(START - 110 * MINUTE) }, scope(s));
    expect(subjects(await runAt(s, START - 60 * MINUTE)).filter(isReminder)).toEqual([]);
  });

  test("a walk moves what's waiting to the rule's new moment, sooner or later", async () => {
    const s = await setUp();
    await updateSettings(s.env, { reminders: [timedAt(60)] });
    const { booking } = await book(s);
    await updateSettings(s.env, { reminders: [timedAt(120)] });
    await runDueReminderSyncs({ now: () => new Date(START - 200 * MINUTE) }, scope(s));
    const found = (await rows(s, booking.id)).filter((row) => row.reminder_key === "day");
    expect(found.length).toBe(1);
    expect(found[0]?.due_at).toBe(new Date(START - 120 * MINUTE).toISOString());
    expect(subjects(await runAt(s, START - 120 * MINUTE)).filter(isReminder).length).toBe(1);
    expect(subjects(await runAt(s, START - 60 * MINUTE)).filter(isReminder)).toEqual([]);
  });

  test("recipients changed after it was due, with the walk first", async () => {
    const s = await setUp();
    const to = (send: string[]) => rule({ key: "day", anchor: "start", before_minutes: 30, send });
    await updateSettings(s.env, { reminders: [to(["email_attendee"])] });
    const { booking } = await book(s);
    await updateSettings(s.env, { reminders: [to(["email_host"])] });
    // A minute after it was due, and the worker hasn't got there.
    const when = START - 29 * MINUTE;
    await runDueReminderSyncs({ now: () => new Date(when) }, scope(s));
    const n = await runAt(s, when + 1000);
    expect(n.emails.filter((email) => isReminder(email.subject)).map((email) => email.to)).toEqual([
      "reyes@example.com",
    ]);
    const day = (await rows(s, booking.id)).filter((row) => row.reminder_key === "day");
    expect(day.map((row) => [row.recipient, row.outcome]).sort()).toEqual([
      ["attendee", "superseded"],
      ["host", "sent"],
    ]);
  });

  test("a recipient added to a caught-up reminder gets it with the others", async () => {
    const s = await setUp();
    const to = (send: string[]) =>
      rule({ key: "prep", anchor: "start", before_minutes: 2880, send, send_if_late: true });
    await updateSettings(s.env, { reminders: [to(["email_attendee"])] });
    const lateDeps = testSchedulingDeps({ now: () => new Date(START - 10 * MINUTE) });
    const { booking } = await book(s, "09:00", {}, lateDeps);
    await updateSettings(s.env, { reminders: [to(["email_attendee", "email_host"])] });
    const n = await runAt(s, START - 9 * MINUTE);
    expect(
      n.emails
        .filter((email) => isReminder(email.subject))
        .map((email) => email.to)
        .sort(),
    ).toEqual(["reyes@example.com", "sam@example.com"]);
    const prep = (await rows(s, booking.id)).filter((row) => row.reminder_key === "prep");
    expect(prep.map((row) => row.outcome)).toEqual(["sent", "sent"]);
  });

  test("a rule that wasn't owed still doesn't start late", async () => {
    const s = await setUp();
    const { booking } = await book(s);
    await updateSettings(s.env, {
      reminders: [rule({ key: "new", anchor: "start", before_minutes: 60, send: ["email_host"] })],
    });
    await runDueReminderSyncs({ now: () => new Date(START - 30 * MINUTE) }, scope(s));
    expect((await rows(s, booking.id)).some((row) => row.reminder_key === "new")).toBe(false);
  });

  test("a recipient taken off and put back doesn't get it twice", async () => {
    const s = await setUp();
    const to = (send: string[]) => rule({ key: "day", anchor: "start", before_minutes: 120, send });
    await updateSettings(s.env, { reminders: [to(["email_attendee", "email_host"])] });
    await book(s);
    const first = await runAt(s, START - 120 * MINUTE);
    expect(first.emails.filter((email) => isReminder(email.subject)).length).toBe(2);
    await updateSettings(s.env, { reminders: [to(["email_host"])] });
    await runDueReminderSyncs({ now: () => new Date(START - 100 * MINUTE) }, scope(s));
    await updateSettings(s.env, { reminders: [to(["email_attendee", "email_host"])] });
    await runDueReminderSyncs({ now: () => new Date(START - 90 * MINUTE) }, scope(s));
    expect(subjects(await runAt(s, START - 80 * MINUTE)).filter(isReminder)).toEqual([]);
  });

  test("a deleted reminder doesn't go, even before the walk", async () => {
    const s = await setUp();
    await updateSettings(s.env, { reminders: [day] });
    const { booking } = await book(s);
    await updateSettings(s.env, { reminders: [hour] });
    const n = await runAt(s, START - 1440 * MINUTE);
    expect(subjects(n).filter(isReminder)).toEqual([]);
    expect((await rows(s, booking.id)).find((row) => row.reminder_key === "day")?.outcome).toBe(
      "stale",
    );
  });

  test("a new reminder reaches upcoming bookings, once, and not ended ones", async () => {
    const s = await setUp();
    await updateSettings(s.env, { reminders: [day] });
    const { booking } = await book(s);
    const past = testSchedulingDeps({ now: () => new Date(at("08:00", "2031-01-05")) });
    const { booking: ended } = await createBooking(
      s.env,
      { eventType: s.eventType.id, startMs: at("09:00", "2031-01-05"), attendee },
      past,
      actor,
    );
    await updateSettings(s.env, { reminders: [day, hour] });
    const walkDeps = { now: () => new Date(at("10:00", "2031-01-05")) };
    expect(await runDueReminderSyncs(walkDeps, scope(s))).toBe(1);
    expect((await rows(s, booking.id)).filter((row) => row.reminder_key === "hour").length).toBe(1);
    expect((await rows(s, ended.id)).some((row) => row.reminder_key === "hour")).toBe(false);
    // The walk's done, and running it again changes nothing.
    expect(await runDueReminderSyncs(walkDeps, scope(s))).toBe(0);
    await updateSettings(s.env, { reminders: [day, hour] });
    await runDueReminderSyncs(walkDeps, scope(s));
    expect((await rows(s, booking.id)).filter((row) => row.reminder_key === "hour").length).toBe(1);
  });

  test("a new reminder whose moment has passed is left out, not recorded", async () => {
    const s = await setUp();
    await updateSettings(s.env, { reminders: [day] });
    const { booking } = await book(s);
    await updateSettings(s.env, { reminders: [day, hour] });
    await runDueReminderSyncs({ now: () => new Date(START - 30 * MINUTE) }, scope(s));
    expect((await rows(s, booking.id)).some((row) => row.reminder_key === "hour")).toBe(false);
  });

  test("a reminder due but not yet sent survives a list change", async () => {
    const s = await setUp();
    await updateSettings(s.env, { reminders: [day] });
    const { booking } = await book(s);
    await updateSettings(s.env, { reminders: [day, hour] });
    // Its moment has passed, and the worker hasn't got to it (or it's waiting on a retry).
    const when = START - 1439 * MINUTE;
    await runDueReminderSyncs({ now: () => new Date(when) }, scope(s));
    const row = (await rows(s, booking.id)).find((found) => found.reminder_key === "day");
    expect(row?.outcome).toBeNull();
    const n = await runAt(s, when + MINUTE);
    expect(subjects(n).filter(isReminder).length).toBe(1);
  });

  test("saving a list doesn't send anything right away, even with `send_if_late`", async () => {
    const s = await setUp();
    const { booking } = await book(s);
    await updateSettings(s.env, {
      reminders: [
        rule({
          key: "intake",
          anchor: "start",
          before_minutes: 43200,
          send: ["email_attendee"],
          send_if_late: true,
        }),
      ],
    });
    const when = START - 120 * MINUTE;
    await runDueReminderSyncs({ now: () => new Date(when) }, scope(s));
    expect((await rows(s, booking.id)).some((row) => row.reminder_key === "intake")).toBe(false);
    expect(subjects(await runAt(s, when + MINUTE)).filter(isReminder)).toEqual([]);
  });

  test("another change restarts the walk rather than adding one", async () => {
    const s = await setUp();
    await updateSettings(s.env, { reminders: [day] });
    await book(s);
    await updateSettings(s.env, { reminders: [day, hour] });
    await updateSettings(s.env, { reminders: [hour] });
    const syncs = await db
      .select()
      .from(schema.schedulingReminderSync)
      .where(eq(schema.schedulingReminderSync.organizationId, s.env.organizationId));
    expect(syncs.length).toBe(1);
  });

  test("an event type's change only walks its own bookings", async () => {
    const s = await setUp();
    const other = await createEventType(s.env, {
      title: "Other",
      kind: "one_on_one",
      duration_minutes: 30,
      hosts: [{ host: s.host.id, role: "member", weight: 100, schedule: null }],
    } as never);
    await book(s);
    const { booking: theirs } = await createBooking(
      s.env,
      { eventType: other.id, startMs: at("11:00"), attendee },
      deps,
      actor,
    );
    await updateEventType(s.env, s.eventType.id, { reminders: [hour] });
    expect(await runDueReminderSyncs({ now: () => NOW }, scope(s))).toBe(1);
    expect((await rows(s, theirs.id)).some((row) => row.reminder_key === "hour")).toBe(false);
  });
});

describe("timed webhooks", () => {
  /** A subscribed endpoint, so messages get stored: what they say is what's checked. */
  async function subscribe(s: Setup, types: string[]) {
    await createWebhookEndpoint(
      {
        organizationId: s.env.organizationId,
        environmentId: s.env.environmentId,
        url: "http://127.0.0.1:9/hook",
        eventTypes: types as never,
        apiVersion: LATEST_API_VERSION,
        userId: null,
      },
      testManagementDeps,
    );
  }
  const stored = async (s: Setup, type: string) =>
    db
      .select()
      .from(schema.webhookMessage)
      .where(
        and(
          eq(schema.webhookMessage.organizationId, s.env.organizationId),
          eq(schema.webhookMessage.type, type),
        ),
      );

  test("started and ended fire at their moments, for an endpoint added after booking", async () => {
    const s = await setUp();
    const { booking } = await book(s);
    await subscribe(s, ["scheduling.booking.started", "scheduling.booking.ended"]);
    await runAt(s, START - MINUTE);
    expect(await stored(s, "scheduling.booking.started")).toEqual([]);
    await runAt(s, START + 2 * MINUTE);
    const started = await stored(s, "scheduling.booking.started");
    expect(started.length).toBe(1);
    expect(started[0]?.payload).toMatchObject({
      data: {
        booking_id: booking.id,
        status: "confirmed",
        // When it happened, not when the worker noticed.
        occurred_at: new Date(START).toISOString(),
      },
    });
    expect(await stored(s, "scheduling.booking.ended")).toEqual([]);
    await runAt(s, END);
    expect((await stored(s, "scheduling.booking.ended")).length).toBe(1);
    const history = await webhookMessages(s);
    expect(history.map((event) => event.type)).toContain("scheduling.booking.started");
  });

  test("a moved booking reports its new time only, a cancelled one nothing", async () => {
    const s = await setUp();
    const { booking } = await book(s);
    await subscribe(s, ["scheduling.booking.started"]);
    await rescheduleBooking(s.env, booking.id, { startMs: at("10:00") }, deps, actor);
    await runAt(s, START + MINUTE);
    expect(await stored(s, "scheduling.booking.started")).toEqual([]);
    await runAt(s, at("10:00") + MINUTE);
    expect((await stored(s, "scheduling.booking.started")).length).toBe(1);

    const { booking: gone } = await book(s, "12:00");
    await cancelBooking(s.env, gone.id, deps, actor);
    await runAt(s, at("12:00") + MINUTE);
    expect((await stored(s, "scheduling.booking.started")).length).toBe(1);
  });

  test("a reminder's webhook says which reminder, at any offset", async () => {
    const s = await setUp();
    await subscribe(s, ["scheduling.booking.reminder"]);
    await updateSettings(s.env, {
      reminders: [rule({ key: "prep", anchor: "start", before_minutes: 90, send: ["webhook"] })],
    });
    await book(s);
    await runAt(s, START - 90 * MINUTE + 5 * MINUTE);
    const [message] = await stored(s, "scheduling.booking.reminder");
    expect(message?.payload).toMatchObject({
      data: {
        reminder: {
          key: "prep",
          anchor: "start",
          before_minutes: 90,
          after_minutes: null,
          scheduled_for: new Date(START - 90 * MINUTE).toISOString(),
        },
        occurred_at: new Date(START - 90 * MINUTE).toISOString(),
      },
    });
  });

  test("a webhook days late is still sent: it's a fact, not a nudge", async () => {
    const s = await setUp();
    await book(s);
    await subscribe(s, ["scheduling.booking.started"]);
    await runAt(s, START + 3 * 86_400_000);
    expect((await stored(s, "scheduling.booking.started")).length).toBe(1);
  });

  test("two workers holding one row report once", async () => {
    const s = await setUp();
    const { booking } = await book(s);
    await subscribe(s, ["scheduling.booking.started"]);
    const [row] = await db
      .select()
      .from(schema.schedulingNotification)
      .where(
        and(
          eq(schema.schedulingNotification.bookingId, booking.id),
          eq(schema.schedulingNotification.kind, "started"),
        ),
      );
    if (!row) throw new Error("no row");
    const when = new Date(START + MINUTE);
    // The lease ran out under the first: both claimed it, and race to report.
    await Promise.all(Array.from({ length: 6 }, () => sendTimedWebhook(row, when)));
    expect((await stored(s, "scheduling.booking.started")).length).toBe(1);
    const history = await webhookMessages(s);
    expect(history.filter((event) => event.type === "scheduling.booking.started").length).toBe(1);
  });

  test("nobody subscribed: the moment's on the booking's history, and nothing's stored", async () => {
    const s = await setUp();
    const { booking } = await book(s);
    await runAt(s, START + MINUTE);
    expect(await stored(s, "scheduling.booking.started")).toEqual([]);
    expect((await rows(s, booking.id)).find((row) => row.kind === "started")?.outcome).toBe("sent");
    const history = await webhookMessages(s);
    expect(history.some((event) => event.type === "scheduling.booking.started")).toBe(true);
  });
});

describe("the customer's own words", () => {
  const own = {
    key: "follow",
    anchor: "end",
    after_minutes: 60,
    send: ["email_attendee", "email_host"],
    subject: "How did it go, {{attendee_first_name}}?",
    message:
      "Thanks for meeting {{host_name}} about {{event_title}}.\n\nWe hope it helped, {{attendee_name}}.",
    button: { label: "Leave feedback", url: "https://example.com/f?b={{booking_id}}" },
  };

  test("go out under the customer's address, and never under coss.com's", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      email_from: "appointments@example.com",
      email_reply_to: "desk@example.com",
      reminders: [rule(own)],
    });
    const { booking } = await book(s);
    const n = await runAt(s, END + 60 * MINUTE);
    const email = n.emails.find((message) => message.subject.startsWith("How did it go"));
    expect(email?.subject).toBe("How did it go, Sam?");
    expect(email?.text).toContain("Thanks for meeting Dr. Reyes about Consultation.");
    expect(email?.text).toContain("We hope it helped, Sam Lee.");
    expect(email?.html).toContain(`https://example.com/f?b=${booking.id}`);
    expect(email?.replyTo).toBe("desk@example.com");
    // What coss.com's address would send if the domain stopped being verified.
    expect(email?.cossSubject).toBe("Follow-up: Consultation");
    expect(email?.cossText).toContain("Thanks for your time");
    for (const part of [email?.cossText, email?.cossHtml, email?.cossSubject]) {
      expect(part).not.toContain("How did it go");
      expect(part).not.toContain("Thanks for meeting");
      expect(part).not.toContain("example.com/f");
    }
  });

  test("need `email_from`, and it can't be taken away while they do", async () => {
    const s = await setUp();
    await expect(updateSettings(s.env, { reminders: [rule(own)] })).rejects.toThrow(/email_from/);
    await updateSettings(s.env, {
      email_from: "appointments@example.com",
      reminders: [rule(own)],
    });
    await expect(updateSettings(s.env, { email_from: null })).rejects.toThrow(/email_from/);
  });

  test("an event type's own list keeps `email_from` from being taken away too", async () => {
    const s = await setUp();
    await updateSettings(s.env, { email_from: "appointments@example.com" });
    await updateEventType(s.env, s.eventType.id, { reminders: [rule(own)] });
    await expect(updateSettings(s.env, { email_from: null })).rejects.toThrow(
      /"Consultation" has reminders that need email_from/,
    );
    // Moving to another address of theirs is fine, and so is removing it once nothing needs it.
    await updateSettings(s.env, { email_from: "bookings@example.com" });
    await updateEventType(s.env, s.eventType.id, { reminders: null });
    await updateSettings(s.env, { email_from: null });
  });

  test("can't hold a link, however it's written", async () => {
    const s = await setUp();
    await updateSettings(s.env, { email_from: "appointments@example.com" });
    for (const field of ["subject", "message"]) {
      await expect(
        updateSettings(s.env, {
          reminders: [rule({ ...own, button: undefined, [field]: "Go to evil.com now" })],
        }),
      ).rejects.toThrow(/link/);
    }
    await expect(
      updateSettings(s.env, {
        sms_from: "+15550001111",
        reminders: [
          rule({
            anchor: "start",
            before_minutes: 5,
            send: ["sms_attendee"],
            sms_message: "See https://evil.example",
          }),
        ],
      }),
    ).rejects.toThrow(/link/);
  });

  test("a link in an attendee's name renders as nothing", async () => {
    expect(safeName("Click http://evil.example")).toBe("");
    expect(safeName("evil.com")).toBe("");
    // Whatever it ends in: there's no list of endings to get past.
    expect(safeName("Confirm at attacker.dev")).toBe("");
    expect(safeName("пример.рф")).toBe("");
    // What a browser reads as a dot, and what it doesn't see at all.
    expect(safeName("attacker。dev")).toBe("");
    expect(safeName("attacker．dev")).toBe("");
    expect(safeName("attacker｡dev")).toBe("");
    expect(safeName("attacker.\u200bdev")).toBe("");
    expect(safeName("evil\u200d.com")).toBe("");
    // None of which are in anyone's name, and the marks that are stay as they were typed.
    expect(safeName("José Núñez")).toBe("José Núñez");
    expect(safeName("山田 太郎")).toBe("山田 太郎");
    expect(safeName("Nguyễn Thị")).toBe("Nguyễn Thị");
    // Ordinary names aren't touched by what's around them.
    expect(safeName("Dr. Reyes")).toBe("Dr. Reyes");
    expect(safeName("J. R. Smith")).toBe("J. R. Smith");
    expect(safeName("Sam Lee")).toBe("Sam Lee");

    const s = await setUp();
    await updateSettings(s.env, {
      email_from: "appointments@example.com",
      reminders: [
        rule({
          anchor: "start",
          before_minutes: 30,
          send: ["email_attendee"],
          message: "Hi {{attendee_first_name}}, it's nearly time.",
          subject: "{{attendee_name}}: nearly time",
        }),
      ],
    });
    await createBooking(
      s.env,
      {
        eventType: s.eventType.id,
        startMs: START,
        attendee: { ...attendee, name: "Win a prize at evil.com" },
      },
      deps,
      actor,
    );
    const n = await runAt(s, START - 30 * MINUTE);
    const email = n.emails.find((message) => message.subject.includes("nearly time"));
    expect(email?.subject).toBe("there: nearly time");
    expect(email?.text).toContain("Hi there, it's nearly time.");
    for (const part of [email?.subject, email?.text, email?.html]) {
      expect(part).not.toContain("evil.com");
    }
  });

  test("spaces inside the braces are fine, and a long run of them costs nothing", () => {
    expect(renderReminderCopy("Hi {{ attendee_first_name }}", REMINDER_SAMPLE_VALUES)).toBe(
      "Hi Sam",
    );
    expect(reminderVariablesIn("{{  date\t}}")).toEqual(["date"]);
    const started = performance.now();
    const hostile = `{{${"\t".repeat(100_000)}`;
    expect(renderReminderCopy(hostile, REMINDER_SAMPLE_VALUES)).toBe(hostile);
    expect(reminderVariablesIn(hostile)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(200);
  });

  test("a value holding {{…}} stays text", () => {
    const values = { ...REMINDER_SAMPLE_VALUES, attendee_name: "{{booking_id}}" };
    expect(renderReminderCopy("Hi {{attendee_name}}", values)).toBe("Hi {{booking_id}}");
  });

  test("screened when they're saved, in live environments only", async () => {
    const s = await setUp();
    const screened: string[] = [];
    const screen = async ({ text }: { text: string }) => {
      screened.push(text);
      return !text.includes("Free money");
    };
    const live: SchedulingEnvironment = { ...s.env, mode: "live" };
    const list = (message: string) => ({
      email_from: "appointments@example.com",
      reminders: [rule({ anchor: "start", before_minutes: 30, send: ["email_attendee"], message })],
    });
    await updateSettings(s.env, list("Free money"), { screen });
    expect(screened).toEqual([]);
    const verifiedAddress = async () => true;
    await updateSettings(live, list("See you soon."), { screen, verifiedAddress });
    expect(screened).toEqual(["See you soon."]);
    await expect(
      updateSettings(live, list("Free money"), { screen, verifiedAddress }),
    ).rejects.toThrow(/phishing or spam/);
  });

  test("live: fixed addresses and buttons must be verified, and fail closed", async () => {
    const s = await setUp();
    const live: SchedulingEnvironment = { ...s.env, mode: "live" };
    await updateSettings(live, { email_from: "appointments@example.com" }, {});
    const addressRule = rule({ anchor: "start", before_minutes: 30, email_to: ["ops@other.test"] });
    const buttonRule = rule({
      anchor: "end",
      after_minutes: 30,
      send: ["email_attendee"],
      button: { label: "Go", url: "https://sub.acme.test/x" },
    });
    await expect(updateSettings(live, { reminders: [addressRule] }, {})).rejects.toThrow(
      /verified domains/,
    );
    await expect(updateSettings(live, { reminders: [buttonRule] }, {})).rejects.toThrow(
      /verified domains/,
    );
    const asked: string[] = [];
    const verifiedAddress = async ({ address }: { address: string }) => {
      asked.push(address);
      return true;
    };
    await updateSettings(live, { reminders: [addressRule, buttonRule] }, { verifiedAddress });
    expect(asked).toEqual(["ops@other.test", "postmaster@sub.acme.test"]);
  });

  test("an SMS adds the opt-out itself, and can't name anyone", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      sms_from: "+15550001111",
      brand_name: "Acme Health",
      reminders: [
        rule({
          anchor: "start",
          before_minutes: 30,
          send: ["sms_attendee"],
          sms_message: "{{event_title}} is {{time_until}}.",
        }),
      ],
    });
    await book(s);
    const n = await runAt(s, START - 30 * MINUTE);
    expect(n.texts[0]?.body).toBe(
      "Acme Health: Consultation is in 30 minutes. Reply STOP to opt out.",
    );
    const parsed = UpdateSettingsRequest.safeParse({
      reminders: [
        {
          anchor: "start",
          before_minutes: 30,
          send: ["sms_attendee"],
          sms_message: "Hi {{attendee_name}}",
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  test("the manage link stays before the meeting, and gives way to their button", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      email_from: "appointments@example.com",
      reminders: [
        rule({ key: "plain", anchor: "start", before_minutes: 60, send: ["email_attendee"] }),
        rule({
          key: "button",
          anchor: "start",
          before_minutes: 30,
          send: ["email_attendee"],
          button: { label: "Prepare", url: "https://example.com/prep" },
        }),
      ],
    });
    await book(s);
    const plain = (await runAt(s, START - 60 * MINUTE)).emails.find((email) =>
      isReminder(email.subject),
    );
    expect(plain?.text).toContain("Reschedule or cancel");
    const withButton = (await runAt(s, START - 30 * MINUTE)).emails.find((email) =>
      isReminder(email.subject),
    );
    expect(withButton?.text).toContain("Prepare");
    expect(withButton?.text).toContain("Reschedule or cancel");
    // coss.com's copy has the manage link, and not their button.
    expect(withButton?.cossText).toContain("Reschedule or cancel");
    expect(withButton?.cossText).not.toContain("Prepare");
  });

  test("an invitation goes along if it's asked for", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      reminders: [
        rule({
          anchor: "start",
          before_minutes: 30,
          send: ["email_attendee"],
          include_invite: true,
        }),
      ],
    });
    await book(s);
    const n = await runAt(s, START - 30 * MINUTE);
    expect(n.emails.find((email) => isReminder(email.subject))?.ics?.method).toBe("REQUEST");
  });
});

describe("coss.com's own address", () => {
  const emailing = (key: string, minutes: number) =>
    rule({ key, anchor: "start", before_minutes: minutes, send: ["email_attendee"] });

  test("sends two reminders at most", async () => {
    const s = await setUp();
    await expect(
      updateSettings(s.env, {
        reminders: [emailing("a", 60), emailing("b", 50), emailing("c", 40)],
      }),
    ).rejects.toThrow(/at most 2/);
    await updateSettings(s.env, { reminders: [emailing("a", 60), emailing("b", 50)] });
  });

  test("and is held to it if `email_from` is gone by the time they're due", async () => {
    const s = await setUp();
    await db.insert(schema.schedulingSettings).values({
      organizationId: s.env.organizationId,
      projectId: s.env.projectId,
      environmentId: s.env.environmentId,
      reminders: [
        { ...baseRule, key: "a", before_minutes: 60 },
        { ...baseRule, key: "b", before_minutes: 50 },
        { ...baseRule, key: "c", before_minutes: 40 },
      ],
    });
    const { booking } = await book(s);
    const n = notifier(() => new Date(START - 30 * MINUTE));
    // As the real notifier does in a live environment, with no address of the customer's to try.
    n.notification.notifier.email = async (message) =>
      message.ownSenderOnly ? "not_sent" : undefined;
    await runDueSchedulingNotifications(n.notification, {
      scope: { organizationIds: [s.env.organizationId] },
    });
    const found = await rows(s, booking.id);
    expect(found.find((row) => row.reminder_key === "b")?.outcome).toBe("sent");
    expect(found.find((row) => row.reminder_key === "c")?.outcome).toBe("no_sender");
  });

  test("and an unverified `email_from` doesn't get round it", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      email_from: "appointments@not-verified.example",
      reminders: [
        rule({ key: "a", anchor: "start", before_minutes: 60, send: ["email_attendee"] }),
        rule({ key: "b", anchor: "start", before_minutes: 50, send: ["email_attendee"] }),
        rule({ key: "c", anchor: "start", before_minutes: 40, send: ["email_attendee"] }),
      ],
    });
    const { booking } = await book(s);
    const n = notifier(() => new Date(START - 30 * MINUTE));
    const flags: Record<string, boolean> = {};
    // As the real notifier does when the customer's domain turns out not to be verified.
    n.notification.notifier.email = async (message) => {
      flags[message.subject] = message.ownSenderOnly;
      return message.ownSenderOnly ? "not_sent" : undefined;
    };
    await runDueSchedulingNotifications(n.notification, {
      scope: { organizationIds: [s.env.organizationId] },
    });
    const found = await rows(s, booking.id);
    expect(found.find((row) => row.reminder_key === "a")?.outcome).toBe("sent");
    expect(found.find((row) => row.reminder_key === "b")?.outcome).toBe("sent");
    expect(found.find((row) => row.reminder_key === "c")?.outcome).toBe("no_sender");
  });
});

const baseRule = {
  anchor: "start" as const,
  after_minutes: null,
  send: ["email_attendee" as const],
  email_to: [],
  subject: null,
  message: null,
  sms_message: null,
  button: null,
  include_invite: false,
  send_if_late: false,
  skip_no_show: false,
  only_if: null,
};

describe("what's accepted", () => {
  const parse = (reminder: Record<string, unknown>) =>
    UpdateSettingsRequest.safeParse({ reminders: [reminder] });

  test("timing", () => {
    const send = ["email_attendee"];
    expect(parse({ anchor: "start", send }).success).toBe(false);
    expect(parse({ anchor: "start", before_minutes: 5, after_minutes: 5, send }).success).toBe(
      false,
    );
    expect(parse({ anchor: "cancelled", before_minutes: 5, send }).success).toBe(false);
    expect(parse({ anchor: "cancelled", send }).success).toBe(true);
    expect(parse({ anchor: "end", after_minutes: 60 * 24 * 60 + 1, send }).success).toBe(false);
  });

  test("copy", () => {
    const base = { anchor: "start", before_minutes: 5, send: ["email_attendee"] };
    expect(parse({ ...base, message: "Hi {{nope}}" }).success).toBe(false);
    expect(parse({ ...base, message: "Hi {{attendee_name}}" }).success).toBe(true);
    expect(parse({ ...base, sms_message: "Hi" }).success).toBe(false);
    expect(parse({ ...base, button: { label: "Go", url: "http://x.test" } }).success).toBe(false);
    expect(
      parse({ ...base, button: { label: "Go", url: "https://x.test/{{attendee_name}}" } }).success,
    ).toBe(false);
    expect(
      parse({ ...base, button: { label: "Go", url: "https://x.test/{{booking_id}}" } }).success,
    ).toBe(true);
  });

  test("a button's host is the same for every booking", () => {
    const base = { anchor: "start", before_minutes: 5, send: ["email_attendee"] };
    const accepts = (url: string) => parse({ ...base, button: { label: "Go", url } }).success;
    expect(accepts("https://x.test/{{booking_id}}")).toBe(true);
    expect(accepts("https://x.test/f?b={{booking_id}}")).toBe(true);
    expect(accepts("https://x.test/f#{{booking_id}}")).toBe(true);
    expect(accepts("https://{{booking_id}}.x.test/f")).toBe(false);
    expect(accepts("https://x{{booking_id}}.test/f")).toBe(false);
    expect(accepts("https://x.test{{booking_id}}/f")).toBe(false);
    expect(accepts("https://x.test:{{booking_id}}/f")).toBe(false);
    expect(accepts("https://{{booking_id}}@x.test/f")).toBe(false);
  });

  test("the list", () => {
    const one = { anchor: "start", before_minutes: 5, send: ["email_attendee"] };
    expect(UpdateSettingsRequest.safeParse({ reminders: [one, one] }).success).toBe(false);
    expect(
      UpdateSettingsRequest.safeParse({
        reminders: Array.from({ length: 11 }, (_, index) => ({ ...one, key: `k${index}` })),
      }).success,
    ).toBe(false);
    expect(parse({ anchor: "start", before_minutes: 5 }).success).toBe(false);
  });

  test("time_until reads naturally", () => {
    const t = 0;
    expect(timeUntil(t + MINUTE, t)).toBe("in 1 minute");
    expect(timeUntil(t + 45 * MINUTE, t)).toBe("in 45 minutes");
    expect(timeUntil(t + 60 * MINUTE, t)).toBe("in 1 hour");
    expect(timeUntil(t + 72 * 60 * MINUTE, t)).toBe("in 3 days");
    expect(timeUntil(t - MINUTE, t)).toBe("now");
  });
});

describe("errors", () => {
  test("a booking that isn't here has no notifications to list", async () => {
    const s = await setUp();
    await expect(
      listBookingNotifications(s.env, "book_missing", { limit: 10 }),
    ).rejects.toBeInstanceOf(SchedulingError);
  });
});

describe("rows from before this", () => {
  /** Queued by an older task: no anchor, and only its version says it's still owed. */
  async function legacyRow(s: Setup, bookingId: string, behind: number) {
    const [booking] = await db
      .select({ version: schema.schedulingBooking.version })
      .from(schema.schedulingBooking)
      .where(eq(schema.schedulingBooking.id, bookingId));
    const version = (booking?.version ?? 0) - behind;
    await db.insert(schema.schedulingNotification).values({
      organizationId: s.env.organizationId,
      environmentId: s.env.environmentId,
      bookingId,
      kind: "reminder",
      channel: "email",
      recipient: "attendee",
      bookingVersion: version,
      dedupeKey: `reminder:email:attendee:${bookingId}:${version}`,
      dueAt: new Date(START - 1440 * MINUTE),
    });
  }

  test("still go out while their version holds, in the standard words", async () => {
    const s = await setUp();
    await updateSettings(s.env, { reminders: [] });
    const { booking } = await book(s);
    await legacyRow(s, booking.id, 0);
    const n = await runAt(s, START - 1440 * MINUTE);
    expect(subjects(n).filter(isReminder)).toEqual(["Reminder: Consultation"]);
  });

  test("a location change carries them forward, as it always did", async () => {
    const s = await setUp();
    await updateSettings(s.env, { reminders: [] });
    const { booking } = await book(s);
    await legacyRow(s, booking.id, 0);
    await updateBookingLocation(
      s.env,
      booking.id,
      { type: "link", url: "https://meet.example.com/abc" },
      deps,
      actor,
    );
    const n = await runAt(s, START - 1440 * MINUTE);
    expect(subjects(n).filter(isReminder)).toEqual(["Reminder: Consultation"]);
  });

  test("and are stale once it doesn't", async () => {
    const s = await setUp();
    await updateSettings(s.env, { reminders: [] });
    const { booking } = await book(s);
    await legacyRow(s, booking.id, 1);
    const n = await runAt(s, START - 1440 * MINUTE);
    expect(subjects(n).filter(isReminder)).toEqual([]);
  });
});

describe("group sessions", () => {
  test("each seat has its own reminder and moments, and leaving drops only that seat's", async () => {
    const s = await setUp({ kind: "group", capacity: 5 });
    await updateSettings(s.env, {
      reminders: [
        rule({ key: "soon", anchor: "start", before_minutes: 60, send: ["email_attendee"] }),
      ],
    });
    const seat = (name: string) =>
      createBooking(
        s.env,
        {
          eventType: s.eventType.id,
          startMs: START,
          attendee: { ...attendee, uid: name, name, email: `${name}@example.com` },
        },
        deps,
        actor,
      );
    const { booking: first } = await seat("ana");
    const { booking: second } = await seat("ben");
    await cancelBooking(s.env, second.id, deps, actor);
    const n = await runAt(s, START - 60 * MINUTE);
    expect(n.emails.filter((email) => isReminder(email.subject)).map((email) => email.to)).toEqual([
      "ana@example.com",
    ]);
    const started = await runAt(s, START + MINUTE);
    expect(started.emails.filter((email) => isReminder(email.subject))).toEqual([]);
    expect((await rows(s, first.id)).find((row) => row.kind === "started")?.outcome).toBe("sent");
    expect((await rows(s, second.id)).find((row) => row.kind === "started")?.outcome).toBe(
      "superseded",
    );
  });
});

describe("guests", () => {
  const withGuest = (s: Setup) =>
    book(s, "09:00", { guests: [{ name: "Gus Guest", email: "gus@example.com" }] });

  test("get a reminder from the customer's address, with no manage link", async () => {
    const s = await setUp({ max_guests: 2 });
    await updateSettings(s.env, {
      email_from: "appointments@example.com",
      reminders: [
        rule({
          anchor: "start",
          before_minutes: 30,
          send: ["email_attendee"],
          message: "See you soon, {{attendee_first_name}}.",
        }),
      ],
    });
    await withGuest(s);
    const n = await runAt(s, START - 30 * MINUTE);
    const toGuest = n.emails.find(
      (email) => email.to === "gus@example.com" && email.text.includes("See you soon"),
    );
    const toAttendee = n.emails.find(
      (email) => email.to === attendee.email && email.text.includes("See you soon"),
    );
    expect(toGuest?.text).toContain("See you soon, Gus.");
    expect(toGuest?.text).not.toContain("Reschedule or cancel");
    expect(toGuest?.ownSenderOnly).toBe(true);
    expect(toAttendee?.text).toContain("Reschedule or cancel");
    expect(toAttendee?.ownSenderOnly).toBe(false);
  });

  test("hear nothing from coss.com's address in a live environment", async () => {
    const s = await setUp({ max_guests: 2 });
    const live: SchedulingEnvironment = { ...s.env, mode: "live" };
    await db
      .update(schema.environment)
      .set({ mode: "live" })
      .where(eq(schema.environment.id, s.env.environmentId));
    await updateSettings(live, {
      reminders: [rule({ anchor: "start", before_minutes: 30, send: ["email_attendee"] })],
    });
    await withGuest(s);
    const n = await runAt(s, START - 30 * MINUTE);
    const reminders = n.emails.filter((email) => isReminder(email.subject));
    expect(reminders.map((email) => email.to)).toEqual([attendee.email]);
  });

  test("aren't told someone else was a no-show", async () => {
    const s = await setUp({ max_guests: 2 });
    await updateSettings(s.env, {
      reminders: [rule({ key: "missed", anchor: "no_show", send: ["email_attendee"] })],
    });
    const { booking } = await withGuest(s);
    const afterStart = testSchedulingDeps({ now: () => new Date(START + 5 * MINUTE) });
    await markNoShow(s.env, booking.id, afterStart, actor);
    const n = await runAt(s, START + 6 * MINUTE);
    const missed = n.emails.filter((email) => email.subject.startsWith("We missed you"));
    expect(missed.map((email) => email.to)).toEqual([attendee.email]);
  });

  test("a follow-up's words name the person who booked, for a host", async () => {
    const s = await setUp({ max_guests: 2 });
    await updateSettings(s.env, {
      email_from: "appointments@example.com",
      reminders: [
        rule({
          anchor: "end",
          after_minutes: 60,
          send: ["email_host"],
          message: "How was {{attendee_name}}?",
        }),
      ],
    });
    await withGuest(s);
    const n = await runAt(s, END + 60 * MINUTE);
    const email = n.emails.find((message) => message.text.includes("How was"));
    expect(email?.text).toContain("How was Sam Lee?");
  });
});

describe("links in a customer's words", () => {
  const saving = (s: Setup, words: Record<string, unknown>) =>
    updateSettings(s.env, {
      email_from: "appointments@example.com",
      reminders: [
        rule({ anchor: "start", before_minutes: 60, send: ["email_attendee"], ...words }),
      ],
    });

  test.each([
    "Please confirm at appointments.attacker.dev",
    "Confirm at attacker。dev",
    "Confirm at attacker.\u200bdev",
    "Go to https://example.com/x",
    // A value can finish what the text started.
    "Confirm at attacker.{{brand}}",
    "Confirm at {{attendee_first_name}}.dev",
  ])("%s is refused", async (message) => {
    const s = await setUp();
    await expect(saving(s, { message })).rejects.toThrow(/link/);
    await expect(saving(s, { subject: message })).rejects.toThrow(/link/);
  });

  test("ordinary sentences aren't links", async () => {
    const s = await setUp();
    await saving(s, {
      subject: "See you at {{time}}, {{attendee_first_name}}.",
      message: "Dr. Reyes will meet you, e.g. in the lobby, at 9 a.m.\n\nSee you then.\nThanks.",
    });
  });
});

describe("what a list can be", () => {
  test("every timing gets a key that can be sent back, and what's returned can be", () => {
    const list = Reminders.parse([
      { anchor: "start", before_minutes: 60, send: ["email_attendee"] },
      { anchor: "start", after_minutes: 5, send: ["webhook"] },
      { anchor: "end", after_minutes: 60, send: ["email_attendee"] },
      { anchor: "end", before_minutes: 5, send: ["webhook"] },
      { anchor: "confirmed", send: ["email_host"] },
      { anchor: "no_show", after_minutes: 15, send: ["email_attendee"] },
      {
        anchor: "cancelled",
        after_minutes: 60,
        send: ["webhook"],
        only_if: { metadata: { plan: "pro" } },
      },
    ]);
    const stored = normalizeReminders(list);
    expect(stored.map((found) => found.key)).toEqual([
      "start-60",
      "start-after-5",
      "end-after-60",
      "end-5",
      "confirmed-after-0",
      "no_show-after-15",
      "cancelled-after-60",
    ]);
    // What the API returns, and what the dashboard posts, is valid as it stands.
    const again = Reminders.safeParse(stored);
    expect(again.success ? [] : again.error.issues).toEqual([]);
    expect(normalizeReminders(again.data ?? [])).toEqual(stored);
  });

  test("at the start itself, a reminder goes out, in words that fit", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      reminders: [
        rule({ key: "now", anchor: "start", before_minutes: 0, send: ["email_attendee"] }),
      ],
    });
    const { booking } = await book(s);
    const n = await runAt(s, START);
    expect((await rows(s, booking.id)).find((row) => row.reminder_key === "now")?.outcome).toBe(
      "sent",
    );
    expect(subjects(n)).toContain("Happening now: Consultation");
  });
});

describe("screening a list", () => {
  test("each reminder is read on its own, so a long list can't hide one", async () => {
    const s = await setUp();
    const live: SchedulingEnvironment = { ...s.env, mode: "live" };
    const screened: string[] = [];
    const screen = async ({ text }: { text: string }) => {
      screened.push(text);
      return !text.includes("Free money");
    };
    const long = "See you soon, and thanks for booking. ".repeat(52).slice(0, 2000);
    const reminders = [
      ...Array.from({ length: 9 }, (_, index) =>
        rule({
          key: `r${index}`,
          anchor: "start",
          before_minutes: index + 1,
          send: ["email_attendee"],
          message: long,
        }),
      ),
      rule({
        key: "last",
        anchor: "start",
        before_minutes: 30,
        send: ["email_attendee"],
        message: "Free money",
      }),
    ];
    await expect(
      updateSettings(
        live,
        { email_from: "appointments@example.com", reminders },
        { screen, verifiedAddress: async () => true },
      ),
    ).rejects.toThrow(/phishing or spam/);
    expect(screened.length).toBe(10);
    // The most a classifier would be handed at once is under what it reads (8,000 characters).
    expect(Math.max(...screened.map((text) => text.length))).toBeLessThan(8000);
  });
});

describe("the location a reminder is limited to", () => {
  test("a Meet booking is still a Meet booking once its link exists", async () => {
    const s = await setUp({ locations: [{ type: "google_meet" }] });
    await updateSettings(s.env, {
      reminders: [
        rule({
          key: "meet",
          anchor: "end",
          after_minutes: 60,
          send: ["webhook"],
          only_if: { location_types: ["google_meet"] },
        }),
      ],
    });
    const { booking } = await book(s);
    await db
      .update(schema.schedulingBooking)
      .set({
        location: {
          type: "link",
          url: "https://meet.google.com/abc",
          conference: "google_meet",
        } as never,
      })
      .where(eq(schema.schedulingBooking.id, booking.id));
    await runAt(s, END + 60 * MINUTE);
    expect((await rows(s, booking.id)).find((row) => row.reminder_key === "meet")?.outcome).toBe(
      "sent",
    );
  });
});

describe("the location of a group session", () => {
  test("is what the session asked for, once it has a meeting link", async () => {
    const s = await setUp({ kind: "group", capacity: 5 });
    await updateSettings(s.env, {
      reminders: [
        rule({
          key: "meet",
          anchor: "end",
          after_minutes: 60,
          send: ["webhook"],
          only_if: { location_types: ["google_meet"] },
        }),
      ],
    });
    const { booking } = await book(s);
    const [row] = await db
      .select({ session: schema.schedulingBooking.groupSessionId })
      .from(schema.schedulingBooking)
      .where(eq(schema.schedulingBooking.id, booking.id));
    await db
      .update(schema.schedulingGroupSession)
      .set({ location: { type: "google_meet" }, meetingUrl: "https://meet.google.com/abc" })
      .where(eq(schema.schedulingGroupSession.id, row?.session as string));
    await runAt(s, END + 60 * MINUTE);
    expect(
      (await rows(s, booking.id)).find((found) => found.reminder_key === "meet")?.outcome,
    ).toBe("sent");
  });
});

describe("clearing a policy", () => {
  const scope = (s: Setup) => ({ scope: { organizationIds: [s.env.organizationId] } });

  test("brings the default reminder back to existing bookings", async () => {
    const s = await setUp({ notifications: { reminder: { email_attendee: false } } });
    const { booking } = await book(s);
    expect((await rows(s, booking.id)).some((row) => row.reminder_key === "reminder")).toBe(false);
    await updateEventType(s.env, s.eventType.id, { notifications: null });
    await runDueReminderSyncs({ now: () => NOW }, scope(s));
    expect((await rows(s, booking.id)).some((row) => row.reminder_key === "reminder")).toBe(true);
  });

  test("on the environment too", async () => {
    const s = await setUp();
    await updateSettings(s.env, { notifications: { reminder: { email_attendee: false } } });
    const { booking } = await book(s);
    await updateSettings(s.env, { notifications: null });
    await runDueReminderSyncs({ now: () => NOW }, scope(s));
    expect((await rows(s, booking.id)).some((row) => row.reminder_key === "reminder")).toBe(true);
  });
});

describe("the standard words", () => {
  const sendsAt = async (s: Setup, when: number, match: string) => {
    const n = await runAt(s, when);
    return n.emails.filter((email) => email.subject.startsWith(match));
  };

  test("say what's true when it goes out, whatever it's timed from", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      email_from: "appointments@example.com",
      reminders: [
        // Half an hour before this half-hour meeting starts.
        rule({ key: "early", anchor: "end", before_minutes: 60, send: ["email_attendee"] }),
        // An hour after it's over.
        rule({ key: "late", anchor: "start", after_minutes: 90, send: ["email_attendee"] }),
        // During it.
        rule({ key: "during", anchor: "start", after_minutes: 10, send: ["email_host"] }),
      ],
    });
    await book(s);
    expect(await sendsAt(s, START - 30 * MINUTE, "Reminder:")).toHaveLength(1);
    expect(await sendsAt(s, START + 10 * MINUTE, "Happening now:")).toHaveLength(1);
    const after = await sendsAt(s, START + 90 * MINUTE, "Follow-up:");
    expect(after).toHaveLength(1);
    expect(after[0]?.text).toContain("Thanks for your time.");
  });

  test("the same goes for a text", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      sms_from: "+15005550006",
      reminders: [rule({ key: "text", anchor: "end", before_minutes: 60, send: ["sms_attendee"] })],
    } as never);
    await book(s);
    const n = await runAt(s, START - 30 * MINUTE);
    expect(n.texts[0]?.body).toContain("Reminder: Consultation");
  });
});

describe("languages", () => {
  const german = { ...attendee, locale: "de-DE" };
  const follow = { key: "follow", anchor: "end", after_minutes: 60, send: ["email_attendee"] };

  test("the standard words follow the recipient, whatever the reminder's timing", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      reminders: [
        rule(follow),
        rule({ key: "now", anchor: "start", after_minutes: 0, send: ["email_attendee"] }),
      ],
    });
    await book(s, "09:00", { attendee: german });
    const started = await runAt(s, START);
    const happening = started.emails.find((email) => email.subject.includes("jetzt"));
    expect(happening?.subject).toBe("Findet jetzt statt: Consultation");
    expect(happening?.text).toContain("Dieser Termin findet jetzt statt.");
    expect(happening?.text).toContain("Wann");
    // Fixed copy too: what coss.com's address sends is no less theirs to read.
    expect(happening?.cossSubject).toBe("Findet jetzt statt: Consultation");
    expect(happening?.cossHtml).toContain('lang="de"');

    const finished = await runAt(s, END + 60 * MINUTE);
    const after = finished.emails.find((email) => email.subject.startsWith("Nachbereitung"));
    expect(after?.text).toContain("Danke für Ihre Zeit.");
  });

  test("a customer's words stay as written, with ours around them translated", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      email_from: "appointments@example.com",
      reminders: [
        rule({
          ...follow,
          subject: "How did it go?",
          message: "Due {{date}}, {{time_until}}. Thanks, {{attendee_first_name}}.",
        }),
      ],
    });
    await book(s, "09:00", { attendee: { ...german, name: "attacker。dev" } });
    const n = await runAt(s, END + 60 * MINUTE);
    const email = n.emails.find((message) => message.subject === "How did it go?");
    expect(email?.text).toContain("Thanks, zusammen.");
    expect(email?.text).toContain("Wann");
    expect(email?.html).toContain('lang="de"');
    expect(email?.cossSubject).toStartWith("Nachbereitung");
  });

  test("a host reads theirs, and a fixed address the first host's", async () => {
    const s = await setUp();
    await updateHost(s.env, s.host.id, { locale: "fr-FR" } as never);
    await updateSettings(s.env, {
      email_from: "appointments@example.com",
      reminders: [
        rule({
          key: "desk",
          anchor: "start",
          before_minutes: 60,
          send: ["email_host"],
          email_to: ["desk@example.com"],
        }),
      ],
    });
    await book(s);
    const n = await runAt(s, START - 60 * MINUTE);
    const host = n.emails.find(
      (email) => email.to === "reyes@example.com" && email.subject.startsWith("Rappel"),
    );
    const desk = n.emails.find((email) => email.to === "desk@example.com");
    expect(host?.text).toContain("en tant qu'hôte");
    expect(desk?.subject).toStartWith("Rappel");
    expect(desk?.text).toContain("au sujet d'une réservation");
  });

  test("a guest reads their own, the attendee's locale", async () => {
    const s = await setUp({ max_guests: 2 });
    await updateSettings(s.env, {
      email_from: "appointments@example.com",
      reminders: [rule(follow)],
    });
    await book(s, "09:00", {
      attendee: german,
      guests: [{ email: "guest@example.com" }],
    });
    const n = await runAt(s, END + 60 * MINUTE);
    const guest = n.emails.find(
      (email) => email.to === "guest@example.com" && email.subject.startsWith("Nachbereitung"),
    );
    expect(guest?.text).toContain("als Gast");
  });

  test("a text is written in its recipient's language, with STOP as the keyword", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      sms_from: "+15005550006",
      reminders: [
        rule({ key: "text", anchor: "start", before_minutes: 60, send: ["sms_attendee"] }),
      ],
    } as never);
    await book(s, "09:00", { attendee: { ...german, phone: "+15005550007" } });
    const n = await runAt(s, START - 60 * MINUTE);
    const body = n.texts[0]?.body ?? "";
    expect(body).toContain("Erinnerung: Consultation");
    expect(body).toContain("STOP");
    expect(body).not.toContain("Reply STOP");
  });

  test("a date and a time until it follow the words around them", async () => {
    const t = 1_800_000_000_000;
    expect(timeUntil(t + 60 * MINUTE, t, "de-DE")).toBe("in 1 Stunde");
    expect(timeUntil(t + 72 * 60 * MINUTE, t, "de-DE")).toBe("in 3 Tagen");
    expect(timeUntil(t - MINUTE, t, "de-DE")).toBe("jetzt");
    // A language with no catalog gets English, so a message isn't half of each.
    expect(timeUntil(t + 60 * MINUTE, t, "ar-EG")).toBe("in 1 hour");
  });
});

describe("the migration, for bookings from before this", () => {
  const statements = readFileSync(
    new URL("../../db/migrations/0136_scheduling_reminder_backfill.sql", import.meta.url),
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim().replace(/;$/, ""));

  /** The migration's own statements, narrowed to one organization of this shared database. */
  const migrate = async (s: Setup) => {
    const [update, seed] = statements as [string, string];
    await db.execute(sql.raw(`${update} AND n."organization_id" = '${s.env.organizationId}'`));
    await db.execute(sql.raw(`${seed} AND b."organization_id" = '${s.env.organizationId}'`));
  };

  /** A booking as the code before this left it: an old reminder row, and nothing for its moments. */
  const oldBooking = async (s: Setup) => {
    const { booking } = await book(s);
    const notifications = schema.schedulingNotification;
    await db
      .delete(notifications)
      .where(
        and(
          eq(notifications.bookingId, booking.id),
          inArray(notifications.kind, ["started", "ended"]),
        ),
      );
    const [stored] = await db
      .select({ version: schema.schedulingBooking.version })
      .from(schema.schedulingBooking)
      .where(eq(schema.schedulingBooking.id, booking.id));
    await db
      .update(notifications)
      .set({
        reminderKey: null,
        reminderAnchor: null,
        reminderOffsetMinutes: null,
        anchorAt: null,
        dedupeKey: `reminder:email:attendee:${booking.id}:${stored?.version}`,
      })
      .where(and(eq(notifications.bookingId, booking.id), eq(notifications.kind, "reminder")));
    return booking;
  };

  const scope = (s: Setup) => ({ scope: { organizationIds: [s.env.organizationId] } });

  test("gives old bookings their moments, and their reminder goes out once", async () => {
    const s = await setUp();
    const booking = await oldBooking(s);
    await migrate(s);
    expect(await runDueReminderSyncs({ now: () => NOW }, scope(s))).toBe(1);
    const found = await rows(s, booking.id);
    expect(found.filter((row) => row.kind === "started").length).toBe(1);
    expect(found.filter((row) => row.kind === "ended").length).toBe(1);
    const reminders = found.filter((row) => row.reminder_key === "reminder");
    expect(reminders.map((row) => row.outcome)).toEqual([null]);
    const n = await runAt(s, START - 1440 * MINUTE);
    expect(subjects(n).filter(isReminder)).toEqual(["Reminder: Consultation"]);
  });

  test("a reminder due as the walk reaches it isn't dropped", async () => {
    const s = await setUp();
    const booking = await oldBooking(s);
    await migrate(s);
    const when = START - 1439 * MINUTE;
    await runDueReminderSyncs({ now: () => new Date(when) }, scope(s));
    const reminder = (await rows(s, booking.id)).find((row) => row.reminder_key === "reminder");
    expect(reminder?.outcome).toBeNull();
    expect(subjects(await runAt(s, when + MINUTE)).filter(isReminder).length).toBe(1);
  });

  test("makes the key the rule makes, so nothing's queued twice", async () => {
    const s = await setUp();
    const { booking: fresh } = await book(s, "11:00");
    const notifications = schema.schedulingNotification;
    const key = async (bookingId: string) => {
      const [row] = await db
        .select({ dedupeKey: notifications.dedupeKey })
        .from(notifications)
        .where(and(eq(notifications.bookingId, bookingId), eq(notifications.kind, "reminder")));
      return row?.dedupeKey;
    };
    const planned = await key(fresh.id);
    const old = await oldBooking(s);
    await migrate(s);
    expect(await key(old.id)).toBe(
      (planned as string).replace(fresh.id, old.id).replace(String(at("11:00")), String(START)),
    );
  });

  test("an environment with nothing upcoming gets no walk", async () => {
    const s = await setUp();
    await migrate(s);
    const syncs = await db
      .select()
      .from(schema.schedulingReminderSync)
      .where(eq(schema.schedulingReminderSync.organizationId, s.env.organizationId));
    expect(syncs).toEqual([]);
  });
});

describe("retrying fixed addresses", () => {
  test("a list reordered before the retry doesn't swap who was done", async () => {
    const s = await setUp();
    const first = rule({
      key: "desk",
      anchor: "start",
      before_minutes: 30,
      email_to: ["a@example.com", "b@example.com"],
    });
    await updateSettings(s.env, { reminders: [first] });
    await book(s);
    const when = START - 30 * MINUTE;
    const delivered = new Map<string, string>();
    const n = notifier(() => new Date(when));
    n.notification.notifier.email = async (message) => {
      if (!isReminder(message.subject)) return;
      if (message.to === "b@example.com") throw new Error("provider down");
      delivered.set(message.idempotencyKey, message.to);
    };
    await runDueSchedulingNotifications(n.notification, {
      scope: { organizationIds: [s.env.organizationId] },
    });
    expect([...delivered.values()]).toEqual(["a@example.com"]);

    await updateSettings(s.env, {
      reminders: [
        rule({
          key: "desk",
          anchor: "start",
          before_minutes: 30,
          email_to: ["b@example.com", "a@example.com"],
        }),
      ],
    });
    const retry = notifier(() => new Date(when + 5 * MINUTE));
    const asked: [string, string][] = [];
    retry.notification.notifier.email = async (message) => {
      if (isReminder(message.subject)) asked.push([message.to, message.idempotencyKey]);
    };
    await runDueSchedulingNotifications(retry.notification, {
      scope: { organizationIds: [s.env.organizationId] },
    });
    // A's key is the one already delivered, so the real notifier skips it; B's is new.
    const keyOf = (to: string) => asked.find(([address]) => address === to)?.[1] as string;
    expect(delivered.get(keyOf("a@example.com"))).toBe("a@example.com");
    expect(delivered.has(keyOf("b@example.com"))).toBe(false);
  });
});

describe("a rule edited onto another moment", () => {
  test("a reminder that lands where an old one was still goes out", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      reminders: [
        rule({ key: "nudge", anchor: "start", before_minutes: 10, send: ["email_attendee"] }),
      ],
    });
    const { booking } = await book(s, "10:00");
    await updateSettings(s.env, {
      reminders: [
        rule({ key: "nudge", anchor: "end", before_minutes: 10, send: ["email_attendee"] }),
      ],
    });
    // Its end is now the moment its old reminder was timed from.
    await rescheduleBooking(s.env, booking.id, { startMs: at("09:30") }, deps, actor);
    const n = await runAt(s, at("10:00") - 10 * MINUTE);
    expect(subjects(n)).toContain("Happening now: Consultation");
    const row = (await rows(s, booking.id)).find(
      (found) => found.reminder_key === "nudge" && found.outcome === "sent",
    );
    expect(row).toBeDefined();
  });
});

describe("reading what's queued", () => {
  test("goes a page at a time, and says when there's more", async () => {
    const s = await setUp();
    const { booking } = await book(s);
    const first = await listBookingNotifications(s.env, booking.id, { limit: 2 });
    expect(first.data.length).toBe(2);
    expect(first.hasMore).toBe(true);
    const seen = new Set(first.data.map((row) => row.id));
    let after = first.data.at(-1)?.id;
    for (let hasMore = true; hasMore; ) {
      const next = await listBookingNotifications(s.env, booking.id, { limit: 2, after });
      for (const row of next.data) {
        expect(seen.has(row.id)).toBe(false);
        seen.add(row.id);
      }
      after = next.data.at(-1)?.id;
      hasMore = next.hasMore;
    }
    const all = await listBookingNotifications(s.env, booking.id, { limit: 100 });
    expect(seen.size).toBe(all.data.length);
    expect(all.hasMore).toBe(false);
  });
});

describe("a waiting reminder whose timing is edited", () => {
  const confirmedRule = (after_minutes: number) =>
    rule({ key: "welcome", anchor: "confirmed", after_minutes, send: ["email_attendee"] });
  const outcome = async (s: Setup, id: string) =>
    (await rows(s, id)).find((row) => row.reminder_key === "welcome");

  test("waits for the later moment, and goes once", async () => {
    const s = await setUp();
    await updateSettings(s.env, { reminders: [confirmedRule(10)] });
    const { booking } = await book(s);
    await updateSettings(s.env, { reminders: [confirmedRule(20)] });
    await runAt(s, NOW.getTime() + 10 * MINUTE);
    const moved = await outcome(s, booking.id);
    expect(moved?.outcome).toBeNull();
    expect(moved?.due_at).toBe(new Date(NOW.getTime() + 20 * MINUTE).toISOString());
    await runAt(s, NOW.getTime() + 20 * MINUTE);
    expect((await outcome(s, booking.id))?.outcome).toBe("sent");
  });

  test("goes when it comes due, if it's been made sooner", async () => {
    const s = await setUp();
    await updateSettings(s.env, { reminders: [confirmedRule(20)] });
    const { booking } = await book(s);
    await updateSettings(s.env, { reminders: [confirmedRule(10)] });
    await runAt(s, NOW.getTime() + 20 * MINUTE);
    expect((await outcome(s, booking.id))?.outcome).toBe("sent");
  });

  test("a follow-up to a meeting that's over keeps going, at its new time", async () => {
    const s = await setUp();
    const followUp = (after_minutes: number) =>
      rule({ key: "welcome", anchor: "end", after_minutes, send: ["email_attendee"] });
    await updateSettings(s.env, { reminders: [followUp(1440)] });
    const { booking } = await book(s);
    await updateSettings(s.env, { reminders: [followUp(2880)] });
    // The walk leaves ended bookings alone, so it's only this row that can carry on.
    await runDueReminderSyncs(
      { now: () => new Date(END + 60 * MINUTE) },
      { scope: { organizationIds: [s.env.organizationId] } },
    );
    await runAt(s, END + 1440 * MINUTE);
    const moved = await outcome(s, booking.id);
    expect(moved?.outcome).toBeNull();
    expect(moved?.due_at).toBe(new Date(END + 2880 * MINUTE).toISOString());
    await runAt(s, END + 2880 * MINUTE);
    expect((await outcome(s, booking.id))?.outcome).toBe("sent");
  });

  test("saved as the dashboard saves it, with its key, it keeps going", async () => {
    const s = await setUp();
    const generated = (after_minutes: number) =>
      rule({
        key: "confirmed-after-60",
        anchor: "confirmed",
        after_minutes,
        send: ["email_attendee"],
      });
    await updateSettings(s.env, { reminders: [generated(60)] });
    const { booking } = await book(s);
    await updateSettings(s.env, { reminders: [generated(120)] });
    await runAt(s, NOW.getTime() + 60 * MINUTE);
    await runAt(s, NOW.getTime() + 120 * MINUTE);
    const found = (await rows(s, booking.id)).filter(
      (row) => row.reminder_key === "confirmed-after-60",
    );
    expect(found.map((row) => row.outcome)).toEqual(["sent"]);
  });

  test("goes to whoever it's for by then", async () => {
    const s = await setUp();
    const to = (send: string[], email_to: string[] = []) =>
      rule({ key: "welcome", anchor: "confirmed", after_minutes: 60, send, email_to });
    await updateSettings(s.env, { reminders: [to(["email_attendee"])] });
    const { booking } = await book(s);
    await updateSettings(s.env, { reminders: [to(["email_host"], ["desk@example.com"])] });
    const n = await runAt(s, NOW.getTime() + 60 * MINUTE);
    const welcome = (await rows(s, booking.id)).filter((row) => row.reminder_key === "welcome");
    expect(welcome.map((row) => [row.recipient, row.outcome]).sort()).toEqual([
      ["address", "sent"],
      ["attendee", "stale"],
      ["host", "sent"],
    ]);
    // Everyone's standard confirmation went out too: the attendee had only that.
    const countTo = (to: string) => n.emails.filter((email) => email.to === to).length;
    expect(countTo("desk@example.com")).toBe(1);
    expect(countTo("reyes@example.com")).toBe(2);
    expect(countTo(attendee.email)).toBe(1);
  });

  test("an edit that keeps who it's for sends it once, not once for each timing", async () => {
    const s = await setUp();
    await updateSettings(s.env, { reminders: [confirmedRule(10)] });
    const { booking } = await book(s);
    await updateSettings(s.env, { reminders: [confirmedRule(20)] });
    await runAt(s, NOW.getTime() + 10 * MINUTE);
    const n = await runAt(s, NOW.getTime() + 20 * MINUTE);
    expect((await rows(s, booking.id)).filter((row) => row.reminder_key === "welcome").length).toBe(
      1,
    );
    expect(n.emails.filter((email) => email.to === attendee.email).length).toBe(1);
  });

  test("a webhook takes the new timing too", async () => {
    const s = await setUp();
    const hook = (after_minutes: number) =>
      rule({ key: "welcome", anchor: "confirmed", after_minutes, send: ["webhook"] });
    await updateSettings(s.env, { reminders: [hook(10)] });
    const { booking } = await book(s);
    await updateSettings(s.env, { reminders: [hook(20)] });
    await runAt(s, NOW.getTime() + 10 * MINUTE);
    expect((await outcome(s, booking.id))?.outcome).toBeNull();
    await runAt(s, NOW.getTime() + 20 * MINUTE);
    expect((await outcome(s, booking.id))?.outcome).toBe("sent");
  });
});

describe("a row moved while another worker holds it", () => {
  const key = "welcome";
  const notifications = schema.schedulingNotification;
  const rowOf = async (bookingId: string) => {
    const [row] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.bookingId, bookingId), eq(notifications.reminderKey, key)));
    if (!row) throw new Error("no row");
    return row;
  };
  const moveLater = (id: string) =>
    db
      .update(notifications)
      .set({ dueAt: new Date(NOW.getTime() + 20 * MINUTE), reminderOffsetMinutes: 20 })
      .where(eq(notifications.id, id));

  test("a webhook isn't reported before its new moment", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      reminders: [rule({ key, anchor: "confirmed", after_minutes: 20, send: ["webhook"] })],
    });
    const { booking } = await book(s);
    const claimed = await rowOf(booking.id);
    await moveLater(claimed.id);
    await sendTimedWebhook(claimed, new Date(NOW.getTime() + 10 * MINUTE));
    expect((await rowOf(booking.id)).finishedAt).toBeNull();
    expect((await webhookMessages(s)).some((e) => e.type === "scheduling.booking.reminder")).toBe(
      false,
    );
  });

  test("an email already claimed in the same batch waits for it too", async () => {
    const s = await setUp();
    await updateSettings(s.env, {
      email_from: "appointments@example.com",
      reminders: [
        rule({
          key,
          anchor: "confirmed",
          after_minutes: 1,
          send: ["email_attendee"],
          message: "Welcome.",
        }),
      ],
    });
    const { booking } = await book(s);
    const row = await rowOf(booking.id);
    const n = notifier(() => new Date(NOW.getTime() + 10 * MINUTE));
    const send = n.notification.notifier.email;
    let moved = false;
    // The confirmation goes first, due sooner: by then this worker has claimed the reminder too.
    n.notification.notifier.email = async (message) => {
      if (!moved) {
        moved = true;
        await moveLater(row.id);
      }
      return send(message);
    };
    await runDueSchedulingNotifications(n.notification, {
      scope: { organizationIds: [s.env.organizationId] },
    });
    expect(moved).toBe(true);
    expect(n.emails.some((email) => email.text.includes("Welcome."))).toBe(false);
    expect((await rowOf(booking.id)).finishedAt).toBeNull();
  });
});
