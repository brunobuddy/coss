import { describe, expect, test } from "bun:test";
import { defaultKeyHasher } from "@better-auth/api-key";
import { auth } from "@coss/auth";
import {
  API_KEY_PERMISSIONS,
  API_KEY_PREFIX,
  API_KEY_VISIBLE_CHARACTERS,
} from "@coss/auth/constants";
import { db, schema } from "@coss/db";
import { newId } from "@coss/db/id";
import { versioning } from "@coss/versioning";
import { eq } from "drizzle-orm";
import {
  apiKeyHasPermissions,
  authenticateApiKey,
  createEnvironmentApiKey,
  getApiKeyEnvironmentSummary,
  getKeyBinding,
  type KeyPermissions,
  LAST_USED_RESOLUTION_MS,
  listEnvironmentApiKeys,
  TenancyError,
} from "../src/index.ts";
import { addMember, createTestTenant, createTestUser } from "../src/testing.ts";

const KEY_FORMAT = /^coss_(live|test)_[A-Za-z]{64}$/;

async function keyIdOf(rawKey: string): Promise<string> {
  const [row] = await db
    .select({ id: schema.apikey.id })
    .from(schema.apikey)
    .where(eq(schema.apikey.key, await defaultKeyHasher(rawKey)));
  if (!row) throw new Error("key not found");
  return row.id;
}

/** A key minted straight through Better Auth, i.e. without an environment binding. */
async function createUnboundKey(organizationId: string, userId: string, prefix: string) {
  return auth.api.createApiKey({ body: { organizationId, userId, name: "unbound", prefix } });
}

async function expectTenancyError(promise: Promise<unknown>, code: TenancyError["code"]) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(TenancyError);
  expect((error as TenancyError).code).toBe(code);
}

describe("createEnvironmentApiKey", () => {
  test("prefixes keys by environment mode", async () => {
    const tenant = await createTestTenant();
    expect(tenant.liveKey).toMatch(KEY_FORMAT);
    expect(tenant.liveKey).toStartWith(API_KEY_PREFIX.live);
    expect(tenant.sandboxKey).toMatch(KEY_FORMAT);
    expect(tenant.sandboxKey).toStartWith(API_KEY_PREFIX.sandbox);

    const created = await createEnvironmentApiKey({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
      name: "  CI  ",
      userId: tenant.owner.id,
      permissions: "full",
    });
    expect(created.id).toStartWith("key_");
    expect(created.name).toBe("CI");
    expect(created.start).toBe(created.key.slice(0, API_KEY_VISIBLE_CHARACTERS));
    expect(
      await getKeyBinding({ organizationId: tenant.organization.id, keyId: created.id }),
    ).toEqual({
      apiKeyId: created.id,
      name: "CI",
      environmentId: tenant.development.id,
      projectId: tenant.project.id,
      ownerUserId: null,
    });
  });

  test("environment of another organization is not_found", async () => {
    const a = await createTestTenant();
    const b = await createTestTenant();
    await expectTenancyError(
      createEnvironmentApiKey({
        organizationId: a.organization.id,
        environmentId: b.production.id,
        name: "steal",
        userId: a.owner.id,
        permissions: "full",
      }),
      "not_found",
    );
  });

  test("validates the name", async () => {
    const tenant = await createTestTenant();
    for (const name of ["x".repeat(33), "   "]) {
      await expectTenancyError(
        createEnvironmentApiKey({
          organizationId: tenant.organization.id,
          environmentId: tenant.development.id,
          name,
          userId: tenant.owner.id,
          permissions: "full",
        }),
        "invalid",
      );
    }
  });

  test("members and outsiders may not create organization keys; admins may", async () => {
    const tenant = await createTestTenant();
    const member = await createTestUser();
    const admin = await createTestUser();
    const outsider = await createTestUser();
    await addMember({ organizationId: tenant.organization.id, userId: member.id, role: "member" });
    await addMember({ organizationId: tenant.organization.id, userId: admin.id, role: "admin" });

    const create = (userId: string) =>
      createEnvironmentApiKey({
        organizationId: tenant.organization.id,
        environmentId: tenant.production.id,
        name: "role check",
        userId,
        permissions: "full",
      });

    await expectTenancyError(create(member.id), "forbidden");
    await expectTenancyError(create(outsider.id), "forbidden");
    const created = await create(admin.id);
    expect(created.key).toStartWith(API_KEY_PREFIX.live);
  });
});

describe("authenticateApiKey", () => {
  test("accepts both keys with their environment context", async () => {
    const tenant = await createTestTenant();

    expect(await authenticateApiKey(tenant.liveKey)).toEqual({
      ok: true,
      context: {
        apiKeyId: await keyIdOf(tenant.liveKey),
        organizationId: tenant.organization.id,
        projectId: tenant.project.id,
        environmentId: tenant.production.id,
        ownerUserId: null,
        mode: "live",
        hipaaMode: false,
        apiVersion: versioning.latest,
      },
    });
    expect(await authenticateApiKey(tenant.sandboxKey)).toEqual({
      ok: true,
      context: {
        apiKeyId: await keyIdOf(tenant.sandboxKey),
        organizationId: tenant.organization.id,
        projectId: tenant.project.id,
        environmentId: tenant.development.id,
        ownerUserId: null,
        mode: "sandbox",
        hipaaMode: false,
        apiVersion: versioning.latest,
      },
    });
  });

  test("rejects malformed and unknown keys", async () => {
    const tenant = await createTestTenant();
    const malformed = [
      null,
      undefined,
      "",
      "garbage",
      `Bearer ${tenant.sandboxKey}`,
      tenant.sandboxKey.slice(0, -1),
      `${tenant.sandboxKey}a`,
      `coss_prod_${"a".repeat(64)}`,
      `coss_test_${"a".repeat(63)}1`,
    ];
    for (const key of malformed) {
      expect(await authenticateApiKey(key)).toEqual({ ok: false, reason: "invalid" });
    }
    // Well-formed but never issued.
    expect(await authenticateApiKey(`coss_test_${"A".repeat(64)}`)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  test("rejects deleted and disabled keys", async () => {
    const tenant = await createTestTenant();
    expect((await authenticateApiKey(tenant.liveKey)).ok).toBe(true);
    expect((await authenticateApiKey(tenant.sandboxKey)).ok).toBe(true);

    await db.delete(schema.apikey).where(eq(schema.apikey.id, await keyIdOf(tenant.liveKey)));
    expect(await authenticateApiKey(tenant.liveKey)).toEqual({ ok: false, reason: "invalid" });

    await db
      .update(schema.apikey)
      .set({ enabled: false })
      .where(eq(schema.apikey.id, await keyIdOf(tenant.sandboxKey)));
    expect(await authenticateApiKey(tenant.sandboxKey)).toEqual({ ok: false, reason: "invalid" });
  });

  test("rejects expired keys", async () => {
    const tenant = await createTestTenant();
    const keyId = await keyIdOf(tenant.sandboxKey);
    await db
      .update(schema.apikey)
      .set({ expiresAt: new Date(Date.now() + 60_000) })
      .where(eq(schema.apikey.id, keyId));
    expect((await authenticateApiKey(tenant.sandboxKey)).ok).toBe(true);

    // Last: any key created elsewhere on this database makes Better Auth delete expired rows.
    await db
      .update(schema.apikey)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.apikey.id, keyId));
    expect(await authenticateApiKey(tenant.sandboxKey)).toEqual({ ok: false, reason: "invalid" });
  });

  test("rejects keys with a usage quota (not supported by the read-only check)", async () => {
    const tenant = await createTestTenant();
    await db
      .update(schema.apikey)
      .set({ remaining: 100 })
      .where(eq(schema.apikey.id, await keyIdOf(tenant.sandboxKey)));
    expect(await authenticateApiKey(tenant.sandboxKey)).toEqual({ ok: false, reason: "invalid" });
  });

  test("rejects a key whose stored prefix does not match its environment", async () => {
    const tenant = await createTestTenant();
    await db
      .update(schema.apikey)
      .set({ prefix: API_KEY_PREFIX.live })
      .where(eq(schema.apikey.id, await keyIdOf(tenant.sandboxKey)));
    expect(await authenticateApiKey(tenant.sandboxKey)).toEqual({ ok: false, reason: "invalid" });
  });

  test("records usage at most once a minute per key", async () => {
    const tenant = await createTestTenant();
    const keyId = await keyIdOf(tenant.sandboxKey);
    const lastRequestOf = async () => {
      const [row] = await db
        .select({ lastRequest: schema.apikey.lastRequest, updatedAt: schema.apikey.updatedAt })
        .from(schema.apikey)
        .where(eq(schema.apikey.id, keyId));
      return row;
    };
    const before = await lastRequestOf();
    expect(before?.lastRequest).toBeNull();

    expect((await authenticateApiKey(tenant.sandboxKey)).ok).toBe(true);
    const first = await lastRequestOf();
    expect(first?.lastRequest).toBeInstanceOf(Date);
    // Only `last_request` is written; `updated_at` reflects real changes to the key.
    expect(first?.updatedAt).toEqual(before?.updatedAt);

    expect((await authenticateApiKey(tenant.sandboxKey)).ok).toBe(true);
    expect((await lastRequestOf())?.lastRequest).toEqual(first?.lastRequest);

    const stale = new Date(Date.now() - LAST_USED_RESOLUTION_MS - 1_000);
    await db.update(schema.apikey).set({ lastRequest: stale }).where(eq(schema.apikey.id, keyId));
    expect((await authenticateApiKey(tenant.sandboxKey)).ok).toBe(true);
    const refreshed = (await lastRequestOf())?.lastRequest;
    expect(refreshed?.getTime()).toBeGreaterThan(stale.getTime() + LAST_USED_RESOLUTION_MS);
  });

  test("rejected keys never record usage", async () => {
    const tenant = await createTestTenant();
    expect(await authenticateApiKey(tenant.sandboxKey, { billing: ["update"] })).toMatchObject({
      ok: false,
      reason: "forbidden",
    });
    const [summary] = await listEnvironmentApiKeys({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
    });
    expect(summary?.lastRequest).toBeNull();
  });

  test("rejects keys without an environment binding", async () => {
    const tenant = await createTestTenant();
    const unbound = await createUnboundKey(
      tenant.organization.id,
      tenant.owner.id,
      API_KEY_PREFIX.sandbox,
    );
    expect(unbound.key).toMatch(KEY_FORMAT);
    expect(await authenticateApiKey(unbound.key)).toEqual({ ok: false, reason: "invalid" });
  });

  test("rejects a key bound to an environment whose mode does not match its prefix", async () => {
    const tenant = await createTestTenant();
    const sandboxPrefixed = await createUnboundKey(
      tenant.organization.id,
      tenant.owner.id,
      API_KEY_PREFIX.sandbox,
    );
    await db.insert(schema.environmentApiKey).values({
      apiKeyId: sandboxPrefixed.id,
      environmentId: tenant.production.id,
      access: "full",
    });
    expect(await authenticateApiKey(sandboxPrefixed.key)).toEqual({ ok: false, reason: "invalid" });
  });

  test("rejects a key bound to another organization's environment", async () => {
    const a = await createTestTenant();
    const b = await createTestTenant();
    const key = await createUnboundKey(a.organization.id, a.owner.id, API_KEY_PREFIX.sandbox);
    await db
      .insert(schema.environmentApiKey)
      .values({ apiKeyId: key.id, environmentId: b.development.id, access: "full" });
    expect(await authenticateApiKey(key.key)).toEqual({ ok: false, reason: "invalid" });
  });

  test("checks required permissions", async () => {
    const tenant = await createTestTenant();
    expect((await authenticateApiKey(tenant.sandboxKey, { email: ["send"] })).ok).toBe(true);
    expect((await authenticateApiKey(tenant.sandboxKey, { email: ["send", "read"] })).ok).toBe(
      true,
    );
    expect(
      (await authenticateApiKey(tenant.sandboxKey, { suppression: ["create", "read", "delete"] }))
        .ok,
    ).toBe(true);
    expect(await authenticateApiKey(tenant.sandboxKey, { billing: ["update"] })).toMatchObject({
      ok: false,
      reason: "forbidden",
    });
    expect(await authenticateApiKey(tenant.sandboxKey, { email: ["delete"] })).toMatchObject({
      ok: false,
      reason: "forbidden",
    });
  });

  test("malformed stored permissions grant a restricted key nothing", async () => {
    const tenant = await createTestTenant();
    const keyId = await keyIdOf(tenant.sandboxKey);
    await db
      .update(schema.environmentApiKey)
      .set({ access: "restricted" })
      .where(eq(schema.environmentApiKey.apiKeyId, keyId));
    for (const permissions of [null, "not json", "[]", '{"email":"send"}', '{"email":[1]}']) {
      await db.update(schema.apikey).set({ permissions }).where(eq(schema.apikey.id, keyId));
      expect(await authenticateApiKey(tenant.sandboxKey, { email: ["send"] })).toMatchObject({
        ok: false,
        reason: "forbidden",
      });
    }
  });

  test("a new key carries every product's default permissions", async () => {
    const tenant = await createTestTenant();
    for (const [resource, actions] of Object.entries(API_KEY_PERMISSIONS)) {
      expect((await authenticateApiKey(tenant.liveKey, { [resource]: actions })).ok).toBe(true);
    }
  });
});

describe("restricted keys", () => {
  test("hold exactly the permissions they were created with, in catalog order", async () => {
    const tenant = await createTestTenant();
    const created = await createEnvironmentApiKey({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
      name: "Sender",
      userId: tenant.owner.id,
      permissions: { log: ["read"], email: ["send", "send"], domain: [] },
    });
    expect(created.access).toBe("restricted");
    expect(created.permissions).toEqual({ email: ["send"], log: ["read"] });

    expect((await authenticateApiKey(created.key, { email: ["send"] })).ok).toBe(true);
    expect((await authenticateApiKey(created.key, { log: ["read"] })).ok).toBe(true);
    expect((await authenticateApiKey(created.key, {})).ok).toBe(true);
    const denied: KeyPermissions[] = [
      { email: ["read"] },
      { domain: ["read"] },
      { webhook: ["create"] },
    ];
    for (const required of denied) {
      expect(await authenticateApiKey(created.key, required)).toMatchObject({
        ok: false,
        reason: "forbidden",
      });
    }
    expect(await apiKeyHasPermissions(created.id, { email: ["send"] })).toBe(true);
    expect(await apiKeyHasPermissions(created.id, { broadcast: ["send"] })).toBe(false);

    const keys = await listEnvironmentApiKeys({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
    });
    expect(keys.find((key) => key.id === created.id)).toMatchObject({
      access: "restricted",
      permissions: { email: ["send"], log: ["read"] },
    });
    const summary = await getApiKeyEnvironmentSummary({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
      apiKeyId: created.id,
    });
    expect(summary?.apiKey).toMatchObject({
      access: "restricted",
      permissions: { email: ["send"], log: ["read"] },
    });
  });

  test("refuses unknown and empty permissions without creating a key", async () => {
    const tenant = await createTestTenant();
    const invalid: KeyPermissions[] = [
      {},
      { email: [] },
      { video: ["send"] },
      { email: ["delete"] },
    ];
    for (const permissions of invalid) {
      await expectTenancyError(
        createEnvironmentApiKey({
          organizationId: tenant.organization.id,
          environmentId: tenant.development.id,
          name: "Invalid",
          userId: tenant.owner.id,
          permissions,
        }),
        "invalid",
      );
    }
    const keys = await listEnvironmentApiKeys({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
    });
    expect(keys.map((key) => key.name)).toEqual(["Test sandbox key"]);
  });

  test("a binding written without access (older code mid-rollout) has full access", async () => {
    const tenant = await createTestTenant();
    const key = await createUnboundKey(
      tenant.organization.id,
      tenant.owner.id,
      API_KEY_PREFIX.sandbox,
    );
    await db
      .insert(schema.environmentApiKey)
      .values({ apiKeyId: key.id, environmentId: tenant.development.id });
    expect((await authenticateApiKey(key.key, { hook: ["send"] })).ok).toBe(true);
  });

  test("full-access keys follow the catalog, whatever they stored", async () => {
    const tenant = await createTestTenant();
    const keyId = await keyIdOf(tenant.sandboxKey);
    // As if the key predated every product but email: full access still covers them.
    await db
      .update(schema.apikey)
      .set({ permissions: '{"email":["send"]}' })
      .where(eq(schema.apikey.id, keyId));
    expect((await authenticateApiKey(tenant.sandboxKey, { domain: ["create"] })).ok).toBe(true);
    expect(await apiKeyHasPermissions(keyId, { broadcast: ["send"] })).toBe(true);
    const summary = await getApiKeyEnvironmentSummary({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
      apiKeyId: keyId,
    });
    expect(summary?.apiKey).toMatchObject({ access: "full", permissions: API_KEY_PERMISSIONS });
  });
});

describe("listing and bindings are organization-scoped", () => {
  test("listEnvironmentApiKeys never exposes the hash", async () => {
    const tenant = await createTestTenant();
    const other = await createTestTenant();
    const second = await createEnvironmentApiKey({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
      name: "Second",
      userId: tenant.owner.id,
      permissions: "full",
    });

    const keys = await listEnvironmentApiKeys({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
    });
    expect(keys.map((k) => k.name)).toEqual(["Second", "Test sandbox key"]);
    expect(keys[0]).toEqual({
      id: second.id,
      name: "Second",
      start: second.start,
      enabled: true,
      lastRequest: null,
      createdAt: expect.any(Date),
      createdByUserId: tenant.owner.id,
      owner: null,
      access: "full",
      permissions: API_KEY_PERMISSIONS,
    });
    const hash = await defaultKeyHasher(second.key);
    expect(JSON.stringify(keys)).not.toContain(hash);
    expect(JSON.stringify(keys)).not.toContain(second.key);

    expect(
      await listEnvironmentApiKeys({
        organizationId: other.organization.id,
        environmentId: tenant.development.id,
      }),
    ).toEqual([]);
  });

  test("getKeyBinding", async () => {
    const tenant = await createTestTenant();
    const other = await createTestTenant();
    const keyId = await keyIdOf(tenant.liveKey);

    expect(await getKeyBinding({ organizationId: tenant.organization.id, keyId })).toEqual({
      apiKeyId: keyId,
      name: "Test live key",
      environmentId: tenant.production.id,
      projectId: tenant.project.id,
      ownerUserId: null,
    });
    expect(await getKeyBinding({ organizationId: other.organization.id, keyId })).toBeNull();
    expect(
      await getKeyBinding({ organizationId: tenant.organization.id, keyId: newId("key") }),
    ).toBeNull();
  });
});
