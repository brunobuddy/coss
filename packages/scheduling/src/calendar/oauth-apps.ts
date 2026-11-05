/**
 * A customer's own OAuth apps, so calendar consent screens show their brand. An environment has at
 * most one per provider, and new consents use it. A connection keeps the app that issued its tokens,
 * so connections made before an app existed stay on coss.com's until their host consents again.
 *
 * The secret is tried before it's stored, on a real connection if there is one, since a bad paste
 * would otherwise take every host's calendar out at their next refresh.
 */
import type { PlanGate } from "@coss/billing/gate";
import { db, schema } from "@coss/db";
import { ID_PREFIXES, isId } from "@coss/db/id";
import { withoutTrailingSlashes } from "@coss/db/url";
import { enqueueNotification } from "@coss/notifications";
import { decryptSecret } from "@coss/webhooks";
import { and, asc, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import { SchedulingError } from "../errors.ts";
import type {
  CreateOauthAppRequestOutput,
  OauthAppObjectOutput,
  UpdateOauthAppRequestOutput,
} from "../schemas.ts";
import type { SchedulingEnvironment } from "../types.ts";
import { CalendarError } from "./client.ts";
import {
  type CalendarDeps,
  fetcherOf,
  nowMs,
  oauthRedirectUri,
  saveRefreshedTokens,
} from "./connections.ts";
import { SECRET_WARNING_MS } from "./delegation-notifications.ts";
import {
  APP_REFUSED,
  GOOGLE_SCOPES,
  MICROSOFT_SCOPES,
  type OAuthApp,
  type OAuthTokens,
  refreshTokens,
} from "./oauth.ts";
import {
  encryptOauthAppCredentials,
  environmentOauthApp,
  type OauthAppRow,
  oauthAppCredentials,
  restoreOauthApp,
} from "./oauth-app-state.ts";

export { oauthAppCredentials, zoomOauthAppForEvents } from "./oauth-app-state.ts";

const { schedulingCalendarConnection, schedulingOauthApp } = schema;

type Scope = Pick<SchedulingEnvironment, "organizationId" | "environmentId">;
type Scan = { limit?: number; scope?: { organizationIds: readonly string[] } };

export type OauthAppDeps = Pick<
  CalendarDeps,
  "secretsKeys" | "publicUrl" | "fetcher" | "requestTimeoutMs" | "now"
> & {
  /** Only creating an app is gated: rotating or removing one always works. */
  plans?: Pick<PlanGate, "requireFeature"> | undefined;
};

// What a Zoom app has to be given in its own settings: Zoom doesn't take scopes in the request.
export const ZOOM_APP_SCOPES = [
  "meeting:read:list_meetings",
  "meeting:read:meeting",
  "meeting:write:meeting",
  "meeting:update:meeting",
  "meeting:delete:meeting",
  "user:read:user",
];

const SCOPES = { google: GOOGLE_SCOPES, microsoft: MICROSOFT_SCOPES, zoom: ZOOM_APP_SCOPES };
const SECRET_CHECK_CONNECTIONS = 3;
// Never a real token, so all this can learn is whether the provider accepts the app.
const SECRET_CHECK_TOKEN = "coss-secret-check";

const invalid = (message: string, param: string) =>
  new SchedulingError("invalid_oauth_app", message, { param });

const refused = () =>
  new SchedulingError(
    "oauth_app_refused",
    "The provider refused this client ID and secret. Check them, and that the secret hasn't expired.",
  );

const unanswered = () =>
  new SchedulingError("calendar_unavailable", "The provider didn't answer. Try again.");

const isUniqueViolation = (error: unknown): boolean => {
  const code = (error as { code?: string; cause?: { code?: string } }).cause?.code;
  return code === "23505" || (error as { code?: string }).code === "23505";
};

/**
 * A live environment's addresses are https. A sandbox may use localhost, to try a forwarder from a
 * laptop. Only the customer's own app can ever be sent to these, so they're no open redirect.
 */
function checkedUrl(
  value: string | null | undefined,
  param: string,
  mode: SchedulingEnvironment["mode"],
): string | null | undefined {
  if (value === null || value === undefined) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid("Use a full URL.", param);
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local && mode === "sandbox")) {
    throw invalid("Use an https URL.", param);
  }
  if (url.username || url.password || url.hash) {
    throw invalid("This URL can't have credentials or a fragment.", param);
  }
  return value;
}

async function connectedCounts(rows: readonly OauthAppRow[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const first = rows[0];
  if (!first) return counts;
  const found = await db
    .select({
      oauthAppId: schedulingCalendarConnection.oauthAppId,
      connected: sql<number>`count(*)::int`,
    })
    .from(schedulingCalendarConnection)
    .where(
      and(
        eq(schedulingCalendarConnection.organizationId, first.organizationId),
        inArray(
          schedulingCalendarConnection.oauthAppId,
          rows.map((row) => row.id),
        ),
      ),
    )
    .groupBy(schedulingCalendarConnection.oauthAppId);
  for (const row of found) counts.set(row.oauthAppId as string, row.connected);
  return counts;
}

function toObject(
  row: OauthAppRow,
  counts: Map<string, number>,
  deps: Pick<CalendarDeps, "publicUrl">,
): OauthAppObjectOutput {
  return {
    object: "scheduling.oauth_app",
    id: row.id,
    provider: row.provider,
    client_id: row.clientId,
    tenant_id: row.tenantId,
    redirect_uri: row.redirectUri,
    coss_callback_url: oauthRedirectUri(deps, row.provider),
    completion_url: row.completionUrl,
    zoom_event_url:
      row.provider === "zoom"
        ? `${withoutTrailingSlashes(deps.publicUrl)}/scheduling/zoom/events/${row.id}`
        : null,
    scopes: [...SCOPES[row.provider]],
    status: row.status,
    last_error_code: row.lastErrorCode,
    last_error_at: row.lastErrorAt?.toISOString() ?? null,
    secret_expires_at: row.secretExpiresAt?.toISOString() ?? null,
    verified_at: row.verifiedAt?.toISOString() ?? null,
    connections: counts.get(row.id) ?? 0,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

const objectOf = async (row: OauthAppRow, deps: Pick<CalendarDeps, "publicUrl">) =>
  toObject(row, await connectedCounts([row]), deps);

async function findOauthApp(scope: Scope, id: string): Promise<OauthAppRow> {
  const [row] = isId(ID_PREFIXES.schedulingOauthApp, id)
    ? await db
        .select()
        .from(schedulingOauthApp)
        .where(
          and(
            eq(schedulingOauthApp.id, id),
            eq(schedulingOauthApp.organizationId, scope.organizationId),
            eq(schedulingOauthApp.environmentId, scope.environmentId),
          ),
        )
    : [];
  if (!row) throw new SchedulingError("not_found", `No OAuth app "${id}" here.`);
  return row;
}

export async function listOauthApps(
  scope: Scope,
  deps: Pick<CalendarDeps, "publicUrl">,
): Promise<OauthAppObjectOutput[]> {
  const rows = await db
    .select()
    .from(schedulingOauthApp)
    .where(
      and(
        eq(schedulingOauthApp.organizationId, scope.organizationId),
        eq(schedulingOauthApp.environmentId, scope.environmentId),
      ),
    )
    .orderBy(asc(schedulingOauthApp.provider));
  const counts = await connectedCounts(rows);
  return rows.map((row) => toObject(row, counts, deps));
}

export async function getOauthApp(
  scope: Scope,
  id: string,
  deps: Pick<CalendarDeps, "publicUrl">,
): Promise<OauthAppObjectOutput> {
  return objectOf(await findOauthApp(scope, id), deps);
}

/** Whether a host's page can offer Zoom: coss.com's app, or this environment's own. */
export async function zoomConnectable(
  scope: Scope,
  deps: Pick<CalendarDeps, "apps">,
): Promise<boolean> {
  return Boolean(deps.apps.zoom) || Boolean(await environmentOauthApp(scope, "zoom"));
}

/** Whether a host's page should speak for the customer: it has an app of its own. */
export async function hasOauthApp(scope: Scope): Promise<boolean> {
  const [row] = await db
    .select({ id: schedulingOauthApp.id })
    .from(schedulingOauthApp)
    .where(
      and(
        eq(schedulingOauthApp.organizationId, scope.organizationId),
        eq(schedulingOauthApp.environmentId, scope.environmentId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * With no host's token to try, a token that can't exist: a provider that knows the app says that
 * token is no good, and one that doesn't says so about the app. Not every provider checks the app
 * first, so passing here doesn't prove the secret. The first consent does (`verified_at`).
 */
async function checkWithoutConnections(
  provider: OauthAppRow["provider"],
  app: OAuthApp,
  deps: OauthAppDeps,
): Promise<void> {
  try {
    await refreshTokens({
      provider,
      app,
      refreshToken: SECRET_CHECK_TOKEN,
      fetcher: fetcherOf(deps),
      nowMs: nowMs(deps),
    });
  } catch (error) {
    if (!(error instanceof CalendarError)) throw error;
    if (error.code === APP_REFUSED) throw refused();
    if (error.kind !== "auth") throw unanswered();
  }
}

/** On a host's real token, keeping what comes back: Zoom's work once. */
async function checkOnConnections(
  row: OauthAppRow,
  app: OAuthApp,
  deps: OauthAppDeps,
): Promise<boolean> {
  const connections = await db
    .select()
    .from(schedulingCalendarConnection)
    .where(
      and(
        eq(schedulingCalendarConnection.oauthAppId, row.id),
        eq(schedulingCalendarConnection.organizationId, row.organizationId),
        eq(schedulingCalendarConnection.status, "active"),
        isNull(schedulingCalendarConnection.delegationId),
      ),
    )
    .limit(SECRET_CHECK_CONNECTIONS);
  for (const connection of connections) {
    if (!connection.encryptedCredentials) continue;
    const stored = JSON.parse(
      decryptSecret(connection.encryptedCredentials, deps.secretsKeys),
    ) as OAuthTokens;
    if (!stored.refreshToken) continue;
    try {
      const tokens = await refreshTokens({
        provider: row.provider,
        app,
        refreshToken: stored.refreshToken,
        fetcher: fetcherOf(deps),
        nowMs: nowMs(deps),
      });
      await saveRefreshedTokens(connection, stored.refreshToken, tokens, deps);
      return true;
    } catch (error) {
      if (!(error instanceof CalendarError)) throw error;
      if (error.code === APP_REFUSED) throw refused();
      // That host's own access is gone, or another worker just spent their token: ask about another.
      if (error.kind !== "auth") throw unanswered();
    }
  }
  return false;
}

export async function createOauthApp(
  env: SchedulingEnvironment,
  params: CreateOauthAppRequestOutput,
  deps: OauthAppDeps,
): Promise<OauthAppObjectOutput> {
  await deps.plans?.requireFeature(env.organizationId, "schedulingOauthApps");
  const redirectUri = checkedUrl(params.redirect_uri, "redirect_uri", env.mode);
  const completionUrl = checkedUrl(params.completion_url, "completion_url", env.mode);
  const tenantId = params.provider === "microsoft" ? (params.tenant_id ?? null) : null;
  await checkWithoutConnections(
    params.provider,
    { clientId: params.client_id, clientSecret: params.client_secret, tenantId },
    deps,
  );
  try {
    const [row] = await db
      .insert(schedulingOauthApp)
      .values({
        organizationId: env.organizationId,
        projectId: env.projectId,
        environmentId: env.environmentId,
        provider: params.provider,
        clientId: params.client_id,
        tenantId,
        redirectUri: redirectUri ?? null,
        completionUrl: completionUrl ?? null,
        secretExpiresAt: params.secret_expires_at ? new Date(params.secret_expires_at) : null,
        encryptedCredentials: encryptOauthAppCredentials(
          {
            clientSecret: params.client_secret,
            webhookSecret: params.provider === "zoom" ? (params.webhook_secret ?? null) : null,
          },
          deps.secretsKeys,
        ),
      })
      .returning();
    return objectOf(row as OauthAppRow, deps);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw invalid(
        `This environment already has a ${params.provider} OAuth app. Update it, or delete it first.`,
        "provider",
      );
    }
    throw error;
  }
}

/** Not plan-gated: a secret that can't be rotated would take hosts' calendars out when it expires. */
export async function updateOauthApp(
  env: SchedulingEnvironment,
  id: string,
  params: UpdateOauthAppRequestOutput,
  deps: OauthAppDeps,
): Promise<OauthAppObjectOutput> {
  const row = await findOauthApp(env, id);
  if (params.tenant_id !== undefined && row.provider !== "microsoft") {
    throw invalid("Only a Microsoft app has a tenant.", "tenant_id");
  }
  if (params.webhook_secret !== undefined && row.provider !== "zoom") {
    throw invalid("Only a Zoom app has a Secret Token.", "webhook_secret");
  }
  const redirectUri = checkedUrl(params.redirect_uri, "redirect_uri", env.mode);
  const completionUrl = checkedUrl(params.completion_url, "completion_url", env.mode);
  const tenantId = params.tenant_id !== undefined ? params.tenant_id : row.tenantId;
  const rotating = params.client_secret !== undefined;
  if (params.client_secret !== undefined) {
    const app = { clientId: row.clientId, clientSecret: params.client_secret, tenantId };
    if (!(await checkOnConnections(row, app, deps))) {
      await checkWithoutConnections(row.provider, app, deps);
    }
  }
  const credentialsChanged = rotating || params.webhook_secret !== undefined;
  const thisRow = and(
    eq(schedulingOauthApp.id, row.id),
    eq(schedulingOauthApp.organizationId, row.organizationId),
  );
  await db.transaction(async (tx) => {
    // Read again under the lock: trying that secret took a while, and whatever was saved meanwhile
    // has to survive, like a Secret Token this request isn't changing.
    const [locked] = await tx.select().from(schedulingOauthApp).where(thisRow).for("update");
    if (!locked) throw new SchedulingError("not_found", `No OAuth app "${id}" here.`);
    const current = oauthAppCredentials(locked, deps.secretsKeys);
    const [updated] = await tx
      .update(schedulingOauthApp)
      .set({
        ...(params.tenant_id !== undefined ? { tenantId } : {}),
        ...(redirectUri !== undefined ? { redirectUri } : {}),
        ...(completionUrl !== undefined ? { completionUrl } : {}),
        // A new secret's expiry is what's asked for now: the old one's says nothing about it.
        ...(params.secret_expires_at !== undefined || rotating
          ? {
              secretExpiresAt: params.secret_expires_at ? new Date(params.secret_expires_at) : null,
            }
          : {}),
        ...(credentialsChanged
          ? {
              encryptedCredentials: encryptOauthAppCredentials(
                {
                  clientSecret: params.client_secret ?? current.clientSecret,
                  webhookSecret:
                    params.webhook_secret !== undefined
                      ? params.webhook_secret
                      : (current.webhookSecret ?? null),
                },
                deps.secretsKeys,
              ),
            }
          : {}),
      })
      .where(thisRow)
      .returning();
    if (rotating && updated) await restoreOauthApp(updated, new Date(nowMs(deps)), tx);
  });
  return getOauthApp(env, id, deps);
}

/**
 * Refused while connections use it: nothing else can refresh their tokens, and hosts' calendars aren't
 * coss.com's to drop. Taking the row first means a consent finishing now fails on its foreign key.
 */
export async function deleteOauthApp(scope: Scope, id: string): Promise<{ id: string }> {
  const row = await findOauthApp(scope, id);
  await db.transaction(async (tx) => {
    await tx
      .select({ id: schedulingOauthApp.id })
      .from(schedulingOauthApp)
      .where(
        and(
          eq(schedulingOauthApp.id, row.id),
          eq(schedulingOauthApp.organizationId, row.organizationId),
        ),
      )
      .for("update");
    const [used] = await tx
      .select({ connections: sql<number>`count(*)::int` })
      .from(schedulingCalendarConnection)
      .where(
        and(
          eq(schedulingCalendarConnection.oauthAppId, row.id),
          eq(schedulingCalendarConnection.organizationId, row.organizationId),
        ),
      );
    const connections = used?.connections ?? 0;
    if (connections > 0) {
      throw new SchedulingError(
        "oauth_app_in_use",
        `${connections} calendar ${connections === 1 ? "connection uses" : "connections use"} this app, and only it can refresh their access. Disconnect them first.`,
      );
    }
    await tx
      .delete(schedulingOauthApp)
      .where(
        and(
          eq(schedulingOauthApp.id, row.id),
          eq(schedulingOauthApp.organizationId, row.organizationId),
        ),
      );
  });
  return { id };
}

/** For the dashboard's banner: which of the environment's apps are refused right now. */
export async function failingOauthApps(scope: Scope): Promise<string[]> {
  const rows = await db
    .select({ provider: schedulingOauthApp.provider })
    .from(schedulingOauthApp)
    .where(
      and(
        eq(schedulingOauthApp.organizationId, scope.organizationId),
        eq(schedulingOauthApp.environmentId, scope.environmentId),
        eq(schedulingOauthApp.status, "failing"),
      ),
    );
  return rows.map((row) => row.provider);
}

/**
 * Owners and admins hear before a client secret expires. Once per secret (the dedupe key), and it
 * walks every app in the window: those already told stay in it for two weeks, so a batch that always
 * started at the beginning would never reach the ones behind them. `limit` is the batch's size.
 */
export async function warnOfExpiringOauthAppSecrets(
  deps: Pick<CalendarDeps, "now">,
  opts: Scan = {},
): Promise<number> {
  const now = deps.now?.() ?? new Date();
  const batchSize = opts.limit ?? 200;
  let checked = 0;
  let after: string | null = null;
  for (;;) {
    const rows: { id: string; organizationId: string; expires: Date | null }[] = await db
      .select({
        id: schedulingOauthApp.id,
        organizationId: schedulingOauthApp.organizationId,
        expires: schedulingOauthApp.secretExpiresAt,
      })
      .from(schedulingOauthApp)
      .where(
        and(
          gt(schedulingOauthApp.secretExpiresAt, now),
          lte(schedulingOauthApp.secretExpiresAt, new Date(now.getTime() + SECRET_WARNING_MS)),
          opts.scope
            ? inArray(schedulingOauthApp.organizationId, [...opts.scope.organizationIds])
            : undefined,
          after ? gt(schedulingOauthApp.id, after) : undefined,
        ),
      )
      .orderBy(asc(schedulingOauthApp.id))
      .limit(batchSize);
    for (const row of rows) {
      await enqueueNotification(db, {
        organizationId: row.organizationId,
        kind: "scheduling.oauth_app_secret_expiring",
        dedupeKey: `${row.id}:${(row.expires as Date).toISOString()}`,
        payload: { oauthAppId: row.id },
        now,
      });
    }
    checked += rows.length;
    const last = rows.at(-1);
    if (!last || rows.length < batchSize) return checked;
    after = last.id;
  }
}
