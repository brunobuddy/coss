/**
 * Organization deletion. Requesting it locks everyone out at once, in one transaction: the
 * organization loses its members, invitations, API keys and SSO provider (with the accounts linked
 * to it), so no dashboard page, Better Auth endpoint or API request reaches it any more. The
 * worker then releases its provider resources, deletes its data in batches and finally the
 * organization row (`runDueOrganizationDeletions`); its slug is free after that.
 *
 * Imports only `@coss/db`, so the worker can use it without loading Better Auth.
 */
import { db, type Executor, schema } from "@coss/db";
import { and, asc, eq, inArray, isNotNull, lte, notInArray, type SQL, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { TenancyError } from "./errors.ts";

const {
  account,
  apikey,
  billingUsage,
  billingUsageAttribution,
  contentScreening,
  contact,
  email,
  emailBatch,
  emailSubaccount,
  emailSuppression,
  formFakeObject,
  formStoreCleanup,
  formSubmission,
  signFakeObject,
  signRequest,
  signStoreCleanup,
  signTemplate,
  smsInboundReceipt,
  smsMessage,
  smsReceived,
  smsSuppression,
  verifyRequest,
  environment,
  hookAttempt,
  hookDelivery,
  hookMessage,
  hookPortalSession,
  inboundFakeObject,
  invitation,
  logEntry,
  logDrain,
  logDrainRecord,
  logDrainBatch,
  orgAuditEvent,
  member,
  organization,
  riskAssessment,
  riskIdentity,
  riskListEntry,
  riskReport,
  riskUserNetwork,
  schedulingBooking,
  schedulingBusyInterval,
  schedulingLimitBucket,
  organizationDeletion,
  organizationSuspension,
  inboxThread,
  receivedEmail,
  scimConnectionBinding,
  scimGroup,
  scimIdentityTombstone,
  scimManagedConnection,
  scimManagedCredential,
  scimSubject,
  scimUser,
  session,
  ssoProvider,
  webhookEndpoint,
  webhookMessage,
} = schema;

export type OrganizationDeletion = typeof organizationDeletion.$inferSelect;

/**
 * Removes every way into the organization: API keys (they have no FK to it), the SSO provider with
 * the accounts linked to it (as Better Auth's delete-provider does) and the sessions it created,
 * invitations and members.
 * Idempotent; the worker repeats it before deleting the organization, in case a request that
 * started before the deletion (an invitation being accepted, an SSO sign-in) added something.
 */
export async function revokeOrganizationAccess(
  organizationId: string,
  executor: Executor = db,
): Promise<void> {
  // SCIM tokens have no organization FK; revoke them in the same lockout transaction.
  const connections = executor
    .select({ id: scimManagedConnection.id })
    .from(scimManagedConnection)
    .where(eq(scimManagedConnection.provisioningDomainId, organizationId));
  await executor
    .delete(scimManagedCredential)
    .where(inArray(scimManagedCredential.connectionRecordId, connections));
  await executor.delete(apikey).where(eq(apikey.referenceId, organizationId));
  // Hooks portal sessions are signed in without any member or key behind them.
  await executor
    .delete(hookPortalSession)
    .where(eq(hookPortalSession.organizationId, organizationId));
  const providers = await executor
    .delete(ssoProvider)
    .where(eq(ssoProvider.organizationId, organizationId))
    .returning({ providerId: ssoProvider.providerId });
  if (providers.length > 0) {
    const providerIds = providers.map((row) => row.providerId);
    await executor.delete(account).where(inArray(account.providerId, providerIds));
    // Sessions the IdP created (`revokeSsoProviderSessions`, not imported: it loads Better Auth).
    await executor.delete(session).where(inArray(session.ssoProviderId, providerIds));
  }
  await executor.delete(invitation).where(eq(invitation.organizationId, organizationId));
  await executor.delete(member).where(eq(member.organizationId, organizationId));
  // Better Auth's active organization is never relied on, but don't leave it pointing here.
  await executor
    .update(session)
    .set({ activeOrganizationId: null })
    .where(eq(session.activeOrganizationId, organizationId));
}

/**
 * Starts deleting an organization (see the module comment); there is no undo. A suspended
 * organization can only be deleted by a platform admin, so its domains and history stay put
 * while it is under review. Pass `executor` to commit it with an audit entry.
 */
export async function requestOrganizationDeletion(
  input: {
    organizationId: string;
    actor: { userId: string; email: string };
    byPlatformAdmin?: boolean;
  },
  executor?: Executor,
): Promise<OrganizationDeletion> {
  const run = async (tx: Executor) => {
    // Serializes with renames and with a concurrent request for the same organization.
    const [org] = await tx
      .select({ id: organization.id, name: organization.name, slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, input.organizationId))
      .for("update")
      .limit(1);
    if (!org) throw new TenancyError("not_found", "Organization not found.");
    if (!input.byPlatformAdmin) {
      const [suspension] = await tx
        .select({ id: organizationSuspension.organizationId })
        .from(organizationSuspension)
        .where(eq(organizationSuspension.organizationId, org.id))
        .limit(1);
      if (suspension) {
        throw new TenancyError("forbidden", "A suspended organization can't be deleted.");
      }
    }
    const [deletion] = await tx
      .insert(organizationDeletion)
      .values({
        organizationId: org.id,
        organizationName: org.name,
        organizationSlug: org.slug,
        requestedByUserId: input.actor.userId,
        requestedByEmail: input.actor.email,
        byPlatformAdmin: input.byPlatformAdmin ?? false,
      })
      .onConflictDoNothing({ target: organizationDeletion.organizationId })
      .returning();
    if (!deletion) {
      throw new TenancyError("conflict", "This organization is already being deleted.");
    }
    await revokeOrganizationAccess(org.id, tx);
    return deletion;
  };
  return executor ? run(executor) : db.transaction(run);
}

/** The organization's deletion request (pending or completed), or `null`. */
export async function getOrganizationDeletion(
  organizationId: string,
): Promise<OrganizationDeletion | null> {
  const [row] = await db
    .select()
    .from(organizationDeletion)
    .where(eq(organizationDeletion.organizationId, organizationId))
    .limit(1);
  return row ?? null;
}

/** Whether a deletion of the organization is pending (Better Auth hooks, SSO sign-in). */
export async function isOrganizationBeingDeleted(
  organizationId: string,
  executor: Executor = db,
): Promise<boolean> {
  const [row] = await executor
    .select({ id: organizationDeletion.id })
    .from(organizationDeletion)
    .where(
      and(
        eq(organizationDeletion.organizationId, organizationId),
        eq(organizationDeletion.status, "pending"),
      ),
    )
    .limit(1);
  return row !== undefined;
}

// --- Teardown (worker) ------------------------------------------------------------------------

/** Rows deleted per statement, so no single statement holds locks on a whole table for long. */
export const DELETION_BATCH_SIZE = 1000;
/** A claim's lease, renewed between batches; an expired one is taken over by another worker. */
export const DELETION_LEASE_MS = 10 * 60_000;
const MAX_BACKOFF_MS = 60 * 60_000;
const ERROR_MAX_LENGTH = 1000;

export type OrganizationTeardownDeps = {
  /**
   * Releases what the organization holds at providers (email: its domain identities and SES
   * tenant, `releaseOrganizationEmailResources`) and stops its sends first. Runs before any data
   * is deleted and on every retry, so it must be idempotent.
   */
  releaseProviderResources: (
    organizationId: string,
    /** Call between provider operations to stop immediately if the claim was lost. */
    assertLease: () => Promise<void>,
  ) => Promise<void>;
};

type Claimed = typeof organizationDeletion.$inferSelect;

async function claimDue(
  now: Date | undefined,
  attemptedIds: string[],
  scope?: { organizationIds: string[] },
): Promise<Claimed[]> {
  const due = db
    .select({ id: organizationDeletion.id })
    .from(organizationDeletion)
    .where(
      and(
        eq(organizationDeletion.status, "pending"),
        attemptedIds.length ? notInArray(organizationDeletion.id, attemptedIds) : undefined,
        isNotNull(organizationDeletion.nextAttemptAt),
        // Without an explicit `now`, the database's own clock: `next_attempt_at` defaults to its
        // `now()` (microseconds), which a JS Date (milliseconds) taken in the same millisecond
        // would see as still in the future.
        now
          ? lte(organizationDeletion.nextAttemptAt, now)
          : sql`${organizationDeletion.nextAttemptAt} <= clock_timestamp()`,
        scope ? inArray(organizationDeletion.organizationId, scope.organizationIds) : undefined,
      ),
    )
    .orderBy(asc(organizationDeletion.nextAttemptAt))
    .limit(1)
    .for("update", { skipLocked: true });
  return db
    .update(organizationDeletion)
    .set({
      nextAttemptAt: sql`clock_timestamp() + ${DELETION_LEASE_MS} * interval '1 millisecond'`,
      attemptCount: sql`${organizationDeletion.attemptCount} + 1`,
    })
    .where(inArray(organizationDeletion.id, due))
    .returning();
}

class DeletionLeaseLost extends Error {
  constructor() {
    super("Organization deletion lease lost.");
  }
}

// The attempt count increases atomically on each claim and fences out previous workers.
function ownedClaim(deletion: Claimed) {
  return and(
    eq(organizationDeletion.id, deletion.id),
    eq(organizationDeletion.status, "pending"),
    eq(organizationDeletion.attemptCount, deletion.attemptCount),
    sql`${organizationDeletion.nextAttemptAt} > clock_timestamp()`,
  );
}

async function renewLease(deletion: Claimed, executor: Executor = db): Promise<void> {
  const renewed = await executor
    .update(organizationDeletion)
    .set({
      nextAttemptAt: sql`clock_timestamp() + ${DELETION_LEASE_MS} * interval '1 millisecond'`,
    })
    .where(ownedClaim(deletion))
    .returning({ id: organizationDeletion.id });
  if (renewed.length === 0) throw new DeletionLeaseLost();
}

/** Keep the lease alive even when a provider call takes longer than the lease. */
async function releaseWithHeartbeat(deletion: Claimed, deps: OrganizationTeardownDeps) {
  await renewLease(deletion);
  let failure: unknown;
  let pending: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (pending || failure) return;
    pending = renewLease(deletion)
      .catch((error: unknown) => {
        failure = error;
      })
      .finally(() => {
        pending = undefined;
      });
  }, DELETION_LEASE_MS / 3);
  try {
    await deps.releaseProviderResources(deletion.organizationId, async () => {
      if (failure) throw failure;
      await renewLease(deletion);
    });
  } finally {
    clearInterval(timer);
    await pending;
  }
  if (failure) throw failure;
  await renewLease(deletion);
}

/**
 * Deletes the rows of `table` matching `where`, `batchSize` at a time (their children go by FK
 * cascade). Returns false when `signal` aborted before it finished.
 */
async function deleteInBatches(
  deletion: Claimed,
  table: PgTable,
  id: PgColumn,
  where: SQL | undefined,
  batchSize: number,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  for (;;) {
    if (signal?.aborted) return false;
    const deleted = await db.transaction(async (tx) => {
      // Hold the claim row lock through the batch, including a slow FK cascade.
      await renewLease(deletion, tx);
      const batch = tx.select({ id }).from(table).where(where).limit(batchSize);
      if (table === scimUser) {
        const users = await tx
          .select({ id: scimUser.id })
          .from(scimUser)
          .where(where)
          .limit(batchSize);
        const ids = users.map((row) => row.id);
        // Subjects belong to shared user accounts. Keep them, but clear the removed directory source.
        await tx
          .update(scimSubject)
          .set({
            profileSourceId: null,
            revision: sql`${scimSubject.revision} + 1`,
          })
          .where(inArray(scimSubject.profileSourceId, ids));
        return tx.delete(table).where(inArray(id, ids)).returning({ id });
      }
      return tx.delete(table).where(inArray(id, batch)).returning({ id });
    });
    if (deleted.length < batchSize) return true;
  }
}

/**
 * `deleteInBatches` for a table whose rows are keyed by two columns: a partitioned table's
 * `(partition column, id)` (deleting by both lets each batch touch only the partitions its rows
 * are in), or a composite primary key.
 */
async function deletePartitionedInBatches(
  deletion: Claimed,
  table: PgTable,
  partition: PgColumn,
  id: PgColumn,
  where: SQL | undefined,
  batchSize: number,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  for (;;) {
    if (signal?.aborted) return false;
    const deleted = await db.transaction(async (tx) => {
      await renewLease(deletion, tx);
      const batch = tx.select({ partition, id }).from(table).where(where).limit(batchSize);
      return tx.delete(table).where(sql`(${partition}, ${id}) in (${batch})`).returning({ id });
    });
    if (deleted.length < batchSize) return true;
  }
}

/**
 * Deletes the organization's bulky data (emails with their recipients, events, attachments and
 * links; received emails; webhook messages with their deliveries; Hooks messages, deliveries and
 * attempts; suppressions; contacts; screenings) in batches, one
 * environment at a time, along indexed columns. Everything else is small and goes with the
 * organization row. Returns false when `signal` aborted first.
 */
async function deleteOrganizationData(
  deletion: Claimed,
  batchSize: number,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  const organizationId = deletion.organizationId;
  // SCIM tables are keyed by provisioning domain, with no organization FK. User deletion
  // cascades to grants/group membership; connection deletion cascades to token/event history.
  for (const table of [
    scimUser,
    scimGroup,
    scimIdentityTombstone,
    scimConnectionBinding,
    scimManagedConnection,
  ]) {
    if (
      !(await deleteInBatches(
        deletion,
        table,
        table.id,
        eq(table.provisioningDomainId, organizationId),
        batchSize,
        signal,
      ))
    )
      return false;
  }
  // One receipt per inbound text message, routed or not: organization-wide.
  if (
    !(await deletePartitionedInBatches(
      deletion,
      smsInboundReceipt,
      smsInboundReceipt.provider,
      smsInboundReceipt.providerMessageId,
      eq(smsInboundReceipt.organizationId, organizationId),
      batchSize,
      signal,
    ))
  )
    return false;
  const environments = await db
    .select({ id: environment.id })
    .from(environment)
    .where(eq(environment.organizationId, organizationId));
  for (const { id: environmentId } of environments) {
    const drains = await db
      .select({ id: logDrain.id })
      .from(logDrain)
      .where(
        and(eq(logDrain.environmentId, environmentId), eq(logDrain.organizationId, organizationId)),
      );
    for (const drain of drains) {
      // Records are the bulky part; deleting batches also cascades their attempt history.
      for (const table of [logDrainRecord, logDrainBatch]) {
        if (
          !(await deleteInBatches(
            deletion,
            table,
            table.id,
            and(eq(table.drainId, drain.id), eq(table.organizationId, organizationId)),
            batchSize,
            signal,
          ))
        )
          return false;
      }
    }
    const steps: [PgTable, PgColumn, SQL | undefined][] = [
      [
        logEntry,
        logEntry.id,
        and(eq(logEntry.environmentId, environmentId), eq(logEntry.organizationId, organizationId)),
      ],
      [
        email,
        email.id,
        and(eq(email.environmentId, environmentId), eq(email.organizationId, organizationId)),
      ],
      [
        receivedEmail,
        receivedEmail.id,
        and(
          eq(receivedEmail.environmentId, environmentId),
          eq(receivedEmail.organizationId, organizationId),
        ),
      ],
      // Their messages went with the emails and received emails above.
      [
        inboxThread,
        inboxThread.id,
        and(
          eq(inboxThread.environmentId, environmentId),
          eq(inboxThread.organizationId, organizationId),
        ),
      ],
      [
        emailBatch,
        emailBatch.id,
        and(
          eq(emailBatch.environmentId, environmentId),
          eq(emailBatch.organizationId, organizationId),
        ),
      ],
      [
        webhookMessage,
        webhookMessage.id,
        and(
          eq(webhookMessage.environmentId, environmentId),
          eq(webhookMessage.organizationId, organizationId),
        ),
      ],
      [
        webhookEndpoint,
        webhookEndpoint.id,
        and(
          eq(webhookEndpoint.environmentId, environmentId),
          eq(webhookEndpoint.organizationId, organizationId),
        ),
      ],
      [
        emailSuppression,
        emailSuppression.id,
        and(
          eq(emailSuppression.environmentId, environmentId),
          eq(emailSuppression.organizationId, organizationId),
        ),
      ],
      // Email sub-accounts: their suppressions went above, their domains and tenants with the
      // provider resources.
      [
        emailSubaccount,
        emailSubaccount.id,
        and(
          eq(emailSubaccount.environmentId, environmentId),
          eq(emailSubaccount.organizationId, organizationId),
        ),
      ],
      [
        smsMessage,
        smsMessage.id,
        and(
          eq(smsMessage.environmentId, environmentId),
          eq(smsMessage.organizationId, organizationId),
        ),
      ],
      [
        smsReceived,
        smsReceived.id,
        and(
          eq(smsReceived.environmentId, environmentId),
          eq(smsReceived.organizationId, organizationId),
        ),
      ],
      [
        smsSuppression,
        smsSuppression.id,
        and(
          eq(smsSuppression.environmentId, environmentId),
          eq(smsSuppression.organizationId, organizationId),
        ),
      ],
      // Verifications (their sends cascade).
      [
        verifyRequest,
        verifyRequest.id,
        and(
          eq(verifyRequest.environmentId, environmentId),
          eq(verifyRequest.organizationId, organizationId),
        ),
      ],
      // Contacts (their audience memberships and topic choices cascade).
      [
        contact,
        contact.id,
        and(eq(contact.environmentId, environmentId), eq(contact.organizationId, organizationId)),
      ],
      // Form submissions (their files' rows and deliveries cascade; the bytes go with the store's
      // prefix in `releaseProviderResources`, or below without a bucket).
      [
        formSubmission,
        formSubmission.id,
        and(
          eq(formSubmission.environmentId, environmentId),
          eq(formSubmission.organizationId, organizationId),
        ),
      ],
      // Bookings (their attendees, claims, history, calendar events and notifications cascade).
      [
        schedulingBooking,
        schedulingBooking.id,
        and(
          eq(schedulingBooking.environmentId, environmentId),
          eq(schedulingBooking.organizationId, organizationId),
        ),
      ],
      // Risk assessments (their feedback cascades) and what the environment remembers.
      ...[riskAssessment, riskIdentity, riskReport, riskListEntry, riskUserNetwork].map(
        (table) =>
          [
            table,
            table.id,
            and(eq(table.environmentId, environmentId), eq(table.organizationId, organizationId)),
          ] as [PgTable, PgColumn, SQL | undefined],
      ),
    ];
    for (const [table, id, where] of steps) {
      if (!(await deleteInBatches(deletion, table, id, where, batchSize, signal))) return false;
    }
    // Hooks messages, deliveries and attempts: partitioned, with no FK between them (attempts and
    // deliveries none to the environment either), so each goes explicitly, children first. The
    // small Hooks tables go with the environment.
    const hookSteps: [PgTable, PgColumn, PgColumn, SQL | undefined][] = [
      [
        hookAttempt,
        hookAttempt.messageCreatedAt,
        hookAttempt.id,
        and(
          eq(hookAttempt.environmentId, environmentId),
          eq(hookAttempt.organizationId, organizationId),
        ),
      ],
      [
        hookDelivery,
        hookDelivery.messageCreatedAt,
        hookDelivery.id,
        and(
          eq(hookDelivery.environmentId, environmentId),
          eq(hookDelivery.organizationId, organizationId),
        ),
      ],
      [
        hookMessage,
        hookMessage.createdAt,
        hookMessage.id,
        and(
          eq(hookMessage.environmentId, environmentId),
          eq(hookMessage.organizationId, organizationId),
        ),
      ],
    ];
    for (const [table, partition, id, where] of hookSteps) {
      if (
        !(await deletePartitionedInBatches(
          deletion,
          table,
          partition,
          id,
          where,
          batchSize,
          signal,
        ))
      )
        return false;
    }
  }
  if (
    !(await deleteInBatches(
      deletion,
      orgAuditEvent,
      orgAuditEvent.id,
      eq(orgAuditEvent.organizationId, organizationId),
      batchSize,
      signal,
    ))
  )
    return false;
  // The fake provider's received email content (S3 content goes in `releaseProviderResources`).
  if (
    !(await deleteInBatches(
      deletion,
      inboundFakeObject,
      inboundFakeObject.key,
      eq(inboundFakeObject.organizationId, organizationId),
      batchSize,
      signal,
    ))
  )
    return false;
  // Sign's requests before the environments cascade into their documents: a request keeps its
  // documents from deletion (`sign_request_document` restricts), and the cascade can't order it.
  // Each request's signers, fields, events and sessions go with it.
  if (
    !(await deleteInBatches(
      deletion,
      signRequest,
      signRequest.id,
      eq(signRequest.organizationId, organizationId),
      batchSize,
      signal,
    ))
  )
    return false;
  // Templates keep their documents the same way (`sign_template_document` restricts).
  if (
    !(await deleteInBatches(
      deletion,
      signTemplate,
      signTemplate.id,
      eq(signTemplate.organizationId, organizationId),
      batchSize,
      signal,
    ))
  )
    return false;
  // Sign's documents without a bucket (development): their bytes. Rows cascade with the environments.
  if (
    !(await deleteInBatches(
      deletion,
      signFakeObject,
      signFakeObject.key,
      eq(signFakeObject.organizationId, organizationId),
      batchSize,
      signal,
    ))
  )
    return false;
  // Scheduling's busy times (many rows per host, otherwise a slow cascade), and limit buckets (no FK).
  if (
    !(await deleteInBatches(
      deletion,
      schedulingBusyInterval,
      schedulingBusyInterval.id,
      eq(schedulingBusyInterval.organizationId, organizationId),
      batchSize,
      signal,
    ))
  )
    return false;
  if (
    !(await deleteInBatches(
      deletion,
      schedulingLimitBucket,
      schedulingLimitBucket.scopeId,
      eq(schedulingLimitBucket.organizationId, organizationId),
      batchSize,
      signal,
    ))
  )
    return false;
  // Forms' uploads without a bucket (development), and pending store deletions.
  for (const table of [formFakeObject, formStoreCleanup]) {
    if (
      !(await deleteInBatches(
        deletion,
        table,
        table.key,
        eq(table.organizationId, organizationId),
        batchSize,
        signal,
      ))
    )
      return false;
  }
  // Sign's pending store deletions: the organization's whole prefix goes anyway.
  if (
    !(await deleteInBatches(
      deletion,
      signStoreCleanup,
      signStoreCleanup.key,
      eq(signStoreCleanup.organizationId, organizationId),
      batchSize,
      signal,
    ))
  )
    return false;
  // Hourly usage counters and their attribution (billing): no id, so batches go by row address.
  // The final invoice was made first (`releaseProviderResources`), and invoices keep their months'
  // totals.
  for (const table of [billingUsage, billingUsageAttribution]) {
    for (;;) {
      if (signal?.aborted) return false;
      const deleted = await db.transaction(async (tx) => {
        await renewLease(deletion, tx);
        const result = await tx.execute(
          sql`delete from ${table} where ctid in (select ctid from ${table} where ${table.organizationId} = ${organizationId} limit ${batchSize})`,
        );
        return result.rowCount ?? 0;
      });
      if (deleted < batchSize) break;
    }
  }
  return deleteInBatches(
    deletion,
    contentScreening,
    contentScreening.id,
    eq(contentScreening.organizationId, organizationId),
    batchSize,
    signal,
  );
}

async function tearDown(
  deletion: Claimed,
  deps: OrganizationTeardownDeps,
  batchSize: number,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  const organizationId = deletion.organizationId;
  // Again, in case a request that started before the deletion let someone back in.
  await db.transaction(async (tx) => {
    await renewLease(deletion, tx);
    await revokeOrganizationAccess(organizationId, tx);
  });
  await releaseWithHeartbeat(deletion, deps);
  if (!(await deleteOrganizationData(deletion, batchSize, signal))) return false;
  await db.transaction(async (tx) => {
    await renewLease(deletion, tx);
    await revokeOrganizationAccess(organizationId, tx);
    // Cascades to everything left: projects, environments, domains, tenant, standing, history…
    await tx.delete(organization).where(eq(organization.id, organizationId));
    await tx
      .update(organizationDeletion)
      .set({ status: "completed", completedAt: new Date(), nextAttemptAt: null, lastError: null })
      .where(
        and(
          eq(organizationDeletion.id, deletion.id),
          eq(organizationDeletion.attemptCount, deletion.attemptCount),
        ),
      );
  });
  return true;
}

/**
 * System-level (worker): carries out pending organization deletions. Each is leased first, so
 * concurrent workers don't run the same one; a failure is recorded and retried with backoff (1,
 * 2, 4… minutes, at most hourly) until it succeeds. Once `signal` aborts (shutdown), a teardown
 * stops between batches and is picked up again right away by the next run. `scope` limits the
 * scan to some organizations (tests). Returns how many deletions it claimed.
 */
export async function runDueOrganizationDeletions(
  opts: {
    limit?: number;
    now?: Date;
    batchSize?: number;
    signal?: AbortSignal;
    scope?: { organizationIds: string[] };
  },
  deps: OrganizationTeardownDeps,
): Promise<number> {
  const attemptedIds: string[] = [];
  while (attemptedIds.length < (opts.limit ?? 5) && !opts.signal?.aborted) {
    const [deletion] = await claimDue(opts.now, attemptedIds, opts.scope);
    if (!deletion) break;
    attemptedIds.push(deletion.id);
    try {
      if (
        opts.signal?.aborted ||
        !(await tearDown(deletion, deps, opts.batchSize ?? DELETION_BATCH_SIZE, opts.signal))
      ) {
        await db
          .update(organizationDeletion)
          .set({ nextAttemptAt: new Date() })
          .where(ownedClaim(deletion));
      }
    } catch (error) {
      if (error instanceof DeletionLeaseLost) continue;
      console.error(
        `[tenancy:deletion] deleting organization ${deletion.organizationId} failed:`,
        error,
      );
      const backoff = Math.min(60_000 * 2 ** (deletion.attemptCount - 1), MAX_BACKOFF_MS);
      const message = error instanceof Error ? error.message : String(error);
      await db
        .update(organizationDeletion)
        .set({
          nextAttemptAt: new Date(Date.now() + backoff),
          lastError: message.slice(0, ERROR_MAX_LENGTH) || "Teardown failed.",
        })
        .where(ownedClaim(deletion));
    }
  }
  return attemptedIds.length;
}
