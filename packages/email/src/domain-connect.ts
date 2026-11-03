/**
 * Domain Connect (https://www.domainconnect.org, spec v2.2): one-click DNS setup. The customer's
 * DNS provider applies coss.com's published template (`domain-connect/coss.com.email.json`, also
 * submitted to github.com/Domain-Connect/Templates) after the customer confirms there. Only the
 * synchronous flow, always signed: the provider checks `sig` against the public key coss.com
 * publishes at `<key id>.<syncPubKeyDomain>`.
 *
 * Discovery reads the customer's `_domainconnect` TXT record and fetches the URL it names, so
 * every request goes through `publicHttpGetter` (public addresses only, pinned). It fails closed:
 * any doubt means no button, and the manual records stay the way to set up a domain.
 */
import { createPrivateKey, createPublicKey, type KeyObject, sign } from "node:crypto";
import https from "node:https";
import { isIP } from "node:net";
import type { DomainRecord } from "@coss/db/schema";
import { isBlockedAddress, publicAddressLookup, type SenderOptions } from "@coss/webhooks";
import { z } from "zod";
import template from "../domain-connect/coss.com.email.json" with { type: "json" };
import { organizationalDomain } from "./bimi.ts";
import { type DnsResolver, dmarcAbsentAt, lookup } from "./dns.ts";

/** The template as submitted upstream; its records are the contract with DNS providers. */
export const DOMAIN_CONNECT_TEMPLATE = template;

export const DOMAIN_CONNECT_GROUPS = ["dkim", "mail_from", "dmarc", "tracking"] as const;
export type DomainConnectGroup = (typeof DOMAIN_CONNECT_GROUPS)[number];

/** Easy DKIM's CNAME target zone, fixed in the template. */
const DKIM_ZONE = "dkim.amazonses.com";
/** The tracking CNAME target fixed in the template; any other target skips the tracking group. */
const TRACKING_TARGET = "track.cosslinks.com";

export type DomainConnectHttp = (url: string) => Promise<{ status: number; body: string }>;
export type DomainConnectDeps = { dns: DnsResolver; http: DomainConnectHttp };

/** A DNS provider that hosts the domain's zone and supports coss.com's template. */
export type DomainConnectProvider = {
  /** The zone (`domain` in the apply URL). */
  zone: string;
  /** The domain relative to the zone (`host`), `""` at the zone apex. */
  host: string;
  providerId: string;
  /** What to call it ("Connect with …"). */
  providerName: string;
  urlSyncUX: string;
};

export type DomainConnectSigner = { keyId: string; privateKey: KeyObject };

const MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_TIMEOUT_MS = 3000;
/** How far up from the domain discovery looks for its zone (zones are rarely deeper). */
const MAX_ZONE_CANDIDATES = 5;

/**
 * GETs over HTTPS for discovery: no redirects, a short timeout, a small body, and only public
 * addresses (the socket is pinned to the address that was checked, as for webhook deliveries).
 */
export function publicHttpGetter(
  opts: SenderOptions & { timeoutMs?: number } = {},
): DomainConnectHttp {
  const lookupPublic = publicAddressLookup(opts);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return (target) =>
    new Promise((resolve, reject) => {
      const url = new URL(target);
      if (url.protocol !== "https:") {
        reject(new Error(`${url.protocol} is not https:`));
        return;
      }
      const host = url.hostname.replace(/^\[|\]$/g, "");
      // IP literals skip `lookup`, so check them here.
      if (isIP(host) && isBlockedAddress(host) && !opts.allowPrivateNetworks) {
        reject(new Error(`${host} is not a public address.`));
        return;
      }
      const req = https.request(
        url,
        {
          method: "GET",
          headers: { accept: "application/json", "user-agent": "coss.com-DomainConnect/1.0" },
          lookup: lookupPublic,
          timeout: timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
              req.destroy(new Error(`Response larger than ${MAX_BODY_BYTES} bytes`));
              return;
            }
            chunks.push(chunk);
          });
          res.on("end", () =>
            resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
          );
          res.on("error", reject);
        },
      );
      const timer = setTimeout(
        () => req.destroy(new Error(`Timed out after ${timeoutMs} ms`)),
        timeoutMs,
      );
      req.on("timeout", () => req.destroy(new Error(`Timed out after ${timeoutMs} ms`)));
      req.on("error", reject);
      req.on("close", () => clearTimeout(timer));
      req.end();
    });
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const httpsUrl = z.string().max(2048).refine(isHttpsUrl);

const Settings = z.object({
  providerId: z.string().min(1).max(253),
  providerName: z.string().min(1).max(100),
  providerDisplayName: z.string().min(1).max(100).optional(),
  urlSyncUX: httpsUrl.optional(),
  urlAPI: httpsUrl,
});

/** `host[/path]` from a `_domainconnect` record (a leading `https://` is tolerated). */
const DISCOVERY_VALUE =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[\w.~-]+)*$/i;

function discoveryBase(value: string): string | null {
  const base = value
    .trim()
    .replace(/^https:\/\//i, "")
    .replace(/\/+$/, "");
  return base.length <= 512 && DISCOVERY_VALUE.test(base) ? base : null;
}

const trimSlash = (url: string) => url.replace(/\/+$/, "");

/** The names the domain's zone could be, most specific first, down to the organizational domain. */
export function zoneCandidates(name: string): string[] {
  const organizational = organizationalDomain(name);
  if (name !== organizational && !name.endsWith(`.${organizational}`)) return [name];
  const labels = name.split(".");
  const candidates: string[] = [];
  for (let i = 0; i < labels.length; i++) {
    const candidate = labels.slice(i).join(".");
    candidates.push(candidate);
    if (candidate === organizational) break;
  }
  return candidates.slice(-MAX_ZONE_CANDIDATES);
}

/**
 * Finds the DNS provider of the domain's zone, if it speaks Domain Connect's synchronous flow and
 * supports coss.com's template. Never throws: `null` on any failure.
 */
export async function discoverDomainConnect(
  name: string,
  deps: DomainConnectDeps,
): Promise<DomainConnectProvider | null> {
  try {
    for (const zone of zoneCandidates(name)) {
      const answers = await lookup(() => deps.dns.resolveTxt(`_domainconnect.${zone}`));
      if (answers === null) return null;
      const base = answers.map((chunks) => discoveryBase(chunks.join(""))).find(Boolean);
      if (!base) continue;
      const response = await deps.http(`https://${base}/v2/${zone}/settings`);
      // The provider doesn't host this name as a zone: try the parent.
      if (response.status === 404) continue;
      if (response.status < 200 || response.status >= 300) return null;
      const settings = Settings.safeParse(JSON.parse(response.body));
      if (!settings.success || !settings.data.urlSyncUX) return null;
      const supported = await deps.http(
        `${trimSlash(settings.data.urlAPI)}/v2/domainTemplates/providers/${template.providerId}/services/${template.serviceId}`,
      );
      if (supported.status < 200 || supported.status >= 300) return null;
      return {
        zone,
        host: zone === name ? "" : name.slice(0, -(zone.length + 1)),
        providerId: settings.data.providerId,
        providerName: settings.data.providerDisplayName ?? settings.data.providerName,
        urlSyncUX: trimSlash(settings.data.urlSyncUX),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export type DomainConnectDomain = {
  name: string;
  dkimTokens: string[];
  dkimHostedZone: string | null;
  region: string | null;
  dmarcInheritedRecord: string | null;
};

export type DomainConnectTracking = {
  hostname: string;
  status: string;
  record: { value: string; status: string };
};

/**
 * Whether a DMARC record may be added: only when the domain has none and inherits none. A
 * `p=none` record on a subdomain would override the organizational domain's enforced policy, and
 * the template's `Prefix` conflict mode would replace one at the name. The stored check can be
 * stale (a policy published since), so DNS is asked now; a failed lookup means no.
 */
async function dmarcAddable(
  domain: DomainConnectDomain,
  record: DomainRecord | undefined,
  dns: DnsResolver,
): Promise<boolean> {
  if (!record) return false;
  if (record.status === "verified" || record.status === "mismatch") return false;
  if (domain.dmarcInheritedRecord !== null) return false;
  const names = new Set([domain.name, organizationalDomain(domain.name)]);
  const absent = await Promise.all([...names].map((name) => dmarcAbsentAt(name, dns)));
  return absent.every((value) => value === true);
}

/**
 * The template groups that would add what the domain still lacks; `[]` when nothing is left or
 * the domain's records aren't the ones the template writes (other DKIM zones or token counts).
 */
export async function domainConnectGroups(
  input: {
    domain: DomainConnectDomain;
    records: DomainRecord[];
    tracking: DomainConnectTracking | null;
  },
  dns: DnsResolver,
): Promise<DomainConnectGroup[]> {
  const { domain, records, tracking } = input;
  if (domain.dkimTokens.length !== 3) return [];
  if ((domain.dkimHostedZone ?? DKIM_ZONE) !== DKIM_ZONE) return [];
  const pending = (purposes: DomainRecord["purpose"][]) =>
    records.some((record) => purposes.includes(record.purpose) && record.status !== "verified");
  const groups: DomainConnectGroup[] = [];
  if (pending(["dkim"])) groups.push("dkim");
  if (pending(["mail_from_mx", "mail_from_spf"])) groups.push("mail_from");
  const dmarc = records.find((record) => record.purpose === "dmarc");
  if (await dmarcAddable(domain, dmarc, dns)) groups.push("dmarc");
  if (
    tracking &&
    (tracking.status === "pending" || tracking.status === "temporary_failure") &&
    tracking.record.status !== "verified" &&
    tracking.record.value === TRACKING_TARGET &&
    tracking.hostname.endsWith(`.${domain.name}`)
  ) {
    groups.push("tracking");
  }
  return groups;
}

/** The template variables the groups need, from the records coss.com checks. */
export function domainConnectVariables(
  input: {
    domain: DomainConnectDomain;
    records: DomainRecord[];
    tracking: DomainConnectTracking | null;
  },
  groups: readonly DomainConnectGroup[],
): Record<string, string> {
  const { domain, records, tracking } = input;
  const variables: Record<string, string> = {};
  if (groups.includes("dkim")) {
    domain.dkimTokens.forEach((token, index) => {
      variables[`dkim${index + 1}`] = token;
    });
  }
  if (groups.includes("mail_from")) variables.region = domain.region ?? "us-east-1";
  const dmarc = records.find((record) => record.purpose === "dmarc");
  if (groups.includes("dmarc") && dmarc) variables.dmarc = dmarc.value;
  if (groups.includes("tracking") && tracking) {
    variables.tracking_host = tracking.hostname.slice(0, -(domain.name.length + 1));
  }
  return variables;
}

/**
 * The URL that sends the customer to their DNS provider to apply the groups. The signature covers
 * the query string as sent (everything but `sig` and `key`).
 */
export function domainConnectApplyUrl(
  input: {
    provider: DomainConnectProvider;
    groups: readonly DomainConnectGroup[];
    variables: Record<string, string>;
    redirectUri: string;
    state: string;
  },
  signer: DomainConnectSigner,
): string {
  const params = new URLSearchParams();
  params.set("domain", input.provider.zone);
  if (input.provider.host) params.set("host", input.provider.host);
  for (const [name, value] of Object.entries(input.variables)) params.set(name, value);
  params.set("groupId", input.groups.join(","));
  params.set("redirect_uri", input.redirectUri);
  params.set("state", input.state);
  const query = params.toString();
  const sig = sign("sha256", Buffer.from(query), signer.privateKey).toString("base64");
  return (
    `${input.provider.urlSyncUX}/v2/domainTemplates/providers/${template.providerId}` +
    `/services/${template.serviceId}/apply?${query}` +
    `&sig=${encodeURIComponent(sig)}&key=${encodeURIComponent(signer.keyId)}`
  );
}

/** The signing key from its PEM (`\n` escapes accepted, for one-line env values). */
export function parseDomainConnectKey(pem: string): KeyObject {
  const key = createPrivateKey(pem.replaceAll("\\n", "\n"));
  if (key.asymmetricKeyType !== "rsa") throw new Error("Domain Connect keys must be RSA keys.");
  return key;
}

const KEY_CHUNK = 200;

/** The TXT records publishing a key's public half: `p=<n>,a=RS256,d=<part of the SPKI DER>`. */
export function domainConnectPublicKeyRecords(key: KeyObject): string[] {
  const der = createPublicKey(key).export({ type: "spki", format: "der" }).toString("base64");
  const records: string[] = [];
  for (let i = 0; i < der.length; i += KEY_CHUNK) {
    records.push(`p=${records.length + 1},a=RS256,d=${der.slice(i, i + KEY_CHUNK)}`);
  }
  return records;
}
