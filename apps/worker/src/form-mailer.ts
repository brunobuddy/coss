/**
 * Forms' emails (owners' notifications, submitters' verification links) through the email
 * product. From the form's own sender in its environment when it has one; else, and when that
 * address stops being verified, notifications go from coss.com's sender in coss.com's notification
 * environment as "<form name> via coss.com" (their recipients are the organization's own members
 * or addresses on its verified domains). Verification emails never fall back: an address typed
 * into a public form gets mail only from the customer's verified sender. Sandbox environments
 * always send in their own environment (the fake provider: nothing is delivered).
 */
import { isHipaaMode } from "@coss/compliance";
import { db, schema } from "@coss/db";
import { EmailError, type EmailService, type SendEnvironment } from "@coss/email";
import { SendEmailRequest } from "@coss/email/schemas";
import { type FormEmail, type FormMailer, oneLine } from "@coss/forms";
import { emailSendQuota, type RateLimiter } from "@coss/ratelimit";
import { and, eq, inArray } from "drizzle-orm";

const SANDBOX_FALLBACK_ADDRESS = "forms@coss.com";

function named(name: string, address: string): string {
  // A form's name is free text: one line, without what a quoted display name can't hold.
  return `"${oneLine(name.replace(/["\\]/g, ""), 120)}" <${address}>`;
}

/** Whether an email with this idempotency key exists in any of these environments. */
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

export function formMailer(opts: {
  service: Pick<EmailService, "send">;
  /** Charges the sending environment's send quota, like the API's sends (refunded unless sent). */
  limiter: RateLimiter;
  /** coss.com's sender; `null`: live notifications without a `from` wait until it is configured. */
  fallback: { environment: SendEnvironment; address: string } | null;
}): FormMailer {
  async function send(
    email: FormEmail,
    environment: SendEnvironment,
    from: string,
    hipaaOrigin = false,
  ): Promise<{ replayed: boolean }> {
    const params = SendEmailRequest.parse({
      from,
      to: email.to,
      ...(email.replyTo ? { reply_to: email.replyTo } : {}),
      subject: email.subject,
      text: email.text,
      html: email.html,
      category: email.category,
      // Verification links are secrets and notifications hold what people submitted: never
      // through click redirects, and in live environments never kept after sending. A sandbox
      // keeps them, so its emails page shows the links to test with.
      tracking: { opens: false, clicks: false, unsubscribe: false },
    });
    const quota = emailSendQuota(environment, params.to.length);
    if (!(await opts.limiter.consume(quota)).allowed) {
      // Retried with the delivery's backoff.
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
        hipaaOrigin,
      });
      sent = replayed !== true;
      return { replayed: replayed === true };
    } catch (error) {
      if (error instanceof EmailError && error.code === "idempotency_key_reused") {
        return { replayed: true };
      }
      throw error;
    } finally {
      if (!sent) await opts.limiter.refund(quota);
    }
  }

  async function viaCoss(email: FormEmail): Promise<{ replayed: boolean }> {
    if (!opts.fallback) {
      throw new Error(
        "Forms can't send this notification without the form's own sender: coss.com's sender " +
          "(NOTIFICATIONS_ENVIRONMENT_ID with FORMS_NOTIFICATIONS_FROM or NOTIFICATIONS_FROM) isn't set.",
      );
    }
    return send(
      email,
      opts.fallback.environment,
      named(`${email.senderName} via coss.com`, opts.fallback.address),
      // The row is coss.com's, so the mode's own checks can't see whose submission this holds.
      await isHipaaMode(email.environment.organizationId),
    );
  }

  return {
    async send(email) {
      const routes = [email.environment, ...(opts.fallback ? [opts.fallback.environment] : [])];
      if (await alreadySent(routes, email.idempotencyKey)) return { replayed: true };
      if (email.environment.mode === "sandbox") {
        const address = email.from ?? opts.fallback?.address ?? SANDBOX_FALLBACK_ADDRESS;
        const name = email.from ? email.senderName : `${email.senderName} via coss.com`;
        return send(email, email.environment, named(name, address));
      }
      if (!email.from) {
        if (email.customerOnly) {
          throw new Error("A verification email needs the form's confirmation_from address.");
        }
        return viaCoss(email);
      }
      try {
        return await send(email, email.environment, named(email.senderName, email.from));
      } catch (error) {
        if (
          !email.customerOnly &&
          error instanceof EmailError &&
          error.code === "domain_not_verified"
        ) {
          return viaCoss(email);
        }
        throw error;
      }
    },
  };
}

/**
 * Charges a verification email: the organization's daily budget, then the address's across every
 * organization (so nobody is mail-bombed through many forms). Either over: `null`, not sent.
 */
export function formVerificationQuota(
  limiter: RateLimiter,
): (input: {
  organizationId: string;
  address: string;
}) => Promise<{ refund(): Promise<void> } | null> {
  return async ({ organizationId, address }) => {
    const org = {
      buckets: ["forms.verifications.day" as const],
      subject: organizationId,
      organizationId,
    };
    if (!(await limiter.consume(org)).allowed) return null;
    const byAddress = { buckets: ["forms.verification.address" as const], subject: address };
    if (!(await limiter.consume(byAddress)).allowed) {
      await limiter.refund(org);
      return null;
    }
    return {
      async refund() {
        await limiter.refund(byAddress);
        await limiter.refund(org);
      },
    };
  };
}
