/** Send failures as SMTP replies: 4xx where retrying can help, 5xx where it can't. */
import { BillingError } from "@coss/billing";
import { HipaaModeError } from "@coss/compliance";
import { EmailError } from "@coss/email";
import type { SmtpReply } from "@coss/email/smtp";

/** `logMessage` replaces the client's text in the log line (when that may quote addresses). */
export type SmtpOutcome = SmtpReply & { errorCode: string | null; logMessage?: string };

const ADDRESS = /[^\s<>"'(),;:]+@[^\s<>"'(),;:]+/g;

/**
 * The text a log line keeps of a reply: never an email address (logs and drains must not hold
 * them), whatever produced the message.
 */
export function loggedMessage(outcome: SmtpOutcome): string {
  return (outcome.logMessage ?? outcome.message).replace(ADDRESS, "[address]");
}

export function reply(
  code: number,
  status: string,
  message: string,
  errorCode: string | null = null,
): SmtpOutcome {
  return { code, status, message, errorCode };
}

/** A send's expected failure as a reply, or `null` for anything unexpected (logged, then 451). */
export function sendErrorReply(error: unknown): SmtpOutcome | null {
  if (error instanceof HipaaModeError) return reply(550, "5.7.1", error.message, error.code);
  if (error instanceof EmailError) {
    switch (error.code) {
      case "request_in_progress":
        return reply(451, "4.3.0", error.message, error.code);
      case "idempotency_key_reused":
        return reply(554, "5.6.0", error.message, error.code);
      case "domain_not_verified":
      case "account_suspended":
      case "sending_paused":
      case "billing_hold":
      case "budget_exceeded":
      case "subaccount_disabled":
      case "subaccount_paused":
        return reply(550, "5.7.1", error.message, error.code);
      default:
        return reply(554, "5.0.0", error.message, error.code);
    }
  }
  if (error instanceof BillingError) {
    return error.status === 402
      ? reply(550, "5.7.1", error.message, error.code)
      : reply(451, "4.3.0", error.message, error.code);
  }
  return null;
}

/** The text smtp-server sends after the code (it adds no enhanced status itself). */
export function replyText(outcome: SmtpReply): string {
  return `${outcome.status} ${outcome.message}`;
}

/** An Error carrying a reply, as smtp-server's callbacks take it. */
export function replyError(outcome: SmtpReply): Error & { responseCode: number } {
  return Object.assign(new Error(replyText(outcome)), { responseCode: outcome.code });
}
