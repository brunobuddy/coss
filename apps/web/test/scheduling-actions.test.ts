import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { EventTypeObjectOutput } from "@coss/scheduling/schemas";

mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({ refresh: mock() }));
const redirect = mock((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`);
});
mock.module("next/navigation", () => ({
  redirect,
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) throw error;
  },
}));
let denied = false;
const requireOrgPermission = mock(async (_slug: string, _permission: unknown) => {
  if (denied) throw new Error("denied");
  return { organization: { id: "org_1", slug: "acme" }, session: { user: { id: "user_1" } } };
});
mock.module("@/lib/session", () => ({ requireOrgPermission }));
const tenancyModule = await import("@coss/tenancy");
mock.module("@coss/tenancy", () => ({
  ...tenancyModule,
  getEnvironment: async () => ({
    project: { id: "proj_1" },
    environment: { id: "env_1", projectId: "proj_1", mode: "live" },
  }),
}));
const recordAudit = mock(async (_session: unknown, _input: unknown) => {});
mock.module("@/lib/audit", () => ({ recordAudit }));
mock.module("@/lib/scheduling", () => ({
  schedulingDeps: () => ({
    dataKeys: [],
    lookupKey: Buffer.alloc(32),
    screenSetup: async () => {},
  }),
  schedulingUrl: () => "https://cossbook.test",
}));

const CURRENT: EventTypeObjectOutput = {
  object: "scheduling.event_type",
  id: "evtype_1",
  uid: null,
  title: "Consultation",
  kind: "one_on_one",
  status: "active",
  duration_minutes: 30,
  duration_options: [],
  step_minutes: 30,
  grid_time_zone: null,
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  min_notice_minutes: 0,
  booking_window: null,
  limits: [],
  capacity: null,
  requires_approval: false,
  approval_ttl_minutes: 1440,
  hold_ttl_seconds: 600,
  cancel_notice_minutes: 0,
  reschedule_notice_minutes: 0,
  max_guests: 0,
  host_calendar_details: "neutral",
  questions: [],
  locations: [],
  host_filter: null,
  hosts: [],
  metadata: {},
  created_at: "2027-01-01T10:00:00.000Z",
  updated_at: "2027-01-01T10:00:00.000Z",
};

const updateEventType = mock(async (_env: unknown, _id: string, changes: object) => ({
  ...CURRENT,
  ...changes,
}));
const session = { url: "https://cossbook.test/x#cossch_token" };
const createBookerSession = mock(async (_env: unknown, _input: unknown, _deps: unknown) => session);
const createManageSession = mock(async (_env: unknown, _input: unknown) => session);
const createBooking = mock(async () => ({}));
const rescheduleBooking = mock(async () => ({}));
const updateHost = mock(async (_env: unknown, _id: string, changes: object) => ({
  id: "host_1",
  name: "Dr. Reyes",
  ...changes,
}));
const deleteHost = mock(async () => ({ id: "host_1" }));
const schedulingModule = await import("@coss/scheduling");
mock.module("@coss/scheduling", () => ({
  ...schedulingModule,
  getEventType: async () => CURRENT,
  updateEventType,
  createBookerSession,
  createManageSession,
  createBooking,
  rescheduleBooking,
  getHost: async () => ({
    id: "host_1",
    name: "Dr. Reyes",
    email: "ana@example.com",
    uid: null,
    time_zone: "UTC",
    attributes: {},
    metadata: {},
  }),
  updateHost,
  deleteHost,
}));

const {
  deleteHostAction,
  openBookerAction,
  openBookingManagerAction,
  setEventTypeStatusAction,
  updateEventTypeAction,
  updateHostAction,
} = await import("../src/app/[orgSlug]/[projectSlug]/[envSlug]/scheduling/actions");
const { eventTypeFormState, eventTypePayload } = await import("../src/lib/scheduling-edit");

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  const all = { orgSlug: "acme", projectSlug: "default", envSlug: "production", ...values };
  for (const [key, value] of Object.entries(all)) data.set(key, value);
  return data;
}

const payload = (change: object = {}) =>
  JSON.stringify({
    ...eventTypePayload(eventTypeFormState(CURRENT), "one_on_one"),
    ...change,
  });

beforeEach(() => {
  denied = false;
  for (const fn of [
    updateEventType,
    createBookerSession,
    createManageSession,
    createBooking,
    rescheduleBooking,
    updateHost,
    deleteHost,
    recordAudit,
    requireOrgPermission,
    redirect,
  ]) {
    fn.mockClear();
  }
});

describe("saving an event type", () => {
  test("sends only what changed, with the screening, and records it like the API", async () => {
    const result = await updateEventTypeAction(
      null,
      form({ eventTypeId: "evtype_1", payload: payload({ min_notice_minutes: 240 }) }),
    );
    expect(result.ok).toBe(true);
    const [env, id, changes, opts] = updateEventType.mock.calls[0] as unknown as [
      { organizationId: string; environmentId: string; mode: string },
      string,
      object,
      { screen?: unknown },
    ];
    expect(env).toMatchObject({ organizationId: "org_1", environmentId: "env_1", mode: "live" });
    expect(id).toBe("evtype_1");
    expect(changes).toEqual({ min_notice_minutes: 240 });
    expect(opts.screen).toBeDefined();
    expect(requireOrgPermission.mock.calls[0]?.[1]).toEqual({ scheduling: ["update"] });
    const audit = recordAudit.mock.calls[0]?.[1] as { action: string };
    expect(audit.action).toBe("scheduling_event_type.updated");
  });

  test("an untouched form writes nothing and records nothing", async () => {
    const result = await updateEventTypeAction(
      null,
      form({ eventTypeId: "evtype_1", payload: payload() }),
    );
    expect(result.ok).toBe(true);
    expect(updateEventType).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  test("a mistake comes back in the form's words, and unknown fields are refused", async () => {
    const wrong = await updateEventTypeAction(
      null,
      form({
        eventTypeId: "evtype_1",
        payload: payload({
          questions: [{ key: "Bad Key", type: "text", label: "x", required: false, options: [] }],
        }),
      }),
    );
    expect(wrong).toMatchObject({ ok: false });
    expect(wrong.ok ? "" : wrong.error).toStartWith("Question 1:");
    const unknown = await updateEventTypeAction(
      null,
      form({ eventTypeId: "evtype_1", payload: payload({ guests: ["a@example.com"] }) }),
    );
    expect(unknown.ok).toBe(false);
    expect(updateEventType).not.toHaveBeenCalled();
  });

  test("metadata it can't read isn't dropped silently", async () => {
    const result = await updateEventTypeAction(
      null,
      form({ eventTypeId: "evtype_1", payload: payload(), metadata: "a=1" }),
    );
    expect(result.ok ? "" : result.error).toBe("Metadata isn't valid JSON.");
    expect(updateEventType).not.toHaveBeenCalled();
  });

  test("garbage in the payload is a message, not a crash", async () => {
    const result = await updateEventTypeAction(
      null,
      form({ eventTypeId: "evtype_1", payload: "{nope" }),
    );
    expect(result.ok ? "" : result.error).toContain("couldn't be read");
  });

  test("archiving needs update and goes through the same function", async () => {
    await setEventTypeStatusAction(null, form({ eventTypeId: "evtype_1", status: "archived" }));
    expect(updateEventType.mock.calls[0]?.[2]).toEqual({ status: "archived" });
  });
});

describe("booking from the dashboard", () => {
  test("opens the booker's page as the member, and never books in this process", async () => {
    const result = await openBookerAction(null, form({ eventTypeId: "evtype_1" }));
    expect(result).toEqual({ ok: true, data: { url: session.url } });
    const input = createBookerSession.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(input).toMatchObject({
      eventType: "evtype_1",
      createdByUserId: "user_1",
      publicUrl: "https://cossbook.test",
    });
    expect(requireOrgPermission.mock.calls[0]?.[1]).toEqual({ scheduling: ["create"] });
    expect(createBooking).not.toHaveBeenCalled();
  });

  test("rescheduling opens the manage page as the member, and never moves it in this process", async () => {
    const result = await openBookingManagerAction(null, form({ bookingId: "book_1" }));
    expect(result).toEqual({ ok: true, data: { url: session.url } });
    const input = createManageSession.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(input).toMatchObject({ bookingId: "book_1", createdByUserId: "user_1" });
    expect(requireOrgPermission.mock.calls[0]?.[1]).toEqual({ scheduling: ["update"] });
    expect(rescheduleBooking).not.toHaveBeenCalled();
  });
});

describe("a host's details", () => {
  const host = {
    hostId: "host_1",
    name: "Dr. Reyes",
    email: "ana@example.com",
    uid: "",
    timeZone: "UTC",
    attributes: "",
    metadata: "",
  };

  test("an unchanged name isn't screened again", async () => {
    await updateHostAction(null, form({ ...host, timeZone: "America/New_York", email: "" }));
    const changes = updateHost.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(changes).toEqual({
      email: null,
      time_zone: "America/New_York",
      attributes: {},
      metadata: {},
    });
  });

  test("a blank time zone or name is refused, not saved", async () => {
    for (const change of [{ timeZone: "   " }, { name: "  " }]) {
      const result = await updateHostAction(null, form({ ...host, ...change }));
      expect(result.ok).toBe(false);
    }
    expect(updateHost).not.toHaveBeenCalled();
  });

  test("attributes come through exactly as written", async () => {
    await updateHostAction(
      null,
      form({ ...host, attributes: '{ "specialty": "Ear, nose and throat", "langs": ["es"] }' }),
    );
    const changes = updateHost.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(changes.attributes).toEqual({ specialty: "Ear, nose and throat", langs: ["es"] });
  });

  test("deleting from its own page goes back to the list, with paths from the slugs", async () => {
    await expect(
      deleteHostAction(null, form({ hostId: "host_1", leavePage: "on" })),
    ).rejects.toThrow("NEXT_REDIRECT /acme/default/production/scheduling/hosts");
  });
});
