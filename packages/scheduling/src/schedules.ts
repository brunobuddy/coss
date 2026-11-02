/** A host's weekly hours and date overrides. Rules are wall clock, in the schedule's own zone. */
import { db, type Executor, schema } from "@coss/db";
import { and, asc, eq, ne } from "drizzle-orm";
import { parseLocalDate } from "./engine/time.ts";
import { SchedulingError } from "./errors.ts";
import { checkTimeZone, resolveHost } from "./hosts.ts";
import {
  localTimeToMinutes,
  minutesToLocalTime,
  type ScheduleObjectOutput,
  type UpsertScheduleRequestOutput,
} from "./schemas.ts";
import type { SchedulingEnvironment } from "./types.ts";

const { schedulingSchedule, schedulingScheduleOverride } = schema;

type ScheduleRow = typeof schedulingSchedule.$inferSelect;
type OverrideRow = typeof schedulingScheduleOverride.$inferSelect;
type Scope = Pick<SchedulingEnvironment, "organizationId" | "environmentId">;

function toScheduleObject(row: ScheduleRow, overrides: OverrideRow[]): ScheduleObjectOutput {
  return {
    object: "scheduling.schedule",
    id: row.id,
    host: row.hostId,
    name: row.name,
    time_zone: row.timeZone,
    is_default: row.isDefault,
    rules: row.rules.map((rule) => ({
      days: rule.days,
      start: minutesToLocalTime(rule.startMinute),
      end: minutesToLocalTime(rule.endMinute),
    })),
    overrides: overrides.map((override) => ({
      date: override.date,
      ranges: override.ranges.map((range) => ({
        start: minutesToLocalTime(range.startMinute),
        end: minutesToLocalTime(range.endMinute),
      })),
    })),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function minuteRange(range: { start: string; end: string }, param: string) {
  const startMinute = localTimeToMinutes(range.start);
  const endMinute = localTimeToMinutes(range.end);
  if (endMinute <= startMinute) {
    throw new SchedulingError(
      "invalid_schedule",
      `${range.start}–${range.end} ends before it starts. A range can't cross midnight: use two.`,
      { param },
    );
  }
  return { startMinute, endMinute };
}

function checkedValues(params: UpsertScheduleRequestOutput) {
  const rules = params.rules.map((rule, index) => ({
    days: [...new Set(rule.days)].sort(),
    ...minuteRange(rule, `rules[${index}]`),
  }));
  const overrides = params.overrides?.map((override, index) => {
    try {
      parseLocalDate(override.date);
    } catch {
      throw new SchedulingError("invalid_schedule", `"${override.date}" isn't a date.`, {
        param: `overrides[${index}].date`,
      });
    }
    return {
      date: override.date,
      ranges: override.ranges.map((range, rangeIndex) =>
        minuteRange(range, `overrides[${index}].ranges[${rangeIndex}]`),
      ),
    };
  });
  if (overrides && new Set(overrides.map((o) => o.date)).size !== overrides.length) {
    throw new SchedulingError("invalid_schedule", "A date can have only one override.", {
      param: "overrides",
    });
  }
  return { rules, overrides };
}

async function overridesOf(executor: Executor, row: ScheduleRow): Promise<OverrideRow[]> {
  return executor
    .select()
    .from(schedulingScheduleOverride)
    .where(
      and(
        eq(schedulingScheduleOverride.scheduleId, row.id),
        eq(schedulingScheduleOverride.organizationId, row.organizationId),
      ),
    )
    .orderBy(asc(schedulingScheduleOverride.date));
}

async function replaceOverrides(
  tx: Executor,
  row: ScheduleRow,
  overrides: ReturnType<typeof checkedValues>["overrides"],
): Promise<void> {
  if (!overrides) return;
  await tx
    .delete(schedulingScheduleOverride)
    .where(
      and(
        eq(schedulingScheduleOverride.scheduleId, row.id),
        eq(schedulingScheduleOverride.organizationId, row.organizationId),
      ),
    );
  if (overrides.length > 0) {
    await tx.insert(schedulingScheduleOverride).values(
      overrides.map((override) => ({
        scheduleId: row.id,
        organizationId: row.organizationId,
        ...override,
      })),
    );
  }
}

async function clearOtherDefaults(
  tx: Executor,
  row: { hostId: string; organizationId: string; id?: string },
) {
  await tx
    .update(schedulingSchedule)
    .set({ isDefault: false })
    .where(
      and(
        eq(schedulingSchedule.hostId, row.hostId),
        eq(schedulingSchedule.organizationId, row.organizationId),
        eq(schedulingSchedule.isDefault, true),
        row.id ? ne(schedulingSchedule.id, row.id) : undefined,
      ),
    );
}

/** A host's first schedule is its default, whatever it asks for. */
export async function createSchedule(
  scope: Scope,
  hostRef: string,
  params: UpsertScheduleRequestOutput,
): Promise<ScheduleObjectOutput> {
  if (params.time_zone) checkTimeZone(params.time_zone, "time_zone");
  const { rules, overrides } = checkedValues(params);
  return db.transaction(async (tx) => {
    const host = await resolveHost(tx, scope, hostRef);
    const [first] = await tx
      .select({ id: schedulingSchedule.id })
      .from(schedulingSchedule)
      .where(
        and(
          eq(schedulingSchedule.hostId, host.id),
          eq(schedulingSchedule.organizationId, host.organizationId),
        ),
      )
      .limit(1);
    const isDefault = !first || params.is_default === true;
    if (isDefault) {
      await clearOtherDefaults(tx, { hostId: host.id, organizationId: host.organizationId });
    }
    const [row] = await tx
      .insert(schedulingSchedule)
      .values({
        organizationId: host.organizationId,
        environmentId: host.environmentId,
        hostId: host.id,
        name: params.name ?? "Default",
        timeZone: params.time_zone ?? host.timeZone,
        rules,
        isDefault,
      })
      .returning();
    const schedule = row as ScheduleRow;
    await replaceOverrides(tx, schedule, overrides);
    return toScheduleObject(schedule, await overridesOf(tx, schedule));
  });
}

async function findSchedule(
  executor: Executor,
  scope: Scope,
  hostId: string,
  scheduleId: string,
): Promise<ScheduleRow> {
  const [row] = await executor
    .select()
    .from(schedulingSchedule)
    .where(
      and(
        eq(schedulingSchedule.id, scheduleId),
        eq(schedulingSchedule.hostId, hostId),
        eq(schedulingSchedule.organizationId, scope.organizationId),
        eq(schedulingSchedule.environmentId, scope.environmentId),
      ),
    )
    .limit(1);
  if (!row) throw new SchedulingError("not_found", `No schedule "${scheduleId}" on this host.`);
  return row;
}

export async function listSchedules(
  scope: Scope,
  hostRef: string,
): Promise<ScheduleObjectOutput[]> {
  const host = await resolveHost(db, scope, hostRef);
  const rows = await db
    .select()
    .from(schedulingSchedule)
    .where(
      and(
        eq(schedulingSchedule.hostId, host.id),
        eq(schedulingSchedule.organizationId, host.organizationId),
      ),
    )
    .orderBy(asc(schedulingSchedule.id));
  return Promise.all(rows.map(async (row) => toScheduleObject(row, await overridesOf(db, row))));
}

export async function getSchedule(
  scope: Scope,
  hostRef: string,
  scheduleId: string,
): Promise<ScheduleObjectOutput> {
  const host = await resolveHost(db, scope, hostRef);
  const row = await findSchedule(db, scope, host.id, scheduleId);
  return toScheduleObject(row, await overridesOf(db, row));
}

export async function updateSchedule(
  scope: Scope,
  hostRef: string,
  scheduleId: string,
  params: UpsertScheduleRequestOutput,
): Promise<ScheduleObjectOutput> {
  if (params.time_zone) checkTimeZone(params.time_zone, "time_zone");
  const { rules, overrides } = checkedValues(params);
  return db.transaction(async (tx) => {
    const host = await resolveHost(tx, scope, hostRef);
    const existing = await findSchedule(tx, scope, host.id, scheduleId);
    if (params.is_default === true) await clearOtherDefaults(tx, existing);
    const [row] = await tx
      .update(schedulingSchedule)
      .set({
        rules,
        ...(params.name !== undefined ? { name: params.name } : {}),
        ...(params.time_zone !== undefined ? { timeZone: params.time_zone } : {}),
        ...(params.is_default === true ? { isDefault: true } : {}),
      })
      .where(
        and(
          eq(schedulingSchedule.id, existing.id),
          eq(schedulingSchedule.organizationId, existing.organizationId),
        ),
      )
      .returning();
    const schedule = row as ScheduleRow;
    await replaceOverrides(tx, schedule, overrides);
    return toScheduleObject(schedule, await overridesOf(tx, schedule));
  });
}

export async function deleteSchedule(
  scope: Scope,
  hostRef: string,
  scheduleId: string,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const host = await resolveHost(tx, scope, hostRef);
    const existing = await findSchedule(tx, scope, host.id, scheduleId);
    if (existing.isDefault) {
      throw new SchedulingError(
        "invalid_schedule",
        "This is the host's default schedule. Make another one the default first.",
      );
    }
    await tx
      .delete(schedulingSchedule)
      .where(
        and(
          eq(schedulingSchedule.id, existing.id),
          eq(schedulingSchedule.organizationId, existing.organizationId),
        ),
      );
    return { id: existing.id };
  });
}
