/** Which standard notifications an event owes, and where a booking's choices live. */
import { type Executor, schema } from "@coss/db";
import { and, eq } from "drizzle-orm";

const { schedulingBooking, schedulingEventType, schedulingSettings } = schema;

type BookingRow = typeof schedulingBooking.$inferSelect;
export type Policy = NonNullable<typeof schedulingSettings.$inferSelect.notifications>;
type WirePolicy = Record<
  string,
  { email_attendee?: boolean; email_host?: boolean; sms_attendee?: boolean }
>;

export type NotificationEvent =
  | "confirmed"
  | "pending_approval"
  | "rescheduled"
  | "cancelled"
  | "declined"
  | "reminder";

const DEFAULT_POLICY: Record<NotificationEvent, Policy[string]> = {
  confirmed: { emailAttendee: true, emailHost: true },
  pending_approval: { emailAttendee: true, emailHost: true },
  rescheduled: { emailAttendee: true, emailHost: true },
  cancelled: { emailAttendee: true, emailHost: true },
  declined: { emailAttendee: true },
  reminder: { emailAttendee: true },
};

/** Defaults, then the environment's choices, then the event type's. */
export function resolvePolicy(
  event: NotificationEvent,
  environmentPolicy: Policy | null | undefined,
  eventTypePolicy: Policy | null | undefined,
): Policy[string] {
  return {
    ...DEFAULT_POLICY[event],
    ...environmentPolicy?.[event],
    ...eventTypePolicy?.[event],
  };
}

export async function policiesOf(
  tx: Executor,
  booking: Pick<BookingRow, "organizationId" | "environmentId" | "eventTypeId">,
) {
  const [settings] = await tx
    .select({
      notifications: schedulingSettings.notifications,
      reminders: schedulingSettings.reminders,
    })
    .from(schedulingSettings)
    .where(
      and(
        eq(schedulingSettings.organizationId, booking.organizationId),
        eq(schedulingSettings.environmentId, booking.environmentId),
      ),
    );
  const [eventType] = await tx
    .select({
      notifications: schedulingEventType.notifications,
      reminders: schedulingEventType.reminders,
    })
    .from(schedulingEventType)
    .where(
      and(
        eq(schedulingEventType.id, booking.eventTypeId),
        eq(schedulingEventType.organizationId, booking.organizationId),
      ),
    );
  return {
    environment: settings?.notifications,
    eventType: eventType?.notifications,
    environmentReminders: settings?.reminders,
    eventTypeReminders: eventType?.reminders,
  };
}
export type Policies = Awaited<ReturnType<typeof policiesOf>>;

export function policyToWire(policy: Policy | null | undefined): WirePolicy | null {
  if (!policy) return null;
  return Object.fromEntries(
    Object.entries(policy).map(([event, choice]) => [
      event,
      {
        ...(choice.emailAttendee !== undefined ? { email_attendee: choice.emailAttendee } : {}),
        ...(choice.emailHost !== undefined ? { email_host: choice.emailHost } : {}),
        ...(choice.smsAttendee !== undefined ? { sms_attendee: choice.smsAttendee } : {}),
      },
    ]),
  );
}

export function policyFromWire(policy: WirePolicy | null): Policy | null {
  if (!policy) return null;
  return Object.fromEntries(
    Object.entries(policy).map(([event, choice]) => [
      event,
      {
        ...(choice.email_attendee !== undefined ? { emailAttendee: choice.email_attendee } : {}),
        ...(choice.email_host !== undefined ? { emailHost: choice.email_host } : {}),
        ...(choice.sms_attendee !== undefined ? { smsAttendee: choice.sms_attendee } : {}),
      },
    ]),
  );
}
