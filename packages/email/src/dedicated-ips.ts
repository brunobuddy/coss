/**
 * Dedicated IPs (the Dedicated IPs add-on): one provider-managed pool per organization, warmed
 * up by the provider. The worker reconciles what billing grants (`entitled`) with what exists:
 * - an entitled organization gets a row, `provisioning` (or `waiting` past `MAX_DEDICATED_IP_POOLS`),
 *   then `warming` once the pool and its configuration sets exist: from then on its live sends go
 *   through the pool (`dedicatedPoolInUse`), and SES warms the IPs up, spilling the rest of the
 *   traffic to shared IPs while it does. Both streams share the pool, each through its own
 *   configuration set (so events and reputation metrics stay per stream); marketing joins once
 *   its set exists (`marketing_configured_at`), which needs the organization's marketing tenant;
 * - `warming` ⇄ `ready` follows how much of the last week's deliveries left from the pool's IPs;
 * - an organization no longer entitled goes `releasing` at once (sends are back on shared IPs)
 *   and its pool is released after `RELEASE_DELAY_MS`, unless the entitlement comes back first
 *   (once the release has started, a returning entitlement waits for it and gets a new pool).
 * SES allows 50 pools per region, a hard limit: COSS keeps headroom below it.
 */
import { hipaaModeSql } from "@coss/compliance";
import { db, type Executor, schema } from "@coss/db";
import { recordOrgAuditEvent } from "@coss/logs";
import {
  and,
  asc,
  count,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  notInArray,
  type SQL,
  sql,
} from "drizzle-orm";
import { listEmailTenants } from "./domains.ts";
import type {
  DedicatedIpProvider,
  EmailStream,
  IdentityProvider,
  ProviderTenant,
} from "./provider.ts";
import type { DedicatedIpPoolObjectOutput } from "./schemas.ts";

const { dedicatedIpPool, dedicatedIpDeliveryRollup, organizationDeletion } = schema;

export type DedicatedIpPoolRow = typeof dedicatedIpPool.$inferSelect;

/** Pools COSS creates at most (SES: 50 per region, inclusive of any made outside COSS). */
export const MAX_DEDICATED_IP_POOLS = 45;
/** How long a pool outlives its entitlement (sends stop using it at once). */
export const RELEASE_DELAY_MS = 24 * 60 * 60 * 1000;
/** Deliveries are compared over this window. */
export const SHARE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** `ready`: at least this share of the window's deliveries left from the pool's IPs… */
export const READY_SHARE = 0.95;
/** …out of at least this many. */
export const READY_MIN_DELIVERIES = 1_000;
const REFRESH_MS = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const CAPACITY_LOCK = "coss:dedicated_ip_pools";

export type DedicatedIpDeps = {
  identity: IdentityProvider;
  dedicatedIps: DedicatedIpProvider;
};

export async function getDedicatedIpPool(
  organizationId: string,
  executor: Executor = db,
): Promise<DedicatedIpPoolRow | null> {
  const [row] = await executor
    .select()
    .from(dedicatedIpPool)
    .where(eq(dedicatedIpPool.organizationId, organizationId))
    .limit(1);
  return row ?? null;
}

/**
 * Whether a purchase of the Dedicated IPs add-on by `organizationId` still fits within
 * `MAX_DEDICATED_IP_POOLS`. Call it in the purchase's transaction: it takes the lock new pools are
 * created under, so purchases (of any organization) and the worker's new rows go one at a time,
 * and `claimants` (read after the lock: the organizations entitled to dedicated IPs or buying
 * them, from billing) sees every purchase committed before. A slot is held by an organization
 * with a pool (being released included) or a claim on one; one that holds one keeps it.
 */
export async function dedicatedIpSlotAvailable(
  tx: Executor,
  organizationId: string,
  claimants: () => Promise<readonly string[]>,
  /** Tests: pools at most, and the organizations whose pools count. */
  opts: { capacity?: number; scope?: { organizationIds: string[] } } = {},
): Promise<boolean> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${CAPACITY_LOCK}))`);
  const pools = await tx
    .select({ organizationId: dedicatedIpPool.organizationId })
    .from(dedicatedIpPool)
    .where(
      and(
        ne(dedicatedIpPool.status, "waiting"),
        opts.scope
          ? inArray(dedicatedIpPool.organizationId, opts.scope.organizationIds)
          : undefined,
      ),
    );
  const taken = new Set([...pools.map((row) => row.organizationId), ...(await claimants())]);
  if (taken.has(organizationId)) return true;
  return taken.size < (opts.capacity ?? MAX_DEDICATED_IP_POOLS);
}

/** Whether the organization's live sends of the stream go through its pool now (with this provider). */
export async function dedicatedPoolInUse(
  organizationId: string,
  provider: string,
  stream: EmailStream = "transactional",
  executor: Executor = db,
): Promise<boolean> {
  const [row] = await executor
    .select({ id: dedicatedIpPool.id })
    .from(dedicatedIpPool)
    .where(
      and(
        eq(dedicatedIpPool.organizationId, organizationId),
        eq(dedicatedIpPool.provider, provider),
        inArray(dedicatedIpPool.status, ["warming", "ready"]),
        stream === "marketing" ? isNotNull(dedicatedIpPool.marketingConfiguredAt) : undefined,
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Whether the organization's live sends of the stream go through its pool, as SQL for a claim's
 * `set` (the decision is stored on the email: `email.dedicated_pool`). Marketing needs its
 * configuration set on the pool (`marketing_configured_at`).
 */
export function dedicatedPoolSql(
  organizationId: string,
  provider: string,
  stream: EmailStream,
): SQL<boolean> {
  const marketing =
    stream === "marketing" ? sql` and ${dedicatedIpPool.marketingConfiguredAt} is not null` : sql``;
  // HIPAA mode: not until the pool's sets require TLS (the shared TLS sets carry the mail till then).
  const encrypted = sql` and (${dedicatedIpPool.tlsRequiredAt} is not null or not ${hipaaModeSql(organizationId)})`;
  return sql<boolean>`exists (select 1 from ${dedicatedIpPool} where ${dedicatedIpPool.organizationId} = ${organizationId} and ${dedicatedIpPool.provider} = ${provider} and ${dedicatedIpPool.status} in ('warming', 'ready')${marketing}${encrypted})`;
}

/** Brings pools' TLS requirement in line with their organizations' HIPAA mode. */
async function reconcilePoolTls(scoped: SQL | undefined, now: Date, deps: DedicatedIpDeps) {
  const inMode = hipaaModeSql(dedicatedIpPool.organizationId);
  const rows = await db
    .select()
    .from(dedicatedIpPool)
    .where(
      and(
        scoped,
        eq(dedicatedIpPool.provider, deps.dedicatedIps.name),
        inArray(dedicatedIpPool.status, ["warming", "ready"]),
        sql`(${inMode}) = (${dedicatedIpPool.tlsRequiredAt} is null)`,
      ),
    );
  for (const row of rows) {
    const require = row.tlsRequiredAt === null;
    try {
      await deps.dedicatedIps.setRequireTls({
        organizationId: row.organizationId,
        streams: row.marketingConfiguredAt ? ["transactional", "marketing"] : ["transactional"],
        require,
      });
      await db
        .update(dedicatedIpPool)
        .set({ tlsRequiredAt: require ? now : null })
        .where(eq(dedicatedIpPool.id, row.id));
    } catch (error) {
      console.error(`[email:dedicated-ips] changing TLS of pool ${row.id} failed:`, error);
    }
  }
}

type StreamTenants = Partial<Record<EmailStream, ProviderTenant>>;

/** The organization's tenants of this provider, by stream. */
async function streamTenants(organizationId: string, provider: string): Promise<StreamTenants> {
  const tenants: StreamTenants = {};
  for (const row of await listEmailTenants(organizationId)) {
    if (row.provider !== provider) continue;
    tenants[row.stream] = { tenantName: row.tenantName, tenantArn: row.tenantArn };
  }
  return tenants;
}

/**
 * Pools in use or being set up (not `waiting`), out of `MAX_DEDICATED_IP_POOLS`. `scope` counts
 * only some organizations' (tests: the test database is shared).
 */
export async function dedicatedIpCapacity(
  executor: Executor = db,
  scope?: { organizationIds: string[] },
): Promise<{ used: number; waiting: number; capacity: number }> {
  const rows = await executor
    .select({ status: dedicatedIpPool.status, n: count() })
    .from(dedicatedIpPool)
    .where(scope ? inArray(dedicatedIpPool.organizationId, scope.organizationIds) : undefined)
    .groupBy(dedicatedIpPool.status);
  let used = 0;
  let waiting = 0;
  for (const row of rows) {
    if (row.status === "waiting") waiting += row.n;
    else used += row.n;
  }
  return { used, waiting, capacity: MAX_DEDICATED_IP_POOLS };
}

/**
 * Counts deliveries of a dedicated-pool email by the IP they left from, in the transaction that
 * recorded the (new) `email.delivered` events.
 */
export async function countDedicatedDeliveries(
  tx: Executor,
  input: { organizationId: string; sendingIp: string; occurredAt: Date; delivered: number },
): Promise<void> {
  const hour = new Date(Math.floor(input.occurredAt.getTime() / (60 * MINUTE)) * 60 * MINUTE);
  await tx
    .insert(dedicatedIpDeliveryRollup)
    .values({
      organizationId: input.organizationId,
      hour,
      sendingIp: input.sendingIp.slice(0, 64),
      delivered: input.delivered,
    })
    .onConflictDoUpdate({
      target: [
        dedicatedIpDeliveryRollup.organizationId,
        dedicatedIpDeliveryRollup.hour,
        dedicatedIpDeliveryRollup.sendingIp,
      ],
      set: { delivered: sql`${dedicatedIpDeliveryRollup.delivered} + excluded.delivered` },
    });
}

/** Deliveries per sending IP over the window ending at `now`. */
export async function deliveriesByIp(
  organizationId: string,
  now: Date,
  executor: Executor = db,
): Promise<Map<string, number>> {
  const rows = await executor
    .select({
      sendingIp: dedicatedIpDeliveryRollup.sendingIp,
      delivered: sql<number>`sum(${dedicatedIpDeliveryRollup.delivered})::int`,
    })
    .from(dedicatedIpDeliveryRollup)
    .where(
      and(
        eq(dedicatedIpDeliveryRollup.organizationId, organizationId),
        gte(dedicatedIpDeliveryRollup.hour, new Date(now.getTime() - SHARE_WINDOW_MS)),
      ),
    )
    .groupBy(dedicatedIpDeliveryRollup.sendingIp);
  return new Map(rows.map((row) => [row.sendingIp, row.delivered]));
}

/** The share of deliveries that left from `ips` (`null`: fewer than the minimum). */
export function dedicatedShare(deliveries: Map<string, number>, ips: string[]): number | null {
  let total = 0;
  let dedicated = 0;
  const pool = new Set(ips);
  for (const [ip, n] of deliveries) {
    total += n;
    if (pool.has(ip)) dedicated += n;
  }
  return total >= READY_MIN_DELIVERIES ? dedicated / total : null;
}

function backoff(attempts: number): number {
  return Math.min(60, 2 ** Math.max(0, attempts - 1)) * MINUTE;
}

/**
 * System-level (worker): brings pools in line with `entitled` (the organizations whose billing
 * grants `dedicatedIps` now; with `scope`, those among its organizations), then works through
 * due rows, each leased by moving `next_check_at` forward first. Returns how many rows it handled.
 */
export async function reconcileDedicatedIpPools(
  opts: {
    entitled: readonly string[];
    now?: Date;
    limit?: number;
    scope?: { organizationIds: string[] };
    signal?: AbortSignal;
    /** Pools at most (default `MAX_DEDICATED_IP_POOLS`; tests). */
    capacity?: number;
  },
  deps: DedicatedIpDeps,
): Promise<number> {
  const now = opts.now ?? new Date();
  const capacity = opts.capacity ?? MAX_DEDICATED_IP_POOLS;
  const scoped = opts.scope
    ? inArray(dedicatedIpPool.organizationId, opts.scope.organizationIds)
    : undefined;
  // Organizations being deleted aren't entitled: their teardown releases the pool, and nothing
  // may provision it again (their contracts last until the organization row goes).
  const deleting = opts.entitled.length
    ? await db
        .select({ organizationId: organizationDeletion.organizationId })
        .from(organizationDeletion)
        .where(
          and(
            inArray(organizationDeletion.organizationId, [...new Set(opts.entitled)]),
            eq(organizationDeletion.status, "pending"),
          ),
        )
    : [];
  const gone = new Set(deleting.map((row) => row.organizationId));
  const entitled = [...new Set(opts.entitled)].filter((id) => !gone.has(id));

  // Lost entitlements: waiting rows just go; others stop sending through the pool now.
  const lost = and(
    scoped,
    entitled.length ? notInArray(dedicatedIpPool.organizationId, entitled) : undefined,
  );
  await db.delete(dedicatedIpPool).where(and(lost, eq(dedicatedIpPool.status, "waiting")));
  const releaseAfter = new Date(now.getTime() + RELEASE_DELAY_MS);
  await db
    .update(dedicatedIpPool)
    .set({
      status: "releasing",
      releaseAfter,
      nextCheckAt: releaseAfter,
      attempts: 0,
      statusMessage: null,
    })
    .where(and(lost, ne(dedicatedIpPool.status, "releasing")));
  // Entitlements that came back before the release started: the pool is still there.
  if (entitled.length) {
    await db
      .update(dedicatedIpPool)
      .set({
        status: sql`case when ${dedicatedIpPool.provisionedAt} is null then 'provisioning' else 'warming' end::dedicated_ip_pool_status`,
        releaseAfter: null,
        nextCheckAt: now,
        attempts: 0,
      })
      .where(
        and(
          scoped,
          inArray(dedicatedIpPool.organizationId, entitled),
          eq(dedicatedIpPool.status, "releasing"),
          isNull(dedicatedIpPool.releaseStartedAt),
        ),
      );
  }

  // New entitlements get a row, within capacity (counted under a lock).
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${CAPACITY_LOCK}))`);
    const existing = await tx
      .select({ organizationId: dedicatedIpPool.organizationId })
      .from(dedicatedIpPool)
      .where(entitled.length ? inArray(dedicatedIpPool.organizationId, entitled) : sql`false`);
    const have = new Set(existing.map((row) => row.organizationId));
    let { used } = await dedicatedIpCapacity(tx, opts.scope);
    for (const organizationId of entitled) {
      if (have.has(organizationId)) continue;
      const fits = used < capacity;
      if (fits) used++;
      else {
        console.error(
          `[email:dedicated-ips] ${organizationId} is entitled to dedicated IPs, but all ${capacity} pools are taken.`,
        );
      }
      await tx
        .insert(dedicatedIpPool)
        .values({
          organizationId,
          provider: deps.dedicatedIps.name,
          status: fits ? "provisioning" : "waiting",
          statusMessage: fits ? null : "Waiting for a free dedicated IP pool.",
          nextCheckAt: fits ? now : null,
        })
        .onConflictDoNothing();
    }
    // Waiting rows take slots that freed up, oldest first.
    if (used < capacity) {
      const waiting = await tx
        .select({ id: dedicatedIpPool.id })
        .from(dedicatedIpPool)
        .where(and(scoped, eq(dedicatedIpPool.status, "waiting")))
        .orderBy(asc(dedicatedIpPool.createdAt))
        .limit(capacity - used);
      if (waiting.length) {
        await tx
          .update(dedicatedIpPool)
          .set({ status: "provisioning", statusMessage: null, nextCheckAt: now })
          .where(
            inArray(
              dedicatedIpPool.id,
              waiting.map((row) => row.id),
            ),
          );
      }
    }
  });

  await reconcilePoolTls(scoped, now, deps);

  const due = await db
    .select({
      id: dedicatedIpPool.id,
      nextCheckAt: dedicatedIpPool.nextCheckAt,
    })
    .from(dedicatedIpPool)
    .where(
      and(
        scoped,
        isNotNull(dedicatedIpPool.nextCheckAt),
        lte(dedicatedIpPool.nextCheckAt, now),
        eq(dedicatedIpPool.provider, deps.dedicatedIps.name),
      ),
    )
    .orderBy(asc(dedicatedIpPool.nextCheckAt))
    .limit(opts.limit ?? 25);
  let handled = 0;
  for (const candidate of due) {
    if (opts.signal?.aborted) break;
    if (!candidate.nextCheckAt) continue;
    const [row] = await db
      .update(dedicatedIpPool)
      .set({ nextCheckAt: new Date(now.getTime() + 5 * MINUTE) })
      .where(
        and(
          eq(dedicatedIpPool.id, candidate.id),
          eq(dedicatedIpPool.nextCheckAt, candidate.nextCheckAt),
        ),
      )
      .returning();
    if (!row) continue;
    try {
      await step(row, now, deps);
    } catch (error) {
      console.error(`[email:dedicated-ips] ${row.status} ${row.id} failed:`, error);
      const attempts = row.attempts + 1;
      await db
        .update(dedicatedIpPool)
        .set({
          attempts,
          statusMessage:
            row.status === "provisioning"
              ? "Setting up your dedicated IPs is taking longer."
              : null,
          nextCheckAt: new Date(now.getTime() + backoff(attempts)),
        })
        .where(and(eq(dedicatedIpPool.id, row.id), eq(dedicatedIpPool.status, row.status)));
    }
    handled++;
  }
  return handled;
}

/** One due row; the update re-checks the status it read, so a concurrent change wins. */
async function step(row: DedicatedIpPoolRow, now: Date, deps: DedicatedIpDeps): Promise<void> {
  const ours = and(eq(dedicatedIpPool.id, row.id), eq(dedicatedIpPool.status, row.status));
  const target = { type: "dedicated_ip_pool", id: row.id, label: "Dedicated IPs" };
  const system = { type: "system" as const, id: null, label: "COSS" };
  switch (row.status) {
    case "waiting":
      return;
    case "provisioning": {
      // The tenants come with the organization's first domain (the worker never creates one, but
      // marketing tenants of organizations from before the streams split are backfilled).
      const tenants = await streamTenants(row.organizationId, deps.identity.name);
      if (!tenants.transactional) {
        await db
          .update(dedicatedIpPool)
          .set({
            statusMessage: "Add a sending domain to start using your dedicated IPs.",
            nextCheckAt: new Date(now.getTime() + 10 * MINUTE),
          })
          .where(ours);
        return;
      }
      try {
        await deps.dedicatedIps.ensurePool({ organizationId: row.organizationId, tenants });
      } catch (error) {
        await undoIfTornDown(row, tenants, deps.dedicatedIps);
        throw error;
      }
      if (await undoIfTornDown(row, tenants, deps.dedicatedIps)) return;
      await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(dedicatedIpPool)
          .set({
            status: "warming",
            provisionedAt: now,
            marketingConfiguredAt: tenants.marketing ? now : null,
            attempts: 0,
            statusMessage: null,
            // Right away: the first look at the pool's IPs.
            nextCheckAt: now,
          })
          .where(ours)
          .returning({ id: dedicatedIpPool.id });
        if (!updated) return;
        await recordOrgAuditEvent(
          {
            organizationId: row.organizationId,
            actor: system,
            action: "dedicated_ips.provisioned",
            target,
          },
          tx,
        );
      });
      return;
    }
    case "warming":
    case "ready": {
      // Marketing's configuration set, for a pool made without it (before the streams split, or
      // before the organization's marketing tenant existed). Until then marketing stays on
      // shared IPs.
      let marketingConfiguredAt = row.marketingConfiguredAt;
      if (!marketingConfiguredAt) {
        const tenants = await streamTenants(row.organizationId, deps.identity.name);
        if (tenants.marketing) {
          const marketing = { marketing: tenants.marketing };
          try {
            await deps.dedicatedIps.ensurePool({
              organizationId: row.organizationId,
              tenants: marketing,
            });
          } catch (error) {
            await undoIfTornDown(row, tenants, deps.dedicatedIps);
            throw error;
          }
          if (await undoIfTornDown(row, tenants, deps.dedicatedIps)) return;
          marketingConfiguredAt = now;
        }
      }
      const ips = await deps.dedicatedIps.poolIps(row.organizationId);
      const share = dedicatedShare(await deliveriesByIp(row.organizationId, now), ips);
      const ready = ips.length > 0 && share !== null && share >= READY_SHARE;
      const quiet =
        ips.length === 0 &&
        row.provisionedAt !== null &&
        now.getTime() - row.provisionedAt.getTime() >= SHARE_WINDOW_MS;
      await db
        .update(dedicatedIpPool)
        .set({
          status: ready ? "ready" : "warming",
          ips,
          dedicatedShare: share,
          readyAt: ready ? (row.readyAt ?? now) : row.readyAt,
          marketingConfiguredAt,
          // A marketing set made since has no TLS requirement yet: the next pass sets both.
          ...(marketingConfiguredAt === row.marketingConfiguredAt ? {} : { tlsRequiredAt: null }),
          statusMessage: quiet
            ? "SES assigns the first dedicated IP once you send a few hundred emails a day."
            : null,
          attempts: 0,
          lastCheckedAt: now,
          nextCheckAt: new Date(now.getTime() + REFRESH_MS),
        })
        .where(ours);
      return;
    }
    case "releasing": {
      if (row.releaseAfter && row.releaseAfter > now) {
        await db.update(dedicatedIpPool).set({ nextCheckAt: row.releaseAfter }).where(ours);
        return;
      }
      // Claimed against a returning entitlement first (both compare-and-set the status), so a
      // pool can't be restored while its resources are being deleted.
      if (!row.releaseStartedAt) {
        const [started] = await db
          .update(dedicatedIpPool)
          .set({ releaseStartedAt: now })
          .where(and(ours, isNull(dedicatedIpPool.releaseStartedAt)))
          .returning({ id: dedicatedIpPool.id });
        if (!started) return;
      }
      await releaseDedicatedIpPool(row, deps.dedicatedIps);
      await db.transaction(async (tx) => {
        const [deleted] = await tx
          .delete(dedicatedIpPool)
          .where(ours)
          .returning({ id: dedicatedIpPool.id });
        if (!deleted) return;
        await recordOrgAuditEvent(
          {
            organizationId: row.organizationId,
            actor: system,
            action: "dedicated_ips.released",
            target,
          },
          tx,
        );
      });
      return;
    }
  }
}

/**
 * After provisioning: when the organization is being deleted (its request is committed before its
 * teardown starts) or its row is gone, the teardown (`releaseOrganizationDedicatedIps`) may have
 * released the pool before this created it, so what was created is released again. Returns
 * whether it was.
 */
async function undoIfTornDown(
  row: DedicatedIpPoolRow,
  /** The tenants it was created for: the teardown may have deleted their rows by now. */
  tenants: StreamTenants,
  provider: DedicatedIpProvider,
): Promise<boolean> {
  const [deleting] = await db
    .select({ id: organizationDeletion.id })
    .from(organizationDeletion)
    .where(
      and(
        eq(organizationDeletion.organizationId, row.organizationId),
        eq(organizationDeletion.status, "pending"),
      ),
    )
    .limit(1);
  if (!deleting && (await getDedicatedIpPool(row.organizationId))) return false;
  await releaseDedicatedIpPool(row, provider, tenants);
  return true;
}

async function releaseDedicatedIpPool(
  row: Pick<DedicatedIpPoolRow, "organizationId" | "provider" | "provisionedAt" | "status">,
  provider: DedicatedIpProvider,
  /** Known already (else read from the organization's tenant rows). */
  known?: StreamTenants,
): Promise<void> {
  if (row.provider !== provider.name) return;
  await provider.releasePool({
    organizationId: row.organizationId,
    tenants: known ?? (await streamTenants(row.organizationId, provider.name)),
  });
}

/**
 * Organization deletion: releases the pool (before the tenant goes: SES won't delete a
 * configuration set still associated with one) and drops the row.
 */
export async function releaseOrganizationDedicatedIps(
  organizationId: string,
  provider: DedicatedIpProvider | undefined,
): Promise<void> {
  const row = await getDedicatedIpPool(organizationId);
  if (!row) return;
  if (provider && row.status !== "waiting") await releaseDedicatedIpPool(row, provider);
  await db.delete(dedicatedIpPool).where(eq(dedicatedIpPool.id, row.id));
}

/** The API/dashboard view of an organization's dedicated IPs (`not_enabled`: no pool). */
export async function dedicatedIpPoolObject(
  organizationId: string,
  now: Date = new Date(),
): Promise<DedicatedIpPoolObjectOutput> {
  const row = await getDedicatedIpPool(organizationId);
  if (!row) {
    return {
      object: "dedicated_ip_pool",
      status: "not_enabled",
      ips: [],
      dedicated_share: null,
      message: null,
      created_at: null,
      ready_at: null,
    };
  }
  const deliveries = await deliveriesByIp(organizationId, now);
  return {
    object: "dedicated_ip_pool",
    status: row.status,
    ips: row.ips.map((ip) => ({ ip, delivered_7d: deliveries.get(ip) ?? 0 })),
    dedicated_share: row.dedicatedShare,
    message: row.statusMessage,
    created_at: row.createdAt.toISOString(),
    ready_at: row.readyAt?.toISOString() ?? null,
  };
}
