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
              user: { id: "user_1", name: "Ada", email: "ada@example.com", image: null },
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
let environmentFound: { project: { id: string }; environment: { id: string } } | null = null;
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
  getEnvironment: async () => environmentFound,
}));
mock.module("@/lib/rate-limit-runtime", () => ({
  rateLimitRuntime: () => ({
    clientIp: () => "203.0.113.9",
    limiter: { consume: async () => ({ allowed: true, retryAfterMs: 0 }) },
  }),
}));

const scopes: unknown[] = [];
const riskModule = await import("@coss/risk");
mock.module("@coss/risk", () => ({
  ...riskModule,
  listRiskLimitBuckets: async (scope: unknown) => {
    scopes.push(scope);
    return {
      object: "list",
      has_more: false,
      data: [
        {
          object: "risk_limit_bucket",
          id: "rsklb_1",
          name: "password-reset",
          limit: 5,
          period_seconds: 3600,
          burst: 10,
          on_failure: "deny",
          created_at: "2026-10-01T00:00:00.000Z",
          updated_at: "2026-10-02T00:00:00.000Z",
        },
      ],
    };
  },
  getRiskCalibration: async (scope: unknown) => {
    scopes.push(scope);
    return {
      object: "risk_calibration",
      window_days: 90,
      assessments: 120,
      labeled: 30,
      reasons: [
        {
          code: "email.disposable",
          fired: 40,
          fraud: 18,
          legitimate: 4,
          precision: 0.818,
          default_weight: 0.7,
          weight: 0.7,
          suggested_weight: 0.78,
        },
      ],
      rules: [
        {
          rule: "rskrule_1",
          name: "Block RU",
          matched: 3,
          fraud: 1,
          legitimate: 0,
          precision: 1,
        },
      ],
    };
  },
  getRiskSettings: async (scope: unknown) => {
    scopes.push(scope);
    return {
      object: "risk_settings",
      review_threshold: 0.5,
      block_threshold: 0.85,
      disabled_reasons: ["email.role_account"],
      // Not part of the real output: proves nothing beyond the wire type is passed through.
      captcha: { provider: "turnstile", required: true, secret: "never-sent" },
      content_thresholds: { spam: 0.9, phishing: null, malware: null, fraud: 0.7 },
      reason_weights: { "email.disposable": 0.8 },
      updated_at: "2026-10-01T00:00:00.000Z",
    };
  },
}));
const hooksModule = await import("@coss/hooks");
mock.module("@coss/hooks", () => ({
  ...hooksModule,
  getHookPortalSettings: async (scope: unknown) => {
    scopes.push(scope);
    return {
      allowedOrigins: ["https://app.example.com"],
      displayName: "Acme",
      accentColor: "#2563eb",
      theme: "dark",
      // Not part of the real output: proves nothing beyond the wire type is passed through.
      sessionToken: "never-sent",
    };
  },
}));

const limits = await import(
  "../src/app/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/risk/limits/route"
);
const calibration = await import(
  "../src/app/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/risk/calibration/route"
);
const settings = await import(
  "../src/app/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/risk/settings/route"
);
const hookSettings = await import(
  "../src/app/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/hooks/settings/route"
);

const ENV_PATH = "/api/mobile/v1/orgs/acme/projects/default/environments/production";
const context = {
  params: Promise.resolve({ orgSlug: "acme", projectSlug: "default", envSlug: "production" }),
};
type Handler = (request: Request, ctx: typeof context) => Promise<Response>;

function call(handler: Handler, path: string) {
  return handler(
    new Request(`http://localhost:3000${ENV_PATH}${path}`, {
      headers: { authorization: `Bearer ${GOOD_TOKEN}` },
    }),
    context,
  );
}

async function errorOf(response: Response) {
  return ((await response.json()) as MobileErrorBody).error;
}

const ROUTES: [string, Handler, string][] = [
  ["rate limits", limits.GET, "/risk/limits"],
  ["calibration", calibration.GET, "/risk/calibration"],
  ["risk settings", settings.GET, "/risk/settings"],
  ["portal settings", hookSettings.GET, "/hooks/settings"],
];

beforeEach(() => {
  role = "member";
  environmentFound = { project: { id: "proj_1" }, environment: { id: "env_1" } };
  scopes.length = 0;
});

describe("mobile risk and Hooks portal settings", () => {
  for (const [name, handler, path] of ROUTES) {
    test(`${name}: roles without the permission get a 403`, async () => {
      role = "guest";
      const response = await call(handler, path);
      expect(response.status).toBe(403);
      expect((await errorOf(response)).code).toBe("forbidden");
      expect(scopes).toEqual([]);
    });

    test(`${name}: an environment outside the organization is a 404`, async () => {
      environmentFound = null;
      const response = await call(handler, path);
      expect(response.status).toBe(404);
      expect(scopes).toEqual([]);
    });

    test(`${name}: members read it, scoped to the environment, uncached`, async () => {
      const response = await call(handler, path);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(scopes).toEqual([{ organizationId: "org_1", environmentId: "env_1" }]);
    });
  }

  test("rate limit buckets carry only what the screen shows", async () => {
    expect(await (await call(limits.GET, "/risk/limits")).json()).toEqual({
      data: [
        {
          id: "rsklb_1",
          name: "password-reset",
          limit: 5,
          period_seconds: 3600,
          burst: 10,
          on_failure: "deny",
        },
      ],
    });
  });

  test("calibration has the reasons (no rules) and the feedback a suggestion needs", async () => {
    expect(await (await call(calibration.GET, "/risk/calibration")).json()).toEqual({
      window_days: 90,
      assessments: 120,
      labeled: 30,
      min_feedback: 20,
      reasons: [
        {
          code: "email.disposable",
          fired: 40,
          fraud: 18,
          legitimate: 4,
          precision: 0.818,
          weight: 0.7,
          default_weight: 0.7,
          suggested_weight: 0.78,
        },
      ],
    });
  });

  test("risk settings never carry the captcha secret", async () => {
    const response = await call(settings.GET, "/risk/settings");
    const text = await response.clone().text();
    expect(text).not.toContain("never-sent");
    expect(await response.json()).toEqual({
      review_threshold: 0.5,
      block_threshold: 0.85,
      captcha: { provider: "turnstile", required: true },
      content_thresholds: [
        { category: "spam", threshold: 0.9 },
        { category: "phishing", threshold: null },
        { category: "malware", threshold: null },
        { category: "fraud", threshold: 0.7 },
      ],
      disabled_reasons: [
        {
          code: "email.role_account",
          description:
            "A shared or system mailbox (`info@`, `admin@`, `noreply@`…) rather than a person.",
        },
      ],
    });
  });

  test("portal settings carry only the settings", async () => {
    const response = await call(hookSettings.GET, "/hooks/settings");
    expect(await response.json()).toEqual({
      allowed_origins: ["https://app.example.com"],
      display_name: "Acme",
      accent_color: "#2563eb",
      theme: "dark",
    });
  });
});
