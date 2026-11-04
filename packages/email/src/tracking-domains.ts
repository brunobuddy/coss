/**
 * Custom tracking domains: a sending domain's own hostname (e.g. `links.acme.com`, a CNAME to
 * coss.com's tracking host) for the open pixel and click redirects of emails sent from it. The
 * hostname provider (a CloudFront distribution tenant) issues its certificate and proxies `/t/*`
 * to the API; the worker re-checks it like domains. Sends pick the tracking domain of their From domain at
 * dispatch, and fall back to the default tracking host while it is not `active`.
 */
import { db, schema } from "@coss/db";
import { and, asc, eq, inArray, isNotNull, isNull, lte, ne, notInArray } from "drizzle-orm";
import { checkTrackingRecord } from "./dns.ts";
import {
  assertOwnsHostname,
  type DomainDeps,
  type DomainRow,
  domainSuffixes,
  isUniqueViolation,
  normalizeDomainName,
  requireDomain,
  toDomainObject,
  VERIFICATION_WINDOW_MS,
} from "./domains.ts";
import { DomainError } from "./errors.ts";
import { claimEmailHostname } from "./hostname-claim.ts";
import { listReceivingDomains, toReceivingDomainObject } from "./receiving-domains.ts";
import {
  type DomainObjectOutput,
  parseEmailAddress,
  type TrackingDomainObjectOutput,
} from "./schemas.ts";
import { type TrackingHostnameState, TrackingHostnameTakenError } from "./tracking-hostnames.ts";

const { domain, trackingDomain } = schema;

export type TrackingDomainRow = typeof trackingDomain.$inferSelect;
export type TrackingDomainRecord = TrackingDomainRow["record"];

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
/** A claim without a provider id this young may still be provisioning. */
const PROVISIONING_LEASE_MS = 2 * MINUTE;
/** Retried until this old, then released: the customer can restart it. */
const PROVISIONING_EXPIRY_MS = HOUR;

/**
 * Lower-cased, trailing-dot-free tracking hostname for `parent`, or a `DomainError` explaining
 * why it can't be one: it must be a subdomain of the domain, outside its MAIL FROM subdomain.
 */
export function normalizeTrackingHostname(input: string, parent: DomainRow): string {
  let hostname: string;
  try {
    hostname = normalizeDomainName(input);
  } catch (error) {
    if (error instanceof DomainError) {
      throw new DomainError("invalid_tracking_hostname", error.message);
    }
    throw error;
  }
  if (!hostname.endsWith(`.${parent.name}`)) {
    throw new DomainError(
      "invalid_tracking_hostname",
      `The tracking domain must be a subdomain of ${parent.name}, like links.${parent.name}.`,
    );
  }
  if (hostname === parent.mailFromDomain || hostname.endsWith(`.${parent.mailFromDomain}`)) {
    throw new DomainError(
      "invalid_tracking_hostname",
      `${parent.mailFromDomain} is reserved for bounce handling.`,
    );
  }
  return hostname;
}

function expectedRecord(hostname: string, cnameTarget: string): TrackingDomainRecord {
  return { type: "CNAME", name: hostname, value: cnameTarget, status: "not_checked", found: [] };
}

/** When the worker should check a tracking domain next (`null`: never). */
export function trackingNextCheckAt(
  row: Pick<TrackingDomainRow, "status" | "verificationStartedAt">,
  now: Date,
): Date | null {
  switch (row.status) {
    case "active":
      return new Date(now.getTime() + 12 * HOUR);
    case "pending":
    case "temporary_failure": {
      const age = now.getTime() - row.verificationStartedAt.getTime();
      return new Date(now.getTime() + (age < HOUR ? MINUTE : 10 * MINUTE));
    }
    default:
      return null;
  }
}

export function toTrackingDomainObject(row: TrackingDomainRow): TrackingDomainObjectOutput {
  return {
    hostname: row.hostname,
    status: row.status,
    record: row.record,
    message: row.providerMessage,
    created_at: row.createdAt.toISOString(),
    last_checked_at: row.lastCheckedAt?.toISOString() ?? null,
    activated_at: row.activatedAt?.toISOString() ?? null,
    failed_at: row.failedAt?.toISOString() ?? null,
  };
}

export async function getTrackingDomain(input: {
  organizationId: string;
  domainId: string;
}): Promise<TrackingDomainRow | null> {
  const [row] = await db
    .select()
    .from(trackingDomain)
    .where(
      and(
        eq(trackingDomain.organizationId, input.organizationId),
        eq(trackingDomain.domainId, input.domainId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** The tracking domains of some of an organization's domains, by domain id. */
export async function listTrackingDomains(input: {
  organizationId: string;
  domainIds: string[];
}): Promise<Map<string, TrackingDomainRow>> {
  if (input.domainIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(trackingDomain)
    .where(
      and(
        eq(trackingDomain.organizationId, input.organizationId),
        inArray(trackingDomain.domainId, input.domainIds),
      ),
    );
  return new Map(rows.map((row) => [row.domainId, row]));
}

/** The wire representation of an organization's domains, with their tracking and receiving domains. */
export async function domainObjects(
  organizationId: string,
  rows: DomainRow[],
  dmarcReportDomain: string | null = null,
): Promise<DomainObjectOutput[]> {
  const domainIds = rows.map((row) => row.id);
  const [tracking, receiving] = await Promise.all([
    listTrackingDomains({ organizationId, domainIds }),
    listReceivingDomains({ organizationId, domainIds }),
  ]);
  return rows.map((row) => {
    const tracked = tracking.get(row.id);
    const received = receiving.get(row.id);
    return toDomainObject(
      row,
      tracked ? toTrackingDomainObject(tracked) : null,
      received ? toReceivingDomainObject(received) : null,
      dmarcReportDomain,
    );
  });
}

export async function domainObject(
  row: DomainRow,
  dmarcReportDomain: string | null = null,
): Promise<DomainObjectOutput> {
  const [object] = await domainObjects(row.organizationId, [row], dmarcReportDomain);
  if (!object) throw new Error("Domain object missing.");
  return object;
}

async function requireTrackingDomain(input: {
  organizationId: string;
  domainId: string;
}): Promise<TrackingDomainRow> {
  const row = await getTrackingDomain(input);
  if (!row) throw new DomainError("not_found", "This domain has no tracking domain.");
  return row;
}

async function takenError(organizationId: string, hostname: string): Promise<DomainError> {
  const [holder] = await db
    .select({ organizationId: trackingDomain.organizationId })
    .from(trackingDomain)
    .where(and(eq(trackingDomain.hostname, hostname), ne(trackingDomain.status, "failed")))
    .limit(1);
  return new DomainError(
    "tracking_domain_taken",
    holder?.organizationId === organizationId
      ? `${hostname} is already the tracking domain of another of your domains.`
      : `${hostname} is already in use by another account.`,
  );
}

/**
 * Registers a claimed (`pending`) row's hostname with the provider and checks it once. Releases
 * the claim when the provider refuses: a new row is removed, a restarted one fails again. Any other
 * error keeps it: the hostname may be registered with the answer lost, so a retry or the worker
 * picks it up under the same claim (`resumeProvisioning`).
 */
async function provision(
  row: TrackingDomainRow,
  deps: DomainDeps,
  onFailure: "delete" | "fail",
): Promise<TrackingDomainRow> {
  const scope = and(
    eq(trackingDomain.id, row.id),
    eq(trackingDomain.organizationId, row.organizationId),
  );
  let created: { id: string; state: TrackingHostnameState };
  try {
    created = await deps.tracking.create(row.hostname, row.id);
  } catch (error) {
    if (error instanceof TrackingHostnameTakenError) {
      if (onFailure === "delete") await db.delete(trackingDomain).where(scope);
      else {
        await db
          .update(trackingDomain)
          .set({ status: "failed", failedAt: new Date(), nextCheckAt: null })
          .where(scope);
      }
      throw new DomainError(
        "tracking_domain_taken",
        `${row.hostname} is already in use by another account.`,
      );
    }
    console.error(`[email:tracking-domains] provisioning ${row.hostname} failed:`, error);
    throw new DomainError(
      "provider_error",
      "The tracking domain could not be set up. Try again shortly.",
    );
  }
  const [updated] = await db
    .update(trackingDomain)
    .set({ providerHostnameId: created.id, providerMessage: created.state.message })
    .where(scope)
    .returning();
  if (!updated) throw new DomainError("not_found", "This domain has no tracking domain.");
  return checkTrackingDomain(
    { organizationId: row.organizationId, domainId: row.domainId },
    deps,
  ).catch((error) => {
    // The worker checks it again shortly.
    console.error(`[email:tracking-domains] checking ${row.hostname} failed:`, error);
    return updated;
  });
}

/**
 * A claim whose id was never stored: provisioning crashed or lost the provider's answer. While it's
 * young provisioning may still be running, so it's left alone; then it's retried until it expires,
 * when whatever it registered is removed and the hostname released.
 */
async function resumeProvisioning(
  row: TrackingDomainRow,
  now: Date,
  deps: DomainDeps,
): Promise<TrackingDomainRow> {
  const age = now.getTime() - row.verificationStartedAt.getTime();
  if (row.status !== "pending" || age < PROVISIONING_LEASE_MS) return row;
  const scope = and(
    eq(trackingDomain.id, row.id),
    eq(trackingDomain.organizationId, row.organizationId),
    isNull(trackingDomain.providerHostnameId),
  );
  if (age <= PROVISIONING_EXPIRY_MS) {
    return provision(row, deps, "fail").catch(async (error) => {
      if (!(error instanceof DomainError)) throw error;
      return (await getTrackingDomain(row)) ?? row;
    });
  }
  try {
    await deps.tracking.release(row.hostname, row.id);
  } catch (error) {
    // Removing a tenant takes two passes: the worker comes back.
    console.error(`[email:tracking-domains] releasing ${row.hostname} failed:`, error);
    const [waiting] = await db
      .update(trackingDomain)
      .set({ nextCheckAt: new Date(now.getTime() + 10 * MINUTE), lastCheckedAt: now })
      .where(scope)
      .returning();
    return waiting ?? row;
  }
  const [failed] = await db
    .update(trackingDomain)
    .set({
      status: "failed",
      providerMessage: "The tracking domain could not be set up. Restart its setup.",
      failedAt: now,
      nextCheckAt: null,
      lastCheckedAt: now,
    })
    .where(scope)
    .returning();
  return failed ?? row;
}

/** Claims a hostname as the domain's tracking domain and registers it with the provider. */
export async function createTrackingDomain(
  input: { organizationId: string; domainId: string; hostname: string },
  deps: DomainDeps,
): Promise<TrackingDomainRow> {
  await deps.plans?.requireFeature(input.organizationId, "trackingDomains");
  const parent = await requireDomain({ organizationId: input.organizationId, id: input.domainId });
  if (parent.status === "failed" || parent.status === "deleting") {
    throw new DomainError(
      "invalid_tracking_hostname",
      `${parent.name} is not active: restart its verification first.`,
    );
  }
  if (parent.subaccountId) {
    throw new DomainError(
      "subaccount_domain",
      "Sub-accounts' domains don't have tracking domains yet.",
    );
  }
  const hostname = normalizeTrackingHostname(input.hostname, parent);
  const existing = await getTrackingDomain(input);
  if (existing) {
    // The same request again, after provisioning lost the provider's answer.
    if (
      existing.hostname === hostname &&
      existing.status === "pending" &&
      !existing.providerHostnameId &&
      existing.provider === deps.tracking.name
    ) {
      return provision(existing, deps, "delete");
    }
    throw new DomainError(
      "tracking_domain_exists",
      `${parent.name} already has a tracking domain. Remove it first to use another one.`,
    );
  }
  await assertOwnsHostname(parent, hostname);
  const now = new Date();
  let claimed: TrackingDomainRow | undefined;
  try {
    [claimed] = await claimEmailHostname(hostname, "tracking", (tx) =>
      tx
        .insert(trackingDomain)
        .values({
          organizationId: parent.organizationId,
          domainId: parent.id,
          hostname,
          provider: deps.tracking.name,
          record: expectedRecord(hostname, deps.tracking.cnameTarget),
          verificationStartedAt: now,
          nextCheckAt: trackingNextCheckAt({ status: "pending", verificationStartedAt: now }, now),
        })
        .returning(),
    );
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    if (await getTrackingDomain(input)) {
      throw new DomainError(
        "tracking_domain_exists",
        `${parent.name} already has a tracking domain. Remove it first to use another one.`,
      );
    }
    throw await takenError(input.organizationId, hostname);
  }
  if (!claimed) throw new Error("Tracking domain insert returned no row.");
  return provision(claimed, deps, "delete");
}

/** Starts a `failed` tracking domain over, registering its hostname with the provider again. */
export async function restartTrackingDomain(
  input: { organizationId: string; domainId: string },
  deps: DomainDeps,
): Promise<TrackingDomainRow> {
  let row = await requireTrackingDomain(input);
  if (row.status !== "failed") return row;
  await deps.plans?.requireFeature(input.organizationId, "trackingDomains");
  if (row.providerHostnameId) {
    row = await checkTrackingDomain(input, deps);
    if (row.providerHostnameId || row.status !== "failed") return row;
  }
  const now = new Date();
  let claimed: TrackingDomainRow | undefined;
  try {
    [claimed] = await claimEmailHostname(row.hostname, "tracking", (tx) =>
      tx
        .update(trackingDomain)
        .set({
          status: "pending",
          provider: deps.tracking.name,
          providerHostnameId: null,
          providerMessage: null,
          record: expectedRecord(row.hostname, deps.tracking.cnameTarget),
          verificationStartedAt: now,
          nextCheckAt: trackingNextCheckAt({ status: "pending", verificationStartedAt: now }, now),
          activatedAt: null,
          failedAt: null,
        })
        .where(
          and(
            eq(trackingDomain.id, row.id),
            eq(trackingDomain.organizationId, row.organizationId),
            eq(trackingDomain.status, "failed"),
            isNull(trackingDomain.providerHostnameId),
          ),
        )
        .returning(),
    );
  } catch (error) {
    if (isUniqueViolation(error)) throw await takenError(input.organizationId, row.hostname);
    throw error;
  }
  if (!claimed) return requireTrackingDomain(input);
  return provision(claimed, deps, "fail");
}

/**
 * Asks the provider for the hostname's state, checks the CNAME, and stores both. The provider
 * decides `active` (a certificate is served); the CNAME check only tells the customer what DNS
 * shows. A hostname that never activates within the verification window, that the provider gave
 * up on, or that the provider no longer knows fails and is released, so it can be claimed again.
 */
export async function checkTrackingDomain(
  input: { organizationId: string; domainId: string; now?: Date },
  deps: DomainDeps,
): Promise<TrackingDomainRow> {
  const row = await requireTrackingDomain(input);
  // Another provider's hostname (e.g. a fake one after switching to CloudFront) can't be checked.
  if (row.status === "deleting" || row.provider !== deps.tracking.name) {
    return row;
  }
  const now = input.now ?? new Date();
  if (row.status === "failed") {
    if (!row.providerHostnameId) return row;
    let released = false;
    try {
      await deps.tracking.delete(row.providerHostnameId);
      released = true;
    } catch (error) {
      console.error(`[email:tracking-domains] releasing ${row.hostname} failed:`, error);
    }
    const [updated] = await db
      .update(trackingDomain)
      .set({
        providerHostnameId: released ? null : row.providerHostnameId,
        nextCheckAt: released ? null : new Date(now.getTime() + 10 * MINUTE),
        lastCheckedAt: now,
      })
      .where(
        and(
          eq(trackingDomain.id, row.id),
          eq(trackingDomain.status, "failed"),
          eq(trackingDomain.providerHostnameId, row.providerHostnameId),
        ),
      )
      .returning();
    return updated ?? requireTrackingDomain(input);
  }
  // Provisioning publishes the ID after the provider creates the hostname.
  if (!row.providerHostnameId) return resumeProvisioning(row, now, deps);
  const state = await deps.tracking.get(row.providerHostnameId);
  const record = await checkTrackingRecord(
    expectedRecord(row.hostname, deps.tracking.cnameTarget),
    deps.dns,
  );

  const expired = now.getTime() - row.verificationStartedAt.getTime() > VERIFICATION_WINDOW_MS;
  let status: TrackingDomainRow["status"];
  if (state?.status === "active") status = "active";
  else if (!state || state.status === "failed") status = "failed";
  else if (row.activatedAt) status = "temporary_failure";
  else status = expired ? "failed" : "pending";

  let cleanupPending = false;
  if (status === "failed" && state && row.providerHostnameId) {
    try {
      await deps.tracking.delete(row.providerHostnameId);
    } catch (error) {
      cleanupPending = true;
      console.error(`[email:tracking-domains] releasing ${row.hostname} failed:`, error);
    }
  }

  const [updated] = await db
    .update(trackingDomain)
    .set({
      status,
      record,
      providerMessage:
        state?.message ??
        (state ? null : "The tracking hostname is no longer registered. Restart its setup."),
      providerHostnameId: status === "failed" && !cleanupPending ? null : row.providerHostnameId,
      lastCheckedAt: now,
      nextCheckAt: cleanupPending
        ? new Date(now.getTime() + 10 * MINUTE)
        : trackingNextCheckAt({ status, verificationStartedAt: row.verificationStartedAt }, now),
      activatedAt: status === "active" ? (row.activatedAt ?? now) : row.activatedAt,
      failedAt: status === "failed" ? now : null,
    })
    .where(
      and(
        eq(trackingDomain.id, row.id),
        eq(trackingDomain.organizationId, row.organizationId),
        notInArray(trackingDomain.status, ["failed", "deleting"]),
        eq(trackingDomain.providerHostnameId, row.providerHostnameId),
      ),
    )
    .returning();
  return updated ?? requireTrackingDomain(input);
}

/** What the domain's verify endpoint does to its tracking domain: restart if failed, else check. */
export async function verifyTrackingDomain(
  input: { organizationId: string; domainId: string },
  deps: DomainDeps,
): Promise<TrackingDomainRow | null> {
  const row = await getTrackingDomain(input);
  if (!row) return null;
  return row.status === "failed"
    ? restartTrackingDomain(input, deps)
    : checkTrackingDomain(input, deps);
}

/**
 * Removes the hostname at the provider, then the tracking domain. Links and open pixels in emails
 * already sent through it stop working; later sends use the default tracking host.
 */
export async function deleteTrackingDomain(
  input: { organizationId: string; domainId: string },
  deps: DomainDeps,
): Promise<void> {
  const row = await requireTrackingDomain(input);
  const scope = and(
    eq(trackingDomain.id, row.id),
    eq(trackingDomain.organizationId, row.organizationId),
  );
  const unstored = !row.providerHostnameId && row.status === "pending";
  if ((row.providerHostnameId || unstored) && row.provider === deps.tracking.name) {
    // Stops sends from using it before the hostname disappears.
    await db.update(trackingDomain).set({ status: "deleting", nextCheckAt: null }).where(scope);
    try {
      if (row.providerHostnameId) await deps.tracking.delete(row.providerHostnameId);
      else await deps.tracking.release(row.hostname, row.id);
    } catch (error) {
      // The provider may have stopped serving it already: sends must not use it until a check says so.
      await db
        .update(trackingDomain)
        .set({
          status: row.status === "active" ? "temporary_failure" : row.status,
          nextCheckAt: new Date(),
        })
        .where(scope);
      console.error(`[email:tracking-domains] deleting ${row.hostname} failed:`, error);
      throw new DomainError(
        "provider_error",
        "The tracking domain could not be removed. Try again shortly.",
      );
    }
  }
  await db.delete(trackingDomain).where(scope);
}

/**
 * System-level (worker): checks tracking domains that are due, oldest first, leasing each by
 * moving its `next_check_at` forward first (as `recheckDueDomains` does). `scope` limits the scan
 * to some organizations (tests); once `signal` aborts, no further tracking domain is leased.
 */
export async function recheckDueTrackingDomains(
  opts: {
    now?: Date;
    limit?: number;
    scope?: { organizationIds: string[] };
    signal?: AbortSignal;
  },
  deps: DomainDeps,
): Promise<number> {
  const now = opts.now ?? new Date();
  const due = await db
    .select({
      id: trackingDomain.id,
      organizationId: trackingDomain.organizationId,
      domainId: trackingDomain.domainId,
      nextCheckAt: trackingDomain.nextCheckAt,
    })
    .from(trackingDomain)
    .where(
      and(
        isNotNull(trackingDomain.nextCheckAt),
        lte(trackingDomain.nextCheckAt, now),
        ne(trackingDomain.status, "deleting"),
        eq(trackingDomain.provider, deps.tracking.name),
        opts.scope ? inArray(trackingDomain.organizationId, opts.scope.organizationIds) : undefined,
      ),
    )
    .orderBy(asc(trackingDomain.nextCheckAt))
    .limit(opts.limit ?? 25);
  let checked = 0;
  for (const candidate of due) {
    if (opts.signal?.aborted) break;
    if (!candidate.nextCheckAt) continue;
    const [leased] = await db
      .update(trackingDomain)
      .set({ nextCheckAt: new Date(now.getTime() + 5 * MINUTE) })
      .where(
        and(
          eq(trackingDomain.id, candidate.id),
          eq(trackingDomain.nextCheckAt, candidate.nextCheckAt),
        ),
      )
      .returning({ id: trackingDomain.id });
    if (!leased) continue;
    try {
      await checkTrackingDomain(
        { organizationId: candidate.organizationId, domainId: candidate.domainId, now },
        deps,
      );
      checked++;
    } catch (error) {
      console.error(`[email:tracking-domains] checking ${candidate.id} failed:`, error);
    }
  }
  return checked;
}

/**
 * System-level (dispatch): the tracking base URL (`https://<hostname>`) of an email's From
 * domain, when the organization's most specific domain covering it has an `active` tracking
 * domain served by `provider`; otherwise `null` (use the default tracking host).
 */
export async function trackingBaseUrlFor(input: {
  organizationId: string;
  from: string;
  provider: string;
}): Promise<string | null> {
  let fromDomain: string;
  try {
    const address = parseEmailAddress(input.from).address.toLowerCase();
    fromDomain = address.slice(address.lastIndexOf("@") + 1);
  } catch {
    return null;
  }
  const candidates = await db
    .select({
      name: domain.name,
      organizationId: domain.organizationId,
      hostname: trackingDomain.hostname,
      status: trackingDomain.status,
      provider: trackingDomain.provider,
    })
    .from(domain)
    .leftJoin(
      trackingDomain,
      and(
        eq(trackingDomain.domainId, domain.id),
        eq(trackingDomain.organizationId, domain.organizationId),
      ),
    )
    .where(and(inArray(domain.name, domainSuffixes(fromDomain)), ne(domain.status, "failed")));
  const match = candidates.sort((a, b) => b.name.length - a.name.length)[0];
  if (
    !match ||
    match.organizationId !== input.organizationId ||
    match.status !== "active" ||
    match.provider !== input.provider ||
    !match.hostname
  ) {
    return null;
  }
  return `https://${match.hostname}`;
}
