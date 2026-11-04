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

/**
 * What a booking's location was chosen as, for matching against it: a session's meeting link says
 * only where to go, and the session keeps what was asked for.
 */
export async function chosenLocation(
  executor: Executor,
  booking: BookingRow,
): Promise<BookingRow["location"]> {
  if (!booking.groupSessionId) return booking.location;
  const [session] = await executor
    .select({ location: schedulingGroupSession.location })
    .from(schedulingGroupSession)
    .where(
      and(
        eq(schedulingGroupSession.id, booking.groupSessionId),
        eq(schedulingGroupSession.organizationId, booking.organizationId),
      ),
    );
  return session?.location ?? booking.location;
}

export async function withSessionLocation<T extends BookingRow>(
  executor: Executor,
  booking: T,
): Promise<T> {
  if (!booking.groupSessionId) return booking;
  // Someone who left isn't told where a later meeting of this session is.
  if (booking.status === "cancelled" || booking.status === "declined") {
    return { ...booking, location: null };
  }
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
