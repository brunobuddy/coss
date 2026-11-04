/**
 * A host's calendar connections: consent, credentials, which calendars count. Credentials are
 * encrypted with `encryptSecret`, and a refresh writes back only over the token it used, so it can't
 * overwrite a newer one, and a re-encryption can't make it lose the one it was just given.
 */
import { createHash, randomBytes } from "node:crypto";
import { db, type Executor, schema } from "@coss/db";
import { ID_PREFIXES, isId } from "@coss/db/id";
import { withoutTrailingSlashes } from "@coss/db/url";
import { decryptSecret, encryptSecret, type SecretsKeyRing } from "@coss/webhooks";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import type { Interval } from "../engine/intervals.ts";
import { SchedulingError } from "../errors.ts";
import { resolveHost } from "../hosts.ts";
import { caldavCalendarClient, type DavTransport, pinnedDavTransport } from "./caldav.ts";
import {
  type CalendarClient,
  CalendarError,
  type HttpFetch,
  type RemoteCalendar,
} from "./client.ts";
import { type DelegationCredentials, mintDelegatedToken } from "./delegation-tokens.ts";
import { locationText, NEUTRAL_EVENT } from "./details.ts";
import { recordCalendarEvent } from "./events.ts";
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
import { ZOOM_CALENDAR_ID, zoomCalendarClient, zoomUserId } from "./zoom.ts";

export { recordCalendarEvent };

const {
  schedulingBooking,
  schedulingBusyInterval,
  schedulingCalendar,
  schedulingCalendarConnection,
  schedulingCalendarDelegation,
  schedulingCalendarEvent,
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
  apps: {
    google: OAuthApp | null;
    microsoft: OAuthApp | null;
    /** `webhookSecret` signs Zoom's deauthorization events. */
    zoom?: (OAuthApp & { webhookSecret: string | null }) | null;
  };
  /** `API_PUBLIC_URL`: where providers send consent back and push notifications to. */
  publicUrl: string;
  fetcher?: HttpFetch;
  /** Defaults to well inside a write's lease, so a hung request can't outlive it. */
  requestTimeoutMs?: number;
  /** How long disconnecting may spend taking details off events. */
  scrubBudgetMs?: number;
  davTransport?: DavTransport;
  now?: () => Date;
};

type CaldavCredentials = { url: string; username: string; password: string };
const OAUTH_STATE_TTL_MS = 10 * 60_000;
const SCRUB_MAX_EVENTS = 200;
const SCRUB_BUDGET_MS = 15_000;
const REFRESH_MARGIN_MS = 2 * 60_000;
const REQUEST_TIMEOUT_MS = 30_000;
// Past a year: a weekly series of 52 has to fit, or its last occurrences couldn't be verified.
export const SYNC_HORIZON_DAYS = 400;

export const fetcherOf = (deps: CalendarDeps): HttpFetch => {
  const fetcher = deps.fetcher ?? fetch;
  const timeoutMs = deps.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  return async (url, init) => {
    try {
      const res = await fetcher(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 204) return res;
      // Read here so the timeout also covers a body that never finishes.
      const { status, statusText, headers } = res;
      return new Response(await res.text(), { status, statusText, headers });
    } catch {
      throw new CalendarError("transient", "unreachable", "Couldn't reach the calendar provider.");
    }
  };
};
export const nowMs = (deps: CalendarDeps): number => (deps.now?.() ?? new Date()).getTime();

export const oauthRedirectUri = (deps: Pick<CalendarDeps, "publicUrl">, provider: OAuthProvider) =>
  `${withoutTrailingSlashes(deps.publicUrl)}/scheduling/oauth/${provider}/callback`;

export const pushWebhookUrl = (deps: Pick<CalendarDeps, "publicUrl">, provider: OAuthProvider) =>
  `${withoutTrailingSlashes(deps.publicUrl)}/scheduling/push/${provider}`;

const appOf = (deps: CalendarDeps, provider: OAuthProvider): OAuthApp => {
  const app = deps.apps[provider];
  if (!app) {
    throw new SchedulingError(
      "calendar_unavailable",
      `Connecting ${provider} isn't set up in this deployment.`,
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

export function encryptCredentials(
  value: OAuthTokens | CaldavCredentials | DelegationCredentials,
  keys: SecretsKeyRing,
): string {
  return encryptSecret(JSON.stringify(value), keys);
}

/** A connection's calendars, new ones only: the primary one is read and written by default. */
export async function addRemoteCalendars(
  tx: Executor,
  connection: ConnectionRow,
  remote: readonly RemoteCalendar[],
  now: Date,
): Promise<void> {
  const [hasTarget] = await tx
    .select({ id: schedulingCalendar.id })
    .from(schedulingCalendar)
    .where(
      and(
        eq(schedulingCalendar.hostId, connection.hostId),
        eq(schedulingCalendar.organizationId, connection.organizationId),
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
        organizationId: connection.organizationId,
        environmentId: connection.environmentId,
        hostId: connection.hostId,
        connectionId: connection.id,
        externalId: calendar.externalId,
        readBusy: calendar.primary,
        writeTarget,
        nextSyncAt: now,
      })
      .onConflictDoNothing();
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
    // The host first, as connecting through a delegation does: this insert would otherwise reserve
    // the connection's key and wait on the host's lock while that waits on the key, and deadlock.
    await tx
      .select({ id: schedulingHost.id })
      .from(schedulingHost)
      .where(
        and(eq(schedulingHost.id, host.id), eq(schedulingHost.organizationId, host.organizationId)),
      )
      .for("update");
    // The mailbox is already reached through a delegation: a consent adds nothing, and its tokens
    // mustn't take the place of the delegation's.
    const [delegated] = await tx
      .select()
      .from(schedulingCalendarConnection)
      .where(
        and(
          eq(schedulingCalendarConnection.hostId, host.id),
          eq(schedulingCalendarConnection.organizationId, host.organizationId),
          eq(schedulingCalendarConnection.provider, input.provider),
          sql`lower(${schedulingCalendarConnection.accountId}) = lower(${input.accountId})`,
          isNotNull(schedulingCalendarConnection.delegationId),
        ),
      )
      .for("update");
    if (delegated) return delegated;
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
        // Checked again on the row as it stands once the lock is ours: a takeover that hadn't
        // committed when this began isn't visible above.
        where: isNull(schedulingCalendarConnection.delegationId),
      })
      .returning();
    if (!connection) {
      const [taken] = await tx
        .select()
        .from(schedulingCalendarConnection)
        .where(
          and(
            eq(schedulingCalendarConnection.hostId, host.id),
            eq(schedulingCalendarConnection.organizationId, host.organizationId),
            eq(schedulingCalendarConnection.provider, input.provider),
            eq(schedulingCalendarConnection.accountId, input.accountId),
          ),
        );
      return taken as ConnectionRow;
    }
    const row = connection as ConnectionRow;
    await addRemoteCalendars(tx, row, remote, now);
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
  if (provider === "zoom") return zoomUserId(accessToken, fetcherOf(deps));
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
  if (provider === "zoom") return zoomCalendarClient({ accessToken, fetcher });
  return provider === "google"
    ? googleCalendarClient({ accessToken, fetcher })
    : microsoftCalendarClient({ accessToken, fetcher });
}

/** A client on a delegation's token for this mailbox. */
export function delegatedClient(
  provider: "google" | "microsoft",
  accessToken: string,
  mailbox: string,
  deps: CalendarDeps,
): CalendarClient {
  const fetcher = fetcherOf(deps);
  return provider === "google"
    ? googleCalendarClient({ accessToken, fetcher, delegated: true })
    : microsoftCalendarClient({ accessToken, fetcher, mailbox });
}

export const delegationCredentials = (
  encrypted: string,
  keys: SecretsKeyRing,
): DelegationCredentials => JSON.parse(decryptSecret(encrypted, keys)) as DelegationCredentials;

/** Mints when the cached token is close to expiring; two workers doing so at once is harmless. */
async function delegatedClientFor(
  connection: ConnectionRow,
  deps: CalendarDeps,
): Promise<CalendarClient> {
  const provider = connection.provider;
  if (provider !== "google" && provider !== "microsoft") {
    throw new CalendarError("permanent", "not_delegable", "This provider has no delegation.");
  }
  let tokens = connection.encryptedCredentials
    ? (JSON.parse(decryptSecret(connection.encryptedCredentials, deps.secretsKeys)) as OAuthTokens)
    : null;
  if (!tokens || tokens.expiresAtMs - REFRESH_MARGIN_MS <= nowMs(deps)) {
    const [delegation] = await db
      .select({ encryptedCredentials: schedulingCalendarDelegation.encryptedCredentials })
      .from(schedulingCalendarDelegation)
      .where(
        and(
          eq(schedulingCalendarDelegation.id, connection.delegationId as string),
          eq(schedulingCalendarDelegation.organizationId, connection.organizationId),
        ),
      );
    if (!delegation) {
      throw new CalendarError("auth", "delegation_gone", "This delegation no longer exists.");
    }
    tokens = await mintDelegatedToken(
      delegationCredentials(delegation.encryptedCredentials, deps.secretsKeys),
      connection.accountId,
      { fetcher: fetcherOf(deps), nowMs: nowMs(deps) },
    );
    await db
      .update(schedulingCalendarConnection)
      .set({ encryptedCredentials: encryptCredentials(tokens, deps.secretsKeys) })
      .where(
        and(
          eq(schedulingCalendarConnection.id, connection.id),
          eq(schedulingCalendarConnection.organizationId, connection.organizationId),
          isNotNull(schedulingCalendarConnection.delegationId),
        ),
      );
  }
  return delegatedClient(provider, tokens.accessToken, connection.accountId, deps);
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
  try {
    return await saveConnection(
      host,
      {
        provider: "caldav",
        accountId: `${input.username}@${new URL(input.url).host}`,
        encryptedCredentials: encryptCredentials(input, deps.secretsKeys),
        client,
      },
      deps,
    );
  } catch (error) {
    if (!(error instanceof CalendarError)) throw error;
    throw new SchedulingError("calendar_unavailable", error.message, { param: "url" });
  }
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

/** A re-encrypted row still holds the token used; any other value is newer, and stays. */
async function saveRefreshedTokens(
  connection: ConnectionRow,
  usedRefreshToken: string,
  tokens: OAuthTokens,
  deps: CalendarDeps,
): Promise<void> {
  await db.transaction(async (tx) => {
    const where = and(
      eq(schedulingCalendarConnection.id, connection.id),
      eq(schedulingCalendarConnection.organizationId, connection.organizationId),
    );
    const [current] = await tx
      .select({ stored: schedulingCalendarConnection.encryptedCredentials })
      .from(schedulingCalendarConnection)
      .where(where)
      .for("update");
    if (!current?.stored) return;
    if (current.stored !== connection.encryptedCredentials) {
      const held = JSON.parse(decryptSecret(current.stored, deps.secretsKeys)) as OAuthTokens;
      if (held.refreshToken !== usedRefreshToken) return;
    }
    await tx
      .update(schedulingCalendarConnection)
      .set({ encryptedCredentials: encryptCredentials(tokens, deps.secretsKeys) })
      .where(where);
  });
}

/** A client for a connection, refreshing its access first when it's close to expiring. */
export async function clientFor(
  connection: ConnectionRow,
  deps: CalendarDeps,
): Promise<CalendarClient> {
  if (connection.provider === "simulated") return simulatedCalendarClient();
  if (connection.delegationId) return delegatedClientFor(connection, deps);
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
    const usedRefreshToken = tokens.refreshToken;
    if (!usedRefreshToken) {
      throw new CalendarError("auth", "no_refresh_token", "Calendar access has expired.");
    }
    try {
      tokens = await refreshTokens({
        provider,
        app: appOf(deps, provider),
        refreshToken: usedRefreshToken,
        fetcher: fetcherOf(deps),
        nowMs: nowMs(deps),
      });
    } catch (error) {
      // Zoom's refresh tokens work once, so another worker may just have used this one.
      if (error instanceof CalendarError && error.kind === "auth") {
        const [current] = await db
          .select()
          .from(schedulingCalendarConnection)
          .where(eq(schedulingCalendarConnection.id, connection.id));
        if (
          current?.encryptedCredentials &&
          current.encryptedCredentials !== connection.encryptedCredentials
        ) {
          return clientFor(current, deps);
        }
      }
      throw error;
    }
    await saveRefreshedTokens(connection, usedRefreshToken, tokens, deps);
  }
  return oauthClient(provider, tokens.accessToken, deps);
}

/**
 * A connection that lost access. Once only (compare-and-set on the status): the host stops being
 * offered at once, the customer hears by webhook, and the host by email, unless it's a delegation's:
 * they can't reconnect that, so it's only the customer's to hear about.
 */
export async function markNeedsReauth(
  connection: ConnectionRow,
  code: string,
  deps: Pick<CalendarDeps, "now">,
  opts: { ifCredentials?: string } = {},
): Promise<void> {
  const now = deps.now?.() ?? new Date();
  await db.transaction(async (tx) => {
    // The delegation before the connection, as a bulk flip locks them. Credentials replaced since the
    // mailbox was asked about may well reach it, and whoever replaced them has already retried it.
    if (opts.ifCredentials && connection.delegationId) {
      const [delegation] = await tx
        .select({ stored: schedulingCalendarDelegation.encryptedCredentials })
        .from(schedulingCalendarDelegation)
        .where(
          and(
            eq(schedulingCalendarDelegation.id, connection.delegationId),
            eq(schedulingCalendarDelegation.organizationId, connection.organizationId),
          ),
        )
        .for("share");
      if (delegation?.stored !== opts.ifCredentials) return;
    }
    const [current] = await tx
      .select({ delegationId: schedulingCalendarConnection.delegationId })
      .from(schedulingCalendarConnection)
      .where(
        and(
          eq(schedulingCalendarConnection.id, connection.id),
          eq(schedulingCalendarConnection.organizationId, connection.organizationId),
        ),
      )
      .for("update");
    if (!current) return;
    // The old OAuth tokens failing says nothing once a delegation has taken the row over.
    if (current.delegationId && !connection.delegationId) return;
    const [changed] = await tx
      .update(schedulingCalendarConnection)
      .set({ status: "needs_reauth", lastErrorCode: code, lastErrorAt: now })
      .where(
        and(
          eq(schedulingCalendarConnection.id, connection.id),
          eq(schedulingCalendarConnection.organizationId, connection.organizationId),
          eq(schedulingCalendarConnection.status, "active"),
        ),
      )
      .returning({ id: schedulingCalendarConnection.id });
    if (!changed) return;
    await recordCalendarEvent(tx, connection, "scheduling.calendar.needs_reauth", now);
    if (current.delegationId) return;
    await tx
      .insert(schedulingNotification)
      .values({
        organizationId: connection.organizationId,
        environmentId: connection.environmentId,
        hostId: connection.hostId,
        kind: connection.provider === "zoom" ? "zoom_needs_reauth" : "calendar_needs_reauth",
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
  status: "active" | "needs_reauth";
  /** The delegation that manages it: the host can't disconnect or reconnect it. */
  delegation: string | null;
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
    // A customer's code only needs to know the host's out; `delegation` says whose problem it is.
    status: row.status === "active" ? "active" : "needs_reauth",
    delegation: row.delegationId,
    calendars: calendars
      .filter(
        (calendar) => calendar.connectionId === row.id && calendar.externalId !== ZOOM_CALENDAR_ID,
      )
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
          ne(schedulingCalendar.externalId, ZOOM_CALENDAR_ID),
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
  const managed = () =>
    new SchedulingError(
      "calendar_managed",
      "A calendar delegation manages this connection. Delete the delegation to end it.",
    );
  if (connection.delegationId) throw managed();
  await releaseConnection(connection, deps);
  await db.transaction(async (tx) => {
    // A delegation may have taken it over during that, and this would delete its events' ledger.
    const [current] = await tx
      .select({ delegationId: schedulingCalendarConnection.delegationId })
      .from(schedulingCalendarConnection)
      .where(
        and(
          eq(schedulingCalendarConnection.id, connection.id),
          eq(schedulingCalendarConnection.organizationId, connection.organizationId),
        ),
      )
      .for("update");
    if (current?.delegationId) throw managed();
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

/** Someone removed the app in Zoom: every connection of that Zoom user goes, in any organization. */
export async function handleZoomDeauthorization(
  zoomUser: string,
  deps: CalendarDeps,
): Promise<number> {
  const connections = await db
    .select()
    .from(schedulingCalendarConnection)
    .where(
      and(
        eq(schedulingCalendarConnection.provider, "zoom"),
        eq(schedulingCalendarConnection.accountId, zoomUser),
      ),
    );
  for (const connection of connections) {
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
  }
  return connections.length;
}

const ZOOM_IDLE_MS = 30 * 24 * 60 * 60_000;

/** Zoom's refresh tokens expire when unused, and a host may go months between bookings. */
export async function refreshIdleZoomConnections(
  deps: CalendarDeps,
  opts: { limit?: number; scope?: { organizationIds: readonly string[] } } = {},
): Promise<number> {
  const idleSince = new Date(nowMs(deps) - ZOOM_IDLE_MS);
  const idle = await db
    .select()
    .from(schedulingCalendarConnection)
    .where(
      and(
        eq(schedulingCalendarConnection.provider, "zoom"),
        eq(schedulingCalendarConnection.status, "active"),
        lt(schedulingCalendarConnection.updatedAt, idleSince),
        opts.scope
          ? inArray(schedulingCalendarConnection.organizationId, [...opts.scope.organizationIds])
          : undefined,
      ),
    )
    .limit(opts.limit ?? 50);
  for (const connection of idle) {
    try {
      await clientFor(connection, deps);
    } catch (error) {
      if (!(error instanceof CalendarError)) throw error;
      if (error.kind === "auth") await markNeedsReauth(connection, error.code, deps);
    }
  }
  return idle.length;
}

/** Best effort at the provider: leaving is never blocked by one being down. */
async function scrubEvents(
  connection: ConnectionRow,
  deps: CalendarDeps,
  deadline: number,
): Promise<void> {
  const rows = await db
    .select({
      event: schedulingCalendarEvent,
      calendarId: schedulingCalendar.externalId,
      location: schedulingBooking.location,
    })
    .from(schedulingCalendarEvent)
    .innerJoin(schedulingCalendar, eq(schedulingCalendar.id, schedulingCalendarEvent.calendarId))
    .innerJoin(schedulingBooking, eq(schedulingBooking.id, schedulingCalendarEvent.bookingId))
    .where(
      and(
        eq(schedulingCalendar.connectionId, connection.id),
        eq(schedulingCalendarEvent.organizationId, connection.organizationId),
        eq(schedulingCalendarEvent.detailsWritten, true),
        eq(schedulingCalendarEvent.desiredState, "present"),
        isNotNull(schedulingCalendarEvent.providerEventId),
      ),
    )
    .orderBy(desc(schedulingCalendarEvent.desiredEnd))
    .limit(SCRUB_MAX_EVENTS);
  if (rows.length === 0) return;
  const client = await clientFor(connection, deps);
  for (const { event, calendarId, location } of rows) {
    if (Date.now() > deadline) return;
    const providerEventId = event.providerEventId as string;
    try {
      // Where the host may have moved it: nothing will ever correct this event again.
      const current = await client.getEvent?.(calendarId, providerEventId);
      if (current?.state === "deleted") continue;
      await client.updateEvent(calendarId, providerEventId, {
        key: providerEventId,
        ...NEUTRAL_EVENT,
        startMs: current?.startMs ?? event.desiredStart.getTime(),
        endMs: current?.endMs ?? event.desiredEnd.getTime(),
        conference: null,
        location: locationText(location),
      });
    } catch (error) {
      if (!(error instanceof CalendarError)) throw error;
    }
  }
}

/**
 * Details come off events while there's still access to them, newest first and within a budget, so
 * disconnecting stays quick. Best effort, and nothing here may stop the disconnect: whatever's left,
 * like everything on a calendar whose access was revoked at the provider, is out of coss.com's reach.
 * A group session's event has only its title, naming nobody, so it isn't scrubbed.
 */
async function scrubDetailedEvents(connection: ConnectionRow, deps: CalendarDeps): Promise<void> {
  if (connection.status !== "active") return;
  const budgetMs = deps.scrubBudgetMs ?? SCRUB_BUDGET_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      scrubEvents(connection, deps, Date.now() + budgetMs),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, budgetMs);
      }),
    ]);
  } catch (error) {
    console.error(`[scheduling] couldn't scrub events of connection ${connection.id}:`, error);
  } finally {
    clearTimeout(timer);
  }
}

export async function releaseConnection(
  connection: ConnectionRow,
  deps: CalendarDeps,
): Promise<void> {
  await scrubDetailedEvents(connection, deps);
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
    // A delegation's tokens aren't this host's to revoke.
    if (connection.encryptedCredentials && !connection.delegationId) {
      const tokens = JSON.parse(
        decryptSecret(connection.encryptedCredentials, deps.secretsKeys),
      ) as OAuthTokens;
      if (tokens.refreshToken) {
        await revokeToken(
          connection.provider,
          tokens.refreshToken,
          fetcherOf(deps),
          deps.apps[connection.provider],
        );
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
