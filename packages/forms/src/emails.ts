/**
 * The emails Forms sends: the owner's notification of an accepted submission and the
 * submitter's verification link, in the layout of every coss.com email. Sent through an injected
 * `FormMailer`, so `@coss/forms` never imports the email product; contacts go through an injected
 * `FormContactSink` the same way.
 */
import type { FormFieldDefinition } from "@coss/db/schema";
import { type EmailBlock, renderEmail } from "@coss/email-layout";

export type FormEmailEnvironment = {
  organizationId: string;
  projectId: string;
  environmentId: string;
  mode: "live" | "sandbox";
};

/** One email. The mailer picks the sender (see `FormMailer`). */
export type FormEmail = {
  environment: FormEmailEnvironment;
  /** The form's sender; `null`: coss.com's, as "<sender name> via coss.com". */
  from: string | null;
  senderName: string;
  to: string[];
  replyTo: string | null;
  subject: string;
  text: string;
  html: string;
  /** Stable per message: retries never send twice. */
  idempotencyKey: string;
  /**
   * Never from coss.com's sender (the submitter's verification: an address someone typed into a
   * public form must not get coss.com's mail). Without a verified `from` it waits.
   */
  customerOnly: boolean;
  category: "form_notification" | "form_verification";
};

/**
 * Sends Forms' emails: from `from` in the form's environment when it has one (sandbox
 * environments always in their own, whose emails are never delivered), else from coss.com's
 * sender. Throws when it can't send yet (retried later).
 */
export interface FormMailer {
  send(email: FormEmail): Promise<{ replayed: boolean }>;
}

/** A submitter becoming a contact (with the environment's double opt-in, unless the form says). */
export type FormContactInput = {
  environment: FormEmailEnvironment;
  email: string;
  firstName: string | null;
  lastName: string | null;
  /** Contact property key → the submitted text (coerced to the property's type by the sink). */
  properties: Record<string, string>;
  audienceIds: string[];
  topics: string[];
  /** `null`: the environment's marketing settings decide. */
  doubleOptIn: boolean | null;
};

export interface FormContactSink {
  /** Creates or updates the contact; throws to be retried. */
  add(input: FormContactInput): Promise<void>;
}

/** One line of plain text, as subjects must be. */
export function oneLine(value: string, max = 150): string {
  // Control, formatting and line/paragraph separator characters: the email product refuses them.
  return value
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function valueText(value: string | string[]): string {
  return Array.isArray(value) ? value.join(", ") : value;
}

/** The notification of an accepted submission: every field, its files, and a dashboard link. */
export function notificationContent(input: {
  formName: string;
  fields: FormFieldDefinition[] | null;
  data: Record<string, string | string[]>;
  files: { filename: string; size: number }[];
  submissionUrl: string;
}): { subject: string; text: string; html: string } {
  const labels = new Map(input.fields?.map((field) => [field.name, field.label ?? field.name]));
  const rows = Object.entries(input.data).map(([name, value]) => ({
    label: labels.get(name) ?? name,
    value: valueText(value),
  }));
  const blocks: EmailBlock[] = [
    ...(rows.length > 0 ? [{ fields: rows }] : []),
    ...(input.files.length > 0
      ? [{ heading: "Files" }, { list: input.files.map((file) => file.filename) }]
      : []),
    { button: { label: "View it on coss.com", url: input.submissionUrl } },
  ];
  return renderEmail({
    subject: oneLine(`New submission to ${input.formName}`),
    preview: `Someone filled in ${oneLine(input.formName, 100)}.`,
    blocks,
  });
}

/** The submitter's verification email: one link, which confirms nothing until they click. */
export function verificationContent(input: { formName: string; confirmUrl: string }): {
  subject: string;
  text: string;
  html: string;
} {
  const name = oneLine(input.formName, 100);
  // Only ever from the form's own sender (`customerOnly`), so it never carries coss.com's name.
  return renderEmail({
    subject: oneLine(`Confirm your email for ${name}`),
    title: "Confirm your email",
    brand: name,
    blocks: [
      { paragraph: `Confirm your email address to send your submission to ${name}.` },
      { button: { label: "Confirm my email", url: input.confirmUrl } },
      { note: "The link works for 7 days. If you didn't fill in this form, ignore this email." },
    ],
  });
}
