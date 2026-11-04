/**
 * HIPAA mode's automatic logoff. Only activity in an organization in the mode counts, so a session
 * with no record yet is measured from when it began, and moving there from another organization
 * after the timeout means signing in again. One session, one person: activity in any organization
 * in the mode keeps it alive.
 */
import { HIPAA_IDLE_TIMEOUT_MINUTES } from "@coss/compliance";
import { db, schema } from "@coss/db";
import { eq, sql } from "drizzle-orm";
import { pgErrorCode } from "./errors.ts";

const { hipaaSessionActivity, session } = schema;

const IDLE_TIMEOUT_MS = HIPAA_IDLE_TIMEOUT_MINUTES * 60_000;
const ACTIVITY_RESOLUTION_MS = 60_000;
const FOREIGN_KEY_VIOLATION = "23503";

/**
 * Records this request as activity, or ends the session and returns `"idle"` when it comes too
 * late. The caller sends an idle request to sign in.
 */
export async function touchHipaaSession(
  current: { id: string; createdAt: Date },
  now: Date = new Date(),
): Promise<"active" | "idle"> {
  const [row] = await db
    .select({ lastActiveAt: hipaaSessionActivity.lastActiveAt })
    .from(hipaaSessionActivity)
    .where(eq(hipaaSessionActivity.sessionId, current.id))
    .limit(1);
  const lastActiveAt = row?.lastActiveAt ?? current.createdAt;
  const elapsed = now.getTime() - lastActiveAt.getTime();
  if (elapsed >= IDLE_TIMEOUT_MS) {
    return (await endIfStillIdle(current.id, now)) ? "idle" : "active";
  }
  if (!row || elapsed >= ACTIVITY_RESOLUTION_MS) {
    try {
      await db
        .insert(hipaaSessionActivity)
        .values({ sessionId: current.id, lastActiveAt: now })
        .onConflictDoUpdate({
          target: hipaaSessionActivity.sessionId,
          set: { lastActiveAt: sql`greatest(${hipaaSessionActivity.lastActiveAt}, ${now})` },
        });
    } catch (error) {
      // A concurrent request found it idle and ended it.
      if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) return "idle";
      throw error;
    }
  }
  return "active";
}

/**
 * Ends the session unless a concurrent request has just recorded activity: the condition is
 * checked in the delete itself. False only when the session is still there and was active.
 */
export async function endIfStillIdle(sessionId: string, now: Date): Promise<boolean> {
  const cutoff = new Date(now.getTime() - IDLE_TIMEOUT_MS);
  await db.delete(session).where(
    // `session.created_at` has no time zone, and holds UTC.
    sql`${session.id} = ${sessionId} and coalesce((select a.last_active_at from hipaa_session_activity a where a.session_id = ${session.id}), ${session.createdAt} at time zone 'UTC') <= ${cutoff}`,
  );
  const [remaining] = await db
    .select({ id: session.id })
    .from(session)
    .where(eq(session.id, sessionId))
    .limit(1);
  return remaining === undefined;
}
