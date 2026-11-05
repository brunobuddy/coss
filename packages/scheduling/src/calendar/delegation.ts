/**
 * Calendar delegation: an admin authorizes once, and every host on the domain gets their calendar
 * with no consent screen. A host gets an ordinary connection, so sync, writes and availability don't
 * know the difference; only `clientFor` does.
 *
 * A connection's mailbox is stamped when it's made. `email` is "never an identity", so changing it
 * later moves nothing: only `calendar_account` does, and not while bookings are live (`hosts.ts`).
 */
import type { PlanGate } from "@coss/billing/gate";
import { db, type Executor, schema } from "@coss/db";
import { ID_PREFIXES, isId } from "@coss/db/id";
import { enqueueNotification } from "@coss/notifications";
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notExists,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { SchedulingError } from "../errors.ts";
import type {
  CalendarDelegationObjectOutput,
  CreateCalendarDelegationRequestOutput,
  UpdateCalendarDelegationRequestOutput,
} from "../schemas.ts";
import type { SchedulingEnvironment } from "../types.ts";
import { type CalendarClient, CalendarError } from "./client.ts";
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
import { SECRET_WARNING_MS } from "./delegation-notifications.ts";
import {
  DELEGATION_SCOPES,
  type DelegationCredentials,
  mailboxDomain,
  mintDelegatedToken,
  normalizeMailbox,
  parseMicrosoftCredentials,
  parseServiceAccountKey,
} from "./delegation-tokens.ts";
import { insertBusyIntervals, openChannel } from "./sync.ts";

const {
  schedulingBusyInterval,
  schedulingCalendar,
  schedulingCalendarConnection,
  schedulingCalendarDelegation,
  schedulingHost,
} = schema;

type Scope = Pick<SchedulingEnvironment, "organizationId" | "environmentId">;

/**
 * Setting one up, changing it and ending its outage take a plan with the feature, in every
 * environment: a sandbox's delegation reaches real calendars too. Deleting never does, and the
 * worker doesn't ask: what's connected stays connected, as a log drain keeps delivering.
 */
type PlanDeps = { plans?: PlanGate | undefined };
type Scan = { limit?: number; scope?: { organizationIds: readonly string[] } };

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
// Each host costs a few provider calls, so a big domain arrives over minutes without crowding out
// everyone else's reads.
const HOSTS_PER_RUN = 20;
const REMOVALS_PER_RUN = 50;
const RUN_BUDGET_MS = 2 * MINUTE_MS;
// Past the budget by one host's slowest calls, each up to `requestTimeoutMs`.
const LEASE_MS = 10 * MINUTE_MS;
const IDLE_MS = 5 * MINUTE_MS;
const BACKOFF_MS = 5 * MINUTE_MS;
const MAILBOX_RETRY_MS = 60 * MINUTE_MS;

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
  deps: Pick<CalendarDeps, "secretsKeys"> & PlanDeps,
): Promise<CalendarDelegationObjectOutput> {
  await deps.plans?.requireFeature(env.organizationId, "calendarDelegation");
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
  deps: CalendarDeps & PlanDeps,
): Promise<CalendarDelegationObjectOutput> {
  await deps.plans?.requireFeature(scope.organizationId, "calendarDelegation");
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
  // On the row as it is now: that check took a while, and it may have been deleted during it, or
  // been given credentials this didn't check, which it mustn't vouch for.
  const [verified] = await db
    .update(schedulingCalendarDelegation)
    .set({
      verifyAccount: mailbox,
      lastErrorCode: null,
      nextReconcileAt: new Date(nowMs(deps)),
      status: sql`case when ${schedulingCalendarDelegation.status} = 'pending' then 'active'::scheduling_delegation_status else ${schedulingCalendarDelegation.status} end`,
    })
    .where(
      and(
        eq(schedulingCalendarDelegation.id, delegation.id),
        ne(schedulingCalendarDelegation.status, "deleting"),
        eq(schedulingCalendarDelegation.encryptedCredentials, delegation.encryptedCredentials),
      ),
    )
    .returning({ status: schedulingCalendarDelegation.status });
  if (!verified) {
    const now = await findDelegation(db, scope, id);
    if (now.status === "deleting") {
      throw new SchedulingError("not_found", `No calendar delegation "${id}" here.`);
    }
    throw new SchedulingError(
      "calendar_unavailable",
      "These credentials changed while they were being checked. Try again.",
    );
  }
  if (verified.status === "failing") await restoreDelegation(delegation, deps);
  await retryLostMailboxes(delegation);
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
  deps: CalendarDeps & PlanDeps,
): Promise<CalendarDelegationObjectOutput> {
  await deps.plans?.requireFeature(scope.organizationId, "calendarDelegation");
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
    // Any mailbox that's left will do: the person who verified it may be long gone, and refusing good
    // credentials over that would leave the delegation stuck once the old ones expire.
    const { result, error } = await probeDelegation({ ...delegation, encryptedCredentials }, deps);
    if (result === "refused" && error) throw refusal(error);
    if (result === "inconclusive") {
      throw new SchedulingError("calendar_unavailable", "The provider didn't answer. Try again.");
    }
    if (result === "unreached") {
      throw new SchedulingError(
        "calendar_delegation_refused",
        "None of this delegation's mailboxes could be reached to try these credentials on. Add a host with a real mailbox on the domain, or delete this delegation and add it again.",
      );
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
  if (encryptedCredentials) await retryLostMailboxes(delegation);
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
  // Only if it's still pending: verified since, it may have connections for the worker to wind down.
  const [gone] = await db
    .delete(schedulingCalendarDelegation)
    .where(
      and(
        eq(schedulingCalendarDelegation.id, delegation.id),
        eq(schedulingCalendarDelegation.status, "pending"),
      ),
    )
    .returning({ id: schedulingCalendarDelegation.id });
  if (gone) return { id };
  await db
    .update(schedulingCalendarDelegation)
    .set({ status: "deleting", nextReconcileAt: deps.now?.() ?? new Date(), leaseUntil: null })
    .where(eq(schedulingCalendarDelegation.id, delegation.id));
  return { id };
}

type Host = { id: string; mailbox: string; existing: ConnectionRow | null };

/** Someone just fixed what was wrong: mailboxes given up on for now are tried on the next run. */
const retryLostMailboxes = (delegation: Pick<DelegationRow, "id" | "organizationId">) =>
  db
    .update(schedulingCalendarConnection)
    .set({ lastErrorAt: new Date(0) })
    .where(
      and(
        eq(schedulingCalendarConnection.delegationId, delegation.id),
        eq(schedulingCalendarConnection.organizationId, delegation.organizationId),
        eq(schedulingCalendarConnection.status, "needs_reauth"),
      ),
    );

/** The mailbox a host wants: `calendar_account`, or their email if this delegation may match it. */
const hostMailbox = (delegation: DelegationRow) =>
  delegation.matchHostEmail
    ? sql<string>`lower(coalesce(${schedulingHost.calendarAccount}, ${schedulingHost.email}))`
    : sql<string>`lower(${schedulingHost.calendarAccount})`;

/**
 * Walks the hosts with a cursor. A host whose mailbox fails and who has an OAuth connection to it
 * leaves no row of ours to skip it by, so without one, enough of them would hold up everyone behind.
 */
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
        delegation.reconcileCursor ? gt(schedulingHost.id, delegation.reconcileCursor) : undefined,
        sql`split_part(${mailbox}, '@', 2) = ${delegation.domain}`,
        // Any delegation's: a host has one delegated mailbox, and only `calendar_account` moves it.
        notExists(
          db
            .select({ id: schedulingCalendarConnection.id })
            .from(schedulingCalendarConnection)
            .where(
              and(
                eq(schedulingCalendarConnection.hostId, schedulingHost.id),
                isNotNull(schedulingCalendarConnection.delegationId),
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
    .orderBy(asc(schedulingCalendarConnection.lastErrorAt))
    .limit(Math.max(HOSTS_PER_RUN - fresh.length, 0));
  return [
    ...fresh.map((host) => ({ ...host, existing: null })),
    ...retries.map((row) => ({ id: row.hostId, mailbox: row.accountId, existing: row })),
  ];
}

/**
 * A host's OAuth connection to this same mailbox, which the delegation takes over. The account is
 * what says so: a calendar in common doesn't, since a personal account can subscribe to a work
 * calendar, and its credentials would then be replaced by another mailbox's. An alias of the mailbox
 * isn't recognized, which leaves two connections reading one calendar: wasteful, and still right.
 */
async function connectionToUpgrade(
  tx: Executor,
  delegation: DelegationRow,
  host: Host,
): Promise<ConnectionRow | null> {
  const [owned] = await tx
    .select()
    .from(schedulingCalendarConnection)
    .where(
      and(
        eq(schedulingCalendarConnection.hostId, host.id),
        eq(schedulingCalendarConnection.organizationId, delegation.organizationId),
        eq(schedulingCalendarConnection.provider, delegation.provider),
        isNull(schedulingCalendarConnection.delegationId),
        sql`lower(${schedulingCalendarConnection.accountId}) = ${host.mailbox}`,
      ),
    )
    .for("update");
  return owned ?? null;
}

/**
 * Provider calls take time. `updateHost` changes a mailbox under this same lock, so what's asked for
 * now is settled: a connection to a mailbox nobody wants any more would never be looked at again.
 */
async function hostStillWants(
  tx: Executor,
  delegation: DelegationRow,
  host: Host,
  opts: { ifCredentials?: string | undefined; duringOutage?: boolean } = {},
): Promise<boolean> {
  const [current] = await tx
    .select({ calendarAccount: schedulingHost.calendarAccount, email: schedulingHost.email })
    .from(schedulingHost)
    .where(
      and(
        eq(schedulingHost.id, host.id),
        eq(schedulingHost.organizationId, delegation.organizationId),
      ),
    )
    .for("update");
  if (!current) return false;
  // Waits out a bulk flip in progress and holds off the next, since a connection activated just
  // after one would escape the outage. And what this delegation may match can have changed: turning
  // `match_host_email` off has to stop what's already fetched, or a typed-in email still gets through.
  const [state] = await tx
    .select({
      status: schedulingCalendarDelegation.status,
      matchHostEmail: schedulingCalendarDelegation.matchHostEmail,
      credentials: schedulingCalendarDelegation.encryptedCredentials,
    })
    .from(schedulingCalendarDelegation)
    .where(
      and(
        eq(schedulingCalendarDelegation.id, delegation.id),
        eq(schedulingCalendarDelegation.organizationId, delegation.organizationId),
      ),
    )
    .for("share");
  if (!state) return false;
  if (state.status !== "active" && !(opts.duringOutage && state.status === "failing")) return false;
  if (opts.ifCredentials && state.credentials !== opts.ifCredentials) return false;
  if (!host.existing) {
    const wanted = current.calendarAccount ?? (state.matchHostEmail ? current.email : null);
    if (wanted?.toLowerCase() !== host.mailbox) return false;
    // None when this was picked, but that was a while ago, and a host has only one.
    const [other] = await tx
      .select({ id: schedulingCalendarConnection.id })
      .from(schedulingCalendarConnection)
      .where(
        and(
          eq(schedulingCalendarConnection.hostId, host.id),
          eq(schedulingCalendarConnection.organizationId, delegation.organizationId),
          isNotNull(schedulingCalendarConnection.delegationId),
        ),
      )
      .limit(1);
    return !other;
  }
  const [stillThere] = await tx
    .select({ id: schedulingCalendarConnection.id })
    .from(schedulingCalendarConnection)
    .where(
      and(
        eq(schedulingCalendarConnection.id, host.existing.id),
        eq(schedulingCalendarConnection.organizationId, delegation.organizationId),
      ),
    );
  return Boolean(stillThere);
}

/**
 * Everything is fetched before anything's committed, so a host goes straight from having no calendar
 * to having a verified one, without being hidden in between. The channel opens before the read, but
 * a push can't find a channel that isn't stored yet, so the calendar is read once more straight after.
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
  // A channel nothing will remember only costs the provider's capacity and useless pushes.
  let channelKept = false;
  try {
    const busy = await client.fetchBusy({
      calendarIds: [primary.externalId],
      fromMs: startedAt.getTime() - DAY_MS,
      toMs: startedAt.getTime() + SYNC_HORIZON_DAYS * DAY_MS,
    });
    const intervals = busy[primary.externalId];
    if (!intervals)
      throw new CalendarError("transient", "read_failed", "Couldn't read the calendar.");
    const now = deps.now?.() ?? new Date();
    channelKept = await db.transaction(async (tx): Promise<boolean> => {
      if (!(await hostStillWants(tx, delegation, host))) return false;
      const upgraded = host.existing ? null : await connectionToUpgrade(tx, delegation, host);
      const fields = {
        delegationId: delegation.id,
        // Taken over from a host's own consent, the delegation's credentials are all that matter.
        oauthAppId: null,
        reachedAt: now,
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
      // What stood in for a mailbox that couldn't be reached, if it's not a calendar after all.
      const wasStandIn = host.existing !== null && host.existing.reachedAt === null;
      if (wasStandIn) {
        await tx.delete(schedulingCalendar).where(
          and(
            eq(schedulingCalendar.connectionId, connection.id),
            eq(schedulingCalendar.organizationId, connection.organizationId),
            isNull(schedulingCalendar.verifiedAt),
            eq(schedulingCalendar.writeTarget, false),
            notInArray(
              schedulingCalendar.externalId,
              remote.map((item) => item.externalId),
            ),
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
      // A stand-in that turned out to be the primary calendar was made without a write target. A
      // connection that's worked before had its target chosen, which coming back mustn't overrule.
      if (calendar && primary.writable && !calendar.writeTarget && wasStandIn) {
        const [target] = await tx
          .select({ id: schedulingCalendar.id })
          .from(schedulingCalendar)
          .where(
            and(
              eq(schedulingCalendar.hostId, connection.hostId),
              eq(schedulingCalendar.organizationId, connection.organizationId),
              eq(schedulingCalendar.writeTarget, true),
            ),
          );
        if (!target) {
          await tx
            .update(schedulingCalendar)
            .set({ writeTarget: true })
            .where(eq(schedulingCalendar.id, calendar.id));
        }
      }
      if (calendar?.readBusy) {
        // An OAuth row's sync may have read it since this began, and a slower fetch never overwrites
        // a newer one. The channel is still worth keeping, and it's read again straight after anyway.
        const overtaken =
          calendar.lastFetchStartedAt !== null && calendar.lastFetchStartedAt > startedAt;
        if (!overtaken) {
          await tx
            .delete(schedulingBusyInterval)
            .where(eq(schedulingBusyInterval.calendarId, calendar.id));
          await insertBusyIntervals(tx, calendar, intervals);
        }
        await tx
          .update(schedulingCalendar)
          .set({
            ...(overtaken
              ? {}
              : {
                  verifiedAt: startedAt,
                  lastFetchStartedAt: startedAt,
                  coveredUntil: new Date(startedAt.getTime() + SYNC_HORIZON_DAYS * DAY_MS),
                  dirtyAt: null,
                  syncFailures: 0,
                }),
            leaseUntil: null,
            nextSyncAt: now,
            ...(channel ?? {}),
          })
          .where(eq(schedulingCalendar.id, calendar.id));
      }
      await recordCalendarEvent(tx, connection, "scheduling.calendar.connected", now);
      return Boolean(calendar?.readBusy);
    });
  } finally {
    if (channel && !channelKept) {
      await client
        .unsubscribe?.({ channelId: channel.channelId, resourceId: channel.channelResourceId })
        .catch(() => {});
    }
  }
}

/** One mailbox that can't be reached. A row says so, once, and it's tried again now and then. */
async function recordMailboxFailure(
  delegation: DelegationRow,
  host: Host,
  code: string,
  now: Date,
  credentials: string | undefined,
  opts: { duringOutage?: boolean } = {},
): Promise<void> {
  if (host.existing) {
    await db
      .update(schedulingCalendarConnection)
      .set({ lastErrorCode: code, lastErrorAt: now })
      .where(eq(schedulingCalendarConnection.id, host.existing.id));
    return;
  }
  await db.transaction(async (tx) => {
    const wanted = await hostStillWants(tx, delegation, host, {
      ifCredentials: credentials,
      duringOutage: opts.duringOutage ?? false,
    });
    if (!wanted) return;
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
    if (!row) return;
    // Availability sees a connection's health through its calendars, and with none this host would
    // be offered as free. Their calendar exists and can't be read, which never reads as free.
    await tx.insert(schedulingCalendar).values({
      organizationId: row.organizationId,
      environmentId: row.environmentId,
      hostId: row.hostId,
      connectionId: row.id,
      externalId: host.mailbox,
      readBusy: true,
      writeTarget: false,
      nextSyncAt: now,
    });
    await recordCalendarEvent(tx, row, "scheduling.calendar.needs_reauth", now);
  });
}

/** Connects a batch of hosts. Returns when to look again, unless a nudge asks for it sooner. */
async function connectHosts(delegation: DelegationRow, deps: CalendarDeps): Promise<Date> {
  const started = nowMs(deps);
  const now = new Date(started);
  const hosts = await hostsToConnect(delegation, now);
  const moveCursor = (reconcileCursor: string | null) =>
    db
      .update(schedulingCalendarDelegation)
      .set({ reconcileCursor })
      .where(eq(schedulingCalendarDelegation.id, delegation.id));
  if (hosts.length === 0) {
    if (delegation.reconcileCursor) await moveCursor(null);
    return new Date(started + IDLE_MS);
  }
  const credentials = delegationCredentials(delegation.encryptedCredentials, deps.secretsKeys);
  const deadline = Date.now() + RUN_BUDGET_MS;
  let reached: string | null = null;
  for (const host of hosts) {
    if (Date.now() > deadline) {
      if (reached) await moveCursor(reached);
      return now;
    }
    if (!host.existing) reached = host.id;
    try {
      await connectHost(delegation, credentials, host, deps);
    } catch (error) {
      if (!(error instanceof CalendarError)) throw error;
      // Back of the line, or a mailbox that keeps failing would be first again next time.
      if (host.existing) {
        await db
          .update(schedulingCalendarConnection)
          .set({ lastErrorAt: now })
          .where(eq(schedulingCalendarConnection.id, host.existing.id));
      }
      // One calendar that can't be read says nothing about the rest. It comes up again next pass.
      if (error.code === "read_failed") continue;
      if (error.kind === "rate_limited" || error.kind === "transient") {
        // Past this host, whatever else happens: a mailbox that always fails can't block the domain.
        if (reached) await moveCursor(reached);
        const retryMs = error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : BACKOFF_MS;
        return new Date(started + retryMs);
      }
      const outcome =
        error.kind === "auth"
          ? await settleRefusal(delegation, host.mailbox, error, deps)
          : ({ settled: "mailbox", credentials: undefined } as const);
      if (outcome.settled === "stop") {
        if (reached) await moveCursor(reached);
        return new Date(started + BACKOFF_MS);
      }
      await recordMailboxFailure(delegation, host, error.code, now, outcome.credentials);
    }
  }
  // A full batch means more behind it. Otherwise this pass is done, and the next starts over.
  const full = hosts.length >= HOSTS_PER_RUN;
  await moveCursor(full ? (reached ?? delegation.reconcileCursor) : null);
  return full ? now : new Date(started + IDLE_MS);
}

/** Stops each connection's channels, then removes it with the host locked, as a booking reads it. */
async function finishDeleting(delegation: DelegationRow, deps: CalendarDeps): Promise<Date> {
  const now = deps.now?.() ?? new Date();
  // Each release can spend a while taking details off events, and that mustn't outlast the lease.
  const deadline = Date.now() + RUN_BUDGET_MS;
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
    if (Date.now() > deadline) break;
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

/**
 * During an outage, hosts it hasn't connected yet aren't offered as free any more than those it has:
 * they get a stand-in like a mailbox that can't be reached, and are tried as soon as access is back.
 * No provider calls, so all of them, within the budget.
 */
async function hideUnconnectedHosts(delegation: DelegationRow, deps: CalendarDeps): Promise<void> {
  const now = new Date(nowMs(deps));
  const code = delegation.lastErrorCode ?? "delegation_failing";
  const deadline = Date.now() + RUN_BUDGET_MS;
  // Its own walk, all the way through: an OAuth connection to the mailbox gets no stand-in and stays
  // in the list, and enough of them would otherwise hide everyone behind them.
  let reconcileCursor: string | null = null;
  for (;;) {
    const hosts: Host[] = await hostsToConnect({ ...delegation, reconcileCursor }, now);
    const fresh = hosts.filter((host) => !host.existing);
    for (const host of fresh) {
      await recordMailboxFailure(delegation, host, code, now, undefined, { duringOutage: true });
    }
    const last = fresh.at(-1);
    if (!last || fresh.length < HOSTS_PER_RUN || Date.now() > deadline) return;
    reconcileCursor = last.id;
  }
}

async function reconcile(delegation: DelegationRow, deps: CalendarDeps): Promise<Date> {
  if (delegation.status === "deleting") return finishDeleting(delegation, deps);
  if (delegation.status === "failing") {
    const { result } = await probeDelegation(delegation, deps);
    if (result === "ok") {
      await restoreDelegation(delegation, deps);
      return new Date(nowMs(deps));
    }
    await hideUnconnectedHosts(delegation, deps);
    return new Date(nowMs(deps) + BACKOFF_MS);
  }
  await warnOfExpiringSecret(delegation, deps);
  return connectHosts(delegation, deps);
}

/** One at a time: a batch's lease would be running out on the last by the time it's reached. */
async function claimNext(
  now: Date,
  opts: Scan,
  done: readonly string[],
): Promise<{ delegation: DelegationRow; lease: Date } | null> {
  return db.transaction(async (tx) => {
    const [delegation] = await tx
      .select()
      .from(schedulingCalendarDelegation)
      .where(
        and(
          inArray(schedulingCalendarDelegation.status, ["active", "failing", "deleting"]),
          lte(schedulingCalendarDelegation.nextReconcileAt, now),
          done.length > 0 ? notInArray(schedulingCalendarDelegation.id, [...done]) : undefined,
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
      .limit(1)
      .for("update", { skipLocked: true });
    if (!delegation) return null;
    const lease = new Date(now.getTime() + LEASE_MS);
    await tx
      .update(schedulingCalendarDelegation)
      .set({ leaseUntil: lease })
      .where(eq(schedulingCalendarDelegation.id, delegation.id));
    return { delegation, lease };
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
  const limit = opts.limit ?? 5;
  // Once each per run, however much it has left: that's what paces a big domain.
  const done: string[] = [];
  while (done.length < limit) {
    const next = await claimNext(new Date(nowMs(deps)), opts, done);
    if (!next) break;
    const { delegation, lease } = next;
    done.push(delegation.id);
    let after = new Date(nowMs(deps) + BACKOFF_MS);
    try {
      after = await reconcile(delegation, deps);
    } finally {
      // Fenced on the lease: a worker that took this over after it expired keeps what it wrote.
      // A nudge that came in during the run stands: it may be about a host this run didn't see.
      await db
        .update(schedulingCalendarDelegation)
        .set({
          leaseUntil: null,
          nextReconcileAt: sql`case when ${schedulingCalendarDelegation.nextReconcileAt} > ${delegation.nextReconcileAt.toISOString()}::timestamptz then ${schedulingCalendarDelegation.nextReconcileAt} else ${after.toISOString()}::timestamptz end`,
        })
        .where(
          and(
            eq(schedulingCalendarDelegation.id, delegation.id),
            eq(schedulingCalendarDelegation.leaseUntil, lease),
          ),
        );
    }
  }
  return done.length;
}

/** For the dashboard's banner: which delegations are refused right now. */
/** Whether a downgrade would leave a delegation behind. One being deleted is already gone. */
export async function hasCalendarDelegations(organizationId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schedulingCalendarDelegation.id })
    .from(schedulingCalendarDelegation)
    .where(
      and(
        eq(schedulingCalendarDelegation.organizationId, organizationId),
        ne(schedulingCalendarDelegation.status, "deleting"),
      ),
    )
    .limit(1);
  return row !== undefined;
}

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
