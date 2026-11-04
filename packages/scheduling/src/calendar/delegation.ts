/**
 * Calendar delegation: an admin authorizes once, and every host on the domain gets their calendar
 * with no consent screen. A host gets an ordinary connection, so sync, writes and availability don't
 * know the difference; only `clientFor` does.
 *
 * A connection's mailbox is stamped when it's made. `email` is "never an identity", so changing it
 * later moves nothing: only `calendar_account` does, and not while bookings are live (`hosts.ts`).
 */
import { db, type Executor, schema } from "@coss/db";
import { ID_PREFIXES, isId } from "@coss/db/id";
import { enqueueNotification } from "@coss/notifications";
import { and, asc, eq, inArray, isNull, lt, lte, notExists, or, sql } from "drizzle-orm";
import { SchedulingError } from "../errors.ts";
import type {
  CalendarDelegationObjectOutput,
  CreateCalendarDelegationRequestOutput,
  UpdateCalendarDelegationRequestOutput,
} from "../schemas.ts";
import type { SchedulingEnvironment } from "../types.ts";
import { type CalendarClient, CalendarError, type RemoteCalendar } from "./client.ts";
import {
  addRemoteCalendars,
  type CalendarDeps,
  type ConnectionRow,
  delegatedClient,
  delegationCredentials,
  encryptCredentials,
  fetcherOf,
  nowMs,
  pushWebhookUrl,
  recordCalendarEvent,
  releaseConnection,
  SYNC_HORIZON_DAYS,
} from "./connections.ts";
import {
  checkMailbox,
  type DelegationRow,
  probeDelegation,
  restoreDelegation,
  settleRefusal,
} from "./delegation-failures.ts";
import {
  DELEGATION_SCOPES,
  type DelegationCredentials,
  mailboxDomain,
  mintDelegatedToken,
  normalizeMailbox,
  parseMicrosoftCredentials,
  parseServiceAccountKey,
} from "./delegation-tokens.ts";
import { insertBusyIntervals, nextReadAt, openChannel } from "./sync.ts";

const {
  schedulingBusyInterval,
  schedulingCalendar,
  schedulingCalendarConnection,
  schedulingCalendarDelegation,
  schedulingHost,
} = schema;

type Scope = Pick<SchedulingEnvironment, "organizationId" | "environmentId">;
type Scan = { limit?: number; scope?: { organizationIds: readonly string[] } };

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
// Each host costs a few provider calls, so a big domain arrives over minutes without crowding out
// everyone else's reads.
const HOSTS_PER_RUN = 20;
const REMOVALS_PER_RUN = 50;
const RUN_BUDGET_MS = 2 * MINUTE_MS;
const LEASE_MS = 5 * MINUTE_MS;
const IDLE_MS = 5 * MINUTE_MS;
const BACKOFF_MS = 5 * MINUTE_MS;
const MAILBOX_RETRY_MS = 60 * MINUTE_MS;
const SECRET_WARNING_MS = 14 * DAY_MS;

export { DELEGATION_SCOPES };

const invalid = (message: string, param: string) =>
  new SchedulingError("invalid_calendar_delegation", message, { param });

const isUniqueViolation = (error: unknown): boolean => {
  const code = (error as { code?: string; cause?: { code?: string } }).cause?.code;
  return code === "23505" || (error as { code?: string }).code === "23505";
};

const refusedMessages: Record<string, string> = {
  unauthorized_client:
    "The client ID isn't authorized for these scopes yet. Authorizing can take up to 24 hours to apply.",
  access_denied:
    "The client ID isn't authorized for these scopes yet. Authorizing can take up to 24 hours to apply.",
  invalid_client: "The provider doesn't recognize these credentials.",
  invalid_signature: "Google refused this key. It may have been deleted.",
  invalid_tenant: "Microsoft doesn't recognize this tenant.",
  invalid_request: "Microsoft doesn't recognize this tenant or app.",
  secret_expired: "This client secret has expired.",
  accessNotConfigured: "The Google Calendar API isn't enabled in this service account's project.",
  mailbox_refused: "This mailbox isn't in the Workspace this service account is authorized for.",
  ErrorAccessDenied: "The app has no admin consent for Calendars.ReadWrite on this mailbox.",
  ErrorInvalidUser: "This address isn't a user in the tenant. Use their user principal name.",
};

const refusal = (error: CalendarError) =>
  new SchedulingError(
    "calendar_delegation_refused",
    refusedMessages[error.code] ?? `The provider refused this (${error.code}).`,
  );

async function countsOf(rows: readonly DelegationRow[]): Promise<Map<string, [number, number]>> {
  const counts = new Map<string, [number, number]>();
  if (rows.length === 0) return counts;
  const found = await db
    .select({
      delegationId: schedulingCalendarConnection.delegationId,
      connected: sql<number>`count(*) filter (where ${schedulingCalendarConnection.status} = 'active')::int`,
      failed: sql<number>`count(*) filter (where ${schedulingCalendarConnection.status} <> 'active')::int`,
    })
    .from(schedulingCalendarConnection)
    .where(
      and(
        eq(schedulingCalendarConnection.organizationId, (rows[0] as DelegationRow).organizationId),
        inArray(
          schedulingCalendarConnection.delegationId,
          rows.map((row) => row.id),
        ),
      ),
    )
    .groupBy(schedulingCalendarConnection.delegationId);
  for (const row of found) counts.set(row.delegationId as string, [row.connected, row.failed]);
  return counts;
}

function toObject(
  row: DelegationRow,
  counts: Map<string, [number, number]>,
): CalendarDelegationObjectOutput {
  const [connected, failed] = counts.get(row.id) ?? [0, 0];
  return {
    object: "scheduling.calendar_delegation",
    id: row.id,
    provider: row.provider,
    domain: row.domain,
    status: row.status,
    match_host_email: row.matchHostEmail,
    client_id: row.clientId,
    tenant_id: row.tenantId,
    scopes: [...DELEGATION_SCOPES[row.provider]],
    verified_account: row.verifyAccount,
    last_error_code: row.lastErrorCode,
    failing_since: row.failingSince?.toISOString() ?? null,
    secret_expires_at: row.secretExpiresAt?.toISOString() ?? null,
    hosts_connected: connected,
    hosts_failed: failed,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

const objectOf = async (row: DelegationRow) => toObject(row, await countsOf([row]));

async function findDelegation(
  executor: Executor,
  scope: Scope,
  id: string,
): Promise<DelegationRow> {
  const [row] = isId(ID_PREFIXES.schedulingCalendarDelegation, id)
    ? await executor
        .select()
        .from(schedulingCalendarDelegation)
        .where(
          and(
            eq(schedulingCalendarDelegation.id, id),
            eq(schedulingCalendarDelegation.organizationId, scope.organizationId),
            eq(schedulingCalendarDelegation.environmentId, scope.environmentId),
          ),
        )
    : [];
  if (!row) throw new SchedulingError("not_found", `No calendar delegation "${id}" here.`);
  return row;
}

export async function listCalendarDelegations(
  scope: Scope,
): Promise<CalendarDelegationObjectOutput[]> {
  const rows = await db
    .select()
    .from(schedulingCalendarDelegation)
    .where(
      and(
        eq(schedulingCalendarDelegation.organizationId, scope.organizationId),
        eq(schedulingCalendarDelegation.environmentId, scope.environmentId),
      ),
    )
    .orderBy(asc(schedulingCalendarDelegation.domain));
  const counts = await countsOf(rows);
  return rows.map((row) => toObject(row, counts));
}

export async function getCalendarDelegation(
  scope: Scope,
  id: string,
): Promise<CalendarDelegationObjectOutput> {
  return objectOf(await findDelegation(db, scope, id));
}

function credentialsFrom(params: CreateCalendarDelegationRequestOutput): DelegationCredentials {
  return params.provider === "google"
    ? parseServiceAccountKey(params.service_account_key)
    : parseMicrosoftCredentials({
        tenantId: params.tenant_id,
        clientId: params.client_id,
        clientSecret: params.client_secret,
      });
}

/** Stays `pending`: the admin needs the client ID this returns before there's anything to verify. */
export async function createCalendarDelegation(
  env: SchedulingEnvironment,
  params: CreateCalendarDelegationRequestOutput,
  deps: Pick<CalendarDeps, "secretsKeys">,
): Promise<CalendarDelegationObjectOutput> {
  const credentials = credentialsFrom(params);
  try {
    const [row] = await db
      .insert(schedulingCalendarDelegation)
      .values({
        organizationId: env.organizationId,
        projectId: env.projectId,
        environmentId: env.environmentId,
        provider: params.provider,
        domain: params.domain.toLowerCase(),
        matchHostEmail: params.match_host_email ?? true,
        encryptedCredentials: encryptCredentials(credentials, deps.secretsKeys),
        clientId: credentials.clientId,
        tenantId: credentials.kind === "microsoft" ? credentials.tenantId : null,
        secretExpiresAt:
          params.provider === "microsoft" && params.secret_expires_at
            ? new Date(params.secret_expires_at)
            : null,
      })
      .returning();
    return objectOf(row as DelegationRow);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw invalid(`This environment already has a delegation for ${params.domain}.`, "domain");
    }
    throw error;
  }
}

/** A live check of one mailbox. Passing is what starts connecting hosts, or ends an outage. */
export async function verifyCalendarDelegation(
  scope: Scope,
  id: string,
  params: { account: string },
  deps: CalendarDeps,
): Promise<CalendarDelegationObjectOutput> {
  const delegation = await findDelegation(db, scope, id);
  if (delegation.status === "deleting") {
    throw new SchedulingError("not_found", `No calendar delegation "${id}" here.`);
  }
  const mailbox = normalizeMailbox(params.account);
  if (!mailbox || mailboxDomain(mailbox) !== delegation.domain) {
    throw invalid(`Use a mailbox on ${delegation.domain}.`, "account");
  }
  try {
    await checkMailbox(delegation, mailbox, deps);
  } catch (error) {
    if (!(error instanceof CalendarError)) throw error;
    if (error.kind === "auth" || error.kind === "permanent") {
      await db
        .update(schedulingCalendarDelegation)
        .set({ lastErrorCode: error.code })
        .where(eq(schedulingCalendarDelegation.id, delegation.id));
      throw refusal(error);
    }
    throw new SchedulingError("calendar_unavailable", "The provider didn't answer. Try again.");
  }
  await db
    .update(schedulingCalendarDelegation)
    .set({
      verifyAccount: mailbox,
      lastErrorCode: null,
      nextReconcileAt: new Date(nowMs(deps)),
      ...(delegation.status === "pending" ? { status: "active" as const } : {}),
    })
    .where(eq(schedulingCalendarDelegation.id, delegation.id));
  if (delegation.status === "failing") await restoreDelegation(delegation, deps);
  return getCalendarDelegation(scope, id);
}

/**
 * New credentials are tried before they replace the old, since a bad paste would otherwise take
 * every host out. Until a delegation is verified there's no mailbox to try them on.
 */
export async function updateCalendarDelegation(
  scope: Scope,
  id: string,
  params: UpdateCalendarDelegationRequestOutput,
  deps: CalendarDeps,
): Promise<CalendarDelegationObjectOutput> {
  const delegation = await findDelegation(db, scope, id);
  if (delegation.status === "deleting") {
    throw new SchedulingError("not_found", `No calendar delegation "${id}" here.`);
  }
  let credentials: DelegationCredentials | null = null;
  if (params.service_account_key) {
    if (delegation.provider !== "google") {
      throw invalid(
        "This delegation is Microsoft's: it takes a client secret.",
        "service_account_key",
      );
    }
    credentials = parseServiceAccountKey(params.service_account_key);
  }
  if (params.client_secret) {
    if (delegation.provider !== "microsoft") {
      throw invalid(
        "This delegation is Google's: it takes a service account key.",
        "client_secret",
      );
    }
    credentials = parseMicrosoftCredentials({
      tenantId: delegation.tenantId as string,
      clientId: delegation.clientId,
      clientSecret: params.client_secret,
    });
  }
  const encryptedCredentials = credentials && encryptCredentials(credentials, deps.secretsKeys);
  if (encryptedCredentials && delegation.verifyAccount) {
    try {
      await checkMailbox(
        { provider: delegation.provider, encryptedCredentials },
        delegation.verifyAccount,
        deps,
      );
    } catch (error) {
      if (!(error instanceof CalendarError)) throw error;
      if (error.kind === "auth" || error.kind === "permanent") throw refusal(error);
      throw new SchedulingError("calendar_unavailable", "The provider didn't answer. Try again.");
    }
  }
  const [row] = await db
    .update(schedulingCalendarDelegation)
    .set({
      ...(params.match_host_email !== undefined ? { matchHostEmail: params.match_host_email } : {}),
      ...(params.secret_expires_at !== undefined
        ? {
            secretExpiresAt: params.secret_expires_at ? new Date(params.secret_expires_at) : null,
          }
        : {}),
      ...(encryptedCredentials && credentials
        ? { encryptedCredentials, clientId: credentials.clientId }
        : {}),
      nextReconcileAt: new Date(nowMs(deps)),
    })
    .where(eq(schedulingCalendarDelegation.id, delegation.id))
    .returning();
  // Tried above, so this outage is over.
  if (encryptedCredentials && delegation.verifyAccount && delegation.status === "failing") {
    await restoreDelegation(delegation, deps);
    return getCalendarDelegation(scope, id);
  }
  return objectOf(row as DelegationRow);
}

/** The worker removes its connections in batches: there can be many, each with a channel to stop. */
export async function deleteCalendarDelegation(
  scope: Scope,
  id: string,
  deps: Pick<CalendarDeps, "now">,
): Promise<{ id: string }> {
  const delegation = await findDelegation(db, scope, id);
  if (delegation.status === "pending") {
    await db
      .delete(schedulingCalendarDelegation)
      .where(eq(schedulingCalendarDelegation.id, delegation.id));
    return { id };
  }
  await db
    .update(schedulingCalendarDelegation)
    .set({ status: "deleting", nextReconcileAt: deps.now?.() ?? new Date(), leaseUntil: null })
    .where(eq(schedulingCalendarDelegation.id, delegation.id));
  return { id };
}

type Host = { id: string; mailbox: string; existing: ConnectionRow | null };

/** The mailbox a host wants: `calendar_account`, or their email if this delegation may match it. */
const hostMailbox = (delegation: DelegationRow) =>
  delegation.matchHostEmail
    ? sql<string>`lower(coalesce(${schedulingHost.calendarAccount}, ${schedulingHost.email}))`
    : sql<string>`lower(${schedulingHost.calendarAccount})`;

async function hostsToConnect(delegation: DelegationRow, now: Date): Promise<Host[]> {
  const mailbox = hostMailbox(delegation);
  const fresh = await db
    .select({ id: schedulingHost.id, mailbox })
    .from(schedulingHost)
    .where(
      and(
        eq(schedulingHost.organizationId, delegation.organizationId),
        eq(schedulingHost.environmentId, delegation.environmentId),
        eq(schedulingHost.status, "active"),
        sql`split_part(${mailbox}, '@', 2) = ${delegation.domain}`,
        notExists(
          db
            .select({ id: schedulingCalendarConnection.id })
            .from(schedulingCalendarConnection)
            .where(
              and(
                eq(schedulingCalendarConnection.hostId, schedulingHost.id),
                eq(schedulingCalendarConnection.delegationId, delegation.id),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(schedulingHost.id))
    .limit(HOSTS_PER_RUN);
  const retries = await db
    .select()
    .from(schedulingCalendarConnection)
    .where(
      and(
        eq(schedulingCalendarConnection.delegationId, delegation.id),
        eq(schedulingCalendarConnection.organizationId, delegation.organizationId),
        eq(schedulingCalendarConnection.status, "needs_reauth"),
        lt(schedulingCalendarConnection.lastErrorAt, new Date(now.getTime() - MAILBOX_RETRY_MS)),
      ),
    )
    .limit(Math.max(HOSTS_PER_RUN - fresh.length, 0));
  return [
    ...fresh.map((host) => ({ ...host, existing: null })),
    ...retries.map((row) => ({ id: row.hostId, mailbox: row.accountId, existing: row })),
  ];
}

/** A host's OAuth connection to this same mailbox, which the delegation takes over. */
async function connectionToUpgrade(
  tx: Executor,
  delegation: DelegationRow,
  host: Host,
  remote: readonly RemoteCalendar[],
): Promise<ConnectionRow | null> {
  const owned = await tx
    .select()
    .from(schedulingCalendarConnection)
    .where(
      and(
        eq(schedulingCalendarConnection.hostId, host.id),
        eq(schedulingCalendarConnection.organizationId, delegation.organizationId),
        eq(schedulingCalendarConnection.provider, delegation.provider),
        isNull(schedulingCalendarConnection.delegationId),
      ),
    )
    .for("update");
  if (owned.length === 0) return null;
  const sameCalendar = await tx
    .select({ connectionId: schedulingCalendar.connectionId })
    .from(schedulingCalendar)
    .where(
      and(
        eq(schedulingCalendar.organizationId, delegation.organizationId),
        inArray(
          schedulingCalendar.connectionId,
          owned.map((row) => row.id),
        ),
        inArray(
          schedulingCalendar.externalId,
          remote.map((calendar) => calendar.externalId),
        ),
      ),
    )
    .limit(1);
  return (
    owned.find((row) => row.id === sameCalendar[0]?.connectionId) ??
    owned.find((row) => row.accountId.toLowerCase() === host.mailbox) ??
    null
  );
}

/**
 * Everything is fetched before anything's committed, so a host goes straight from having no calendar
 * to having a verified one, without being hidden in between or adding to the queue of reads. The
 * channel opens before the read, so nothing that changes in between is missed.
 */
async function connectHost(
  delegation: DelegationRow,
  credentials: DelegationCredentials,
  host: Host,
  deps: CalendarDeps,
): Promise<void> {
  const startedAt = new Date(nowMs(deps));
  const tokens = await mintDelegatedToken(credentials, host.mailbox, {
    fetcher: fetcherOf(deps),
    nowMs: startedAt.getTime(),
  });
  const client: CalendarClient = delegatedClient(
    delegation.provider,
    tokens.accessToken,
    host.mailbox,
    deps,
  );
  const remote = await client.listCalendars();
  const primary = remote.find((calendar) => calendar.primary);
  if (!primary) throw new CalendarError("auth", "no_primary", "This mailbox has no calendar.");
  // Without a channel the calendar is simply polled, and the channels loop tries again.
  const channel = await openChannel(
    client,
    primary.externalId,
    pushWebhookUrl(deps, delegation.provider),
    startedAt,
  ).catch((error: unknown) => {
    if (error instanceof CalendarError && error.kind !== "auth") return null;
    throw error;
  });
  const busy = await client.fetchBusy({
    calendarIds: [primary.externalId],
    fromMs: startedAt.getTime() - DAY_MS,
    toMs: startedAt.getTime() + SYNC_HORIZON_DAYS * DAY_MS,
  });
  const intervals = busy[primary.externalId];
  if (!intervals)
    throw new CalendarError("transient", "read_failed", "Couldn't read the calendar.");
  const now = deps.now?.() ?? new Date();
  await db.transaction(async (tx) => {
    const upgraded = host.existing ? null : await connectionToUpgrade(tx, delegation, host, remote);
    const fields = {
      delegationId: delegation.id,
      encryptedCredentials: encryptCredentials(tokens, deps.secretsKeys),
      status: "active" as const,
      lastErrorCode: null,
      lastErrorAt: null,
    };
    const existingId = host.existing?.id ?? upgraded?.id;
    const [saved] = existingId
      ? await tx
          .update(schedulingCalendarConnection)
          .set(fields)
          .where(
            and(
              eq(schedulingCalendarConnection.id, existingId),
              eq(schedulingCalendarConnection.organizationId, delegation.organizationId),
            ),
          )
          .returning()
      : await tx
          .insert(schedulingCalendarConnection)
          .values({
            organizationId: delegation.organizationId,
            environmentId: delegation.environmentId,
            hostId: host.id,
            provider: delegation.provider,
            accountId: host.mailbox,
            ...fields,
          })
          .onConflictDoUpdate({
            target: [
              schedulingCalendarConnection.hostId,
              schedulingCalendarConnection.provider,
              schedulingCalendarConnection.accountId,
            ],
            set: fields,
          })
          .returning();
    const connection = saved as ConnectionRow;
    // Channels made with the old credentials can't be stopped with these, and they run out.
    if (upgraded) {
      await tx
        .update(schedulingCalendar)
        .set({
          channelId: null,
          channelResourceId: null,
          channelTokenHash: null,
          channelExpiresAt: null,
          nextSyncAt: now,
        })
        .where(
          and(
            eq(schedulingCalendar.connectionId, connection.id),
            eq(schedulingCalendar.organizationId, connection.organizationId),
          ),
        );
    }
    await addRemoteCalendars(tx, connection, remote, now);
    const [calendar] = await tx
      .select()
      .from(schedulingCalendar)
      .where(
        and(
          eq(schedulingCalendar.connectionId, connection.id),
          eq(schedulingCalendar.organizationId, connection.organizationId),
          eq(schedulingCalendar.externalId, primary.externalId),
        ),
      )
      .for("update");
    if (calendar?.readBusy) {
      await tx
        .delete(schedulingBusyInterval)
        .where(eq(schedulingBusyInterval.calendarId, calendar.id));
      await insertBusyIntervals(tx, calendar, intervals);
      const hasChannel = channel !== null;
      await tx
        .update(schedulingCalendar)
        .set({
          verifiedAt: startedAt,
          lastFetchStartedAt: startedAt,
          coveredUntil: new Date(startedAt.getTime() + SYNC_HORIZON_DAYS * DAY_MS),
          dirtyAt: null,
          syncFailures: 0,
          leaseUntil: null,
          nextSyncAt: nextReadAt({ channelId: hasChannel ? channel.channelId : null }, now),
          ...(channel ?? {}),
        })
        .where(eq(schedulingCalendar.id, calendar.id));
    }
    await recordCalendarEvent(tx, connection, "scheduling.calendar.connected", now);
  });
}

/** One mailbox that can't be reached. A row says so, once, and it's tried again now and then. */
async function recordMailboxFailure(
  delegation: DelegationRow,
  host: Host,
  code: string,
  now: Date,
): Promise<void> {
  if (host.existing) {
    await db
      .update(schedulingCalendarConnection)
      .set({ lastErrorCode: code, lastErrorAt: now })
      .where(eq(schedulingCalendarConnection.id, host.existing.id));
    return;
  }
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schedulingCalendarConnection)
      .values({
        organizationId: delegation.organizationId,
        environmentId: delegation.environmentId,
        hostId: host.id,
        provider: delegation.provider,
        accountId: host.mailbox,
        delegationId: delegation.id,
        encryptedCredentials: null,
        status: "needs_reauth",
        lastErrorCode: code,
        lastErrorAt: now,
      })
      // An OAuth connection to this address keeps working as it is.
      .onConflictDoNothing()
      .returning();
    if (row) await recordCalendarEvent(tx, row, "scheduling.calendar.needs_reauth", now);
  });
}

/** Connects a batch of hosts. Returns when to look again, unless a nudge asks for it sooner. */
async function connectHosts(delegation: DelegationRow, deps: CalendarDeps): Promise<Date> {
  const started = nowMs(deps);
  const now = new Date(started);
  const hosts = await hostsToConnect(delegation, now);
  if (hosts.length === 0) return new Date(started + IDLE_MS);
  const credentials = delegationCredentials(delegation.encryptedCredentials, deps.secretsKeys);
  const deadline = Date.now() + RUN_BUDGET_MS;
  for (const host of hosts) {
    if (Date.now() > deadline) break;
    try {
      await connectHost(delegation, credentials, host, deps);
    } catch (error) {
      if (!(error instanceof CalendarError)) throw error;
      if (error.kind === "rate_limited" || error.kind === "transient") {
        const retryMs = error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : BACKOFF_MS;
        return new Date(started + retryMs);
      }
      const settled =
        error.kind === "auth"
          ? await settleRefusal(delegation, host.mailbox, error, deps)
          : "mailbox";
      if (settled === "stop") return new Date(started + BACKOFF_MS);
      await recordMailboxFailure(delegation, host, error.code, now);
    }
  }
  return hosts.length >= HOSTS_PER_RUN ? now : new Date(started + IDLE_MS);
}

/** Stops each connection's channels, then removes it with the host locked, as a booking reads it. */
async function finishDeleting(delegation: DelegationRow, deps: CalendarDeps): Promise<Date> {
  const now = deps.now?.() ?? new Date();
  const connections = await db
    .select()
    .from(schedulingCalendarConnection)
    .where(
      and(
        eq(schedulingCalendarConnection.delegationId, delegation.id),
        eq(schedulingCalendarConnection.organizationId, delegation.organizationId),
      ),
    )
    .limit(REMOVALS_PER_RUN);
  for (const connection of connections) {
    await releaseConnection(connection, deps);
    await db.transaction(async (tx) => {
      await tx
        .select({ id: schedulingHost.id })
        .from(schedulingHost)
        .where(
          and(
            eq(schedulingHost.id, connection.hostId),
            eq(schedulingHost.organizationId, connection.organizationId),
          ),
        )
        .for("update");
      await recordCalendarEvent(tx, connection, "scheduling.calendar.disconnected", now);
      await tx
        .delete(schedulingCalendarConnection)
        .where(
          and(
            eq(schedulingCalendarConnection.id, connection.id),
            eq(schedulingCalendarConnection.organizationId, connection.organizationId),
          ),
        );
    });
  }
  if (connections.length === 0) {
    await db
      .delete(schedulingCalendarDelegation)
      .where(
        and(
          eq(schedulingCalendarDelegation.id, delegation.id),
          eq(schedulingCalendarDelegation.organizationId, delegation.organizationId),
        ),
      );
  }
  return now;
}

async function warnOfExpiringSecret(delegation: DelegationRow, deps: CalendarDeps): Promise<void> {
  const expires = delegation.secretExpiresAt;
  if (!expires || expires.getTime() - nowMs(deps) > SECRET_WARNING_MS) return;
  await enqueueNotification(db, {
    organizationId: delegation.organizationId,
    kind: "scheduling.delegation_secret_expiring",
    dedupeKey: `${delegation.id}:${expires.toISOString()}`,
    payload: { delegationId: delegation.id },
    now: new Date(nowMs(deps)),
  });
}

async function reconcile(delegation: DelegationRow, deps: CalendarDeps): Promise<Date> {
  if (delegation.status === "deleting") return finishDeleting(delegation, deps);
  if (delegation.status === "failing") {
    const probe = await probeDelegation(delegation, deps);
    if (probe === "ok") await restoreDelegation(delegation, deps);
    return new Date(nowMs(deps) + BACKOFF_MS);
  }
  await warnOfExpiringSecret(delegation, deps);
  return connectHosts(delegation, deps);
}

async function claimDue(now: Date, opts: Scan): Promise<DelegationRow[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(schedulingCalendarDelegation)
      .where(
        and(
          inArray(schedulingCalendarDelegation.status, ["active", "failing", "deleting"]),
          lte(schedulingCalendarDelegation.nextReconcileAt, now),
          or(
            isNull(schedulingCalendarDelegation.leaseUntil),
            lt(schedulingCalendarDelegation.leaseUntil, now),
          ),
          opts.scope
            ? inArray(schedulingCalendarDelegation.organizationId, [...opts.scope.organizationIds])
            : undefined,
        ),
      )
      .orderBy(asc(schedulingCalendarDelegation.nextReconcileAt))
      .limit(opts.limit ?? 5)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    await tx
      .update(schedulingCalendarDelegation)
      .set({ leaseUntil: new Date(now.getTime() + LEASE_MS) })
      .where(
        inArray(
          schedulingCalendarDelegation.id,
          due.map((row) => row.id),
        ),
      );
    return due;
  });
}

/**
 * The worker's loop: keeps each delegation's hosts connected, or works through its removal. Returns
 * how many were claimed, so a full batch runs again at once. System-level, like the other scans.
 */
export async function runDueCalendarDelegations(
  deps: CalendarDeps,
  opts: Scan = {},
): Promise<number> {
  const due = await claimDue(new Date(nowMs(deps)), opts);
  for (const delegation of due) {
    let next = new Date(nowMs(deps) + BACKOFF_MS);
    try {
      next = await reconcile(delegation, deps);
    } finally {
      // A nudge that came in during the run stands: it may be about a host this run didn't see.
      await db
        .update(schedulingCalendarDelegation)
        .set({
          leaseUntil: null,
          nextReconcileAt: sql`case when ${schedulingCalendarDelegation.nextReconcileAt} > ${delegation.nextReconcileAt.toISOString()}::timestamptz then ${schedulingCalendarDelegation.nextReconcileAt} else ${next.toISOString()}::timestamptz end`,
        })
        .where(eq(schedulingCalendarDelegation.id, delegation.id));
    }
  }
  return due.length;
}

/** For the dashboard's banner: which delegations are refused right now. */
export async function failingCalendarDelegations(scope: Scope): Promise<string[]> {
  const rows = await db
    .select({ domain: schedulingCalendarDelegation.domain })
    .from(schedulingCalendarDelegation)
    .where(
      and(
        eq(schedulingCalendarDelegation.organizationId, scope.organizationId),
        eq(schedulingCalendarDelegation.environmentId, scope.environmentId),
        eq(schedulingCalendarDelegation.status, "failing"),
      ),
    );
  return rows.map((row) => row.domain);
}
