/**
 * Sending domains: organization-owned identities with Easy DKIM and a custom MAIL FROM
 * subdomain, verified by the provider and re-checked by the worker.
 */

import type { PlanGate } from "@coss/billing/gate";
import { isOnBillingHold } from "@coss/billing/metering";
import { db, schema } from "@coss/db";
import { isId } from "@coss/db/id";
import { isMarketingPaused, isSuspended } from "@coss/reputation";
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { checkBimi, organizationalDomain, toBimiObject } from "./bimi.ts";
import { releaseOrganizationDedicatedIps } from "./dedicated-ips.ts";
import { appliedDmarcRecord, dmarcPolicyKey } from "./dmarc-record.ts";
import { deleteOrganizationDmarcReports } from "./dmarc-reports.ts";
import { checkDomainDns, type DnsResolver, dmarcRecordAt, expectedRecords } from "./dns.ts";
import { DomainError, EmailError } from "./errors.ts";
import type { InboundContentStore } from "./inbound-store.ts";
import {
  type DedicatedIpProvider,
  EMAIL_STREAMS,
  type EmailStream,
  type IdentityProvider,
  IdentityTakenError,
  type ProviderTenant,
} from "./provider.ts";
import {
  DOMAIN_NAME_MAX_LENGTH,
  type DomainObjectOutput,
  parseEmailAddress,
  type ReceivingDomainObjectOutput,
  type TrackingDomainObjectOutput,
} from "./schemas.ts";
import type { TrackingHostnameProvider } from "./tracking-hostnames.ts";

const { domain, emailSubaccount, emailTenant, environment, ssoProvider, trackingDomain } = schema;

export type DomainRow = typeof domain.$inferSelect;
export type EmailTenantRow = typeof emailTenant.$inferSelect;
export type DomainRecord = DomainRow["records"][number];

export type DomainDeps = {
  identity: IdentityProvider;
  dns: DnsResolver | null;
  /** Serves custom tracking hostnames (`tracking-domains.ts`). */
  tracking: TrackingHostnameProvider;
  /** Dedicated IP pools (`dedicated-ips.ts`); unset: none are released with the organization. */
  dedicatedIps?: DedicatedIpProvider;
  /** The organization's plan (domains, tracking domains); unset: nothing is limited (tests). */
  plans?: PlanGate;
  /**
   * The managed inbound domain DMARC reports are received at (`INBOUND_MANAGED_DOMAIN`); unset or
   * `null`: receiving is off, and the recommended DMARC record names no report address.
   */
  dmarcReportDomain?: string | null;
};

/** Subdomain used as the envelope sender (bounces and complaints come back to it). */
export const MAIL_FROM_SUBDOMAIN = "send";
export const MAX_PENDING_DOMAINS = 5;
/** The provider gives up verifying after 72 hours; so do we. */
export const VERIFICATION_WINDOW_MS = 72 * 60 * 60 * 1000;
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const RESERVED_SUFFIXES = ["amazonses.com", "amazonaws.com", "coss.com", "coss.dev"];

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * Lower-cased, trailing-dot-free domain name, or a `DomainError` explaining why it is invalid.
 * `allowReserved` admits coss.com's and AWS's own domains (`RESERVED_SUFFIXES`): only for platform
 * admins setting up coss.com's own organization (its sending domain is coss.com).
 */
export function normalizeDomainName(
  input: string,
  options: { allowReserved?: boolean } = {},
): string {
  const name = input.trim().toLowerCase().replace(/\.$/, "");
  const labels = name.split(".");
  const invalid = (message: string) => new DomainError("invalid_domain", message);
  if (!name) throw invalid("Enter a domain name, like acme.com.");
  if (/\P{ASCII}/u.test(name)) {
    throw invalid("Internationalized domains must be punycode-encoded (xn--…).");
  }
  if (
    name.length > DOMAIN_NAME_MAX_LENGTH ||
    labels.length < 2 ||
    !labels.every((l) => LABEL.test(l))
  ) {
    throw invalid(
      "Enter a valid domain name, like acme.com or mail.acme.com (no https:// or paths).",
    );
  }
  if (/^\d+$/.test(labels.at(-1) ?? "")) throw invalid("IP addresses can't be used as domains.");
  if (
    !options.allowReserved &&
    RESERVED_SUFFIXES.some((suffix) => name === suffix || name.endsWith(`.${suffix}`))
  ) {
    throw invalid("This domain can't be used.");
  }
  if (labels[0] === MAIL_FROM_SUBDOMAIN) {
    throw invalid(`"${MAIL_FROM_SUBDOMAIN}." subdomains are reserved for bounce handling.`);
  }
  return name;
}

/**
 * The DNS records of a domain: the latest check, or what to publish if never checked
 * (`dmarcReportDomain`: see `DomainDeps`).
 */
export function domainRecords(
  row: DomainRow,
  dmarcReportDomain: string | null = null,
): DomainRecord[] {
  return row.records.length > 0 ? row.records : expectedRecords(row, dmarcReportDomain);
}

/**
 * The domain's public wire representation, including the records to publish. `tracking` and
 * `receiving` are its tracking and receiving domains' (`domainObjects` in `tracking-domains.ts`
 * loads all three).
 */
export function toDomainObject(
  row: DomainRow,
  tracking: TrackingDomainObjectOutput | null = null,
  receiving: ReceivingDomainObjectOutput | null = null,
  dmarcReportDomain: string | null = null,
): DomainObjectOutput {
  return {
    object: "domain",
    id: row.id,
    name: row.name,
    status: row.status,
    can_send: row.canSend,
    region: row.region,
    mail_from_domain: row.mailFromDomain,
    mail_from_status: row.mailFromStatus,
    records: domainRecords(row, dmarcReportDomain),
    created_at: row.createdAt.toISOString(),
    last_checked_at: row.lastCheckedAt?.toISOString() ?? null,
    verified_at: row.verifiedAt?.toISOString() ?? null,
    failed_at: row.failedAt?.toISOString() ?? null,
    tracking,
    receiving,
    bimi: toBimiObject(row),
    subaccount_id: row.subaccountId,
    shared_with_subaccounts: row.sharedWithSubaccounts,
  };
}

/** When the worker should check a domain next (`null`: never). */
export function nextCheckAt(
  row: Pick<DomainRow, "status" | "verificationStartedAt">,
  now: Date,
): Date | null {
  switch (row.status) {
    case "verified":
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

/** Tenants of the organization itself (`null`), or of one of its sub-accounts. */
function tenantOwner(subaccountId: string | null | undefined) {
  return subaccountId
    ? eq(emailTenant.subaccountId, subaccountId)
    : isNull(emailTenant.subaccountId);
}

/**
 * The organization's provider tenant of one stream (default: the transactional one), or a
 * sub-account's (`subaccountId`).
 */
export async function getEmailTenant(
  organizationId: string,
  stream: EmailStream = "transactional",
  subaccountId: string | null = null,
): Promise<EmailTenantRow | null> {
  const [row] = await db
    .select()
    .from(emailTenant)
    .where(
      and(
        eq(emailTenant.organizationId, organizationId),
        tenantOwner(subaccountId),
        eq(emailTenant.stream, stream),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Every provider tenant of the organization itself (one per stream once both exist), or of one
 * of its sub-accounts.
 */
export async function listEmailTenants(
  organizationId: string,
  subaccountId: string | null = null,
): Promise<EmailTenantRow[]> {
  return db
    .select()
    .from(emailTenant)
    .where(and(eq(emailTenant.organizationId, organizationId), tenantOwner(subaccountId)))
    .orderBy(asc(emailTenant.stream));
}

function tenantOf(row: EmailTenantRow): ProviderTenant {
  return { tenantName: row.tenantName, tenantArn: row.tenantArn };
}

/**
 * The tenants known to `provider` a domain's identity is associated with: its sub-account's own,
 * else the organization's.
 */
async function providerTenants(
  organizationId: string,
  provider: string,
  subaccountId: string | null = null,
): Promise<ProviderTenant[]> {
  const rows = await listEmailTenants(organizationId, subaccountId);
  return rows.filter((row) => row.provider === provider).map(tenantOf);
}

/**
 * A sub-account's own (transactional) provider tenant, created with its first domain. Born
 * without the provider's suppression like every new tenant (`suppression_migrated_at` set):
 * coss.com keeps the sub-account's list.
 */
export async function ensureSubaccountTenant(
  organizationId: string,
  subaccountId: string,
  identity: IdentityProvider,
): Promise<ProviderTenant> {
  const existing = await getEmailTenant(organizationId, "transactional", subaccountId);
  if (existing?.provider === identity.name) return tenantOf(existing);
  const tenant = await identity.ensureTenant({
    organizationId,
    subaccountId,
    stream: "transactional",
  });
  try {
    await db
      .insert(emailTenant)
      .values({
        organizationId,
        subaccountId,
        stream: "transactional",
        provider: identity.name,
        ...tenant,
        suppressionMigratedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [emailTenant.organizationId, emailTenant.subaccountId, emailTenant.stream],
        set: { provider: identity.name, ...tenant },
      });
  } catch (error) {
    // The sub-account was deleted meanwhile (its teardown found no tenant row): nothing else
    // would ever find this tenant, so it goes now.
    if (isForeignKeyViolation(error)) {
      await identity.deleteTenant(tenant).catch((cleanup) => {
        console.error(`[domains] releasing orphaned tenant ${tenant.tenantName} failed:`, cleanup);
      });
      throw new DomainError("subaccount_not_found", "Sub-account not found.");
    }
    throw error;
  }
  return tenant;
}

/** The organization's provider tenant of one stream, created on first use. */
export async function ensureOrgTenant(
  organizationId: string,
  identity: IdentityProvider,
  stream: EmailStream = "transactional",
  opts: { provisioning?: string } = {},
): Promise<ProviderTenant> {
  const existing = await getEmailTenant(organizationId, stream);
  if (existing?.provider === identity.name) return tenantOf(existing);
  return (await storeOrgTenant(organizationId, identity, stream, opts)).tenant;
}

/**
 * Creates (or adopts) one stream's provider tenant and stores its row. The organization's domain
 * identities are associated with it first, so a stored tenant can always send from every domain
 * (a stream added after an organization's first domain, at provisioning or by the backfill).
 * Only identities provisioned for this organization (their DKIM tokens are stored): a domain still
 * being claimed goes through `createDomainIdentity`'s ownership checks, which an association made
 * here would get around (an orphaned identity's old keys would look like the organization's own).
 */
async function storeOrgTenant(
  organizationId: string,
  identity: IdentityProvider,
  stream: EmailStream,
  opts: { provisioning?: string } = {},
): Promise<{ tenant: ProviderTenant; created: boolean }> {
  const tenant = await identity.ensureTenant({ organizationId, stream });
  await associateOrgDomains(organizationId, identity, tenant, opts);
  const [stored] = await db
    .insert(emailTenant)
    .values({
      organizationId,
      stream,
      provider: identity.name,
      ...tenant,
      // Marketing tenants are always born without SES suppression (`TENANT_SUPPRESSION`): the
      // bootstrap's migration must never import (and so revive) entries into them.
      suppressionMigratedAt: stream === "transactional" ? null : new Date(),
    })
    .onConflictDoUpdate({
      target: [emailTenant.organizationId, emailTenant.subaccountId, emailTenant.stream],
      set: { provider: identity.name, ...tenant },
    })
    .returning({ created: sql<boolean>`xmax = 0` });
  return { tenant, created: Boolean(stored?.created) };
}

/** Associates the organization's provisioned domain identities with `tenant` (idempotent). */
async function associateOrgDomains(
  organizationId: string,
  identity: IdentityProvider,
  tenant: ProviderTenant,
  /** The domain being provisioned (a restart keeps its old tokens): its ownership check comes first. */
  opts: { provisioning?: string } = {},
): Promise<void> {
  const domains = await db
    .select({ name: domain.name })
    .from(domain)
    .where(
      and(
        eq(domain.organizationId, organizationId),
        // A sub-account's domains send only through its own tenant.
        isNull(domain.subaccountId),
        eq(domain.provider, identity.name),
        notInArray(domain.status, ["failed", "deleting"]),
        sql`cardinality(${domain.dkimTokens}) > 0`,
        opts.provisioning ? ne(domain.name, opts.provisioning) : undefined,
      ),
    );
  for (const row of domains) {
    await identity.associateDomainIdentity({ tenant, domain: row.name });
  }
}

/** Every stream's tenant of the organization, created on first use (transactional first). */
export async function ensureOrgTenants(
  organizationId: string,
  identity: IdentityProvider,
  opts: { provisioning?: string } = {},
): Promise<ProviderTenant[]> {
  const tenants: ProviderTenant[] = [];
  for (const stream of EMAIL_STREAMS) {
    tenants.push(await ensureOrgTenant(organizationId, identity, stream, opts));
  }
  return tenants;
}

/**
 * Creates the tenants of streams added after an organization's first domain (`ses:bootstrap`
 * after an upgrade), each associated with the organization's domain identities before its row is
 * stored (`storeOrgTenant`), and associates existing stream tenants with domains added since (the
 * old release, between the upgrade's bootstrap and its deploy, associated new domains with the
 * transactional tenant only). Idempotent; returns the number of tenants created. `scope` limits it
 * to some organizations (tests).
 */
export async function ensureMissingStreamTenants(
  identity: IdentityProvider,
  opts: { scope?: { organizationIds: string[] } } = {},
): Promise<number> {
  const organizations = await db
    .selectDistinct({ organizationId: emailTenant.organizationId })
    .from(emailTenant)
    .where(
      and(
        eq(emailTenant.provider, identity.name),
        isNull(emailTenant.subaccountId),
        opts.scope ? inArray(emailTenant.organizationId, opts.scope.organizationIds) : undefined,
      ),
    )
    .orderBy(asc(emailTenant.organizationId));
  let created = 0;
  for (const { organizationId } of organizations) {
    const existing = await listEmailTenants(organizationId);
    for (const stream of EMAIL_STREAMS) {
      const row = existing.find((tenant) => tenant.stream === stream);
      if (row?.provider === identity.name) {
        await associateOrgDomains(organizationId, identity, tenantOf(row));
        continue;
      }
      if ((await storeOrgTenant(organizationId, identity, stream)).created) created++;
    }
  }
  return created;
}

/**
 * The organization's domains (name order), optionally only one sub-account's (`subaccountId`) or
 * only its own (`subaccountId: null`).
 */
export async function listDomains(input: {
  organizationId: string;
  subaccountId?: string | null;
}): Promise<DomainRow[]> {
  return db
    .select()
    .from(domain)
    .where(
      and(
        eq(domain.organizationId, input.organizationId),
        input.subaccountId === undefined
          ? undefined
          : input.subaccountId === null
            ? isNull(domain.subaccountId)
            : eq(domain.subaccountId, input.subaccountId),
      ),
    )
    .orderBy(asc(domain.name));
}

export async function getDomain(input: {
  organizationId: string;
  id: string;
}): Promise<DomainRow | null> {
  if (!isId("dom", input.id)) return null;
  const [row] = await db
    .select()
    .from(domain)
    .where(and(eq(domain.organizationId, input.organizationId), eq(domain.id, input.id)))
    .limit(1);
  return row ?? null;
}

export async function requireDomain(input: {
  organizationId: string;
  id: string;
}): Promise<DomainRow> {
  const row = await getDomain(input);
  if (!row) throw new DomainError("not_found", "Domain not found.");
  return row;
}

function isForeignKeyViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } }).cause;
  return (error as { code?: string }).code === "23503" || cause?.code === "23503";
}

export function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } }).cause;
  return (error as { code?: string }).code === "23505" || cause?.code === "23505";
}

async function takenError(organizationId: string, name: string): Promise<DomainError> {
  const [holder] = await db
    .select({ organizationId: domain.organizationId })
    .from(domain)
    .where(and(eq(domain.name, name), ne(domain.status, "failed")))
    .limit(1);
  return new DomainError(
    "domain_taken",
    holder?.organizationId === organizationId
      ? `${name} has already been added.`
      : `${name} is already in use by another account.`,
  );
}

/**
 * Provisions the provider identity for a claimed (`pending`) row and stores its DKIM tokens.
 * Releases the claim when the provider refuses: a new row is removed, a restarted one fails again.
 */
async function provision(
  row: DomainRow,
  deps: DomainDeps,
  onFailure: "delete" | "fail",
): Promise<DomainRow> {
  let tenants: ProviderTenant[] = [];
  try {
    tenants = row.subaccountId
      ? [await ensureSubaccountTenant(row.organizationId, row.subaccountId, deps.identity)]
      : await ensureOrgTenants(row.organizationId, deps.identity, { provisioning: row.name });
    const identity = await deps.identity.createDomainIdentity({
      tenants,
      domain: row.name,
      mailFromDomain: row.mailFromDomain,
    });
    const now = new Date();
    const [updated] = await db
      .update(domain)
      .set({
        dkimTokens: identity.dkimTokens,
        dkimHostedZone: identity.dkimHostedZone,
        region: identity.region,
        records: [],
        nextCheckAt: nextCheckAt({ status: "pending", verificationStartedAt: now }, now),
      })
      .where(and(eq(domain.id, row.id), eq(domain.organizationId, row.organizationId)))
      .returning();
    if (!updated) throw new DomainError("not_found", "Domain not found.");
    return updated;
  } catch (error) {
    const scope = and(eq(domain.id, row.id), eq(domain.organizationId, row.organizationId));
    const [kept] =
      onFailure === "delete"
        ? await db.delete(domain).where(scope).returning({ id: domain.id })
        : await db
            .update(domain)
            .set({ status: "failed", failedAt: new Date(), nextCheckAt: null })
            .where(scope)
            .returning({ id: domain.id });
    // The claim was gone already (its owner's teardown ran meanwhile, before the identity
    // existed): no cleanup would ever find an identity made for it, so it goes now.
    if (!kept && !(error instanceof IdentityTakenError)) {
      await releaseUnclaimedIdentity(row.name, tenants, deps.identity);
    }
    if (error instanceof DomainError) throw error;
    if (error instanceof IdentityTakenError) {
      throw new DomainError("domain_taken", `${row.name} is already in use by another account.`);
    }
    console.error(`[email:domains] provisioning ${row.name} failed:`, error);
    throw new DomainError("provider_error", "The domain could not be set up. Try again shortly.");
  }
}

/** Deletes the identity of a name nobody claims (any more), best effort. */
async function releaseUnclaimedIdentity(
  name: string,
  tenants: ProviderTenant[],
  identity: IdentityProvider,
): Promise<void> {
  const [claimed] = await db
    .select({ id: domain.id })
    .from(domain)
    .where(eq(domain.name, name))
    .limit(1);
  if (claimed) return;
  await identity.deleteDomainIdentity({ tenants, domain: name }).catch((cleanup) => {
    console.error(`[email:domains] releasing the unclaimed identity ${name} failed:`, cleanup);
  });
}

/** Domains one sub-account may have (failed ones aside), and awaiting verification at once. */
export const MAX_SUBACCOUNT_DOMAINS = 10;
export const MAX_PENDING_SUBACCOUNT_DOMAINS = 5;

/**
 * At most `MAX_PENDING_DOMAINS` of the organization's own domains await verification at once;
 * a sub-account's count on their own (`MAX_PENDING_SUBACCOUNT_DOMAINS`), so a platform onboarding
 * many users at once isn't held up.
 */
async function assertPendingCapacity(
  organizationId: string,
  subaccountId: string | null = null,
): Promise<void> {
  const [pending] = await db
    .select({ value: count() })
    .from(domain)
    .where(
      and(
        eq(domain.organizationId, organizationId),
        subaccountId ? eq(domain.subaccountId, subaccountId) : isNull(domain.subaccountId),
        inArray(domain.status, ["pending", "temporary_failure"]),
      ),
    );
  const max = subaccountId ? MAX_PENDING_SUBACCOUNT_DOMAINS : MAX_PENDING_DOMAINS;
  if ((pending?.value ?? 0) >= max) {
    throw new DomainError(
      "too_many_pending_domains",
      subaccountId
        ? `A sub-account can have at most ${max} domains awaiting verification.`
        : `You can have at most ${max} domains awaiting verification.`,
    );
  }
}

/** A sub-account's domain needs a live, active sub-account with room for one more. */
async function assertSubaccountDomainCapacity(
  organizationId: string,
  subaccountId: string,
): Promise<void> {
  const [row] = await db
    .select({ status: emailSubaccount.status, mode: environment.mode })
    .from(emailSubaccount)
    .innerJoin(
      environment,
      and(
        eq(environment.id, emailSubaccount.environmentId),
        eq(environment.organizationId, emailSubaccount.organizationId),
      ),
    )
    .where(
      and(eq(emailSubaccount.id, subaccountId), eq(emailSubaccount.organizationId, organizationId)),
    );
  if (!row || row.status === "deleting") {
    throw new DomainError("subaccount_not_found", "Sub-account not found.");
  }
  if (row.mode !== "live") {
    throw new DomainError(
      "subaccount_not_live",
      "Only live sub-accounts have domains: sandbox sends need none.",
    );
  }
  const [existing] = await db
    .select({ value: count() })
    .from(domain)
    .where(
      and(
        eq(domain.organizationId, organizationId),
        eq(domain.subaccountId, subaccountId),
        ne(domain.status, "failed"),
      ),
    );
  if ((existing?.value ?? 0) >= MAX_SUBACCOUNT_DOMAINS) {
    throw new DomainError(
      "too_many_subaccount_domains",
      `A sub-account can have at most ${MAX_SUBACCOUNT_DOMAINS} domains.`,
    );
  }
}

/** Claims the name for the organization and creates its provider identity. */
export async function createDomain(
  input: {
    organizationId: string;
    name: string;
    userId: string | null;
    /** Platform admins only (the dashboard checks): see `normalizeDomainName`. */
    allowReserved?: boolean;
    /** The email sub-account it belongs to (already checked to be the caller's). */
    subaccountId?: string | null;
  },
  deps: DomainDeps,
): Promise<DomainRow> {
  const name = normalizeDomainName(input.name, { allowReserved: input.allowReserved });
  const subaccountId = input.subaccountId ?? null;
  await assertPendingCapacity(input.organizationId, subaccountId);
  if (subaccountId) {
    // Its own caps: the plan's `domains` counts the organization's own domains.
    await assertSubaccountDomainCapacity(input.organizationId, subaccountId);
  } else if (deps.plans) {
    const [existing] = await db
      .select({ value: count() })
      .from(domain)
      .where(
        and(
          eq(domain.organizationId, input.organizationId),
          isNull(domain.subaccountId),
          ne(domain.status, "failed"),
        ),
      );
    await deps.plans.requireCapacity(input.organizationId, "domains", existing?.value ?? 0);
  }
  let claimed: DomainRow | undefined;
  try {
    [claimed] = await db
      .insert(domain)
      .values({
        organizationId: input.organizationId,
        name,
        provider: deps.identity.name,
        mailFromDomain: `${MAIL_FROM_SUBDOMAIN}.${name}`,
        createdByUserId: input.userId,
        subaccountId,
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) throw await takenError(input.organizationId, name);
    throw error;
  }
  if (!claimed) throw new Error("Domain insert returned no row.");
  return provision(claimed, deps, "delete");
}

/** Starts verification over for a `failed` domain, with a new identity and new DKIM tokens. */
export async function restartDomainVerification(
  input: { organizationId: string; id: string },
  deps: DomainDeps,
): Promise<DomainRow> {
  const row = await requireDomain(input);
  if (row.status !== "failed") return row;
  await assertPendingCapacity(input.organizationId, row.subaccountId);
  // A failed domain doesn't count toward its sub-account's domains; a restarted one does again.
  if (row.subaccountId)
    await assertSubaccountDomainCapacity(input.organizationId, row.subaccountId);
  let claimed: DomainRow | undefined;
  try {
    [claimed] = await db
      .update(domain)
      .set({
        status: "pending",
        canSend: false,
        provider: deps.identity.name,
        mailFromStatus: "pending",
        records: [],
        bimi: null,
        verificationStartedAt: new Date(),
        failedAt: null,
      })
      .where(
        and(
          eq(domain.id, row.id),
          eq(domain.organizationId, row.organizationId),
          eq(domain.status, "failed"),
        ),
      )
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) throw await takenError(input.organizationId, row.name);
    throw error;
  }
  if (!claimed) return requireDomain(input);
  return provision(claimed, deps, "fail");
}

/**
 * Asks the provider for the identity's state, checks DNS, and stores both. A domain that stays
 * unverified past the verification window (or whose identity is gone) fails and releases its
 * identity, so the name can be claimed again.
 */
export async function checkDomain(
  input: { organizationId: string; id: string; now?: Date },
  deps: DomainDeps,
): Promise<DomainRow> {
  const row = await requireDomain(input);
  // Another provider's domain (e.g. a fake one after switching to SES) can't be checked here.
  if (row.status === "failed" || row.status === "deleting" || row.provider !== deps.identity.name) {
    return row;
  }
  const now = input.now ?? new Date();
  const state = await deps.identity.getDomainIdentity(row.name);

  let status: DomainRow["status"] = state?.status ?? "failed";
  // A domain that never verified gives up after the window; a verified one follows the provider.
  const expired =
    !row.verifiedAt && now.getTime() - row.verificationStartedAt.getTime() > VERIFICATION_WINDOW_MS;
  if (status !== "verified" && expired) status = "failed";

  const identity = {
    dkimTokens: state?.dkimTokens.length ? state.dkimTokens : row.dkimTokens,
    dkimHostedZone: state?.dkimHostedZone ?? row.dkimHostedZone,
    region: state?.region ?? row.region,
  };
  const [{ records, dmarc, dmarcAbsent }, bimi] = await Promise.all([
    checkDomainDns(
      expectedRecords({ ...row, ...identity }, deps.dmarcReportDomain ?? null),
      deps.dns,
    ),
    checkBimi(row.name, deps.dns),
  ]);
  // A subdomain with no DMARC record of its own gets its organizational domain's (`undefined`:
  // that lookup failed, so the stored one stays).
  const organizational = organizationalDomain(row.name);
  const inherited =
    dmarcAbsent && deps.dns && organizational !== row.name
      ? await dmarcRecordAt(organizational, deps.dns)
      : null;
  const dmarcInheritedRecord = inherited === undefined ? row.dmarcInheritedRecord : inherited;
  // `undefined`: DNS couldn't be asked, so the stored record (and its policy's start) stays.
  const dmarcState =
    dmarc === undefined
      ? {}
      : {
          dmarcRecord: dmarc,
          dmarcInheritedRecord,
          dmarcPolicyChangedAt:
            row.dmarcPolicyChangedAt &&
            dmarcPolicyKey(appliedDmarcRecord(row)) ===
              dmarcPolicyKey(appliedDmarcRecord({ dmarcRecord: dmarc, dmarcInheritedRecord }))
              ? row.dmarcPolicyChangedAt
              : now,
        };

  if (status === "failed" && state) {
    try {
      await deps.identity.deleteDomainIdentity({
        tenants: await providerTenants(row.organizationId, deps.identity.name, row.subaccountId),
        domain: row.name,
      });
    } catch (error) {
      console.error(`[email:domains] releasing ${row.name} failed:`, error);
    }
  }

  const [updated] = await db
    .update(domain)
    .set({
      ...identity,
      status,
      canSend: status === "verified" && (state?.canSend ?? false),
      mailFromStatus: state?.mailFromStatus ?? row.mailFromStatus,
      records,
      ...dmarcState,
      bimi,
      lastCheckedAt: now,
      nextCheckAt: nextCheckAt({ status, verificationStartedAt: row.verificationStartedAt }, now),
      verifiedAt: status === "verified" ? (row.verifiedAt ?? now) : row.verifiedAt,
      failedAt: status === "failed" ? now : null,
    })
    .where(
      and(
        eq(domain.id, row.id),
        eq(domain.organizationId, row.organizationId),
        notInArray(domain.status, ["failed", "deleting"]),
      ),
    )
    .returning();
  return updated ?? requireDomain(input);
}

/**
 * Whether the organization's SSO provider lists the domain. SSO only accepts addresses on verified
 * email domains of the organization, so deleting one would end SSO sign-in for its people (and
 * lock members out while the organization requires SSO). `sso_provider.domain` is comma-joined.
 */
async function usedBySso(organizationId: string, name: string): Promise<boolean> {
  const providers = await db
    .select({ domain: ssoProvider.domain })
    .from(ssoProvider)
    .where(eq(ssoProvider.organizationId, organizationId));
  return providers.some((provider) =>
    provider.domain.split(",").some((entry) => entry.trim().toLowerCase() === name),
  );
}

/**
 * Removes the domain's tracking hostname at its provider (the row goes with the domain). Links in
 * emails already sent from it stop working.
 */
async function releaseTrackingHostname(
  row: Pick<DomainRow, "id" | "organizationId">,
  deps: Pick<DomainDeps, "tracking">,
  assertLease: () => Promise<void> = async () => {},
): Promise<void> {
  const [tracked] = await db
    .select()
    .from(trackingDomain)
    .where(
      and(
        eq(trackingDomain.domainId, row.id),
        eq(trackingDomain.organizationId, row.organizationId),
      ),
    )
    .limit(1);
  if (!tracked || tracked.provider !== deps.tracking.name) return;
  if (!tracked.providerHostnameId && tracked.status !== "pending") return;
  try {
    if (tracked.providerHostnameId) await deps.tracking.delete(tracked.providerHostnameId);
    else await deps.tracking.release(tracked.hostname, tracked.id);
  } catch (error) {
    console.error(`[email:domains] releasing ${tracked.hostname} failed:`, error);
    throw new DomainError("provider_error", "The domain could not be removed. Try again shortly.");
  }
  await assertLease();
  await db
    .update(trackingDomain)
    .set({ status: "failed", failedAt: new Date(), providerHostnameId: null, nextCheckAt: null })
    .where(eq(trackingDomain.id, tracked.id));
}

/** Removes the provider identity, then the domain. Sent emails are unaffected. */
export async function deleteDomain(
  input: { organizationId: string; id: string },
  deps: DomainDeps,
): Promise<void> {
  const row = await requireDomain(input);
  if (await usedBySso(row.organizationId, row.name)) {
    throw new DomainError(
      "domain_in_use_by_sso",
      `${row.name} is used by this organization's single sign-on. Remove it from the SSO ` +
        "provider first.",
    );
  }
  const scope = and(eq(domain.id, row.id), eq(domain.organizationId, row.organizationId));
  await releaseTrackingHostname(row, deps);
  if (row.status !== "failed") {
    // Stops sends from this domain before the identity disappears.
    await db.update(domain).set({ status: "deleting", canSend: false }).where(scope);
    try {
      await deps.identity.deleteDomainIdentity({
        tenants: await providerTenants(row.organizationId, deps.identity.name, row.subaccountId),
        domain: row.name,
      });
    } catch (error) {
      await db.update(domain).set({ status: row.status, canSend: row.canSend }).where(scope);
      console.error(`[email:domains] deleting ${row.name} failed:`, error);
      throw new DomainError(
        "provider_error",
        "The domain could not be removed. Try again shortly.",
      );
    }
  }
  await db.delete(domain).where(scope);
}

/**
 * Lets the organization's sub-accounts send from one of its own domains (through its tenant), or
 * stops them. A sub-account's own domain is never shared.
 */
export async function setDomainSharedWithSubaccounts(input: {
  organizationId: string;
  id: string;
  shared: boolean;
}): Promise<DomainRow> {
  const row = await requireDomain(input);
  if (row.subaccountId) {
    throw new DomainError("not_shareable", "A sub-account's domain can't be shared.");
  }
  const [updated] = await db
    .update(domain)
    .set({ sharedWithSubaccounts: input.shared })
    .where(and(eq(domain.id, row.id), eq(domain.organizationId, row.organizationId)))
    .returning();
  if (!updated) throw new DomainError("not_found", "Domain not found.");
  return updated;
}

/**
 * A sub-account's deletion (worker, `runDueSubaccountDeletions`): removes its domains' provider
 * identities and the domains, then its tenant. Idempotent; a failure leaves the rest for the
 * retry. Its sends were refused since it started deleting.
 */
export async function releaseSubaccountEmailResources(
  row: { organizationId: string; id: string },
  deps: Pick<DomainDeps, "identity" | "tracking">,
): Promise<void> {
  const owner = and(eq(domain.organizationId, row.organizationId), eq(domain.subaccountId, row.id));
  await db
    .update(domain)
    .set({ status: "deleting", canSend: false })
    .where(and(owner, ne(domain.status, "failed")));
  const tenantRows = await listEmailTenants(row.organizationId, row.id);
  const tenants = tenantRows
    .filter((tenant) => tenant.provider === deps.identity.name)
    .map(tenantOf);
  const domains = await db
    .select({ id: domain.id, name: domain.name, status: domain.status, provider: domain.provider })
    .from(domain)
    .where(owner);
  for (const entry of domains) {
    await releaseTrackingHostname({ id: entry.id, organizationId: row.organizationId }, deps);
    // Identities of another provider (e.g. fake domains in an SES deployment) aren't ours to touch.
    if (entry.status !== "failed" && entry.provider === deps.identity.name) {
      await deps.identity.deleteDomainIdentity({ tenants, domain: entry.name });
    }
    await db
      .delete(domain)
      .where(and(eq(domain.id, entry.id), eq(domain.organizationId, row.organizationId)));
  }
  for (const tenantRow of tenantRows) {
    if (tenantRow.provider === deps.identity.name) {
      await deps.identity.deleteTenant(tenantOf(tenantRow));
    }
    await db
      .delete(emailTenant)
      .where(
        and(
          eq(emailTenant.organizationId, row.organizationId),
          eq(emailTenant.tenantName, tenantRow.tenantName),
        ),
      );
  }
}

/**
 * Organization deletion (worker, `OrganizationTeardownDeps.releaseProviderResources`): stops the
 * organization's sends, deletes its received emails' content and its DMARC reports, removes its
 * domains' provider identities and the domains, its dedicated IP pool, then its tenant.
 * Idempotent; a failure leaves the rest for the retry. `failed` domains have no identity of
 * theirs (the name may be another organization's by now), so only their rows go.
 */
export async function releaseOrganizationEmailResources(
  organizationId: string,
  deps: Pick<DomainDeps, "identity" | "tracking" | "dedicatedIps"> & {
    /** Received emails' content store (`EmailRuntime.inbound`); its rows go with the data. */
    inboundStore?: InboundContentStore | null;
  },
  assertLease: () => Promise<void> = async () => {},
): Promise<void> {
  await assertLease();
  // At once, so scheduled sends due meanwhile are refused (`authorizeLiveSender`).
  await db
    .update(domain)
    .set({ status: "deleting", canSend: false })
    .where(and(eq(domain.organizationId, organizationId), ne(domain.status, "failed")));
  if (deps.inboundStore) {
    // Nothing more is received for an organization being deleted (`routeRecipients`).
    await assertLease();
    await deps.inboundStore.deleteOrganization(organizationId);
  }
  // In batches, before the domains: deleting a domain would cascade into all its report rows.
  await deleteOrganizationDmarcReports(organizationId, assertLease);
  // The organization's own tenants and its sub-accounts'.
  const tenantRows = await db
    .select()
    .from(emailTenant)
    .where(eq(emailTenant.organizationId, organizationId))
    .orderBy(asc(emailTenant.tenantName));
  const tenantsOf = (subaccountId: string | null) =>
    tenantRows
      .filter((row) => row.provider === deps.identity.name && row.subaccountId === subaccountId)
      .map(tenantOf);
  const rows = await db
    .select({
      id: domain.id,
      name: domain.name,
      status: domain.status,
      provider: domain.provider,
      subaccountId: domain.subaccountId,
    })
    .from(domain)
    .where(eq(domain.organizationId, organizationId));
  for (const row of rows) {
    await assertLease();
    await releaseTrackingHostname({ id: row.id, organizationId }, deps, assertLease);
    await assertLease();
    // Identities of another provider (e.g. fake domains in an SES deployment) aren't ours to touch.
    if (row.status !== "failed" && row.provider === deps.identity.name) {
      await deps.identity.deleteDomainIdentity({
        tenants: tenantsOf(row.subaccountId),
        domain: row.name,
      });
    }
    await assertLease();
    await db
      .delete(domain)
      .where(and(eq(domain.id, row.id), eq(domain.organizationId, organizationId)));
  }
  // Before the tenants: SES won't delete a configuration set still associated with one.
  await assertLease();
  await releaseOrganizationDedicatedIps(organizationId, deps.dedicatedIps);
  for (const tenantRow of tenantRows) {
    await assertLease();
    if (tenantRow.provider === deps.identity.name) {
      await deps.identity.deleteTenant(tenantOf(tenantRow));
    }
    await assertLease();
    await db
      .delete(emailTenant)
      .where(
        and(
          eq(emailTenant.organizationId, organizationId),
          eq(emailTenant.tenantName, tenantRow.tenantName),
        ),
      );
  }
}

/**
 * System-level (worker): checks domains that are due, oldest first. Each is leased by moving its
 * `next_check_at` forward first, so concurrent workers never check the same domain at once.
 * `scope` limits the scan to some organizations (tests). Once `signal` aborts (the worker is
 * shutting down), no further domain is leased; the rest stay due for the next run.
 */
export async function recheckDueDomains(
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
      id: domain.id,
      organizationId: domain.organizationId,
      nextCheckAt: domain.nextCheckAt,
    })
    .from(domain)
    .where(
      and(
        isNotNull(domain.nextCheckAt),
        lte(domain.nextCheckAt, now),
        notInArray(domain.status, ["failed", "deleting"]),
        eq(domain.provider, deps.identity.name),
        opts.scope ? inArray(domain.organizationId, opts.scope.organizationIds) : undefined,
      ),
    )
    .orderBy(asc(domain.nextCheckAt))
    .limit(opts.limit ?? 25);
  let checked = 0;
  for (const candidate of due) {
    if (opts.signal?.aborted) break;
    if (!candidate.nextCheckAt) continue;
    const [leased] = await db
      .update(domain)
      .set({ nextCheckAt: new Date(now.getTime() + 5 * MINUTE) })
      .where(and(eq(domain.id, candidate.id), eq(domain.nextCheckAt, candidate.nextCheckAt)))
      .returning({ id: domain.id });
    if (!leased) continue;
    try {
      await checkDomain({ organizationId: candidate.organizationId, id: candidate.id, now }, deps);
      checked++;
    } catch (error) {
      console.error(`[email:domains] checking ${candidate.id} failed:`, error);
    }
  }
  return checked;
}

/** Every suffix of `name` that is a valid domain (`a.b.c` → `a.b.c`, `b.c`). */
export function domainSuffixes(name: string): string[] {
  const labels = name.split(".");
  return labels.slice(0, -1).map((_, index) => labels.slice(index).join("."));
}

/**
 * At a dispatch claim: whether an email sent for `subaccountId` goes through the sub-account's own
 * tenant, i.e. its From domain's most specific domain is the sub-account's and that tenant exists.
 * Otherwise (a domain the organization shares with its sub-accounts) it goes through the
 * organization's.
 */
export function subaccountTenantSql(input: {
  organizationId: string;
  subaccountId: string | null;
  from: string;
  provider: string;
}): SQL<boolean> | false {
  if (!input.subaccountId) return false;
  const address = parseEmailAddress(input.from).address.toLowerCase();
  const fromDomain = address.slice(address.lastIndexOf("@") + 1);
  const suffixes = domainSuffixes(fromDomain);
  if (suffixes.length === 0) return false;
  return sql<boolean>`coalesce((
    select ${domain.subaccountId} = ${input.subaccountId}
    from ${domain}
    where ${inArray(domain.name, suffixes)} and ${domain.status} <> 'failed'
    order by length(${domain.name}) desc
    limit 1
  ), false) and exists (
    select 1 from ${emailTenant}
    where ${emailTenant.organizationId} = ${input.organizationId}
      and ${emailTenant.subaccountId} = ${input.subaccountId}
      and ${emailTenant.provider} = ${input.provider}
      and ${emailTenant.stream} = 'transactional'
  )`;
}

/**
 * The most specific domain across organizations decides who owns a hostname, as it does for
 * senders: a tracking or receiving domain can't sit under another organization's (more specific)
 * domain.
 */
export async function assertOwnsHostname(
  parent: DomainRow,
  hostname: string,
  feature: "tracking" | "receiving" = "tracking",
): Promise<void> {
  const candidates = await db
    .select({ id: domain.id, name: domain.name })
    .from(domain)
    .where(and(inArray(domain.name, domainSuffixes(hostname)), ne(domain.status, "failed")));
  const match = candidates.sort((a, b) => b.name.length - a.name.length)[0];
  if (match && match.id !== parent.id) {
    throw new DomainError(
      feature === "tracking" ? "invalid_tracking_hostname" : "invalid_receiving_hostname",
      `${hostname} belongs to the domain ${match.name}; set its ${feature} domain up there instead.`,
    );
  }
}

/** The refusal of marketing email while the organization's marketing stream is paused. */
export function marketingPausedError(): EmailError {
  return new EmailError(
    "marketing_paused",
    "Marketing sending is paused for this organization because of its marketing bounce or " +
      "complaint rate. Transactional email still works. Contact support to resume.",
  );
}

/**
 * System-level: refuses a live send unless the From domain is covered by a domain of the
 * organization verified by the live provider, the reputation guard has not suspended the
 * organization, and its tenant is not paused. The most specific matching domain across all
 * organizations decides, because the provider signs with the most specific identity.
 */
export async function authorizeLiveSender(input: {
  organizationId: string;
  from: string;
  /** The live provider: only domains it verified count. */
  provider: string;
  /** Whose tenant must not be paused (default: transactional). */
  stream?: EmailStream;
  /**
   * The email sub-account the email is sent for: it may send from its own domains (through its
   * own tenant) and from the organization's domains shared with sub-accounts; nobody else may send
   * from its domains.
   */
  subaccountId?: string | null;
}): Promise<void> {
  // Checked first: a suspended organization is told so whatever it sends from.
  if (await isSuspended(input.organizationId)) {
    throw new EmailError(
      "account_suspended",
      "Live sending is suspended for this organization because of its sending reputation " +
        "(high bounce or complaint rates). Sandbox keys still work. Contact support to resume.",
    );
  }
  // A billing hold is not a suspension: paying (or the next period) lifts it.
  if (await isOnBillingHold(input.organizationId)) {
    throw new EmailError(
      "billing_hold",
      "Live sending is paused for this organization: an invoice is overdue or its spend limit " +
        "was reached. Sandbox keys still work. See the organization's billing settings.",
    );
  }
  const address = parseEmailAddress(input.from).address.toLowerCase();
  const fromDomain = address.slice(address.lastIndexOf("@") + 1);
  const candidates = await db
    .select({
      name: domain.name,
      organizationId: domain.organizationId,
      status: domain.status,
      canSend: domain.canSend,
      provider: domain.provider,
      mailFromDomain: domain.mailFromDomain,
      subaccountId: domain.subaccountId,
      sharedWithSubaccounts: domain.sharedWithSubaccounts,
    })
    .from(domain)
    .where(and(inArray(domain.name, domainSuffixes(fromDomain)), ne(domain.status, "failed")));
  const match = candidates.sort((a, b) => b.name.length - a.name.length)[0];
  const subaccountId = input.subaccountId ?? null;
  const usable =
    match &&
    match.organizationId === input.organizationId &&
    match.status === "verified" &&
    match.canSend &&
    match.provider === input.provider &&
    fromDomain !== match.mailFromDomain &&
    !fromDomain.endsWith(`.${match.mailFromDomain}`);
  if (!usable) {
    throw new EmailError(
      "domain_not_verified",
      `${fromDomain} is not a verified domain of this organization. Add and verify it under ` +
        "Domains in the dashboard, or use a sandbox key to test.",
    );
  }
  const [blockedDomain] = await db
    .select({ domain: schema.emailSenderDomainBlock.domain })
    .from(schema.emailSenderDomainBlock)
    .where(inArray(schema.emailSenderDomainBlock.domain, domainSuffixes(fromDomain)))
    .limit(1);
  if (blockedDomain) {
    throw new EmailError(
      "sending_paused",
      "Live sending from this domain is restricted because of its sending history. " +
        "Contact support to resume.",
    );
  }
  // A sub-account's domain is its own; the organization's domains are for sub-accounts only when
  // shared with them.
  if (match.subaccountId !== null && match.subaccountId !== subaccountId) {
    throw new EmailError(
      "domain_not_verified",
      subaccountId
        ? `${fromDomain} belongs to another sub-account.`
        : `${fromDomain} belongs to a sub-account: send for it (\`subaccount\`).`,
    );
  }
  if (match.subaccountId === null && subaccountId && !match.sharedWithSubaccounts) {
    throw new EmailError(
      "domain_not_verified",
      `${fromDomain} isn't shared with sub-accounts. Add it to the sub-account, or share it ` +
        "(PATCH /v1/domains/{id} with `shared_with_subaccounts`).",
    );
  }
  const stream = input.stream ?? "transactional";
  // The marketing stream's own pause (its bounce or complaint rate); transactional mail goes on.
  if (stream === "marketing" && (await isMarketingPaused(input.organizationId))) {
    throw marketingPausedError();
  }
  // The tenant it goes out through: the sub-account's own for its domains.
  const tenant = await getEmailTenant(input.organizationId, stream, match.subaccountId);
  if (tenant?.sendingStatus === "disabled" && match.subaccountId) {
    throw new EmailError(
      "sending_paused",
      "The provider paused sending for this sub-account because of its sending reputation. " +
        "Sending resumes once it lifts the pause.",
    );
  }
  if (tenant?.sendingStatus === "disabled") {
    throw new EmailError(
      "sending_paused",
      stream === "transactional"
        ? "Sending is paused for this organization because of its sending reputation. " +
            "Contact support."
        : `${stream[0]?.toUpperCase()}${stream.slice(1)} sending is paused for this ` +
            "organization because of its sending reputation. Contact support.",
    );
  }
}

/**
 * System-level (worker): records a tenant's sending status reported by the provider (SES pauses
 * tenants with poor reputation). Only tenants named with `tenantPrefix` (this deployment) are
 * touched, and an older report never overwrites a newer one. Returns whether a tenant changed.
 */
export async function applyTenantStatus(
  input: {
    tenantName: string;
    status: EmailTenantRow["sendingStatus"];
    cause: string | null;
    occurredAt: Date;
  },
  tenantPrefix: string,
): Promise<boolean> {
  if (!input.tenantName.startsWith(`${tenantPrefix}-`)) return false;
  const [updated] = await db
    .update(emailTenant)
    .set({
      sendingStatus: input.status,
      statusCause: input.cause,
      statusUpdatedAt: input.occurredAt,
    })
    .where(
      and(
        eq(emailTenant.tenantName, input.tenantName),
        or(isNull(emailTenant.statusUpdatedAt), lt(emailTenant.statusUpdatedAt, input.occurredAt)),
      ),
    )
    .returning({ organizationId: emailTenant.organizationId });
  return Boolean(updated);
}
