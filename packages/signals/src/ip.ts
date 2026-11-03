/**
 * IP address signals: special-use ("bogon") addresses, subnets, CIDR range sets and
 * `IpIntelligence` (Tor exits, cloud and hosting networks, ASN and country) built from the
 * datasets in `./datasets.ts`. Stateless; pure apart from `node:net`.
 */
import { isIP } from "node:net";
import { HOSTING_ASNS, type HostingKind } from "./hosting-asns.ts";

type V4Range = [network: number, prefix: number];

const BLOCKED_V4: V4Range[] = [
  [0x00000000, 8], // 0.0.0.0/8 "this network"
  [0x0a000000, 8], // 10.0.0.0/8 private
  [0x64400000, 10], // 100.64.0.0/10 carrier-grade NAT
  [0x7f000000, 8], // 127.0.0.0/8 loopback
  [0xa9fe0000, 16], // 169.254.0.0/16 link-local (cloud metadata)
  [0xac100000, 12], // 172.16.0.0/12 private
  [0xc0000000, 24], // 192.0.0.0/24 IETF protocol assignments
  [0xc0000200, 24], // 192.0.2.0/24 documentation
  [0xc0a80000, 16], // 192.168.0.0/16 private
  [0xc6120000, 15], // 198.18.0.0/15 benchmarking
  [0xc6336400, 24], // 198.51.100.0/24 documentation
  [0xcb007100, 24], // 203.0.113.0/24 documentation
  [0xe0000000, 4], // 224.0.0.0/4 multicast
  [0xf0000000, 4], // 240.0.0.0/4 reserved, broadcast
];

function v4ToInt(address: string): number {
  return address.split(".").reduce((value, octet) => value * 256 + Number(octet), 0);
}

function blockedV4(address: string): boolean {
  const value = v4ToInt(address);
  return BLOCKED_V4.some(([network, prefix]) => {
    const size = 2 ** (32 - prefix);
    return value >= network && value < network + size;
  });
}

/** The 8 hextets of an IPv6 address (handles `::` and an embedded IPv4 tail). */
function hextets(address: string): number[] {
  let text = address.toLowerCase().split("%")[0] ?? "";
  const v4Tail = text.slice(text.lastIndexOf(":") + 1);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4Tail)) {
    const value = v4ToInt(v4Tail);
    text = `${text.slice(0, -v4Tail.length)}${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const [head = "", tail] = text.split("::");
  const parse = (part: string) => (part ? part.split(":").map((h) => Number.parseInt(h, 16)) : []);
  const left = parse(head);
  const right = tail === undefined ? [] : parse(tail);
  const fill = tail === undefined ? [] : new Array(8 - left.length - right.length).fill(0);
  return [...left, ...fill, ...right];
}

function blockedV6(address: string): boolean {
  const h = hextets(address);
  const [a = 0, b = 0, , , , f = 0, g = 0, last = 0] = h;
  const embeddedV4 = `${g >>> 8}.${g & 0xff}.${last >>> 8}.${last & 0xff}`;
  if (h.slice(0, 7).every((x) => x === 0) && (last === 0 || last === 1)) return true; // :: and ::1
  if (h.slice(0, 5).every((x) => x === 0) && f === 0xffff) return blockedV4(embeddedV4); // mapped
  if (a === 0x64 && b === 0xff9b && h.slice(2, 6).every((x) => x === 0)) {
    return blockedV4(embeddedV4); // NAT64 64:ff9b::/96
  }
  if ((a & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((a & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((a & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (a === 0x2001 && b === 0x0db8) return true; // 2001:db8::/32 documentation
  if (a === 0x0100 && h.slice(1, 4).every((x) => x === 0)) return true; // 100::/64 discard
  return false;
}

/** True for loopback, private, link-local, multicast and other non-public addresses. */
export function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return blockedV4(address);
  if (version === 6) return blockedV6(address);
  return true;
}

export type IpVersion = 4 | 6;

/** An address as a number in its family's space (IPv4-mapped IPv6 addresses become IPv4). */
export type IpValue = { version: IpVersion; value: bigint };

/** Parses an IPv4 or IPv6 address; `null` for anything else. */
export function parseIp(address: string): IpValue | null {
  const text = address.trim();
  const version = isIP(text);
  if (version === 4) return { version: 4, value: BigInt(v4ToInt(text)) };
  if (version !== 6) return null;
  const h = hextets(text);
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) {
    return { version: 4, value: (BigInt(h[6] ?? 0) << 16n) | BigInt(h[7] ?? 0) };
  }
  return { version: 6, value: h.reduce((value, hextet) => (value << 16n) | BigInt(hextet), 0n) };
}

/** The canonical text of a parsed address (dotted quad, or RFC 5952 compressed IPv6). */
export function formatIp(ip: IpValue): string {
  if (ip.version === 4) {
    const v = Number(ip.value);
    return [v >>> 24, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff].join(".");
  }
  const parts = Array.from({ length: 8 }, (_, i) =>
    Number((ip.value >> BigInt((7 - i) * 16)) & 0xffffn),
  );
  // Compress the longest run of two or more zero hextets.
  let bestStart = -1;
  let bestLength = 0;
  for (let i = 0; i < 8; ) {
    if (parts[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && parts[j] === 0) j++;
    if (j - i > bestLength && j - i >= 2) {
      bestStart = i;
      bestLength = j - i;
    }
    i = j;
  }
  const hex = parts.map((part) => part.toString(16));
  if (bestStart < 0) return hex.join(":");
  return `${hex.slice(0, bestStart).join(":")}::${hex.slice(bestStart + bestLength).join(":")}`;
}

/** The canonical text of an address, or `null` when it isn't one. */
export function normalizeIp(address: string): string | null {
  const ip = parseIp(address);
  return ip ? formatIp(ip) : null;
}

const BITS: Record<IpVersion, number> = { 4: 32, 6: 128 };

export type IpNetwork = { version: IpVersion; start: bigint; end: bigint; prefix: number };

/** Parses `a.b.c.d/n` or `x::/n` (host bits are cleared) or a bare address (a single host). */
export function parseCidr(text: string): IpNetwork | null {
  const [address = "", prefixText, extra] = text.trim().split("/");
  if (extra !== undefined) return null;
  const ip = parseIp(address);
  if (!ip) return null;
  // A mapped IPv6 network (::ffff:1.2.3.0/120) is the IPv4 network /24.
  const mapped = ip.version === 4 && isIP(address.trim()) === 6;
  const bits = BITS[ip.version];
  let prefix = bits;
  if (prefixText !== undefined) {
    if (!/^\d{1,3}$/.test(prefixText)) return null;
    prefix = Number(prefixText) - (mapped ? 96 : 0);
    if (prefix < 0 || prefix > bits) return null;
  }
  const size = 1n << BigInt(bits - prefix);
  const start = (ip.value / size) * size;
  return { version: ip.version, start, end: start + size - 1n, prefix };
}

/** The canonical `network/prefix` text of a parsed network. */
export function formatCidr(network: IpNetwork): string {
  return `${formatIp({ version: network.version, value: network.start })}/${network.prefix}`;
}

/** The network an address shares with its neighbours: its IPv4 /24 or its IPv6 /64. */
export function subnetOf(address: string): string | null {
  const ip = parseIp(address);
  if (!ip) return null;
  const prefix = ip.version === 4 ? 24 : 64;
  const network = parseCidr(`${formatIp(ip)}/${prefix}`);
  return network ? formatCidr(network) : null;
}

type Range<L> = { start: bigint; end: bigint; label: L };

class FamilyRanges<L> {
  readonly #ranges: Range<L>[];
  /** `maxEnd[i]`: the largest `end` among ranges 0..i (ranges may nest or overlap). */
  readonly #maxEnd: bigint[];

  constructor(ranges: Range<L>[]) {
    this.#ranges = ranges.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    let max = -1n;
    this.#maxEnd = this.#ranges.map((range) => {
      if (range.end > max) max = range.end;
      return max;
    });
  }

  get size(): number {
    return this.#ranges.length;
  }

  /** The label of the most specific (latest-starting) range containing `value`. */
  lookup(value: bigint): L | null {
    let low = 0;
    let high = this.#ranges.length - 1;
    let index = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if ((this.#ranges[mid] as Range<L>).start <= value) {
        index = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    for (let i = index; i >= 0 && (this.#maxEnd[i] as bigint) >= value; i--) {
      const range = this.#ranges[i] as Range<L>;
      if (range.end >= value) return range.label;
    }
    return null;
  }
}

/** A searchable set of CIDR ranges, each with a label (binary search; nested ranges allowed). */
export class IpRangeSet<L> {
  readonly #families: Record<IpVersion, FamilyRanges<L>>;

  private constructor(v4: Range<L>[], v6: Range<L>[]) {
    this.#families = { 4: new FamilyRanges(v4), 6: new FamilyRanges(v6) };
  }

  /** Builds a set from `[cidr, label]` pairs; entries that don't parse are skipped. */
  static from<L>(entries: Iterable<readonly [cidr: string, label: L]>): IpRangeSet<L> {
    const v4: Range<L>[] = [];
    const v6: Range<L>[] = [];
    for (const [cidr, label] of entries) {
      const network = parseCidr(cidr);
      if (!network) continue;
      (network.version === 4 ? v4 : v6).push({ start: network.start, end: network.end, label });
    }
    return new IpRangeSet(v4, v6);
  }

  get size(): number {
    return this.#families[4].size + this.#families[6].size;
  }

  lookup(address: string | IpValue): L | null {
    const ip = typeof address === "string" ? parseIp(address) : address;
    return ip ? this.#families[ip.version].lookup(ip.value) : null;
  }

  has(address: string | IpValue): boolean {
    return this.lookup(address) !== null;
  }
}

export type AsnRecord = {
  asn: number;
  name: string | null;
  domain: string | null;
  /** ISO 3166-1 alpha-2, upper-case. */
  country: string | null;
};

export type AsnLookup = (address: string) => AsnRecord | null;

export type IpSignals = {
  /** The canonical form of the address. */
  address: string;
  version: IpVersion;
  /** Private, loopback, documentation or other special-use: never a real client. */
  bogon: boolean;
  tor: boolean;
  /** `aws`, `gcp`, `oracle`, `digitalocean`… when the address is in a provider's published ranges. */
  cloud_provider: string | null;
  /** A data-center network (cloud ranges or a known hosting ASN), rarely a person's connection. */
  hosting: boolean;
  /** The hosting network's name (`aws`, `hetzner`, `m247`…). */
  hosting_provider: string | null;
  /** `vpn`: a network mostly used by commercial VPN and proxy services. */
  hosting_kind: HostingKind | null;
  asn: number | null;
  as_name: string | null;
  country: string | null;
};

export type IpIntelligence = {
  lookup(address: string): IpSignals | null;
  /** Which datasets are loaded (empty ones count as missing). */
  readonly available: { tor: boolean; cloud: boolean; asn: boolean };
};

/** `IpIntelligence` over whichever datasets are available (each one is optional). */
export function createIpIntelligence(data: {
  tor?: IpRangeSet<true> | null;
  cloud?: IpRangeSet<string> | null;
  asn?: AsnLookup | null;
}): IpIntelligence {
  const tor = data.tor && data.tor.size > 0 ? data.tor : null;
  const cloud = data.cloud && data.cloud.size > 0 ? data.cloud : null;
  const asnLookup = data.asn ?? null;
  return {
    available: { tor: tor !== null, cloud: cloud !== null, asn: asnLookup !== null },
    lookup(input) {
      const ip = parseIp(input);
      if (!ip) return null;
      const address = formatIp(ip);
      const bogon = isBlockedAddress(address);
      const cloudProvider = bogon ? null : (cloud?.lookup(ip) ?? null);
      const asn = bogon ? null : asnLookup ? asnLookup(address) : null;
      const hostingAsn = asn ? HOSTING_ASNS.get(asn.asn) : undefined;
      const hostingProvider = cloudProvider ?? hostingAsn?.name ?? null;
      return {
        address,
        version: ip.version,
        bogon,
        tor: !bogon && (tor?.has(ip) ?? false),
        cloud_provider: cloudProvider,
        hosting: hostingProvider !== null,
        hosting_provider: hostingProvider,
        hosting_kind: cloudProvider ? "cloud" : (hostingAsn?.kind ?? null),
        asn: asn?.asn ?? null,
        as_name: asn?.name ?? null,
        country: asn?.country ?? null,
      };
    },
  };
}
