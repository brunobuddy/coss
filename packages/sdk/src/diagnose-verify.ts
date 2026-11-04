/**
 * Why a one-time code didn't arrive, or why a check failed. `diagnoseVerification` is pure (callers
 * fetch, it decides); `fetchVerificationDiagnosis` fetches first. Never reads or shows a code.
 *
 * Must match Verify's behaviour: `packages/verify/src/service.ts` (statuses, failure codes, routes,
 * resends), `packages/verify/AGENTS.md`, and the reasons in `VERIFICATION_REASONS`
 * (`packages/risk/src/schemas.ts`) with the table in `apps/site/content/docs/verify/fraud-guard.mdx`:
 * change them together (`apps/api/test/agent-surface.test.ts` compares the reasons).
 */
import type { Coss } from "./client.ts";
import type { CossResult } from "./core/errors.ts";
import { type Diagnosis, type DiagnosisReferences, diagnoseEmail } from "./diagnose.ts";
import {
  minutesSince,
  type ProductDiagnosis,
  type ProductReferences,
  productReferences,
  softly,
} from "./diagnose-shared.ts";
import { diagnoseSms, type SmsDiagnosis } from "./diagnose-sms.ts";
import type { Email, EmailEvent } from "./types/email.ts";
import type { Sms, SmsEvent, SmsNumber } from "./types/sms.ts";
import type { Verification, VerificationSend, VerifySettings } from "./types/verify.ts";

export type VerificationVerdict =
  | "approved"
  | "awaiting_code"
  | "expired"
  | "too_many_attempts"
  | "send_failed"
  | "blocked"
  | "canceled";

export interface VerificationDiagnosis extends ProductDiagnosis<VerificationVerdict> {
  verification_id: string;
  channel: Verification["channel"];
  to: string;
  country: string | null;
  status: Verification["status"];
  sandbox: boolean;
  failure: { code: string; message: string; explanation: string; next_steps: string[] } | null;
  /** Why the fraud guard blocked it: nothing was sent or billed. */
  reasons: { code: string; value?: number; explanation: string }[];
  attempts: number;
  max_attempts: number;
  attempts_left: number;
  /** Each time a code went out, oldest first. */
  sends: (VerificationSend & { route_explanation: string })[];
  /** What happened to the latest code's message, when it's in this environment. */
  latest_send:
    | { kind: "sms"; diagnosis: SmsDiagnosis }
    | { kind: "email"; diagnosis: Diagnosis }
    | null;
  expires_at: string;
  approved_at: string | null;
  created_at: string;
}

/** The fraud guard's reasons (`VERIFICATION_REASONS` in `@coss/risk/schemas`). */
export const VERIFICATION_REASON_EXPLANATIONS: Readonly<Record<string, string>> = {
  "list.blocked": "An entry of the environment's Risk block list matched.",
  "ip.tor": "The end user's IP address is a Tor exit node.",
  "phone.premium_rate":
    "A premium-rate or shared-cost number: texting it earns its owner money (SMS pumping).",
  "phone.not_mobile": "A toll-free, pager, voicemail or similar number that can't get a text.",
  "verify.prefix_velocity":
    "Many verifications to numbers sharing this one's prefix in the last hour.",
  "verify.prefix_low_conversion":
    "Verifications to numbers sharing this one's prefix are rarely approved in the last hour.",
  "verify.country_low_conversion":
    "Verifications to this country are rarely approved in the last hour.",
  "velocity.verifications_per_ip_1h":
    "Many verifications from the end user's IP address in the last hour.",
  "velocity.verifications_per_user_1h": "Many verifications for the same user in the last hour.",
};

const ROUTES: Record<VerificationSend["route"], string> = {
  own_number: "An SMS from the environment's own number.",
  shared_number:
    "An SMS from coss.com's shared numbers. It is coss.com's message, so its id and delivery events aren't readable here.",
  email: "An email from the environment's own sender.",
  coss_email:
    "An email from coss.com's sender (\"<app> via coss.com\"). It is coss.com's message, so its id and delivery events aren't readable here.",
};

type Advice = { explanation: string; next_steps: string[] };

function failureAdvice(verification: Verification, code: string, ref: ProductReferences): Advice {
  switch (code) {
    case "max_attempts":
      return {
        explanation: `${verification.max_attempts} wrong codes were checked, so the verification failed and its code stopped working.`,
        next_steps: [
          `Start a new verification (${ref.start_verification}). If real users hit this, check that your form sends the code they typed to the latest verification: each resend replaces the earlier code.`,
        ],
      };
    case "recipient_suppressed":
      return {
        explanation:
          verification.channel === "sms"
            ? "The number is on the environment's SMS suppression list (it opted out, or can't receive SMS), so no code went out."
            : "The address is on the environment's suppression list (an earlier hard bounce or complaint), so no code went out.",
        next_steps: [
          `Look at the entry (${verification.channel === "sms" ? ref.check_sms_suppression : ref.check_email_suppression}). An opt-out is lifted when the person texts START, never by you.`,
        ],
      };
    case "send_failed":
      return {
        explanation: "The channel refused the code, so nothing reached the destination.",
        next_steps: [
          `Look at what was refused (${ref.search_logs}), then start again (${ref.start_verification}).`,
        ],
      };
    default:
      return {
        explanation: "The verification failed.",
        next_steps: [`Start a new verification (${ref.start_verification}).`],
      };
  }
}

function verdictOf(verification: Verification): VerificationVerdict {
  switch (verification.status) {
    case "approved":
      return "approved";
    case "pending":
      return "awaiting_code";
    case "expired":
      return "expired";
    case "canceled":
      return "canceled";
    case "blocked":
      return "blocked";
    case "failed":
      return verification.failure?.code === "max_attempts" ? "too_many_attempts" : "send_failed";
  }
}

function pendingAdvice(
  verification: Verification,
  latest: VerificationDiagnosis["latest_send"],
  settings: VerifySettings | null | undefined,
  now: Date,
  ref: ProductReferences,
): Advice {
  const left = verification.max_attempts - verification.attempts;
  const lastSend = verification.sends.at(-1);
  const wrongCodes =
    verification.attempts > 0
      ? ` ${verification.attempts} wrong code(s) so far; ${left} left before it fails. Only the latest code works: a resend replaces the earlier one.`
      : "";
  if (verification.sandbox) {
    const zeros = "0".repeat(settings?.code_length ?? 6);
    return {
      explanation: `A sandbox verification: nothing reaches a phone or mailbox, and the code is always zeros (${zeros}).${wrongCodes}`,
      next_steps: ["Check the code with zeros; webhooks and logs work as they do live."],
    };
  }
  if (!lastSend) {
    return {
      explanation: `No code has been confirmed sent yet.${wrongCodes}`,
      next_steps: [
        `Starting again for the same destination sends a code (${ref.start_verification}); at most 5 codes per verification, and 5 per destination every 10 minutes.`,
      ],
    };
  }
  const age = minutesSince(lastSend.created_at, now);
  const delivery = latest?.diagnosis;
  if (delivery && delivery.verdict === "not_delivered") {
    return {
      explanation: `The latest code went out ${age} minute(s) ago and wasn't delivered: ${delivery.summary}${wrongCodes}`,
      next_steps:
        latest?.kind === "sms"
          ? latest.diagnosis.next_steps
          : (latest?.diagnosis.recipients.flatMap((recipient) => recipient.next_steps) ?? []),
    };
  }
  return {
    explanation:
      `The latest code went out ${age} minute(s) ago. ${ROUTES[lastSend.route]}` +
      (delivery ? ` ${delivery.summary}` : "") +
      wrongCodes,
    next_steps: [
      verification.attempts > 0
        ? "Make sure the end user types the latest code, not one from an earlier message."
        : `If it never arrives, starting again sends a new code (${ref.start_verification}); at most 5 per verification.`,
    ],
  };
}

function adviceFor(
  verification: Verification,
  latest: VerificationDiagnosis["latest_send"],
  settings: VerifySettings | null | undefined,
  now: Date,
  ref: ProductReferences,
): Advice {
  switch (verification.status) {
    case "approved":
      return {
        explanation: `The right code was checked at ${verification.approved_at}: the end user has the ${verification.channel === "sms" ? "phone" : "mailbox"}.`,
        next_steps: [],
      };
    case "pending":
      return pendingAdvice(verification, latest, settings, now, ref);
    case "expired":
      return {
        explanation: `Its code stopped working at ${verification.expires_at}. Checks answer \`valid: false\` from then on, even with the right code.`,
        next_steps: [`Start a new verification (${ref.start_verification}).`],
      };
    case "canceled":
      return {
        explanation: "It was canceled, so its code stopped working.",
        next_steps: [`Start a new verification (${ref.start_verification}) if it's still needed.`],
      };
    case "blocked":
      return {
        explanation:
          "The fraud guard stopped it before anything was sent or billed (`verification_blocked`).",
        next_steps: [
          `If this is a real user, add them, their IP address or their country to the Risk allow list (${ref.add_risk_list_entry}): an allow-list match lets a verification through.`,
          "Otherwise tell the user you can't send a code right now; don't retry in a loop.",
        ],
      };
    case "failed":
      return failureAdvice(verification, verification.failure?.code ?? "", ref);
  }
}

function summarize(verification: Verification, verdict: VerificationVerdict): string {
  const sandbox = verification.sandbox ? " Sandbox: nothing was actually sent." : "";
  switch (verdict) {
    case "approved":
      return `Approved: the right code was checked for ${verification.to}.${sandbox}`;
    case "awaiting_code":
      return `Waiting for the right code from ${verification.to} (${verification.attempts} of ${verification.max_attempts} attempts used).${sandbox}`;
    case "blocked":
      return `Blocked by the fraud guard (${verification.reasons.map((reason) => reason.code).join(", ") || "no reason given"}): no code was sent.${sandbox}`;
    case "too_many_attempts":
      return `Failed: too many wrong codes.${sandbox}`;
    case "send_failed":
      return `Failed: the code couldn't be sent (${verification.failure?.code ?? "unknown"}).${sandbox}`;
    case "expired":
      return `Expired at ${verification.expires_at}.${sandbox}`;
    case "canceled":
      return `Canceled.${sandbox}`;
  }
}

function warningsFor(
  verification: Verification,
  context: VerificationDiagnosisContext,
  ref: ProductReferences,
): string[] {
  const warnings: string[] = [];
  if (verification.sandbox || verification.channel !== "sms") return warnings;
  const { settings, senderNumber } = context;
  if (settings && settings.sms_from === null) {
    warnings.push(
      `This environment has no number of its own, so live SMS codes use coss.com's shared numbers, which may answer \`shared_sender_unavailable\`. Set \`sms_from\` to one of your approved numbers (${ref.update_verify_settings}, ${ref.list_sms_numbers}).`,
    );
  }
  if (settings?.sms_from && senderNumber === null) {
    warnings.push(
      `\`sms_from\` is ${settings.sms_from}, which isn't one of the organization's numbers now (${ref.list_sms_numbers}).`,
    );
  } else if (settings?.sms_from && senderNumber && !senderNumber.can_send) {
    warnings.push(
      `\`sms_from\` is ${senderNumber.phone_number}, which can't send live messages now (status ${senderNumber.status}, registration ${senderNumber.registration_status ?? "none"}): see ${ref.list_sms_numbers}.`,
    );
  }
  if (
    settings &&
    verification.country &&
    !settings.allowed_countries.includes(verification.country)
  ) {
    warnings.push(
      `${verification.country} is no longer in \`allowed_countries\` (${ref.get_verify_settings}): new codes to it are refused.`,
    );
  }
  return warnings;
}

export interface VerificationDiagnosisContext {
  settings?: VerifySettings | null;
  /** `settings.sms_from` as the organization has it; `null` when it isn't one of its numbers. */
  senderNumber?: Pick<
    SmsNumber,
    "phone_number" | "status" | "registration_status" | "can_send"
  > | null;
  /** The latest send's SMS, when it's in this environment. */
  sms?: { sms: Sms; events: SmsEvent[] } | null;
  /** The latest send's email, when it's in this environment. */
  email?: { email: Email; events: EmailEvent[] } | null;
}

export function diagnoseVerification(input: {
  verification: Verification;
  context?: VerificationDiagnosisContext;
  now?: Date;
  references?: Partial<ProductReferences>;
  /** How the latest email's next steps name the ways to look further. */
  emailReferences?: Partial<DiagnosisReferences>;
}): VerificationDiagnosis {
  const { verification } = input;
  const context = input.context ?? {};
  const now = input.now ?? new Date();
  const ref = productReferences(input.references);
  const latest: VerificationDiagnosis["latest_send"] = context.sms
    ? {
        kind: "sms",
        diagnosis: diagnoseSms({ ...context.sms, now, references: input.references }),
      }
    : context.email
      ? {
          kind: "email",
          diagnosis: diagnoseEmail({ ...context.email, now, references: input.emailReferences }),
        }
      : null;
  const verdict = verdictOf(verification);
  const advice = adviceFor(verification, latest, context.settings, now, ref);
  const failure = verification.failure
    ? { ...verification.failure, ...failureAdvice(verification, verification.failure.code, ref) }
    : null;
  return {
    verification_id: verification.id,
    channel: verification.channel,
    to: verification.to,
    country: verification.country,
    status: verification.status,
    sandbox: verification.sandbox,
    verdict,
    summary: summarize(verification, verdict),
    explanation: advice.explanation,
    failure,
    reasons: verification.reasons.map((reason) => ({
      ...reason,
      explanation: VERIFICATION_REASON_EXPLANATIONS[reason.code] ?? "A fraud guard signal.",
    })),
    attempts: verification.attempts,
    max_attempts: verification.max_attempts,
    attempts_left: Math.max(0, verification.max_attempts - verification.attempts),
    sends: verification.sends.map((send) => ({
      ...send,
      route_explanation: ROUTES[send.route],
    })),
    latest_send: latest,
    next_steps: advice.next_steps,
    warnings: warningsFor(verification, context, ref),
    expires_at: verification.expires_at,
    approved_at: verification.approved_at,
    created_at: verification.created_at,
  };
}

/**
 * Reads a verification, then best effort its settings, sending number and latest message, and
 * diagnoses it. Fails only when the verification can't be read.
 */
export async function fetchVerificationDiagnosis(
  coss: Coss,
  id: string,
  options: {
    signal?: AbortSignal;
    now?: Date;
    references?: Partial<ProductReferences>;
    emailReferences?: Partial<DiagnosisReferences>;
  } = {},
): Promise<CossResult<VerificationDiagnosis>> {
  const read = { signal: options.signal };
  const verification = await coss.verify.get(id, read);
  if (verification.error) return verification;
  const latest = verification.data.sends.at(-1);
  const [settings, numbers, sms, smsEvents, email, emailEvents] = await Promise.all([
    softly(coss.verify.settings.get(read)),
    verification.data.sandbox || verification.data.channel !== "sms"
      ? undefined
      : softly(coss.sms.numbers.list(read)),
    latest?.sms_id ? softly(coss.sms.get(latest.sms_id, read)) : undefined,
    latest?.sms_id ? softly(coss.sms.listEvents(latest.sms_id, read)) : undefined,
    latest?.email_id ? softly(coss.email.get(latest.email_id, read)) : undefined,
    latest?.email_id ? softly(coss.email.listEvents(latest.email_id, read)) : undefined,
  ]);
  const senderNumber =
    numbers && settings?.sms_from
      ? (numbers.data.find((number) => number.phone_number === settings.sms_from) ?? null)
      : undefined;
  return {
    data: diagnoseVerification({
      verification: verification.data,
      context: {
        ...(settings ? { settings } : {}),
        ...(senderNumber !== undefined ? { senderNumber } : {}),
        ...(sms && smsEvents ? { sms: { sms, events: smsEvents.data } } : {}),
        ...(email && emailEvents ? { email: { email, events: emailEvents.data } } : {}),
      },
      now: options.now,
      references: options.references,
      emailReferences: options.emailReferences,
    }),
    error: null,
  };
}
