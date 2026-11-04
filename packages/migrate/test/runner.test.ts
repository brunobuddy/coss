import { describe, expect, test } from "bun:test";
import type { PlanGate } from "@coss/billing/gate";
import { db, schema } from "@coss/db";
import {
  createEmailTemplate,
  createTopic,
  getContact,
  getContactTopics,
  getEmailTemplate,
  listAudienceContacts,
  listContactPropertyRows,
  listSuppressions,
  topicsByKey,
} from "@coss/email";
import { CreateEmailTemplateRequest } from "@coss/email/schemas";
import { createTestTenant, type TestTenant } from "@coss/tenancy/testing";
import { LATEST_API_VERSION } from "@coss/versioning";
import { createWebhookEndpoint, listWebhookEndpoints } from "@coss/webhooks";
import { TEST_SECRETS_KEYS, testManagementDeps } from "@coss/webhooks/testing";
import { and, eq } from "drizzle-orm";
import { ProviderError } from "../src/http.ts";
import {
  cancelMigration,
  connectMigration,
  getMigration,
  inventoryOf,
  listMigrationItems,
  type MigrationKind,
  progressOf,
  purgeAbandonedMigrationDrafts,
  purgeExpiredMigrations,
  runDueMigrations,
  startMigration,
} from "../src/index.ts";
import { cleanTemplate, type FakeSourceData, fakeSource } from "../src/testing.ts";

const KEY = "re_test_0123456789abcdef";

function envOf(tenant: TestTenant) {
  return { organizationId: tenant.organization.id, environmentId: tenant.development.id };
}

function scopeOf(tenant: TestTenant) {
  return { organizationIds: [tenant.organization.id] };
}

function depsFor(data: FakeSourceData, overrides: { plans?: PlanGate } = {}) {
  return {
    secretsKeys: TEST_SECRETS_KEYS,
    webhooks: testManagementDeps,
    createSource: () => fakeSource(data),
    ...overrides,
  };
}

async function connect(tenant: TestTenant) {
  const row = await connectMigration(
    envOf(tenant),
    { provider: "resend", apiKey: KEY, options: {}, userId: tenant.owner.id },
    { secretsKeys: TEST_SECRETS_KEYS },
  );
  if (!row) throw new Error("not connected");
  return row;
}

/** Runs the worker until the import settles (or `maxRuns`). */
async function settle(
  tenant: TestTenant,
  deps: ReturnType<typeof depsFor>,
  opts: { maxRuns?: number; stepMs?: number; aheadMs?: number } = {},
) {
  for (let run = 0; run < (opts.maxRuns ?? 200); run++) {
    const advanced = await runDueMigrations(deps, {
      scope: scopeOf(tenant),
      now: new Date(Date.now() + (opts.aheadMs ?? 1000)),
      ...(opts.stepMs !== undefined ? { stepMs: opts.stepMs } : {}),
    });
    if (advanced === 0) return;
  }
}

async function startAll(
  tenant: TestTenant,
  id: string,
  kinds: MigrationKind[] = ["templates", "contacts", "suppressions", "webhooks"],
) {
  const started = await startMigration(envOf(tenant), id, {
    kinds,
    domainIds: [],
    webhookApiVersion: LATEST_API_VERSION,
  });
  if (!started) throw new Error("not started");
  return started;
}

const DATA: FakeSourceData = {
  properties: [
    { id: "plan", name: "Plan", type: "string", fallback: null },
    { id: "seats", name: "seats", type: "number", fallback: null },
    // A built-in field name gets the provider's prefix.
    { id: "email", name: "Email", type: "string", fallback: null },
  ],
  topics: [
    {
      id: "t1",
      name: "Product updates",
      description: "News",
      defaultSubscription: "opt_in",
      visibility: "public",
    },
  ],
  lists: [{ id: "l1", name: "Customers", contactCount: 2 }],
  templates: [
    { id: "tpl1", name: "Welcome", alias: "welcome", converted: cleanTemplate(), notes: [] },
    {
      id: "tpl2",
      name: "Receipt",
      alias: null,
      converted: cleanTemplate({
        html: "<p>{{formatDate date}}</p>",
        lossless: false,
        warnings: [{ field: "html", line: 1, column: 4, message: "formatDate isn't supported." }],
      }),
      notes: [],
    },
  ],
  contacts: [
    {
      email: "ada@example.com",
      firstName: "Ada",
      lastName: null,
      unsubscribed: false,
      properties: { plan: "pro", seats: 3, email: "x" },
      topics: [{ topicId: "t1", status: "opted_out" }],
    },
    {
      email: "bob@example.com",
      firstName: null,
      lastName: null,
      unsubscribed: true,
      properties: {},
      topics: [],
    },
  ],
  members: { l1: ["ada@example.com", "bob@example.com", "nobody@example.com"] },
  suppressions: [
    {
      address: "bounced@example.com",
      scope: { kind: "all" },
      reason: "bounce",
      createdAt: new Date("2025-01-02T03:04:05.000Z"),
    },
    { address: "spam@example.com", scope: { kind: "all" }, reason: "complaint", createdAt: null },
    {
      address: "left@example.com",
      scope: { kind: "marketing" },
      reason: "unsubscribe",
      createdAt: null,
    },
    // An unsubscribe from a topic: a contact's opt-out, else a suppression for its category.
    {
      address: "bob@example.com",
      scope: { kind: "topic", topicId: "t1" },
      reason: "unsubscribe",
      createdAt: null,
    },
    {
      address: "stranger@example.com",
      scope: { kind: "topic", topicId: "t1" },
      reason: "unsubscribe",
      createdAt: null,
    },
  ],
  webhooks: [
    {
      id: "wh1",
      url: "https://example.com/hooks",
      name: "Main",
      eventTypes: ["email.bounced", "email.delivered"],
      unmapped: ["domain.created"],
      notes: [],
    },
    {
      id: "wh2",
      url: "https://example.com/other",
      name: "Other",
      eventTypes: [],
      unmapped: ["x"],
      notes: [],
    },
  ],
};

describe("runDueMigrations", () => {
  test("inspects, then imports everything chosen and deletes the key", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const deps = depsFor(DATA);
    const row = await connect(tenant);
    expect(row.credentialsCiphertext).not.toContain(KEY);
    expect(row.credentialHint).toBe("…cdef");

    await settle(tenant, deps);
    const ready = await getMigration(env, row.id);
    expect(ready?.status).toBe("ready");
    expect(inventoryOf(ready ?? { inventory: null })?.templates).toHaveLength(2);

    await startAll(tenant, row.id);
    await settle(tenant, deps);
    const done = await getMigration(env, row.id);
    expect(done).toMatchObject({
      status: "completed",
      credentialsCiphertext: null,
      lastError: null,
    });
    expect(done?.finishedAt).toBeInstanceOf(Date);

    const properties = await listContactPropertyRows(env);
    expect(properties.map((p) => [p.key, p.type]).sort()).toEqual([
      ["plan", "string"],
      ["resend_email", "string"],
      ["seats", "number"],
    ]);
    const topic = (await topicsByKey(env)).get("product_updates");
    expect(topic).toMatchObject({ name: "Product updates", defaultSubscription: "opt_in" });

    expect(await getContact(env, "ada@example.com")).toMatchObject({
      first_name: "Ada",
      status: "subscribed",
      properties: { plan: "pro", seats: 3, resend_email: "x" },
    });
    expect((await getContact(env, "bob@example.com"))?.status).toBe("unsubscribed");
    const choice = async (email: string) =>
      (await getContactTopics(env, email))?.topics.find((t) => t.topic === "product_updates")
        ?.choice;
    expect(await choice("ada@example.com")).toBe("opted_out");
    expect(await choice("bob@example.com")).toBe("opted_out");

    const items = await listMigrationItems(env, row.id);
    const audienceId = items.find((item) => item.kind === "audience")?.targetId ?? "";
    const members = await listAudienceContacts(env, audienceId, {});
    expect(members?.data.map((c) => c.email).sort()).toEqual([
      "ada@example.com",
      "bob@example.com",
    ]);

    const suppressions = (await listSuppressions(env)).data;
    expect(suppressions.map((s) => [s.address, s.scope, s.reason]).sort()).toEqual([
      ["bounced@example.com", "*", "bounce"],
      ["left@example.com", "stream:marketing", "unsubscribe"],
      ["spam@example.com", "*", "complaint"],
      ["stranger@example.com", "product_updates", "unsubscribe"],
    ]);
    expect(suppressions.find((s) => s.address === "bounced@example.com")?.created_at).toBe(
      "2025-01-02T03:04:05.000Z",
    );

    const welcome = await getEmailTemplate(env, "welcome");
    expect(welcome?.publishedVersion).toBe(1);
    const receipt = await getEmailTemplate(env, "receipt");
    expect(receipt?.publishedVersion).toBeNull();
    expect(items.find((item) => item.sourceId === "tpl2")).toMatchObject({
      outcome: "created",
      needsReview: true,
      warnings: ["html 1:4: formatDate isn't supported."],
    });

    const endpoints = await listWebhookEndpoints(env);
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0]).toMatchObject({
      url: "https://example.com/hooks",
      enabled: false,
      eventTypes: ["email.bounced", "email.delivered"],
    });
    expect(items.find((item) => item.sourceId === "wh2")?.outcome).toBe("skipped");
    expect(items.find((item) => item.sourceId === "wh1")?.warnings).toEqual([
      "Not on coss.com, left out: domain.created.",
    ]);

    const progress = progressOf(done ?? { progress: {} });
    expect(progress.contacts).toMatchObject({ state: "done", created: 2 });
    expect(progress.memberships).toMatchObject({ created: 2, skipped: 1 });
    expect(progress.suppressions).toMatchObject({ state: "done", created: 4, updated: 1 });

    const [audit] = await db
      .select()
      .from(schema.orgAuditEvent)
      .where(
        and(
          eq(schema.orgAuditEvent.organizationId, tenant.organization.id),
          eq(schema.orgAuditEvent.action, "migration.completed"),
        ),
      );
    expect(audit).toMatchObject({ actorType: "system", targetId: row.id });
  });

  test("works in short steps from its cursor, and a second import finds what exists", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const contacts = Array.from({ length: 25 }, (_, i) => ({
      email: `user${i}@example.com`,
      firstName: null,
      lastName: null,
      unsubscribed: false,
      properties: {},
      topics: [],
    }));
    const data = { ...DATA, contacts, pageSize: 4 };
    const deps = depsFor(data);
    const first = await connect(tenant);
    await settle(tenant, deps);
    await startAll(tenant, first.id);
    // Each step stops after one page or object.
    await settle(tenant, deps, { stepMs: 0, maxRuns: 500 });
    expect((await getMigration(env, first.id))?.status).toBe("completed");
    expect(
      progressOf((await getMigration(env, first.id)) ?? { progress: {} }).contacts?.created,
    ).toBe(25);

    const second = await connect(tenant);
    await settle(tenant, deps);
    await startAll(tenant, second.id);
    await settle(tenant, deps);
    const items = await listMigrationItems(env, second.id);
    expect(items.filter((item) => item.kind !== "webhook_endpoint").map((i) => i.outcome)).toEqual(
      items.filter((item) => item.kind !== "webhook_endpoint").map(() => "existing"),
    );
    expect(items.find((item) => item.sourceId === "wh1")?.outcome).toBe("existing");
    expect(await listWebhookEndpoints(env)).toHaveLength(1);
    expect(
      progressOf((await getMigration(env, second.id)) ?? { progress: {} }).contacts,
    ).toMatchObject({ created: 0, updated: 25 });
  });

  test("a cancel during a step stops it before its next write", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const row = await connect(tenant);
    await settle(tenant, depsFor(DATA));
    await startAll(tenant, row.id, ["templates"]);
    const deps = depsFor({
      ...DATA,
      // The customer cancels while the first template is being read.
      before: async (method, call) => {
        if (method === "template" && call === 1) await cancelMigration(env, row.id);
      },
    });
    await settle(tenant, deps);
    expect(await getMigration(env, row.id)).toMatchObject({
      status: "canceled",
      credentialsCiphertext: null,
    });
    // The template in flight was finished; nothing after it was written.
    expect(await getEmailTemplate(env, "welcome")).not.toBeNull();
    expect(await getEmailTemplate(env, "receipt")).toBeNull();
    expect(await listMigrationItems(env, row.id)).toHaveLength(1);
  });

  test("a retry finishes what a stopped attempt left: its template's publication, its counts", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const row = await connect(tenant);
    await settle(tenant, depsFor(DATA));
    await startAll(tenant, row.id, ["templates"]);
    // The attempt that stopped had created Welcome (not yet published) and finished Receipt,
    // but saved no checkpoint after either.
    const draft = await createEmailTemplate(
      env,
      CreateEmailTemplateRequest.parse({
        name: "Welcome",
        alias: "welcome",
        variables: [{ name: "name", type: "string", required: false }],
        contents: [{ locale: "en", subject: "Hello {{name}}", html: "<p>Hi {{name}}</p>" }],
      }),
    );
    await db.insert(schema.migrationItem).values([
      {
        migrationId: row.id,
        organizationId: tenant.organization.id,
        kind: "template",
        sourceId: "tpl1",
        sourceName: "Welcome",
        targetName: "welcome",
        targetId: draft.id,
      },
      {
        migrationId: row.id,
        organizationId: tenant.organization.id,
        kind: "template",
        sourceId: "tpl2",
        sourceName: "Receipt",
        targetName: "receipt",
        outcome: "created",
      },
    ]);
    await settle(tenant, depsFor(DATA));
    const done = await getMigration(env, row.id);
    expect(done?.status).toBe("completed");
    expect((await getEmailTemplate(env, "welcome"))?.publishedVersion).toBe(1);
    expect(progressOf(done ?? { progress: {} }).templates).toMatchObject({
      created: 2,
      existing: 0,
    });
    const items = await listMigrationItems(env, row.id);
    expect(items.find((item) => item.sourceId === "tpl1")).toMatchObject({
      outcome: "created",
      targetId: draft.id,
      needsReview: false,
    });
  });

  test("the plan's contact limit stops the contacts alone, also when retrying without properties", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const plans: PlanGate = {
      async requireFeature() {},
      async hasFeature() {
        return true;
      },
      async limit() {
        return 1;
      },
      async currentLimit() {
        return 1;
      },
      async requireCapacity(_organizationId, _key, current, count = 1) {
        if (current + count > 1) {
          throw Object.assign(new Error("Your plan includes 1 contact."), {
            code: "plan_limit_reached",
          });
        }
      },
    };
    const deps = depsFor(
      {
        ...DATA,
        contacts: [
          {
            email: "first@example.com",
            firstName: null,
            lastName: null,
            unsubscribed: false,
            properties: {},
            topics: [],
          },
          // Its seats aren't a number: retried without properties, over the limit.
          {
            email: "second@example.com",
            firstName: null,
            lastName: null,
            unsubscribed: false,
            properties: { seats: "many" },
            topics: [],
          },
        ],
      },
      { plans },
    );
    const row = await connect(tenant);
    await settle(tenant, deps);
    await startAll(tenant, row.id, ["contacts", "suppressions"]);
    await settle(tenant, deps);
    const done = await getMigration(env, row.id);
    expect(done?.status).toBe("completed");
    const progress = progressOf(done ?? { progress: {} });
    expect(progress.contacts).toMatchObject({
      state: "failed",
      created: 1,
      message: expect.stringContaining("contact limit"),
    });
    expect(progress.suppressions?.state).toBe("done");
  });

  test("an endpoint already there matches its URL however the provider writes it", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const { endpoint } = await createWebhookEndpoint(
      {
        ...env,
        url: "https://hooks.example.com",
        eventTypes: [],
        apiVersion: LATEST_API_VERSION,
        userId: null,
      },
      testManagementDeps,
    );
    expect(endpoint.url).toBe("https://hooks.example.com/");
    const data: FakeSourceData = {
      webhooks: [
        {
          id: "wh",
          url: "https://HOOKS.example.com",
          name: "Main",
          eventTypes: ["email.sent"],
          unmapped: [],
          notes: [],
        },
      ],
    };
    const row = await connect(tenant);
    await settle(tenant, depsFor(data));
    await startAll(tenant, row.id, ["webhooks"]);
    await settle(tenant, depsFor(data));
    expect(await listWebhookEndpoints(env)).toHaveLength(1);
    expect((await listMigrationItems(env, row.id))[0]).toMatchObject({
      outcome: "existing",
      targetId: endpoint.id,
    });
  });

  test("webhooks posting to the same URL become one endpoint with all their events", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const data: FakeSourceData = {
      provider: "postmark",
      webhooks: [
        {
          id: "1",
          url: "https://example.com/pm",
          name: "outbound",
          eventTypes: ["email.delivered"],
          unmapped: [],
          notes: ["For the outbound stream."],
        },
        {
          id: "2",
          url: "https://EXAMPLE.com/pm",
          name: "broadcasts",
          eventTypes: ["email.bounced", "email.delivered"],
          unmapped: [],
          notes: ["For the broadcasts stream."],
        },
      ],
    };
    const row = await connect(tenant);
    await settle(tenant, depsFor(data));
    await startAll(tenant, row.id, ["webhooks"]);
    await settle(tenant, depsFor(data));
    const endpoints = await listWebhookEndpoints(env);
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0]?.eventTypes).toEqual(["email.bounced", "email.delivered"]);
    const items = await listMigrationItems(env, row.id);
    expect(items).toHaveLength(1);
    expect(items[0]?.warnings).toEqual([
      "For the outbound stream.",
      "For the broadcasts stream.",
      "2 webhooks posted to this URL: their events were combined.",
    ]);
  });

  test("a retried item keeps its name and reserves no other", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const data: FakeSourceData = {
      properties: [
        { id: "p1", name: "foo", type: "string", fallback: null },
        { id: "p2", name: "foo_2", type: "string", fallback: null },
      ],
    };
    const row = await connect(tenant);
    await settle(tenant, depsFor(data));
    await startAll(tenant, row.id, ["contacts"]);
    // An attempt that stopped after recording foo, before creating it.
    await db.insert(schema.migrationItem).values({
      migrationId: row.id,
      organizationId: tenant.organization.id,
      kind: "property",
      sourceId: "p1",
      sourceName: "foo",
      targetName: "foo",
    });
    await settle(tenant, depsFor(data));
    const keys = (await listContactPropertyRows(env)).map((property) => property.key).sort();
    expect(keys).toEqual(["foo", "foo_2"]);
  });

  test("finds existing topics even when the environment is at its topic cap", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    await createTopic(env, {
      key: "product_updates",
      name: "Updates",
      default_subscription: "opt_in",
    });
    for (let i = 1; i < 100; i++) {
      await createTopic(env, {
        key: `filler_${i}`,
        name: `Filler ${i}`,
        default_subscription: "opt_in",
      });
    }
    const row = await connect(tenant);
    await settle(tenant, depsFor(DATA));
    await startAll(tenant, row.id, ["contacts"]);
    await settle(tenant, depsFor(DATA));
    const items = await listMigrationItems(env, row.id);
    expect(items.find((item) => item.kind === "topic")).toMatchObject({
      outcome: "existing",
      targetName: "product_updates",
    });
    const choice = (await getContactTopics(env, "ada@example.com"))?.topics.find(
      (t) => t.topic === "product_updates",
    )?.choice;
    expect(choice).toBe("opted_out");
  });

  test("a failed step goes on from its last checkpoint without counting anything twice", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const contacts = Array.from({ length: 12 }, (_, i) => ({
      email: `retry${i}@example.com`,
      firstName: null,
      lastName: null,
      unsubscribed: false,
      properties: {},
      topics: [],
    }));
    let failed = false;
    const deps = depsFor({
      ...DATA,
      contacts,
      pageSize: 5,
      before: (method, call) => {
        // The third page fails once, after two pages were imported in the same step.
        if (method === "contacts" && call === 3 && !failed) {
          failed = true;
          throw new ProviderError("unavailable", "Resend answered 503.", 503);
        }
      },
    });
    const row = await connect(tenant);
    await settle(tenant, deps);
    await startAll(tenant, row.id, ["contacts"]);
    await settle(tenant, deps);
    expect((await getMigration(env, row.id))?.lastError).toBe("Resend answered 503.");
    // The retry comes a minute later.
    await settle(tenant, deps, { aheadMs: 10 * 60 * 1000 });
    const done = await getMigration(env, row.id);
    expect(failed).toBe(true);
    expect(done?.status).toBe("completed");
    expect(progressOf(done ?? { progress: {} }).contacts).toMatchObject({
      created: 12,
      updated: 0,
    });
  });

  test("a phase the key can't read fails alone; a revoked key fails the import", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const forbidden = new ProviderError("forbidden", "Resend answered 403: not allowed", 403);
    const deps = depsFor({ ...DATA, fail: { templates: forbidden } });
    const row = await connect(tenant);
    await settle(tenant, deps);
    await startAll(tenant, row.id, ["templates", "suppressions"]);
    await settle(tenant, deps);
    const done = await getMigration(env, row.id);
    expect(done?.status).toBe("completed");
    expect(progressOf(done ?? { progress: {} })).toMatchObject({
      templates: { state: "failed", message: "Resend answered 403: not allowed" },
      suppressions: { state: "done" },
    });

    const revoked = await connect(tenant);
    const failing = depsFor({
      ...DATA,
      fail: { inventory: new ProviderError("unauthorized", "Resend answered 401.", 401) },
    });
    await settle(tenant, failing);
    expect(await getMigration(env, revoked.id)).toMatchObject({
      status: "failed",
      credentialsCiphertext: null,
      lastError: expect.stringContaining("no longer accepts the API key"),
    });
  });

  test("waits out a rate limit, and holds suspended organizations' imports", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const retryAt = new Date(Date.now() + 10 * 60 * 1000);
    const row = await connect(tenant);
    await runDueMigrations(
      depsFor({
        fail: { inventory: new ProviderError("rate_limited", "Slow down.", 429, retryAt) },
      }),
      { scope: scopeOf(tenant), now: new Date(Date.now() + 1000) },
    );
    expect(await getMigration(env, row.id)).toMatchObject({
      status: "inspecting",
      nextRunAt: retryAt,
      leaseUntil: null,
      attemptCount: 0,
    });

    await db
      .insert(schema.organizationSuspension)
      .values({ organizationId: tenant.organization.id, reason: "test" });
    expect(
      await runDueMigrations(depsFor(DATA), {
        scope: scopeOf(tenant),
        now: new Date(retryAt.getTime() + 1000),
      }),
    ).toBe(0);
  });

  test("starts only once, from ready; canceling deletes the key", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const row = await connect(tenant);
    const selection = {
      kinds: ["contacts" as const],
      domainIds: [],
      webhookApiVersion: LATEST_API_VERSION,
    };
    expect(await startMigration(env, row.id, selection)).toBeNull();
    await settle(tenant, depsFor(DATA));
    expect(await startMigration(env, row.id, selection)).not.toBeNull();
    expect(await startMigration(env, row.id, selection)).toBeNull();

    const other = await createTestTenant();
    expect(await cancelMigration(envOf(other), row.id)).toBeNull();
    expect(await cancelMigration(env, row.id)).toMatchObject({
      status: "canceled",
      credentialsCiphertext: null,
    });
    expect(await cancelMigration(env, row.id)).toBeNull();
  });

  test("purges finished imports after 90 days and unstarted ones after a day", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const draft = await connect(tenant);
    const finished = await connect(tenant);
    await cancelMigration(env, finished.id);
    const scope = scopeOf(tenant);
    const in2days = new Date(Date.now() + 2 * 86_400_000);
    expect(await purgeAbandonedMigrationDrafts({ now: in2days, scope })).toBe(1);
    expect(await getMigration(env, draft.id)).toBeNull();
    expect(await purgeExpiredMigrations({ now: in2days, scope })).toBe(0);
    expect(
      await purgeExpiredMigrations({ now: new Date(Date.now() + 91 * 86_400_000), scope }),
    ).toBe(1);
  });
});
