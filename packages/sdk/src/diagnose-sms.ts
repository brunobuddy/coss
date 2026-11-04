/**
 * Turns an SMS, its events and some account context into a plain-language delivery verdict: what
 * happened to the message, why, and what to do about it. `diagnoseSms` is pure (callers fetch, it
 * decides); `fetchSmsDiagnosis` fetches first.
 *
 * The failure codes and their meaning must match the SMS product's behaviour
 * (`packages/sms/src/failures.ts`, `service.ts`, `sweeps.ts`): change both together.
 */
import type { Coss } from "./client.ts";
import type { CossResult } from "./core/errors.ts";
import {
  minutesSince,
  type ProductReferences,
  productReferences,
  softly,
} from "./diagnose-shared.ts";
import type { ReputationStatus } from "./types/reputation.ts";
import type { Sms, SmsEvent, SmsNumber, SmsSuppression } from "./types/sms.ts";

export type SmsVerdict = "delivered" | "in_progress" | "scheduled" | "canceled" | "not_delivered";

export interface SmsDiagnosis {
  sms_id: string;
  from: string;
  to: string;
  country: string;
  status: Sms["status"];
  sandbox: boolean;
  verdict: SmsVerdict;
  summary: string;
  explanation: string;
  failure: { code: string; message: string; explanation: string; next_steps: string[] } | null;
  /** The provider's or carrier's own error code, the matched suppression entry… */
  details?: Record<string, unknown>;
  next_steps: string[];
  /** Account or setup problems that affect this message or the next ones. */
  warnings: string[];
  segments: number;
  timeline: { at: string; type: string; failure_code?: string }[];
  created_at: string;
  scheduled_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
}

export interface SmsDiagnosisContext {
  /** The recipient's suppression entry now (`coss.sms.suppressions.check`); `null`: none. */
  suppression?: SmsSuppression | null;
  /** The `from` number as the organization has it; `null` when it isn't one of its numbers. */
  number?: Pick<
    SmsNumber,
    "phone_number" | "status" | "registration_status" | "can_send" | "receives_here"
  > | null;
  reputation?: { status: ReputationStatus; reason: string | null } | null;
  billing?: { status: string; holds: { reason: string; since: string }[] } | null;
}

type Advice = { explanation: string; next_steps: string[] };

function registrationStep(ref: ProductReferences): string {
  return `Check the sending number's carrier registration (${ref.list_sms_numbers}: \`registration_status\` must be approved and \`can_send\` true); registration is done in the dashboard, under SMS.`;
}

/** Failure codes on messages and what they mean for the developer. */
export function smsFailures(ref: ProductReferences): Readonly<Record<string, Advice>> {
  const REGISTRATION_STEP = registrationStep(ref);
  return {
    invalid_number: {
      explanation:
        "The number can't receive SMS: it doesn't exist, or isn't a mobile number (e.g. a landline). " +
        "coss.com added it to the environment's SMS suppression list (reason invalid_number), so " +
        "later messages to it are skipped.",
      next_steps: [
        "Check the number: full E.164 form with the country code (+14155550123), no trunk prefix.",
        `Ask the recipient for a mobile number. Only remove the suppression (${ref.remove_sms_suppression}) if the number is known to receive SMS now.`,
      ],
    },
    opted_out: {
      explanation:
        "The recipient opted out of messages from this number (they replied STOP, or the carrier " +
        "reports an opt-out). coss.com added it to this environment's SMS suppression list (reason " +
        "opt_out); a STOP reply adds it to every live environment's.",
      next_steps: [
        "Don't message this number again unless the person asks to: texting START to your number opts them in again and removes the entry.",
        "Never remove an opt_out entry on your own; sending to people who opted out breaks carrier rules and hurts your reputation.",
      ],
    },
    country_not_permitted: {
      explanation: "SMS to the recipient's country isn't enabled for the organization's sender.",
      next_steps: [
        "Owners and admins allow countries in the dashboard, under SMS.",
        "If the country is already allowed, contact coss.com support with the message id.",
      ],
    },
    country_not_allowed: {
      explanation:
        "SMS to the recipient's country wasn't allowed for the organization when the scheduled " +
        "message was due (or the sender is a toll-free number, which only reaches the US and Canada).",
      next_steps: [
        "Owners and admins allow countries in the dashboard, under SMS; send again afterwards.",
      ],
    },
    unroutable: {
      explanation:
        "The message can't be routed from this number to the recipient's carrier (for example a " +
        "number type or country pairing carriers don't connect).",
      next_steps: [
        `Try sending from another of your numbers (${ref.list_sms_numbers}).`,
        "If it keeps happening, contact coss.com support with the message id.",
      ],
    },
    unreachable: {
      explanation:
        "The recipient's phone was unreachable (switched off or out of coverage) for as long as " +
        "the carrier kept trying.",
      next_steps: ["Send again later."],
    },
    blocked: {
      explanation:
        "The recipient's carrier or the recipient blocked the message (for example a blocked " +
        "sender, or a number that doesn't accept messages from short codes or apps).",
      next_steps: [
        "Make sure the recipient expects messages from this number; don't retry in a loop.",
      ],
    },
    carrier_filtered: {
      explanation:
        "The carrier filtered the message as spam or unregistered traffic. Filtered messages count " +
        "against the organization's SMS reputation.",
      next_steps: [
        REGISTRATION_STEP,
        "Review the content: name your brand, avoid URL shorteners and spam-like wording, and match what the registered campaign describes.",
      ],
    },
    sender_unregistered: {
      explanation:
        "The sending number isn't registered for US A2P messaging yet (10DLC), or the toll-free " +
        "number isn't verified, so US carriers refuse its messages.",
      next_steps: [REGISTRATION_STEP, "Send again once the registration is approved."],
    },
    provider_error: {
      explanation: "The SMS provider refused the message when coss.com handed it over.",
      next_steps: [
        "Send it again later.",
        "If it keeps happening, contact coss.com support with the message id.",
      ],
    },
    undelivered: {
      explanation: "The carrier couldn't deliver the message and gave no more specific reason.",
      next_steps: [
        "Check that the number is a mobile number that can receive SMS, and send again later.",
      ],
    },
    suppressed: {
      explanation:
        "coss.com skipped the message because the number is on the environment's SMS suppression " +
        "list (an earlier opt-out, a number that can't receive SMS, or a manual entry). It was " +
        "never handed to a carrier and isn't billed.",
      next_steps: [
        `Look at the entry (${ref.check_sms_suppression}).`,
        `An opt_out entry is removed when the person texts START; remove other entries (${ref.remove_sms_suppression}) only if the number works and wants your messages.`,
      ],
    },
    content_rejected: {
      explanation:
        "coss.com's content screening blocked the message as abusive (for example phishing or " +
        "spam). This can also suspend the organization's live sending.",
      next_steps: [
        "Review the message's text and links.",
        `Check the account status (${ref.get_account_status}); if this is a false positive, contact coss.com support.`,
      ],
    },
    content_screening_unavailable: {
      explanation:
        "The message was held because content screening was unavailable, and coss.com gave up after an hour.",
      next_steps: ["Send the message again."],
    },
    dispatch_failed: {
      explanation:
        "coss.com could not hand the message to the SMS provider within an hour of when it was due.",
      next_steps: ["Send the message again (with a new idempotency key)."],
    },
    dispatch_interrupted: {
      explanation:
        "Sending was interrupted before the SMS provider confirmed it. The provider may still have " +
        "sent it; a late status report from it would turn the message back to sent or delivered.",
      next_steps: [
        "Check again in a few minutes before resending, so the recipient doesn't get it twice.",
      ],
    },
    sender_unavailable: {
      explanation: "The number the message was sent from was released before the message went out.",
      next_steps: [`Send again from one of your active numbers (${ref.list_sms_numbers}).`],
    },
    sender_not_found: {
      explanation:
        "When the scheduled message was due, `from` was no longer one of the organization's numbers.",
      next_steps: [`Send again from one of your active numbers (${ref.list_sms_numbers}).`],
    },
    sender_not_ready: {
      explanation:
        "When the scheduled message was due, the sending number's carrier registration wasn't approved.",
      next_steps: [REGISTRATION_STEP, "Send again once it can send."],
    },
    hipaa_mode_restriction: {
      explanation:
        "The organization is in HIPAA mode, which only sends SMS to some countries, and this number isn't in one of them (the message says which). No API key changes that.",
      next_steps: [
        "Don't work around it: tell the user what was refused, and reach this person another way.",
      ],
    },
    account_suspended: {
      explanation:
        "Live sending is suspended for the organization because of its sending reputation.",
      next_steps: [
        `Check the account status (${ref.get_account_status}) for the reason and the checks behind it.`,
        "Contact coss.com support; a suspension is only lifted by support.",
      ],
    },
  };
}

/** The failure codes with the SDK's calls in their next steps. */
export const SMS_FAILURES: Readonly<Record<string, Advice>> = smsFailures(productReferences());

const UNKNOWN_FAILURE: Advice = {
  explanation: "The message could not be sent.",
  next_steps: [
    "Check the failure message; send again or contact coss.com support with the message id.",
  ],
};

/**
 * The SMS simulator's numbers (`+1 500 555 0xxx`, `isSimulatorNumber` in `packages/sms/src/phone.ts`):
 * their failures are produced on purpose and never add a suppression entry.
 */
const SIMULATOR_PREFIX = "+1500555";
const SUPPRESSING_FAILURES = new Set(["invalid_number", "opted_out"]);

function describeFailure(
  failure: { code: string; message: string },
  to: string,
  ref: ProductReferences,
) {
  if (to.startsWith(SIMULATOR_PREFIX) && SUPPRESSING_FAILURES.has(failure.code)) {
    return {
      ...failure,
      explanation:
        `The SMS simulator's ${failure.code} number produced this outcome on purpose. Simulator ` +
        "numbers are never added to the suppression list, so sending to it again gives the same " +
        "outcome.",
      next_steps: [
        `Nothing to fix: handle the failure the way your code would handle a real one (a real ${failure.code} number is added to the suppression list, and later sends to it are skipped).`,
      ],
    };
  }
  return { ...failure, ...(smsFailures(ref)[failure.code] ?? UNKNOWN_FAILURE) };
}

/** The latest event of one of these types (events come oldest first). */
function latest(events: SmsEvent[], types: SmsEvent["type"][]): SmsEvent | undefined {
  let found: SmsEvent | undefined;
  for (const event of events) if (types.includes(event.type)) found = event;
  return found;
}

function suppressionNote(entry: SmsSuppression | null | undefined) {
  return entry
    ? {
        suppression: {
          id: entry.id,
          reason: entry.reason,
          sms_id: entry.sms_id,
          created_at: entry.created_at,
        },
      }
    : {};
}

function verdictOf(status: Sms["status"]): SmsVerdict {
  switch (status) {
    case "delivered":
      return "delivered";
    case "queued":
    case "sent":
      return "in_progress";
    case "scheduled":
      return "scheduled";
    case "canceled":
      return "canceled";
    case "failed":
    case "undelivered":
      return "not_delivered";
  }
}

function outcome(
  sms: Sms,
  events: SmsEvent[],
  context: SmsDiagnosisContext,
  now: Date,
  ref: ProductReferences,
): Advice {
  switch (sms.status) {
    case "delivered":
      return {
        explanation: sms.sandbox
          ? "Delivered (simulated: sandbox messages never reach a phone)."
          : "The recipient's carrier confirmed delivery to the phone.",
        next_steps: [],
      };
    case "sent": {
      const age = sms.sent_at ? minutesSince(sms.sent_at, now) : 0;
      return {
        explanation:
          `The SMS provider accepted the message${sms.sent_at ? ` ${age} minute(s) ago` : ""}; ` +
          "there's no delivery report from the recipient's carrier yet.",
        next_steps:
          age >= 10
            ? [
                "Delivery reports usually arrive within seconds to minutes, but some carriers and countries never send one: the message may well have arrived. Ask the recipient if in doubt.",
              ]
            : ["Check again in a minute."],
      };
    }
    case "queued": {
      const age = minutesSince(sms.scheduled_at ?? sms.created_at, now);
      return age < 2
        ? {
            explanation: "The message is queued and will be handed to the provider in a moment.",
            next_steps: ["Check again in a minute."],
          }
        : {
            explanation:
              `The message has been queued for ${age} minutes without being handed to the provider. ` +
              "Live messages wait while content screening is unavailable (retried every minute); " +
              "after an hour it fails with dispatch_failed or content_screening_unavailable.",
            next_steps: [
              `Check the account status (${ref.get_account_status}) for billing holds or a suspension.`,
            ],
          };
    }
    case "scheduled":
      return {
        explanation: `The message is scheduled for ${sms.scheduled_at ?? "later"}.`,
        next_steps:
          !sms.sandbox && context.number && !context.number.can_send
            ? [`${registrationStep(ref)} Otherwise it fails when it is due.`]
            : [],
      };
    case "canceled":
      return {
        explanation: "The scheduled message was canceled before it was sent.",
        next_steps: [],
      };
    case "failed":
    case "undelivered": {
      if (sms.failure) {
        const failure = describeFailure(sms.failure, sms.to, ref);
        return { explanation: failure.explanation, next_steps: failure.next_steps };
      }
      const undelivered = latest(events, ["sms.undelivered", "sms.failed"])?.data.failure;
      return undelivered
        ? describeFailure(undelivered, sms.to, ref)
        : sms.status === "undelivered"
          ? (smsFailures(ref).undelivered ?? UNKNOWN_FAILURE)
          : UNKNOWN_FAILURE;
    }
  }
}

function summarize(sms: Sms, verdict: SmsVerdict, failure: SmsDiagnosis["failure"]): string {
  const sandbox = sms.sandbox ? " Sent with a sandbox key, so nothing actually left coss.com." : "";
  switch (verdict) {
    case "delivered":
      return `Delivered to ${sms.to}.${sandbox}`;
    case "in_progress":
      return `Not finished yet (${sms.status}).${sandbox}`;
    case "scheduled":
      return `Scheduled for ${sms.scheduled_at}; not sent yet.${sandbox}`;
    case "canceled":
      return "Canceled before it was sent.";
    case "not_delivered":
      return failure
        ? `Not delivered (${sms.status}): ${failure.code} — ${failure.message}${sandbox}`
        : `Not delivered (${sms.status}).${sandbox}`;
  }
}

function warningsFor(sms: Sms, context: SmsDiagnosisContext, ref: ProductReferences): string[] {
  const warnings: string[] = [];
  if (sms.sandbox) {
    warnings.push(
      "Sandbox message: nothing is sent to real phones and outcomes are simulated. Use a live (coss_live_) key and one of the organization's registered numbers to send for real.",
    );
  }
  if (!sms.sandbox && context.number === null) {
    warnings.push(
      `${sms.from} is not one of the organization's numbers, so live sends from it are refused (sender_not_found).`,
    );
  } else if (!sms.sandbox && context.number && !context.number.can_send) {
    warnings.push(
      `${context.number.phone_number} can't send live messages now (status ${context.number.status}, registration ${context.number.registration_status ?? "none"}). ${registrationStep(ref)}`,
    );
  }
  const entry = context.suppression;
  if (entry && sms.failure?.code !== "suppressed") {
    warnings.push(
      `${sms.to} is on the environment's SMS suppression list (reason ${entry.reason}): later messages to it are skipped.`,
    );
  }
  if (context.reputation?.status === "suspended") {
    warnings.push(
      `Live sending is suspended for the organization (${context.reputation.reason ?? "reputation"}); contact coss.com support.`,
    );
  } else if (context.reputation?.status === "warning") {
    warnings.push(
      `The organization's sending reputation has a warning (${context.reputation.reason ?? `see ${ref.get_account_status}`}); opt-outs and filtered messages should come down before it is suspended.`,
    );
  }
  if (context.billing && context.billing.holds.length > 0) {
    warnings.push(
      `Live sending is on a billing hold (${context.billing.holds.map((h) => h.reason).join(", ")}): scheduled messages wait and new live sends are refused until it is lifted.`,
    );
  }
  return warnings;
}

export function diagnoseSms(input: {
  sms: Sms;
  /** The message's events, oldest first (`coss.sms.listEvents`). */
  events: SmsEvent[];
  context?: SmsDiagnosisContext;
  now?: Date;
  /** How next steps name the ways to look further (default: the SDK's calls). */
  references?: Partial<ProductReferences>;
}): SmsDiagnosis {
  const ref = productReferences(input.references);
  const { sms, events } = input;
  const context = input.context ?? {};
  const now = input.now ?? new Date();
  const verdict = verdictOf(sms.status);
  const failure = sms.failure ? describeFailure(sms.failure, sms.to, ref) : null;
  const advice = outcome(sms, events, context, now, ref);
  const providerErrorCode = latest(events, ["sms.undelivered", "sms.failed"])?.data
    .provider_error_code;
  const matched = latest(events, ["sms.suppressed"])?.data.suppression;
  const details = {
    ...(providerErrorCode ? { provider_error_code: providerErrorCode } : {}),
    ...(matched ? { matched_suppression: matched } : {}),
    ...(verdict === "not_delivered" ? suppressionNote(context.suppression) : {}),
  };
  return {
    sms_id: sms.id,
    from: sms.from,
    to: sms.to,
    country: sms.country,
    status: sms.status,
    sandbox: sms.sandbox,
    verdict,
    summary: summarize(sms, verdict, failure),
    explanation: advice.explanation,
    failure,
    ...(Object.keys(details).length > 0 ? { details } : {}),
    next_steps: advice.next_steps,
    warnings: warningsFor(sms, context, ref),
    segments: sms.segments,
    timeline: events.map((event) => ({
      at: event.occurred_at,
      type: event.type,
      ...(event.data.failure ? { failure_code: event.data.failure.code } : {}),
    })),
    created_at: sms.created_at,
    scheduled_at: sms.scheduled_at,
    sent_at: sms.sent_at,
    delivered_at: sms.delivered_at,
  };
}

/**
 * The account context of a message, best effort: the recipient's suppression entry, its `from`
 * number, the organization's reputation and billing holds. A call that fails (or a key without
 * access to it) is left out.
 */
export async function smsDiagnosisContext(
  coss: Coss,
  sms: Sms,
  options: { signal?: AbortSignal } = {},
): Promise<SmsDiagnosisContext> {
  const read = { signal: options.signal };
  const [check, numbers, reputation, billing] = await Promise.all([
    softly(coss.sms.suppressions.check({ phone_number: sms.to }, read)),
    sms.sandbox ? undefined : softly(coss.sms.numbers.list(read)),
    softly(coss.reputation.get(read)),
    softly(coss.billing.get(read)),
  ]);
  const number = numbers
    ? (numbers.data.find((n) => n.phone_number === sms.from) ?? null)
    : undefined;
  return {
    ...(check ? { suppression: check.suppression } : {}),
    ...(number !== undefined
      ? {
          number: number && {
            phone_number: number.phone_number,
            status: number.status,
            registration_status: number.registration_status,
            can_send: number.can_send,
            receives_here: number.receives_here,
          },
        }
      : {}),
    ...(reputation ? { reputation: { status: reputation.status, reason: reputation.reason } } : {}),
    ...(billing ? { billing: { status: billing.status, holds: billing.holds } } : {}),
  };
}

/** Reads a message, its events and its context, and diagnoses it. Fails only on the first two. */
export async function fetchSmsDiagnosis(
  coss: Coss,
  smsId: string,
  options: { signal?: AbortSignal; now?: Date; references?: Partial<ProductReferences> } = {},
): Promise<CossResult<SmsDiagnosis>> {
  const read = { signal: options.signal };
  const sms = await coss.sms.get(smsId, read);
  if (sms.error) return sms;
  const [events, context] = await Promise.all([
    coss.sms.listEvents(smsId, read),
    smsDiagnosisContext(coss, sms.data, read),
  ]);
  if (events.error) return events;
  return {
    data: diagnoseSms({
      sms: sms.data,
      events: events.data.data,
      context,
      now: options.now,
      references: options.references,
    }),
    error: null,
  };
}
