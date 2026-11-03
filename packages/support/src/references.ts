// A pasted id is kept only if it's the organization's: a ticket must never lead a rep elsewhere.
import { db, schema } from "@coss/db";
import { ID_PREFIXES } from "@coss/db/id";
import { and, desc, eq, sql } from "drizzle-orm";

const REFERENCES = [
  { prefix: ID_PREFIXES.email, type: "email", label: "Email", table: schema.email },
  { prefix: ID_PREFIXES.smsMessage, type: "sms", label: "Text message", table: schema.smsMessage },
  {
    prefix: ID_PREFIXES.receivedEmail,
    type: "received_email",
    label: "Received email",
    table: schema.receivedEmail,
  },
  {
    prefix: ID_PREFIXES.smsReceived,
    type: "received_sms",
    label: "Received text message",
    table: schema.smsReceived,
  },
  { prefix: ID_PREFIXES.broadcast, type: "broadcast", label: "Broadcast", table: schema.broadcast },
  { prefix: ID_PREFIXES.domain, type: "domain", label: "Domain", table: schema.domain },
  { prefix: ID_PREFIXES.contact, type: "contact", label: "Contact", table: schema.contact },
  {
    prefix: ID_PREFIXES.emailTemplate,
    type: "email_template",
    label: "Email template",
    table: schema.emailTemplate,
  },
  { prefix: ID_PREFIXES.inbox, type: "inbox", label: "Inbox", table: schema.inbox },
  { prefix: ID_PREFIXES.form, type: "form", label: "Form", table: schema.form },
  {
    prefix: ID_PREFIXES.webhookEndpoint,
    type: "webhook_endpoint",
    label: "Webhook endpoint",
    table: schema.webhookEndpoint,
  },
  {
    prefix: ID_PREFIXES.formSubmission,
    type: "form_submission",
    label: "Form submission",
    table: schema.formSubmission,
  },
  {
    prefix: ID_PREFIXES.signRequest,
    type: "sign_request",
    label: "Signature request",
    table: schema.signRequest,
  },
  {
    prefix: ID_PREFIXES.verifyRequest,
    type: "verification",
    label: "Verification",
    table: schema.verifyRequest,
  },
  {
    prefix: ID_PREFIXES.schedulingBooking,
    type: "booking",
    label: "Booking",
    table: schema.schedulingBooking,
  },
];

export function supportReferenceLabel(type: string): string {
  return REFERENCES.find((entry) => entry.type === type)?.label ?? "Item";
}

/** The reference `id` names, or `null` unless it's an item of this organization. */
export async function resolveSupportReference(input: {
  organizationId: string;
  id: string;
}): Promise<{ type: string; id: string } | null> {
  const id = input.id.trim();
  const prefix = id.slice(0, id.lastIndexOf("_"));
  const entry = REFERENCES.find((candidate) => candidate.prefix === prefix);
  if (!entry) return null;
  const { rows } = await db.execute(
    sql`select 1 from ${entry.table} where ${entry.table.id} = ${id} and ${entry.table.organizationId} = ${input.organizationId} limit 1`,
  );
  return rows.length > 0 ? { type: entry.type, id } : null;
}

export type SupportReferenceOption = { id: string; label: string; detail: string; at: Date };

const RECENT_LIMIT = 50;

/** The environment's latest emails, to pick from instead of pasting an id. */
export async function recentEmailReferences(input: {
  organizationId: string;
  environmentId: string;
}): Promise<SupportReferenceOption[]> {
  const { email } = schema;
  const rows = await db
    .select({ id: email.id, subject: email.subject, to: email.to, at: email.createdAt })
    .from(email)
    .where(
      and(
        eq(email.organizationId, input.organizationId),
        eq(email.environmentId, input.environmentId),
      ),
    )
    .orderBy(desc(email.createdAt))
    .limit(RECENT_LIMIT);
  return rows.map((row) => ({
    id: row.id,
    label: row.subject || "(no subject)",
    detail: row.to[0] ?? "",
    at: row.at,
  }));
}

export async function recentSmsReferences(input: {
  organizationId: string;
  environmentId: string;
}): Promise<SupportReferenceOption[]> {
  const { smsMessage } = schema;
  const rows = await db
    .select({ id: smsMessage.id, to: smsMessage.to, at: smsMessage.createdAt })
    .from(smsMessage)
    .where(
      and(
        eq(smsMessage.organizationId, input.organizationId),
        eq(smsMessage.environmentId, input.environmentId),
      ),
    )
    .orderBy(desc(smsMessage.createdAt))
    .limit(RECENT_LIMIT);
  return rows.map((row) => ({ id: row.id, label: `To ${row.to}`, detail: "", at: row.at }));
}
