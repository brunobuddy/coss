/**
 * Support's emails through the email product, from coss.com's own support environment: suppressions
 * and history of their own, so a complaint about a reply never blocks password resets.
 */
import { db, schema } from "@coss/db";
import { EmailError, type EmailService, type SendEnvironment } from "@coss/email";
import { SendEmailRequest } from "@coss/email/schemas";
import {
  PermanentSupportSendError,
  type SupportEmailStatus,
  type SupportMailer,
} from "@coss/support";
import { and, eq } from "drizzle-orm";
import { ZodError } from "zod";

const { email: emailTable, emailRecipient } = schema;

const UNDELIVERED = new Set(["bounced", "complained", "suppressed", "failed"]);

export function supportMailer(opts: {
  service: Pick<EmailService, "send" | "messageIdOf">;
  environment: SendEnvironment;
  fromAddress: string;
}): SupportMailer {
  async function emailIdByKey(idempotencyKey: string): Promise<string | null> {
    const [row] = await db
      .select({ id: emailTable.id })
      .from(emailTable)
      .where(
        and(
          eq(emailTable.environmentId, opts.environment.environmentId),
          eq(emailTable.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return row?.id ?? null;
  }

  return {
    async send(email) {
      const headers: Record<string, string> = {};
      if (email.inReplyTo) headers["In-Reply-To"] = email.inReplyTo;
      if (email.references.length > 0) headers.References = email.references.join(" ");
      try {
        const params = SendEmailRequest.parse({
          from: `"${email.fromName}" <${opts.fromAddress}>`,
          to: email.to,
          ...(email.cc.length > 0 ? { cc: email.cc } : {}),
          reply_to: email.replyTo,
          subject: email.subject,
          text: email.text,
          html: email.html,
          category: "support",
          ...(Object.keys(headers).length > 0 ? { headers } : {}),
          ...(email.attachments.length > 0
            ? {
                attachments: email.attachments.map((attachment) => ({
                  filename: attachment.filename,
                  content: Buffer.from(attachment.content).toString("base64"),
                  content_type: attachment.contentType,
                })),
              }
            : {}),
          tracking: { opens: false, clicks: false, unsubscribe: false },
        });
        const sent = await opts.service.send({
          environment: opts.environment,
          apiKeyId: null,
          params,
          idempotencyKey: email.idempotencyKey,
          idempotencyRetentionMs: Number.POSITIVE_INFINITY,
          requestHash: email.requestHash,
          // A flagged reply must not raise scrutiny on the mail coss.com sends itself.
          screeningExempt: true,
        });
        return { emailId: sent.email.id };
      } catch (error) {
        if (error instanceof ZodError) {
          throw new PermanentSupportSendError(error.issues[0]?.message ?? "Invalid email.");
        }
        if (error instanceof EmailError && error.code === "idempotency_key_reused") {
          return { emailId: await emailIdByKey(email.idempotencyKey) };
        }
        throw error;
      }
    },

    async status(emailId): Promise<SupportEmailStatus | null> {
      const [row] = await db
        .select({
          status: emailTable.status,
          errorMessage: emailTable.errorMessage,
          provider: emailTable.provider,
          providerMessageId: emailTable.providerMessageId,
        })
        .from(emailTable)
        .where(
          and(
            eq(emailTable.id, emailId),
            eq(emailTable.environmentId, opts.environment.environmentId),
          ),
        );
      if (!row) return null;
      const messageId = opts.service.messageIdOf?.(row) ?? null;
      if (row.status === "failed" || row.status === "canceled") {
        return { state: "failed", messageId, detail: row.errorMessage };
      }
      if (row.status !== "sent") return { state: "queued", messageId };
      const recipients = await db
        .select({ address: emailRecipient.address, status: emailRecipient.status })
        .from(emailRecipient)
        .where(eq(emailRecipient.emailId, emailId));
      const undelivered = recipients.filter((recipient) => UNDELIVERED.has(recipient.status));
      if (undelivered.length > 0) {
        return {
          state: "bounced",
          messageId,
          detail: undelivered
            .map((recipient) => `${recipient.address}: ${recipient.status}`)
            .join(", "),
        };
      }
      const delivered =
        recipients.length > 0 && recipients.every((recipient) => recipient.status === "delivered");
      return { state: delivered ? "delivered" : "sent", messageId };
    },
  };
}
