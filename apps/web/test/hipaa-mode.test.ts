import { expect, mock, test } from "bun:test";

// Session guards and staff actions; what the mode does to data is tested in each package.
mock.module("server-only", () => ({}));
mock.module("@sentry/nextjs", () => ({ setTag: () => {}, setUser: () => {} }));

let membership: Record<string, unknown>;
let sessionState: { id: string; createdAt: Date; impersonatedBy: string | null };
let touch: "active" | "idle" = "active";
const touched: string[] = [];

const tenancyModule = await import("@coss/tenancy");
mock.module("@coss/tenancy", () => ({
  ...tenancyModule,
  getMembership: async () => membership,
  touchHipaaSession: async (session: { id: string }) => {
    touched.push(session.id);
    return touch;
  },
}));
mock.module("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({
        session: sessionState,
        user: { id: "user_1", twoFactorEnabled: true },
      }),
    },
    $context: Promise.resolve({}),
  },
}));
mock.module("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined }),
}));
const reactModule = await import("react");
mock.module("react", () => ({ ...reactModule, cache: <T>(fn: T) => fn }));
class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}
class NotFound extends Error {}
mock.module("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
  notFound: () => {
    throw new NotFound();
  },
  unstable_rethrow: () => {},
}));

const { requireOrgMember } = await import("../src/lib/session");

function organization(hipaaMode: boolean) {
  membership = {
    organization: {
      id: "org_1",
      slug: "clinic",
      requireTwoFactor: false,
      requireSso: false,
    },
    member: { id: "member_1", role: "owner" },
    suspended: false,
    hipaaMode,
    ssoProviderId: null,
  };
}

function session(id: string, impersonatedBy: string | null = null) {
  sessionState = { id, createdAt: new Date(), impersonatedBy };
}

test("activity in an organization in HIPAA mode is recorded", async () => {
  organization(true);
  session("session_active");
  touch = "active";
  await requireOrgMember("clinic");
  expect(touched).toContain("session_active");
});

test("an idle session goes to sign in", async () => {
  organization(true);
  session("session_idle");
  touch = "idle";
  const error = await requireOrgMember("clinic").catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(Redirected);
  expect((error as Redirected).to).toBe("/sign-in");
});

test("an impersonation that was already running can't open it", async () => {
  organization(true);
  session("session_staff", "user_admin");
  touch = "active";
  const error = await requireOrgMember("clinic").catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(NotFound);
});

test("other organizations track nothing", async () => {
  organization(false);
  session("session_elsewhere");
  await requireOrgMember("clinic");
  expect(touched).not.toContain("session_elsewhere");
});
