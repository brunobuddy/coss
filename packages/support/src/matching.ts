/**
 * Who an email might be from. A confirmed organization decides what customers see, so it needs a
 * sender proven by DMARC, a verified account (anyone can sign up with someone else's address) and
 * exactly one organization. Everything else is only a suggestion for the rep.
 */

import { PLANS, type PlanKey } from "@coss/billing/catalog";
import { db, schema } from "@coss/db";
import { domainAndParents, emailDomainOf, isFreeProvider } from "@coss/signals/email";
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";

const { domain, member, organization, supportTicket, user } = schema;

export type SupportPlan = { plan: PlanKey; allHours: boolean };
/** The plan in effect for an organization (`billingStateAt`, injected). */
export type SupportPlanFor = (organizationId: string, at: Date) => Promise<SupportPlan>;

export type SenderMatch = {
  requesterUserId: string | null;
  organizationId: string | null;
  organizationName: string | null;
  suggestedOrganizationId: string | null;
};

const NO_MATCH: SenderMatch = {
  requesterUserId: null,
  organizationId: null,
  organizationName: null,
  suggestedOrganizationId: null,
};

async function verifiedUserByEmail(address: string): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        eq(user.email, address),
        eq(user.emailVerified, true),
        or(isNull(user.banned), ne(user.banned, true)),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function membershipsOf(userId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: organization.id, name: organization.name })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt));
}

async function highestPlan(
  organizations: readonly { id: string }[],
  at: Date,
  planFor: SupportPlanFor,
): Promise<string | null> {
  let best: { id: string; rank: number } | null = null;
  for (const candidate of organizations) {
    const { plan } = await planFor(candidate.id, at);
    const rank = PLANS[plan].rank;
    if (!best || rank > best.rank) best = { id: candidate.id, rank };
  }
  return best?.id ?? null;
}

/** The organization holding the most specific verified domain of an address, if it's a business's. */
async function organizationByDomain(address: string): Promise<string | null> {
  const emailDomain = emailDomainOf(address);
  if (!emailDomain || isFreeProvider(emailDomain)) return null;
  const candidates = domainAndParents(emailDomain);
  const rows = await db
    .select({
      name: domain.name,
      status: domain.status,
      subaccountId: domain.subaccountId,
      organizationId: domain.organizationId,
    })
    .from(domain)
    .where(and(inArray(domain.name, candidates), ne(domain.status, "failed")));
  // A pending domain is a claim anyone can make, and a sub-account's belongs to a customer's user.
  const mostSpecific = [...rows].sort((a, b) => b.name.length - a.name.length)[0];
  return mostSpecific?.status === "verified" && mostSpecific.subaccountId === null
    ? mostSpecific.organizationId
    : null;
}

async function organizationOfPriorTicket(address: string): Promise<string | null> {
  const [row] = await db
    .select({ organizationId: supportTicket.organizationId })
    .from(supportTicket)
    .where(and(eq(supportTicket.requesterEmail, address), isNotNull(supportTicket.organizationId)))
    .orderBy(desc(supportTicket.createdAt))
    .limit(1);
  return row?.organizationId ?? null;
}

export async function matchSender(input: {
  address: string;
  authenticated: boolean;
  at: Date;
  planFor: SupportPlanFor;
}): Promise<SenderMatch> {
  const account = await verifiedUserByEmail(input.address);
  if (account) {
    const organizations = await membershipsOf(account.id);
    const only = organizations.length === 1 ? organizations[0] : undefined;
    if (input.authenticated && only) {
      return {
        requesterUserId: account.id,
        organizationId: only.id,
        organizationName: only.name,
        suggestedOrganizationId: null,
      };
    }
    if (organizations.length > 0) {
      return {
        // An unproven sender must not be tied to the account they claim to be.
        requesterUserId: input.authenticated ? account.id : null,
        organizationId: null,
        organizationName: null,
        suggestedOrganizationId: await highestPlan(organizations, input.at, input.planFor),
      };
    }
  }
  const suggested =
    (await organizationOfPriorTicket(input.address)) ?? (await organizationByDomain(input.address));
  return suggested ? { ...NO_MATCH, suggestedOrganizationId: suggested } : NO_MATCH;
}
