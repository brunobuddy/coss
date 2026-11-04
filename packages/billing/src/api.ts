/** The public API's read models: rows as `@coss/billing/wire` objects. */
import { db, schema } from "@coss/db";
import {
  type AnyColumn,
  and,
  desc,
  eq,
  gt,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  sum,
} from "drizzle-orm";
import { getBillingAccount } from "./accounts.ts";
import { METER_KEYS, type MeterKey } from "./catalog/meters.ts";
import { creditStandingOf } from "./credit.ts";
import { grantsFor } from "./grants.ts";
import { holdsOf } from "./holds.ts";
import { type InvoiceRow, invoiceLines } from "./invoices.ts";
import { iso, toCreditObject, toInvoiceObject, toInvoiceSummary, toNumber } from "./objects.ts";
import { estimatePeriod } from "./overview.ts";
import { billingStateAt, creatableEntitlements } from "./resolve.ts";
import { addMonths, HOUR_MS, type Interval, periodOf } from "./time.ts";
import {
  type BillingObjectOutput,
  type CreditObjectOutput,
  DEFAULT_BILLING_LIST_LIMIT,
  type InvoiceObjectOutput,
  type InvoiceSummaryOutput,
  type UsageGroup,
  type UsageObjectOutput,
} from "./wire.ts";

const {
  billingCreditEntry,
  billingCreditGrant,
  billingInvoice,
  billingQuota,
  billingUsage,
  billingUsageAttribution,
} = schema;

/** `GET /v1/billing`: the plan, the month so far, standing and entitlements. */
export async function billingObject(
  organizationId: string,
  now: Date = new Date(),
): Promise<BillingObjectOutput> {
  const period = periodOf(now);
  const [account, state, estimate, holds, grants, quotas] = await Promise.all([
    getBillingAccount(organizationId),
    billingStateAt(organizationId, now),
    estimatePeriod(organizationId, now),
    holdsOf(organizationId),
    grantsFor(organizationId, period),
    db
      .select({ meter: billingQuota.meter, reserved: billingQuota.reserved })
      .from(billingQuota)
      .where(
        and(
          eq(billingQuota.organizationId, organizationId),
          eq(billingQuota.periodStart, period.start),
        ),
      ),
  ]);
  const credit = account
    ? await creditStandingOf(account, state, estimate.totals.totalCents, now)
    : null;
  const entitlements = creatableEntitlements(state);
  const lines = estimate.composition.lines;
  const sumOf = (kinds: string[]) =>
    lines
      .filter((line) => kinds.includes(line.kind))
      .reduce((total, line) => total + line.amountCents, 0n);
  const usageCents = sumOf(["usage"]);
  const discountCents = -sumOf(["discount", "write_off"]);
  const creditCents = -sumOf(["credit"]);
  const quantities = new Map<MeterKey, number>();
  for (const row of estimate.usage)
    quantities.set(row.meter, (quantities.get(row.meter) ?? 0) + row.quantity);
  const caps = state.terms.usageCaps;
  for (const meter of Object.keys(caps) as MeterKey[]) {
    if (caps[meter]) quantities.set(meter, quantities.get(meter) ?? 0);
  }
  const reserved = new Map(quotas.map((row) => [row.meter, row.reserved]));
  // Credit left once this month's usage so far has drawn on it.
  const creditLeft =
    grants
      .filter((grant) => grant.kind === "amount" && grant.remaining > 0n)
      .reduce((total, grant) => total + grant.remaining, 0n) - creditCents;
  const contract = state.contract;
  return {
    object: "billing",
    organization_id: organizationId,
    plan: state.terms.plan,
    contract: contract
      ? {
          id: contract.id,
          kind: contract.kind,
          effective_from: contract.effectiveFrom.toISOString(),
          effective_until: iso(contract.effectiveUntil),
          term_end: iso(contract.termEnd),
          auto_renew: contract.autoRenew,
        }
      : null,
    scheduled_change: state.scheduled
      ? { effective_at: state.scheduled.at.toISOString(), plan: state.scheduled.terms.plan }
      : null,
    status: account?.status ?? "active",
    holds: holds.map((hold) => ({ reason: hold.reason, since: hold.createdAt.toISOString() })),
    currency: "usd",
    period: { start: period.start.toISOString(), end: period.end.toISOString() },
    usage: [...quantities.entries()]
      .sort(([a], [b]) => METER_KEYS.indexOf(a) - METER_KEYS.indexOf(b))
      .map(([meter, quantity]) => {
        const cap = caps[meter];
        return {
          meter,
          // A capped meter counts what was accepted against its allowance.
          quantity: cap !== undefined ? Math.max(quantity, reserved.get(meter) ?? 0) : quantity,
          included: cap ?? null,
        };
      }),
    estimate: {
      usage: toNumber(usageCents),
      discount: toNumber(discountCents),
      credit: toNumber(creditCents),
      total: toNumber(estimate.totals.totalCents),
    },
    credit_remaining: toNumber(creditLeft > 0n ? creditLeft : 0n),
    spend_limit: account?.spendLimitCents == null ? null : toNumber(account.spendLimitCents),
    credit_limit: credit
      ? {
          limit: toNumber(credit.limitCents),
          used: toNumber(credit.usedCents),
          charge_threshold: credit.thresholdCents === null ? null : toNumber(credit.thresholdCents),
        }
      : null,
    payment_method: account?.paymentMethod
      ? {
          type: account.paymentMethod.type,
          brand: account.paymentMethod.brand ?? null,
          last4: account.paymentMethod.last4 ?? null,
        }
      : null,
    add_ons: state.terms.addOns.map((addOn) => ({
      key: addOn.key,
      name: addOn.name,
      quantity: addOn.quantity,
      unit_amount: toNumber(addOn.unitAmountCents),
      interval: addOn.interval,
    })),
    features: {
      tracking_domains: entitlements.features.trackingDomains,
      audit_log: entitlements.features.auditLog,
      log_drains: entitlements.features.logDrains,
      sso: entitlements.features.sso,
      scim: entitlements.features.scim,
      dedicated_ips: entitlements.features.dedicatedIps,
    },
    limits: {
      domains: entitlements.limits.domains,
      members: entitlements.limits.members,
      webhook_endpoints_per_environment: entitlements.limits.webhookEndpointsPerEnvironment,
      contacts_per_environment: entitlements.limits.contactsPerEnvironment,
      inboxes: entitlements.limits.inboxes,
    },
  };
}

/** `GET /v1/billing/usage`: usage per bucket (and meter, dimension, group), oldest first. */
export async function usageSeries(
  organizationId: string,
  query: {
    interval: Interval;
    granularity: "hour" | "day" | "month";
    groupBy?: UsageGroup;
    meter?: MeterKey;
  },
): Promise<UsageObjectOutput[]> {
  const unit = sql.raw(`'${query.granularity}'`);
  const bucketOf = (column: AnyColumn) =>
    sql<Date>`date_trunc(${unit}, ${column}, 'UTC')`.mapWith(
      (value: string | Date) => new Date(value),
    );
  const bucket = bucketOf(billingUsage.hourStart);
  // A constant can't be grouped or ordered by, so the environment joins the key only when asked.
  const byEnvironment = query.groupBy === "environment";
  const keys = [
    bucket,
    billingUsage.meter,
    billingUsage.dimension,
    ...(byEnvironment ? [billingUsage.environmentId] : []),
  ];
  const rows = await db
    .select({
      bucket,
      meter: billingUsage.meter,
      dimension: billingUsage.dimension,
      environmentId: sql<string | null>`${byEnvironment ? billingUsage.environmentId : sql`null`}`,
      quantity: sum(billingUsage.quantity).mapWith(Number),
    })
    .from(billingUsage)
    .where(
      and(
        eq(billingUsage.organizationId, organizationId),
        sql`${billingUsage.hourStart} >= ${query.interval.start}`,
        lt(billingUsage.hourStart, query.interval.end),
        query.meter ? eq(billingUsage.meter, query.meter) : undefined,
      ),
    )
    .groupBy(...keys)
    .orderBy(...keys);

  const toObject = (
    row: { bucket: Date; meter: string; dimension: string; quantity: number },
    ids: { environment?: string | null; group?: string | null },
  ): UsageObjectOutput[] => {
    if (!(METER_KEYS as readonly string[]).includes(row.meter)) return [];
    const end =
      query.granularity === "hour"
        ? new Date(row.bucket.getTime() + HOUR_MS)
        : query.granularity === "day"
          ? new Date(row.bucket.getTime() + 24 * HOUR_MS)
          : addMonths(row.bucket, 1);
    const group = ids.group ?? null;
    return [
      {
        object: "usage" as const,
        meter: row.meter as MeterKey,
        dimension: row.dimension || null,
        // Organization-wide usage (SMS numbers and registration fees) has no environment.
        environment_id: ids.environment || null,
        project_id: query.groupBy === "project" ? group : null,
        api_key_id: query.groupBy === "api_key" ? group : null,
        user_id: query.groupBy === "user" ? group : null,
        start: row.bucket.toISOString(),
        end: end.toISOString(),
        quantity: row.quantity,
      },
    ];
  };
  const groupBy = query.groupBy;
  if (!groupBy || groupBy === "environment") {
    return rows.flatMap((row) => toObject(row, { environment: row.environmentId }));
  }

  // Sources come from the attribution; what it doesn't account for (usage recorded before it, or
  // without a source) is a row with a `null` id.
  const column = {
    project: billingUsageAttribution.projectId,
    api_key: billingUsageAttribution.apiKeyId,
    user: billingUsageAttribution.userId,
  }[groupBy];
  const attributedBucket = bucketOf(billingUsageAttribution.hourStart);
  const attributed = await db
    .select({
      bucket: attributedBucket,
      meter: billingUsageAttribution.meter,
      dimension: billingUsageAttribution.dimension,
      group: column,
      quantity: sum(billingUsageAttribution.quantity).mapWith(Number),
    })
    .from(billingUsageAttribution)
    .where(
      and(
        eq(billingUsageAttribution.organizationId, organizationId),
        sql`${billingUsageAttribution.hourStart} >= ${query.interval.start}`,
        lt(billingUsageAttribution.hourStart, query.interval.end),
        query.meter ? eq(billingUsageAttribution.meter, query.meter) : undefined,
      ),
    )
    .groupBy(
      attributedBucket,
      billingUsageAttribution.meter,
      billingUsageAttribution.dimension,
      column,
    )
    .orderBy(column);
  const cell = (row: { bucket: Date; meter: string; dimension: string }) =>
    `${row.bucket.toISOString()}\u0000${row.meter}\u0000${row.dimension}`;
  const groups = new Map<string, { group: string; quantity: number }[]>();
  for (const row of attributed) {
    if (row.group === "") continue;
    const list = groups.get(cell(row)) ?? [];
    list.push({ group: row.group, quantity: row.quantity });
    groups.set(cell(row), list);
  }
  return rows.flatMap((row) => {
    const parts = groups.get(cell(row)) ?? [];
    const rest = row.quantity - parts.reduce((total, part) => total + part.quantity, 0);
    return [
      ...(rest > 0 ? toObject({ ...row, quantity: rest }, { group: null }) : []),
      ...parts.flatMap((part) =>
        toObject({ ...row, quantity: part.quantity }, { group: part.group }),
      ),
    ];
  });
}

/** `GET /v1/billing/invoices`: finalized invoices, newest first, after a cursor. */
export async function listInvoicePage(
  organizationId: string,
  query: { after?: string; limit?: number; status?: InvoiceRow["status"] },
): Promise<{ data: InvoiceSummaryOutput[]; hasMore: boolean }> {
  const limit = query.limit ?? DEFAULT_BILLING_LIST_LIMIT;
  const rows = await db
    .select()
    .from(billingInvoice)
    .where(
      and(
        eq(billingInvoice.organizationId, organizationId),
        isNotNull(billingInvoice.number),
        query.status ? eq(billingInvoice.status, query.status) : undefined,
        // Ids sort by creation (UUIDv7).
        query.after ? lt(billingInvoice.id, query.after) : undefined,
      ),
    )
    .orderBy(desc(billingInvoice.id))
    .limit(limit + 1);
  return { data: rows.slice(0, limit).map(toInvoiceSummary), hasMore: rows.length > limit };
}

/** One finalized invoice of the organization (`null`: none). */
export async function getInvoiceObject(
  organizationId: string,
  invoiceId: string,
): Promise<InvoiceObjectOutput | null> {
  const [invoice] = await db
    .select()
    .from(billingInvoice)
    .where(
      and(
        eq(billingInvoice.organizationId, organizationId),
        eq(billingInvoice.id, invoiceId),
        isNotNull(billingInvoice.number),
      ),
    );
  return invoice ? toInvoiceObject(invoice, await invoiceLines(invoice.id)) : null;
}

const used = sql<string>`coalesce((select sum(${billingCreditEntry.amount}) from ${billingCreditEntry} where ${billingCreditEntry.grantId} = ${sql.raw('"billing_credit_grant"."id"')}), 0)`;

/** `GET /v1/billing/credits`: credits, newest first, after a cursor. */
export async function listCreditPage(
  organizationId: string,
  query: { after?: string; limit?: number; status?: "active" | "all" },
  now: Date = new Date(),
): Promise<{ data: CreditObjectOutput[]; hasMore: boolean }> {
  const limit = query.limit ?? DEFAULT_BILLING_LIST_LIMIT;
  const active =
    (query.status ?? "active") === "active"
      ? and(
          isNull(billingCreditGrant.voidedAt),
          or(isNull(billingCreditGrant.expiresAt), gt(billingCreditGrant.expiresAt, now)),
          sql`${billingCreditGrant.amount} > ${used}`,
        )
      : undefined;
  const rows = await db
    .select({ grant: billingCreditGrant, used })
    .from(billingCreditGrant)
    .where(
      and(
        eq(billingCreditGrant.organizationId, organizationId),
        active,
        query.after ? lt(billingCreditGrant.id, query.after) : undefined,
      ),
    )
    .orderBy(desc(billingCreditGrant.id))
    .limit(limit + 1);
  const data = rows.slice(0, limit).map((row) => {
    const consumed = BigInt(row.used);
    return toCreditObject({ ...row.grant, used: consumed, remaining: row.grant.amount - consumed });
  });
  return { data, hasMore: rows.length > limit };
}
