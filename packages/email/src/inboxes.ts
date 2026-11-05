/**
 * Inboxes: addresses of an environment (usually one per AI agent) whose mail is kept as threads.
 * An inbox is `<username>@<domain>`, the domain being the environment's own under coss.com's
 * managed inbound domain or one of its receiving domains; `username+tag@domain` reaches it too.
 *
 * Receiving stays `receiveEmail`'s: in the transaction that stores a received email,
 * `recordInboundInboxMessages` files it into each inbox among its envelope recipients and enqueues
 * `inbox.message.received`. A message joins the thread one of its `In-Reply-To`/`References`
 * ids belongs to (an inbound message's `Message-ID`, or an outbound one's provider id, which is
 * the local part of the `Message-ID` SES gives it), else the thread with its subject that its
 * sender is already in (within `SUBJECT_MATCH_WINDOW_MS`), else a new one. Sends (`inbox-send.ts`)
 * go through the email service, which links the email to its thread in its insert transaction.
 *
 * Messages own no content: they point at the received email or the email, and are deleted with
 * it (retention, deletes); `purgeEmptyInboxThreads` drops threads with no message left.
 *
 * Live inboxes are charged per day they exist (`email.inboxes`): the first day at creation, then
 * every day by the worker (`chargeDueInboxFees`). The plan limits inboxes per organization.
 */
import { createHash, randomInt } from "node:crypto";
import type { PlanGate, UsageGate } from "@coss/billing/gate";
import {
  BUDGET_EXCEEDED_MESSAGES,
  budgetHoldFor,
  countTowardAllowance,
  isOnBillingHold,
  recordUsage,
} from "@coss/billing/metering";
import { db, type Executor, schema, type Transaction } from "@coss/db";
import { ID_PREFIXES, newId } from "@coss/db/id";
import { enqueueWebhookMessage } from "@coss/webhooks";
import { and, asc, count, desc, eq, gt, inArray, lt, lte, max, or, sql } from "drizzle-orm";
import { InboxError } from "./errors.ts";
import { htmlToText } from "./html-text.ts";
import { inboundAddressFor } from "./inbound-address.ts";
import type {
  InboxMessageObjectOutput,
  InboxMessageSummaryOutput,
  InboxObjectOutput,
  InboxThreadObjectOutput,
  InboxThreadSummaryOutput,
  StoredInboxMessageReceivedWebhookEvent,
} from "./inbox-schemas.ts";
import { MAX_THREAD_MESSAGES } from "./inbox-schemas.ts";
import { extractReplyText, messagePreview, normalizeSubject } from "./inbox-text.ts";
import { emailAddressProblem, parseEmailAddress } from "./schemas.ts";

const {
  email,
  environment,
  inbox,
  inboxMessage,
  inboxThread,
  receivedEmail,
  receivedEmailAttachment,
  receivingDomain,
} = schema;

export type InboxRow = typeof inbox.$inferSelect;
export type InboxThreadRow = typeof inboxThread.$inferSelect;

type Scope = { organizationId: string; environmentId: string };
export type InboxEnvironment = Scope & { projectId: string; mode: "live" | "sandbox" };

/** How often a live inbox is charged: one `email.inboxes` unit per day it exists. */
export const INBOX_FEE_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** How recent a thread must be for a reply without references to join it by subject. */
export const SUBJECT_MATCH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_PARTICIPANTS = 50;
const EMPTY_THREAD_GRACE_MS = 24 * 60 * 60 * 1000;
const MAX_REFERENCES_MATCHED = 50;
/** Characters of a body read for list previews. */
const PREVIEW_SOURCE_LENGTH = 4_000;

const USERNAME_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

function randomUsername(): string {
  let value = "agent-";
  for (let i = 0; i < 10; i++) value += USERNAME_ALPHABET[randomInt(USERNAME_ALPHABET.length)];
  return value;
}

/** A bare, lower-cased address; `null` when there is none. */
export function bareAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const address = parseEmailAddress(value).address.trim().toLowerCase();
  return address.includes("@") ? address : null;
}

/** The inbox address a recipient reaches: its subaddress (`+tag`) dropped. */
export function inboxAddressOf(recipient: string): string | null {
  const address = bareAddress(recipient.replace(/^<|>$/g, ""));
  if (!address) return null;
  const at = address.lastIndexOf("@");
  const local = address.slice(0, at);
  const plus = local.indexOf("+");
  return plus > 0 ? `${local.slice(0, plus)}${address.slice(at)}` : address;
}

/** Longer message ids (real ones are well under 250 characters) are neither stored nor matched. */
const MAX_MESSAGE_ID_LENGTH = 512;

/** `<id>`, the form message ids are stored and matched in; `null` for anything else. */
export function messageIdKey(value: string | null | undefined): string | null {
  const id = value?.trim().replace(/^<|>$/g, "");
  if (!id || id.length > MAX_MESSAGE_ID_LENGTH) return null;
  return /^[\x21-\x7e]+$/.test(id) && !/[<>]/.test(id) ? `<${id}>` : null;
}

/** What a thread's subject is matched by: a digest of `normalizeSubject`, '' for no subject. */
export function subjectKey(subject: string | null): string {
  const normalized = normalizeSubject(subject);
  return normalized ? createHash("sha256").update(normalized).digest("hex") : "";
}

export function canSend(row: Pick<InboxRow, "kind">, sandbox: boolean): boolean {
  return sandbox || row.kind === "domain";
}

export function toInboxObject(row: InboxRow, sandbox: boolean): InboxObjectOutput {
  return {
    object: "inbox",
    id: row.id,
    address: row.address,
    username: row.username,
    domain: row.domain,
    kind: row.kind,
    display_name: row.displayName,
    client_id: row.clientId,
    can_send: canSend(row, sandbox),
    sandbox,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

async function isSandbox(scope: Scope): Promise<boolean> {
  const [row] = await db
    .select({ mode: environment.mode })
    .from(environment)
    .where(
      and(
        eq(environment.id, scope.environmentId),
        eq(environment.organizationId, scope.organizationId),
      ),
    )
    .limit(1);
  return row?.mode === "sandbox";
}

function scoped(scope: Scope) {
  return and(
    eq(inbox.organizationId, scope.organizationId),
    eq(inbox.environmentId, scope.environmentId),
  );
}

async function findByClientId(
  scope: Scope,
  clientId: string,
  executor: Executor = db,
): Promise<InboxRow | null> {
  const [row] = await executor
    .select()
    .from(inbox)
    .where(and(scoped(scope), eq(inbox.clientId, clientId)))
    .limit(1);
  return row ?? null;
}

/** Where an inbox at `requested` (or the managed domain) lives, checked against the environment. */
async function resolveDomain(
  env: InboxEnvironment,
  requested: string | undefined,
  managedDomain: string | null,
): Promise<{ kind: "managed" | "domain"; domain: string }> {
  const managed = managedDomain
    ? (await inboundAddressFor(env, managedDomain)).domain.toLowerCase()
    : null;
  const wanted = requested?.trim().toLowerCase().replace(/\.$/, "");
  if (!wanted) {
    if (!managed) {
      throw new InboxError(
        "receiving_unavailable",
        "This deployment does not receive email at coss.com's inbound domain: pass a receiving " +
          "domain of the environment as `domain`.",
        { param: "domain" },
      );
    }
    return { kind: "managed", domain: managed };
  }
  if (wanted === managed) return { kind: "managed", domain: managed };
  const [row] = await db
    .select({ hostname: receivingDomain.hostname })
    .from(receivingDomain)
    .where(
      and(
        eq(receivingDomain.hostname, wanted),
        eq(receivingDomain.organizationId, env.organizationId),
        eq(receivingDomain.environmentId, env.environmentId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new InboxError(
      "unknown_domain",
      `${wanted} is not a receiving domain of this environment. Add it as a receiving domain ` +
        "first, or omit `domain` to use the environment's own inbound domain.",
      { param: "domain" },
    );
  }
  return { kind: "domain", domain: row.hostname };
}

/**
 * Creates an inbox, or returns the environment's inbox with the same `client_id`
 * (`created: false`). Addresses are unique per environment: mail is routed to an environment
 * first, so another environment's inbox at an address (a receiving domain that moved) never
 * receives anything and doesn't block it.
 *
 * The plan's `inboxes` limit counts the organization's inboxes (sandbox ones too) under an
 * organization-wide lock. A live inbox reserves its first day against a capped plan's allowance
 * and is charged for it in the insert's transaction; the worker charges the days after.
 */
export async function createInbox(
  env: InboxEnvironment,
  input: { username?: string; domain?: string; displayName?: string; clientId?: string },
  deps: { managedDomain: string | null; plans?: PlanGate; billing?: UsageGate },
): Promise<{ inbox: InboxObjectOutput; created: boolean }> {
  const sandbox = env.mode === "sandbox";
  if (input.clientId) {
    const existing = await findByClientId(env, input.clientId);
    if (existing) return { inbox: toInboxObject(existing, sandbox), created: false };
  }
  // A new inbox is a new monthly charge. Those that exist keep receiving: mail is never lost to a hold.
  if (!sandbox) {
    if (await isOnBillingHold(env.organizationId)) {
      throw new InboxError(
        "billing_hold",
        "New live inboxes are paused: your organization has an overdue invoice or reached its " +
          "spend limit. Sandbox keys still work.",
      );
    }
    const held = await budgetHoldFor({
      organizationId: env.organizationId,
      projectId: env.projectId,
    });
    if (held) throw new InboxError("budget_exceeded", BUDGET_EXCEEDED_MESSAGES[held]);
  }
  const target = await resolveDomain(env, input.domain, deps.managedDomain);

  for (let attempt = 0; attempt < 3; attempt++) {
    const username = input.username ?? randomUsername();
    const address = `${username}@${target.domain}`;
    // An inbox must be able to send from its address (`SendEmailRequest`'s rules).
    const problem = emailAddressProblem(address);
    if (problem)
      throw new InboxError("invalid_address", `${address}: ${problem}`, { param: "username" });
    const outcome = await db.transaction(async (tx) => {
      if (deps.plans) {
        // One creation at a time per organization, so the count holds.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`inbox:${env.organizationId}`}))`,
        );
        // A concurrent create with the same client id may have committed while this one waited:
        // return it rather than count it against the limit.
        const existing = input.clientId ? await findByClientId(env, input.clientId, tx) : null;
        if (existing) return { row: existing, created: false };
        const [total] = await tx
          .select({ value: count() })
          .from(inbox)
          .where(eq(inbox.organizationId, env.organizationId));
        await deps.plans.requireCapacity(env.organizationId, "inboxes", total?.value ?? 0);
      }
      const [row] = await tx
        .insert(inbox)
        .values({
          organizationId: env.organizationId,
          projectId: env.projectId,
          environmentId: env.environmentId,
          kind: target.kind,
          username,
          domain: target.domain,
          address,
          displayName: input.displayName ?? null,
          clientId: input.clientId ?? null,
          nextFeeAt: sandbox
            ? null
            : sql`transaction_timestamp() + ${`${INBOX_FEE_INTERVAL_MS} milliseconds`}::interval`,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) return null;
      if (!sandbox) {
        await deps.billing?.reserve(tx, {
          organizationId: env.organizationId,
          meter: "email.inboxes",
          quantity: 1,
        });
        await recordUsage(tx, {
          organizationId: env.organizationId,
          environmentId: env.environmentId,
          projectId: env.projectId,
          meter: "email.inboxes",
          quantity: 1,
        });
      }
      return { row, created: true };
    });
    if (outcome) return { inbox: toInboxObject(outcome.row, sandbox), created: outcome.created };
    // Lost to a concurrent create with the same client id, or the address is taken.
    if (input.clientId) {
      const existing = await findByClientId(env, input.clientId);
      if (existing) return { inbox: toInboxObject(existing, sandbox), created: false };
    }
    if (input.username) {
      throw new InboxError("address_taken", `${address} is already an inbox of this environment.`, {
        param: "username",
      });
    }
  }
  throw new Error(`Could not pick a free username in ${target.domain}.`);
}

/**
 * The worker's `inbox-fees` loop: one day of every live inbox whose next day has started
 * (`next_fee_at`), moved on a day in the transaction that records it. An inbox behind by
 * several days (a worker outage) is charged one day per run until it catches up. Each day also
 * counts toward a capped plan's allowance (`billing`), which new live inboxes are checked
 * against; days past it are still recorded (and written off). Returns how many inbox-days were
 * charged.
 */
export async function chargeDueInboxFees(
  opts: {
    now?: Date;
    limit?: number;
    scope?: { organizationIds: string[] };
    billing?: UsageGate;
  } = {},
): Promise<number> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 1000;
  return db.transaction(async (tx) => {
    const due = tx
      .select({ id: inbox.id })
      .from(inbox)
      .where(
        and(
          lte(inbox.nextFeeAt, now),
          opts.scope ? inArray(inbox.organizationId, opts.scope.organizationIds) : undefined,
        ),
      )
      .orderBy(asc(inbox.nextFeeAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    const charged = await tx
      .update(inbox)
      .set({
        nextFeeAt: sql`${inbox.nextFeeAt} + ${`${INBOX_FEE_INTERVAL_MS} milliseconds`}::interval`,
      })
      .where(and(inArray(inbox.id, due), lte(inbox.nextFeeAt, now)))
      .returning({
        organizationId: inbox.organizationId,
        projectId: inbox.projectId,
        environmentId: inbox.environmentId,
      });
    const byEnvironment = new Map<string, { source: (typeof charged)[number]; days: number }>();
    for (const row of charged) {
      const entry = byEnvironment.get(row.environmentId) ?? { source: row, days: 0 };
      entry.days++;
      byEnvironment.set(row.environmentId, entry);
    }
    for (const { source, days } of byEnvironment.values()) {
      if (opts.billing) {
        await countTowardAllowance(tx, opts.billing, {
          organizationId: source.organizationId,
          meter: "email.inboxes",
          days,
        });
      }
      await recordUsage(tx, { ...source, meter: "email.inboxes", quantity: days });
    }
    return charged.length;
  });
}

export async function getInboxRow(scope: Scope & { id: string }): Promise<InboxRow | null> {
  const [row] = await db
    .select()
    .from(inbox)
    .where(and(scoped(scope), eq(inbox.id, scope.id)))
    .limit(1);
  return row ?? null;
}

async function requireInbox(scope: Scope & { id: string }): Promise<InboxRow> {
  const row = await getInboxRow(scope);
  if (!row) throw new InboxError("not_found", "No inbox with this id exists in this environment.");
  return row;
}

export async function getInbox(scope: Scope & { id: string }): Promise<InboxObjectOutput | null> {
  const row = await getInboxRow(scope);
  return row ? toInboxObject(row, await isSandbox(scope)) : null;
}

/** A page of the environment's inboxes, newest first; `after` is the previous page's last id. */
export async function listInboxes(
  scope: Scope & { limit: number; after?: string | undefined },
): Promise<{ data: InboxObjectOutput[]; hasMore: boolean }> {
  const rows = await db
    .select()
    .from(inbox)
    .where(and(scoped(scope), scope.after ? lt(inbox.id, scope.after) : undefined))
    .orderBy(desc(inbox.id))
    .limit(scope.limit + 1);
  const sandbox = await isSandbox(scope);
  return {
    data: rows.slice(0, scope.limit).map((row) => toInboxObject(row, sandbox)),
    hasMore: rows.length > scope.limit,
  };
}

export async function updateInbox(
  scope: Scope & { id: string },
  input: { displayName?: string | null },
): Promise<InboxObjectOutput> {
  const current = await requireInbox(scope);
  if (input.displayName === undefined) return toInboxObject(current, await isSandbox(scope));
  const [row] = await db
    .update(inbox)
    .set({ displayName: input.displayName })
    .where(and(scoped(scope), eq(inbox.id, scope.id)))
    .returning();
  if (!row) throw new InboxError("not_found", "No inbox with this id exists in this environment.");
  return toInboxObject(row, await isSandbox(scope));
}

/**
 * Deletes an inbox with its threads. The received emails and emails its messages point at stay
 * (they are the environment's), and mail to its address is still received by the environment.
 */
/**
 * Deletes an inbox (its threads go with it; their emails stay). A live inbox's days that started
 * since its last charge (the fee loop hadn't reached them) are charged in the same transaction,
 * counted toward a capped plan's allowance (`billing`) like the loop's.
 */
export async function deleteInbox(
  scope: Scope & { id: string },
  deps: { billing?: UsageGate } = {},
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .delete(inbox)
      .where(and(scoped(scope), eq(inbox.id, scope.id)))
      .returning({
        organizationId: inbox.organizationId,
        projectId: inbox.projectId,
        environmentId: inbox.environmentId,
        dueDays: sql<number>`case when ${inbox.nextFeeAt} <= transaction_timestamp()
          then floor(extract(epoch from transaction_timestamp() - ${inbox.nextFeeAt}) * 1000
            / ${INBOX_FEE_INTERVAL_MS})::int + 1
          else 0 end`,
      });
    if (!row) return false;
    const { dueDays, ...source } = row;
    if (deps.billing && dueDays > 0) {
      await countTowardAllowance(tx, deps.billing, {
        organizationId: source.organizationId,
        meter: "email.inboxes",
        days: dueDays,
      });
    }
    await recordUsage(tx, { ...source, meter: "email.inboxes", quantity: dueDays });
    return true;
  });
}

// --- Threading -----------------------------------------------------------------------------------

/** Bare addresses of a message's people, but the inbox's own, at most `MAX_PARTICIPANTS`. */
function participantsOf(addresses: readonly (string | null)[], inboxAddress: string): string[] {
  const result: string[] = [];
  for (const value of addresses) {
    const address = bareAddress(value);
    if (!address || inboxAddressOf(address) === inboxAddress || result.includes(address)) continue;
    result.push(address);
  }
  return result.slice(0, MAX_PARTICIPANTS);
}

/** The thread of `refs` (most recent first) in the inbox, else of the subject and sender. */
async function findThread(
  tx: Transaction,
  input: {
    inboxId: string;
    organizationId: string;
    refs: string[];
    subjectKey: string;
    sender: string | null;
    at: Date;
  },
): Promise<string | null> {
  const refs = input.refs.slice(0, MAX_REFERENCES_MATCHED);
  if (refs.length > 0) {
    const [inbound] = await tx
      .select({ threadId: inboxMessage.threadId })
      .from(inboxMessage)
      .where(
        and(
          eq(inboxMessage.inboxId, input.inboxId),
          eq(inboxMessage.organizationId, input.organizationId),
          inArray(inboxMessage.rfcMessageId, refs),
        ),
      )
      .orderBy(desc(inboxMessage.id))
      .limit(1);
    if (inbound) return inbound.threadId;
    // SES's Message-ID is `<provider message id@…amazonses.com>`.
    const providerIds = [...new Set(refs.map((ref) => ref.slice(1, ref.lastIndexOf("@"))))].filter(
      Boolean,
    );
    if (providerIds.length > 0) {
      const [outbound] = await tx
        .select({ threadId: inboxMessage.threadId })
        .from(inboxMessage)
        .innerJoin(
          email,
          and(
            eq(email.id, inboxMessage.emailId),
            eq(email.organizationId, inboxMessage.organizationId),
          ),
        )
        .where(
          and(
            eq(inboxMessage.inboxId, input.inboxId),
            eq(inboxMessage.organizationId, input.organizationId),
            inArray(email.providerMessageId, providerIds),
          ),
        )
        .orderBy(desc(inboxMessage.id))
        .limit(1);
      if (outbound) return outbound.threadId;
    }
  }
  if (!input.subjectKey || !input.sender) return null;
  const [bySubject] = await tx
    .select({ id: inboxThread.id })
    .from(inboxThread)
    .where(
      and(
        eq(inboxThread.inboxId, input.inboxId),
        eq(inboxThread.organizationId, input.organizationId),
        eq(inboxThread.subjectKey, input.subjectKey),
        sql`${input.sender} = any(${inboxThread.participants})`,
        gt(inboxThread.lastMessageAt, new Date(input.at.getTime() - SUBJECT_MATCH_WINDOW_MS)),
      ),
    )
    .orderBy(desc(inboxThread.lastMessageAt))
    .limit(1);
  return bySubject?.id ?? null;
}

/** Adds a message to its thread (new or found), moving the thread's activity forward. */
async function fileMessage(
  tx: Transaction,
  input: {
    row: InboxRow;
    threadId: string | null;
    subject: string | null;
    participants: string[];
    at: Date;
  },
): Promise<{ threadId: string; newThread: boolean }> {
  if (input.threadId) {
    const [current] = await tx
      .select({ participants: inboxThread.participants, lastMessageAt: inboxThread.lastMessageAt })
      .from(inboxThread)
      .where(
        and(
          eq(inboxThread.id, input.threadId),
          eq(inboxThread.organizationId, input.row.organizationId),
        ),
      )
      .for("update");
    if (current) {
      await tx
        .update(inboxThread)
        .set({
          lastMessageAt: current.lastMessageAt > input.at ? current.lastMessageAt : input.at,
          participants: [...new Set([...current.participants, ...input.participants])].slice(
            0,
            MAX_PARTICIPANTS,
          ),
        })
        .where(
          and(
            eq(inboxThread.id, input.threadId),
            eq(inboxThread.organizationId, input.row.organizationId),
          ),
        );
      return { threadId: input.threadId, newThread: false };
    }
  }
  const [thread] = await tx
    .insert(inboxThread)
    .values({
      organizationId: input.row.organizationId,
      environmentId: input.row.environmentId,
      inboxId: input.row.id,
      subject: input.subject,
      subjectKey: subjectKey(input.subject),
      participants: input.participants,
      lastMessageAt: input.at,
    })
    .returning({ id: inboxThread.id });
  if (!thread) throw new Error("Thread insert returned no row.");
  return { threadId: thread.id, newThread: true };
}

/** What `receiveEmail` knows of a stored received email. */
export type InboundInboxMessage = {
  organizationId: string;
  environmentId: string;
  sandbox: boolean;
  receivedEmailId: string;
  /** This environment's envelope recipients. */
  recipients: readonly string[];
  from: string | null;
  to: readonly string[];
  cc: readonly string[];
  subject: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: readonly string[];
  attachmentCount: number;
  spam: boolean;
  receivedAt: Date;
};

/**
 * Files a received email into every inbox of its environment among its envelope recipients and
 * enqueues `inbox.message.received` for each, in `receiveEmail`'s transaction.
 */
export async function recordInboundInboxMessages(
  tx: Transaction,
  message: InboundInboxMessage,
): Promise<{ inboxId: string; threadId: string; messageId: string }[]> {
  const addresses = [
    ...new Set(message.recipients.flatMap((value) => inboxAddressOf(value) ?? [])),
  ];
  if (addresses.length === 0) return [];
  const inboxes = await tx
    .select()
    .from(inbox)
    .where(
      and(
        eq(inbox.organizationId, message.organizationId),
        eq(inbox.environmentId, message.environmentId),
        inArray(inbox.address, addresses),
      ),
    )
    .orderBy(asc(inbox.id));
  if (inboxes.length === 0) return [];

  const refs = [
    ...new Set(
      [message.inReplyTo, ...[...message.references].reverse()].flatMap(
        (value) => messageIdKey(value) ?? [],
      ),
    ),
  ];
  const sender = bareAddress(message.from);
  const filed: { inboxId: string; threadId: string; messageId: string }[] = [];
  for (const row of inboxes) {
    // One message at a time per inbox (in id order, so concurrent ones never deadlock): two
    // replies arriving together must find the same thread, not create one each.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`inbox-thread:${row.id}`}))`);
    const found = await findThread(tx, {
      inboxId: row.id,
      organizationId: row.organizationId,
      refs,
      subjectKey: subjectKey(message.subject),
      sender,
      at: message.receivedAt,
    });
    const { threadId, newThread } = await fileMessage(tx, {
      row,
      threadId: found,
      subject: message.subject,
      participants: participantsOf([message.from, ...message.to, ...message.cc], row.address),
      at: message.receivedAt,
    });
    const [inserted] = await tx
      .insert(inboxMessage)
      .values({
        organizationId: row.organizationId,
        environmentId: row.environmentId,
        inboxId: row.id,
        threadId,
        direction: "inbound",
        receivedEmailId: message.receivedEmailId,
        rfcMessageId: messageIdKey(message.messageId),
        createdAt: message.receivedAt,
      })
      .onConflictDoNothing()
      .returning({ id: inboxMessage.id });
    if (!inserted) continue;
    const payload: StoredInboxMessageReceivedWebhookEvent = {
      id: newId(ID_PREFIXES.webhookEvent),
      object: "event",
      type: "inbox.message.received",
      created_at: new Date().toISOString(),
      data: {
        inbox_id: row.id,
        inbox_address: row.address,
        thread_id: threadId,
        message_id: inserted.id,
        received_email_id: message.receivedEmailId,
        from: message.from,
        to: [...message.to],
        subject: message.subject,
        attachment_count: message.attachmentCount,
        new_thread: newThread,
        spam: message.spam,
        sandbox: message.sandbox,
        received_at: message.receivedAt.toISOString(),
      },
    };
    await enqueueWebhookMessage(tx, {
      id: payload.id,
      organizationId: row.organizationId,
      environmentId: row.environmentId,
      type: payload.type,
      payload,
    });
    filed.push({ inboxId: row.id, threadId, messageId: inserted.id });
  }
  return filed;
}

/**
 * Links an email sent from the inbox to its thread (`threadId`, else a new one), in the email's
 * insert transaction. Returns the message id.
 */
export async function recordOutboundInboxMessage(
  tx: Transaction,
  input: {
    row: InboxRow;
    threadId: string | null;
    emailId: string;
    /** `null` for an email sent without content storage: the thread keeps no copy of it. */
    subject: string | null;
    to: readonly string[];
    cc: readonly string[];
    at: Date;
  },
): Promise<{ threadId: string; messageId: string }> {
  const { threadId } = await fileMessage(tx, {
    row: input.row,
    threadId: input.threadId,
    subject: input.subject,
    participants: participantsOf([...input.to, ...input.cc], input.row.address),
    at: input.at,
  });
  const [inserted] = await tx
    .insert(inboxMessage)
    .values({
      organizationId: input.row.organizationId,
      environmentId: input.row.environmentId,
      inboxId: input.row.id,
      threadId,
      direction: "outbound",
      emailId: input.emailId,
      createdAt: input.at,
    })
    .returning({ id: inboxMessage.id });
  if (!inserted) throw new Error("Inbox message insert returned no row.");
  return { threadId, messageId: inserted.id };
}

// --- Reads ---------------------------------------------------------------------------------------

const messageColumns = (bodies: boolean) => ({
  message: inboxMessage,
  // Drizzle nulls a left-joined object when its first column is null: lead with the id.
  inbound: {
    id: receivedEmail.id,
    from: receivedEmail.from,
    to: receivedEmail.to,
    cc: receivedEmail.cc,
    replyTo: receivedEmail.replyTo,
    subject: receivedEmail.subject,
    messageId: receivedEmail.messageId,
    inReplyTo: receivedEmail.inReplyTo,
    references: receivedEmail.references,
    spamVerdict: receivedEmail.spamVerdict,
    truncated: receivedEmail.truncated,
    text: bodies
      ? receivedEmail.text
      : sql<string | null>`left(${receivedEmail.text}, ${PREVIEW_SOURCE_LENGTH})`,
    html: bodies
      ? receivedEmail.html
      : sql<
          string | null
        >`case when ${receivedEmail.text} is null then left(${receivedEmail.html}, ${PREVIEW_SOURCE_LENGTH * 5}) end`,
  },
  outbound: {
    id: email.id,
    from: email.from,
    to: email.to,
    cc: email.cc,
    replyTo: email.replyTo,
    subject: email.subject,
    status: email.status,
    headers: email.headers,
    provider: email.provider,
    providerMessageId: email.providerMessageId,
    text: bodies ? email.text : sql<string | null>`left(${email.text}, ${PREVIEW_SOURCE_LENGTH})`,
    html: bodies
      ? email.html
      : sql<
          string | null
        >`case when ${email.text} is null then left(${email.html}, ${PREVIEW_SOURCE_LENGTH * 5}) end`,
  },
});

type MessageRow = {
  message: typeof inboxMessage.$inferSelect;
  inbound: {
    id: string;
    from: string | null;
    to: string[];
    cc: string[];
    replyTo: string[];
    subject: string | null;
    messageId: string | null;
    inReplyTo: string | null;
    references: string[];
    spamVerdict: string | null;
    truncated: boolean;
    text: string | null;
    html: string | null;
  } | null;
  outbound: {
    id: string;
    from: string;
    to: string[];
    cc: string[];
    replyTo: string[];
    subject: string;
    status: InboxMessageSummaryOutput["status"];
    headers: Record<string, string>;
    provider: string | null;
    providerMessageId: string | null;
    text: string | null;
    html: string | null;
  } | null;
};

function selectMessages(bodies: boolean) {
  return db
    .select(messageColumns(bodies))
    .from(inboxMessage)
    .leftJoin(
      receivedEmail,
      and(
        eq(receivedEmail.id, inboxMessage.receivedEmailId),
        eq(receivedEmail.organizationId, inboxMessage.organizationId),
      ),
    )
    .leftJoin(
      email,
      and(
        eq(email.id, inboxMessage.emailId),
        eq(email.organizationId, inboxMessage.organizationId),
      ),
    );
}

/** A message's text, made from its HTML when it has none. */
function textOf(source: { text: string | null; html: string | null }): string | null {
  if (source.text !== null) return source.text;
  return source.html ? htmlToText(source.html) : null;
}

function header(headers: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  return key === undefined ? undefined : headers[key];
}

async function attachmentsOf(organizationId: string, receivedEmailIds: readonly string[]) {
  const byEmail = new Map<string, InboxMessageSummaryOutput["attachments"]>();
  if (receivedEmailIds.length === 0) return byEmail;
  const rows = await db
    .select()
    .from(receivedEmailAttachment)
    .where(
      and(
        eq(receivedEmailAttachment.organizationId, organizationId),
        inArray(receivedEmailAttachment.receivedEmailId, [...receivedEmailIds]),
      ),
    )
    .orderBy(asc(receivedEmailAttachment.position));
  for (const row of rows) {
    const list = byEmail.get(row.receivedEmailId) ?? [];
    list.push({
      id: row.id,
      filename: row.filename,
      content_type: row.contentType,
      content_id: row.contentId,
      disposition: row.disposition === "inline" ? "inline" : "attachment",
      size: row.size,
    });
    byEmail.set(row.receivedEmailId, list);
  }
  return byEmail;
}

function toSummary(
  row: MessageRow,
  attachments: Map<string, InboxMessageSummaryOutput["attachments"]>,
): InboxMessageSummaryOutput {
  const { message, inbound, outbound } = row;
  const source = inbound ?? outbound;
  return {
    object: "inbox_message",
    id: message.id,
    inbox_id: message.inboxId,
    thread_id: message.threadId,
    direction: message.direction,
    status: outbound ? outbound.status : "received",
    from: source?.from ?? null,
    to: source?.to ?? [],
    cc: source?.cc ?? [],
    subject: source?.subject || null,
    preview: source ? messagePreview(textOf(source)) : null,
    attachments: message.receivedEmailId ? (attachments.get(message.receivedEmailId) ?? []) : [],
    spam: inbound?.spamVerdict === "fail",
    received_email_id: message.receivedEmailId,
    email_id: message.emailId,
    created_at: message.createdAt.toISOString(),
  };
}

function toMessageObject(
  row: MessageRow,
  attachments: Map<string, InboxMessageSummaryOutput["attachments"]>,
): InboxMessageObjectOutput {
  const { inbound, outbound } = row;
  const source = inbound ?? outbound;
  const text = source ? textOf(source) : null;
  const references = outbound
    ? (header(outbound.headers, "references")?.split(/\s+/).filter(Boolean) ?? [])
    : (inbound?.references ?? []);
  return {
    ...toSummary(row, attachments),
    reply_to: source?.replyTo ?? [],
    message_id: inbound?.messageId ?? null,
    in_reply_to: outbound
      ? (header(outbound.headers, "in-reply-to") ?? null)
      : (inbound?.inReplyTo ?? null),
    references,
    text: source?.text ?? null,
    extracted_text: extractReplyText(text),
    html: source?.html ?? null,
    truncated: inbound?.truncated ?? false,
  };
}

async function messageObjects(
  organizationId: string,
  rows: MessageRow[],
): Promise<InboxMessageObjectOutput[]> {
  const attachments = await attachmentsOf(
    organizationId,
    rows.flatMap((row) => row.message.receivedEmailId ?? []),
  );
  return rows.map((row) => toMessageObject(row, attachments));
}

function messagesOf(scope: Scope & { inboxId: string }) {
  return and(
    eq(inboxMessage.organizationId, scope.organizationId),
    eq(inboxMessage.environmentId, scope.environmentId),
    eq(inboxMessage.inboxId, scope.inboxId),
  );
}

/** A page of the inbox's messages (every thread), newest first, without bodies. */
export async function listInboxMessages(
  scope: Scope & {
    inboxId: string;
    limit: number;
    after?: string | undefined;
    direction?: "inbound" | "outbound" | undefined;
  },
): Promise<{ data: InboxMessageSummaryOutput[]; hasMore: boolean }> {
  await requireInbox({ ...scope, id: scope.inboxId });
  const rows = (await selectMessages(false)
    .where(
      and(
        messagesOf(scope),
        scope.after ? lt(inboxMessage.id, scope.after) : undefined,
        scope.direction ? eq(inboxMessage.direction, scope.direction) : undefined,
      ),
    )
    .orderBy(desc(inboxMessage.id))
    .limit(scope.limit + 1)) as MessageRow[];
  const page = rows.slice(0, scope.limit);
  const attachments = await attachmentsOf(
    scope.organizationId,
    page.flatMap((row) => row.message.receivedEmailId ?? []),
  );
  return {
    data: page.map((row) => toSummary(row, attachments)),
    hasMore: rows.length > scope.limit,
  };
}

export async function getInboxMessageRow(
  scope: Scope & { inboxId: string; id: string },
): Promise<MessageRow | null> {
  const [row] = (await selectMessages(true)
    .where(and(messagesOf(scope), eq(inboxMessage.id, scope.id)))
    .limit(1)) as MessageRow[];
  return row ?? null;
}

export async function getInboxMessage(
  scope: Scope & { inboxId: string; id: string },
): Promise<InboxMessageObjectOutput | null> {
  const row = await getInboxMessageRow(scope);
  if (!row) return null;
  const [object] = await messageObjects(scope.organizationId, [row]);
  return object ?? null;
}

export type InboxMessageRow = MessageRow;

type ThreadStats = { count: number; lastInboundAt: Date | null };

async function threadStats(organizationId: string, ids: readonly string[]) {
  const byThread = new Map<string, ThreadStats>();
  if (ids.length === 0) return byThread;
  const rows = await db
    .select({
      threadId: inboxMessage.threadId,
      count: count(),
      lastInboundAt: max(
        sql<Date>`case when ${inboxMessage.direction} = 'inbound' then ${inboxMessage.createdAt} end`,
      ),
    })
    .from(inboxMessage)
    .where(
      and(
        eq(inboxMessage.organizationId, organizationId),
        inArray(inboxMessage.threadId, [...ids]),
      ),
    )
    .groupBy(inboxMessage.threadId);
  for (const row of rows) {
    byThread.set(row.threadId, {
      count: row.count,
      lastInboundAt: row.lastInboundAt ? new Date(row.lastInboundAt) : null,
    });
  }
  return byThread;
}

/** Each thread's latest message preview. */
async function latestPreviews(organizationId: string, ids: readonly string[]) {
  const previews = new Map<string, string | null>();
  if (ids.length === 0) return previews;
  const latest = db
    .selectDistinctOn([inboxMessage.threadId], { id: inboxMessage.id })
    .from(inboxMessage)
    .where(
      and(
        eq(inboxMessage.organizationId, organizationId),
        inArray(inboxMessage.threadId, [...ids]),
      ),
    )
    .orderBy(inboxMessage.threadId, desc(inboxMessage.createdAt), desc(inboxMessage.id));
  const rows = (await selectMessages(false).where(
    inArray(inboxMessage.id, latest),
  )) as MessageRow[];
  for (const row of rows) previews.set(row.message.threadId, toSummary(row, new Map()).preview);
  return previews;
}

function toThreadSummary(
  row: InboxThreadRow,
  stats: ThreadStats | undefined,
  preview: string | null,
): InboxThreadSummaryOutput {
  return {
    object: "inbox_thread",
    id: row.id,
    inbox_id: row.inboxId,
    subject: row.subject,
    participants: row.participants,
    message_count: stats?.count ?? 0,
    preview,
    last_message_at: row.lastMessageAt.toISOString(),
    last_inbound_at: stats?.lastInboundAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

function threadsOf(scope: Scope & { inboxId: string }) {
  return and(
    eq(inboxThread.organizationId, scope.organizationId),
    eq(inboxThread.environmentId, scope.environmentId),
    eq(inboxThread.inboxId, scope.inboxId),
  );
}

/**
 * A page of the inbox's threads, most recent activity first; `after` is the previous page's last
 * thread id. Threads whose messages are all gone (retention) are left out.
 */
export async function listInboxThreads(
  scope: Scope & { inboxId: string; limit: number; after?: string | undefined },
): Promise<{ data: InboxThreadSummaryOutput[]; hasMore: boolean }> {
  await requireInbox({ ...scope, id: scope.inboxId });
  let cursor: { lastMessageAt: Date; id: string } | null = null;
  if (scope.after) {
    const [row] = await db
      .select({ lastMessageAt: inboxThread.lastMessageAt, id: inboxThread.id })
      .from(inboxThread)
      .where(and(threadsOf(scope), eq(inboxThread.id, scope.after)))
      .limit(1);
    if (!row) return { data: [], hasMore: false };
    cursor = row;
  }
  const rows = await db
    .select()
    .from(inboxThread)
    .where(
      and(
        threadsOf(scope),
        sql`exists (select 1 from ${inboxMessage} where ${inboxMessage.threadId} = ${inboxThread.id})`,
        cursor
          ? or(
              lt(inboxThread.lastMessageAt, cursor.lastMessageAt),
              and(
                eq(inboxThread.lastMessageAt, cursor.lastMessageAt),
                lt(inboxThread.id, cursor.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(inboxThread.lastMessageAt), desc(inboxThread.id))
    .limit(scope.limit + 1);
  const page = rows.slice(0, scope.limit);
  const ids = page.map((row) => row.id);
  const [stats, previews] = await Promise.all([
    threadStats(scope.organizationId, ids),
    latestPreviews(scope.organizationId, ids),
  ]);
  return {
    data: page.map((row) => toThreadSummary(row, stats.get(row.id), previews.get(row.id) ?? null)),
    hasMore: rows.length > scope.limit,
  };
}

export async function getInboxThreadRow(
  scope: Scope & { inboxId: string; id: string },
): Promise<InboxThreadRow | null> {
  const [row] = await db
    .select()
    .from(inboxThread)
    .where(and(threadsOf(scope), eq(inboxThread.id, scope.id)))
    .limit(1);
  return row ?? null;
}

/**
 * The thread's latest `MAX_THREAD_MESSAGES` messages, oldest first: by when they were received or
 * sent (a delayed notification files an older message later, so ids follow filing, not time).
 */
export async function threadMessages(
  scope: Scope & { inboxId: string; threadId: string },
): Promise<MessageRow[]> {
  const rows = (await selectMessages(true)
    .where(and(messagesOf(scope), eq(inboxMessage.threadId, scope.threadId)))
    .orderBy(desc(inboxMessage.createdAt), desc(inboxMessage.id))
    .limit(MAX_THREAD_MESSAGES)) as MessageRow[];
  return rows.reverse();
}

/** A thread with its latest messages, or `null` (also when its messages are all gone). */
export async function getInboxThread(
  scope: Scope & { inboxId: string; id: string },
): Promise<InboxThreadObjectOutput | null> {
  const row = await getInboxThreadRow(scope);
  if (!row) return null;
  const rows = await threadMessages({ ...scope, threadId: row.id });
  if (rows.length === 0) return null;
  const [stats, messages] = await Promise.all([
    threadStats(scope.organizationId, [row.id]),
    messageObjects(scope.organizationId, rows),
  ]);
  return {
    ...toThreadSummary(row, stats.get(row.id), messages.at(-1)?.preview ?? null),
    messages,
  };
}

/**
 * Deletes a thread and its messages from the inbox. The received emails and emails stay (they
 * are the environment's).
 */
export async function deleteInboxThread(
  scope: Scope & { inboxId: string; id: string },
): Promise<boolean> {
  const rows = await db
    .delete(inboxThread)
    .where(and(threadsOf(scope), eq(inboxThread.id, scope.id)))
    .returning({ id: inboxThread.id });
  return rows.length > 0;
}

/** One attachment of an inbound message (the content store has its bytes). */
export async function getInboxMessageAttachmentKey(
  scope: Scope & { inboxId: string; id: string; attachmentId: string },
): Promise<{ contentKey: string; filename: string; contentType: string } | null> {
  const [row] = await db
    .select({ attachment: receivedEmailAttachment })
    .from(inboxMessage)
    .innerJoin(
      receivedEmailAttachment,
      and(
        eq(receivedEmailAttachment.receivedEmailId, inboxMessage.receivedEmailId),
        eq(receivedEmailAttachment.organizationId, inboxMessage.organizationId),
      ),
    )
    .where(
      and(
        messagesOf(scope),
        eq(inboxMessage.id, scope.id),
        eq(receivedEmailAttachment.id, scope.attachmentId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    contentKey: row.attachment.contentKey,
    filename: row.attachment.filename ?? row.attachment.id,
    contentType: row.attachment.contentType,
  };
}

/**
 * Deletes threads with no message left (their emails were purged or deleted), oldest first.
 * System-level, like every purge. Only threads quiet for a day: a message filed concurrently
 * moves `last_message_at` forward under the thread's row lock, so the re-check spares it.
 */
export async function purgeEmptyInboxThreads(
  opts: { now?: Date; limit?: number; scope?: { organizationIds: readonly string[] } } = {},
): Promise<number> {
  const cutoff = new Date((opts.now ?? new Date()).getTime() - EMPTY_THREAD_GRACE_MS);
  const empty = and(
    lt(inboxThread.lastMessageAt, cutoff),
    sql`not exists (select 1 from ${inboxMessage} where ${inboxMessage.threadId} = ${inboxThread.id})`,
    opts.scope ? inArray(inboxThread.organizationId, [...opts.scope.organizationIds]) : undefined,
  );
  const due = db
    .select({ id: inboxThread.id })
    .from(inboxThread)
    .where(empty)
    .orderBy(asc(inboxThread.lastMessageAt))
    .limit(opts.limit ?? 1000);
  const rows = await db
    .delete(inboxThread)
    .where(and(inArray(inboxThread.id, due), empty))
    .returning({ id: inboxThread.id });
  return rows.length;
}
