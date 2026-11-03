/**
 * Double opt-in: a `pending` contact gets an email with a confirmation link
 * (`confirmationLink`, `/t/u/confirm/…`), and becomes `subscribed` when it is followed
 * (`confirmContact`, `preferences.ts`). Confirmations are the customer's own sends (their
 * verified domain, suppression list, quota and reputation), at most one a day per contact and
 * three before it confirms; the caller also charges the confirmation rate limits.
 */
import { db, schema } from "@coss/db";
import { renderEmail } from "@coss/email-layout";
import { and, eq, sql } from "drizzle-orm";
import { type ContactEnvironment, inContactEnvironment } from "./contact-properties.ts";
import { CONFIRMATION_URL_PLACEHOLDER } from "./contact-schemas.ts";
import { ContactError, EmailError } from "./errors.ts";
import { confirmationLink, type LinkKeyRing } from "./link-tokens.ts";
import { escapeHtml } from "./marketing-footer.ts";
import { getMarketingSettingsRow } from "./marketing-settings.ts";
import { SendEmailRequest } from "./schemas.ts";
import type { EmailService, SendEnvironment } from "./service.ts";

const { contact, organization } = schema;

/** A contact gets at most one confirmation per this long… */
export const CONFIRMATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** …and at most this many before it confirms. */
export const MAX_CONFIRMATIONS = 3;

export type ConfirmationOutcome = "sent" | "cooldown" | "limit_reached" | "not_pending";

/** The sender of confirmations, or a `ContactError` saying it must be set first. */
export async function confirmationSender(env: ContactEnvironment): Promise<string> {
  const from = (await getMarketingSettingsRow(env))?.confirmationFrom;
  if (!from) {
    throw new ContactError(
      "confirmation_sender_required",
      "Double opt-in needs the marketing settings' confirmation_from (a sender on a verified " +
        "domain) first.",
      { param: "double_opt_in" },
    );
  }
  return from;
}

function defaultContent(name: string, url: string) {
  // Always the customer's own send (`confirmationSender`), so it carries their name.
  return renderEmail({
    subject: `Confirm your subscription to ${name}`,
    title: "Confirm your subscription",
    brand: name,
    blocks: [
      { paragraph: `Please confirm that you want to receive email from ${name}.` },
      { button: { label: "Confirm my subscription", url } },
      { note: "If you didn't ask for this, ignore this email: you won't be subscribed." },
    ],
  });
}

/**
 * Sends the contact's confirmation email if it is due. Its idempotency key is the contact and the
 * confirmation's number, so a retried request sends it once. The link is a secret: the stored
 * email keeps no body once sent (`discardBody`).
 */
export async function sendConfirmation(input: {
  environment: SendEnvironment;
  contactId: string;
  emailService: Pick<EmailService, "send">;
  apiKeyId: string | null;
  apiKeyOwnerId?: string | null;
  linkKeys: LinkKeyRing;
  baseUrl: string;
  now?: Date;
}): Promise<ConfirmationOutcome> {
  const now = input.now ?? new Date();
  const env = {
    organizationId: input.environment.organizationId,
    environmentId: input.environment.environmentId,
  };
  const [row] = await db
    .select({ contact, organizationName: organization.name })
    .from(contact)
    .innerJoin(organization, eq(organization.id, contact.organizationId))
    .where(and(inContactEnvironment(contact, env), eq(contact.id, input.contactId)))
    .limit(1);
  if (row?.contact.status !== "pending") return "not_pending";
  const target = row.contact;
  if (target.confirmationCount >= MAX_CONFIRMATIONS) return "limit_reached";
  if (
    target.confirmationSentAt &&
    now.getTime() - target.confirmationSentAt.getTime() < CONFIRMATION_COOLDOWN_MS
  ) {
    return "cooldown";
  }
  const from = await confirmationSender(env);
  const settings = await getMarketingSettingsRow(env);
  const name = settings?.displayName ?? row.organizationName;
  const url = confirmationLink({
    baseUrl: input.baseUrl,
    keys: input.linkKeys,
    environmentId: env.environmentId,
    address: target.address,
    issuedAt: now,
  });
  const fallback = defaultContent(name, url);
  const fill = (template: string | null | undefined, value: string) =>
    template ? template.replaceAll(CONFIRMATION_URL_PLACEHOLDER, value) : null;
  const html = fill(settings?.confirmationHtml, escapeHtml(url));
  const text = fill(settings?.confirmationText, url);
  const params = SendEmailRequest.parse({
    from,
    to: target.address,
    ...(html || text
      ? { html: html ?? undefined, text: text ?? undefined }
      : { html: fallback.html, text: fallback.text }),
    subject: settings?.confirmationSubject ?? fallback.subject,
    tracking: { opens: false, clicks: false },
  });
  const number = target.confirmationCount + 1;
  try {
    await input.emailService.send({
      environment: input.environment,
      apiKeyId: input.apiKeyId,
      apiKeyOwnerId: input.apiKeyOwnerId ?? null,
      params,
      idempotencyKey: `contact-confirmation:${target.id}:${number}`,
      discardBody: true,
    });
  } catch (error) {
    // Each attempt mints a new link, so a concurrent request or a retry after the count below
    // failed reuses the key with another body: that confirmation was sent, so record it.
    if (!(error instanceof EmailError && error.code === "idempotency_key_reused")) throw error;
  }
  // Compare-and-set on the count: two concurrent requests record (and so send) one.
  await db
    .update(contact)
    .set({ confirmationSentAt: now, confirmationCount: number })
    .where(
      and(
        eq(contact.id, target.id),
        eq(contact.organizationId, target.organizationId),
        eq(contact.confirmationCount, target.confirmationCount),
      ),
    );
  return "sent";
}

/** Pending contacts not confirmed in time are purged (`RETENTION_DAYS.pendingContacts`). */
export function pendingBefore(cutoff: Date) {
  return and(
    eq(contact.status, "pending"),
    sql`${contact.pendingSince} < ${cutoff.toISOString()}::timestamptz`,
  );
}
