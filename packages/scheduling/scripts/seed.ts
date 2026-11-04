/**
 * Scheduling demo data, after `@coss/tenancy`'s seed: hosts with weekly hours, event types and
 * bookings around today in `acme`'s environments. Re-running tops up upcoming bookings once the
 * last ones have passed. Refuses to run in production.
 */
import { createHash } from "node:crypto";
import { closeDb, db, schema } from "@coss/db";
import { and, eq, gte } from "drizzle-orm";
import {
  approveBooking,
  cancelBooking,
  createBooking,
  createEventType,
  createHost,
  createSchedule,
  listEventTypes,
  listHosts,
  markNoShow,
  type SchedulingDeps,
  type SchedulingEnvironment,
} from "../src/index.ts";
import { schedulingDataKeysFromEnv } from "../src/runtime.ts";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed scheduling data in production.");
  process.exit(1);
}

const dataKeys = schedulingDataKeysFromEnv(process.env);
if (!dataKeys) throw new Error("SCHEDULING_DATA_KEYS is missing.");
const baseDeps: SchedulingDeps = {
  dataKeys,
  lookupKey: createHash("sha256").update("scheduling dashboard").digest(),
};
const actor = { kind: "system" } as const;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const HOSTS = [
  { uid: "dana", name: "Dana Whitfield", time_zone: "America/New_York", utcHours: [15, 17, 19] },
  { uid: "marcus", name: "Marcus Okafor", time_zone: "Europe/London", utcHours: [10, 12, 15] },
  { uid: "priya", name: "Priya Raman", time_zone: "Asia/Kolkata", utcHours: [6.5, 8.5, 10.5] },
];
const ATTENDEES = [
  ["Sam Lee", "America/Chicago"],
  ["Noor Haddad", "Europe/Paris"],
  ["Tomás Rivera", "America/Mexico_City"],
  ["Ines Duarte", "Europe/Lisbon"],
  ["Kai Nakamura", "Asia/Tokyo"],
  ["Ruth Abara", "Africa/Lagos"],
  ["Leo Fischer", "Europe/Berlin"],
  ["Mina Park", "Asia/Seoul"],
] as const;

function attendee(index: number) {
  const [name, time_zone] = ATTENDEES[index % ATTENDEES.length] ?? ATTENDEES[0];
  const slug = name.toLowerCase().replace(/[^a-z]+/g, ".");
  return { uid: `user_${slug}`, name, email: `${slug}@example.com`, time_zone };
}

function weekdayAt(from: Date, offsetDays: number, utcHour: number): number {
  const date = new Date(from.getTime() + offsetDays * DAY_MS);
  date.setUTCHours(Math.floor(utcHour), (utcHour % 1) * 60, 0, 0);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setTime(date.getTime() + Math.sign(offsetDays || 1) * DAY_MS);
  }
  return date.getTime();
}

async function setUp(env: SchedulingEnvironment) {
  const existing = await listHosts(env, { limit: 50 });
  const hosts = [...existing.data];
  for (const { uid, name, time_zone } of HOSTS) {
    if (hosts.some((host) => host.uid === uid)) continue;
    const host = await createHost(env, { uid, name, time_zone });
    await createSchedule(env, host.id, {
      name: "Working hours",
      rules: [{ days: [1, 2, 3, 4, 5], start: "08:30", end: "18:00" }],
    });
    hosts.push(host);
  }
  if (!hosts.some((host) => host.uid === "sam")) {
    const disabled = await createHost(env, {
      uid: "sam",
      name: "Sam Ortiz",
      time_zone: "America/Los_Angeles",
    });
    await db
      .update(schema.schedulingHost)
      .set({ status: "disabled" })
      .where(eq(schema.schedulingHost.id, disabled.id));
    hosts.push(disabled);
  }
  const current = await listEventTypes(env, { limit: 50 });
  if (current.data.length > 0) return { hosts, eventTypes: current.data };

  const members = hosts
    .filter((host) => host.uid !== "sam")
    .map((host) => ({ host: host.id, role: "member" as const, weight: 100, schedule: null }));
  const eventType = (fields: Record<string, unknown>) =>
    createEventType(env, { kind: "pool", step_minutes: 15, hosts: members, ...fields } as never);
  const eventTypes = [
    await eventType({ uid: "intro", title: "Intro call", duration_minutes: 30 }),
    await eventType({
      uid: "demo",
      title: "Product demo",
      duration_minutes: 45,
      requires_approval: true,
      approval_ttl_minutes: 1440,
    }),
    await eventType({ uid: "review", title: "Account review", duration_minutes: 60 }),
  ];
  return { hosts, eventTypes };
}

async function seedEnvironment(env: SchedulingEnvironment, now: Date) {
  const { hosts, eventTypes } = await setUp(env);
  const upcoming = await db
    .select({ id: schema.schedulingBooking.id })
    .from(schema.schedulingBooking)
    .where(
      and(
        eq(schema.schedulingBooking.environmentId, env.environmentId),
        gte(schema.schedulingBooking.startAt, now),
      ),
    )
    .limit(1);
  if (upcoming.length > 0) return 0;

  const byUid = (uid: string) => eventTypes.find((row) => row.uid === uid);
  const [intro, demo, review] = [byUid("intro"), byUid("demo"), byUid("review")];
  if (!intro || !demo || !review) throw new Error("Seed event types are missing.");
  let created = 0;
  let next = 0;
  const book = async (
    eventType: string,
    offsetDays: number,
    hostIndex: number,
    hourIndex: number,
  ) => {
    const spec = HOSTS[hostIndex];
    const host = hosts.find((row) => row.uid === spec?.uid);
    if (!spec || !host) return null;
    const startMs = weekdayAt(now, offsetDays, spec.utcHours[hourIndex] ?? 12);
    const clock = new Date(Math.min(now.getTime(), startMs - DAY_MS));
    const { booking } = await createBooking(
      env,
      { eventType, startMs, host: host.id, attendee: attendee(next++) },
      { ...baseDeps, now: () => clock },
      actor,
    );
    created++;
    return booking;
  };

  await book(intro.id, 0, 0, 0).catch(() => null);
  await book(review.id, 0, 1, 2).catch(() => null);
  const conflicted = await book(intro.id, 1, 0, 1);
  if (conflicted) {
    await db
      .update(schema.schedulingBooking)
      .set({ externalConflictAt: now })
      .where(eq(schema.schedulingBooking.id, conflicted.id));
  }
  await book(intro.id, 1, 1, 0);
  await book(review.id, 1, 2, 1);
  await book(demo.id, 2, 0, 0);
  await book(demo.id, 3, 1, 1);
  await book(intro.id, 4, 2, 0);
  await book(review.id, 5, 0, 2);
  await book(intro.id, 7, 1, 2);

  await book(intro.id, -1, 0, 0);
  const noShow = await book(review.id, -2, 1, 1);
  if (noShow) await markNoShow(env, noShow.id, baseDeps, actor).catch(() => null);
  const approved = await book(demo.id, -3, 2, 0);
  if (approved) await approveBooking(env, approved.id, baseDeps, actor).catch(() => null);
  const cancelled = await book(intro.id, -4, 0, 2);
  if (cancelled) await cancelBooking(env, cancelled.id, baseDeps, actor).catch(() => null);
  return created;
}

const [org] = await db
  .select({ id: schema.organization.id })
  .from(schema.organization)
  .where(eq(schema.organization.slug, "acme"));
if (!org) {
  console.error("No `acme` organization: run the tenancy seed first.");
  process.exit(1);
}
const environments = await db
  .select({
    id: schema.environment.id,
    projectId: schema.environment.projectId,
    mode: schema.environment.mode,
    slug: schema.environment.slug,
  })
  .from(schema.environment)
  .where(eq(schema.environment.organizationId, org.id));

try {
  const now = new Date();
  for (const environment of environments) {
    const created = await seedEnvironment(
      {
        organizationId: org.id,
        projectId: environment.projectId,
        environmentId: environment.id,
        mode: environment.mode,
      },
      now,
    );
    console.info(`${environment.slug}: ${created} bookings seeded.`);
  }
} finally {
  await closeDb();
}
