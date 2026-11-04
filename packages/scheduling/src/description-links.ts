/**
 * What in an event type's description is a link. The API checks these exact tokens and the booking
 * page renders them, so what's checked and what's clickable can't differ. No imports: client-safe.
 */
const SCHEME_LINK = /[a-z][a-z0-9+.-]*:\/\/[^\s<>"']*/giu;
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

export type DescriptionPart =
  | { kind: "text"; text: string }
  /** `href` is what was checked: open this, and show `text`. */
  | { kind: "link"; text: string; href: string };

/**
 * A link's address as a browser would resolve it, or null if it isn't one we'd ever render. Nothing
 * here is normalized first, because that would be checking a different string from the one a browser
 * gets. The host has to be plain ASCII and there can't be a `user@`, so nothing can look like one
 * place and go to another.
 */
export function parseLink(link: string): URL | null {
  if (!link.toLowerCase().startsWith("https://")) return null;
  const authority = link.slice("https://".length).split(/[/?#\\]/, 1)[0] ?? "";
  if (!/^[\x21-\x7e]+$/.test(authority) || authority.includes("@")) return null;
  try {
    const url = new URL(link);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

/** The text, split into links and what's around them, in order. */
export function descriptionParts(text: string): DescriptionPart[] {
  const parts: DescriptionPart[] = [];
  let at = 0;
  for (const match of text.matchAll(SCHEME_LINK)) {
    const whole = match[0];
    const link = whole.replace(TRAILING_PUNCTUATION, "");
    const url = parseLink(link);
    if (!url) continue;
    const start = match.index;
    if (start > at) parts.push({ kind: "text", text: text.slice(at, start) });
    parts.push({ kind: "link", text: link, href: url.href });
    at = start + link.length;
  }
  if (at < text.length) parts.push({ kind: "text", text: text.slice(at) });
  return parts;
}

/** Everything shaped like a scheme and an address, as the page's tokenizer would see it. */
export function schemeLinks(text: string): string[] {
  return [...text.matchAll(SCHEME_LINK)].map((match) => match[0].replace(TRAILING_PUNCTUATION, ""));
}
