import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  DedicatedIpsResponse,
  MobileErrorBody,
  MobileSmsSuppression,
  Page,
  SmsSendersResponse,
} from "@coss/companion";

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
const environmentLookups: unknown[] = [];
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
  getEnvironment: async (input: unknown) => {
    environmentLookups.push(input);
    return environmentFound;
  },
  listProjectsWithEnvironments: async ({ organizationId }: { organizationId: string }) => {
    reads.push(["projects", organizationId]);
    return [
      {
        project: { id: "proj_1", name: "Default", slug: "default" },
        environments: [
          { id: "env_live", name: "Production", slug: "production", mode: "live" },
          { id: "env_sandbox", name: "Development", slug: "development", mode: "sandbox" },
        ],
      },
    ];
  },
}));

const reads: [string, unknown][] = [];
const at = new Date("2026-10-01T00:00:00Z");
const registration = (overrides: Record<string, unknown>) => ({
  id: "smsreg_1",
  organizationId: "org_1",
  kind: "us_10dlc",
  status: "approved",
  step: "done",
  brandType: "standard",
  profile: {
    legalName: "Acme Inc.",
    companyType: "PRIVATE_PROFIT",
    taxId: "12-3456789",
    taxIdType: "EIN",
    industry: "TECHNOLOGY",
    website: "https://acme.test",
    street: "1 Main St",
    city: "Springfield",
    region: "IL",
    postalCode: "62701",
    country: "US",
    contact: {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@acme.test",
      phone: "+14155550100",
      title: "CTO",
      jobPosition: "Engineering",
    },
  },
  campaign: {
    useCase: "2FA",
    description: "Sign-in codes",
    messageFlow: "Users opt in at sign-up",
    samples: ["Your code is 123456"],
    hasEmbeddedLinks: false,
    hasEmbeddedPhone: false,
  },
  customerProfileSid: "BUsecretprofile",
  trustProductSid: "BUsecrettrust",
  brandSid: "BNsecretbrand",
  messagingServiceSid: "MGsecretservice",
  campaignSid: "CMsecretcampaign",
  tollFreeVerificationSid: null,
  numberId: null,
  rejectionReason: null,
  nextCheckAt: null,
  nextFeeAt: null,
  submittedAt: at,
  approvedAt: at,
  createdAt: at,
  updatedAt: at,
  ...overrides,
});
const number = (overrides: Record<string, unknown>) => ({
  id: "num_1",
  organizationId: "org_1",
  phoneNumber: "+14155550123",
  kind: "local",
  country: "US",
  provider: "twilio",
  providerSid: "PNsecretnumber",
  status: "active",
  registrationId: "smsreg_1",
  receivingEnvironmentId: "env_live",
  nextFeeAt: null,
  createdAt: at,
  updatedAt: at,
  ...overrides,
});
let numbers: unknown[] = [];
let registrations: unknown[] = [];

const smsModule = await import("@coss/sms");
mock.module("@coss/sms", () => ({
  ...smsModule,
  listSmsNumbersWithSendability: async (organizationId: string) => {
    reads.push(["numbers", organizationId]);
    return numbers;
  },
  listSmsRegistrations: async (organizationId: string) => {
    reads.push(["registrations", organizationId]);
    return registrations;
  },
  getSmsAccount: async (organizationId: string) => {
    reads.push(["account", organizationId]);
    return {
      organizationId,
      provider: "twilio",
      subaccountSid: "ACsecretsubaccount",
      authToken: "encrypted-secret-token",
      status: "active",
      allowedCountries: ["GB", "US"],
      unlockedCountries: [],
      createdAt: at,
      updatedAt: at,
    };
  },
  listSmsSuppressions: async (input: unknown) => {
    reads.push(["suppressions", input]);
    return {
      data: [
        {
          object: "sms_suppression",
          id: "smssup_1",
          phone_number: "+14155550199",
          reason: "opt_out",
          sms_id: "sms_1",
          created_at: "2026-10-01T00:00:00.000Z",
        },
      ],
      hasMore: true,
    };
  },
}));
let provisioningEnabled = true;
mock.module("@/lib/sms", () => ({ smsProvisioningEnabled: () => provisioningEnabled }));

let poolStatus = "warming";
mock.module("@coss/email", () => ({
  READY_MIN_DELIVERIES: 1_000,
  dedicatedIpPoolObject: async (organizationId: string) => {
    reads.push(["pool", organizationId]);
    return poolStatus === "not_enabled"
      ? {
          object: "dedicated_ip_pool",
          status: "not_enabled",
          ips: [],
          dedicated_share: null,
          message: null,
          created_at: null,
          ready_at: null,
        }
      : {
          object: "dedicated_ip_pool",
          status: poolStatus,
          ips: [{ ip: "198.51.100.10", delivered_7d: 18_420 }],
          dedicated_share: 0.72,
          message: null,
          created_at: "2026-10-12T09:31:00.000Z",
          ready_at: null,
        };
  },
}));
mock.module("@/lib/rate-limit-runtime", () => ({
  rateLimitRuntime: () => ({
    limiter: { consume: async () => ({ allowed: true, retryAfterMs: 0 }) },
  }),
}));

const smsSenders = await import("../src/app/api/mobile/v1/orgs/[orgSlug]/sms/route");
const dedicatedIps = await import("../src/app/api/mobile/v1/orgs/[orgSlug]/dedicated-ips/route");
const smsSuppressions = await import(
  "../src/app/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/sms/suppressions/route"
);

function request(path: string): Request {
  return new Request(`http://localhost:3000${path}`, {
    headers: { authorization: `Bearer ${GOOD_TOKEN}` },
  });
}

const orgContext = { params: Promise.resolve({ orgSlug: "acme" }) };
const envContext = {
  params: Promise.resolve({ orgSlug: "acme", projectSlug: "default", envSlug: "production" }),
};

const SECRETS = [
  "PNsecretnumber",
  "BNsecretbrand",
  "MGsecretservice",
  "CMsecretcampaign",
  "BUsecret",
  "ACsecretsubaccount",
  "encrypted-secret-token",
  "12-3456789",
  "ada@acme.test",
  "Sign-in codes",
];

beforeEach(() => {
  role = "member";
  reads.length = 0;
  environmentLookups.length = 0;
  environmentFound = { project: { id: "proj_1" }, environment: { id: "env_live" } };
  provisioningEnabled = true;
  poolStatus = "warming";
  numbers = [
    { number: number({}), registration: registration({}), canSend: true },
    {
      number: number({
        id: "num_2",
        phoneNumber: "+18005550100",
        kind: "toll_free",
        status: "pending",
        registrationId: "smsreg_2",
        receivingEnvironmentId: "env_sandbox",
      }),
      registration: registration({ id: "smsreg_2", kind: "toll_free", status: "in_review" }),
      canSend: false,
    },
    {
      number: number({
        id: "num_3",
        phoneNumber: "+14155550124",
        registrationId: null,
        receivingEnvironmentId: null,
      }),
      registration: null,
      canSend: false,
    },
  ];
  registrations = [
    registration({}),
    registration({
      id: "smsreg_2",
      kind: "toll_free",
      status: "rejected",
      rejectionReason: "The opt-in proof isn't public.",
      submittedAt: null,
    }),
  ];
});

describe("mobile organization SMS", () => {
  test("numbers, registrations and countries, read for the member's organization only", async () => {
    const response = await smsSenders.GET(request("/api/mobile/v1/orgs/acme/sms"), orgContext);
    expect(response.status).toBe(200);
    const text = await response.text();
    for (const secret of SECRETS) expect(text).not.toContain(secret);
    const body = JSON.parse(text) as SmsSendersResponse;
    expect(body.notice).toBeNull();
    expect(body.can_create).toBe(false);
    expect(body.numbers).toEqual([
      {
        id: "num_1",
        phone_number: "+14155550123",
        kind: "local",
        sending: "can_send",
        replies_to: "Default / Production",
      },
      {
        id: "num_2",
        phone_number: "+18005550100",
        kind: "toll_free",
        sending: "setting_up",
        // Replies only go to live environments: the dashboard shows the rest as dropped.
        replies_to: null,
      },
      {
        id: "num_3",
        phone_number: "+14155550124",
        kind: "local",
        sending: "not_registered",
        replies_to: null,
      },
    ]);
    expect(body.registrations).toEqual([
      {
        id: "smsreg_1",
        kind: "us_10dlc",
        business: "Acme Inc.",
        status: "approved",
        rejection_reason: null,
        submitted_at: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "smsreg_2",
        kind: "toll_free",
        business: "Acme Inc.",
        status: "rejected",
        rejection_reason: "The opt-in proof isn't public.",
        submitted_at: null,
      },
    ]);
    expect(body.countries.length).toBeGreaterThan(0);
    for (const country of body.countries) {
      expect(Object.keys(country).sort()).toEqual(["allowed", "code", "locked", "name", "price"]);
      expect(country.allowed).toBe(country.code === "GB" || country.code === "US");
    }
    expect(body.countries.find((country) => country.code === "US")).toMatchObject({
      name: "United States",
      allowed: true,
      locked: false,
    });
    expect(Object.keys(body).sort()).toEqual([
      "can_create",
      "countries",
      "notice",
      "numbers",
      "registrations",
    ]);
    expect(reads).toEqual(
      expect.arrayContaining([
        ["numbers", "org_1"],
        ["registrations", "org_1"],
        ["account", "org_1"],
        ["projects", "org_1"],
      ]),
    );
    expect(reads).toHaveLength(4);
  });

  test("the page's alerts and who may register senders", async () => {
    role = "owner";
    registrations = [registration({ status: "failed" })];
    const unregistered = (await (
      await smsSenders.GET(request("/api/mobile/v1/orgs/acme/sms"), orgContext)
    ).json()) as SmsSendersResponse;
    expect(unregistered.notice).toBe("register_10dlc");
    expect(unregistered.can_create).toBe(true);

    provisioningEnabled = false;
    const unavailable = (await (
      await smsSenders.GET(request("/api/mobile/v1/orgs/acme/sms"), orgContext)
    ).json()) as SmsSendersResponse;
    expect(unavailable.notice).toBe("unavailable");
    expect(unavailable.can_create).toBe(false);
  });

  test("roles without smsSender:read get a 403", async () => {
    role = "guest";
    const response = await smsSenders.GET(request("/api/mobile/v1/orgs/acme/sms"), orgContext);
    expect(response.status).toBe(403);
    expect(((await response.json()) as MobileErrorBody).error.code).toBe("forbidden");
    expect(reads).toHaveLength(0);
  });
});

describe("mobile SMS suppressions", () => {
  test("a cursor page of the environment's suppressions, scoped to its organization", async () => {
    const response = await smsSuppressions.GET(
      request(
        "/api/mobile/v1/orgs/acme/projects/default/environments/production/sms/suppressions?after=smssup_0",
      ),
      envContext,
    );
    expect(response.status).toBe(200);
    expect((await response.json()) as Page<MobileSmsSuppression>).toEqual({
      data: [
        {
          id: "smssup_1",
          phone_number: "+14155550199",
          reason: "opt_out",
          created_at: "2026-10-01T00:00:00.000Z",
        },
      ],
      next_cursor: "smssup_1",
    });
    expect(environmentLookups).toEqual([
      { organizationId: "org_1", projectSlug: "default", envSlug: "production" },
    ]);
    expect(reads).toEqual([
      [
        "suppressions",
        { organizationId: "org_1", environmentId: "env_live", limit: 50, after: "smssup_0" },
      ],
    ]);
  });

  test("an environment of another organization is not found", async () => {
    environmentFound = null;
    const response = await smsSuppressions.GET(
      request("/api/mobile/v1/orgs/acme/projects/default/environments/production/sms/suppressions"),
      envContext,
    );
    expect(response.status).toBe(404);
    expect(reads).toHaveLength(0);
  });

  test("roles without smsSuppression:read get a 403", async () => {
    role = "guest";
    const response = await smsSuppressions.GET(
      request("/api/mobile/v1/orgs/acme/projects/default/environments/production/sms/suppressions"),
      envContext,
    );
    expect(response.status).toBe(403);
    expect(reads).toHaveLength(0);
  });
});

describe("mobile dedicated IPs", () => {
  test("the pool for the member's organization; billing links only for billing readers", async () => {
    const response = await dedicatedIps.GET(
      request("/api/mobile/v1/orgs/acme/dedicated-ips"),
      orgContext,
    );
    expect(response.status).toBe(200);
    expect((await response.json()) as DedicatedIpsResponse).toEqual({
      status: "warming",
      message: null,
      ips: [{ ip: "198.51.100.10", delivered_7d: 18_420 }],
      dedicated_share: 0.72,
      ready_min_deliveries: 1_000,
      ready_at: null,
      add_on: { monthly_price: "$50.00", plans: ["Scale", "Enterprise"] },
      can_read_billing: false,
    });
    expect(reads).toEqual([["pool", "org_1"]]);

    role = "admin";
    poolStatus = "not_enabled";
    const admin = (await (
      await dedicatedIps.GET(request("/api/mobile/v1/orgs/acme/dedicated-ips"), orgContext)
    ).json()) as DedicatedIpsResponse;
    expect(admin.status).toBe("not_enabled");
    expect(admin.can_read_billing).toBe(true);
  });

  test("roles without domain:read get a 403", async () => {
    role = "guest";
    const response = await dedicatedIps.GET(
      request("/api/mobile/v1/orgs/acme/dedicated-ips"),
      orgContext,
    );
    expect(response.status).toBe(403);
    expect(reads).toHaveLength(0);
  });
});
