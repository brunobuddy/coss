import { describe, expect, test } from "bun:test";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { createPlanGate } from "@coss/billing";
import { createTestContract } from "@coss/billing/testing";
import {
  type CalendarDeps,
  completeCalendarAuthorization,
  createHost,
  listConnections,
  type SchedulingEnvironment,
  startCalendarAuthorization,
} from "@coss/scheduling";
import { FakeGoogleCalendarApi, FakeZoomApi, testSchedulingDeps } from "@coss/scheduling/testing";
import { createTestTenant } from "@coss/tenancy/testing";
import { secretsKeyRing } from "@coss/webhooks";
import { createTestApp, errorOf } from "./helpers.ts";

const keys = secretsKeyRing([createHash("sha256").update("api oauth apps").digest()]);

function calendars(fetcher: NonNullable<CalendarDeps["fetcher"]>): CalendarDeps {
  return {
    secretsKeys: keys,
    apps: {
      google: { clientId: "coss-google", clientSecret: "coss-secret" },
      microsoft: null,
      zoom: { clientId: "coss-zoom", clientSecret: "coss-zs", webhookSecret: "coss-token" },
    },
    publicUrl: "https://api.example.test",
    fetcher,
  };
}

async function appWith(
  fetcher: NonNullable<CalendarDeps["fetcher"]>,
  options: { plans?: ReturnType<typeof createPlanGate>; deps?: CalendarDeps } = {},
) {
  const tenant = await createTestTenant();
  const deps = options.deps ?? calendars(fetcher);
  const { app } = createTestApp({
    scheduling: testSchedulingDeps({ calendars: deps }),
    ...(options.plans ? { plans: options.plans } : {}),
  });
  const headers = {
    authorization: `Bearer ${tenant.liveKey}`,
    "content-type": "application/json",
  };
  const env: SchedulingEnvironment = {
    organizationId: tenant.organization.id,
    projectId: tenant.project.id,
    environmentId: tenant.production.id,
    mode: "live",
  };
  return { app, tenant, deps, headers, env };
}

const googleApp = JSON.stringify({
  provider: "google",
  client_id: "acme-google",
  client_secret: "acme-secret",
  redirect_uri: "https://acme.example/oauth/google",
});

const signed = (secret: string, body: string) => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const hash = createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex");
  return {
    "x-zm-request-timestamp": timestamp,
    "x-zm-signature": `v0=${hash}`,
    "content-type": "application/json",
  };
};

describe("/v1/scheduling/oauth_apps", () => {
  test("adding, reading, updating and deleting, and a secret never comes back", async () => {
    const api = new FakeGoogleCalendarApi();
    const { app, headers } = await appWith(api.fetch);
    const created = await app.request("/v1/scheduling/oauth_apps", {
      method: "POST",
      headers,
      body: googleApp,
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain("acme-secret");
    expect(body).toMatchObject({
      object: "scheduling.oauth_app",
      provider: "google",
      redirect_uri: "https://acme.example/oauth/google",
      coss_callback_url: "https://api.example.test/scheduling/oauth/google/callback",
      status: "active",
      zoom_event_url: null,
    });

    const listed = (await (await app.request("/v1/scheduling/oauth_apps", { headers })).json()) as {
      data: { id: string }[];
    };
    expect(listed.data.map((row) => row.id)).toEqual([body.id as string]);

    const patched = await app.request(`/v1/scheduling/oauth_apps/${body.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ completion_url: "https://acme.example/done" }),
    });
    expect(((await patched.json()) as { completion_url: string }).completion_url).toBe(
      "https://acme.example/done",
    );

    const removed = await app.request(`/v1/scheduling/oauth_apps/${body.id}`, {
      method: "DELETE",
      headers,
    });
    expect(await removed.json()).toEqual({
      object: "scheduling.oauth_app",
      id: body.id,
      deleted: true,
    });
  });

  test("a wrong secret is a 422, and an address that isn't https too", async () => {
    const api = new FakeGoogleCalendarApi();
    api.refusedSecret = "acme-secret";
    const { app, headers } = await appWith(api.fetch);
    const refused = await app.request("/v1/scheduling/oauth_apps", {
      method: "POST",
      headers,
      body: googleApp,
    });
    expect(refused.status).toBe(422);
    expect((await errorOf(refused)).code).toBe("oauth_app_refused");

    api.refusedSecret = null;
    const insecure = await app.request("/v1/scheduling/oauth_apps", {
      method: "POST",
      headers,
      body: JSON.stringify({
        provider: "google",
        client_id: "c",
        client_secret: "s",
        redirect_uri: "http://acme.example/oauth",
      }),
    });
    expect(insecure.status).toBe(422);
    expect((await errorOf(insecure)).code).toBe("invalid_oauth_app");
  });

  test("a tenant that isn't one can't reach the token URL", async () => {
    const urls: string[] = [];
    const { app, headers } = await appWith(async (url) => {
      urls.push(url);
      return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    });
    const res = await app.request("/v1/scheduling/oauth_apps", {
      method: "POST",
      headers,
      body: JSON.stringify({
        provider: "microsoft",
        client_id: "c",
        client_secret: "s",
        tenant_id: "evil.example/../../other?x=",
      }),
    });
    expect(res.status).toBe(422);
    expect(urls).toHaveLength(0);
  });

  test("adding one needs the Scale plan, in a sandbox too", async () => {
    const api = new FakeGoogleCalendarApi();
    const { app, headers, tenant } = await appWith(api.fetch, { plans: createPlanGate() });
    const create = (key: string) =>
      app.request("/v1/scheduling/oauth_apps", {
        method: "POST",
        headers: { ...headers, authorization: `Bearer ${key}` },
        body: googleApp,
      });
    for (const key of [tenant.liveKey, tenant.sandboxKey]) {
      const refused = await create(key);
      expect(refused.status).toBe(402);
      const error = await errorOf(refused);
      expect(error.code).toBe("plan_feature_unavailable");
      expect(error.message).toContain("Scale");
    }
    expect((await app.request("/v1/scheduling/oauth_apps", { headers })).status).toBe(200);

    await createTestContract(
      tenant.organization.id,
      { version: 1, plan: "scale" },
      { effectiveFrom: new Date("2026-01-01T00:00:00Z") },
    );
    expect((await create(tenant.liveKey)).status).toBe(201);
  });

  test("a sandbox key can't see a live environment's app", async () => {
    const api = new FakeGoogleCalendarApi();
    const { app, headers, tenant } = await appWith(api.fetch);
    const created = (await (
      await app.request("/v1/scheduling/oauth_apps", { method: "POST", headers, body: googleApp })
    ).json()) as { id: string };
    const res = await app.request(`/v1/scheduling/oauth_apps/${created.id}`, {
      headers: { authorization: `Bearer ${tenant.sandboxKey}` },
    });
    expect(res.status).toBe(404);
  });
});

describe("the forwarded callback", () => {
  test("a consent comes back through coss.com's callback and lands on the completion URL", async () => {
    const api = new FakeGoogleCalendarApi();
    const { app, headers, deps, env } = await appWith(api.fetch);
    await app.request("/v1/scheduling/oauth_apps", {
      method: "POST",
      headers,
      body: JSON.stringify({
        provider: "google",
        client_id: "acme-google",
        client_secret: "acme-secret",
        redirect_uri: "https://acme.example/oauth/google",
        completion_url: "https://acme.example/connected",
      }),
    });
    const host = await createHost(env, { name: "Dr. Reyes", time_zone: "UTC" });
    const { url } = await startCalendarAuthorization(
      env,
      host.id,
      { provider: "google", returnUrl: null },
      deps,
    );
    const state = new URL(url).searchParams.get("state") as string;
    // What the customer's forwarding page does: the same query string, on to coss.com's callback.
    const res = await app.request(
      `/scheduling/oauth/google/callback?code=code&state=${encodeURIComponent(state)}`,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://acme.example/connected?coss_calendar=connected",
    );
    expect(api.tokenRequests.at(-1)?.redirectUri).toBe("https://acme.example/oauth/google");
  });
});

describe("a customer's Zoom events", () => {
  async function connected() {
    const api = new FakeZoomApi();
    // The test database is shared, and coss.com's own events reach any organization's connections.
    api.userId = `zoom_${randomUUID()}`;
    const fixture = await appWith(api.fetch);
    const created = (await (
      await fixture.app.request("/v1/scheduling/oauth_apps", {
        method: "POST",
        headers: fixture.headers,
        body: JSON.stringify({
          provider: "zoom",
          client_id: "acme-zoom",
          client_secret: "acme-zs",
          webhook_secret: "acme-token",
        }),
      })
    ).json()) as { id: string; zoom_event_url: string };
    const host = await createHost(fixture.env, { name: "Dr. Reyes", time_zone: "UTC" });
    const { url } = await startCalendarAuthorization(
      fixture.env,
      host.id,
      { provider: "zoom", returnUrl: null },
      fixture.deps,
    );
    await completeCalendarAuthorization(
      {
        provider: "zoom",
        state: new URL(url).searchParams.get("state") as string,
        code: "code",
        error: null,
      },
      fixture.deps,
    );
    return { ...fixture, api, host, created };
  }

  const deauthorized = (userId: string) =>
    JSON.stringify({ event: "app_deauthorized", payload: { user_id: userId } });

  test("its own URL is on the wire, and its own token signs events there", async () => {
    const { app, api, host, env, created } = await connected();
    expect(created.zoom_event_url).toBe(
      `https://api.example.test/scheduling/zoom/events/${created.id}`,
    );
    const body = deauthorized(api.userId);
    const res = await app.request(`/scheduling/zoom/events/${created.id}`, {
      method: "POST",
      headers: signed("acme-token", body),
      body,
    });
    expect(res.status).toBe(200);
    expect(await listConnections(env, host.id)).toHaveLength(0);
  });

  test("Zoom's URL validation answers with the app's own token", async () => {
    const { app, created } = await connected();
    const body = JSON.stringify({
      event: "endpoint.url_validation",
      payload: { plainToken: "plain" },
    });
    const res = await app.request(`/scheduling/zoom/events/${created.id}`, {
      method: "POST",
      headers: signed("acme-token", body),
      body,
    });
    expect(await res.json()).toEqual({
      plainToken: "plain",
      encryptedToken: createHmac("sha256", "acme-token").update("plain").digest("hex"),
    });
  });

  test("another token's signature changes nothing, coss.com's included", async () => {
    const { app, api, host, env, created } = await connected();
    const body = deauthorized(api.userId);
    for (const secret of ["coss-token", "someone-elses"]) {
      const res = await app.request(`/scheduling/zoom/events/${created.id}`, {
        method: "POST",
        headers: signed(secret, body),
        body,
      });
      expect(res.status).toBe(401);
    }
    expect(await listConnections(env, host.id)).toHaveLength(1);
  });

  test("coss.com's own events can't reach a connection through a customer's app", async () => {
    const { app, api, host, env } = await connected();
    const body = deauthorized(api.userId);
    const res = await app.request("/scheduling/zoom/events", {
      method: "POST",
      headers: signed("coss-token", body),
      body,
    });
    expect(res.status).toBe(200);
    expect(await listConnections(env, host.id)).toHaveLength(1);
  });

  test("an app that doesn't exist, or has no token, is a 404", async () => {
    const api = new FakeZoomApi();
    const { app, headers } = await appWith(api.fetch);
    const noToken = (await (
      await app.request("/v1/scheduling/oauth_apps", {
        method: "POST",
        headers,
        body: JSON.stringify({ provider: "zoom", client_id: "c", client_secret: "s" }),
      })
    ).json()) as { id: string };
    const body = deauthorized(api.userId);
    for (const id of [noToken.id, "calapp_nope", "not-an-id"]) {
      const res = await app.request(`/scheduling/zoom/events/${id}`, {
        method: "POST",
        headers: signed("anything", body),
        body,
      });
      expect(res.status).toBe(404);
    }
  });
});

describe("the hosted page's session", () => {
  test("says when the customer speaks for themselves, and offers Zoom through their own app", async () => {
    const api = new FakeZoomApi();
    const { app, headers, env } = await appWith(api.fetch, {
      deps: { ...calendars(api.fetch), apps: { google: null, microsoft: null } },
    });
    const host = await createHost(env, { name: "Dr. Reyes", time_zone: "UTC" });
    const read = async () => {
      const session = (await (
        await app.request(`/v1/scheduling/hosts/${host.id}/sessions`, {
          method: "POST",
          headers,
          body: "{}",
        })
      ).json()) as { token: string };
      return (await (
        await app.request("/scheduling/client/session", {
          headers: { authorization: `Bearer ${session.token}` },
        })
      ).json()) as { zoom_available: boolean; own_oauth_app: boolean; privacy_url: string | null };
    };
    expect(await read()).toMatchObject({
      zoom_available: false,
      own_oauth_app: false,
      privacy_url: null,
    });
    await app.request("/v1/scheduling/oauth_apps", {
      method: "POST",
      headers,
      body: JSON.stringify({ provider: "zoom", client_id: "c", client_secret: "s" }),
    });
    await app.request("/v1/scheduling/settings", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ privacy_url: "https://acme.example/privacy" }),
    });
    expect(await read()).toMatchObject({
      zoom_available: true,
      own_oauth_app: true,
      privacy_url: "https://acme.example/privacy",
    });
  });

  test("a privacy URL has to be https, since it becomes a link", async () => {
    const api = new FakeGoogleCalendarApi();
    const { app, headers } = await appWith(api.fetch);
    for (const privacy_url of ["javascript:alert(1)", "http://acme.example/privacy"]) {
      const res = await app.request("/v1/scheduling/settings", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ privacy_url }),
      });
      expect(res.status).toBe(422);
    }
  });
});
