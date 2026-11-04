import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  MobileErrorBody,
  Page,
  SchedulingBooking,
  SchedulingBookingActionResponse,
  SchedulingHostResponse,
} from "@coss/companion";

mock.module("server-only", () => ({}));
mock.module("@sentry/nextjs", () => ({ setTag: () => {}, setUser: () => {} }));

const TOKEN = "good-token";
mock.module("@coss/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: "user_1", name: "Ada", email: "ada@example.com", twoFactorEnabled: false },
        session: { id: "session_1", ssoProviderId: null, impersonatedBy: null },
      }),
    },
  },
}));
mock.module("@coss/auth/mobile", () => ({
  mobileSessionHeaders: async (token: string) =>
    token === TOKEN ? new Headers({ cookie: `session=${token}` }) : null,
}));

let role = "owner";
let suspended = false;
const tenancyModule = await import("@coss/tenancy");
mock.module("@coss/tenancy", () => ({
  ...tenancyModule,
  getMembership: async () => ({
    organization: {
      id: "org_1",
      name: "Acme",
      slug: "acme",
      requireSso: false,
      requireTwoFactor: false,
    },
    member: { role },
    suspended,
    ssoProviderId: null,
  }),
  getEnvironment: async () => ({
    project: { id: "proj_1", name: "Default", slug: "default" },
    environment: {
      id: "env_1",
      projectId: "proj_1",
      name: "Production",
      slug: "production",
      mode: "live",
    },
  }),
}));

const audits: { action: string; target: { type: string; id: string } }[] = [];
mock.module("@/lib/audit", () => ({
  recordAudit: async (_session: unknown, event: (typeof audits)[number]) => {
    audits.push(event);
  },
}));
mock.module("@/lib/rate-limit-runtime", () => ({
  rateLimitRuntime: () => ({
    limiter: { consume: async () => ({ allowed: true }) },
    clientIp: () => null,
  }),
}));

const BOOKING = {
  object: "scheduling.booking" as const,
  id: "book_1",
  event_type: "evtype_1",
  status: "pending_approval" as const,
  title: "Intro call",
  start: "2031-01-06T09:00:00.000Z",
  end: "2031-01-06T09:30:00.000Z",
  hosts: ["host_1", "host_gone"],
  attendees: [
    {
      id: "att_1",
      uid: "user_1",
      name: "Sam Lee",
      email: "sam@secret.example",
      phone: "+15550100",
      time_zone: "UTC",
      locale: null,
      answers: { allergies: "peanuts" },
    },
  ],
  location: { type: "phone" as const, number: "+15550199" },
  hold_expires_at: null,
  approval_expires_at: "2031-01-05T09:00:00.000Z",
  series: null,
  series_index: null,
  group_session: null,
  calendar_unverified: false,
  external_conflict_at: null,
  no_show_at: null,
  cancelled_at: null,
  metadata: { internal_ref: "metadata-secret" },
  created_at: "2030-01-01T00:00:00.000Z",
  updated_at: "2030-01-01T00:00:00.000Z",
};

type Scope = { organizationId: string; environmentId: string };
const HOST = {
  object: "scheduling.host" as const,
  id: "host_1",
  uid: "dana",
  name: "Dana",
  email: "dana@secret.example",
  time_zone: "America/New_York",
  attributes: {},
  metadata: {},
  status: "active" as const,
  created_at: "2030-01-01T00:00:00.000Z",
  updated_at: "2030-01-01T00:00:00.000Z",
};
const listBookings = mock(async (_scope: Scope, _query: Record<string, unknown>) => ({
  data: [BOOKING],
  hasMore: true,
}));
const decide = mock(async (..._args: unknown[]) => ({ ...BOOKING, status: "confirmed" as const }));
const schedulingModule = await import("@coss/scheduling");
const SchedulingError = schedulingModule.SchedulingError;
mock.module("@coss/scheduling", () => ({
  ...schedulingModule,
  listBookings,
  getBooking: async (_scope: Scope, id: string) => {
    if (id !== "book_1") throw new SchedulingError("not_found", `No booking "${id}".`);
    return BOOKING;
  },
  approveBooking: (...args: unknown[]) => decide("approve", ...args),
  declineBooking: (...args: unknown[]) => decide("decline", ...args),
  cancelBooking: (...args: unknown[]) => decide("cancel", ...args),
  getHost: async (_scope: Scope, ref: string) => {
    if (ref !== "host_1") throw new SchedulingError("not_found", "Gone.");
    return HOST;
  },
  listSchedules: async () => [
    {
      object: "scheduling.schedule" as const,
      id: "sched_1",
      host: "host_1",
      name: "Working hours",
      time_zone: "America/New_York",
      is_default: true,
      rules: [{ days: [1, 2], start: "09:00", end: "17:00" }],
      overrides: [{ date: "2031-12-24", ranges: [] }],
      created_at: "2030-01-01T00:00:00.000Z",
      updated_at: "2030-01-01T00:00:00.000Z",
    },
  ],
  listConnections: async () => [
    {
      object: "scheduling.calendar_connection" as const,
      id: "conn_1",
      host: "host_1",
      provider: "google" as const,
      account: "dana-account@secret.example",
      status: "active" as const,
      calendars: [
        {
          id: "cal_1",
          external_id: "x@secret.example",
          read_busy: true,
          write_target: true,
          verified_at: null,
        },
      ],
      created_at: "2030-01-01T00:00:00.000Z",
    },
  ],
}));

const ENV = "http://x/api/mobile/v1/orgs/acme/projects/default/environments/production/scheduling";
const params = { orgSlug: "acme", projectSlug: "default", envSlug: "production" };
const headers = { authorization: `Bearer ${TOKEN}` };

const list = await import(
  "../src/app/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/scheduling/bookings/route"
);
const detail = await import(
  "../src/app/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/scheduling/bookings/[bookingId]/route"
);
const approve = await import(
  "../src/app/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/scheduling/bookings/[bookingId]/approve/route"
);
const decline = await import(
  "../src/app/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/scheduling/bookings/[bookingId]/decline/route"
);
const cancel = await import(
  "../src/app/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/scheduling/bookings/[bookingId]/cancel/route"
);
const host = await import(
  "../src/app/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/scheduling/hosts/[hostId]/route"
);

const bookingCtx = { params: Promise.resolve({ ...params, bookingId: "book_1" }) } as never;
const SECRETS = /sam@secret|\+15550100|peanuts|allergies|metadata-secret|internal_ref|att_1/;

beforeEach(() => {
  role = "owner";
  suspended = false;
  audits.length = 0;
  listBookings.mockClear();
  decide.mockClear();
});

describe("reading bookings", () => {
  test("a page carries nothing but what the dashboard shows", async () => {
    const res = await list.GET(new Request(`${ENV}/bookings`, { headers }), {
      params: Promise.resolve(params),
    } as never);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toMatch(SECRETS);
    const page = JSON.parse(body) as Page<SchedulingBooking>;
    expect(page.next_cursor).toBe("book_1");
    expect(page.data[0]?.attendees).toEqual([{ name: "Sam Lee", uid: "user_1", time_zone: "UTC" }]);
    expect(page.data[0]?.hosts).toEqual([
      { id: "host_1", name: "Dana" },
      { id: "host_gone", name: "Removed host" },
    ]);
  });

  test("upcoming sorts by start and leaves out what ended; past goes backwards", async () => {
    await list.GET(new Request(`${ENV}/bookings`, { headers }), {
      params: Promise.resolve(params),
    } as never);
    const upcoming = listBookings.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(upcoming.order).toBe("start_asc");
    expect(upcoming.statuses).toEqual(["held", "pending_approval", "confirmed"]);
    expect(upcoming.endAfter).toBeInstanceOf(Date);

    await list.GET(new Request(`${ENV}/bookings?view=past`, { headers }), {
      params: Promise.resolve(params),
    } as never);
    const past = listBookings.mock.calls[1]?.[1] as Record<string, unknown>;
    expect(past.order).toBe("start_desc");
    expect(past.endBefore).toBeInstanceOf(Date);
    expect(past.statuses).toBeUndefined();
  });

  test("a day narrows by start; an unparsable one is ignored", async () => {
    await list.GET(
      new Request(`${ENV}/bookings?from=2031-01-06T00:00:00.000Z&to=not-a-date`, { headers }),
      { params: Promise.resolve(params) } as never,
    );
    const query = listBookings.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(query.startAfter).toEqual(new Date("2031-01-06T00:00:00.000Z"));
    expect(query.startBefore).toBeUndefined();
  });

  test("one booking never includes its answers or contact details", async () => {
    const res = await detail.GET(new Request(`${ENV}/bookings/book_1`, { headers }), bookingCtx);
    expect(res.status).toBe(200);
    expect(await res.text()).not.toMatch(SECRETS);
  });

  test("another environment's booking is a 404", async () => {
    const res = await detail.GET(new Request(`${ENV}/bookings/book_2`, { headers }), {
      params: Promise.resolve({ ...params, bookingId: "book_2" }),
    } as never);
    expect(res.status).toBe(404);
    expect(((await res.json()) as MobileErrorBody).error.code).toBe("not_found");
  });

  test("needs a session", async () => {
    const res = await list.GET(new Request(`${ENV}/bookings`), {
      params: Promise.resolve(params),
    } as never);
    expect(res.status).toBe(401);
  });
});

describe("a host", () => {
  test("shows hours and whether calendars work, without their accounts", async () => {
    const res = await host.GET(new Request(`${ENV}/hosts/host_1`, { headers }), {
      params: Promise.resolve({ ...params, hostId: "host_1" }),
    } as never);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("secret.example");
    const body = JSON.parse(text) as SchedulingHostResponse;
    expect(body.schedules[0]?.overrides).toBe(1);
    expect(body.calendars[0]).toEqual({
      id: "conn_1",
      provider: "google",
      status: "active",
      calendars: 1,
      reading_busy: 1,
      unverified: 1,
    });
  });
});

describe("changing a booking", () => {
  const post = (route: typeof approve) =>
    route.POST(new Request(`${ENV}/bookings/book_1/x`, { method: "POST", headers }), bookingCtx);

  test.each([
    ["approve", approve, "scheduling_booking.approved"],
    ["decline", decline, "scheduling_booking.declined"],
    ["cancel", cancel, "scheduling_booking.cancelled"],
  ] as const)(
    "%s runs as the member and records the dashboard's audit event",
    async (verb, route, action) => {
      const res = await post(route);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).not.toMatch(SECRETS);
      expect((JSON.parse(text) as SchedulingBookingActionResponse).booking.status).toBe(
        "confirmed",
      );
      const [kind, env, id, , actor] = decide.mock.calls[0] ?? [];
      expect(kind).toBe(verb);
      expect(id).toBe("book_1");
      expect(env).toEqual({
        organizationId: "org_1",
        projectId: "proj_1",
        environmentId: "env_1",
        mode: "live",
      });
      expect(actor).toEqual({ kind: "user", id: "user_1" });
      expect(audits).toEqual([
        expect.objectContaining({
          action,
          target: { type: "scheduling_booking", id: "book_1" },
        }),
      ]);
    },
  );

  test("a member who can only read gets a 403 and nothing happens", async () => {
    role = "member";
    const res = await post(approve);
    expect(res.status).toBe(403);
    expect(decide).not.toHaveBeenCalled();
    expect(audits).toEqual([]);
  });

  test("a suspended organization can't change anything", async () => {
    suspended = true;
    const res = await post(cancel);
    expect(res.status).toBe(403);
    expect(decide).not.toHaveBeenCalled();
  });

  test("a refusal keeps its message and records nothing", async () => {
    decide.mockImplementationOnce(async () => {
      throw new SchedulingError("booking_not_changeable", "This booking was already declined.");
    });
    const res = await post(approve);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(((await res.json()) as MobileErrorBody).error.message).toBe(
      "This booking was already declined.",
    );
    expect(audits).toEqual([]);
  });
});
