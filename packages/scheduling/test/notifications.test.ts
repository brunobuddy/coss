import { describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { eq, sql } from "drizzle-orm";
import {
  authenticateSchedulingSession,
  cancelBooking,
  confirmHold,
  createBooking,
  createEventType,
  createHold,
  createHost,
  createHostSession,
  createSchedule,
  deleteHold,
  type NotificationDeps,
  rescheduleBooking,
  resolvePolicy,
  runDueSchedulingNotifications,
  type SchedulingEmail,
  type SchedulingEnvironment,
  SchedulingError,
  type SchedulingSms,
  updateEventType,
  updateHost,
  updateSettings,
} from "../src/index.ts";
import { testSchedulingDeps } from "../src/testing.ts";

const ms = Date.parse;
const at = (time: string, date = "2031-01-06") => ms(`${date}T${time}:00Z`);
const NOW = new Date(at("00:00", "2031-01-01"));
const deps = testSchedulingDeps({ now: () => NOW });
const actor = { kind: "system" } as const;
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

function notifier(clock: () => Date = () => NOW) {
  const emails: SchedulingEmail[] = [];
  const texts: SchedulingSms[] = [];
  const failNext = { count: 0 };
  const notification: NotificationDeps = {
    dataKeys: deps.dataKeys,
    publicUrl: "https://book.example.test",
    now: clock,
    notifier: {
      email: async (message) => {
        if (failNext.count > 0) {
          failNext.count--;
          throw new Error("provider down");
        }
        emails.push(message);
      },
      sms: async (message) => {
        texts.push(message);
      },
    },
  };
  return { emails, texts, notification, failNext };
}

const run = (env: SchedulingEnvironment, notification: NotificationDeps) =>
  runDueSchedulingNotifications(notification, { scope: { organizationIds: [env.organizationId] } });

const book = (s: Awaited<ReturnType<typeof setUp>>, time = "09:00") =>
  createBooking(s.env, { eventType: s.eventType.id, startMs: at(time), attendee }, deps, actor);

describe("policy", () => {
  test("defaults, then the environment, then the event type", () => {
    expect(resolvePolicy("confirmed", null, null)).toEqual({
      emailAttendee: true,
      emailHost: true,
    });
    expect(resolvePolicy("confirmed", { confirmed: { emailHost: false } }, null)).toEqual({
      emailAttendee: true,
      emailHost: false,
    });
    expect(
      resolvePolicy(
        "confirmed",
        { confirmed: { emailHost: false } },
        { confirmed: { emailHost: true, smsAttendee: true } },
      ),
    ).toEqual({ emailAttendee: true, emailHost: true, smsAttendee: true });
  });
});

describe("booking emails", () => {
  test("attendee and host each hear, in their own time zone, with an invitation", async () => {
    const s = await setUp();
    await book(s);
    const { emails, notification } = notifier();
    await run(s.env, notification);
    const toAttendee = emails.find((email) => email.to === "sam@example.com");
    const toHost = emails.find((email) => email.to === "reyes@example.com");
    expect(toAttendee?.subject).toBe("Confirmed: Consultation");
    expect(toAttendee?.text).toContain("4:00 AM");
    expect(toHost?.text).toContain("9:00 AM");
    expect(toAttendee?.ics?.method).toBe("REQUEST");
    expect(toAttendee?.ics?.content).toContain("DTSTART:20310106T090000Z");
  });

  test("the attendee's email has a working manage link; the host's has none", async () => {
    const s = await setUp();
    const { booking } = await book(s);
    const { emails, notification } = notifier();
    await run(s.env, notification);
    const toAttendee = emails.find((email) => email.to === "sam@example.com");
    const match = /https:\/\/book\.example\.test\/m\/(schs_[^#\s"]+)#([^\s"<]+)/.exec(
      toAttendee?.text ?? "",
    );
    expect(match).not.toBeNull();
    const authenticated = await authenticateSchedulingSession(match?.[2] as string, NOW);
    expect(authenticated.session.bookingId).toBe(booking.id);
    expect(authenticated.session.kind).toBe("manage");
    const toHost = emails.find((email) => email.to === "reyes@example.com");
    expect(toHost?.text).not.toContain("/m/");
  });

  test("a cancellation stops the manage link working", async () => {
    const s = await setUp();
    const { booking } = await book(s);
    const { emails, notification } = notifier();
    await run(s.env, notification);
    const text = emails.find((email) => email.to === "sam@example.com")?.text ?? "";
    const token = /#(cossch_[^\s"<]+)/.exec(text)?.[1] as string;
    await cancelBooking(s.env, booking.id, deps, actor);
    expect(authenticateSchedulingSession(token, NOW)).rejects.toBeInstanceOf(SchedulingError);
  });

  test("it can't be sent twice, even if a worker dies after sending", async () => {
    const s = await setUp();
    await book(s);
    const { emails, notification } = notifier();
    await run(s.env, notification);
    const keys = emails.map((email) => email.idempotencyKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => key.startsWith("scheduling:"))).toBe(true);
    const again = emails.length;
    await run(s.env, notification);
    expect(emails.length).toBe(again);
  });

  test("a hold tells nobody, and releasing it neither", async () => {
    const s = await setUp();
    const { booking } = await createHold(
      s.env,
      { eventType: s.eventType.id, startMs: at("09:00"), attendee },
      deps,
      actor,
    );
    const { emails, notification } = notifier();
    await run(s.env, notification);
    expect(emails).toEqual([]);
    await deleteHold(s.env, booking.id, deps, actor);
    await run(s.env, notification);
    expect(emails).toEqual([]);
  });

  test("confirming a hold tells them then", async () => {
    const s = await setUp();
    const { booking } = await createHold(
      s.env,
      { eventType: s.eventType.id, startMs: at("09:00"), attendee },
      deps,
      actor,
    );
    await confirmHold(s.env, booking.id, {}, deps, actor);
    const { emails, notification } = notifier();
    await run(s.env, notification);
    expect(emails.some((email) => email.subject === "Confirmed: Consultation")).toBe(true);
  });

  test("cancelling sends a CANCEL invitation", async () => {
    const s = await setUp();
    const { booking } = await book(s);
    const { emails, notification } = notifier();
    await run(s.env, notification);
    await cancelBooking(s.env, booking.id, deps, actor);
    await run(s.env, notification);
    const cancelled = emails.find((email) => email.subject === "Cancelled: Consultation");
    expect(cancelled?.ics?.method).toBe("CANCEL");
    expect(cancelled?.ics?.content).toContain("STATUS:CANCELLED");
  });

  test("policy can turn the host's email off", async () => {
    const s = await setUp();
    await updateSettings(s.env, { notifications: { confirmed: { email_host: false } } });
    await book(s);
    const { emails, notification } = notifier();
    await run(s.env, notification);
    expect(emails.map((email) => email.to)).toEqual(["sam@example.com"]);
  });

  test("an attendee with no address just isn't told", async () => {
    const s = await setUp();
    await createBooking(
      s.env,
      { eventType: s.eventType.id, startMs: at("09:00"), attendee: { uid: "p", time_zone: "UTC" } },
      deps,
      actor,
    );
    const { emails, notification } = notifier();
    await run(s.env, notification);
    expect(emails.map((email) => email.to)).toEqual(["reyes@example.com"]);
    const { rows } = await db.execute(
      sql`select outcome from scheduling_notification where environment_id = ${s.env.environmentId} and recipient = 'attendee' and kind = 'confirmed'`,
    );
    expect((rows[0] as { outcome: string }).outcome).toBe("no_address");
  });

  test("a failure retries, with backoff", async () => {
    const s = await setUp();
    await book(s);
    const { emails, notification, failNext } = notifier();
    failNext.count = 1;
    await run(s.env, notification);
    const before = emails.length;
    const later = notifier(() => new Date(NOW.getTime() + 120_000));
    await run(s.env, later.notification);
    expect(before + later.emails.length).toBe(2);
  });
});

describe("reminders", () => {
  const dayBefore = () => new Date(at("09:00") - 24 * 3_600_000 + 1000);

  test("go out a day before, and not to someone who cancelled", async () => {
    const s = await setUp();
    const { booking } = await book(s);
    const first = notifier();
    await run(s.env, first.notification);
    expect(first.emails.some((email) => email.subject.startsWith("Reminder"))).toBe(false);
    const later = notifier(dayBefore);
    await run(s.env, later.notification);
    expect(later.emails.map((email) => email.subject)).toEqual(["Reminder: Consultation"]);

    const other = await setUp();
    const { booking: gone } = await book(other);
    await cancelBooking(other.env, gone.id, deps, actor);
    const cancelled = notifier(dayBefore);
    await run(other.env, cancelled.notification);
    expect(cancelled.emails.some((email) => email.subject.startsWith("Reminder"))).toBe(false);
    expect(booking.id).toBeTruthy();
  });

  test("a moved booking's old reminder is dropped; the new one stands", async () => {
    const s = await setUp();
    const { booking } = await book(s);
    await rescheduleBooking(s.env, booking.id, { startMs: at("09:00", "2031-01-20") }, deps, actor);
    const oldTime = notifier(dayBefore);
    await run(s.env, oldTime.notification);
    expect(oldTime.emails.filter((email) => email.subject.startsWith("Reminder"))).toEqual([]);
    const newTime = notifier(() => new Date(at("09:00", "2031-01-20") - 24 * 3_600_000 + 1000));
    await run(s.env, newTime.notification);
    expect(newTime.emails.filter((email) => email.subject.startsWith("Reminder")).length).toBe(1);
  });

  test("SMS is opt-in, and needs the customer's own number", async () => {
    const s = await setUp();
    await updateSettings(s.env, { notifications: { confirmed: { sms_attendee: true } } });
    await book(s);
    const noNumber = notifier();
    await run(s.env, noNumber.notification);
    expect(noNumber.texts).toEqual([]);

    const s2 = await setUp();
    await updateSettings(s2.env, {
      sms_from: "+15550001111",
      brand_name: "Acme Health",
      notifications: { confirmed: { sms_attendee: true } },
    });
    await book(s2);
    const withNumber = notifier();
    await run(s2.env, withNumber.notification);
    expect(withNumber.texts.length).toBe(1);
    expect(withNumber.texts[0]?.body).toContain("Acme Health");
    expect(withNumber.texts[0]?.body).toContain("STOP");
    expect(withNumber.texts[0]?.body).not.toContain("Sam");
  });
});

describe("meeting links", () => {
  test("a confirmation waits for a Meet link, then goes without", async () => {
    const s = await setUp({ locations: [{ type: "google_meet" }] });
    await createBooking(
      s.env,
      { eventType: s.eventType.id, startMs: at("09:00"), attendee },
      testSchedulingDeps(),
      actor,
    );
    const early = notifier(() => new Date(Date.now() + 1000));
    await run(s.env, early.notification);
    expect(early.emails).toEqual([]);
    const late = notifier(() => new Date(Date.now() + 10 * 60_000));
    await run(s.env, late.notification);
    expect(late.emails.length).toBe(2);
  });
});

describe("what's in them", () => {
  test("the customer's name is on top only under their own address", async () => {
    const own = await setUp();
    await updateSettings(own.env, { email_from: "bookings@acme.test", brand_name: "Acme Health" });
    await book(own);
    const branded = notifier();
    await run(own.env, branded.notification);
    expect(branded.emails.length).toBeGreaterThan(0);
    for (const email of branded.emails) {
      expect(email.html).not.toContain("wordmark.png");
      expect(email.html).toContain("Acme Health");
      // What coss.com's address falls back to when the customer's stops being verified.
      expect(email.cossHtml).toContain("wordmark.png");
    }

    const theirs = await setUp();
    await updateSettings(theirs.env, { brand_name: "Acme Health" });
    await book(theirs);
    const viaCoss = notifier();
    await run(theirs.env, viaCoss.notification);
    for (const email of viaCoss.emails) expect(email.html).toContain("wordmark.png");
  });

  test("no answers, ever", async () => {
    const s = await setUp({
      questions: [{ key: "reason", type: "text", label: "Reason", required: false, options: [] }],
    });
    await createBooking(
      s.env,
      {
        eventType: s.eventType.id,
        startMs: at("09:00"),
        attendee,
        answers: { reason: "chest pain" },
      },
      deps,
      actor,
    );
    const { emails, notification } = notifier();
    await run(s.env, notification);
    for (const email of emails) {
      expect(`${email.text}${email.html}${email.ics?.content}`).not.toContain("chest pain");
    }
  });

  test("text an abuser could use is refused at setup", async () => {
    const s = await setUp();
    const refused = testSchedulingDeps({ screenSetup: async () => false });
    const live = await (async () => {
      const tenant = await createTestTenant();
      return {
        organizationId: tenant.organization.id,
        projectId: tenant.project.id,
        environmentId: tenant.production.id,
        mode: "live" as const,
      };
    })();
    const code = (run: Promise<unknown>) =>
      run.then(
        () => "ok",
        (error: SchedulingError) => error.code,
      );
    expect(
      await code(
        createEventType(
          live,
          {
            title: "Your account is locked",
            kind: "one_on_one",
            duration_minutes: 30,
            hosts: [],
          } as never,
          { screen: refused.screenSetup },
        ),
      ),
    ).toBe("content_refused");
    expect(
      await code(
        createHost(
          live,
          { name: "Bank Security", time_zone: "UTC" },
          { screen: refused.screenSetup },
        ),
      ),
    ).toBe("content_refused");
    expect(
      await code(updateSettings(live, { brand_name: "Bank" }, { screen: refused.screenSetup })),
    ).toBe("content_refused");
    expect(
      await code(
        createEventType(s.env, {
          title: "Go to https://evil.example",
          kind: "one_on_one",
          duration_minutes: 30,
          hosts: [],
        } as never),
      ),
    ).toBe("content_refused");
    expect(await code(updateHost(s.env, s.host.id, { name: "evil.com" }))).toBe("content_refused");
    expect(await code(updateEventType(s.env, s.eventType.id, { title: "www.evil.example" }))).toBe(
      "content_refused",
    );
    // A sandbox isn't screened: nothing's delivered from it.
    expect(
      await code(
        createHost(s.env, { name: "Anything", time_zone: "UTC" }, { screen: refused.screenSetup }),
      ),
    ).toBe("ok");
  });
});

describe("sessions", () => {
  test("tokens are only ever stored hashed, and expire", async () => {
    const s = await setUp();
    const session = await createHostSession(s.env, {
      host: s.host.id,
      publicUrl: "https://book.example.test",
      now: NOW,
    });
    expect(session.url).toBe(`https://book.example.test/h/${session.id}#${session.token}`);
    const [row] = await db
      .select()
      .from(schema.schedulingSession)
      .where(eq(schema.schedulingSession.id, session.id));
    expect(row?.tokenHash).not.toContain(session.token);
    const found = await authenticateSchedulingSession(session.token, NOW);
    expect(found.session.hostId).toBe(s.host.id);
    expect(found.env.environmentId).toBe(s.env.environmentId);
    expect(
      authenticateSchedulingSession(session.token, new Date(NOW.getTime() + 2 * 3_600_000)),
    ).rejects.toBeInstanceOf(SchedulingError);
    expect(authenticateSchedulingSession("cossch_nonsense", NOW)).rejects.toBeInstanceOf(
      SchedulingError,
    );
    expect(authenticateSchedulingSession("something_else", NOW)).rejects.toBeInstanceOf(
      SchedulingError,
    );
  });
});
