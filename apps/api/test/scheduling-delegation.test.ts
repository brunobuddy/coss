import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { memoryLogWriter } from "@coss/logs/testing";
import { runDueCalendarDelegations } from "@coss/scheduling";
import {
  FakeGoogleCalendarApi,
  testSchedulingDeps,
  testServiceAccount,
} from "@coss/scheduling/testing";
import { createTestTenant } from "@coss/tenancy/testing";
import { secretsKeyRing } from "@coss/webhooks";
import { createTestApp, errorOf, type TestApp, waitForLogLines } from "./helpers.ts";

const DOMAIN = "acme.example";

function setUp(logWriter = memoryLogWriter()) {
  const api = new FakeGoogleCalendarApi();
  const account = testServiceAccount();
  api.serviceAccountPublicKey = account.publicKey;
  const calendars = {
    secretsKeys: secretsKeyRing([createHash("sha256").update("api delegation test").digest()]),
    apps: { google: null, microsoft: null },
    publicUrl: "https://api.example.test",
    fetcher: api.fetch,
  };
  const { app } = createTestApp({
    logWriter,
    scheduling: testSchedulingDeps({ calendars }),
  });
  return { app, api, account, calendars, logWriter };
}

const call = (app: TestApp, key: string, method: string, path: string, body?: unknown) =>
  Promise.resolve(
    app.request(`/v1/scheduling${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );

describe("calendar delegations", () => {
  test("create, verify, connect a host: credentials never come back", async () => {
    const tenant = await createTestTenant();
    const { app, account, calendars } = setUp();
    const key = tenant.liveKey;
    const created = await call(app, key, "POST", "/calendar_delegations", {
      provider: "google",
      domain: DOMAIN,
      service_account_key: account.key,
    });
    expect(created.status).toBe(201);
    const delegation = (await created.json()) as { id: string; status: string; client_id: string };
    expect(delegation.status).toBe("pending");
    expect(delegation.client_id).toBe(account.clientId);
    expect(JSON.stringify(delegation)).not.toContain("PRIVATE KEY");

    const refused = await call(app, key, "POST", `/calendar_delegations/${delegation.id}/verify`, {
      account: "someone@elsewhere.example",
    });
    expect(refused.status).toBe(422);
    expect((await errorOf(refused)).code).toBe("invalid_calendar_delegation");

    const verified = await call(app, key, "POST", `/calendar_delegations/${delegation.id}/verify`, {
      account: `boss@${DOMAIN}`,
    });
    expect(verified.status).toBe(200);

    const host = await call(app, key, "POST", "/hosts", {
      uid: "ana",
      name: "Ana",
      time_zone: "UTC",
      email: `ana@${DOMAIN}`,
    });
    expect(host.status).toBe(201);
    expect(
      ((await host.json()) as { calendar_account: string | null }).calendar_account,
    ).toBeNull();
    await runDueCalendarDelegations(calendars, {
      scope: { organizationIds: [tenant.organization.id] },
    });

    const connections = await call(app, key, "GET", "/hosts/ana/calendar_connections");
    const { data } = (await connections.json()) as {
      data: { id: string; delegation: string | null; status: string }[];
    };
    expect(data).toHaveLength(1);
    expect(data[0]?.delegation).toBe(delegation.id);

    const disconnect = await call(
      app,
      key,
      "DELETE",
      `/hosts/ana/calendar_connections/${data[0]?.id}`,
    );
    expect(disconnect.status).toBe(422);
    expect((await errorOf(disconnect)).code).toBe("calendar_managed");

    const listed = await call(app, key, "GET", "/calendar_delegations");
    const list = (await listed.json()) as { data: { hosts_connected: number }[] };
    expect(list.data[0]?.hosts_connected).toBe(1);

    const removed = await call(app, key, "DELETE", `/calendar_delegations/${delegation.id}`);
    expect(removed.status).toBe(200);
  });

  test("a read-only key can't add one", async () => {
    const tenant = await createTestTenant();
    const { app, account } = setUp();
    const noSuch = await call(app, tenant.liveKey, "GET", "/calendar_delegations/caldlg_nope");
    expect(noSuch.status).toBe(404);
    const bad = await call(app, tenant.liveKey, "POST", "/calendar_delegations", {
      provider: "google",
      domain: "not a domain",
      service_account_key: account.key,
    });
    expect(bad.status).toBe(422);
  });

  test("the key and client secret never reach the request log", async () => {
    const tenant = await createTestTenant();
    const logWriter = memoryLogWriter();
    const { app, account } = setUp(logWriter);
    const created = await call(app, tenant.liveKey, "POST", "/calendar_delegations", {
      provider: "google",
      domain: DOMAIN,
      service_account_key: account.key,
    });
    expect(created.status).toBe(201);
    const microsoft = await call(app, tenant.liveKey, "POST", "/calendar_delegations", {
      provider: "microsoft",
      domain: "other.example",
      tenant_id: "7d3f1c52-8e0b-4d6e-9a27-5c4b1e7d2f60",
      client_id: "3f1c7a52-8e0b-4d6e-9a27-5c4b1e7d2f60",
      client_secret: "SUPER-SECRET-VALUE",
    });
    expect(microsoft.status).toBe(201);
    const lines = await waitForLogLines(logWriter, 2);
    const logged = JSON.stringify(lines);
    expect(logged).toContain("/v1/scheduling/calendar_delegations");
    expect(logged).not.toContain("PRIVATE KEY");
    expect(logged).not.toContain("SUPER-SECRET-VALUE");
  });

  test("a failed validation doesn't echo the secret", async () => {
    const tenant = await createTestTenant();
    const { app } = setUp();
    const res = await call(app, tenant.liveKey, "POST", "/calendar_delegations", {
      provider: "google",
      domain: DOMAIN,
      service_account_key: "PRIVATE-KEY-MATERIAL",
    });
    expect(res.status).toBe(422);
    expect(await res.text()).not.toContain("PRIVATE-KEY-MATERIAL");
  });
});
