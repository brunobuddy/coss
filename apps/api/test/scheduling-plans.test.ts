import { describe, expect, test } from "bun:test";
import { BillingError, createPlanGate, createUsageGate, placeHold } from "@coss/billing";
import type { UsageGate } from "@coss/billing/gate";
import { createTestContract } from "@coss/billing/testing";
import { db, pool } from "@coss/db";
import { createForm, type FormEnvironment } from "@coss/forms";
import { CreateFormRequest } from "@coss/forms/schemas";
import { testFormChecks } from "@coss/forms/testing";
import { memoryLimiter } from "@coss/ratelimit/testing";
import { chargeDueHostFees, countLiveHosts, createBooking, createHost } from "@coss/scheduling";
import { testSchedulingDeps } from "@coss/scheduling/testing";
import { buildTestPdfBase64 } from "@coss/sign/testing";
import { createTestTenant, type TestTenant } from "@coss/tenancy/testing";
import { apiRequest, createTestApp, errorOf, type TestApp } from "./helpers.ts";

const MONDAY = "2031-01-06";
const at = (time: string) => `${MONDAY}T${time}:00.000Z`;
const FORMS_URL = "http://forms.coss.test";

function call(app: TestApp, key: string, method: string, path: string, body?: unknown) {
  return Promise.resolve(
    app.request(`/v1/scheduling${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
}

const hostBody = (uid: string) => ({ uid, name: `Host ${uid}`, time_zone: "UTC" });

const attendee = { uid: "patient_1", name: "Sam Lee", email: "sam@example.com", time_zone: "UTC" };

function enforced(extra: Parameters<typeof createTestApp>[0] = {}) {
  return createTestApp({ plans: createPlanGate(), billing: createUsageGate(), ...extra }).app;
}

async function onPlan(plan: "pro" | "scale"): Promise<TestTenant> {
  const tenant = await createTestTenant();
  await createTestContract(
    tenant.organization.id,
    { version: 1, plan },
    { effectiveFrom: new Date("2026-01-01T00:00:00Z") },
  );
  return tenant;
}

/** A host with hours and a one-on-one event type, in the key's environment. */
async function bookable(app: TestApp, key: string) {
  expect((await call(app, key, "POST", "/hosts", hostBody("h1"))).status).toBe(201);
  const schedule = await call(app, key, "POST", "/hosts/h1/schedules", {
    rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
  });
  expect(schedule.status).toBe(201);
  const created = await call(app, key, "POST", "/event_types", {
    title: "Consultation",
    duration_minutes: 30,
    hosts: [{ host: "h1" }],
  });
  expect(created.status).toBe(201);
  return ((await created.json()) as { id: string }).id;
}

describe("Scheduling's plan gates", () => {
  test("Free has 3 live hosts across environments; sandbox has no limit", async () => {
    const tenant = await createTestTenant();
    const app = enforced();
    for (const uid of ["a", "b", "c"]) {
      expect((await call(app, tenant.liveKey, "POST", "/hosts", hostBody(uid))).status).toBe(201);
    }
    const refused = await call(app, tenant.liveKey, "POST", "/hosts", hostBody("d"));
    expect(refused.status).toBe(402);
    expect(await errorOf(refused)).toMatchObject({
      type: "billing_error",
      code: "plan_limit_reached",
      message: expect.stringContaining("3 scheduling hosts"),
    });
    for (const uid of ["a", "b", "c", "d", "e"]) {
      expect((await call(app, tenant.sandboxKey, "POST", "/hosts", hostBody(uid))).status).toBe(
        201,
      );
    }
  });

  test("deleting a live host makes room for another", async () => {
    const tenant = await createTestTenant();
    const app = enforced();
    for (const uid of ["a", "b", "c"]) {
      await call(app, tenant.liveKey, "POST", "/hosts", hostBody(uid));
    }
    expect((await call(app, tenant.liveKey, "DELETE", "/hosts/a")).status).toBe(200);
    expect((await call(app, tenant.liveKey, "POST", "/hosts", hostBody("d"))).status).toBe(201);
  });

  test("Scale has no host limit past what it includes", async () => {
    const tenant = await onPlan("scale");
    const app = enforced();
    for (const uid of ["a", "b", "c", "d"]) {
      expect((await call(app, tenant.liveKey, "POST", "/hosts", hostBody(uid))).status).toBe(201);
    }
  });

  test("concurrent creates can't pass the limit, and the gate isn't asked under the lock", async () => {
    const tenant = await createTestTenant();
    const gate = createPlanGate();
    let asked = 0;
    const app = enforced({
      plans: {
        ...gate,
        requireCapacity: async (...args) => {
          asked++;
          return gate.requireCapacity(...args);
        },
      },
    });
    const results = await Promise.all(
      ["a", "b", "c", "d", "e"].map((uid) =>
        call(app, tenant.liveKey, "POST", "/hosts", hostBody(uid)),
      ),
    );
    expect(results.filter((res) => res.status === 201)).toHaveLength(3);
    expect(results.filter((res) => res.status === 402)).toHaveLength(2);
    expect(await countLiveHosts(tenant.organization.id)).toBe(3);
    // Only the refused ones: a create that fits never takes a second connection under the lock.
    expect(asked).toBe(2);
  });

  test("an empty host_filter is a filter: it matches every active host", async () => {
    const pro = await onPlan("pro");
    const app = enforced();
    const res = await call(app, pro.liveKey, "POST", "/event_types", {
      title: "Pool",
      kind: "pool",
      duration_minutes: 30,
      hosts: [],
      host_filter: {},
    });
    expect(res.status).toBe(402);
  });

  test("a retry of a key already used meets no plan gate", async () => {
    const scale = await onPlan("scale");
    const app = enforced();
    const eventType = await bookable(app, scale.liveKey);
    const body = { event_type: eventType, start: at("09:00"), attendee };
    const keyed = (target: TestApp, key: string, payload: object) =>
      target.request("/v1/scheduling/holds", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${scale.liveKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify(payload),
      });
    expect((await keyed(app, "hold-key", body)).status).toBe(201);
    // The plan no longer has it, as after a downgrade.
    const lower = enforced({
      plans: {
        ...createPlanGate(),
        requireFeature: async () => {
          throw new BillingError("plan_feature_unavailable", "Not on this plan.");
        },
      },
    });
    const replay = await keyed(lower, "hold-key", body);
    expect(replay.status).toBe(201);
    expect(replay.headers.get("Idempotent-Replayed")).toBe("true");
    expect((await keyed(lower, "another-key", { ...body, start: at("10:00") })).status).toBe(402);
  });

  test("an expired key makes something new, so it meets the plan", async () => {
    const free = await createTestTenant();
    const app = enforced();
    const eventType = await bookable(app, free.liveKey);
    const body = { event_type: eventType, start: at("09:00"), attendee };
    const withKey = (path: string, payload: object) =>
      app.request(`/v1/scheduling${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${free.liveKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "old-key",
        },
        body: JSON.stringify(payload),
      });
    expect((await withKey("/bookings", body)).status).toBe(201);
    await pool.query(
      "update scheduling_booking set created_at = now() - interval '2 days' where organization_id = $1 and idempotency_key = 'old-key'",
      [free.organization.id],
    );
    expect((await withKey("/holds", { ...body, start: at("10:00") })).status).toBe(402);
  });

  test("the API's retry of a request made before the gate existed still replays", async () => {
    const tenant = await onPlan("scale");
    const app = enforced();
    const eventType = await bookable(app, tenant.liveKey);
    const start = at("09:00");
    // What a pre-deploy request hashed: no `gateRouting` in it.
    const { booking } = await createBooking(
      {
        organizationId: tenant.organization.id,
        projectId: tenant.project.id,
        environmentId: tenant.production.id,
        mode: "live",
      },
      { eventType, startMs: new Date(start).getTime(), attendee, idempotencyKey: "pre-deploy" },
      testSchedulingDeps(),
      { kind: "api_key", id: "key_test" },
    );
    const replay = await app.request("/v1/scheduling/bookings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tenant.liveKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "pre-deploy",
      },
      body: JSON.stringify({ event_type: eventType, start, attendee }),
    });
    expect(replay.status).toBe(201);
    expect(replay.headers.get("Idempotent-Replayed")).toBe("true");
    expect(((await replay.json()) as { id: string }).id).toBe(booking.id);
  });

  test("the embedded host portal needs Scale", async () => {
    const free = await createTestTenant();
    const app = enforced();
    await call(app, free.liveKey, "POST", "/hosts", hostBody("a"));
    const refused = await call(app, free.liveKey, "POST", "/hosts/a/sessions", {});
    expect(refused.status).toBe(402);
    expect(await errorOf(refused)).toMatchObject({
      code: "plan_feature_unavailable",
      message: expect.stringContaining("Scale"),
    });

    await call(app, free.sandboxKey, "POST", "/hosts", hostBody("a"));
    expect((await call(app, free.sandboxKey, "POST", "/hosts/a/sessions", {})).status).toBe(201);

    const scale = await onPlan("scale");
    await call(app, scale.liveKey, "POST", "/hosts", hostBody("a"));
    expect((await call(app, scale.liveKey, "POST", "/hosts/a/sessions", {})).status).toBe(201);
  });

  test("holds need a paid plan; what they hold still confirms", async () => {
    const free = await createTestTenant();
    const app = enforced();
    const eventType = await bookable(app, free.liveKey);
    const refused = await call(app, free.liveKey, "POST", "/holds", {
      event_type: eventType,
      start: at("09:00"),
      attendee,
    });
    expect(refused.status).toBe(402);
    expect((await errorOf(refused)).message).toContain("Pro");

    const pro = await onPlan("pro");
    const proEvent = await bookable(app, pro.liveKey);
    const held = await call(app, pro.liveKey, "POST", "/holds", {
      event_type: proEvent,
      start: at("09:00"),
      attendee,
    });
    expect(held.status).toBe(201);
  });

  test("attribute routing needs Scale, in live environments", async () => {
    const pro = await onPlan("pro");
    const app = enforced();
    const eventType = await bookable(app, pro.liveKey);
    const onHold = await call(app, pro.liveKey, "POST", "/holds", {
      event_type: eventType,
      start: at("09:00"),
      attendee,
      attributes: { specialty: "dermatology" },
    });
    expect(onHold.status).toBe(402);
    expect((await errorOf(onHold)).code).toBe("plan_feature_unavailable");
    const filtered = await call(app, pro.liveKey, "POST", "/event_types", {
      title: "Pool",
      kind: "pool",
      duration_minutes: 30,
      hosts: [],
      host_filter: { specialty: "dermatology" },
    });
    expect(filtered.status).toBe(402);
    const booked = await call(app, pro.liveKey, "POST", "/bookings", {
      event_type: eventType,
      start: at("09:00"),
      attendee,
      attributes: { specialty: "dermatology" },
    });
    expect(booked.status).toBe(402);
    expect((await errorOf(booked)).code).toBe("plan_feature_unavailable");
    const plain = await call(app, pro.liveKey, "POST", "/bookings", {
      event_type: eventType,
      start: at("09:00"),
      attendee,
    });
    expect(plain.status).toBe(201);
  });

  test("a group session's seats are limited by plan, and an existing size can stay", async () => {
    const free = await createTestTenant();
    const app = enforced();
    await call(app, free.liveKey, "POST", "/hosts", hostBody("a"));
    const group = (capacity: number) => ({
      title: "Class",
      kind: "group",
      capacity,
      duration_minutes: 60,
      hosts: [{ host: "a" }],
    });
    const refused = await call(app, free.liveKey, "POST", "/event_types", group(11));
    expect(refused.status).toBe(402);
    expect((await errorOf(refused)).message).toContain("10 seats per group session");
    const created = await call(app, free.liveKey, "POST", "/event_types", group(10));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect(
      (await call(app, free.liveKey, "PATCH", `/event_types/${id}`, { capacity: 11 })).status,
    ).toBe(402);
    expect(
      (await call(app, free.liveKey, "PATCH", `/event_types/${id}`, { capacity: 8 })).status,
    ).toBe(200);
  });

  test("a live search covers the plan's hosts and says there were more", async () => {
    const pro = await onPlan("pro");
    const app = enforced();
    const uids = Array.from({ length: 3 }, (_, index) => `h${index}`);
    for (const uid of uids) {
      await call(app, pro.liveKey, "POST", "/hosts", hostBody(uid));
      await call(app, pro.liveKey, "POST", `/hosts/${uid}/schedules`, {
        rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" }],
      });
    }
    const created = await call(app, pro.liveKey, "POST", "/event_types", {
      title: "Pool",
      kind: "pool",
      duration_minutes: 30,
      hosts: uids.map((host) => ({ host })),
    });
    const { id } = (await created.json()) as { id: string };
    const search = async () => {
      const res = await call(app, pro.liveKey, "POST", "/availability/search", {
        event_type: id,
        start: at("09:00"),
        end: at("12:00"),
      });
      expect(res.status).toBe(200);
      return (await res.json()) as { data: unknown[]; has_more: boolean };
    };
    expect(await search()).toMatchObject({ has_more: false });
    expect((await search()).data).toHaveLength(3);

    // The same search with the plan's limit below the pool.
    const small = enforced({ plans: { ...createPlanGate(), limit: async () => 2 } });
    const res = await call(small, pro.liveKey, "POST", "/availability/search", {
      event_type: id,
      start: at("09:00"),
      end: at("12:00"),
    });
    const cut = (await res.json()) as { data: unknown[]; has_more: boolean };
    expect(cut.data).toHaveLength(2);
    expect(cut.has_more).toBe(true);
  });

  test("live slot lists are limited per organization at the plan's rate", async () => {
    const tenant = await createTestTenant();
    const app = enforced({ rateLimiter: memoryLimiter() });
    const eventType = await bookable(app, tenant.liveKey);
    const path = `/event_types/${eventType}/slots?start=${at("09:00")}&end=${at("10:00")}`;
    let status = 200;
    for (let index = 0; index < 60 && status === 200; index++) {
      status = (await call(app, tenant.liveKey, "GET", path)).status;
    }
    expect(status).toBe(429);
  });

  test("pages show the attribution below Scale, and not on it", async () => {
    const app = enforced();
    const sessionOf = async (tenant: TestTenant, key = tenant.liveKey) => {
      const eventType = await bookable(app, key);
      const res = await call(app, key, "POST", "/booker_sessions", {
        event_type: eventType,
      });
      const { token } = (await res.json()) as { token: string };
      const session = await app.request("/scheduling/client/session", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return (await session.json()) as { coss_attribution: boolean };
    };
    expect((await sessionOf(await createTestTenant())).coss_attribution).toBe(true);
    expect((await sessionOf(await onPlan("scale"))).coss_attribution).toBe(false);
    // A sandbox has everything on every plan.
    const sandbox = await createTestTenant();
    expect((await sessionOf(sandbox, sandbox.sandboxKey)).coss_attribution).toBe(false);
  });

  test("a scheduled downgrade keeps the attribution off until it applies", async () => {
    const tenant = await createTestTenant();
    await createTestContract(
      tenant.organization.id,
      { version: 1, plan: "scale" },
      {
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
        effectiveUntil: new Date("2099-01-01T00:00:00Z"),
      },
    );
    await createTestContract(
      tenant.organization.id,
      { version: 1, plan: "pro" },
      { effectiveFrom: new Date("2099-01-01T00:00:00Z") },
    );
    expect(await createPlanGate().hasFeature(tenant.organization.id, "schedulingWhiteLabel")).toBe(
      true,
    );
  });
});

describe("the host fee", () => {
  test("past a capped plan's allowance a new host is refused, an existing one written off", async () => {
    const tenant = await createTestTenant();
    const refusing: UsageGate = {
      async reserve() {
        throw new BillingError("usage_limit_exceeded", "Past the allowance.");
      },
    };
    const env = {
      organizationId: tenant.organization.id,
      projectId: tenant.project.id,
      environmentId: tenant.production.id,
      mode: "live" as const,
    };
    const after = new Date("2027-02-01T00:00:00Z");
    await expect(
      createHost(
        env,
        { uid: "over", name: "Over", time_zone: "UTC" },
        { billing: refusing, now: after },
      ),
    ).rejects.toMatchObject({ code: "usage_limit_exceeded" });
    expect(await countLiveHosts(tenant.organization.id)).toBe(0);
  });

  const usage = async (organizationId: string) => {
    const { rows } = await pool.query<{ quantity: string }>(
      "select coalesce(sum(quantity), 0) as quantity from billing_usage where organization_id = $1 and meter = 'scheduling.hosts'",
      [organizationId],
    );
    return Number(rows[0]?.quantity);
  };

  test("nothing is charged before the meter is priced, and a day at a time after", async () => {
    const tenant = await onPlan("scale");
    const app = enforced();
    await createHost(
      {
        organizationId: tenant.organization.id,
        projectId: tenant.project.id,
        environmentId: tenant.production.id,
        mode: "live",
      },
      hostBody("a"),
      { now: new Date("2026-12-01T00:00:00Z") },
    );
    await call(app, tenant.sandboxKey, "POST", "/hosts", hostBody("sandbox"));
    const scope = { organizationIds: [tenant.organization.id] };
    expect(await chargeDueHostFees({ now: new Date("2026-12-31T23:00:00Z"), scope })).toBe(0);
    expect(await usage(tenant.organization.id)).toBe(0);
    // The first day of the priced card, once; the sandbox host is never charged.
    expect(await chargeDueHostFees({ now: new Date("2027-01-01T00:00:01Z"), scope })).toBe(1);
    expect(await chargeDueHostFees({ now: new Date("2027-01-01T00:00:02Z"), scope })).toBe(0);
    expect(await chargeDueHostFees({ now: new Date("2027-01-02T00:00:01Z"), scope })).toBe(1);
    expect(await usage(tenant.organization.id)).toBe(2);
  });
});

describe("holds reach every new live usage", () => {
  const held = () => onPlan("scale");
  const hold = (tenant: TestTenant) =>
    db.transaction((tx) => placeHold(tx, tenant.organization.id, "delinquent", "Overdue"));

  test("new bookings and series are refused; holds already made still confirm", async () => {
    const tenant = await held();
    const app = enforced();
    const eventType = await bookable(app, tenant.liveKey);
    const earlier = await call(app, tenant.liveKey, "POST", "/holds", {
      event_type: eventType,
      start: at("10:00"),
      attendee,
    });
    expect(earlier.status).toBe(201);
    const { id } = (await earlier.json()) as { id: string };
    await hold(tenant);

    const refused = await call(app, tenant.liveKey, "POST", "/bookings", {
      event_type: eventType,
      start: at("09:00"),
      attendee,
    });
    expect(refused.status).toBe(402);
    expect((await errorOf(refused)).code).toBe("billing_hold");
    expect(
      (
        await call(app, tenant.liveKey, "POST", "/holds", {
          event_type: eventType,
          start: at("11:00"),
          attendee,
        })
      ).status,
    ).toBe(402);
    expect((await call(app, tenant.liveKey, "POST", `/holds/${id}/confirm`, {})).status).toBe(200);
  });

  test("a retry of what was already made still answers with it", async () => {
    const tenant = await held();
    const app = enforced();
    const eventType = await bookable(app, tenant.liveKey);
    const keyed = (path: string, body: object, key: string) =>
      app.request(`/v1/scheduling${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tenant.liveKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify(body),
      });
    const booking = { event_type: eventType, start: at("09:00"), attendee };
    const series = {
      event_type: eventType,
      start: at("12:00"),
      attendee,
      recurrence: { frequency: "weekly", interval: 1, count: 2 },
    };
    const made = await keyed("/bookings", booking, "booking-key");
    expect(made.status).toBe(201);
    const madeSeries = await keyed("/series", series, "series-key");
    expect(madeSeries.status).toBe(201);
    await hold(tenant);
    const again = await keyed("/bookings", booking, "booking-key");
    expect(again.status).toBe(201);
    expect(again.headers.get("Idempotent-Replayed")).toBe("true");
    const seriesAgain = await keyed("/series", series, "series-key");
    expect(seriesAgain.status).toBe(201);
    expect(seriesAgain.headers.get("Idempotent-Replayed")).toBe("true");
    expect((await keyed("/bookings", { ...booking, start: at("10:00") }, "new-key")).status).toBe(
      402,
    );
  });

  test("new live hosts are refused: they would be a new monthly charge", async () => {
    const tenant = await held();
    const app = enforced();
    await hold(tenant);
    const refused = await call(app, tenant.liveKey, "POST", "/hosts", hostBody("a"));
    expect(refused.status).toBe(402);
    expect((await errorOf(refused)).code).toBe("billing_hold");
    expect((await call(app, tenant.sandboxKey, "POST", "/hosts", hostBody("a"))).status).toBe(201);
  });

  test("the person on the booking page doesn't hear about the customer's billing", async () => {
    const tenant = await held();
    const app = enforced();
    const eventType = await bookable(app, tenant.liveKey);
    const session = await call(app, tenant.liveKey, "POST", "/booker_sessions", {
      event_type: eventType,
    });
    const { token } = (await session.json()) as { token: string };
    await hold(tenant);
    const res = await app.request("/scheduling/client/bookings", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ start: at("09:00"), attendee }),
    });
    expect(res.status).toBe(403);
    const error = await errorOf(res);
    expect(error.code).toBe("account_suspended");
    expect(error.message).not.toMatch(/invoice|spend|budget/i);
  });

  test("a sandbox keeps booking", async () => {
    const tenant = await held();
    const app = enforced();
    const eventType = await bookable(app, tenant.sandboxKey);
    await hold(tenant);
    expect(
      (
        await call(app, tenant.sandboxKey, "POST", "/bookings", {
          event_type: eventType,
          start: at("09:00"),
          attendee,
        })
      ).status,
    ).toBe(201);
  });

  test("hosted forms close to live submissions, and look closed", async () => {
    const tenant = await held();
    const env: FormEnvironment = {
      organizationId: tenant.organization.id,
      projectId: tenant.project.id,
      environmentId: tenant.production.id,
      mode: "live",
    };
    const form = await createForm(env, CreateFormRequest.parse({ name: "Contact" }), {
      links: { publicUrl: FORMS_URL },
      checks: testFormChecks(),
    });
    const { app } = createTestApp();
    const post = () =>
      app.fetch(
        new Request(`${FORMS_URL}/f/${form.id}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
            Origin: "https://www.example.com",
          },
          body: new URLSearchParams({ email: "ada@example.com", message: "Hi" }).toString(),
        }),
      );
    expect((await post()).status).toBe(200);
    await hold(tenant);
    const refused = await post();
    expect(refused.status).toBe(404);
    expect(await refused.text()).not.toMatch(/invoice|spend|billing/i);
  });

  test("new live inboxes are refused", async () => {
    const tenant = await held();
    const { app } = createTestApp();
    await hold(tenant);
    const refused = await apiRequest(app, "POST", "/v1/inboxes", {
      key: tenant.liveKey,
      body: { username: "support" },
    });
    expect(refused.status).toBe(402);
    expect((await errorOf(refused)).code).toBe("billing_hold");
  });

  test("a retry of a signature request, and sending one already sent, still answer", async () => {
    const tenant = await held();
    const { app } = createTestApp();
    const body = {
      title: "NDA",
      documents: [{ filename: "nda.pdf", content: await buildTestPdfBase64() }],
      signers: [
        {
          name: "Ada Lovelace",
          email: "ada@example.com",
          fields: [{ type: "signature", anchor: "{{signature:signer_1}}" }],
        },
      ],
    };
    const send = () =>
      apiRequest(app, "POST", "/v1/sign/requests", {
        key: tenant.liveKey,
        headers: { "Idempotency-Key": "sign-key" },
        body,
      });
    const made = await send();
    expect(made.status).toBe(201);
    const { id } = (await made.json()) as { id: string };
    await hold(tenant);
    const again = await send();
    expect(again.status).toBeLessThan(300);
    expect(((await again.json()) as { id: string }).id).toBe(id);
    const sentAgain = await apiRequest(app, "POST", `/v1/sign/requests/${id}/send`, {
      key: tenant.liveKey,
      body: {},
    });
    expect(sentAgain.status).toBe(200);
  });

  test("new live signature requests are refused", async () => {
    const tenant = await held();
    const { app } = createTestApp();
    await hold(tenant);
    const refused = await apiRequest(app, "POST", "/v1/sign/requests", {
      key: tenant.liveKey,
      body: {
        title: "NDA",
        documents: [{ filename: "nda.pdf", content: await buildTestPdfBase64() }],
        signers: [
          {
            name: "Ada Lovelace",
            email: "ada@example.com",
            fields: [{ type: "signature", anchor: "{{signature:signer_1}}" }],
          },
        ],
      },
    });
    expect(refused.status).toBe(402);
    expect((await errorOf(refused)).code).toBe("billing_hold");
  });
});
