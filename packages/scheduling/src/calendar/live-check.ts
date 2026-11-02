/**
 * One last look at the provider before booking, since a calendar can change between syncs. Outside
 * any transaction, and bounded: on a timeout or error, the synced data (still within its freshness
 * budget, or the host wouldn't have got this far) has to do.
 */
import { db, schema } from "@coss/db";
import { and, eq, inArray } from "drizzle-orm";
import { normalizeIntervals, overlapsAny, subtractIntervals } from "../engine/intervals.ts";
import { type CalendarDeps, clientFor } from "./connections.ts";

const { schedulingCalendar, schedulingCalendarConnection, schedulingCalendarEvent } = schema;

const LIVE_CHECK_MS = 2000;

function withinBudget<T>(work: Promise<T>): Promise<T | null> {
  return Promise.race([
    work.catch(() => null),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), LIVE_CHECK_MS);
    }),
  ]);
}

/** Which of these hosts the provider now says are busy in `[startMs, endMs)`. */
export async function hostsBusyNow(
  organizationId: string,
  hostIds: readonly string[],
  startMs: number,
  endMs: number,
  deps: CalendarDeps,
): Promise<Set<string>> {
  const busy = new Set<string>();
  if (hostIds.length === 0) return busy;
  const rows = await db
    .select({ calendar: schedulingCalendar, connection: schedulingCalendarConnection })
    .from(schedulingCalendar)
    .innerJoin(
      schedulingCalendarConnection,
      eq(schedulingCalendarConnection.id, schedulingCalendar.connectionId),
    )
    .where(
      and(
        eq(schedulingCalendar.organizationId, organizationId),
        inArray(schedulingCalendar.hostId, [...hostIds]),
        eq(schedulingCalendar.readBusy, true),
        eq(schedulingCalendarConnection.status, "active"),
      ),
    );
  const own = await db
    .select({
      hostId: schedulingCalendarEvent.hostId,
      desiredStart: schedulingCalendarEvent.desiredStart,
      desiredEnd: schedulingCalendarEvent.desiredEnd,
    })
    .from(schedulingCalendarEvent)
    .where(
      and(
        eq(schedulingCalendarEvent.organizationId, organizationId),
        inArray(schedulingCalendarEvent.hostId, [...hostIds]),
        eq(schedulingCalendarEvent.desiredState, "present"),
      ),
    );
  await Promise.all(
    rows.map(async ({ calendar, connection }) => {
      if (connection.provider === "simulated") return;
      const answer = await withinBudget(
        clientFor(connection, deps).then((client) =>
          client.fetchBusy({ calendarIds: [calendar.externalId], fromMs: startMs, toMs: endMs }),
        ),
      );
      const intervals = answer?.[calendar.externalId];
      if (!intervals) return;
      const external = subtractIntervals(
        normalizeIntervals(intervals),
        normalizeIntervals(
          own
            .filter((event) => event.hostId === calendar.hostId)
            .map((event) => ({
              startMs: event.desiredStart.getTime(),
              endMs: event.desiredEnd.getTime(),
            })),
        ),
      );
      if (overlapsAny(external, startMs, endMs)) busy.add(calendar.hostId);
    }),
  );
  return busy;
}
