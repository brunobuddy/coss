/**
 * Sends what customers should hear about a ticket and follows it to delivery. `SupportMailer` is
 * implemented by the worker over the email product; system-level, across tickets.
 */
import { createHash } from "node:crypto";
import { formatSupportTarget, type PlanKey, supportResponseMinutes } from "@coss/billing/catalog";
import { db, schema } from "@coss/db";
import { type EmailBlock, type EmailContent, renderEmail } from "@coss/email-layout";
import { and, asc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { parseSupportText } from "./format.ts";
import { formatSupportTime } from "./sla.ts";
import type { SupportFileStore } from "./store.ts";
import type { SupportMessageRow, SupportTicketRow } from "./tickets.ts";

const { organization, supportAttachment, supportMessage, supportTicket } = schema;

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const DELIVERY_LEASE_MS = 5 * MINUTE;
const MAX_DELIVERY_ATTEMPTS = 8;
/** How long a sent email is watched for a bounce before its status stays "sent". */
const STATUS_WATCH_MS = 7 * DAY;

export type SupportEmail = {
  idempotencyKey: string;
  /** Stable across retries, though the thread's references may have grown in between. */
  requestHash: string;
  fromName: string;
  to: string[];
  cc: string[];
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  inReplyTo: string | null;
  references: string[];
  attachments: { filename: string; contentType: string; content: Uint8Array }[];
};

export type SupportEmailStatus = {
  state: "queued" | "sent" | "delivered" | "bounced" | "failed";
  messageId: string | null;
  detail?: string | null;
};

export type SupportMailer = {
  send(email: SupportEmail): Promise<{ emailId: string | null }>;
  /** `null`: the email is gone (purged), so its last known status stands. */
  status(emailId: string): Promise<SupportEmailStatus | null>;
};

/** Won't succeed if retried (a refused attachment, an invalid address). */
export class PermanentSupportSendError extends Error {}

/** Development only: prints the emails, like the dev auth emails. */
export const logSupportMailer: SupportMailer = {
  async send(email) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("[support] No mailer configured in production.");
    }
    console.info(
      `\n[support] Email to ${email.to.join(", ")}: ${email.subject}\n\n${email.text}\n`,
    );
    return { emailId: null };
  },
  async status() {
    return null;
  },
};

export type SupportDeliveryDeps = {
  mailer: SupportMailer;
  store: SupportFileStore | null;
  replyDomain: string;
  dashboardUrl: string;
};

export function supportSubject(ticket: Pick<SupportTicketRow, "subject" | "number">): string {
  const subject = /^re:/i.test(ticket.subject) ? ticket.subject : `Re: ${ticket.subject}`;
  return `${subject} [#${ticket.number}]`;
}

export function toEmailBlocks(body: string): EmailBlock[] {
  return parseSupportText(body).map((block): EmailBlock => {
    if (block.type === "code") return { code: block.text };
    if (block.type === "list") return { list: block.items };
    return { paragraph: block.text };
  });
}

function fromNameOf(message: SupportMessageRow): string {
  const first = message.authorName?.trim().split(/\s+/)[0]?.replace(/["\\]/g, "");
  return message.kind === "agent" && first ? `${first} from coss.com` : "coss.com Support";
}

async function ticketLink(
  ticket: SupportTicketRow,
  dashboardUrl: string,
): Promise<EmailBlock | null> {
  if (!ticket.organizationId) return null;
  const [org] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, ticket.organizationId));
  if (!org) return null;
  return {
    link: {
      label: "View this ticket in your dashboard",
      url: new URL(`/${org.slug}/support/${ticket.id}`, dashboardUrl).toString(),
    },
  };
}

const REASON = "You're receiving this because of a support request to coss.com.";

/** The email a message becomes; `null` when it no longer has anything to say. */
function contentOf(
  message: SupportMessageRow,
  ticket: SupportTicketRow,
  link: EmailBlock | null,
): EmailContent | null {
  const subject = supportSubject(ticket);
  const footer: EmailBlock[] = [
    ...(link ? [link] : []),
    { note: "Reply to this email to continue the conversation." },
  ];
  if (message.kind === "agent") {
    return {
      subject,
      title: ticket.subject,
      subtitle: `${fromNameOf(message)} replied on ticket #${ticket.number}`,
      blocks: [...toEmailBlocks(message.body), ...footer],
      reason: REASON,
    };
  }
  if (message.kind === "customer") {
    const name = message.authorName ?? message.authorEmail ?? "A colleague";
    return {
      subject,
      title: ticket.subject,
      subtitle: `Ticket #${ticket.number}`,
      preview: `${name} replied to your support request.`,
      blocks: [
        { paragraph: `${name} replied to your support request:` },
        ...toEmailBlocks(message.body),
        ...footer,
      ],
      reason: REASON,
    };
  }
  if (message.event === "acknowledged") {
    const minutes = supportResponseMinutes(ticket.plan as PlanKey, ticket.severity);
    const details = [
      { label: "Ticket", value: `#${ticket.number}` },
      { label: "Our target", value: formatSupportTarget(minutes, { allHours: ticket.allHours }) },
      ...(ticket.responseDueAt
        ? [{ label: "Expect a reply by", value: formatSupportTime(ticket.responseDueAt) }]
        : []),
    ];
    return {
      subject,
      title: "We got your message",
      subtitle: ticket.subject,
      preview: `Ticket #${ticket.number}. A person will reply.`,
      blocks: [
        { paragraph: "Thanks for getting in touch. A person will read this and reply here." },
        { details },
        ...footer,
      ],
      reason: REASON,
    };
  }
  if (message.event === "auto_resolved") {
    return {
      subject,
      title: "We've closed this ticket",
      subtitle: `Ticket #${ticket.number}: ${ticket.subject}`,
      blocks: [
        {
          paragraph:
            "We haven't heard back in a while, so we've closed this ticket. If you still need help, reply to this email and it will open again.",
        },
        ...footer,
      ],
      reason: REASON,
    };
  }
  return null;
}

/** The ids a reply should thread under: oldest first, the latest received one as `In-Reply-To`. */
async function threadOf(
  ticketId: string,
  before: string,
): Promise<{ inReplyTo: string | null; references: string[] }> {
  const rows = await db
    .select({ id: supportMessage.rfcMessageId, kind: supportMessage.kind })
    .from(supportMessage)
    .where(
      and(
        eq(supportMessage.ticketId, ticketId),
        isNotNull(supportMessage.rfcMessageId),
        sql`${supportMessage.id} < ${before}`,
      ),
    )
    .orderBy(asc(supportMessage.id));
  const references = rows.flatMap((row) => row.id ?? []);
  const received = rows.filter((row) => row.kind === "customer").at(-1)?.id ?? null;
  return { inReplyTo: received ?? references.at(-1) ?? null, references };
}

function recipientsOf(message: SupportMessageRow, ticket: SupportTicketRow) {
  // A colleague's note on the requester's ticket goes only to the requester.
  if (message.kind === "customer") return { to: [ticket.requesterEmail], cc: [] };
  return { to: [ticket.requesterEmail], cc: ticket.cc };
}

async function attachmentsOf(message: SupportMessageRow, store: SupportFileStore | null) {
  const rows = await db
    .select()
    .from(supportAttachment)
    .where(eq(supportAttachment.messageId, message.id));
  if (rows.length === 0) return [];
  if (!store) throw new PermanentSupportSendError("Attachments aren't available.");
  return Promise.all(
    rows.map(async (row) => {
      const content = await store.get(row.storeKey);
      if (!content) throw new PermanentSupportSendError(`${row.filename} is no longer available.`);
      return { filename: row.filename, contentType: row.contentType, content };
    }),
  );
}

async function deliverMessage(
  message: SupportMessageRow,
  deps: SupportDeliveryDeps,
  now: Date,
): Promise<void> {
  const thisClaim = and(
    eq(supportMessage.id, message.id),
    eq(supportMessage.deliveryStatus, "pending"),
    eq(supportMessage.deliveryAttempts, message.deliveryAttempts),
  );
  try {
    const [ticket] = await db
      .select()
      .from(supportTicket)
      .where(eq(supportTicket.id, message.ticketId));
    if (!ticket) throw new PermanentSupportSendError("The ticket is gone.");
    const content = contentOf(message, ticket, await ticketLink(ticket, deps.dashboardUrl));
    if (!content) throw new PermanentSupportSendError("Nothing to send.");
    const rendered = renderEmail(content);
    const thread = await threadOf(ticket.id, message.id);
    const { emailId } = await deps.mailer.send({
      idempotencyKey: `support:${message.id}`,
      requestHash: createHash("sha256").update(`support:${message.id}`).digest("hex"),
      fromName: fromNameOf(message),
      ...recipientsOf(message, ticket),
      replyTo: `support+${ticket.replyToken}@${deps.replyDomain}`,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      inReplyTo: thread.inReplyTo,
      references: thread.references,
      attachments: await attachmentsOf(message, deps.store),
    });
    await db
      .update(supportMessage)
      .set({
        deliveryStatus: emailId ? "accepted" : "delivered",
        emailId,
        nextDeliveryAt: null,
        deliveryError: null,
      })
      .where(thisClaim);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const permanent = error instanceof PermanentSupportSendError;
    if (!permanent) console.error(`[support] Couldn't send ${message.id}:`, error);
    const gaveUp = permanent || message.deliveryAttempts >= MAX_DELIVERY_ATTEMPTS;
    await db
      .update(supportMessage)
      .set(
        gaveUp
          ? {
              deliveryStatus: "failed",
              deliveryError: detail,
              nextDeliveryAt: null,
              repAlertPending: true,
            }
          : {
              deliveryError: detail,
              nextDeliveryAt: new Date(
                now.getTime() + Math.min(2 ** (message.deliveryAttempts - 1) * MINUTE, 60 * MINUTE),
              ),
            },
      )
      .where(thisClaim);
  }
}

/** Sends what's due. Returns how many it claimed. */
export async function runDueSupportDeliveries(
  opts: { now?: Date; limit?: number; scope?: { ticketIds: string[] } },
  deps: SupportDeliveryDeps,
): Promise<number> {
  const now = opts.now ?? new Date();
  const due = and(
    eq(supportMessage.deliveryStatus, "pending"),
    lte(supportMessage.nextDeliveryAt, now),
  );
  const candidates = await db
    .select({ id: supportMessage.id })
    .from(supportMessage)
    .where(
      and(due, opts.scope ? inArray(supportMessage.ticketId, opts.scope.ticketIds) : undefined),
    )
    .orderBy(asc(supportMessage.nextDeliveryAt))
    .limit(opts.limit ?? 20);
  let claimed = 0;
  for (const { id } of candidates) {
    const [message] = await db
      .update(supportMessage)
      .set({
        deliveryAttempts: sql`${supportMessage.deliveryAttempts} + 1`,
        nextDeliveryAt: new Date(now.getTime() + DELIVERY_LEASE_MS),
      })
      .where(and(due, eq(supportMessage.id, id)))
      .returning();
    if (!message) continue;
    claimed++;
    await deliverMessage(message, deps, now);
  }
  return claimed;
}

/**
 * `send` only queues: what happened next is copied here while the email still exists (it's purged
 * after 45 days), so reps see bounces and replies can thread on its Message-ID.
 */
export async function syncSupportDeliveries(
  opts: { now?: Date; limit?: number; scope?: { ticketIds: string[] } },
  deps: Pick<SupportDeliveryDeps, "mailer">,
): Promise<number> {
  const now = opts.now ?? new Date();
  const accepted = await db
    .select({ id: supportMessage.id, emailId: supportMessage.emailId })
    .from(supportMessage)
    .where(
      and(
        eq(supportMessage.deliveryStatus, "accepted"),
        isNotNull(supportMessage.emailId),
        gte(supportMessage.createdAt, new Date(now.getTime() - STATUS_WATCH_MS)),
        opts.scope ? inArray(supportMessage.ticketId, opts.scope.ticketIds) : undefined,
      ),
    )
    .orderBy(asc(supportMessage.createdAt))
    .limit(opts.limit ?? 100);
  for (const row of accepted) {
    if (!row.emailId) continue;
    const status = await deps.mailer.status(row.emailId);
    if (!status) continue;
    const settled = ["delivered", "bounced", "failed"].includes(status.state);
    if (!settled && !status.messageId) continue;
    await db
      .update(supportMessage)
      .set({
        ...(status.messageId ? { rfcMessageId: status.messageId } : {}),
        ...(settled
          ? {
              deliveryStatus: status.state as "delivered" | "bounced" | "failed",
              deliveryError: status.detail ?? null,
              repAlertPending: status.state !== "delivered",
            }
          : {}),
      })
      .where(and(eq(supportMessage.id, row.id), eq(supportMessage.deliveryStatus, "accepted")));
  }
  return accepted.length;
}
