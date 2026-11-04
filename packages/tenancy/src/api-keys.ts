import { defaultKeyHasher } from "@better-auth/api-key";
import { auth } from "@coss/auth";
import {
  type ApiKeyAccess,
  InvalidKeyPermissionsError,
  type KeyPermissions,
  normalizeKeyPermissions,
  permissionStrings,
  personalKeyExcess,
  personalKeyPermissions,
} from "@coss/auth/api-key-permissions";
import { API_KEY_NAME_MAX_LENGTH, API_KEY_PERMISSIONS, API_KEY_PREFIX } from "@coss/auth/constants";
import { orgRoleCan } from "@coss/auth/permissions";
import { hipaaModeSql } from "@coss/compliance";
import { db, schema } from "@coss/db";
import { isAPIError } from "better-auth/api";
import { and, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { getOrganizationApiVersion } from "./api-versions.ts";
import { getEnvironmentById } from "./environments.ts";
import { TenancyError } from "./errors.ts";
import type { EnvironmentMode } from "./types.ts";

const {
  apikey,
  environment,
  environmentApiKey,
  member,
  organization,
  organizationApiVersion,
  organizationSuspension,
  project,
  user,
} = schema;

/** The member a personal key is assigned to. */
export type ApiKeyOwner = {
  id: string;
  name: string;
  email: string;
  /** Their role now; `null` once they left the organization (the key no longer works). */
  role: string | null;
};

export type EnvironmentApiKeySummary = {
  id: string;
  name: string | null;
  start: string | null;
  enabled: boolean;
  lastRequest: Date | null;
  createdAt: Date;
  createdByUserId: string | null;
  /** `null`: an organization key. */
  owner: ApiKeyOwner | null;
  access: ApiKeyAccess;
  /** What the key may do now (`full`: the whole current catalog). */
  permissions: KeyPermissions;
};

/** Resource -> actions, e.g. `{ email: ["send"] }`. */
export type { KeyPermissions };
export { permissionStrings };

/**
 * What a key may do: `full` keys hold the current catalog (never what was stored when they were
 * created), `restricted` keys exactly what they were created with. A personal key (`owner` given)
 * holds organization-wide permissions only while its owner's role does (`personalKeyPermissions`).
 */
export function effectiveKeyPermissions(
  access: ApiKeyAccess,
  stored: string | null,
  owner?: { role: string | null } | null,
): KeyPermissions {
  const permissions = access === "full" ? API_KEY_PERMISSIONS : (parsePermissions(stored) ?? {});
  return owner ? personalKeyPermissions(permissions, owner.role) : permissions;
}

/**
 * Whether a member with `role` may create a key in `environment` for `ownerUserId` (`null`: an
 * organization key). Organization keys and keys for other members need `apiKey:manage` (owners,
 * admins); a personal key for oneself needs `apiKey:create` and an environment open to personal
 * keys, unless the creator may manage keys anyway. `createEnvironmentApiKey` checks it again.
 */
export function keyCreationAllowed(input: {
  role: string | null | undefined;
  environment: { personalKeys: boolean };
  ownerUserId: string | null;
  creatorUserId: string;
}): boolean {
  if (orgRoleCan(input.role, { apiKey: ["manage"] })) return true;
  return (
    input.ownerUserId === input.creatorUserId &&
    input.environment.personalKeys &&
    orgRoleCan(input.role, { apiKey: ["create"] })
  );
}

export type ApiKeyContext = {
  apiKeyId: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  /** The member a personal key is assigned to; `null` for an organization key. */
  ownerUserId: string | null;
  mode: EnvironmentMode;
  /** The organization is in HIPAA mode (`@coss/compliance`). */
  hipaaMode: boolean;
  /** The organization's pinned API version (requests may override it with `Coss-Version`). */
  apiVersion: string;
};

export type AuthenticateResult =
  | { ok: true; context: ApiKeyContext }
  | { ok: false; reason: "invalid" }
  /**
   * The key is valid but refused: `forbidden` lacks a permission, `suspended` belongs to an
   * organization a platform admin has suspended. `context` lets the API log the refusal.
   */
  | { ok: false; reason: "forbidden" | "suspended"; context: RefusedKeyContext };

/** Who a refused key belongs to (no API version: a refusal never pins the organization's). */
export type RefusedKeyContext = Omit<ApiKeyContext, "apiVersion">;

/** Better Auth generates 64 letters after our prefix (see `defaultKeyGenerator`). */
const API_KEY_FORMAT = /^coss_(live|test)_[A-Za-z]{64}$/;

/**
 * Mints an organization-owned key for one environment and binds it, assigned to `ownerUserId`
 * (a personal key) or to nobody (an organization key). `userId` creates it: Better Auth checks
 * that they are a member with `apiKey:create`, and `keyCreationAllowed` which keys they may
 * create. The plaintext key is returned exactly once. `permissions` is `"full"` (everything,
 * including permissions added later) or the subset of `API_KEY_PERMISSIONS` a restricted key holds
 * forever; a restricted personal key can't ask for organization-wide permissions its owner's role
 * lacks.
 */
export async function createEnvironmentApiKey(input: {
  organizationId: string;
  environmentId: string;
  name: string;
  userId: string;
  ownerUserId?: string | null;
  permissions: "full" | KeyPermissions;
}): Promise<{
  id: string;
  key: string;
  start: string | null;
  name: string;
  access: ApiKeyAccess;
  permissions: KeyPermissions;
}> {
  const env = await getEnvironmentById({
    organizationId: input.organizationId,
    environmentId: input.environmentId,
  });
  if (!env) throw new TenancyError("not_found", "Environment not found.");
  if (await isSuspended(env.organizationId)) {
    throw new TenancyError("forbidden", "This organization is suspended.");
  }

  const name = input.name.trim();
  if (name.length === 0 || name.length > API_KEY_NAME_MAX_LENGTH) {
    throw new TenancyError("invalid", `Key name must be 1-${API_KEY_NAME_MAX_LENGTH} characters.`);
  }
  const ownerUserId = input.ownerUserId ?? null;
  const roles = await memberRoles(env.organizationId, [input.userId, ownerUserId]);
  if (
    !keyCreationAllowed({
      role: roles.get(input.userId),
      environment: env,
      ownerUserId,
      creatorUserId: input.userId,
    })
  ) {
    throw new TenancyError(
      "forbidden",
      ownerUserId === input.userId
        ? "Personal API keys aren't allowed in this environment."
        : "You are not allowed to create this API key.",
    );
  }
  const ownerRole = ownerUserId === null ? null : roles.get(ownerUserId);
  if (ownerUserId !== null && !ownerRole) {
    throw new TenancyError("invalid", "The key's owner isn't a member of this organization.");
  }
  const access: ApiKeyAccess = input.permissions === "full" ? "full" : "restricted";
  let permissions: KeyPermissions = API_KEY_PERMISSIONS;
  if (input.permissions !== "full") {
    try {
      permissions = normalizeKeyPermissions(input.permissions);
    } catch (error) {
      if (error instanceof InvalidKeyPermissionsError) {
        throw new TenancyError("invalid", error.message);
      }
      throw error;
    }
    const excess = ownerRole ? personalKeyExcess(permissions, ownerRole) : [];
    if (excess.length > 0) {
      throw new TenancyError(
        "invalid",
        `A personal key of this member can't hold ${excess.join(", ")}: they cover the whole organization.`,
      );
    }
  }

  let created: Awaited<ReturnType<typeof auth.api.createApiKey>>;
  try {
    // No headers: a server call, so Better Auth trusts `userId` but still enforces membership
    // and the org permission. The org always comes from the environment row.
    created = await auth.api.createApiKey({
      body: {
        organizationId: env.organizationId,
        userId: input.userId,
        name,
        prefix: API_KEY_PREFIX[env.mode],
        // Full-access keys store the current catalog too (Better Auth's default), but their
        // binding's `access` is what counts.
        permissions,
      },
    });
  } catch (error) {
    if (isAPIError(error) && (error.status === "FORBIDDEN" || error.status === "UNAUTHORIZED")) {
      throw new TenancyError(
        "forbidden",
        error.message || "You are not allowed to create API keys in this organization.",
      );
    }
    throw error;
  }

  try {
    await db.insert(environmentApiKey).values({
      apiKeyId: created.id,
      environmentId: env.id,
      createdByUserId: input.userId,
      ownerUserId,
      access,
    });
  } catch (error) {
    // Unbound keys are rejected anyway; deleting keeps them from piling up. Best effort only,
    // so the original error is what surfaces.
    await db
      .delete(apikey)
      .where(eq(apikey.id, created.id))
      .catch(() => undefined);
    throw error;
  }

  return {
    id: created.id,
    key: created.key,
    start: created.start ?? null,
    name,
    access,
    permissions: ownerRole ? personalKeyPermissions(permissions, ownerRole) : permissions,
  };
}

/** The organization roles of `userIds` (`null`s skipped); members only. */
async function memberRoles(
  organizationId: string,
  userIds: readonly (string | null)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => id !== null))];
  const rows = await db
    .select({ userId: member.userId, role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), inArray(member.userId, ids)));
  return new Map(rows.map((row) => [row.userId, row.role]));
}

/** Keys bound to an environment, newest first. Never selects the key hash. */
export async function listEnvironmentApiKeys(input: {
  organizationId: string;
  environmentId: string;
}): Promise<EnvironmentApiKeySummary[]> {
  const rows = await db
    .select({
      id: apikey.id,
      name: apikey.name,
      start: apikey.start,
      enabled: apikey.enabled,
      lastRequest: apikey.lastRequest,
      createdAt: apikey.createdAt,
      createdByUserId: environmentApiKey.createdByUserId,
      access: environmentApiKey.access,
      storedPermissions: apikey.permissions,
      ownerId: environmentApiKey.ownerUserId,
      ownerName: user.name,
      ownerEmail: user.email,
      ownerRole: member.role,
    })
    .from(environmentApiKey)
    .innerJoin(apikey, eq(apikey.id, environmentApiKey.apiKeyId))
    .innerJoin(environment, eq(environment.id, environmentApiKey.environmentId))
    .leftJoin(user, eq(user.id, environmentApiKey.ownerUserId))
    .leftJoin(member, ownerMembership())
    .where(
      and(
        eq(environment.id, input.environmentId),
        eq(environment.organizationId, input.organizationId),
        eq(apikey.referenceId, input.organizationId),
      ),
    )
    .orderBy(desc(apikey.createdAt), desc(apikey.id));
  // `enabled` is nullable in Better Auth's schema; NULL means the default (enabled).
  return rows.map(({ storedPermissions, ownerId, ownerName, ownerEmail, ownerRole, ...row }) => {
    const owner =
      ownerId === null
        ? null
        : { id: ownerId, name: ownerName ?? "", email: ownerEmail ?? "", role: ownerRole };
    return {
      ...row,
      enabled: row.enabled !== false,
      owner,
      permissions: effectiveKeyPermissions(row.access, storedPermissions, owner),
    };
  });
}

/** Joins `member` to a key binding's owner in the environment's organization. */
function ownerMembership() {
  return and(
    eq(member.userId, environmentApiKey.ownerUserId),
    eq(member.organizationId, environment.organizationId),
  );
}

/** Every key of the organization with where it works and whose it is, oldest first. */
export async function listOrganizationApiKeys(input: { organizationId: string }): Promise<
  {
    id: string;
    name: string | null;
    start: string | null;
    environmentId: string;
    projectId: string;
    /** `null`: an organization key. */
    ownerUserId: string | null;
  }[]
> {
  return db
    .select({
      id: apikey.id,
      name: apikey.name,
      start: apikey.start,
      environmentId: environment.id,
      projectId: environment.projectId,
      ownerUserId: environmentApiKey.ownerUserId,
    })
    .from(environmentApiKey)
    .innerJoin(apikey, eq(apikey.id, environmentApiKey.apiKeyId))
    .innerJoin(environment, eq(environment.id, environmentApiKey.environmentId))
    .where(
      and(
        eq(environment.organizationId, input.organizationId),
        eq(apikey.referenceId, input.organizationId),
      ),
    )
    .orderBy(apikey.createdAt, apikey.id);
}

/** Names of the organization's keys among `ids` (deleted and foreign keys are left out). */
export async function apiKeyNames(input: {
  organizationId: string;
  ids: readonly string[];
}): Promise<Record<string, string>> {
  const ids = [...new Set(input.ids)];
  if (ids.length === 0) return {};
  const rows = await db
    .select({ id: apikey.id, name: apikey.name })
    .from(apikey)
    .where(and(inArray(apikey.id, ids), eq(apikey.referenceId, input.organizationId)));
  return Object.fromEntries(rows.map((row) => [row.id, row.name ?? row.id]));
}

/** What an authenticated key belongs to (`GET /v1/environment`): names and slugs, no secrets. */
export type ApiKeyEnvironmentSummary = {
  environment: { id: string; name: string; slug: string; mode: EnvironmentMode };
  project: { id: string; name: string; slug: string };
  organization: { id: string; name: string; slug: string };
  apiKey: {
    id: string;
    name: string | null;
    start: string | null;
    access: ApiKeyAccess;
    permissions: KeyPermissions;
  };
};

/**
 * The environment, project and organization a key is bound to, scoped by the organization (from
 * the authenticated context). `null` when the key or its binding is gone.
 */
export async function getApiKeyEnvironmentSummary(input: {
  organizationId: string;
  environmentId: string;
  apiKeyId: string;
}): Promise<ApiKeyEnvironmentSummary | null> {
  const [row] = await db
    .select({
      environmentId: environment.id,
      environmentName: environment.name,
      environmentSlug: environment.slug,
      mode: environment.mode,
      projectId: project.id,
      projectName: project.name,
      projectSlug: project.slug,
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      apiKeyId: apikey.id,
      apiKeyName: apikey.name,
      apiKeyStart: apikey.start,
      apiKeyAccess: environmentApiKey.access,
      apiKeyPermissions: apikey.permissions,
      ownerUserId: environmentApiKey.ownerUserId,
      ownerRole: member.role,
    })
    .from(environmentApiKey)
    .innerJoin(apikey, eq(apikey.id, environmentApiKey.apiKeyId))
    .innerJoin(environment, eq(environment.id, environmentApiKey.environmentId))
    .leftJoin(member, ownerMembership())
    .innerJoin(
      project,
      and(
        eq(project.id, environment.projectId),
        eq(project.organizationId, environment.organizationId),
      ),
    )
    .innerJoin(organization, eq(organization.id, environment.organizationId))
    .where(
      and(
        eq(environmentApiKey.apiKeyId, input.apiKeyId),
        eq(environment.id, input.environmentId),
        eq(environment.organizationId, input.organizationId),
        eq(apikey.referenceId, input.organizationId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    environment: {
      id: row.environmentId,
      name: row.environmentName,
      slug: row.environmentSlug,
      mode: row.mode,
    },
    project: { id: row.projectId, name: row.projectName, slug: row.projectSlug },
    organization: {
      id: row.organizationId,
      name: row.organizationName,
      slug: row.organizationSlug,
    },
    apiKey: {
      id: row.apiKeyId,
      name: row.apiKeyName,
      start: row.apiKeyStart,
      access: row.apiKeyAccess,
      permissions: effectiveKeyPermissions(
        row.apiKeyAccess,
        row.apiKeyPermissions,
        row.ownerUserId === null ? null : { role: row.ownerRole },
      ),
    },
  };
}

/**
 * Deletes a key of the organization that is bound to an environment, without a member session:
 * the key revoking itself (`DELETE /v1/api_key`). Its binding cascades. `null` when it is gone.
 */
export async function revokeEnvironmentApiKey(input: {
  organizationId: string;
  apiKeyId: string;
}): Promise<{ id: string; name: string | null } | null> {
  const [deleted] = await db
    .delete(apikey)
    .where(
      and(
        eq(apikey.id, input.apiKeyId),
        eq(apikey.referenceId, input.organizationId),
        inArray(apikey.id, db.select({ id: environmentApiKey.apiKeyId }).from(environmentApiKey)),
      ),
    )
    .returning({ id: apikey.id, name: apikey.name });
  return deleted ?? null;
}

/**
 * Deletes a member's own personal key (members can't revoke keys through Better Auth, which
 * checks `apiKey:delete`). `null` when the key is gone or isn't theirs.
 */
export async function revokePersonalApiKey(input: {
  organizationId: string;
  apiKeyId: string;
  ownerUserId: string;
}): Promise<{ id: string; name: string | null } | null> {
  const [deleted] = await db
    .delete(apikey)
    .where(
      and(
        eq(apikey.id, input.apiKeyId),
        eq(apikey.referenceId, input.organizationId),
        inArray(
          apikey.id,
          db
            .select({ id: environmentApiKey.apiKeyId })
            .from(environmentApiKey)
            .where(eq(environmentApiKey.ownerUserId, input.ownerUserId)),
        ),
      ),
    )
    .returning({ id: apikey.id, name: apikey.name });
  return deleted ?? null;
}

/** Ownership check before revoking/inspecting a key from the dashboard. */
export async function getKeyBinding(input: { organizationId: string; keyId: string }): Promise<{
  apiKeyId: string;
  name: string | null;
  environmentId: string;
  projectId: string;
  /** `null`: an organization key. */
  ownerUserId: string | null;
} | null> {
  const [row] = await db
    .select({
      apiKeyId: environmentApiKey.apiKeyId,
      name: apikey.name,
      environmentId: environment.id,
      projectId: environment.projectId,
      ownerUserId: environmentApiKey.ownerUserId,
    })
    .from(environmentApiKey)
    .innerJoin(apikey, eq(apikey.id, environmentApiKey.apiKeyId))
    .innerJoin(environment, eq(environment.id, environmentApiKey.environmentId))
    .where(
      and(
        eq(environmentApiKey.apiKeyId, input.keyId),
        eq(environment.organizationId, input.organizationId),
        eq(apikey.referenceId, input.organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Parses the stored `apikey.permissions` JSON; anything malformed grants nothing. */
function parsePermissions(stored: string | null): KeyPermissions | null {
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const entries = Object.entries(parsed);
    const valid = entries.every(
      ([, actions]) => Array.isArray(actions) && actions.every((a) => typeof a === "string"),
    );
    return valid ? (parsed as KeyPermissions) : null;
  } catch {
    return null;
  }
}

function hasPermissions(granted: KeyPermissions, required: KeyPermissions) {
  return Object.entries(required).every(([resource, actions]) => {
    const allowed = granted[resource];
    return allowed !== undefined && actions.every((action) => allowed.includes(action));
  });
}

async function isSuspended(organizationId: string): Promise<boolean> {
  const [row] = await db
    .select({ organizationId: organizationSuspension.organizationId })
    .from(organizationSuspension)
    .where(eq(organizationSuspension.organizationId, organizationId))
    .limit(1);
  return row !== undefined;
}

const INVALID: AuthenticateResult = { ok: false, reason: "invalid" };

/** `apikey.last_request` is refreshed at most this often per key (the dashboard's "Last used"). */
export const LAST_USED_RESOLUTION_MS = 60_000;

/**
 * Authenticates a raw `coss_(live|test)_…` key for the public API with one indexed SELECT — no
 * Better Auth call, so requests sharing a key never queue on its row. Enforces what Better Auth's
 * verify would for our keys (enabled, expiry) and fails closed on what we don't support (usage
 * quotas) or on any disagreement between the key, its organization and its environment's mode.
 * The only write is a guarded `last_request` refresh, at most once a minute per key. Database
 * errors are thrown (an outage is not a 401).
 */
export async function authenticateApiKey(
  rawKey: string | null | undefined,
  required?: KeyPermissions,
): Promise<AuthenticateResult> {
  if (typeof rawKey !== "string" || !API_KEY_FORMAT.test(rawKey)) return INVALID;

  const hashed = await defaultKeyHasher(rawKey);
  const [row] = await db
    .select({
      apiKeyId: apikey.id,
      referenceId: apikey.referenceId,
      prefix: apikey.prefix,
      enabled: apikey.enabled,
      expiresAt: apikey.expiresAt,
      remaining: apikey.remaining,
      permissions: apikey.permissions,
      access: environmentApiKey.access,
      lastRequest: apikey.lastRequest,
      organizationId: environment.organizationId,
      projectId: environment.projectId,
      environmentId: environment.id,
      mode: environment.mode,
      ownerUserId: environmentApiKey.ownerUserId,
      ownerRole: member.role,
      ownerBanned: user.banned,
      ownerBanExpires: user.banExpires,
      suspendedAt: organizationSuspension.createdAt,
      hipaaMode: hipaaModeSql(environment.organizationId),
      apiVersion: organizationApiVersion.apiVersion,
    })
    .from(apikey)
    .innerJoin(environmentApiKey, eq(environmentApiKey.apiKeyId, apikey.id))
    .innerJoin(environment, eq(environment.id, environmentApiKey.environmentId))
    .leftJoin(member, ownerMembership())
    .leftJoin(user, eq(user.id, environmentApiKey.ownerUserId))
    .leftJoin(
      organizationSuspension,
      eq(organizationSuspension.organizationId, environment.organizationId),
    )
    .leftJoin(
      organizationApiVersion,
      eq(organizationApiVersion.organizationId, environment.organizationId),
    )
    .where(eq(apikey.key, hashed))
    .limit(1);
  if (!row) return INVALID;

  const now = new Date();
  // `enabled` is nullable; NULL means the default (enabled). Keys are never created with a usage
  // quota (`remaining`), which a read-only check can't consume, so such a key is rejected.
  if (row.enabled === false || row.remaining !== null) return INVALID;
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return INVALID;

  // Fail closed if the key, its organization and its environment's mode disagree.
  const prefix = API_KEY_PREFIX[row.mode];
  if (
    row.referenceId !== row.organizationId ||
    row.prefix !== prefix ||
    !rawKey.startsWith(prefix)
  ) {
    return INVALID;
  }
  // A personal key works only while its owner is a member and not banned (leaving or being
  // removed also revokes it; this covers every path that changes membership).
  const owner = row.ownerUserId === null ? null : { role: row.ownerRole };
  if (owner && (owner.role === null || isBanned(row.ownerBanned, row.ownerBanExpires, now))) {
    return INVALID;
  }

  const { apiKeyId, organizationId, projectId, environmentId, ownerUserId, mode, hipaaMode } = row;
  const context = {
    apiKeyId,
    organizationId,
    projectId,
    environmentId,
    ownerUserId,
    mode,
    hipaaMode,
  };
  // Checked only once the key itself is proven valid, so a guessed key learns nothing.
  if (row.suspendedAt !== null) return { ok: false, reason: "suspended", context };
  if (
    required &&
    !hasPermissions(effectiveKeyPermissions(row.access, row.permissions, owner), required)
  ) {
    return { ok: false, reason: "forbidden", context };
  }

  if (!row.lastRequest || now.getTime() - row.lastRequest.getTime() >= LAST_USED_RESOLUTION_MS) {
    await touchLastUsed(row.apiKeyId, now);
  }

  // Organizations are pinned on their first authenticated request.
  const apiVersion = row.apiVersion ?? (await getOrganizationApiVersion({ organizationId }));
  return {
    ok: true,
    context: { ...context, apiVersion },
  };
}

/**
 * Whether the key holds `required` now: for a permission a route needs only for some requests
 * (`requireApiKey` checks what every request needs).
 */
export async function apiKeyHasPermissions(
  apiKeyId: string,
  required: KeyPermissions,
): Promise<boolean> {
  const [row] = await db
    .select({
      permissions: apikey.permissions,
      access: environmentApiKey.access,
      ownerUserId: environmentApiKey.ownerUserId,
      ownerRole: member.role,
    })
    .from(apikey)
    .innerJoin(environmentApiKey, eq(environmentApiKey.apiKeyId, apikey.id))
    .innerJoin(environment, eq(environment.id, environmentApiKey.environmentId))
    .leftJoin(member, ownerMembership())
    .where(eq(apikey.id, apiKeyId))
    .limit(1);
  if (!row) return false;
  const owner = row.ownerUserId === null ? null : { role: row.ownerRole };
  return hasPermissions(effectiveKeyPermissions(row.access, row.permissions, owner), required);
}

/** Better Auth's admin ban: `banned`, until `banExpires` if set. */
function isBanned(banned: boolean | null, banExpires: Date | null, now: Date): boolean {
  return banned === true && (banExpires === null || banExpires.getTime() > now.getTime());
}

/**
 * Opens or closes an environment to members' personal keys. Closing it leaves existing personal
 * keys working (revoke them separately). `null` when the environment isn't the organization's.
 */
export async function setEnvironmentPersonalKeys(input: {
  organizationId: string;
  environmentId: string;
  enabled: boolean;
}): Promise<{ id: string; personalKeys: boolean } | null> {
  const [row] = await db
    .update(environment)
    .set({ personalKeys: input.enabled })
    .where(
      and(
        eq(environment.id, input.environmentId),
        eq(environment.organizationId, input.organizationId),
      ),
    )
    .returning({ id: environment.id, personalKeys: environment.personalKeys });
  return row ?? null;
}

/**
 * Records usage for the dashboard. The guard repeats the staleness check in SQL so concurrent
 * requests at a minute boundary write once (the others re-check after the row lock and skip).
 * Best effort: "last used" is informational, so a failed write never fails the request.
 */
async function touchLastUsed(apiKeyId: string, now: Date): Promise<void> {
  const staleBefore = new Date(now.getTime() - LAST_USED_RESOLUTION_MS);
  try {
    await db
      .update(apikey)
      .set({ lastRequest: now })
      .where(
        and(
          eq(apikey.id, apiKeyId),
          or(isNull(apikey.lastRequest), lte(apikey.lastRequest, staleBefore)),
        ),
      );
  } catch (error) {
    console.error(`[tenancy] Failed to record API key usage (key=${apiKeyId}):`, error);
  }
}
