/**
 * Sending messages: one message per send, fanned out in the same transaction to one delivery per
 * enabled endpoint of the application whose filter matches. Messages without a matching endpoint
 * are still stored, so they show up in the log and can be recovered to an endpoint added later.
 */
import type { UsageGate } from "@coss/billing/gate";
import {
  BUDGET_EXCEEDED_MESSAGES,
  budgetHoldFor,
  isOnBillingHold,
  recordUsage,
} from "@coss/billing/metering";
import { db, type Executor, schema } from "@coss/db";
import { ID_PREFIXES, idTimestamp, isId, newId } from "@coss/db/id";
import { IDEMPOTENCY_KEY_TTL_MS, requestHash, withIdempotencyKey } from "@coss/db/idempotency";
import { isSuspended } from "@coss/reputation";
import { and, arrayContains, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { HookApplicationRow } from "./applications.ts";
import { HookError } from "./errors.ts";
import {
  DEFAULT_LIST_LIMIT,
  EVENT_TYPE_NAME,
  type HookMessageObjectOutput,
  MAX_LIST_LIMIT,
  MAX_PAYLOAD_BYTES,
} from "./schemas.ts";
import { environmentOf } from "./shared.ts";

const { hookDelivery, hookEndpoint, hookIdempotencyKey, hookMessage } = schema;

export type HookMessageRow = typeof hookMessage.$inferSelect;

export function toHookMessageObject(row: HookMessageRow): HookMessageObjectOutput {
  return {
    object: "hook_message",
    id: row.id,
    application_id: row.applicationId,
    event_type: row.eventType,
    payload: row.payload as Record<string, unknown>,
    created_at: row.createdAt.toISOString(),
  };
}

/** The endpoints a message of `eventType` goes to: enabled, and subscribed to the type (or all). */
function matchingEndpoints(input: {
  organizationId: string;
  applicationId: string;
  eventType: string;
}) {
  return and(
    eq(hookEndpoint.organizationId, input.organizationId),
    eq(hookEndpoint.applicationId, input.applicationId),
    eq(hookEndpoint.enabled, true),
    or(
      sql`cardinality(${hookEndpoint.filterTypes}) = 0`,
      arrayContains(hookEndpoint.filterTypes, [input.eventType]),
    ),
  );
}

/** How many deliveries a message of `eventType` would make (the send quota's cost). */
export async function countHookFanout(input: {
  organizationId: string;
  applicationId: string;
  eventType: string;
}): Promise<number> {
  const rows = await db
    .select({ id: hookEndpoint.id })
    .from(hookEndpoint)
    .where(matchingEndpoints(input));
  return rows.length;
}

function checkedMessage(eventType: string, payload: unknown): number {
  if (!EVENT_TYPE_NAME.test(eventType)) {
    throw new HookError("invalid_event_type", "Use 1-64 letters, digits and . _ -", "event_type");
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HookError("invalid_event_type", "The payload must be a JSON object.", "payload");
  }
  const bytes = Buffer.byteLength(JSON.stringify(payload));
  if (bytes > MAX_PAYLOAD_BYTES) {
    throw new HookError(
      "payload_too_large",
      `A payload can be at most ${MAX_PAYLOAD_BYTES / 1024} KB (this one is ${Math.ceil(bytes / 1024)} KB).`,
      "payload",
    );
  }
  return bytes;
}

/** Inserts the message and its deliveries (one per matching endpoint, or just `onlyEndpointId`). */
async function insertMessage(
  tx: Executor,
  input: {
    application: HookApplicationRow;
    eventType: string;
    payload: Record<string, unknown>;
    payloadBytes: number;
    onlyEndpointId?: string;
    id: string;
    createdAt: Date;
  },
): Promise<{ message: HookMessageRow; deliveries: number }> {
  const { application, createdAt } = input;
  const [message] = await tx
    .insert(hookMessage)
    .values({
      id: input.id,
      createdAt,
      organizationId: application.organizationId,
      projectId: application.projectId,
      environmentId: application.environmentId,
      applicationId: application.id,
      eventType: input.eventType,
      payload: input.payload,
      payloadBytes: input.payloadBytes,
      onlyEndpointId: input.onlyEndpointId ?? null,
    })
    .returning();
  if (!message) throw new Error("Hook message insert returned no row.");
  const endpoints = await tx
    .select({ id: hookEndpoint.id })
    .from(hookEndpoint)
    .where(
      input.onlyEndpointId === undefined
        ? matchingEndpoints({
            organizationId: application.organizationId,
            applicationId: application.id,
            eventType: input.eventType,
          })
        : and(
            eq(hookEndpoint.organizationId, application.organizationId),
            eq(hookEndpoint.applicationId, application.id),
            eq(hookEndpoint.id, input.onlyEndpointId),
          ),
    )
    // Fan-out happens under a key-share lock: an endpoint deleted meanwhile gets no delivery.
    .for("key share");
  if (endpoints.length > 0) {
    await tx.insert(hookDelivery).values(
      endpoints.map((endpoint) => ({
        id: newId(ID_PREFIXES.hookDelivery, createdAt.getTime()),
        messageCreatedAt: createdAt,
        organizationId: application.organizationId,
        environmentId: application.environmentId,
        applicationId: application.id,
        messageId: message.id,
        endpointId: endpoint.id,
        nextAttemptAt: createdAt,
      })),
    );
  }
  return { message, deliveries: endpoints.length };
}

type KeyedMessage = {
  createdAt: Date;
  requestHash: string;
  keyId: string;
  message: HookMessageRow;
  deliveries: number;
};

async function messageForKey(
  organizationId: string,
  environmentId: string,
  key: string,
): Promise<KeyedMessage | undefined> {
  const [row] = await db
    .select({ key: hookIdempotencyKey, message: hookMessage })
    .from(hookIdempotencyKey)
    .innerJoin(
      hookMessage,
      and(
        eq(hookMessage.createdAt, hookIdempotencyKey.messageCreatedAt),
        eq(hookMessage.id, hookIdempotencyKey.messageId),
      ),
    )
    .where(
      and(
        eq(hookIdempotencyKey.organizationId, organizationId),
        eq(hookIdempotencyKey.environmentId, environmentId),
        eq(hookIdempotencyKey.key, key),
      ),
    )
    .limit(1);
  if (!row) return undefined;
  return {
    createdAt: row.key.createdAt,
    requestHash: row.key.requestHash,
    keyId: row.key.id,
    message: row.message,
    deliveries: 0,
  };
}

function sendHash(input: {
  application: HookApplicationRow;
  eventType: string;
  payload: Record<string, unknown>;
  onlyEndpointId?: string;
}): string {
  return requestHash({
    application: input.application.id,
    event_type: input.eventType,
    payload: input.payload,
    only_endpoint_id: input.onlyEndpointId,
  });
}

/**
 * The message an earlier identical request with this idempotency key sent (within a day), or
 * `null`. Sends nothing: lets a caller over its quota still get its replay.
 */
export async function replayHookMessage(input: {
  application: HookApplicationRow;
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  onlyEndpointId?: string;
  now?: Date;
}): Promise<HookMessageRow | null> {
  if (input.idempotencyKey === undefined) return null;
  const existing = await messageForKey(
    input.application.organizationId,
    input.application.environmentId,
    input.idempotencyKey,
  );
  const now = input.now ?? new Date();
  return existing &&
    existing.requestHash === sendHash(input) &&
    now.getTime() - existing.createdAt.getTime() <= IDEMPOTENCY_KEY_TTL_MS
    ? existing.message
    : null;
}

/**
 * Sends a message to an application. With an idempotency key, a repeat of the same request (within
 * a day) returns the first message instead of sending again (`replayed`); the key with a different
 * request is `idempotency_key_reused`. Live sends are refused while the organization is suspended
 * or on a billing hold (a replay still returns). A live message is metered once as
 * `hooks.messages` when it's accepted, whatever its fan-out; test sends and sandbox are free.
 */
export async function sendHookMessage(input: {
  application: HookApplicationRow;
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  /** Test sends go to this endpoint only, whatever its filter. */
  onlyEndpointId?: string;
  now?: Date;
  /** Hard usage caps (`@coss/billing`: Free's included messages). Unenforced without one. */
  billing?: UsageGate | undefined;
  /** The API key that sent it, for spend attribution and budgets. */
  apiKeyId?: string | null | undefined;
  /** The member whose personal key it is. */
  apiKeyOwnerId?: string | null | undefined;
}): Promise<{ message: HookMessageRow; replayed: boolean; deliveries: number }> {
  const { application } = input;
  const payloadBytes = checkedMessage(input.eventType, input.payload);
  const now = input.now ?? new Date();
  const hash = sendHash(input);
  const key = input.idempotencyKey;
  const replay = await replayHookMessage({ ...input, now });
  if (replay) return { message: replay, replayed: true, deliveries: 0 };
  const env = await environmentOf(application.organizationId, application.environmentId);
  if (env.mode === "live" && (await isSuspended(application.organizationId))) {
    throw new HookError(
      "account_suspended",
      "Live sending is suspended for this organization because of its reputation. Sandbox keys " +
        "still work. Contact support to resume.",
    );
  }
  if (env.mode === "live" && (await isOnBillingHold(application.organizationId))) {
    throw new HookError(
      "billing_hold",
      "Live sending is paused: your organization has an overdue invoice or reached its spend limit.",
    );
  }
  const billable = env.mode === "live" && input.onlyEndpointId === undefined;
  if (billable) {
    const held = await budgetHoldFor({
      organizationId: application.organizationId,
      projectId: env.projectId,
      apiKeyId: input.apiKeyId,
      userId: input.apiKeyOwnerId,
    });
    if (held) throw new HookError("budget_exceeded", BUDGET_EXCEEDED_MESSAGES[held]);
  }
  // Whole milliseconds: the id encodes `created_at`, which must equal it exactly.
  const createdAt = new Date(Math.floor(now.getTime()));
  const id = newId(ID_PREFIXES.hookMessage, createdAt.getTime());
  const send = async (tx: Executor) => {
    const sent = await insertMessage(tx, { ...input, payloadBytes, id, createdAt });
    if (billable) {
      await recordUsage(tx, {
        organizationId: application.organizationId,
        environmentId: application.environmentId,
        meter: "hooks.messages",
        quantity: 1,
        projectId: env.projectId,
        apiKeyId: input.apiKeyId ?? null,
        userId: input.apiKeyOwnerId ?? null,
      });
      // The cap's row lock is held to the commit: the transaction's last statement.
      await input.billing?.reserve(tx, {
        organizationId: application.organizationId,
        meter: "hooks.messages",
        quantity: 1,
      });
    }
    return sent;
  };
  if (key === undefined) {
    const sent = await db.transaction(send);
    return { ...sent, replayed: false };
  }
  const { row, replayed } = await withIdempotencyKey<KeyedMessage>({
    requestHash: hash,
    now: () => now.getTime(),
    errors: {
      inProgress: () =>
        new HookError("request_in_progress", "This idempotency key is busy. Retry shortly."),
      reused: () =>
        new HookError(
          "idempotency_key_reused",
          "This idempotency key was already used with a different request body.",
        ),
    },
    insert: async (tx) => {
      const [claimed] = await tx
        .insert(hookIdempotencyKey)
        .values({
          id: newId(ID_PREFIXES.hookIdempotencyKey),
          organizationId: application.organizationId,
          environmentId: application.environmentId,
          key,
          requestHash: hash,
          messageId: id,
          messageCreatedAt: createdAt,
          createdAt,
        })
        .onConflictDoNothing()
        .returning();
      if (!claimed) return undefined;
      const sent = await send(tx);
      return {
        createdAt: claimed.createdAt,
        requestHash: hash,
        keyId: claimed.id,
        message: sent.message,
        deliveries: sent.deliveries,
      };
    },
    existing: () => messageForKey(application.organizationId, application.environmentId, key),
    release: (tx, existing) =>
      tx
        .delete(hookIdempotencyKey)
        .where(
          and(
            eq(hookIdempotencyKey.id, existing.keyId),
            eq(hookIdempotencyKey.createdAt, existing.createdAt),
          ),
        ),
  });
  return { message: row.message, replayed, deliveries: row.deliveries };
}

/** The application's message `id`; `null` for an unknown id or another application's message. */
export async function getHookMessage(input: {
  organizationId: string;
  applicationId: string;
  id: string;
}): Promise<HookMessageRow | null> {
  const createdAt = isId(ID_PREFIXES.hookMessage, input.id) ? idTimestamp(input.id) : null;
  if (createdAt === null) return null;
  const [row] = await db
    .select()
    .from(hookMessage)
    .where(
      and(
        eq(hookMessage.createdAt, new Date(createdAt)),
        eq(hookMessage.id, input.id),
        eq(hookMessage.organizationId, input.organizationId),
        eq(hookMessage.applicationId, input.applicationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** One page of the application's messages, newest first (optionally of one type). */
export async function pageHookMessages(input: {
  organizationId: string;
  applicationId: string;
  eventType?: string;
  limit?: number;
  after?: string;
}): Promise<{ messages: HookMessageRow[]; hasMore: boolean }> {
  const limit = Math.min(input.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
  const cursor =
    input.after === undefined ? undefined : cursorOf(ID_PREFIXES.hookMessage, input.after);
  if (cursor === null) return { messages: [], hasMore: false };
  const rows = await db
    .select()
    .from(hookMessage)
    .where(
      and(
        eq(hookMessage.organizationId, input.organizationId),
        eq(hookMessage.applicationId, input.applicationId),
        input.eventType === undefined ? undefined : eq(hookMessage.eventType, input.eventType),
        cursor === undefined
          ? undefined
          : sql`(${hookMessage.createdAt}, ${hookMessage.id}) < (${cursor.createdAt}, ${cursor.id})`,
        // Lets the planner prune the newer days' partitions.
        cursor === undefined ? undefined : sql`${hookMessage.createdAt} <= ${cursor.createdAt}`,
      ),
    )
    .orderBy(desc(hookMessage.createdAt), desc(hookMessage.id))
    .limit(limit + 1);
  return { messages: rows.slice(0, limit), hasMore: rows.length > limit };
}

/** A keyset cursor from an id that encodes its partition time; `null` when it is not such an id. */
export function cursorOf(prefix: string, id: string): { createdAt: Date; id: string } | null {
  const time = isId(prefix, id) ? idTimestamp(id) : null;
  return time === null ? null : { createdAt: new Date(time), id };
}

/** The messages `ids` (any application of the organization), for the delivery worker. */
export async function hookMessagesByIds(
  organizationIds: readonly string[],
  refs: readonly { id: string; createdAt: Date }[],
): Promise<HookMessageRow[]> {
  if (refs.length === 0) return [];
  const times = [...new Set(refs.map((ref) => ref.createdAt.getTime()))].map((t) => new Date(t));
  return db
    .select()
    .from(hookMessage)
    .where(
      and(
        inArray(hookMessage.createdAt, times),
        inArray(
          hookMessage.id,
          refs.map((ref) => ref.id),
        ),
        inArray(hookMessage.organizationId, [...organizationIds]),
      ),
    );
}
