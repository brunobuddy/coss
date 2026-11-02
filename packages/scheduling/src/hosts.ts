/**
 * Hosts: the people who can be booked. Every function takes the environment and scopes its SQL by
 * the organization (tenancy rule).
 */
import { db, type Executor, schema } from "@coss/db";
import { ID_PREFIXES, isId } from "@coss/db/id";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { isValidTimeZone } from "./engine/time.ts";
import { SchedulingError } from "./errors.ts";
import type {
  CreateHostRequestOutput,
  HostObjectOutput,
  UpdateHostRequestOutput,
} from "./schemas.ts";
import { refuseLinks, type SetupScreening, screenSetup } from "./screening.ts";
import type { SchedulingEnvironment } from "./types.ts";

const { schedulingHost, schedulingClaim } = schema;

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
    metadata: row.metadata,
    status: row.status,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
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

export async function createHost(
  env: SchedulingEnvironment,
  params: CreateHostRequestOutput,
  opts: { screen?: SetupScreening | undefined } = {},
): Promise<HostObjectOutput> {
  checkTimeZone(params.time_zone, "time_zone");
  refuseLinks(params.name, "name");
  await screenSetup(env, params.name, opts.screen, "name");
  try {
    const [row] = await db
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
        metadata: params.metadata ?? {},
      })
      .returning();
    return toHostObject(row as HostRow);
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
  if (scope.mode && params.name) {
    await screenSetup(
      { organizationId: scope.organizationId, mode: scope.mode },
      params.name,
      opts.screen,
      "name",
    );
  }
  const host = await resolveHost(db, scope, ref);
  try {
    const [row] = await db
      .update(schedulingHost)
      .set({
        ...(params.uid !== undefined ? { uid: params.uid } : {}),
        ...(params.name !== undefined ? { name: params.name } : {}),
        ...(params.email !== undefined ? { email: params.email } : {}),
        ...(params.time_zone !== undefined ? { timeZone: params.time_zone } : {}),
        ...(params.attributes !== undefined ? { attributes: params.attributes } : {}),
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
export async function deleteHost(scope: Scope, ref: string): Promise<{ id: string }> {
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
    if (live) {
      throw new SchedulingError(
        "host_has_live_bookings",
        "This host has upcoming bookings. Cancel them, or set the host's status to disabled.",
      );
    }
    await tx
      .delete(schedulingHost)
      .where(
        and(eq(schedulingHost.id, host.id), eq(schedulingHost.organizationId, host.organizationId)),
      );
    return { id: host.id };
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
