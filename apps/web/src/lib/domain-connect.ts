import "server-only";
import { orgLinkHref } from "@coss/dashboard-routes";
import {
  type DomainRow,
  domainRecords,
  publicDnsResolver,
  type TrackingDomainRow,
} from "@coss/email";
import {
  type DomainConnectGroup,
  type DomainConnectProvider,
  type DomainConnectSigner,
  discoverDomainConnect,
  domainConnectApplyUrl,
  domainConnectGroups,
  domainConnectVariables,
  parseDomainConnectKey,
  publicHttpGetter,
} from "@coss/email/domain-connect";
import { env } from "@/env";
import { emailRuntime } from "./email-runtime";

/**
 * Domain Connect from the domain page (`@coss/email/domain-connect`): on only with
 * `DOMAIN_CONNECT_PRIVATE_KEY` + `DOMAIN_CONNECT_KEY_ID`, and only for domains whose DNS provider
 * supports coss.com's template.
 */

const globalForDomainConnect = globalThis as unknown as {
  __cossDomainConnectSigner?: DomainConnectSigner | null;
  __cossDomainConnectCache?: Map<
    string,
    { at: number; provider: Promise<DomainConnectProvider | null> }
  >;
};

function signer(): DomainConnectSigner | null {
  if (globalForDomainConnect.__cossDomainConnectSigner === undefined) {
    const pem = env.DOMAIN_CONNECT_PRIVATE_KEY;
    const keyId = env.DOMAIN_CONNECT_KEY_ID;
    globalForDomainConnect.__cossDomainConnectSigner =
      pem && keyId ? { keyId, privateKey: parseDomainConnectKey(pem) } : null;
  }
  return globalForDomainConnect.__cossDomainConnectSigner;
}

const dns = publicDnsResolver();
const http = publicHttpGetter();

/** Discovery is a DNS lookup and two HTTPS requests: remember answers (also "none") a while. */
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 1000;

function discover(name: string): Promise<DomainConnectProvider | null> {
  globalForDomainConnect.__cossDomainConnectCache ??= new Map();
  const cache = globalForDomainConnect.__cossDomainConnectCache;
  const cached = cache.get(name);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.provider;
  cache.delete(name);
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  const provider = discoverDomainConnect(name, { dns, http });
  cache.set(name, { at: Date.now(), provider });
  return provider;
}

export type DomainConnectPlan = {
  provider: DomainConnectProvider;
  groups: DomainConnectGroup[];
  variables: Record<string, string>;
};

/** What one click at the domain's DNS provider would add, or `null` (no button). */
export async function domainConnectPlan(
  domain: DomainRow,
  tracking: TrackingDomainRow | null,
): Promise<DomainConnectPlan | null> {
  if (!signer()) return null;
  // Failed domains get new DKIM tokens on restart; deleting ones are going away.
  if (domain.status === "failed" || domain.status === "deleting") return null;
  const records = domainRecords(domain, emailRuntime().domainDeps.dmarcReportDomain ?? null);
  const input = { domain, records, tracking };
  const groups = await domainConnectGroups(input, dns);
  if (groups.length === 0) return null;
  const provider = await discover(domain.name);
  if (!provider) return null;
  return { provider, groups, variables: domainConnectVariables(input, groups) };
}

/** The signed link to the DNS provider; it sends the customer back to the domain page. */
export function domainConnectUrl(
  plan: DomainConnectPlan,
  target: { orgSlug: string; domainId: string },
): string {
  const key = signer();
  if (!key) throw new Error("Domain Connect is not configured.");
  const redirectUri = new URL(
    orgLinkHref(target.orgSlug, `/email/domains/${target.domainId}?dns_connect=done`),
    env.BETTER_AUTH_URL,
  );
  return domainConnectApplyUrl(
    { ...plan, redirectUri: redirectUri.href, state: target.domainId },
    key,
  );
}
