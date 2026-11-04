/**
 * Sign's emails (invitations, reminders, signed copies) through the email product. From the
 * environment's `email_from` in its own environment when it has one (its sending, its suppression
 * list and history); else, and when that address stops being verified, from coss.com's sender in
 * coss.com's notification environment as "<requester> via coss.com". Sandbox environments always
 * send in their own environment (the fake provider: nothing is delivered).
 */
import { isHipaaMode } from "@coss/compliance";
import { db, schema } from "@coss/db";
import { EmailError, type EmailService, type SendEnvironment } from "@coss/email";
import { SendEmailRequest } from "@coss/email/schemas";
import type { SignEmail, SignMailer } from "@coss/sign";
import { and, eq, inArray } from "drizzle-orm";

const SANDBOX_FALLBACK_ADDRESS = "sign@coss.com";

/** The bare address of `Name <address>` or `address`. */
export function addressOf(from: string): string {
  return /<([^>]+)>/.exec(from)?.[1]?.trim() ?? from.trim();
}

function named(name: string, address: string): string {
  return `"${name.replace(/["\\\r\n]/g, "").slice(0, 120)}" <${address}>`;
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

export function signMailer(opts: {
  service: Pick<EmailService, "send">;
  /** coss.com's sender; `null`: live emails without `email_from` wait until it is configured. */
  fallback: { environment: SendEnvironment; address: string } | null;
  /** Whether an email with this key exists in any of the environments (tests replace it). */
  sentBefore?: (
    environments: readonly SendEnvironment[],
    idempotencyKey: string,
  ) => Promise<boolean>;
}): SignMailer {
  const sentBefore = opts.sentBefore ?? alreadySent;
  async function send(
    email: SignEmail,
    environment: SendEnvironment,
    from: string,
    hipaaOrigin = false,
  ): Promise<{ replayed: boolean }> {
    const params = SendEmailRequest.parse({
      from,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
      category: "signature_request",
      // Signing links are secrets: never through click redirects, never kept after sending.
      tracking: { opens: false, clicks: false, unsubscribe: false },
      ...(email.attachment
        ? {
            attachments: [
              {
                filename: email.attachment.filename,
                content: Buffer.from(email.attachment.content).toString("base64"),
                content_type: "application/pdf",
              },
            ],
          }
        : {}),
    });
    try {
      const { replayed } = await opts.service.send({
        environment,
        apiKeyId: null,
        params,
        idempotencyKey: email.idempotencyKey,
        idempotencyRetentionMs: Number.POSITIVE_INFINITY,
        discardBody: true,
        hipaaOrigin,
      });
      return { replayed: replayed === true };
    } catch (error) {
      // Already sent (the same key, with another link in it).
      if (error instanceof EmailError && error.code === "idempotency_key_reused") {
        return { replayed: true };
      }
      throw error;
    }
  }

  async function viaCoss(email: SignEmail): Promise<{ replayed: boolean }> {
    if (!opts.fallback) {
      throw new Error(
        "Sign can't email live signers without the environment's email_from: coss.com's sender " +
          "(NOTIFICATIONS_ENVIRONMENT_ID with SIGN_NOTIFICATIONS_FROM or NOTIFICATIONS_FROM) isn't set.",
      );
    }
    // Never the requester's own words from coss.com's address.
    return send(
      { ...email, ...email.cossContent },
      opts.fallback.environment,
      named(`${email.requester} via coss.com`, opts.fallback.address),
      // The row is coss.com's, so the mode's own checks can't see whose request this is.
      await isHipaaMode(email.environment.organizationId),
    );
  }

  return {
    async send(email) {
      // An earlier attempt may have gone another way (the sender setting or the domain's
      // verification changed since) and reached the signer, with a link the email service can't
      // match to this attempt's: the same key in either environment means it was sent.
      const routes = [email.environment, ...(opts.fallback ? [opts.fallback.environment] : [])];
      if (await sentBefore(routes, email.idempotencyKey)) return { replayed: true };
      if (email.environment.mode === "sandbox") {
        const address = email.from ?? opts.fallback?.address ?? SANDBOX_FALLBACK_ADDRESS;
        const name = email.from ? email.requester : `${email.requester} via coss.com`;
        return send(email, email.environment, named(name, address));
      }
      if (!email.from) return viaCoss(email);
      try {
        return await send(email, email.environment, named(email.requester, email.from));
      } catch (error) {
        // The address stopped being verified: the signer still gets the email, from coss.com.
        if (error instanceof EmailError && error.code === "domain_not_verified") {
          return viaCoss(email);
        }
        throw error;
      }
    },
  };
}
