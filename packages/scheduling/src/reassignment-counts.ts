/** For a host's digest. Its own file: notifications are imported by what `reassignments.ts` imports. */
import { db, schema } from "@coss/db";
import { and, eq, sql } from "drizzle-orm";

const { schedulingReassignmentItem } = schema;

/** How many each way, counted when it's sent. */
export async function reassignmentCountsForHost(
  organizationId: string,
  reassignmentId: string,
  hostId: string,
): Promise<{ joined: number; left: number }> {
  const [row] = await db
    .select({
      joined: sql<number>`count(*) filter (where ${schedulingReassignmentItem.toHostId} = ${hostId})::int`,
      left: sql<number>`count(*) filter (where ${schedulingReassignmentItem.fromHostId} = ${hostId})::int`,
    })
    .from(schedulingReassignmentItem)
    .where(
      and(
        eq(schedulingReassignmentItem.reassignmentId, reassignmentId),
        eq(schedulingReassignmentItem.organizationId, organizationId),
        eq(schedulingReassignmentItem.outcome, "reassigned"),
      ),
    );
  return { joined: row?.joined ?? 0, left: row?.left ?? 0 };
}
