/**
 * Open/click tracking and one-click unsubscribe settings, per environment: an optional default
 * (the rule with no category) and per-category rules. Everything is off unless a rule or the send
 * turns it on. Each field resolves on its own: the send's `tracking`, then its category's rule,
 * then the default.
 */
import { HipaaModeError, hipaaModeApplies } from "@coss/compliance";
import { db, type Executor, schema } from "@coss/db";
import { isId } from "@coss/db/id";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import type {
  TrackingOptionsOutput,
  TrackingRuleInputOutput,
  TrackingRuleOutput,
  TrackingSettingsOutput,
  UpdateTrackingRuleRequestOutput,
} from "./schemas.ts";

const { emailTrackingRule } = schema;

export type TrackingRuleRow = typeof emailTrackingRule.$inferSelect;

/** The environment tracking settings belong to. */
export type TrackingEnvironment = { organizationId: string; environmentId: string };

export type ResolvedTracking = { opens: boolean; clicks: boolean; unsubscribe: boolean };

export type TrackingSettings = {
  /** The rule without a category; `null` when the environment never set one (tracking off). */
  default: TrackingRuleRow | null;
  /** Category rules, by category name. */
  categories: TrackingRuleRow[];
};

export function toTrackingRuleObject(row: TrackingRuleRow): TrackingRuleOutput {
  return {
    object: "tracking_rule",
    id: row.id,
    category: row.category,
    opens: row.opens,
    clicks: row.clicks,
    unsubscribe: row.unsubscribe,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function toTrackingSettingsObject(settings: TrackingSettings): TrackingSettingsOutput {
  return {
    object: "tracking_settings",
    default: settings.default ? toTrackingRuleObject(settings.default) : null,
    categories: settings.categories.map(toTrackingRuleObject),
  };
}

function inEnvironment(env: TrackingEnvironment) {
  return and(
    eq(emailTrackingRule.organizationId, env.organizationId),
    eq(emailTrackingRule.environmentId, env.environmentId),
  );
}

export async function getTrackingSettings(env: TrackingEnvironment): Promise<TrackingSettings> {
  const rows = await db
    .select()
    .from(emailTrackingRule)
    .where(inEnvironment(env))
    .orderBy(sql`${emailTrackingRule.category} asc nulls first`, asc(emailTrackingRule.id));
  return {
    default: rows.find((row) => row.category === null) ?? null,
    categories: rows.filter((row) => row.category !== null),
  };
}

/** What a send gets: `override` fields win, then the category's rule, then the default, then off. */
export async function resolveTracking(
  executor: Executor,
  env: TrackingEnvironment,
  category: string | null,
  override: TrackingOptionsOutput | undefined,
): Promise<ResolvedTracking> {
  const hipaaMode = await hipaaModeApplies(env.environmentId, executor);
  if (hipaaMode && (override?.opens || override?.clicks)) throw hipaaTrackingRefused();
  if (
    override?.opens !== undefined &&
    override.clicks !== undefined &&
    override.unsubscribe !== undefined
  ) {
    return { opens: override.opens, clicks: override.clicks, unsubscribe: override.unsubscribe };
  }
  const rows = await executor
    .select()
    .from(emailTrackingRule)
    .where(
      and(
        inEnvironment(env),
        category === null
          ? isNull(emailTrackingRule.category)
          : or(isNull(emailTrackingRule.category), eq(emailTrackingRule.category, category)),
      ),
    );
  const rule =
    rows.find((row) => row.category !== null) ?? rows.find((row) => row.category === null);
  return {
    opens: !hipaaMode && (override?.opens ?? rule?.opens ?? false),
    clicks: !hipaaMode && (override?.clicks ?? rule?.clicks ?? false),
    unsubscribe: override?.unsubscribe ?? rule?.unsubscribe ?? false,
  };
}

/** Stored link URLs outlive discarded content, so HIPAA mode has no tracking to turn on. */
export function hipaaTrackingRefused(): HipaaModeError {
  return new HipaaModeError("HIPAA mode turns off open and click tracking in live environments.");
}

/**
 * Sets the environment default (`category: null`) or a category's rule. The project is derived
 * from the environment row; `null` when the environment is not the organization's.
 */
export async function upsertTrackingRule(
  env: TrackingEnvironment,
  input: TrackingRuleInputOutput,
): Promise<TrackingRuleRow | null> {
  return updateTrackingRule(env, input.category, {
    opens: input.opens,
    clicks: input.clicks,
    unsubscribe: input.unsubscribe,
  });
}

/**
 * Sets the given fields of the environment default (`category: null`) or a category's rule,
 * creating it (fields left out off) when there is none; fields left out of an existing rule keep
 * their value. `null` when the environment is not the organization's.
 */
export async function updateTrackingRule(
  env: TrackingEnvironment,
  category: string | null,
  input: UpdateTrackingRuleRequestOutput,
): Promise<TrackingRuleRow | null> {
  if ((input.opens || input.clicks) && (await hipaaModeApplies(env.environmentId))) {
    throw hipaaTrackingRefused();
  }
  const [environment] = await db
    .select({ projectId: schema.environment.projectId })
    .from(schema.environment)
    .where(
      and(
        eq(schema.environment.id, env.environmentId),
        eq(schema.environment.organizationId, env.organizationId),
      ),
    )
    .limit(1);
  if (!environment) return null;
  const [row] = await db
    .insert(emailTrackingRule)
    .values({
      organizationId: env.organizationId,
      projectId: environment.projectId,
      environmentId: env.environmentId,
      category,
      opens: input.opens ?? false,
      clicks: input.clicks ?? false,
      unsubscribe: input.unsubscribe ?? false,
    })
    .onConflictDoUpdate({
      target: [emailTrackingRule.environmentId, emailTrackingRule.category],
      set: {
        ...(input.opens === undefined ? {} : { opens: input.opens }),
        ...(input.clicks === undefined ? {} : { clicks: input.clicks }),
        ...(input.unsubscribe === undefined ? {} : { unsubscribe: input.unsubscribe }),
        updatedAt: new Date(),
      },
      // The conflicting row is in this environment, so it is the organization's too.
      setWhere: eq(emailTrackingRule.organizationId, env.organizationId),
    })
    .returning();
  return row ?? null;
}

/** Removes a rule of the environment (the default too: tracking is then off unless a send asks). */
export async function deleteTrackingRule(env: TrackingEnvironment, id: string): Promise<boolean> {
  if (!isId("etr", id)) return false;
  const deleted = await db
    .delete(emailTrackingRule)
    .where(and(inEnvironment(env), eq(emailTrackingRule.id, id)))
    .returning({ id: emailTrackingRule.id });
  return deleted.length > 0;
}

/** Removes the environment default (`category: null`) or a category's rule; the removed row. */
export async function deleteTrackingRuleFor(
  env: TrackingEnvironment,
  category: string | null,
): Promise<TrackingRuleRow | null> {
  const [deleted] = await db
    .delete(emailTrackingRule)
    .where(
      and(
        inEnvironment(env),
        category === null
          ? isNull(emailTrackingRule.category)
          : eq(emailTrackingRule.category, category),
      ),
    )
    .returning();
  return deleted ?? null;
}
