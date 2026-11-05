// Test database only. Flags and what it measures: packages/scheduling/AGENTS.md, "Testing".
// First: points @coss/db at the test database (and refuses anything not named `*_test`).
import "@coss/db/testing";
import { cpus, loadavg } from "node:os";
import { createUsageGate } from "@coss/billing";
import { createTestContract } from "@coss/billing/testing";
import { db, pool, schema } from "@coss/db";
import { ID_PREFIXES, newId } from "@coss/db/id";
import {
  createBooking,
  createEventType,
  createHost,
  createSchedule,
  listBookings,
  listEventTypeSlots,
  loadHostInputs,
  type SchedulingEnvironment,
  SchedulingError,
  searchAvailability,
} from "@coss/scheduling";
import { listSlots } from "@coss/scheduling/engine";
import type { EventTypeObjectOutput } from "@coss/scheduling/schemas";
import { testSchedulingDeps } from "@coss/scheduling/testing";
import { createTestTenant } from "@coss/tenancy/testing";
import { eq, sql } from "drizzle-orm";

if (process.env.NODE_ENV === "production") throw new Error("Not in production.");

function option(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : Number(process.argv[index + 1]);
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

const hostCount = option("hosts", 500);
const days = option("days", 14);
const concurrency = option("concurrency", 32);
const bookings = option("bookings", 500);
const existingPerHost = option("existing", 20);
const busyPerHost = option("busy", 10);
const searches = option("searches", 30);
const races = option("races", 20);
const bigTableRows = option("big-table-rows", 5000);
const sandbox = process.argv.includes("--sandbox");
const capped = process.argv.includes("--capped");

const DAY_MS = 86_400_000;
const TIME_ZONES = ["UTC", "America/New_York", "Europe/London", "Asia/Tokyo", "America/Vancouver"];
const WEEKDAYS = [1, 2, 3, 4, 5];

const deps = testSchedulingDeps({ billing: createUsageGate() });
const actor = { kind: "system" } as const;
const violations: string[] = [];

async function inParallel(
  total: number,
  parallel: number,
  run: (index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(parallel, total) }, async () => {
      while (next < total) await run(next++);
    }),
  );
}

type Outcomes = Record<string, number>;

function outcomeOf(error: unknown): string {
  if (error instanceof SchedulingError) return error.code;
  const cause = error as {
    code?: string;
    cause?: { code?: string; message?: string };
    message?: string;
  };
  const code = cause.cause?.code ?? cause.code;
  return code ? `${code} ${cause.cause?.message ?? cause.message}` : (cause.message ?? "unknown");
}

const percentile = (sorted: readonly number[], p: number): number =>
  sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;

const report: string[][] = [];

function record(label: string, durations: number[], seconds: number, outcomes: Outcomes): void {
  const sorted = [...durations].sort((a, b) => a - b);
  const counted = Object.entries(outcomes)
    .map(([name, count]) => `${name} ${count}`)
    .join(", ");
  const row = [
    label,
    String(durations.length),
    percentile(sorted, 50).toFixed(1),
    percentile(sorted, 95).toFixed(1),
    percentile(sorted, 99).toFixed(1),
    (sorted.at(-1) ?? 0).toFixed(1),
    (durations.length / seconds).toFixed(1),
    counted,
  ];
  report.push(row);
  console.info(`  ${row.join(" | ")}`);
}

async function measure(
  label: string,
  total: number,
  parallel: number,
  run: (index: number) => Promise<unknown>,
  allowed: readonly string[] = ["ok"],
): Promise<void> {
  const durations: number[] = [];
  const outcomes: Outcomes = {};
  const started = performance.now();
  await inParallel(total, parallel, async (index) => {
    const at = performance.now();
    let outcome = "ok";
    try {
      await run(index);
    } catch (error) {
      outcome = outcomeOf(error);
    }
    durations.push(performance.now() - at);
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
  });
  record(label, durations, (performance.now() - started) / 1000, outcomes);
  for (const [outcome, count] of Object.entries(outcomes)) {
    if (!allowed.includes(outcome)) violations.push(`${label}: ${count} × ${outcome}`);
  }
}

const tenant = await createTestTenant();
const environment = sandbox ? tenant.development : tenant.production;
const env: SchedulingEnvironment = {
  organizationId: tenant.organization.id,
  projectId: tenant.project.id,
  environmentId: environment.id,
  mode: sandbox ? "sandbox" : "live",
};
console.info(
  `organization ${tenant.organization.id}, ${env.mode} environment, pool of ${pool.options.max} connections, ${hostCount} hosts, ${days} days`,
);

await createTestContract(
  tenant.organization.id,
  {
    version: 1,
    plan: "pro",
    ...(capped ? { usageCaps: { "scheduling.bookings": 1_000_000_000 } } : {}),
  },
  { effectiveFrom: new Date(Date.now() - 30 * DAY_MS) },
);

const nowMs = Date.now();
const fromMs = Math.ceil(nowMs / DAY_MS + 1) * DAY_MS;
const toMs = fromMs + days * DAY_MS;
const localDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

let seeded = performance.now();
const hostIds: string[] = new Array(hostCount);
await inParallel(hostCount, 8, async (index) => {
  const host = await createHost(env, {
    name: `Load ${index}`,
    uid: `load_${index}`,
    time_zone: TIME_ZONES[index % TIME_ZONES.length] as string,
    attributes: { team: `team_${index % 10}` },
  } as never);
  hostIds[index] = host.id;
  await createSchedule(env, host.id, {
    rules: [{ days: WEEKDAYS, start: "09:00", end: "17:00" }],
    overrides: [
      { date: localDate(fromMs + (index % days) * DAY_MS), ranges: [] },
      {
        date: localDate(fromMs + ((index + 3) % days) * DAY_MS),
        ranges: [{ start: "10:00", end: "12:00" }],
      },
    ],
  });
});
console.info(`hosts in ${((performance.now() - seeded) / 1000).toFixed(1)} s`);

async function seedCalendars(): Promise<void> {
  const verifiedAt = new Date();
  const coveredUntil = new Date(nowMs + 90 * DAY_MS);
  const connections = hostIds.map((hostId) => ({
    id: newId(ID_PREFIXES.schedulingCalendarConnection),
    organizationId: env.organizationId,
    environmentId: env.environmentId,
    hostId,
    provider: "google" as const,
    accountId: `${hostId}@example.com`,
  }));
  const calendars = connections.map((connection) => ({
    id: newId(ID_PREFIXES.schedulingCalendar),
    organizationId: env.organizationId,
    environmentId: env.environmentId,
    hostId: connection.hostId,
    connectionId: connection.id,
    externalId: `${connection.hostId}@example.com`,
    writeTarget: true,
    verifiedAt,
    coveredUntil,
    // A channel gives the freshness budget that survives this run.
    channelId: `load_${connection.hostId}`,
  }));
  const intervals = calendars.flatMap((calendar, index) =>
    Array.from({ length: busyPerHost }, (_, n) => {
      const startMs = fromMs + ((index + n) % days) * DAY_MS + (9 + (n % 8)) * 3_600_000;
      return {
        organizationId: env.organizationId,
        calendarId: calendar.id,
        hostId: calendar.hostId,
        startAt: new Date(startMs),
        endAt: new Date(startMs + 45 * 60_000),
      };
    }),
  );
  const chunks = <T>(rows: readonly T[]): T[][] =>
    Array.from({ length: Math.ceil(rows.length / 500) }, (_, n) =>
      rows.slice(n * 500, (n + 1) * 500),
    );
  for (const rows of chunks(connections)) {
    await db.insert(schema.schedulingCalendarConnection).values(rows);
  }
  for (const rows of chunks(calendars)) await db.insert(schema.schedulingCalendar).values(rows);
  for (const rows of chunks(intervals)) {
    await db.insert(schema.schedulingBusyInterval).values(rows);
  }
}

seeded = performance.now();
await seedCalendars();
console.info(
  `calendars and ${hostCount * busyPerHost} busy intervals in ${((performance.now() - seeded) / 1000).toFixed(1)} s`,
);

const eventTypeInput = (kind: string, hosts: { host: string; role?: string }[], title: string) =>
  ({
    title,
    kind,
    duration_minutes: 30,
    step_minutes: 15,
    buffer_after_minutes: 5,
    hosts: hosts.map((host) => ({
      host: host.host,
      role: host.role ?? "member",
      weight: 100,
      schedule: null,
    })),
  }) as never;

const poolType: EventTypeObjectOutput = await createEventType(
  env,
  eventTypeInput(
    "pool",
    hostIds.map((host) => ({ host })),
    "Everyone",
  ),
);

async function slotsOf(eventType: string, host?: string): Promise<number[]> {
  const slots = await listEventTypeSlots(env, {
    eventTypeRef: eventType,
    fromMs,
    toMs,
    nowMs: Date.now(),
    hostRef: host,
  });
  return slots.map((slot) => slot.startMs);
}

const attendee = (index: number) => ({
  uid: `attendee_${index}`,
  name: `Attendee ${index}`,
  email: `attendee_${index}@example.com`,
  time_zone: "UTC",
});

seeded = performance.now();
let seededBookings = 0;
await inParallel(hostCount, 8, async (index) => {
  const host = hostIds[index] as string;
  const open = spaced(await slotsOf(poolType.id, host));
  const step = Math.max(1, Math.floor(open.length / Math.max(existingPerHost, 1)));
  for (let n = 0; n < existingPerHost && n * step < open.length; n++) {
    await createBooking(
      env,
      {
        eventType: poolType.id,
        host,
        startMs: open[n * step] as number,
        attendee: attendee(seededBookings),
      },
      deps,
      actor,
    );
    seededBookings++;
  }
});
await db
  .update(schema.schedulingCalendarEvent)
  .set({ externalState: "in_sync" })
  .where(eq(schema.schedulingCalendarEvent.organizationId, env.organizationId));
console.info(
  `${seededBookings} existing bookings in ${((performance.now() - seeded) / 1000).toFixed(1)} s`,
);

// Planner statistics, so plans reflect what was just seeded and not what autovacuum saw last.
for (const table of [
  "scheduling_host",
  "scheduling_schedule",
  "scheduling_schedule_override",
  "scheduling_event_type_host",
  "scheduling_claim",
  "scheduling_booking",
  "scheduling_booking_host",
  "scheduling_attendee",
  "scheduling_busy_interval",
  "scheduling_calendar",
  "scheduling_calendar_connection",
  "scheduling_calendar_event",
]) {
  await db.execute(sql.raw(`analyze ${table}`));
}

const REPORT_HEADER = "scenario | n | p50 ms | p95 ms | p99 ms | max ms | per s | outcomes";
console.info(`\n${REPORT_HEADER}`);

const search = () =>
  searchAvailability(env, {
    eventTypeRef: poolType.id,
    fromMs,
    toMs,
    nowMs: Date.now(),
    slotsPerHost: 3,
    limit: 50,
  });

await measure(`search ${hostCount} hosts, ${days} days, sequential`, searches, 1, async () => {
  const found = await search();
  if (found.data.length === 0) throw new Error("no_availability");
});
await measure(`search ${hostCount} hosts, ${days} days, 8 at once`, searches * 2, 8, search);
await measure(
  `search naming ${hostCount} hosts by id, ${days} days`,
  Math.ceil(searches / 3),
  1,
  () =>
    searchAvailability(env, {
      eventTypeRef: poolType.id,
      fromMs,
      toMs,
      nowMs: Date.now(),
      hostRefs: hostIds,
      slotsPerHost: 3,
      limit: 50,
    }),
);

const firstHostTypes: EventTypeObjectOutput[] = [];
for (let index = 0; index < Math.min(50, hostCount); index++) {
  firstHostTypes.push(
    await createEventType(
      env,
      eventTypeInput("one_on_one", [{ host: hostIds[index] as string }], `One on one ${index}`),
    ),
  );
}
const oneOnOne = firstHostTypes[0] as EventTypeObjectOutput;

await measure(`slots, 1 host, ${days} days`, searches * 3, 1, () => slotsOf(oneOnOne.id));
await measure(
  `slots, 1 host, ${days} days, ${concurrency} at once`,
  searches * 6,
  concurrency,
  () => slotsOf(oneOnOne.id),
);
await measure(`slots, pool of ${hostCount}, ${days} days`, searches, 1, () => slotsOf(poolType.id));

// Time is computed in the API's one thread, so a search makes its neighbours wait too.
let searching = true;
const background = Promise.all(
  Array.from({ length: 4 }, async () => {
    while (searching) await search();
  }),
);
await measure("slots, 1 host, during 4 searches at once", searches * 3, 1, () =>
  slotsOf(oneOnOne.id),
);
searching = false;
await background;

async function searchBreakdown(): Promise<void> {
  const hosts = await db
    .select({
      id: schema.schedulingHost.id,
      timeZone: schema.schedulingHost.timeZone,
    })
    .from(schema.schedulingHost)
    .where(eq(schema.schedulingHost.organizationId, env.organizationId));
  const loading: number[] = [];
  const computing: number[] = [];
  const rule = {
    durationMinutes: 30,
    stepMinutes: 15,
    gridTimeZone: null,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 5,
    minNoticeMinutes: 0,
    bookingWindow: null,
    limits: [],
  };
  for (let run = 0; run < 10; run++) {
    let at = performance.now();
    const loaded = await loadHostInputs(db, {
      scope: env,
      hosts: hosts.map((host) => ({ ...host, scheduleId: null })),
      eventTypeId: poolType.id,
      fromMs,
      toMs,
      nowMs: Date.now(),
      calendarFailureMode: "hide",
    });
    loading.push(performance.now() - at);
    at = performance.now();
    for (const host of loaded.values()) {
      listSlots({ nowMs: Date.now(), rule, host, fromMs, toMs, limit: 3 });
    }
    computing.push(performance.now() - at);
  }
  const median = (values: number[]) =>
    percentile(
      [...values].sort((a, b) => a - b),
      50,
    ).toFixed(1);
  console.info(
    `  search breakdown: loadHostInputs ${median(loading)} ms (queries + per-host filtering), listSlots ${median(computing)} ms`,
  );
}
await searchBreakdown();

function bookFree(
  label: string,
  total: number,
  parallel: number,
  next: (index: number) => { eventType: string; startMs: number; host?: string },
  allowed: readonly string[] = ["ok"],
): Promise<void> {
  return measure(
    label,
    total,
    parallel,
    (index) =>
      createBooking(env, { ...next(index), attendee: attendee(100_000 + index) }, deps, actor),
    allowed,
  );
}

// Far enough apart that a 30 minute booking and its buffer never touch the next one.
function spaced(starts: readonly number[]): number[] {
  const picked: number[] = [];
  for (const start of starts) {
    const last = picked.at(-1);
    if (last === undefined || start - last >= 45 * 60_000) picked.push(start);
  }
  return picked;
}

const everyOther = <T>(rows: readonly T[], offset: 0 | 1): T[] =>
  rows.filter((_, index) => index % 2 === offset);

const freeStarts = await Promise.all(
  firstHostTypes.map(async (type) => ({ type: type.id, starts: spaced(await slotsOf(type.id)) })),
);
const acrossHosts = (offset: 0 | 1) =>
  freeStarts
    .flatMap(({ type, starts }) =>
      everyOther(starts, offset).map((startMs) => ({ eventType: type, startMs })),
    )
    // Interleaved, so neighbours in the queue are different hosts.
    .sort((a, b) => a.startMs - b.startMs)
    .slice(0, bookings);

const concurrentPlan = acrossHosts(0);
await bookFree(
  `book, different hosts and slots, ${concurrency} at once`,
  concurrentPlan.length,
  concurrency,
  (index) => concurrentPlan[index] as { eventType: string; startMs: number },
);
const sequentialPlan = acrossHosts(1).slice(0, Math.min(100, bookings));
await bookFree(
  "book, different hosts and slots, 1 at a time",
  sequentialPlan.length,
  1,
  (index) => sequentialPlan[index] as { eventType: string; startMs: number },
);

const sameHost = firstHostTypes.at(-1) as EventTypeObjectOutput;
const sameHostStarts = spaced(await slotsOf(sameHost.id));
await bookFree(
  `book, one host, different slots, ${concurrency} at once`,
  sameHostStarts.length,
  concurrency,
  (index) => ({ eventType: sameHost.id, startMs: sameHostStarts[index] as number }),
);

const poolStarts = await slotsOf(poolType.id);
await bookFree(
  `book, pool of ${hostCount} picks a host, 1 at a time`,
  Math.min(50, poolStarts.length),
  1,
  (index) => ({
    eventType: poolType.id,
    startMs: poolStarts[index % poolStarts.length] as number,
  }),
  ["ok", "slot_unavailable"],
);
await bookFree(
  `book, pool of ${hostCount} picks a host, ${concurrency} at once`,
  Math.min(bookings, poolStarts.length),
  concurrency,
  (index) => ({
    eventType: poolType.id,
    startMs: poolStarts[(50 + index) % poolStarts.length] as number,
  }),
  // A neighbour can take the last host free at a start the pool listed.
  ["ok", "slot_unavailable"],
);

async function raceFor(
  label: string,
  eventType: string,
  startFor: (round: number) => number,
  winners: number,
  rounds: number,
): Promise<void> {
  const racers = Math.max(concurrency, winners + 1);
  const durations: number[] = [];
  const outcomes: Outcomes = {};
  const started = performance.now();
  for (let round = 0; round < rounds; round++) {
    const startMs = startFor(round);
    let won = 0;
    await inParallel(racers, racers, async (index) => {
      const at = performance.now();
      let outcome = "ok";
      try {
        await createBooking(
          env,
          { eventType, startMs, attendee: attendee(200_000 + round * 1000 + index) },
          deps,
          actor,
        );
        won++;
      } catch (error) {
        outcome = outcomeOf(error);
      }
      durations.push(performance.now() - at);
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    });
    if (won !== winners) {
      violations.push(`${label}, round ${round}: ${won} winners, wanted ${winners}`);
    }
  }
  record(label, durations, (performance.now() - started) / 1000, outcomes);
  for (const [outcome, count] of Object.entries(outcomes)) {
    if (outcome !== "ok" && outcome !== "slot_unavailable") {
      violations.push(`${label}: ${count} × ${outcome}`);
    }
  }
}

const raceHost = firstHostTypes[1] as EventTypeObjectOutput;
const raceStarts = spaced(await slotsOf(raceHost.id));
await raceFor(
  `race, ${concurrency} for 1 slot of 1 host`,
  raceHost.id,
  (round) => raceStarts[round % raceStarts.length] as number,
  1,
  Math.min(races, raceStarts.length),
);

// Nothing booked and the same hours, so every start is open to all of them.
const freshHosts: string[] = [];
for (let index = 0; index < 13; index++) {
  const host = await createHost(env, { name: `Race ${index}`, time_zone: "UTC" } as never);
  await createSchedule(env, host.id, {
    rules: [{ days: WEEKDAYS, start: "09:00", end: "17:00" }],
  });
  freshHosts.push(host.id);
}

const collective = await createEventType(
  env,
  eventTypeInput(
    "collective",
    freshHosts.slice(0, 3).map((host) => ({ host, role: "required" })),
    "Panel",
  ),
);
const collectiveStarts = spaced(await slotsOf(collective.id));
await raceFor(
  `race, ${concurrency} for 1 slot of 3 required hosts`,
  collective.id,
  (round) => collectiveStarts[round % collectiveStarts.length] as number,
  1,
  Math.min(races, collectiveStarts.length),
);

const smallPoolHosts = freshHosts.slice(3);
const smallPool = await createEventType(
  env,
  eventTypeInput(
    "pool",
    smallPoolHosts.map((host) => ({ host })),
    "Small pool",
  ),
);
const smallPoolStarts = spaced(await slotsOf(smallPool.id));
await raceFor(
  `race, ${Math.max(concurrency, smallPoolHosts.length + 1)} for 1 slot of a pool of ${smallPoolHosts.length}`,
  smallPool.id,
  (round) => smallPoolStarts[round % smallPoolStarts.length] as number,
  smallPoolHosts.length,
  Math.min(races, smallPoolStarts.length),
);

// A weekend start at 03:00 UTC falls outside every host's hours. Each candidate is still tried.
const nobodyFree = (() => {
  for (let at = fromMs; at < toMs; at += DAY_MS) {
    const weekday = new Date(at).getUTCDay();
    if (weekday === 0 || weekday === 6) return at + 3 * 3_600_000;
  }
  return fromMs + 3 * 3_600_000;
})();
const bookNobodyFree = () =>
  createBooking(
    env,
    { eventType: poolType.id, startMs: nobodyFree, attendee: attendee(300_000) },
    deps,
    actor,
  );
await measure(`book, pool of ${hostCount}, nobody free`, 5, 1, bookNobodyFree, [
  "slot_unavailable",
]);
await measure(
  `book, pool of ${hostCount}, nobody free, ${concurrency} at once`,
  concurrency,
  concurrency,
  bookNobodyFree,
  ["slot_unavailable"],
);

async function audit(): Promise<void> {
  const overlapping = await db.execute<{ count: number }>(sql`
    select count(*)::int as count
    from scheduling_claim a join scheduling_claim b
      on a.host_id = b.host_id and a.id < b.id
      and tstzrange(a.occupied_start, a.occupied_end, '[)') && tstzrange(b.occupied_start, b.occupied_end, '[)')
      and tstzrange(a.live_from, a.live_until, '[)') && tstzrange(b.live_from, b.live_until, '[)')
    where a.organization_id = ${env.organizationId}
  `);
  const overlaps = overlapping.rows[0]?.count ?? 0;
  if (overlaps > 0) violations.push(`${overlaps} pairs of overlapping live claims`);
  const mismatched = await db.execute<{ count: number }>(sql`
    select count(*)::int as count from scheduling_booking b
    where b.organization_id = ${env.organizationId} and b.group_session_id is null
      and b.status not in ('cancelled', 'declined')
      and (select count(*) from scheduling_claim c where c.booking_id = b.id)
        <> (select count(*) from scheduling_booking_host h where h.booking_id = b.id)
  `);
  const unbalanced = mismatched.rows[0]?.count ?? 0;
  if (unbalanced > 0)
    violations.push(`${unbalanced} bookings whose claims don't match their hosts`);
  const counts = await db.execute<{ bookings: number; claims: number }>(sql`
    select
      (select count(*)::int from scheduling_booking where organization_id = ${env.organizationId}) as bookings,
      (select count(*)::int from scheduling_claim where organization_id = ${env.organizationId}) as claims
  `);
  console.info(
    `\naudit: ${counts.rows[0]?.bookings} bookings, ${counts.rows[0]?.claims} claims, ${overlaps} overlapping, ${unbalanced} mismatched`,
  );
}
await audit();

type PlanNode = {
  "Node Type": string;
  "Relation Name"?: string;
  "Index Name"?: string;
  "Actual Total Time"?: number;
  "Actual Rows"?: number;
  "Rows Removed by Filter"?: number;
  "Shared Hit Blocks"?: number;
  "Shared Read Blocks"?: number;
  Plans?: PlanNode[];
};

type CapturedPlan = {
  statement: string;
  times: number;
  ms: number;
  root: PlanNode;
};

function planOf(rows: readonly Record<string, unknown>[]): PlanNode {
  const [row] = rows as { "QUERY PLAN": { Plan: PlanNode }[] }[];
  const plan = row?.["QUERY PLAN"][0]?.Plan;
  if (!plan) throw new Error("EXPLAIN returned no plan.");
  return plan;
}

function nodesOf(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(nodesOf)];
}

const normalized = (text: string): string =>
  text
    .replace(/\s+/g, " ")
    .replace(/\$\d+(, \$\d+)+/g, "$…")
    .trim();

// Explains what the product really sends. `ANALYZE` executes, so each explain is rolled back.
async function capturingPlans(run: () => Promise<unknown>, into: Map<string, CapturedPlan>) {
  const client = await pool.connect();
  const prototype = Object.getPrototypeOf(client) as { query: (...args: unknown[]) => unknown };
  client.release();
  const original = prototype.query;
  const inTransaction = new WeakSet<object>();

  async function explained(self: object, text: string, values: unknown[] | undefined) {
    const send = (query: string, params?: unknown[]) =>
      original.call(self, query, params) as Promise<{ rows: Record<string, unknown>[] }>;
    const nested = inTransaction.has(self);
    await send(nested ? "savepoint load_explain" : "begin");
    try {
      const { rows } = await send(`explain (analyze, buffers, format json) ${text}`, values);
      const root = planOf(rows);
      const key = normalized(text);
      const ms = root["Actual Total Time"] ?? 0;
      const seen = into.get(key);
      if (!seen || ms > seen.ms) {
        into.set(key, { statement: key, times: (seen?.times ?? 0) + 1, ms, root });
      } else {
        seen.times++;
      }
    } catch (error) {
      console.info(`  couldn't explain: ${normalized(text).slice(0, 100)}: ${outcomeOf(error)}`);
    }
    await send(nested ? "rollback to load_explain" : "rollback");
  }

  prototype.query = function patched(this: object, ...args: unknown[]) {
    const [first, second, third] = args;
    const config = typeof first === "string" ? { text: first } : (first as { text?: string });
    const text = config?.text ?? "";
    const values = (Array.isArray(second) ? second : undefined) as unknown[] | undefined;
    const callback = (typeof second === "function" ? second : third) as
      | ((error: unknown, result?: unknown) => void)
      | undefined;
    if (/^\s*begin/i.test(text)) inTransaction.add(this);
    if (/^\s*(commit|rollback)\s*;?\s*$/i.test(text)) inTransaction.delete(this);
    const explainable = /^\s*(select|insert|update|delete|with)\b/i.test(text);
    const finish = (): Promise<unknown> =>
      original.call(this, first, Array.isArray(second) ? second : undefined) as Promise<unknown>;
    const result = explainable ? explained(this, text, values).then(finish) : finish();
    if (!callback) return result;
    result.then(
      (value) => callback(null, value),
      (error) => callback(error),
    );
    return undefined;
  };
  try {
    return await run();
  } finally {
    prototype.query = original;
  }
}

const tableRows = await db.execute<{ relname: string; rows: number }>(sql`
  select relname, reltuples::bigint::int as rows from pg_class
  where relkind in ('r', 'p') and relname like any (array['scheduling_%', 'webhook_%', 'log_entry%', 'billing_%'])
`);
const rowsOf = new Map(tableRows.rows.map((row) => [row.relname, row.rows]));

const plans = new Map<string, CapturedPlan>();
await capturingPlans(search, plans);
await capturingPlans(() => slotsOf(oneOnOne.id), plans);
await capturingPlans(
  () => listBookings(env, { limit: 20, attendeeEmail: "nobody@example.com" }, deps),
  plans,
);
await capturingPlans(() => listBookings(env, { limit: 20, attendeeUid: "nobody" }, deps), plans);
const planType = await createEventType(
  env,
  eventTypeInput("one_on_one", [{ host: freshHosts.at(-1) as string }], "Plans"),
);
const planStart = (await slotsOf(planType.id)).at(-1);
await capturingPlans(
  () =>
    createBooking(
      env,
      { eventType: planType.id, startMs: planStart as number, attendee: attendee(400_000) },
      deps,
      actor,
    ),
  plans,
);

// Unscoped, as the worker runs them in production.
async function explainScans(): Promise<void> {
  const client = await pool.connect();
  const dayAgo = new Date(Date.now() - DAY_MS).toISOString();
  const twoWeeksAgo = new Date(Date.now() - 14 * DAY_MS).toISOString();
  const ninetyDaysAgo = new Date(Date.now() - 90 * DAY_MS).toISOString();
  const now = new Date().toISOString();
  const scans: [string, string][] = [
    [
      "purgeSchedulingLeftovers: claims by occupied_end",
      `delete from scheduling_claim where occupied_end < '${twoWeeksAgo}'`,
    ],
    [
      "purgeSchedulingLeftovers: claims by live_until",
      `delete from scheduling_claim where live_until < '${dayAgo}'`,
    ],
    [
      "redactExpiredBookings",
      `select id, organization_id from scheduling_booking where end_at < '${ninetyDaysAgo}' and redacted_at is null limit 1000`,
    ],
    [
      "expireDueBookings: holds",
      `select id from scheduling_booking where status = 'held' and hold_expires_at < '${now}' limit 200`,
    ],
    [
      "runDueCalendarSyncs",
      `select id from scheduling_calendar where next_sync_at <= '${now}' and (lease_until is null or lease_until < '${now}') order by next_sync_at limit 50`,
    ],
  ];
  for (const [label, text] of scans) {
    await client.query("begin");
    const { rows } = await client.query(`explain (analyze, buffers, format json) ${text}`);
    await client.query("rollback");
    const root = planOf(rows);
    plans.set(label, { statement: label, times: 1, ms: root["Actual Total Time"] ?? 0, root });
  }
  client.release();
}
await explainScans();

console.info(
  `\nplans of ${plans.size} statements, the slowest and the flagged ("!": a sequential scan of ${bigTableRows}+ rows keeping under a tenth of them):`,
);
const flagged: string[] = [];
for (const plan of [...plans.values()].sort((a, b) => b.ms - a.ms)) {
  let selective = false;
  const scans = nodesOf(plan.root)
    .filter((node) => node["Relation Name"])
    .map((node) => {
      const table = node["Relation Name"] as string;
      const size = rowsOf.get(table) ?? 0;
      const removed = node["Rows Removed by Filter"] ?? 0;
      const returned = node["Actual Rows"] ?? 0;
      const big =
        node["Node Type"] === "Seq Scan" && size >= bigTableRows && removed > 9 * returned;
      if (big) {
        selective = true;
        flagged.push(`${table} (${size} rows): ${plan.statement.slice(0, 120)}`);
      }
      const how = node["Index Name"] ?? node["Node Type"];
      return `${big ? "!" : ""}${table} via ${how}, ${returned} rows${removed ? `, ${removed} discarded` : ""}`;
    });
  if (plan.ms < 0.1 && !selective) continue;
  const hit = plan.root["Shared Hit Blocks"] ?? 0;
  const read = plan.root["Shared Read Blocks"] ?? 0;
  console.info(
    `  ${plan.ms.toFixed(2)} ms, ${hit}+${read} buffers, x${plan.times}: ${plan.statement.slice(0, 110)}`,
  );
  console.info(`    ${scans.join("; ") || plan.root["Node Type"]}`);
}

console.info(`\n${flagged.length} selective sequential scans of big tables`);
for (const line of flagged) console.info(`  ${line}`);

// Other work on the machine shows up in every number below.
console.info(
  `\nmachine load ${loadavg()
    .map((value) => value.toFixed(1))
    .join(" ")} on ${cpus().length} cores`,
);
console.info(`\n${REPORT_HEADER}`);
for (const row of report) console.info(row.join(" | "));

if (violations.length > 0) {
  console.error(`\nINVARIANTS BROKEN:\n${violations.join("\n")}`);
  process.exit(1);
}
console.info("\nInvariants held: every race had the winners it should, no overlapping claims.");
process.exit(0);
