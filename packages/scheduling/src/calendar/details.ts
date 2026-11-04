/**
 * What a host's calendar says about a booking. Neutral unless the event type asks for details:
 * then its title and who's coming, so a host can see who they're meeting. Never answers.
 */
import type { Executor } from "@coss/db";
import { schema } from "@coss/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { AttendeeContact } from "../attendees.ts";

const { schedulingCalendarEvent } = schema;

export type HostEventText = { title: string; description: string | null };

// What the host's calendar says, deliberately: their calendar may be seen by colleagues.
export const NEUTRAL_EVENT: HostEventText = { title: "Appointment", description: null };

type Person = AttendeeContact & { role: "attendee" | "guest" };

/** What an event's location field says. */
export function locationText(
  location: (typeof schema.schedulingBooking.$inferSelect)["location"],
): string | null {
  if (!location) return null;
  if (location.type === "link" || location.type === "zoom") return location.url;
  if (location.type === "phone") return location.number;
  if (location.type === "in_person") return location.address;
  return null;
}

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

function line(label: string, person: AttendeeContact): string | null {
  const parts = [person.name, person.email, person.phone].flatMap((part) =>
    part ? [oneLine(part)] : [],
  );
  return parts.length > 0 ? `${label}: ${parts.join(", ")}` : null;
}

/** Someone erased leaves the event's title and nothing about them. */
export function hostEventText(title: string, people: readonly Person[]): HostEventText {
  const attendee = people.find((person) => person.role === "attendee");
  const who = attendee?.name ?? attendee?.email;
  const lines = people.flatMap((person) => {
    const text = line(person.role === "guest" ? "Guest" : "Attendee", person);
    return text ? [text] : [];
  });
  return {
    title: who ? `${title} with ${oneLine(who)}` : title,
    description: lines.length > 0 ? lines.join("\n") : null,
  };
}

/**
 * Asks for these bookings' events to be written again, wherever they may hold someone's details.
 * Call it after changing the attendee rows, in the same transaction: see `detailsToSend`.
 */
export async function rewriteDetailedEvents(
  tx: Executor,
  scope: { organizationId: string },
  bookingIds: readonly string[],
  now: Date,
): Promise<void> {
  if (bookingIds.length === 0) return;
  await tx
    .update(schedulingCalendarEvent)
    .set({
      scrubPending: true,
      desiredVersion: sql`${schedulingCalendarEvent.desiredVersion} + 1`,
      nextAttemptAt: now,
      attempts: 0,
    })
    .where(
      and(
        eq(schedulingCalendarEvent.organizationId, scope.organizationId),
        inArray(schedulingCalendarEvent.bookingId, [...bookingIds]),
        eq(schedulingCalendarEvent.desiredState, "present"),
        eq(schedulingCalendarEvent.detailsWritten, true),
      ),
    );
}
