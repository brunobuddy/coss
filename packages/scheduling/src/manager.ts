/**
 * What a team lead's session can reach: the hosts it names, or those matching an attribute filter
 * right now. The filter's asked again on every request, so someone who changes team leaves it. There
 * is no team table: who manages whom is the customer's to say, each time they mint a session.
 */
import { db, schema } from "@coss/db";
import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { SchedulingError } from "./errors.ts";
import { attributesMatch, type HostRow } from "./hosts.ts";
import type { SessionRow } from "./sessions.ts";
import type { SchedulingEnvironment } from "./types.ts";

const { schedulingBooking, schedulingBookingHost, schedulingHost, schedulingReassignment } = schema;

type Scope = Pick<SchedulingEnvironment, "organizationId" | "environmentId">;
type BookingRow = typeof schedulingBooking.$inferSelect;

const MANAGED_HOSTS_CAP = 1000;

/** Every host this session can reach, whatever their status: leaving is why someone's managed. */
export async function managedHosts(
  scope: Scope,
  session: Pick<SessionRow, "managerHostIds" | "managerHostFilter" | "createdByUserId">,
): Promise<HostRow[]> {
  const { managerHostIds: named, managerHostFilter: filter } = session;
  if (named) {
    if (named.length === 0) return [];
    return db
      .select()
      .from(schedulingHost)
      .where(
        and(
          eq(schedulingHost.organizationId, scope.organizationId),
          eq(schedulingHost.environmentId, scope.environmentId),
          inArray(schedulingHost.id, named),
        ),
      )
      .orderBy(asc(schedulingHost.name));
  }
  // `{}` matches everyone, and only `createDashboardSession` can mint it: nothing else should mean
  // the whole environment, and neither does that once the member's gone.
  const everyone = filter !== null && Object.keys(filter).length === 0;
  if (!filter || (everyone && !session.createdByUserId)) return [];
  const rows = await db
    .select()
    .from(schedulingHost)
    .where(
      and(
        eq(schedulingHost.organizationId, scope.organizationId),
        eq(schedulingHost.environmentId, scope.environmentId),
      ),
    )
    .orderBy(asc(schedulingHost.name));
  if (everyone) return rows;
  return rows
    .filter((host) => attributesMatch(host.attributes, filter))
    .slice(0, MANAGED_HOSTS_CAP);
}

/** What a page needs to choose someone, and nothing about them it doesn't. */
export const toManagedHost = (host: HostRow) => ({
  object: "scheduling.managed_host" as const,
  id: host.id,
  uid: host.uid,
  name: host.name,
  time_zone: host.timeZone,
  status: host.status,
});

/**
 * A booking as a team page sees it: when, what and who's hosting. Not who booked it: answers, contact
 * details and metadata stay with `getBooking`, since a lead's job is cover, not the attendee.
 */
export type ManagedBooking = {
  object: "scheduling.managed_booking";
  id: string;
  event_type: string;
  title: string;
  status: BookingRow["status"];
  start: string;
  end: string;
  hosts: string[];
  series: string | null;
  group_session: string | null;
  external_conflict: boolean;
  /** One of its hosts is away during it. */
  host_away: boolean;
};

export async function listManagedBookings(
  scope: Scope,
  hostIds: readonly string[],
  query: {
    hostId?: string | undefined;
    /** One booking, whenever it is: someone came here to move it. */
    bookingId?: string | undefined;
    needsCover?: boolean | undefined;
    now: Date;
    limit: number;
  },
): Promise<{ data: ManagedBooking[]; hasMore: boolean }> {
  const wanted = query.hostId ? hostIds.filter((id) => id === query.hostId) : [...hostIds];
  if (wanted.length === 0) return { data: [], hasMore: false };
  const away = sql<boolean>`exists (
    select 1 from scheduling_out_of_office o
    where o.host_id = ${schedulingBookingHost.hostId}
      and o.organization_id = ${schedulingBooking.organizationId}
      and o.deleted_at is null
      and o.start_at < ${schedulingBooking.endAt}
      and o.end_at > ${schedulingBooking.startAt}
  )`;
  const rows = await db
    .selectDistinct({ id: schedulingBooking.id, startAt: schedulingBooking.startAt })
    .from(schedulingBooking)
    .innerJoin(schedulingBookingHost, eq(schedulingBookingHost.bookingId, schedulingBooking.id))
    .where(
      and(
        eq(schedulingBooking.organizationId, scope.organizationId),
        eq(schedulingBooking.environmentId, scope.environmentId),
        inArray(schedulingBookingHost.hostId, wanted),
        inArray(schedulingBooking.status, ["confirmed", "pending_approval", "held"]),
        query.bookingId
          ? eq(schedulingBooking.id, query.bookingId)
          : gt(schedulingBooking.startAt, query.now),
        or(isNull(schedulingBooking.holdExpiresAt), gt(schedulingBooking.holdExpiresAt, query.now)),
        or(
          isNull(schedulingBooking.approvalExpiresAt),
          gt(schedulingBooking.approvalExpiresAt, query.now),
        ),
        query.needsCover
          ? or(sql`${schedulingBooking.externalConflictAt} is not null`, away)
          : undefined,
      ),
    )
    .orderBy(asc(schedulingBooking.startAt), asc(schedulingBooking.id))
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  if (page.length === 0) return { data: [], hasMore: false };
  const ids = page.map((row) => row.id);
  const [bookings, hosts] = await Promise.all([
    db
      .select()
      .from(schedulingBooking)
      .where(
        and(
          eq(schedulingBooking.organizationId, scope.organizationId),
          inArray(schedulingBooking.id, ids),
        ),
      ),
    db
      .select({
        bookingId: schedulingBookingHost.bookingId,
        hostId: schedulingBookingHost.hostId,
        away: sql<boolean>`exists (
          select 1 from scheduling_out_of_office o
          join scheduling_booking b on b.id = ${schedulingBookingHost.bookingId}
          where o.host_id = ${schedulingBookingHost.hostId}
            and o.organization_id = ${scope.organizationId}
            and o.deleted_at is null
            and o.start_at < b.end_at
            and o.end_at > b.start_at
        )`,
      })
      .from(schedulingBookingHost)
      .where(
        and(
          eq(schedulingBookingHost.organizationId, scope.organizationId),
          inArray(schedulingBookingHost.bookingId, ids),
        ),
      ),
  ]);
  const data = ids.flatMap((id): ManagedBooking[] => {
    const booking = bookings.find((row) => row.id === id);
    if (!booking) return [];
    const own = hosts.filter((row) => row.bookingId === id);
    return [
      {
        object: "scheduling.managed_booking",
        id,
        event_type: booking.eventTypeId,
        title: booking.title,
        status: booking.status,
        start: booking.startAt.toISOString(),
        end: booking.endAt.toISOString(),
        hosts: own.map((row) => row.hostId).sort(),
        series: booking.seriesId,
        group_session: booking.groupSessionId,
        external_conflict: booking.externalConflictAt !== null,
        host_away: own.some((row) => row.away),
      },
    ];
  });
  return { data, hasMore: rows.length > query.limit };
}

/**
 * A team page's own requests are checked here, so what it can start is what it can reach: a host
 * from the team, going to someone on it. The worker has no session to ask, so this is decided once.
 */
export function checkManagedRun(
  body: {
    selection: { host_id?: string };
    strategy:
      | { kind: "to_host"; host_id: string }
      | { kind: "auto"; preferred_host_ids: string[]; otherwise: "auto" | "leave" }
      | { kind: "assignments"; assignments: { to_host_id: string; from_host_id?: string }[] };
  },
  hostIds: ReadonlySet<string>,
): void {
  const refused = (message: string, param: string) =>
    new SchedulingError("invalid_reassignment", message, { param });
  const from = body.selection.host_id;
  if (!from || !hostIds.has(from)) throw refused("Choose someone on this team.", "selection");
  const { strategy } = body;
  if (strategy.kind === "auto" && strategy.otherwise === "auto") {
    // The fairest who's free could be anyone, on any team.
    throw refused("Say who they go to: name hosts, with `otherwise: leave`.", "strategy");
  }
  const targets =
    strategy.kind === "to_host"
      ? [strategy.host_id]
      : strategy.kind === "auto"
        ? strategy.preferred_host_ids
        : strategy.assignments.map((item) => item.to_host_id);
  if (targets.some((id) => !hostIds.has(id))) {
    throw refused("They can only go to someone on this team.", "strategy");
  }
  // Naming who leaves a booking with several hosts is as much a reach as naming who joins it.
  if (
    strategy.kind === "assignments" &&
    strategy.assignments.some((item) => item.from_host_id && !hostIds.has(item.from_host_id))
  ) {
    throw refused("They can only come from someone on this team.", "strategy");
  }
}

/** Whether a run came from someone on this team, or gives one back that did. */
export async function managedRunWhere(hostIds: readonly string[]) {
  const ids = sql.join(
    hostIds.map((id) => sql`${id}`),
    sql`, `,
  );
  if (hostIds.length === 0) return sql`false`;
  // An undo only names its bookings, so whose it is goes back to the run that started it, however
  // many undos ago that was.
  return sql`exists (
    with recursive chain (selection, undo_of_id) as (
      select r.selection, r.undo_of_id from scheduling_reassignment r
      where r.id = ${schedulingReassignment.id}
      union all
      select p.selection, p.undo_of_id from scheduling_reassignment p
      join chain on p.id = chain.undo_of_id
    )
    select 1 from chain where chain.selection->>'host_id' in (${ids})
  )`;
}
