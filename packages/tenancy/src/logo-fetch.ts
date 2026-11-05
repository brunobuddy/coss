import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { isIP } from "node:net";
import { isBlockedAddress } from "@coss/signals/ip";

/** Logos larger than this are refused (they are icons, shown at 32px). */
export const MAX_LOGO_BYTES = 256 * 1024;
const MAX_PAGE_BYTES = 512 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_REDIRECTS = 4;
const REQUEST_TIMEOUT_MS = 8_000;
/** At most this many candidate images are downloaded per site. */
const MAX_CANDIDATES = 6;
/** Smaller images are kept only when nothing better turns up. */
const GOOD_SIZE = 64;
const MIN_SIZE = 16;
const USER_AGENT = "coss.com logo fetcher (+https://coss.com/docs)";

export type LogoResponse = {
  status: number;
  /** The final URL, after redirects. */
  url: string;
  contentType: string;
  body: Buffer;
};

/** An HTTPS GET; `null` when the host can't be reached (DNS, TLS, timeout, refused address). */
export type LogoHttp = (
  url: URL,
  options: {
    maxBytes: number;
    accept: string;
    /** Keep the first `maxBytes` of a longer body (a page's `<head>`) instead of refusing it. */
    truncate?: boolean;
    signal?: AbortSignal;
  },
) => Promise<LogoResponse | null>;

export type LogoImageType = "png" | "jpeg" | "gif" | "webp" | "ico" | "svg";

export const LOGO_CONTENT_TYPES: Record<LogoImageType, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
};

export type FoundLogo = {
  sourceUrl: string;
  contentType: string;
  image: Buffer;
  sha256: string;
  /** `null` for vector images. */
  width: number | null;
  height: number | null;
};

type Candidate = { url: string; score: number };

/**
 * The best icon a site publishes for itself: its web manifest's icons, `apple-touch-icon`,
 * `<link rel="icon">` (SVG first), then `/apple-touch-icon.png` and `/favicon.ico`. Each image is
 * sniffed from its bytes, measured and size-checked; a small one is kept only when nothing larger
 * exists. `null` when the site has none (or can't be reached).
 */
export async function findLogo(
  domain: string,
  deps: { http: LogoHttp; signal?: AbortSignal },
): Promise<FoundLogo | null> {
  const origins = [`https://${domain}`];
  if (!domain.startsWith("www.")) origins.push(`https://www.${domain}`);
  const candidates: Candidate[] = [];
  let reached = false;
  for (const origin of origins) {
    const page = await deps.http(new URL(`${origin}/`), {
      maxBytes: MAX_PAGE_BYTES,
      accept: "text/html,application/xhtml+xml",
      truncate: true,
      signal: deps.signal,
    });
    if (!page) continue;
    reached = true;
    const base = new URL(page.url);
    if (page.status < 400 && /html/i.test(page.contentType)) {
      const links = parseIconLinks(page.body.toString("utf8"), base);
      candidates.push(...links.icons);
      if (links.manifest) candidates.push(...(await manifestIcons(links.manifest, deps)));
    }
    candidates.push(
      { url: new URL("/apple-touch-icon.png", base).href, score: 150 },
      { url: new URL("/favicon.ico", base).href, score: 10 },
    );
    break;
  }
  if (!reached) return null;

  let fallback: FoundLogo | null = null;
  for (const candidate of rankCandidates(candidates).slice(0, MAX_CANDIDATES)) {
    const logo = await downloadLogo(candidate.url, deps);
    if (!logo) continue;
    if (logo.width === null || Math.min(logo.width, logo.height ?? 0) >= GOOD_SIZE) return logo;
    if (!fallback || (logo.width ?? 0) > (fallback.width ?? 0)) fallback = logo;
  }
  return fallback;
}

/** Highest score first, each URL once. */
function rankCandidates(candidates: Candidate[]): Candidate[] {
  const best = new Map<string, number>();
  for (const { url, score } of candidates) best.set(url, Math.max(best.get(url) ?? 0, score));
  return [...best].map(([url, score]) => ({ url, score })).sort((a, b) => b.score - a.score);
}

/** The icons and the manifest a page links to, scored by how good a logo they usually make. */
export function parseIconLinks(
  html: string,
  base: URL,
): { icons: Candidate[]; manifest: URL | null } {
  const end = html.search(/<\/head>/i);
  const head = end >= 0 ? html.slice(0, end) : html;
  const icons: Candidate[] = [];
  let manifest: URL | null = null;
  for (const [tag] of head.matchAll(/<link\b[^>]*>/gi)) {
    const rel = attribute(tag, "rel")?.toLowerCase().split(/\s+/) ?? [];
    const href = attribute(tag, "href");
    if (!href) continue;
    const url = resolve(href, base);
    if (!url) continue;
    if (rel.includes("manifest")) {
      manifest ??= url;
      continue;
    }
    const touch = rel.some((value) => value.startsWith("apple-touch-icon"));
    if (!touch && !rel.includes("icon")) continue;
    const svg = attribute(tag, "type") === "image/svg+xml" || /\.svg(\?|#|$)/i.test(url.pathname);
    const size = largestSize(attribute(tag, "sizes"));
    icons.push({
      url: url.href,
      score: svg ? 1000 : touch ? Math.max(size, 180) : size || 32,
    });
  }
  return { icons, manifest };
}

async function manifestIcons(
  url: URL,
  deps: { http: LogoHttp; signal?: AbortSignal },
): Promise<Candidate[]> {
  const response = await deps.http(url, {
    maxBytes: MAX_MANIFEST_BYTES,
    accept: "application/manifest+json,application/json",
    signal: deps.signal,
  });
  if (!response || response.status >= 400) return [];
  let manifest: unknown;
  try {
    manifest = JSON.parse(response.body.toString("utf8"));
  } catch {
    return [];
  }
  const icons = (manifest as { icons?: unknown }).icons;
  if (!Array.isArray(icons)) return [];
  const base = new URL(response.url);
  const candidates: Candidate[] = [];
  for (const icon of icons) {
    if (!icon || typeof icon !== "object") continue;
    const { src, sizes, type, purpose } = icon as Record<string, unknown>;
    if (typeof src !== "string") continue;
    // Maskable icons are padded for a mask and monochrome ones are silhouettes.
    if (typeof purpose === "string" && !purpose.split(/\s+/).includes("any")) continue;
    const resolved = resolve(src, base);
    if (!resolved) continue;
    const svg = type === "image/svg+xml" || /\.svg(\?|#|$)/i.test(resolved.pathname);
    // A manifest icon is the app's own icon: worth a little more than a page icon of its size.
    const size = largestSize(typeof sizes === "string" ? sizes : null);
    candidates.push({ url: resolved.href, score: svg ? 900 : size + 1 });
  }
  return candidates;
}

async function downloadLogo(
  url: string,
  deps: { http: LogoHttp; signal?: AbortSignal },
): Promise<FoundLogo | null> {
  const response = await deps.http(new URL(url), {
    maxBytes: MAX_LOGO_BYTES,
    accept: "image/svg+xml,image/png,image/webp,image/*;q=0.8",
    signal: deps.signal,
  });
  if (!response || response.status >= 400 || response.body.length === 0) return null;
  const type = sniffImage(response.body);
  if (!type) return null;
  if (type === "svg" && !isPlainSvg(response.body.toString("utf8"))) return null;
  const size = type === "svg" ? null : imageSize(type, response.body);
  if (type !== "svg" && (!size || Math.min(size.width, size.height) < MIN_SIZE)) return null;
  return {
    sourceUrl: response.url,
    contentType: LOGO_CONTENT_TYPES[type],
    image: response.body,
    sha256: createHash("sha256").update(response.body).digest("hex"),
    width: size?.width ?? null,
    height: size?.height ?? null,
  };
}

/** The image format from its first bytes, never from the server's `Content-Type`. */
export function sniffImage(body: Buffer): LogoImageType | null {
  if (body.length >= 8 && body.readUInt32BE(0) === 0x89504e47) return "png";
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return "jpeg";
  if (body.length >= 6 && body.toString("latin1", 0, 4) === "GIF8") return "gif";
  if (body.length >= 12 && body.toString("latin1", 0, 4) === "RIFF") {
    if (body.toString("latin1", 8, 12) === "WEBP") return "webp";
  }
  if (body.length >= 6 && body.readUInt32LE(0) === 0x00010000 && body.readUInt16LE(4) > 0) {
    return "ico";
  }
  const text = body.toString("utf8", 0, Math.min(body.length, 1024)).trimStart();
  return startsWithSvg(text) ? "svg" : null;
}

/** No scripts, event handlers, foreign HTML or external references: an SVG that is only a drawing. */
function isPlainSvg(svg: string): boolean {
  return !/<script|<foreignObject|\son\w+\s*=|javascript:|<!entity/i.test(svg);
}

/** Width and height from the image's header (the largest entry of an `.ico`). */
export function imageSize(
  type: Exclude<LogoImageType, "svg">,
  body: Buffer,
): { width: number; height: number } | null {
  try {
    switch (type) {
      case "png":
        return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
      case "gif":
        return { width: body.readUInt16LE(6), height: body.readUInt16LE(8) };
      case "ico": {
        let best: { width: number; height: number } | null = null;
        const count = body.readUInt16LE(4);
        for (let i = 0; i < count; i++) {
          const entry = 6 + i * 16;
          const width = body[entry] || 256;
          const height = body[entry + 1] || 256;
          if (!best || width > best.width) best = { width, height };
        }
        return best;
      }
      case "webp": {
        const chunk = body.toString("latin1", 12, 16);
        if (chunk === "VP8X") {
          return { width: body.readUIntLE(24, 3) + 1, height: body.readUIntLE(27, 3) + 1 };
        }
        if (chunk === "VP8L") {
          const bits = body.readUInt32LE(21);
          return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
        }
        return { width: body.readUInt16LE(26) & 0x3fff, height: body.readUInt16LE(28) & 0x3fff };
      }
      case "jpeg": {
        let offset = 2;
        while (offset + 9 < body.length) {
          if (body[offset] !== 0xff) return null;
          const marker = body[offset + 1] ?? 0;
          const length = body.readUInt16BE(offset + 2);
          // SOF0-SOF15, except DHT (C4), JPG (C8) and DAC (CC).
          if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
            return { width: body.readUInt16BE(offset + 7), height: body.readUInt16BE(offset + 5) };
          }
          offset += 2 + length;
        }
        return null;
      }
    }
  } catch {
    return null;
  }
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value === undefined ? null : decodeEntities(value.trim());
}

/** An optional XML declaration, comments and doctype, then `<svg`. By hand: comments backtrack badly. */
function startsWithSvg(text: string): boolean {
  let rest = text;
  const after = (end: number, length = 1) => rest.slice(end + length).trimStart();
  if (/^<\?xml/i.test(rest)) {
    const end = rest.indexOf(">");
    if (end === -1) return false;
    rest = after(end);
  }
  while (rest.startsWith("<!--")) {
    const end = rest.indexOf("-->", 4);
    if (end === -1) return false;
    rest = after(end, 3);
  }
  if (/^<!doctype svg/i.test(rest)) {
    const end = rest.indexOf(">");
    if (end === -1) return false;
    rest = after(end);
  }
  return /^<svg[\s>]/i.test(rest);
}

/** `&amp;` goes last: `&amp;lt;` means the text `&lt;`, not `<`. */
function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function resolve(href: string, base: URL): URL | null {
  try {
    const url = new URL(href, base);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** The largest side in a `sizes` attribute (`"16x16 32x32"` → 32, `"any"` → 512). */
function largestSize(sizes: string | null): number {
  if (!sizes) return 0;
  let largest = 0;
  for (const size of sizes.toLowerCase().split(/\s+/)) {
    if (size === "any") largest = Math.max(largest, 512);
    const [width, height] = size.split("x").map(Number);
    if (width && height) largest = Math.max(largest, Math.min(width, height));
  }
  return largest;
}

/**
 * HTTPS only, to public addresses only (every DNS answer is checked, and the connection uses the
 * address that was checked), redirects followed by hand and checked again, bodies capped.
 */
export function publicLogoHttp(
  options: { lookup?: (host: string) => Promise<{ address: string; family: number }[]> } = {},
): LogoHttp {
  const resolveAll =
    options.lookup ?? ((host: string) => dnsLookup(host, { all: true, verbatim: true }));
  // The socket connects to the address that was checked, so DNS can't rebind in between.
  const lookup: LookupFunction = (host, lookupOptions, callback) => {
    resolveAll(host).then(
      (answers) => {
        const blocked = answers.find((answer) => isBlockedAddress(answer.address));
        // IPv4 first: a host without an IPv6 route would otherwise hang on the first answer.
        const ordered = [...answers].sort((a, b) => a.family - b.family);
        const first = ordered[0];
        if (!first || blocked) {
          callback(new Error(`Refused address for ${host}`), "", 0);
        } else if (lookupOptions.all) {
          (
            callback as unknown as (error: null, all: { address: string; family: number }[]) => void
          )(null, ordered);
        } else {
          callback(null, first.address, first.family);
        }
      },
      (error: Error) => callback(error as NodeJS.ErrnoException, "", 0),
    );
  };

  const once = (url: URL, opts: Parameters<LogoHttp>[1]) =>
    new Promise<{ status: number; location: string | null; contentType: string; body: Buffer }>(
      (resolvePromise, reject) => {
        const req = httpsRequest(
          url,
          {
            method: "GET",
            lookup,
            timeout: REQUEST_TIMEOUT_MS,
            signal: opts.signal,
            headers: { accept: opts.accept, "user-agent": USER_AGENT },
          },
          (res) => {
            const chunks: Buffer[] = [];
            let size = 0;
            const done = () =>
              resolvePromise({
                status: res.statusCode ?? 0,
                location: typeof res.headers.location === "string" ? res.headers.location : null,
                contentType: res.headers["content-type"] ?? "",
                body: Buffer.concat(chunks).subarray(0, opts.maxBytes),
              });
            res.on("data", (chunk: Buffer) => {
              size += chunk.length;
              chunks.push(chunk);
              if (size <= opts.maxBytes) return;
              if (opts.truncate) {
                done();
                req.destroy();
              } else {
                req.destroy(new Error("Response too large"));
              }
            });
            res.on("end", done);
            res.on("error", reject);
          },
        );
        req.on("timeout", () => req.destroy(new Error("Timed out")));
        req.on("error", reject);
        req.end();
      },
    );

  return async (start, opts) => {
    let url = start;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (url.protocol !== "https:" || (isIP(url.hostname) && isBlockedAddress(url.hostname))) {
        return null;
      }
      let response: Awaited<ReturnType<typeof once>>;
      try {
        response = await once(url, opts);
      } catch {
        return null;
      }
      if (response.status >= 300 && response.status < 400 && response.location) {
        try {
          url = new URL(response.location, url);
        } catch {
          return null;
        }
        continue;
      }
      return { ...response, url: url.href };
    }
    return null;
  };
}
