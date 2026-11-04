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
              user: { id: "user_1", email: "ada@example.com", twoFactorEnabled: false },
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
    limiter: { consume: async () => ({ allowed: true, retryAfterMs: 0 }) },
  }),
}));

const at = (iso: string) => new Date(iso);
const TEMPLATE = {
  id: "etpl_1",
  organizationId: "org_1",
  projectId: "proj_1",
  environmentId: "env_1",
  sequence: 1,
  alias: "welcome",
  name: "Welcome",
  description: "Sent after sign-up",
  publishedVersion: 2,
  publishedAt: at("2026-10-02T00:00:00Z"),
  hasUnpublishedChanges: true,
  createdAt: at("2026-10-01T00:00:00Z"),
  updatedAt: at("2026-10-03T00:00:00Z"),
};
function version(number: number | null) {
  return {
    id: `etplv_${number ?? "draft"}`,
    organizationId: "org_1",
    templateId: TEMPLATE.id,
    version: number,
    defaultLocale: "en",
    variables: [
      { name: "first_name", type: "string", required: true, description: "Their first name" },
      {
        name: "items",
        type: "list",
        required: false,
        fields: [{ name: "title", type: "string", required: true }],
      },
      { name: "plan", type: "string", required: false, default: "free" },
    ],
    sampleVariables: number === null ? { first_name: "Ada" } : { first_name: 7 },
    revision: 4,
    hasUnpublishedChanges: number === null,
    publishedAt: number === null ? null : at("2026-10-02T00:00:00Z"),
    createdAt: at("2026-10-01T00:00:00Z"),
    updatedAt: at("2026-10-03T00:00:00Z"),
    contents: [
      {
        id: "etplc_de",
        organizationId: "org_1",
        versionId: "etplv_1",
        locale: "de",
        subject: "Hallo {{unknown}}",
        html: null,
        text: null,
      },
      {
        id: "etplc_en",
        organizationId: "org_1",
        versionId: "etplv_1",
        locale: "en",
        subject: "Hi {{first_name}}",
        html: '<p class="secret-html">Hi {{first_name}}</p>',
        text: "Hi {{first_name}}, you're on {{plan}}.",
      },
    ],
  };
}

const emailModule = await import("@coss/email");
const calls: unknown[] = [];
const notFound = () => new emailModule.EmailError("not_found", "Email template not found.");
mock.module("@coss/email", () => ({
  ...emailModule,
  pageEmailTemplates: async (scope: unknown, page: unknown) => {
    calls.push({ scope, page });
    return { templates: [TEMPLATE], hasMore: true };
  },
  getTemplateDraft: async (_scope: unknown, ref: string) => {
    if (ref !== TEMPLATE.id) throw notFound();
    return { template: TEMPLATE, draft: version(null) };
  },
  pageTemplateVersions: async (_scope: unknown, ref: string, page: unknown) => {
    if (ref !== TEMPLATE.id) throw notFound();
    calls.push({ page });
    return { template: TEMPLATE, versions: [version(2), version(1)], hasMore: true };
  },
  getTemplateVersion: async (_scope: unknown, ref: string, number: number) => {
    if (ref !== TEMPLATE.id) throw notFound();
    return { template: TEMPLATE, version: number <= 2 ? version(number) : null };
  },
  getStorageSettings: async (scope: unknown) => {
    calls.push({ scope });
    return { contentStorage: "discard", updatedAt: at("2026-10-04T00:00:00Z") };
  },
}));

const list = await import(
  "../src/app/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/templates/route"
);
const detail = await import(
  "../src/app/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/templates/[templateId]/route"
);
const versions = await import(
  "../src/app/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/templates/[templateId]/versions/route"
);
const versionDetail = await import(
  "../src/app/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/templates/[templateId]/versions/[version]/route"
);
const storage = await import(
  "../src/app/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/content-storage/route"
);

const ENV_PATH = "/api/mobile/v1/orgs/acme/projects/default/environments/production";

function request(path: string): Request {
  return new Request(`http://localhost:3000${ENV_PATH}${path}`, {
    headers: { authorization: `Bearer ${GOOD_TOKEN}` },
  });
}

function context<Extra extends Record<string, string> = Record<never, string>>(
  extra: Extra = {} as Extra,
) {
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
  environmentFound = { project: { id: "proj_1" }, environment: { id: "env_1" } };
  calls.length = 0;
});

describe("mobile templates", () => {
  test("lists templates in cursor pages", async () => {
    const response = await list.GET(request("/templates?after=etpl_0"), context());
    expect(response.status).toBe(200);
    expect(calls).toEqual([
      {
        scope: { organizationId: "org_1", environmentId: "env_1" },
        page: { limit: 50, after: "etpl_0" },
      },
    ]);
    expect(await response.json()).toEqual({
      data: [
        {
          id: "etpl_1",
          name: "Welcome",
          alias: "welcome",
          published_version: 2,
          has_unpublished_changes: true,
          updated_at: "2026-10-03T00:00:00.000Z",
        },
      ],
      next_cursor: "etpl_1",
    });
  });

  test("the draft: sources, previews and problems, never the HTML", async () => {
    const response = await detail.GET(
      request("/templates/etpl_1"),
      context({ templateId: "etpl_1" }),
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("secret-html");
    expect(text).not.toContain('"html"');
    const body = JSON.parse(text);
    expect(body.template).toEqual({
      id: "etpl_1",
      name: "Welcome",
      alias: "welcome",
      description: "Sent after sign-up",
      published_version: 2,
      has_unpublished_changes: true,
      updated_at: "2026-10-03T00:00:00.000Z",
    });
    expect(Object.keys(body.draft).sort()).toEqual([
      "contents",
      "default_locale",
      "problems",
      "revision",
      "sample_issues",
      "sample_variables",
      "variables",
    ]);
    expect(body.draft.variables).toEqual([
      {
        name: "first_name",
        type: "string",
        required: true,
        default: null,
        description: "Their first name",
        fields: [],
      },
      {
        name: "items",
        type: "list",
        required: false,
        default: null,
        description: null,
        fields: [{ name: "title", type: "string", required: true }],
      },
      {
        name: "plan",
        type: "string",
        required: false,
        default: "free",
        description: null,
        fields: [],
      },
    ]);
    expect(body.draft.sample_issues).toEqual([]);
    expect(body.draft.contents[1]).toEqual({
      locale: "en",
      subject: { ok: true, value: "Hi Ada" },
      text: { ok: true, value: "Hi Ada, you're on free." },
      has_html: true,
      subject_source: "Hi {{first_name}}",
      text_source: "Hi {{first_name}}, you're on {{plan}}.",
    });
    expect(body.draft.contents[0]).toMatchObject({
      locale: "de",
      subject_source: "Hallo {{unknown}}",
      text: null,
      has_html: false,
      text_source: null,
    });
    expect(body.draft.problems.length).toBeGreaterThan(0);
    expect(body.draft.problems[0]).toMatchObject({ locale: "de", field: "subject", line: 1 });
  });

  test("another environment's template is not found", async () => {
    const response = await detail.GET(
      request("/templates/etpl_other"),
      context({ templateId: "etpl_other" }),
    );
    expect(response.status).toBe(404);
    expect(await errorOf(response)).toMatchObject({
      code: "not_found",
      message: "Template not found.",
    });
    const versionsResponse = await versions.GET(
      request("/templates/etpl_other/versions"),
      context({ templateId: "etpl_other" }),
    );
    expect(versionsResponse.status).toBe(404);
    const versionResponse = await versionDetail.GET(
      request("/templates/etpl_other/versions/1"),
      context({ templateId: "etpl_other", version: "1" }),
    );
    expect(versionResponse.status).toBe(404);
  });

  test("an environment of another organization is not found", async () => {
    environmentFound = null;
    const response = await list.GET(request("/templates"), context());
    expect(response.status).toBe(404);
  });

  test("versions page by version number", async () => {
    const response = await versions.GET(
      request("/templates/etpl_1/versions?after=3"),
      context({ templateId: "etpl_1" }),
    );
    expect(calls).toEqual([{ page: { limit: 20, after: 3 } }]);
    expect(await response.json()).toEqual({
      template: { id: "etpl_1", name: "Welcome", published_version: 2 },
      data: [
        {
          version: 2,
          locales: ["de", "en"],
          variables: ["first_name", "items", "plan"],
          published_at: "2026-10-02T00:00:00.000Z",
        },
        {
          version: 1,
          locales: ["de", "en"],
          variables: ["first_name", "items", "plan"],
          published_at: "2026-10-02T00:00:00.000Z",
        },
      ],
      next_cursor: "1",
    });

    calls.length = 0;
    await versions.GET(
      request("/templates/etpl_1/versions?after=bogus"),
      context({ templateId: "etpl_1" }),
    );
    expect(calls).toEqual([{ page: { limit: 20, after: undefined } }]);
  });

  test("a published version: previews and variables, never the HTML or sources", async () => {
    const response = await versionDetail.GET(
      request("/templates/etpl_1/versions/2"),
      context({ templateId: "etpl_1", version: "2" }),
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("secret-html");
    const body = JSON.parse(text);
    expect(Object.keys(body.version).sort()).toEqual([
      "contents",
      "default_locale",
      "published_at",
      "sample_issues",
      "variables",
      "version",
    ]);
    expect(body.version.version).toBe(2);
    // The sample doesn't match: the issue is listed and what can be is still rendered (as the
    // dashboard's preview does: without the defaults).
    expect(body.version.sample_issues).toHaveLength(1);
    expect(body.version.sample_issues[0]).toStartWith("first_name: ");
    expect(body.version.contents[1]).toEqual({
      locale: "en",
      subject: { ok: true, value: "Hi 7" },
      text: { ok: true, value: "Hi 7, you're on ." },
      has_html: true,
    });

    for (const number of ["3", "abc", "1e3"]) {
      const missing = await versionDetail.GET(
        request(`/templates/etpl_1/versions/${number}`),
        context({ templateId: "etpl_1", version: number }),
      );
      expect(missing.status).toBe(404);
    }
  });

  test("roles without emailTemplate:read get a 403", async () => {
    role = "guest";
    for (const response of [
      await list.GET(request("/templates"), context()),
      await detail.GET(request("/templates/etpl_1"), context({ templateId: "etpl_1" })),
      await versions.GET(request("/templates/etpl_1/versions"), context({ templateId: "etpl_1" })),
      await versionDetail.GET(
        request("/templates/etpl_1/versions/2"),
        context({ templateId: "etpl_1", version: "2" }),
      ),
    ]) {
      expect(response.status).toBe(403);
      expect((await errorOf(response)).code).toBe("forbidden");
    }
  });
});

describe("mobile content storage", () => {
  test("the environment's setting and when it changed", async () => {
    const response = await storage.GET(request("/content-storage"), context());
    expect(response.status).toBe(200);
    expect(calls).toEqual([{ scope: { organizationId: "org_1", environmentId: "env_1" } }]);
    expect(await response.json()).toEqual({
      content_storage: "discard",
      updated_at: "2026-10-04T00:00:00.000Z",
    });
  });

  test("roles without environment:read get a 403", async () => {
    role = "guest";
    const response = await storage.GET(request("/content-storage"), context());
    expect(response.status).toBe(403);
  });
});
