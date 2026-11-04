/**
 * Turns mail received in the support environment into tickets. It reads what `receiveEmail` stored
 * rather than hooking into it, so nothing here can affect another customer's mail: a message that
 * keeps failing is retried a few times, reported and set aside. System-level: scans one environment.
 */
import { db, type Executor, schema } from "@coss/db";
import { enqueueNotification } from "@coss/notifications";
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { matchSender, type SupportPlanFor } from "./matching.ts";
import {
  bareAddress,
  displayNameOf,
  isAutomated,
  isDmarcAuthenticated,
  normalizeMessageId,
  type ReceivedHeader,
  supportRecipient,
} from "./sender.ts";
import { supportFileKey } from "./store.ts";
import {
  acknowledgement,
  newReplyToken,
  planOfTicket,
  reopenForCustomer,
  type SupportTicketRow,
  supportClock,
} from "./tickets.ts";

const {
  receivedEmail,
  receivedEmailAttachment,
  supportAttachment,
  supportIntake,
  supportMessage,
  supportTicket,
} = schema;

export const SUPPORT_INTAKE_FAILED_KIND = "support.intake_failed";

const MINUTE = 60 * 1000;
const MAX_INTAKE_ATTEMPTS = 5;
const INTAKE_LEASE_MS = 5 * MINUTE;
const MAX_BODY_LENGTH = 256 * 1024;
const MAX_SUBJECT_LENGTH = 300;
const MAX_CC = 20;
/** More new tickets than this from one address in an hour go to Spam, not the queue. */
export const SUPPORT_FLOOD_LIMIT = 20;
/** Inline images smaller than this are signatures and logos, not something the customer attached. */
const MIN_INLINE_ATTACHMENT_BYTES = 50 * 1024;

export type SupportIntakeDeps = {
  environmentId: string;
  planFor: SupportPlanFor;
  /** Addresses of ours: mail from them is a loop. */
  ownAddresses: readonly string[];
  /** `@coss/email`'s heuristics, injected so this package doesn't depend on the email product. */
  extractReplyText(text: string): string;
  htmlToText(html: string): string | null;
};

type Received = typeof receivedEmail.$inferSelect;

function oneLineSubject(value: string | null): string {
  const subject = (value ?? "")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_SUBJECT_LENGTH);
  return subject || "(no subject)";
}

function bodyOf(row: Received, deps: SupportIntakeDeps): string {
  const text = row.text?.trim() ? row.text : row.html ? (deps.htmlToText(row.html) ?? "") : "";
  return text.slice(0, MAX_BODY_LENGTH);
}

function participantsFrom(row: Received, requester: string, deps: SupportIntakeDeps): string[] {
  const own = new Set(deps.ownAddresses);
  const addresses = [...row.to, ...row.cc].flatMap((value) => bareAddress(value) ?? []);
  return [...new Set(addresses)]
    .filter(
      (address) =>
        address !== requester &&
        !own.has(address) &&
        !address.startsWith("support@") &&
        !address.startsWith("support+"),
    )
    .slice(0, MAX_CC);
}

async function ticketByToken(tx: Executor, token: string): Promise<SupportTicketRow | null> {
  const [ticket] = await tx
    .select()
    .from(supportTicket)
    .where(eq(supportTicket.replyToken, token))
    .for("update");
  return ticket ?? null;
}

async function ticketByReference(tx: Executor, row: Received): Promise<SupportTicketRow | null> {
  const ids = [row.inReplyTo, ...row.references].flatMap((id) => normalizeMessageId(id) ?? []);
  if (ids.length === 0) return null;
  const [match] = await tx
    .select({ ticketId: supportMessage.ticketId })
    .from(supportMessage)
    .where(inArray(supportMessage.rfcMessageId, ids))
    .orderBy(asc(supportMessage.id))
    .limit(1);
  if (!match) return null;
  const [ticket] = await tx
    .select()
    .from(supportTicket)
    .where(eq(supportTicket.id, match.ticketId))
    .for("update");
  return ticket ?? null;
}

async function copyAttachmentRows(
  tx: Executor,
  row: Received,
  ticketId: string,
  messageId: string,
): Promise<void> {
  const attachments = await tx
    .select()
    .from(receivedEmailAttachment)
    .where(eq(receivedEmailAttachment.receivedEmailId, row.id))
    .orderBy(asc(receivedEmailAttachment.position));
  const kept = attachments.filter(
    (attachment) =>
      attachment.disposition !== "inline" || attachment.size >= MIN_INLINE_ATTACHMENT_BYTES,
  );
  if (kept.length === 0) return;
  await tx.insert(supportAttachment).values(
    kept.map((attachment) => ({
      ticketId,
      messageId,
      filename: attachment.filename ?? `attachment-${attachment.position + 1}`,
      contentType: attachment.contentType,
      size: attachment.size,
      state: "pending_copy" as const,
      sourceKey: attachment.contentKey,
      storeKey: supportFileKey(),
      nextAttemptAt: new Date(),
    })),
  );
}

async function recentNewTickets(tx: Executor, address: string, now: Date): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(supportTicket)
    .where(
      and(
        eq(supportTicket.requesterEmail, address),
        eq(supportTicket.source, "email"),
        gte(supportTicket.createdAt, new Date(now.getTime() - 60 * MINUTE)),
      ),
    );
  return row?.count ?? 0;
}

async function fileReply(
  tx: Executor,
  row: Received,
  ticket: SupportTicketRow,
  sender: { address: string; name: string | null; authenticated: boolean },
  filtered: boolean,
  now: Date,
  deps: SupportIntakeDeps,
): Promise<string> {
  const rfcMessageId = normalizeMessageId(row.messageId);
  if (rfcMessageId) {
    const [seen] = await tx
      .select({ id: supportMessage.id })
      .from(supportMessage)
      .where(
        and(eq(supportMessage.ticketId, ticket.id), eq(supportMessage.rfcMessageId, rfcMessageId)),
      );
    // The same message can arrive twice: through Google and straight to the reply address.
    if (seen) return "duplicate";
  }
  const participant =
    sender.address === ticket.requesterEmail || ticket.cc.includes(sender.address);
  const trusted = sender.authenticated && participant;
  const body = bodyOf(row, deps);
  const [message] = await tx
    .insert(supportMessage)
    .values({
      ticketId: ticket.id,
      kind: "customer",
      authorName: sender.name,
      authorEmail: sender.address,
      body,
      visibleText: deps.extractReplyText(body),
      senderAuth: sender.authenticated ? "dmarc_pass" : "unverified",
      customerVisible: trusted && !filtered,
      lowSignal: filtered,
      rfcMessageId,
      receivedEmailId: row.id,
      repAlertPending: !filtered,
      createdAt: now,
    })
    .returning({ id: supportMessage.id });
  if (!message) throw new Error("The message was not stored.");
  await copyAttachmentRows(tx, row, ticket.id, message.id);
  if (filtered) {
    await tx
      .update(supportTicket)
      .set({ lastMessageAt: now })
      .where(eq(supportTicket.id, ticket.id));
    return "filed";
  }
  await reopenForCustomer(tx, ticket, now, deps.planFor);
  if (!trusted) {
    const fresh = participantsFrom(row, sender.address, deps).filter(
      (address) => !ticket.cc.includes(address) && !ticket.suggestedCc.includes(address),
    );
    if (fresh.length) {
      await tx
        .update(supportTicket)
        .set({ suggestedCc: [...ticket.suggestedCc, ...fresh].slice(0, MAX_CC) })
        .where(eq(supportTicket.id, ticket.id));
    }
  } else {
    const fresh = participantsFrom(row, ticket.requesterEmail, deps).filter(
      (address) => !ticket.cc.includes(address),
    );
    if (fresh.length) {
      await tx
        .update(supportTicket)
        .set({ cc: [...ticket.cc, ...fresh].slice(0, MAX_CC) })
        .where(eq(supportTicket.id, ticket.id));
    }
  }
  return "replied";
}

async function fileNewTicket(
  tx: Executor,
  row: Received,
  sender: { address: string; name: string | null; authenticated: boolean },
  filter: { reason: "spam" | "auto" | null },
  now: Date,
  deps: SupportIntakeDeps,
): Promise<string> {
  const flooded = (await recentNewTickets(tx, sender.address, now)) >= SUPPORT_FLOOD_LIMIT;
  const filterReason = filter.reason ?? (flooded ? "flood" : null);
  const match = await matchSender({
    address: sender.address,
    authenticated: sender.authenticated,
    at: now,
    planFor: deps.planFor,
  });
  const plan = await planOfTicket(
    {
      organizationId: match.organizationId,
      suggestedOrganizationId: match.suggestedOrganizationId,
    },
    now,
    deps.planFor,
  );
  const participants = participantsFrom(row, sender.address, deps);
  const body = bodyOf(row, deps);
  const [ticket] = await tx
    .insert(supportTicket)
    .values({
      replyToken: newReplyToken(),
      subject: oneLineSubject(row.subject),
      source: "email",
      status: filterReason ? "spam" : "open",
      filterReason,
      organizationId: match.organizationId,
      organizationName: match.organizationName,
      orgMatch: match.organizationId ? "email" : null,
      suggestedOrganizationId: match.suggestedOrganizationId,
      requesterUserId: match.requesterUserId,
      requesterEmail: sender.address,
      requesterName: sender.name,
      senderAuth: sender.authenticated ? "dmarc_pass" : "unverified",
      cc: sender.authenticated ? participants : [],
      suggestedCc: sender.authenticated ? [] : participants,
      lastCustomerMessageAt: now,
      lastMessageAt: now,
      createdAt: now,
      ...(filterReason
        ? { plan: plan.plan, allHours: plan.allHours }
        : supportClock({ from: now, plan, severity: "normal" })),
    })
    .returning();
  if (!ticket) throw new Error("The ticket was not stored.");
  const [message] = await tx
    .insert(supportMessage)
    .values({
      ticketId: ticket.id,
      kind: "customer",
      authorName: sender.name,
      authorEmail: sender.address,
      authorUserId: match.requesterUserId,
      body,
      visibleText: deps.extractReplyText(body),
      senderAuth: sender.authenticated ? "dmarc_pass" : "unverified",
      customerVisible: sender.authenticated && match.organizationId !== null && !filterReason,
      lowSignal: filterReason !== null,
      rfcMessageId: normalizeMessageId(row.messageId),
      receivedEmailId: row.id,
      repAlertPending: !filterReason,
      createdAt: now,
    })
    .returning({ id: supportMessage.id });
  if (!message) throw new Error("The message was not stored.");
  await copyAttachmentRows(tx, row, ticket.id, message.id);
  if (sender.authenticated && !filterReason) {
    await tx.insert(supportMessage).values(acknowledgement(ticket.id, now));
  }
  return "created";
}

function settle(
  tx: Executor,
  receivedEmailId: string,
  now: Date,
  result: { outcome: string; ticketId: string | null },
) {
  return tx
    .update(supportIntake)
    .set({ ...result, settledAt: now, nextAttemptAt: null, lastError: null })
    .where(eq(supportIntake.receivedEmailId, receivedEmailId));
}

/** Files a message and settles its intake together: filed twice would mean two tickets. */
async function fileReceivedEmail(row: Received, now: Date, deps: SupportIntakeDeps): Promise<void> {
  const recipient = supportRecipient(row.recipients);
  if (!recipient) {
    await settle(db, row.id, now, { outcome: "not_support", ticketId: null });
    return;
  }
  const address = bareAddress(row.from);
  if (!address || deps.ownAddresses.includes(address)) {
    await settle(db, row.id, now, { outcome: "no_sender", ticketId: null });
    return;
  }
  const headers = row.headers as ReceivedHeader[];
  const sender = {
    address,
    name: displayNameOf(row.from),
    authenticated: isDmarcAuthenticated({ dmarcVerdict: row.dmarcVerdict, headers }),
  };
  const automated = isAutomated({ mailFrom: row.mailFrom, from: address, headers });
  const spam = row.spamVerdict === "fail";
  await db.transaction(async (tx) => {
    // A run that outlived its lease holds this row: the second one waits, then finds it settled.
    const [intake] = await tx
      .select({ settledAt: supportIntake.settledAt })
      .from(supportIntake)
      .where(eq(supportIntake.receivedEmailId, row.id))
      .for("update");
    if (intake?.settledAt) return;
    const ticket =
      (recipient.token ? await ticketByToken(tx, recipient.token) : null) ??
      (await ticketByReference(tx, row));
    if (ticket) {
      const outcome = await fileReply(tx, row, ticket, sender, spam || automated, now, deps);
      await settle(tx, row.id, now, { outcome, ticketId: ticket.id });
      return;
    }
    const reason = spam ? "spam" : automated ? "auto" : null;
    const outcome = await fileNewTicket(tx, row, sender, { reason }, now, deps);
    const [created] = await tx
      .select({ id: supportMessage.ticketId })
      .from(supportMessage)
      .where(eq(supportMessage.receivedEmailId, row.id));
    await settle(tx, row.id, now, { outcome, ticketId: created?.id ?? null });
  });
}

/** Files received mail that's due, oldest first. Returns how many messages it looked at. */
export async function ingestSupportEmails(
  opts: { now?: Date; limit?: number },
  deps: SupportIntakeDeps,
): Promise<number> {
  const now = opts.now ?? new Date();
  const candidates = await db
    .select({ received: receivedEmail })
    .from(receivedEmail)
    .leftJoin(supportIntake, eq(supportIntake.receivedEmailId, receivedEmail.id))
    .where(
      and(
        eq(receivedEmail.environmentId, deps.environmentId),
        eq(receivedEmail.status, "received"),
        or(
          isNull(supportIntake.receivedEmailId),
          and(isNull(supportIntake.settledAt), lte(supportIntake.nextAttemptAt, now)),
        ),
      ),
    )
    .orderBy(asc(receivedEmail.id))
    .limit(opts.limit ?? 25);

  for (const { received } of candidates) {
    const lease = new Date(now.getTime() + INTAKE_LEASE_MS);
    const [claim] = await db
      .insert(supportIntake)
      .values({ receivedEmailId: received.id, attempts: 1, nextAttemptAt: lease, createdAt: now })
      .onConflictDoUpdate({
        target: supportIntake.receivedEmailId,
        set: { attempts: sql`${supportIntake.attempts} + 1`, nextAttemptAt: lease },
        where: and(isNull(supportIntake.settledAt), lte(supportIntake.nextAttemptAt, now)),
      })
      .returning({ attempts: supportIntake.attempts });
    if (!claim) continue;
    try {
      await fileReceivedEmail(received, now, deps);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[support] Couldn't file received email ${received.id}:`, error);
      const gaveUp = claim.attempts >= MAX_INTAKE_ATTEMPTS;
      await db.transaction(async (tx) => {
        await tx
          .update(supportIntake)
          .set({
            lastError: message,
            outcome: gaveUp ? "failed" : null,
            settledAt: gaveUp ? now : null,
            nextAttemptAt: gaveUp ? null : new Date(now.getTime() + 2 ** claim.attempts * MINUTE),
          })
          .where(eq(supportIntake.receivedEmailId, received.id));
        if (gaveUp) {
          // The support environment is coss.com's own organization, whose notifications these are.
          await enqueueNotification(tx, {
            organizationId: received.organizationId,
            kind: SUPPORT_INTAKE_FAILED_KIND,
            dedupeKey: `${received.id}:${now.toISOString()}`,
            payload: { receivedEmailId: received.id },
            now,
          });
        }
      });
    }
  }
  return candidates.length;
}
