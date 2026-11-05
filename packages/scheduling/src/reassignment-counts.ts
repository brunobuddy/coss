/** For a host's digest. Its own file: notifications are imported by what `reassignments.ts` imports. */
import { db, type Executor, schema } from "@coss/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { resolvePolicy } from "./notification-policy.ts";

const { schedulingBooking, schedulingEventType, schedulingReassignmentItem, schedulingSettings } =
  schema;

export interface RunRef {
  organizationId: string;
  environmentId: string;
  reassignmentId: string;
}

const movedIn = (run: RunRef) =>
  and(
    eq(schedulingReassignmentItem.reassignmentId, run.reassignmentId),
    eq(schedulingReassignmentItem.organizationId, run.organizationId),
    eq(schedulingReassignmentItem.outcome, "reassigned"),
  );

const itsBooking = and(
  eq(schedulingBooking.id, schedulingReassignmentItem.bookingId),
  eq(schedulingBooking.organizationId, schedulingReassignmentItem.organizationId),
);

/** A booking in a run asks its event type whether hosts hear, as one moved by itself does. */
async function eventTypesTellingHosts(executor: Executor, run: RunRef): Promise<string[]> {
  const [settings] = await executor
    .select({ notifications: schedulingSettings.notifications })
    .from(schedulingSettings)
    .where(
      and(
        eq(schedulingSettings.organizationId, run.organizationId),
        eq(schedulingSettings.environmentId, run.environmentId),
      ),
    );
  const types = await executor
    .select({ id: schedulingEventType.id, notifications: schedulingEventType.notifications })
    .from(schedulingEventType)
    .where(
      and(
        eq(schedulingEventType.organizationId, run.organizationId),
        inArray(
          schedulingEventType.id,
          executor
            .selectDistinct({ id: schedulingBooking.eventTypeId })
            .from(schedulingReassignmentItem)
            .innerJoin(schedulingBooking, itsBooking)
            .where(movedIn(run)),
        ),
      ),
    );
  return types
    .filter(
      (type) => resolvePolicy("reassigned", settings?.notifications, type.notifications).emailHost,
    )
    .map((type) => type.id);
}

/** Who a run's digest goes to. */
export async function hostsToldOfRun(executor: Executor, run: RunRef): Promise<string[]> {
  const types = await eventTypesTellingHosts(executor, run);
  if (types.length === 0) return [];
  const moved = await executor
    .select({
      fromHostId: schedulingReassignmentItem.fromHostId,
      toHostId: schedulingReassignmentItem.toHostId,
    })
    .from(schedulingReassignmentItem)
    .innerJoin(schedulingBooking, itsBooking)
    .where(and(movedIn(run), inArray(schedulingBooking.eventTypeId, types)));
  return [
    ...new Set(
      moved.flatMap((item) => [item.fromHostId, item.toHostId]).filter((id) => id !== null),
    ),
  ];
}

/** How many each way, counted when it's sent. */
export async function reassignmentCountsForHost(
  run: RunRef,
  hostId: string,
): Promise<{ joined: number; left: number }> {
  const types = await eventTypesTellingHosts(db, run);
  if (types.length === 0) return { joined: 0, left: 0 };
  const [row] = await db
    .select({
      joined: sql<number>`count(*) filter (where ${schedulingReassignmentItem.toHostId} = ${hostId})::int`,
      left: sql<number>`count(*) filter (where ${schedulingReassignmentItem.fromHostId} = ${hostId})::int`,
    })
    .from(schedulingReassignmentItem)
    .innerJoin(schedulingBooking, itsBooking)
    .where(and(movedIn(run), inArray(schedulingBooking.eventTypeId, types)));
  return { joined: row?.joined ?? 0, left: row?.left ?? 0 };
}
