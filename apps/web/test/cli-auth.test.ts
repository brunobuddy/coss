import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

class TenancyError extends Error {}
type Redemption =
  | {
      ok: true;
      grant: {
        user: { id: string; email: string };
        organizationId: string;
        environment: { id: string; projectId: string; mode: "live" | "sandbox" };
        name: string;
      };
    }
  | { ok: false; error: "invalid_grant" | "access_denied"; message: string };
let redemption: Redemption;
const redeem = mock(async (_input: { code: string; codeVerifier: string }) => redemption);
const created = mock(
  async (input: {
    organizationId: string;
    environmentId: string;
    name: string;
    userId: string;
    ownerUserId?: string | null;
    permissions: unknown;
  }) => ({
    id: "key_1",
    key: "coss_test_secret",
    start: "coss_test_se",
    name: input.name,
    access: "full" as const,
  }),
);
mock.module("@coss/tenancy", () => ({
  touchHipaaSession: async () => "active",
  TenancyError,
  redeemCliAuthorization: redeem,
  createEnvironmentApiKey: created,
}));
let suspended = false;
mock.module("@coss/reputation", () => ({ isSuspended: async () => suspended }));
const audited = mock(async (_actor: unknown, _input: unknown) => {});
mock.module("@/lib/audit", () => ({ recordUserAudit: audited }));
let allowed = true;
mock.module("@/lib/rate-limit-runtime", () => ({
  rateLimitRuntime: () => ({
    clientIp: () => "203.0.113.9",
    limiter: { consume: async () => ({ allowed, retryAfterMs: allowed ? 0 : 12_000 }) },
  }),
}));

const token = await import("../src/app/api/cli/v1/token/route");
const { parseCliAuthorizeParams, cliAuthorizePath } = await import(
  "../src/app/app/authorize/cli/params"
);

const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const STATE = "state-1234567890abcdef";

function exchange(body: unknown) {
  return token.POST(
    new Request("http://localhost:3000/api/cli/v1/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function grant(mode: "live" | "sandbox" = "sandbox"): Redemption {
  return {
    ok: true,
    grant: {
      user: { id: "user_1", email: "ada@example.com" },
      organizationId: "org_1",
      environment: { id: "env_1", projectId: "proj_1", mode },
      name: "coss CLI · laptop",
    },
  };
}

beforeEach(() => {
  redemption = grant();
  suspended = false;
  allowed = true;
  redeem.mockClear();
  created.mockClear();
  audited.mockClear();
});

describe("POST /api/cli/v1/token", () => {
  test("exchanges a code for a new key of the approved environment, once", async () => {
    const res = await exchange({ code: "c".repeat(43), code_verifier: "v".repeat(43) });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      api_key: "coss_test_secret",
      api_key_id: "key_1",
      name: "coss CLI · laptop",
      organization_id: "org_1",
      environment_id: "env_1",
    });
    expect(redeem.mock.calls[0]?.[0]).toEqual({
      code: "c".repeat(43),
      codeVerifier: "v".repeat(43),
    });
    expect(created.mock.calls[0]?.[0]).toEqual({
      organizationId: "org_1",
      environmentId: "env_1",
      name: "coss CLI · laptop",
      userId: "user_1",
      ownerUserId: "user_1",
      permissions: "full",
    });
    expect(audited.mock.calls[0]).toEqual([
      { id: "user_1", email: "ada@example.com" },
      expect.objectContaining({
        action: "api_key.created",
        environmentId: "env_1",
        metadata: { mode: "sandbox", via: "cli", access: "full", owner_user_id: "user_1" },
      }),
    ]);
  });

  test("refusals create nothing", async () => {
    expect((await exchange({ code: "x" })).status).toBe(400);

    redemption = { ok: false, error: "invalid_grant", message: "expired" };
    const expired = await exchange({ code: "c", code_verifier: "v" });
    expect(expired.status).toBe(400);
    expect(await expired.json()).toEqual({ error: { code: "invalid_grant", message: "expired" } });

    redemption = grant("live");
    suspended = true;
    const live = await exchange({ code: "c", code_verifier: "v" });
    expect(((await live.json()) as { error: { code: string } }).error.code).toBe("access_denied");

    allowed = false;
    const limited = await exchange({ code: "c", code_verifier: "v" });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("12");
    expect(created).not.toHaveBeenCalled();
  });

  test("a refusal while creating the key is an access_denied", async () => {
    created.mockImplementationOnce(async () => {
      throw new TenancyError("This organization is suspended.");
    });
    const res = await exchange({ code: "c", code_verifier: "v" });
    expect(await res.json()).toEqual({
      error: { code: "access_denied", message: "This organization is suspended." },
    });
    expect(audited).not.toHaveBeenCalled();
  });
});

describe("the approval page's parameters", () => {
  test("take a loopback port or the display-code mode, nothing else", () => {
    const base = { code_challenge: CHALLENGE, state: STATE };
    expect(parseCliAuthorizeParams({ ...base, port: "53682", host: "bailey's <mbp>" })).toEqual({
      codeChallenge: CHALLENGE,
      state: STATE,
      port: 53682,
      host: "baileys mbp",
      project: "",
    });
    // `coss init`'s project hint: cleaned like the host, and kept across the sign-in redirect.
    const init = parseCliAuthorizeParams({ ...base, mode: "code", project: "<my-app>/web" });
    expect(init?.project).toBe("my-appweb");
    expect(init && cliAuthorizePath(init)).toBe(
      `/app/authorize/cli?code_challenge=${CHALLENGE}&state=${STATE}&mode=code&project=my-appweb`,
    );
    expect(parseCliAuthorizeParams({ ...base, mode: "code" })?.port).toBeNull();
    for (const bad of [
      { ...base },
      { ...base, port: "80" },
      { ...base, port: "99999" },
      { ...base, port: "3000", mode: "code" },
      { ...base, mode: "url", port: "3000" },
      { ...base, port: "https://evil.example" },
      { code_challenge: "short", state: STATE, port: "3000" },
    ]) {
      expect(parseCliAuthorizeParams(bad)).toBeNull();
    }
    const params = parseCliAuthorizeParams({ ...base, port: "53682", host: "mbp" });
    expect(params && cliAuthorizePath(params)).toBe(
      `/app/authorize/cli?code_challenge=${CHALLENGE}&state=${STATE}&port=53682&host=mbp`,
    );
  });
});
