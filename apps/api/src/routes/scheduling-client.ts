/**
 * Scheduling's browser API: what the hosted pages and customers' own UIs call, with a session the
 * customer's backend created (or coss.com emailed). The token in `Authorization` is the only
 * authority: no cookies are read, so any origin may make the preflight, and real requests are
 * checked against the environment's allowed origins. Each session reaches only its own scope.
 * Outside `/v1` and the OpenAPI document: `coss/scheduling` is its client.
 */
import {
  type AuthenticatedSession,
  approveBooking,
  attendeeEmailedOnConfirm,
  authenticateSchedulingSession,
  cancelBooking,
  connectCaldav,
  connectSimulated,
  createBooking,
  createSchedule,
  declineBooking,
  disconnectCalendar,
  fixedAttendee,
  getBooking,
  getEventType,
  getHost,
  getLogoRow,
  getSettingsRow,
  listBookingSlots,
  listConnections,
  listEventTypeSlots,
  listSchedules,
  listUpcomingHostBookings,
  logoDataUrl,
  rescheduleBooking,
  type SchedulingDeps,
  SchedulingError,
  sessionActor,
  sessionAttributes,
  startCalendarAuthorization,
  toConnectionObject,
  updateCalendar,
  updateSchedule,
} from "@coss/scheduling";
import {
  AuthorizeCalendarRequest,
  CreateBookingRequest,
  CreateCalendarConnectionRequest,
  RescheduleBookingRequest,
  UpdateCalendarRequest,
  UpsertScheduleRequest,
} from "@coss/scheduling/schemas";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { ApiError } from "../errors.ts";
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

const notFound = () => new SchedulingError("not_found", "That isn't available from this link.");

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
      kind: eventType.kind,
      duration_minutes: eventType.duration_minutes,
      duration_options: eventType.duration_options,
      questions: eventType.questions,
      locations: eventType.locations.map((location) => ({ type: location.type })),
      requires_approval: eventType.requires_approval,
    };
  };

  const branding = async (env: AuthenticatedSession["env"]) => {
    const [settings, logo] = await Promise.all([getSettingsRow(env), getLogoRow(env)]);
    return {
      brand_name: settings?.brandName ?? null,
      accent_color: settings?.accentColor ?? null,
      logo: logo ? { data_url: logoDataUrl(logo), width: logo.width, height: logo.height } : null,
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
      return c.json({
        ...base,
        host: { id: host.id, name: host.name, time_zone: host.time_zone },
        zoom_available: Boolean(deps.calendars?.apps.zoom),
      });
    }
    return c.json(base);
  });

  const slotQueryOf = (c: Context<ClientEnv>) => {
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

  // An attendee sees times, never who else could take them.
  const slotList = (slots: readonly { startMs: number; endMs: number }[]) => ({
    object: "list" as const,
    data: slots.map((slot) => ({ start: iso(slot.startMs), end: iso(slot.endMs) })),
    has_more: false,
  });

  router.get("/slots", async (c) => {
    // The session's kind first: the wrong one is a 404, whatever the query says.
    const eventTypeRef = eventTypeOf(c);
    return c.json(
      slotList(
        await listEventTypeSlots(c.var.session.env, {
          ...slotQueryOf(c),
          eventTypeRef,
          hostRefs: c.var.session.session.hostId ? [c.var.session.session.hostId] : undefined,
          attributes: sessionAttributes(c.var.session.session, deps),
        }),
      ),
    );
  });

  router.post("/bookings", async (c) => {
    const eventType = eventTypeOf(c);
    const { session, env } = c.var.session;
    const body = await parsed(c, ClientBookingRequest);
    const fixed = fixedAttendee(session, deps);
    const attendee = fixed ?? body.attendee;
    if (!attendee) throw invalidBody("`attendee` is required.", "attendee");
    const { booking, replayed } = await createBooking(
      env,
      {
        eventType,
        startMs: instant(body.start, "start"),
        host: session.hostId ?? undefined,
        attributes: sessionAttributes(session, deps),
        durationMinutes: body.duration_minutes,
        attendee,
        answers: body.answers,
        location: body.location,
        locationFromBrowser: true,
        idempotencyKey: c.req.header("idempotency-key"),
      },
      deps,
      sessionActor(session),
    );
    if (replayed) c.header("Idempotent-Replayed", "true");
    const emailed =
      booking.attendees.some((person) => person.email) &&
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
    attendees: booking.attendees.map((attendee) => ({
      name: attendee.name,
      time_zone: attendee.time_zone,
    })),
  });

  router.get("/booking", async (c) => {
    const id = bookingOf(c);
    return c.json(clientBooking(await getBooking(c.var.session.env, id, deps)));
  });

  router.get("/booking/slots", async (c) => {
    const bookingId = bookingOf(c);
    const { fromMs, toMs, nowMs } = slotQueryOf(c);
    return c.json(
      slotList(
        await listBookingSlots(c.var.session.env, {
          bookingId,
          fromMs,
          toMs,
          nowMs,
        }),
      ),
    );
  });

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
      { enforceCutoffs: true },
    );
    return c.json(clientBooking(booking));
  });

  router.post("/booking/cancel", async (c) => {
    const id = bookingOf(c);
    const { env, session } = c.var.session;
    const booking = await cancelBooking(env, id, deps, sessionActor(session), {
      enforceCutoffs: true,
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

  /** A host's own bookings, with attendee names but not their answers. */
  router.get("/host/bookings", async (c) => {
    const page = await listUpcomingHostBookings(
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
      data: page.data,
      has_more: page.nextCursor !== null,
      next_cursor: page.nextCursor,
    });
  });

  const hostsOwnBooking = async (c: Context<ClientEnv>, hostId: string, id: string) => {
    const booking = await getBooking(c.var.session.env, id, deps);
    if (!booking.hosts.includes(hostId)) throw notFound();
  };

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
