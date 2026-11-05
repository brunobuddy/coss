/**
 * The portal: an end user's page (on its own domain) to manage one application's endpoints and see
 * its deliveries. A customer's backend mints a short-lived session for one application; the portal
 * URL carries the session id in its path (not secret: it picks the environment's settings, e.g.
 * which sites may embed it) and the token in its fragment (never sent to a server, so never logged).
 * Only the token's sha256 is stored. No cookies are involved anywhere.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db, schema } from "@coss/db";
import { ID_PREFIXES, isId } from "@coss/db/id";
import { withoutTrailingSlashes } from "@coss/db/url";
import { RETENTION_DAYS, retentionCutoff } from "@coss/retention";
import { and, eq, lt, sql } from "drizzle-orm";
import type { HookApplicationRow } from "./applications.ts";
import { HookError } from "./errors.ts";
import {
  DEFAULT_PORTAL_SESSION_EXPIRES_IN,
  MAX_PORTAL_ORIGINS,
  MAX_PORTAL_SESSION_EXPIRES_IN,
  type PortalTheme,
} from "./schemas.ts";
import { environmentOf } from "./shared.ts";

const {
  environment,
  hookApplication,
  hookPortalSession,
  hookPortalSettings,
  organizationDeletion,
  organizationSuspension,
} = schema;

export type HookPortalSessionRow = typeof hookPortalSession.$inferSelect;
export type HookPortalSettingsRow = typeof hookPortalSettings.$inferSelect;

const TOKEN_PREFIX = "cossp_";
const LAST_USED_RESOLUTION_MS = 60_000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The portal link for a session: the id in the path, the token in the fragment. */
export function portalSessionUrl(portalUrl: string, sessionId: string, token: string): string {
  return `${withoutTrailingSlashes(portalUrl)}/s/${sessionId}#${token}`;
}

/** Mints a session for the application; the token is returned only here. */
export async function createHookPortalSession(input: {
  application: HookApplicationRow;
  expiresIn?: number;
  readOnly?: boolean;
  apiKeyId?: string | null;
  userId?: string | null;
  now?: Date;
}): Promise<{ session: HookPortalSessionRow; token: string }> {
  const expiresIn = input.expiresIn ?? DEFAULT_PORTAL_SESSION_EXPIRES_IN;
  if (!Number.isInteger(expiresIn) || expiresIn < 60 || expiresIn > MAX_PORTAL_SESSION_EXPIRES_IN) {
    throw new RangeError(`expiresIn must be 60-${MAX_PORTAL_SESSION_EXPIRES_IN} seconds.`);
  }
  const now = input.now ?? new Date();
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const [session] = await db
    .insert(hookPortalSession)
    .values({
      organizationId: input.application.organizationId,
      environmentId: input.application.environmentId,
      applicationId: input.application.id,
      tokenHash: hashToken(token),
      readOnly: input.readOnly ?? false,
      expiresAt: new Date(now.getTime() + expiresIn * 1000),
      apiKeyId: input.apiKeyId ?? null,
      createdByUserId: input.userId ?? null,
      createdAt: now,
    })
    .returning();
  if (!session) throw new Error("Hook portal session insert returned no row.");
  return { session, token };
}

export type PortalAccess = {
  session: HookPortalSessionRow;
  application: HookApplicationRow;
  /** Mutations are refused: the session is read-only or the organization is suspended. */
  readOnly: boolean;
  /** The application's environment is live or sandbox. */
  mode: "live" | "sandbox";
};

/**
 * The session `id` if `token` is its token, it hasn't expired, its application still exists and its
 * organization isn't being deleted; `null` otherwise (callers answer every failure the same way).
 * System-level: resolves the organization from the session.
 */
export async function authenticateHookPortalSession(input: {
  id: string;
  token: string;
  now?: Date;
}): Promise<PortalAccess | null> {
  if (!isId(ID_PREFIXES.hookPortalSession, input.id) || !input.token.startsWith(TOKEN_PREFIX)) {
    return null;
  }
  const now = input.now ?? new Date();
  const [row] = await db
    .select({
      session: hookPortalSession,
      application: hookApplication,
      mode: environment.mode,
      suspended: sql<boolean>`exists (select 1 from ${organizationSuspension} where ${organizationSuspension.organizationId} = ${hookPortalSession.organizationId})`,
      deleting: sql<boolean>`exists (select 1 from ${organizationDeletion} where ${organizationDeletion.organizationId} = ${hookPortalSession.organizationId} and ${organizationDeletion.status} = 'pending')`,
    })
    .from(hookPortalSession)
    .innerJoin(
      hookApplication,
      and(
        eq(hookApplication.id, hookPortalSession.applicationId),
        eq(hookApplication.organizationId, hookPortalSession.organizationId),
      ),
    )
    .innerJoin(
      environment,
      and(
        eq(environment.id, hookApplication.environmentId),
        eq(environment.organizationId, hookApplication.organizationId),
      ),
    )
    .where(eq(hookPortalSession.id, input.id))
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
      .update(hookPortalSession)
      .set({ lastUsedAt: now })
      .where(eq(hookPortalSession.id, row.session.id));
  }
  return {
    session: row.session,
    application: row.application,
    readOnly: row.session.readOnly || row.suspended,
    mode: row.mode,
  };
}

/** The session row by id alone (not authenticated): the portal's page shell picks its settings. */
export async function findHookPortalSession(id: string): Promise<HookPortalSessionRow | null> {
  if (!isId(ID_PREFIXES.hookPortalSession, id)) return null;
  const [row] = await db
    .select()
    .from(hookPortalSession)
    .where(eq(hookPortalSession.id, id))
    .limit(1);
  return row ?? null;
}

/** Deletes the application's portal sessions (e.g. its user should lose access now). */
export async function revokeHookPortalSessions(input: {
  organizationId: string;
  applicationId: string;
}): Promise<number> {
  const deleted = await db
    .delete(hookPortalSession)
    .where(
      and(
        eq(hookPortalSession.organizationId, input.organizationId),
        eq(hookPortalSession.applicationId, input.applicationId),
      ),
    )
    .returning({ id: hookPortalSession.id });
  return deleted.length;
}

export type PortalSettings = {
  allowedOrigins: string[];
  displayName: string | null;
  accentColor: string | null;
  theme: PortalTheme;
};

const DEFAULT_SETTINGS: PortalSettings = {
  allowedOrigins: [],
  displayName: null,
  accentColor: null,
  theme: "system",
};

/** The environment's portal settings (defaults when never saved). */
export async function getHookPortalSettings(input: {
  organizationId: string;
  environmentId: string;
}): Promise<PortalSettings> {
  const [row] = await db
    .select()
    .from(hookPortalSettings)
    .where(
      and(
        eq(hookPortalSettings.organizationId, input.organizationId),
        eq(hookPortalSettings.environmentId, input.environmentId),
      ),
    )
    .limit(1);
  if (!row) return DEFAULT_SETTINGS;
  return {
    allowedOrigins: row.allowedOrigins,
    displayName: row.displayName,
    accentColor: row.accentColor,
    theme: row.theme as PortalTheme,
  };
}

/**
 * Normalizes an origin allowed to embed the portal: `https://host[:port]` only; `http://localhost`
 * and `http://127.0.0.1` too in sandbox environments. Throws `invalid_origin` otherwise.
 */
export function checkedPortalOrigin(value: string, mode: "live" | "sandbox"): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new HookError("invalid_origin", `${value} is not a URL like https://app.example.com.`);
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const allowedScheme =
    url.protocol === "https:" || (url.protocol === "http:" && local && mode === "sandbox");
  if (!allowedScheme || url.username || url.password || url.origin === "null") {
    throw new HookError(
      "invalid_origin",
      mode === "sandbox"
        ? `${value} must be an https:// origin (or http://localhost).`
        : `${value} must be an https:// origin.`,
    );
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new HookError("invalid_origin", `${value} must be an origin, without a path.`);
  }
  return url.origin;
}

export async function setHookPortalSettings(input: {
  organizationId: string;
  environmentId: string;
  settings: PortalSettings;
}): Promise<PortalSettings> {
  const env = await environmentOf(input.organizationId, input.environmentId);
  const origins = [
    ...new Set(
      input.settings.allowedOrigins.map((origin) => checkedPortalOrigin(origin, env.mode)),
    ),
  ];
  if (origins.length > MAX_PORTAL_ORIGINS) {
    throw new HookError("invalid_origin", `At most ${MAX_PORTAL_ORIGINS} origins.`);
  }
  const accentColor = input.settings.accentColor?.trim() || null;
  if (accentColor && !/^#[0-9a-fA-F]{6}$/.test(accentColor)) {
    throw new RangeError("The accent color must look like #2563eb.");
  }
  const values = {
    allowedOrigins: origins,
    displayName: input.settings.displayName?.trim().slice(0, 64) || null,
    accentColor: accentColor?.toLowerCase() ?? null,
    theme: input.settings.theme,
  };
  await db
    .insert(hookPortalSettings)
    .values({
      organizationId: input.organizationId,
      projectId: env.projectId,
      environmentId: input.environmentId,
      ...values,
    })
    .onConflictDoUpdate({ target: hookPortalSettings.environmentId, set: values });
  return { ...values, theme: input.settings.theme };
}

/** Deletes sessions expired more than `RETENTION_DAYS.hookPortalSessions` ago. System-level. */
export async function purgeExpiredHookPortalSessions(
  opts: { now?: Date; limit?: number; scope?: { organizationIds: string[] } } = {},
): Promise<number> {
  const now = opts.now ?? new Date();
  const cutoff = retentionCutoff(RETENTION_DAYS.hookPortalSessions, now);
  const ids = db
    .select({ id: hookPortalSession.id })
    .from(hookPortalSession)
    .where(
      and(
        lt(hookPortalSession.expiresAt, cutoff),
        opts.scope
          ? sql`${hookPortalSession.organizationId} = any(${sql.param(opts.scope.organizationIds)}::text[])`
          : undefined,
      ),
    )
    .limit(opts.limit ?? 1000);
  const deleted = await db
    .delete(hookPortalSession)
    .where(and(sql`${hookPortalSession.id} in ${ids}`, lt(hookPortalSession.expiresAt, cutoff)))
    .returning({ id: hookPortalSession.id });
  return deleted.length;
}
