/**
 * Signature requests: created (as a `draft`, or sent at once) from uploaded or inline documents,
 * with their signers and fields, in one transaction with the first events of their audit trail.
 * Reads return the latest shape (`SignRequestObject`).
 */
import { BUDGET_EXCEEDED_MESSAGES, budgetHoldFor, isOnBillingHold } from "@coss/billing/metering";
import { db, type Executor, schema, type Transaction } from "@coss/db";
import { ID_PREFIXES, isId, newId } from "@coss/db/id";
import {
  requestHash as hashRequest,
  IDEMPOTENCY_KEY_TTL_MS,
  type IdempotencyErrors,
  withIdempotencyKey,
} from "@coss/db/idempotency";
import { and, asc, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import {
  deleteSignDocument,
  discardUnstoredDocuments,
  environmentDocuments,
  type PreparedDocument,
  prepareDocument,
  type SignDocumentRow,
  type SignEnvironment,
  uploadSignDocument,
} from "./documents.ts";
import { SignError } from "./errors.ts";
import { type SignActor, toSignEventObject } from "./events.ts";
import {
  checkFieldCount,
  type FieldDocument,
  type PlacedField,
  placeSignerFields,
} from "./fields.ts";
import { recordSignEvent } from "./record.ts";
import {
  type CreateSignRequestRequestOutput,
  DEFAULT_SIGN_LIST_LIMIT,
  MAX_SIGN_EXPIRY_DAYS,
  MAX_SIGN_LIST_LIMIT,
  type SignDocumentObjectOutput,
  type SignEventObjectOutput,
  type SignRequestObjectOutput,
  type SignRequestStatus,
  type SignTemplateObjectOutput,
} from "./schemas.ts";
import { getSignSettings } from "./settings.ts";
import type { DocumentStore } from "./store.ts";
import { removeStoreObjects, scheduleStoreCleanup } from "./store-cleanup.ts";
import { createSignTemplate, updateSignTemplate } from "./templates.ts";

const {
  environment,
  signDocument,
  signEvent,
  signField,
  signRequest,
  signRequestDocument,
  signSigner,
} = schema;

export type SignRequestRow = typeof signRequest.$inferSelect;
type SignerRow = typeof signSigner.$inferSelect;
type FieldRow = typeof signField.$inferSelect;
type RequestDocumentRow = Pick<SignDocumentRow, "id" | "filename" | "sha256" | "pages">;

const DAY_MS = 24 * 60 * 60 * 1000;

const IDEMPOTENCY_ERRORS: IdempotencyErrors = {
  inProgress: () =>
    new SignError("request_in_progress", "This idempotency key is busy. Retry shortly."),
  reused: () =>
    new SignError(
      "idempotency_key_reused",
      "This idempotency key was already used with a different request body.",
    ),
};

export type CreateSignRequestInput = {
  environment: SignEnvironment;
  apiKeyId: string | null;
  actor: SignActor;
  params: CreateSignRequestRequestOutput;
  idempotencyKey?: string | null;
  /** Internal (templates): prefilled values by signer and field input index, and the template. */
  prefill?: readonly (readonly (string | null)[])[];
  templateId?: string | null;
  /** What the idempotency hash covers when not `params` (the template request as sent). */
  hashSource?: unknown;
};

/** The operations that write documents' bytes, bound to the deployment's document store. */
export type SignService = {
  readonly store: DocumentStore;
  create(
    input: CreateSignRequestInput,
  ): Promise<{ request: SignRequestObjectOutput; replayed: boolean }>;
  /**
   * The request an earlier call with this idempotency key and the same `hashSource` created, if
   * it is still replayable: lets callers replay before validating what may have changed since
   * (a template edited after its request was made).
   */
  replay(input: {
    environment: SignEnvironment;
    idempotencyKey?: string | null;
    hashSource: unknown;
  }): Promise<{ request: SignRequestObjectOutput; replayed: true } | null>;
  uploadDocument(
    input: Parameters<typeof uploadSignDocument>[1],
  ): Promise<SignDocumentObjectOutput>;
  deleteDocument(input: Parameters<typeof deleteSignDocument>[1]): Promise<void>;
  deleteRequest(input: Parameters<typeof deleteSignRequest>[1]): Promise<void>;
  createTemplate(
    input: Parameters<typeof createSignTemplate>[1],
  ): Promise<SignTemplateObjectOutput>;
  updateTemplate(
    input: Parameters<typeof updateSignTemplate>[1],
  ): Promise<SignTemplateObjectOutput>;
};

export type SignServiceOptions = {
  store: DocumentStore;
  /** The clock, for tests. */
  now?: () => Date;
};

function notFound(): SignError {
  return new SignError(
    "not_found",
    "No signature request with this id exists in this environment.",
  );
}

function documentHashes(
  documents: readonly { id: string; sha256: string }[],
): Record<string, string> {
  return Object.fromEntries(documents.map((document) => [document.id, document.sha256]));
}

export function toSignRequestObject(
  row: SignRequestRow,
  documents: readonly RequestDocumentRow[],
  signers: readonly SignerRow[],
  fields: readonly FieldRow[],
  sandbox: boolean,
): SignRequestObjectOutput {
  return {
    object: "sign_request",
    id: row.id,
    status: row.status,
    title: row.title,
    message: row.message,
    signing_order: row.signingOrder,
    documents: documents.map((document) => ({
      id: document.id,
      filename: document.filename,
      sha256: document.sha256,
      page_count: document.pages.length,
    })),
    signers: signers.map((signer) => ({
      object: "sign_signer",
      id: signer.id,
      name: signer.name,
      email: signer.email,
      order: signer.position,
      delivery: signer.delivery,
      authentication: signer.authentication,
      status: signer.status,
      client_ref: signer.clientRef,
      viewed_at: signer.viewedAt?.toISOString() ?? null,
      signed_at: signer.signedAt?.toISOString() ?? null,
      declined_at: signer.declinedAt?.toISOString() ?? null,
      decline_reason: signer.declineReason,
    })),
    fields: fields.map((field) => ({
      object: "sign_field",
      id: field.id,
      signer_id: field.signerId,
      document_id: field.documentId,
      type: field.type,
      page: field.page,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      required: field.required,
      label: field.label,
      anchor: field.anchor,
    })),
    metadata: row.metadata,
    sandbox,
    reminder_interval_days: row.reminderIntervalDays,
    expires_at: row.expiresAt?.toISOString() ?? null,
    expired_at: row.expiredAt?.toISOString() ?? null,
    sent_at: row.sentAt?.toISOString() ?? null,
    completed_at: row.completedAt?.toISOString() ?? null,
    canceled_at: row.canceledAt?.toISOString() ?? null,
    declined_at: row.declinedAt?.toISOString() ?? null,
    signed_document:
      row.signedDocumentSha256 && row.sealedAt
        ? { sha256: row.signedDocumentSha256, sealed_at: row.sealedAt.toISOString() }
        : null,
    created_at: row.createdAt.toISOString(),
  };
}

/** Loads the children of these requests and builds their objects, in the given order. */
async function toObjects(
  rows: readonly SignRequestRow[],
  sandbox: boolean,
): Promise<SignRequestObjectOutput[]> {
  if (rows.length === 0) return [];
  const organizationId = rows[0]?.organizationId ?? "";
  const ids = rows.map((row) => row.id);
  const [documents, signers, fields] = await Promise.all([
    db
      .select({
        requestId: signRequestDocument.requestId,
        id: signDocument.id,
        filename: signDocument.filename,
        sha256: signDocument.sha256,
        pages: signDocument.pages,
      })
      .from(signRequestDocument)
      .innerJoin(
        signDocument,
        and(
          eq(signDocument.id, signRequestDocument.documentId),
          eq(signDocument.organizationId, signRequestDocument.organizationId),
        ),
      )
      .where(
        and(
          eq(signRequestDocument.organizationId, organizationId),
          inArray(signRequestDocument.requestId, ids),
        ),
      )
      .orderBy(asc(signRequestDocument.position)),
    db
      .select()
      .from(signSigner)
      .where(and(eq(signSigner.organizationId, organizationId), inArray(signSigner.requestId, ids)))
      .orderBy(asc(signSigner.position), asc(signSigner.id)),
    db
      .select()
      .from(signField)
      .where(and(eq(signField.organizationId, organizationId), inArray(signField.requestId, ids)))
      .orderBy(asc(signField.id)),
  ]);
  return rows.map((row) =>
    toSignRequestObject(
      row,
      documents.filter((document) => document.requestId === row.id),
      signers.filter((signer) => signer.requestId === row.id),
      fields.filter((field) => field.requestId === row.id),
      sandbox,
    ),
  );
}

async function environmentIsSandbox(scope: {
  organizationId: string;
  environmentId: string;
}): Promise<boolean> {
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

function requestScope(input: { organizationId: string; environmentId: string; requestId: string }) {
  return and(
    eq(signRequest.id, input.requestId),
    eq(signRequest.organizationId, input.organizationId),
    eq(signRequest.environmentId, input.environmentId),
  );
}

export async function getSignRequest(input: {
  organizationId: string;
  environmentId: string;
  requestId: string;
}): Promise<SignRequestObjectOutput> {
  if (!isId(ID_PREFIXES.signRequest, input.requestId)) throw notFound();
  const [row] = await db.select().from(signRequest).where(requestScope(input)).limit(1);
  if (!row) throw notFound();
  const [object] = await toObjects([row], await environmentIsSandbox(input));
  if (!object) throw notFound();
  return object;
}

export async function listSignRequests(input: {
  organizationId: string;
  environmentId: string;
  status?: SignRequestStatus[];
  limit?: number;
  after?: string;
}): Promise<{ data: SignRequestObjectOutput[]; hasMore: boolean }> {
  const limit = Math.min(input.limit ?? DEFAULT_SIGN_LIST_LIMIT, MAX_SIGN_LIST_LIMIT);
  const scope = and(
    eq(signRequest.organizationId, input.organizationId),
    eq(signRequest.environmentId, input.environmentId),
    input.status && input.status.length > 0 ? inArray(signRequest.status, input.status) : undefined,
  );
  let cursor: SQL | undefined;
  if (input.after) {
    if (!isId(ID_PREFIXES.signRequest, input.after)) return { data: [], hasMore: false };
    const [anchor] = await db
      .select({ id: signRequest.id, createdAt: signRequest.createdAt })
      .from(signRequest)
      .where(
        and(
          eq(signRequest.organizationId, input.organizationId),
          eq(signRequest.environmentId, input.environmentId),
          eq(signRequest.id, input.after),
        ),
      )
      .limit(1);
    if (!anchor) return { data: [], hasMore: false };
    // Compared in SQL: a JavaScript Date would cut the anchor's microseconds off.
    cursor = sql`(${signRequest.createdAt}, ${signRequest.id}) < (select ${signRequest.createdAt}, ${signRequest.id} from ${signRequest} where ${signRequest.id} = ${anchor.id})`;
  }
  const rows = await db
    .select()
    .from(signRequest)
    .where(and(scope, cursor))
    .orderBy(desc(signRequest.createdAt), desc(signRequest.id))
    .limit(limit + 1);
  return {
    data: await toObjects(rows.slice(0, limit), await environmentIsSandbox(input)),
    hasMore: rows.length > limit,
  };
}

/** The request's audit trail, oldest first. */
export async function listSignRequestEvents(input: {
  organizationId: string;
  environmentId: string;
  requestId: string;
}): Promise<SignEventObjectOutput[]> {
  if (!isId(ID_PREFIXES.signRequest, input.requestId)) throw notFound();
  const [row] = await db
    .select({ id: signRequest.id })
    .from(signRequest)
    .where(requestScope(input))
    .limit(1);
  if (!row) throw notFound();
  const events = await db
    .select()
    .from(signEvent)
    .where(and(eq(signEvent.requestId, row.id), eq(signEvent.organizationId, input.organizationId)))
    .orderBy(asc(signEvent.sequence));
  return events.map(toSignEventObject);
}

/** Moves a request between statuses with its event, or returns why it can't. */
async function transition(
  input: { organizationId: string; environmentId: string; requestId: string; actor: SignActor },
  change: {
    from: readonly SignRequestStatus[];
    /** Already there: returned as is (a retried call). */
    done: SignRequestStatus;
    set: (now: Date) => Partial<SignRequestRow>;
    event: "sent" | "canceled";
    refused: (status: SignRequestStatus) => SignError;
    /** Throws when the locked row can't make this change after all. */
    check?: (row: { expiresAt: Date | null }) => void;
  },
  now: Date,
): Promise<SignRequestObjectOutput> {
  if (!isId(ID_PREFIXES.signRequest, input.requestId)) throw notFound();
  const sandbox = await environmentIsSandbox(input);
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(signRequest).where(requestScope(input)).for("update");
    if (!row) throw notFound();
    if (row.status === change.done) return;
    if (!change.from.includes(row.status)) throw change.refused(row.status);
    change.check?.(row);
    const [updated] = await tx
      .update(signRequest)
      .set(change.set(now))
      .where(requestScope(input))
      .returning();
    await recordSignEvent(
      tx,
      { request: updated ?? row, sandbox },
      { type: change.event, actor: input.actor, occurredAt: now },
    );
  });
  return getSignRequest(input);
}

/** A live request is usage once sealed, and its emails cost before that. */
async function refuseWhileHeld(
  source: { organizationId: string; projectId: string },
  executor: Executor = db,
): Promise<void> {
  if (await isOnBillingHold(source.organizationId, executor)) {
    throw new SignError(
      "billing_hold",
      "New live signature requests are paused: your organization has an overdue invoice or " +
        "reached its spend limit. Sandbox keys still work.",
    );
  }
  const held = await budgetHoldFor(source, executor);
  if (held) throw new SignError("budget_exceeded", BUDGET_EXCEEDED_MESSAGES[held]);
}

export async function sendSignRequest(
  input: { organizationId: string; environmentId: string; requestId: string; actor: SignActor },
  now: Date = new Date(),
): Promise<SignRequestObjectOutput> {
  if (!(await environmentIsSandbox(input))) {
    const [found] = await db
      .select({ projectId: signRequest.projectId, status: signRequest.status })
      .from(signRequest)
      .where(requestScope(input))
      .limit(1);
    // A request already sent is returned as it is.
    if (found?.status === "draft") {
      await refuseWhileHeld({ organizationId: input.organizationId, projectId: found.projectId });
    }
  }
  return transition(
    input,
    {
      from: ["draft"],
      done: "sent",
      set: (at) => ({ status: "sent", sentAt: at }),
      event: "sent",
      refused: (status) =>
        new SignError("request_not_draft", `Only drafts can be sent; this request is ${status}.`),
      // Sent past its expiry, it would be expired on arrival.
      check: (row) => {
        if (row.expiresAt && row.expiresAt <= now) {
          throw new SignError(
            "invalid_expiry",
            "This draft's expires_at has passed: create the request again with a later one.",
            { param: "expires_at" },
          );
        }
      },
    },
    now,
  );
}

export async function cancelSignRequest(
  input: { organizationId: string; environmentId: string; requestId: string; actor: SignActor },
  now: Date = new Date(),
): Promise<SignRequestObjectOutput> {
  return transition(
    input,
    {
      from: ["draft", "sent"],
      done: "canceled",
      set: (at) => ({ status: "canceled", canceledAt: at }),
      event: "canceled",
      refused: (status) =>
        new SignError("request_not_cancelable", `A ${status} request can't be canceled.`),
    },
    now,
  );
}

function checkExpiry(expiresAt: string | undefined, now: Date): Date | null {
  if (!expiresAt) return null;
  const at = new Date(expiresAt);
  if (at.getTime() <= now.getTime()) {
    throw new SignError("invalid_expiry", "`expires_at` must be in the future.", {
      param: "expires_at",
    });
  }
  if (at.getTime() - now.getTime() > MAX_SIGN_EXPIRY_DAYS * DAY_MS) {
    throw new SignError(
      "invalid_expiry",
      `\`expires_at\` must be at most ${MAX_SIGN_EXPIRY_DAYS} days ahead.`,
      { param: "expires_at" },
    );
  }
  return at;
}

function checkSigners(params: CreateSignRequestRequestOutput): void {
  const seen = new Set<string>();
  for (const [index, signer] of params.signers.entries()) {
    const email = signer.email.toLowerCase();
    if (seen.has(email)) {
      throw new SignError("invalid_signers", `${signer.email} is listed twice.`, {
        param: `signers[${index}].email`,
      });
    }
    seen.add(email);
  }
}

export function createSignService(opts: SignServiceOptions): SignService {
  const clock = opts.now ?? (() => new Date());

  async function create(
    input: CreateSignRequestInput,
  ): Promise<{ request: SignRequestObjectOutput; replayed: boolean }> {
    const { environment: env, params } = input;
    const now = clock();
    // `expires_at` is checked against the clock only for a new request (inside `insert`): a replay
    // of the same key and body returns the original even once that time has passed.
    const expiresAt = params.expires_at ? new Date(params.expires_at) : null;
    checkSigners(params);

    // Uploaded documents must be the environment's; inline ones are checked and stored first.
    const referenced = params.documents.flatMap((document) =>
      "document_id" in document ? [document.document_id] : [],
    );
    const existing = await environmentDocuments(db, env, referenced);
    for (const [index, document] of params.documents.entries()) {
      if ("document_id" in document && !existing.some((row) => row.id === document.document_id)) {
        throw new SignError(
          "not_found",
          `No document ${document.document_id} exists in this environment.`,
          {
            param: `documents[${index}].document_id`,
          },
        );
      }
    }
    if (new Set(referenced).size !== referenced.length) {
      throw new SignError("invalid_document", "A document is listed twice.", {
        param: "documents",
      });
    }
    const inline: PreparedDocument[] = [];
    // Once a request holding the inline documents commits, their bytes are its.
    let committed = false;
    try {
      for (const document of params.documents) {
        if ("content" in document) {
          inline.push(
            await prepareDocument(opts.store, env, {
              filename: document.filename,
              content: document.content,
              apiKeyId: input.apiKeyId,
            }),
          );
        }
      }
      const ordered: (FieldDocument & { sha256: string })[] = [];
      let nextInline = 0;
      for (const document of params.documents) {
        const row =
          "document_id" in document
            ? existing.find((candidate) => candidate.id === document.document_id)
            : inline[nextInline++];
        if (!row) throw new Error("document missing after upload");
        ordered.push({
          id: row.id,
          pages: row.pages,
          anchors: row.anchors ?? [],
          sha256: row.sha256,
        });
      }

      const signers = params.signers.map((signer, index) => ({
        id: newId(ID_PREFIXES.signSigner),
        input: signer,
        fields: placeSignerFields(signer.fields, ordered, `signers[${index}]`, {
          values: input.prefill?.[index],
        }),
      }));
      checkFieldCount(signers.reduce((total, signer) => total + signer.fields.length, 0));

      const send = params.send ?? true;
      const reminderIntervalDays =
        params.reminder_interval_days === undefined
          ? (await getSignSettings(env)).reminderIntervalDays
          : params.reminder_interval_days;
      const idempotencyKey = input.idempotencyKey ?? null;
      const requestHash = idempotencyKey ? hashRequest(input.hashSource ?? params) : null;

      const insert = async (tx: Transaction): Promise<SignRequestRow | undefined> => {
        const [row] = await tx
          .insert(signRequest)
          .values({
            organizationId: env.organizationId,
            projectId: env.projectId,
            environmentId: env.environmentId,
            apiKeyId: input.apiKeyId,
            status: send ? "sent" : "draft",
            title: params.title,
            message: params.message ?? null,
            signingOrder: params.signing_order ?? "parallel",
            metadata: params.metadata ?? {},
            idempotencyKey,
            requestHash,
            expiresAt,
            reminderIntervalDays,
            templateId: input.templateId ?? null,
            sentAt: send ? now : null,
            createdAt: now,
          })
          .onConflictDoNothing({ target: [signRequest.environmentId, signRequest.idempotencyKey] })
          .returning();
        // A replay (the key's row exists) returns before this; a new request rolls back here.
        if (!row) return undefined;
        // Only a new request: a replay of one already made (no row here) still answers with it.
        if (env.mode === "live") {
          await refuseWhileHeld(
            { organizationId: env.organizationId, projectId: env.projectId },
            tx,
          );
        }
        checkExpiry(params.expires_at, now);
        if (inline.length > 0) await tx.insert(signDocument).values(inline);
        await tx.insert(signRequestDocument).values(
          ordered.map((document, position) => ({
            requestId: row.id,
            documentId: document.id,
            organizationId: env.organizationId,
            position,
          })),
        );
        await tx.insert(signSigner).values(
          signers.map((signer, index) => ({
            id: signer.id,
            organizationId: env.organizationId,
            requestId: row.id,
            name: signer.input.name,
            email: signer.input.email,
            position: signer.input.order ?? index + 1,
            delivery: signer.input.delivery ?? "email",
            authentication:
              (signer.input.delivery ?? "email") === "email"
                ? ("email_link" as const)
                : ("customer_asserted" as const),
            clientRef: signer.input.client_ref ?? null,
          })),
        );
        const fields = signers.flatMap((signer) =>
          signer.fields.map((field: PlacedField) => ({
            ...field,
            organizationId: env.organizationId,
            requestId: row.id,
            signerId: signer.id,
          })),
        );
        if (fields.length > 0) await tx.insert(signField).values(fields);
        const context = { request: row, sandbox: env.mode === "sandbox" };
        await recordSignEvent(tx, context, {
          type: "created",
          actor: input.actor,
          details: { document_sha256: documentHashes(ordered) },
          occurredAt: now,
        });
        if (send) {
          await recordSignEvent(tx, context, { type: "sent", actor: input.actor, occurredAt: now });
        }
        return row;
      };

      let row: SignRequestRow;
      let replayed = false;
      if (!idempotencyKey) {
        const inserted = await db.transaction(insert);
        if (!inserted) throw new Error("sign_request insert returned nothing");
        row = inserted;
        committed = true;
      } else {
        const sameKey = and(
          eq(signRequest.organizationId, env.organizationId),
          eq(signRequest.environmentId, env.environmentId),
          eq(signRequest.idempotencyKey, idempotencyKey),
        );
        ({ row, replayed } = await withIdempotencyKey({
          requestHash: requestHash ?? "",
          retentionMs: IDEMPOTENCY_KEY_TTL_MS,
          now: () => clock().getTime(),
          errors: IDEMPOTENCY_ERRORS,
          insert,
          existing: async () => {
            const [found] = await db.select().from(signRequest).where(sameKey).limit(1);
            return found;
          },
          release: (tx, found) =>
            tx
              .update(signRequest)
              .set({ idempotencyKey: null })
              .where(
                and(eq(signRequest.id, found.id), eq(signRequest.idempotencyKey, idempotencyKey)),
              ),
        }));
      }
      committed = !replayed;
      if (replayed) await discardUnstoredDocuments(opts.store, inline);
      const [object] = await toObjects([row], env.mode === "sandbox");
      if (!object) throw notFound();
      return { request: object, replayed };
    } catch (error) {
      if (!committed) await discardUnstoredDocuments(opts.store, inline);
      throw error;
    }
  }

  async function replay(input: {
    environment: SignEnvironment;
    idempotencyKey?: string | null;
    hashSource: unknown;
  }): Promise<{ request: SignRequestObjectOutput; replayed: true } | null> {
    const env = input.environment;
    if (!input.idempotencyKey) return null;
    const [found] = await db
      .select()
      .from(signRequest)
      .where(
        and(
          eq(signRequest.organizationId, env.organizationId),
          eq(signRequest.environmentId, env.environmentId),
          eq(signRequest.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    // Anything else (no row, another body, an expired key) goes through `create`'s own handling.
    if (
      !found ||
      found.requestHash !== hashRequest(input.hashSource) ||
      clock().getTime() - found.createdAt.getTime() > IDEMPOTENCY_KEY_TTL_MS
    ) {
      return null;
    }
    const [object] = await toObjects([found], env.mode === "sandbox");
    return object ? { request: object, replayed: true } : null;
  }

  return {
    store: opts.store,
    create,
    replay,
    uploadDocument: (input) => uploadSignDocument(opts.store, input),
    deleteDocument: (input) => deleteSignDocument(opts.store, input),
    deleteRequest: (input) => deleteSignRequest(opts.store, input),
    createTemplate: (input) => createSignTemplate(opts.store, input),
    updateTemplate: (input) => updateSignTemplate(opts.store, input),
  };
}

/**
 * Deletes a request that isn't `sent` (cancel that first): its signers, fields, audit trail and
 * sessions, and from the store its signature images and signed document. Its documents stay (they
 * may be used elsewhere; delete them on their own).
 */
export async function deleteSignRequest(
  store: DocumentStore,
  input: { organizationId: string; environmentId: string; requestId: string },
): Promise<void> {
  if (!isId(ID_PREFIXES.signRequest, input.requestId)) throw notFound();
  const keys = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(signRequest).where(requestScope(input)).for("update");
    if (!row) throw notFound();
    if (row.status === "sent") {
      throw new SignError(
        "request_not_deletable",
        "Signers may still be signing it: cancel the request first.",
      );
    }
    const signers = await tx
      .select({ signatureKey: signSigner.signatureKey, initialsKey: signSigner.initialsKey })
      .from(signSigner)
      .where(
        and(eq(signSigner.requestId, row.id), eq(signSigner.organizationId, row.organizationId)),
      );
    await tx.delete(signRequest).where(requestScope(input));
    const keys = [
      ...signers.flatMap((signer) => [signer.signatureKey, signer.initialsKey]),
      row.signedDocumentKey,
    ].filter((key): key is string => key !== null);
    await scheduleStoreCleanup(tx, row.organizationId, keys);
    return keys;
  });
  await removeStoreObjects(store, keys);
}
