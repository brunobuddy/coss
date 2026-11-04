/**
 * Delivery-event ingestion. System-level: the organization is resolved from the message the event
 * names (the `sms_id` coss.com puts in every status callback URL), never from the caller, and every
 * write is scoped by that message's organization. Each new event is queued for the environment's
 * webhook endpoints in the same transaction (outbox) and appended to its log (`@coss/logs`).
 */
import { createHash } from "node:crypto";
import { hipaaModeAppliesSql } from "@coss/compliance";
import { db, type Executor, schema } from "@coss/db";
import { isId } from "@coss/db/id";
import { appendLogEntries } from "@coss/logs";
import { markReputationDue } from "@coss/reputation";
import { enqueueWebhookMessage } from "@coss/webhooks";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { smsEventLogEntries } from "./event-logs.ts";
import type { SmsProviderEvent } from "./provider.ts";
import type { SmsEventType, SmsStatus, StoredSmsWebhookEvent } from "./schemas.ts";
import { autoSuppressSms } from "./suppressions.ts";
import { recordSmsUsage } from "./usage.ts";

const { environment, smsEvent, smsMessage } = schema;

export type SmsEventRow = typeof smsEvent.$inferSelect;

/**
 * Clears the text of a message sent with `discardBody` (a one-time code): once it is sent, failed
 * or canceled, nothing needs it again.
 */
export async function discardSmsBody(
  executor: Executor,
  row: { id: string; organizationId: string },
): Promise<void> {
  await executor
    .update(smsMessage)
    .set({ body: "", discardBody: true })
    .where(
      and(
        eq(smsMessage.id, row.id),
        eq(smsMessage.organizationId, row.organizationId),
        or(eq(smsMessage.discardBody, true), hipaaModeAppliesSql(smsMessage.environmentId)),
        ne(smsMessage.body, ""),
      ),
    );
}

/** Events coss.com itself records (a refused send, a suppression) rather than a provider. */
export const COSS_SMS_EVENT_SOURCE = "coss";

/** Statuses a message may move from on each provider event (it only ever moves forward). */
const MOVES: Partial<Record<SmsEventType, { to: SmsStatus; from: SmsStatus[] }>> = {
  "sms.sent": { to: "sent", from: ["queued"] },
  "sms.delivered": { to: "delivered", from: ["queued", "sent"] },
  "sms.undelivered": { to: "undelivered", from: ["queued", "sent"] },
  "sms.failed": { to: "failed", from: ["queued", "sent"] },
};

/** Events that mean the message reached a carrier: what it is billed on. */
const REACHED_CARRIER: ReadonlySet<SmsEventType> = new Set([
  "sms.sent",
  "sms.delivered",
  "sms.undelivered",
]);

function dedupeKey(event: SmsProviderEvent): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        event.provider,
        event.providerStatus,
        event.providerMessageId ?? "",
        event.sourceId,
      ]),
    )
    .digest("hex");
}

/**
 * Records one event in `tx`: inserts it (deduplicated), moves the message forward, meters it when
 * it reaches a carrier and suppresses the number when the event says so. Returns the new rows;
 * duplicates, unknown messages and mismatched providers record nothing.
 */
export async function recordSmsEvent(
  tx: Executor,
  event: SmsProviderEvent,
): Promise<SmsEventRow[]> {
  if (!isId("sms", event.smsId)) return [];
  const [target] = await tx
    .select({
      id: smsMessage.id,
      organizationId: smsMessage.organizationId,
      projectId: smsMessage.projectId,
      environmentId: smsMessage.environmentId,
      provider: smsMessage.provider,
      providerMessageId: smsMessage.providerMessageId,
      from: smsMessage.from,
      to: smsMessage.to,
      toCountry: smsMessage.toCountry,
      segments: smsMessage.segments,
      tags: smsMessage.tags,
      traceparent: smsMessage.traceparent,
      mode: environment.mode,
    })
    .from(smsMessage)
    .innerJoin(
      environment,
      and(
        eq(environment.id, smsMessage.environmentId),
        eq(environment.organizationId, smsMessage.organizationId),
      ),
    )
    .where(eq(smsMessage.id, event.smsId))
    .limit(1);
  if (!target) {
    console.warn(`[sms:events] ignoring ${event.providerStatus} for unknown ${event.smsId}`);
    return [];
  }
  // Only the provider that was handed the message may report on it, and only for its own message.
  const fromCoss = event.provider === COSS_SMS_EVENT_SOURCE;
  if (
    (!fromCoss && target.provider !== event.provider) ||
    (target.providerMessageId &&
      event.providerMessageId &&
      target.providerMessageId !== event.providerMessageId)
  ) {
    console.warn(
      `[sms:events] ignoring ${event.provider} ${event.providerStatus} for ${target.id}: ` +
        "provider or message id mismatch",
    );
    return [];
  }

  const inserted = await tx
    .insert(smsEvent)
    .values({
      organizationId: target.organizationId,
      environmentId: target.environmentId,
      messageId: target.id,
      type: event.type,
      provider: event.provider,
      providerStatus: event.providerStatus,
      occurredAt: event.occurredAt,
      dedupeKey: dedupeKey(event),
      details: event.data,
    })
    .onConflictDoNothing({ target: [smsEvent.messageId, smsEvent.dedupeKey] })
    .returning();
  if (inserted.length === 0) return [];
  await appendLogEntries(tx, smsEventLogEntries(target, event, inserted));
  // Every event but `sms.scheduled` comes after the message stopped waiting to be sent.
  if (event.type !== "sms.scheduled") await discardSmsBody(tx, target);

  const live = target.mode === "live";
  const thisMessage = and(
    eq(smsMessage.id, target.id),
    eq(smsMessage.organizationId, target.organizationId),
  );
  const move = fromCoss ? undefined : MOVES[event.type];
  if (move) {
    const occurredAt = event.occurredAt.toISOString();
    // What a move records, for a normal move and for the repair below alike.
    const moved = {
      status: move.to,
      providerMessageId: sql`coalesce(${smsMessage.providerMessageId}, ${event.providerMessageId})`,
      ...(move.to === "failed"
        ? {}
        : { sentAt: sql`coalesce(${smsMessage.sentAt}, ${occurredAt}::timestamptz)` }),
      ...(move.to === "delivered" ? { deliveredAt: event.occurredAt } : {}),
    };
    await tx
      .update(smsMessage)
      .set({
        ...moved,
        // A move without a failure clears an earlier one (a screening hold the send got past).
        errorCode: event.data.failure?.code ?? null,
        errorMessage: event.data.failure?.message ?? null,
      })
      .where(and(thisMessage, inArray(smsMessage.status, move.from)));
    if (REACHED_CARRIER.has(event.type) || (move.to === "failed" && event.data.failure)) {
      // A late callback repairs a message the stale-claim sweep gave up on: it did go out, or the
      // provider says why it didn't (only reaching a carrier is billed, below).
      await tx
        .update(smsMessage)
        .set({
          ...moved,
          errorCode: event.data.failure?.code ?? null,
          errorMessage: event.data.failure?.message ?? null,
        })
        .where(
          and(
            thisMessage,
            eq(smsMessage.status, "failed"),
            eq(smsMessage.errorCode, "dispatch_interrupted"),
          ),
        );
    }
  }
  if (live && !fromCoss && REACHED_CARRIER.has(event.type)) await recordSmsUsage(tx, target);

  if (event.suppress) {
    await autoSuppressSms(tx, {
      organizationId: target.organizationId,
      projectId: target.projectId,
      environmentId: target.environmentId,
      phoneNumber: target.to,
      reason: event.suppress,
      messageId: target.id,
    });
  }
  // Carrier filtering and opt-outs are what SMS reputation is measured on (worker).
  if (live && (event.type === "sms.undelivered" || event.suppress === "opt_out")) {
    await markReputationDue(tx, target.organizationId);
  }

  for (const row of inserted) {
    const payload: StoredSmsWebhookEvent = {
      id: row.id,
      object: "event",
      type: row.type,
      created_at: row.createdAt.toISOString(),
      data: {
        sms_id: target.id,
        from: target.from,
        to: target.to,
        country: target.toCountry,
        segments: target.segments,
        tags: target.tags,
        sandbox: !live,
        occurred_at: row.occurredAt.toISOString(),
        ...(target.traceparent ? { traceparent: target.traceparent } : {}),
        ...row.details,
      },
    };
    await enqueueWebhookMessage(tx, {
      id: row.id,
      organizationId: target.organizationId,
      environmentId: target.environmentId,
      type: row.type,
      payload,
    });
  }
  return inserted;
}

/** Records events in order, each in its own transaction. Returns how many rows were new. */
export async function ingestSmsEvents(events: SmsProviderEvent[]): Promise<number> {
  let recorded = 0;
  for (const event of events) {
    const rows = await db.transaction((tx) => recordSmsEvent(tx, event));
    recorded += rows.length;
  }
  return recorded;
}
