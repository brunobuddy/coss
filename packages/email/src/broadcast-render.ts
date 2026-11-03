/**
 * Broadcast templates: `{{{contact.<key>}}}` and `{{{contact.<key>|fallback}}}` take a contact's
 * built-in fields (`email`, `first_name`, `last_name`) and custom properties. Rendering splices
 * values into the original string (it never re-serializes the customer's HTML): escaped in HTML,
 * raw in text, and without line breaks or control characters in the subject. The other
 * placeholders (`{{{unsubscribe_url}}}`, …) are left for the marketing footer at dispatch.
 */
import { escapeHtml } from "./marketing-footer.ts";

// The fallback's length is capped so a template full of unclosed placeholders stays linear.
const PLACEHOLDER = /\{\{\{\s*contact\.([a-z][a-z0-9_]{0,49})(?:\|([^}]{0,500})|\s*)\}\}\}/g;

/** The contact keys a template uses (what each email's variables snapshot keeps). */
export function templateKeys(...templates: (string | null | undefined)[]): string[] {
  const keys = new Set<string>();
  for (const template of templates) {
    for (const match of template?.matchAll(PLACEHOLDER) ?? []) {
      if (match[1]) keys.add(match[1]);
    }
  }
  return [...keys].sort();
}

/**
 * The longest one placeholder can render to: a custom string property's 2,000 characters, each
 * escaped to at most 6 (`&quot;`). A fallback is part of the template's own length.
 */
const MAX_VALUE_RENDERED = 2000 * 6;
/** A broadcast's HTML or text renders to at most this many characters for any contact. */
export const MAX_RENDERED_LENGTH = 5_000_000;

/** The most `template` can render to, whatever the contact's values. */
export function maxRenderedLength(template: string | null | undefined): number {
  if (!template) return 0;
  return template.length + [...template.matchAll(PLACEHOLDER)].length * MAX_VALUE_RENDERED;
}

export type RenderMode = "html" | "text" | "subject";

export function renderTemplate(
  template: string,
  variables: Readonly<Record<string, string>>,
  mode: RenderMode,
): string {
  return template.replace(PLACEHOLDER, (_, key: string, fallback: string | undefined) => {
    // Own keys only: `contact.constructor` must not find `Object.prototype`'s.
    const value = (Object.hasOwn(variables, key) ? variables[key] : undefined) || fallback || "";
    if (mode === "html") return escapeHtml(value);
    if (mode === "subject") return value.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ");
    return value;
  });
}

/**
 * A rendered subject cut to `max` UTF-16 units (a send's limit), never between a surrogate pair:
 * contact values can make it longer than its template.
 */
export function boundedSubject(subject: string, max: number): string {
  if (subject.length <= max) return subject;
  const cut = subject.slice(0, max);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

/** The preview line as a hidden preheader right after `<body…>` (or at the start). */
export function withPreheader(html: string, previewText: string | null | undefined): string {
  if (!previewText) return html;
  const preheader =
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">' +
    `${escapeHtml(previewText)}</div>`;
  const body = /<body/i.exec(html);
  const end = body ? html.indexOf(">", body.index) : -1;
  if (end === -1) return `${preheader}${html}`;
  const at = end + 1;
  return `${html.slice(0, at)}${preheader}${html.slice(at)}`;
}

export type BroadcastContent = {
  subject: string;
  html: string | null;
  text: string | null;
  previewText: string | null;
};

/** One recipient's content (before the marketing footer and tracking). */
export function renderBroadcast(
  content: BroadcastContent,
  variables: Readonly<Record<string, string>>,
): { subject: string; html: string | null; text: string | null } {
  return {
    subject: renderTemplate(content.subject, variables, "subject"),
    html:
      content.html === null
        ? null
        : withPreheader(renderTemplate(content.html, variables, "html"), content.previewText),
    text: content.text === null ? null : renderTemplate(content.text, variables, "text"),
  };
}
