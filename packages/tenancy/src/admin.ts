/**
 * Platform administration (dashboard /admin). These are platform-level functions: they read and
 * write across organizations, so they are exempt from the tenancy rule and must only be called
 * after checking that the caller is a platform admin. Every write records an `admin_audit_event`.
 */
import { db, type Executor, schema } from "@coss/db";
import { isId } from "@coss/db/id";
import { and, asc, count, desc, eq, gt, ilike, inArray, lt, or, type SQL, sql } from "drizzle-orm";
import { type OrganizationDeletion, requestOrganizationDeletion } from "./deletion.ts";
import { TenancyError } from "./errors.ts";
import { disconnectScim, getOrganizationScim } from "./scim.ts";
import { revokeSsoProviderSessions } from "./sso.ts";

const {
  adminAuditEvent,
  apikey,
  environment,
  environmentApiKey,
  member,
  organization,
  organizationDeletion,
  organizationHipaaMode,
  organizationSuspension,
  project,
  session,
  ssoProvider,
  user,
} = schema;

/** Grants the platform admin role; used by the seed and `admin:create`. The user must exist. */
export async function promoteToAdmin(
  email: string,
  options: { verifyEmail?: boolean } = {},
): Promise<{ id: string; email: string }> {
  const [row] = await db
    .update(user)
    // verifyEmail: a new stage's first admin can't receive the verification email until coss.com's
    // own organization (which they create) sends mail; the operator vouches for the address.
    .set({ role: "admin", ...(options.verifyEmail ? { emailVerified: true } : {}) })
    .where(sql`lower(${user.email}) = lower(${email.trim()})`)
    .returning({ id: user.id, email: user.email });
  if (!row) throw new TenancyError("not_found", `No user with email "${email}".`);
  return row;
}

// --- Audit log -------------------------------------------------------------------------------

/** The platform admin performing an action. The email is copied into the log. */
export type AdminActor = { userId: string; email: string };

export const ADMIN_ACTIONS = [
  "user.ban",
  "user.unban",
  "user.set_role",
  "user.impersonate",
  "user.revoke_session",
  "user.revoke_sessions",
  "user.reset_two_factor",
  "user.unlink_sso",
  "user.set_organization_limit",
  "user.reset_organization_limit",
  "organization.suspend",
  "organization.unsuspend",
  "organization.enable_hipaa_mode",
  "organization.disable_hipaa_mode",
  "organization.disable_sso_requirement",
  "organization.disable_sso",
  "organization.delete",
  "organization.disable_scim",
  "organization.take_down",
  // A user and the organizations they run, taken down from the sign-ups or user page; target the user.
  "user.take_down",
  // Outcomes reported on coss.com's own sign-up assessments (coss.com Risk); target the assessment.
  "risk_assessment.report",
  "risk_assessment.mark_legitimate",
  "api_key.revoke",
  "email.view_content",
  "reputation.suspended",
  "reputation.reinstated",
  "reputation.marketing_reinstated",
  "reputation.policy_updated",
  // Recorded by `changeRateLimitOverride` (@coss/ratelimit).
  "rate_limit.override_set",
  "rate_limit.override_reset",
  // Recorded by `@coss/billing` (`BillingAdminAction`).
  "billing.account_updated",
  "billing.contract_created",
  "billing.contract_canceled",
  "billing.credit_granted",
  "billing.credit_voided",
  "billing.invoice_created",
  "billing.invoice_voided",
  "billing.invoice_paid",
  "billing.invoice_uncollectible",
  "billing.invoice_resynced",
  "billing.credit_note_created",
  "billing.hold_placed",
  "billing.hold_lifted",
  // The admin console's deploys page (apps/web): a Deploy workflow dispatch, target the commit.
  "deploy.started",
  "deploy.redeployed",
  // SMS: high-risk destination countries an organization may allow, target the organization.
  "sms.countries_unlocked",
  // Forms: a form disabled for abuse (phishing, spam), or turned back on; target the form.
  "form.disable",
  "form.enable",
  // Support: a rep's work on a ticket; target the ticket.
  "support.replied",
  "support.note_added",
  "support.assigned",
  "support.severity_changed",
  "support.status_changed",
  "support.spam_changed",
  "support.organization_confirmed",
  "support.message_revealed",
  "support.cc_added",
  "support.attachment_downloaded",
  "support.saved_reply_changed",
] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

export type AdminTargetType =
  | "user"
  | "organization"
  | "api_key"
  | "email"
  | "commit"
  | "form"
  | "risk_assessment"
  | "support_ticket";

export type AdminAuditEvent = {
  id: string;
  actorUserId: string | null;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  organizationId: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

/** Longest reason/note an admin may record. */
export const ADMIN_REASON_MAX_LENGTH = 500;

function normalizeReason(reason: string | null | undefined, required: boolean): string | null {
  const trimmed = reason?.trim() ?? "";
  if (required && trimmed.length === 0) throw new TenancyError("invalid", "Enter a reason.");
  if (trimmed.length > ADMIN_REASON_MAX_LENGTH) {
    throw new TenancyError(
      "invalid",
      `The reason must be at most ${ADMIN_REASON_MAX_LENGTH} characters.`,
    );
  }
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Appends one entry to the admin audit log. Pass `executor` to commit it with the change it
 * describes; actions performed through Better Auth are recorded right after they succeed.
 */
export async function recordAdminAction(
  input: {
    actor: AdminActor;
    action: AdminAction;
    target: { type: AdminTargetType; id: string };
    organizationId?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  },
  executor: Executor = db,
): Promise<void> {
  await executor.insert(adminAuditEvent).values({
    actorUserId: input.actor.userId,
    actorEmail: input.actor.email,
    action: input.action,
    targetType: input.target.type,
    targetId: input.target.id,
    organizationId: input.organizationId ?? null,
    reason: normalizeReason(input.reason, false),
    metadata: input.metadata ?? {},
  });
}

/**
 * Audit entries, newest first. Filter by organization (every entry recorded with it) or by
 * target; page with `before` (the last id of the previous page).
 */
export async function listAdminAuditEvents(
  input: {
    organizationId?: string;
    target?: { type: AdminTargetType; id: string };
    before?: string;
    limit?: number;
  } = {},
): Promise<{ events: AdminAuditEvent[]; nextBefore: string | null }> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const before = input.before && isId("audit", input.before) ? input.before : undefined;
  const [cursor] = before
    ? await db
        .select({
          // Keep PostgreSQL's microseconds so the next page cannot skip same-millisecond rows.
          createdAt: sql<string>`${adminAuditEvent.createdAt}::text`,
          sequence: adminAuditEvent.sequence,
        })
        .from(adminAuditEvent)
        .where(eq(adminAuditEvent.id, before))
        .limit(1)
    : [];
  if (input.before && !cursor) return { events: [], nextBefore: null };
  const rows = await db
    .select()
    .from(adminAuditEvent)
    .where(
      and(
        input.organizationId ? eq(adminAuditEvent.organizationId, input.organizationId) : undefined,
        input.target
          ? and(
              eq(adminAuditEvent.targetType, input.target.type),
              eq(adminAuditEvent.targetId, input.target.id),
            )
          : undefined,
        cursor
          ? or(
              lt(adminAuditEvent.createdAt, sql`${cursor.createdAt}::timestamptz`),
              and(
                eq(adminAuditEvent.createdAt, sql`${cursor.createdAt}::timestamptz`),
                lt(adminAuditEvent.sequence, cursor.sequence),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(adminAuditEvent.createdAt), desc(adminAuditEvent.sequence))
    .limit(limit + 1);
  const events = rows.slice(0, limit);
  return {
    events,
    nextBefore: rows.length > limit ? (events.at(-1)?.id ?? null) : null,
  };
}

// --- Organization suspension -----------------------------------------------------------------

export type OrganizationSuspension = {
  reason: string;
  /** The kind of abuse a takedown was for; `null` for a plain suspension. */
  category: string | null;
  suspendedByUserId: string | null;
  createdAt: Date;
};

/** The organization's suspension, or `null` when it is active. */
export async function getOrganizationSuspension(
  organizationId: string,
): Promise<OrganizationSuspension | null> {
  const [row] = await db
    .select({
      reason: organizationSuspension.reason,
      category: organizationSuspension.category,
      suspendedByUserId: organizationSuspension.suspendedByUserId,
      createdAt: organizationSuspension.createdAt,
    })
    .from(organizationSuspension)
    .where(eq(organizationSuspension.organizationId, organizationId))
    .limit(1);
  return row ?? null;
}

async function requireOrganization(organizationId: string, executor: Executor = db) {
  const [row] = await executor
    .select({ id: organization.id, slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  if (!row) throw new TenancyError("not_found", "Organization not found.");
  return row;
}

/**
 * Suspends an organization: its API keys are refused (403 `organization_suspended`), its webhook
 * deliveries are held until it is lifted, and its dashboard becomes read-only. The reason is an
 * internal note for admins; `category` names the kind of abuse when a takedown suspends it (the
 * admin console's catalog, stored as given).
 */
export async function suspendOrganization(input: {
  organizationId: string;
  reason: string;
  category?: string | null;
  actor: AdminActor;
}): Promise<void> {
  const reason = normalizeReason(input.reason, true) as string;
  await db.transaction(async (tx) => {
    const org = await requireOrganization(input.organizationId, tx);
    const [inserted] = await tx
      .insert(organizationSuspension)
      .values({
        organizationId: org.id,
        reason,
        category: input.category ?? null,
        suspendedByUserId: input.actor.userId,
      })
      .onConflictDoNothing()
      .returning({ organizationId: organizationSuspension.organizationId });
    if (!inserted) throw new TenancyError("conflict", "This organization is already suspended.");
    await recordAdminAction(
      {
        actor: input.actor,
        action: "organization.suspend",
        target: { type: "organization", id: org.id },
        organizationId: org.id,
        reason,
        metadata: { slug: org.slug, ...(input.category ? { category: input.category } : {}) },
      },
      tx,
    );
  });
}

/** Whether the user belongs to an organization in HIPAA mode: staff can't act as them. */
export async function isMemberOfHipaaOrganization(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .innerJoin(
      organizationHipaaMode,
      eq(organizationHipaaMode.organizationId, member.organizationId),
    )
    .where(eq(member.userId, userId))
    .limit(1);
  return row !== undefined;
}

/** Queued email and SMS pick the mode up when they are claimed; a pending push is just dropped. */
async function applyHipaaModeToWaitingMessages(tx: Executor, organizationId: string) {
  await tx
    .delete(schema.pushNotification)
    .where(
      and(
        eq(schema.pushNotification.organizationId, organizationId),
        eq(schema.pushNotification.status, "pending"),
      ),
    );
}

/**
 * Turns on HIPAA mode (`@coss/compliance`) once a BAA is signed, and requires two-factor
 * authentication in the same transaction. The caller checks the organization's plan first.
 */
export async function enableHipaaMode(input: {
  organizationId: string;
  baaSignedAt: Date;
  baaReference: string;
  reason: string;
  actor: AdminActor;
}): Promise<void> {
  const reason = normalizeReason(input.reason, true) as string;
  const baaReference = input.baaReference.trim();
  if (!baaReference) throw new TenancyError("invalid", "Enter the BAA's reference.");
  if (Number.isNaN(input.baaSignedAt.getTime())) {
    throw new TenancyError("invalid", "Enter the date the BAA was signed.");
  }
  await db.transaction(async (tx) => {
    const org = await requireOrganization(input.organizationId, tx);
    const [inserted] = await tx
      .insert(organizationHipaaMode)
      .values({
        organizationId: org.id,
        baaSignedAt: input.baaSignedAt,
        baaReference,
        enabledByUserId: input.actor.userId,
      })
      .onConflictDoNothing()
      .returning({ organizationId: organizationHipaaMode.organizationId });
    if (!inserted) throw new TenancyError("conflict", "HIPAA mode is already on.");
    await tx
      .update(organization)
      .set({ requireTwoFactor: true })
      .where(eq(organization.id, org.id));
    await applyHipaaModeToWaitingMessages(tx, org.id);
    await recordAdminAction(
      {
        actor: input.actor,
        action: "organization.enable_hipaa_mode",
        target: { type: "organization", id: org.id },
        organizationId: org.id,
        reason,
        metadata: {
          slug: org.slug,
          baaSignedAt: input.baaSignedAt.toISOString(),
          baaReference,
        },
      },
      tx,
    );
  });
}

/** Turns HIPAA mode off. The two-factor requirement stays on until an owner changes it. */
export async function disableHipaaMode(input: {
  organizationId: string;
  reason: string;
  actor: AdminActor;
}): Promise<void> {
  const reason = normalizeReason(input.reason, true) as string;
  await db.transaction(async (tx) => {
    const org = await requireOrganization(input.organizationId, tx);
    const [deleted] = await tx
      .delete(organizationHipaaMode)
      .where(eq(organizationHipaaMode.organizationId, org.id))
      .returning({ baaReference: organizationHipaaMode.baaReference });
    if (!deleted) throw new TenancyError("conflict", "HIPAA mode isn't on.");
    await recordAdminAction(
      {
        actor: input.actor,
        action: "organization.disable_hipaa_mode",
        target: { type: "organization", id: org.id },
        organizationId: org.id,
        reason,
        metadata: { slug: org.slug, baaReference: deleted.baaReference },
      },
      tx,
    );
  });
}

/** Lifts a suspension; held webhook deliveries resume on the worker's next pass. */
export async function unsuspendOrganization(input: {
  organizationId: string;
  reason?: string | null;
  actor: AdminActor;
}): Promise<void> {
  const reason = normalizeReason(input.reason, false);
  await db.transaction(async (tx) => {
    const org = await requireOrganization(input.organizationId, tx);
    const [deleted] = await tx
      .delete(organizationSuspension)
      .where(eq(organizationSuspension.organizationId, org.id))
      .returning({ reason: organizationSuspension.reason });
    if (!deleted) throw new TenancyError("conflict", "This organization is not suspended.");
    await recordAdminAction(
      {
        actor: input.actor,
        action: "organization.unsuspend",
        target: { type: "organization", id: org.id },
        organizationId: org.id,
        reason,
        metadata: { slug: org.slug, suspensionReason: deleted.reason },
      },
      tx,
    );
  });
}

/**
 * Deletes an organization (see `requestOrganizationDeletion`), suspended or not: its members,
 * invitations, API keys and SSO provider go at once, the worker removes the rest. Typing the slug
 * is the confirmation. The audit entry outlives the organization.
 */
export async function deleteOrganizationAsAdmin(input: {
  organizationId: string;
  confirmSlug: string;
  reason: string;
  actor: AdminActor;
}): Promise<void> {
  const reason = normalizeReason(input.reason, true);
  await db.transaction(async (tx) => {
    const org = await requireOrganization(input.organizationId, tx);
    if (input.confirmSlug.trim() !== org.slug) {
      throw new TenancyError("invalid", `Type ${org.slug} to confirm.`);
    }
    const deletion = await requestOrganizationDeletion(
      { organizationId: org.id, actor: input.actor, byPlatformAdmin: true },
      tx,
    );
    await recordAdminAction(
      {
        actor: input.actor,
        action: "organization.delete",
        target: { type: "organization", id: org.id },
        organizationId: org.id,
        reason,
        metadata: { slug: org.slug, name: deletion.organizationName, deletionId: deletion.id },
      },
      tx,
    );
  });
}

// --- Admin reads -----------------------------------------------------------------------------

export type AdminOrganizationRow = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  memberCount: number;
  suspendedAt: Date | null;
  /** Its deletion is pending (the worker is tearing it down). */
  deleting: boolean;
};

/** `%`, `_` and `\` are literal in a search term. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** Organizations, newest first, matching `search` against the name, slug or exact id. */
export async function listOrganizationsForAdmin(
  input: { search?: string; suspendedOnly?: boolean; limit?: number; offset?: number } = {},
): Promise<{ organizations: AdminOrganizationRow[]; total: number }> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  const search = input.search?.trim();
  const filters: (SQL | undefined)[] = [
    search
      ? or(
          ilike(organization.name, likePattern(search)),
          ilike(organization.slug, likePattern(search)),
          eq(organization.id, search),
        )
      : undefined,
    input.suspendedOnly ? sql`${organizationSuspension.organizationId} is not null` : undefined,
  ];
  const memberCount = db
    .select({ organizationId: member.organizationId, count: count().as("member_count") })
    .from(member)
    .groupBy(member.organizationId)
    .as("member_count");

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        createdAt: organization.createdAt,
        memberCount: sql<number>`coalesce(${memberCount.count}, 0)::int`,
        suspendedAt: organizationSuspension.createdAt,
        deleting: sql<boolean>`${organizationDeletion.id} is not null`,
      })
      .from(organization)
      .leftJoin(memberCount, eq(memberCount.organizationId, organization.id))
      .leftJoin(
        organizationDeletion,
        and(
          eq(organizationDeletion.organizationId, organization.id),
          eq(organizationDeletion.status, "pending"),
        ),
      )
      .leftJoin(organizationSuspension, eq(organizationSuspension.organizationId, organization.id))
      .where(and(...filters))
      .orderBy(desc(organization.createdAt), desc(organization.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(organization)
      .leftJoin(organizationSuspension, eq(organizationSuspension.organizationId, organization.id))
      .where(and(...filters)),
  ]);
  return { organizations: rows, total: totalRow?.total ?? 0 };
}

/** The organization with exactly this id or slug, or `null` (the admin console's filters). */
export async function findOrganizationForAdmin(
  idOrSlug: string,
): Promise<{ id: string; name: string; slug: string } | null> {
  const value = idOrSlug.trim();
  if (!value) return null;
  const [row] = await db
    .select({ id: organization.id, name: organization.name, slug: organization.slug })
    .from(organization)
    .where(or(eq(organization.id, value), eq(organization.slug, value)))
    .limit(1);
  return row ?? null;
}

export type AdminOrganizationDetail = {
  organization: { id: string; name: string; slug: string; createdAt: Date };
  suspension: (OrganizationSuspension & { suspendedByEmail: string | null }) | null;
  /** The pending deletion, or `null`. */
  deletion: OrganizationDeletion | null;
};

/** One organization with its suspension (and who suspended it), or `null`. */
export async function getOrganizationForAdmin(
  organizationId: string,
): Promise<AdminOrganizationDetail | null> {
  const [row] = await db
    .select({
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        createdAt: organization.createdAt,
      },
      reason: organizationSuspension.reason,
      category: organizationSuspension.category,
      suspendedByUserId: organizationSuspension.suspendedByUserId,
      suspendedAt: organizationSuspension.createdAt,
      suspendedByEmail: user.email,
    })
    .from(organization)
    .leftJoin(organizationSuspension, eq(organizationSuspension.organizationId, organization.id))
    .leftJoin(user, eq(user.id, organizationSuspension.suspendedByUserId))
    .where(eq(organization.id, organizationId))
    .limit(1);
  if (!row) return null;
  const [deletion] = await db
    .select()
    .from(organizationDeletion)
    .where(
      and(
        eq(organizationDeletion.organizationId, organizationId),
        eq(organizationDeletion.status, "pending"),
      ),
    )
    .limit(1);
  return {
    organization: row.organization,
    deletion: deletion ?? null,
    suspension:
      row.reason !== null && row.suspendedAt !== null
        ? {
            reason: row.reason,
            category: row.category,
            suspendedByUserId: row.suspendedByUserId,
            suspendedByEmail: row.suspendedByEmail,
            createdAt: row.suspendedAt,
          }
        : null,
  };
}

export type AdminUserStatus = "all" | "banned" | "admin";

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: string | null;
  banned: boolean;
  banReason: string | null;
  banExpires: Date | null;
  twoFactorEnabled: boolean;
  ownedOrganizationLimit: number | null;
  createdAt: Date;
};

const userColumns = {
  id: user.id,
  name: user.name,
  email: user.email,
  emailVerified: user.emailVerified,
  role: user.role,
  banned: user.banned,
  banReason: user.banReason,
  banExpires: user.banExpires,
  twoFactorEnabled: sql<boolean>`coalesce(${user.twoFactorEnabled}, false)`,
  ownedOrganizationLimit: user.ownedOrganizationLimit,
  createdAt: user.createdAt,
};

/** Better Auth lifts an expired ban lazily (at the next sign-in); treat it as lifted already. */
const activeBan = sql`(${user.banned} is true and (${user.banExpires} is null or ${user.banExpires} > now()))`;
const isAdminRole = sql`'admin' = any(string_to_array(${user.role}, ','))`;

function toAdminUser(row: Omit<AdminUserRow, "banned"> & { banned: boolean | null }): AdminUserRow {
  const banned =
    row.banned === true && (row.banExpires === null || row.banExpires.getTime() > Date.now());
  return { ...row, banned };
}

/** Users, newest first, matching `search` against the email, name or exact id. */
export async function listUsersForAdmin(
  input: { search?: string; status?: AdminUserStatus; limit?: number; offset?: number } = {},
): Promise<{ users: AdminUserRow[]; total: number }> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  const search = input.search?.trim();
  const where = and(
    search
      ? or(
          ilike(user.email, likePattern(search)),
          ilike(user.name, likePattern(search)),
          eq(user.id, search),
        )
      : undefined,
    input.status === "banned" ? activeBan : undefined,
    input.status === "admin" ? isAdminRole : undefined,
  );
  const [rows, [totalRow]] = await Promise.all([
    db
      .select(userColumns)
      .from(user)
      .where(where)
      .orderBy(desc(user.createdAt), desc(user.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(user).where(where),
  ]);
  return { users: rows.map(toAdminUser), total: totalRow?.total ?? 0 };
}

export async function getUserForAdmin(userId: string): Promise<AdminUserRow | null> {
  const [row] = await db.select(userColumns).from(user).where(eq(user.id, userId)).limit(1);
  return row ? toAdminUser(row) : null;
}

/** The most organizations an admin can let one user own. */
export const MAX_OWNED_ORGANIZATION_LIMIT = 1_000;

/**
 * Sets (`limit`) or removes (`limit: null`) a user's own limit on the organizations they may own,
 * recording the previous and new limits. Applies to their next organization. Removing a limit they
 * don't have records nothing and returns false.
 */
export async function setOwnedOrganizationLimit(input: {
  userId: string;
  limit: number | null;
  reason?: string | null;
  actor: AdminActor;
}): Promise<boolean> {
  const { limit } = input;
  if (
    limit !== null &&
    (!Number.isInteger(limit) || limit < 1 || limit > MAX_OWNED_ORGANIZATION_LIMIT)
  ) {
    throw new TenancyError(
      "invalid",
      `The limit must be a whole number between 1 and ${MAX_OWNED_ORGANIZATION_LIMIT}.`,
    );
  }
  const reason = normalizeReason(input.reason, limit !== null);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ previous: user.ownedOrganizationLimit })
      .from(user)
      .where(eq(user.id, input.userId))
      .for("update");
    if (!row) throw new TenancyError("not_found", "User not found.");
    if (row.previous === limit) return false;
    await tx.update(user).set({ ownedOrganizationLimit: limit }).where(eq(user.id, input.userId));
    await recordAdminAction(
      {
        actor: input.actor,
        action: limit === null ? "user.reset_organization_limit" : "user.set_organization_limit",
        target: { type: "user", id: input.userId },
        reason,
        metadata: { previous: row.previous, limit },
      },
      tx,
    );
    return true;
  });
}

/**
 * Account recovery for a user who lost their authenticator and backup codes: removes their TOTP
 * secret and turns two-factor off, so their password alone signs them in. Passkeys and sessions
 * are left alone; organizations that require two-factor ask them to set it up again.
 */
export async function resetUserTwoFactor(input: {
  userId: string;
  reason: string;
  actor: AdminActor;
}): Promise<void> {
  const reason = normalizeReason(input.reason, true);
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(user)
      .set({ twoFactorEnabled: false })
      .where(and(eq(user.id, input.userId), eq(user.twoFactorEnabled, true)))
      .returning({ id: user.id });
    if (!updated) throw new TenancyError("not_found", "This user doesn't have two-factor enabled.");
    await tx.delete(schema.twoFactor).where(eq(schema.twoFactor.userId, input.userId));
    await recordAdminAction(
      {
        actor: input.actor,
        action: "user.reset_two_factor",
        target: { type: "user", id: updated.id },
        reason,
      },
      tx,
    );
  });
}

// --- SSO recovery ----------------------------------------------------------------------------

/**
 * Account recovery when a user's SSO sign-in broke (their IdP account was recreated, the IdP is
 * misconfigured…): removes the links between the user and SSO providers and signs out the
 * sessions those providers created. Their next SSO sign-in links again (by verified domain), or
 * they set a password with "Forgot password" (owners keep break-glass access that way).
 */
export async function unlinkUserSso(input: {
  userId: string;
  reason: string;
  actor: AdminActor;
}): Promise<void> {
  const reason = normalizeReason(input.reason, true);
  await db.transaction(async (tx) => {
    const providerIds = tx.select({ providerId: ssoProvider.providerId }).from(ssoProvider);
    const unlinked = await tx
      .delete(schema.account)
      .where(
        and(
          eq(schema.account.userId, input.userId),
          inArray(schema.account.providerId, providerIds),
        ),
      )
      .returning({ providerId: schema.account.providerId });
    if (unlinked.length === 0) {
      throw new TenancyError("not_found", "This user has no SSO accounts.");
    }
    const revoked = await tx
      .delete(session)
      .where(and(eq(session.userId, input.userId), inArray(session.ssoProviderId, providerIds)))
      .returning({ id: session.id });
    await recordAdminAction(
      {
        actor: input.actor,
        action: "user.unlink_sso",
        target: { type: "user", id: input.userId },
        reason,
        metadata: {
          providerIds: unlinked.map((row) => row.providerId),
          revokedSessions: revoked.length,
        },
      },
      tx,
    );
  });
}

export type UserSsoAccount = {
  /** `schema.account.id` */
  id: string;
  providerId: string;
  organization: { id: string; name: string; slug: string } | null;
  createdAt: Date;
};

/** The user's SSO accounts (accounts whose provider is an SSO provider), oldest first. */
export async function listUserSsoAccountsForAdmin(input: {
  userId: string;
}): Promise<UserSsoAccount[]> {
  const rows = await db
    .select({
      id: schema.account.id,
      providerId: schema.account.providerId,
      createdAt: schema.account.createdAt,
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
    })
    .from(schema.account)
    .innerJoin(ssoProvider, eq(ssoProvider.providerId, schema.account.providerId))
    .leftJoin(organization, eq(organization.id, ssoProvider.organizationId))
    .where(eq(schema.account.userId, input.userId))
    .orderBy(asc(schema.account.createdAt));
  return rows.map((row) => ({
    id: row.id,
    providerId: row.providerId,
    createdAt: row.createdAt,
    organization:
      row.organizationId && row.organizationName && row.organizationSlug
        ? { id: row.organizationId, name: row.organizationName, slug: row.organizationSlug }
        : null,
  }));
}

export type AdminOrganizationSso = {
  providerId: string;
  type: "oidc" | "saml";
  domains: string;
  domainVerified: boolean;
  requireSso: boolean;
};

/** The organization's SSO provider and requirement (no secrets), or `null` without a provider. */
export async function getOrganizationSsoForAdmin(
  organizationId: string,
): Promise<AdminOrganizationSso | null> {
  const [row] = await db
    .select({
      providerId: ssoProvider.providerId,
      samlConfig: ssoProvider.samlConfig,
      domains: ssoProvider.domain,
      domainVerified: ssoProvider.domainVerified,
      requireSso: organization.requireSso,
    })
    .from(ssoProvider)
    .innerJoin(organization, eq(organization.id, ssoProvider.organizationId))
    .where(eq(ssoProvider.organizationId, organizationId))
    .orderBy(asc(ssoProvider.id))
    .limit(1);
  if (!row) return null;
  return {
    providerId: row.providerId,
    type: row.samlConfig ? "saml" : "oidc",
    domains: row.domains,
    domainVerified: row.domainVerified === true,
    requireSso: row.requireSso === true,
  };
}

/**
 * Lets the organization's members sign in without SSO again (their IdP is down or broken); the
 * provider keeps working for those who can use it. The organization's owners can turn the
 * requirement back on.
 */
export async function disableOrganizationSsoRequirement(input: {
  organizationId: string;
  reason: string;
  actor: AdminActor;
}): Promise<void> {
  const reason = normalizeReason(input.reason, true);
  await db.transaction(async (tx) => {
    const org = await requireOrganization(input.organizationId, tx);
    const [updated] = await tx
      .update(organization)
      .set({ requireSso: false })
      .where(and(eq(organization.id, org.id), eq(organization.requireSso, true)))
      .returning({ id: organization.id });
    if (!updated) throw new TenancyError("conflict", "This organization doesn't require SSO.");
    await recordAdminAction(
      {
        actor: input.actor,
        action: "organization.disable_sso_requirement",
        target: { type: "organization", id: org.id },
        organizationId: org.id,
        reason,
        metadata: { slug: org.slug },
      },
      tx,
    );
  });
}

/**
 * Stops SSO sign-in for the organization (a compromised or misbehaving IdP): clears the
 * provider's `domainVerified` (Better Auth then refuses it) and the SSO requirement. The provider
 * configuration is kept; saving it again in the dashboard re-enables it.
 */
export async function disableOrganizationSso(input: {
  organizationId: string;
  reason: string;
  actor: AdminActor;
}): Promise<void> {
  const reason = normalizeReason(input.reason, true);
  await db.transaction(async (tx) => {
    const org = await requireOrganization(input.organizationId, tx);
    const disabled = await tx
      .update(ssoProvider)
      .set({ domainVerified: false })
      .where(and(eq(ssoProvider.organizationId, org.id), eq(ssoProvider.domainVerified, true)))
      .returning({ providerId: ssoProvider.providerId });
    if (disabled.length === 0) {
      throw new TenancyError("conflict", "This organization has no active SSO provider.");
    }
    await tx.update(organization).set({ requireSso: false }).where(eq(organization.id, org.id));
    // A compromised IdP's sessions must not keep counting as SSO (they satisfy 2FA).
    const providerIds = disabled.map((row) => row.providerId);
    const revokedSessions = await revokeSsoProviderSessions({ providerIds }, tx);
    await recordAdminAction(
      {
        actor: input.actor,
        action: "organization.disable_sso",
        target: { type: "organization", id: org.id },
        organizationId: org.id,
        reason,
        metadata: { slug: org.slug, providerIds, revokedSessions },
      },
      tx,
    );
  });
}

/**
 * Recovery: disconnects the organization's directory (SCIM), e.g. when it deprovisions people by
 * mistake. Its tokens stop working at once; members stay. Large directories are released in
 * batches, so this resumes until done (or reports `complete: false` — run it again).
 */
export async function disableOrganizationScim(input: {
  organizationId: string;
  reason: string;
  actor: AdminActor;
}): Promise<{ complete: boolean }> {
  const reason = normalizeReason(input.reason, true);
  const org = await requireOrganization(input.organizationId);
  const scim = await getOrganizationScim({ organizationId: org.id });
  if (!scim) throw new TenancyError("conflict", "This organization has no directory connected.");
  let result = { complete: false };
  for (let attempt = 0; attempt < 5 && !result.complete; attempt++) {
    result = await disconnectScim({ organizationId: org.id, actorId: input.actor.userId });
  }
  await recordAdminAction({
    actor: input.actor,
    action: "organization.disable_scim",
    target: { type: "organization", id: org.id },
    organizationId: org.id,
    reason,
    metadata: { slug: org.slug, connectionId: scim.connectionId, complete: result.complete },
  });
  return result;
}

export type AdminSessionRow = {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  impersonatedBy: string | null;
};

/** The user's unexpired sessions, newest first. Never selects the session token. */
export async function listUserSessionsForAdmin(userId: string): Promise<AdminSessionRow[]> {
  return db
    .select({
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      impersonatedBy: session.impersonatedBy,
    })
    .from(session)
    .where(and(eq(session.userId, userId), gt(session.expiresAt, new Date())))
    .orderBy(desc(session.createdAt));
}

export type AdminMembershipRow = {
  memberId: string;
  role: string;
  createdAt: Date;
  organization: { id: string; name: string; slug: string };
  suspended: boolean;
};

/** Every organization the user belongs to, oldest membership first. */
export async function listUserMembershipsForAdmin(userId: string): Promise<AdminMembershipRow[]> {
  const rows = await db
    .select({
      memberId: member.id,
      role: member.role,
      createdAt: member.createdAt,
      organization: { id: organization.id, name: organization.name, slug: organization.slug },
      suspendedAt: organizationSuspension.createdAt,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .leftJoin(organizationSuspension, eq(organizationSuspension.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt), asc(member.id));
  return rows.map(({ suspendedAt, ...row }) => ({ ...row, suspended: suspendedAt !== null }));
}

export type AdminApiKeyRow = {
  id: string;
  name: string | null;
  start: string | null;
  enabled: boolean;
  lastRequest: Date | null;
  createdAt: Date;
  project: { id: string; name: string; slug: string };
  environment: { id: string; name: string; slug: string; mode: "live" | "sandbox" };
};

/** Every environment-bound API key of the organization, newest first. Never selects the hash. */
export async function listOrganizationApiKeysForAdmin(
  organizationId: string,
): Promise<AdminApiKeyRow[]> {
  const rows = await db
    .select({
      id: apikey.id,
      name: apikey.name,
      start: apikey.start,
      enabled: apikey.enabled,
      lastRequest: apikey.lastRequest,
      createdAt: apikey.createdAt,
      project: { id: project.id, name: project.name, slug: project.slug },
      environment: {
        id: environment.id,
        name: environment.name,
        slug: environment.slug,
        mode: environment.mode,
      },
    })
    .from(environmentApiKey)
    .innerJoin(apikey, eq(apikey.id, environmentApiKey.apiKeyId))
    .innerJoin(environment, eq(environment.id, environmentApiKey.environmentId))
    .innerJoin(
      project,
      and(eq(project.id, environment.projectId), eq(project.organizationId, organizationId)),
    )
    .where(
      and(eq(environment.organizationId, organizationId), eq(apikey.referenceId, organizationId)),
    )
    .orderBy(desc(apikey.createdAt), desc(apikey.id));
  return rows.map((row) => ({ ...row, enabled: row.enabled !== false }));
}

/**
 * Deletes one of the organization's API keys (e.g. a leaked key the organization can't reach).
 * Better Auth's delete endpoint needs a member session, so the row is removed directly; its
 * environment binding cascades.
 */
export async function revokeApiKeyAsAdmin(input: {
  organizationId: string;
  keyId: string;
  reason: string;
  actor: AdminActor;
}): Promise<void> {
  const reason = normalizeReason(input.reason, true);
  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(apikey)
      .where(
        and(
          eq(apikey.id, input.keyId),
          eq(apikey.referenceId, input.organizationId),
          sql`exists (select 1 from ${environmentApiKey} where ${environmentApiKey.apiKeyId} = ${apikey.id})`,
        ),
      )
      .returning({ id: apikey.id, name: apikey.name, start: apikey.start });
    if (!deleted) throw new TenancyError("not_found", "API key not found.");
    await recordAdminAction(
      {
        actor: input.actor,
        action: "api_key.revoke",
        target: { type: "api_key", id: deleted.id },
        organizationId: input.organizationId,
        reason,
        metadata: { name: deleted.name, start: deleted.start },
      },
      tx,
    );
  });
}

export type AdminOverview = {
  users: number;
  bannedUsers: number;
  admins: number;
  /** Users created in the last 24 hours / 7 days. */
  newUsersDay: number;
  newUsersWeek: number;
  organizations: number;
  suspendedOrganizations: number;
  /** Organizations created in the last 7 days. */
  newOrganizationsWeek: number;
};

/** Headline counts for the admin overview. */
export async function getAdminOverview(now: Date = new Date()): Promise<AdminOverview> {
  const day = new Date(now.getTime() - 86_400_000);
  const week = new Date(now.getTime() - 7 * 86_400_000);
  const [[users], [organizations]] = await Promise.all([
    db
      .select({
        users: count(),
        bannedUsers: sql<number>`count(*) filter (where ${activeBan})::int`,
        admins: sql<number>`count(*) filter (where ${isAdminRole})::int`,
        newUsersDay: sql<number>`count(*) filter (where ${user.createdAt} >= ${day.toISOString()})::int`,
        newUsersWeek: sql<number>`count(*) filter (where ${user.createdAt} >= ${week.toISOString()})::int`,
      })
      .from(user),
    db
      .select({
        organizations: count(),
        suspendedOrganizations: count(organizationSuspension.organizationId),
        newOrganizationsWeek: sql<number>`count(*) filter (where ${organization.createdAt} >= ${week.toISOString()})::int`,
      })
      .from(organization)
      .leftJoin(organizationSuspension, eq(organizationSuspension.organizationId, organization.id)),
  ]);
  return {
    users: users?.users ?? 0,
    bannedUsers: users?.bannedUsers ?? 0,
    admins: users?.admins ?? 0,
    newUsersDay: users?.newUsersDay ?? 0,
    newUsersWeek: users?.newUsersWeek ?? 0,
    organizations: organizations?.organizations ?? 0,
    suspendedOrganizations: organizations?.suspendedOrganizations ?? 0,
    newOrganizationsWeek: organizations?.newOrganizationsWeek ?? 0,
  };
}

// --- Sign-ups and takedowns ------------------------------------------------------------------

export type AdminUserSummary = {
  id: string;
  email: string;
  banned: boolean;
  createdAt: Date;
  organizations: { id: string; name: string; slug: string; role: string; suspended: boolean }[];
};

/**
 * The accounts of the given addresses (sign-up assessments name an address, not a user), keyed by
 * the lowercased address, with every organization each belongs to.
 */
export async function usersByEmailForAdmin(
  emails: string[],
): Promise<Map<string, AdminUserSummary>> {
  const result = new Map<string, AdminUserSummary>();
  const candidates = [...new Set(emails.flatMap((address) => [address, address.toLowerCase()]))];
  if (candidates.length === 0) return result;
  const users = await db
    .select({
      id: user.id,
      email: user.email,
      banned: user.banned,
      banExpires: user.banExpires,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(inArray(user.email, candidates));
  if (users.length === 0) return result;
  const memberships = await db
    .select({
      userId: member.userId,
      role: member.role,
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      suspendedAt: organizationSuspension.createdAt,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .leftJoin(organizationSuspension, eq(organizationSuspension.organizationId, organization.id))
    .where(
      inArray(
        member.userId,
        users.map((row) => row.id),
      ),
    )
    .orderBy(asc(member.createdAt), asc(member.id));
  for (const row of users) {
    const { banned } = toAdminUser({
      ...row,
      name: "",
      emailVerified: false,
      role: null,
      banReason: null,
      twoFactorEnabled: false,
      ownedOrganizationLimit: null,
    });
    result.set(row.email.toLowerCase(), {
      id: row.id,
      email: row.email,
      banned,
      createdAt: row.createdAt,
      organizations: memberships
        .filter((membership) => membership.userId === row.id)
        .map(({ userId: _userId, suspendedAt, ...membership }) => ({
          ...membership,
          suspended: suspendedAt !== null,
        })),
    });
  }
  return result;
}

export type TakedownMember = {
  userId: string;
  email: string;
  role: string;
  /** Why the takedown leaves this member alone; null when they are banned with it. */
  keptBecause: string | null;
};

export type TakedownPlan = {
  suspended: boolean;
  deleting: boolean;
  members: TakedownMember[];
  apiKeys: AdminApiKeyRow[];
};

/**
 * What taking an organization down does: suspend it, revoke its API keys, and ban the members who
 * have nothing else on the platform. Members who are platform admins, already banned, or also
 * belong to an organization that is neither suspended nor being deleted are kept.
 */
export async function planOrganizationTakedown(organizationId: string): Promise<TakedownPlan> {
  const [members, apiKeys, detail] = await Promise.all([
    db
      .select({
        userId: member.userId,
        email: user.email,
        role: member.role,
        userRole: user.role,
        banned: user.banned,
        banExpires: user.banExpires,
        otherOrganizations: sql<string[]>`coalesce(array(
          select ${organization.name} from ${member} as other_member
          inner join ${organization} on ${organization.id} = other_member.organization_id
          where other_member.user_id = ${member.userId}
            and other_member.organization_id <> ${organizationId}
            and not exists (select 1 from ${organizationSuspension}
              where ${organizationSuspension.organizationId} = ${organization.id})
            and not exists (select 1 from ${organizationDeletion}
              where ${organizationDeletion.organizationId} = ${organization.id}
                and ${organizationDeletion.status} = 'pending')
          order by ${organization.name}
        ), '{}')`,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, organizationId))
      .orderBy(asc(member.createdAt), asc(member.id)),
    listOrganizationApiKeysForAdmin(organizationId),
    getOrganizationForAdmin(organizationId),
  ]);
  return {
    suspended: detail?.suspension != null,
    deleting: detail?.deletion != null,
    apiKeys,
    members: members.map((row) => {
      const banned =
        row.banned === true && (row.banExpires === null || row.banExpires.getTime() > Date.now());
      const admin = (row.userRole ?? "").split(",").includes("admin");
      const keptBecause = admin
        ? "platform admin"
        : banned
          ? "already banned"
          : row.otherOrganizations.length > 0
            ? `also in ${row.otherOrganizations.join(", ")}`
            : null;
      return { userId: row.userId, email: row.email, role: row.role, keptBecause };
    }),
  };
}
