/**
 * Attachment storage. Content lives in `email_attachment.content` only while the email is
 * `scheduled` or `queued` (dispatch rebuilds the provider message from it) and is purged once the
 * email is sent, failed or canceled. Reads only ever see the metadata. The body of an email sent
 * with `discardBody` (auth emails: their links are secrets) is purged at the same moments, and so
 * is the whole content of one sent while its environment's content storage was `discard`.
 */
import { createHash } from "node:crypto";
import { hipaaModeAppliesSql } from "@coss/compliance";
import { db, type Executor, schema } from "@coss/db";
import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { OutboundAttachment } from "./provider.ts";
import type { EmailAttachmentObjectOutput, SendEmailRequestOutput } from "./schemas.ts";

const { email, emailAttachment } = schema;

export type EmailAttachmentMetadata = Omit<typeof emailAttachment.$inferSelect, "content">;

/** Decoded attachments of a parsed send request, ready to insert once the email row exists. */
export type PreparedAttachment = Omit<
  typeof emailAttachment.$inferInsert,
  "id" | "organizationId" | "emailId" | "createdAt"
> & { content: Buffer };

export function prepareAttachments(params: SendEmailRequestOutput): PreparedAttachment[] {
  return (params.attachments ?? []).map((attachment, position) => {
    const content = Buffer.from(attachment.content, "base64");
    return {
      position,
      filename: attachment.filename,
      contentType: attachment.content_type,
      contentId: attachment.content_id,
      size: content.byteLength,
      sha256: createHash("sha256").update(content).digest("hex"),
      content,
    };
  });
}

export async function insertAttachments(
  executor: Executor,
  row: { id: string; organizationId: string },
  attachments: PreparedAttachment[],
): Promise<void> {
  if (attachments.length === 0) return;
  await executor.insert(emailAttachment).values(
    attachments.map((attachment) => ({
      ...attachment,
      organizationId: row.organizationId,
      emailId: row.id,
    })),
  );
}

/**
 * The attachments to hand to the provider, in send order, or `null` when some content was
 * already purged (the email can no longer be sent as requested).
 */
export async function loadOutboundAttachments(row: {
  id: string;
  organizationId: string;
}): Promise<OutboundAttachment[] | null> {
  const rows = await db
    .select({
      filename: emailAttachment.filename,
      contentType: emailAttachment.contentType,
      contentId: emailAttachment.contentId,
      content: emailAttachment.content,
    })
    .from(emailAttachment)
    .where(
      and(
        eq(emailAttachment.organizationId, row.organizationId),
        eq(emailAttachment.emailId, row.id),
      ),
    )
    .orderBy(asc(emailAttachment.position));
  const attachments: OutboundAttachment[] = [];
  for (const { content, ...metadata } of rows) {
    if (content === null) return null;
    attachments.push({ ...metadata, content });
  }
  return attachments;
}

/**
 * Drops the content an email needed only to be sent: its attachments' bytes, its body if it was
 * sent with `discardBody`, and, if it was sent without content storage (`store_content` off),
 * its subject, body, headers, template variables and attachment filenames too (marked with
 * `content_discarded_at`). Call when the email reaches a terminal status.
 */
export async function purgeSendContent(
  executor: Executor,
  row: { id: string; organizationId: string },
): Promise<void> {
  const [discarded] = await executor
    .update(email)
    .set({
      subject: "",
      html: null,
      text: null,
      headers: {},
      variables: null,
      storeContent: false,
      contentDiscardedAt: sql`now()`,
    })
    .where(
      and(
        eq(email.id, row.id),
        eq(email.organizationId, row.organizationId),
        or(eq(email.storeContent, false), hipaaModeAppliesSql(email.environmentId)),
        isNull(email.contentDiscardedAt),
      ),
    )
    .returning({ id: email.id });
  if (discarded) {
    await executor
      .update(emailAttachment)
      .set({ content: null, filename: "" })
      .where(
        and(
          eq(emailAttachment.organizationId, row.organizationId),
          eq(emailAttachment.emailId, row.id),
        ),
      );
    return;
  }
  await executor
    .update(email)
    .set({ html: null, text: null })
    .where(
      and(
        eq(email.id, row.id),
        eq(email.organizationId, row.organizationId),
        eq(email.discardBody, true),
        or(isNotNull(email.html), isNotNull(email.text)),
      ),
    );
  await executor
    .update(emailAttachment)
    .set({ content: null })
    .where(
      and(
        eq(emailAttachment.organizationId, row.organizationId),
        eq(emailAttachment.emailId, row.id),
        isNotNull(emailAttachment.content),
      ),
    );
}

/** Attachment metadata of the given emails (one organization), grouped by email id in send order. */
export async function attachmentsByEmail(
  organizationId: string,
  emailIds: string[],
): Promise<Map<string, EmailAttachmentMetadata[]>> {
  const grouped = new Map<string, EmailAttachmentMetadata[]>();
  if (emailIds.length === 0) return grouped;
  const rows = await db
    .select({
      id: emailAttachment.id,
      organizationId: emailAttachment.organizationId,
      emailId: emailAttachment.emailId,
      position: emailAttachment.position,
      filename: emailAttachment.filename,
      contentType: emailAttachment.contentType,
      contentId: emailAttachment.contentId,
      size: emailAttachment.size,
      sha256: emailAttachment.sha256,
      createdAt: emailAttachment.createdAt,
    })
    .from(emailAttachment)
    .where(
      and(
        eq(emailAttachment.organizationId, organizationId),
        inArray(emailAttachment.emailId, emailIds),
      ),
    )
    .orderBy(asc(emailAttachment.emailId), asc(emailAttachment.position));
  for (const row of rows) {
    const list = grouped.get(row.emailId);
    if (list) list.push(row);
    else grouped.set(row.emailId, [row]);
  }
  return grouped;
}

export function toAttachmentObject(row: EmailAttachmentMetadata): EmailAttachmentObjectOutput {
  return {
    id: row.id,
    filename: row.filename,
    content_type: row.contentType,
    content_id: row.contentId,
    size: row.size,
  };
}
