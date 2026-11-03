/**
 * DMARC policy records (`_dmarc.<domain>` TXT, RFC 9989): parsing what a domain publishes,
 * coss.com's report address, and the record to publish next on the way from `p=none` to `p=reject`.
 * Pure: no database, no DNS.
 */

export const DMARC_POLICIES = ["none", "quarantine", "reject"] as const;
export type DmarcPolicy = (typeof DMARC_POLICIES)[number];

/** The local part prefix of report addresses: `dmarc-<token>@<managed inbound domain>`. */
const REPORT_LOCAL_PREFIX = "dmarc-";
const TOKEN = /^[a-z2-9]{16}$/;

/** What a published DMARC record says (tags coss.com reads; others are kept in `tags`). */
export type DmarcRecord = {
  p: DmarcPolicy | null;
  sp: DmarcPolicy | null;
  np: DmarcPolicy | null;
  adkim: "r" | "s" | null;
  aspf: "r" | "s" | null;
  /** Removed by RFC 9989, still honored by many receivers: below 100 enforces partially. */
  pct: number | null;
  /** RFC 9989's testing flag (`t=y`: receivers apply one policy level less). */
  t: "y" | "n" | null;
  /** Aggregate report URIs, as published (`mailto:…`, size suffixes kept). */
  rua: string[];
  /** Every tag in publishing order, lower-cased names, raw values. */
  tags: [string, string][];
};

/** A domain's report address, or `null` while receiving is off (no managed inbound domain). */
export function dmarcReportAddress(token: string, managedDomain: string | null): string | null {
  return managedDomain ? `${REPORT_LOCAL_PREFIX}${token}@${managedDomain.toLowerCase()}` : null;
}

/** The token of a report address (`dmarc-<token>@<managedDomain>`), else `null`. */
export function dmarcReportTokenOf(address: string, managedDomain: string): string | null {
  const at = address.lastIndexOf("@");
  if (at < 0 || address.slice(at + 1).toLowerCase() !== managedDomain.toLowerCase()) return null;
  const local = address.slice(0, at).toLowerCase();
  if (!local.startsWith(REPORT_LOCAL_PREFIX)) return null;
  const token = local.slice(REPORT_LOCAL_PREFIX.length);
  return TOKEN.test(token) ? token : null;
}

function policyOf(value: string | undefined): DmarcPolicy | null {
  const lower = value?.trim().toLowerCase();
  return DMARC_POLICIES.find((policy) => policy === lower) ?? null;
}

function alignmentOf(value: string | undefined): "r" | "s" | null {
  const lower = value?.trim().toLowerCase();
  return lower === "r" || lower === "s" ? lower : null;
}

/**
 * Parses a `v=DMARC1` record; `null` when it isn't one, or isn't a valid tag list (a tag listed
 * twice, or a part that isn't `tag=value`, as the BIMI check rules too): receivers may ignore such
 * a record, so coss.com never reads a policy from it. Unknown tags are kept, never rejected.
 */
export function parseDmarcRecord(value: string): DmarcRecord | null {
  const parts = value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const firstEq = parts[0]?.indexOf("=") ?? -1;
  if (firstEq < 0 || parts[0]?.slice(0, firstEq).trim().toLowerCase() !== "v") return null;
  if (
    parts[0]
      ?.slice(firstEq + 1)
      .trim()
      .toUpperCase() !== "DMARC1"
  )
    return null;
  const tags: [string, string][] = [];
  for (const part of parts.slice(1)) {
    const eq = part.indexOf("=");
    const name = eq < 0 ? "" : part.slice(0, eq).trim().toLowerCase();
    if (!name || name === "v" || tags.some(([key]) => key === name)) return null;
    tags.push([name, part.slice(eq + 1).trim()]);
  }
  const tag = (name: string) => tags.find(([key]) => key === name)?.[1];
  const pct = tag("pct");
  const pctValue = pct !== undefined && /^\d{1,3}$/.test(pct) ? Number(pct) : null;
  const t = tag("t")?.toLowerCase();
  return {
    p: policyOf(tag("p")),
    sp: policyOf(tag("sp")),
    np: policyOf(tag("np")),
    adkim: alignmentOf(tag("adkim")),
    aspf: alignmentOf(tag("aspf")),
    pct: pctValue !== null && pctValue <= 100 ? pctValue : null,
    t: t === "y" || t === "n" ? t : null,
    rua: (tag("rua") ?? "")
      .split(",")
      .map((uri) => uri.trim())
      .filter(Boolean),
    tags,
  };
}

/** The policy receivers apply to the domain (a missing or invalid `p` counts as `none`). */
export function effectivePolicy(record: DmarcRecord | null): DmarcPolicy | null {
  return record ? (record.p ?? "none") : null;
}

/**
 * What an organizational domain's record applies to a subdomain without a record of its own
 * (RFC 7489 §6.6.3): its `sp`, else its `p`; partial enforcement carries over.
 */
export function asSubdomainPolicy(record: DmarcRecord): DmarcRecord {
  return { ...record, p: record.sp ?? record.p };
}

/**
 * The record whose policy applies to a domain, as stored by its last DNS check: its own, else
 * (no record of its own) its organizational domain's as a subdomain sees it. `null`: none, or an
 * invalid record of its own (receivers may ignore it, so coss.com assumes no policy).
 */
export function appliedDmarcRecord(row: {
  dmarcRecord: string | null;
  dmarcInheritedRecord: string | null;
}): DmarcRecord | null {
  if (row.dmarcRecord !== null) return parseDmarcRecord(row.dmarcRecord);
  const inherited = row.dmarcInheritedRecord ? parseDmarcRecord(row.dmarcInheritedRecord) : null;
  return inherited ? asSubdomainPolicy(inherited) : null;
}

/** Whether the record enforces only partly (`pct` below 100, or RFC 9989's `t=y`). */
export function partiallyEnforced(record: DmarcRecord): boolean {
  return (record.pct !== null && record.pct < 100) || record.t === "y";
}

/**
 * A key that changes whenever what receivers do changes: the policy, and whether it applies only
 * partly. `none-published` when there is no record.
 */
export function dmarcPolicyKey(record: DmarcRecord | null): string {
  const policy = effectivePolicy(record);
  if (!record || !policy) return "none-published";
  return partiallyEnforced(record) ? `${policy}:partial` : policy;
}

/** Whether one of the record's `rua` URIs is the address (a `!size` suffix is allowed). */
export function ruaIncludes(record: DmarcRecord, address: string): boolean {
  const wanted = address.toLowerCase();
  return record.rua.some((uri) => {
    const match = uri.match(/^mailto:([^!]+)/i);
    return match?.[1]?.trim().toLowerCase() === wanted;
  });
}

/** The policy one step stricter on the path none → quarantine → reject. */
export function nextPolicy(policy: DmarcPolicy): DmarcPolicy | null {
  if (policy === "none") return "quarantine";
  if (policy === "quarantine") return "reject";
  return null;
}

/**
 * The record to publish for `policy`: the current one with `p` changed, `pct` and `t` dropped (a
 * step applies in full) and coss.com's address added to `rua`; everything else the customer published
 * (other report addresses, `sp`, alignment, failure reporting) is kept. Without a current record,
 * a minimal one.
 */
export function withPolicy(
  current: DmarcRecord | null,
  policy: DmarcPolicy,
  reportAddress: string | null,
): string {
  const rua = [...(current?.rua ?? [])];
  if (reportAddress && !(current && ruaIncludes(current, reportAddress))) {
    rua.push(`mailto:${reportAddress}`);
  }
  const tags: [string, string][] = [["p", policy]];
  for (const [name, value] of current?.tags ?? []) {
    if (name === "p" || name === "pct" || name === "t" || name === "rua") continue;
    tags.push([name, value]);
  }
  if (rua.length > 0) tags.push(["rua", rua.join(",")]);
  return withTags(tags);
}

/**
 * The current record with coss.com's address added to `rua` and nothing else changed: partial
 * enforcement (`pct`, `t`) stays, since dropping it is a step of its own that needs reports first.
 */
export function withReporting(current: DmarcRecord, reportAddress: string): string {
  if (ruaIncludes(current, reportAddress)) return withTags(current.tags);
  const rua = [...current.rua, `mailto:${reportAddress}`].join(",");
  const tags = current.tags.filter(([name]) => name !== "rua");
  return withTags([...tags, ["rua", rua]]);
}

function withTags(tags: readonly (readonly [string, string])[]): string {
  return ["v=DMARC1", ...tags.map(([name, value]) => `${name}=${value}`)].join("; ").concat(";");
}

/** The record coss.com recommends to a domain that publishes none: monitoring, reports to coss.com. */
export function recommendedDmarc(reportAddress: string | null): string {
  return withPolicy(null, "none", reportAddress);
}
