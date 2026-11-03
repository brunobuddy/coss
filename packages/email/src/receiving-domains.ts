/**
 * Receiving domains: a hostname of a sending domain (the domain itself or a subdomain, e.g.
 * `inbound.acme.com`) whose MX points at the provider's inbound host, so email sent to any address
 * at it becomes a received email of one environment (`inbound.ts`). The provider receives for
 * every verified domain of the account; a hostname without a row here is simply not routed. The
 * MX check (the worker re-checks it like domains) only shows the customer what DNS serves.
 */
import { db, schema } from "@coss/db";
import { and, asc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { checkReceivingRecord, type DnsResolver } from "./dns.ts";
import {
  assertOwnsHostname,
  type DomainRow,
  isUniqueViolation,
  normalizeDomainName,
  requireDomain,
} from "./domains.ts";
import { DomainError } from "./errors.ts";
import { claimEmailHostname } from "./hostname-claim.ts";
import type { ReceivingDomainObjectOutput } from "./schemas.ts";

const { environment, receivingDomain } = schema;

export type ReceivingDomainRow = typeof receivingDomain.$inferSelect;
export type ReceivingDomainRecord = ReceivingDomainRow["record"];

/** What receiving needs to know about the inbound side (`EmailRuntime.inbound`). */
export type ReceivingConfig = {
  /** The provider's inbound mail exchange (`inbound-smtp.<region>.amazonaws.com`). */
  mxHost: string;
  /** coss.com's managed inbound domain (`<label>.<managedDomain>` addresses). */
  managedDomain: string;
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const MX_PRIORITY = 10;

/**
 * Lower-cased, trailing-dot-free receiving hostname for `parent`, or a `DomainError` explaining
 * why it can't be one: the domain itself or a subdomain, outside its MAIL FROM subdomain (whose MX
 * receives bounces) and outside coss.com's managed inbound domain.
 */
export function normalizeReceivingHostname(
  input: string,
  parent: DomainRow,
  config: Pick<ReceivingConfig, "managedDomain">,
): string {
  let hostname: string;
  try {
    // Reserved names stop anyone claiming them; this must be under a domain the organization holds.
    hostname = normalizeDomainName(input, { allowReserved: true });
  } catch (error) {
    if (error instanceof DomainError) {
      throw new DomainError("invalid_receiving_hostname", error.message);
    }
    throw error;
  }
  if (hostname !== parent.name && !hostname.endsWith(`.${parent.name}`)) {
    throw new DomainError(
      "invalid_receiving_hostname",
      `The receiving domain must be ${parent.name} or a subdomain of it, like inbound.${parent.name}.`,
    );
  }
  if (hostname === parent.mailFromDomain || hostname.endsWith(`.${parent.mailFromDomain}`)) {
    throw new DomainError(
      "invalid_receiving_hostname",
      `${parent.mailFromDomain} is reserved for bounce handling.`,
    );
  }
  const managed = config.managedDomain.toLowerCase();
  if (hostname === managed || hostname.endsWith(`.${managed}`)) {
    throw new DomainError("invalid_receiving_hostname", "This hostname can't be used.");
  }
  return hostname;
}

function expectedRecord(hostname: string, mxHost: string): ReceivingDomainRecord {
  return {
    type: "MX",
    name: hostname,
    value: mxHost,
    priority: MX_PRIORITY,
    status: "not_checked",
    found: [],
  };
}

/** When the worker should check a receiving domain's MX next. */
export function receivingNextCheckAt(
  row: Pick<ReceivingDomainRow, "createdAt" | "record">,
  now: Date,
): Date {
  if (row.record.status === "verified") return new Date(now.getTime() + 12 * HOUR);
  const age = now.getTime() - row.createdAt.getTime();
  if (age < HOUR) return new Date(now.getTime() + MINUTE);
  return new Date(now.getTime() + (age < 72 * HOUR ? 10 * MINUTE : 6 * HOUR));
}

export function toReceivingDomainObject(row: ReceivingDomainRow): ReceivingDomainObjectOutput {
  return {
    hostname: row.hostname,
    environment_id: row.environmentId,
    record: row.record,
    created_at: row.createdAt.toISOString(),
    last_checked_at: row.lastCheckedAt?.toISOString() ?? null,
  };
}

export async function getReceivingDomain(input: {
  organizationId: string;
  domainId: string;
}): Promise<ReceivingDomainRow | null> {
  const [row] = await db
    .select()
    .from(receivingDomain)
    .where(
      and(
        eq(receivingDomain.organizationId, input.organizationId),
        eq(receivingDomain.domainId, input.domainId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** The receiving domains of some of an organization's domains, by domain id. */
export async function listReceivingDomains(input: {
  organizationId: string;
  domainIds: string[];
}): Promise<Map<string, ReceivingDomainRow>> {
  if (input.domainIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(receivingDomain)
    .where(
      and(
        eq(receivingDomain.organizationId, input.organizationId),
        inArray(receivingDomain.domainId, input.domainIds),
      ),
    );
  return new Map(rows.map((row) => [row.domainId, row]));
}

/** An environment's receiving domains (the dashboard's environment page). */
export async function listEnvironmentReceivingDomains(input: {
  organizationId: string;
  environmentId: string;
}): Promise<ReceivingDomainRow[]> {
  return db
    .select()
    .from(receivingDomain)
    .where(
      and(
        eq(receivingDomain.organizationId, input.organizationId),
        eq(receivingDomain.environmentId, input.environmentId),
      ),
    )
    .orderBy(asc(receivingDomain.hostname));
}

async function requireReceivingDomain(input: {
  organizationId: string;
  domainId: string;
}): Promise<ReceivingDomainRow> {
  const row = await getReceivingDomain(input);
  if (!row) throw new DomainError("not_found", "This domain has no receiving domain.");
  return row;
}

async function takenError(organizationId: string, hostname: string): Promise<DomainError> {
  const [holder] = await db
    .select({ organizationId: receivingDomain.organizationId })
    .from(receivingDomain)
    .where(eq(receivingDomain.hostname, hostname))
    .limit(1);
  return new DomainError(
    "receiving_domain_taken",
    holder?.organizationId === organizationId
      ? `${hostname} already receives email for another of your domains.`
      : `${hostname} is already in use by another account.`,
  );
}

/**
 * Starts receiving email at a hostname of the domain, delivered to `environmentId` (one of the
 * organization's environments). Checks the MX once; mail is accepted from then on.
 */
export async function createReceivingDomain(
  input: { organizationId: string; domainId: string; environmentId: string; hostname: string },
  config: ReceivingConfig,
  dns: DnsResolver | null,
): Promise<ReceivingDomainRow> {
  const parent = await requireDomain({ organizationId: input.organizationId, id: input.domainId });
  if (parent.status === "failed" || parent.status === "deleting") {
    throw new DomainError(
      "invalid_receiving_hostname",
      `${parent.name} is not active: restart its verification first.`,
    );
  }
  const [target] = await db
    .select({ id: environment.id })
    .from(environment)
    .where(
      and(
        eq(environment.id, input.environmentId),
        eq(environment.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!target) throw new DomainError("not_found", "No such environment in this organization.");
  if (parent.subaccountId) {
    throw new DomainError(
      "subaccount_domain",
      "Sub-accounts' domains don't have receiving domains yet.",
    );
  }
  const hostname = normalizeReceivingHostname(input.hostname, parent, config);
  if (await getReceivingDomain(input)) {
    throw new DomainError(
      "receiving_domain_exists",
      `${parent.name} already receives email. Remove its receiving domain first to use another one.`,
    );
  }
  await assertOwnsHostname(parent, hostname, "receiving");
  const now = new Date();
  let created: ReceivingDomainRow | undefined;
  try {
    [created] = await claimEmailHostname(hostname, "receiving", (tx) =>
      tx
        .insert(receivingDomain)
        .values({
          organizationId: parent.organizationId,
          domainId: parent.id,
          environmentId: input.environmentId,
          hostname,
          record: expectedRecord(hostname, config.mxHost),
          nextCheckAt: new Date(now.getTime() + MINUTE),
        })
        .returning(),
    );
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    if (await getReceivingDomain(input)) {
      throw new DomainError(
        "receiving_domain_exists",
        `${parent.name} already receives email. Remove its receiving domain first to use another one.`,
      );
    }
    throw await takenError(input.organizationId, hostname);
  }
  if (!created) throw new Error("Receiving domain insert returned no row.");
  return checkReceivingDomain(
    { organizationId: created.organizationId, domainId: created.domainId },
    config,
    dns,
  ).catch((error) => {
    // The worker checks it again shortly.
    console.error(`[email:receiving-domains] checking ${hostname} failed:`, error);
    return created;
  });
}

/** Checks the MX and stores what DNS showed. */
export async function checkReceivingDomain(
  input: { organizationId: string; domainId: string; now?: Date },
  config: Pick<ReceivingConfig, "mxHost">,
  dns: DnsResolver | null,
): Promise<ReceivingDomainRow> {
  const row = await requireReceivingDomain(input);
  const now = input.now ?? new Date();
  const record = await checkReceivingRecord(expectedRecord(row.hostname, config.mxHost), dns);
  const [updated] = await db
    .update(receivingDomain)
    .set({ record, lastCheckedAt: now, nextCheckAt: receivingNextCheckAt({ ...row, record }, now) })
    .where(
      and(eq(receivingDomain.id, row.id), eq(receivingDomain.organizationId, row.organizationId)),
    )
    .returning();
  return updated ?? requireReceivingDomain(input);
}

/** Stops receiving at the domain's hostname. Received emails stay until their retention ends. */
export async function deleteReceivingDomain(input: {
  organizationId: string;
  domainId: string;
}): Promise<ReceivingDomainRow> {
  const row = await requireReceivingDomain(input);
  await db
    .delete(receivingDomain)
    .where(
      and(eq(receivingDomain.id, row.id), eq(receivingDomain.organizationId, row.organizationId)),
    );
  return row;
}

/**
 * System-level (worker): checks receiving domains that are due, leasing each by moving its
 * `next_check_at` forward first (as `recheckDueDomains` does). `scope` limits the scan to some
 * organizations (tests); once `signal` aborts, no further one is leased.
 */
export async function recheckDueReceivingDomains(
  opts: {
    now?: Date;
    limit?: number;
    scope?: { organizationIds: string[] };
    signal?: AbortSignal;
  },
  config: Pick<ReceivingConfig, "mxHost">,
  dns: DnsResolver | null,
): Promise<number> {
  const now = opts.now ?? new Date();
  const due = await db
    .select({
      id: receivingDomain.id,
      organizationId: receivingDomain.organizationId,
      domainId: receivingDomain.domainId,
      nextCheckAt: receivingDomain.nextCheckAt,
    })
    .from(receivingDomain)
    .where(
      and(
        isNotNull(receivingDomain.nextCheckAt),
        lte(receivingDomain.nextCheckAt, now),
        opts.scope
          ? inArray(receivingDomain.organizationId, opts.scope.organizationIds)
          : undefined,
      ),
    )
    .orderBy(asc(receivingDomain.nextCheckAt))
    .limit(opts.limit ?? 25);
  let checked = 0;
  for (const candidate of due) {
    if (opts.signal?.aborted) break;
    if (!candidate.nextCheckAt) continue;
    const [leased] = await db
      .update(receivingDomain)
      .set({ nextCheckAt: new Date(now.getTime() + 5 * MINUTE) })
      .where(
        and(
          eq(receivingDomain.id, candidate.id),
          eq(receivingDomain.nextCheckAt, candidate.nextCheckAt),
        ),
      )
      .returning({ id: receivingDomain.id });
    if (!leased) continue;
    try {
      await checkReceivingDomain(
        { organizationId: candidate.organizationId, domainId: candidate.domainId, now },
        config,
        dns,
      );
      checked++;
    } catch (error) {
      console.error(`[email:receiving-domains] checking ${candidate.id} failed:`, error);
    }
  }
  return checked;
}
