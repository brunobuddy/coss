import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { MobileErrorBody } from "@coss/companion";

mock.module("server-only", () => ({}));
mock.module("@sentry/nextjs", () => ({ setTag: () => {}, setUser: () => {} }));

const GOOD_TOKEN = "good-token";
mock.module("@coss/auth", () => ({
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) =>
        headers.get("cookie") === `session=${GOOD_TOKEN}`
          ? {
              user: { id: "user_1", name: "Ada", email: "ada@example.com" },
              session: { id: "session_1", ssoProviderId: null, impersonatedBy: null },
            }
          : null,
    },
  },
}));
mock.module("@coss/auth/mobile", () => ({
  mobileSessionHeaders: async (token: string) =>
    token === GOOD_TOKEN ? new Headers({ cookie: `session=${token}` }) : null,
}));

let role = "member";
let environmentId = "env_1";
mock.module("@coss/tenancy", () => ({
  touchHipaaSession: async () => "active",
  getMembership: async () => ({
    organization: {
      id: "org_1",
      name: "Acme",
      slug: "acme",
      requireSso: false,
      requireTwoFactor: false,
    },
    member: { role },
    suspended: false,
    ssoProviderId: null,
  }),
  getEnvironment: async () => ({
    project: { id: "proj_1" },
    environment: { id: environmentId },
  }),
}));
mock.module("@/lib/rate-limit-runtime", () => ({
  rateLimitRuntime: () => ({
    clientIp: () => "203.0.113.9",
    limiter: { consume: async () => ({ allowed: true, retryAfterMs: 0 }) },
  }),
}));

// Everything below belongs to env_1 of org_1: another environment sees none of it.
type Env = { organizationId: string; environmentId: string };
const mine = (env: Env) => env.organizationId === "org_1" && env.environmentId === "env_1";
const CREATED = new Date("2026-10-01T00:00:00Z");
const CONTACT_ROW = {
  id: "contact_1",
  organizationId: "org_1",
  environmentId: "env_1",
  address: "ada@example.com",
  firstName: "Ada",
  lastName: null,
  status: "subscribed" as const,
  properties: { plan: "pro", internal_note: "not a defined property" },
  source: "api" as const,
  subscribedAt: CREATED,
  unsubscribedAt: null,
  confirmedAt: null,
  createdAt: CREATED,
  updatedAt: CREATED,
};
const CONTACT = {
  object: "contact" as const,
  id: "contact_1",
  email: "ada@example.com",
  first_name: "Ada",
  last_name: null,
  status: "subscribed" as const,
  properties: { plan: "pro" },
  source: "api" as const,
  subscribed_at: "2026-10-01T00:00:00.000Z",
  unsubscribed_at: null,
  confirmed_at: null,
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
};
const AUDIENCE = {
  object: "audience" as const,
  id: "aud_1",
  name: "Beta testers",
  contact_count: 1,
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-02T00:00:00.000Z",
};
const PROPERTY_ROWS = [
  {
    id: "cprop_1",
    organizationId: "org_1",
    environmentId: "env_1",
    key: "plan",
    type: "string" as const,
    fallback: "free",
    createdAt: CREATED,
    updatedAt: CREATED,
  },
  {
    id: "cprop_2",
    organizationId: "org_1",
    environmentId: "env_1",
    key: "renews_at",
    type: "date" as const,
    fallback: null,
    createdAt: CREATED,
    updatedAt: CREATED,
  },
];
const TOPIC_ROWS = [
  {
    id: "topic_1",
    organizationId: "org_1",
    environmentId: "env_1",
    key: "newsletter",
    name: "Newsletter",
    description: "Monthly news",
    defaultSubscription: "opt_out" as const,
    visibility: "public" as const,
    position: 0,
    createdAt: CREATED,
    updatedAt: CREATED,
  },
];
const SEGMENT = {
  object: "segment" as const,
  id: "seg_1",
  name: "Pro customers",
  filter: {
    version: 1 as const,
    match: "all" as const,
    conditions: [
      { field: "property" as const, key: "plan", op: "in" as const, value: ["pro", "scale"] },
      {
        field: "property" as const,
        key: "renews_at",
        op: "lt" as const,
        value: "2026-12-01T00:00:00.000Z",
      },
      {
        match: "any" as const,
        conditions: [
          { field: "email" as const, op: "ends_with" as const, value: "@acme.com" },
          { field: "audience" as const, op: "not_in" as const, audience_id: "aud_1" },
          { field: "topic" as const, op: "subscribed" as const, topic: "newsletter" },
          { field: "created_at" as const, op: "within_days" as const, value: 30 },
        ],
      },
    ],
  },
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-02T00:00:00.000Z",
};

const emailModule = await import("@coss/email");
const listContactsCalls: unknown[] = [];
let previewFails = false;
mock.module("@coss/email", () => ({
  ...emailModule,
  contactCount: async (env: Env) => (mine(env) ? 1 : 0),
  listContacts: async (env: Env, query: unknown) => {
    listContactsCalls.push(query);
    return { object: "list", data: mine(env) ? [CONTACT] : [], has_more: mine(env) };
  },
  getContactRow: async (env: Env, id: string) =>
    mine(env) && id === CONTACT_ROW.id ? CONTACT_ROW : null,
  getContactTopics: async () => ({
    object: "contact_topics",
    contact_id: CONTACT.id,
    topics: [{ topic: "newsletter", name: "Newsletter", subscribed: true, choice: null }],
  }),
  contactAudienceIds: async () => new Set(["aud_1"]),
  listContactPropertyRows: async (env: Env) => (mine(env) ? PROPERTY_ROWS : []),
  listAudiences: async (env: Env) => ({
    object: "list",
    data: mine(env) ? [AUDIENCE] : [],
    has_more: false,
  }),
  getAudience: async (env: Env, id: string) => (mine(env) && id === AUDIENCE.id ? AUDIENCE : null),
  listAudienceContacts: async (env: Env, id: string) =>
    mine(env) && id === AUDIENCE.id ? { object: "list", data: [CONTACT], has_more: false } : null,
  listSegments: async (env: Env) => ({
    object: "list",
    data: mine(env) ? [SEGMENT] : [],
    has_more: false,
  }),
  getSegment: async (env: Env, id: string) => (mine(env) && id === SEGMENT.id ? SEGMENT : null),
  previewSegmentContacts: async () => {
    if (previewFails) {
      throw new emailModule.ContactError("invalid_filter", "No audience aud_1 exists.");
    }
    return { object: "list", data: [CONTACT], has_more: false, count: 12 };
  },
  listTopicRows: async (env: Env) => (mine(env) ? TOPIC_ROWS : []),
}));

const ROUTES =
  "../src/app/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]";
const contacts = await import(`${ROUTES}/contacts/route`);
const contactDetail = await import(`${ROUTES}/contacts/[contactId]/route`);
const properties = await import(`${ROUTES}/contacts/properties/route`);
const audiences = await import(`${ROUTES}/audiences/route`);
const audienceDetail = await import(`${ROUTES}/audiences/[audienceId]/route`);
const segments = await import(`${ROUTES}/segments/route`);
const segmentDetail = await import(`${ROUTES}/segments/[segmentId]/route`);
const topics = await import(`${ROUTES}/topics/route`);

const ENV_PATH = "/api/mobile/v1/orgs/acme/projects/default/environments/production";

function get(path: string): Request {
  return new Request(`http://localhost:3000${ENV_PATH}${path}`, {
    headers: { authorization: `Bearer ${GOOD_TOKEN}` },
  });
}

function context(extra: Record<string, string> = {}) {
  return {
    params: Promise.resolve({
      orgSlug: "acme",
      projectSlug: "default",
      envSlug: "production",
      ...extra,
    }),
  };
}

async function errorOf(response: Response) {
  return ((await response.json()) as MobileErrorBody).error;
}

beforeEach(() => {
  role = "member";
  environmentId = "env_1";
  previewFails = false;
  listContactsCalls.length = 0;
});

describe("mobile contacts", () => {
  test("lists contacts with the total, a known status, a cursor", async () => {
    const response = await contacts.GET(
      get("/contacts?status=subscribed&after=contact_9&email=%20"),
      context(),
    );
    expect(response.status).toBe(200);
    expect(listContactsCalls).toEqual([{ status: "subscribed", after: "contact_9", limit: 50 }]);
    expect(await response.json()).toEqual({
      data: [
        {
          id: "contact_1",
          email: "ada@example.com",
          name: "Ada",
          status: "subscribed",
          created_at: "2026-10-01T00:00:00.000Z",
        },
      ],
      next_cursor: "contact_1",
      total: 1,
      invalid_email: false,
    });
  });

  test("an invalid address searches nothing; unknown statuses are ignored", async () => {
    const response = await contacts.GET(get("/contacts?email=ada&status=bogus"), context());
    expect(listContactsCalls).toEqual([]);
    expect(await response.json()).toEqual({
      data: [],
      next_cursor: null,
      total: 1,
      invalid_email: true,
    });
  });

  test("a contact: defined properties only, topics, every audience with membership", async () => {
    const response = await contactDetail.GET(
      get("/contacts/contact_1"),
      context({ contactId: "contact_1" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      contact: {
        id: "contact_1",
        email: "ada@example.com",
        first_name: "Ada",
        last_name: null,
        status: "subscribed",
        source: "api",
        subscribed_at: "2026-10-01T00:00:00.000Z",
        unsubscribed_at: null,
        confirmed_at: null,
        created_at: "2026-10-01T00:00:00.000Z",
      },
      properties: [
        { key: "plan", type: "string", value: "pro" },
        { key: "renews_at", type: "date", value: null },
      ],
      topics: [{ topic: "newsletter", name: "Newsletter", choice: null, subscribed: true }],
      audiences: [{ id: "aud_1", name: "Beta testers", member: true }],
    });
  });

  test("property definitions", async () => {
    const response = await properties.GET(get("/contacts/properties"), context());
    expect(await response.json()).toEqual({
      data: [
        {
          id: "cprop_1",
          key: "plan",
          type: "string",
          fallback: "free",
          created_at: "2026-10-01T00:00:00.000Z",
        },
        {
          id: "cprop_2",
          key: "renews_at",
          type: "date",
          fallback: null,
          created_at: "2026-10-01T00:00:00.000Z",
        },
      ],
    });
  });
});

describe("mobile audiences, segments and topics", () => {
  test("audiences and an audience's members", async () => {
    const list = await audiences.GET(get("/audiences"), context());
    expect(await list.json()).toEqual({
      data: [
        {
          id: "aud_1",
          name: "Beta testers",
          contact_count: 1,
          created_at: "2026-10-01T00:00:00.000Z",
        },
      ],
      next_cursor: null,
    });
    const detail = await audienceDetail.GET(
      get("/audiences/aud_1"),
      context({ audienceId: "aud_1" }),
    );
    expect(await detail.json()).toEqual({
      audience: {
        id: "aud_1",
        name: "Beta testers",
        contact_count: 1,
        created_at: "2026-10-01T00:00:00.000Z",
      },
      members: {
        data: [{ id: "contact_1", email: "ada@example.com", status: "subscribed" }],
        next_cursor: null,
      },
    });
  });

  test("segments, and a segment's conditions written out with its matches", async () => {
    const list = await segments.GET(get("/segments"), context());
    expect(await list.json()).toEqual({
      data: [
        {
          id: "seg_1",
          name: "Pro customers",
          match: "all",
          condition_count: 3,
          updated_at: "2026-10-02T00:00:00.000Z",
        },
      ],
      next_cursor: null,
    });

    const detail = await segmentDetail.GET(get("/segments/seg_1"), context({ segmentId: "seg_1" }));
    expect(await detail.json()).toEqual({
      segment: {
        id: "seg_1",
        name: "Pro customers",
        match: "all",
        conditions: [
          {
            kind: "condition",
            condition: {
              field: "Property",
              key: "plan",
              operator: "is one of",
              value: "pro, scale",
            },
          },
          {
            kind: "condition",
            condition: {
              field: "Property",
              key: "renews_at",
              operator: "is before",
              value: "2026-12-01",
            },
          },
          {
            kind: "group",
            match: "any",
            conditions: [
              { field: "Email", key: null, operator: "ends with", value: "@acme.com" },
              { field: "Audience", key: null, operator: "is not in", value: "Beta testers" },
              { field: "Topic", key: null, operator: "is subscribed to", value: "Newsletter" },
              { field: "Added", key: null, operator: "in the last (days)", value: "30" },
            ],
          },
        ],
        created_at: "2026-10-01T00:00:00.000Z",
        updated_at: "2026-10-02T00:00:00.000Z",
      },
      count: 12,
      sample: ["ada@example.com"],
    });
  });

  test("a filter that no longer compiles still shows, without a count", async () => {
    previewFails = true;
    const detail = await segmentDetail.GET(get("/segments/seg_1"), context({ segmentId: "seg_1" }));
    expect(detail.status).toBe(200);
    const body = await detail.json();
    expect(body.count).toBeNull();
    expect(body.sample).toEqual([]);
  });

  test("topics", async () => {
    const response = await topics.GET(get("/topics"), context());
    expect(await response.json()).toEqual({
      data: [
        {
          id: "topic_1",
          key: "newsletter",
          name: "Newsletter",
          description: "Monthly news",
          default_subscription: "opt_out",
          visibility: "public",
        },
      ],
    });
  });
});

describe("mobile contacts access", () => {
  const routes = [
    ["/contacts", contacts, {}],
    ["/contacts/contact_1", contactDetail, { contactId: "contact_1" }],
    ["/contacts/properties", properties, {}],
    ["/audiences", audiences, {}],
    ["/audiences/aud_1", audienceDetail, { audienceId: "aud_1" }],
    ["/segments", segments, {}],
    ["/segments/seg_1", segmentDetail, { segmentId: "seg_1" }],
    ["/topics", topics, {}],
  ] as const;

  test("roles without contact:read get a 403 everywhere", async () => {
    role = "guest";
    for (const [path, route, params] of routes) {
      const response = await route.GET(get(path), context(params));
      expect(response.status).toBe(403);
      expect((await errorOf(response)).code).toBe("forbidden");
    }
  });

  test("another environment's contact, audience and segment are not found", async () => {
    environmentId = "env_2";
    for (const [path, route, params] of routes.filter(
      ([, , params]) => Object.keys(params).length,
    )) {
      const response = await route.GET(get(path), context(params));
      expect(response.status).toBe(404);
      expect((await errorOf(response)).code).toBe("not_found");
    }
    const list = await contacts.GET(get("/contacts"), context());
    expect((await list.json()).data).toEqual([]);
  });
});
