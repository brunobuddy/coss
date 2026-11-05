/**
 * A customer's OAuth app as `connections.ts` needs it: reading its credentials, and the provider
 * refusing them. Apart from `oauth-apps.ts` (managing them), which needs `connections.ts`.
 *
 * A refusal is one outage of one app, so it's one webhook, one log line and one email to the owners.
 * Hosts aren't told, since they can't fix it, and they aren't marked: their calendars go stale, and
 * `calendarVerdict` decides when that stops them being offered, as for any calendar that can't be read.
 */
import { db, type Executor, schema } from "@coss/db";
import { ID_PREFIXES, isId, newId } from "@coss/db/id";
import { appendLogEntries } from "@coss/logs";
import { enqueueNotification } from "@coss/notifications";
import {
  decryptSecret,
  encryptSecret,
  enqueueWebhookMessage,
  type SecretsKeyRing,
} from "@coss/webhooks";
import { and, eq } from "drizzle-orm";
import type { SchedulingOauthAppWebhookEventType } from "../webhook-types.ts";
import type { OAuthApp, OAuthProvider } from "./oauth.ts";

const { schedulingOauthApp } = schema;

export type OauthAppRow = typeof schedulingOauthApp.$inferSelect;

export type OauthAppCredentials = {
  clientSecret: string;
  /** Zoom's Secret Token, which signs the app's deauthorization events. */
  webhookSecret?: string | null;
};

export const encryptOauthAppCredentials = (
  credentials: OauthAppCredentials,
  keys: SecretsKeyRing,
): string => encryptSecret(JSON.stringify(credentials), keys);

export const oauthAppCredentials = (
  row: Pick<OauthAppRow, "encryptedCredentials">,
  keys: SecretsKeyRing,
): OauthAppCredentials =>
  JSON.parse(decryptSecret(row.encryptedCredentials, keys)) as OauthAppCredentials;

export const oauthAppOf = (row: OauthAppRow, keys: SecretsKeyRing): OAuthApp => ({
  clientId: row.clientId,
  clientSecret: oauthAppCredentials(row, keys).clientSecret,
  tenantId: row.tenantId,
});

/** The app new consents of this environment use. Null: coss.com's. */
export async function environmentOauthApp(
  scope: { organizationId: string; environmentId: string },
  provider: OAuthProvider,
  executor: Executor = db,
): Promise<OauthAppRow | null> {
  const [row] = await executor
    .select()
    .from(schedulingOauthApp)
    .where(
      and(
        eq(schedulingOauthApp.organizationId, scope.organizationId),
        eq(schedulingOauthApp.environmentId, scope.environmentId),
        eq(schedulingOauthApp.provider, provider),
      ),
    );
  return row ?? null;
}

/** The app a connection or a consent is pinned to. */
export async function pinnedOauthApp(
  id: string,
  organizationId: string,
): Promise<OauthAppRow | null> {
  const [row] = await db
    .select()
    .from(schedulingOauthApp)
    .where(
      and(eq(schedulingOauthApp.id, id), eq(schedulingOauthApp.organizationId, organizationId)),
    );
  return row ?? null;
}

/**
 * The app Zoom's event names in its URL. The id comes from an unauthenticated request, so nothing
 * here is trusted until the event's signature has been checked with this app's token.
 */
export async function zoomOauthAppForEvents(id: string): Promise<OauthAppRow | null> {
  if (!isId(ID_PREFIXES.schedulingOauthApp, id)) return null;
  const [row] = await db
    .select()
    .from(schedulingOauthApp)
    .where(and(eq(schedulingOauthApp.id, id), eq(schedulingOauthApp.provider, "zoom")));
  return row ?? null;
}

async function announce(
  tx: Parameters<typeof appendLogEntries>[0],
  app: OauthAppRow,
  type: SchedulingOauthAppWebhookEventType,
  code: string | null,
  now: Date,
): Promise<void> {
  const id = newId(ID_PREFIXES.webhookEvent);
  await enqueueWebhookMessage(tx, {
    id,
    organizationId: app.organizationId,
    environmentId: app.environmentId,
    type,
    payload: {
      id,
      object: "event",
      type,
      created_at: now.toISOString(),
      data: { oauth_app_id: app.id, provider: app.provider, code, occurred_at: now.toISOString() },
    },
  });
  const failing = type === "scheduling.oauth_app.failing";
  await appendLogEntries(tx, [
    {
      organizationId: app.organizationId,
      projectId: app.projectId,
      environmentId: app.environmentId,
      occurredAt: now,
      source: "scheduling",
      level: failing ? "error" : "info",
      type,
      message: failing
        ? `Your ${app.provider} OAuth app's credentials were refused: calendars connected through it can't be read`
        : `Your ${app.provider} OAuth app's credentials work again`,
      resourceType: "scheduling_oauth_app",
      resourceId: app.id,
      attributes: { provider: app.provider, ...(code ? { code } : {}) },
    },
  ]);
}

/**
 * Once per outage (compare-and-set). Only if the row still holds the secret that was refused: a
 * request on its way while someone rotates it says nothing about the new one.
 */
export async function markOauthAppFailing(
  app: Pick<OauthAppRow, "id" | "organizationId" | "encryptedCredentials">,
  code: string,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [changed] = await tx
      .update(schedulingOauthApp)
      .set({ status: "failing", lastErrorCode: code, lastErrorAt: now })
      .where(
        and(
          eq(schedulingOauthApp.id, app.id),
          eq(schedulingOauthApp.organizationId, app.organizationId),
          eq(schedulingOauthApp.status, "active"),
          eq(schedulingOauthApp.encryptedCredentials, app.encryptedCredentials),
        ),
      )
      .returning();
    if (!changed) return;
    await announce(tx, changed, "scheduling.oauth_app.failing", code, now);
    await enqueueNotification(tx, {
      organizationId: changed.organizationId,
      kind: "scheduling.oauth_app_failing",
      dedupeKey: `${changed.id}:${now.getTime()}`,
      payload: { oauthAppId: changed.id },
      now,
    });
  });
}

/**
 * The provider accepted it again, and calendars recover on their own next read. Only if the row still
 * holds the secret that was accepted: it says nothing about one saved since.
 */
export async function restoreOauthApp(
  app: Pick<OauthAppRow, "id" | "organizationId" | "encryptedCredentials">,
  now: Date,
  tx?: Parameters<typeof appendLogEntries>[0],
): Promise<void> {
  const restore = async (executor: Parameters<typeof appendLogEntries>[0]) => {
    const [changed] = await executor
      .update(schedulingOauthApp)
      .set({ status: "active", lastErrorCode: null, lastErrorAt: null })
      .where(
        and(
          eq(schedulingOauthApp.id, app.id),
          eq(schedulingOauthApp.organizationId, app.organizationId),
          eq(schedulingOauthApp.status, "failing"),
          eq(schedulingOauthApp.encryptedCredentials, app.encryptedCredentials),
        ),
      )
      .returning();
    if (changed) await announce(executor, changed, "scheduling.oauth_app.restored", null, now);
  };
  if (tx) await restore(tx);
  else await db.transaction(restore);
}
