/**
 * Verify's email codes through the email product. From the settings' `email_from` in the
 * environment's own environment (its domain, suppression list and history); else, and when that
 * address isn't on a verified domain (any more), from coss.com's sender in coss.com's notification
 * environment as "<app name> via coss.com". Sandbox environments always send in their own
 * environment (the fake provider: nothing is delivered, and the code — zeros — is readable).
 */

import { isHipaaMode } from "@coss/compliance";
import {
  checkSuppression,
  EmailError,
  type EmailService,
  emailIdForIdempotencyKey,
  type SendEnvironment,
} from "@coss/email";
import { SendEmailRequest } from "@coss/email/schemas";
import { type VerifyEmailSender, VerifyError } from "@coss/verify";

const SANDBOX_FROM = "verify@coss.com";

function named(name: string, address: string): string {
  return `"${name.replace(/["\\\r\n]/g, "").slice(0, 120)}" <${address}>`;
}

export type CossVerifySender = { environment: SendEnvironment; address: string };

export function verifyEmailSender(opts: {
  service: Pick<EmailService, "send">;
  /** coss.com's sender (`NOTIFICATIONS_ENVIRONMENT_ID`, `NOTIFICATIONS_FROM`); `null`: none. */
  coss: CossVerifySender | null;
}): VerifyEmailSender {
  async function send(
    input: Parameters<VerifyEmailSender>[0],
    environment: SendEnvironment,
    from: string,
    category: string,
    html: string,
  ) {
    // A suppressed address would only be skipped at dispatch, after the verification looked sent.
    // The customer's own list counts whichever environment sends: its bounces and complaints are
    // the address's, not the sender's.
    const lists = [{ environment: input.environment, category: "verification" }];
    if (environment !== input.environment) lists.push({ environment, category });
    for (const list of lists) {
      const { suppressed } = await checkSuppression(list.environment, {
        address: input.to,
        category: list.category,
      });
      if (suppressed) return { emailId: null, suppressed: true };
    }
    const params = SendEmailRequest.parse({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html,
      category,
      // The code is a secret: never through tracking, never kept after sending.
      tracking: { opens: false, clicks: false, unsubscribe: false },
    });
    let email: Awaited<ReturnType<EmailService["send"]>>["email"];
    try {
      ({ email } = await opts.service.send({
        environment,
        apiKeyId: environment === input.environment ? input.apiKeyId : null,
        apiKeyOwnerId: environment === input.environment ? input.apiKeyOwnerId : null,
        params,
        idempotencyKey: input.idempotencyKey,
        discardBody: input.environment.mode === "live",
        // A row in coss.com's environment: the mode's own checks can't see whose code this is.
        hipaaOrigin:
          environment !== input.environment &&
          (await isHipaaMode(input.environment.organizationId)),
      }));
    } catch (error) {
      // The send's key already made an email here (sent, its id lost before Verify saved it),
      // with settings that have changed since: that email is the send.
      if (!(error instanceof EmailError && error.code === "idempotency_key_reused")) throw error;
      const sent = await emailIdForIdempotencyKey({
        organizationId: environment.organizationId,
        environmentId: environment.environmentId,
        idempotencyKey: input.idempotencyKey,
      });
      if (!sent) throw error;
      return { emailId: sent, suppressed: false };
    }
    return {
      emailId: email.id,
      suppressed: email.status === "failed" && email.failure?.code === "all_recipients_suppressed",
    };
  }

  return async (input) => {
    // A send its key already made (a retry after the process stopped, before Verify saved the
    // email's id) is that email, whichever sender the settings name now.
    const candidates: { environment: SendEnvironment; route: "email" | "coss_email" }[] = [
      { environment: input.environment, route: "email" },
    ];
    if (opts.coss && input.environment.mode === "live") {
      candidates.push({ environment: opts.coss.environment, route: "coss_email" });
    }
    for (const candidate of candidates) {
      const sent = await emailIdForIdempotencyKey({
        organizationId: candidate.environment.organizationId,
        environmentId: candidate.environment.environmentId,
        idempotencyKey: input.idempotencyKey,
      });
      if (sent) return { route: candidate.route, emailId: sent, suppressed: false };
    }
    if (input.environment.mode === "sandbox") {
      const sent = await send(
        input,
        input.environment,
        input.from ?? named(input.appName, SANDBOX_FROM),
        "verification",
        input.html,
      );
      return { route: "email", ...sent };
    }
    if (input.from) {
      try {
        const sent = await send(input, input.environment, input.from, "verification", input.html);
        return { route: "email", ...sent };
      } catch (error) {
        // The domain stopped being verified: coss.com's sender takes over.
        if (!(error instanceof EmailError && error.code === "domain_not_verified")) throw error;
      }
    }
    if (!opts.coss) {
      throw new VerifyError(
        "send_failed",
        "Set an email sender on one of your verified domains in Verify's settings: coss.com's own sender isn't available.",
      );
    }
    const sent = await send(
      input,
      opts.coss.environment,
      named(`${input.appName} via coss.com`, opts.coss.address),
      "account",
      input.cossHtml,
    );
    return { route: "coss_email", ...sent };
  };
}
