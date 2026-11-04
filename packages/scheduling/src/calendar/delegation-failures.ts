/**
 * What losing access means for a delegation's connection. Credentials the provider refuses take
 * every host out together, in one update, and bring them back the same way, so nobody reconnects;
 * one mailbox that's gone only takes out its host. A refusal that could be either is settled by
 * asking about other mailboxes, so one person leaving can't hide everyone.
 */
import { db, schema } from "@coss/db";
import { ID_PREFIXES, newId } from "@coss/db/id";
import { appendLogEntries } from "@coss/logs";
import { enqueueNotification } from "@coss/notifications";
import { enqueueWebhookMessage } from "@coss/webhooks";
import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { SchedulingDelegationWebhookEventType } from "../webhook-types.ts";
import { CalendarError } from "./client.ts";
import {
  type CalendarDeps,
  type ConnectionRow,
  delegatedClient,
  delegationCredentials,
  fetcherOf,
  markNeedsReauth,
  nowMs,
} from "./connections.ts";
import { delegationFailureScope, mintDelegatedToken } from "./delegation-tokens.ts";

const { schedulingCalendar, schedulingCalendarConnection, schedulingCalendarDelegation } = schema;

export type DelegationRow = typeof schedulingCalendarDelegation.$inferSelect;
export type ProbeResult = {
  result: "ok" | "refused" | "inconclusive";
  /** What the provider said, when it refused. */
  error?: CalendarError;
};

const PROBE_MAILBOXES = 3;

const rowOf = (delegation: Pick<DelegationRow, "id" | "organizationId">) =>
  and(
    eq(schedulingCalendarDelegation.id, delegation.id),
    eq(schedulingCalendarDelegation.organizationId, delegation.organizationId),
  );

async function announce(
  tx: Parameters<typeof appendLogEntries>[0],
  delegation: DelegationRow,
  type: SchedulingDelegationWebhookEventType,
  code: string | null,
  now: Date,
): Promise<void> {
  const id = newId(ID_PREFIXES.webhookEvent);
  await enqueueWebhookMessage(tx, {
    id,
    organizationId: delegation.organizationId,
    environmentId: delegation.environmentId,
    type,
    payload: {
      id,
      object: "event",
      type,
      created_at: now.toISOString(),
      data: {
        delegation_id: delegation.id,
        provider: delegation.provider,
        domain: delegation.domain,
        code,
        occurred_at: now.toISOString(),
      },
    },
  });
  const failing = type === "scheduling.calendar_delegation.failing";
  await appendLogEntries(tx, [
    {
      organizationId: delegation.organizationId,
      projectId: delegation.projectId,
      environmentId: delegation.environmentId,
      occurredAt: now,
      source: "scheduling",
      level: failing ? "error" : "info",
      type,
      message: failing
        ? `Calendar access for ${delegation.domain} was refused: its hosts aren't offered until it's back`
        : `Calendar access for ${delegation.domain} is back`,
      resourceType: "scheduling_calendar_delegation",
      resourceId: delegation.id,
      attributes: { provider: delegation.provider, ...(code ? { code } : {}) },
    },
  ]);
}

/** Once per outage (compare-and-set): one flip, one webhook, one log line, one email. */
export async function markDelegationFailing(
  delegation: Pick<DelegationRow, "id" | "organizationId">,
  code: string,
  deps: Pick<CalendarDeps, "now">,
  opts: { ifCredentials?: string } = {},
): Promise<void> {
  const now = deps.now?.() ?? new Date();
  await db.transaction(async (tx) => {
    const [changed] = await tx
      .update(schedulingCalendarDelegation)
      .set({ status: "failing", failingSince: now, lastErrorCode: code })
      .where(
        and(
          rowOf(delegation),
          eq(schedulingCalendarDelegation.status, "active"),
          opts.ifCredentials
            ? eq(schedulingCalendarDelegation.encryptedCredentials, opts.ifCredentials)
            : undefined,
        ),
      )
      .returning();
    if (!changed) return;
    await tx
      .update(schedulingCalendarConnection)
      // Tokens go too: after a consent comes back, ones issued without it would still be refused.
      .set({
        status: "delegation_failing",
        encryptedCredentials: null,
        lastErrorCode: code,
        lastErrorAt: now,
      })
      .where(
        and(
          eq(schedulingCalendarConnection.delegationId, changed.id),
          eq(schedulingCalendarConnection.organizationId, changed.organizationId),
          eq(schedulingCalendarConnection.status, "active"),
        ),
      );
    await announce(tx, changed, "scheduling.calendar_delegation.failing", code, now);
    await enqueueNotification(tx, {
      organizationId: changed.organizationId,
      kind: "scheduling.delegation_failing",
      dedupeKey: `${changed.id}:${now.toISOString()}`,
      payload: { delegationId: changed.id },
      now,
    });
  });
}

/** Everyone comes back and is read straight away; mailboxes that were gone before stay as they were. */
export async function restoreDelegation(
  delegation: Pick<DelegationRow, "id" | "organizationId">,
  deps: Pick<CalendarDeps, "now">,
): Promise<void> {
  const now = deps.now?.() ?? new Date();
  await db.transaction(async (tx) => {
    const [changed] = await tx
      .update(schedulingCalendarDelegation)
      .set({ status: "active", failingSince: null, lastErrorCode: null, nextReconcileAt: now })
      .where(and(rowOf(delegation), eq(schedulingCalendarDelegation.status, "failing")))
      .returning();
    if (!changed) return;
    const connections = await tx
      .update(schedulingCalendarConnection)
      .set({ status: "active", lastErrorCode: null, lastErrorAt: null })
      .where(
        and(
          eq(schedulingCalendarConnection.delegationId, changed.id),
          eq(schedulingCalendarConnection.organizationId, changed.organizationId),
          eq(schedulingCalendarConnection.status, "delegation_failing"),
        ),
      )
      .returning({ id: schedulingCalendarConnection.id });
    if (connections.length > 0) {
      await tx
        .update(schedulingCalendar)
        .set({ nextSyncAt: now })
        .where(
          and(
            eq(schedulingCalendar.organizationId, changed.organizationId),
            inArray(
              schedulingCalendar.connectionId,
              connections.map((row) => row.id),
            ),
          ),
        );
    }
    await announce(tx, changed, "scheduling.calendar_delegation.restored", null, now);
  });
}

/** Whether this delegation's credentials reach this mailbox right now, skipping any cached token. */
export async function checkMailbox(
  delegation: Pick<DelegationRow, "provider" | "encryptedCredentials">,
  mailbox: string,
  deps: CalendarDeps,
): Promise<void> {
  const tokens = await mintDelegatedToken(
    delegationCredentials(delegation.encryptedCredentials, deps.secretsKeys),
    mailbox,
    { fetcher: fetcherOf(deps), nowMs: nowMs(deps) },
  );
  await delegatedClient(delegation.provider, tokens.accessToken, mailbox, deps).listCalendars();
}

/**
 * Asks about the mailbox known to work, then a couple of others, and only then the one in question.
 * A mailbox that's simply gone says nothing about the credentials, so that alone is never `refused`.
 * With nobody else to go on a revocation can't be told from a problem of its own, so that counts as
 * the delegation's: the owners hear, and it recovers by itself. Nothing checked says nothing, so
 * that's `inconclusive`.
 */
export async function probeDelegation(
  delegation: DelegationRow,
  deps: CalendarDeps,
  opts: { except?: string } = {},
): Promise<ProbeResult> {
  const others = await db
    .select({ account: schedulingCalendarConnection.accountId })
    .from(schedulingCalendarConnection)
    .where(
      and(
        eq(schedulingCalendarConnection.delegationId, delegation.id),
        eq(schedulingCalendarConnection.organizationId, delegation.organizationId),
        ne(schedulingCalendarConnection.status, "needs_reauth"),
        opts.except
          ? sql`lower(${schedulingCalendarConnection.accountId}) <> lower(${opts.except})`
          : undefined,
      ),
    )
    .limit(PROBE_MAILBOXES);
  const candidates = [
    ...new Set([
      ...(delegation.verifyAccount && delegation.verifyAccount !== opts.except
        ? [delegation.verifyAccount]
        : []),
      ...others.map((row) => row.account),
    ]),
  ].slice(0, PROBE_MAILBOXES);
  // The one in question last: if everyone else is simply gone, that's all there is to go on.
  const mailboxes = opts.except ? [...candidates, opts.except] : candidates;
  if (mailboxes.length === 0) return { result: "inconclusive" };
  let refused: CalendarError | undefined;
  let inconclusive = false;
  for (const mailbox of mailboxes) {
    try {
      await checkMailbox(delegation, mailbox, deps);
      return { result: "ok" };
    } catch (error) {
      if (!(error instanceof CalendarError)) throw error;
      if (error.kind !== "auth") {
        inconclusive = true;
        continue;
      }
      const scope = delegationFailureScope(error);
      if (scope === "credentials") return { result: "refused", error };
      if (scope === "ambiguous") refused = error;
    }
  }
  if (inconclusive) return { result: "inconclusive" };
  return refused ? { result: "refused", error: refused } : { result: "ok" };
}

/** Settles one refusal: `mailbox` is this mailbox's alone, `stop` means nothing more can be done now. */
export async function settleRefusal(
  delegation: DelegationRow,
  mailbox: string,
  error: CalendarError,
  deps: CalendarDeps,
): Promise<{ settled: "stop" } | { settled: "mailbox"; credentials: string }> {
  const scope = delegationFailureScope(error);
  // A mailbox with no calendar has answered, and asking again would get the same answer.
  if (error.code === "no_primary") {
    return { settled: "mailbox", credentials: delegation.encryptedCredentials };
  }
  // Any refusal may be an old one, of credentials since replaced or a mailbox since restored, from a
  // request that was already on its way, so nothing below acts on it without asking again. Taking
  // every host out needs the current credentials refused, and the flip is conditional on them still
  // being what's stored.
  const [current] = await db.select().from(schedulingCalendarDelegation).where(rowOf(delegation));
  if (current?.status !== "active") return { settled: "stop" };
  if (scope !== "mailbox") {
    const { result } = await probeDelegation(current, deps, { except: mailbox });
    if (result === "refused") {
      await markDelegationFailing(current, error.code, deps, {
        ifCredentials: current.encryptedCredentials,
      });
      return { settled: "stop" };
    }
    if (result !== "ok" || scope !== "ambiguous") return { settled: "stop" };
  }
  // Everyone else is fine, but the answer may be that same old one: ask about this mailbox too.
  try {
    await checkMailbox(current, mailbox, deps);
    return { settled: "stop" };
  } catch (recheck) {
    if (!(recheck instanceof CalendarError)) throw recheck;
    return recheck.kind === "auth"
      ? { settled: "mailbox", credentials: current.encryptedCredentials }
      : { settled: "stop" };
  }
}

/** Where every `auth` failure of a calendar goes, delegated or not. */
export async function handleAccessLost(
  connection: ConnectionRow,
  error: CalendarError,
  deps: CalendarDeps,
): Promise<void> {
  if (!connection.delegationId) {
    await markNeedsReauth(connection, error.code, deps);
    return;
  }
  const [delegation] = await db
    .select()
    .from(schedulingCalendarDelegation)
    .where(rowOf({ id: connection.delegationId, organizationId: connection.organizationId }));
  if (delegation?.status !== "active") return;
  const outcome = await settleRefusal(delegation, connection.accountId, error, deps);
  if (outcome.settled === "mailbox") {
    await markNeedsReauth(connection, error.code, deps, { ifCredentials: outcome.credentials });
    return;
  }
  // Whatever's wrong isn't this mailbox, so the token that was refused shouldn't be tried again.
  await db
    .update(schedulingCalendarConnection)
    .set({ encryptedCredentials: null })
    .where(
      and(
        eq(schedulingCalendarConnection.id, connection.id),
        eq(schedulingCalendarConnection.organizationId, connection.organizationId),
        isNotNull(schedulingCalendarConnection.delegationId),
      ),
    );
}
