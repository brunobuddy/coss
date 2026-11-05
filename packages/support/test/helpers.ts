import { db, schema } from "@coss/db";
import { newId } from "@coss/db/id";
import { uniqueSuffix } from "@coss/db/testing";
import { extractReplyText, htmlToText } from "@coss/email";
import type { TestTenant } from "@coss/tenancy/testing";
import { and, asc, eq } from "drizzle-orm";
import type { SupportIntakeDeps } from "../src/intake.ts";
import type { SupportPlanFor } from "../src/matching.ts";
import { fixedSupportPlans } from "../src/testing.ts";
import type { SupportAuthor, SupportTicketRow } from "../src/tickets.ts";

const { receivedEmail, supportMessage, supportTicket } = schema;

export function intakeDeps(
  environmentId: string,
  planFor: SupportPlanFor = fixedSupportPlans(),
): SupportIntakeDeps {
  return {
    environmentId,
    planFor,
    ownAddresses: ["support@coss.com", "notifications@coss.com"],
    extractReplyText: (text) => extractReplyText(text) ?? "",
    htmlToText,
  };
}

export type ReceivedInput = {
  from?: string;
  fromHeader?: string;
  to?: string[];
  cc?: string[];
  recipients?: string[];
  subject?: string;
  text?: string | null;
  html?: string | null;
  dmarc?: string | null;
  spam?: string | null;
  mailFrom?: string;
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  headers?: { name: string; value: string }[];
  replyTo?: string[];
};

/** What `receiveEmail` stores: a message in the support environment. */
export async function receive(tenant: TestTenant, input: ReceivedInput = {}): Promise<string> {
  const id = newId("rcvd");
  const from = input.from ?? `ada-${uniqueSuffix()}@example.test`;
  const now = new Date();
  await db.insert(receivedEmail).values({
    id,
    organizationId: tenant.organization.id,
    projectId: tenant.project.id,
    environmentId: tenant.production.id,
    status: "received",
    provider: "ses",
    providerMessageId: id,
    mailFrom: input.mailFrom ?? from,
    recipients: input.recipients ?? ["support@reply.coss.test"],
    from,
    to: input.to ?? ["support@coss.com"],
    cc: input.cc ?? [],
    replyTo: input.replyTo ?? [],
    subject: input.subject ?? "Help with my domain",
    messageId: input.messageId === undefined ? `<${id}@mail.example.test>` : input.messageId,
    inReplyTo: input.inReplyTo ?? null,
    references: input.references ?? [],
    headers: input.headers ?? [{ name: "From", value: input.fromHeader ?? from }],
    text: input.text === undefined ? "My domain won't verify." : input.text,
    html: input.html ?? null,
    spamVerdict: input.spam === undefined ? "pass" : input.spam,
    virusVerdict: "pass",
    spfVerdict: "pass",
    dkimVerdict: "pass",
    dmarcVerdict: input.dmarc === undefined ? "pass" : input.dmarc,
    size: 100,
    receivedAt: now,
  });
  return id;
}

export async function ticketFrom(receivedEmailId: string): Promise<SupportTicketRow> {
  const [row] = await db
    .select({ ticket: supportTicket })
    .from(supportMessage)
    .innerJoin(supportTicket, eq(supportTicket.id, supportMessage.ticketId))
    .where(eq(supportMessage.receivedEmailId, receivedEmailId));
  if (!row) throw new Error(`No ticket for ${receivedEmailId}.`);
  return row.ticket;
}

export async function ticketById(id: string): Promise<SupportTicketRow> {
  const [row] = await db.select().from(supportTicket).where(eq(supportTicket.id, id));
  if (!row) throw new Error(`No ticket ${id}.`);
  return row;
}

export async function messagesOf(ticketId: string) {
  return db
    .select()
    .from(supportMessage)
    .where(eq(supportMessage.ticketId, ticketId))
    .orderBy(asc(supportMessage.id));
}

export async function pendingDeliveries(ticketId: string) {
  return db
    .select()
    .from(supportMessage)
    .where(
      and(eq(supportMessage.ticketId, ticketId), eq(supportMessage.deliveryStatus, "pending")),
    );
}

export function rep(tenant: TestTenant): SupportAuthor {
  return { userId: tenant.owner.id, name: "Bailey Pumfleet", email: tenant.owner.email };
}
