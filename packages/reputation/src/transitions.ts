/**
 * Every standing change goes through `applyTransition`: a guarded update (a lost race is a
 * no-op), a history row, the webhook announcements and (warnings, suspensions) the notification
 * email to owners and admins, all in one transaction.
 */
import { db, type Executor, schema } from "@coss/db";
import { ID_PREFIXES, newId } from "@coss/db/id";
import { enqueuePush } from "@coss/push";
import { enqueueWebhookMessage } from "@coss/webhooks";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { ReputationError } from "./errors.ts";
import { enqueueReputationNotification, NOTIFIED_TRANSITIONS } from "./notifications.ts";
import {
  type AccountEventType,
  effectivePolicy,
  ReputationPolicyOverrides,
  type ReputationStatus,
  type StoredAccountWebhookEvent,
} from "./schemas.ts";
import {
  getReputationStanding,
  type MetricsSnapshot,
  metricsSnapshot,
  type ReputationEventRow,
  type ReputationStandingRow,
  toCheckObject,
  toMarketingObject,
} from "./standing.ts";

const { adminAuditEvent, environment, reputationEvent, reputationStanding, user } = schema;

// Keep the platform audit trail atomic with reputation changes without importing tenancy.
async function auditAdminChange(
  tx: Executor,
  input: {
    organizationId: string;
    userId: string;
    action: string;
    note?: string | null;
    now: Date;
  },
): Promise<void> {
  const [actor] = await tx
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, input.userId));
  if (!actor) throw new Error("Admin actor no longer exists.");
  await tx.insert(adminAuditEvent).values({
    actorUserId: input.userId,
    actorEmail: actor.email,
    action: input.action,
    targetType: "organization",
    targetId: input.organizationId,
    organizationId: input.organizationId,
    reason: input.note ?? null,
    createdAt: input.now,
  });
}

export type TransitionType = "warning_raised" | "warning_cleared" | "suspended" | "reinstated";
/** The marketing stream's own transitions; they never change the organization's status. */
export type MarketingTransitionType = "marketing_paused" | "marketing_reinstated";

const WEBHOOK_TYPE: Record<TransitionType | MarketingTransitionType, AccountEventType> = {
  warning_raised: "account.reputation_warning",
  warning_cleared: "account.reputation_recovered",
  suspended: "account.suspended",
  reinstated: "account.reinstated",
  marketing_paused: "account.marketing_paused",
  marketing_reinstated: "account.marketing_reinstated",
};

/**
 * Announces a change to every live environment's endpoints (sandbox environments never send real
 * mail), in `tx`. `standing` is the row after the change.
 */
async function announce(
  tx: Executor,
  input: {
    organizationId: string;
    type: TransitionType | MarketingTransitionType;
    from: ReputationStatus;
    standing: Pick<
      ReputationStandingRow,
      "status" | "reason" | "marketingPausedAt" | "marketingReason"
    >;
    metrics?: MetricsSnapshot | null;
    now: Date;
  },
): Promise<void> {
  const { organizationId, now, standing } = input;
  const environments = await tx
    .select({ id: environment.id })
    .from(environment)
    .where(and(eq(environment.organizationId, organizationId), eq(environment.mode, "live")));
  for (const { id: environmentId } of environments) {
    // Message ids are global: one per environment.
    const id = newId(ID_PREFIXES.webhookEvent);
    const payload: StoredAccountWebhookEvent = {
      id,
      object: "event",
      type: WEBHOOK_TYPE[input.type],
      created_at: now.toISOString(),
      data: {
        organization_id: organizationId,
        status: standing.status,
        previous_status: input.from,
        reason: standing.status === "good" ? null : standing.reason,
        occurred_at: now.toISOString(),
        checks: (input.metrics?.checks ?? []).map(toCheckObject),
        marketing: toMarketingObject(standing),
      },
    };
    await enqueueWebhookMessage(tx, {
      id,
      organizationId,
      environmentId,
      type: payload.type,
      payload,
      now,
    });
  }
}

export type Actor = { kind: "system" } | { kind: "admin"; userId: string };

/**
 * Moves the organization from `from` to `to` in `tx`. Returns the history row, or `null` when
 * the standing was no longer `from` (another worker or admin got there first).
 */
export async function applyTransition(
  tx: Executor,
  input: {
    organizationId: string;
    from: ReputationStatus;
    to: ReputationStatus;
    type: TransitionType;
    trigger: string;
    actor: Actor;
    note?: string | null;
    metrics?: MetricsSnapshot | null;
    now?: Date;
  },
): Promise<ReputationEventRow | null> {
  const now = input.now ?? new Date();
  const { organizationId } = input;
  await tx.insert(reputationStanding).values({ organizationId }).onConflictDoNothing();
  const [updated] = await tx
    .update(reputationStanding)
    .set({
      revision: sql`${reputationStanding.revision} + 1`,
      status: input.to,
      reason: input.to === "good" ? null : input.trigger,
      statusChangedAt: now,
      ...(input.type === "reinstated" ? { reinstatedAt: now } : {}),
    })
    .where(
      and(
        eq(reputationStanding.organizationId, organizationId),
        eq(reputationStanding.status, input.from),
      ),
    )
    .returning();
  if (!updated) return null;

  const [event] = await tx
    .insert(reputationEvent)
    .values({
      organizationId,
      type: input.type,
      trigger: input.trigger,
      actor: input.actor.kind,
      actorUserId: input.actor.kind === "admin" ? input.actor.userId : null,
      note: input.note ?? null,
      metrics: input.metrics ?? null,
      createdAt: now,
    })
    .returning();
  if (!event) throw new Error("Inserting the reputation event returned no row.");
  if (input.actor.kind === "admin") {
    await auditAdminChange(tx, {
      organizationId,
      userId: input.actor.userId,
      action: `reputation.${input.type}`,
      note: input.note,
      now,
    });
  }

  await enqueueReputationNotification(tx, {
    organizationId,
    reputationEventId: event.id,
    type: input.type,
    now,
  });
  if (NOTIFIED_TRANSITIONS.has(input.type)) {
    await enqueuePush(tx, {
      organizationId,
      kind: input.type === "suspended" ? "reputation_suspended" : "reputation_warning",
      subjectId: event.id,
      now,
    });
  }

  // Standing is organization-wide; announce it to every live environment's endpoints.
  await announce(tx, {
    organizationId,
    type: input.type,
    from: input.from,
    standing: updated,
    metrics: input.metrics,
    now,
  });
  return event;
}

/**
 * Pauses (`marketing_paused`) or lifts the pause of (`marketing_reinstated`) the organization's
 * marketing stream in `tx`, with the same history row, admin audit, notification (pauses) and
 * webhooks as a standing change. The organization's status is left as it is. Returns `null` when
 * marketing was already in the target state (another worker or admin got there first).
 */
export async function applyMarketingTransition(
  tx: Executor,
  input: {
    organizationId: string;
    type: MarketingTransitionType;
    trigger: string;
    actor: Actor;
    note?: string | null;
    metrics?: MetricsSnapshot | null;
    now?: Date;
  },
): Promise<ReputationEventRow | null> {
  const now = input.now ?? new Date();
  const { organizationId } = input;
  const pause = input.type === "marketing_paused";
  await tx.insert(reputationStanding).values({ organizationId }).onConflictDoNothing();
  const [updated] = await tx
    .update(reputationStanding)
    .set({
      revision: sql`${reputationStanding.revision} + 1`,
      marketingPausedAt: pause ? now : null,
      marketingReason: pause ? input.trigger : null,
      ...(pause ? {} : { marketingReinstatedAt: now }),
    })
    .where(
      and(
        eq(reputationStanding.organizationId, organizationId),
        pause
          ? isNull(reputationStanding.marketingPausedAt)
          : isNotNull(reputationStanding.marketingPausedAt),
      ),
    )
    .returning();
  if (!updated) return null;

  const [event] = await tx
    .insert(reputationEvent)
    .values({
      organizationId,
      type: input.type,
      trigger: input.trigger,
      actor: input.actor.kind,
      actorUserId: input.actor.kind === "admin" ? input.actor.userId : null,
      note: input.note ?? null,
      metrics: input.metrics ?? null,
      createdAt: now,
    })
    .returning();
  if (!event) throw new Error("Inserting the reputation event returned no row.");
  if (input.actor.kind === "admin") {
    await auditAdminChange(tx, {
      organizationId,
      userId: input.actor.userId,
      action: `reputation.${input.type}`,
      note: input.note,
      now,
    });
  }
  await enqueueReputationNotification(tx, {
    organizationId,
    reputationEventId: event.id,
    type: input.type,
    now,
  });
  await announce(tx, {
    organizationId,
    type: input.type,
    from: updated.status,
    standing: updated,
    metrics: input.metrics,
    now,
  });
  return event;
}

/**
 * Admin only: lifts the marketing stream's pause. Marketing rates are measured from now on, so
 * the data that caused the pause can't immediately cause another one.
 */
export async function reinstateMarketing(input: {
  organizationId: string;
  adminUserId: string;
  note: string;
  now?: Date;
}): Promise<ReputationEventRow> {
  const event = await db.transaction(async (tx) => {
    const current = await getReputationStanding(input.organizationId, tx);
    if (!current?.marketingPausedAt) return null;
    return applyMarketingTransition(tx, {
      organizationId: input.organizationId,
      type: "marketing_reinstated",
      trigger: current.marketingReason ?? "manual",
      actor: { kind: "admin", userId: input.adminUserId },
      note: input.note,
      metrics: metricsSnapshot(current.metrics),
      now: input.now,
    });
  });
  if (!event) {
    throw new ReputationError("marketing_not_paused", "Marketing sending is not paused.");
  }
  return event;
}

/**
 * Suspends live sending. Used by the guard and by admins; one-off triggers (e.g. a content
 * review) call this directly with their own `trigger`, optionally inside their own transaction
 * `tx`. Returns `null` if already suspended.
 */
export async function suspendOrganization(
  input: {
    organizationId: string;
    trigger: string;
    actor: Actor;
    note?: string | null;
    metrics?: MetricsSnapshot | null;
    now?: Date;
  },
  tx?: Executor,
): Promise<ReputationEventRow | null> {
  const run = async (tx: Executor) => {
    const current = await getReputationStanding(input.organizationId, tx);
    if (current?.status === "suspended") return null;
    return applyTransition(tx, {
      ...input,
      from: current?.status ?? "good",
      to: "suspended",
      type: "suspended",
      metrics: input.metrics ?? metricsSnapshot(current?.metrics),
    });
  };
  return tx ? run(tx) : db.transaction(run);
}

/**
 * Admin only: lifts a suspension. Rates are measured from now on, so the data that caused the
 * suspension can't immediately cause another one.
 */
export async function reinstateOrganization(input: {
  organizationId: string;
  adminUserId: string;
  note: string;
  now?: Date;
}): Promise<ReputationEventRow> {
  const event = await db.transaction(async (tx) => {
    const current = await getReputationStanding(input.organizationId, tx);
    if (current?.status !== "suspended") return null;
    const moved = await applyTransition(tx, {
      organizationId: input.organizationId,
      from: "suspended",
      to: "good",
      type: "reinstated",
      trigger: current.reason ?? "manual",
      actor: { kind: "admin", userId: input.adminUserId },
      note: input.note,
      metrics: metricsSnapshot(current.metrics),
      now: input.now,
    });
    if (moved) {
      await tx
        .delete(schema.emailSenderDomainBlock)
        .where(
          and(
            eq(schema.emailSenderDomainBlock.organizationId, input.organizationId),
            isNull(schema.emailSenderDomainBlock.groupId),
          ),
        );
    }
    return moved;
  });
  if (!event) {
    throw new ReputationError("not_suspended", "This organization is not suspended.");
  }
  return event;
}

/**
 * Admin only: replaces the organization's policy overrides (`null` restores the defaults),
 * records it in the history and asks the worker to re-evaluate with the new policy.
 */
export async function updateReputationPolicy(input: {
  organizationId: string;
  overrides: ReputationPolicyOverrides | null;
  adminUserId: string;
  note?: string | null;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  let overrides: ReputationPolicyOverrides | null = null;
  if (input.overrides) {
    try {
      overrides = ReputationPolicyOverrides.parse(input.overrides);
      effectivePolicy(overrides);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ReputationError(
          "invalid_policy",
          error.issues[0]?.message ?? "The policy is invalid.",
        );
      }
      throw error;
    }
  }
  await db.transaction(async (tx) => {
    await tx
      .insert(reputationStanding)
      .values({
        organizationId: input.organizationId,
        policyOverrides: overrides,
        nextEvaluationAt: now,
      })
      .onConflictDoUpdate({
        target: reputationStanding.organizationId,
        set: {
          policyOverrides: overrides,
          nextEvaluationAt: now,
          revision: sql`${reputationStanding.revision} + 1`,
        },
      });
    await auditAdminChange(tx, {
      organizationId: input.organizationId,
      userId: input.adminUserId,
      action: "reputation.policy_updated",
      note: input.note,
      now,
    });
    await tx.insert(reputationEvent).values({
      organizationId: input.organizationId,
      type: "policy_updated",
      trigger: "policy",
      actor: "admin",
      actorUserId: input.adminUserId,
      note: input.note ?? null,
      metrics: overrides ? { overrides } : null,
      createdAt: now,
    });
  });
}
