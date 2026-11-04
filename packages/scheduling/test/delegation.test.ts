import { describe, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { db, schema } from "@coss/db";
import { listNotifications } from "@coss/notifications";
import { createTestTenant } from "@coss/tenancy/testing";
import { decryptSecret, secretsKeyRing } from "@coss/webhooks";
import { and, eq, sql } from "drizzle-orm";
import { markDelegationFailing } from "../src/calendar/delegation-failures.ts";
import {
  type CalendarDeps,
  type CalendarWriteDeps,
  completeCalendarAuthorization,
  createBooking,
  createCalendarDelegation,
  createEventType,
  createHost,
  createSchedule,
  deleteCalendarDelegation,
  disconnectCalendar,
  getCalendarDelegation,
  listConnections,
  listEventTypeSlots,
  runDueCalendarDelegations,
  runDueCalendarSyncs,
  runDueCalendarWrites,
  type SchedulingEnvironment,
  SchedulingError,
  startCalendarAuthorization,
  updateCalendarDelegation,
  updateEventType,
  updateHost,
  verifyCalendarDelegation,
} from "../src/index.ts";
import {
  FakeGoogleCalendarApi,
  FakeGraphApi,
  testSchedulingDeps,
  testServiceAccount,
} from "../src/testing.ts";

const ms = Date.parse;
const MONDAY = "2031-01-06";
const at = (time: string) => ms(`${MONDAY}T${time}:00Z`);
const NOW = new Date(at("00:00"));
const scope = (env: SchedulingEnvironment) => ({ organizationIds: [env.organizationId] });
const actor = { kind: "system" } as const;
const attendee = { name: "Sam Lee", email: "sam@example.com", time_zone: "UTC" };
const DOMAIN = "acme.example";

const account = testServiceAccount();
const secretsKeys = secretsKeyRing([createHash("sha256").update("delegation test").digest()]);

function googleDeps(api: FakeGoogleCalendarApi, now: () => Date = () => NOW): CalendarWriteDeps {
  api.serviceAccountPublicKey = account.publicKey;
  return {
    dataKeys: testSchedulingDeps().dataKeys,
    secretsKeys,
    apps: { google: { clientId: "google-client", clientSecret: "google-secret" }, microsoft: null },
    publicUrl: "https://api.example.test",
    fetcher: api.fetch,
    now,
  };
}

function graphDeps(api: FakeGraphApi): CalendarDeps {
  return {
    secretsKeys,
    apps: { google: null, microsoft: null },
    publicUrl: "https://api.example.test",
    fetcher: api.fetch,
    now: () => NOW,
  };
}

async function environment(): Promise<SchedulingEnvironment> {
  const { organization, project, production } = await createTestTenant();
  return {
    organizationId: organization.id,
    projectId: project.id,
    environmentId: production.id,
    mode: "live",
  };
}

async function hostOn(env: SchedulingEnvironment, local: string) {
  const host = await createHost(env, {
    name: local,
    time_zone: "UTC",
    email: `${local}@${DOMAIN}`,
  });
  await createSchedule(env, host.id, {
    rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
  });
  return host;
}

const eventTypeFor = (env: SchedulingEnvironment, hostIds: string[]) =>
  createEventType(env, {
    title: "Consultation",
    kind: "pool",
    duration_minutes: 30,
    hosts: hostIds.map((host) => ({ host, role: "member", weight: 100, schedule: null })),
  } as never);

const slotStarts = (env: SchedulingEnvironment, eventType: string) =>
  listEventTypeSlots(env, {
    eventTypeRef: eventType,
    fromMs: at("09:00"),
    toMs: at("10:30"),
    nowMs: NOW.getTime(),
  }).then((slots) => slots.map((slot) => new Date(slot.startMs).toISOString().slice(11, 16)));

async function activeGoogle(env: SchedulingEnvironment, deps: CalendarDeps, verify = "boss") {
  const delegation = await createCalendarDelegation(
    env,
    { provider: "google", domain: DOMAIN, service_account_key: account.key },
    deps,
  );
  await verifyCalendarDelegation(env, delegation.id, { account: `${verify}@${DOMAIN}` }, deps);
  return delegation;
}

const run = async (env: SchedulingEnvironment, deps: CalendarDeps) => {
  await runDueCalendarDelegations(deps, { scope: scope(env) });
};

/** Lets the next run happen, whatever it scheduled for itself. */
const dueNow = (id: string) =>
  db
    .update(schema.schedulingCalendarDelegation)
    .set({ nextReconcileAt: new Date(0), leaseUntil: null })
    .where(eq(schema.schedulingCalendarDelegation.id, id));

async function code(work: Promise<unknown>): Promise<string> {
  try {
    await work;
    return "ok";
  } catch (error) {
    if (error instanceof SchedulingError) return error.code;
    throw error;
  }
}

const logCount = async (env: SchedulingEnvironment, type: string) => {
  const { rows } = await db.execute(
    sql`select count(*)::int n from log_entry where environment_id = ${env.environmentId} and type = ${type}`,
  );
  return (rows[0] as { n: number }).n;
};

const hostEmails = (hostId: string) =>
  db
    .select()
    .from(schema.schedulingNotification)
    .where(eq(schema.schedulingNotification.hostId, hostId));

describe("setting up", () => {
  test("a key is refused unless it's a whole service account's, and never quoted back", async () => {
    const env = await environment();
    const deps = googleDeps(new FakeGoogleCalendarApi());
    const create = (key: string) =>
      createCalendarDelegation(
        env,
        { provider: "google", domain: DOMAIN, service_account_key: key },
        deps,
      );
    expect(await code(create("not json"))).toBe("invalid_calendar_delegation");
    expect(await code(create(JSON.stringify({ type: "authorized_user" })))).toBe(
      "invalid_calendar_delegation",
    );
    const broken = JSON.stringify({ ...JSON.parse(account.key), private_key: "SECRET-VALUE" });
    const error = await create(broken).catch((caught: Error) => caught);
    expect((error as Error).message).not.toContain("SECRET-VALUE");
  });

  test("a new delegation returns what to authorize, and connects nobody until it's verified", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    await hostOn(env, "ana");
    const delegation = await createCalendarDelegation(
      env,
      { provider: "google", domain: "ACME.example", service_account_key: account.key },
      deps,
    );
    expect(delegation.status).toBe("pending");
    expect(delegation.domain).toBe(DOMAIN);
    expect(delegation.client_id).toBe(account.clientId);
    expect(delegation.scopes).toContain("https://www.googleapis.com/auth/calendar.events.freebusy");
    expect(JSON.stringify(delegation)).not.toContain("PRIVATE KEY");
    await run(env, deps);
    expect(api.minted).toEqual([]);
  });

  test("the credentials are encrypted at rest", async () => {
    const env = await environment();
    const deps = googleDeps(new FakeGoogleCalendarApi());
    const delegation = await createCalendarDelegation(
      env,
      { provider: "google", domain: DOMAIN, service_account_key: account.key },
      deps,
    );
    const [row] = await db
      .select()
      .from(schema.schedulingCalendarDelegation)
      .where(eq(schema.schedulingCalendarDelegation.id, delegation.id));
    expect(row?.encryptedCredentials).not.toContain("PRIVATE KEY");
  });

  test("verifying needs a mailbox on the domain, and says what's wrong when it's refused", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    const delegation = await createCalendarDelegation(
      env,
      { provider: "google", domain: DOMAIN, service_account_key: account.key },
      deps,
    );
    expect(
      await code(
        verifyCalendarDelegation(env, delegation.id, { account: "a@other.example" }, deps),
      ),
    ).toBe("invalid_calendar_delegation");
    api.delegationRefused = { error: "unauthorized_client" };
    const refused = await verifyCalendarDelegation(
      env,
      delegation.id,
      { account: `boss@${DOMAIN}` },
      deps,
    ).catch((caught: Error) => caught);
    expect((refused as SchedulingError).code).toBe("calendar_delegation_refused");
    expect((refused as Error).message).toContain("24 hours");
    expect((await getCalendarDelegation(env, delegation.id)).status).toBe("pending");
    api.delegationRefused = null;
    const verified = await verifyCalendarDelegation(
      env,
      delegation.id,
      { account: `boss@${DOMAIN}` },
      deps,
    );
    expect(verified.status).toBe("active");
    expect(verified.verified_account).toBe(`boss@${DOMAIN}`);
  });

  test("the token goes to Google's own endpoint, whatever the key says", async () => {
    const env = await environment();
    const seen: string[] = [];
    const api = new FakeGoogleCalendarApi();
    const deps = {
      ...googleDeps(api),
      fetcher: (url: string, init?: RequestInit) => {
        seen.push(new URL(url).hostname);
        return api.fetch(url, init);
      },
    };
    await activeGoogle(env, deps);
    expect(seen).toContain("oauth2.googleapis.com");
    expect(seen).not.toContain("attacker.example");
  });

  test("one environment has one delegation per domain", async () => {
    const env = await environment();
    const deps = googleDeps(new FakeGoogleCalendarApi());
    const params = {
      provider: "google" as const,
      domain: DOMAIN,
      service_account_key: account.key,
    };
    await createCalendarDelegation(env, params, deps);
    expect(await code(createCalendarDelegation(env, params, deps))).toBe(
      "invalid_calendar_delegation",
    );
  });
});

describe("connecting hosts", () => {
  test("every host on the domain connects, offered straight away with their busy times", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    const ana = await hostOn(env, "ana");
    const ben = await hostOn(env, "ben");
    const outside = await createHost(env, {
      name: "Out",
      time_zone: "UTC",
      email: "out@sub.acme.example",
    });
    const eventType = await eventTypeFor(env, [ana.id]);
    api.busy.set(`ana@${DOMAIN}`, [
      { start: new Date(at("09:00")).toISOString(), end: new Date(at("09:30")).toISOString() },
    ]);
    await activeGoogle(env, deps);
    await run(env, deps);
    const [connection] = await listConnections(env, ana.id);
    expect(connection).toMatchObject({
      provider: "google",
      account: `ana@${DOMAIN}`,
      status: "active",
    });
    expect(connection?.delegation).toBeTruthy();
    expect(connection?.calendars[0]).toMatchObject({ read_busy: true, write_target: true });
    expect(await listConnections(env, ben.id)).toHaveLength(1);
    expect(await listConnections(env, outside.id)).toHaveLength(0);
    // No sync ran: the first read is part of connecting.
    expect(await slotStarts(env, eventType.id)).toEqual(["09:30", "10:00"]);
    expect(await logCount(env, "scheduling.calendar.connected")).toBe(2);
  });

  test("a new connection is read once more, for what changed before its channel was stored", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    const ana = await hostOn(env, "ana");
    const eventType = await eventTypeFor(env, [ana.id]);
    await activeGoogle(env, deps);
    await run(env, deps);
    expect(await slotStarts(env, eventType.id)).toContain("09:00");
    api.busy.set(`ana@${DOMAIN}`, [
      { start: new Date(at("09:00")).toISOString(), end: new Date(at("09:30")).toISOString() },
    ]);
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    expect(await slotStarts(env, eventType.id)).toEqual(["09:30", "10:00"]);
  });

  test("one calendar that can't be read doesn't stop the others, and leaves no channel", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    const bad = await hostOn(env, "bad");
    const good = await hostOn(env, "good");
    api.erroredCalendars.add(`bad@${DOMAIN}`);
    await activeGoogle(env, deps);
    await run(env, deps);
    expect(await listConnections(env, bad.id)).toEqual([]);
    expect(await listConnections(env, good.id)).toMatchObject([{ status: "active" }]);
    const watched = api.requests.filter((request) => request.endsWith("/events/watch")).length;
    const stopped = api.requests.filter((request) => request.endsWith("/channels/stop")).length;
    expect(watched).toBe(2);
    expect(stopped).toBe(1);
  });

  test("a mailbox that always fails to answer doesn't block the domain", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    await hostOn(env, "aaa");
    const later = await hostOn(env, "bbb");
    const delegation = await activeGoogle(env, deps);
    api.failNext = { path: /calendarList$/, status: 503 };
    await run(env, deps);
    await dueNow(delegation.id);
    await run(env, deps);
    expect(await listConnections(env, later.id)).toMatchObject([{ status: "active" }]);
  });

  test("hosts that keep failing can't hold up the ones behind them", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    // A failed mailbox with an OAuth connection to it leaves no delegated row to skip it by.
    for (let index = 0; index < 20; index++) {
      const stuck = await hostOn(env, `stuck${index}`);
      api.goneMailboxes.add(`stuck${index}@${DOMAIN}`);
      await db.insert(schema.schedulingCalendarConnection).values({
        organizationId: env.organizationId,
        environmentId: env.environmentId,
        hostId: stuck.id,
        provider: "google",
        accountId: `stuck${index}@${DOMAIN}`,
      });
    }
    const healthy = await hostOn(env, "healthy");
    await activeGoogle(env, deps);
    await run(env, deps);
    await run(env, deps);
    expect(await listConnections(env, healthy.id)).toMatchObject([{ status: "active" }]);
  });

  test("a big domain arrives in batches, and a run with hosts left comes straight back", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    await Promise.all(Array.from({ length: 23 }, (_, index) => hostOn(env, `h${index}`)));
    const delegation = await activeGoogle(env, deps);
    await run(env, deps);
    expect((await getCalendarDelegation(env, delegation.id)).hosts_connected).toBe(20);
    await run(env, deps);
    expect((await getCalendarDelegation(env, delegation.id)).hosts_connected).toBe(23);
  });

  test("a token is minted once, then reused until it's nearly up", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    let now = NOW;
    const deps = googleDeps(api, () => now);
    const ana = await hostOn(env, "ana");
    await activeGoogle(env, deps);
    await run(env, deps);
    const minted = api.minted.filter((mailbox) => mailbox === `ana@${DOMAIN}`).length;
    const due = () =>
      db
        .update(schema.schedulingCalendar)
        .set({ nextSyncAt: new Date(0) })
        .where(eq(schema.schedulingCalendar.hostId, ana.id));
    await due();
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    expect(api.minted.filter((mailbox) => mailbox === `ana@${DOMAIN}`)).toHaveLength(minted);
    now = new Date(NOW.getTime() + 3_500_000);
    await due();
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    expect(api.minted.filter((mailbox) => mailbox === `ana@${DOMAIN}`)).toHaveLength(minted + 1);
  });

  test("with matching off, only hosts with a calendar_account connect", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    const typedIn = await hostOn(env, "ceo");
    const named = await createHost(env, {
      name: "Named",
      time_zone: "UTC",
      email: "named@personal.example",
      calendar_account: `Named@${DOMAIN.toUpperCase()}`,
    });
    const delegation = await createCalendarDelegation(
      env,
      {
        provider: "google",
        domain: DOMAIN,
        service_account_key: account.key,
        match_host_email: false,
      },
      deps,
    );
    await verifyCalendarDelegation(env, delegation.id, { account: `boss@${DOMAIN}` }, deps);
    await run(env, deps);
    expect(await listConnections(env, typedIn.id)).toHaveLength(0);
    const [connection] = await listConnections(env, named.id);
    expect(connection?.account).toBe(`named@${DOMAIN}`);
  });

  test("a host added later nudges the delegation, and connects on the next run", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    await activeGoogle(env, deps);
    await run(env, deps);
    const late = await hostOn(env, "late");
    await run(env, deps);
    expect(await listConnections(env, late.id)).toHaveLength(1);
  });

  test("a mailbox that isn't in the Workspace is reported once, without hiding anyone else", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    const ana = await hostOn(env, "ana");
    const gone = await hostOn(env, "gone");
    api.goneMailboxes.add(`gone@${DOMAIN}`);
    const delegation = await activeGoogle(env, deps);
    await run(env, deps);
    expect(await listConnections(env, ana.id)).toMatchObject([{ status: "active" }]);
    expect(await listConnections(env, gone.id)).toMatchObject([
      { status: "needs_reauth", calendars: [] },
    ]);
    const after = await getCalendarDelegation(env, delegation.id);
    expect(after.status).toBe("active");
    expect(after).toMatchObject({ hosts_connected: 1, hosts_failed: 1 });
    await dueNow(delegation.id);
    await run(env, deps);
    expect(await logCount(env, "scheduling.calendar.needs_reauth")).toBe(1);
    expect(await hostEmails(gone.id)).toHaveLength(0);
  });

  test("a failed mailbox is tried again, and comes back by itself", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    let now = NOW;
    const deps = googleDeps(api, () => now);
    const gone = await hostOn(env, "gone");
    api.goneMailboxes.add(`gone@${DOMAIN}`);
    const delegation = await activeGoogle(env, deps);
    await run(env, deps);
    api.goneMailboxes.clear();
    now = new Date(NOW.getTime() + 2 * 3_600_000);
    await dueNow(delegation.id);
    await run(env, deps);
    expect(await listConnections(env, gone.id)).toMatchObject([
      { status: "active", account: `gone@${DOMAIN}` },
    ]);
  });
});

describe("a host's email and mailbox", () => {
  test("changing email moves nothing, since it's never an identity", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    const ana = await hostOn(env, "ana");
    const delegation = await activeGoogle(env, deps);
    await run(env, deps);
    await updateHost(env, ana.id, { email: `someone.else@${DOMAIN}` });
    await dueNow(delegation.id);
    await run(env, deps);
    expect(await listConnections(env, ana.id)).toMatchObject([{ account: `ana@${DOMAIN}` }]);
  });

  test("calendar_account moves the connection, but not over live bookings", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    const ana = await hostOn(env, "ana");
    const eventType = await eventTypeFor(env, [ana.id]);
    const delegation = await activeGoogle(env, deps);
    await run(env, deps);
    await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee },
      testSchedulingDeps({ now: () => NOW }),
      actor,
    );
    const moved = { calendar_account: `ana.new@${DOMAIN}` };
    expect(await code(updateHost(env, ana.id, moved))).toBe("host_has_live_bookings");
    expect(await listConnections(env, ana.id)).toMatchObject([{ account: `ana@${DOMAIN}` }]);

    const free = await hostOn(env, "free");
    await dueNow(delegation.id);
    await run(env, deps);
    await updateHost(env, free.id, { calendar_account: `free.new@${DOMAIN}` });
    await run(env, deps);
    expect(await listConnections(env, free.id)).toMatchObject([{ account: `free.new@${DOMAIN}` }]);
  });

  test("clearing both addresses ends the connection", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    const ana = await hostOn(env, "ana");
    await activeGoogle(env, deps);
    await run(env, deps);
    await updateHost(env, ana.id, { calendar_account: null, email: null });
    expect(await listConnections(env, ana.id)).toEqual([]);
  });

  test("setting calendar_account to the mailbox already connected changes nothing", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    const ana = await hostOn(env, "ana");
    await activeGoogle(env, deps);
    await run(env, deps);
    const before = await listConnections(env, ana.id);
    await updateHost(env, ana.id, { calendar_account: `ANA@${DOMAIN}` });
    expect((await listConnections(env, ana.id))[0]?.id).toBe(before[0]?.id);
  });
});

describe("a host's mailbox changing under a connection being made", () => {
  test("a calendar_account set during the fetch wins, and the old mailbox isn't connected", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    const ana = await hostOn(env, "ana");
    const delegation = await activeGoogle(env, deps);
    const held = api.hold("POST", /freeBusy$/);
    const running = run(env, deps);
    await held.arrived;
    await updateHost(env, ana.id, { calendar_account: `ana.new@${DOMAIN}` });
    held.release();
    await running;
    expect(await listConnections(env, ana.id)).toEqual([]);
    // The run's clock is pinned ahead of the nudge's, which in production comes after the claim.
    await dueNow(delegation.id);
    await run(env, deps);
    expect(await listConnections(env, ana.id)).toMatchObject([{ account: `ana.new@${DOMAIN}` }]);
  });

  test("a failure of the old mailbox during the move isn't recorded against the host", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    const ana = await hostOn(env, "ana");
    const delegation = await activeGoogle(env, deps);
    const held = api.hold("POST", /freeBusy$/);
    api.failNext = null;
    const running = run(env, deps);
    await held.arrived;
    await updateHost(env, ana.id, { calendar_account: `ana.new@${DOMAIN}` });
    api.failNext = { path: /freeBusy$/, status: 404, body: {} };
    held.release();
    await running;
    expect(await listConnections(env, ana.id)).toEqual([]);
    await dueNow(delegation.id);
    await run(env, deps);
    expect(await listConnections(env, ana.id)).toMatchObject([{ account: `ana.new@${DOMAIN}` }]);
  });

  test("an email moving to another delegation's domain doesn't add a second mailbox", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    const ana = await hostOn(env, "ana");
    await activeGoogle(env, deps);
    const other = await createCalendarDelegation(
      env,
      { provider: "google", domain: "other.example", service_account_key: account.key },
      deps,
    );
    await verifyCalendarDelegation(env, other.id, { account: "boss@other.example" }, deps);
    await run(env, deps);
    await updateHost(env, ana.id, { email: "ana@other.example" });
    await run(env, deps);
    expect(await listConnections(env, ana.id)).toMatchObject([{ account: `ana@${DOMAIN}` }]);
  });
});

describe("a host who already connected by OAuth", () => {
  async function connectedByOAuth() {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    const ana = await hostOn(env, "ana");
    api.calendars.length = 0;
    api.calendars.push({
      id: `ana@${DOMAIN}`,
      summary: "Ana",
      primary: true,
      accessRole: "owner",
    });
    const { url } = await startCalendarAuthorization(
      env,
      ana.id,
      { provider: "google", returnUrl: null },
      deps,
    );
    await completeCalendarAuthorization(
      {
        provider: "google",
        state: new URL(url).searchParams.get("state") as string,
        code: "code",
        error: null,
      },
      deps,
    );
    return { env, api, deps, ana };
  }

  test("the delegation takes the row over: calendars and bookings stay, and nothing's revoked", async () => {
    const { env, api, deps, ana } = await connectedByOAuth();
    const eventType = await eventTypeFor(env, [ana.id]);
    const [before] = await listConnections(env, ana.id);
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee },
      testSchedulingDeps({ now: () => NOW }),
      actor,
    );
    await runDueCalendarWrites(deps, { scope: scope(env) });
    await activeGoogle(env, deps);
    await run(env, deps);
    const after = await listConnections(env, ana.id);
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(before?.id);
    expect(after[0]?.calendars[0]?.id).toBe(before?.calendars[0]?.id);
    expect(after[0]?.calendars[0]?.write_target).toBe(true);
    expect(after[0]?.delegation).toBeTruthy();
    expect(api.requests).not.toContain("POST /revoke");
    const events = await db
      .select()
      .from(schema.schedulingCalendarEvent)
      .where(eq(schema.schedulingCalendarEvent.hostId, ana.id));
    expect(events).toHaveLength(1);
    expect(events[0]?.providerEventId).toBeTruthy();
    const [stored] = await db
      .select()
      .from(schema.schedulingCalendarConnection)
      .where(eq(schema.schedulingCalendarConnection.hostId, ana.id));
    const held = JSON.parse(decryptSecret(stored?.encryptedCredentials ?? "", secretsKeys)) as {
      refreshToken: string | null;
    };
    expect(held.refreshToken).toBeNull();
  });

  test("a personal account subscribed to their work calendar isn't taken over", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    const ana = await hostOn(env, "ana");
    api.calendars.length = 0;
    api.calendars.push(
      { id: "ana@gmail.example", summary: "Personal", primary: true, accessRole: "owner" },
      { id: `ana@${DOMAIN}`, summary: "Work", accessRole: "reader" },
    );
    const { url } = await startCalendarAuthorization(
      env,
      ana.id,
      { provider: "google", returnUrl: null },
      deps,
    );
    await completeCalendarAuthorization(
      {
        provider: "google",
        state: new URL(url).searchParams.get("state") as string,
        code: "code",
        error: null,
      },
      deps,
    );
    await activeGoogle(env, deps);
    await run(env, deps);
    const connections = await listConnections(env, ana.id);
    expect(connections.map((row) => [row.account, row.delegation !== null]).sort()).toEqual([
      ["ana@acme.example", true],
      ["ana@gmail.example", false],
    ]);
    const personal = connections.find((row) => row.account === "ana@gmail.example");
    expect(
      personal?.calendars.find((row) => row.external_id === "ana@gmail.example"),
    ).toMatchObject({ write_target: true });
  });

  test("a disconnect racing the takeover leaves the delegation's row and ledger", async () => {
    const { env, api, deps, ana } = await connectedByOAuth();
    const eventType = await eventTypeFor(env, [ana.id]);
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee },
      testSchedulingDeps({ now: () => NOW }),
      actor,
    );
    await runDueCalendarWrites(deps, { scope: scope(env) });
    await activeGoogle(env, deps);
    const [connection] = await listConnections(env, ana.id);
    const held = api.hold("POST", /revoke$/);
    const leaving = code(disconnectCalendar(env, ana.id, connection?.id as string, deps));
    await held.arrived;
    await run(env, deps);
    held.release();
    expect(await leaving).toBe("calendar_managed");
    expect((await listConnections(env, ana.id))[0]?.delegation).toBeTruthy();
    const events = await db
      .select()
      .from(schema.schedulingCalendarEvent)
      .where(eq(schema.schedulingCalendarEvent.hostId, ana.id));
    expect(events).toHaveLength(1);
  });

  test("a sync finishing during the takeover keeps what it read", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    let now = NOW;
    const deps = googleDeps(api, () => now);
    const ana = await hostOn(env, "ana");
    api.calendars.length = 0;
    api.calendars.push({ id: `ana@${DOMAIN}`, summary: "Ana", primary: true, accessRole: "owner" });
    const { url } = await startCalendarAuthorization(
      env,
      ana.id,
      { provider: "google", returnUrl: null },
      deps,
    );
    await completeCalendarAuthorization(
      {
        provider: "google",
        state: new URL(url).searchParams.get("state") as string,
        code: "code",
        error: null,
      },
      deps,
    );
    await activeGoogle(env, deps);
    // The takeover's read is answered with nothing, and held on its way back.
    const held = api.hold("POST", /freeBusy$/, "after");
    const running = run(env, deps);
    await held.arrived;
    const meeting = {
      start: new Date(at("09:00")).toISOString(),
      end: new Date(at("09:30")).toISOString(),
    };
    api.busy.set(`ana@${DOMAIN}`, [meeting]);
    now = new Date(NOW.getTime() + 60_000);
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    held.release();
    await running;
    const busy = await db
      .select()
      .from(schema.schedulingBusyInterval)
      .where(eq(schema.schedulingBusyInterval.hostId, ana.id));
    expect(busy.map((row) => row.startAt.getTime())).toEqual([at("09:00")]);
  });

  test("a consent racing the takeover leaves the delegation's row as it is", async () => {
    const { env, deps, ana } = await connectedByOAuth();
    const delegation = await createCalendarDelegation(
      env,
      { provider: "google", domain: DOMAIN, service_account_key: account.key },
      deps,
    );
    const { url } = await startCalendarAuthorization(
      env,
      ana.id,
      { provider: "google", returnUrl: null },
      deps,
    );
    // The takeover holds the row, uncommitted, while the consent's upsert runs into it.
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked = () => {};
    const lockTaken = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const takeover = db.transaction(async (tx) => {
      await tx
        .update(schema.schedulingCalendarConnection)
        .set({ delegationId: delegation.id, encryptedCredentials: "the delegation's" })
        .where(eq(schema.schedulingCalendarConnection.hostId, ana.id));
      locked();
      await gate;
    });
    await lockTaken;
    const consent = completeCalendarAuthorization(
      {
        provider: "google",
        state: new URL(url).searchParams.get("state") as string,
        code: "code",
        error: null,
      },
      deps,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    release();
    await Promise.all([takeover, consent]);
    const [row] = await db
      .select()
      .from(schema.schedulingCalendarConnection)
      .where(eq(schema.schedulingCalendarConnection.hostId, ana.id));
    expect(row?.encryptedCredentials).toBe("the delegation's");
  });

  test("a consent after that leaves the delegated row as it is", async () => {
    const { env, deps, ana } = await connectedByOAuth();
    await activeGoogle(env, deps);
    await run(env, deps);
    const [before] = await db
      .select()
      .from(schema.schedulingCalendarConnection)
      .where(eq(schema.schedulingCalendarConnection.hostId, ana.id));
    const { url } = await startCalendarAuthorization(
      env,
      ana.id,
      { provider: "google", returnUrl: null },
      deps,
    );
    await completeCalendarAuthorization(
      {
        provider: "google",
        state: new URL(url).searchParams.get("state") as string,
        code: "code",
        error: null,
      },
      deps,
    );
    const rows = await db
      .select()
      .from(schema.schedulingCalendarConnection)
      .where(eq(schema.schedulingCalendarConnection.hostId, ana.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.delegationId).toBe(before?.delegationId as string);
    expect(rows[0]?.encryptedCredentials).toBe(before?.encryptedCredentials as string);
  });
});

describe("losing access", () => {
  async function connected() {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    let now = NOW;
    const deps = googleDeps(api, () => now);
    const ana = await hostOn(env, "ana");
    const ben = await hostOn(env, "ben");
    const eventType = await eventTypeFor(env, [ana.id, ben.id]);
    const delegation = await activeGoogle(env, deps);
    await run(env, deps);
    return {
      env,
      api,
      deps,
      ana,
      ben,
      eventType,
      delegation,
      later: (minutes: number) => {
        now = new Date(NOW.getTime() + minutes * 60_000);
      },
    };
  }

  const dueAll = (env: SchedulingEnvironment) =>
    db
      .update(schema.schedulingCalendar)
      .set({ nextSyncAt: new Date(0) })
      .where(eq(schema.schedulingCalendar.environmentId, env.environmentId));

  test("a revoked client ID hides every host at once, tells the customer once, and no host", async () => {
    const { env, api, deps, ana, ben, eventType, delegation, later } = await connected();
    expect(await slotStarts(env, eventType.id)).toContain("09:00");
    api.delegationRefused = { error: "unauthorized_client" };
    // Past the cached token, so the next read has to mint.
    later(59);
    await dueAll(env);
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    await dueAll(env);
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    expect((await getCalendarDelegation(env, delegation.id)).status).toBe("failing");
    expect(await listConnections(env, ana.id)).toMatchObject([{ status: "needs_reauth" }]);
    expect(await slotStarts(env, eventType.id)).toEqual([]);
    expect(await logCount(env, "scheduling.calendar_delegation.failing")).toBe(1);
    const emails = (await listNotifications(env.organizationId)).filter(
      (row) => row.kind === "scheduling.delegation_failing",
    );
    expect(emails).toHaveLength(1);
    expect(await hostEmails(ana.id)).toHaveLength(0);
    expect(await hostEmails(ben.id)).toHaveLength(0);
  });

  test("it comes back by itself, and everyone is read again", async () => {
    const { env, api, deps, ana, eventType, delegation, later } = await connected();
    api.delegationRefused = { error: "unauthorized_client" };
    later(59);
    await dueAll(env);
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    await dueNow(delegation.id);
    await run(env, deps);
    expect((await getCalendarDelegation(env, delegation.id)).status).toBe("failing");
    api.delegationRefused = null;
    await dueNow(delegation.id);
    await run(env, deps);
    expect((await getCalendarDelegation(env, delegation.id)).status).toBe("active");
    expect(await listConnections(env, ana.id)).toMatchObject([{ status: "active" }]);
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    expect(await slotStarts(env, eventType.id)).toContain("09:00");
    expect(await logCount(env, "scheduling.calendar_delegation.restored")).toBe(1);
  });

  test("a write waits for access without using up its attempts", async () => {
    const { env, api, deps, eventType, later } = await connected();
    await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee },
      testSchedulingDeps({ now: () => NOW }),
      actor,
    );
    api.delegationRefused = { error: "unauthorized_client" };
    later(59);
    await runDueCalendarWrites(deps, { scope: scope(env) });
    const [event] = await db
      .select()
      .from(schema.schedulingCalendarEvent)
      .where(eq(schema.schedulingCalendarEvent.environmentId, env.environmentId));
    expect(event?.attempts).toBe(0);
    expect(event?.appliedVersion).toBe(0);
  });

  test("one mailbox leaving only hides that host, even if it's the verified one", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    let now = NOW;
    const deps = googleDeps(api, () => now);
    const ana = await hostOn(env, "ana");
    const ben = await hostOn(env, "ben");
    const eventType = await eventTypeFor(env, [ben.id]);
    const delegation = await activeGoogle(env, deps, "ana");
    await run(env, deps);
    api.goneMailboxes.add(`ana@${DOMAIN}`);
    now = new Date(NOW.getTime() + 59 * 60_000);
    await dueAll(env);
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    expect((await getCalendarDelegation(env, delegation.id)).status).toBe("active");
    expect(await listConnections(env, ana.id)).toMatchObject([{ status: "needs_reauth" }]);
    expect(await listConnections(env, ben.id)).toMatchObject([{ status: "active" }]);
    expect(await hostEmails(ana.id)).toHaveLength(0);
    await db
      .update(schema.schedulingCalendar)
      .set({ verifiedAt: now, coveredUntil: new Date(now.getTime() + 300 * 86_400_000) })
      .where(eq(schema.schedulingCalendar.hostId, ben.id));
    expect(await slotStarts(env, eventType.id)).not.toEqual([]);
  });

  test("a host being connected as access is lost doesn't escape the outage", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    const ana = await hostOn(env, "ana");
    const delegation = await activeGoogle(env, deps);
    const held = api.hold("POST", /freeBusy$/);
    const running = run(env, deps);
    await held.arrived;
    await markDelegationFailing(
      { id: delegation.id, organizationId: env.organizationId },
      "unauthorized_client",
      { now: () => NOW },
    );
    held.release();
    await running;
    expect(await listConnections(env, ana.id)).toEqual([]);
    await verifyCalendarDelegation(env, delegation.id, { account: `boss@${DOMAIN}` }, deps);
    await run(env, deps);
    expect(await listConnections(env, ana.id)).toMatchObject([{ status: "active" }]);
  });

  test("a refusal already on its way when credentials are replaced causes no outage", async () => {
    const { env, api, deps, delegation, later } = await connected();
    api.delegationRefused = { error: "unauthorized_client" };
    later(59);
    await dueAll(env);
    const held = api.hold("POST", /token$/, "after");
    const syncing = runDueCalendarSyncs(deps, { scope: scope(env) });
    await held.arrived;
    api.delegationRefused = null;
    await updateCalendarDelegation(env, delegation.id, { service_account_key: account.key }, deps);
    held.release();
    await syncing;
    expect((await getCalendarDelegation(env, delegation.id)).status).toBe("active");
    expect(await logCount(env, "scheduling.calendar_delegation.failing")).toBe(0);
  });

  test("new credentials are tried on whoever's left when the verified mailbox is gone", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    await hostOn(env, "ben");
    const delegation = await activeGoogle(env, deps, "ana");
    await run(env, deps);
    api.goneMailboxes.add(`ana@${DOMAIN}`);
    const updated = await updateCalendarDelegation(
      env,
      delegation.id,
      { service_account_key: account.key },
      deps,
    );
    expect(updated.status).toBe("active");
    api.delegationRefused = { error: "invalid_client" };
    expect(
      await code(
        updateCalendarDelegation(env, delegation.id, { service_account_key: account.key }, deps),
      ),
    ).toBe("calendar_delegation_refused");
  });

  test("a refusal that's since gone away leaves a healthy mailbox alone", async () => {
    const { env, api, deps, ana, ben, delegation } = await connected();
    api.failNext = {
      path: /freeBusy$/,
      status: 403,
      body: { error: { errors: [{ reason: "insufficientPermissions" }] } },
    };
    await db
      .update(schema.schedulingCalendar)
      .set({ nextSyncAt: new Date(0) })
      .where(eq(schema.schedulingCalendar.hostId, ana.id));
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    expect((await getCalendarDelegation(env, delegation.id)).status).toBe("active");
    expect(await listConnections(env, ana.id)).toMatchObject([{ status: "active" }]);
    expect(await listConnections(env, ben.id)).toMatchObject([{ status: "active" }]);
  });

  test("a failure while it's already failing doesn't announce again", async () => {
    const { env, delegation } = await connected();
    const row = { id: delegation.id, organizationId: env.organizationId };
    await markDelegationFailing(row, "unauthorized_client", { now: () => NOW });
    await markDelegationFailing(row, "unauthorized_client", { now: () => NOW });
    expect(await logCount(env, "scheduling.calendar_delegation.failing")).toBe(1);
  });

  test("new credentials are tried first, and end an outage when they work", async () => {
    const { env, api, deps, delegation } = await connected();
    await markDelegationFailing(
      { id: delegation.id, organizationId: env.organizationId },
      "unauthorized_client",
      { now: () => NOW },
    );
    api.delegationRefused = { error: "invalid_client" };
    expect(
      await code(
        updateCalendarDelegation(env, delegation.id, { service_account_key: account.key }, deps),
      ),
    ).toBe("calendar_delegation_refused");
    expect((await getCalendarDelegation(env, delegation.id)).status).toBe("failing");
    api.delegationRefused = null;
    const updated = await updateCalendarDelegation(
      env,
      delegation.id,
      { service_account_key: account.key },
      deps,
    );
    expect(updated.status).toBe("active");
  });

  test("an expiring client secret warns owners once", async () => {
    const env = await environment();
    const api = new FakeGraphApi();
    const deps = graphDeps(api);
    const delegation = await createCalendarDelegation(
      env,
      {
        provider: "microsoft",
        domain: DOMAIN,
        tenant_id: api.tenantId,
        client_id: randomUUID(),
        client_secret: api.clientSecret,
        secret_expires_at: new Date(NOW.getTime() + 10 * 86_400_000).toISOString(),
      },
      deps,
    );
    await verifyCalendarDelegation(env, delegation.id, { account: `boss@${DOMAIN}` }, deps);
    await run(env, deps);
    await dueNow(delegation.id);
    await run(env, deps);
    const emails = (await listNotifications(env.organizationId)).filter(
      (row) => row.kind === "scheduling.delegation_secret_expiring",
    );
    expect(emails).toHaveLength(1);
  });
});

describe("what a host can do", () => {
  test("nobody disconnects a delegated calendar, host or API key", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    const ana = await hostOn(env, "ana");
    await activeGoogle(env, deps);
    await run(env, deps);
    const [connection] = await listConnections(env, ana.id);
    expect(await code(disconnectCalendar(env, ana.id, connection?.id as string, deps))).toBe(
      "calendar_managed",
    );
  });
});

describe("the worker's lease", () => {
  test("several due delegations are all handled in one run", async () => {
    const env = await environment();
    const deps = googleDeps(new FakeGoogleCalendarApi());
    for (const domain of ["one.example", "two.example", "three.example"]) {
      const delegation = await createCalendarDelegation(
        env,
        { provider: "google", domain, service_account_key: account.key },
        deps,
      );
      await verifyCalendarDelegation(env, delegation.id, { account: `boss@${domain}` }, deps);
    }
    expect(await runDueCalendarDelegations(deps, { scope: scope(env) })).toBe(3);
    expect(await runDueCalendarDelegations(deps, { scope: scope(env) })).toBe(0);
  });

  test("a worker that lost its lease leaves the new holder's alone", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    await hostOn(env, "ana");
    const delegation = await activeGoogle(env, deps);
    const held = api.hold("POST", /freeBusy$/);
    const running = run(env, deps);
    await held.arrived;
    const theirs = new Date(NOW.getTime() + 3_600_000);
    await db
      .update(schema.schedulingCalendarDelegation)
      .set({ leaseUntil: theirs })
      .where(eq(schema.schedulingCalendarDelegation.id, delegation.id));
    held.release();
    await running;
    const [row] = await db
      .select()
      .from(schema.schedulingCalendarDelegation)
      .where(eq(schema.schedulingCalendarDelegation.id, delegation.id));
    expect(row?.leaseUntil?.getTime()).toBe(theirs.getTime());
  });
});

describe("deleting", () => {
  test("a pending delegation goes at once", async () => {
    const env = await environment();
    const deps = googleDeps(new FakeGoogleCalendarApi());
    const delegation = await createCalendarDelegation(
      env,
      { provider: "google", domain: DOMAIN, service_account_key: account.key },
      deps,
    );
    await deleteCalendarDelegation(env, delegation.id, deps);
    expect(await code(getCalendarDelegation(env, delegation.id))).toBe("not_found");
  });

  test("the worker stops each channel and removes each connection, then the delegation", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    const ana = await hostOn(env, "ana");
    const delegation = await activeGoogle(env, deps);
    await run(env, deps);
    await deleteCalendarDelegation(env, delegation.id, deps);
    expect((await getCalendarDelegation(env, delegation.id)).status).toBe("deleting");
    expect(
      await code(verifyCalendarDelegation(env, delegation.id, { account: `a@${DOMAIN}` }, deps)),
    ).toBe("not_found");
    await run(env, deps);
    expect(await listConnections(env, ana.id)).toEqual([]);
    expect(api.requests).toContain("POST /calendar/v3/channels/stop");
    expect(await logCount(env, "scheduling.calendar.disconnected")).toBe(1);
    await dueNow(delegation.id);
    await run(env, deps);
    expect(await code(getCalendarDelegation(env, delegation.id))).toBe("not_found");
  });

  test("details come off a host's events before the access goes", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    const ana = await hostOn(env, "ana");
    const eventType = await eventTypeFor(env, [ana.id]);
    await updateEventType(env, eventType.id, { host_calendar_details: "full" });
    const delegation = await activeGoogle(env, deps);
    await run(env, deps);
    await createBooking(
      env,
      { eventType: eventType.id, startMs: at("09:00"), attendee },
      testSchedulingDeps({ now: () => NOW }),
      actor,
    );
    await runDueCalendarWrites(deps, { scope: scope(env) });
    expect([...api.events.values()][0]?.title).toContain("Sam Lee");
    await deleteCalendarDelegation(env, delegation.id, deps);
    await run(env, deps);
    expect(await listConnections(env, ana.id)).toEqual([]);
    expect([...api.events.values()][0]?.title).toBe("Appointment");
  });

  test("a booking racing the removal still succeeds", async () => {
    const env = await environment();
    const api = new FakeGoogleCalendarApi();
    const deps = googleDeps(api);
    const ana = await hostOn(env, "ana");
    const eventType = await eventTypeFor(env, [ana.id]);
    const delegation = await activeGoogle(env, deps);
    await run(env, deps);
    await deleteCalendarDelegation(env, delegation.id, deps);
    const [booking] = await Promise.all([
      createBooking(
        env,
        { eventType: eventType.id, startMs: at("09:00"), attendee },
        testSchedulingDeps({ now: () => NOW }),
        actor,
      ),
      run(env, deps),
    ]);
    expect(booking.booking.status).toBe("confirmed");
  });
});

describe("Microsoft 365", () => {
  async function connected() {
    const env = await environment();
    const api = new FakeGraphApi();
    const deps = graphDeps(api);
    const ana = await hostOn(env, "ana");
    const ben = await hostOn(env, "ben");
    const delegation = await createCalendarDelegation(
      env,
      {
        provider: "microsoft",
        domain: DOMAIN,
        tenant_id: api.tenantId,
        client_id: randomUUID(),
        client_secret: api.clientSecret,
      },
      deps,
    );
    await verifyCalendarDelegation(env, delegation.id, { account: `boss@${DOMAIN}` }, deps);
    await run(env, deps);
    return { env, api, deps, ana, ben, delegation };
  }

  test("ids that would end up in a URL are refused unless they're ids", async () => {
    const env = await environment();
    const deps = graphDeps(new FakeGraphApi());
    expect(
      await code(
        createCalendarDelegation(
          env,
          {
            provider: "microsoft",
            domain: DOMAIN,
            tenant_id: "../evil",
            client_id: randomUUID(),
            client_secret: "x",
          },
          deps,
        ),
      ),
    ).toBe("invalid_calendar_delegation");
  });

  test("hosts connect through their own mailbox's path, never /me", async () => {
    const { env, api, ana } = await connected();
    expect(await listConnections(env, ana.id)).toMatchObject([
      { status: "active", account: `ana@${DOMAIN}`, provider: "microsoft" },
    ]);
    expect(api.requests).toContain(`GET /v1.0/users/ana%40acme.example/calendars`);
    expect(api.requests.some((request) => request.includes("/me"))).toBe(false);
  });

  test("a revoked consent is told apart from one mailbox, by asking about others", async () => {
    const { env, api, deps, ana, delegation } = await connected();
    // Tokens are still issued: only Graph's 403 inside `$batch` shows it.
    api.consentRevoked = true;
    const [connection] = await db
      .select()
      .from(schema.schedulingCalendarConnection)
      .where(eq(schema.schedulingCalendarConnection.hostId, ana.id));
    await db
      .update(schema.schedulingCalendar)
      .set({ nextSyncAt: new Date(0) })
      .where(eq(schema.schedulingCalendar.connectionId, connection?.id as string));
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    expect((await getCalendarDelegation(env, delegation.id)).status).toBe("failing");
    api.consentRevoked = false;
    await dueNow(delegation.id);
    await run(env, deps);
    expect((await getCalendarDelegation(env, delegation.id)).status).toBe("active");
  });

  test("a user removed from the tenant is theirs alone", async () => {
    const { env, api, deps, ana, ben, delegation } = await connected();
    api.goneMailboxes.add(`ana@${DOMAIN}`);
    await db
      .update(schema.schedulingCalendar)
      .set({ nextSyncAt: new Date(0) })
      .where(
        and(
          eq(schema.schedulingCalendar.hostId, ana.id),
          eq(schema.schedulingCalendar.organizationId, env.organizationId),
        ),
      );
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    expect((await getCalendarDelegation(env, delegation.id)).status).toBe("active");
    expect(await listConnections(env, ana.id)).toMatchObject([{ status: "needs_reauth" }]);
    expect(await listConnections(env, ben.id)).toMatchObject([{ status: "active" }]);
  });

  test("with only one mailbox to ask, a revoked consent still reaches the owners and recovers", async () => {
    const env = await environment();
    const api = new FakeGraphApi();
    const deps = graphDeps(api);
    const only = await hostOn(env, "only");
    const delegation = await createCalendarDelegation(
      env,
      {
        provider: "microsoft",
        domain: DOMAIN,
        tenant_id: api.tenantId,
        client_id: randomUUID(),
        client_secret: api.clientSecret,
      },
      deps,
    );
    await verifyCalendarDelegation(env, delegation.id, { account: `only@${DOMAIN}` }, deps);
    await run(env, deps);
    api.consentRevoked = true;
    await db
      .update(schema.schedulingCalendar)
      .set({ nextSyncAt: new Date(0) })
      .where(eq(schema.schedulingCalendar.hostId, only.id));
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    expect((await getCalendarDelegation(env, delegation.id)).status).toBe("failing");
    const emails = (await listNotifications(env.organizationId)).filter(
      (row) => row.kind === "scheduling.delegation_failing",
    );
    expect(emails).toHaveLength(1);
    api.consentRevoked = false;
    await verifyCalendarDelegation(env, delegation.id, { account: `only@${DOMAIN}` }, deps);
    expect(await listConnections(env, only.id)).toMatchObject([{ status: "active" }]);
  });

  test("verifying retries a mailbox straight away, instead of at the next hourly look", async () => {
    const { env, api, deps, ana, delegation } = await connected();
    api.goneMailboxes.add(`ana@${DOMAIN}`);
    await db
      .update(schema.schedulingCalendar)
      .set({ nextSyncAt: new Date(0) })
      .where(eq(schema.schedulingCalendar.hostId, ana.id));
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    expect(await listConnections(env, ana.id)).toMatchObject([{ status: "needs_reauth" }]);
    api.goneMailboxes.clear();
    await verifyCalendarDelegation(env, delegation.id, { account: `ana@${DOMAIN}` }, deps);
    await run(env, deps);
    expect(await listConnections(env, ana.id)).toMatchObject([{ status: "active" }]);
  });

  test("a mailbox outside the app's access policy only affects that host", async () => {
    const { env, api, deps, ana, ben, delegation } = await connected();
    api.deniedMailboxes.add(`ana@${DOMAIN}`);
    await db
      .update(schema.schedulingCalendar)
      .set({ nextSyncAt: new Date(0) })
      .where(eq(schema.schedulingCalendar.hostId, ana.id));
    await runDueCalendarSyncs(deps, { scope: scope(env) });
    expect((await getCalendarDelegation(env, delegation.id)).status).toBe("active");
    expect(await listConnections(env, ana.id)).toMatchObject([{ status: "needs_reauth" }]);
    expect(await listConnections(env, ben.id)).toMatchObject([{ status: "active" }]);
  });

  test("an expired secret is the delegation's problem, not each host's", async () => {
    const { env, api, deps, delegation } = await connected();
    api.clientSecret = "rotated";
    // No cached token for this mailbox yet, so connecting mints.
    await hostOn(env, "cara");
    await dueNow(delegation.id);
    await run(env, deps);
    const after = await getCalendarDelegation(env, delegation.id);
    expect(after.status).toBe("failing");
    expect(after.last_error_code).toBe("secret_expired");
  });
});

describe("tenancy", () => {
  test("another organization can't see or use a delegation", async () => {
    const env = await environment();
    const other = await environment();
    const deps = googleDeps(new FakeGoogleCalendarApi());
    const delegation = await activeGoogle(env, deps);
    expect(await code(getCalendarDelegation(other, delegation.id))).toBe("not_found");
    expect(
      await code(verifyCalendarDelegation(other, delegation.id, { account: `a@${DOMAIN}` }, deps)),
    ).toBe("not_found");
    expect(await code(deleteCalendarDelegation(other, delegation.id, deps))).toBe("not_found");
  });

  test("a host in another organization on the same domain isn't connected", async () => {
    const env = await environment();
    const other = await environment();
    const deps = googleDeps(new FakeGoogleCalendarApi());
    const theirs = await hostOn(other, "ana");
    await activeGoogle(env, deps);
    await run(env, deps);
    expect(await listConnections(other, theirs.id)).toEqual([]);
  });
});
