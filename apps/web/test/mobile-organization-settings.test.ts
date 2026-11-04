import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  DmarcReportResponse,
  DmarcReportsResponse,
  MobileErrorBody,
  OrganizationSettingsResponse,
  PlansResponse,
  ScimSettingsResponse,
  SsoSettingsResponse,
} from "@coss/companion";

// The iOS app's organization settings (general, SSO, directory sync), plans and DMARC reports.

mock.module("server-only", () => ({}));
mock.module("@sentry/nextjs", () => ({ setTag: () => {}, setUser: () => {} }));

const GOOD_TOKEN = "good-token";
const user = {
  id: "user_1",
  name: "Ada",
  email: "ada@example.com",
  image: null,
  twoFactorEnabled: true,
};
let sessionSsoProviderId: string | null = null;
mock.module("@coss/auth", () => ({
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) =>
        headers.get("cookie") === `session=${GOOD_TOKEN}`
          ? {
              user,
              session: {
                id: "session_1",
                ssoProviderId: sessionSsoProviderId,
                impersonatedBy: null,
              },
            }
          : null,
    },
  },
}));
mock.module("@coss/auth/mobile", () => ({
  mobileSessionHeaders: async (token: string) =>
    token === GOOD_TOKEN ? new Headers({ cookie: `session=${token}` }) : null,
}));
mock.module("@/lib/rate-limit-runtime", () => ({
  rateLimitRuntime: () => ({
    clientIp: () => "203.0.113.9",
    limiter: { consume: async () => ({ allowed: true, retryAfterMs: 0 }) },
  }),
}));
mock.module("@/env", () => ({ env: { BETTER_AUTH_URL: "https://coss.test" } }));
const planHas = mock(async () => false);
mock.module("@/lib/billing", () => ({ planHas }));
mock.module("@/lib/email-runtime", () => ({
  emailRuntime: () => ({ domainDeps: { dmarcReportDomain: "inbound.coss.test" } }),
}));

const ORG_ID = "org_1";
let membership: {
  organization: {
    id: string;
    name: string;
    slug: string;
    requireSso: boolean;
    requireTwoFactor: boolean;
  };
  member: { role: string };
  suspended: boolean;
  ssoProviderId: string | null;
} | null = null;

function member(role: string) {
  return {
    organization: {
      id: ORG_ID,
      name: "Acme",
      slug: "acme",
      requireSso: false,
      requireTwoFactor: true,
    },
    member: { role },
    suspended: false,
    ssoProviderId: "sso_acme",
  };
}

const scopes: { fn: string; organizationId: string }[] = [];
function scoped(fn: string, input: { organizationId: string }) {
  scopes.push({ fn, organizationId: input.organizationId });
}

const PROVIDER = {
  id: "ssop_1",
  providerId: "sso_acme",
  type: "oidc" as const,
  issuer: "https://idp.example.com",
  domains: ["acme.com"],
  unverifiedDomains: [],
  domainVerified: true,
  active: true,
  // A secret the wire mapping must drop even if the object carried one.
  oidc: { clientId: "client-123", discoveryEndpoint: null, clientSecret: "shh-oidc-secret" },
  saml: null,
};
const SCIM = {
  connectionId: "scimconn_secret",
  status: "active" as const,
  createdAt: new Date("2026-09-01T00:00:00Z"),
  credentials: [
    {
      credentialId: "scimcred_secret_1",
      status: "active" as const,
      expiresAt: new Date("2027-09-01T00:00:00Z"),
      lastUsedAt: new Date("2026-10-18T10:00:00Z"),
      createdAt: new Date("2026-09-01T00:00:00Z"),
    },
    {
      credentialId: "scimcred_secret_2",
      status: "expired" as const,
      expiresAt: new Date("2026-09-30T00:00:00Z"),
      lastUsedAt: new Date("2026-09-29T00:00:00Z"),
      createdAt: new Date("2026-08-01T00:00:00Z"),
    },
  ],
  activeUsers: 12,
  inactiveUsers: 2,
  groups: 3,
  deactivatedOwners: [{ userId: "user_9", email: "former@acme.com" }],
};
let hipaaMode: { enabledAt: Date; baaSignedAt: Date; baaReference: string } | null = null;
const complianceModule = await import("@coss/compliance");
mock.module("@coss/compliance", () => ({
  ...complianceModule,
  getHipaaMode: async () => hipaaMode,
}));
const tenancyModule = await import("@coss/tenancy");
mock.module("@coss/tenancy", () => ({
  ...tenancyModule,
  getMembership: async () => membership,
  getEnvironment: async () => null,
  listOrganizationMembers: async (input: { organizationId: string }) => {
    scoped("listOrganizationMembers", input);
    return [
      { id: "mem_1", role: "owner", user: { id: "user_1", twoFactorEnabled: true } },
      { id: "mem_2", role: "member", user: { id: "user_2", twoFactorEnabled: false } },
    ];
  },
  readOrganizationApiVersion: async (input: { organizationId: string }) => {
    scoped("readOrganizationApiVersion", input);
    return null;
  },
  hasScimConnection: async (input: { organizationId: string }) => {
    scoped("hasScimConnection", input);
    return true;
  },
  getOrganizationSsoProvider: async (input: { organizationId: string }) => {
    scoped("getOrganizationSsoProvider", input);
    return PROVIDER;
  },
  listSsoLinkedMemberIds: async (input: { organizationId: string }) => {
    scoped("listSsoLinkedMemberIds", input);
    return new Set(["mem_1"]);
  },
  listOwnersWithoutPassword: async (input: { organizationId: string }) => {
    scoped("listOwnersWithoutPassword", input);
    return [{ userId: "user_3", email: "owner@acme.com" }];
  },
  userHasPassword: async () => true,
  getOrganizationScim: async (input: { organizationId: string }) => {
    scoped("getOrganizationScim", input);
    return SCIM;
  },
  listScimGroupRoles: async (input: { organizationId: string }) => {
    scoped("listScimGroupRoles", input);
    return [{ groupName: "engineering", role: "admin" }];
  },
  listScimEvents: async (input: { organizationId: string }) => {
    scoped("listScimEvents", input);
    return [
      {
        sequence: 2,
        type: "credential.issued",
        actorId: "user_1",
        actorEmail: "ada@example.com",
        credentialId: "scimcred_secret_1",
        createdAt: new Date("2026-09-01T00:00:00Z"),
      },
    ];
  },
}));

const billingModule = await import("@coss/billing");
mock.module("@coss/billing", () => ({
  ...billingModule,
  billingStateAt: async (organizationId: string) => {
    scopes.push({ fn: "billingStateAt", organizationId });
    return { terms: { plan: "pro" }, contract: null };
  },
  scheduledManagedContract: async () => null,
}));

const DOMAIN = { id: "dom_1", name: "acme.com", status: "verified", organizationId: ORG_ID };
const DMARC = {
  object: "domain_dmarc",
  domain_id: "dom_1",
  report_address: "dmarc-token@inbound.coss.test",
  record: {
    value: "v=DMARC1; p=none; rua=mailto:dmarc-token@inbound.coss.test",
    p: "none",
    sp: null,
    np: null,
    adkim: null,
    aspf: null,
    pct: null,
    t: null,
    rua: ["mailto:dmarc-token@inbound.coss.test"],
  },
  policy: "none",
  inherited_from: null,
  policy_since: "2026-09-20T08:00:00.000Z",
  stage: "monitoring",
  partial: false,
  reporting: true,
  ready: true,
  next: {
    kind: "tighten",
    policy: "quarantine",
    record: "v=DMARC1; p=quarantine; rua=mailto:dmarc-token@inbound.coss.test",
  },
  checks: [{ id: "coss_pass_rate", ok: true, message: "100% passes." }],
  warnings: [],
  report_summary: {
    period_start: "2026-10-05T00:00:00.000Z",
    period_end: "2026-10-19T00:00:00.000Z",
    reports: 2,
    messages: 100,
    passing: 98,
    coss_messages: 90,
    coss_passing: 90,
    first_report_at: null,
    last_report_at: null,
    sources: [
      {
        source_ip: "54.240.8.12",
        header_from: "acme.com",
        messages: 90,
        passing: 90,
        via_coss: true,
      },
    ],
  },
};
const REPORT_SUMMARY = {
  object: "dmarc_report",
  id: "dmarcrep_1",
  domain_id: "dom_1",
  reporter: { org_name: "google.com", email: "noreply-dmarc-support@google.com" },
  report_id: "1384502",
  period_start: "2026-10-09T00:00:00.000Z",
  period_end: "2026-10-09T23:59:59.000Z",
  policy_published: {
    domain: "acme.com",
    p: "none",
    sp: "reject",
    np: null,
    adkim: "r",
    aspf: "r",
    pct: 50,
    testing: null,
  },
  messages: 300,
  passing: 290,
  truncated: false,
  received_at: "2026-10-10T03:12:44.000Z",
};
const RECORD = {
  source_ip: "54.240.8.12",
  count: 1,
  disposition: "none",
  dkim: "pass",
  spf: "fail",
  dmarc_pass: true,
  header_from: "acme.com",
  envelope_from: "send.acme.com",
  via_coss: true,
  auth_results: {
    dkim: [{ domain: "acme.com", selector: "secret-selector", result: "pass" }],
    spf: [],
  },
  reasons: [{ type: "forwarded", comment: null }],
};
const emailModule = await import("@coss/email");
const dmarcReportCalls: unknown[] = [];
mock.module("@coss/email", () => ({
  ...emailModule,
  getDomain: async (input: { organizationId: string; id: string }) => {
    scoped("getDomain", input);
    return input.organizationId === ORG_ID && input.id === DOMAIN.id ? DOMAIN : null;
  },
  dmarcOverview: async () => DMARC,
  listDmarcReports: async (input: unknown) => {
    dmarcReportCalls.push(input);
    return { data: [REPORT_SUMMARY], hasMore: true };
  },
  getDmarcReport: async (input: { organizationId: string; domainId: string; id: string }) => {
    dmarcReportCalls.push(input);
    if (input.id !== REPORT_SUMMARY.id) return null;
    return { ...REPORT_SUMMARY, records: Array.from({ length: 250 }, () => RECORD) };
  },
}));

const BASE = "../src/app/api/mobile/v1/orgs/[orgSlug]";
const settings = await import(`${BASE}/settings/route`);
const sso = await import(`${BASE}/settings/sso/route`);
const scim = await import(`${BASE}/settings/scim/route`);
const plans = await import(`${BASE}/billing/plans/route`);
const dmarc = await import(`${BASE}/domains/[domainId]/dmarc/route`);
const dmarcReports = await import(`${BASE}/domains/[domainId]/dmarc/reports/route`);
const dmarcReport = await import(`${BASE}/domains/[domainId]/dmarc/reports/[reportId]/route`);

function request(path: string): Request {
  return new Request(`http://localhost:3000/api/mobile/v1${path}`, {
    headers: { authorization: `Bearer ${GOOD_TOKEN}` },
  });
}

function params<T extends Record<string, string>>(values: T) {
  return { params: Promise.resolve({ orgSlug: "acme", ...values }) };
}

async function errorOf(response: Response) {
  return ((await response.json()) as MobileErrorBody).error;
}

beforeEach(() => {
  membership = member("owner");
  sessionSsoProviderId = null;
  scopes.length = 0;
  dmarcReportCalls.length = 0;
  planHas.mockClear();
});

function expectScopedToOrg() {
  expect(scopes.length).toBeGreaterThan(0);
  for (const call of scopes) expect(call.organizationId).toBe(ORG_ID);
}

describe("general settings", () => {
  test("every member may read them; SSO and SCIM only with their permissions", async () => {
    membership = member("member");
    const response = await settings.GET(request("/orgs/acme/settings"), params({}));
    expect(response.status).toBe(200);
    const body = (await response.json()) as OrganizationSettingsResponse;
    expect(body).toEqual({
      organization: { id: ORG_ID, name: "Acme", slug: "acme" },
      can_update: false,
      two_factor: { required: true, members_without: 1, members: 2, you: true },
      sso: null,
      scim: null,
      api_version: { pinned: null, latest: body.api_version.latest },
      hipaa_mode: null,
      can: { read_billing: false, read_sso: false, read_scim: false, read_audit: false },
    });
    expect(scopes.some((call) => call.fn === "hasScimConnection")).toBe(false);
    expectScopedToOrg();
  });

  test("HIPAA mode is shown with its agreement", async () => {
    hipaaMode = {
      enabledAt: new Date("2026-11-03T00:00:00Z"),
      baaSignedAt: new Date("2026-10-30T00:00:00Z"),
      baaReference: "BAA-2026-014",
    };
    const response = await settings.GET(request("/orgs/acme/settings"), params({}));
    hipaaMode = null;
    const body = (await response.json()) as OrganizationSettingsResponse;
    expect(body.hipaa_mode).toEqual({
      enabled_at: "2026-11-03T00:00:00.000Z",
      baa_signed_at: "2026-10-30T00:00:00.000Z",
      baa_reference: "BAA-2026-014",
    });
  });

  test("owners see the SSO requirement, the directory and every tab", async () => {
    const response = await settings.GET(request("/orgs/acme/settings"), params({}));
    const body = (await response.json()) as OrganizationSettingsResponse;
    expect(body.can_update).toBe(true);
    expect(body.sso).toEqual({ required: false });
    expect(body.scim).toEqual({ connected: true });
    expect(body.can).toEqual({
      read_billing: true,
      read_sso: true,
      read_scim: true,
      read_audit: true,
    });
  });

  test("non-members get a 404", async () => {
    membership = null;
    const response = await settings.GET(request("/orgs/acme/settings"), params({}));
    expect(response.status).toBe(404);
  });
});

describe("single sign-on", () => {
  test("members can't read it", async () => {
    membership = member("member");
    const response = await sso.GET(request("/orgs/acme/settings/sso"), params({}));
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("forbidden");
    expect(scopes).toHaveLength(0);
  });

  test("admins get the provider and setup values, never a secret, and no requirement", async () => {
    membership = member("admin");
    const response = await sso.GET(request("/orgs/acme/settings/sso"), params({}));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("shh-oidc-secret");
    expect(text).not.toContain("discovery");
    const body = JSON.parse(text) as SsoSettingsResponse;
    expect(body).toEqual({
      provider: {
        type: "oidc",
        domains: ["acme.com"],
        unverified_domains: [],
        active: true,
        oidc: { issuer: "https://idp.example.com", client_id: "client-123" },
        saml: null,
        linked_members: 1,
      },
      members: 2,
      required: false,
      plan_allows: true,
      setup: {
        oidc_redirect_uri: "https://coss.test/api/auth/sso/callback/sso_acme",
        saml_acs_url: null,
        saml_entity_id: null,
        saml_metadata_url: null,
      },
      requirement: null,
    });
    expectScopedToOrg();
  });

  test("owners see what requiring SSO needs", async () => {
    sessionSsoProviderId = "sso_acme";
    const response = await sso.GET(request("/orgs/acme/settings/sso"), params({}));
    const body = (await response.json()) as SsoSettingsResponse;
    expect(body.requirement).toEqual({
      active_provider: true,
      signed_in_with_sso: true,
      has_password: true,
      owners_without_password: ["owner@acme.com"],
    });
  });
});

describe("directory sync", () => {
  test("members can't read it", async () => {
    membership = member("member");
    const response = await scim.GET(request("/orgs/acme/settings/scim"), params({}));
    expect(response.status).toBe(403);
    expect(scopes).toHaveLength(0);
  });

  test("the connection's counts, token dates and mappings, never a token or its id", async () => {
    const response = await scim.GET(request("/orgs/acme/settings/scim"), params({}));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("scimcred_");
    expect(text).not.toContain("scimconn_");
    const body = JSON.parse(text) as ScimSettingsResponse;
    expect(body).toEqual({
      directory: {
        status: "active",
        connected_at: "2026-09-01T00:00:00.000Z",
        active_users: 12,
        inactive_users: 2,
        groups: 3,
        last_sync_at: "2026-10-18T10:00:00.000Z",
        deactivated_owners: ["former@acme.com"],
      },
      plan_allows: true,
      sso_active: true,
      can_update: true,
      base_url: "https://coss.test/api/auth/scim/v2",
      tokens: [
        {
          status: "active",
          created_at: "2026-09-01T00:00:00.000Z",
          expires_at: "2027-09-01T00:00:00.000Z",
          last_used_at: "2026-10-18T10:00:00.000Z",
        },
        {
          status: "expired",
          created_at: "2026-08-01T00:00:00.000Z",
          expires_at: "2026-09-30T00:00:00.000Z",
          last_used_at: "2026-09-29T00:00:00.000Z",
        },
      ],
      group_roles: [{ group: "engineering", role: "admin" }],
      events: [
        {
          id: 2,
          label: "Created a token",
          actor: "ada@example.com",
          created_at: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    expect(planHas).not.toHaveBeenCalled();
    expectScopedToOrg();
  });
});

describe("plans", () => {
  test("members can't read billing", async () => {
    membership = member("member");
    const response = await plans.GET(request("/orgs/acme/billing/plans"), params({}));
    expect(response.status).toBe(403);
  });

  test("admins read the plans with the current one marked; only owners manage", async () => {
    membership = member("admin");
    const response = await plans.GET(request("/orgs/acme/billing/plans"), params({}));
    expect(response.status).toBe(200);
    const body = (await response.json()) as PlansResponse;
    expect(body.plans.map((plan) => [plan.key, plan.current])).toEqual([
      ["free", false],
      ["pro", true],
      ["scale", false],
      ["enterprise", false],
    ]);
    expect(body.plans[0]?.price).toBe("$0");
    expect(body.managed_note).toBeNull();
    expect(body.can_manage).toBe(false);
    for (const row of body.includes) expect(row.cells).toHaveLength(4);
    expect(body.includes.at(-1)?.label).toBe("Recipients per second");
    expect(body.usage_prices.length).toBeGreaterThan(0);
    expectScopedToOrg();

    membership = member("owner");
    const owner = (await (
      await plans.GET(request("/orgs/acme/billing/plans"), params({}))
    ).json()) as PlansResponse;
    expect(owner.can_manage).toBe(true);
  });
});

describe("DMARC", () => {
  test("members with domain:read get the overview", async () => {
    membership = member("member");
    const response = await dmarc.GET(
      request("/orgs/acme/domains/dom_1/dmarc"),
      params({ domainId: "dom_1" }),
    );
    expect(response.status).toBe(200);
    // Untyped: the fixture's literals are wider than the wire type's unions.
    const body: unknown = await response.json();
    expect(body).toEqual({
      domain: { id: "dom_1", name: "acme.com", status: "verified" },
      report_address: "dmarc-token@inbound.coss.test",
      record: "v=DMARC1; p=none; rua=mailto:dmarc-token@inbound.coss.test",
      policy: "none",
      inherited_from: null,
      policy_since: "2026-09-20T08:00:00.000Z",
      stage: "monitoring",
      partial: false,
      reporting: true,
      ready: true,
      next: DMARC.next,
      checks: DMARC.checks,
      warnings: [],
      summary: {
        window_days: emailModule.DMARC_READINESS.windowDays,
        messages: 100,
        passing: 98,
        coss_messages: 90,
        coss_passing: 90,
        sources: DMARC.report_summary.sources,
      },
      days_at_quarantine: emailModule.DMARC_READINESS.daysAtQuarantine,
    });
    expectScopedToOrg();
  });

  test("another organization's domain is a 404", async () => {
    const response = await dmarc.GET(
      request("/orgs/acme/domains/dom_other/dmarc"),
      params({ domainId: "dom_other" }),
    );
    expect(response.status).toBe(404);
    const reports = await dmarcReports.GET(
      request("/orgs/acme/domains/dom_other/dmarc/reports"),
      params({ domainId: "dom_other" }),
    );
    expect(reports.status).toBe(404);
    const report = await dmarcReport.GET(
      request("/orgs/acme/domains/dom_other/dmarc/reports/dmarcrep_1"),
      params({ domainId: "dom_other", reportId: "dmarcrep_1" }),
    );
    expect(report.status).toBe(404);
    expect(dmarcReportCalls).toHaveLength(0);
  });

  test("reports page by cursor, scoped to the organization and domain", async () => {
    const response = await dmarcReports.GET(
      request("/orgs/acme/domains/dom_1/dmarc/reports?after=dmarcrep_9"),
      params({ domainId: "dom_1" }),
    );
    const body = (await response.json()) as DmarcReportsResponse;
    expect(body).toEqual({
      data: [
        {
          id: "dmarcrep_1",
          reporter: "google.com",
          period_start: "2026-10-09T00:00:00.000Z",
          period_end: "2026-10-09T23:59:59.000Z",
          messages: 300,
          passing: 290,
          truncated: false,
          received_at: "2026-10-10T03:12:44.000Z",
        },
      ],
      next_cursor: "dmarcrep_1",
    });
    expect(dmarcReportCalls).toEqual([
      { organizationId: ORG_ID, domainId: "dom_1", limit: 20, after: "dmarcrep_9" },
    ]);
  });

  test("a report's rows, capped for the phone, without auth results", async () => {
    const response = await dmarcReport.GET(
      request("/orgs/acme/domains/dom_1/dmarc/reports/dmarcrep_1"),
      params({ domainId: "dom_1", reportId: "dmarcrep_1" }),
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("secret-selector");
    const body = JSON.parse(text) as DmarcReportResponse;
    expect(body.domain).toEqual({ id: "dom_1", name: "acme.com" });
    expect(body.report.policy_seen).toBe("p=none sp=reject pct=50");
    expect(body.report.record_count).toBe(250);
    expect(body.report.records).toHaveLength(200);
    expect(body.report.records[0]).toEqual({
      source_ip: "54.240.8.12",
      count: 1,
      header_from: "acme.com",
      envelope_from: "send.acme.com",
      dkim: "pass",
      spf: "fail",
      disposition: "none",
      reasons: [{ type: "forwarded", comment: null }],
      via_coss: true,
    });
    expect(dmarcReportCalls).toEqual([
      { organizationId: ORG_ID, domainId: "dom_1", id: "dmarcrep_1" },
    ]);

    const missing = await dmarcReport.GET(
      request("/orgs/acme/domains/dom_1/dmarc/reports/dmarcrep_2"),
      params({ domainId: "dom_1", reportId: "dmarcrep_2" }),
    );
    expect(missing.status).toBe(404);
  });
});
