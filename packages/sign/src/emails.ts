/**
 * The emails coss.com sends email signers: the invitation, reminders and their signed copy, in the
 * layout of every coss.com email. Sent through an injected `SignMailer`, so `@coss/sign` never
 * imports the email product.
 */
import { type EmailBlock, renderEmail } from "@coss/email-layout";

/** One signing email. The mailer picks the sender (see `SignMailer`). */
export type SignEmail = {
  environment: {
    organizationId: string;
    projectId: string;
    environmentId: string;
    mode: "live" | "sandbox";
  };
  /** The environment's `email_from`; `null`: coss.com's sender. */
  from: string | null;
  /** The requester as signers know them (the settings' display name, else the organization's). */
  requester: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Stable per message: retries never send twice. */
  idempotencyKey: string;
  attachment?: { filename: string; content: Uint8Array } | null;
  /** What coss.com's sender sends instead: without the requester's name on top or own words. */
  cossContent: { subject: string; text: string; html: string };
};

/**
 * Sends signing emails. From `from` in the request's environment when it has one (or the
 * environment is a sandbox, whose emails are never delivered), else from coss.com's sender as
 * "<requester> via coss.com". Throws when it can't send yet (retried later).
 */
export interface SignMailer {
  /**
   * Sends the email, or not when its idempotency key already sent one: `replayed` then, and the
   * signer has that earlier email (with its own link), not this one.
   */
  send(email: SignEmail): Promise<{ replayed: boolean }>;
}

/**
 * One line of plain text, as subjects and sender names must be: the email product refuses
 * control and invisible formatting characters (a zero-width joiner in an emoji sequence, say),
 * which a request's title or a display name may hold.
 */
export function oneLine(value: string): string {
  return value
    .replace(/\p{Cf}/gu, "")
    .replace(/[\s\p{Cc}]+/gu, " ")
    .trim();
}

type Content = { subject: string; text: string; html: string };

const FOOTER =
  "This link is for you alone: anyone with it can sign as you. If you weren't expecting this, you can ignore it.";

function paragraphs(lines: string[]): EmailBlock[] {
  return lines.map((paragraph) => ({ paragraph }));
}

/** `message` and `brand` only go in the copy the requester sends themselves. */
export function invitationEmail(input: {
  requester: string;
  title: string;
  message: string | null;
  url: string;
  expiresAt: Date | null;
  brand?: string | undefined;
}): Content {
  const expiry = input.expiresAt
    ? `Please sign before ${input.expiresAt.toUTCString().replace(/ GMT$/, " UTC")}.`
    : null;
  const lines = [`${input.requester} asks you to review and sign "${input.title}".`];
  if (expiry) lines.push(expiry);
  return renderEmail({
    subject: `${oneLine(input.requester)} sent you "${oneLine(input.title)}" to sign`,
    title: "You have a document to sign",
    brand: input.brand,
    blocks: [
      ...paragraphs(lines),
      ...(input.message ? [{ quote: input.message }] : []),
      { button: { label: "Review and sign", url: input.url } },
      { note: FOOTER },
    ],
  });
}

export function reminderEmail(input: {
  requester: string;
  title: string;
  url: string;
  expiresAt: Date | null;
  brand?: string | undefined;
}): Content {
  const lines = [`${input.requester} is still waiting for your signature on "${input.title}".`];
  if (input.expiresAt) {
    lines.push(`It expires on ${input.expiresAt.toUTCString().replace(/ GMT$/, " UTC")}.`);
  }
  return renderEmail({
    subject: `Reminder: "${oneLine(input.title)}" is waiting for your signature`,
    title: "A reminder to sign",
    brand: input.brand,
    blocks: [
      ...paragraphs(lines),
      { button: { label: "Review and sign", url: input.url } },
      { note: FOOTER },
    ],
  });
}

export function signedCopyEmail(input: {
  requester: string;
  title: string;
  url: string;
  attached: boolean;
  brand?: string | undefined;
}): Content {
  return renderEmail({
    subject: `Signed: "${oneLine(input.title)}"`,
    title: "Your signed copy",
    brand: input.brand,
    blocks: [
      ...paragraphs([
        `Everyone has signed "${input.title}".`,
        input.attached
          ? "Your copy of the signed documents is attached, with a certificate of completion. Keep it for your records."
          : "Download your copy of the signed documents, with a certificate of completion, and keep it for your records.",
      ]),
      { button: { label: "Download the signed copy", url: input.url } },
      {
        note: `${input.requester} used coss.com Sign. The PDF is sealed: any change to it shows in PDF viewers.`,
      },
    ],
  });
}
