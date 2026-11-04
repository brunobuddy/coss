/**
 * What every change to a booking records: its history row (sequenced under the booking's lock),
 * webhook and log line, all in the caller's transaction. None of them carry a person's details.
 */
import { type Executor, schema } from "@coss/db";
import { ID_PREFIXES, newId } from "@coss/db/id";
import { appendLogEntries } from "@coss/logs";
import { enqueueWebhookMessage } from "@coss/webhooks";
import { and, asc, desc, eq } from "drizzle-orm";
import type { SchedulingWebhookEventType } from "./schemas.ts";

const { schedulingAttendee, schedulingBooking, schedulingBookingEvent, schedulingBookingHost } =
  schema;

type BookingRow = typeof schedulingBooking.$inferSelect;
type AttendeeRow = typeof schedulingAttendee.$inferSelect;
export type BookingActor = NonNullable<typeof schedulingBookingEvent.$inferInsert.actor>;

export type ReminderWebhookData = {
  key: string;
  anchor: string;
  before_minutes: number | null;
  after_minutes: number | null;
  scheduled_for: string;
};

export function toWebhookData(
  booking: BookingRow,
  hostIds: readonly string[],
  attendeeUids: readonly string[],
  occurredAt: Date,
  extra: { previousStart?: Date; reminder?: ReminderWebhookData } = {},
) {
  return {
    booking_id: booking.id,
    event_type_id: booking.eventTypeId,
    status: booking.status,
    start: booking.startAt.toISOString(),
    end: booking.endAt.toISOString(),
    host_ids: [...hostIds],
    attendee_uids: [...attendeeUids],
    series_id: booking.seriesId,
    ...(extra.previousStart ? { previous_start: extra.previousStart.toISOString() } : {}),
    ...(extra.reminder ? { reminder: extra.reminder } : {}),
    occurred_at: occurredAt.toISOString(),
  };
}

export async function participants(
  tx: Executor,
  booking: Pick<BookingRow, "id" | "organizationId">,
): Promise<{ hostIds: string[]; attendees: AttendeeRow[] }> {
  const hosts = await tx
    .select({ hostId: schedulingBookingHost.hostId })
    .from(schedulingBookingHost)
    .where(
      and(
        eq(schedulingBookingHost.bookingId, booking.id),
        eq(schedulingBookingHost.organizationId, booking.organizationId),
      ),
    )
    .orderBy(asc(schedulingBookingHost.hostId));
  const attendees = await tx
    .select()
    .from(schedulingAttendee)
    .where(
      and(
        eq(schedulingAttendee.bookingId, booking.id),
        eq(schedulingAttendee.organizationId, booking.organizationId),
      ),
    )
    .orderBy(asc(schedulingAttendee.id));
  return { hostIds: hosts.map((row) => row.hostId), attendees };
}

export async function recordChange(
  tx: Executor,
  booking: BookingRow,
  input: {
    type: string;
    webhook: SchedulingWebhookEventType | null;
    actor: BookingActor;
    occurredAt: Date;
    /** When what's reported was due, if the worker got to it later: the webhook's `occurred_at`. */
    momentAt?: Date;
    details?: Record<string, unknown>;
    previousStart?: Date;
    reminder?: ReminderWebhookData;
    message: string;
    level?: "info" | "warning";
  },
): Promise<void> {
  const [last] = await tx
    .select({ sequence: schedulingBookingEvent.sequence })
    .from(schedulingBookingEvent)
    .where(
      and(
        eq(schedulingBookingEvent.bookingId, booking.id),
        eq(schedulingBookingEvent.organizationId, booking.organizationId),
      ),
    )
    .orderBy(desc(schedulingBookingEvent.sequence))
    .limit(1);
  await tx.insert(schedulingBookingEvent).values({
    organizationId: booking.organizationId,
    bookingId: booking.id,
    sequence: (last?.sequence ?? 0) + 1,
    type: input.type,
    actor: input.actor,
    details: input.details ?? {},
    occurredAt: input.occurredAt,
  });
  const { hostIds, attendees } = await participants(tx, booking);
  if (input.webhook) {
    const id = newId(ID_PREFIXES.webhookEvent);
    await enqueueWebhookMessage(tx, {
      id,
      organizationId: booking.organizationId,
      environmentId: booking.environmentId,
      type: input.webhook,
      payload: {
        id,
        object: "event",
        type: input.webhook,
        created_at: input.occurredAt.toISOString(),
        data: toWebhookData(
          booking,
          hostIds,
          attendees.flatMap((attendee) => (attendee.uid ? [attendee.uid] : [])),
          input.momentAt ?? input.occurredAt,
          {
            ...(input.previousStart ? { previousStart: input.previousStart } : {}),
            ...(input.reminder ? { reminder: input.reminder } : {}),
          },
        ),
      },
    });
  }
  await appendLogEntries(tx, [
    {
      organizationId: booking.organizationId,
      projectId: booking.projectId,
      environmentId: booking.environmentId,
      occurredAt: input.occurredAt,
      source: "scheduling",
      level: input.level ?? "info",
      type: input.type,
      message: input.message,
      resourceType: "scheduling_booking",
      resourceId: booking.id,
      attributes: {
        event_type_id: booking.eventTypeId,
        status: booking.status,
        host_ids: hostIds,
        start: booking.startAt.toISOString(),
      },
      searchTerms: [booking.eventTypeId, ...hostIds],
    },
  ]);
}
