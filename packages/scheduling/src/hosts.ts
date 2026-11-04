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
import { isValidTimeZone } from "./engine/time.ts";
import { SchedulingError } from "./errors.ts";
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

const { schedulingBooking, schedulingBookingHost, schedulingClaim, schedulingHost } = schema;

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
    time_zone: row.timeZone,
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
  const live = env.mode === "live";
  const now = opts.now ?? new Date();
  const pricedFrom = meterPricedFrom(HOST_FEE_METER) ?? now;
  const chargedNow = live && pricedFrom <= now;
  try {
    return await db.transaction(async (tx) => {
      if (live && opts.plans) {
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
        await opts.plans.requireCapacity(env.organizationId, "schedulingHosts", total?.value ?? 0);
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
          timeZone: params.time_zone,
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
        if (opts.billing) {
          await countTowardAllowance(tx, opts.billing, {
            organizationId: env.organizationId,
            meter: HOST_FEE_METER,
            days: 1,
          });
        }
        await recordUsage(tx, {
          organizationId: env.organizationId,
          environmentId: env.environmentId,
          projectId: env.projectId,
          meter: HOST_FEE_METER,
          quantity: 1,
        });
      }
      return toHostObject(row as HostRow);
    });
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
  try {
    const [row] = await db
      .update(schedulingHost)
      .set({
        ...(params.uid !== undefined ? { uid: params.uid } : {}),
        ...(params.name !== undefined ? { name: params.name } : {}),
        ...(params.email !== undefined ? { email: params.email } : {}),
        ...(params.time_zone !== undefined ? { timeZone: params.time_zone } : {}),
        ...(params.attributes !== undefined ? { attributes: params.attributes } : {}),
        ...(params.locations !== undefined ? { locations: params.locations } : {}),
        ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
        ...(params.status !== undefined ? { status: params.status } : {}),
      })
      .where(
        and(eq(schedulingHost.id, host.id), eq(schedulingHost.organizationId, host.organizationId)),
      )
      .returning();
    return toHostObject(row as HostRow);
  } catch (error) {
    if (isUniqueViolation(error)) throw uidTaken(params.uid);
    throw error;
  }
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
    if (live || unfinished) {
      throw new SchedulingError(
        "host_has_live_bookings",
        "This host has upcoming bookings or holds. Cancel them, or set the host's status to disabled.",
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
