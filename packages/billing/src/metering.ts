/**
 * Metering: what products call, in the transaction that makes their usage billable (an email
 * becoming `sent`). Imports only `@coss/db`, so any product package can depend on it.
 */
import { db, type Executor, schema, type Transaction } from "@coss/db";
import { type AnyColumn, and, eq, exists, inArray, or, type SQL, sql } from "drizzle-orm";
import type { MeterKey } from "./catalog/meters.ts";
import type { UsageGate } from "./gate.ts";

const { billingBudgetHold, billingHold, billingUsage, billingUsageAttribution } = schema;

/** Rows per organization, hour and meter that concurrent writers spread over. */
const USAGE_SHARDS = 8;

export type UsageInput = {
  organizationId: string;
  environmentId: string;
  meter: MeterKey;
  quantity: number;
  /** `dimensionKey(...)`, e.g. `country=US`; `""` (default) for none. */
  dimension?: string;
  /** Who the usage came from (spend breakdowns and budgets): the environment's project. */
  projectId?: string | null;
  /** The API key that caused it; `null` for the dashboard and other keyless paths. */
  apiKeyId?: string | null;
  /** The member whose personal key caused it; `null` for organization keys. */
  userId?: string | null;
};

/**
 * Adds usage to the current hour's counter. Call it exactly once per billable event, in the
 * transaction that records the event (the caller guarantees once-only, e.g. with a
 * compare-and-set): the hour is the transaction's, so a closed period never changes after the
 * settle window.
 */
export async function recordUsage(tx: Executor, input: UsageInput): Promise<void> {
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) return;
  const hourStart = sql`date_trunc('hour', transaction_timestamp(), 'UTC')`;
  const shard = Math.floor(Math.random() * USAGE_SHARDS);
  await tx
    .insert(billingUsage)
    .values({
      organizationId: input.organizationId,
      hourStart,
      meter: input.meter,
      dimension: input.dimension ?? "",
      environmentId: input.environmentId,
      shard,
      quantity: input.quantity,
    })
    .onConflictDoUpdate({
      target: [
        billingUsage.organizationId,
        billingUsage.hourStart,
        billingUsage.meter,
        billingUsage.dimension,
        billingUsage.environmentId,
        billingUsage.shard,
      ],
      set: { quantity: sql`${billingUsage.quantity} + excluded.quantity` },
    });
  await tx
    .insert(billingUsageAttribution)
    .values({
      organizationId: input.organizationId,
      hourStart,
      meter: input.meter,
      dimension: input.dimension ?? "",
      environmentId: input.environmentId,
      projectId: input.projectId ?? "",
      apiKeyId: input.apiKeyId ?? "",
      userId: input.userId ?? "",
      shard,
      quantity: input.quantity,
    })
    .onConflictDoUpdate({
      target: [
        billingUsageAttribution.organizationId,
        billingUsageAttribution.hourStart,
        billingUsageAttribution.meter,
        billingUsageAttribution.dimension,
        billingUsageAttribution.environmentId,
        billingUsageAttribution.apiKeyId,
        billingUsageAttribution.userId,
        billingUsageAttribution.shard,
      ],
      set: { quantity: sql`${billingUsageAttribution.quantity} + excluded.quantity` },
    });
}

/**
 * Counts a resource's `days` toward a capped plan's allowance, one by one (each in a savepoint),
 * until it refuses one. The resource already exists, so days past it are still recorded by the
 * caller (and written off), never refused.
 */
export async function countTowardAllowance(
  tx: Executor,
  gate: UsageGate,
  input: { organizationId: string; meter: MeterKey; days: number },
): Promise<void> {
  for (let day = 0; day < input.days; day++) {
    try {
      await (tx as Transaction).transaction((savepoint) =>
        gate.reserve(savepoint, {
          organizationId: input.organizationId,
          meter: input.meter,
          quantity: 1,
        }),
      );
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === "usage_limit_exceeded" || code === "plan_feature_unavailable") return;
      throw error;
    }
  }
}

/** Whether live sending is held for billing (any reason). */
export async function isOnBillingHold(
  organizationId: string,
  executor: Executor = db,
): Promise<boolean> {
  const [row] = await executor
    .select({ reason: billingHold.reason })
    .from(billingHold)
    .where(eq(billingHold.organizationId, organizationId))
    .limit(1);
  return Boolean(row);
}

/** `EXISTS` a billing hold for the organization in `organizationId` (e.g. `email.organization_id`). */
export function billingHoldExists(organizationId: AnyColumn): SQL {
  return exists(
    db
      .select({ reason: billingHold.reason })
      .from(billingHold)
      .where(eq(billingHold.organizationId, organizationId)),
  );
}

/** What a budget hold is on: a member's personal keys, a project or an API key. */
export type BudgetHoldScope = "user" | "project" | "api_key";

/** Where a live send comes from, as far as budgets go. */
export type SpendSourceInput = {
  organizationId: string;
  projectId: string;
  apiKeyId?: string | null;
  /** The member whose personal key it is. */
  userId?: string | null;
};

const HOLD_ORDER: readonly BudgetHoldScope[] = ["api_key", "user", "project"];

/**
 * The budget that stops a live send from this source this month, if any (the most specific one:
 * its key, then its member, then its project).
 */
export async function budgetHoldFor(
  input: SpendSourceInput,
  executor: Executor = db,
): Promise<BudgetHoldScope | null> {
  const targets = [
    and(eq(billingBudgetHold.scope, "project"), eq(billingBudgetHold.targetId, input.projectId)),
    input.apiKeyId
      ? and(eq(billingBudgetHold.scope, "api_key"), eq(billingBudgetHold.targetId, input.apiKeyId))
      : undefined,
    input.userId
      ? and(eq(billingBudgetHold.scope, "user"), eq(billingBudgetHold.targetId, input.userId))
      : undefined,
  ];
  const rows = await executor
    .select({ scope: billingBudgetHold.scope })
    .from(billingBudgetHold)
    .where(
      and(
        eq(billingBudgetHold.organizationId, input.organizationId),
        inArray(billingBudgetHold.scope, HOLD_ORDER as BudgetHoldScope[]),
        or(...targets),
      ),
    );
  const scopes = new Set(rows.map((row) => row.scope));
  return HOLD_ORDER.find((scope) => scopes.has(scope)) ?? null;
}

/**
 * `EXISTS` a budget hold on the source in these columns (e.g. `email.project_id`): what a
 * scheduled send waits on.
 */
export function budgetHoldExists(columns: {
  organizationId: AnyColumn;
  projectId: AnyColumn;
  apiKeyId: AnyColumn;
  userId: AnyColumn;
}): SQL {
  return exists(
    db
      .select({ scope: billingBudgetHold.scope })
      .from(billingBudgetHold)
      .where(
        and(
          eq(billingBudgetHold.organizationId, columns.organizationId),
          or(
            and(
              eq(billingBudgetHold.scope, "project"),
              eq(billingBudgetHold.targetId, columns.projectId),
            ),
            and(
              eq(billingBudgetHold.scope, "api_key"),
              eq(billingBudgetHold.targetId, columns.apiKeyId),
            ),
            and(
              eq(billingBudgetHold.scope, "user"),
              eq(billingBudgetHold.targetId, columns.userId),
            ),
          ),
        ),
      ),
  );
}

/** What a send over budget is told, per scope. */
export const BUDGET_EXCEEDED_MESSAGES: Record<BudgetHoldScope, string> = {
  api_key:
    "Live sending with this API key is paused: it reached its monthly budget. An owner can raise " +
    "the budget on the organization's Spend page; it resets next month.",
  user:
    "Live sending with your personal API keys is paused: you reached your monthly budget. An " +
    "owner can raise it on the organization's Spend page; it resets next month.",
  project:
    "Live sending in this project is paused: it reached its monthly budget. An owner can raise " +
    "the budget on the organization's Spend page; it resets next month.",
};
