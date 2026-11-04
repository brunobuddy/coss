import { beforeEach, describe, expect, mock, test } from "bun:test";
import { newId } from "@coss/db/id";

// Keep this suite DB-free; exercise the actual actions with their external boundaries mocked.
mock.module("server-only", () => ({}));
mock.module("@coss/email", () => ({
  BroadcastError: class extends Error {},
  ContactError: class extends Error {},
  DomainError: class extends Error {},
  EmailError: class extends Error {},
  InboxError: class extends Error {},
  SubaccountError: class extends Error {},
}));
mock.module("@coss/tenancy", () => ({ TenancyError: class extends Error {} }));
const planHas = mock(async () => true);
mock.module("@/lib/billing", () => ({ planHas }));
const audit = mock(async () => {});
const enableHipaaMode = mock(async () => {});
const disableHipaaMode = mock(async () => {});
const isMemberOfHipaaOrganization = mock(async () => false);
mock.module("@coss/tenancy/admin", () => ({
  ADMIN_REASON_MAX_LENGTH: 500,
  deleteOrganizationAsAdmin: mock(async () => {}),
  disableHipaaMode,
  enableHipaaMode,
  isMemberOfHipaaOrganization,
  disableOrganizationScim: mock(async () => ({ complete: true })),
  disableOrganizationSso: mock(async () => {}),
  disableOrganizationSsoRequirement: mock(async () => {}),
  getUserForAdmin: mock(),
  listUserMembershipsForAdmin: mock(),
  planOrganizationTakedown: mock(),
  recordAdminAction: audit,
  resetUserTwoFactor: mock(async () => {}),
  revokeApiKeyAsAdmin: mock(),
  setOwnedOrganizationLimit: mock(async () => true),
  suspendOrganization: mock(),
  unlinkUserSso: mock(async () => {}),
  unsuspendOrganization: mock(),
}));
const emailContext = {
  organizationId: newId("org"),
  organizationSlug: "spam-co",
  hipaaMode: false,
};
const emailContent = mock(async () => ({
  organizationId: emailContext.organizationId,
  html: "<p>Win</p>",
  text: "Win",
}));
mock.module("@coss/email/admin", () => ({
  getEmailForAdmin: async () => emailContext,
  getEmailContentForAdmin: emailContent,
}));
const changeRateLimitOverride = mock(async () => true);
const ratelimit = await import("@coss/ratelimit");
mock.module("@coss/ratelimit", () => ({ ...ratelimit, changeRateLimitOverride }));
mock.module("next/cache", () => ({ refresh: mock() }));
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
const redirected = new Error("redirect");
mock.module("next/navigation", () => ({
  redirect: () => {
    throw redirected;
  },
  unstable_rethrow: (error: unknown) => {
    if (error === redirected) throw error;
  },
}));
mock.module("@/lib/session", () => ({
  requirePlatformAdminAction: async () => ({
    actor: { userId: newId("user"), email: "admin@test.local" },
    session: { user: { id: newId("user") } },
  }),
}));
const systemOrgId = newId("org");
const SYSTEM_ORGANIZATION_MESSAGE = "coss.com's own organization";
mock.module("@/lib/system-organization", () => ({
  SYSTEM_ORGANIZATION_MESSAGE,
  isSystemOrganization: async (organizationId: string) => organizationId === systemOrgId,
}));
const suspendSending = mock(async () => ({ id: "repev" }));
const reputationModule = await import("@coss/reputation");
mock.module("@coss/reputation", () => ({
  ...reputationModule,
  getOrganizationStanding: async () => ({}),
  reinstateOrganization: mock(),
  suspendOrganization: suspendSending,
  updateReputationPolicy: mock(),
}));
type TestAssessment = {
  id: string;
  decision: "allow" | "review" | "block";
  outcome: "legitimate" | "fraud" | "abuse" | null;
  review_status: "open" | "resolved" | null;
  user: { email: string | null };
};
const signUpScope = { organizationId: newId("org"), environmentId: newId("env") };
let scope: typeof signUpScope | null = signUpScope;
const signUps = new Map<string, TestAssessment[]>();
const recordRiskFeedback = mock(
  async (
    _hash: unknown,
    _scope: unknown,
    id: string,
    params: { outcome: string; note?: string },
  ) => {
    for (const assessment of [...signUps.values()].flat()) {
      if (assessment.id !== id) continue;
      // Like the real one: feedback also resolves an open review.
      assessment.outcome = params.outcome as TestAssessment["outcome"];
      if (assessment.review_status === "open") assessment.review_status = "resolved";
    }
    return { id };
  },
);
const riskModule = await import("@coss/risk");
mock.module("@coss/risk", () => ({
  ...riskModule,
  getRiskAssessment: async (_scope: unknown, id: string) =>
    [...signUps.values()].flat().find((assessment) => assessment.id === id) ?? null,
  listRiskAssessmentsForEmail: async (_scope: unknown, email: string) => signUps.get(email) ?? [],
  recordRiskFeedback,
}));
mock.module("@/lib/risk", () => ({
  riskHasher: () => () => "hash",
  signUpRiskScope: async () => scope,
}));
const supportAudit = mock(async () => {});
mock.module("@/lib/audit", () => ({ supportAudit }));
const mutate = mock(async () => ({}));
mock.module("@/lib/auth", () => ({
  auth: {
    api: {
      getUser: async () => ({ email: "target@test.local" }),
      listUserSessions: async () => ({ sessions: [{ id: "session", token: "secret" }] }),
      banUser: mutate,
      unbanUser: mutate,
      setRole: mutate,
      revokeUserSessions: mutate,
      revokeUserSession: mutate,
      impersonateUser: mutate,
    },
  },
}));
const {
  deleteOrganizationAsAdmin,
  resetUserTwoFactor,
  unlinkUserSso,
  disableOrganizationScim,
  disableOrganizationSso,
  disableOrganizationSsoRequirement,
} = (await import("@coss/tenancy/admin")) as unknown as Record<
  | "deleteOrganizationAsAdmin"
  | "resetUserTwoFactor"
  | "unlinkUserSso"
  | "disableOrganizationScim"
  | "disableOrganizationSso"
  | "disableOrganizationSsoRequirement",
  ReturnType<typeof mock>
>;
const actions = await import("../src/app/admin/actions");
const cases = [
  ["ban", actions.banUserAction, true],
  ["unban", actions.unbanUserAction, false],
  ["role change", actions.setUserRoleAction, false],
  ["revoke sessions", actions.revokeUserSessionsAction, false],
  ["revoke session", actions.revokeUserSessionAction, false],
  ["impersonate", actions.impersonateUserAction, true],
] as const;

beforeEach(() => {
  mutate.mockClear();
  audit.mockClear();
});

for (const [name, action, required] of cases) {
  describe(name, () => {
    function form(reason: string) {
      const data = new FormData();
      data.set("userId", newId("user"));
      data.set("role", "admin");
      data.set("sessionId", "session");
      data.set("reason", reason);
      return data;
    }
    test("rejects an oversized reason before any mutation", async () => {
      expect(await action(null, form("x".repeat(501)))).toEqual({
        ok: false,
        error: "The reason must be at most 500 characters.",
      });
      expect(mutate).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
    });
    test("accepts and audits a trimmed reason at the limit", async () => {
      const result = action(null, form(` ${"x".repeat(500)} `));
      if (name === "impersonate") await expect(result).rejects.toBe(redirected);
      else expect(await result).toEqual({ ok: true, data: null });
      expect(mutate).toHaveBeenCalledTimes(1);
      expect(audit).toHaveBeenCalledWith(expect.objectContaining({ reason: "x".repeat(500) }));
    });
    test("handles an empty reason according to the action requirement", async () => {
      const result = await action(null, form("   "));
      expect(result.ok).toBe(!required);
      expect(mutate).toHaveBeenCalledTimes(required ? 0 : 1);
      if (!required) expect(audit).toHaveBeenCalledWith(expect.objectContaining({ reason: null }));
    });
  });
}

describe("organization limit", () => {
  function form(userId: string, limit?: string) {
    const data = new FormData();
    data.set("userId", userId);
    if (limit !== undefined) data.set("limit", limit);
    data.set("reason", " Platform agreement ");
    return data;
  }

  test("sets and resets a user's limit, naming the admin", async () => {
    const { setOwnedOrganizationLimit } = (await import(
      "@coss/tenancy/admin"
    )) as unknown as Record<"setOwnedOrganizationLimit", ReturnType<typeof mock>>;
    setOwnedOrganizationLimit.mockClear();
    const userId = newId("user");
    expect(await actions.setOwnedOrganizationLimitAction(null, form(userId, "50"))).toEqual({
      ok: true,
      data: null,
    });
    expect(setOwnedOrganizationLimit).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId, limit: 50, reason: "Platform agreement" }),
    );
    expect(await actions.resetOwnedOrganizationLimitAction(null, form(userId))).toEqual({
      ok: true,
      data: null,
    });
    expect(setOwnedOrganizationLimit).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId, limit: null }),
    );
  });

  test("a limit needs a reason", async () => {
    const data = form(newId("user"), "50");
    data.set("reason", " ");
    expect((await actions.setOwnedOrganizationLimitAction(null, data)).ok).toBe(false);
  });
});

describe("reset two-factor", () => {
  function form(userId: string, reason: string) {
    const data = new FormData();
    data.set("userId", userId);
    data.set("reason", reason);
    return data;
  }

  beforeEach(() => resetUserTwoFactor.mockClear());

  test("requires a reason and passes it, with the actor, to the audited reset", async () => {
    expect((await actions.resetTwoFactorAction(null, form(newId("user"), "  "))).ok).toBe(false);
    expect(resetUserTwoFactor).not.toHaveBeenCalled();

    const userId = newId("user");
    expect(await actions.resetTwoFactorAction(null, form(userId, " Lost phone "))).toEqual({
      ok: true,
      data: null,
    });
    expect(resetUserTwoFactor).toHaveBeenCalledWith(
      expect.objectContaining({ userId, reason: "Lost phone", actor: expect.any(Object) }),
    );
  });

  test("rejects anything but a user id", async () => {
    expect((await actions.resetTwoFactorAction(null, form("org_x", "Lost phone"))).ok).toBe(false);
    expect(resetUserTwoFactor).not.toHaveBeenCalled();
  });
});

describe("SSO recovery", () => {
  function form(field: "userId" | "organizationId", id: string, reason: string) {
    const data = new FormData();
    data.set(field, id);
    data.set("reason", reason);
    return data;
  }

  beforeEach(() => {
    unlinkUserSso.mockClear();
    disableOrganizationScim.mockClear();
    disableOrganizationSso.mockClear();
    disableOrganizationSsoRequirement.mockClear();
    supportAudit.mockClear();
  });

  test("unlinking a user's SSO accounts needs a user id and a reason", async () => {
    expect((await actions.unlinkUserSsoAction(null, form("userId", newId("user"), " "))).ok).toBe(
      false,
    );
    expect((await actions.unlinkUserSsoAction(null, form("userId", "org_x", "IdP"))).ok).toBe(
      false,
    );
    expect(unlinkUserSso).not.toHaveBeenCalled();

    const userId = newId("user");
    expect(await actions.unlinkUserSsoAction(null, form("userId", userId, " IdP reset "))).toEqual({
      ok: true,
      data: null,
    });
    expect(unlinkUserSso).toHaveBeenCalledWith(
      expect.objectContaining({ userId, reason: "IdP reset", actor: expect.any(Object) }),
    );
  });

  for (const [name, action, target] of [
    [
      "stop requiring SSO",
      actions.disableOrganizationSsoRequirementAction,
      () => disableOrganizationSsoRequirement,
    ],
    ["disable SSO", actions.disableOrganizationSsoAction, () => disableOrganizationSso],
    ["disconnect SCIM", actions.disableOrganizationScimAction, () => disableOrganizationScim],
  ] as const) {
    test(`${name} needs an organization id and a reason`, async () => {
      const organizationId = newId("org");
      expect((await action(null, form("organizationId", organizationId, ""))).ok).toBe(false);
      expect((await action(null, form("organizationId", newId("user"), "Outage"))).ok).toBe(false);
      expect(target()).not.toHaveBeenCalled();
      expect(await action(null, form("organizationId", organizationId, "Outage"))).toEqual({
        ok: true,
        data: null,
      });
      expect(target()).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId, reason: "Outage", actor: expect.any(Object) }),
      );
      // The organization's own audit log names "coss.com support", never the reason.
      expect(supportAudit).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(supportAudit.mock.calls)).not.toContain("Outage");
    });
  }

  test("disconnecting SCIM reports a directory that is still being released", async () => {
    disableOrganizationScim.mockImplementationOnce(async () => ({ complete: false }));
    const result = await actions.disableOrganizationScimAction(
      null,
      form("organizationId", newId("org"), "Token leaked"),
    );
    expect(result.ok).toBe(false);
  });
});

describe("organization deletion", () => {
  test("needs an organization id and a reason, and passes the typed slug on", async () => {
    const organizationId = newId("org");
    const form = (id: string, reason: string) => {
      const data = new FormData();
      data.set("organizationId", id);
      data.set("confirm", " acme ");
      data.set("reason", reason);
      return data;
    };
    expect((await actions.deleteOrganizationAdminAction(null, form(organizationId, ""))).ok).toBe(
      false,
    );
    expect(
      (await actions.deleteOrganizationAdminAction(null, form(newId("user"), "Closure"))).ok,
    ).toBe(false);
    expect(deleteOrganizationAsAdmin).not.toHaveBeenCalled();

    expect(
      await actions.deleteOrganizationAdminAction(null, form(organizationId, "Closure")),
    ).toEqual({ ok: true, data: null });
    expect(deleteOrganizationAsAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        confirmSlug: "acme",
        reason: "Closure",
        actor: expect.any(Object),
      }),
    );
  });
});

describe("rate limit overrides", () => {
  function form(fields: Record<string, string>) {
    const data = new FormData();
    data.set("organizationId", newId("org"));
    data.set("bucket", "email.recipients.day");
    data.set("limit", "50000");
    data.set("period", "1d");
    data.set("reason", "Upgrade");
    for (const [name, value] of Object.entries(fields)) data.set(name, value);
    return data;
  }

  beforeEach(() => changeRateLimitOverride.mockClear());

  test("sets a validated rule with the actor and reason", async () => {
    expect(await actions.setRateLimitOverrideAction(null, form({ burst: "60000" }))).toEqual({
      ok: true,
      data: null,
    });
    expect(changeRateLimitOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: "email.recipients.day",
        rule: { limit: 50_000, periodMs: 86_400_000, burst: 60_000 },
        reason: "Upgrade",
        actor: expect.any(Object),
      }),
    );
    await actions.setRateLimitOverrideAction(null, form({ burst: "" }));
    expect(changeRateLimitOverride).toHaveBeenLastCalledWith(
      expect.objectContaining({ rule: { limit: 50_000, periodMs: 86_400_000 } }),
    );
  });

  for (const [name, fields, error] of [
    ["a non-overridable bucket", { bucket: "auth.sign_in.ip" }, /can't be overridden/],
    ["an unknown bucket", { bucket: "nope" }, /can't be overridden/],
    ["a missing limit", { limit: "" }, /Enter a limit/],
    ["a fractional limit", { limit: "1.5" }, /whole number/],
    ["a zero burst", { burst: "0" }, /whole number/],
    ["a bad period", { period: "1 week" }, /period such as/],
    ["a period too long for the column", { period: "30d" }, /24 days/],
    ["a missing reason", { reason: " " }, /reason/],
    ["an organization id of another kind", { organizationId: newId("user") }, /not found/],
  ] as const) {
    test(`refuses ${name}`, async () => {
      const result = await actions.setRateLimitOverrideAction(null, form(fields));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(error);
      expect(changeRateLimitOverride).not.toHaveBeenCalled();
    });
  }

  test("resets with an optional reason", async () => {
    expect(await actions.resetRateLimitOverrideAction(null, form({ reason: "" }))).toEqual({
      ok: true,
      data: null,
    });
    expect(changeRateLimitOverride).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: "email.recipients.day", rule: null, reason: null }),
    );
    expect((await actions.resetRateLimitOverrideAction(null, form({ bucket: "x" }))).ok).toBe(
      false,
    );
  });
});

const { suspendOrganization, planOrganizationTakedown, revokeApiKeyAsAdmin } = (await import(
  "@coss/tenancy/admin"
)) as unknown as Record<
  "suspendOrganization" | "planOrganizationTakedown" | "revokeApiKeyAsAdmin",
  ReturnType<typeof mock>
>;
const tenancyAdmin = (await import("@coss/tenancy/admin")) as unknown as Record<
  "getUserForAdmin" | "listUserMembershipsForAdmin",
  ReturnType<typeof mock>
>;
const reputation = await import(
  "../src/app/admin/organizations/[organizationId]/reputation/actions"
);

describe("coss.com's own organization", () => {
  function form(organizationId: string) {
    const data = new FormData();
    data.set("organizationId", organizationId);
    data.set("reason", "Phishing");
    data.set("note", "Phishing");
    return data;
  }

  beforeEach(() => {
    suspendOrganization.mockClear();
    suspendSending.mockClear();
  });

  test("can't be suspended by an admin", async () => {
    for (const action of [
      actions.suspendOrganizationAction,
      reputation.suspendOrganizationAction,
      actions.takeDownOrganizationAction,
    ]) {
      expect(await action(null, form(systemOrgId))).toEqual({
        ok: false,
        error: SYSTEM_ORGANIZATION_MESSAGE,
      });
    }
    expect(suspendOrganization).not.toHaveBeenCalled();
    expect(suspendSending).not.toHaveBeenCalled();
  });

  test("other organizations still can", async () => {
    const organizationId = newId("org");
    expect((await actions.suspendOrganizationAction(null, form(organizationId))).ok).toBe(true);
    expect((await reputation.suspendOrganizationAction(null, form(organizationId))).ok).toBe(true);
    expect(suspendOrganization).toHaveBeenCalledTimes(1);
    expect(suspendSending).toHaveBeenCalledTimes(1);
  });
});

describe("take down", () => {
  const organizationId = newId("org");
  const loner = newId("user");
  const twoOrgs = newId("user");
  function form(reason: string, category = "phishing") {
    const data = new FormData();
    data.set("organizationId", organizationId);
    data.set("category", category);
    data.set("reason", reason);
    return data;
  }
  function plan(overrides: Record<string, unknown> = {}) {
    return {
      suspended: false,
      deleting: false,
      apiKeys: [{ id: "key_1" }, { id: "key_2" }],
      members: [
        { userId: loner, email: "spam@x.test", role: "owner", keptBecause: null },
        { userId: twoOrgs, email: "dev@x.test", role: "member", keptBecause: "also in Acme" },
      ],
      ...overrides,
    };
  }

  beforeEach(() => {
    suspendOrganization.mockClear();
    revokeApiKeyAsAdmin.mockClear();
    mutate.mockClear();
    audit.mockClear();
    recordRiskFeedback.mockClear();
    planOrganizationTakedown.mockClear();
    signUps.clear();
    scope = signUpScope;
  });

  test("needs a known category before anything happens", async () => {
    planOrganizationTakedown.mockImplementation(async () => plan());
    for (const category of ["", "fraud", "__proto__"]) {
      expect(await actions.takeDownOrganizationAction(null, form("Phishing", category))).toEqual({
        ok: false,
        error: "Choose what kind of abuse this is.",
      });
    }
    expect(planOrganizationTakedown).not.toHaveBeenCalled();
  });

  test("reports the banned members' sign-ups, not the kept ones'", async () => {
    planOrganizationTakedown.mockImplementation(async () => plan());
    const banned = signUp("spam@x.test");
    const kept = signUp("dev@x.test");
    expect((await actions.takeDownOrganizationAction(null, form("Fake bank login"))).ok).toBe(true);
    expect(suspendOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ category: "phishing" }),
    );
    expect(recordRiskFeedback).toHaveBeenCalledTimes(1);
    expect(recordRiskFeedback.mock.calls[0]?.slice(1)).toEqual([
      signUpScope,
      banned.id,
      { outcome: "fraud", note: "Phishing: Fake bank login" },
      { source: "dashboard", actorId: expect.any(String) },
    ]);
    expect(kept.outcome).toBeNull();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "risk_assessment.report",
        target: { type: "risk_assessment", id: banned.id },
        metadata: expect.objectContaining({ category: "phishing", outcome: "fraud" }),
      }),
    );
    expect(audit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "organization.take_down",
        metadata: expect.objectContaining({ reportedAssessmentIds: [banned.id] }),
      }),
    );
  });

  test("suspends, revokes every key and bans only the members it should", async () => {
    planOrganizationTakedown.mockImplementation(async () => plan());
    expect((await actions.takeDownOrganizationAction(null, form(" "))).ok).toBe(false);
    expect(planOrganizationTakedown).not.toHaveBeenCalled();

    expect(await actions.takeDownOrganizationAction(null, form("Phishing"))).toEqual({
      ok: true,
      data: null,
    });
    expect(suspendOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, reason: "Phishing" }),
    );
    expect(revokeApiKeyAsAdmin.mock.calls.map(([input]) => input.keyId)).toEqual([
      "key_1",
      "key_2",
    ]);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ body: { userId: loner, banReason: "Phishing" } }),
    );
    expect(audit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "organization.take_down",
        reason: "Phishing",
        metadata: {
          category: "phishing",
          bannedUserIds: [loner],
          keptUserIds: [twoOrgs],
          revokedKeyIds: ["key_1", "key_2"],
          reportedAssessmentIds: [],
        },
      }),
    );
  });

  test("skips the suspension when it is already in place, and refuses a deleting org", async () => {
    planOrganizationTakedown.mockImplementation(async () => plan({ suspended: true }));
    expect((await actions.takeDownOrganizationAction(null, form("Spam"))).ok).toBe(true);
    expect(suspendOrganization).not.toHaveBeenCalled();

    planOrganizationTakedown.mockImplementation(async () => plan({ deleting: true }));
    expect((await actions.takeDownOrganizationAction(null, form("Spam"))).ok).toBe(false);
    expect(revokeApiKeyAsAdmin).toHaveBeenCalledTimes(2);
  });
});

function signUp(email: string, overrides: Partial<TestAssessment> = {}): TestAssessment {
  const assessment: TestAssessment = {
    id: newId("rsk"),
    decision: "review",
    outcome: null,
    review_status: "open",
    user: { email },
    ...overrides,
  };
  signUps.set(email, [...(signUps.get(email) ?? []), assessment]);
  return assessment;
}

describe("report abuse", () => {
  const getUserForAdmin = tenancyAdmin.getUserForAdmin;
  const listUserMembershipsForAdmin = tenancyAdmin.listUserMembershipsForAdmin;
  const userId = newId("user");
  const owned = newId("org");
  const joined = newId("org");

  function form(fields: Record<string, string>) {
    const data = new FormData();
    data.set("category", "spam");
    data.set("reason", "Bought list");
    for (const [name, value] of Object.entries(fields)) data.set(name, value);
    return data;
  }

  beforeEach(() => {
    signUps.clear();
    scope = signUpScope;
    for (const fn of [
      audit,
      mutate,
      recordRiskFeedback,
      suspendOrganization,
      revokeApiKeyAsAdmin,
      planOrganizationTakedown,
    ]) {
      fn.mockClear();
    }
    getUserForAdmin.mockImplementation(async () => ({
      id: userId,
      email: "Spammer@x.test",
      role: "user",
      banned: false,
    }));
    listUserMembershipsForAdmin.mockImplementation(async () => [
      { organization: { id: owned }, role: "owner" },
      { organization: { id: joined }, role: "member" },
    ]);
    planOrganizationTakedown.mockImplementation(async () => ({
      suspended: false,
      deleting: false,
      apiKeys: [{ id: "key_1" }],
      members: [{ userId, email: "Spammer@x.test", role: "owner", keptBecause: "also in Other" }],
    }));
  });

  test("reports one sign-up without touching the account", async () => {
    const assessment = signUp("spammer@x.test");
    const result = await actions.reportAbuseAction(
      null,
      form({ assessmentId: assessment.id, userId }),
    );
    expect(result).toEqual({
      ok: true,
      data: { takenDown: false, organizations: 0, reported: 1 },
    });
    expect(recordRiskFeedback.mock.calls[0]?.[3]).toEqual({
      outcome: "abuse",
      note: "Spam: Bought list",
    });
    expect(mutate).not.toHaveBeenCalled();
    expect(planOrganizationTakedown).not.toHaveBeenCalled();

    // Reporting it again records nothing.
    expect(
      await actions.reportAbuseAction(null, form({ assessmentId: assessment.id, userId })),
    ).toEqual({ ok: false, error: "This sign-up is already reported." });
    expect(recordRiskFeedback).toHaveBeenCalledTimes(1);
  });

  test("refuses a sign-up outside coss.com's sign-up environment", async () => {
    expect(await actions.reportAbuseAction(null, form({ assessmentId: newId("rsk") }))).toEqual({
      ok: false,
      error: "Sign-up not found.",
    });
    scope = null;
    expect((await actions.reportAbuseAction(null, form({ userId }))).ok).toBe(false);
    expect(recordRiskFeedback).not.toHaveBeenCalled();
  });

  test("takes down the checked organizations it belongs to, bans the user and reports them", async () => {
    const assessment = signUp("spammer@x.test");
    const outsider = newId("org");
    const result = await actions.reportAbuseAction(
      null,
      form({
        assessmentId: assessment.id,
        userId,
        takeDown: "on",
        [`organization:${owned}`]: "on",
        // Not a membership of this user: ignored.
        [`organization:${outsider}`]: "on",
      }),
    );
    expect(result).toEqual({
      ok: true,
      data: { takenDown: true, organizations: 1, reported: 1 },
    });
    expect(planOrganizationTakedown.mock.calls.map(([id]) => id)).toEqual([owned]);
    expect(suspendOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: owned, category: "spam" }),
    );
    // The plan kept them for another organization; as the target they are banned anyway.
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ body: { userId, banReason: "Bought list" } }),
    );
    expect(assessment.outcome).toBe("abuse");
    expect(audit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "user.take_down",
        target: { type: "user", id: userId },
        metadata: expect.objectContaining({
          category: "spam",
          organizationIds: [owned],
          bannedUserIds: [userId],
          revokedKeyIds: ["key_1"],
          reportedAssessmentIds: [assessment.id],
        }),
      }),
    );
  });

  test("doesn't ban an already banned user again, and works without sign-up assessments", async () => {
    scope = null;
    getUserForAdmin.mockImplementation(async () => ({
      id: userId,
      email: "spammer@x.test",
      role: null,
      banned: true,
    }));
    const result = await actions.reportAbuseAction(null, form({ userId, takeDown: "on" }));
    expect(result).toEqual({
      ok: true,
      data: { takenDown: true, organizations: 0, reported: 0 },
    });
    expect(mutate).not.toHaveBeenCalled();
    expect(planOrganizationTakedown).not.toHaveBeenCalled();
  });

  test("refuses platform admins and coss.com's own organization", async () => {
    getUserForAdmin.mockImplementation(async () => ({
      id: userId,
      email: "staff@x.test",
      role: "admin",
      banned: false,
    }));
    expect(await actions.reportAbuseAction(null, form({ userId, takeDown: "on" }))).toEqual({
      ok: false,
      error: "Platform admins can't be taken down: remove the admin role first.",
    });

    getUserForAdmin.mockImplementation(async () => ({
      id: userId,
      email: "spammer@x.test",
      role: "user",
      banned: false,
    }));
    listUserMembershipsForAdmin.mockImplementation(async () => [
      { organization: { id: systemOrgId }, role: "member" },
    ]);
    expect(
      await actions.reportAbuseAction(
        null,
        form({ userId, takeDown: "on", [`organization:${systemOrgId}`]: "on" }),
      ),
    ).toEqual({ ok: false, error: SYSTEM_ORGANIZATION_MESSAGE });
    expect(mutate).not.toHaveBeenCalled();
    expect(suspendOrganization).not.toHaveBeenCalled();
  });

  test("marks a false positive legitimate", async () => {
    const assessment = signUp("person@x.test", { decision: "block", outcome: "abuse" });
    const data = new FormData();
    data.set("assessmentId", assessment.id);
    expect(await actions.markSignUpLegitimateAction(null, data)).toEqual({ ok: true, data: null });
    expect(assessment.outcome).toBe("legitimate");
    expect(audit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "risk_assessment.mark_legitimate",
        metadata: { email: "person@x.test", previousOutcome: "abuse", decision: "block" },
      }),
    );
  });
});

const emails = await import("../src/app/admin/emails/actions");

describe("email content", () => {
  beforeEach(() => {
    audit.mockClear();
    emailContent.mockClear();
  });

  test("returns the content and records the view", async () => {
    const data = new FormData();
    data.set("emailId", newId("email"));
    expect(await emails.revealEmailContentAction(null, data)).toEqual({
      ok: true,
      data: { html: "<p>Win</p>", text: "Win" },
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "email.view_content",
        target: { type: "email", id: data.get("emailId") },
        organizationId: emailContext.organizationId,
      }),
    );
  });

  test("refuses anything but an email id, without recording a view", async () => {
    const data = new FormData();
    data.set("emailId", newId("user"));
    expect((await emails.revealEmailContentAction(null, data)).ok).toBe(false);
    expect(emailContent).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});

describe("HIPAA mode", () => {
  function hipaaForm(fields: Record<string, string> = {}) {
    const data = new FormData();
    data.set("organizationId", newId("org"));
    data.set("baaSignedAt", "2026-10-30");
    data.set("baaReference", "BAA-2026-014");
    data.set("reason", "Contract signed");
    for (const [name, value] of Object.entries(fields)) data.set(name, value);
    return data;
  }

  beforeEach(() => {
    audit.mockClear();
    emailContent.mockClear();
    enableHipaaMode.mockClear();
    disableHipaaMode.mockClear();
    planHas.mockClear();
    planHas.mockImplementation(async () => true);
    isMemberOfHipaaOrganization.mockImplementation(async () => false);
    emailContext.hipaaMode = false;
  });

  test("turning it on passes the BAA and the actor along", async () => {
    expect(await actions.enableHipaaModeAction(null, hipaaForm())).toEqual({
      ok: true,
      data: null,
    });
    expect(enableHipaaMode).toHaveBeenCalledWith(
      expect.objectContaining({
        baaReference: "BAA-2026-014",
        baaSignedAt: new Date("2026-10-30"),
        reason: "Contract signed",
      }),
    );
  });

  test("it needs the audit log on the plan, and a reason", async () => {
    planHas.mockImplementation(async () => false);
    expect((await actions.enableHipaaModeAction(null, hipaaForm())).ok).toBe(false);
    planHas.mockImplementation(async () => true);
    expect((await actions.enableHipaaModeAction(null, hipaaForm({ reason: " " }))).ok).toBe(false);
    expect(enableHipaaMode).not.toHaveBeenCalled();
  });

  test("coss.com's own organization can't be put in it", async () => {
    const data = hipaaForm({ organizationId: systemOrgId });
    expect((await actions.enableHipaaModeAction(null, data)).ok).toBe(false);
    expect(enableHipaaMode).not.toHaveBeenCalled();
  });

  test("turning it off needs a reason", async () => {
    expect((await actions.disableHipaaModeAction(null, hipaaForm({ reason: " " }))).ok).toBe(false);
    expect(disableHipaaMode).not.toHaveBeenCalled();
    expect(await actions.disableHipaaModeAction(null, hipaaForm())).toEqual({
      ok: true,
      data: null,
    });
    expect(disableHipaaMode).toHaveBeenCalledTimes(1);
  });

  test("staff can't impersonate a member, and nothing is recorded as done", async () => {
    isMemberOfHipaaOrganization.mockImplementation(async () => true);
    mutate.mockClear();
    const data = new FormData();
    data.set("userId", newId("user"));
    data.set("reason", "Debugging a ticket");
    expect((await actions.impersonateUserAction(null, data)).ok).toBe(false);
    expect(mutate).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  test("staff can't reveal content, which isn't even read", async () => {
    emailContext.hipaaMode = true;
    const data = new FormData();
    data.set("emailId", newId("email"));
    expect((await emails.revealEmailContentAction(null, data)).ok).toBe(false);
    expect(emailContent).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});
