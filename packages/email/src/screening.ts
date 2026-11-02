/**
 * What content screening sees of an email: sender, subject, readable text and link targets. The
 * HTML is parsed for its text and `href`s; nothing here changes what is sent.
 */

import { db, type Executor, schema } from "@coss/db";
import {
  MAX_TEXT_CHARS,
  prepareLinks,
  prepareText,
  type ScreeningContent,
  urlsInText,
} from "@coss/screening";
import { and, eq, inArray, ne } from "drizzle-orm";
import { type DefaultTreeAdapterTypes, parse } from "parse5";
import { domainSuffixes, normalizeDomainName } from "./domains.ts";
import type { EmailRow } from "./read.ts";
import { parseEmailAddress } from "./schemas.ts";
import { lockScreeningDomain, screeningDomainReleasedSince } from "./screening-domain-memory.ts";
import {
  MAX_SCREENING_IMAGE_TOTAL_BYTES,
  MAX_SCREENING_IMAGES,
  prepareScreeningImages,
  publicScreeningImageLoader,
  type ScreeningImage,
  type ScreeningImageLoader,
  screeningImage,
} from "./screening-images.ts";

type ParentNode = DefaultTreeAdapterTypes.ParentNode;

// Never rendered as text in a mail client.
const SKIPPED = new Set(["head", "script", "style", "template", "noscript"]);
// Rendered on their own line.
const BLOCKS = new Set([
  "address",
  "article",
  "blockquote",
  "br",
  "dd",
  "div",
  "dl",
  "dt",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "td",
  "th",
  "tr",
  "ul",
]);

/** Visible text and `href` values of an HTML document. */
export function htmlTextAndLinks(html: string): {
  text: string;
  /** Visible body text only: alt text and hidden padding cannot exempt image-only mail. */
  bodyText: string;
  hrefs: string[];
  images: string[];
} {
  const parts: string[] = [];
  const bodyParts: string[] = [];
  const hrefs: string[] = [];
  const images = new Set<string>();
  const backgrounds = (style: string) => {
    for (const declaration of style.match(/background(?:-image)?\s*:(?:[^;{}()]|\([^)]*\))+/gi) ??
      []) {
      for (const match of declaration.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
        if (match[1]) images.add(match[1].trim());
      }
    }
  };
  const styles = (node: ParentNode) => {
    for (const child of node.childNodes) {
      if (!("tagName" in child)) continue;
      if (child.tagName === "style") {
        for (const text of child.childNodes) {
          if (text.nodeName === "#text")
            backgrounds((text as DefaultTreeAdapterTypes.TextNode).value);
        }
      } else if (!SKIPPED.has(child.tagName) || child.tagName === "head") {
        styles(child);
      }
    }
  };
  const walk = (node: ParentNode, visible = true) => {
    const append = (text: string) => {
      parts.push(text);
      if (visible) bodyParts.push(text);
    };
    for (const child of node.childNodes) {
      if (child.nodeName === "#comment") {
        // Outlook renders these branches even though other clients treat them as comments.
        const conditional = /^\[if\b[^\]]*\]>([\s\S]*)<!\[endif\]\s*$/i.exec(
          (child as DefaultTreeAdapterTypes.CommentNode).data,
        );
        if (conditional?.[1]) {
          const branch = parse(conditional[1]);
          styles(branch);
          walk(branch, visible);
        }
        continue;
      }
      if (child.nodeName === "#text") {
        append((child as DefaultTreeAdapterTypes.TextNode).value);
        continue;
      }
      if (!("tagName" in child)) continue;
      if (SKIPPED.has(child.tagName)) continue;
      backgrounds(child.attrs.find((attr) => attr.name === "style")?.value ?? "");
      const background = child.attrs.find((attr) => attr.name === "background")?.value;
      if (background) images.add(background);
      if (child.tagName === "a") {
        const href = child.attrs.find((attr) => attr.name === "href")?.value;
        if (href) hrefs.push(href);
      }
      if (child.tagName === "img") {
        // Alt text is sender-controlled and is never a substitute for inspecting the image.
        const alt = child.attrs.find((attr) => attr.name === "alt")?.value;
        if (alt) parts.push(` ${alt} `);
      }
      if (["img", "source", "image", "v:imagedata", "v:fill"].includes(child.tagName)) {
        const source = child.attrs.find(
          (attr) => attr.name === "src" || attr.name === "href",
        )?.value;
        if (source) images.add(source);
        const srcset = child.attrs.find((attr) => attr.name === "srcset")?.value;
        for (const candidate of srcset?.split(",") ?? []) {
          images.add(candidate.trim().split(/\s+/)[0] ?? "");
        }
      }
      const block = BLOCKS.has(child.tagName);
      const style = child.attrs.find((attr) => attr.name === "style")?.value ?? "";
      const hidden =
        child.attrs.some((attr) => attr.name === "hidden") ||
        /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i.test(style);
      if (block) append("\n");
      walk(child, visible && !hidden);
      if (block) append("\n");
    }
  };
  const document = parse(html);
  styles(document);
  walk(document);
  return { text: parts.join(""), bodyText: bodyParts.join(""), hrefs, images: [...images] };
}

/** Screen both alternatives: mail clients may display either representation. */
export function emailScreeningContent(
  row: Pick<EmailRow, "from" | "subject" | "html" | "text">,
): Extract<ScreeningContent, { kind: "email" }> {
  const html = row.html ? htmlTextAndLinks(row.html) : { text: "", hrefs: [], images: [] };
  const parts = [row.text ?? "", html.text].map((part) => prepareText(part)).filter(Boolean);
  // Reserve equal space for each alternative, including separators and truncation markers.
  const partBudget = Math.floor(
    (MAX_TEXT_CHARS - 2 * (parts.length - 1)) / Math.max(1, parts.length),
  );
  const body = parts.map((part) => prepareText(part, partBudget - 1)).join("\n\n");
  return {
    kind: "email",
    from: row.from,
    subject: prepareText(row.subject, 500),
    text: prepareText(body),
    links: prepareLinks([...html.hrefs, ...html.images, ...urlsInText(row.text ?? "")]),
  };
}

/** Image-only/short-body messages cannot exhaust the initial sample with harmless subjects. */
export function imageDominantEmail(row: Pick<EmailRow, "html">): boolean {
  if (!row.html) return false;
  const html = htmlTextAndLinks(row.html);
  return html.images.length > 0 && prepareText(html.bodyText).length < 200;
}

/** Load every image or fail closed; truncating the image list would leave an evasion path. */
export async function loadEmailScreeningContent(
  row: Pick<EmailRow, "from" | "subject" | "html" | "text"> & {
    id?: string;
    organizationId?: string;
  },
  signal: AbortSignal,
  load: ScreeningImageLoader = publicScreeningImageLoader(),
): Promise<Extract<ScreeningContent, { kind: "email" }>> {
  const content = emailScreeningContent(row);
  const sources = row.html ? htmlTextAndLinks(row.html).images : [];
  if (!sources.length) return content;
  if (sources.length > MAX_SCREENING_IMAGES) throw new Error("Too many images to screen safely.");
  const images = [];
  let size = 0;
  // Sequential downloads bound aggregate memory and stop when the shared deadline expires.
  for (const source of sources) {
    signal.throwIfAborted();
    let image: ScreeningImage;
    if (source.toLowerCase().startsWith("cid:")) {
      if (!row.id || !row.organizationId) throw new Error("Inline screening image is unavailable.");
      const [attachment] = await db
        .select({ content: schema.emailAttachment.content })
        .from(schema.emailAttachment)
        .where(
          and(
            eq(schema.emailAttachment.organizationId, row.organizationId),
            eq(schema.emailAttachment.emailId, row.id),
            eq(schema.emailAttachment.contentId, source.slice(4)),
          ),
        )
        .limit(1);
      if (!attachment?.content) throw new Error("Inline screening image is unavailable.");
      image = screeningImage(attachment.content);
    } else {
      image = await load(source, signal);
    }
    for (const prepared of await prepareScreeningImages(
      image,
      signal,
      MAX_SCREENING_IMAGES - images.length,
      MAX_SCREENING_IMAGE_TOTAL_BYTES - size,
    )) {
      size += prepared.data.length;
      if (size > MAX_SCREENING_IMAGE_TOTAL_BYTES)
        throw new Error("Screening images are too large.");
      images.push(prepared);
    }
  }
  return { ...content, images };
}

/** Operator-only release, including after the original suspended organization was deleted. */
export async function clearScreeningDomainBlock(input: {
  domain: string;
  adminUserId: string;
  note: string;
}): Promise<boolean> {
  const name = normalizeDomainName(input.domain, { allowReserved: true });
  const note = input.note.trim();
  if (!note) throw new Error("A review note is required to release a sender domain.");
  return db.transaction(async (tx) => {
    const [actor] = await tx
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, input.adminUserId));
    if (actor?.role !== "admin" || actor.banned)
      throw new Error("An active platform admin is required.");
    await lockScreeningDomain(tx, name);
    const [removed] = await tx
      .delete(schema.emailSenderDomainBlock)
      .where(eq(schema.emailSenderDomainBlock.domain, name))
      .returning();
    if (!removed) return false;
    await tx.insert(schema.adminAuditEvent).values({
      actorUserId: actor.id,
      actorEmail: actor.email,
      action: "email.domain_screening_released",
      targetType: "email_domain",
      targetId: name,
      organizationId: removed.organizationId,
      reason: note,
      metadata: { sourceSubjectId: removed.subjectId, groupId: removed.groupId },
      // PostgreSQL's transaction-start timestamp can precede a block we waited to release.
      createdAt: new Date(),
    });
    return true;
  });
}

/** Keep verified sender-domain abuse memory even when its domain or organization is deleted. */
export async function recordScreeningDomainBlock(
  tx: Executor,
  row: { organizationId: string; from: string; id: string; subaccountId?: string | null },
  now: Date,
): Promise<void> {
  const address = parseEmailAddress(row.from).address.toLowerCase();
  const host = address.slice(address.lastIndexOf("@") + 1);
  const matches = await tx
    .select()
    .from(schema.domain)
    .where(
      and(
        eq(schema.domain.organizationId, row.organizationId),
        inArray(schema.domain.name, domainSuffixes(host)),
        ne(schema.domain.status, "failed"),
      ),
    );
  const match = matches.sort((a, b) => b.name.length - a.name.length)[0];
  // A sub-account cannot taint a shared platform domain or any sibling's identity.
  if (match ? match.subaccountId !== (row.subaccountId ?? null) : row.subaccountId) return;
  const domain = match?.name ?? host;
  await lockScreeningDomain(tx, domain);
  if (await screeningDomainReleasedSince(tx, domain, now)) return;
  await tx
    .insert(schema.emailSenderDomainBlock)
    .values({
      // An organization's sender was authorized before dispatch. If it deleted the identity
      // while the classifier ran, keep the actual From domain rather than losing the memory.
      domain,
      organizationId: row.organizationId,
      groupId: row.subaccountId ?? null,
      subjectId: row.id,
      createdAt: now,
    })
    .onConflictDoNothing();
}
