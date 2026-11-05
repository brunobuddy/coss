import { describe, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { decryptSecret, reencryptWebhookSecrets, secretsKeyRing } from "@coss/webhooks";
import { and, eq } from "drizzle-orm";
import { markOauthAppFailing } from "../src/calendar/oauth-app-state.ts";
import {
  APP_REFUSED,
  type CalendarDeps,
  CalendarError,
  clientFor,
  completeCalendarAuthorization,
  createBooking,
  createEventType,
  createHost,
  createOauthApp,
  createSchedule,
  deleteOauthApp,
  disconnectCalendar,
  getOauthApp,
  handleZoomDeauthorization,
  listConnections,
  listOauthApps,
  runDueCalendarSyncs,
  runDueCalendarWrites,
  type SchedulingEnvironment,
  SchedulingError,
  startCalendarAuthorization,
  updateOauthApp,
  warnOfExpiringOauthAppSecrets,
} from "../src/index.ts";
import { FakeGoogleCalendarApi, FakeZoomApi, testSchedulingDeps } from "../src/testing.ts";

const NOW = new Date("2031-01-06T00:00:00Z");
// Past the hour an access token lasts, so `clientFor` has to refresh.
const LATER = new Date(NOW.getTime() + 2 * 3_600_000);
const keys = secretsKeyRing([createHash("sha256").update("oauth apps test").digest()]);
const scopeOf = (env: SchedulingEnvironment) => ({ organizationIds: [env.organizationId] });

function depsOf(
  fetcher: CalendarDeps["fetcher"],
  now: () => Date = () => NOW,
  zoom = false,
): CalendarDeps {
  return {
    secretsKeys: keys,
    apps: {
      google: { clientId: "coss-google", clientSecret: "coss-secret" },
      microsoft: { clientId: "coss-ms", clientSecret: "coss-ms-secret" },
      ...(zoom
        ? { zoom: { clientId: "coss-zoom", clientSecret: "coss-zoom-secret", webhookSecret: "t" } }
        : {}),
    },
    publicUrl: "https://api.example.test",
    fetcher: fetcher as NonNullable<CalendarDeps["fetcher"]>,
    now,
  };
}

async function setUp() {
  const tenant = await createTestTenant();
  const env: SchedulingEnvironment = {
    organizationId: tenant.organization.id,
    projectId: tenant.project.id,
    environmentId: tenant.production.id,
    mode: "live",
  };
  const host = await createHost(env, { name: "Dr. Reyes", time_zone: "UTC" });
  return { tenant, env, host };
}

const googleApp = {
  provider: "google" as const,
  client_id: "acme-google",
  client_secret: "acme-secret",
};

async function consent(
  env: SchedulingEnvironment,
  hostId: string,
  deps: CalendarDeps,
  provider: "google" | "zoom" = "google",
) {
  const { url } = await startCalendarAuthorization(
    env,
    hostId,
    { provider, returnUrl: null },
    deps,
  );
  const parsed = new URL(url);
  const state = parsed.searchParams.get("state") as string;
  const result = await completeCalendarAuthorization(
    { provider, state, code: "code", error: null },
    deps,
  );
  return { parsed, result };
}

const connectionsOf = (hostId: string) =>
  db
    .select()
    .from(schema.schedulingCalendarConnection)
    .where(eq(schema.schedulingCalendarConnection.hostId, hostId));

const errorCode = async (run: Promise<unknown>) => {
  try {
    await run;
    return "ok";
  } catch (error) {
    if (error instanceof SchedulingError) return error.code;
    throw error;
  }
};

describe("which app a consent uses", () => {
  test("an environment's own app replaces coss.com's on the consent screen and the exchange", async () => {
    const { env, host } = await setUp();
    const api = new FakeGoogleCalendarApi();
    const deps = depsOf(api.fetch);
    const app = await createOauthApp(env, googleApp, deps);
    const { parsed, result } = await consent(env, host.id, deps);
    expect(result.outcome).toBe("connected");
    expect(parsed.searchParams.get("client_id")).toBe("acme-google");
    expect(api.tokenRequests.at(-1)).toMatchObject({
      grantType: "authorization_code",
      clientId: "acme-google",
      clientSecret: "acme-secret",
    });
    const [connection] = await connectionsOf(host.id);
    expect(connection?.oauthAppId).toBe(app.id);
    expect((await listConnections(env, host.id))[0]?.oauth_app).toBe(app.id);
    expect((await getOauthApp(env, app.id, deps)).verified_at).not.toBeNull();
    expect((await getOauthApp(env, app.id, deps)).connections).toBe(1);
  });

  test("a forwarder on the customer's domain is the redirect URI, at both ends", async () => {
    const { env, host } = await setUp();
    const api = new FakeGoogleCalendarApi();
    const deps = depsOf(api.fetch);
    await createOauthApp(
      env,
      {
        ...googleApp,
        redirect_uri: "https://acme.example/oauth/google",
        completion_url: "https://acme.example/connected",
      },
      deps,
    );
    const { parsed, result } = await consent(env, host.id, deps);
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://acme.example/oauth/google");
    expect(api.tokenRequests.at(-1)?.redirectUri).toBe("https://acme.example/oauth/google");
    expect(result.returnUrl).toBe("https://acme.example/connected");
  });

  test("the consent's own return_url wins over the app's completion URL", async () => {
    const { env, host } = await setUp();
    const api = new FakeGoogleCalendarApi();
    const deps = depsOf(api.fetch);
    await createOauthApp(
      env,
      { ...googleApp, completion_url: "https://acme.example/connected" },
      deps,
    );
    const { url } = await startCalendarAuthorization(
      env,
      host.id,
      { provider: "google", returnUrl: "https://acme.example/this-one" },
      deps,
    );
    const state = new URL(url).searchParams.get("state") as string;
    const result = await completeCalendarAuthorization(
      { provider: "google", state, code: "code", error: null },
      deps,
    );
    expect(result.returnUrl).toBe("https://acme.example/this-one");
  });

  test("editing the app during a consent can't change what its code is exchanged with", async () => {
    const { env, host } = await setUp();
    const api = new FakeGoogleCalendarApi();
    const deps = depsOf(api.fetch);
    const app = await createOauthApp(
      env,
      { ...googleApp, redirect_uri: "https://acme.example/before" },
      deps,
    );
    const { url } = await startCalendarAuthorization(
      env,
      host.id,
      { provider: "google", returnUrl: null },
      deps,
    );
    await updateOauthApp(env, app.id, { redirect_uri: "https://acme.example/after" }, deps);
    const state = new URL(url).searchParams.get("state") as string;
    await completeCalendarAuthorization(
      { provider: "google", state, code: "code", error: null },
      deps,
    );
    expect(api.tokenRequests.at(-1)?.redirectUri).toBe("https://acme.example/before");
  });

  test("a Microsoft consent is exchanged at the tenant it started with", async () => {
    const { env, host } = await setUp();
    const urls: string[] = [];
    const deps = depsOf(async (url) => {
      urls.push(url);
      return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    });
    const app = await createOauthApp(
      env,
      { provider: "microsoft", client_id: "c", client_secret: "s", tenant_id: "before.example" },
      deps,
    );
    const { url } = await startCalendarAuthorization(
      env,
      host.id,
      { provider: "microsoft", returnUrl: null },
      deps,
    );
    await updateOauthApp(env, app.id, { tenant_id: "after.example" }, deps);
    urls.length = 0;
    await completeCalendarAuthorization(
      {
        provider: "microsoft",
        state: new URL(url).searchParams.get("state") as string,
        code: "code",
        error: null,
      },
      deps,
    ).catch(() => {});
    expect(new URL(urls[0] as string).pathname).toBe("/before.example/oauth2/v2.0/token");
  });

  test("an environment with no coss.com app can still connect through its own", async () => {
    const { env, host } = await setUp();
    const api = new FakeGoogleCalendarApi();
    const deps: CalendarDeps = {
      ...depsOf(api.fetch),
      apps: { google: null, microsoft: null },
    };
    expect(
      await errorCode(
        startCalendarAuthorization(env, host.id, { provider: "google", returnUrl: null }, deps),
      ),
    ).toBe("calendar_unavailable");
    await createOauthApp(env, googleApp, deps);
    expect((await consent(env, host.id, deps)).result.outcome).toBe("connected");
  });

  test("a single-tenant Microsoft app uses its tenant, never common", async () => {
    const { env, host } = await setUp();
    const urls: string[] = [];
    const fetcher = async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    };
    const deps = depsOf(fetcher);
    await createOauthApp(
      env,
      {
        provider: "microsoft",
        client_id: "acme-ms",
        client_secret: "s",
        tenant_id: "contoso.example",
      },
      deps,
    );
    const { url } = await startCalendarAuthorization(
      env,
      host.id,
      { provider: "microsoft", returnUrl: null },
      deps,
    );
    expect(new URL(url).pathname).toBe("/contoso.example/oauth2/v2.0/authorize");
    expect(new URL(urls[0] as string).pathname).toBe("/contoso.example/oauth2/v2.0/token");
  });
});

describe("which app a connection refreshes with", () => {
  test("a connection from before the app existed stays on coss.com's, until the host consents again", async () => {
    const { env, host } = await setUp();
    const api = new FakeGoogleCalendarApi();
    await consent(env, host.id, depsOf(api.fetch));
    const before = (await connectionsOf(host.id))[0];
    expect(before?.oauthAppId).toBeNull();

    const app = await createOauthApp(env, googleApp, depsOf(api.fetch));
    await clientFor(
      before as NonNullable<typeof before>,
      depsOf(api.fetch, () => LATER),
    );
    expect(api.tokenRequests.at(-1)).toMatchObject({
      grantType: "refresh_token",
      clientId: "coss-google",
    });

    await consent(env, host.id, depsOf(api.fetch));
    const after = (await connectionsOf(host.id))[0];
    expect(after?.id).toBe(before?.id);
    expect(after?.oauthAppId).toBe(app.id);
    await clientFor(
      after as NonNullable<typeof after>,
      depsOf(api.fetch, () => LATER),
    );
    expect(api.tokenRequests.at(-1)).toMatchObject({
      grantType: "refresh_token",
      clientId: "acme-google",
    });
  });

  test("two environments' apps never use each other's credentials", async () => {
    const { tenant, env, host } = await setUp();
    const sandbox: SchedulingEnvironment = {
      ...env,
      environmentId: tenant.development.id,
      mode: "sandbox",
    };
    const sandboxHost = await createHost(sandbox, { name: "Sam", time_zone: "UTC" });
    const api = new FakeGoogleCalendarApi();
    const deps = depsOf(api.fetch);
    await createOauthApp(env, googleApp, deps);
    await createOauthApp(
      sandbox,
      { ...googleApp, client_id: "acme-dev", client_secret: "dev-secret" },
      deps,
    );
    await consent(env, host.id, deps);
    expect(api.tokenRequests.at(-1)?.clientId).toBe("acme-google");
    await consent(sandbox, sandboxHost.id, deps);
    expect(api.tokenRequests.at(-1)?.clientId).toBe("acme-dev");
    const [live] = await connectionsOf(host.id);
    await clientFor(
      live as NonNullable<typeof live>,
      depsOf(api.fetch, () => LATER),
    );
    expect(api.tokenRequests.at(-1)).toMatchObject({
      clientId: "acme-google",
      clientSecret: "acme-secret",
    });
  });
});

describe("when the provider refuses the app", () => {
  async function connected() {
    const fixture = await setUp();
    const api = new FakeGoogleCalendarApi();
    const deps = depsOf(api.fetch);
    const app = await createOauthApp(fixture.env, googleApp, deps);
    await consent(fixture.env, fixture.host.id, deps);
    const [connection] = await connectionsOf(fixture.host.id);
    return { ...fixture, api, deps, app, connection: connection as NonNullable<typeof connection> };
  }

  const notificationsOf = (organizationId: string, kind: string) =>
    db
      .select()
      .from(schema.notification)
      .where(
        and(
          eq(schema.notification.organizationId, organizationId),
          eq(schema.notification.kind, kind),
        ),
      );

  test("it's one outage of the app: no host is marked or emailed", async () => {
    const { env, host, api, app, connection } = await connected();
    api.refusedSecret = "acme-secret";
    const later = depsOf(api.fetch, () => LATER);
    for (let i = 0; i < 2; i++) {
      const refused = await clientFor(connection, later).catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(CalendarError);
      expect((refused as CalendarError).code).toBe(APP_REFUSED);
      expect((refused as CalendarError).kind).toBe("transient");
    }
    expect((await getOauthApp(env, app.id, later)).status).toBe("failing");
    expect((await getOauthApp(env, app.id, later)).last_error_code).toBe(APP_REFUSED);
    expect((await connectionsOf(host.id))[0]?.status).toBe("active");
    expect(await notificationsOf(env.organizationId, "scheduling.oauth_app_failing")).toHaveLength(
      1,
    );
    const hostEmails = await db
      .select()
      .from(schema.schedulingNotification)
      .where(eq(schema.schedulingNotification.hostId, host.id));
    expect(hostEmails).toHaveLength(0);
  });

  test("a sync through a refused app leaves the host's connection alone", async () => {
    const { env, host, api, app } = await connected();
    api.refusedSecret = "acme-secret";
    await runDueCalendarSyncs(
      depsOf(api.fetch, () => LATER),
      { scope: scopeOf(env) },
    );
    expect((await connectionsOf(host.id))[0]?.status).toBe("active");
    expect((await getOauthApp(env, app.id, depsOf(api.fetch))).status).toBe("failing");
  });

  test("while it's failing, consents are refused rather than falling back to coss.com's", async () => {
    const { env, host, api, connection } = await connected();
    api.refusedSecret = "acme-secret";
    const later = depsOf(api.fetch, () => LATER);
    await clientFor(connection, later).catch(() => {});
    expect(
      await errorCode(
        startCalendarAuthorization(env, host.id, { provider: "google", returnUrl: null }, later),
      ),
    ).toBe("calendar_unavailable");
  });

  test("a good new secret ends the outage, and a bad one keeps the old", async () => {
    const { env, api, app, connection } = await connected();
    api.refusedSecret = "acme-secret";
    const later = depsOf(api.fetch, () => LATER);
    await clientFor(connection, later).catch(() => {});

    expect(
      await errorCode(updateOauthApp(env, app.id, { client_secret: "acme-secret" }, later)),
    ).toBe("oauth_app_refused");
    expect((await getOauthApp(env, app.id, later)).status).toBe("failing");

    const updated = await updateOauthApp(env, app.id, { client_secret: "new-secret" }, later);
    expect(updated.status).toBe("active");
    expect(updated.last_error_code).toBeNull();
    // It was tried on a real connection's token before being stored.
    expect(api.tokenRequests.at(-1)).toMatchObject({
      grantType: "refresh_token",
      clientSecret: "new-secret",
    });
    const [fresh] = await connectionsOf(connection.hostId);
    await clientFor(
      fresh as NonNullable<typeof fresh>,
      depsOf(api.fetch, () => new Date(LATER.getTime() + 7_200_000)),
    );
    expect(api.tokenRequests.at(-1)?.clientSecret).toBe("new-secret");
  });

  test("a refusal of a secret that's since been replaced doesn't mark the new one", async () => {
    const { env, api, app, connection } = await connected();
    const [row] = await db
      .select()
      .from(schema.schedulingOauthApp)
      .where(eq(schema.schedulingOauthApp.id, app.id));
    const later = depsOf(api.fetch, () => LATER);
    await updateOauthApp(env, app.id, { client_secret: "new-secret" }, later);
    await markOauthAppFailing(row as NonNullable<typeof row>, APP_REFUSED, LATER);
    expect((await getOauthApp(env, app.id, later)).status).toBe("active");
    expect(connection.status).toBe("active");
  });

  async function bookable() {
    const fixture = await connected();
    await createSchedule(fixture.env, fixture.host.id, {
      rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
    });
    const eventType = await createEventType(fixture.env, {
      title: "Consultation",
      kind: "one_on_one",
      duration_minutes: 30,
      hosts: [{ host: fixture.host.id, role: "member", weight: 100, schedule: null }],
    } as never);
    await runDueCalendarSyncs(fixture.deps, { scope: scopeOf(fixture.env) });
    return { ...fixture, eventType };
  }

  const bookAt = Date.parse("2031-01-06T09:00:00Z");
  const attendee = { uid: "p", name: "Sam Lee", email: "sam@example.com", time_zone: "UTC" };
  const actor = { kind: "system" } as const;

  test("a booking still goes through on what's fresh, and a stale calendar hides the host", async () => {
    const { env, host, api, app, eventType } = await bookable();
    // Read just before the token comes due, so the booking's live check is what has to refresh it.
    const justRead = new Date(NOW.getTime() + 57 * 60_000);
    await runDueCalendarSyncs(
      depsOf(api.fetch, () => justRead),
      { scope: scopeOf(env) },
    );
    api.refusedSecret = "acme-secret";
    const soon = new Date(NOW.getTime() + 59 * 60_000);
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: bookAt, attendee },
      testSchedulingDeps({ calendars: depsOf(api.fetch, () => soon), now: () => soon }),
      actor,
    );
    expect(booking.status).toBe("confirmed");
    expect((await getOauthApp(env, app.id, depsOf(api.fetch))).status).toBe("failing");

    // Hours on, nothing's been read: an unreadable calendar never reads as free.
    const stale = new Date(NOW.getTime() + 6 * 3_600_000);
    expect(
      await errorCode(
        createBooking(
          env,
          {
            eventType: eventType.id,
            startMs: bookAt + 3_600_000,
            attendee: { ...attendee, uid: "q" },
          },
          testSchedulingDeps({ calendars: depsOf(api.fetch, () => stale), now: () => stale }),
          actor,
        ),
      ),
    ).toBe("slot_unavailable");
    expect((await connectionsOf(host.id))[0]?.status).toBe("active");
  });

  test("a calendar write waits out the outage, and lands once the secret's fixed", async () => {
    const { env, host, api, app, eventType } = await bookable();
    const { booking } = await createBooking(
      env,
      { eventType: eventType.id, startMs: bookAt, attendee },
      testSchedulingDeps({ now: () => NOW }),
      actor,
    );
    api.refusedSecret = "acme-secret";
    const failingDeps = {
      ...depsOf(api.fetch, () => LATER),
      dataKeys: testSchedulingDeps().dataKeys,
    };
    await runDueCalendarWrites(failingDeps, { scope: scopeOf(env) });
    const eventsOf = () =>
      db
        .select()
        .from(schema.schedulingCalendarEvent)
        .where(eq(schema.schedulingCalendarEvent.bookingId, booking.id));
    const [waiting] = await eventsOf();
    expect(waiting?.lastErrorCode).toBe(APP_REFUSED);
    expect(waiting?.providerEventId).toBeNull();
    expect(waiting?.appliedVersion).not.toBe(waiting?.desiredVersion);
    expect((await connectionsOf(host.id))[0]?.status).toBe("active");

    await updateOauthApp(env, app.id, { client_secret: "new-secret" }, failingDeps);
    const muchLater = new Date(LATER.getTime() + 3_600_000);
    await runDueCalendarWrites({ ...failingDeps, now: () => muchLater }, { scope: scopeOf(env) });
    const [written] = await eventsOf();
    expect(written?.providerEventId).not.toBeNull();
    expect(written?.lastErrorCode).toBeNull();
  });

  test("a refresh that works ends an outage that began while it was on its way", async () => {
    const { env, api, app, connection } = await connected();
    const later = depsOf(api.fetch, () => LATER);
    const [row] = await db
      .select()
      .from(schema.schedulingOauthApp)
      .where(eq(schema.schedulingOauthApp.id, app.id));
    const held = api.hold("POST", /\/token$/);
    const refreshing = clientFor(connection, later);
    await held.arrived;
    // Read as active by the refresh above, then refused for someone else before it gets its answer.
    await markOauthAppFailing(row as NonNullable<typeof row>, APP_REFUSED, LATER);
    held.release();
    await refreshing;
    expect((await getOauthApp(env, app.id, later)).status).toBe("active");
  });

  test("refusing one host's token doesn't touch the app", async () => {
    const { env, host, api, app, connection } = await connected();
    api.refreshFails = true;
    const later = depsOf(api.fetch, () => LATER);
    const refused = (await clientFor(connection, later).catch((e: unknown) => e)) as CalendarError;
    expect(refused.kind).toBe("auth");
    expect((await getOauthApp(env, app.id, later)).status).toBe("active");
    expect((await connectionsOf(host.id))[0]?.oauthAppId).toBe(app.id);
  });

  test("coss.com's own app being refused doesn't mark any host either", async () => {
    const { env, host } = await setUp();
    const api = new FakeGoogleCalendarApi();
    await consent(env, host.id, depsOf(api.fetch));
    const [connection] = await connectionsOf(host.id);
    api.refusedSecret = "coss-secret";
    const original = console.error;
    console.error = () => {};
    try {
      await runDueCalendarSyncs(
        depsOf(api.fetch, () => LATER),
        { scope: scopeOf(env) },
      );
      await clientFor(
        connection as NonNullable<typeof connection>,
        depsOf(api.fetch, () => LATER),
      ).catch(() => {});
    } finally {
      console.error = original;
    }
    expect((await connectionsOf(host.id))[0]?.status).toBe("active");
  });
});

describe("managing an app", () => {
  test("a wrong secret is refused when it's added", async () => {
    const { env } = await setUp();
    const api = new FakeGoogleCalendarApi();
    api.refusedSecret = "wrong";
    const deps = depsOf(api.fetch);
    expect(
      await errorCode(createOauthApp(env, { ...googleApp, client_secret: "wrong" }, deps)),
    ).toBe("oauth_app_refused");
    expect(await listOauthApps(env, deps)).toHaveLength(0);
  });

  test("one per provider per environment", async () => {
    const { env } = await setUp();
    const deps = depsOf(new FakeGoogleCalendarApi().fetch);
    await createOauthApp(env, googleApp, deps);
    expect(await errorCode(createOauthApp(env, googleApp, deps))).toBe("invalid_oauth_app");
  });

  test("a secret never appears on the wire, and is stored encrypted", async () => {
    const { env } = await setUp();
    const deps = depsOf(new FakeGoogleCalendarApi().fetch);
    const app = await createOauthApp(env, googleApp, deps);
    expect(JSON.stringify(app)).not.toContain("acme-secret");
    const [row] = await db
      .select()
      .from(schema.schedulingOauthApp)
      .where(eq(schema.schedulingOauthApp.id, app.id));
    expect(row?.encryptedCredentials).not.toContain("acme-secret");
    expect(JSON.parse(decryptSecret(row?.encryptedCredentials as string, keys))).toMatchObject({
      clientSecret: "acme-secret",
    });
  });

  test("another organization or environment can't see or change an app", async () => {
    const { env } = await setUp();
    const other = await setUp();
    const deps = depsOf(new FakeGoogleCalendarApi().fetch);
    const app = await createOauthApp(env, googleApp, deps);
    expect(await errorCode(getOauthApp(other.env, app.id, deps))).toBe("not_found");
    expect(await errorCode(updateOauthApp(other.env, app.id, { client_secret: "x" }, deps))).toBe(
      "not_found",
    );
    expect(await errorCode(deleteOauthApp(other.env, app.id))).toBe("not_found");
  });

  test("addresses have to be https, except localhost in a sandbox", async () => {
    const { tenant, env } = await setUp();
    const deps = depsOf(new FakeGoogleCalendarApi().fetch);
    for (const redirect_uri of [
      "http://acme.example/oauth",
      "http://localhost:3000/oauth",
      "https://user:pass@acme.example/oauth",
      "https://acme.example/oauth#x",
      "javascript:alert(1)",
      "not a url",
    ]) {
      expect(await errorCode(createOauthApp(env, { ...googleApp, redirect_uri }, deps))).toBe(
        "invalid_oauth_app",
      );
    }
    const sandbox: SchedulingEnvironment = {
      ...env,
      environmentId: tenant.development.id,
      mode: "sandbox",
    };
    expect(
      await errorCode(
        createOauthApp(
          sandbox,
          { ...googleApp, redirect_uri: "http://localhost:3000/oauth" },
          deps,
        ),
      ),
    ).toBe("ok");
  });

  test("creating needs the plan, and rotating or deleting never does", async () => {
    const { env } = await setUp();
    const deps = depsOf(new FakeGoogleCalendarApi().fetch);
    const app = await createOauthApp(env, googleApp, deps);
    class PlanRefused extends Error {}
    const lapsed = {
      ...deps,
      plans: {
        requireFeature: async () => {
          throw new PlanRefused();
        },
      },
    };
    await expect(
      createOauthApp(env, { ...googleApp, provider: "zoom" }, lapsed),
    ).rejects.toBeInstanceOf(PlanRefused);
    expect((await updateOauthApp(env, app.id, { client_secret: "new" }, lapsed)).id).toBe(app.id);
    expect(await deleteOauthApp(env, app.id)).toEqual({ id: app.id });
  });

  test("it can't be deleted while connections use it, and can once they've gone", async () => {
    const { env, host } = await setUp();
    const api = new FakeGoogleCalendarApi();
    const deps = depsOf(api.fetch);
    const app = await createOauthApp(env, googleApp, deps);
    await consent(env, host.id, deps);
    expect(await errorCode(deleteOauthApp(env, app.id))).toBe("oauth_app_in_use");
    const [connection] = await connectionsOf(host.id);
    await disconnectCalendar(env, host.id, (connection as NonNullable<typeof connection>).id, deps);
    expect(await deleteOauthApp(env, app.id)).toEqual({ id: app.id });
  });

  test("deleting an environment takes its apps and connections together", async () => {
    const { tenant, env, host } = await setUp();
    const api = new FakeGoogleCalendarApi();
    const deps = depsOf(api.fetch);
    const app = await createOauthApp(env, googleApp, deps);
    await consent(env, host.id, deps);
    await db.delete(schema.environment).where(eq(schema.environment.id, tenant.production.id));
    expect(
      await db
        .select()
        .from(schema.schedulingOauthApp)
        .where(eq(schema.schedulingOauthApp.id, app.id)),
    ).toHaveLength(0);
  });

  test("a secret about to expire warns once, and a rotation forgets the old date", async () => {
    const { env } = await setUp();
    const deps = depsOf(new FakeGoogleCalendarApi().fetch);
    const soon = new Date(NOW.getTime() + 3 * 86_400_000).toISOString();
    const app = await createOauthApp(env, { ...googleApp, secret_expires_at: soon }, deps);
    await warnOfExpiringOauthAppSecrets(deps, { scope: scopeOf(env) });
    await warnOfExpiringOauthAppSecrets(deps, { scope: scopeOf(env) });
    const sent = await db
      .select()
      .from(schema.notification)
      .where(
        and(
          eq(schema.notification.organizationId, env.organizationId),
          eq(schema.notification.kind, "scheduling.oauth_app_secret_expiring"),
        ),
      );
    expect(sent).toHaveLength(1);
    const rotated = await updateOauthApp(env, app.id, { client_secret: "new" }, deps);
    expect(rotated.secret_expires_at).toBeNull();
  });

  test("every app about to expire hears, however many there are", async () => {
    const { env } = await setUp();
    const other = await setUp();
    const deps = depsOf(new FakeGoogleCalendarApi().fetch);
    const soon = new Date(NOW.getTime() + 3 * 86_400_000).toISOString();
    await createOauthApp(env, { ...googleApp, secret_expires_at: soon }, deps);
    await createOauthApp(other.env, { ...googleApp, secret_expires_at: soon }, deps);
    const scope = { organizationIds: [env.organizationId, other.env.organizationId] };
    // A batch of one: the second app is only reached by going past the first.
    expect(await warnOfExpiringOauthAppSecrets(deps, { scope, limit: 1 })).toBe(2);
    for (const { organizationId } of [env, other.env]) {
      const sent = await db
        .select()
        .from(schema.notification)
        .where(
          and(
            eq(schema.notification.organizationId, organizationId),
            eq(schema.notification.kind, "scheduling.oauth_app_secret_expiring"),
          ),
        );
      expect(sent).toHaveLength(1);
    }
  });

  test("a new secret doesn't lose a Secret Token saved while it was being tried", async () => {
    const { env } = await setUp();
    const api = new FakeZoomApi();
    let arrive = () => {};
    let release = () => {};
    const arrived = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let holding = false;
    const deps = depsOf(async (url, init) => {
      if (holding && String(url).includes("/oauth/token")) {
        holding = false;
        arrive();
        await gate;
      }
      return api.fetch(url, init);
    });
    const app = await createOauthApp(
      env,
      { provider: "zoom", client_id: "c", client_secret: "old", webhook_secret: "old-token" },
      deps,
    );
    holding = true;
    const rotating = updateOauthApp(env, app.id, { client_secret: "new" }, deps);
    await arrived;
    await updateOauthApp(env, app.id, { webhook_secret: "new-token" }, deps);
    release();
    await rotating;
    const [row] = await db
      .select()
      .from(schema.schedulingOauthApp)
      .where(eq(schema.schedulingOauthApp.id, app.id));
    expect(JSON.parse(decryptSecret(row?.encryptedCredentials as string, keys))).toEqual({
      clientSecret: "new",
      webhookSecret: "new-token",
    });
  });

  test("re-encryption moves an app's credentials to the new key", async () => {
    const { env } = await setUp();
    const deps = depsOf(new FakeGoogleCalendarApi().fetch);
    const app = await createOauthApp(env, googleApp, deps);
    const rotated = secretsKeyRing([
      createHash("sha256").update("the next key").digest(),
      createHash("sha256").update("oauth apps test").digest(),
    ]);
    await reencryptWebhookSecrets({
      keys: rotated,
      scope: scopeOf(env) as { organizationIds: string[] },
    });
    const [row] = await db
      .select()
      .from(schema.schedulingOauthApp)
      .where(eq(schema.schedulingOauthApp.id, app.id));
    const onlyNew = secretsKeyRing([createHash("sha256").update("the next key").digest()]);
    expect(JSON.parse(decryptSecret(row?.encryptedCredentials as string, onlyNew))).toMatchObject({
      clientSecret: "acme-secret",
    });
  });
});

describe("Zoom's deauthorization events", () => {
  const zoomApp = { provider: "zoom" as const, client_id: "acme-zoom", client_secret: "acme-zs" };

  test("a customer's event removes only that app's connections, in no other organization", async () => {
    const mine = await setUp();
    const theirs = await setUp();
    const onCoss = await setUp();
    const api = new FakeZoomApi();
    // The test database is shared, and coss.com's own events reach any organization's connections.
    api.userId = `zoom_${randomUUID()}`;
    const deps = depsOf(api.fetch, () => NOW, true);
    const app = await createOauthApp(mine.env, zoomApp, deps);
    const other = await createOauthApp(theirs.env, zoomApp, deps);
    // The same Zoom user, reached through three different apps.
    await consent(mine.env, mine.host.id, deps, "zoom");
    await consent(theirs.env, theirs.host.id, deps, "zoom");
    await consent(onCoss.env, onCoss.host.id, deps, "zoom");
    expect((await connectionsOf(onCoss.host.id))[0]?.oauthAppId).toBeNull();

    await handleZoomDeauthorization(api.userId, deps, app.id);
    expect(await connectionsOf(mine.host.id)).toHaveLength(0);
    expect(await connectionsOf(theirs.host.id)).toHaveLength(1);
    expect(await connectionsOf(onCoss.host.id)).toHaveLength(1);

    // Coss.com's app reaches its own connections, and nobody on a customer's.
    await handleZoomDeauthorization(api.userId, deps);
    expect(await connectionsOf(onCoss.host.id)).toHaveLength(0);
    expect(await connectionsOf(theirs.host.id)).toHaveLength(1);
    expect((await connectionsOf(theirs.host.id))[0]?.oauthAppId).toBe(other.id);
  });

  test("revoking on disconnect uses the app that issued the token, and the token as it is now", async () => {
    const { env, host } = await setUp();
    const api = new FakeZoomApi();
    const deps = depsOf(api.fetch, () => NOW, true);
    await createOauthApp(env, zoomApp, deps);
    await consent(env, host.id, deps, "zoom");
    const [connection] = await connectionsOf(host.id);
    const later = depsOf(api.fetch, () => LATER, true);
    await disconnectCalendar(
      env,
      host.id,
      (connection as NonNullable<typeof connection>).id,
      later,
    );
    const basic = `Basic ${Buffer.from("acme-zoom:acme-zs").toString("base64")}`;
    expect(api.tokenAuthorizations.at(-1)).toBe(basic);
    // The refresh during the disconnect spent the old token, so that's not the one revoked.
    expect(api.revoked).toEqual([api.refreshToken]);
  });
});
