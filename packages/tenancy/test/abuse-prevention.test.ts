import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test";
import { auth } from "@coss/auth";
import { authOptions, MAX_OWNED_ORGANIZATIONS } from "@coss/auth/options";
import { db, schema } from "@coss/db";
import { uniqueSuffix } from "@coss/db/testing";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { captcha } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { addMember, createTestTenant, createTestUser } from "../src/testing.ts";

const BASE_URL = "http://localhost:3000";

/** Signs in and returns request headers carrying the session cookie. */
async function sessionHeaders(email: string, password: string): Promise<Headers> {
  const { headers } = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return new Headers({ cookie });
}

/** POSTs a JSON body to a Better Auth HTTP endpoint, the way the dashboard's client does. */
function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
  handler: (request: Request) => Promise<Response> = auth.handler,
): Promise<Response> {
  return handler(
    new Request(`${BASE_URL}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE_URL, ...headers },
      body: JSON.stringify(body),
    }),
  );
}

function signUpBody(email: string) {
  return { name: "Abuse Test", email, password: `pw-${uniqueSuffix()}-not-secret` };
}

// Sign-up sends a (console-logged) verification email.
let info: ReturnType<typeof spyOn>;
beforeEach(() => {
  info = spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  info.mockRestore();
});

describe("sign-up email guard", () => {
  test("refuses disposable addresses", async () => {
    const response = await post("/sign-up/email", signUpBody(`x-${uniqueSuffix()}@mailinator.com`));
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe("DISPOSABLE_EMAIL");
  });

  test("stores the canonical address and refuses a second account for the same mailbox", async () => {
    const local = `ada.${uniqueSuffix()}`;
    const first = await post("/sign-up/email", signUpBody(`${local}@coss.test`));
    expect(first.status).toBe(200);
    expect(first.headers.get("set-cookie")).toBeNull();
    const [user] = await db
      .select({ canonicalEmail: schema.user.canonicalEmail })
      .from(schema.user)
      .where(eq(schema.user.email, `${local}@coss.test`));
    expect(user?.canonicalEmail).toBe(`${local}@coss.test`);

    // Upper-casing is folded for every domain (Better Auth lower-cases emails too).
    const again = await post("/sign-up/email", signUpBody(`${local.toUpperCase()}@COSS.test`));
    expect(again.status).toBe(422);
  });

  test("folds Gmail dots and +tags", async () => {
    const suffix = uniqueSuffix().replaceAll(/[^a-z0-9]/gi, "");
    // An existing user, created server-side (no DNS check), whose mailbox is taken.
    await auth.api.createUser({
      body: { email: `ada${suffix}@gmail.com`, password: `pw-${suffix}-not-secret`, name: "Ada" },
    });
    const response = await post("/sign-up/email", signUpBody(`a.d.a${suffix}+coss@googlemail.com`));
    expect(response.status).toBe(422);
    expect(((await response.json()) as { code: string }).code).toBe(
      "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
    );
  });
  test("concurrent aliases across auth instances create only one account", async () => {
    const suffix = uniqueSuffix().replaceAll(/[^a-z0-9]/gi, "");
    const other = betterAuth(authOptions);
    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        post(
          "/sign-up/email",
          signUpBody(`race${suffix}+${i}@gmail.com`),
          {},
          i % 2 ? other.handler : auth.handler,
        ),
      ),
    );
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 422)).toHaveLength(11);
    const users = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.canonicalEmail, `race${suffix}@gmail.com`));
    expect(users).toHaveLength(1);
    // Trusted creation retains its exemption even for an existing canonical mailbox.
    await auth.api.createUser({ body: { ...signUpBody(`race${suffix}+trusted@gmail.com`) } });
  });

  test("a failed sign-up rolls back the account and releases its mailbox", async () => {
    const email = `retry-${uniqueSuffix()}@coss.test`;
    const failing = betterAuth({
      ...authOptions,
      databaseHooks: {
        ...authOptions.databaseHooks,
        user: {
          ...authOptions.databaseHooks.user,
          create: {
            before: async () => {
              throw new APIError("BAD_REQUEST", { message: "Injected user failure" });
            },
          },
        },
      },
    });
    expect((await post("/sign-up/email", signUpBody(email), {}, failing.handler)).status).toBe(400);
    expect(await db.select().from(schema.user).where(eq(schema.user.email, email))).toHaveLength(0);
    expect(
      await db.select().from(schema.authEmail).where(eq(schema.authEmail.to, email)),
    ).toHaveLength(0);
    expect((await post("/sign-up/email", signUpBody(email))).status).toBe(200);
  });
});

describe("invitations", () => {
  async function invite(tenant: Awaited<ReturnType<typeof createTestTenant>>, email: string) {
    return auth.api.createInvitation({
      headers: await sessionHeaders(tenant.owner.email, tenant.owner.password),
      body: { email, role: "member", organizationId: tenant.organization.id },
    });
  }

  test("can't be sent to disposable addresses", async () => {
    const tenant = await createTestTenant();
    await expect(invite(tenant, `x-${uniqueSuffix()}@mailinator.com`)).rejects.toThrow(
      /Disposable/,
    );
  });

  test("need an inviter with a verified email", async () => {
    const tenant = await createTestTenant({ emailVerified: false });
    await expect(invite(tenant, `x-${uniqueSuffix()}@coss.test`)).rejects.toThrow(/verif/i);
  });

  test("resends enforce verification and disposable-domain checks", async () => {
    const tenant = await createTestTenant();
    const email = `resend-${uniqueSuffix()}@coss.test`;
    const invitation = await invite(tenant, email);
    const headers = await sessionHeaders(tenant.owner.email, tenant.owner.password);
    const resend = (email: string) =>
      auth.api.createInvitation({
        headers,
        body: { email, role: "member", organizationId: tenant.organization.id, resend: true },
      });
    await db
      .update(schema.user)
      .set({ emailVerified: false })
      .where(eq(schema.user.id, tenant.owner.id));
    await expect(resend(email)).rejects.toThrow(/Verify/);
    await db
      .update(schema.user)
      .set({ emailVerified: true })
      .where(eq(schema.user.id, tenant.owner.id));
    const disposable = `resend-${uniqueSuffix()}@mailinator.com`;
    await db
      .update(schema.invitation)
      .set({ email: disposable })
      .where(eq(schema.invitation.id, invitation.id));
    await expect(resend(disposable)).rejects.toThrow(/Disposable/);
    await db
      .update(schema.invitation)
      .set({ email })
      .where(eq(schema.invitation.id, invitation.id));
    expect((await resend(email)).id).toBe(invitation.id);
  });

  test("the HTTP endpoint is disabled (the dashboard's action rate-limits invitations)", async () => {
    const tenant = await createTestTenant();
    const cookie = (await sessionHeaders(tenant.owner.email, tenant.owner.password)).get("cookie");
    const response = await post(
      "/organization/invite-member",
      {
        email: `x-${uniqueSuffix()}@coss.test`,
        role: "member",
        organizationId: tenant.organization.id,
      },
      { cookie: cookie ?? "" },
    );
    expect(response.status).toBe(404);
  });
});

describe("organization limit", () => {
  test(`a user owns at most ${MAX_OWNED_ORGANIZATIONS} organizations; memberships don't count`, async () => {
    const user = await createTestUser();
    // Being a member of other organizations doesn't use up the allowance.
    for (const role of ["admin", "member"] as const) {
      const other = await createTestTenant();
      await addMember({ organizationId: other.organization.id, userId: user.id, role });
    }
    const create = () => {
      const suffix = uniqueSuffix();
      return auth.api.createOrganization({
        body: { name: `Limit ${suffix}`, slug: `limit-${suffix}`, userId: user.id },
      });
    };
    for (let i = 0; i < MAX_OWNED_ORGANIZATIONS; i++) await create();
    await expect(create()).rejects.toThrow(/maximum number of organizations/);
  });

  test("concurrent creations across auth instances cannot exceed the ownership cap", async () => {
    const user = await createTestUser();
    const other = betterAuth(authOptions);
    const cookie = (await sessionHeaders(user.email, user.password)).get("cookie") ?? "";
    const results = await Promise.allSettled(
      Array.from({ length: 14 }, (_, i) => {
        const suffix = uniqueSuffix();
        const body = { name: `Race ${suffix}`, slug: `race-${suffix}`, userId: user.id };
        if (i % 2) return other.api.createOrganization({ body });
        return post("/organization/create", body, { cookie }).then(async (response) => {
          if (!response.ok)
            throw new Error(((await response.json()) as { message: string }).message);
          return response.json();
        });
      }),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(
      MAX_OWNED_ORGANIZATIONS,
    );
    const failures = results.filter((result) => result.status === "rejected");
    expect(failures).toHaveLength(14 - MAX_OWNED_ORGANIZATIONS);
    for (const failure of failures)
      expect(failure.reason.message).toMatch(/maximum number of organizations/);
    const owned = await db.select().from(schema.member).where(eq(schema.member.userId, user.id));
    expect(owned).toHaveLength(MAX_OWNED_ORGANIZATIONS);
  });

  test("a user's own limit replaces the default, and applies to a session already open", async () => {
    const user = await createTestUser();
    const cookie = (await sessionHeaders(user.email, user.password)).get("cookie") ?? "";
    const create = () => {
      const suffix = uniqueSuffix();
      return post(
        "/organization/create",
        { name: `Own ${suffix}`, slug: `own-${suffix}` },
        { cookie },
      );
    };
    for (let i = 0; i < MAX_OWNED_ORGANIZATIONS; i++) expect((await create()).ok).toBe(true);
    expect((await create()).ok).toBe(false);

    await db
      .update(schema.user)
      .set({ ownedOrganizationLimit: MAX_OWNED_ORGANIZATIONS + 1 })
      .where(eq(schema.user.id, user.id));
    expect((await create()).ok).toBe(true);
    expect((await create()).ok).toBe(false);
  });

  test("the limit can't be set by the user", async () => {
    const user = await createTestUser();
    const cookie = (await sessionHeaders(user.email, user.password)).get("cookie") ?? "";
    await post("/update-user", { ownedOrganizationLimit: 100 }, { cookie });
    const [row] = await db
      .select({ limit: schema.user.ownedOrganizationLimit })
      .from(schema.user)
      .where(eq(schema.user.id, user.id));
    expect(row?.limit).toBeNull();
  });

  test("platform admins are exempt", async () => {
    const admin = await createTestUser();
    await db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.id, admin.id));
    for (let i = 0; i <= MAX_OWNED_ORGANIZATIONS; i++) {
      const suffix = uniqueSuffix();
      await auth.api.createOrganization({
        body: { name: `Admin ${suffix}`, slug: `admin-${suffix}`, userId: admin.id },
      });
    }
  });
});

describe("Turnstile (captcha plugin)", () => {
  // A local stand-in for Cloudflare's siteverify: "pass" tokens succeed on the dashboard's host.
  let siteverify: ReturnType<typeof Bun.serve>;
  let captchaAuth: ReturnType<typeof createCaptchaAuth>;

  function createCaptchaAuth(siteVerifyURL: string) {
    return betterAuth({
      ...authOptions,
      baseURL: BASE_URL,
      plugins: [
        ...authOptions.plugins,
        captcha({
          provider: "cloudflare-turnstile",
          secretKey: "test-secret",
          allowedHostnames: ["localhost"],
          siteVerifyURLOverride: siteVerifyURL,
        }),
      ],
    });
  }

  beforeAll(() => {
    siteverify = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(request) {
        const { response } = (await request.json()) as { response: string };
        return Response.json(
          response === "pass"
            ? { success: true, hostname: "localhost", action: "sign-up" }
            : response === "elsewhere"
              ? { success: true, hostname: "evil.example" }
              : { success: false, "error-codes": ["invalid-input-response"] },
        );
      },
    });
    captchaAuth = createCaptchaAuth(`http://127.0.0.1:${siteverify.port}/siteverify`);
  });

  afterAll(() => {
    siteverify.stop(true);
  });

  const signUp = (token?: string) =>
    post(
      "/sign-up/email",
      signUpBody(`turnstile-${uniqueSuffix()}@coss.test`),
      token ? { "x-captcha-response": token } : {},
      captchaAuth.handler,
    );

  test("refuses requests without a token", async () => {
    const response = await signUp();
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe("MISSING_RESPONSE");
  });

  test("refuses tokens Cloudflare rejects, or issued for another hostname", async () => {
    for (const token of ["fail", "elsewhere"]) {
      const response = await signUp(token);
      expect(response.status).toBe(403);
      expect(((await response.json()) as { code: string }).code).toBe("VERIFICATION_FAILED");
    }
  });

  test("lets verified requests through", async () => {
    expect((await signUp("pass")).status).toBe(200);
  });

  test("leaves server-side calls alone", async () => {
    const response = await captchaAuth.api.requestPasswordReset({
      body: { email: `nobody-${uniqueSuffix()}@coss.test`, redirectTo: "/reset-password" },
    });
    expect(response.status).toBe(true);
  });
});
