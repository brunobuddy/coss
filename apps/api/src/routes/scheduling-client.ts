/**
 * Scheduling's browser API: what the hosted pages and customers' own UIs call, with a session the
 * customer's backend created (or coss.com emailed). The token in `Authorization` is the only
 * authority: no cookies are read, so any origin may make the preflight, and real requests are
 * checked against the environment's allowed origins. Each session reaches only its own scope.
 * Outside `/v1` and the OpenAPI document: `coss/scheduling` is its client.
 */
import { db } from "@coss/db";
import {
  type AuthenticatedSession,
  approveBooking,
  assertManagedRun,
  attendeeEmailedOnConfirm,
  authenticateSchedulingSession,
  awayNoticeOf,
  cancelBooking,
  cancelReassignment,
  connectCaldav,
  connectSimulated,
  createBooking,
  createOutOfOffice,
  createReassignment,
  createSchedule,
  declineBooking,
  deleteOutOfOffice,
  disconnectCalendar,
  fixedAttendee,
  getBooking,
  getEventType,
  getHost,
  getLogoRow,
  getOutOfOffice,
  getReassignment,
  getSettingsRow,
  listConnections,
  listEventTypeSlots,
  listManagedBookings,
  listOutOfOffice,
  listOutOfOfficeConflicts,
  listPossibleDelegates,
  listReassignCandidates,
  listReassignmentItems,
  listReassignments,
  listRecentHostBookings,
  listRescheduleSlots,
  listSchedules,
  listUpcomingHostBookings,
  logoDataUrl,
  managedHosts,
  markNoShow,
  previewReassignment,
  reassignBooking,
  rescheduleBooking,
  resolveHost,
  type SchedulingDeps,
  SchedulingError,
  schedulingSessionRefused,
  sessionActor,
  sessionAttributes,
  startCalendarAuthorization,
  toConnectionObject,
  toManagedHost,
  undoReassignment,
  updateCalendar,
  updateHost,
  updateOutOfOffice,
  updateSchedule,
} from "@coss/scheduling";
import {
  AuthorizeCalendarRequest,
  CancelBookingRequest,
  CreateBookingRequest,
  CreateCalendarConnectionRequest,
  CreateReassignmentRequest,
  HostOutOfOfficeRequest,
  ManagerOutOfOfficeRequest,
  OUT_OF_OFFICE_PRESET_REASONS,
  OUT_OF_OFFICE_REASON_LABELS,
  PreviewReassignmentRequest,
  ReassignBookingRequest,
  RescheduleBookingRequest,
  UndoReassignmentRequest,
  UpdateCalendarRequest,
  UpdateHostLocationsRequest,
  UpdateOutOfOfficeRequest,
  UpsertScheduleRequest,
} from "@coss/scheduling/schemas";
import { memberStillHolds } from "@coss/tenancy";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { ApiError } from "../errors.ts";
import { limitSchedulingSlots } from "../middleware/rate-limit.ts";
import type { AppEnv } from "../types.ts";

export const SCHEDULING_CLIENT_PATH = "/scheduling/client";

type ClientEnv = { Variables: AppEnv["Variables"] & { session: AuthenticatedSession } };

const invalidBody = (message: string, param?: string) =>
  new ApiError(422, {
    type: "invalid_request_error",
    code: "validation_error",
    message,
    ...(param ? { param } : {}),
  });

async function parsed<T extends z.ZodType>(c: Context<ClientEnv>, schema: T): Promise<z.output<T>> {
  const body = await c.req.json().catch(() => {
    throw new ApiError(400, {
      type: "invalid_request_error",
      code: "invalid_json",
      message: "The body is not valid JSON.",
    });
  });
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw invalidBody(issue?.message ?? "The body is invalid.", issue?.path.join("."));
  }
  return result.data;
}

/** The same, for a body that's optional: a page from before it existed sends none. */
async function parsedOrEmpty<T extends z.ZodType>(
  c: Context<ClientEnv>,
  schema: T,
): Promise<z.output<T>> {
  const text = await c.req.text();
  const result = schema.safeParse(text.trim() ? parseJson(text) : {});
  if (!result.success) {
    const issue = result.error.issues[0];
    throw invalidBody(issue?.message ?? "The body is invalid.", issue?.path.join("."));
  }
  return result.data;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, {
      type: "invalid_request_error",
      code: "invalid_json",
      message: "The body is not valid JSON.",
    });
  }
}

const notFound = () => new SchedulingError("not_found", "That isn't available from this link.");

const HostReassignRequest = z.strictObject({
  to_host: z.string(),
  note: z.string().max(500).optional(),
});

/** Moving bookings is its own step from a browser, with its own rules about who can. */
const SessionOutOfOfficeChange = UpdateOutOfOfficeRequest.omit({
  existing_bookings: true,
  reassign: true,
});

/** What a browser booking may say: the event type and host come from the session. */
const ClientBookingRequest = CreateBookingRequest.omit({
  event_type: true,
  attributes: true,
  metadata: true,
}).extend({
  attendee: CreateBookingRequest.shape.attendee.optional(),
});

const StartBody = RescheduleBookingRequest.omit({ host: true });

const SlotQuery = z.object({
  start: z.string(),
  end: z.string(),
  duration_minutes: z.coerce.number().int().min(5).max(1440).optional(),
});

function instant(value: string, param: string): number {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw invalidBody(`\`${param}\` isn't a valid time.`, param);
  return ms;
}

const iso = (ms: number) => new Date(ms).toISOString();

export function createSchedulingClientRoutes(opts: {
  deps: SchedulingDeps;
  /** `SCHEDULING_PUBLIC_URL`: the hosted pages, which are always allowed. */
  hostedUrl: string | null;
}): Hono<ClientEnv> {
  const { deps } = opts;
  const hostedOrigin = opts.hostedUrl ? new URL(opts.hostedUrl).origin : null;
  const router = new Hono<ClientEnv>();

  router.use(async (c, next) => {
    c.header("Access-Control-Allow-Origin", c.req.header("origin") ?? "*");
    c.header("Vary", "Origin");
    if (c.req.method === "OPTIONS") {
      c.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE");
      c.header("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
      c.header("Access-Control-Max-Age", "600");
      return c.body(null, 204);
    }
    await next();
  });

  /** The person booking isn't the customer: their billing stays out of what the page says. */
  const bookingForPerson = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      if (
        error instanceof SchedulingError &&
        (error.code === "billing_hold" || error.code === "budget_exceeded")
      ) {
        throw new SchedulingError(
          "account_suspended",
          "This account can't take bookings right now.",
        );
      }
      throw error;
    }
  };

  const authenticated: MiddlewareHandler<ClientEnv> = async (c, next) => {
    const byAddress = await c.var.rateLimiter.consume({
      buckets: ["scheduling.ip"],
      subject: c.var.clientIp ?? "unattributed",
    });
    if (!byAddress.allowed) {
      throw new ApiError(429, {
        type: "rate_limit_error",
        code: "rate_limited",
        message: "Too many requests.",
      });
    }
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const session = await authenticateSchedulingSession(token, deps.now?.() ?? new Date());
    const bySession = await c.var.rateLimiter.consume({
      buckets: ["scheduling.session"],
      subject: session.session.id,
    });
    if (!bySession.allowed) {
      throw new ApiError(429, {
        type: "rate_limit_error",
        code: "rate_limited",
        message: "Too many requests.",
      });
    }
    const origin = c.req.header("origin");
    if (origin && origin !== hostedOrigin) {
      const settings = await getSettingsRow(session.env);
      const local =
        session.env.mode === "sandbox" && /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(origin);
      if (!local && !settings?.allowedOrigins.includes(origin)) {
        throw new ApiError(403, {
          type: "permission_error",
          code: "origin_not_allowed",
          message: "This site isn't one of the environment's allowed origins.",
        });
      }
    }
    if (c.req.method !== "GET" && session.suspended) {
      throw new SchedulingError("account_suspended", "This account can't take bookings right now.");
    }
    c.set("session", session);
    await next();
  };

  router.use(authenticated);

  // A team page a dashboard member opened reaches every host, on their say-so, so it lasts only as
  // long as they could still do that. Refused like any session that's over.
  router.use("/manager/*", async (c, next) => {
    const { session, env } = c.var.session;
    if (
      session.createdByUserId &&
      !(await memberStillHolds({
        organizationId: env.organizationId,
        userId: session.createdByUserId,
        permissions: { scheduling: ["update"] },
      }))
    ) {
      throw schedulingSessionRefused();
    }
    await next();
  });

  const hostOf = (c: Context<ClientEnv>): string => {
    const { session } = c.var.session;
    if (session.kind !== "host" || !session.hostId) throw notFound();
    return session.hostId;
  };
  const writableHost = (c: Context<ClientEnv>): string => {
    const hostId = hostOf(c);
    if (c.var.session.session.readOnly) {
      throw new ApiError(403, {
        type: "permission_error",
        code: "read_only_session",
        message: "This session can only read.",
      });
    }
    return hostId;
  };
  const bookingOf = (c: Context<ClientEnv>): string => {
    const { session } = c.var.session;
    if (session.kind !== "manage" || !session.bookingId) throw notFound();
    return session.bookingId;
  };
  const eventTypeOf = (c: Context<ClientEnv>): string => {
    const { session } = c.var.session;
    if (session.kind !== "booker" || !session.eventTypeId) throw notFound();
    return session.eventTypeId;
  };

  /** A slim look at an event type: what an attendee sees, never who else is in the pool. */
  const publicEventType = async (env: AuthenticatedSession["env"], id: string) => {
    const eventType = await getEventType(env, id);
    return {
      id: eventType.id,
      title: eventType.title,
      description: eventType.description,
      kind: eventType.kind,
      duration_minutes: eventType.duration_minutes,
      duration_options: eventType.duration_options,
      questions: eventType.questions,
      locations: eventType.locations.map((location) => ({ type: location.type })),
      requires_approval: eventType.requires_approval,
      max_guests: eventType.max_guests,
    };
  };

  const branding = async (env: AuthenticatedSession["env"]) => {
    const [settings, logo] = await Promise.all([getSettingsRow(env), getLogoRow(env)]);
    return {
      brand_name: settings?.brandName ?? null,
      accent_color: settings?.accentColor ?? null,
      logo: logo ? { data_url: logoDataUrl(logo), width: logo.width, height: logo.height } : null,
      // "Scheduling by coss.com" on a live page, on plans without the white label.
      coss_attribution:
        env.mode === "live" && deps.plans
          ? !(await deps.plans.hasFeature(env.organizationId, "schedulingWhiteLabel"))
          : false,
    };
  };

  router.get("/session", async (c) => {
    const { session, env } = c.var.session;
    const base = {
      object: "scheduling.client_session" as const,
      id: session.id,
      kind: session.kind,
      read_only: session.readOnly,
      expires_at: session.expiresAt.toISOString(),
      sandbox: env.mode === "sandbox",
      ...(await branding(env)),
    };
    if (session.kind === "booker") {
      const attendee = fixedAttendee(session, deps);
      return c.json({
        ...base,
        event_type: await publicEventType(env, session.eventTypeId as string),
        attendee_fixed: attendee !== null,
      });
    }
    if (session.kind === "host") {
      const host = await getHost(env, session.hostId as string);
      const settings = await getSettingsRow(env);
      return c.json({
        ...base,
        host: { id: host.id, name: host.name, time_zone: host.time_zone },
        zoom_available: Boolean(deps.calendars?.apps.zoom),
        can_reassign: settings?.hostReassignment === "eligible",
      });
    }
    return c.json(base);
  });

  /** Only when one person can be booked here: "they're away" can't be said of a pool. */
  const awayNoticeFor = async (
    env: AuthenticatedSession["env"],
    eventType: string,
    pinnedHost: string | null,
  ) => {
    const now = deps.now?.() ?? new Date();
    if (pinnedHost) return awayNoticeOf(env, pinnedHost, now);
    const { hosts, kind } = await getEventType(env, eventType);
    const [only] = hosts;
    if (kind === "pool" || hosts.length !== 1 || !only) return null;
    return awayNoticeOf(env, only.host, now);
  };

  const slotWindow = (c: Context<ClientEnv>) => {
    const query = SlotQuery.safeParse({
      start: c.req.query("start"),
      end: c.req.query("end"),
      duration_minutes: c.req.query("duration_minutes"),
    });
    if (!query.success) throw invalidBody("`start` and `end` are required.");
    return {
      fromMs: instant(query.data.start, "start"),
      toMs: instant(query.data.end, "end"),
      nowMs: (deps.now?.() ?? new Date()).getTime(),
      durationMinutes: query.data.duration_minutes,
    };
  };

  /** An attendee sees times and free seats, never who else could take them. */
  const slotList = (
    c: Context<ClientEnv>,
    slots: { startMs: number; endMs: number; seatsLeft?: number | null }[],
    extra: Record<string, unknown> = {},
  ) =>
    c.json({
      object: "list" as const,
      data: slots.map((slot) => ({
        start: iso(slot.startMs),
        end: iso(slot.endMs),
        seats_left: slot.seatsLeft ?? null,
      })),
      has_more: false,
      ...extra,
    });

  /** Where this booking could move to: its own hosts, length and buffers. */
  const rescheduleSlots = async (c: Context<ClientEnv>, id: string) => {
    await limitSchedulingSlots(c.var.rateLimiter, c.var.session.env);
    const { fromMs, toMs, nowMs } = slotWindow(c);
    return slotList(c, await listRescheduleSlots(c.var.session.env, id, { fromMs, toMs, nowMs }));
  };

  router.get("/slots", async (c) => {
    // The session's kind first: the wrong one is a 404, whatever the query says.
    const eventTypeRef = eventTypeOf(c);
    const { env, session } = c.var.session;
    await limitSchedulingSlots(c.var.rateLimiter, env);
    const slots = await listEventTypeSlots(env, {
      ...slotWindow(c),
      eventTypeRef,
      hostRefs: session.hostId ? [session.hostId] : undefined,
      attributes: sessionAttributes(session, deps),
    });
    return slotList(c, slots, { away: await awayNoticeFor(env, eventTypeRef, session.hostId) });
  });

  router.post("/bookings", async (c) => {
    const eventType = eventTypeOf(c);
    const { session, env } = c.var.session;
    const body = await parsed(c, ClientBookingRequest);
    const fixed = fixedAttendee(session, deps);
    const attendee = fixed ?? body.attendee;
    if (!attendee) throw invalidBody("`attendee` is required.", "attendee");
    const { booking, replayed } = await bookingForPerson(() =>
      createBooking(
        env,
        {
          eventType,
          startMs: instant(body.start, "start"),
          host: session.hostId ?? undefined,
          attributes: sessionAttributes(session, deps),
          durationMinutes: body.duration_minutes,
          attendee,
          guests: body.guests,
          answers: body.answers,
          location: body.location,
          locationFromBrowser: true,
          idempotencyKey: c.req.header("idempotency-key"),
        },
        deps,
        sessionActor(session),
      ),
    );
    if (replayed) c.header("Idempotent-Replayed", "true");
    const emailed =
      booking.attendees.some((person) => person.role === "attendee" && person.email) &&
      (await attendeeEmailedOnConfirm(env, session.eventTypeId as string));
    return c.json({ ...clientBooking(booking), attendee_emailed: emailed }, 201);
  });

  /** What a browser sees of a booking: its own details, never other hosts or answers. */
  const clientBooking = (booking: Awaited<ReturnType<typeof getBooking>>) => ({
    object: booking.object,
    id: booking.id,
    status: booking.status,
    title: booking.title,
    start: booking.start,
    end: booking.end,
    location: booking.location,
    attendees: booking.attendees
      .filter((attendee) => attendee.role === "attendee")
      .map((attendee) => ({ name: attendee.name, time_zone: attendee.time_zone })),
  });

  router.get("/booking", async (c) => {
    const id = bookingOf(c);
    return c.json(clientBooking(await getBooking(c.var.session.env, id, deps)));
  });

  router.get("/booking/slots", async (c) => rescheduleSlots(c, bookingOf(c)));

  router.post("/booking/reschedule", async (c) => {
    const id = bookingOf(c);
    const { env, session } = c.var.session;
    const body = await parsed(c, StartBody);
    const booking = await rescheduleBooking(
      env,
      id,
      { startMs: instant(body.start, "start") },
      deps,
      sessionActor(session),
      { enforceCutoffs: session.createdByUserId === null },
    );
    return c.json(clientBooking(booking));
  });

  router.post("/booking/cancel", async (c) => {
    const id = bookingOf(c);
    const { env, session } = c.var.session;
    const { reason } = await parsedOrEmpty(c, CancelBookingRequest);
    const booking = await cancelBooking(env, id, deps, sessionActor(session), {
      enforceCutoffs: session.createdByUserId === null,
      reason,
    });
    return c.json(clientBooking(booking));
  });

  router.get("/host/schedules", async (c) => {
    const data = await listSchedules(c.var.session.env, hostOf(c));
    return c.json({ object: "list" as const, data, has_more: false });
  });

  router.post("/host/schedules", async (c) => {
    const hostId = writableHost(c);
    const schedule = await createSchedule(
      c.var.session.env,
      hostId,
      await parsed(c, UpsertScheduleRequest),
    );
    return c.json(schedule, 201);
  });

  router.put("/host/schedules/:id", async (c) => {
    const hostId = writableHost(c);
    const schedule = await updateSchedule(
      c.var.session.env,
      hostId,
      c.req.param("id"),
      await parsed(c, UpsertScheduleRequest),
    );
    return c.json(schedule);
  });

  router.get("/host/calendar_connections", async (c) => {
    const data = await listConnections(c.var.session.env, hostOf(c));
    return c.json({ object: "list" as const, data, has_more: false });
  });

  router.post("/host/calendar_connections/authorize", async (c) => {
    const hostId = writableHost(c);
    if (!deps.calendars) {
      throw new SchedulingError("calendar_unavailable", "Connecting calendars isn't set up here.");
    }
    const body = await parsed(c, AuthorizeCalendarRequest);
    // The consent window closes itself: no return URL, so nothing to redirect anywhere.
    const { url } = await startCalendarAuthorization(
      c.var.session.env,
      hostId,
      { provider: body.provider, returnUrl: null },
      deps.calendars,
    );
    return c.json({ object: "scheduling.calendar_authorization" as const, url });
  });

  router.post("/host/calendar_connections", async (c) => {
    const hostId = writableHost(c);
    const body = await parsed(c, CreateCalendarConnectionRequest);
    const { env } = c.var.session;
    if (body.provider === "simulated") {
      return c.json(
        await toConnectionObject(await connectSimulated(env, hostId, { now: deps.now })),
        201,
      );
    }
    if (!deps.calendars) {
      throw new SchedulingError("calendar_unavailable", "Connecting calendars isn't set up here.");
    }
    const connection = await connectCaldav(
      env,
      hostId,
      { url: body.url, username: body.username, password: body.password },
      deps.calendars,
    );
    return c.json(await toConnectionObject(connection), 201);
  });

  router.delete("/host/calendar_connections/:id", async (c) => {
    const hostId = writableHost(c);
    if (!deps.calendars) {
      throw new SchedulingError("calendar_unavailable", "Connecting calendars isn't set up here.");
    }
    await disconnectCalendar(c.var.session.env, hostId, c.req.param("id"), deps.calendars);
    return c.body(null, 204);
  });

  router.patch("/host/calendars/:id", async (c) => {
    const hostId = writableHost(c);
    const data = await updateCalendar(
      c.var.session.env,
      hostId,
      c.req.param("id"),
      await parsed(c, UpdateCalendarRequest),
    );
    return c.json({ object: "list" as const, data, has_more: false });
  });

  // A host's own time away. Whose it is comes from the session, so it never needs saying.
  router.get("/host/out_of_office", async (c) => {
    const hostId = hostOf(c);
    const { env } = c.var.session;
    const page = await listOutOfOffice(
      env,
      { hostIds: [hostId], fromMs: (deps.now?.() ?? new Date()).getTime(), limit: 100 },
      deps,
    );
    const settings = await getSettingsRow(env);
    return c.json({
      object: "list" as const,
      data: page.data,
      has_more: page.hasMore,
      reasons: [
        ...OUT_OF_OFFICE_PRESET_REASONS.map((key) => ({
          key,
          label: OUT_OF_OFFICE_REASON_LABELS[key],
        })),
        ...(settings?.outOfOfficeReasons ?? []),
      ],
    });
  });

  /** Who they can name to cover for them. Ids and names, and only of people they share work with. */
  const delegatesFor = async (env: AuthenticatedSession["env"], hostId: string) =>
    (await listPossibleDelegates(env, hostId)).map((host) => host.id);

  router.get("/host/delegates", async (c) => {
    const data = await listPossibleDelegates(c.var.session.env, hostOf(c));
    return c.json({ object: "list" as const, data, has_more: false });
  });

  router.post("/host/out_of_office", async (c) => {
    const hostId = writableHost(c);
    const { env } = c.var.session;
    const [entry] = await createOutOfOffice(
      env,
      { ...(await parsed(c, HostOutOfOfficeRequest)), host: hostId },
      deps,
      sessionActor(c.var.session.session),
      "host",
      { allowedDelegates: await delegatesFor(env, hostId) },
    );
    return c.json(entry, 201);
  });

  router.patch("/host/out_of_office/:id", async (c) => {
    const hostId = writableHost(c);
    const entry = await updateOutOfOffice(
      c.var.session.env,
      c.req.param("id"),
      await parsed(c, SessionOutOfOfficeChange),
      deps,
      sessionActor(c.var.session.session),
      { hostId },
      { allowedDelegates: await delegatesFor(c.var.session.env, hostId), startsNoRun: true },
    );
    return c.json(entry);
  });

  router.delete("/host/out_of_office/:id", async (c) => {
    const hostId = writableHost(c);
    await deleteOutOfOffice(c.var.session.env, c.req.param("id"), deps, { hostId });
    return c.body(null, 204);
  });

  router.get("/host/out_of_office/:id/conflicts", async (c) => {
    const hostId = hostOf(c);
    const page = await listOutOfOfficeConflicts(
      c.var.session.env,
      c.req.param("id"),
      { limit: 200 },
      deps,
      { hostId },
    );
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore });
  });

  router.get("/host/locations", async (c) => {
    const host = await getHost(c.var.session.env, hostOf(c));
    return c.json({ object: "list" as const, data: host.locations, has_more: false });
  });

  /** A host's own words for attendees' emails, so they're screened like anything else in them. */
  router.put("/host/locations", async (c) => {
    const hostId = writableHost(c);
    const { locations } = await parsed(c, UpdateHostLocationsRequest);
    const host = await updateHost(
      c.var.session.env,
      hostId,
      { locations },
      { screen: deps.screenSetup },
    );
    return c.json({ object: "list" as const, data: host.locations, has_more: false });
  });

  /**
   * A host's own bookings, with attendee names but not their answers: those to come, or with
   * `?when=past`, those that have started in the last 30 days.
   */
  router.get("/host/bookings", async (c) => {
    const list = c.req.query("when") === "past" ? listRecentHostBookings : listUpcomingHostBookings;
    const page = await list(
      c.var.session.env,
      {
        hostId: hostOf(c),
        now: deps.now?.() ?? new Date(),
        limit: 50,
        cursor: c.req.query("cursor"),
      },
      deps,
    );
    return c.json({
      object: "list" as const,
      // What this page shows and no more: not contact details, metadata or the other hosts.
      data: page.data.map((booking) => ({
        id: booking.id,
        status: booking.status,
        title: booking.title,
        start: booking.start,
        end: booking.end,
        no_show_at: booking.no_show_at,
        group_session: booking.group_session,
        attendees: booking.attendees.map((attendee) => ({ name: attendee.name })),
      })),
      has_more: page.nextCursor !== null,
      next_cursor: page.nextCursor,
    });
  });

  /** Off unless the environment says so, and then it looks like nothing's there. */
  const reassigningHost = async (c: Context<ClientEnv>) => {
    const settings = await getSettingsRow(c.var.session.env);
    if (settings?.hostReassignment !== "eligible") throw notFound();
  };

  // Who's free and takes this event type, by name. Why anyone else can't isn't this host's to know.
  router.get("/host/bookings/:id/reassign_candidates", async (c) => {
    const hostId = hostOf(c);
    await reassigningHost(c);
    const id = c.req.param("id");
    await hostsOwnBooking(c, hostId, id);
    const page = await listReassignCandidates(c.var.session.env, id, { fromHost: hostId }, deps);
    const data = page.data
      .filter((candidate) => candidate.member && candidate.available)
      .map((candidate) => ({ host: candidate.host, name: candidate.name }));
    return c.json({ object: "list" as const, data, has_more: false });
  });

  router.post("/host/bookings/:id/reassign", async (c) => {
    const hostId = writableHost(c);
    await reassigningHost(c);
    const id = c.req.param("id");
    const body = await parsed(c, HostReassignRequest);
    const { env, session } = c.var.session;
    const booking = await reassignBooking(
      env,
      id,
      {
        changes: [{ from_host: hostId, to_host: body.to_host }],
        reason_code: "host_unavailable",
        ...(body.note ? { note: body.note } : {}),
      },
      deps,
      sessionActor(session),
      // Checked with the booking locked: it may have stopped being theirs since the page loaded.
      { fromHosts: new Set([hostId]), namesOnly: true },
    );
    return c.json({ id: booking.id, status: booking.status });
  });

  // A team page. Whatever it reaches is worked out on each request, since a filter's answer changes.
  const managerOf = (c: Context<ClientEnv>) => {
    const { session, env } = c.var.session;
    if (session.kind !== "manager") throw notFound();
    return { session, env };
  };
  const writableManager = (c: Context<ClientEnv>) => {
    const manager = managerOf(c);
    if (manager.session.readOnly) {
      throw new ApiError(403, {
        type: "permission_error",
        code: "read_only_session",
        message: "This session can only read.",
      });
    }
    return manager;
  };
  const teamOf = async (manager: ReturnType<typeof managerOf>) => {
    const hosts = await managedHosts(manager.env, manager.session);
    return { hosts, ids: hosts.map((host) => host.id), set: new Set(hosts.map((host) => host.id)) };
  };
  const managedEntry = async (manager: ReturnType<typeof managerOf>, id: string) => {
    const entry = await getOutOfOffice(manager.env, id, deps);
    const team = await teamOf(manager);
    if (!team.set.has(entry.host)) throw notFound();
    return { entry, team };
  };
  const managedRun = async (manager: ReturnType<typeof managerOf>, id: string) => {
    const team = await teamOf(manager);
    await assertManagedRun(manager.env, id, team.ids);
  };

  router.get("/manager/hosts", async (c) => {
    const { hosts } = await teamOf(managerOf(c));
    return c.json({ object: "list" as const, data: hosts.map(toManagedHost), has_more: false });
  });

  router.get("/manager/out_of_office", async (c) => {
    const manager = managerOf(c);
    const team = await teamOf(manager);
    if (team.ids.length === 0)
      return c.json({ object: "list" as const, data: [], has_more: false });
    const page = await listOutOfOffice(
      manager.env,
      {
        hostIds: team.ids,
        fromMs: (deps.now?.() ?? new Date()).getTime(),
        limit: Math.min(Math.max(Number(c.req.query("limit")) || 100, 1), 100),
        after: c.req.query("after"),
      },
      deps,
    );
    const settings = await getSettingsRow(manager.env);
    return c.json({
      object: "list" as const,
      data: page.data,
      has_more: page.hasMore,
      reasons: [
        ...OUT_OF_OFFICE_PRESET_REASONS.map((key) => ({
          key,
          label: OUT_OF_OFFICE_REASON_LABELS[key],
        })),
        ...(settings?.outOfOfficeReasons ?? []),
      ],
    });
  });

  router.post("/manager/out_of_office", async (c) => {
    const manager = writableManager(c);
    const team = await teamOf(manager);
    const body = await parsed(c, ManagerOutOfOfficeRequest);
    const hosts: string[] = [];
    for (const ref of body.hosts) {
      const host = await resolveHost(db, manager.env, ref);
      if (!team.set.has(host.id)) throw notFound();
      hosts.push(host.id);
    }
    const data = await createOutOfOffice(
      manager.env,
      { ...body, hosts },
      deps,
      sessionActor(manager.session),
      manager.session.createdByUserId ? "dashboard" : "manager",
      { allowedDelegates: team.ids },
    );
    return c.json({ object: "list" as const, data, has_more: false }, 201);
  });

  router.patch("/manager/out_of_office/:id", async (c) => {
    const manager = writableManager(c);
    const { entry, team } = await managedEntry(manager, c.req.param("id"));
    const updated = await updateOutOfOffice(
      manager.env,
      entry.id,
      await parsed(c, SessionOutOfOfficeChange),
      deps,
      sessionActor(manager.session),
      { hostId: entry.host },
      { allowedDelegates: team.ids, startsNoRun: true },
    );
    return c.json(updated);
  });

  router.delete("/manager/out_of_office/:id", async (c) => {
    const manager = writableManager(c);
    const { entry } = await managedEntry(manager, c.req.param("id"));
    await deleteOutOfOffice(manager.env, entry.id, deps, { hostId: entry.host });
    return c.body(null, 204);
  });

  router.get("/manager/out_of_office/:id/conflicts", async (c) => {
    const manager = managerOf(c);
    const { entry } = await managedEntry(manager, c.req.param("id"));
    const page = await listOutOfOfficeConflicts(manager.env, entry.id, { limit: 100 }, deps, {
      hostId: entry.host,
    });
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore });
  });

  router.get("/manager/bookings", async (c) => {
    const manager = managerOf(c);
    const team = await teamOf(manager);
    const page = await listManagedBookings(manager.env, team.ids, {
      hostId: c.req.query("host"),
      bookingId: c.req.query("booking"),
      needsCover: c.req.query("needs_cover") === "true",
      now: deps.now?.() ?? new Date(),
      limit: 100,
    });
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore });
  });

  router.get("/manager/bookings/:id/reassign_candidates", async (c) => {
    const manager = managerOf(c);
    const team = await teamOf(manager);
    const id = c.req.param("id");
    const booking = await getBooking(manager.env, id, deps);
    if (!booking.hosts.some((hostId) => team.set.has(hostId))) throw notFound();
    const page = await listReassignCandidates(
      manager.env,
      id,
      {
        hostIds: team.ids,
        ...(c.req.query("from_host") ? { fromHost: c.req.query("from_host") } : {}),
      },
      deps,
    );
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore });
  });

  router.post("/manager/bookings/:id/reassign", async (c) => {
    const manager = writableManager(c);
    const team = await teamOf(manager);
    const booking = await reassignBooking(
      manager.env,
      c.req.param("id"),
      await parsed(c, ReassignBookingRequest),
      deps,
      sessionActor(manager.session),
      { fromHosts: team.set, toHosts: team.set },
    );
    return c.json({ id: booking.id, status: booking.status, hosts: booking.hosts });
  });

  router.post("/manager/reassignments/preview", async (c) => {
    const manager = managerOf(c);
    const team = await teamOf(manager);
    return c.json(
      await previewReassignment(manager.env, await parsed(c, PreviewReassignmentRequest), deps, {
        onlyHosts: team.set,
      }),
    );
  });

  router.post("/manager/reassignments", async (c) => {
    const manager = writableManager(c);
    const team = await teamOf(manager);
    const { reassignment } = await createReassignment(
      manager.env,
      await parsed(c, CreateReassignmentRequest),
      deps,
      sessionActor(manager.session),
      { onlyHosts: team.set, idempotencyKey: c.req.header("Idempotency-Key") },
    );
    return c.json(reassignment, 202);
  });

  router.get("/manager/reassignments", async (c) => {
    const manager = managerOf(c);
    const team = await teamOf(manager);
    const page = await listReassignments(manager.env, { limit: 50, hostIds: team.ids });
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore });
  });

  router.get("/manager/reassignments/:id", async (c) => {
    const manager = managerOf(c);
    await managedRun(manager, c.req.param("id"));
    return c.json(await getReassignment(manager.env, c.req.param("id")));
  });

  router.get("/manager/reassignments/:id/items", async (c) => {
    const manager = managerOf(c);
    await managedRun(manager, c.req.param("id"));
    const page = await listReassignmentItems(manager.env, c.req.param("id"), { limit: 100 });
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore });
  });

  router.post("/manager/reassignments/:id/cancel", async (c) => {
    const manager = writableManager(c);
    await managedRun(manager, c.req.param("id"));
    return c.json(await cancelReassignment(manager.env, c.req.param("id"), deps));
  });

  router.post("/manager/reassignments/:id/undo", async (c) => {
    const manager = writableManager(c);
    const team = await teamOf(manager);
    await assertManagedRun(manager.env, c.req.param("id"), team.ids);
    return c.json(
      await undoReassignment(
        manager.env,
        c.req.param("id"),
        await parsed(c, UndoReassignmentRequest),
        deps,
        sessionActor(manager.session),
        { onlyHosts: team.set },
      ),
      202,
    );
  });

  const hostsOwnBooking = async (c: Context<ClientEnv>, hostId: string, id: string) => {
    const booking = await getBooking(c.var.session.env, id, deps);
    if (!booking.hosts.includes(hostId)) throw notFound();
    return booking;
  };

  router.get("/host/bookings/:id/slots", async (c) => {
    const id = c.req.param("id");
    await hostsOwnBooking(c, hostOf(c), id);
    return rescheduleSlots(c, id);
  });

  /** Moves it for everyone on it. A host isn't held to the cutoffs attendees are. */
  router.post("/host/bookings/:id/reschedule", async (c) => {
    const hostId = writableHost(c);
    const id = c.req.param("id");
    await hostsOwnBooking(c, hostId, id);
    const { env, session } = c.var.session;
    const body = await parsed(c, StartBody);
    const booking = await rescheduleBooking(
      env,
      id,
      { startMs: instant(body.start, "start") },
      deps,
      sessionActor(session),
    );
    return c.json(clientBooking(booking));
  });

  router.post("/host/bookings/:id/no_show", async (c) => {
    const hostId = writableHost(c);
    const id = c.req.param("id");
    await hostsOwnBooking(c, hostId, id);
    const { env, session } = c.var.session;
    return c.json(clientBooking(await markNoShow(env, id, deps, sessionActor(session))));
  });

  router.post("/host/bookings/:id/approve", async (c) => {
    const hostId = writableHost(c);
    const id = c.req.param("id");
    await hostsOwnBooking(c, hostId, id);
    const { env, session } = c.var.session;
    return c.json(await approveBooking(env, id, deps, sessionActor(session)));
  });

  router.post("/host/bookings/:id/decline", async (c) => {
    const hostId = writableHost(c);
    const id = c.req.param("id");
    await hostsOwnBooking(c, hostId, id);
    const { env, session } = c.var.session;
    return c.json(await declineBooking(env, id, deps, sessionActor(session)));
  });

  router.post("/host/bookings/:id/cancel", async (c) => {
    const hostId = writableHost(c);
    const id = c.req.param("id");
    await hostsOwnBooking(c, hostId, id);
    const { env, session } = c.var.session;
    return c.json(await cancelBooking(env, id, deps, sessionActor(session)));
  });

  return router;
}
