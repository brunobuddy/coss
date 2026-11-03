/**
 * Tickets as customers see them, always scoped by the organization and person asking: notes,
 * internal events and messages from unverified senders never leave this module.
 */
import { randomBytes } from "node:crypto";
import {
  PLANS,
  type PlanKey,
  SUPPORT_TIERS,
  type SupportSeverity,
  supportResponseMinutes,
} from "@coss/billing/catalog";
import { db, type Executor, schema } from "@coss/db";
import { and, asc, desc, eq, inArray, isNull, lt, or, type SQL, sql } from "drizzle-orm";
import { SupportError } from "./errors.ts";
import type { SupportPlan, SupportPlanFor } from "./matching.ts";
import { MAX_SUPPORT_ATTACHMENT_BYTES } from "./schemas.ts";
import { responseDueAt } from "./sla.ts";
import { type SupportFileStore, supportFileKey } from "./store.ts";

const { supportAttachment, supportMessage, supportTicket, supportTicketRead } = schema;

export type SupportTicketRow = typeof supportTicket.$inferSelect;
export type SupportMessageRow = typeof supportMessage.$inferSelect;
export type SupportAttachmentRow = typeof supportAttachment.$inferSelect;
export type SupportAuthor = { userId: string; name: string | null; email: string };

const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

export function newReplyToken(): string {
  return [...randomBytes(16)].map((byte) => TOKEN_ALPHABET[byte % 32]).join("");
}

/** Owners and admins see all of an organization's tickets; other members see their own. */
export function seesAllTickets(role: string): boolean {
  return role.split(",").some((part) => ["owner", "admin"].includes(part.trim()));
}

/** The clock of a ticket whose customer has been waiting since `from`. */
export function supportClock(input: { from: Date; plan: SupportPlan; severity: SupportSeverity }): {
  awaitingSince: Date;
  responseDueAt: Date;
  plan: PlanKey;
  allHours: boolean;
} {
  return {
    awaitingSince: input.from,
    plan: input.plan.plan,
    allHours: input.plan.allHours,
    responseDueAt: responseDueAt({
      from: input.from,
      minutes: supportResponseMinutes(input.plan.plan, input.severity),
      allHours: input.plan.allHours,
    }),
  };
}

export function hasUrgentSupport(plan: PlanKey): boolean {
  return SUPPORT_TIERS[plan].responseMinutes.urgent !== null;
}

/** Moves uploads onto their message: only the uploader's own, not yet sent with anything. */
export async function claimAttachments(
  tx: Executor,
  input: { ticketId: string; messageId: string; uploadedByUserId: string; ids: readonly string[] },
): Promise<void> {
  if (input.ids.length === 0) return;
  const claimed = await tx
    .update(supportAttachment)
    .set({ ticketId: input.ticketId, messageId: input.messageId })
    .where(
      and(
        inArray(supportAttachment.id, [...input.ids]),
        eq(supportAttachment.uploadedByUserId, input.uploadedByUserId),
        isNull(supportAttachment.messageId),
      ),
    )
    .returning({ id: supportAttachment.id });
  if (claimed.length !== new Set(input.ids).size) {
    throw new SupportError("attachments_unavailable", "An attachment is no longer available.");
  }
}

export type NewDashboardTicket = {
  organizationId: string;
  organizationName: string;
  author: SupportAuthor;
  subject: string;
  category: string;
  severity: SupportSeverity;
  body: string;
  attachmentIds?: readonly string[];
  context?: SupportTicketRow["context"];
  now?: Date;
};

export async function createDashboardTicket(
  input: NewDashboardTicket,
  deps: { planFor: SupportPlanFor },
): Promise<SupportTicketRow> {
  const now = input.now ?? new Date();
  const plan = await deps.planFor(input.organizationId, now);
  const severity = hasUrgentSupport(plan.plan) ? input.severity : "normal";
  return db.transaction(async (tx) => {
    const [ticket] = await tx
      .insert(supportTicket)
      .values({
        replyToken: newReplyToken(),
        subject: input.subject,
        category: input.category,
        severity,
        source: "dashboard",
        organizationId: input.organizationId,
        organizationName: input.organizationName,
        orgMatch: "session",
        requesterUserId: input.author.userId,
        requesterEmail: input.author.email.toLowerCase(),
        requesterName: input.author.name,
        senderAuth: "session",
        lastCustomerMessageAt: now,
        lastMessageAt: now,
        context: input.context ?? {},
        createdAt: now,
        ...supportClock({ from: now, plan, severity }),
      })
      .returning();
    if (!ticket) throw new Error("The ticket was not stored.");
    const [message] = await tx
      .insert(supportMessage)
      .values({
        ticketId: ticket.id,
        kind: "customer",
        authorUserId: input.author.userId,
        authorName: input.author.name,
        authorEmail: input.author.email,
        body: input.body,
        visibleText: input.body,
        senderAuth: "session",
        customerVisible: true,
        repAlertPending: true,
        createdAt: now,
      })
      .returning({ id: supportMessage.id });
    if (!message) throw new Error("The message was not stored.");
    await claimAttachments(tx, {
      ticketId: ticket.id,
      messageId: message.id,
      uploadedByUserId: input.author.userId,
      ids: input.attachmentIds ?? [],
    });
    await tx.insert(supportMessage).values(acknowledgement(ticket.id, now));
    await markRead(tx, ticket.id, input.author.userId, now);
    return ticket;
  });
}

/** The automatic "we got it" email, as a pending delivery. */
export function acknowledgement(ticketId: string, now: Date): typeof supportMessage.$inferInsert {
  return {
    ticketId,
    kind: "event",
    event: "acknowledged",
    deliveryStatus: "pending",
    nextDeliveryAt: now,
    createdAt: now,
  };
}

async function markRead(tx: Executor, ticketId: string, userId: string, now: Date): Promise<void> {
  await tx
    .insert(supportTicketRead)
    .values({ ticketId, userId, readAt: now })
    .onConflictDoUpdate({
      target: [supportTicketRead.ticketId, supportTicketRead.userId],
      set: { readAt: now },
    });
}

export type CustomerScope = { organizationId: string; userId: string; role: string };

function visibleTo(scope: CustomerScope): SQL | undefined {
  return and(
    eq(supportTicket.organizationId, scope.organizationId),
    seesAllTickets(scope.role) ? undefined : eq(supportTicket.requesterUserId, scope.userId),
    // A rep moved it there; nothing the customer asked for.
    sql`${supportTicket.status} <> 'spam'`,
  );
}

export type CustomerTicketSummary = {
  id: string;
  number: number;
  subject: string;
  status: SupportTicketRow["status"];
  severity: SupportSeverity;
  category: string;
  requesterEmail: string;
  responseDueAt: Date | null;
  lastMessageAt: Date;
  createdAt: Date;
  unread: boolean;
};

export async function listCustomerTickets(
  scope: CustomerScope,
  opts: { limit?: number; before?: string } = {},
): Promise<CustomerTicketSummary[]> {
  return db
    .select({
      id: supportTicket.id,
      number: supportTicket.number,
      subject: supportTicket.subject,
      status: supportTicket.status,
      severity: supportTicket.severity,
      category: supportTicket.category,
      requesterEmail: supportTicket.requesterEmail,
      responseDueAt: supportTicket.responseDueAt,
      lastMessageAt: supportTicket.lastMessageAt,
      createdAt: supportTicket.createdAt,
      unread: sql<boolean>`coalesce(${supportTicket.lastAgentMessageAt} > ${supportTicketRead.readAt}, ${supportTicket.lastAgentMessageAt} is not null)`,
    })
    .from(supportTicket)
    .leftJoin(
      supportTicketRead,
      and(
        eq(supportTicketRead.ticketId, supportTicket.id),
        eq(supportTicketRead.userId, scope.userId),
      ),
    )
    .where(and(visibleTo(scope), opts.before ? lt(supportTicket.id, opts.before) : undefined))
    .orderBy(desc(supportTicket.lastMessageAt), desc(supportTicket.id))
    .limit(opts.limit ?? 50);
}

/** How many of the person's tickets have a reply they haven't read (the navigation's badge). */
export async function countUnreadCustomerTickets(scope: CustomerScope): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(supportTicket)
    .leftJoin(
      supportTicketRead,
      and(
        eq(supportTicketRead.ticketId, supportTicket.id),
        eq(supportTicketRead.userId, scope.userId),
      ),
    )
    .where(
      and(
        visibleTo(scope),
        or(
          isNull(supportTicketRead.readAt),
          sql`${supportTicket.lastAgentMessageAt} > ${supportTicketRead.readAt}`,
        ),
        sql`${supportTicket.lastAgentMessageAt} is not null`,
      ),
    );
  return row?.count ?? 0;
}

export type CustomerMessage = {
  id: string;
  kind: "customer" | "agent" | "event";
  event: string | null;
  authorName: string | null;
  fromSupport: boolean;
  body: string;
  visibleText: string;
  createdAt: Date;
  attachments: { id: string; filename: string; contentType: string; size: number }[];
};

export type CustomerTicket = CustomerTicketSummary & {
  planLabel: string;
  messages: CustomerMessage[];
};

/** A rep's first name is all a customer sees of them. */
function firstName(name: string | null): string | null {
  return name?.trim().split(/\s+/)[0] ?? null;
}

export async function getCustomerTicket(
  scope: CustomerScope,
  ticketId: string,
): Promise<CustomerTicket | null> {
  const [ticket] = await db
    .select()
    .from(supportTicket)
    .where(and(eq(supportTicket.id, ticketId), visibleTo(scope)));
  if (!ticket) return null;
  const messages = await db
    .select()
    .from(supportMessage)
    .where(and(eq(supportMessage.ticketId, ticketId), eq(supportMessage.customerVisible, true)))
    .orderBy(asc(supportMessage.id));
  const attachments = messages.length
    ? await db
        .select()
        .from(supportAttachment)
        .where(
          and(
            inArray(
              supportAttachment.messageId,
              messages.map((message) => message.id),
            ),
            eq(supportAttachment.state, "stored"),
          ),
        )
    : [];
  return {
    id: ticket.id,
    number: ticket.number,
    subject: ticket.subject,
    status: ticket.status,
    severity: ticket.severity,
    category: ticket.category,
    requesterEmail: ticket.requesterEmail,
    responseDueAt: ticket.responseDueAt,
    lastMessageAt: ticket.lastMessageAt,
    createdAt: ticket.createdAt,
    unread: false,
    planLabel: PLANS[ticket.plan as PlanKey]?.name ?? "Free",
    messages: messages.flatMap((message): CustomerMessage[] => {
      if (message.kind === "note") return [];
      return [
        {
          id: message.id,
          kind: message.kind,
          event: message.event,
          authorName: message.kind === "agent" ? firstName(message.authorName) : message.authorName,
          fromSupport: message.kind === "agent",
          body: message.body,
          visibleText: message.visibleText,
          createdAt: message.createdAt,
          attachments: attachments
            .filter((attachment) => attachment.messageId === message.id)
            .map((attachment) => ({
              id: attachment.id,
              filename: attachment.filename,
              contentType: attachment.contentType,
              size: attachment.size,
            })),
        },
      ];
    }),
  };
}

export async function markCustomerTicketRead(
  scope: CustomerScope,
  ticketId: string,
  now: Date = new Date(),
): Promise<void> {
  const [ticket] = await db
    .select({ id: supportTicket.id })
    .from(supportTicket)
    .where(and(eq(supportTicket.id, ticketId), visibleTo(scope)));
  if (ticket) await markRead(db, ticket.id, scope.userId, now);
}

/** An attachment of a message the person can see, for a download route. */
export async function getCustomerAttachment(
  scope: CustomerScope,
  attachmentId: string,
): Promise<SupportAttachmentRow | null> {
  const [row] = await db
    .select({ attachment: supportAttachment })
    .from(supportAttachment)
    .innerJoin(supportMessage, eq(supportMessage.id, supportAttachment.messageId))
    .innerJoin(supportTicket, eq(supportTicket.id, supportMessage.ticketId))
    .where(
      and(
        eq(supportAttachment.id, attachmentId),
        eq(supportAttachment.state, "stored"),
        eq(supportMessage.customerVisible, true),
        visibleTo(scope),
      ),
    );
  return row?.attachment ?? null;
}

export async function replyAsCustomer(
  input: {
    scope: CustomerScope;
    ticketId: string;
    author: SupportAuthor;
    body: string;
    attachmentIds?: readonly string[];
    now?: Date;
  },
  deps: { planFor: SupportPlanFor },
): Promise<void> {
  const now = input.now ?? new Date();
  await db.transaction(async (tx) => {
    const [ticket] = await tx
      .select()
      .from(supportTicket)
      .where(and(eq(supportTicket.id, input.ticketId), visibleTo(input.scope)))
      .for("update");
    if (!ticket) throw new SupportError("not_found", "This ticket doesn't exist.");
    const toRequester = ticket.requesterUserId !== input.author.userId;
    const [message] = await tx
      .insert(supportMessage)
      .values({
        ticketId: ticket.id,
        kind: "customer",
        authorUserId: input.author.userId,
        authorName: input.author.name,
        authorEmail: input.author.email,
        body: input.body,
        visibleText: input.body,
        senderAuth: "session",
        customerVisible: true,
        repAlertPending: true,
        // A colleague wrote on the requester's ticket: the requester hears about it.
        ...(toRequester ? { deliveryStatus: "pending" as const, nextDeliveryAt: now } : {}),
        createdAt: now,
      })
      .returning({ id: supportMessage.id });
    if (!message) throw new Error("The message was not stored.");
    await claimAttachments(tx, {
      ticketId: ticket.id,
      messageId: message.id,
      uploadedByUserId: input.author.userId,
      ids: input.attachmentIds ?? [],
    });
    await reopenForCustomer(tx, ticket, now, deps.planFor);
    await markRead(tx, ticket.id, input.author.userId, now);
  });
}

/** A customer spoke: the ticket needs a rep and the clock runs, unless it's already running. */
export async function reopenForCustomer(
  tx: Executor,
  ticket: SupportTicketRow,
  now: Date,
  planFor: SupportPlanFor,
): Promise<void> {
  const reopened = ticket.status === "resolved";
  const clock = ticket.awaitingSince
    ? {}
    : supportClock({
        from: now,
        plan: await planOfTicket(ticket, now, planFor),
        severity: ticket.severity,
      });
  await tx
    .update(supportTicket)
    .set({
      status: ticket.status === "spam" ? "spam" : "open",
      snoozedUntil: null,
      resolvedAt: null,
      lastCustomerMessageAt: now,
      lastMessageAt: now,
      ...clock,
    })
    .where(eq(supportTicket.id, ticket.id));
  if (reopened) {
    await tx.insert(supportMessage).values({
      ticketId: ticket.id,
      kind: "event",
      event: "reopened",
      customerVisible: true,
      createdAt: now,
    });
  }
}

/** The plan a ticket's clock follows: its confirmed organization, else the suggested one, else Free. */
export async function planOfTicket(
  ticket: Pick<SupportTicketRow, "organizationId" | "suggestedOrganizationId">,
  at: Date,
  planFor: SupportPlanFor,
): Promise<SupportPlan> {
  const organizationId = ticket.organizationId ?? ticket.suggestedOrganizationId;
  return organizationId ? planFor(organizationId, at) : { plan: "free", allHours: false };
}

export async function resolveAsCustomer(input: {
  scope: CustomerScope;
  ticketId: string;
  author: SupportAuthor;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  await db.transaction(async (tx) => {
    const [ticket] = await tx
      .select({ id: supportTicket.id, status: supportTicket.status })
      .from(supportTicket)
      .where(and(eq(supportTicket.id, input.ticketId), visibleTo(input.scope)))
      .for("update");
    if (!ticket) throw new SupportError("not_found", "This ticket doesn't exist.");
    if (ticket.status === "resolved") return;
    await tx
      .update(supportTicket)
      .set({
        status: "resolved",
        resolvedAt: now,
        awaitingSince: null,
        responseDueAt: null,
        snoozedUntil: null,
        lastMessageAt: now,
      })
      .where(eq(supportTicket.id, ticket.id));
    await tx.insert(supportMessage).values({
      ticketId: ticket.id,
      kind: "event",
      event: "resolved",
      authorUserId: input.author.userId,
      authorName: input.author.name,
      customerVisible: true,
      createdAt: now,
    });
  });
}

export async function reopenAsCustomer(
  input: { scope: CustomerScope; ticketId: string; now?: Date },
  deps: { planFor: SupportPlanFor },
): Promise<void> {
  const now = input.now ?? new Date();
  await db.transaction(async (tx) => {
    const [ticket] = await tx
      .select()
      .from(supportTicket)
      .where(and(eq(supportTicket.id, input.ticketId), visibleTo(input.scope)))
      .for("update");
    if (!ticket) throw new SupportError("not_found", "This ticket doesn't exist.");
    if (ticket.status !== "resolved") return;
    await reopenForCustomer(tx, ticket, now, deps.planFor);
  });
}

const MAX_PENDING_UPLOADS = 40;
const CONTENT_TYPE = /^[\w.+-]+\/[\w.+-]+$/;

/** Stores a file for a message being written; `store` first, so a row always has its bytes. */
export async function storeSupportUpload(
  input: {
    uploadedByUserId: string;
    filename: string;
    contentType: string;
    content: Uint8Array;
  },
  store: SupportFileStore,
): Promise<{ id: string; filename: string; size: number }> {
  if (input.content.byteLength === 0) {
    throw new SupportError("invalid_attachment", "This file is empty.");
  }
  if (input.content.byteLength > MAX_SUPPORT_ATTACHMENT_BYTES) {
    throw new SupportError("invalid_attachment", "Files can be up to 10 MB.");
  }
  const [pending] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(supportAttachment)
    .where(
      and(
        eq(supportAttachment.uploadedByUserId, input.uploadedByUserId),
        isNull(supportAttachment.messageId),
      ),
    );
  if ((pending?.count ?? 0) >= MAX_PENDING_UPLOADS) {
    throw new SupportError(
      "invalid_attachment",
      "Too many files waiting to be sent. Send a message first.",
    );
  }
  const contentType = CONTENT_TYPE.test(input.contentType)
    ? input.contentType
    : "application/octet-stream";
  const key = supportFileKey();
  await store.put({ key, contentType, content: input.content });
  const [row] = await db
    .insert(supportAttachment)
    .values({
      uploadedByUserId: input.uploadedByUserId,
      filename: input.filename.slice(0, 200),
      contentType,
      size: input.content.byteLength,
      state: "stored",
      storeKey: key,
    })
    .returning({ id: supportAttachment.id });
  if (!row) throw new Error("The upload was not stored.");
  return { id: row.id, filename: input.filename.slice(0, 200), size: input.content.byteLength };
}
