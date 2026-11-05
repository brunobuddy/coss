/**
 * Organization logos: the worker finds each organization's logo on its own website (a verified
 * sending domain, else a member's work email domain) and keeps the image here, so the dashboard
 * serves it from its own origin. Imports only `@coss/db` and `@coss/signals` (the worker's rule).
 */
import { db, schema } from "@coss/db";
import {
  domainAndParents,
  emailDomainOf,
  isDisposableDomain,
  isFreeProvider,
  SPECIAL_USE_TLDS,
} from "@coss/signals/email";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { findLogo, type LogoHttp } from "./logo-fetch.ts";

export { findLogo, type LogoHttp, publicLogoHttp } from "./logo-fetch.ts";

const { domain, member, organization, organizationDeletion, organizationLogo, user } = schema;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A logo found is looked at again monthly (sites change their icons). */
export const LOGO_REFRESH_MS = 30 * DAY;
/** A site without a usable icon, or an organization with no domain yet. */
export const LOGO_RETRY_MS = 3 * DAY;
/** How long a claimed organization is left to one worker. */
const LOGO_LEASE_MS = 10 * 60_000;
/** At most this many domains are tried per organization and check. */
const MAX_DOMAINS = 4;
/** Role order: an owner's work address says the most about the organization. */
const ROLE_ORDER = sql`case ${member.role} when 'owner' then 0 when 'admin' then 1 else 2 end`;

export type OrganizationLogo = {
  contentType: string;
  image: Buffer;
  sha256: string;
};

/**
 * The websites that may hold an organization's logo, best first: its verified sending domains
 * (and their parents: `mail.acme.com` → `acme.com`), then its members' verified work addresses'
 * domains, owners first. Free mailbox providers, disposable domains and reserved names never.
 */
export async function logoDomainCandidates(organizationId: string): Promise<string[]> {
  const [domains, members] = await Promise.all([
    db
      .select({ name: domain.name })
      .from(domain)
      .where(and(eq(domain.organizationId, organizationId), eq(domain.canSend, true)))
      .orderBy(asc(domain.createdAt)),
    db
      .select({ email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, organizationId), eq(user.emailVerified, true)))
      .orderBy(ROLE_ORDER, asc(member.createdAt)),
  ]);
  const names = [
    ...domains.flatMap((row) => siteNames(row.name)),
    ...members.flatMap((row) => {
      const name = emailDomainOf(row.email);
      return name ? siteNames(name) : [];
    }),
  ];
  return [...new Set(names)]
    .filter((name) => !isFreeProvider(name) && !isDisposableDomain(name))
    .slice(0, MAX_DOMAINS);
}

/** A domain and its parents that could be a website (`co.uk`-style suffixes and TLDs excluded). */
function siteNames(name: string): string[] {
  const names = domainAndParents(name);
  const tld = name.split(".").at(-1) ?? "";
  if (SPECIAL_USE_TLDS.has(tld)) return [];
  return names.filter((candidate, index) => {
    const labels = candidate.split(".");
    // A two-label parent with a short first label (`co.uk`, `com.au`) is a public suffix.
    return index === 0 || labels.length > 2 || (labels[0]?.length ?? 0) > 3;
  });
}

/**
 * Finds logos for organizations that have none yet or are due a recheck, a few at a time. Each is
 * claimed first (a lease on `next_check_at`), so workers running side by side never fetch the same
 * site twice. Returns how many it looked at.
 */
export async function runDueOrganizationLogos(
  opts: { limit: number; now?: Date; signal?: AbortSignal; scope?: { organizationIds: string[] } },
  deps: { http: LogoHttp },
): Promise<number> {
  const now = opts.now ?? new Date();
  const due = await db
    .select({ id: organization.id })
    .from(organization)
    .leftJoin(organizationLogo, eq(organizationLogo.organizationId, organization.id))
    .leftJoin(organizationDeletion, eq(organizationDeletion.organizationId, organization.id))
    .where(
      and(
        isNull(organizationDeletion.id),
        or(isNull(organizationLogo.organizationId), lte(organizationLogo.nextCheckAt, now)),
        opts.scope ? inArray(organization.id, opts.scope.organizationIds) : undefined,
      ),
    )
    .orderBy(sql`${organizationLogo.nextCheckAt} asc nulls first`)
    .limit(opts.limit);

  let checked = 0;
  for (const { id } of due) {
    if (opts.signal?.aborted) break;
    if (!(await claim(id, now))) continue;
    checked++;
    await checkOrganizationLogo(id, now, deps, opts.signal);
  }
  return checked;
}

async function claim(organizationId: string, now: Date): Promise<boolean> {
  const lease = new Date(now.getTime() + LOGO_LEASE_MS);
  const claimed = await db
    .insert(organizationLogo)
    .values({ organizationId, status: "not_found", nextCheckAt: lease })
    .onConflictDoUpdate({
      target: organizationLogo.organizationId,
      set: { nextCheckAt: lease },
      setWhere: lte(organizationLogo.nextCheckAt, now),
    })
    .returning({ organizationId: organizationLogo.organizationId });
  return claimed.length > 0;
}

async function checkOrganizationLogo(
  organizationId: string,
  now: Date,
  deps: { http: LogoHttp },
  signal?: AbortSignal,
): Promise<void> {
  try {
    for (const name of await logoDomainCandidates(organizationId)) {
      const logo = await findLogo(name, { http: deps.http, signal });
      if (!logo) continue;
      await db
        .update(organizationLogo)
        .set({
          status: "found",
          domain: name,
          sourceUrl: logo.sourceUrl,
          contentType: logo.contentType,
          image: logo.image,
          sha256: logo.sha256,
          width: logo.width,
          height: logo.height,
          failures: 0,
          checkedAt: now,
          nextCheckAt: new Date(now.getTime() + LOGO_REFRESH_MS),
        })
        .where(stillOurs(organizationId));
      return;
    }
    // Keep a logo found before: a site that is briefly down shouldn't take it away.
    await db
      .update(organizationLogo)
      .set({ checkedAt: now, nextCheckAt: new Date(now.getTime() + LOGO_RETRY_MS) })
      .where(stillOurs(organizationId));
  } catch (error) {
    console.error(`[logos] Checking ${organizationId}'s logo failed:`, error);
    await db
      .update(organizationLogo)
      .set({
        failures: sql`${organizationLogo.failures} + 1`,
        nextCheckAt: sql`${now}::timestamptz + least(${HOUR} * power(2, ${organizationLogo.failures}), ${LOGO_RETRY_MS}) * interval '1 millisecond'`,
      })
      .where(stillOurs(organizationId));
  }
}

/** Not hidden in the meantime (hiding clears `next_check_at`). */
function stillOurs(organizationId: string) {
  return and(
    eq(organizationLogo.organizationId, organizationId),
    sql`${organizationLogo.nextCheckAt} is not null`,
  );
}

/** The organization's logo, when one was found and it isn't hidden. */
export async function getOrganizationLogo(
  organizationId: string,
): Promise<OrganizationLogo | null> {
  const [row] = await db
    .select({
      contentType: organizationLogo.contentType,
      image: organizationLogo.image,
      sha256: organizationLogo.sha256,
    })
    .from(organizationLogo)
    .where(
      and(
        eq(organizationLogo.organizationId, organizationId),
        eq(organizationLogo.status, "found"),
      ),
    );
  if (!row?.contentType || !row.image || !row.sha256) return null;
  return { contentType: row.contentType, image: row.image, sha256: row.sha256 };
}

/** Each organization's logo version (a hash prefix, for cache-busting URLs), when it has one. */
export async function organizationLogoVersions(
  organizationIds: string[],
): Promise<Map<string, string>> {
  if (organizationIds.length === 0) return new Map();
  const rows = await db
    .select({ id: organizationLogo.organizationId, sha256: organizationLogo.sha256 })
    .from(organizationLogo)
    .where(
      and(
        inArray(organizationLogo.organizationId, organizationIds),
        eq(organizationLogo.status, "found"),
      ),
    );
  return new Map(rows.flatMap((row) => (row.sha256 ? [[row.id, row.sha256.slice(0, 12)]] : [])));
}

export type OrganizationLogoState = {
  status: "found" | "not_found" | "hidden" | "pending";
  domain: string | null;
  sourceUrl: string | null;
  checkedAt: Date | null;
};

/** What the settings page says about the logo. */
export async function getOrganizationLogoState(
  organizationId: string,
): Promise<OrganizationLogoState> {
  const [row] = await db
    .select({
      status: organizationLogo.status,
      domain: organizationLogo.domain,
      sourceUrl: organizationLogo.sourceUrl,
      checkedAt: organizationLogo.checkedAt,
    })
    .from(organizationLogo)
    .where(eq(organizationLogo.organizationId, organizationId));
  if (!row || (!row.checkedAt && row.status !== "hidden")) {
    return { status: "pending", domain: null, sourceUrl: null, checkedAt: null };
  }
  return row;
}

/** Looks for the logo again at the worker's next run (and shows it again when it was hidden). */
export async function refreshOrganizationLogo(organizationId: string, now = new Date()) {
  await db
    .insert(organizationLogo)
    .values({ organizationId, status: "not_found", nextCheckAt: now })
    .onConflictDoUpdate({
      target: organizationLogo.organizationId,
      set: {
        nextCheckAt: now,
        failures: 0,
        status: sql`case when ${organizationLogo.status} = 'hidden' then 'not_found'::organization_logo_status else ${organizationLogo.status} end`,
      },
    });
}

/** Drops the logo and stops looking: the dashboard shows the organization's initials. */
export async function hideOrganizationLogo(organizationId: string) {
  const hidden = {
    status: "hidden" as const,
    image: null,
    contentType: null,
    sha256: null,
    width: null,
    height: null,
    sourceUrl: null,
    domain: null,
    nextCheckAt: null,
  };
  await db
    .insert(organizationLogo)
    .values({ organizationId, ...hidden })
    .onConflictDoUpdate({ target: organizationLogo.organizationId, set: hidden });
}
