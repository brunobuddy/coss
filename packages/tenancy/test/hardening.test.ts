import { describe, expect, test } from "bun:test";
import { auth } from "@coss/auth";
import { db, pool, schema } from "@coss/db";
import { newId } from "@coss/db/id";
import { uniqueSuffix } from "@coss/db/testing";
import { eq } from "drizzle-orm";
import {
  authenticateApiKey,
  getOrganizationMember,
  listOrganizationMembers,
} from "../src/index.ts";
import { addMember, createTestTenant, createTestUser, type TestUser } from "../src/testing.ts";

/** Signs the owner in and returns request headers carrying the session cookie. */
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

/** Records every SQL statement sent through the pool; `fail` rejects matching statements. */
async function withQueryLog<T>(
  run: (statements: string[]) => Promise<T>,
  fail?: (sql: string) => boolean,
): Promise<T> {
  const statements: string[] = [];
  const original = pool.query.bind(pool);
  pool.query = ((text: unknown, ...rest: unknown[]) => {
    const sql = typeof text === "string" ? text : ((text as { text?: string })?.text ?? "");
    statements.push(sql);
    if (fail?.(sql)) return Promise.reject(new Error("simulated outage"));
    return (original as (...args: unknown[]) => unknown)(text, ...rest);
  }) as typeof pool.query;
  try {
    return await run(statements);
  } finally {
    pool.query = original;
  }
}

describe("authenticateApiKey", () => {
  test("reads with one SELECT and writes last_request at most once a minute", async () => {
    const tenant = await createTestTenant();
    const statements = await withQueryLog(async (log) => {
      for (let i = 0; i < 5; i++)
        expect((await authenticateApiKey(tenant.sandboxKey)).ok).toBe(true);
      return log;
    });
    expect(statements.filter((sql) => sql.startsWith("select"))).toHaveLength(5);
    const writes = statements.filter((sql) => !sql.startsWith("select"));
    // The organization's first request also pins its API version, once.
    expect(writes).toHaveLength(2);
    expect(writes[0]).toStartWith('update "apikey" set "last_request"');
    expect(writes[1]).toStartWith('insert into "organization_api_version"');
  });

  test("a failed usage write does not fail authentication", async () => {
    const tenant = await createTestTenant();
    const result = await withQueryLog(
      () => authenticateApiKey(tenant.sandboxKey),
      (sql) => sql.startsWith('update "apikey"'),
    );
    expect(result.ok).toBe(true);
  });

  test("a failed lookup is thrown (503), not reported as invalid", async () => {
    const tenant = await createTestTenant();
    const error = await withQueryLog(
      () =>
        authenticateApiKey(tenant.sandboxKey).then(
          () => null,
          (e: unknown) => e,
        ),
      (sql) => sql.startsWith("select"),
    );
    expect(error).toBeInstanceOf(Error);
    expect((await authenticateApiKey(tenant.sandboxKey)).ok).toBe(true);
  });
});

describe("organization role hooks", () => {
  test("invitations only accept canonical invitable roles", async () => {
    const tenant = await createTestTenant();
    const headers = await sessionHeaders(tenant.owner.email, tenant.owner.password);
    const invite = (role: string) =>
      auth.api.createInvitation({
        headers,
        body: {
          email: `invitee+${uniqueSuffix()}@coss.test`,
          role: role as "member",
          organizationId: tenant.organization.id,
        },
      });

    for (const role of [" owner", "owner", "owner ", "admin, owner", "admin,member", "superuser"]) {
      await expect(invite(role)).rejects.toThrow();
    }
    expect((await invite("admin"))?.role).toBe("admin");
    // Better Auth trims before the hook, so padding never reaches the stored role.
    expect((await invite("admin "))?.role).toBe("admin");
    expect((await invite("member"))?.role).toBe("member");
  });
});

describe("canceling invitations", () => {
  async function invitationStatus(id: string) {
    const [row] = await db
      .select({ status: schema.invitation.status })
      .from(schema.invitation)
      .where(eq(schema.invitation.id, id));
    return row?.status;
  }

  test("only pending invitations can be canceled", async () => {
    const tenant = await createTestTenant();
    const headers = await sessionHeaders(tenant.owner.email, tenant.owner.password);
    const invitation = await auth.api.createInvitation({
      headers,
      body: {
        email: `invitee+${uniqueSuffix()}@coss.test`,
        role: "member",
        organizationId: tenant.organization.id,
      },
    });
    if (!invitation) throw new Error("invitation was not created");

    await auth.api.cancelInvitation({ headers, body: { invitationId: invitation.id } });
    expect(await invitationStatus(invitation.id)).toBe("canceled");
    await expect(
      auth.api.cancelInvitation({ headers, body: { invitationId: invitation.id } }),
    ).rejects.toThrow("no longer pending");

    const accepted = {
      id: newId("invite"),
      organizationId: tenant.organization.id,
      email: `invitee-${uniqueSuffix()}@coss.test`,
      role: "member",
      status: "accepted",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      inviterId: tenant.owner.id,
    };
    await db.insert(schema.invitation).values(accepted);
    await expect(
      auth.api.cancelInvitation({ headers, body: { invitationId: accepted.id } }),
    ).rejects.toThrow("no longer pending");
    expect(await invitationStatus(accepted.id)).toBe("accepted");
  });

  test("members cannot cancel invitations", async () => {
    const tenant = await createTestTenant();
    const owner = await sessionHeaders(tenant.owner.email, tenant.owner.password);
    const member = await createTestUser();
    await addMember({ organizationId: tenant.organization.id, userId: member.id, role: "member" });
    const invitation = await auth.api.createInvitation({
      headers: owner,
      body: {
        email: `invitee+${uniqueSuffix()}@coss.test`,
        role: "member",
        organizationId: tenant.organization.id,
      },
    });
    if (!invitation) throw new Error("invitation was not created");

    await expect(
      auth.api.cancelInvitation({
        headers: await sessionHeaders(member.email, member.password),
        body: { invitationId: invitation.id },
      }),
    ).rejects.toThrow();
    expect(await invitationStatus(invitation.id)).toBe("pending");
  });
});

describe("invitations follow their inviter", () => {
  async function invitationStatus(id: string) {
    const [row] = await db
      .select({ status: schema.invitation.status })
      .from(schema.invitation)
      .where(eq(schema.invitation.id, id));
    return row?.status;
  }

  async function inviteAs(user: TestUser, organizationId: string, role: "admin" | "member") {
    const invitee = await createTestUser();
    const invitation = await auth.api.createInvitation({
      headers: await sessionHeaders(user.email, user.password),
      body: { email: invitee.email, role, organizationId },
    });
    if (!invitation) throw new Error("invitation was not created");
    return { invitation, invitee };
  }

  async function memberIdOf(organizationId: string, user: TestUser) {
    const row = (await listOrganizationMembers({ organizationId })).find(
      (r) => r.user.id === user.id,
    );
    if (!row) throw new Error("member row missing");
    return row.id;
  }

  test("removing, demoting or leaving cancels what an admin sent", async () => {
    const tenant = await createTestTenant();
    const organizationId = tenant.organization.id;
    const owner = await sessionHeaders(tenant.owner.email, tenant.owner.password);
    const [removed, demoted, leaver] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ]);
    for (const user of [removed, demoted, leaver]) {
      await addMember({ organizationId, userId: user.id, role: "admin" });
    }
    const fromRemoved = await inviteAs(removed, organizationId, "admin");
    const fromDemoted = await inviteAs(demoted, organizationId, "member");
    const fromLeaver = await inviteAs(leaver, organizationId, "member");
    const fromOwner = await inviteAs(tenant.owner, organizationId, "member");

    await auth.api.removeMember({
      headers: owner,
      body: { memberIdOrEmail: await memberIdOf(organizationId, removed), organizationId },
    });
    expect(await invitationStatus(fromRemoved.invitation.id)).toBe("canceled");
    expect(await invitationStatus(fromDemoted.invitation.id)).toBe("pending");

    await auth.api.updateMemberRole({
      headers: owner,
      body: { memberId: await memberIdOf(organizationId, demoted), role: "member", organizationId },
    });
    expect(await invitationStatus(fromDemoted.invitation.id)).toBe("canceled");

    await auth.api.leaveOrganization({
      headers: await sessionHeaders(leaver.email, leaver.password),
      body: { organizationId },
    });
    expect(await invitationStatus(fromLeaver.invitation.id)).toBe("canceled");
    expect(await invitationStatus(fromOwner.invitation.id)).toBe("pending");
    // About 13 password hashes and checks (scrypt, CPU-bound by design): well under a second
    // alone, but CI runs every package's tests at once on a few cores.
  }, 30_000);

  test("an invitation whose inviter may no longer invite can't be accepted", async () => {
    const tenant = await createTestTenant();
    const organizationId = tenant.organization.id;
    const admin = await createTestUser();
    await addMember({ organizationId, userId: admin.id, role: "admin" });
    const { invitation, invitee } = await inviteAs(admin, organizationId, "admin");
    // Demoted behind Better Auth's back (no hook ran): accepting re-checks the inviter anyway.
    await db
      .update(schema.member)
      .set({ role: "member" })
      .where(eq(schema.member.userId, admin.id));

    await expect(
      auth.api.acceptInvitation({
        headers: await sessionHeaders(invitee.email, invitee.password),
        body: { invitationId: invitation.id },
      }),
    ).rejects.toThrow("This invitation is no longer valid.");
    expect(await invitationStatus(invitation.id)).toBe("pending");
    const members = await listOrganizationMembers({ organizationId });
    expect(members.some((row) => row.user.id === invitee.id)).toBe(false);
  });
});

/** A tenant whose owner, admin and member each have a member row and a signed-in session. */
async function roleFixture() {
  const tenant = await createTestTenant();
  const organizationId = tenant.organization.id;
  const admin = await createTestUser();
  const member = await createTestUser();
  await addMember({ organizationId, userId: admin.id, role: "admin" });
  await addMember({ organizationId, userId: member.id, role: "member" });
  const rows = await listOrganizationMembers({ organizationId });
  const memberId = (user: TestUser) => {
    const row = rows.find((r) => r.user.id === user.id);
    if (!row) throw new Error("member row missing");
    return row.id;
  };
  const as = async (user: TestUser) => {
    const headers = await sessionHeaders(user.email, user.password);
    return (target: TestUser, role: string) =>
      auth.api.updateMemberRole({
        headers,
        body: { memberId: memberId(target), role, organizationId },
      });
  };
  const roleOf = async (user: TestUser) =>
    (await getOrganizationMember({ organizationId, memberId: memberId(user) }))?.role;
  return { tenant, organizationId, owner: tenant.owner, admin, member, memberId, as, roleOf };
}

describe("changing member roles", () => {
  test("admins can switch non-owners between member and admin, but not touch owners", async () => {
    const { owner, admin, member, as, roleOf } = await roleFixture();
    const asAdmin = await as(admin);

    await asAdmin(member, "admin");
    expect(await roleOf(member)).toBe("admin");
    await asAdmin(member, "member");
    expect(await roleOf(member)).toBe("member");

    await expect(asAdmin(member, "owner")).rejects.toThrow();
    await expect(asAdmin(owner, "member")).rejects.toThrow();
    await expect(asAdmin(member, "superuser")).rejects.toThrow();
    expect(await roleOf(member)).toBe("member");
    expect(await roleOf(owner)).toBe("owner");
  });

  test("members cannot change roles", async () => {
    const { admin, member, as, roleOf } = await roleFixture();
    await expect((await as(member))(admin, "member")).rejects.toThrow();
    await expect((await as(member))(member, "admin")).rejects.toThrow();
    expect(await roleOf(admin)).toBe("admin");
    expect(await roleOf(member)).toBe("member");
  });

  test("owners can grant owner, and the last owner cannot step down", async () => {
    const { owner, admin, as, roleOf } = await roleFixture();
    const asOwner = await as(owner);

    await expect(asOwner(owner, "admin")).rejects.toThrow();
    expect(await roleOf(owner)).toBe("owner");

    await asOwner(admin, "owner");
    expect(await roleOf(admin)).toBe("owner");
    await asOwner(owner, "admin");
    expect(await roleOf(owner)).toBe("admin");
  });
});

describe("removing members and leaving", () => {
  test("admins remove non-owners; only owners remove owners; members remove no one", async () => {
    const { organizationId, owner, admin, member, memberId, roleOf } = await roleFixture();
    const remove = async (actor: TestUser, target: TestUser) =>
      auth.api.removeMember({
        headers: await sessionHeaders(actor.email, actor.password),
        body: { memberIdOrEmail: memberId(target), organizationId },
      });

    await expect(remove(member, admin)).rejects.toThrow();
    await expect(remove(admin, owner)).rejects.toThrow();
    expect(await roleOf(admin)).toBe("admin");
    expect(await roleOf(owner)).toBe("owner");

    await remove(admin, member);
    expect(await roleOf(member)).toBeUndefined();
    await remove(owner, admin);
    expect(await roleOf(admin)).toBeUndefined();
  });

  test("a member of another organization cannot be removed through this one", async () => {
    const { organizationId, owner } = await roleFixture();
    const other = await roleFixture();
    await expect(
      auth.api.removeMember({
        headers: await sessionHeaders(owner.email, owner.password),
        body: { memberIdOrEmail: other.memberId(other.member), organizationId },
      }),
    ).rejects.toThrow();
    expect(await other.roleOf(other.member)).toBe("member");
  });

  test("anyone can leave, except the last owner", async () => {
    const { organizationId, owner, member, roleOf } = await roleFixture();
    const leave = async (user: TestUser) =>
      auth.api.leaveOrganization({
        headers: await sessionHeaders(user.email, user.password),
        body: { organizationId },
      });

    await leave(member);
    expect(await roleOf(member)).toBeUndefined();
    await expect(leave(owner)).rejects.toThrow();
    expect(await roleOf(owner)).toBe("owner");
  });
});

describe("organization HTTP routes", () => {
  test("only create and accept-invitation are open; the dashboard's server-side calls still work", async () => {
    const { organizationId, owner, admin, member, memberId, roleOf } = await roleFixture();
    const headers = await sessionHeaders(admin.email, admin.password);
    headers.set("content-type", "application/json");
    const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    headers.set("origin", base);
    const post = (path: string, body: unknown) =>
      auth.handler(
        new Request(`${base}/api/auth/organization/${path}`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }),
      );

    // These skip the dashboard's SSO and 2FA requirements, directory locks and audit log.
    const closed = [
      post("remove-member", { memberIdOrEmail: memberId(member), organizationId }),
      post("update-member-role", { memberId: memberId(member), role: "admin", organizationId }),
      post("cancel-invitation", { invitationId: "invite_x" }),
      post("set-active", { organizationId }),
      post("leave", { organizationId }),
      post("reject-invitation", { invitationId: "invite_x" }),
      post("check-slug", { slug: "anything" }),
      auth.handler(
        new Request(
          `${base}/api/auth/organization/get-full-organization?organizationId=${organizationId}`,
          { headers },
        ),
      ),
      auth.handler(
        new Request(`${base}/api/auth/organization/list-members?organizationId=${organizationId}`, {
          headers,
        }),
      ),
      auth.handler(new Request(`${base}/api/auth/organization/list`, { headers })),
    ];
    for (const response of await Promise.all(closed)) expect(response.status).toBe(404);
    expect(await roleOf(member)).toBe("member");
    expect(await roleOf(admin)).toBe("admin");

    // Still open for the browser (onboarding and the invitation page): reaches Better Auth.
    expect((await post("accept-invitation", { invitationId: "invite_x" })).status).not.toBe(404);

    // The dashboard's server actions call the same endpoints through auth.api.
    await auth.api.removeMember({
      headers: await sessionHeaders(owner.email, owner.password),
      body: { memberIdOrEmail: memberId(member), organizationId },
    });
    expect(await roleOf(member)).toBeUndefined();
  });
});

describe("account HTTP routes", () => {
  test("account settings and sessions are closed over HTTP, open to the server", async () => {
    const user = await createTestUser();
    const headers = await sessionHeaders(user.email, user.password);
    headers.set("content-type", "application/json");
    const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    headers.set("origin", base);

    const listed = await auth.handler(new Request(`${base}/api/auth/list-sessions`, { headers }));
    expect(listed.status).toBe(404);
    for (const path of ["update-user", "change-password", "revoke-sessions"]) {
      const response = await auth.handler(
        new Request(`${base}/api/auth/${path}`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: "Renamed",
            currentPassword: user.password,
            newPassword: "x",
          }),
        }),
      );
      expect(response.status).toBe(404);
    }

    // The settings page and its actions use auth.api.
    expect(await auth.api.listSessions({ headers })).toHaveLength(1);
    await auth.api.updateUser({ headers, body: { name: "Renamed" } });
    const [row] = await db
      .select({ name: schema.user.name })
      .from(schema.user)
      .where(eq(schema.user.id, user.id));
    expect(row?.name).toBe("Renamed");
  });
});

describe("resending invitations", () => {
  test("resend keeps the invitation (same id and role) and extends its expiry", async () => {
    const tenant = await createTestTenant();
    const headers = await sessionHeaders(tenant.owner.email, tenant.owner.password);
    const email = `invitee+${uniqueSuffix()}@coss.test`;
    const body = { email, role: "admin" as const, organizationId: tenant.organization.id };
    const invitation = await auth.api.createInvitation({ headers, body });
    if (!invitation) throw new Error("invitation was not created");
    await db
      .update(schema.invitation)
      .set({ expiresAt: new Date(Date.now() + 60_000) })
      .where(eq(schema.invitation.id, invitation.id));

    await expect(auth.api.createInvitation({ headers, body })).rejects.toThrow();
    const resent = await auth.api.createInvitation({ headers, body: { ...body, resend: true } });
    expect(resent?.id).toBe(invitation.id);
    expect(resent?.role).toBe("admin");
    expect(resent?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 60 * 60 * 1000);
  });
});

describe("updating organizations", () => {
  test("admins rename the organization and change its slug, with the same rules as creation", async () => {
    const { organizationId, admin } = await roleFixture();
    const headers = await sessionHeaders(admin.email, admin.password);
    const update = (data: { name?: string; slug?: string }) =>
      auth.api.updateOrganization({ headers, body: { organizationId, data } });

    const slug = `renamed-${uniqueSuffix()}`;
    const updated = await update({ name: "Renamed", slug });
    expect(updated?.name).toBe("Renamed");
    expect(updated?.slug).toBe(slug);

    for (const data of [{ slug: "settings" }, { slug: "Bad Slug" }, { name: "  " }]) {
      await expect(update(data)).rejects.toThrow();
    }
    const other = await createTestTenant();
    await expect(update({ slug: other.organization.slug })).rejects.toThrow();
    const [row] = await db
      .select({ name: schema.organization.name, slug: schema.organization.slug })
      .from(schema.organization)
      .where(eq(schema.organization.id, organizationId));
    expect(row).toEqual({ name: "Renamed", slug });
  });

  test("members cannot update the organization", async () => {
    const { organizationId, member } = await roleFixture();
    await expect(
      auth.api.updateOrganization({
        headers: await sessionHeaders(member.email, member.password),
        body: { organizationId, data: { name: "Hijacked" } },
      }),
    ).rejects.toThrow();
    const [row] = await db
      .select({ name: schema.organization.name })
      .from(schema.organization)
      .where(eq(schema.organization.id, organizationId));
    expect(row?.name).not.toBe("Hijacked");
  });
});
