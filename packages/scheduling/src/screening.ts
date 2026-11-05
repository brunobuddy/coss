/**
 * Booking emails skip per-email screening, which would send patients' names to the AI Gateway, so
 * what a customer can put in them is checked when it's set up: an abuser can't put phishing in an
 * event title and mail it to anyone. Live environments only; injected, like Forms' hosted pages.
 */
import { isHipaaMode } from "@coss/compliance";
import { outsideSchemeLinks, parseLink, schemeLinks } from "./description-links.ts";
import { SchedulingError } from "./errors.ts";
import { URL_LIKE } from "./reminder-copy.ts";

export type SetupScreening = (input: { organizationId: string; text: string }) => Promise<boolean>;

/** Text that lands in emails can't carry a link: the only link in them is the manage link. */
export function refuseLinks(value: string | null | undefined, param: string): void {
  if (value && URL_LIKE.test(value)) {
    throw new SchedulingError("content_refused", "This text can't contain a link.", { param });
  }
}

const BARE_HOST =
  /(?<![\p{L}\p{N}-])(?:[\p{L}\p{N}-]+\.)+(?:xn--[a-z0-9-]+|\p{L}{2,})(?![\p{L}\p{N}-])(?:\/[^\s<>"']*)?/giu;
// What a browser's address bar would drop or read as a dot, so a reader can follow it anyway:
// format characters, combining marks that IDNA ignores, and tabs. Line breaks stay, or the end of
// one sentence and the start of the next would read as a domain.
const INVISIBLE = /[\p{Cf}\p{Mn}\p{Me}\t]/gu;
const OTHER_DOTS = /[\u3002\uff0e\uff61]/g;

function hostOf(url: URL): string {
  return url.hostname.replace(/\.$/, "").toLowerCase();
}

/**
 * Every host a description links to. Null when a link can't be allowed: not `https`, or it could go
 * somewhere other than it appears to. Links are read exactly as the page would render them. What's
 * left is then normalized as a reader's browser would, since anything shaped like a domain can be
 * copied and followed, even with an invisible character in it.
 */
export function linkedHosts(text: string): string[] | null {
  const hosts = new Set<string>();
  const links = schemeLinks(text);
  for (const link of links) {
    const url = parseLink(link);
    if (!url) return null;
    hosts.add(hostOf(url));
  }
  const readable = outsideSchemeLinks(text)
    .normalize("NFKC")
    .replace(INVISIBLE, "")
    .replace(OTHER_DOTS, ".");
  for (const [bare] of readable.matchAll(BARE_HOST)) {
    try {
      hosts.add(hostOf(new URL(`https://${bare}`)));
    } catch {
      return null;
    }
  }
  return [...hosts];
}

export function isWithinDomains(host: string, domains: readonly string[]): boolean {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

type Place = { type: string; address?: string | null; url?: string | null };

/** What a location adds to attendees' emails. A phone number has no room to say anything. */
export function locationText(location: Place): string | null {
  return location.address ?? location.url ?? null;
}

/** An address can't hold a link. A meeting link is one, so only screening judges it. */
export function refuseLinksInAddresses(locations: readonly Place[] | undefined): void {
  for (const location of locations ?? []) refuseLinks(location.address, "locations");
}

export async function screenSetup(
  env: { organizationId: string; mode: "live" | "sandbox" },
  text: string,
  screen: SetupScreening | undefined,
  param: string,
): Promise<void> {
  if (env.mode !== "live" || !screen || !text.trim()) return;
  if (await isHipaaMode(env.organizationId)) return;
  for (const batch of screeningBatches(text)) {
    if (!(await screen({ organizationId: env.organizationId, text: batch }))) {
      throw new SchedulingError(
        "content_refused",
        "This text looks like phishing or spam, so it can't be used. Contact support if that's wrong.",
        { param },
      );
    }
  }
}

/**
 * The classifier reads this much and silently drops the rest, which would let anything past it
 * through unread (`MAX_TEXT_CHARS`, `@coss/screening/text`, which this package doesn't depend on).
 */
const MAX_SCREENED_CHARS = 8000;

/** Whole lines where they fit, so a value is read together, and everything read by someone. */
export function screeningBatches(text: string, max: number = MAX_SCREENED_CHARS): string[] {
  const batches: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    const joined = current ? `${current}\n${line}` : line;
    if (joined.length <= max) {
      current = joined;
      continue;
    }
    if (current) batches.push(current);
    let rest = line;
    while (rest.length > max) {
      batches.push(rest.slice(0, max));
      rest = rest.slice(max);
    }
    current = rest;
  }
  if (current) batches.push(current);
  return batches;
}
