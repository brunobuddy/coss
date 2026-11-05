/**
 * Hosts: the people who can be booked. Every function takes the environment and scopes its SQL by
 * the organization (tenancy rule).
 */
import { meterPricedFrom } from "@coss/billing/catalog";
import type { PlanGate, UsageGate } from "@coss/billing/gate";
import { countTowardAllowance, recordUsage } from "@coss/billing/metering";
import { db, type Executor, schema } from "@coss/db";
import { ID_PREFIXES, isId } from "@coss/db/id";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { mailboxDomain, normalizeMailbox } from "./calendar/delegation-tokens.ts";
import { recordCalendarEvent } from "./calendar/events.ts";
import { isValidTimeZone } from "./engine/time.ts";
import { SchedulingError } from "./errors.ts";
import { refuseNewHostWhileHeld } from "./plan.ts";
import type {
  CreateHostRequestOutput,
  HostLocationOutput,
  HostObjectOutput,
  UpdateHostRequestOutput,
} from "./schemas.ts";
import {
  locationText,
  refuseLinks,
  refuseLinksInAddresses,
  type SetupScreening,
  screenSetup,
} from "./screening.ts";
import type { SchedulingEnvironment } from "./types.ts";

const {
  schedulingBooking,
  schedulingBookingHost,
  schedulingCalendar,
  schedulingCalendarConnection,
  schedulingCalendarDelegation,
  schedulingCalendarEvent,
  schedulingClaim,
  schedulingHost,
} = schema;

export type HostRow = typeof schedulingHost.$inferSelect;
type Scope = Pick<SchedulingEnvironment, "organizationId" | "environmentId">;

export function checkTimeZone(value: string, param: string): void {
  if (!isValidTimeZone(value)) {
    throw new SchedulingError("invalid_time_zone", `"${value}" isn't an IANA time zone.`, {
      param,
    });
  }
}

export function toHostObject(row: HostRow): HostObjectOutput {
  return {
    object: "scheduling.host",
    id: row.id,
    uid: row.uid,
    name: row.name,
    email: row.email,
    phone: row.phone,
    calendar_account: row.calendarAccount,
    time_zone: row.timeZone,
    locale: row.locale,
    attributes: row.attributes,
    locations: row.locations,
    metadata: row.metadata,
    status: row.status,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** A value already on the host passed when it was set: saving the same list again costs nothing. */
async function screenLocations(
  env: { organizationId: string; mode: "live" | "sandbox" },
  locations: readonly HostLocationOutput[] | undefined,
  screen: SetupScreening | undefined,
  existing: readonly HostLocationOutput[] = [],
): Promise<void> {
  const known = new Set(existing.map(locationText));
  const text = (locations ?? [])
    .map(locationText)
    .filter((value) => value !== null && !known.has(value))
    .join("\n");
  await screenSetup(env, text, screen, "locations");
}

function hostMatch(scope: Scope, ref: string) {
  return and(
    eq(schedulingHost.organizationId, scope.organizationId),
    eq(schedulingHost.environmentId, scope.environmentId),
    isId(ID_PREFIXES.schedulingHost, ref)
      ? eq(schedulingHost.id, ref)
      : eq(schedulingHost.uid, ref),
  );
}

/** Live hosts of the organization, across its environments: what the plan's limit counts. */
export async function countLiveHosts(organizationId: string): Promise<number> {
  const [total] = await db
    .select({ value: count() })
    .from(schedulingHost)
    .where(
      and(eq(schedulingHost.organizationId, organizationId), isNotNull(schedulingHost.nextFeeAt)),
    );
  return total?.value ?? 0;
}

/** A host by its id or `uid`, or `not_found`. */
export async function resolveHost(executor: Executor, scope: Scope, ref: string): Promise<HostRow> {
  const [row] = await executor.select().from(schedulingHost).where(hostMatch(scope, ref)).limit(1);
  if (!row) throw new SchedulingError("not_found", `No host "${ref}" in this environment.`);
  return row;
}

const invalidMailbox = () =>
  new SchedulingError("invalid_calendar_delegation", "This isn't a mailbox's address.", {
    param: "calendar_account",
  });

/** So a new or changed host connects within seconds, not at the next look. */
async function nudgeDelegations(
  executor: Executor,
  scope: Scope,
  addresses: readonly (string | null | undefined)[],
): Promise<void> {
  const domains = addresses.flatMap((address) => {
    const mailbox = address ? normalizeMailbox(address) : null;
    return mailbox ? [mailboxDomain(mailbox)] : [];
  });
  if (domains.length === 0) return;
  await executor
    .update(schedulingCalendarDelegation)
    // The clock the worker compares it with: the database's microseconds sort after a `Date` taken
    // right afterwards, which would put this off until the next look.
    .set({ nextReconcileAt: new Date() })
    .where(
      and(
        eq(schedulingCalendarDelegation.organizationId, scope.organizationId),
        eq(schedulingCalendarDelegation.environmentId, scope.environmentId),
        // A failing one too: a new host stops being offered as free during an outage as well.
        inArray(schedulingCalendarDelegation.status, ["active", "failing"]),
        inArray(schedulingCalendarDelegation.domain, domains),
      ),
    );
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } }).cause?.code;
  return code === "23505" || (error as { code?: string }).code === "23505";
}

const uidTaken = (uid: string | null | undefined) =>
  new SchedulingError("uid_taken", `A host with the uid "${uid}" already exists.`, {
    param: "uid",
  });

const HOST_FEE_METER = "scheduling.hosts";
const HOST_FEE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Creates a host. A live one counts against the plan's `schedulingHosts` (across the organization's
 * live environments, under an organization-wide lock) and is charged by the day from its creation,
 * or from when the meter is first priced; the worker charges the days after.
 */
export async function createHost(
  env: SchedulingEnvironment,
  params: CreateHostRequestOutput,
  opts: {
    screen?: SetupScreening | undefined;
    plans?: PlanGate | undefined;
    billing?: UsageGate | undefined;
    now?: Date;
  } = {},
): Promise<HostObjectOutput> {
  checkTimeZone(params.time_zone, "time_zone");
  refuseLinks(params.name, "name");
  refuseLinksInAddresses(params.locations);
  await screenSetup(env, params.name, opts.screen, "name");
  await screenLocations(env, params.locations, opts.screen);
  const calendarAccount = params.calendar_account
    ? normalizeMailbox(params.calendar_account)
    : null;
  if (params.calendar_account && !calendarAccount) throw invalidMailbox();
  await refuseNewHostWhileHeld(env);
  const live = env.mode === "live";
  const now = opts.now ?? new Date();
  const pricedFrom = meterPricedFrom(HOST_FEE_METER) ?? now;
  const chargedNow = live && pricedFrom <= now;
  // Read before the transaction: the gate takes a connection of its own, and waiting for one while
  // holding this lock would stall the pool under concurrent creates.
  const limit = live
    ? ((await opts.plans?.limit(env.organizationId, "schedulingHosts")) ?? null)
    : null;
  try {
    const created = await db.transaction(
      async (tx): Promise<{ host: HostObjectOutput } | { full: number }> => {
        if (limit !== null) {
          // One creation at a time per organization, so the count holds.
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtext(${`scheduling-hosts:${env.organizationId}`}))`,
          );
          const [total] = await tx
            .select({ value: count() })
            .from(schedulingHost)
            .where(
              and(
                eq(schedulingHost.organizationId, env.organizationId),
                isNotNull(schedulingHost.nextFeeAt),
              ),
            );
          const current = total?.value ?? 0;
          if (current >= limit) return { full: current };
        }
        const [row] = await tx
          .insert(schedulingHost)
          .values({
            organizationId: env.organizationId,
            projectId: env.projectId,
            environmentId: env.environmentId,
            uid: params.uid ?? null,
            name: params.name,
            email: params.email ?? null,
            phone: params.phone ?? null,
            calendarAccount,
            timeZone: params.time_zone,
            locale: params.locale ?? null,
            attributes: params.attributes ?? {},
            locations: params.locations ?? [],
            metadata: params.metadata ?? {},
            nextFeeAt: !live
              ? null
              : chargedNow
                ? new Date(now.getTime() + HOST_FEE_INTERVAL_MS)
                : pricedFrom,
          })
          .returning();
        if (chargedNow) {
          // Past a capped plan's allowance a new host is refused, or deleting and creating would
          // never run out. Hosts that already exist are only ever written off.
          await opts.billing?.reserve(tx, {
            organizationId: env.organizationId,
            meter: HOST_FEE_METER,
            quantity: 1,
          });
          await recordUsage(tx, {
            organizationId: env.organizationId,
            environmentId: env.environmentId,
            projectId: env.projectId,
            meter: HOST_FEE_METER,
            quantity: 1,
          });
        }
        await nudgeDelegations(tx, env, [calendarAccount, params.email]);
        return { host: toHostObject(row as HostRow) };
      },
    );
    if ("host" in created) return created.host;
    // The gate's own refusal, now the lock is gone. If it no longer refuses, the plan just grew.
    await opts.plans?.requireCapacity(env.organizationId, "schedulingHosts", created.full);
    return await createHost(env, params, opts);
  } catch (error) {
    if (isUniqueViolation(error)) throw uidTaken(params.uid);
    throw error;
  }
}

export async function getHost(scope: Scope, ref: string): Promise<HostObjectOutput> {
  return toHostObject(await resolveHost(db, scope, ref));
}

export async function listHosts(
  scope: Scope,
  query: { limit: number; after?: string | undefined },
): Promise<{ data: HostObjectOutput[]; hasMore: boolean }> {
  const rows = await db
    .select()
    .from(schedulingHost)
    .where(
      and(
        eq(schedulingHost.organizationId, scope.organizationId),
        eq(schedulingHost.environmentId, scope.environmentId),
        query.after ? lt(schedulingHost.id, query.after) : undefined,
      ),
    )
    .orderBy(desc(schedulingHost.id))
    .limit(query.limit + 1);
  return {
    data: rows.slice(0, query.limit).map(toHostObject),
    hasMore: rows.length > query.limit,
  };
}

export async function updateHost(
  scope: Scope & { mode?: "live" | "sandbox" },
  ref: string,
  params: UpdateHostRequestOutput,
  opts: { screen?: SetupScreening | undefined } = {},
): Promise<HostObjectOutput> {
  if (params.time_zone) checkTimeZone(params.time_zone, "time_zone");
  refuseLinks(params.name, "name");
  refuseLinksInAddresses(params.locations);
  if (scope.mode && params.name) {
    await screenSetup(
      { organizationId: scope.organizationId, mode: scope.mode },
      params.name,
      opts.screen,
      "name",
    );
  }
  const host = await resolveHost(db, scope, ref);
  if (scope.mode) {
    await screenLocations(
      { organizationId: scope.organizationId, mode: scope.mode },
      params.locations,
      opts.screen,
      host.locations,
    );
  }
  const calendarAccount = params.calendar_account && normalizeMailbox(params.calendar_account);
  if (params.calendar_account && !calendarAccount) throw invalidMailbox();
  try {
    const row = await db.transaction(async (tx) => {
      if (params.calendar_account !== undefined) {
        await releaseOldMailbox(tx, host, calendarAccount ?? null, params.email);
      } else if (params.email !== undefined && !host.calendarAccount) {
        await releaseUnreachedMailbox(tx, host);
      }
      const [updated] = await tx
        .update(schedulingHost)
        .set({
          ...(params.uid !== undefined ? { uid: params.uid } : {}),
          ...(params.name !== undefined ? { name: params.name } : {}),
          ...(params.email !== undefined ? { email: params.email } : {}),
          ...(params.phone !== undefined ? { phone: params.phone } : {}),
          ...(params.calendar_account !== undefined ? { calendarAccount } : {}),
          ...(params.time_zone !== undefined ? { timeZone: params.time_zone } : {}),
          ...(params.locale !== undefined ? { locale: params.locale } : {}),
          ...(params.attributes !== undefined ? { attributes: params.attributes } : {}),
          ...(params.locations !== undefined ? { locations: params.locations } : {}),
          ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
          ...(params.status !== undefined ? { status: params.status } : {}),
        })
        .where(
          and(
            eq(schedulingHost.id, host.id),
            eq(schedulingHost.organizationId, host.organizationId),
          ),
        )
        .returning();
      return updated;
    });
    // After the commit: this locks the delegation, and in that transaction it would be after the
    // connection, the opposite of a bulk flip's order, which deadlocks.
    // From the saved row: clearing `calendar_account` falls back on an email this patch doesn't name.
    const saved = row as HostRow;
    await nudgeDelegations(db, scope, [saved.calendarAccount, saved.email]);
    return toHostObject(saved);
  } catch (error) {
    if (isUniqueViolation(error)) throw uidTaken(params.uid);
    throw error;
  }
}

/** Bookings still to come, and holds or approvals that could still become one. */
async function hasLiveBookings(tx: Executor, host: HostRow): Promise<boolean> {
  const [live] = await tx
    .select({ id: schedulingClaim.id })
    .from(schedulingClaim)
    .where(
      and(
        eq(schedulingClaim.hostId, host.id),
        eq(schedulingClaim.organizationId, host.organizationId),
        sql`${schedulingClaim.occupiedEnd} > clock_timestamp()`,
        or(
          isNull(schedulingClaim.liveUntil),
          sql`${schedulingClaim.liveUntil} > clock_timestamp()`,
        ),
      ),
    )
    .limit(1);
  // An expired hold can still convert, and the cascade would leave nothing to say it lost a host.
  const [unfinished] = await tx
    .select({ id: schedulingBookingHost.bookingId })
    .from(schedulingBookingHost)
    .innerJoin(schedulingBooking, eq(schedulingBooking.id, schedulingBookingHost.bookingId))
    .where(
      and(
        eq(schedulingBookingHost.hostId, host.id),
        eq(schedulingBookingHost.organizationId, host.organizationId),
        inArray(schedulingBooking.status, ["held", "pending_approval"]),
      ),
    )
    .limit(1);
  return Boolean(live || unfinished);
}

/**
 * Changing `calendar_account` moves a delegated host to another mailbox, which ends the old
 * connection. Its events would be left on the old calendar with nothing to move or cancel them, so
 * that's refused while there are bookings. The old channel is left to run out, and past events keep
 * any details on them, like deleting a host: reaching them takes the provider's credentials, which
 * this doesn't hold.
 */
async function releaseOldMailbox(
  tx: Executor,
  host: HostRow,
  calendarAccount: string | null,
  email: string | null | undefined,
): Promise<void> {
  // Read under the lock: another update may have changed the email since this began.
  const [locked] = await tx
    .select({ email: schedulingHost.email })
    .from(schedulingHost)
    .where(eq(schedulingHost.id, host.id))
    .for("update");
  const [delegated] = await tx
    .select({
      connection: schedulingCalendarConnection,
      matchHostEmail: schedulingCalendarDelegation.matchHostEmail,
    })
    .from(schedulingCalendarConnection)
    .innerJoin(
      schedulingCalendarDelegation,
      eq(schedulingCalendarDelegation.id, schedulingCalendarConnection.delegationId),
    )
    .where(
      and(
        eq(schedulingCalendarConnection.hostId, host.id),
        eq(schedulingCalendarConnection.organizationId, host.organizationId),
        isNotNull(schedulingCalendarConnection.delegationId),
      ),
    );
  if (!delegated) return;
  // `null` clears it: only a patch that doesn't mention it keeps the one there is.
  const fallback = delegated.matchHostEmail
    ? email === undefined
      ? (locked?.email ?? null)
      : email
    : null;
  const wanted = calendarAccount ?? (fallback ? normalizeMailbox(fallback) : null);
  const { connection } = delegated;
  if (wanted === connection.accountId.toLowerCase()) return;
  if (await hasLiveBookings(tx, host)) {
    throw new SchedulingError(
      "host_has_live_bookings",
      "This host has upcoming bookings or holds on their current calendar. Cancel or finish them before moving it.",
    );
  }
  // A cancellation not written yet would stay on the old calendar for good, since this takes its
  // ledger row with it. Access can come back, so that holds for one that can't be reached too, unless
  // nothing was ever attempted: a create whose answer was lost has no id, and may well be there.
  const reachable = connection.status === "active";
  const [owed] = await tx
    .select({ id: schedulingCalendarEvent.id })
    .from(schedulingCalendarEvent)
    .innerJoin(schedulingCalendar, eq(schedulingCalendar.id, schedulingCalendarEvent.calendarId))
    .where(
      and(
        eq(schedulingCalendar.connectionId, connection.id),
        eq(schedulingCalendarEvent.organizationId, connection.organizationId),
        sql`${schedulingCalendarEvent.appliedVersion} < ${schedulingCalendarEvent.desiredVersion}`,
        reachable
          ? undefined
          : or(
              isNotNull(schedulingCalendarEvent.providerEventId),
              sql`${schedulingCalendarEvent.attempts} > 0`,
              isNotNull(schedulingCalendarEvent.lastErrorCode),
              isNotNull(schedulingCalendarEvent.leaseUntil),
            ),
      ),
    )
    .limit(1);
  if (owed) {
    throw new SchedulingError(
      "host_has_live_bookings",
      reachable
        ? "Changes to this host's calendar are still being written. Try again in a moment."
        : "Changes to this host's calendar can't be written until it can be reached again. Restore access to the mailbox, or delete the host.",
    );
  }
  await recordCalendarEvent(tx, connection, "scheduling.calendar.disconnected", new Date());
  await tx
    .delete(schedulingCalendarConnection)
    .where(
      and(
        eq(schedulingCalendarConnection.id, connection.id),
        eq(schedulingCalendarConnection.organizationId, connection.organizationId),
      ),
    );
}

/**
 * Correcting a typo: an email moves nothing once a mailbox is connected, but one that was never
 * reached isn't connected to anything, and its host isn't offered until this is put right. Never
 * having been read, it has no events to lose.
 */
async function releaseUnreachedMailbox(tx: Executor, host: HostRow): Promise<void> {
  await tx
    .select({ id: schedulingHost.id })
    .from(schedulingHost)
    .where(eq(schedulingHost.id, host.id))
    .for("update");
  await tx
    .delete(schedulingCalendarConnection)
    .where(
      and(
        eq(schedulingCalendarConnection.hostId, host.id),
        eq(schedulingCalendarConnection.organizationId, host.organizationId),
        isNotNull(schedulingCalendarConnection.delegationId),
        isNull(schedulingCalendarConnection.reachedAt),
      ),
    );
}

/** A host with bookings still to come can't go: disabling it keeps them and stops new ones. */
export async function deleteHost(
  scope: Scope,
  ref: string,
  opts: { billing?: UsageGate | undefined } = {},
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const host = await resolveHost(tx, scope, ref);
    await tx
      .select({ id: schedulingHost.id })
      .from(schedulingHost)
      .where(eq(schedulingHost.id, host.id))
      .for("update");
    if (await hasLiveBookings(tx, host)) {
      throw new SchedulingError(
        "host_has_live_bookings",
        "This host has upcoming bookings or holds. Reassign them (POST /v1/scheduling/reassignments moves them all), cancel them, or set the host's status to disabled.",
      );
    }
    const [deleted] = await tx
      .delete(schedulingHost)
      .where(
        and(eq(schedulingHost.id, host.id), eq(schedulingHost.organizationId, host.organizationId)),
      )
      .returning({
        // Days that started since its last charge: the fee loop hadn't reached them.
        dueDays: sql<number>`case when ${schedulingHost.nextFeeAt} <= transaction_timestamp()
          then floor(extract(epoch from transaction_timestamp() - ${schedulingHost.nextFeeAt}) * 1000
            / ${HOST_FEE_INTERVAL_MS})::int + 1
          else 0 end`,
      });
    const dueDays = deleted?.dueDays ?? 0;
    if (dueDays > 0) {
      if (opts.billing) {
        await countTowardAllowance(tx, opts.billing, {
          organizationId: host.organizationId,
          meter: HOST_FEE_METER,
          days: dueDays,
        });
      }
      await recordUsage(tx, {
        organizationId: host.organizationId,
        environmentId: host.environmentId,
        projectId: host.projectId,
        meter: HOST_FEE_METER,
        quantity: dueDays,
      });
    }
    return { id: host.id };
  });
}

/**
 * System-level: charges every live host's due day (`scheduling.hosts`), when the day starts. Each
 * day counts toward a capped plan's allowance while it lasts; days past it are still recorded (and
 * written off). Returns how many host-days were charged.
 */
export async function chargeDueHostFees(
  opts: {
    now?: Date;
    limit?: number;
    scope?: { organizationIds: string[] };
    billing?: UsageGate | undefined;
  } = {},
): Promise<number> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 1000;
  return db.transaction(async (tx) => {
    // A live host without a date never counts or pays. An older task can still create one while a
    // deploy rolls out, after the migration that set them. Due at once if the meter is priced.
    const pricedFrom = meterPricedFrom(HOST_FEE_METER) ?? now;
    await tx
      .update(schedulingHost)
      .set({ nextFeeAt: pricedFrom > now ? pricedFrom : now })
      .where(
        and(
          isNull(schedulingHost.nextFeeAt),
          opts.scope
            ? inArray(schedulingHost.organizationId, opts.scope.organizationIds)
            : undefined,
          inArray(
            schedulingHost.environmentId,
            tx
              .select({ id: schema.environment.id })
              .from(schema.environment)
              .where(eq(schema.environment.mode, "live")),
          ),
        ),
      );
    const due = tx
      .select({ id: schedulingHost.id })
      .from(schedulingHost)
      .where(
        and(
          lte(schedulingHost.nextFeeAt, now),
          opts.scope
            ? inArray(schedulingHost.organizationId, opts.scope.organizationIds)
            : undefined,
        ),
      )
      .orderBy(asc(schedulingHost.nextFeeAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    const charged = await tx
      .update(schedulingHost)
      .set({
        nextFeeAt: sql`${schedulingHost.nextFeeAt} + ${`${HOST_FEE_INTERVAL_MS} milliseconds`}::interval`,
      })
      .where(and(inArray(schedulingHost.id, due), lte(schedulingHost.nextFeeAt, now)))
      .returning({
        organizationId: schedulingHost.organizationId,
        projectId: schedulingHost.projectId,
        environmentId: schedulingHost.environmentId,
      });
    const byEnvironment = new Map<string, { source: (typeof charged)[number]; days: number }>();
    for (const row of charged) {
      const entry = byEnvironment.get(row.environmentId) ?? { source: row, days: 0 };
      entry.days++;
      byEnvironment.set(row.environmentId, entry);
    }
    for (const { source, days } of byEnvironment.values()) {
      if (opts.billing) {
        await countTowardAllowance(tx, opts.billing, {
          organizationId: source.organizationId,
          meter: HOST_FEE_METER,
          days,
        });
      }
      await recordUsage(tx, { ...source, meter: HOST_FEE_METER, quantity: days });
    }
    return charged.length;
  });
}

/** Active hosts matching every attribute: a list attribute matches if it contains the value. */
export function attributesMatch(
  hostAttributes: Record<string, string | string[]>,
  wanted: Record<string, string | string[]> | null | undefined,
): boolean {
  if (!wanted) return true;
  for (const [key, value] of Object.entries(wanted)) {
    const have = hostAttributes[key];
    if (have === undefined) return false;
    const haves = Array.isArray(have) ? have : [have];
    const wants = Array.isArray(value) ? value : [value];
    if (!wants.some((want) => haves.includes(want))) return false;
  }
  return true;
}

export async function hostsByIds(
  executor: Executor,
  scope: Scope,
  ids: readonly string[],
): Promise<HostRow[]> {
  if (ids.length === 0) return [];
  return executor
    .select()
    .from(schedulingHost)
    .where(
      and(
        eq(schedulingHost.organizationId, scope.organizationId),
        eq(schedulingHost.environmentId, scope.environmentId),
        inArray(schedulingHost.id, [...ids]),
      ),
    );
}
