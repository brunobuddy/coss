/**
 * Holiday calendars: a country's public holidays or a customer's own ICS feed, applied to some hosts.
 * A worker turns each into ordinary out of office entries, one per host and day, so everything that
 * knows about being away already knows about these. Each entry has a `source_key`, and a deleted one
 * stays as a tombstone: a host who opts out of a date isn't given it back the next day.
 *
 * Reading a feed is the only thing that can go wrong, and a failed or partial read keeps what's
 * there. Holiday names come from outside and aren't screened, so they go in no email and nothing a
 * booker sees: entries say `public_holiday`, and only the calendar's own page has the names.
 */
import { db, type Executor, schema } from "@coss/db";
import { decryptSecret, encryptSecret } from "@coss/webhooks";
import { and, asc, eq, gte, inArray, isNotNull, isNull, like, lt, lte, or } from "drizzle-orm";
import type { DavTransport } from "./calendar/caldav.ts";
import { holidaysFromIcs, UnreadableCalendarData } from "./calendar/ical.ts";
import { DAY_MS } from "./engine/time.ts";
import { SchedulingError } from "./errors.ts";
import { HOLIDAY_COUNTRIES } from "./holiday-countries.ts";
import { attributesMatch, type HostRow, resolveHost } from "./hosts.ts";
import {
  createOutOfOffice,
  delegatesOf,
  deleteOutOfOffice,
  updateOutOfOffice,
} from "./out-of-office.ts";
import type {
  CreateHolidayCalendarRequestOutput,
  HolidayCalendarObjectOutput,
  UpdateHolidayCalendarRequestOutput,
} from "./schemas.ts";
import { nowOf, type SchedulingDeps, type SchedulingEnvironment } from "./types.ts";

const {
  environment,
  schedulingHolidayCalendar,
  schedulingHost,
  schedulingOutOfOffice,
  schedulingPublicHoliday,
  schedulingPublicHolidaySource,
} = schema;

type Scope = Pick<SchedulingEnvironment, "organizationId" | "environmentId">;
type CalendarRow = typeof schedulingHolidayCalendar.$inferSelect;
type Holiday = { date: string; name: string; region: string | null };

/** A feed's URL may carry an access token: `WEBHOOK_SECRETS_KEY`, and never a log or a response. */
type Keys = Pick<SchedulingDeps, "calendars">;

const LOOK_AHEAD_DAYS = 365;
const SYNC_EVERY_MS = DAY_MS;
const RETRY_FAILED_MS = 6 * 60 * 60 * 1000;
const COUNTRY_REFRESH_MS = 7 * DAY_MS;
const LEASE_MS = 5 * 60_000;
// One pass's writes for one calendar: the next pass carries on, so nothing holds the worker long.
const ENTRIES_PER_PASS = 200;

const invalid = (message: string, param: string) =>
  new SchedulingError("invalid_holiday_calendar", message, { param });

const dayOf = (at: Date) => at.toISOString().slice(0, 10);

function keys(deps: Keys) {
  if (!deps.calendars) throw invalid("Feeds can't be stored in this deployment.", "ics_url");
  return deps.calendars.secretsKeys;
}

function toObject(row: CalendarRow): HolidayCalendarObjectOutput {
  return {
    object: "scheduling.holiday_calendar",
    id: row.id,
    name: row.name,
    source: row.countryCode ? "country" : "ics",
    country: row.countryCode,
    hosts: row.hostIds,
    host_filter: row.hostFilter,
    regions: row.regions,
    delegates: row.delegateIds,
    existing_bookings: row.existingBookings,
    last_read_at: row.lastReadAt?.toISOString() ?? null,
    last_error: row.lastError,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

async function hostIdsOf(scope: Scope, refs: readonly string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const ref of refs) {
    const host = await resolveHost(db, scope, ref);
    if (!ids.includes(host.id)) ids.push(host.id);
  }
  return ids;
}

/** `webcal:` is how these links are usually given. Anything but https isn't read. */
function feedUrlOf(given: string): string {
  const url = (() => {
    try {
      return new URL(given.replace(/^webcal:\/\//i, "https://"));
    } catch {
      throw invalid("That isn't a URL.", "ics_url");
    }
  })();
  if (url.protocol !== "https:") throw invalid("A feed has to be https.", "ics_url");
  if (url.username || url.password) throw invalid("Put no password in the URL.", "ics_url");
  return url.toString();
}

function checkWho(hosts: readonly string[] | undefined, filter: object | undefined): void {
  if (Boolean(hosts) === Boolean(filter)) {
    throw invalid("Give one of `hosts` and `host_filter`.", "hosts");
  }
  if (hosts?.length === 0) throw invalid("`hosts` is empty.", "hosts");
  if (filter && Object.keys(filter).length === 0) {
    throw invalid("`host_filter` is empty, which would mean every host.", "host_filter");
  }
}

export async function createHolidayCalendar(
  env: SchedulingEnvironment,
  params: CreateHolidayCalendarRequestOutput,
  deps: Keys,
): Promise<HolidayCalendarObjectOutput> {
  if (Boolean(params.country) === Boolean(params.ics_url)) {
    throw invalid("Give one of `country` and `ics_url`.", "country");
  }
  if (params.country && !(params.country in HOLIDAY_COUNTRIES)) {
    throw invalid(`There's no holiday calendar for "${params.country}".`, "country");
  }
  // Nothing test-only should reach out to a URL of someone's choosing.
  if (params.ics_url && env.mode === "sandbox") {
    throw invalid("Feeds are only read in live environments.", "ics_url");
  }
  checkWho(params.hosts, params.host_filter);
  const [row] = await db
    .insert(schedulingHolidayCalendar)
    .values({
      organizationId: env.organizationId,
      projectId: env.projectId,
      environmentId: env.environmentId,
      name: params.name,
      countryCode: params.country ?? null,
      encryptedIcsUrl: params.ics_url ? encryptSecret(feedUrlOf(params.ics_url), keys(deps)) : null,
      hostIds: params.hosts ? await hostIdsOf(env, params.hosts) : null,
      hostFilter: params.host_filter ?? null,
      regions: params.regions ?? null,
      delegateIds: await hostIdsOf(env, params.delegates ?? []),
      existingBookings: params.existing_bookings ?? "leave",
    })
    .returning();
  return toObject(row as CalendarRow);
}

async function calendarRow(executor: Executor, scope: Scope, id: string): Promise<CalendarRow> {
  const [row] = await executor
    .select()
    .from(schedulingHolidayCalendar)
    .where(
      and(
        eq(schedulingHolidayCalendar.id, id),
        eq(schedulingHolidayCalendar.organizationId, scope.organizationId),
        eq(schedulingHolidayCalendar.environmentId, scope.environmentId),
        isNull(schedulingHolidayCalendar.deletedAt),
      ),
    );
  if (!row) throw new SchedulingError("not_found", `No holiday calendar "${id}".`);
  return row;
}

export const getHolidayCalendar = async (scope: Scope, id: string) =>
  toObject(await calendarRow(db, scope, id));

export async function listHolidayCalendars(
  scope: Scope,
): Promise<{ data: HolidayCalendarObjectOutput[]; hasMore: boolean }> {
  const rows = await db
    .select()
    .from(schedulingHolidayCalendar)
    .where(
      and(
        eq(schedulingHolidayCalendar.organizationId, scope.organizationId),
        eq(schedulingHolidayCalendar.environmentId, scope.environmentId),
        isNull(schedulingHolidayCalendar.deletedAt),
      ),
    )
    .orderBy(asc(schedulingHolidayCalendar.name))
    .limit(101);
  return { data: rows.slice(0, 100).map(toObject), hasMore: rows.length > 100 };
}

export async function updateHolidayCalendar(
  scope: Scope,
  id: string,
  params: UpdateHolidayCalendarRequestOutput,
  deps: Pick<SchedulingDeps, "now">,
): Promise<HolidayCalendarObjectOutput> {
  await calendarRow(db, scope, id);
  if (params.hosts !== undefined || params.host_filter !== undefined) {
    checkWho(params.hosts, params.host_filter);
  }
  const [row] = await db
    .update(schedulingHolidayCalendar)
    .set({
      ...(params.name !== undefined ? { name: params.name } : {}),
      ...(params.hosts !== undefined
        ? { hostIds: await hostIdsOf(scope, params.hosts), hostFilter: null }
        : {}),
      ...(params.host_filter !== undefined
        ? { hostFilter: params.host_filter, hostIds: null }
        : {}),
      ...(params.regions !== undefined ? { regions: params.regions } : {}),
      ...(params.delegates !== undefined
        ? { delegateIds: await hostIdsOf(scope, params.delegates) }
        : {}),
      ...(params.existing_bookings !== undefined
        ? { existingBookings: params.existing_bookings }
        : {}),
      // Who it covers may have changed, and that shouldn't wait for tomorrow.
      nextSyncAt: nowOf(deps),
      settingsChangedAt: nowOf(deps),
    })
    .where(
      and(
        eq(schedulingHolidayCalendar.id, id),
        eq(schedulingHolidayCalendar.organizationId, scope.organizationId),
      ),
    )
    .returning();
  return toObject(row as CalendarRow);
}

/** The worker takes its future entries away, then the row, since that can be thousands of them. */
export async function deleteHolidayCalendar(
  scope: Scope,
  id: string,
  deps: Pick<SchedulingDeps, "now">,
): Promise<{ id: string; deleted: true }> {
  await calendarRow(db, scope, id);
  await db
    .update(schedulingHolidayCalendar)
    .set({
      deletedAt: nowOf(deps),
      nextSyncAt: nowOf(deps),
      settingsChangedAt: nowOf(deps),
      encryptedIcsUrl: null,
    })
    .where(
      and(
        eq(schedulingHolidayCalendar.id, id),
        eq(schedulingHolidayCalendar.organizationId, scope.organizationId),
      ),
    );
  return { id, deleted: true };
}

/** What's coming, with names, for the calendar's own page. Nothing else ever shows these. */
export async function listHolidays(
  scope: Scope,
  id: string,
  deps: Pick<SchedulingDeps, "now">,
): Promise<Holiday[]> {
  const row = await calendarRow(db, scope, id);
  const today = dayOf(nowOf(deps));
  const holidays: Holiday[] = row.countryCode
    ? await publicHolidaysOf(db, row.countryCode, today)
    : (row.holidays ?? []).map((holiday) => ({ ...holiday, region: holiday.region ?? null }));
  return holidays.filter((holiday) => holiday.date >= today && appliesTo(holiday, row.regions));
}

/** A regional holiday applies to everyone unless the calendar names regions; a nationwide one always. */
function appliesTo(holiday: Pick<Holiday, "region">, regions: readonly string[] | null): boolean {
  if (!holiday.region || !regions) return true;
  const where = (holiday.region ?? "").toLowerCase();
  return regions.some((region) => where.includes(region.toLowerCase()));
}

async function publicHolidaysOf(
  executor: Executor,
  country: string,
  from: string,
): Promise<Holiday[]> {
  return executor
    .select({
      date: schedulingPublicHoliday.date,
      name: schedulingPublicHoliday.name,
      region: schedulingPublicHoliday.region,
    })
    .from(schedulingPublicHoliday)
    .where(
      and(
        eq(schedulingPublicHoliday.countryCode, country),
        gte(schedulingPublicHoliday.date, from),
      ),
    )
    .orderBy(asc(schedulingPublicHoliday.date));
}

/** A redirect isn't followed: it could lead anywhere, and each hop would need checking again. */
async function readFeed(transport: DavTransport, url: string): Promise<string> {
  const response = await transport({
    url,
    method: "GET",
    headers: { accept: "text/calendar" },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new UnreadableCalendarData(`status ${response.status}`);
  }
  return response.body;
}

const googleFeedUrl = (country: string) => {
  const entry = HOLIDAY_COUNTRIES[country];
  if (!entry) throw new UnreadableCalendarData();
  return `https://calendar.google.com/calendar/ical/${encodeURIComponent(entry.calendarId)}/public/basic.ics`;
};

/**
 * Countries' holidays are shared, and requests for them carry nothing about anyone. An unofficial
 * URL, so it fails sometimes: what's there stays until a good read replaces it.
 */
async function refreshCountries(
  now: Date,
  transport: DavTransport,
  opts: { scope?: { organizationIds: readonly string[] } | undefined },
): Promise<void> {
  const used = await db
    .selectDistinct({ country: schedulingHolidayCalendar.countryCode })
    .from(schedulingHolidayCalendar)
    .where(
      and(
        isNotNull(schedulingHolidayCalendar.countryCode),
        isNull(schedulingHolidayCalendar.deletedAt),
        opts.scope
          ? inArray(schedulingHolidayCalendar.organizationId, [...opts.scope.organizationIds])
          : undefined,
      ),
    );
  const today = dayOf(now);
  const until = dayOf(new Date(now.getTime() + LOOK_AHEAD_DAYS * DAY_MS));
  for (const { country } of used) {
    if (!country) continue;
    const [source] = await db
      .select()
      .from(schedulingPublicHolidaySource)
      .where(eq(schedulingPublicHolidaySource.countryCode, country));
    if (source?.nextReadAt && source.nextReadAt > now) continue;
    let holidays: Holiday[];
    try {
      holidays = holidaysFromIcs(await readFeed(transport, googleFeedUrl(country)), today, until);
      // A feed that's suddenly empty is a broken feed, and shouldn't take every holiday away.
      if (holidays.length === 0) throw new UnreadableCalendarData("empty");
    } catch (error) {
      console.error(`[scheduling] couldn't read ${country}'s holidays:`, (error as Error).message);
      await db
        .insert(schedulingPublicHolidaySource)
        .values({ countryCode: country, nextReadAt: new Date(now.getTime() + RETRY_FAILED_MS) })
        .onConflictDoUpdate({
          target: schedulingPublicHolidaySource.countryCode,
          set: { nextReadAt: new Date(now.getTime() + RETRY_FAILED_MS) },
        });
      continue;
    }
    await db.transaction(async (tx) => {
      await tx
        .delete(schedulingPublicHoliday)
        .where(eq(schedulingPublicHoliday.countryCode, country));
      await tx
        .insert(schedulingPublicHoliday)
        .values(holidays.map((holiday) => ({ ...holiday, countryCode: country })));
      const next = new Date(now.getTime() + COUNTRY_REFRESH_MS);
      await tx
        .insert(schedulingPublicHolidaySource)
        .values({ countryCode: country, readAt: now, nextReadAt: next })
        .onConflictDoUpdate({
          target: schedulingPublicHolidaySource.countryCode,
          set: { readAt: now, nextReadAt: next },
        });
    });
  }
}

async function claimDue(
  now: Date,
  opts: { limit?: number | undefined; scope?: { organizationIds: readonly string[] } | undefined },
): Promise<(CalendarRow & { mode: "live" | "sandbox" })[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ row: schedulingHolidayCalendar, mode: environment.mode })
      .from(schedulingHolidayCalendar)
      .innerJoin(
        environment,
        and(
          eq(environment.id, schedulingHolidayCalendar.environmentId),
          eq(environment.organizationId, schedulingHolidayCalendar.organizationId),
        ),
      )
      .where(
        and(
          lte(schedulingHolidayCalendar.nextSyncAt, now),
          or(
            isNull(schedulingHolidayCalendar.leaseUntil),
            lt(schedulingHolidayCalendar.leaseUntil, now),
          ),
          opts.scope
            ? inArray(schedulingHolidayCalendar.organizationId, [...opts.scope.organizationIds])
            : undefined,
        ),
      )
      .orderBy(asc(schedulingHolidayCalendar.nextSyncAt))
      .limit(opts.limit ?? 10)
      .for("update", { of: schedulingHolidayCalendar, skipLocked: true });
    if (due.length === 0) return [];
    await tx
      .update(schedulingHolidayCalendar)
      .set({ leaseUntil: new Date(now.getTime() + LEASE_MS) })
      .where(
        inArray(
          schedulingHolidayCalendar.id,
          due.map((entry) => entry.row.id),
        ),
      );
    return due.map((entry) => ({ ...entry.row, mode: entry.mode }));
  });
}

async function hostsOf(row: CalendarRow): Promise<HostRow[]> {
  const scope = { organizationId: row.organizationId, environmentId: row.environmentId };
  if (row.deletedAt) return [];
  const hosts = await db
    .select()
    .from(schedulingHost)
    .where(
      and(
        eq(schedulingHost.organizationId, scope.organizationId),
        eq(schedulingHost.environmentId, scope.environmentId),
        eq(schedulingHost.status, "active"),
        row.hostIds ? inArray(schedulingHost.id, row.hostIds) : undefined,
      ),
    );
  if (row.hostIds) return hosts;
  // `{}` matches everyone, and creating one refuses it: this should never come to mean that.
  if (!row.hostFilter || Object.keys(row.hostFilter).length === 0) return [];
  return hosts.filter((host) => attributesMatch(host.attributes, row.hostFilter ?? undefined));
}

const keyOf = (calendarId: string, hostId: string, date: string) =>
  `${calendarId}:${hostId}:${date}`;

/** Makes what's there what should be. Returns whether there's more than one pass could do. */
async function reconcile(
  row: CalendarRow,
  env: SchedulingEnvironment,
  holidays: readonly Holiday[],
  deps: Pick<SchedulingDeps, "dataKeys" | "now">,
  now: Date,
): Promise<boolean> {
  const hosts = await hostsOf(row);
  const wanted = new Map<string, { host: HostRow; date: string }>();
  for (const host of hosts) {
    for (const holiday of holidays) {
      wanted.set(keyOf(row.id, host.id, holiday.date), { host, date: holiday.date });
    }
  }
  const today = dayOf(now);
  const existing = await db
    .select({
      id: schedulingOutOfOffice.id,
      sourceKey: schedulingOutOfOffice.sourceKey,
      deletedAt: schedulingOutOfOffice.deletedAt,
      startDate: schedulingOutOfOffice.startDate,
      existingBookings: schedulingOutOfOffice.existingBookings,
      updatedAt: schedulingOutOfOffice.updatedAt,
    })
    .from(schedulingOutOfOffice)
    .where(
      and(
        eq(schedulingOutOfOffice.organizationId, row.organizationId),
        eq(schedulingOutOfOffice.environmentId, row.environmentId),
        like(schedulingOutOfOffice.sourceKey, `${row.id}:%`),
      ),
    );
  const known = new Set(existing.map((entry) => entry.sourceKey));
  let budget = ENTRIES_PER_PASS;
  // A date that's gone from the feed or a host who's left: not a tombstone, since nobody chose it.
  for (const entry of existing) {
    if (budget <= 0) return true;
    if (entry.deletedAt || wanted.has(entry.sourceKey as string)) continue;
    if ((entry.startDate ?? today) < today) continue;
    await deleteOutOfOffice(env, entry.id, deps);
    await db
      .update(schedulingOutOfOffice)
      .set({ sourceKey: null })
      .where(
        and(
          eq(schedulingOutOfOffice.id, entry.id),
          eq(schedulingOutOfOffice.organizationId, row.organizationId),
        ),
      );
    budget--;
  }
  // The calendar's settings changed since this entry was: anything newer is someone's own choice.
  const stale = existing.filter(
    (entry) =>
      !entry.deletedAt &&
      entry.updatedAt < row.settingsChangedAt &&
      wanted.has(entry.sourceKey as string) &&
      (entry.startDate ?? today) >= today,
  );
  const delegates = await delegatesOf(
    db,
    stale.map((entry) => ({ id: entry.id, organizationId: row.organizationId })),
  );
  for (const entry of stale) {
    const host = wanted.get(entry.sourceKey as string)?.host as HostRow;
    const want = row.delegateIds.filter((id) => id !== host.id);
    const have = delegates.get(entry.id) ?? [];
    const same = want.length === have.length && want.every((id, index) => id === have[index]);
    if (same && entry.existingBookings === row.existingBookings) continue;
    if (budget <= 0) return true;
    await updateOutOfOffice(
      env,
      entry.id,
      { delegates: want, existing_bookings: row.existingBookings },
      deps,
      { kind: "system" },
    );
    budget--;
  }
  for (const [key, { host, date }] of wanted) {
    if (known.has(key) || date < today) continue;
    if (budget <= 0) return true;
    await createOutOfOffice(
      env,
      {
        host: host.id,
        start_date: date,
        end_date: date,
        reason: "public_holiday",
        existing_bookings: row.existingBookings,
        delegates: row.delegateIds.filter((id) => id !== host.id),
      },
      deps,
      { kind: "system" },
      "holiday",
      { sourceKey: key },
    );
    budget--;
  }
  return false;
}

async function syncOne(
  row: CalendarRow & { mode: "live" | "sandbox" },
  deps: Pick<SchedulingDeps, "dataKeys" | "now"> & Keys,
  transport: DavTransport,
  now: Date,
): Promise<void> {
  const env: SchedulingEnvironment = {
    organizationId: row.organizationId,
    projectId: row.projectId,
    environmentId: row.environmentId,
    mode: row.mode,
  };
  const here = and(
    eq(schedulingHolidayCalendar.id, row.id),
    eq(schedulingHolidayCalendar.organizationId, row.organizationId),
  );
  /** Whether someone's changed it since this was claimed: compared in JS, since rows hold more than a `Date`. */
  const changedSince = async (tx: Executor, lock: boolean) => {
    const query = tx
      .select({ at: schedulingHolidayCalendar.settingsChangedAt })
      .from(schedulingHolidayCalendar)
      .where(here);
    const [latest] = await (lock ? query.for("update") : query);
    return latest?.at.getTime() !== row.settingsChangedAt.getTime();
  };
  // A change made meanwhile asked to be looked at now, and that's not this sync's to put off.
  const done = (values: Partial<typeof schedulingHolidayCalendar.$inferInsert>) =>
    db.transaction(async (tx) => {
      const changed = await changedSince(tx, true);
      await tx
        .update(schedulingHolidayCalendar)
        .set({ leaseUntil: null, ...(changed ? {} : values) })
        .where(here);
    });
  const today = dayOf(now);
  const until = dayOf(new Date(now.getTime() + LOOK_AHEAD_DAYS * DAY_MS));
  let holidays: Holiday[];
  let read: Partial<typeof schedulingHolidayCalendar.$inferInsert> = {};
  if (row.deletedAt) {
    holidays = [];
  } else if (row.countryCode) {
    holidays = await publicHolidaysOf(db, row.countryCode, today);
    holidays = holidays.filter((holiday) => holiday.date < until);
    // Not read yet, or never could be: that's not "no holidays", so nothing's taken away.
    if (holidays.length === 0) {
      await done({ nextSyncAt: new Date(now.getTime() + RETRY_FAILED_MS) });
      return;
    }
    read = { lastReadAt: now, lastError: null };
  } else {
    if (row.mode === "sandbox" || !row.encryptedIcsUrl) {
      await done({ nextSyncAt: new Date(now.getTime() + SYNC_EVERY_MS) });
      return;
    }
    try {
      const url = decryptSecret(row.encryptedIcsUrl, keys(deps));
      holidays = holidaysFromIcs(await readFeed(transport, url), today, until);
      // A feed that's suddenly empty is a broken feed, and shouldn't take every holiday away.
      if (holidays.length === 0 && row.holidays?.some((holiday) => holiday.date >= today)) {
        throw new UnreadableCalendarData("empty");
      }
      read = { lastReadAt: now, lastError: null, holidays };
    } catch (error) {
      // The message can't name the URL, which may hold a token.
      await done({
        lastError:
          error instanceof UnreadableCalendarData
            ? "That feed couldn't be read as a calendar."
            : "That feed couldn't be reached.",
        nextSyncAt: new Date(now.getTime() + RETRY_FAILED_MS),
      });
      return;
    }
  }
  // Reading a feed takes a while. What it found is for the settings this started with, so a calendar
  // that's been changed or deleted starts over, and nothing's made from what it no longer says.
  if (await changedSince(db, false)) {
    await done({});
    return;
  }
  const more = await reconcile(
    row,
    env,
    holidays.filter((holiday) => appliesTo(holiday, row.regions)),
    deps,
    now,
  );
  if (row.deletedAt && !more) {
    await db
      .delete(schedulingHolidayCalendar)
      .where(
        and(
          eq(schedulingHolidayCalendar.id, row.id),
          eq(schedulingHolidayCalendar.organizationId, row.organizationId),
        ),
      );
    return;
  }
  await done({ ...read, nextSyncAt: more ? now : new Date(now.getTime() + SYNC_EVERY_MS) });
}

/** The worker's loop. Returns how many calendars it looked at, so a full batch goes again. */
export async function runDueHolidayCalendars(
  deps: Pick<SchedulingDeps, "dataKeys" | "now"> & Keys & { transport: DavTransport },
  opts: { limit?: number; scope?: { organizationIds: readonly string[] } } = {},
): Promise<number> {
  const now = nowOf(deps);
  await refreshCountries(now, deps.transport, opts);
  const due = await claimDue(now, opts);
  for (const row of due) {
    try {
      await syncOne(row, deps, deps.transport, now);
    } catch (error) {
      // The lease runs out and it's tried again: every step of this can be repeated.
      console.error("[scheduling] a holiday calendar failed to sync:", (error as Error).message);
    }
  }
  return due.length;
}
