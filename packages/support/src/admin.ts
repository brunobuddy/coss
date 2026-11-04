/**
 * The rep's side of the desk. Platform-level, across organizations: call only after
 * `requirePlatformAdmin*`. Callers record the audit event.
 */
import type { PlanKey, SupportSeverity } from "@coss/billing/catalog";
import { db, schema } from "@coss/db";
import { and, asc, desc, eq, ilike, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import { SupportError } from "./errors.ts";
import type { SupportPlanFor } from "./matching.ts";
import {
  claimAttachments,
  planOfTicket,
  type SupportAttachmentRow,
  type SupportAuthor,
  type SupportMessageRow,
  type SupportTicketRow,
  supportClock,
} from "./tickets.ts";

const {
  member,
  organization,
  receivedEmail,
  supportAttachment,
  supportIntake,
  supportMessage,
  supportSavedReply,
  supportTicket,
  user,
} = schema;

export const SUPPORT_VIEWS = [
  "needs_reply",
  "mine",
  "unassigned",
  "waiting",
  "snoozed",
  "resolved",
  "spam",
] as const;
export type SupportView = (typeof SUPPORT_VIEWS)[number];

const PLAN_RANK = sql`case ${supportTicket.plan} when 'enterprise' then 3 when 'scale' then 2 when 'pro' then 1 else 0 end`;

function viewCondition(view: SupportView, actorUserId: string): SQL | undefined {
  switch (view) {
    case "needs_reply":
      return eq(supportTicket.status, "open");
    case "mine":
      return and(
        eq(supportTicket.assigneeUserId, actorUserId),
        inArray(supportTicket.status, ["open", "pending", "snoozed"]),
      );
    case "unassigned":
      return and(eq(supportTicket.status, "open"), isNull(supportTicket.assigneeUserId));
    case "waiting":
      return eq(supportTicket.status, "pending");
    case "snoozed":
      return eq(supportTicket.status, "snoozed");
    case "resolved":
      return eq(supportTicket.status, "resolved");
    case "spam":
      return eq(supportTicket.status, "spam");
  }
}

export type SupportQueueItem = Pick<
  SupportTicketRow,
  | "id"
  | "number"
  | "subject"
  | "status"
  | "severity"
  | "plan"
  | "allHours"
  | "source"
  | "filterReason"
  | "requesterEmail"
  | "requesterName"
  | "senderAuth"
  | "responseDueAt"
  | "assigneeUserId"
  | "lastMessageAt"
  | "organizationId"
  | "suggestedOrganizationId"
> & {
  organizationName: string | null;
  assigneeName: string | null;
  snippet: string;
};

export async function listSupportQueue(input: {
  view: SupportView;
  actorUserId: string;
  plan?: PlanKey;
  search?: string;
  limit?: number;
  scope?: { ticketIds: string[] };
}): Promise<SupportQueueItem[]> {
  const search = input.search?.trim();
  const number = search ? Number(search.replace(/^#/, "")) : Number.NaN;
  const suggested = sql<
    string | null
  >`(select ${organization.name} from ${organization} where ${organization.id} = ${supportTicket.suggestedOrganizationId})`;
  const rows = await db
    .select({
      id: supportTicket.id,
      number: supportTicket.number,
      subject: supportTicket.subject,
      status: supportTicket.status,
      severity: supportTicket.severity,
      plan: supportTicket.plan,
      allHours: supportTicket.allHours,
      source: supportTicket.source,
      filterReason: supportTicket.filterReason,
      requesterEmail: supportTicket.requesterEmail,
      requesterName: supportTicket.requesterName,
      senderAuth: supportTicket.senderAuth,
      responseDueAt: supportTicket.responseDueAt,
      assigneeUserId: supportTicket.assigneeUserId,
      lastMessageAt: supportTicket.lastMessageAt,
      organizationId: supportTicket.organizationId,
      suggestedOrganizationId: supportTicket.suggestedOrganizationId,
      organizationName: sql<
        string | null
      >`coalesce(${supportTicket.organizationName}, ${suggested})`,
      assigneeName: user.name,
      snippet: sql<string>`coalesce((
        select left(m.visible_text, 160) from support_message m
        where m.ticket_id = ${supportTicket.id} and m.kind in ('customer', 'agent')
        order by m.id desc limit 1
      ), '')`,
    })
    .from(supportTicket)
    .leftJoin(user, eq(user.id, supportTicket.assigneeUserId))
    .where(
      and(
        viewCondition(input.view, input.actorUserId),
        input.plan ? eq(supportTicket.plan, input.plan) : undefined,
        search
          ? or(
              Number.isInteger(number) ? eq(supportTicket.number, number) : undefined,
              ilike(supportTicket.subject, `%${search}%`),
              ilike(supportTicket.requesterEmail, `%${search}%`),
              ilike(supportTicket.organizationName, `%${search}%`),
            )
          : undefined,
        input.scope ? inArray(supportTicket.id, input.scope.ticketIds) : undefined,
      ),
    )
    .orderBy(
      ...(input.view === "resolved" || input.view === "spam"
        ? [desc(supportTicket.lastMessageAt)]
        : [
            sql`${supportTicket.responseDueAt} asc nulls last`,
            sql`${PLAN_RANK} desc`,
            asc(supportTicket.lastMessageAt),
          ]),
    )
    .limit(input.limit ?? 100);
  return rows;
}

export async function supportQueueCounts(
  actorUserId: string,
): Promise<Record<SupportView, number>> {
  const [row] = await db
    .select({
      needs_reply: sql<number>`count(*) filter (where ${supportTicket.status} = 'open')::int`,
      mine: sql<number>`count(*) filter (where ${supportTicket.assigneeUserId} = ${actorUserId} and ${supportTicket.status} in ('open', 'pending', 'snoozed'))::int`,
      unassigned: sql<number>`count(*) filter (where ${supportTicket.status} = 'open' and ${supportTicket.assigneeUserId} is null)::int`,
      waiting: sql<number>`count(*) filter (where ${supportTicket.status} = 'pending')::int`,
      snoozed: sql<number>`count(*) filter (where ${supportTicket.status} = 'snoozed')::int`,
      resolved: sql<number>`count(*) filter (where ${supportTicket.status} = 'resolved')::int`,
      spam: sql<number>`count(*) filter (where ${supportTicket.status} = 'spam')::int`,
    })
    .from(supportTicket);
  return (
    row ?? {
      needs_reply: 0,
      mine: 0,
      unassigned: 0,
      waiting: 0,
      snoozed: 0,
      resolved: 0,
      spam: 0,
    }
  );
}

/** The navigation's badge: tickets waiting on a rep. */
export async function countOpenSupportTickets(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(supportTicket)
    .where(eq(supportTicket.status, "open"));
  return row?.count ?? 0;
}

export type SupportTicketForRep = {
  ticket: SupportTicketRow;
  messages: (SupportMessageRow & { attachments: SupportAttachmentRow[] })[];
  assigneeName: string | null;
  suggestedOrganization: { id: string; name: string; slug: string } | null;
  confirmedOrganization: { id: string; name: string; slug: string } | null;
  requester: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    banned: boolean;
    createdAt: Date;
  } | null;
  /** The requester's organizations, to confirm the right one. */
  requesterOrganizations: { id: string; name: string; slug: string; role: string }[];
};

async function organizationRef(id: string | null) {
  if (!id) return null;
  const [row] = await db
    .select({ id: organization.id, name: organization.name, slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, id));
  return row ?? null;
}

async function userByEmail(address: string) {
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      banned: user.banned,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.email, address))
    .limit(1);
  return row ? { ...row, banned: row.banned === true } : null;
}

export async function getSupportTicketForRep(
  ticketId: string,
): Promise<SupportTicketForRep | null> {
  const [ticket] = await db.select().from(supportTicket).where(eq(supportTicket.id, ticketId));
  if (!ticket) return null;
  const messages = await db
    .select()
    .from(supportMessage)
    .where(eq(supportMessage.ticketId, ticketId))
    .orderBy(asc(supportMessage.id));
  const attachments = await db
    .select()
    .from(supportAttachment)
    .where(eq(supportAttachment.ticketId, ticketId));
  const [assignee] = ticket.assigneeUserId
    ? await db.select({ name: user.name }).from(user).where(eq(user.id, ticket.assigneeUserId))
    : [];
  const requester = await userByEmail(ticket.requesterEmail);
  const requesterOrganizations = requester
    ? await db
        .select({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          role: member.role,
        })
        .from(member)
        .innerJoin(organization, eq(organization.id, member.organizationId))
        .where(eq(member.userId, requester.id))
        .orderBy(asc(member.createdAt))
    : [];
  return {
    ticket,
    messages: messages.map((message) => ({
      ...message,
      attachments: attachments.filter((attachment) => attachment.messageId === message.id),
    })),
    assigneeName: assignee?.name ?? null,
    suggestedOrganization: await organizationRef(ticket.suggestedOrganizationId),
    confirmedOrganization: await organizationRef(ticket.organizationId),
    requester,
    requesterOrganizations,
  };
}

/** What's new on a ticket since a message, for the conversation's live updates. */
export async function supportTicketFeed(ticketId: string): Promise<{
  lastMessageId: string | null;
  status: SupportTicketRow["status"] | null;
}> {
  const [ticket] = await db
    .select({ status: supportTicket.status })
    .from(supportTicket)
    .where(eq(supportTicket.id, ticketId));
  const [last] = await db
    .select({ id: supportMessage.id })
    .from(supportMessage)
    .where(eq(supportMessage.ticketId, ticketId))
    .orderBy(desc(supportMessage.id))
    .limit(1);
  return { lastMessageId: last?.id ?? null, status: ticket?.status ?? null };
}

export async function getSupportAttachmentForRep(id: string): Promise<SupportAttachmentRow | null> {
  const [row] = await db.select().from(supportAttachment).where(eq(supportAttachment.id, id));
  return row?.state === "stored" ? row : null;
}

/** An organization's or a person's other tickets, for the context panel and admin pages. */
export async function listSupportTicketsFor(
  input: { organizationId?: string; requesterEmail?: string; excludeTicketId?: string },
  limit = 10,
) {
  const owners = [
    input.organizationId ? eq(supportTicket.organizationId, input.organizationId) : undefined,
    input.requesterEmail ? eq(supportTicket.requesterEmail, input.requesterEmail) : undefined,
  ].filter((condition) => condition !== undefined);
  if (owners.length === 0) return [];
  return db
    .select({
      id: supportTicket.id,
      number: supportTicket.number,
      subject: supportTicket.subject,
      status: supportTicket.status,
      plan: supportTicket.plan,
      lastMessageAt: supportTicket.lastMessageAt,
    })
    .from(supportTicket)
    .where(
      and(
        or(...owners),
        input.excludeTicketId ? sql`${supportTicket.id} <> ${input.excludeTicketId}` : undefined,
      ),
    )
    .orderBy(desc(supportTicket.lastMessageAt))
    .limit(limit);
}

type TicketChange = Partial<typeof supportTicket.$inferInsert>;

async function changeTicket(
  ticketId: string,
  change: (
    ticket: SupportTicketRow,
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ) => Promise<{
    set: TicketChange;
    event?: { name: string; data?: Record<string, unknown>; customerVisible?: boolean };
  } | null>,
  author: SupportAuthor,
  now: Date,
): Promise<SupportTicketRow> {
  return db.transaction(async (tx) => {
    const [ticket] = await tx
      .select()
      .from(supportTicket)
      .where(eq(supportTicket.id, ticketId))
      .for("update");
    if (!ticket) throw new SupportError("not_found", "This ticket doesn't exist.");
    const result = await change(ticket, tx);
    if (!result) return ticket;
    const [updated] = await tx
      .update(supportTicket)
      .set(result.set)
      .where(eq(supportTicket.id, ticketId))
      .returning();
    if (result.event) {
      await tx.insert(supportMessage).values({
        ticketId,
        kind: "event",
        event: result.event.name,
        eventData: result.event.data ?? {},
        authorUserId: author.userId,
        authorName: author.name,
        customerVisible: result.event.customerVisible ?? false,
        createdAt: now,
      });
    }
    return updated ?? ticket;
  });
}

/** Stops the clock on a reply, recording a miss. */
function answered(ticket: SupportTicketRow, now: Date): TicketChange {
  return {
    awaitingSince: null,
    responseDueAt: null,
    firstRespondedAt: ticket.firstRespondedAt ?? now,
    breachedAt:
      ticket.breachedAt ??
      (ticket.responseDueAt && ticket.responseDueAt < now ? ticket.responseDueAt : null),
    lastAgentMessageAt: now,
    lastMessageAt: now,
  };
}

const AFTER_REPLY_STATUSES = ["pending", "resolved", "snoozed"] as const;
export type AfterReply = { status: (typeof AFTER_REPLY_STATUSES)[number]; snoozedUntil?: Date };

export async function replyAsAgent(input: {
  ticketId: string;
  author: SupportAuthor;
  body: string;
  attachmentIds?: readonly string[];
  /** The last message the rep saw: a newer one from the customer stops the send. */
  lastSeenMessageId?: string;
  after?: AfterReply;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const after = input.after ?? { status: "pending" };
  await db.transaction(async (tx) => {
    const [ticket] = await tx
      .select()
      .from(supportTicket)
      .where(eq(supportTicket.id, input.ticketId))
      .for("update");
    if (!ticket) throw new SupportError("not_found", "This ticket doesn't exist.");
    if (ticket.status === "spam") {
      throw new SupportError("invalid_state", "Mark this ticket as not spam before replying.");
    }
    if (input.lastSeenMessageId) {
      const [newer] = await tx
        .select({ id: supportMessage.id })
        .from(supportMessage)
        .where(
          and(
            eq(supportMessage.ticketId, ticket.id),
            eq(supportMessage.kind, "customer"),
            sql`${supportMessage.id} > ${input.lastSeenMessageId}`,
          ),
        )
        .limit(1);
      if (newer) {
        throw new SupportError(
          "new_message",
          "The customer wrote again while you were typing. Read it, then send.",
        );
      }
    }
    const [message] = await tx
      .insert(supportMessage)
      .values({
        ticketId: ticket.id,
        kind: "agent",
        authorUserId: input.author.userId,
        authorName: input.author.name,
        authorEmail: input.author.email,
        body: input.body,
        visibleText: input.body,
        customerVisible: true,
        deliveryStatus: "pending",
        nextDeliveryAt: now,
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
    await tx
      .update(supportTicket)
      .set({
        ...answered(ticket, now),
        status: after.status,
        snoozedUntil: after.status === "snoozed" ? (after.snoozedUntil ?? null) : null,
        resolvedAt: after.status === "resolved" ? now : null,
        assigneeUserId: ticket.assigneeUserId ?? input.author.userId,
      })
      .where(eq(supportTicket.id, ticket.id));
    if (after.status === "resolved") {
      await tx.insert(supportMessage).values({
        ticketId: ticket.id,
        kind: "event",
        event: "resolved",
        authorUserId: input.author.userId,
        authorName: input.author.name,
        customerVisible: true,
        createdAt: now,
      });
    }
  });
}

export async function addSupportNote(input: {
  ticketId: string;
  author: SupportAuthor;
  body: string;
  attachmentIds?: readonly string[];
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  await db.transaction(async (tx) => {
    const [ticket] = await tx
      .select({ id: supportTicket.id })
      .from(supportTicket)
      .where(eq(supportTicket.id, input.ticketId))
      .for("update");
    if (!ticket) throw new SupportError("not_found", "This ticket doesn't exist.");
    const [message] = await tx
      .insert(supportMessage)
      .values({
        ticketId: ticket.id,
        kind: "note",
        authorUserId: input.author.userId,
        authorName: input.author.name,
        authorEmail: input.author.email,
        body: input.body,
        visibleText: input.body,
        createdAt: now,
      })
      .returning({ id: supportMessage.id });
    if (!message) throw new Error("The note was not stored.");
    await claimAttachments(tx, {
      ticketId: ticket.id,
      messageId: message.id,
      uploadedByUserId: input.author.userId,
      ids: input.attachmentIds ?? [],
    });
  });
}

export async function assignSupportTicket(input: {
  ticketId: string;
  assigneeUserId: string | null;
  assigneeName?: string | null;
  author: SupportAuthor;
  now?: Date;
}): Promise<SupportTicketRow> {
  const now = input.now ?? new Date();
  return changeTicket(
    input.ticketId,
    async (ticket) =>
      ticket.assigneeUserId === input.assigneeUserId
        ? null
        : {
            set: { assigneeUserId: input.assigneeUserId },
            event: { name: "assigned", data: { assignee: input.assigneeName ?? null } },
          },
    input.author,
    now,
  );
}

/** Recalculates from when the customer started waiting: changing the plan never restarts it. */
async function reclock(
  ticket: Pick<
    SupportTicketRow,
    "awaitingSince" | "organizationId" | "suggestedOrganizationId" | "severity"
  >,
  now: Date,
  planFor: SupportPlanFor,
): Promise<TicketChange> {
  const plan = await planOfTicket(ticket, now, planFor);
  if (!ticket.awaitingSince) return { plan: plan.plan, allHours: plan.allHours };
  return supportClock({ from: ticket.awaitingSince, plan, severity: ticket.severity });
}

export async function setSupportSeverity(
  input: {
    ticketId: string;
    severity: SupportSeverity;
    author: SupportAuthor;
    now?: Date;
  },
  deps: { planFor: SupportPlanFor },
): Promise<SupportTicketRow> {
  const now = input.now ?? new Date();
  return changeTicket(
    input.ticketId,
    async (ticket) =>
      ticket.severity === input.severity
        ? null
        : {
            set: {
              severity: input.severity,
              ...(await reclock({ ...ticket, severity: input.severity }, now, deps.planFor)),
            },
            event: { name: "severity_changed", data: { severity: input.severity } },
          },
    input.author,
    now,
  );
}

export type SupportStatusChange =
  | { status: "open" | "pending" | "resolved" }
  | { status: "snoozed"; snoozedUntil: Date };

export async function setSupportStatus(input: {
  ticketId: string;
  change: SupportStatusChange;
  author: SupportAuthor;
  now?: Date;
}): Promise<SupportTicketRow> {
  const now = input.now ?? new Date();
  const { change } = input;
  return changeTicket(
    input.ticketId,
    async (ticket) => {
      if (ticket.status === change.status && change.status !== "snoozed") return null;
      if (change.status === "resolved") {
        return {
          set: {
            status: "resolved",
            resolvedAt: now,
            snoozedUntil: null,
            awaitingSince: null,
            responseDueAt: null,
            lastMessageAt: now,
          },
          event: { name: "resolved", customerVisible: true },
        };
      }
      if (change.status === "snoozed") {
        return {
          set: { status: "snoozed", snoozedUntil: change.snoozedUntil, resolvedAt: null },
          event: { name: "snoozed", data: { until: change.snoozedUntil.toISOString() } },
        };
      }
      if (change.status === "pending") {
        return {
          set: {
            status: "pending",
            snoozedUntil: null,
            resolvedAt: null,
            awaitingSince: null,
            responseDueAt: null,
            lastAgentMessageAt: ticket.lastAgentMessageAt ?? now,
          },
          event: { name: "waiting_on_customer" },
        };
      }
      const reopening = ticket.status === "resolved";
      return {
        set: { status: "open", snoozedUntil: null, resolvedAt: null, lastMessageAt: now },
        event: reopening ? { name: "reopened", customerVisible: true } : { name: "opened" },
      };
    },
    input.author,
    now,
  );
}

/** Out of the Spam view and onto the queue: the customer starts waiting now. */
export async function markSupportNotSpam(
  input: { ticketId: string; author: SupportAuthor; now?: Date },
  deps: { planFor: SupportPlanFor },
): Promise<SupportTicketRow> {
  const now = input.now ?? new Date();
  return changeTicket(
    input.ticketId,
    async (ticket) => {
      if (ticket.status !== "spam") return null;
      const plan = await planOfTicket(ticket, now, deps.planFor);
      return {
        set: {
          status: "open",
          filterReason: null,
          ...supportClock({ from: now, plan, severity: ticket.severity }),
        },
        event: { name: "not_spam" },
      };
    },
    input.author,
    now,
  );
}

export async function markSupportSpam(input: {
  ticketId: string;
  author: SupportAuthor;
  now?: Date;
}): Promise<SupportTicketRow> {
  const now = input.now ?? new Date();
  return changeTicket(
    input.ticketId,
    async (ticket) =>
      ticket.status === "spam"
        ? null
        : {
            set: {
              status: "spam",
              filterReason: "spam",
              awaitingSince: null,
              responseDueAt: null,
              snoozedUntil: null,
            },
            event: { name: "marked_spam" },
          },
    input.author,
    now,
  );
}

/**
 * A rep vouches for who this is: the ticket joins the organization, and what its sender wrote
 * becomes visible there. Rep-only messages from anyone else stay that way.
 */
export async function confirmSupportOrganization(
  input: { ticketId: string; organizationId: string; author: SupportAuthor; now?: Date },
  deps: { planFor: SupportPlanFor },
): Promise<SupportTicketRow> {
  const now = input.now ?? new Date();
  const [target] = await db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .where(eq(organization.id, input.organizationId));
  if (!target) throw new SupportError("not_found", "This organization doesn't exist.");
  return changeTicket(
    input.ticketId,
    async (ticket, tx) => {
      const account = await userByEmail(ticket.requesterEmail);
      const [membership] = account
        ? await tx
            .select({ id: member.id })
            .from(member)
            .where(and(eq(member.userId, account.id), eq(member.organizationId, target.id)))
        : [];
      await tx
        .update(supportMessage)
        .set({ customerVisible: true })
        .where(
          and(
            eq(supportMessage.ticketId, ticket.id),
            eq(supportMessage.kind, "customer"),
            eq(supportMessage.authorEmail, ticket.requesterEmail),
            eq(supportMessage.lowSignal, false),
          ),
        );
      return {
        set: {
          organizationId: target.id,
          organizationName: target.name,
          orgMatch: "manual",
          suggestedOrganizationId: null,
          // Only a verified member's account can read the ticket from their dashboard.
          requesterUserId: membership && account?.emailVerified ? account.id : null,
          ...(await reclock(
            { ...ticket, organizationId: target.id, suggestedOrganizationId: null },
            now,
            deps.planFor,
          )),
        },
        event: { name: "organization_confirmed", data: { organization: target.name } },
      };
    },
    input.author,
    now,
  );
}

/** Shows one rep-only message to the customer (a colleague's reply the rep has checked). */
export async function revealSupportMessage(input: { messageId: string }): Promise<void> {
  await db
    .update(supportMessage)
    .set({ customerVisible: true })
    .where(and(eq(supportMessage.id, input.messageId), eq(supportMessage.kind, "customer")));
}

export async function acceptSuggestedCc(input: {
  ticketId: string;
  address: string;
  author: SupportAuthor;
  now?: Date;
}): Promise<SupportTicketRow> {
  const now = input.now ?? new Date();
  return changeTicket(
    input.ticketId,
    async (ticket) =>
      ticket.suggestedCc.includes(input.address)
        ? {
            set: {
              cc: [...new Set([...ticket.cc, input.address])],
              suggestedCc: ticket.suggestedCc.filter((address) => address !== input.address),
            },
            event: { name: "cc_added", data: { address: input.address } },
          }
        : null,
    input.author,
    now,
  );
}

/** Everyone who can answer tickets, for assigning. */
export async function listSupportReps(): Promise<{ id: string; name: string; email: string }[]> {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(sql`'admin' = any(string_to_array(${user.role}, ','))`)
    .orderBy(asc(user.name));
}

export async function listSavedReplies() {
  return db.select().from(supportSavedReply).orderBy(asc(supportSavedReply.title));
}

export async function saveSavedReply(input: {
  id?: string;
  title: string;
  body: string;
  createdByUserId: string;
}): Promise<void> {
  if (input.id) {
    await db
      .update(supportSavedReply)
      .set({ title: input.title, body: input.body })
      .where(eq(supportSavedReply.id, input.id));
    return;
  }
  await db
    .insert(supportSavedReply)
    .values({ title: input.title, body: input.body, createdByUserId: input.createdByUserId })
    .onConflictDoUpdate({ target: supportSavedReply.title, set: { body: input.body } });
}

export async function deleteSavedReply(id: string): Promise<void> {
  await db.delete(supportSavedReply).where(eq(supportSavedReply.id, id));
}

/** Received mail intake gave up on. Rows whose email has been purged can't be filed any more. */
export async function listFailedSupportIntakes(limit = 100) {
  return db
    .select({
      receivedEmailId: supportIntake.receivedEmailId,
      from: receivedEmail.from,
      subject: receivedEmail.subject,
      receivedAt: receivedEmail.createdAt,
      attempts: supportIntake.attempts,
      lastError: supportIntake.lastError,
      failedAt: supportIntake.settledAt,
    })
    .from(supportIntake)
    .innerJoin(receivedEmail, eq(receivedEmail.id, supportIntake.receivedEmailId))
    .where(eq(supportIntake.outcome, "failed"))
    .orderBy(desc(supportIntake.settledAt))
    .limit(limit);
}

export async function countFailedSupportIntakes(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(supportIntake)
    .innerJoin(receivedEmail, eq(receivedEmail.id, supportIntake.receivedEmailId))
    .where(eq(supportIntake.outcome, "failed"));
  return row?.count ?? 0;
}

/** Puts a failed message back in line, with its attempts reset: the next `support` run files it. */
export async function requeueSupportIntake(receivedEmailId: string): Promise<void> {
  const [requeued] = await db
    .update(supportIntake)
    .set({
      outcome: null,
      settledAt: null,
      attempts: 0,
      lastError: null,
      nextAttemptAt: new Date(),
    })
    .where(
      and(eq(supportIntake.receivedEmailId, receivedEmailId), eq(supportIntake.outcome, "failed")),
    )
    .returning({ id: supportIntake.receivedEmailId });
  if (!requeued) throw new SupportError("not_found", "This email isn't waiting to be requeued.");
}

export type SupportStats = {
  plan: string;
  resolved: number;
  breached: number;
  medianFirstResponseMinutes: number | null;
}[];

/** First-response time and misses by plan, for tickets opened since `since`. */
export async function supportStatsByPlan(since: Date): Promise<SupportStats> {
  const rows = await db
    .select({
      plan: supportTicket.plan,
      resolved: sql<number>`count(*) filter (where ${supportTicket.status} = 'resolved')::int`,
      breached: sql<number>`count(*) filter (where ${supportTicket.breachedAt} is not null)::int`,
      median: sql<
        number | null
      >`percentile_cont(0.5) within group (order by extract(epoch from ${supportTicket.firstRespondedAt} - ${supportTicket.createdAt}) / 60) filter (where ${supportTicket.firstRespondedAt} is not null)`,
    })
    .from(supportTicket)
    .where(and(sql`${supportTicket.createdAt} >= ${since}`, sql`${supportTicket.status} <> 'spam'`))
    .groupBy(supportTicket.plan);
  return rows.map((row) => ({
    plan: row.plan,
    resolved: row.resolved,
    breached: row.breached,
    medianFirstResponseMinutes: row.median === null ? null : Math.round(Number(row.median)),
  }));
}
