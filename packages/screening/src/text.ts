/** Shapes message text for a classifier: bounded size (cost, context limit) and tidy whitespace. */

/** About 2k tokens: plenty to judge a message, and caps the cost of one screening. */
export const MAX_TEXT_CHARS = 8000;
export const MAX_LINKS = 50;
export const MAX_LINK_CHARS = 500;
export const MAX_LINK_TOTAL_CHARS = 4000;

/** Collapses whitespace and truncates to `max` characters. */
export function prepareText(text: string, max: number = MAX_TEXT_CHARS): string {
  const collapsed = text
    // Common text-filter evasion: invisible separators between every letter of an invoice.
    .replace(/[\u00ad\u200b\u2060\ufeff]/g, "")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ ?\r?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
}

/** Distinct `http(s)` host/path targets, bounded by count, individual and total characters. */
export function prepareLinks(urls: Iterable<string>): string[] {
  const links = new Set<string>();
  let remaining = MAX_LINK_TOTAL_CHARS;
  for (const raw of urls) {
    if (links.size >= MAX_LINKS || remaining === 0) break;
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    // Query strings carry per-recipient tokens: noise for a classifier, and not ours to share.
    const target = `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
    const link =
      target.length > MAX_LINK_CHARS ? `${target.slice(0, MAX_LINK_CHARS - 1)}…` : target;
    if (links.has(link) || link.length > remaining) continue;
    links.add(link);
    remaining -= link.length;
  }
  return [...links];
}

/** Every `http(s)://…` URL in plain text (SMS bodies, text parts of emails). */
export function urlsInText(text: string): string[] {
  return text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
}
