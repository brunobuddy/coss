import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { EnvironmentHomeResponse } from "@coss/companion";

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
mock.module("@/lib/rate-limit-runtime", () => ({
  rateLimitRuntime: () => ({
    limiter: { consume: async () => ({ allowed: true }) },
    clientIp: () => null,
  }),
}));

let role = "owner";
const zero = {
  email: 0,
  marketing: 0,
  inboxes: 0,
  sms: 0,
  verify: 0,
  sign: 0,
  forms: 0,
  scheduling: 7,
  hooks: 0,
  risk: 0,
};
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
    suspended: false,
    ssoProviderId: null,
  }),
  getEnvironment: async () => ({
    project: { id: "proj_1", name: "Default", slug: "default" },
    environment: { id: "env_1", name: "Production", slug: "production", mode: "sandbox" },
  }),
  productFigures: async () => zero,
  productDailyActivity: async () =>
    Object.fromEntries(Object.keys(zero).map((key) => [key, [0, 1]])),
  listEnvironmentApiKeys: async () => [],
}));
const productsModule = await import("../src/lib/products");
mock.module("@/lib/products", () => ({
  ...productsModule,
  productUse: async () => ({ here: ["scheduling"], inProject: ["scheduling"], elsewhere: {} }),
  productPreferences: async () => ({}),
}));
mock.module("@coss/webhooks", () => ({ listWebhookEndpoints: async () => [] }));
mock.module("@coss/logs", () => ({ queryLogs: async () => ({ data: [] }) }));

const pending = mock(async (_scope: unknown, _query: Record<string, unknown>) => ({
  data: [{ id: "book_1" }, { id: "book_2" }],
  hasMore: false,
}));
const schedulingModule = await import("@coss/scheduling");
mock.module("@coss/scheduling", () => ({ ...schedulingModule, listBookings: pending }));

const home = await import(
  "../src/app/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/home/route"
);
const call = () =>
  home.GET(
    new Request("http://x/api/mobile/v1/orgs/acme/projects/default/environments/production/home", {
      headers: { authorization: `Bearer ${TOKEN}` },
    }),
    {
      params: Promise.resolve({ orgSlug: "acme", projectSlug: "default", envSlug: "production" }),
    } as never,
  );

beforeEach(() => {
  role = "owner";
  pending.mockClear();
});

describe("an environment's home", () => {
  test("says how many bookings await approval, asking only for those", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = (await res.json()) as EnvironmentHomeResponse;
    expect(body.attention).toEqual([
      {
        key: "scheduling",
        tone: "scheduling",
        severity: "warning",
        title: "2 bookings are awaiting approval",
        description: "Approve or decline them before they expire.",
      },
    ]);
    expect(pending.mock.calls[0]?.[1]).toEqual({ limit: 20, status: "pending_approval" });
  });

  test("lists the products in use with their figures, and the rest to discover", async () => {
    const body = (await (await call()).json()) as EnvironmentHomeResponse;
    expect(body.products).toEqual([
      {
        key: "scheduling",
        count: 7,
        one: "booking",
        many: "bookings",
        recent: true,
        daily: [0, 1],
        elsewhere: null,
      },
    ]);
    expect(body.discover).toContain("email");
    expect(body.discover).not.toContain("scheduling");
    expect(body.summary).toBe("In the last 14 days: 7 bookings.");
  });
});
