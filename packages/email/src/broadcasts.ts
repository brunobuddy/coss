/**
 * Broadcasts: one marketing email to an audience or segment. A draft is edited freely; sending
 * (now or `scheduled_at`) hands it to the worker (`runDueBroadcasts`), which screens it once,
 * freezes its content and target, then makes one email per eligible contact in throttled batches
 * — never more than a few thousand waiting at once, so the dispatch sweeps never fail a backlog —
 * and enqueues them on the marketing dispatch queue. Its emails store no body: dispatch renders
 * the broadcast's content with each email's variables (`broadcast-render.ts`).
 *
 * Fan-out is leased per broadcast (`lease_until`, bound from a JS `Date`) and every step writes
 * only while its lease still holds, so a worker that lost its lease writes nothing. Re-running a
 * step is safe: an email is unique per broadcast and contact.
 */
import type { UsageGate } from "@coss/billing/gate";
import { db, type Executor, schema, type Transaction } from "@coss/db";
import { ID_PREFIXES, isId, newId } from "@coss/db/id";
import { IDEMPOTENCY_KEY_TTL_MS, requestHash, withIdempotencyKey } from "@coss/db/idempotency";
import type { ScreenInput, ScreenOutcome } from "@coss/screening";
import { enqueueWebhookMessage } from "@coss/webhooks";
import { and, asc, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  type ContactRecipient,
  contactVariables,
  countRecipients,
  type RecipientTarget,
  resolveRecipients,
} from "./audience-resolution.ts";
import {
  type BroadcastContent,
  boundedSubject,
  MAX_RENDERED_LENGTH,
  maxRenderedLength,
  renderBroadcast,
  renderTemplate,
  templateKeys,
} from "./broadcast-render.ts";
import type {
  BroadcastEventType,
  BroadcastOutput,
  BroadcastStatsOutput,
  CreateBroadcastRequestOutput,
  ListBroadcastsQueryOutput,
  StoredBroadcastWebhookEvent,
  UpdateBroadcastRequestOutput,
} from "./broadcast-schemas.ts";
import { DEFAULT_BROADCAST_LIST_LIMIT } from "./broadcast-schemas.ts";
import { broadcastStats, bumpBroadcastStats, shardCounts } from "./broadcast-stats.ts";
import { assertWithinBudget } from "./budgets.ts";
import {
  type ContactEnvironment,
  environmentProject,
  inContactEnvironment,
  propertyDefinitions,
} from "./contact-properties.ts";
import { getContactRow } from "./contacts.ts";
import type { EmailDispatchQueue } from "./dispatch.ts";
import { authorizeLiveSender } from "./domains.ts";
import { ContactError, EmailError } from "./errors.ts";
import { getMarketingSettingsRow } from "./marketing-settings.ts";
import { selectEmailsWithMode, toEmailObjects } from "./read.ts";
import {
  addressKey,
  type EmailObjectOutput,
  SendEmailRequest,
  SUBJECT_MAX_LENGTH,
} from "./schemas.ts";
import { loadEmailScreeningContent, recordScreeningDomainBlock } from "./screening.ts";
import type { ScreeningImageLoader } from "./screening-images.ts";
import type { EmailService, SendEnvironment } from "./service.ts";
import { resolveStoreContent } from "./storage-settings.ts";
import { topicsByKey } from "./topics.ts";
import { newTrackingToken } from "./tracking.ts";

const { audience, broadcast, email, emailRecipient, environment, segment } = schema;

export type BroadcastRow = typeof broadcast.$inferSelect;

export type BroadcastErrorCode =
  | "not_found"
  | "broadcast_not_editable"
  | "broadcast_not_sendable"
  | "invalid_target"
  | "topic_not_found"
  | "mailing_address_required"
  | "idempotency_key_reused"
  | "request_in_progress"
  | "content_too_large";

/** Expected failures of broadcasts; only `not_found` is a 404, the rest 422 (never 409). */
export class BroadcastError extends Error {
  readonly code: BroadcastErrorCode;
  readonly param: string | undefined;

  constructor(code: BroadcastErrorCode, message: string, opts?: { param?: string }) {
    super(message);
    this.name = "BroadcastError";
    this.code = code;
    this.param = opts?.param;
  }
}

/** Where a broadcast's API-side functions act: the key's (or dashboard page's) environment. */
export type BroadcastEnvironment = SendEnvironment;

const envOf = (
  row: Pick<BroadcastRow, "organizationId" | "environmentId">,
): ContactEnvironment => ({
  organizationId: row.organizationId,
  environmentId: row.environmentId,
});

export function toBroadcastObject(row: BroadcastRow, stats: BroadcastStatsOutput): BroadcastOutput {
  return {
    object: "broadcast",
    id: row.id,
    name: row.name,
    status: row.status,
    audience_id: row.audienceId,
    segment_id: row.segmentId,
    topic: row.topic,
    from: row.from,
    reply_to: row.replyTo,
    subject: row.subject,
    preview_text: row.previewText,
    html: row.html,
    text: row.text,
    tracking: { opens: row.trackOpens, clicks: row.trackClicks },
    rate_per_second: row.ratePerSecond,
    scheduled_at: row.scheduledAt?.toISOString() ?? null,
    started_at: row.startedAt?.toISOString() ?? null,
    completed_at: row.completedAt?.toISOString() ?? null,
    canceled_at: row.canceledAt?.toISOString() ?? null,
    recipients_estimated: row.recipientsEstimated,
    pause_reason: row.pauseReason,
    error:
      row.errorCode && row.errorMessage ? { code: row.errorCode, message: row.errorMessage } : null,
    stats,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

async function toObjects(rows: BroadcastRow[]): Promise<BroadcastOutput[]> {
  const [first] = rows;
  if (!first) return [];
  const stats = await broadcastStats(
    first.organizationId,
    rows.map((row) => row.id),
  );
  return rows.map((row) => toBroadcastObject(row, stats.get(row.id) as BroadcastStatsOutput));
}

export async function getBroadcastRow(
  env: ContactEnvironment,
  id: string,
  executor: Executor = db,
): Promise<BroadcastRow | null> {
  if (!isId("bcast", id)) return null;
  const [row] = await executor
    .select()
    .from(broadcast)
    .where(and(inContactEnvironment(broadcast, env), eq(broadcast.id, id)))
    .limit(1);
  return row ?? null;
}

export async function getBroadcast(
  env: ContactEnvironment,
  id: string,
): Promise<BroadcastOutput | null> {
  const row = await getBroadcastRow(env, id);
  return row ? ((await toObjects([row]))[0] ?? null) : null;
}

/** A page of the environment's broadcasts, newest first. */
export async function listBroadcasts(
  env: ContactEnvironment,
  query: ListBroadcastsQueryOutput,
): Promise<{ object: "list"; data: BroadcastOutput[]; has_more: boolean }> {
  const limit = query.limit ?? DEFAULT_BROADCAST_LIST_LIMIT;
  const rows = await db
    .select()
    .from(broadcast)
    .where(
      and(
        inContactEnvironment(broadcast, env),
        query.status ? eq(broadcast.status, query.status) : undefined,
        query.after ? lt(broadcast.id, query.after) : undefined,
      ),
    )
    .orderBy(desc(broadcast.id))
    .limit(limit + 1);
  return {
    object: "list",
    data: await toObjects(rows.slice(0, limit)),
    has_more: rows.length > limit,
  };
}

/**
 * A page of the broadcast's emails, newest first (`after`: the last email id of the previous
 * page). `null` without the broadcast.
 */
export async function listBroadcastEmails(
  env: ContactEnvironment,
  id: string,
  query: { limit?: number; after?: string },
): Promise<{ object: "list"; data: EmailObjectOutput[]; has_more: boolean } | null> {
  const row = await getBroadcastRow(env, id);
  if (!row) return null;
  const limit = query.limit ?? DEFAULT_BROADCAST_LIST_LIMIT;
  const rows = await selectEmailsWithMode(
    env.organizationId,
    and(
      eq(email.environmentId, env.environmentId),
      eq(email.broadcastId, row.id),
      query.after
        ? sql`(${email.createdAt}, ${email.id}) < (
            select c.created_at, c.id from ${email} c
            where c.id = ${query.after}
              and c.organization_id = ${env.organizationId}
              and c.broadcast_id = ${row.id}
          )`
        : undefined,
    ),
    limit + 1,
  );
  return {
    object: "list",
    data: await toEmailObjects(env.organizationId, rows.slice(0, limit)),
    has_more: rows.length > limit,
  };
}

/** Checks the target and the topic exist in the environment. */
async function checkReferences(
  env: ContactEnvironment,
  input: { audienceId: string | null; segmentId: string | null; topic: string | null },
  executor: Executor = db,
): Promise<void> {
  if (input.audienceId) {
    const [row] = await executor
      .select({ id: audience.id })
      .from(audience)
      .where(and(inContactEnvironment(audience, env), eq(audience.id, input.audienceId)))
      .limit(1);
    if (!row) {
      throw new BroadcastError("invalid_target", `No audience ${input.audienceId} exists.`, {
        param: "audience_id",
      });
    }
  }
  if (input.segmentId) {
    const [row] = await executor
      .select({ id: segment.id })
      .from(segment)
      .where(and(inContactEnvironment(segment, env), eq(segment.id, input.segmentId)))
      .limit(1);
    if (!row) {
      throw new BroadcastError("invalid_target", `No segment ${input.segmentId} exists.`, {
        param: "segment_id",
      });
    }
  }
  if (input.topic && !(await topicsByKey(env, [input.topic], executor)).has(input.topic)) {
    throw new BroadcastError("topic_not_found", `No topic with the key "${input.topic}" exists.`, {
      param: "topic",
    });
  }
}

/**
 * Whether the broadcast may start: a postal address, and (live) a From domain verified for the
 * marketing stream, with marketing neither paused nor held, and the budgets of its project and of
 * the key that made it (and that key's owner) not used up.
 */
async function checkSendable(
  env: BroadcastEnvironment,
  row: Pick<BroadcastRow, "from"> & { apiKeyId: string | null; apiKeyOwnerId?: string | null },
  liveProvider: string,
): Promise<void> {
  if (!(await getMarketingSettingsRow(env))?.mailingAddress) {
    throw new BroadcastError(
      "mailing_address_required",
      "Broadcasts need this environment's postal address: set it in the marketing settings first.",
    );
  }
  if (env.mode === "live") {
    await authorizeLiveSender({
      organizationId: env.organizationId,
      from: row.from,
      provider: liveProvider,
      stream: "marketing",
    });
    await assertWithinBudget({
      organizationId: env.organizationId,
      projectId: env.projectId,
      apiKeyId: row.apiKeyId,
      userId: row.apiKeyOwnerId,
    });
  }
}

const IDEMPOTENCY_ERRORS = {
  inProgress: () =>
    new BroadcastError("request_in_progress", "This idempotency key is busy. Retry shortly."),
  reused: () =>
    new BroadcastError(
      "idempotency_key_reused",
      "This idempotency key was already used with a different request body.",
    ),
};

/** Creates a draft, or (with `send` or `scheduled_at`) a broadcast that starts sending. */
/**
 * Refuses content that could render too large for one email (every recipient's is rendered
 * whole at dispatch): each placeholder counts at its longest possible value.
 */
function assertRenderable(content: { html: string | null; text: string | null }): void {
  for (const field of ["html", "text"] as const) {
    if (maxRenderedLength(content[field]) > MAX_RENDERED_LENGTH) {
      throw new BroadcastError(
        "content_too_large",
        `The ${field} could render to more than ${MAX_RENDERED_LENGTH / 1_000_000} million ` +
          "characters with long contact values: use fewer {{{contact.…}}} placeholders.",
        { param: field },
      );
    }
  }
}

/** The broadcast an unexpired idempotency key made from the same request, if any. */
async function findBroadcastReplay(
  env: BroadcastEnvironment,
  idempotencyKey: string,
  hash: string,
  now: Date,
): Promise<BroadcastOutput | null> {
  const [existing] = await db
    .select()
    .from(broadcast)
    .where(and(inContactEnvironment(broadcast, env), eq(broadcast.idempotencyKey, idempotencyKey)))
    .limit(1);
  if (
    !existing ||
    existing.requestHash !== hash ||
    now.getTime() - existing.createdAt.getTime() > IDEMPOTENCY_KEY_TTL_MS
  ) {
    return null;
  }
  return (await toObjects([existing]))[0] ?? null;
}

export async function createBroadcast(
  env: BroadcastEnvironment & { apiKeyId: string | null; apiKeyOwnerId?: string | null },
  params: CreateBroadcastRequestOutput,
  opts: { liveProvider: string; idempotencyKey?: string | null; now?: Date },
): Promise<{ broadcast: BroadcastOutput; replayed: boolean }> {
  const now = opts.now ?? new Date();
  assertRenderable({ html: params.html ?? null, text: params.text ?? null });
  const references = {
    audienceId: params.audience_id ?? null,
    segmentId: params.segment_id ?? null,
    topic: params.topic ?? null,
  };
  const starts = params.send || params.scheduled_at !== undefined;
  const idempotencyKey = opts.idempotencyKey || null;
  const hash = idempotencyKey ? requestHash(params) : null;
  try {
    await checkReferences(env, references);
    if (starts) {
      await checkSendable(
        env,
        { from: params.from, apiKeyId: env.apiKeyId, apiKeyOwnerId: env.apiKeyOwnerId },
        opts.liveProvider,
      );
    }
  } catch (error) {
    // A retry of a request that already succeeded still replays, even if a check it passed then
    // fails now (its audience deleted, the postal address removed, marketing paused).
    const replay =
      (error instanceof BroadcastError || error instanceof EmailError) && idempotencyKey && hash
        ? await findBroadcastReplay(env, idempotencyKey, hash, now)
        : null;
    if (replay) return { broadcast: replay, replayed: true };
    throw error;
  }
  const scheduledAt = params.scheduled_at ? new Date(params.scheduled_at) : starts ? now : null;
  const projectId = await environmentProject(env);
  if (!projectId) throw new BroadcastError("not_found", "Environment not found.");
  const insert = async (tx: Transaction) => {
    const [row] = await tx
      .insert(broadcast)
      .values({
        organizationId: env.organizationId,
        projectId,
        environmentId: env.environmentId,
        apiKeyId: env.apiKeyId,
        // Its emails are the spend of the member whose personal key created it.
        apiKeyOwnerId: env.apiKeyOwnerId ?? null,
        name: params.name,
        status: starts ? "scheduled" : "draft",
        ...references,
        from: params.from,
        replyTo: params.reply_to ?? [],
        subject: params.subject,
        previewText: params.preview_text ?? null,
        html: params.html ?? null,
        text: params.text ?? null,
        trackOpens: params.tracking?.opens ?? false,
        trackClicks: params.tracking?.clicks ?? false,
        ratePerSecond: params.rate_per_second ?? null,
        scheduledAt,
        nextRunAt: scheduledAt,
        idempotencyKey,
        requestHash: hash,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: [broadcast.environmentId, broadcast.idempotencyKey] })
      .returning();
    return row;
  };
  if (!idempotencyKey || !hash) {
    const row = await db.transaction(insert);
    if (!row) throw new Error("Broadcast insert returned no row.");
    return { broadcast: (await toObjects([row]))[0] as BroadcastOutput, replayed: false };
  }
  const { row, replayed } = await withIdempotencyKey({
    requestHash: hash,
    errors: IDEMPOTENCY_ERRORS,
    insert,
    existing: async () => {
      const [existing] = await db
        .select()
        .from(broadcast)
        .where(
          and(inContactEnvironment(broadcast, env), eq(broadcast.idempotencyKey, idempotencyKey)),
        )
        .limit(1);
      return existing;
    },
    release: (tx, existing) =>
      tx
        .update(broadcast)
        .set({ idempotencyKey: null })
        .where(and(eq(broadcast.id, existing.id), eq(broadcast.idempotencyKey, idempotencyKey))),
  });
  return { broadcast: (await toObjects([row]))[0] as BroadcastOutput, replayed };
}

/** Edits a draft (anything else is `broadcast_not_editable`); `null` without it. */
export async function updateBroadcast(
  env: ContactEnvironment,
  id: string,
  params: UpdateBroadcastRequestOutput,
): Promise<BroadcastOutput | null> {
  if (!isId("bcast", id)) return null;
  // Read and merged under the row's lock: a concurrent edit's fields are never written back.
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(broadcast)
      .where(and(inContactEnvironment(broadcast, env), eq(broadcast.id, id)))
      .for("update");
    if (!row) return null;
    if (row.status !== "draft") {
      throw new BroadcastError("broadcast_not_editable", "Only a draft broadcast can be changed.");
    }
    const audienceId = params.audience_id === undefined ? row.audienceId : params.audience_id;
    const segmentId =
      params.segment_id === undefined
        ? params.audience_id
          ? null
          : row.segmentId
        : params.segment_id;
    const finalAudience = params.segment_id ? null : audienceId;
    if (Boolean(finalAudience) === Boolean(segmentId)) {
      throw new BroadcastError(
        "invalid_target",
        "Give exactly one of audience_id and segment_id.",
        {
          param: "audience_id",
        },
      );
    }
    const topic = params.topic === undefined ? row.topic : params.topic;
    await checkReferences(env, { audienceId: finalAudience, segmentId, topic }, tx);
    const html = params.html === undefined ? row.html : params.html;
    const text = params.text === undefined ? row.text : params.text;
    if (!html && !text) {
      throw new BroadcastError("broadcast_not_editable", "A broadcast needs html, text, or both.", {
        param: "html",
      });
    }
    assertRenderable({ html, text });
    const [saved] = await tx
      .update(broadcast)
      .set({
        ...(params.name === undefined ? {} : { name: params.name }),
        audienceId: finalAudience,
        segmentId,
        topic,
        ...(params.from === undefined ? {} : { from: params.from }),
        ...(params.reply_to === undefined ? {} : { replyTo: params.reply_to }),
        ...(params.subject === undefined ? {} : { subject: params.subject }),
        ...(params.preview_text === undefined ? {} : { previewText: params.preview_text }),
        html,
        text,
        ...(params.tracking?.opens === undefined ? {} : { trackOpens: params.tracking.opens }),
        ...(params.tracking?.clicks === undefined ? {} : { trackClicks: params.tracking.clicks }),
        ...(params.rate_per_second === undefined ? {} : { ratePerSecond: params.rate_per_second }),
      })
      // Compare-and-set: a draft that started sending meanwhile is left alone.
      .where(
        and(
          inContactEnvironment(broadcast, env),
          eq(broadcast.id, id),
          eq(broadcast.status, "draft"),
        ),
      )
      .returning();
    if (!saved) {
      throw new BroadcastError("broadcast_not_editable", "Only a draft broadcast can be changed.");
    }
    return saved;
  });
  return updated ? ((await toObjects([updated]))[0] ?? null) : null;
}

/** Deletes a draft, or a broadcast canceled before any of its emails were made. */
export async function deleteBroadcast(env: ContactEnvironment, id: string): Promise<boolean> {
  const row = await getBroadcastRow(env, id);
  if (!row) return false;
  const deletable = row.status === "draft" || (row.status === "canceled" && row.materialized === 0);
  if (!deletable) {
    throw new BroadcastError(
      "broadcast_not_editable",
      "Only a draft (or a broadcast canceled before sending) can be deleted.",
    );
  }
  const deleted = await db
    .delete(broadcast)
    .where(
      and(
        inContactEnvironment(broadcast, env),
        eq(broadcast.id, id),
        eq(broadcast.status, row.status),
      ),
    )
    .returning({ id: broadcast.id });
  return deleted.length > 0;
}

/** Announces a broadcast's state to its environment's webhook endpoints, in `tx`. */
async function announce(
  tx: Executor,
  row: BroadcastRow,
  type: BroadcastEventType,
  now: Date,
): Promise<void> {
  const stats = (await broadcastStats(row.organizationId, [row.id], tx)).get(
    row.id,
  ) as BroadcastStatsOutput;
  const id = newId(ID_PREFIXES.webhookEvent);
  const payload: StoredBroadcastWebhookEvent = {
    id,
    object: "event",
    type,
    created_at: now.toISOString(),
    data: {
      broadcast: { id: row.id, name: row.name, status: row.status },
      pause_reason: row.pauseReason,
      error:
        row.errorCode && row.errorMessage
          ? { code: row.errorCode, message: row.errorMessage }
          : null,
      stats,
      occurred_at: now.toISOString(),
    },
  };
  await enqueueWebhookMessage(tx, {
    id,
    organizationId: row.organizationId,
    environmentId: row.environmentId,
    type,
    payload,
    now,
  });
}

/** Starts sending a draft, now or at `scheduledAt`. Sending it again returns it as it is. */
export async function sendBroadcast(
  env: BroadcastEnvironment,
  id: string,
  opts: { scheduledAt?: Date | null; liveProvider: string; now?: Date },
): Promise<BroadcastOutput | null> {
  const now = opts.now ?? new Date();
  const row = await getBroadcastRow(env, id);
  if (!row) return null;
  if (row.status !== "draft") {
    if (row.status === "scheduled" || row.status === "sending") {
      return (await toObjects([row]))[0] ?? null;
    }
    throw new BroadcastError("broadcast_not_sendable", `A ${row.status} broadcast can't be sent.`);
  }
  await checkSendable(env, row, opts.liveProvider);
  const at = opts.scheduledAt ?? now;
  const [updated] = await db
    .update(broadcast)
    .set({ status: "scheduled", scheduledAt: at, nextRunAt: at })
    .where(
      and(
        inContactEnvironment(broadcast, env),
        eq(broadcast.id, id),
        eq(broadcast.status, "draft"),
      ),
    )
    .returning();
  return updated ? ((await toObjects([updated]))[0] ?? null) : getBroadcast(env, id);
}

/**
 * Deletes the broadcast's emails nobody claimed yet (`queued`, no provider: atomic against the
 * dispatch claim) and takes them off its counters and the usage reservation. Returns how many,
 * and the smallest contact id among them (where a paused broadcast resumes).
 */
async function dropUnclaimed(
  tx: Transaction,
  row: BroadcastRow,
  billing: UsageGate | undefined,
  mode: "live" | "sandbox",
): Promise<{ count: number; firstContactId: string | null }> {
  const dropped = await tx
    .delete(email)
    .where(
      and(
        eq(email.organizationId, row.organizationId),
        eq(email.broadcastId, row.id),
        eq(email.status, "queued"),
        isNull(email.provider),
      ),
    )
    .returning({ id: email.id, contactId: email.contactId, createdAt: email.createdAt });
  if (dropped.length === 0) return { count: 0, firstContactId: null };
  await bumpBroadcastStats(tx, {
    broadcastId: row.id,
    organizationId: row.organizationId,
    field: "recipients",
    counts: shardCounts(
      dropped.map((entry) => entry.id),
      -1,
    ),
  });
  if (mode === "live" && billing?.release) {
    // Each email was reserved when it was made: give it back to that (UTC) month.
    const byMonth = new Map<string, Date[]>();
    for (const entry of dropped) {
      const month = entry.createdAt.toISOString().slice(0, 7);
      byMonth.set(month, [...(byMonth.get(month) ?? []), entry.createdAt]);
    }
    for (const dates of byMonth.values()) {
      await billing.release(tx, {
        organizationId: row.organizationId,
        meter: "email.recipients",
        quantity: dates.length,
        reservedAt: dates[0] as Date,
      });
    }
  }
  const contacts = dropped
    .map((entry) => entry.contactId ?? "")
    .filter(Boolean)
    .sort();
  return { count: dropped.length, firstContactId: contacts[0] ?? null };
}

/**
 * The cursor to resume from after unsent emails were dropped: just before `firstContactId`. It
 * comes from the contacts, not the broadcast's emails, which retention may have purged (a
 * boundary made from what is left would send the purged ones' contacts again).
 */
async function rewoundCursor(
  tx: Transaction,
  row: BroadcastRow,
  firstContactId: string | null,
): Promise<string | null> {
  if (!firstContactId) return row.cursor;
  const [before] = await tx
    .select({ id: sql<string | null>`max(${schema.contact.id})` })
    .from(schema.contact)
    .where(
      and(inContactEnvironment(schema.contact, envOf(row)), lt(schema.contact.id, firstContactId)),
    );
  return before?.id ?? null;
}

async function modeOf(row: BroadcastRow): Promise<"live" | "sandbox"> {
  const [env] = await db
    .select({ mode: environment.mode })
    .from(environment)
    .where(eq(environment.id, row.environmentId))
    .limit(1);
  return env?.mode ?? "sandbox";
}

/**
 * Stops a broadcast for good: emails nobody claimed yet are dropped (claimed ones still finish).
 * Canceling a canceled broadcast returns it.
 */
export async function cancelBroadcast(
  env: ContactEnvironment,
  id: string,
  opts: { billing?: UsageGate; now?: Date } = {},
): Promise<BroadcastOutput | null> {
  const now = opts.now ?? new Date();
  const row = await getBroadcastRow(env, id);
  if (!row) return null;
  if (row.status === "canceled") return (await toObjects([row]))[0] ?? null;
  if (!["draft", "scheduled", "sending", "paused"].includes(row.status)) {
    throw new BroadcastError(
      "broadcast_not_sendable",
      `A ${row.status} broadcast can't be canceled.`,
    );
  }
  const mode = await modeOf(row);
  const updated = await db.transaction(async (tx) => {
    const [canceled] = await tx
      .update(broadcast)
      .set({ status: "canceled", canceledAt: now, leaseUntil: null, nextRunAt: null })
      .where(and(eq(broadcast.id, row.id), eq(broadcast.status, row.status)))
      .returning();
    if (!canceled) return null;
    await dropUnclaimed(tx, canceled, opts.billing, mode);
    if (row.status !== "draft") await announce(tx, canceled, "broadcast.canceled", now);
    return canceled;
  });
  return updated ? ((await toObjects([updated]))[0] ?? null) : getBroadcast(env, id);
}

/** Pauses a scheduled or sending broadcast (by you): unsent emails are dropped until resumed. */
export async function pauseBroadcast(
  env: ContactEnvironment,
  id: string,
  opts: { billing?: UsageGate; now?: Date } = {},
): Promise<BroadcastOutput | null> {
  const row = await getBroadcastRow(env, id);
  if (!row) return null;
  if (row.status === "paused") return (await toObjects([row]))[0] ?? null;
  if (row.status !== "scheduled" && row.status !== "sending") {
    throw new BroadcastError(
      "broadcast_not_sendable",
      `A ${row.status} broadcast can't be paused.`,
    );
  }
  const paused = await pauseRow(row, "paused", opts);
  return paused ? ((await toObjects([paused]))[0] ?? null) : getBroadcast(env, id);
}

async function pauseRow(
  row: BroadcastRow,
  reason: string,
  opts: { billing?: UsageGate; now?: Date; leaseUntil?: Date },
): Promise<BroadcastRow | null> {
  const now = opts.now ?? new Date();
  const mode = await modeOf(row);
  return db.transaction(async (tx) => {
    const [paused] = await tx
      .update(broadcast)
      .set({ status: "paused", pauseReason: reason, leaseUntil: null, nextRunAt: null })
      .where(
        and(
          eq(broadcast.id, row.id),
          eq(broadcast.status, row.status),
          opts.leaseUntil ? eq(broadcast.leaseUntil, opts.leaseUntil) : undefined,
        ),
      )
      .returning();
    if (!paused) return null;
    const { firstContactId } = await dropUnclaimed(tx, paused, opts.billing, mode);
    const cursor = await rewoundCursor(tx, paused, firstContactId);
    const [rewound] = await tx
      .update(broadcast)
      .set({ cursor })
      .where(eq(broadcast.id, row.id))
      .returning();
    await announce(tx, rewound ?? paused, "broadcast.paused", now);
    return rewound ?? paused;
  });
}

/** Resumes a paused broadcast where it stopped. */
export async function resumeBroadcast(
  env: BroadcastEnvironment,
  id: string,
  opts: { liveProvider: string; now?: Date },
): Promise<BroadcastOutput | null> {
  const now = opts.now ?? new Date();
  const row = await getBroadcastRow(env, id);
  if (!row) return null;
  if (row.status === "scheduled" || row.status === "sending") {
    return (await toObjects([row]))[0] ?? null;
  }
  if (row.status !== "paused") {
    throw new BroadcastError(
      "broadcast_not_sendable",
      `A ${row.status} broadcast can't be resumed.`,
    );
  }
  await checkSendable(env, row, opts.liveProvider);
  const [resumed] = await db
    .update(broadcast)
    .set({
      status: row.startedAt ? "sending" : "scheduled",
      pauseReason: null,
      // Not started yet: it still waits for its scheduled time.
      nextRunAt: !row.startedAt && row.scheduledAt && row.scheduledAt > now ? row.scheduledAt : now,
      leaseUntil: null,
    })
    .where(and(eq(broadcast.id, row.id), eq(broadcast.status, "paused")))
    .returning();
  return resumed ? ((await toObjects([resumed]))[0] ?? null) : getBroadcast(env, id);
}

function contentOf(row: BroadcastRow): BroadcastContent {
  return { subject: row.subject, html: row.html, text: row.text, previewText: row.previewText };
}

/**
 * Sends the broadcast's content to a few addresses (≤ 5) as ordinary marketing emails, filled
 * with `contact`'s values (or the fallbacks). Their email ids.
 */
export async function testBroadcast(
  env: BroadcastEnvironment & { apiKeyId: string | null; apiKeyOwnerId?: string | null },
  id: string,
  input: { to: string[]; contact?: string },
  deps: {
    emailService: Pick<EmailService, "send">;
    /** Called after each email is accepted (callers charge quotas per email: see `testRecipients`). */
    onSent?: (emailId: string) => void;
  },
): Promise<string[] | null> {
  const row = await getBroadcastRow(env, id);
  if (!row) return null;
  const definitions = await propertyDefinitions(env);
  const contact = input.contact ? await getContactRow(env, input.contact) : null;
  const variables = contact
    ? contactVariables(contact, definitions)
    : contactVariables(
        { address: "", firstName: null, lastName: null, properties: {} },
        definitions,
      );
  const content = renderBroadcast(contentOf(row), variables);
  const ids: string[] = [];
  for (const to of testRecipients(input.to)) {
    const { email: sent } = await deps.emailService.send({
      environment: env,
      apiKeyId: env.apiKeyId,
      apiKeyOwnerId: env.apiKeyOwnerId ?? null,
      params: SendEmailRequest.parse({
        from: row.from,
        to,
        ...(row.replyTo.length ? { reply_to: row.replyTo } : {}),
        subject: boundedSubject(`[Test] ${content.subject}`, SUBJECT_MAX_LENGTH),
        ...(content.html ? { html: content.html } : {}),
        ...(content.text ? { text: content.text } : {}),
        stream: "marketing",
        tracking: { opens: false, clicks: false },
      }),
    });
    ids.push(sent.id);
    deps.onSent?.(sent.id);
  }
  return ids;
}

/** The addresses a test send goes to: one email per address, however often it is listed. */
export function testRecipients(to: readonly string[]): string[] {
  return [...new Map(to.map((value) => [addressKey(value), value])).values()];
}

// ---------------------------------------------------------------------------------------------
// The worker's fan-out
// ---------------------------------------------------------------------------------------------

/** A claimed broadcast is not picked up by another worker for this long. */
export const BROADCAST_LEASE_MS = 60_000;
/** Pause between fan-out steps of one broadcast (the batch is sized to its rate over it). */
export const BROADCAST_STEP_MS = 5_000;
/** At most this many of a broadcast's emails wait unclaimed; above it, fan-out waits. */
export const BROADCAST_BACKLOG = 2_000;
export const MAX_BROADCAST_BATCH = 500;
/** A broadcast whose screening keeps failing gives up after this long. */
export const BROADCAST_SCREENING_GIVE_UP_MS = 60 * 60_000;

export type BroadcastWorkerDeps = {
  /** Where its emails go to be dispatched (the marketing queue). */
  queue: EmailDispatchQueue;
  /** The live provider's name (for `authorizeLiveSender`). */
  liveProvider: string;
  billing?: UsageGate;
  /**
   * Charges `count` recipients to the organization's marketing pace (`@coss/ratelimit`): the
   * worker passes `email.marketing.recipients.second` + `email.recipients.day`. Unset: unthrottled.
   */
  throttle?: (input: {
    organizationId: string;
    count: number;
  }) => Promise<{ allowed: boolean; retryAfterMs: number | null }>;
  /** Gives back what `throttle` charged for recipients a step didn't make emails for. */
  refundThrottle?: (input: { organizationId: string; count: number }) => Promise<void>;
  /** Content screening (`screenMessage`), once per live broadcast. */
  screen?: (input: ScreenInput) => Promise<ScreenOutcome>;
  screeningImages?: ScreeningImageLoader;
  /** The plan's marketing rate (recipients per second) of an organization. */
  planRate?: (organizationId: string) => Promise<number>;
};

/** Pause reasons the worker lifts on its own once the cause is gone (others wait for Resume). */
const SELF_HEALING = new Set(["billing_hold", "budget_exceeded", "sending_paused", "usage_limit"]);

/**
 * System-level (worker): advances every due broadcast by one step: scheduled ones start (screened
 * once, content and target frozen), sending ones make their next batch of emails. Returns how
 * many it advanced. `scope` limits the scan to some organizations (tests).
 */
export async function runDueBroadcasts(
  deps: BroadcastWorkerDeps,
  opts: { now?: Date; limit?: number; scope?: { organizationIds: string[] } } = {},
): Promise<number> {
  const now = opts.now ?? new Date();
  const claimable = and(
    inArray(broadcast.status, ["scheduled", "sending"]),
    lte(broadcast.nextRunAt, now),
    or(isNull(broadcast.leaseUntil), lt(broadcast.leaseUntil, now)),
  );
  const due = await db
    .select({ id: broadcast.id })
    .from(broadcast)
    .where(
      and(
        claimable,
        opts.scope ? inArray(broadcast.organizationId, opts.scope.organizationIds) : undefined,
      ),
    )
    .orderBy(asc(broadcast.nextRunAt))
    .limit(opts.limit ?? 10);
  let advanced = 0;
  for (const { id } of due) {
    const lease = new Date(now.getTime() + BROADCAST_LEASE_MS);
    const [claimed] = await db
      .update(broadcast)
      .set({ leaseUntil: lease })
      .where(and(claimable, eq(broadcast.id, id)))
      .returning();
    if (!claimed) continue;
    try {
      await step(claimed, lease, deps, now);
      advanced++;
    } catch (error) {
      console.error(`[email:broadcasts] ${id} failed a step:`, error);
      // Give the lease back after a short wait, so the next run retries.
      await db
        .update(broadcast)
        .set({ leaseUntil: null, nextRunAt: new Date(now.getTime() + BROADCAST_STEP_MS) })
        .where(and(eq(broadcast.id, id), eq(broadcast.leaseUntil, lease)));
    }
  }
  return advanced;
}

/** Ends the step: writes `values` and releases the lease, only while this worker holds it. */
async function finishStep(
  executor: Executor,
  row: BroadcastRow,
  lease: Date,
  values: Partial<typeof broadcast.$inferInsert>,
): Promise<BroadcastRow | null> {
  const [updated] = await executor
    .update(broadcast)
    .set({ ...values, leaseUntil: null })
    .where(and(eq(broadcast.id, row.id), eq(broadcast.leaseUntil, lease)))
    .returning();
  return updated ?? null;
}

/** Fails the broadcast; the emails nobody claimed yet are dropped with it, as on a cancel. */
async function failBroadcast(
  row: BroadcastRow,
  lease: Date,
  error: { code: string; message: string },
  now: Date,
  billing: UsageGate | undefined,
): Promise<void> {
  const mode = await modeOf(row);
  await db.transaction(async (tx) => {
    const failed = await finishStep(tx, row, lease, {
      status: "failed",
      errorCode: error.code,
      errorMessage: error.message,
      completedAt: now,
      nextRunAt: null,
    });
    if (!failed) return;
    await dropUnclaimed(tx, failed, billing, mode);
    await announce(tx, failed, "broadcast.failed", now);
  });
}

/** Why the organization can't send marketing now (a pause reason), or `null`. */
async function blockedReason(row: BroadcastRow, mode: "live" | "sandbox", liveProvider: string) {
  if (!(await getMarketingSettingsRow(envOf(row)))?.mailingAddress) {
    return "mailing_address_required";
  }
  if (mode !== "live") return null;
  try {
    await authorizeLiveSender({
      organizationId: row.organizationId,
      from: row.from,
      provider: liveProvider,
      stream: "marketing",
    });
    await assertWithinBudget({
      organizationId: row.organizationId,
      projectId: row.projectId,
      apiKeyId: row.apiKeyId,
      userId: row.apiKeyOwnerId,
    });
    return null;
  } catch (error) {
    if (error instanceof EmailError) return error.code;
    throw error;
  }
}

async function step(
  row: BroadcastRow,
  lease: Date,
  deps: BroadcastWorkerDeps,
  now: Date,
): Promise<void> {
  const mode = await modeOf(row);
  const blocked = await blockedReason(row, mode, deps.liveProvider);
  if (blocked === "domain_not_verified") {
    await failBroadcast(
      row,
      lease,
      {
        code: "domain_not_verified",
        message: `${row.from} is not on a verified domain of this organization.`,
      },
      now,
      deps.billing,
    );
    return;
  }
  if (blocked) {
    // Held: self-healing causes are retried in a minute; the rest wait for a Resume. Either way
    // the emails nobody claimed yet are dropped and remade later (a billing hold or a paused
    // tenant must stop the queue too, not only new fan-out).
    if (SELF_HEALING.has(blocked)) {
      await db.transaction(async (tx) => {
        const held = await finishStep(tx, row, lease, {
          pauseReason: blocked,
          nextRunAt: new Date(now.getTime() + 60_000),
        });
        if (!held) return;
        const { firstContactId } = await dropUnclaimed(tx, held, deps.billing, mode);
        if (firstContactId) {
          await tx
            .update(broadcast)
            .set({ cursor: await rewoundCursor(tx, held, firstContactId) })
            .where(eq(broadcast.id, row.id));
        }
      });
    } else {
      await pauseRow(row, blocked, { billing: deps.billing, now, leaseUntil: lease });
    }
    return;
  }

  try {
    if (row.status === "scheduled") await start(row, lease, deps, mode, now);
    else await fanOut(row, lease, deps, mode, now);
  } catch (error) {
    // Its audience, segment or topic is gone (deleted despite the check, in a race).
    if (!(error instanceof ContactError)) throw error;
    await failBroadcast(
      row,
      lease,
      { code: "target_unavailable", message: error.message },
      now,
      deps.billing,
    );
  }
}

/** Screens the content once, freezes the target, and moves to `sending`. */
async function start(
  row: BroadcastRow,
  lease: Date,
  deps: BroadcastWorkerDeps,
  mode: "live" | "sandbox",
  now: Date,
): Promise<void> {
  if (mode === "live" && deps.screen && row.screeningStatus !== "passed") {
    let outcome: ScreenOutcome | null = null;
    try {
      const preview = renderBroadcast(contentOf(row), {});
      outcome = await deps.screen({
        organizationId: row.organizationId,
        environmentId: row.environmentId,
        product: "broadcast",
        subjectId: row.id,
        force: true,
        retry: row.screeningStatus === "held",
        content: (signal) =>
          loadEmailScreeningContent({ from: row.from, ...preview }, signal, deps.screeningImages),
        onBlock: (tx, at) => recordScreeningDomainBlock(tx, row, at),
      });
    } catch (error) {
      console.error(`[email:broadcasts] screening ${row.id} failed:`, error);
    }
    if (!outcome || (outcome.action === "block" && outcome.screening?.verdict === "error")) {
      // Never sent unscreened: retried every minute, given up an hour after the first failure
      // (not after `scheduled_at`: a broadcast that starts late still gets its retries).
      const heldAt = row.screeningHeldAt ?? now;
      if (now.getTime() - heldAt.getTime() > BROADCAST_SCREENING_GIVE_UP_MS) {
        await failBroadcast(
          row,
          lease,
          {
            code: "content_screening_unavailable",
            message: "The broadcast couldn't be screened, so it wasn't sent.",
          },
          now,
          deps.billing,
        );
      } else {
        await finishStep(db, row, lease, {
          screeningStatus: "held",
          screeningHeldAt: heldAt,
          nextRunAt: new Date(now.getTime() + 60_000),
        });
      }
      return;
    }
    if (outcome.action === "block") {
      // `screenMessage` has suspended the organization in the verdict's transaction.
      await db
        .update(broadcast)
        .set({ screeningStatus: "blocked" })
        .where(eq(broadcast.id, row.id));
      await failBroadcast(
        row,
        lease,
        { code: "content_rejected", message: "The broadcast was blocked by content screening." },
        now,
        deps.billing,
      );
      return;
    }
  }
  const target = targetOf(row);
  const upperBound = newId(ID_PREFIXES.contact, now.getTime());
  const estimated = await countRecipients(envOf(row), target, {
    topic: row.topic,
    before: upperBound,
  });
  await db.transaction(async (tx) => {
    const started = await finishStep(tx, row, lease, {
      status: "sending",
      screeningStatus: "passed",
      startedAt: now,
      contactUpperBound: upperBound,
      recipientsEstimated: estimated,
      pauseReason: null,
      nextRunAt: now,
    });
    if (started) await announce(tx, started, "broadcast.sending", now);
  });
}

function targetOf(row: BroadcastRow): RecipientTarget {
  return row.audienceId ? { audienceId: row.audienceId } : { segmentId: row.segmentId as string };
}

/** Makes the next batch of emails (or finishes the broadcast). */
async function fanOut(
  row: BroadcastRow,
  lease: Date,
  deps: BroadcastWorkerDeps,
  mode: "live" | "sandbox",
  now: Date,
): Promise<void> {
  const later = (ms: number) => new Date(now.getTime() + ms);
  const [waiting] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(email)
    .where(
      and(
        eq(email.organizationId, row.organizationId),
        eq(email.broadcastId, row.id),
        eq(email.status, "queued"),
      ),
    );
  const backlog = waiting?.count ?? 0;
  if (backlog >= BROADCAST_BACKLOG) {
    await finishStep(db, row, lease, { nextRunAt: later(BROADCAST_STEP_MS) });
    return;
  }
  const planRate = deps.planRate ? await deps.planRate(row.organizationId) : 10;
  const rate = Math.max(1, Math.min(row.ratePerSecond ?? planRate, planRate));
  const size = Math.min(MAX_BROADCAST_BATCH, rate * (BROADCAST_STEP_MS / 1000));
  const env = envOf(row);
  const page = await resolveRecipients(env, targetOf(row), {
    topic: row.topic,
    before: row.contactUpperBound ?? undefined,
    after: row.cursor ?? undefined,
    limit: size,
  });
  if (page.recipients.length === 0) {
    if (backlog === 0) {
      await db.transaction(async (tx) => {
        const sent = await finishStep(tx, row, lease, {
          status: "sent",
          pauseReason: null,
          completedAt: now,
          nextRunAt: null,
        });
        if (sent) await announce(tx, sent, "broadcast.sent", now);
      });
    } else {
      await finishStep(db, row, lease, { nextRunAt: later(BROADCAST_STEP_MS) });
    }
    return;
  }
  let recipients = page.recipients;
  let charged = 0;
  if (mode === "live" && deps.throttle) {
    for (;;) {
      const decision = await deps.throttle({
        organizationId: row.organizationId,
        count: recipients.length,
      });
      if (decision.allowed) {
        charged = recipients.length;
        break;
      }
      // Larger than the bucket (a lower override than the plan's rate): a smaller batch.
      if (decision.retryAfterMs === null && recipients.length > 1) {
        recipients = recipients.slice(0, Math.ceil(recipients.length / 2));
        continue;
      }
      await finishStep(db, row, lease, {
        nextRunAt: later(Math.max(decision.retryAfterMs ?? BROADCAST_STEP_MS, 1000)),
      });
      return;
    }
  }
  const keys = templateKeys(row.subject, row.html, row.text);
  const definitions = await propertyDefinitions(env);
  // Only the emails a committed step made use the pace: the rest of the charge (contacts that
  // already had one after a rewind, or a step that didn't commit) is given back.
  let made = 0;
  try {
    for (;;) {
      const last = recipients.at(-1) as ContactRecipient;
      try {
        made = await db.transaction(async (tx) => {
          // Fenced: a worker whose lease was taken over inserts nothing.
          const [owned] = await tx
            .select({ id: broadcast.id })
            .from(broadcast)
            .where(and(eq(broadcast.id, row.id), eq(broadcast.leaseUntil, lease)))
            .for("update");
          if (!owned) return 0;
          const inserted = await insertEmails(tx, row, recipients, keys, definitions, now);
          if (mode === "live" && inserted.length > 0) {
            await deps.billing?.reserve(tx, {
              organizationId: row.organizationId,
              meter: "email.recipients",
              quantity: inserted.length,
            });
          }
          for (const created of inserted) {
            await deps.queue.enqueue(tx, {
              organizationId: row.organizationId,
              emailId: created.id,
              stream: "marketing",
            });
          }
          await bumpBroadcastStats(tx, {
            broadcastId: row.id,
            organizationId: row.organizationId,
            field: "recipients",
            counts: shardCounts(inserted.map((created) => created.id)),
          });
          await finishStep(tx, row, lease, {
            cursor: last.id,
            pauseReason: null,
            materialized: sql`${broadcast.materialized} + ${inserted.length}` as unknown as number,
            nextRunAt: later(BROADCAST_STEP_MS),
          });
          return inserted.length;
        });
        break;
      } catch (error) {
        if ((error as { code?: string }).code !== "usage_limit_exceeded") throw error;
        // Less allowance left than the batch: a smaller one may still fit.
        if (recipients.length > 1) {
          recipients = recipients.slice(0, Math.ceil(recipients.length / 2));
          continue;
        }
        await finishStep(db, row, lease, { pauseReason: "usage_limit", nextRunAt: later(60_000) });
        return;
      }
    }
  } finally {
    if (charged > made) {
      await deps.refundThrottle?.({ organizationId: row.organizationId, count: charged - made });
    }
  }
}

/** One email per contact (skipping contacts that already have one), with its recipient row. */
async function insertEmails(
  tx: Transaction,
  row: BroadcastRow,
  recipients: ContactRecipient[],
  keys: string[],
  definitions: Awaited<ReturnType<typeof propertyDefinitions>>,
  now: Date,
): Promise<{ id: string; contactId: string | null }[]> {
  const tracked = row.trackOpens || row.trackClicks;
  // As for any send, the environment's content storage when the email is made.
  const storeContent = await resolveStoreContent(tx, row);
  const rows = recipients.map((recipient) => {
    const all = contactVariables(recipient, definitions);
    const variables = Object.fromEntries(keys.map((key) => [key, all[key] ?? ""]));
    return {
      id: newId(ID_PREFIXES.email, now.getTime()),
      organizationId: row.organizationId,
      projectId: row.projectId,
      environmentId: row.environmentId,
      apiKeyId: row.apiKeyId,
      apiKeyOwnerId: row.apiKeyOwnerId,
      status: "queued" as const,
      from: row.from,
      to: [recipient.address],
      replyTo: row.replyTo,
      // Only the subject is stored (the body is rendered at dispatch), within a send's limit.
      subject: boundedSubject(
        renderTemplate(row.subject, variables, "subject"),
        SUBJECT_MAX_LENGTH,
      ),
      html: null,
      text: null,
      category: row.topic,
      stream: "marketing" as const,
      trackOpens: row.trackOpens,
      trackClicks: row.trackClicks,
      trackingToken: tracked ? newTrackingToken() : null,
      broadcastId: row.id,
      contactId: recipient.id,
      variables,
      storeContent,
      createdAt: now,
      updatedAt: now,
    };
  });
  const inserted = await tx
    .insert(email)
    .values(rows)
    .onConflictDoNothing({
      target: [email.broadcastId, email.contactId],
      where: sql`${email.broadcastId} is not null`,
    })
    .returning({ id: email.id, contactId: email.contactId, to: email.to });
  if (inserted.length > 0) {
    await tx.insert(emailRecipient).values(
      inserted.map((created) => ({
        organizationId: row.organizationId,
        emailId: created.id,
        address: (created.to[0] as string).toLowerCase(),
        kind: "to" as const,
        position: 0,
      })),
    );
  }
  return inserted;
}
