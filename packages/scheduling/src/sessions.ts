/**
 * A browser's authority: short-lived and scoped, created by the customer's backend or for an email.
 * The URL carries the session id in its path (not secret: it picks the environment's settings) and
 * the token in its fragment (never sent to a server, so never logged). Only the token's sha256 is
 * stored. No cookies are involved anywhere. Unlike Cal.com's booking uid, a manage link says what it
 * can do, expires, and stops working when the booking is cancelled.
 */
import { createHash, randomBytes } from "node:crypto";
import type { PlanGate } from "@coss/billing/gate";
import { db, schema } from "@coss/db";
import { ID_PREFIXES, isId, newId } from "@coss/db/id";
import { withoutTrailingSlashes } from "@coss/db/url";
import { decryptSecret, encryptSecret } from "@coss/webhooks";
import { and, eq, isNull, sql } from "drizzle-orm";
import { emailLookup } from "./attendees.ts";
import type { BookingActor } from "./bookings.ts";
import { SchedulingError } from "./errors.ts";
import { resolveEventType } from "./event-types.ts";
import { resolveHost } from "./hosts.ts";
import { requireLiveFeature } from "./plan.ts";
import type { AttendeeInputOutput } from "./schemas.ts";
import type { SchedulingDeps, SchedulingEnvironment } from "./types.ts";

const { environment, schedulingBooking, schedulingSession } = schema;

export type SessionRow = typeof schedulingSession.$inferSelect;
export type SessionKind = SessionRow["kind"];

const TOKEN_PREFIX = "cossch_";
const HOST_DEFAULT_SECONDS = 3600;
const BOOKER_DEFAULT_SECONDS = 1800;
const MAX_SECONDS = 86_400;
// A host's invitation by email has to survive being read tomorrow.
const INVITE_SECONDS = 7 * 86_400;
// A manage link stays usable a little past the booking, for "what did I book?".
const MANAGE_GRACE_MS = 86_400_000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const PATH_OF: Record<SessionKind, string> = { host: "h", booker: "b", manage: "m", manager: "t" };

export function schedulingSessionUrl(
  publicUrl: string,
  kind: SessionKind,
  sessionId: string,
  token: string,
): string {
  return `${withoutTrailingSlashes(publicUrl)}/${PATH_OF[kind]}/${sessionId}#${token}`;
}

const HOUR_SECONDS = 3600;

type Created = { id: string; token: string; url: string | null; expiresAt: Date };

type MintInput = {
  env: SchedulingEnvironment;
  kind: SessionKind;
  hostId?: string | null;
  eventTypeId?: string | null;
  bookingId?: string | null;
  encryptedAttendee?: string | null;
  encryptedAttributes?: string | null;
  attendeeUid?: string | null;
  managerHostIds?: string[] | null;
  managerHostFilter?: Record<string, string | string[]> | null;
  attendeeEmailHmac?: string | null;
  readOnly?: boolean;
  apiKeyId?: string | null;
  createdByUserId?: string | null;
  expiresAt: Date;
  publicUrl: string | null;
};

async function mint(input: MintInput): Promise<Created> {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const id = newId(ID_PREFIXES.schedulingSession);
  await db.insert(schedulingSession).values({
    id,
    organizationId: input.env.organizationId,
    projectId: input.env.projectId,
    environmentId: input.env.environmentId,
    kind: input.kind,
    tokenHash: hashToken(token),
    hostId: input.hostId ?? null,
    eventTypeId: input.eventTypeId ?? null,
    bookingId: input.bookingId ?? null,
    encryptedAttendee: input.encryptedAttendee ?? null,
    encryptedAttributes: input.encryptedAttributes ?? null,
    attendeeUid: input.attendeeUid ?? null,
    managerHostIds: input.managerHostIds ?? null,
    managerHostFilter: input.managerHostFilter ?? null,
    attendeeEmailHmac: input.attendeeEmailHmac ?? null,
    readOnly: input.readOnly ?? false,
    apiKeyId: input.apiKeyId ?? null,
    createdByUserId: input.createdByUserId ?? null,
    expiresAt: input.expiresAt,
  });
  return {
    id,
    token,
    expiresAt: input.expiresAt,
    url: input.publicUrl ? schedulingSessionUrl(input.publicUrl, input.kind, id, token) : null,
  };
}

function expiry(now: Date, seconds: number | undefined, fallback: number): Date {
  const value = seconds ?? fallback;
  if (!Number.isInteger(value) || value < 60 || value > MAX_SECONDS) {
    throw new SchedulingError("invalid_time", `expires_in must be 60-${MAX_SECONDS} seconds.`, {
      param: "expires_in",
    });
  }
  return new Date(now.getTime() + value * 1000);
}

/**
 * A team page: time off and cover for the hosts named, or those matching a filter whenever it's
 * asked. An empty scope is refused here: `{}` matches everyone, and it should never mean that.
 */
export async function createManagerSession(
  env: SchedulingEnvironment,
  input: {
    plans?: PlanGate | undefined;
    hosts?: readonly string[] | undefined;
    hostFilter?: Record<string, string | string[]> | undefined;
    expiresIn?: number | undefined;
    readOnly?: boolean | undefined;
    apiKeyId?: string | null;
    createdByUserId?: string | null;
    publicUrl: string | null;
    now?: Date;
  },
): Promise<Created> {
  const refused = (message: string, param: string) =>
    new SchedulingError("invalid_session", message, { param });
  if (Boolean(input.hosts) === Boolean(input.hostFilter)) {
    throw refused("Give one of `hosts` and `host_filter`.", "hosts");
  }
  if (input.hostFilter && Object.keys(input.hostFilter).length === 0) {
    throw refused("`host_filter` is empty, which would mean every host.", "host_filter");
  }
  if (input.hosts?.length === 0) throw refused("`hosts` is empty.", "hosts");
  await requireLiveFeature(env, input.plans, "schedulingHostPortal");
  const ids: string[] = [];
  for (const ref of input.hosts ?? []) {
    const host = await resolveHost(db, env, ref);
    if (!ids.includes(host.id)) ids.push(host.id);
  }
  return mint({
    env,
    kind: "manager",
    managerHostIds: input.hosts ? ids : null,
    managerHostFilter: input.hostFilter ?? null,
    readOnly: input.readOnly ?? false,
    apiKeyId: input.apiKeyId ?? null,
    createdByUserId: input.createdByUserId ?? null,
    expiresAt: expiry(input.now ?? new Date(), input.expiresIn, HOST_DEFAULT_SECONDS),
    publicUrl: input.publicUrl,
  });
}

/**
 * The team page, for a dashboard member, who can change any of this environment's hosts anyway. `{}`
 * is every host, which is why nothing else can mint it, and it means nobody without a member behind
 * it (`managedHosts`). What needs to know who's free runs in the API, which that page calls.
 */
export async function createDashboardSession(
  env: SchedulingEnvironment,
  input: { createdByUserId: string; publicUrl: string | null; now?: Date },
): Promise<Created> {
  return mint({
    env,
    kind: "manager",
    managerHostIds: null,
    managerHostFilter: {},
    readOnly: false,
    apiKeyId: null,
    createdByUserId: input.createdByUserId,
    expiresAt: expiry(input.now ?? new Date(), HOUR_SECONDS, HOUR_SECONDS),
    publicUrl: input.publicUrl,
  });
}

/** A host's portal: their own schedules, calendars and bookings. */
export async function createHostSession(
  env: SchedulingEnvironment,
  input: {
    host: string;
    expiresIn?: number | undefined;
    readOnly?: boolean | undefined;
    apiKeyId?: string | null;
    createdByUserId?: string | null;
    publicUrl: string | null;
    now?: Date;
    /** The API's gate for embedding the portal. A dashboard member's own look passes none. */
    plans?: PlanGate | undefined;
  },
): Promise<Created> {
  await requireLiveFeature(env, input.plans, "schedulingHostPortal");
  const host = await resolveHost(db, env, input.host);
  return mint({
    env,
    kind: "host",
    hostId: host.id,
    readOnly: input.readOnly ?? false,
    apiKeyId: input.apiKeyId ?? null,
    createdByUserId: input.createdByUserId ?? null,
    expiresAt: expiry(input.now ?? new Date(), input.expiresIn, HOST_DEFAULT_SECONDS),
    publicUrl: input.publicUrl,
  });
}

/** Booking one event type (or one host's), optionally as someone the customer already knows. */
export async function createBookerSession(
  env: SchedulingEnvironment,
  input: {
    eventType: string;
    host?: string | undefined;
    attributes?: Record<string, string | string[]> | undefined;
    attendee?: AttendeeInputOutput | undefined;
    expiresIn?: number | undefined;
    apiKeyId?: string | null;
    createdByUserId?: string | null;
    publicUrl: string | null;
    now?: Date;
  },
  deps: Pick<SchedulingDeps, "dataKeys" | "lookupKey">,
): Promise<Created> {
  const eventType = await resolveEventType(db, env, input.eventType);
  const host = input.host ? await resolveHost(db, env, input.host) : null;
  return mint({
    env,
    kind: "booker",
    eventTypeId: eventType.id,
    hostId: host?.id ?? null,
    encryptedAttendee: input.attendee
      ? encryptSecret(JSON.stringify(input.attendee), deps.dataKeys)
      : null,
    encryptedAttributes: input.attributes
      ? encryptSecret(JSON.stringify(input.attributes), deps.dataKeys)
      : null,
    attendeeUid: input.attendee?.uid ?? null,
    attendeeEmailHmac: input.attendee?.email ? emailLookup(input.attendee.email, deps) : null,
    apiKeyId: input.apiKeyId ?? null,
    createdByUserId: input.createdByUserId ?? null,
    expiresAt: expiry(input.now ?? new Date(), input.expiresIn, BOOKER_DEFAULT_SECONDS),
    publicUrl: input.publicUrl,
  });
}

/**
 * Rescheduling and cancelling one booking, until a day after it ends. A dashboard member's lasts an
 * hour: it opens now, for them, and isn't a link anyone keeps.
 */
export async function createManageSession(
  env: SchedulingEnvironment,
  input: {
    bookingId: string;
    apiKeyId?: string | null;
    createdByUserId?: string | null;
    publicUrl: string | null;
    now?: Date;
  },
): Promise<Created> {
  const notFound = new SchedulingError("not_found", `No booking "${input.bookingId}".`);
  if (!isId(ID_PREFIXES.schedulingBooking, input.bookingId)) throw notFound;
  const [booking] = await db
    .select({ id: schedulingBooking.id, endAt: schedulingBooking.endAt })
    .from(schedulingBooking)
    .where(
      and(
        eq(schedulingBooking.id, input.bookingId),
        eq(schedulingBooking.organizationId, env.organizationId),
        eq(schedulingBooking.environmentId, env.environmentId),
      ),
    );
  if (!booking) throw notFound;
  const now = input.now ?? new Date();
  const until = input.createdByUserId
    ? now.getTime() + HOST_DEFAULT_SECONDS * 1000
    : Math.max(booking.endAt.getTime() + MANAGE_GRACE_MS, now.getTime() + 3_600_000);
  return mint({
    env,
    kind: "manage",
    bookingId: booking.id,
    apiKeyId: input.apiKeyId ?? null,
    createdByUserId: input.createdByUserId ?? null,
    expiresAt: new Date(until),
    publicUrl: input.publicUrl,
  });
}

/** For a host's email: longer than a session a backend mints, since they read it later. */
export async function createHostInvitationSession(
  env: SchedulingEnvironment,
  hostId: string,
  publicUrl: string | null,
  now: Date,
): Promise<Created> {
  return mint({
    env,
    kind: "host",
    hostId,
    expiresAt: new Date(now.getTime() + INVITE_SECONDS * 1000),
    publicUrl,
  });
}

export type AuthenticatedSession = {
  session: SessionRow;
  env: SchedulingEnvironment;
  /** Suspended organizations can read but not book. */
  suspended: boolean;
};

const refused = () =>
  new SchedulingError("not_found", "This link has expired or isn't valid any more.");

/** What a session that's over is told: nothing about why. */
export const schedulingSessionRefused = refused;

/**
 * System-level: the token finds the session. Every failure looks the same, so nothing says whether
 * a session ever existed. A deleted organization's sessions are refused along with it.
 */
export async function authenticateSchedulingSession(
  token: string,
  now: Date = new Date(),
): Promise<AuthenticatedSession> {
  if (!token.startsWith(TOKEN_PREFIX)) throw refused();
  const [row] = await db
    .select({
      session: schedulingSession,
      mode: environment.mode,
      suspended: sql<boolean>`exists (select 1 from organization_suspension s
        where s.organization_id = scheduling_session.organization_id)`,
      deleting: sql<boolean>`exists (select 1 from organization_deletion d
        where d.organization_id = scheduling_session.organization_id)`,
    })
    .from(schedulingSession)
    .innerJoin(
      environment,
      and(
        eq(environment.id, schedulingSession.environmentId),
        eq(environment.organizationId, schedulingSession.organizationId),
      ),
    )
    .where(
      and(eq(schedulingSession.tokenHash, hashToken(token)), isNull(schedulingSession.revokedAt)),
    )
    .limit(1);
  if (!row || row.deleting || row.session.expiresAt <= now) throw refused();
  return {
    session: row.session,
    suspended: row.suspended,
    env: {
      organizationId: row.session.organizationId,
      projectId: row.session.projectId,
      environmentId: row.session.environmentId,
      mode: row.mode,
    },
  };
}

/** The non-secret part, for the hosted app's framing policy. Never answers more than that. */
export async function sessionEnvironment(
  sessionId: string,
): Promise<{ organizationId: string; environmentId: string } | null> {
  if (!isId(ID_PREFIXES.schedulingSession, sessionId)) return null;
  const [row] = await db
    .select({
      organizationId: schedulingSession.organizationId,
      environmentId: schedulingSession.environmentId,
    })
    .from(schedulingSession)
    .where(eq(schedulingSession.id, sessionId))
    .limit(1);
  return row ?? null;
}

/** A session a dashboard member opened acts as them, whichever page it opens. */
export function sessionActor(session: SessionRow): BookingActor {
  if (session.createdByUserId) return { kind: "user", id: session.createdByUserId };
  if (session.kind === "host") return { kind: "host_session", id: session.id };
  if (session.kind === "booker") return { kind: "booker_session", id: session.id };
  if (session.kind === "manager") return { kind: "manager_session", id: session.id };
  return { kind: "manage_session", id: session.id };
}

export function fixedAttendee(
  session: Pick<SessionRow, "encryptedAttendee">,
  deps: Pick<SchedulingDeps, "dataKeys">,
): AttendeeInputOutput | null {
  if (!session.encryptedAttendee) return null;
  return JSON.parse(decryptSecret(session.encryptedAttendee, deps.dataKeys)) as AttendeeInputOutput;
}

/** Who this booker session may be routed to. Only ever set by the customer's server. */
export function sessionAttributes(
  session: Pick<SessionRow, "encryptedAttributes">,
  deps: Pick<SchedulingDeps, "dataKeys">,
): Record<string, string | string[]> | undefined {
  if (!session.encryptedAttributes) return undefined;
  return JSON.parse(decryptSecret(session.encryptedAttributes, deps.dataKeys)) as Record<
    string,
    string | string[]
  >;
}
