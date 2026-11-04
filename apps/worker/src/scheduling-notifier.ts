/**
 * Scheduling's emails and texts, through the email and SMS products. From the environment's own
 * sender when it has one; else, and when that stops being verified, from coss.com's as
 * "<brand> via coss.com". Sandbox environments send in their own environment (the fake provider:
 * nothing is delivered), and keep the body so its emails page shows the links to test with.
 */
import { isHipaaMode } from "@coss/compliance";
import { db, schema } from "@coss/db";
import { EmailError, type EmailService, type SendEnvironment } from "@coss/email";
import { SendEmailRequest } from "@coss/email/schemas";
import { oneLine } from "@coss/email-layout";
import { emailSendQuota, type RateLimiter } from "@coss/ratelimit";
import type { SchedulingEmail, SchedulingNotifier, SchedulingSms } from "@coss/scheduling";
import type { SmsService } from "@coss/sms";
import { SendSmsRequest } from "@coss/sms/schemas";
import { and, eq, inArray } from "drizzle-orm";

const SANDBOX_FALLBACK_ADDRESS = "scheduling@coss.com";

function named(name: string, address: string): string {
  return `"${oneLine(name.replace(/["\\]/g, "")).slice(0, 120)}" <${address}>`;
}

async function alreadySent(
  environments: readonly SendEnvironment[],
  idempotencyKey: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.email.id })
    .from(schema.email)
    .where(
      and(
        inArray(
          schema.email.environmentId,
          environments.map((environment) => environment.environmentId),
        ),
        eq(schema.email.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  return row !== undefined;
}

export function schedulingNotifier(opts: {
  service: Pick<EmailService, "send">;
  sms?: Pick<SmsService, "send">;
  limiter: RateLimiter;
  /** coss.com's sender; `null`: live emails without a `from` wait until it's configured. */
  fallback: { environment: SendEnvironment; address: string } | null;
}): SchedulingNotifier {
  async function send(
    email: SchedulingEmail,
    environment: SendEnvironment,
    from: string,
    content: { subject: string; text: string; html: string; replyTo: string | null },
    logo: SchedulingEmail["logo"] = null,
    hipaaOrigin = false,
  ): Promise<void> {
    const attachments = [
      ...(email.ics
        ? [
            {
              filename: email.ics.filename,
              content: Buffer.from(email.ics.content, "utf8").toString("base64"),
              // The schema takes no parameters: the METHOD inside the file is what mail clients read.
              content_type: "text/calendar",
            },
          ]
        : []),
      ...(logo
        ? [
            {
              filename: logo.filename,
              content: logo.content,
              content_type: logo.contentType,
              content_id: logo.contentId,
            },
          ]
        : []),
    ];
    const params = SendEmailRequest.parse({
      from,
      to: email.to,
      subject: content.subject,
      text: content.text,
      html: content.html,
      ...(content.replyTo ? { reply_to: content.replyTo } : {}),
      category: "scheduling",
      // Manage links are secrets: never through click redirects, and in live environments never
      // kept after sending.
      tracking: { opens: false, clicks: false, unsubscribe: false },
      ...(attachments.length > 0 ? { attachments } : {}),
    });
    const quota = emailSendQuota(environment, params.to.length);
    if (!(await opts.limiter.consume(quota)).allowed) {
      throw new Error("The organization's send quota is used up.");
    }
    let sent = false;
    try {
      const { replayed } = await opts.service.send({
        environment,
        apiKeyId: null,
        params,
        idempotencyKey: email.idempotencyKey,
        idempotencyRetentionMs: Number.POSITIVE_INFINITY,
        discardBody: environment.mode === "live",
        screeningExempt: true,
        hipaaOrigin,
      });
      sent = replayed !== true;
    } catch (error) {
      if (!(error instanceof EmailError && error.code === "idempotency_key_reused")) throw error;
    } finally {
      if (!sent) await opts.limiter.refund(quota);
    }
  }

  return {
    async email(email) {
      const own = {
        subject: email.subject,
        text: email.text,
        html: email.html,
        replyTo: email.replyTo,
      };
      // What a customer wrote, and where replies go, never leave under coss.com's address.
      const coss = {
        subject: email.cossSubject,
        text: email.cossText,
        html: email.cossHtml,
        replyTo: null,
      };
      const routes = [email.environment, ...(opts.fallback ? [opts.fallback.environment] : [])];
      if (await alreadySent(routes, email.idempotencyKey)) return;
      if (email.environment.mode === "sandbox") {
        const address = email.from ?? opts.fallback?.address ?? SANDBOX_FALLBACK_ADDRESS;
        const name = email.from ? email.senderName : `${email.senderName} via coss.com`;
        await send(
          email,
          email.environment,
          named(name, address),
          email.from ? own : coss,
          email.from ? email.logo : null,
        );
        return;
      }
      if (email.from) {
        try {
          await send(
            email,
            email.environment,
            named(email.senderName, email.from),
            own,
            email.logo,
          );
          return;
        } catch (error) {
          if (!(error instanceof EmailError && error.code === "domain_not_verified")) throw error;
        }
      }
      // A guest's address is only what someone typed, and past its allowance a reminder is coss.com's
      // to pay for: never on coss.com's sender or reputation.
      if (email.ownSenderOnly) return "not_sent";
      if (!opts.fallback) {
        throw new Error(
          "Scheduling can't send without the environment's own sender: coss.com's sender " +
            "(NOTIFICATIONS_ENVIRONMENT_ID with NOTIFICATIONS_FROM) isn't set.",
        );
      }
      await send(
        email,
        opts.fallback.environment,
        named(`${email.senderName} via coss.com`, opts.fallback.address),
        coss,
        null,
        // The row is coss.com's, so the mode's own checks can't see whose patient this names.
        await isHipaaMode(email.environment.organizationId),
      );
    },
    ...(opts.sms
      ? {
          async sms(message: SchedulingSms) {
            await (opts.sms as Pick<SmsService, "send">).send({
              environment: message.environment,
              apiKeyId: null,
              params: SendSmsRequest.parse({
                from: message.from,
                to: message.to,
                body: message.body,
              }),
              idempotencyKey: message.idempotencyKey,
              discardBody: message.environment.mode === "live",
            });
          },
        }
      : {}),
  };
}
