/**
 * Sends due push notifications (the worker's `push-notifications` loop). System-level: the scan
 * spans organizations; every read and write is scoped by the notification's own organization.
 */
import { isHipaaMode } from "@coss/compliance";
import { db, schema } from "@coss/db";
import { and, asc, desc, eq, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";
import { type PushContent, resolvePush } from "./content.ts";
import { forgetPushDevice } from "./devices.ts";
import type { PushNotificationRow } from "./outbox.ts";
import { type PushTarget, pushTargets } from "./recipients.ts";
import type { ApnsEnvironment, PushKind } from "./schemas.ts";

const { pushNotification } = schema;

const MINUTE = 60 * 1000;
/** A claimed notification is not picked up by another worker for this long. */
export const PUSH_LEASE_MS = 5 * MINUTE;
/** Attempts before a notification is given up as `failed` (backoff 1, 2, 4… min). */
export const MAX_PUSH_ATTEMPTS = 8;
/** Older notifications are skipped: a late alert is noise, and the emails cover these events. */
export const MAX_PUSH_AGE_MS = 60 * MINUTE;
/** At most one push per collapse key (an environment's review queue) this often. */
export const PUSH_THROTTLE_MS: Partial<Record<PushKind, number>> = { risk_review: 15 * MINUTE };
/** How long APNs keeps trying a device that is offline. */
export const PUSH_EXPIRY_MS = 24 * 60 * MINUTE;

export type PushMessage = PushContent & {
  /** The notification id; senders derive `apns-id` from it. */
  id: string;
  /** Notifications with the same collapse id replace each other on the device. */
  collapseId: string;
  expiresAt: Date;
};

export type PushResult =
  | { status: "delivered" }
  /** The token is no longer valid for this app: the registration is removed. */
  | { status: "invalid_token"; reason: string }
  | { status: "retry"; reason: string };

/** Delivers one message to one device. Never throws for the device's answer. */
export type PushSender = {
  send(target: PushTarget, message: PushMessage): Promise<PushResult>;
  /** The APNs gateways its key works with; devices registered for another are left out. All when absent. */
  environments?: readonly ApnsEnvironment[];
};

export type PushDeps = { sender: PushSender };

/** Development only: prints pushes to the console. */
export const logPushSender: PushSender = {
  async send(target, message) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("[push] No APNs credentials configured in production.");
    }
    console.info(
      `\n[push] To device ${target.deviceId}: ${message.title} — ${message.body} (${message.path})\n`,
    );
    return { status: "delivered" };
  },
};

function retryDelayMs(attempt: number): number {
  return Math.min(2 ** (attempt - 1) * MINUTE, 60 * MINUTE);
}

/** Sends due notifications, oldest first. Returns how many were claimed. */
export async function runDuePushNotifications(
  opts: { now?: Date; limit?: number; scope?: { organizationIds: string[] } },
  deps: PushDeps,
): Promise<number> {
  const startedAt = Date.now();
  const base = opts.now ?? new Date();
  // Leases and writes use the time as it passes (sends are slow), counted from `now` so tests can pin it.
  const clock = () => new Date(base.getTime() + (Date.now() - startedAt));
  const dueBy = (at: Date) =>
    and(
      eq(pushNotification.status, "pending"),
      isNotNull(pushNotification.nextAttemptAt),
      lte(pushNotification.nextAttemptAt, at),
    );
  const candidates = await db
    .select({
      id: pushNotification.id,
      kind: pushNotification.kind,
      collapseKey: pushNotification.collapseKey,
    })
    .from(pushNotification)
    .where(
      and(
        dueBy(base),
        opts.scope
          ? inArray(pushNotification.organizationId, opts.scope.organizationIds)
          : undefined,
      ),
    )
    .orderBy(asc(pushNotification.nextAttemptAt))
    .limit(opts.limit ?? 20);

  let claimed = 0;
  for (const candidate of candidates) {
    const at = clock();
    const notBefore = await throttledUntil(candidate, at);
    if (notBefore) {
      // Not an attempt: later events of this key coalesce into the waiting notification.
      await db
        .update(pushNotification)
        .set({ nextAttemptAt: notBefore })
        .where(and(dueBy(at), eq(pushNotification.id, candidate.id)));
      continue;
    }
    const [row] = await db
      .update(pushNotification)
      .set({
        attemptCount: sql`${pushNotification.attemptCount} + 1`,
        nextAttemptAt: new Date(at.getTime() + PUSH_LEASE_MS),
      })
      .where(and(dueBy(at), eq(pushNotification.id, candidate.id)))
      .returning();
    if (!row) continue;
    claimed++;
    await deliver(row, deps, clock);
  }
  return claimed;
}

async function throttledUntil(
  candidate: { id: string; kind: PushKind; collapseKey: string | null },
  now: Date,
): Promise<Date | null> {
  const interval = PUSH_THROTTLE_MS[candidate.kind];
  if (!interval || !candidate.collapseKey) return null;
  const [last] = await db
    .select({ sentAt: pushNotification.sentAt })
    .from(pushNotification)
    .where(
      and(
        eq(pushNotification.collapseKey, candidate.collapseKey),
        isNotNull(pushNotification.sentAt),
        ne(pushNotification.id, candidate.id),
      ),
    )
    .orderBy(desc(pushNotification.sentAt))
    .limit(1);
  if (!last?.sentAt) return null;
  const until = new Date(last.sentAt.getTime() + interval);
  return until > now ? until : null;
}

async function deliver(row: PushNotificationRow, deps: PushDeps, clock: () => Date): Promise<void> {
  // The claim's attempt is the fencing token: a worker whose lease was taken over writes nothing.
  const owned = and(
    eq(pushNotification.id, row.id),
    eq(pushNotification.organizationId, row.organizationId),
    eq(pushNotification.status, "pending"),
    eq(pushNotification.attemptCount, row.attemptCount),
  );
  const delivered = new Set(row.deliveredDeviceIds);

  /** Ends the notification. Events that coalesced into it after the claim get a notification of their own. */
  const settle = (values: Partial<typeof pushNotification.$inferInsert>) =>
    db.transaction(async (tx) => {
      const [settled] = await tx
        .update(pushNotification)
        .set({ nextAttemptAt: null, ...values })
        .where(owned)
        .returning({ count: pushNotification.count });
      const missed = settled ? settled.count - row.count : 0;
      if (missed <= 0 || !row.collapseKey) return;
      const at = clock();
      await tx
        .insert(pushNotification)
        .values({
          organizationId: row.organizationId,
          environmentId: row.environmentId,
          kind: row.kind,
          subjectId: row.subjectId,
          collapseKey: row.collapseKey,
          count: missed,
          nextAttemptAt: at,
          createdAt: at,
        })
        .onConflictDoUpdate({
          target: pushNotification.collapseKey,
          targetWhere: sql`${pushNotification.status} = 'pending'`,
          set: { count: sql`${pushNotification.count} + ${missed}` },
        });
    });

  /** Records progress and renews the lease; false once another worker owns the notification. */
  const keep = async (): Promise<boolean> => {
    const [kept] = await db
      .update(pushNotification)
      .set({
        deliveredDeviceIds: [...delivered],
        nextAttemptAt: new Date(clock().getTime() + PUSH_LEASE_MS),
      })
      .where(owned)
      .returning({ id: pushNotification.id });
    return Boolean(kept);
  };

  try {
    if (clock().getTime() - row.createdAt.getTime() > MAX_PUSH_AGE_MS) {
      await settle({ status: "skipped", lastError: "too_old" });
      return;
    }
    // Also here: a notification can be queued while the mode is being turned on.
    if (await isHipaaMode(row.organizationId)) {
      await settle({ status: "skipped", lastError: "hipaa_mode" });
      return;
    }
    const resolved = await resolvePush(row);
    if ("skip" in resolved) {
      await settle({ status: "skipped", lastError: resolved.skip });
      return;
    }
    const served = deps.sender.environments;
    const targets = (
      await pushTargets({ organizationId: row.organizationId, kind: row.kind, now: clock() })
    ).filter((target) => !served || served.includes(target.apnsEnvironment));
    if (!targets.length && !delivered.size) {
      await settle({ status: "skipped", lastError: "no_recipients" });
      return;
    }
    const message: PushMessage = {
      ...resolved.content,
      id: row.id,
      collapseId: row.collapseKey ?? row.id,
      expiresAt: new Date(row.createdAt.getTime() + PUSH_EXPIRY_MS),
    };
    const retries: string[] = [];
    for (const target of targets) {
      if (delivered.has(target.deviceId)) continue;
      const result = await deps.sender.send(target, message);
      if (result.status === "delivered") delivered.add(target.deviceId);
      else if (result.status === "invalid_token") {
        await forgetPushDevice(target.deviceId, target.token);
      } else retries.push(result.reason);
      if (!(await keep())) return;
    }
    if (retries.length) throw new Error(`APNs: ${[...new Set(retries)].join(", ")}`);
    await settle({
      status: "sent",
      deliveredDeviceIds: [...delivered],
      sentAt: clock(),
      lastError: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[push] notification ${row.id} (${row.organizationId}) failed:`, error);
    if (row.attemptCount >= MAX_PUSH_ATTEMPTS) {
      await settle({ status: "failed", deliveredDeviceIds: [...delivered], lastError: message });
    } else {
      await db
        .update(pushNotification)
        .set({
          // New events joined it meanwhile: the retry tells every device again.
          deliveredDeviceIds: sql`case when ${pushNotification.count} = ${row.count}
            then array[${sql.join(
              [...delivered].map((id) => sql`${id}`),
              sql`, `,
            )}]::text[] else '{}'::text[] end`,
          nextAttemptAt: new Date(clock().getTime() + retryDelayMs(row.attemptCount)),
          lastError: message,
        })
        .where(owned);
    }
  }
}
