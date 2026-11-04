/**
 * Queues a bulk reassignment, and nothing else. Its own file because out of office calls it in its
 * own transaction, and importing `reassignments.ts` from there would make a cycle with `bookings.ts`.
 *
 * Only the run's row goes in here: its items' foreign keys take `key share` on bookings, and doing
 * that while out of office holds the host would deadlock with a reschedule, which takes the booking
 * and then the host. The worker works out the items.
 */
import { type Executor, schema } from "@coss/db";
import type {
  SchedulingReassignmentSelection,
  SchedulingReassignmentStrategy,
} from "@coss/db/schema";

const { schedulingReassignment } = schema;

export type ReassignmentSelection = SchedulingReassignmentSelection;
export type ReassignmentStrategy = SchedulingReassignmentStrategy;
export type ReassignmentRow = typeof schedulingReassignment.$inferSelect;

export async function queueReassignment(
  tx: Executor,
  values: Pick<
    typeof schedulingReassignment.$inferInsert,
    | "organizationId"
    | "projectId"
    | "environmentId"
    | "selection"
    | "strategy"
    | "reasonCode"
    | "actor"
  > &
    Partial<typeof schedulingReassignment.$inferInsert>,
): Promise<ReassignmentRow> {
  const [row] = await tx.insert(schedulingReassignment).values(values).returning();
  return row as ReassignmentRow;
}
