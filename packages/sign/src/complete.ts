/**
 * Completion: once everyone signed, the worker builds the completed document (`completed-pdf.ts`),
 * seals it (`seal/`), stores it and records `sealed`, whose webhook is `sign_request.completed`.
 * Leased (`seal_lease_until`) so workers never seal the same request twice at once, fenced on the
 * lease when it writes, retried with backoff when something fails. System-level: scans every
 * organization (`scope` narrows it in tests).
 */
import { createHash } from "node:crypto";
import { recordUsage } from "@coss/billing/metering";
import { db, schema } from "@coss/db";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { buildCompletedPdf, type CompletedRequest } from "./completed-pdf.ts";
import { SignError } from "./errors.ts";
import { recordSignEvent } from "./record.ts";
import { sealPdf } from "./seal/pdf-signature.ts";
import type { Sealer } from "./seal/sealer.ts";
import type { TimestampAuthority } from "./seal/tsa.ts";
import { getSignSettings, requesterName } from "./settings.ts";
import { type DocumentStore, organizationPrefix } from "./store.ts";
import { discardStoreObjects } from "./store-cleanup.ts";

const {
  environment,
  signDocument,
  signEvent,
  signField,
  signRequest,
  signRequestDocument,
  signSigner,
} = schema;

type RequestRow = typeof signRequest.$inferSelect;

export type SignCompletionDeps = {
  store: DocumentStore;
  sealer: Sealer;
  /** Seals sandbox requests (`sealerFromEnv`'s self-signed test seal); default `sealer`. */
  sandboxSealer?: Sealer;
  /** Without one, seals carry no trusted timestamp (PAdES B-B instead of B-T). */
  tsa?: TimestampAuthority | null;
  /** Fetches the seal's validation data (OCSP, CRLs); default the global `fetch`. */
  fetch?: typeof fetch;
};

const LEASE_MS = 10 * 60_000;
const MAX_BACKOFF_MS = 60 * 60_000;

/**
 * `orgs/<org>/<env>/requests/<request id>/signed-<sha256>.pdf`: one sealed, completed document,
 * by content. Each attempt writes its own; only the one the fenced update publishes stays.
 */
export function signedDocumentKey(
  request: { organizationId: string; environmentId: string; id: string },
  sha256: string,
): string {
  return `${organizationPrefix(request.organizationId)}${request.environmentId}/requests/${request.id}/signed-${sha256}.pdf`;
}

/** The request's organization isn't being deleted. */
const notDeleting = sql`not exists (select 1 from ${schema.organizationDeletion} where ${schema.organizationDeletion.organizationId} = ${signRequest.organizationId} and ${schema.organizationDeletion.status} = 'pending')`;

/** Leases up to `limit` completed requests waiting for their seal. */
async function claim(opts: {
  now: Date;
  limit: number;
  scope?: { organizationIds: string[] };
}): Promise<RequestRow[]> {
  const leaseUntil = new Date(opts.now.getTime() + LEASE_MS);
  const due = db
    .select({ id: signRequest.id })
    .from(signRequest)
    .where(
      and(
        eq(signRequest.status, "completed"),
        isNull(signRequest.sealedAt),
        notDeleting,
        or(isNull(signRequest.sealLeaseUntil), lte(signRequest.sealLeaseUntil, opts.now)),
        or(isNull(signRequest.sealNextAttemptAt), lte(signRequest.sealNextAttemptAt, opts.now)),
        opts.scope ? inArray(signRequest.organizationId, opts.scope.organizationIds) : undefined,
      ),
    )
    .orderBy(asc(signRequest.completedAt))
    .limit(opts.limit)
    .for("update", { skipLocked: true });
  return db
    .update(signRequest)
    .set({ sealLeaseUntil: leaseUntil, sealAttempts: sql`${signRequest.sealAttempts} + 1` })
    .where(sql`${signRequest.id} in ${due}`)
    .returning();
}

/** Everything the completed document shows, with the documents' and signatures' bytes. */
async function completedRequest(
  request: RequestRow,
  store: DocumentStore,
): Promise<CompletedRequest> {
  const scope = (requestId: AnyPgColumn, organizationId: AnyPgColumn) =>
    and(eq(requestId, request.id), eq(organizationId, request.organizationId));
  const [env] = await db
    .select({ mode: environment.mode })
    .from(environment)
    .where(eq(environment.id, request.environmentId))
    .limit(1);
  const documents = await db
    .select({
      id: signDocument.id,
      filename: signDocument.filename,
      sha256: signDocument.sha256,
      storeKey: signDocument.storeKey,
    })
    .from(signRequestDocument)
    .innerJoin(
      signDocument,
      and(
        eq(signDocument.id, signRequestDocument.documentId),
        eq(signDocument.organizationId, signRequestDocument.organizationId),
      ),
    )
    .where(scope(signRequestDocument.requestId, signRequestDocument.organizationId))
    .orderBy(asc(signRequestDocument.position));
  const signers = await db
    .select()
    .from(signSigner)
    .where(scope(signSigner.requestId, signSigner.organizationId))
    .orderBy(asc(signSigner.position), asc(signSigner.id));
  const fields = await db
    .select()
    .from(signField)
    .where(scope(signField.requestId, signField.organizationId));
  const events = await db
    .select()
    .from(signEvent)
    .where(scope(signEvent.requestId, signEvent.organizationId))
    .orderBy(asc(signEvent.sequence));
  const read = async (key: string | null, what: string): Promise<Uint8Array> => {
    const bytes = key ? await store.get(key) : null;
    if (!bytes) throw new Error(`${what} has no bytes in the store.`);
    return bytes;
  };
  const settings = await getSignSettings(request);
  return {
    id: request.id,
    title: request.title,
    requester: await requesterName({ organizationId: request.organizationId, settings }),
    sandbox: env?.mode === "sandbox",
    createdAt: request.createdAt,
    completedAt: request.completedAt ?? new Date(),
    documents: await Promise.all(
      documents.map(async (document) => ({
        id: document.id,
        filename: document.filename,
        sha256: document.sha256,
        bytes: await read(document.storeKey, `Document ${document.id}`),
      })),
    ),
    fields: fields.map((field) => ({
      documentIndex: documents.findIndex((document) => document.id === field.documentId),
      type: field.type,
      label: field.label,
      page: field.page,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      value: field.value,
      signerId: field.signerId,
    })),
    signers: await Promise.all(
      signers.map(async (signer) => ({
        id: signer.id,
        name: signer.name,
        email: signer.email,
        delivery: signer.delivery,
        authentication: signer.authentication,
        clientRef: signer.clientRef,
        signedAt: signer.signedAt ?? request.completedAt ?? new Date(),
        viewedAt: signer.viewedAt,
        consentedAt: signer.consentedAt,
        signature: await read(signer.signatureKey, `Signer ${signer.id}'s signature`),
        initials: signer.initialsKey
          ? await read(signer.initialsKey, `Signer ${signer.id}'s initials`)
          : null,
      })),
    ),
    events: events.map((event) => ({
      sequence: event.sequence,
      type: event.type,
      actor: event.actor,
      signerId: event.signerId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      details: event.details,
      occurredAt: event.occurredAt,
      hash: event.hash,
    })),
  };
}

/** Builds, seals and stores one request's completed document, then records `sealed`. */
async function seal(request: RequestRow, deps: SignCompletionDeps, now: Date): Promise<void> {
  const completed = await completedRequest(request, deps.store);
  const document = await buildCompletedPdf(completed);
  const bytes = await sealPdf(document, {
    sealer: completed.sandbox ? (deps.sandboxSealer ?? deps.sealer) : deps.sealer,
    tsa: deps.tsa,
    name: "coss.com",
    reason: `Completed signature request ${request.id}: every signer signed.`,
    location: "coss.com",
    contactInfo: "https://coss.com",
    signedAt: now,
    fetch: deps.fetch,
  });
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const key = signedDocumentKey(request, sha256);
  await deps.store.put({
    key,
    organizationId: request.organizationId,
    contentType: "application/pdf",
    content: bytes,
  });
  let published: boolean;
  try {
    published = await publish(request, completed, { key, sha256, now });
  } catch (error) {
    // Rolled back (or its commit's answer was lost): keep the copy only if the request names it.
    await discardUnpublished(request, key, deps.store);
    throw error;
  }
  // Another worker sealed it first, or the request is gone: this copy is nobody's.
  if (!published) await discardUnpublished(request, key, deps.store);
}

/** Deletes a sealed copy unless the request publishes it. */
async function discardUnpublished(
  request: RequestRow,
  key: string,
  store: DocumentStore,
): Promise<void> {
  try {
    const [row] = await db
      .select({ key: signRequest.signedDocumentKey })
      .from(signRequest)
      .where(
        and(eq(signRequest.id, request.id), eq(signRequest.organizationId, request.organizationId)),
      )
      .limit(1);
    if (row?.key === key) return;
    await discardStoreObjects(store, request.organizationId, [key]);
  } catch (error) {
    console.error(`[sign] could not delete an unpublished seal of ${request.id}:`, error);
  }
}

/** Publishes the sealed copy and records `sealed`, fenced on the lease; false if it lost. */
async function publish(
  request: RequestRow,
  completed: Awaited<ReturnType<typeof completedRequest>>,
  { key, sha256, now }: { key: string; sha256: string; now: Date },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Fenced on the lease: a worker that lost it writes nothing.
    const [updated] = await tx
      .update(signRequest)
      .set({
        signedDocumentKey: key,
        signedDocumentSha256: sha256,
        sealedAt: now,
        sealLeaseUntil: null,
        sealNextAttemptAt: null,
        sealError: null,
      })
      .where(
        and(
          eq(signRequest.id, request.id),
          eq(signRequest.organizationId, request.organizationId),
          isNull(signRequest.sealedAt),
          // Teardown deletes the store's prefix once deletion is requested: a seal that races it
          // loses here and deletes its copy, rather than publishing one the prefix already lost.
          notDeleting,
          request.sealLeaseUntil
            ? eq(signRequest.sealLeaseUntil, request.sealLeaseUntil)
            : undefined,
        ),
      )
      .returning();
    if (!updated) return false;
    // Billable once, here: the compare-and-set above lets only one worker through. Never sandbox.
    if (!completed.sandbox) {
      await recordUsage(tx, {
        organizationId: updated.organizationId,
        environmentId: updated.environmentId,
        projectId: updated.projectId,
        apiKeyId: updated.apiKeyId,
        meter: "sign.completed_requests",
        quantity: 1,
      });
    }
    await recordSignEvent(
      tx,
      { request: updated, sandbox: completed.sandbox },
      {
        type: "sealed",
        actor: { kind: "system" },
        details: { signed_document_sha256: sha256 },
        occurredAt: now,
      },
    );
    return true;
  });
}

/** Seals due completed requests; returns how many it tried. */
export async function runDueSignCompletions(
  opts: { limit: number; now?: Date; scope?: { organizationIds: string[] } },
  deps: SignCompletionDeps,
): Promise<number> {
  const now = opts.now ?? new Date();
  const requests = await claim({ now, limit: opts.limit, scope: opts.scope });
  for (const request of requests) {
    try {
      await seal(request, deps, now);
    } catch (error) {
      console.error(`[sign] sealing ${request.id} failed:`, error);
      const backoff = Math.min(60_000 * 2 ** Math.max(0, request.sealAttempts - 1), MAX_BACKOFF_MS);
      // Fenced like success: a worker whose lease was taken over leaves the new holder alone.
      await db
        .update(signRequest)
        .set({
          sealLeaseUntil: null,
          sealNextAttemptAt: new Date(now.getTime() + backoff),
          sealError: error instanceof Error ? error.message.slice(0, 500) : "Sealing failed.",
        })
        .where(
          and(
            eq(signRequest.id, request.id),
            eq(signRequest.organizationId, request.organizationId),
            isNull(signRequest.sealedAt),
            request.sealLeaseUntil
              ? eq(signRequest.sealLeaseUntil, request.sealLeaseUntil)
              : undefined,
          ),
        );
    }
  }
  return requests.length;
}

/** The sealed, completed document of an environment's request. */
export async function readSignedDocument(input: {
  organizationId: string;
  environmentId: string;
  requestId: string;
  store: DocumentStore;
}): Promise<{ filename: string; content: Uint8Array }> {
  const [row] = await db
    .select()
    .from(signRequest)
    .where(
      and(
        eq(signRequest.id, input.requestId),
        eq(signRequest.organizationId, input.organizationId),
        eq(signRequest.environmentId, input.environmentId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new SignError(
      "not_found",
      "No signature request with this id exists in this environment.",
    );
  }
  if (!row.signedDocumentKey) {
    throw new SignError(
      "signed_document_not_ready",
      row.status === "completed"
        ? "The signed document is still being sealed. It's ready when the `sign_request.completed` webhook arrives."
        : `There is no signed document: this request is ${row.status}.`,
    );
  }
  const content = await input.store.get(row.signedDocumentKey);
  if (!content) throw new Error(`Request ${row.id}'s signed document has no bytes in the store.`);
  return { filename: signedFilename(row.title), content };
}

/** `<title> (signed).pdf`, safe for a Content-Disposition header. */
export function signedFilename(title: string): string {
  const base =
    title
      .replace(/[^\w .-]+/g, "")
      .trim()
      .slice(0, 80) || "document";
  return `${base} (signed).pdf`;
}
