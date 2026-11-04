import { isHipaaMode } from "@coss/compliance";
import { db, type Executor, schema } from "@coss/db";
import { desc, eq, sql } from "drizzle-orm";
import type { PushKind } from "./schemas.ts";

const { pushNotification } = schema;

export type PushNotificationRow = typeof pushNotification.$inferSelect;

/**
 * Queues a push notification in the transaction that decided the event. With a `collapseKey`,
 * a notification still pending under that key absorbs it instead (its `count` goes up).
 */
export async function enqueuePush(
  tx: Executor,
  input: {
    organizationId: string;
    environmentId?: string | null;
    kind: PushKind;
    subjectId: string;
    collapseKey?: string;
    now?: Date;
  },
): Promise<void> {
  // Organization and project names would pass through Apple, outside the BAA.
  if (await isHipaaMode(input.organizationId, tx)) return;
  const now = input.now ?? new Date();
  const insert = tx.insert(pushNotification).values({
    organizationId: input.organizationId,
    environmentId: input.environmentId ?? null,
    kind: input.kind,
    subjectId: input.subjectId,
    collapseKey: input.collapseKey ?? null,
    nextAttemptAt: now,
    createdAt: now,
  });
  if (!input.collapseKey) {
    await insert;
    return;
  }
  await insert.onConflictDoUpdate({
    target: pushNotification.collapseKey,
    targetWhere: sql`${pushNotification.status} = 'pending'`,
    set: { count: sql`${pushNotification.count} + 1` },
  });
}

/** The organization's push notifications, newest first (tests and admin tooling). */
export async function listPushNotifications(
  organizationId: string,
): Promise<PushNotificationRow[]> {
  return db
    .select()
    .from(pushNotification)
    .where(eq(pushNotification.organizationId, organizationId))
    .orderBy(desc(pushNotification.createdAt), desc(pushNotification.id));
}
