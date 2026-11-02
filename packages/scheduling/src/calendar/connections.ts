/**
 * A host's calendar connections: consent, credentials, which calendars count. Credentials are
 * encrypted with `encryptSecret`, and a refresh writes back with a compare-and-set on the old value
 * so it can't overwrite a concurrent re-encryption or a newer refresh.
 */
import { createHash, randomBytes } from "node:crypto";
import { db, type Executor, schema } from "@coss/db";
import { ID_PREFIXES, isId, newId } from "@coss/db/id";
import { appendLogEntries } from "@coss/logs";
import {
  decryptSecret,
  encryptSecret,
  enqueueWebhookMessage,
  type SecretsKeyRing,
} from "@coss/webhooks";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Interval } from "../engine/intervals.ts";
import { SchedulingError } from "../errors.ts";
import { resolveHost } from "../hosts.ts";
import type { SchedulingCalendarWebhookEventType } from "../webhook-types.ts";
import { caldavCalendarClient, type DavTransport, pinnedDavTransport } from "./caldav.ts";
import { type CalendarClient, CalendarError, type HttpFetch } from "./client.ts";
import { googleCalendarClient } from "./google.ts";
import { microsoftCalendarClient } from "./microsoft.ts";
import {
  authorizationUrl,
  exchangeCode,
  type OAuthApp,
  type OAuthProvider,
  type OAuthTokens,
  pkcePair,
  refreshTokens,
  revokeToken,
} from "./oauth.ts";
import { simulatedCalendarClient } from "./simulated.ts";

const {
  schedulingBusyInterval,
  schedulingCalendar,
  schedulingCalendarConnection,
  schedulingHost,
  schedulingOauthState,
  schedulingNotification,
} = schema;

export type ConnectionRow = typeof schedulingCalendarConnection.$inferSelect;
export type CalendarRow = typeof schedulingCalendar.$inferSelect;
type Provider = ConnectionRow["provider"];
type Scope = { organizationId: string; environmentId: string };
type Env = Scope & { projectId: string; mode: "live" | "sandbox" };

export type CalendarDeps = {
  secretsKeys: SecretsKeyRing;
  /** Coss.com's OAuth apps. A provider without one can't be connected. */
  apps: { google: OAuthApp | null; microsoft: OAuthApp | null };
  /** `API_PUBLIC_URL`: where providers send consent back and push notifications to. */
  publicUrl: string;
  fetcher?: HttpFetch;
  davTransport?: DavTransport;
  now?: () => Date;
};

type CaldavCredentials = { url: string; username: string; password: string };
const OAUTH_STATE_TTL_MS = 10 * 60_000;
const REFRESH_MARGIN_MS = 2 * 60_000;
// Past a year: a weekly series of 52 has to fit, or its last occurrences couldn't be verified.
export const SYNC_HORIZON_DAYS = 400;

const fetcherOf = (deps: CalendarDeps): HttpFetch => deps.fetcher ?? fetch;
const nowMs = (deps: CalendarDeps): number => (deps.now?.() ?? new Date()).getTime();

export const oauthRedirectUri = (deps: Pick<CalendarDeps, "publicUrl">, provider: OAuthProvider) =>
  `${deps.publicUrl.replace(/\/+$/, "")}/scheduling/oauth/${provider}/callback`;

export const pushWebhookUrl = (deps: Pick<CalendarDeps, "publicUrl">, provider: OAuthProvider) =>
  `${deps.publicUrl.replace(/\/+$/, "")}/scheduling/push/${provider}`;

const appOf = (deps: CalendarDeps, provider: OAuthProvider): OAuthApp => {
  const app = deps.apps[provider];
  if (!app) {
    throw new SchedulingError(
      "calendar_unavailable",
      `Connecting ${provider} calendars isn't set up in this deployment.`,
    );
  }
  return app;
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Starts a consent: the state is random, and only its hash is kept. It's never a credential. */
export async function startCalendarAuthorization(
  scope: Scope,
  hostRef: string,
  input: { provider: OAuthProvider; returnUrl: string | null },
  deps: CalendarDeps,
): Promise<{ url: string }> {
  const app = appOf(deps, input.provider);
  const host = await resolveHost(db, scope, hostRef);
  const state = randomBytes(32).toString("base64url");
  const { verifier, challenge } = pkcePair();
  await db.insert(schedulingOauthState).values({
    organizationId: host.organizationId,
    environmentId: host.environmentId,
    hostId: host.id,
    provider: input.provider,
    stateHash: sha256(state),
    encryptedCodeVerifier: encryptSecret(verifier, deps.secretsKeys),
    returnUrl: input.returnUrl,
    expiresAt: new Date(nowMs(deps) + OAUTH_STATE_TTL_MS),
  });
  return {
    url: authorizationUrl({
      provider: input.provider,
      app,
      redirectUri: oauthRedirectUri(deps, input.provider),
      state,
      codeChallenge: challenge,
    }),
  };
}

function encryptCredentials(value: OAuthTokens | CaldavCredentials, keys: SecretsKeyRing): string {
  return encryptSecret(JSON.stringify(value), keys);
}

/** Records the news about a calendar: webhook, log line, and the host's email when it needs them. */
export async function recordCalendarEvent(
  tx: Executor,
  connection: Pick<
    ConnectionRow,
    "id" | "organizationId" | "environmentId" | "hostId" | "provider"
  >,
  type: SchedulingCalendarWebhookEventType,
  now: Date,
): Promise<void> {
  const [host] = await tx
    .select({ projectId: schedulingHost.projectId })
    .from(schedulingHost)
    .where(
      and(
        eq(schedulingHost.id, connection.hostId),
        eq(schedulingHost.organizationId, connection.organizationId),
      ),
    );
  const id = newId(ID_PREFIXES.webhookEvent);
  await enqueueWebhookMessage(tx, {
    id,
    organizationId: connection.organizationId,
    environmentId: connection.environmentId,
    type,
    payload: {
      id,
      object: "event",
      type,
      created_at: now.toISOString(),
      data: {
        host_id: connection.hostId,
        connection_id: connection.id,
        provider: connection.provider,
        occurred_at: now.toISOString(),
      },
    },
  });
  if (host) {
    await appendLogEntries(tx, [
      {
        organizationId: connection.organizationId,
        projectId: host.projectId,
        environmentId: connection.environmentId,
        occurredAt: now,
        source: "scheduling",
        level: type === "scheduling.calendar.needs_reauth" ? "warning" : "info",
        type,
        message:
          type === "scheduling.calendar.needs_reauth"
            ? "A host's calendar needs reconnecting: they aren't offered until it's back"
            : type === "scheduling.calendar.connected"
              ? "Calendar connected"
              : "Calendar disconnected",
        resourceType: "scheduling_host",
        resourceId: connection.hostId,
        attributes: { connection_id: connection.id, provider: connection.provider },
      },
    ]);
  }
}

/** Creates the connection with its calendars: the primary one is read and written by default. */
async function saveConnection(
  host: { id: string; organizationId: string; environmentId: string },
  input: {
    provider: Provider;
    accountId: string;
    encryptedCredentials: string | null;
    client: CalendarClient;
  },
  deps: Pick<CalendarDeps, "now">,
): Promise<ConnectionRow> {
  const remote = await input.client.listCalendars();
  const now = deps.now?.() ?? new Date();
  return db.transaction(async (tx) => {
    const [connection] = await tx
      .insert(schedulingCalendarConnection)
      .values({
        organizationId: host.organizationId,
        environmentId: host.environmentId,
        hostId: host.id,
        provider: input.provider,
        accountId: input.accountId,
        encryptedCredentials: input.encryptedCredentials,
      })
      .onConflictDoUpdate({
        target: [
          schedulingCalendarConnection.hostId,
          schedulingCalendarConnection.provider,
          schedulingCalendarConnection.accountId,
        ],
        set: {
          encryptedCredentials: input.encryptedCredentials,
          status: "active",
          lastErrorCode: null,
          lastErrorAt: null,
        },
      })
      .returning();
    const row = connection as ConnectionRow;
    const [hasTarget] = await tx
      .select({ id: schedulingCalendar.id })
      .from(schedulingCalendar)
      .where(
        and(
          eq(schedulingCalendar.hostId, host.id),
          eq(schedulingCalendar.organizationId, host.organizationId),
          eq(schedulingCalendar.writeTarget, true),
        ),
      );
    let targetTaken = Boolean(hasTarget);
    for (const calendar of remote) {
      const writeTarget = calendar.primary && calendar.writable && !targetTaken;
      if (writeTarget) targetTaken = true;
      await tx
        .insert(schedulingCalendar)
        .values({
          organizationId: host.organizationId,
          environmentId: host.environmentId,
          hostId: host.id,
          connectionId: row.id,
          externalId: calendar.externalId,
          readBusy: calendar.primary,
          writeTarget,
          nextSyncAt: now,
        })
        .onConflictDoNothing();
    }
    await recordCalendarEvent(tx, row, "scheduling.calendar.connected", now);
    return row;
  });
}

/** Completes a consent. Returns where to send the browser, whatever happened. */
export async function completeCalendarAuthorization(
  input: { provider: OAuthProvider; state: string; code: string | null; error: string | null },
  deps: CalendarDeps,
): Promise<{
  returnUrl: string | null;
  outcome: "connected" | "denied" | "invalid";
  hostId?: string;
}> {
  // Deleted as it's read, so it can only ever be used once.
  const [state] = await db
    .delete(schedulingOauthState)
    .where(
      and(
        eq(schedulingOauthState.stateHash, sha256(input.state)),
        eq(schedulingOauthState.provider, input.provider),
      ),
    )
    .returning();
  if (!state || state.expiresAt.getTime() < nowMs(deps)) {
    return { returnUrl: state?.returnUrl ?? null, outcome: "invalid" };
  }
  if (input.error || !input.code) return { returnUrl: state.returnUrl, outcome: "denied" };
  const app = appOf(deps, input.provider);
  const tokens = await exchangeCode({
    provider: input.provider,
    app,
    code: input.code,
    codeVerifier: decryptSecret(state.encryptedCodeVerifier, deps.secretsKeys),
    redirectUri: oauthRedirectUri(deps, input.provider),
    fetcher: fetcherOf(deps),
    nowMs: nowMs(deps),
  });
  const client = oauthClient(input.provider, tokens.accessToken, deps);
  const accountId = await oauthAccountId(input.provider, tokens.accessToken, client, deps);
  await saveConnection(
    {
      id: state.hostId,
      organizationId: state.organizationId,
      environmentId: state.environmentId,
    },
    {
      provider: input.provider,
      accountId,
      encryptedCredentials: encryptCredentials(tokens, deps.secretsKeys),
      client,
    },
    deps,
  );
  return { returnUrl: state.returnUrl, outcome: "connected", hostId: state.hostId };
}

async function oauthAccountId(
  provider: OAuthProvider,
  accessToken: string,
  client: CalendarClient,
  deps: CalendarDeps,
): Promise<string> {
  if (provider === "microsoft") {
    const res = await fetcherOf(deps)(
      "https://graph.microsoft.com/v1.0/me?$select=id,userPrincipalName",
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    const me = (await res.json().catch(() => ({}))) as { id?: string; userPrincipalName?: string };
    if (me.id || me.userPrincipalName) return (me.userPrincipalName ?? me.id) as string;
    throw new CalendarError("transient", "no_account", "Couldn't read the Microsoft account.");
  }
  // A Google account's primary calendar has the address as its id.
  const calendars = await client.listCalendars();
  const primary = calendars.find((calendar) => calendar.primary);
  if (!primary) throw new CalendarError("permanent", "no_primary", "This account has no calendar.");
  return primary.externalId;
}

function oauthClient(
  provider: OAuthProvider,
  accessToken: string,
  deps: CalendarDeps,
): CalendarClient {
  const fetcher = fetcherOf(deps);
  return provider === "google"
    ? googleCalendarClient({ accessToken, fetcher })
    : microsoftCalendarClient({ accessToken, fetcher });
}

export async function connectCaldav(
  scope: Scope,
  hostRef: string,
  input: CaldavCredentials,
  deps: CalendarDeps,
): Promise<ConnectionRow> {
  const host = await resolveHost(db, scope, hostRef);
  const client = caldavCalendarClient({
    ...input,
    transport: deps.davTransport ?? pinnedDavTransport(),
  });
  return saveConnection(
    host,
    {
      provider: "caldav",
      accountId: `${input.username}@${new URL(input.url).host}`,
      encryptedCredentials: encryptCredentials(input, deps.secretsKeys),
      client,
    },
    deps,
  );
}

export async function connectSimulated(
  env: Env,
  hostRef: string,
  deps: Pick<CalendarDeps, "now">,
): Promise<ConnectionRow> {
  if (env.mode !== "sandbox") {
    throw new SchedulingError(
      "calendar_unavailable",
      "Simulated calendars only exist in sandbox environments.",
    );
  }
  const host = await resolveHost(db, env, hostRef);
  const connection = await saveConnection(
    host,
    {
      provider: "simulated",
      accountId: "simulated",
      encryptedCredentials: null,
      client: simulatedCalendarClient(),
    },
    deps,
  );
  await db
    .update(schedulingCalendar)
    .set({
      verifiedAt: deps.now?.() ?? new Date(),
      coveredUntil: new Date(
        (deps.now?.() ?? new Date()).getTime() + SYNC_HORIZON_DAYS * 86_400_000,
      ),
    })
    .where(eq(schedulingCalendar.connectionId, connection.id));
  return connection;
}

/** Sandbox only: replaces a simulated calendar's busy times. */
export async function setSimulatedBusy(
  env: Env,
  hostRef: string,
  intervals: readonly Interval[],
): Promise<void> {
  if (env.mode !== "sandbox") {
    throw new SchedulingError(
      "calendar_unavailable",
      "Simulated calendars only exist in sandbox environments.",
    );
  }
  const host = await resolveHost(db, env, hostRef);
  const [calendar] = await db
    .select({ id: schedulingCalendar.id })
    .from(schedulingCalendar)
    .innerJoin(
      schedulingCalendarConnection,
      eq(schedulingCalendarConnection.id, schedulingCalendar.connectionId),
    )
    .where(
      and(
        eq(schedulingCalendar.hostId, host.id),
        eq(schedulingCalendar.organizationId, host.organizationId),
        eq(schedulingCalendarConnection.provider, "simulated"),
      ),
    );
  if (!calendar) {
    throw new SchedulingError(
      "not_found",
      "This host has no simulated calendar. Connect one first.",
    );
  }
  await db.transaction(async (tx) => {
    await tx
      .delete(schedulingBusyInterval)
      .where(eq(schedulingBusyInterval.calendarId, calendar.id));
    if (intervals.length > 0) {
      await tx.insert(schedulingBusyInterval).values(
        intervals.map((interval) => ({
          organizationId: host.organizationId,
          calendarId: calendar.id,
          hostId: host.id,
          startAt: new Date(interval.startMs),
          endAt: new Date(interval.endMs),
        })),
      );
    }
  });
}

/** A client for a connection, refreshing its access first when it's close to expiring. */
export async function clientFor(
  connection: ConnectionRow,
  deps: CalendarDeps,
): Promise<CalendarClient> {
  if (connection.provider === "simulated") return simulatedCalendarClient();
  if (!connection.encryptedCredentials) {
    throw new CalendarError("auth", "no_credentials", "This connection has no credentials.");
  }
  const stored = decryptSecret(connection.encryptedCredentials, deps.secretsKeys);
  if (connection.provider === "caldav") {
    const credentials = JSON.parse(stored) as CaldavCredentials;
    return caldavCalendarClient({
      ...credentials,
      transport: deps.davTransport ?? pinnedDavTransport(),
    });
  }
  const provider = connection.provider;
  let tokens = JSON.parse(stored) as OAuthTokens;
  if (tokens.expiresAtMs - REFRESH_MARGIN_MS <= nowMs(deps)) {
    if (!tokens.refreshToken) {
      throw new CalendarError("auth", "no_refresh_token", "Calendar access has expired.");
    }
    tokens = await refreshTokens({
      provider,
      app: appOf(deps, provider),
      refreshToken: tokens.refreshToken,
      fetcher: fetcherOf(deps),
      nowMs: nowMs(deps),
    });
    // Whoever wrote since keeps their value; this refresh's tokens still work for this run.
    await db
      .update(schedulingCalendarConnection)
      .set({ encryptedCredentials: encryptCredentials(tokens, deps.secretsKeys) })
      .where(
        and(
          eq(schedulingCalendarConnection.id, connection.id),
          eq(schedulingCalendarConnection.organizationId, connection.organizationId),
          eq(schedulingCalendarConnection.encryptedCredentials, connection.encryptedCredentials),
        ),
      );
  }
  return oauthClient(provider, tokens.accessToken, deps);
}

/**
 * A connection that lost access. Once only (compare-and-set on the status): the host stops being
 * offered at once, the customer hears by webhook, and the host by email.
 */
export async function markNeedsReauth(
  connection: ConnectionRow,
  code: string,
  deps: Pick<CalendarDeps, "now">,
): Promise<void> {
  const now = deps.now?.() ?? new Date();
  await db.transaction(async (tx) => {
    const [changed] = await tx
      .update(schedulingCalendarConnection)
      .set({ status: "needs_reauth", lastErrorCode: code, lastErrorAt: now })
      .where(
        and(
          eq(schedulingCalendarConnection.id, connection.id),
          eq(schedulingCalendarConnection.organizationId, connection.organizationId),
          ne(schedulingCalendarConnection.status, "needs_reauth"),
        ),
      )
      .returning({ id: schedulingCalendarConnection.id });
    if (!changed) return;
    await recordCalendarEvent(tx, connection, "scheduling.calendar.needs_reauth", now);
    await tx
      .insert(schedulingNotification)
      .values({
        organizationId: connection.organizationId,
        environmentId: connection.environmentId,
        hostId: connection.hostId,
        kind: "calendar_needs_reauth",
        channel: "email",
        recipient: "host",
        dedupeKey: `calendar_needs_reauth:${connection.id}:${now.getTime()}`,
        dueAt: now,
      })
      .onConflictDoNothing();
  });
}

export type ConnectionObject = {
  object: "scheduling.calendar_connection";
  id: string;
  host: string;
  provider: Provider;
  account: string;
  status: ConnectionRow["status"];
  calendars: {
    id: string;
    external_id: string;
    read_busy: boolean;
    write_target: boolean;
    verified_at: string | null;
  }[];
  created_at: string;
};

async function toConnectionObjects(
  rows: readonly ConnectionRow[],
  executor: Executor = db,
): Promise<ConnectionObject[]> {
  if (rows.length === 0) return [];
  const calendars = await executor
    .select()
    .from(schedulingCalendar)
    .where(
      inArray(
        schedulingCalendar.connectionId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(schedulingCalendar.id));
  return rows.map((row) => ({
    object: "scheduling.calendar_connection",
    id: row.id,
    host: row.hostId,
    provider: row.provider,
    account: row.accountId,
    status: row.status,
    calendars: calendars
      .filter((calendar) => calendar.connectionId === row.id)
      .map((calendar) => ({
        id: calendar.id,
        external_id: calendar.externalId,
        read_busy: calendar.readBusy,
        write_target: calendar.writeTarget,
        verified_at: calendar.verifiedAt?.toISOString() ?? null,
      })),
    created_at: row.createdAt.toISOString(),
  }));
}

export async function toConnectionObject(row: ConnectionRow): Promise<ConnectionObject> {
  return (await toConnectionObjects([row]))[0] as ConnectionObject;
}

export async function listConnections(scope: Scope, hostRef: string): Promise<ConnectionObject[]> {
  const host = await resolveHost(db, scope, hostRef);
  const rows = await db
    .select()
    .from(schedulingCalendarConnection)
    .where(
      and(
        eq(schedulingCalendarConnection.hostId, host.id),
        eq(schedulingCalendarConnection.organizationId, host.organizationId),
      ),
    )
    .orderBy(asc(schedulingCalendarConnection.id));
  return toConnectionObjects(rows);
}

async function findConnection(scope: Scope, hostId: string, id: string): Promise<ConnectionRow> {
  const [row] = isId(ID_PREFIXES.schedulingCalendarConnection, id)
    ? await db
        .select()
        .from(schedulingCalendarConnection)
        .where(
          and(
            eq(schedulingCalendarConnection.id, id),
            eq(schedulingCalendarConnection.hostId, hostId),
            eq(schedulingCalendarConnection.organizationId, scope.organizationId),
          ),
        )
    : [];
  if (!row) throw new SchedulingError("not_found", `No calendar connection "${id}" on this host.`);
  return row;
}

/** Which of a host's calendars count, and which one bookings are written to. */
export async function updateCalendar(
  scope: Scope,
  hostRef: string,
  calendarId: string,
  params: { read_busy?: boolean | undefined; write_target?: boolean | undefined },
): Promise<ConnectionObject[]> {
  const host = await resolveHost(db, scope, hostRef);
  await db.transaction(async (tx) => {
    const [calendar] = await tx
      .select()
      .from(schedulingCalendar)
      .where(
        and(
          eq(schedulingCalendar.id, calendarId),
          eq(schedulingCalendar.hostId, host.id),
          eq(schedulingCalendar.organizationId, host.organizationId),
        ),
      )
      .for("update");
    if (!calendar)
      throw new SchedulingError("not_found", `No calendar "${calendarId}" on this host.`);
    if (params.write_target === true) {
      await tx
        .update(schedulingCalendar)
        .set({ writeTarget: false })
        .where(
          and(
            eq(schedulingCalendar.hostId, host.id),
            eq(schedulingCalendar.organizationId, host.organizationId),
            eq(schedulingCalendar.writeTarget, true),
          ),
        );
    }
    await tx
      .update(schedulingCalendar)
      .set({
        ...(params.read_busy !== undefined ? { readBusy: params.read_busy } : {}),
        ...(params.write_target !== undefined ? { writeTarget: params.write_target } : {}),
        // A calendar that starts counting must be read before it's trusted.
        ...(params.read_busy === true && !calendar.readBusy
          ? { nextSyncAt: sql`clock_timestamp()`, verifiedAt: null, coveredUntil: null }
          : {}),
      })
      .where(
        and(
          eq(schedulingCalendar.id, calendar.id),
          eq(schedulingCalendar.organizationId, calendar.organizationId),
        ),
      );
    if (params.read_busy === false) {
      await tx
        .delete(schedulingBusyInterval)
        .where(eq(schedulingBusyInterval.calendarId, calendar.id));
    }
  });
  return listConnections(scope, host.id);
}

/** Removes the connection and everything read through it, stopping channels and revoking access. */
export async function disconnectCalendar(
  scope: Scope,
  hostRef: string,
  connectionId: string,
  deps: CalendarDeps,
): Promise<{ id: string }> {
  const host = await resolveHost(db, scope, hostRef);
  const connection = await findConnection(scope, host.id, connectionId);
  await releaseConnection(connection, deps);
  await db.transaction(async (tx) => {
    await recordCalendarEvent(
      tx,
      connection,
      "scheduling.calendar.disconnected",
      deps.now?.() ?? new Date(),
    );
    await tx
      .delete(schedulingCalendarConnection)
      .where(
        and(
          eq(schedulingCalendarConnection.id, connection.id),
          eq(schedulingCalendarConnection.organizationId, connection.organizationId),
        ),
      );
  });
  return { id: connection.id };
}

/** Best effort at the provider: leaving is never blocked by one being down. */
async function releaseConnection(connection: ConnectionRow, deps: CalendarDeps): Promise<void> {
  if (connection.provider === "simulated" || connection.provider === "caldav") return;
  const calendars = await db
    .select()
    .from(schedulingCalendar)
    .where(eq(schedulingCalendar.connectionId, connection.id));
  try {
    const client = await clientFor(connection, deps);
    for (const calendar of calendars) {
      if (!calendar.channelId) continue;
      await client
        .unsubscribe?.({ channelId: calendar.channelId, resourceId: calendar.channelResourceId })
        .catch(() => {});
    }
    if (connection.encryptedCredentials) {
      const tokens = JSON.parse(
        decryptSecret(connection.encryptedCredentials, deps.secretsKeys),
      ) as OAuthTokens;
      if (tokens.refreshToken) {
        await revokeToken(connection.provider, tokens.refreshToken, fetcherOf(deps));
      }
    }
  } catch (error) {
    if (!(error instanceof CalendarError)) throw error;
  }
}

/** Organization deletion: its connections' channels and access, before the rows go. */
export async function releaseOrganizationCalendars(
  organizationId: string,
  deps: CalendarDeps,
  assertLease: () => Promise<void>,
): Promise<void> {
  const connections = await db
    .select()
    .from(schedulingCalendarConnection)
    .where(eq(schedulingCalendarConnection.organizationId, organizationId));
  for (const connection of connections) {
    await assertLease();
    await releaseConnection(connection, deps);
  }
}
