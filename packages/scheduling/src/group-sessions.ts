/** What a group session's seats share: one location, one calendar event, one meeting. */
import { type Executor, schema } from "@coss/db";
import { and, eq } from "drizzle-orm";

const { schedulingBooking, schedulingGroupSession } = schema;

type BookingRow = typeof schedulingBooking.$inferSelect;
type SessionRow = typeof schedulingGroupSession.$inferSelect;

export function locationOfSession(
  session: Pick<SessionRow, "location" | "meetingUrl">,
): BookingRow["location"] {
  return session.meetingUrl ? { type: "link", url: session.meetingUrl } : session.location;
}

export async function withSessionLocation<T extends BookingRow>(
  executor: Executor,
  booking: T,
): Promise<T> {
  if (!booking.groupSessionId) return booking;
  const [session] = await executor
    .select({
      location: schedulingGroupSession.location,
      meetingUrl: schedulingGroupSession.meetingUrl,
    })
    .from(schedulingGroupSession)
    .where(
      and(
        eq(schedulingGroupSession.id, booking.groupSessionId),
        eq(schedulingGroupSession.organizationId, booking.organizationId),
      ),
    );
  return session ? { ...booking, location: locationOfSession(session) } : booking;
}

export async function confirmedSeats(
  executor: Executor,
  session: Pick<SessionRow, "id" | "organizationId">,
): Promise<BookingRow[]> {
  return executor
    .select()
    .from(schedulingBooking)
    .where(
      and(
        eq(schedulingBooking.groupSessionId, session.id),
        eq(schedulingBooking.organizationId, session.organizationId),
        eq(schedulingBooking.status, "confirmed"),
      ),
    );
}
