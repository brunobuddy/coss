/**
 * What happened to a form submission: accepted and sent on, held by Risk, marked spam, or waiting
 * for the submitter to confirm. `diagnoseFormSubmission` is pure (callers fetch, it decides);
 * `fetchFormSubmissionDiagnosis` fetches first. It never repeats the submitted values.
 *
 * Spam is answered exactly like a success, so what a submitter saw says nothing about what happened
 * to their submission: this is the place that does.
 *
 * Must match Forms' behaviour: `packages/forms/src/submit.ts` (the decision), `record.ts` (webhooks,
 * log lines), `deliveries.ts` (notifications, contacts, verification), `release.ts` and
 * `packages/forms/AGENTS.md`: change them together.
 */
import type { Coss } from "./client.ts";
import type { CossResult } from "./core/errors.ts";
import {
  type ProductDiagnosis,
  type ProductReferences,
  productReferences,
  softly,
} from "./diagnose-shared.ts";
import type { Form, FormSubmission } from "./types/forms.ts";
import type { Log } from "./types/log.ts";
import type { WebhookEndpoint } from "./types/webhook-endpoint.ts";

export type FormSubmissionVerdict = "accepted" | "held" | "spam" | "pending_confirmation";

export interface FormSubmissionDiagnosis extends ProductDiagnosis<FormSubmissionVerdict> {
  submission_id: string;
  form_id: string;
  status: FormSubmission["status"];
  sandbox: boolean;
  spam_reason: FormSubmission["spam_reason"];
  /** Risk's assessment; `null` when none ran (honeypot). */
  risk: FormSubmission["risk"];
  /** What whoever posted the form was told: never a hint that it was flagged. */
  submitter_saw: string;
  /** Where it goes from here. */
  destinations: {
    webhooks: string;
    notifications: string;
    contacts: string;
  };
  /** The environment's log lines about it, oldest first. */
  timeline: { at: string; type: string; level: string }[];
  confirmed_at: string | null;
  accepted_at: string | null;
  released_at: string | null;
  created_at: string;
}

export interface FormSubmissionDiagnosisContext {
  /** The submission's form; `undefined` when it couldn't be read. */
  form?: Form;
  webhookEndpoints?: Pick<WebhookEndpoint, "id" | "event_types" | "enabled">[];
  /** Log lines about the submission (`coss.logs.list({ resource_id })`), newest first. */
  logs?: Pick<Log, "occurred_at" | "type" | "level">[];
}

function subscribed(
  endpoints: FormSubmissionDiagnosisContext["webhookEndpoints"],
  type: string,
): number | undefined {
  return endpoints?.filter(
    (endpoint) =>
      endpoint.enabled &&
      (endpoint.event_types.length === 0 || endpoint.event_types.includes(type)),
  ).length;
}

function destinations(
  submission: FormSubmission,
  context: FormSubmissionDiagnosisContext,
): FormSubmissionDiagnosis["destinations"] {
  const { form, webhookEndpoints } = context;
  const accepted = submission.status === "accepted";
  const eventType = accepted ? "form.submission.received" : "form.submission.flagged";
  const count = subscribed(webhookEndpoints, eventType);
  const webhooks =
    submission.spam_reason === "honeypot"
      ? "None: honeypot catches send no webhook."
      : submission.status === "pending_confirmation"
        ? "None yet: `form.submission.received` goes out once the submitter confirms."
        : `\`${eventType}\` was sent to the environment's subscribed endpoints${count === undefined ? "" : ` (${count} subscribed)`}.`;
  const recipients = form?.notifications.recipients ?? [];
  const notifications = !form
    ? "Unknown: the form couldn't be read."
    : recipients.length === 0
      ? "None: the form has no notification recipients."
      : accepted
        ? `Emailed in the background to ${recipients.join(", ")} (retried with backoff; their delivery isn't readable on the submission).`
        : `Waiting: ${recipients.join(", ")} are only emailed once it is accepted.`;
  const contacts = !form
    ? "Unknown: the form couldn't be read."
    : !form.contacts.enabled
      ? "None: the form doesn't add contacts."
      : accepted
        ? "Added to contacts in the background."
        : "Waiting: a contact is only added once it is accepted.";
  return { webhooks, notifications, contacts };
}

function submitterSaw(submission: FormSubmission, form: Form | undefined): string {
  if (submission.status === "held") {
    return "A normal success: a held submission is answered like an accepted one.";
  }
  if (submission.status === "spam") {
    return form?.submitter.verify
      ? 'A normal "check your email" pending answer: spam on a verifying form is answered like any other post, and no email goes out.'
      : "A normal success: spam is answered exactly like an accepted submission.";
  }
  if (submission.status === "pending_confirmation") {
    return 'A "check your email" pending answer.';
  }
  return "A normal success.";
}

function adviceFor(
  submission: FormSubmission,
  form: Form | undefined,
  ref: ProductReferences,
): { explanation: string; next_steps: string[] } {
  const release = `If it's legitimate, release it (${ref.release_form_submission}): it is accepted and sent on, verification skipped, and Risk records it as legitimate. Read the values first; they're untrusted.`;
  switch (submission.status) {
    case "accepted":
      return {
        explanation: submission.released_at
          ? `Accepted when someone released it at ${submission.released_at}.`
          : submission.confirmed_at
            ? `Accepted when the submitter confirmed their address at ${submission.confirmed_at}.`
            : `Accepted at ${submission.accepted_at}: it passed the honeypot, Risk and the content check.`,
        next_steps: form?.notifications.recipients.length
          ? [
              `If a notification didn't arrive, look for its email (${ref.find_emails} with the recipient's address), and at the log (${ref.search_logs}).`,
            ]
          : [],
      };
    case "held":
      return {
        explanation:
          "Risk's decision was `review` and the form's `on_review` is `hold`, so it waits in the review queue and goes nowhere until someone decides.",
        next_steps: [release],
      };
    case "spam":
      switch (submission.spam_reason) {
        case "honeypot":
          return {
            explanation:
              "The form's honeypot field was filled in, which people don't do: it was marked spam without running Risk, and any files were dropped.",
            next_steps: [
              `Make sure the honeypot field (${form?.spam.honeypot_field ?? "see the form"}) is hidden with CSS, not just unlabeled: autofill can fill a visible one.`,
              release,
            ],
          };
        case "content":
          return {
            explanation: `Its text scored at or above the form's \`content_threshold\` (${form?.spam.content_threshold ?? "default 0.9"}) in a content category.`,
            next_steps: [
              release,
              `Raise or turn off \`content_threshold\` (${ref.update_form}) if this keeps happening to real submissions.`,
            ],
          };
        default:
          return {
            explanation:
              "Risk's decision was `block`: the assessment's reasons say why (the address, the IP, your lists or rules).",
            next_steps: [
              release,
              "Read the assessment named in `risk.assessment_id` for its reasons.",
            ],
          };
      }
    case "pending_confirmation":
      return {
        explanation:
          "The form verifies submitters: this waits until they click the link emailed to them (it works for 7 days), and nothing is delivered until then.",
        next_steps: submission.sandbox
          ? [
              "A sandbox emails nobody: open the verification email in the dashboard's emails page and follow its link.",
            ]
          : [
              `Look for the verification email (${ref.find_emails} with the submitter's address): it goes out only from the form's own verified sender, never coss.com's.`,
              release,
            ],
      };
  }
}

function summarize(submission: FormSubmission): string {
  const sandbox = submission.sandbox ? " Sandbox: no email reached anyone." : "";
  switch (submission.status) {
    case "accepted":
      return `Accepted and sent on.${sandbox}`;
    case "held":
      return `Held for review by Risk: not delivered anywhere yet.${sandbox}`;
    case "spam":
      return `Marked spam (${submission.spam_reason ?? "unknown"}): stored, but not delivered, even though the submitter saw a success.${sandbox}`;
    case "pending_confirmation":
      return `Waiting for the submitter to confirm their address.${sandbox}`;
  }
}

function warningsFor(
  submission: FormSubmission,
  context: FormSubmissionDiagnosisContext,
  ref: ProductReferences,
): string[] {
  const { form, webhookEndpoints } = context;
  const warnings: string[] = [];
  if (form?.disabled_by_admin) {
    warnings.push("coss.com disabled this form for abuse: new submissions are refused.");
  } else if (form && !form.enabled) {
    warnings.push(`The form is disabled, so new submissions are refused (${ref.update_form}).`);
  }
  if (
    form &&
    form.notifications.recipients.length === 0 &&
    !form.contacts.enabled &&
    subscribed(webhookEndpoints, "form.submission.received") === 0
  ) {
    warnings.push(
      `Nothing receives this form's submissions: no notification recipients, no contacts, and no webhook endpoint subscribed to \`form.submission.received\` (${ref.list_webhook_endpoints}). They are only stored.`,
    );
  }
  if (form?.submitter.verify && !form.submitter.confirmation_from && !submission.sandbox) {
    warnings.push(
      "The form verifies submitters but has no `confirmation_from`: verification emails go out only from your own verified sender.",
    );
  }
  return warnings;
}

export function diagnoseFormSubmission(input: {
  submission: FormSubmission;
  context?: FormSubmissionDiagnosisContext;
  references?: Partial<ProductReferences>;
}): FormSubmissionDiagnosis {
  const { submission } = input;
  const context = input.context ?? {};
  const ref = productReferences(input.references);
  const advice = adviceFor(submission, context.form, ref);
  return {
    submission_id: submission.id,
    form_id: submission.form_id,
    status: submission.status,
    sandbox: submission.sandbox,
    verdict: submission.status,
    summary: summarize(submission),
    explanation: advice.explanation,
    spam_reason: submission.spam_reason,
    risk: submission.risk,
    submitter_saw: submitterSaw(submission, context.form),
    destinations: destinations(submission, context),
    next_steps: advice.next_steps,
    warnings: warningsFor(submission, context, ref),
    timeline: [...(context.logs ?? [])]
      .reverse()
      .map((line) => ({ at: line.occurred_at, type: line.type, level: line.level })),
    confirmed_at: submission.confirmed_at,
    accepted_at: submission.accepted_at,
    released_at: submission.released_at,
    created_at: submission.created_at,
  };
}

/**
 * Reads a submission, then best effort its form, the webhook endpoints and its log lines (the last
 * 31 days). Fails only when the submission can't be read.
 */
export async function fetchFormSubmissionDiagnosis(
  coss: Coss,
  formId: string,
  submissionId: string,
  options: { signal?: AbortSignal; references?: Partial<ProductReferences> } = {},
): Promise<CossResult<FormSubmissionDiagnosis>> {
  const read = { signal: options.signal };
  const submission = await coss.forms.submissions.get(formId, submissionId, read);
  if (submission.error) return submission;
  const created = new Date(submission.data.created_at);
  const [form, endpoints, logs] = await Promise.all([
    softly(coss.forms.get(formId, read)),
    softly(coss.webhookEndpoints.list(read)),
    softly(
      coss.logs.list(
        {
          resource_id: submissionId,
          from: new Date(created.getTime() - 60_000),
          to: new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000),
          limit: 20,
        },
        read,
      ),
    ),
  ]);
  return {
    data: diagnoseFormSubmission({
      submission: submission.data,
      context: {
        ...(form ? { form } : {}),
        ...(endpoints ? { webhookEndpoints: endpoints.data } : {}),
        ...(logs ? { logs: logs.data } : {}),
      },
      references: options.references,
    }),
    error: null,
  };
}
