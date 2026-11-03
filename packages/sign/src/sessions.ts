/**
 * Signing sessions: a short-lived link for one signer, opened on the signing app's own domain. The
 * URL carries the session id in its path (not secret: it picks the environment's settings, e.g.
 * which sites may embed it) and the token in its fragment (never sent to a server, so never
 * logged). Only the token's sha256 is stored. No cookies are involved anywhere.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db, schema } from "@coss/db";
import { ID_PREFIXES, isId } from "@coss/db/id";
import { withoutTrailingSlashes } from "@coss/db/url";
import { and, eq, sql } from "drizzle-orm";
import { SignError } from "./errors.ts";
import type { SignRequestRow } from "./requests.ts";
import {
  DEFAULT_SIGN_SESSION_EXPIRES_IN,
  MAX_SIGN_SESSION_EXPIRES_IN,
  type SignSessionObjectOutput,
} from "./schemas.ts";

const {
  environment,
  organizationDeletion,
  organizationSuspension,
  signRequest,
  signSession,
  signSigner,
} = schema;

export type SignSessionRow = typeof signSession.$inferSelect;
export type SignSignerRow = typeof signSigner.$inferSelect;

const TOKEN_PREFIX = "cosss_";
const LAST_USED_RESOLUTION_MS = 60_000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The signing link for a session: the id in the path, the token in the fragment. */
export function signSessionUrl(signUrl: string, sessionId: string, token: string): string {
  return `${withoutTrailingSlashes(signUrl)}/s/${sessionId}#${token}`;
}

/**
 * Mints a session for an embedded signer of a sent request (`customer_asserted`: the customer's
 * app vouches for who opens it). The token is returned only here.
 */
export async function createSignSession(input: {
  organizationId: string;
  environmentId: string;
  requestId: string;
  signerId: string;
  signUrl: string;
  expiresIn?: number;
  apiKeyId: string | null;
  now?: Date;
}): Promise<SignSessionObjectOutput> {
  const expiresIn = input.expiresIn ?? DEFAULT_SIGN_SESSION_EXPIRES_IN;
  if (!Number.isInteger(expiresIn) || expiresIn < 60 || expiresIn > MAX_SIGN_SESSION_EXPIRES_IN) {
    throw new RangeError(`expiresIn must be 60-${MAX_SIGN_SESSION_EXPIRES_IN} seconds.`);
  }
  const notFound = new SignError(
    "not_found",
    "No signer with this id exists on that signature request in this environment.",
  );
  if (
    !isId(ID_PREFIXES.signRequest, input.requestId) ||
    !isId(ID_PREFIXES.signSigner, input.signerId)
  ) {
    throw notFound;
  }
  const [row] = await db
    .select({ request: signRequest, signer: signSigner })
    .from(signSigner)
    .innerJoin(
      signRequest,
      and(
        eq(signRequest.id, signSigner.requestId),
        eq(signRequest.organizationId, signSigner.organizationId),
      ),
    )
    .where(
      and(
        eq(signSigner.id, input.signerId),
        eq(signSigner.organizationId, input.organizationId),
        eq(signRequest.id, input.requestId),
        eq(signRequest.environmentId, input.environmentId),
      ),
    )
    .limit(1);
  if (!row) throw notFound;
  if (row.signer.delivery !== "embedded") {
    throw new SignError(
      "signer_not_embedded",
      "This signer signs by email; sessions are for signers with `delivery: embedded`.",
    );
  }
  const now = input.now ?? new Date();
  checkSignable(row.request, now);
  checkSignerOpen(row.signer);
  return mintSignSession({
    organizationId: input.organizationId,
    environmentId: input.environmentId,
    requestId: row.request.id,
    signerId: row.signer.id,
    signUrl: input.signUrl,
    expiresAt: new Date(now.getTime() + expiresIn * 1000),
    apiKeyId: input.apiKeyId,
    now,
  });
}

/**
 * Stores a new session for a signer and returns it with its link (the token only here). Callers
 * check who may get one: `createSignSession` for embedded signers, email delivery for the rest.
 */
export async function mintSignSession(input: {
  organizationId: string;
  environmentId: string;
  requestId: string;
  signerId: string;
  signUrl: string;
  expiresAt: Date;
  apiKeyId: string | null;
  now?: Date;
}): Promise<SignSessionObjectOutput> {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const [session] = await db
    .insert(signSession)
    .values({
      organizationId: input.organizationId,
      environmentId: input.environmentId,
      requestId: input.requestId,
      signerId: input.signerId,
      tokenHash: hashToken(token),
      expiresAt: input.expiresAt,
      apiKeyId: input.apiKeyId,
      createdAt: input.now ?? new Date(),
    })
    .returning();
  if (!session) throw new Error("sign_session insert returned no row.");
  return {
    object: "sign_session",
    id: session.id,
    request_id: session.requestId,
    signer_id: session.signerId,
    url: signSessionUrl(input.signUrl, session.id, token),
    token,
    expires_at: session.expiresAt.toISOString(),
  };
}

/** Throws unless the request can be signed now: sent and not past its expiry. */
export function checkSignable(
  request: Pick<SignRequestRow, "status" | "expiresAt">,
  now: Date,
): void {
  if (request.status !== "sent") {
    throw new SignError(
      "request_not_signable",
      `This signature request is ${request.status}, so it can't be signed.`,
    );
  }
  if (request.expiresAt && request.expiresAt <= now) {
    throw new SignError("request_not_signable", "This signature request has expired.");
  }
}

/** Throws when the signer already signed or declined. */
export function checkSignerOpen(signer: Pick<SignSignerRow, "status">): void {
  if (signer.status === "signed" || signer.status === "declined") {
    throw new SignError("signer_finished", `This signer already ${signer.status}.`);
  }
}

export type SignSessionAccess = {
  session: SignSessionRow;
  /** The organization is suspended: the signer can look but not sign. */
  readOnly: boolean;
  sandbox: boolean;
};

/**
 * The session `id` if `token` is its token, it hasn't expired and its organization isn't being
 * deleted; `null` otherwise (callers answer every failure the same way). System-level: resolves
 * the organization from the session.
 */
export async function authenticateSignSession(input: {
  id: string;
  token: string;
  now?: Date;
}): Promise<SignSessionAccess | null> {
  if (!isId(ID_PREFIXES.signSession, input.id) || !input.token.startsWith(TOKEN_PREFIX)) {
    return null;
  }
  const now = input.now ?? new Date();
  const [row] = await db
    .select({
      session: signSession,
      mode: environment.mode,
      suspended: sql<boolean>`exists (select 1 from ${organizationSuspension} where ${organizationSuspension.organizationId} = ${signSession.organizationId})`,
      deleting: sql<boolean>`exists (select 1 from ${organizationDeletion} where ${organizationDeletion.organizationId} = ${signSession.organizationId} and ${organizationDeletion.status} = 'pending')`,
    })
    .from(signSession)
    .innerJoin(
      environment,
      and(
        eq(environment.id, signSession.environmentId),
        eq(environment.organizationId, signSession.organizationId),
      ),
    )
    .where(eq(signSession.id, input.id))
    .limit(1);
  if (!row || row.deleting || row.session.expiresAt <= now) return null;
  const expected = Buffer.from(row.session.tokenHash, "hex");
  const actual = Buffer.from(hashToken(input.token), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  if (
    !row.session.lastUsedAt ||
    now.getTime() - row.session.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS
  ) {
    await db.update(signSession).set({ lastUsedAt: now }).where(eq(signSession.id, row.session.id));
  }
  return { session: row.session, readOnly: row.suspended, sandbox: row.mode === "sandbox" };
}

/** The session row by id alone (not authenticated): the signing page picks its settings. */
export async function findSignSession(id: string): Promise<SignSessionRow | null> {
  if (!isId(ID_PREFIXES.signSession, id)) return null;
  const [row] = await db.select().from(signSession).where(eq(signSession.id, id)).limit(1);
  return row ?? null;
}
