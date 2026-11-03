/**
 * Builder sessions: a short-lived link to the embedded builder (`apps/sign` `/b/<id>#<token>`) for
 * one template, made by the customer's backend for whoever edits it (their own user, or a member
 * in the dashboard). Like signing sessions: the token in the fragment, only its sha256 stored.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db, schema } from "@coss/db";
import { ID_PREFIXES, isId } from "@coss/db/id";
import { withoutTrailingSlashes } from "@coss/db/url";
import { and, eq, sql } from "drizzle-orm";
import { SignError } from "./errors.ts";
import {
  DEFAULT_SIGN_SESSION_EXPIRES_IN,
  MAX_SIGN_SESSION_EXPIRES_IN,
  type SignBuilderSessionObjectOutput,
} from "./schemas.ts";
import type { SignTemplateRow } from "./templates.ts";

const {
  environment,
  organizationDeletion,
  organizationSuspension,
  signBuilderSession,
  signTemplate,
} = schema;

export type SignBuilderSessionRow = typeof signBuilderSession.$inferSelect;

const TOKEN_PREFIX = "cossb_";
const LAST_USED_RESOLUTION_MS = 60_000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSignBuilderSession(input: {
  organizationId: string;
  environmentId: string;
  templateId: string;
  signUrl: string;
  expiresIn?: number;
  apiKeyId?: string | null;
  userId?: string | null;
  now?: Date;
}): Promise<SignBuilderSessionObjectOutput> {
  const expiresIn = input.expiresIn ?? DEFAULT_SIGN_SESSION_EXPIRES_IN;
  if (!Number.isInteger(expiresIn) || expiresIn < 60 || expiresIn > MAX_SIGN_SESSION_EXPIRES_IN) {
    throw new RangeError(`expiresIn must be 60-${MAX_SIGN_SESSION_EXPIRES_IN} seconds.`);
  }
  const notFound = new SignError(
    "not_found",
    "No template with this id exists in this environment.",
  );
  if (!isId(ID_PREFIXES.signTemplate, input.templateId)) throw notFound;
  const [template] = await db
    .select({ id: signTemplate.id })
    .from(signTemplate)
    .where(
      and(
        eq(signTemplate.id, input.templateId),
        eq(signTemplate.organizationId, input.organizationId),
        eq(signTemplate.environmentId, input.environmentId),
      ),
    )
    .limit(1);
  if (!template) throw notFound;
  const now = input.now ?? new Date();
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const [session] = await db
    .insert(signBuilderSession)
    .values({
      organizationId: input.organizationId,
      environmentId: input.environmentId,
      templateId: template.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + expiresIn * 1000),
      apiKeyId: input.apiKeyId ?? null,
      createdByUserId: input.userId ?? null,
      createdAt: now,
    })
    .returning();
  if (!session) throw new Error("sign_builder_session insert returned no row.");
  return {
    object: "sign_builder_session",
    id: session.id,
    template_id: session.templateId,
    url: `${withoutTrailingSlashes(input.signUrl)}/b/${session.id}#${token}`,
    token,
    expires_at: session.expiresAt.toISOString(),
  };
}

export type SignBuilderAccess = {
  session: SignBuilderSessionRow;
  template: SignTemplateRow;
  /** The organization is suspended: the template can be looked at, not changed. */
  readOnly: boolean;
  sandbox: boolean;
};

/**
 * The session if `token` is its token, it hasn't expired, its template still exists and its
 * organization isn't being deleted; `null` otherwise. System-level (the org comes from the session).
 */
export async function authenticateSignBuilderSession(input: {
  id: string;
  token: string;
  now?: Date;
}): Promise<SignBuilderAccess | null> {
  if (!isId(ID_PREFIXES.signBuilderSession, input.id) || !input.token.startsWith(TOKEN_PREFIX)) {
    return null;
  }
  const now = input.now ?? new Date();
  const [row] = await db
    .select({
      session: signBuilderSession,
      template: signTemplate,
      mode: environment.mode,
      suspended: sql<boolean>`exists (select 1 from ${organizationSuspension} where ${organizationSuspension.organizationId} = ${signBuilderSession.organizationId})`,
      deleting: sql<boolean>`exists (select 1 from ${organizationDeletion} where ${organizationDeletion.organizationId} = ${signBuilderSession.organizationId} and ${organizationDeletion.status} = 'pending')`,
    })
    .from(signBuilderSession)
    .innerJoin(
      signTemplate,
      and(
        eq(signTemplate.id, signBuilderSession.templateId),
        eq(signTemplate.organizationId, signBuilderSession.organizationId),
      ),
    )
    .innerJoin(
      environment,
      and(
        eq(environment.id, signTemplate.environmentId),
        eq(environment.organizationId, signTemplate.organizationId),
      ),
    )
    .where(eq(signBuilderSession.id, input.id))
    .limit(1);
  if (!row || row.deleting || row.session.expiresAt <= now) return null;
  const expected = Buffer.from(row.session.tokenHash, "hex");
  const actual = Buffer.from(hashToken(input.token), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  if (
    !row.session.lastUsedAt ||
    now.getTime() - row.session.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS
  ) {
    await db
      .update(signBuilderSession)
      .set({ lastUsedAt: now })
      .where(eq(signBuilderSession.id, row.session.id));
  }
  return {
    session: row.session,
    template: row.template,
    readOnly: row.suspended,
    sandbox: row.mode === "sandbox",
  };
}

/** The session row by id alone (not authenticated): the builder page picks its settings. */
export async function findSignBuilderSession(id: string): Promise<SignBuilderSessionRow | null> {
  if (!isId(ID_PREFIXES.signBuilderSession, id)) return null;
  const [row] = await db
    .select()
    .from(signBuilderSession)
    .where(eq(signBuilderSession.id, id))
    .limit(1);
  return row ?? null;
}
