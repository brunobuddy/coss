/**
 * Credit grants and their ledger. A grant's balance is its amount less its entries; entries are
 * append-only (an invoice's drawdown is reversed by negative entries when it is voided).
 */
import { db, type Executor, schema, type Transaction } from "@coss/db";
import { and, desc, eq, gt, inArray, isNull, like, lt, or, sql } from "drizzle-orm";
import { announce } from "./announce.ts";
import { type AdminActor, auditBillingChange } from "./audit.ts";
import { isMeterKey, type MeterKey } from "./catalog/meters.ts";
import type { DraftGrant, GrantApplication, GrantBalance, GrantSource } from "./engine/types.ts";
import { BillingError } from "./errors.ts";
import { toCreditObject } from "./objects.ts";
import type { Interval } from "./time.ts";

const { billingCreditEntry, billingCreditGrant } = schema;

export type GrantRow = typeof billingCreditGrant.$inferSelect;
export type Grant = GrantRow & { remaining: bigint; used: bigint };

// The outer column is spelled out: in a single-table select, Drizzle doesn't qualify columns, and an
// unqualified `id` would resolve to the entry's own.
const used = sql<string>`coalesce((select sum(${billingCreditEntry.amount}) from ${billingCreditEntry} where ${billingCreditEntry.grantId} = ${sql.raw('"billing_credit_grant"."id"')}), 0)`;

function toGrant(row: GrantRow & { used: string }): Grant {
  const consumed = BigInt(row.used);
  return { ...row, used: consumed, remaining: row.amount - consumed };
}

/** Grants usable in `interval` (not voided, overlapping it), with balances. */
export async function grantsFor(
  organizationId: string,
  interval: Interval,
  executor: Executor = db,
): Promise<Grant[]> {
  const rows = await executor
    .select({ grant: billingCreditGrant, used })
    .from(billingCreditGrant)
    .where(
      and(
        eq(billingCreditGrant.organizationId, organizationId),
        isNull(billingCreditGrant.voidedAt),
        lt(billingCreditGrant.effectiveAt, interval.end),
        or(isNull(billingCreditGrant.expiresAt), gt(billingCreditGrant.expiresAt, interval.start)),
      ),
    );
  return rows.map((row) => toGrant({ ...row.grant, used: row.used }));
}

/** Every grant of the organization, newest first (the dashboard and admin console). */
export async function listGrants(
  organizationId: string,
  executor: Executor = db,
): Promise<Grant[]> {
  const rows = await executor
    .select({ grant: billingCreditGrant, used })
    .from(billingCreditGrant)
    .where(eq(billingCreditGrant.organizationId, organizationId))
    .orderBy(desc(billingCreditGrant.createdAt))
    .limit(200);
  return rows.map((row) => toGrant({ ...row.grant, used: row.used }));
}

export function toGrantBalance(grant: Grant): GrantBalance {
  return {
    id: grant.id,
    kind: grant.kind,
    meter: grant.meter && isMeterKey(grant.meter) ? grant.meter : null,
    dimension: grant.dimension,
    remaining: grant.remaining,
    scope: grant.scope ? (grant.scope.filter(isMeterKey) as MeterKey[]) : null,
    appliesTo: grant.appliesTo,
    effectiveAt: grant.effectiveAt,
    expiresAt: grant.expiresAt,
    createdAt: grant.createdAt,
    ...(grant.source === "threshold" ? { lineDescription: "Usage already charged" } : {}),
  };
}

/** Keys of grants already made among `keys` (so the engine doesn't make them twice). */
export async function existingGrantKeys(
  keys: string[],
  executor: Executor = db,
): Promise<Set<string>> {
  if (!keys.length) return new Set();
  const rows = await executor
    .select({ key: billingCreditGrant.grantKey })
    .from(billingCreditGrant)
    .where(inArray(billingCreditGrant.grantKey, keys));
  return new Set(rows.flatMap((row) => (row.key ? [row.key] : [])));
}

/**
 * Stores grants the engine made. A rollover grant takes over what's left of the commitment's
 * previous grant (recorded on that grant as `rolled_over`, so it can't be spent twice).
 */
export async function insertComposedGrants(
  tx: Transaction,
  organizationId: string,
  invoiceId: string | null,
  grants: readonly DraftGrant[],
): Promise<void> {
  for (const grant of grants) {
    let amount = grant.amount;
    let previous: Grant | null = null;
    if (grant.rolloverOf) {
      previous = await previousCommitmentGrant(
        tx,
        organizationId,
        grant.rolloverOf,
        grant.effectiveAt,
      );
      if (previous && previous.remaining > 0n) amount += previous.remaining;
    }
    const [inserted] = await tx
      .insert(billingCreditGrant)
      .values({
        organizationId,
        kind: grant.kind,
        amount,
        meter: grant.meter,
        dimension: grant.dimension,
        scope: grant.scope ? [...grant.scope] : null,
        appliesTo: grant.appliesTo,
        source: grant.source,
        grantKey: grant.key,
        contractId: grant.contractId,
        invoiceId:
          grant.source === "fee" || grant.source === "commitment" || grant.source === "threshold"
            ? invoiceId
            : null,
        description: grant.description,
        effectiveAt: grant.effectiveAt,
        expiresAt: grant.expiresAt,
      })
      .onConflictDoNothing({ target: billingCreditGrant.grantKey })
      .returning({ id: billingCreditGrant.id });
    if (inserted && previous && previous.remaining > 0n) {
      // Tied to the invoice, so voiding it gives the remainder back to the previous grant.
      await tx.insert(billingCreditEntry).values({
        organizationId,
        grantId: previous.id,
        invoiceId,
        kind: "rolled_over",
        amount: previous.remaining,
      });
    }
  }
}

/** The latest grant of a commitment (`<contract id>:<commitment id>`) that started before `before`. */
async function previousCommitmentGrant(
  tx: Transaction,
  organizationId: string,
  commitment: string,
  before: Date,
): Promise<Grant | null> {
  const [row] = await tx
    .select({ grant: billingCreditGrant, used })
    .from(billingCreditGrant)
    .where(
      and(
        eq(billingCreditGrant.organizationId, organizationId),
        like(billingCreditGrant.grantKey, `commitment:${commitment}:%`),
        lt(billingCreditGrant.effectiveAt, before),
        isNull(billingCreditGrant.voidedAt),
      ),
    )
    .orderBy(desc(billingCreditGrant.effectiveAt))
    .limit(1);
  return row ? toGrant({ ...row.grant, used: row.used }) : null;
}

export async function insertApplications(
  tx: Transaction,
  organizationId: string,
  invoiceId: string,
  applications: readonly GrantApplication[],
): Promise<void> {
  if (!applications.length) return;
  await tx.insert(billingCreditEntry).values(
    applications.map((application) => ({
      organizationId,
      grantId: application.grantId,
      invoiceId,
      kind: "applied" as const,
      amount: application.amount,
    })),
  );
}

/** Gives back what a voided invoice drew down, and voids the grants it funded. */
export async function reverseInvoiceCredits(
  tx: Transaction,
  organizationId: string,
  invoiceId: string,
  now: Date,
): Promise<void> {
  const applied = await tx
    .select({ grantId: billingCreditEntry.grantId, amount: billingCreditEntry.amount })
    .from(billingCreditEntry)
    .where(
      and(
        eq(billingCreditEntry.organizationId, organizationId),
        eq(billingCreditEntry.invoiceId, invoiceId),
        inArray(billingCreditEntry.kind, ["applied", "rolled_over"]),
      ),
    );
  if (applied.length) {
    await tx.insert(billingCreditEntry).values(
      applied.map((entry) => ({
        organizationId,
        grantId: entry.grantId,
        invoiceId,
        kind: "reversed" as const,
        amount: -entry.amount,
      })),
    );
  }
  await tx
    .update(billingCreditGrant)
    .set({ voidedAt: now, grantKey: null })
    .where(
      and(
        eq(billingCreditGrant.organizationId, organizationId),
        eq(billingCreditGrant.invoiceId, invoiceId),
        isNull(billingCreditGrant.voidedAt),
      ),
    );
}

export type NewCreditGrant = {
  organizationId: string;
  kind: "amount" | "units";
  /** Cents or units. */
  amount: bigint;
  meter?: MeterKey | null;
  dimension?: string | null;
  scope?: MeterKey[] | null;
  appliesTo?: "usage" | "any";
  source: Extract<GrantSource, "support" | "promotion" | "refund" | "sla">;
  description: string;
  effectiveAt: Date;
  expiresAt: Date | null;
};

/** A credit granted by hand (support, promotions, SLA credits): audited. */
export async function createCreditGrant(input: {
  grant: NewCreditGrant;
  actor: AdminActor;
  reason: string;
}): Promise<GrantRow> {
  const { grant } = input;
  if (grant.amount <= 0n) throw new BillingError("invalid_change", "A credit must be positive.");
  if (grant.kind === "units" && !grant.meter) {
    throw new BillingError("invalid_change", "A unit credit needs a meter.");
  }
  if (grant.expiresAt && grant.expiresAt <= grant.effectiveAt) {
    throw new BillingError("invalid_change", "A credit must expire after it starts.");
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(billingCreditGrant)
      .values({
        organizationId: grant.organizationId,
        kind: grant.kind,
        amount: grant.amount,
        meter: grant.kind === "units" ? (grant.meter ?? null) : null,
        dimension: grant.kind === "units" ? (grant.dimension ?? null) : null,
        scope: grant.kind === "amount" && grant.scope?.length ? grant.scope : null,
        appliesTo: grant.appliesTo ?? "usage",
        source: grant.source,
        description: grant.description,
        reason: input.reason,
        effectiveAt: grant.effectiveAt,
        expiresAt: grant.expiresAt,
        createdByUserId: input.actor.userId,
      })
      .returning();
    if (!row) throw new Error("Grant insert returned nothing.");
    await auditBillingChange(tx, {
      actor: input.actor,
      action: "billing.credit_granted",
      organizationId: grant.organizationId,
      reason: input.reason,
      metadata: {
        grantId: row.id,
        kind: row.kind,
        amount: row.amount.toString(),
        meter: row.meter,
        source: row.source,
        expiresAt: row.expiresAt?.toISOString() ?? null,
      },
    });
    await announce(tx, grant.organizationId, {
      type: "billing.credit_granted",
      data: { credit: toCreditObject({ ...row, used: 0n, remaining: row.amount }) },
    });
    return row;
  });
}

/** Voids what's left of a grant (what invoices already used stays used). */
export async function voidCreditGrant(input: {
  organizationId: string;
  grantId: string;
  actor: AdminActor;
  reason: string;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(billingCreditGrant)
      .set({ voidedAt: now })
      .where(
        and(
          eq(billingCreditGrant.organizationId, input.organizationId),
          eq(billingCreditGrant.id, input.grantId),
          isNull(billingCreditGrant.voidedAt),
        ),
      )
      .returning({ id: billingCreditGrant.id, amount: billingCreditGrant.amount });
    if (!row)
      throw new BillingError("not_found", "That credit doesn't exist or is already voided.");
    await auditBillingChange(tx, {
      actor: input.actor,
      action: "billing.credit_voided",
      organizationId: input.organizationId,
      reason: input.reason,
      metadata: { grantId: row.id },
    });
  });
}
