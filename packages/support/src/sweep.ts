/**
 * The desk's housekeeping: attachments copied in, snoozes woken, quiet tickets closed, reps
 * alerted, expired tickets purged. System-level, run by the worker's `support` loop.
 */
import { type PlanKey, supportResponseMinutes } from "@coss/billing/catalog";
import { db, schema } from "@coss/db";
import { oneLine } from "@coss/email-layout";
import {
  enqueueNotification,
  type NotificationKinds,
  type NotificationRecipient,
} from "@coss/notifications";
import { RETENTION_DAYS } from "@coss/retention";
import { and, asc, eq, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import type { SupportFileStore } from "./store.ts";
import { acknowledgement } from "./tickets.ts";

const { supportAttachment, supportIntake, supportMessage, supportTicket, user } = schema;

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const MAX_COPY_ATTEMPTS = 8;
/** Waiting on the customer this long closes a ticket, with a closing email. */
export const SUPPORT_AUTO_RESOLVE_MS = 7 * DAY;
/** Uploads never sent with a message. */
const UNCLAIMED_UPLOAD_MS = DAY;
/** A target's last quarter is when a rep hears it's at risk. */
const AT_RISK_FRACTION = 0.25;

type Scope = { ticketIds: string[] };

/** A received attachment's bytes expire with the received email, so a ticket keeps its own. */
export async function copySupportAttachments(
  opts: { now?: Date; limit?: number; scope?: Scope },
  deps: {
    inbound: { get(key: string): Promise<Uint8Array | null> } | null;
    store: SupportFileStore | null;
  },
): Promise<number> {
  if (!deps.inbound || !deps.store) return 0;
  const now = opts.now ?? new Date();
  const rows = await db
    .select()
    .from(supportAttachment)
    .where(
      and(
        eq(supportAttachment.state, "pending_copy"),
        lte(supportAttachment.nextAttemptAt, now),
        opts.scope ? inArray(supportAttachment.ticketId, opts.scope.ticketIds) : undefined,
      ),
    )
    .orderBy(asc(supportAttachment.nextAttemptAt))
    .limit(opts.limit ?? 20);
  for (const row of rows) {
    try {
      const content = row.sourceKey ? await deps.inbound.get(row.sourceKey) : null;
      if (!content) {
        await db
          .update(supportAttachment)
          .set({ state: "failed", nextAttemptAt: null })
          .where(eq(supportAttachment.id, row.id));
        continue;
      }
      await deps.store.put({ key: row.storeKey, contentType: row.contentType, content });
      await db
        .update(supportAttachment)
        .set({ state: "stored", sourceKey: null, nextAttemptAt: null })
        .where(eq(supportAttachment.id, row.id));
    } catch (error) {
      console.error(`[support] Couldn't copy attachment ${row.id}:`, error);
      const attempts = row.attempts + 1;
      await db
        .update(supportAttachment)
        .set({
          attempts,
          state: attempts >= MAX_COPY_ATTEMPTS ? "failed" : "pending_copy",
          nextAttemptAt:
            attempts >= MAX_COPY_ATTEMPTS ? null : new Date(now.getTime() + 2 ** attempts * MINUTE),
        })
        .where(eq(supportAttachment.id, row.id));
    }
  }
  return rows.length;
}

export async function wakeSnoozedTickets(opts: { now?: Date; scope?: Scope }): Promise<number> {
  const now = opts.now ?? new Date();
  const woken = await db
    .update(supportTicket)
    .set({ status: "open", snoozedUntil: null })
    .where(
      and(
        eq(supportTicket.status, "snoozed"),
        lte(supportTicket.snoozedUntil, now),
        opts.scope ? inArray(supportTicket.id, opts.scope.ticketIds) : undefined,
      ),
    )
    .returning({ id: supportTicket.id });
  if (woken.length > 0) {
    await db.insert(supportMessage).values(
      woken.map(({ id }) => ({
        ticketId: id,
        kind: "event" as const,
        event: "woke",
        createdAt: now,
      })),
    );
  }
  return woken.length;
}

export async function autoResolveQuietTickets(opts: {
  now?: Date;
  limit?: number;
  scope?: Scope;
}): Promise<number> {
  const now = opts.now ?? new Date();
  const quiet = await db
    .select({ id: supportTicket.id })
    .from(supportTicket)
    .where(
      and(
        eq(supportTicket.status, "pending"),
        lt(supportTicket.lastMessageAt, new Date(now.getTime() - SUPPORT_AUTO_RESOLVE_MS)),
        opts.scope ? inArray(supportTicket.id, opts.scope.ticketIds) : undefined,
      ),
    )
    .limit(opts.limit ?? 50);
  for (const { id } of quiet) {
    await db.transaction(async (tx) => {
      const [moved] = await tx
        .update(supportTicket)
        .set({ status: "resolved", resolvedAt: now, lastMessageAt: now })
        .where(and(eq(supportTicket.id, id), eq(supportTicket.status, "pending")))
        .returning({ id: supportTicket.id });
      if (!moved) return;
      await tx.insert(supportMessage).values({
        ...acknowledgement(id, now),
        event: "auto_resolved",
        customerVisible: true,
      });
    });
  }
  return quiet.length;
}

export const SUPPORT_ALERT_KINDS = {
  newTicket: "support.new_ticket",
  reply: "support.customer_reply",
  atRisk: "support.sla_at_risk",
  breached: "support.sla_breached",
  deliveryFailed: "support.delivery_failed",
} as const;

/**
 * Tells reps what needs them. The alerts are coss.com's own, so they're the system organization's
 * notifications: `organizationId` is that organization.
 */
export async function enqueueSupportAlerts(opts: {
  organizationId: string;
  now?: Date;
  limit?: number;
  scope?: Scope;
}): Promise<number> {
  const now = opts.now ?? new Date();
  const ticketScope = opts.scope ? inArray(supportTicket.id, opts.scope.ticketIds) : undefined;
  const messages = await db
    .select({
      id: supportMessage.id,
      kind: supportMessage.kind,
      ticketId: supportMessage.ticketId,
      deliveryStatus: supportMessage.deliveryStatus,
      createdAt: supportMessage.createdAt,
      ticketCreatedAt: supportTicket.createdAt,
    })
    .from(supportMessage)
    .innerJoin(supportTicket, eq(supportTicket.id, supportMessage.ticketId))
    .where(and(eq(supportMessage.repAlertPending, true), ticketScope))
    .orderBy(asc(supportMessage.id))
    .limit(opts.limit ?? 50);
  for (const message of messages) {
    await db.transaction(async (tx) => {
      const failed = message.deliveryStatus === "failed" || message.deliveryStatus === "bounced";
      const isFirst = message.createdAt.getTime() === message.ticketCreatedAt.getTime();
      const kind = failed
        ? SUPPORT_ALERT_KINDS.deliveryFailed
        : isFirst
          ? SUPPORT_ALERT_KINDS.newTicket
          : SUPPORT_ALERT_KINDS.reply;
      await enqueueNotification(tx, {
        organizationId: opts.organizationId,
        kind,
        dedupeKey: message.id,
        payload: { ticketId: message.ticketId, messageId: message.id },
        now,
      });
      await tx
        .update(supportMessage)
        .set({ repAlertPending: false })
        .where(eq(supportMessage.id, message.id));
    });
  }

  const running = await db
    .select({
      id: supportTicket.id,
      plan: supportTicket.plan,
      severity: supportTicket.severity,
      responseDueAt: supportTicket.responseDueAt,
      riskAlertedDueAt: supportTicket.riskAlertedDueAt,
      breachAlertedDueAt: supportTicket.breachAlertedDueAt,
    })
    .from(supportTicket)
    .where(
      and(
        inArray(supportTicket.status, ["open", "snoozed"]),
        isNotNull(supportTicket.responseDueAt),
        or(
          isNull(supportTicket.breachAlertedDueAt),
          ne(supportTicket.breachAlertedDueAt, supportTicket.responseDueAt),
        ),
        ticketScope,
      ),
    )
    .orderBy(asc(supportTicket.responseDueAt))
    .limit(opts.limit ?? 50);
  let alerted = messages.length;
  for (const ticket of running) {
    const due = ticket.responseDueAt;
    if (!due) continue;
    const target = supportResponseMinutes(ticket.plan as PlanKey, ticket.severity) * MINUTE;
    const riskAt = due.getTime() - target * AT_RISK_FRACTION;
    const breached = due <= now;
    const atRisk =
      !breached && now.getTime() >= riskAt && ticket.riskAlertedDueAt?.getTime() !== due.getTime();
    if (!breached && !atRisk) continue;
    await db.transaction(async (tx) => {
      await enqueueNotification(tx, {
        organizationId: opts.organizationId,
        kind: breached ? SUPPORT_ALERT_KINDS.breached : SUPPORT_ALERT_KINDS.atRisk,
        dedupeKey: `${ticket.id}:${due.toISOString()}`,
        payload: { ticketId: ticket.id, dueAt: due.toISOString() },
        now,
      });
      await tx
        .update(supportTicket)
        .set(breached ? { breachAlertedDueAt: due } : { riskAlertedDueAt: due })
        .where(eq(supportTicket.id, ticket.id));
    });
    alerted++;
  }
  return alerted;
}

async function repRecipients(assigneeUserId: string | null): Promise<NotificationRecipient[]> {
  const reachable = and(
    sql`'admin' = any(string_to_array(${user.role}, ','))`,
    eq(user.emailVerified, true),
    or(isNull(user.banned), ne(user.banned, true)),
  );
  if (assigneeUserId) {
    const assigned = await db
      .select({ userId: user.id, email: user.email })
      .from(user)
      .where(and(eq(user.id, assigneeUserId), reachable));
    if (assigned.length > 0) return assigned;
  }
  return db.select({ userId: user.id, email: user.email }).from(user).where(reachable);
}

type AlertTicket = typeof supportTicket.$inferSelect;

async function alertTicket(payload: Record<string, unknown>): Promise<AlertTicket | null> {
  const id = typeof payload.ticketId === "string" ? payload.ticketId : null;
  if (!id) return null;
  const [ticket] = await db.select().from(supportTicket).where(eq(supportTicket.id, id));
  return ticket ?? null;
}

const ALERT_REASON = "You're receiving this because you answer coss.com's support tickets.";

function alertKind(input: {
  title: (ticket: AlertTicket) => string;
  stale: (ticket: AlertTicket, payload: Record<string, unknown>) => boolean;
  maxAgeMs?: number;
}): NotificationKinds[string] {
  return {
    maxAgeMs: input.maxAgeMs,
    async render(context) {
      const ticket = await alertTicket(context.payload);
      if (!ticket) return { skip: "The ticket is gone." };
      if (input.stale(ticket, context.payload)) return { skip: "The ticket has moved on." };
      const title = input.title(ticket);
      const organization = ticket.organizationName ?? "No confirmed organization";
      return {
        subject: `${title}: ${oneLine(ticket.subject)} [#${ticket.number}]`,
        title,
        blocks: [
          {
            details: [
              { label: "Ticket", value: `#${ticket.number}` },
              { label: "Subject", value: oneLine(ticket.subject) },
              { label: "From", value: ticket.requesterEmail },
              { label: "Organization", value: oneLine(organization) },
              { label: "Plan", value: ticket.plan },
              { label: "Severity", value: ticket.severity },
            ],
          },
          { button: { label: "Open ticket", url: context.url(`/admin/support/${ticket.id}`) } },
        ],
        reason: ALERT_REASON,
      };
    },
    async recipients(context) {
      const ticket = await alertTicket(context.payload);
      return repRecipients(ticket?.assigneeUserId ?? null);
    },
  };
}

function isNoLongerWaiting(ticket: AlertTicket, payload: Record<string, unknown>): boolean {
  return (
    ticket.status === "resolved" ||
    ticket.status === "spam" ||
    ticket.responseDueAt?.toISOString() !== payload.dueAt
  );
}

export const SUPPORT_NOTIFICATION_KINDS: NotificationKinds = {
  [SUPPORT_ALERT_KINDS.newTicket]: alertKind({
    title: (ticket) => (ticket.severity === "urgent" ? "Urgent ticket" : "New ticket"),
    stale: (ticket) => ticket.status === "spam",
  }),
  [SUPPORT_ALERT_KINDS.reply]: alertKind({
    title: () => "Customer replied",
    stale: (ticket) => ticket.status === "spam",
  }),
  [SUPPORT_ALERT_KINDS.atRisk]: alertKind({
    title: () => "SLA at risk",
    stale: isNoLongerWaiting,
    maxAgeMs: 6 * 60 * MINUTE,
  }),
  [SUPPORT_ALERT_KINDS.breached]: alertKind({
    title: () => "SLA missed",
    stale: isNoLongerWaiting,
  }),
  [SUPPORT_ALERT_KINDS.deliveryFailed]: alertKind({
    title: () => "Reply not delivered",
    stale: () => false,
  }),
};

/** Deleted tickets take their rows by cascade; their bytes go first, since a crash must not orphan them. */
export async function purgeExpiredSupportTickets(opts: {
  now?: Date;
  limit?: number;
  store: SupportFileStore | null;
  scope?: Scope;
}): Promise<number> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 100;
  const resolvedBefore = new Date(now.getTime() - RETENTION_DAYS.supportTickets * DAY);
  const spamBefore = new Date(now.getTime() - RETENTION_DAYS.supportSpam * DAY);
  const expired = or(
    and(eq(supportTicket.status, "resolved"), lt(supportTicket.resolvedAt, resolvedBefore)),
    and(eq(supportTicket.status, "spam"), lt(supportTicket.createdAt, spamBefore)),
  );
  const tickets = await db
    .select({ id: supportTicket.id })
    .from(supportTicket)
    .where(and(expired, opts.scope ? inArray(supportTicket.id, opts.scope.ticketIds) : undefined))
    .limit(limit);
  if (tickets.length === 0) return 0;
  const ids = tickets.map((ticket) => ticket.id);
  const attachments = await db
    .select({ key: supportAttachment.storeKey, state: supportAttachment.state })
    .from(supportAttachment)
    .where(inArray(supportAttachment.ticketId, ids));
  const stored = attachments.filter((row) => row.state === "stored").map((row) => row.key);
  if (stored.length > 0) {
    // Without a store the bytes can't go, so neither can the rows that point at them.
    if (!opts.store) return 0;
    await opts.store.delete(stored);
  }
  await db.delete(supportTicket).where(and(inArray(supportTicket.id, ids), expired));
  return ids.length;
}

/** Uploads nobody sent, and intake records older than the mail they describe. */
export async function purgeSupportLeftovers(opts: {
  now?: Date;
  limit?: number;
  store: SupportFileStore | null;
  scope?: { uploaderIds: string[] };
}): Promise<number> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 100;
  let removed = 0;
  if (opts.store) {
    const unclaimed = await db
      .select({ id: supportAttachment.id, key: supportAttachment.storeKey })
      .from(supportAttachment)
      .where(
        and(
          isNull(supportAttachment.messageId),
          lt(supportAttachment.createdAt, new Date(now.getTime() - UNCLAIMED_UPLOAD_MS)),
          opts.scope
            ? inArray(supportAttachment.uploadedByUserId, opts.scope.uploaderIds)
            : undefined,
        ),
      )
      .limit(limit);
    if (unclaimed.length > 0) {
      await opts.store.delete(unclaimed.map((row) => row.key));
      await db.delete(supportAttachment).where(
        and(
          inArray(
            supportAttachment.id,
            unclaimed.map((row) => row.id),
          ),
          isNull(supportAttachment.messageId),
        ),
      );
      removed += unclaimed.length;
    }
  }
  if (!opts.scope) {
    const intake = await db
      .delete(supportIntake)
      .where(
        lt(
          supportIntake.createdAt,
          new Date(now.getTime() - (RETENTION_DAYS.receivedEmails + 15) * DAY),
        ),
      )
      .returning({ id: supportIntake.receivedEmailId });
    removed += intake.length;
  }
  return removed;
}
