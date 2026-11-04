import { describe, expect, test } from "bun:test";
import type { UsageGate } from "@coss/billing/gate";
import { db, schema } from "@coss/db";
import { createTestTenant, type TestTenant } from "@coss/tenancy/testing";
import { and, eq, sql } from "drizzle-orm";
import { createHookApplication } from "../src/applications.ts";
import { retryHookDelivery } from "../src/deliveries.ts";
import { createHookEndpoint } from "../src/endpoints.ts";
import { createHookEventType } from "../src/event-types.ts";
import { sendHookMessage } from "../src/messages.ts";
import { testHookDeps } from "../src/testing.ts";

async function setup(live = true) {
  const tenant = await createTestTenant();
  const environmentId = live ? tenant.production.id : tenant.development.id;
  const organizationId = tenant.organization.id;
  const application = await createHookApplication({
    organizationId,
    environmentId,
    name: "Acme",
  });
  await createHookEventType({
    organizationId,
    environmentId,
    name: "invoice.paid",
    examples: [{ example: true }],
  });
  const endpoints = await Promise.all(
    ["a", "b"].map((name) =>
      createHookEndpoint(
        {
          organizationId,
          environmentId,
          applicationId: application.id,
          url: `https://example.com/${name}`,
          filterTypes: [],
        },
        testHookDeps,
      ),
    ),
  );
  return { tenant, application, endpoints };
}

async function metered(tenant: TestTenant): Promise<number> {
  const [row] = await db
    .select({ quantity: sql<number>`coalesce(sum(${schema.billingUsage.quantity}), 0)::int` })
    .from(schema.billingUsage)
    .where(
      and(
        eq(schema.billingUsage.organizationId, tenant.organization.id),
        eq(schema.billingUsage.meter, "hooks.messages"),
      ),
    );
  return row?.quantity ?? 0;
}

const message = { eventType: "invoice.paid", payload: { id: 1 } };

describe("metering hooks.messages", () => {
  test("a live message is one unit whatever its fan-out, attributed to its key", async () => {
    const { tenant, application } = await setup();
    const sent = await sendHookMessage({
      application,
      ...message,
      apiKeyId: "key_test",
      apiKeyOwnerId: null,
    });
    expect(sent.deliveries).toBe(2);
    expect(await metered(tenant)).toBe(1);
    const [attribution] = await db
      .select()
      .from(schema.billingUsageAttribution)
      .where(eq(schema.billingUsageAttribution.organizationId, tenant.organization.id));
    expect(attribution).toMatchObject({
      apiKeyId: "key_test",
      projectId: tenant.production.projectId,
      quantity: 1,
    });
  });

  test("an idempotent replay isn't charged again", async () => {
    const { tenant, application } = await setup();
    const first = await sendHookMessage({ application, ...message, idempotencyKey: "a" });
    const replay = await sendHookMessage({ application, ...message, idempotencyKey: "a" });
    expect(replay).toMatchObject({ replayed: true, message: { id: first.message.id } });
    expect(await metered(tenant)).toBe(1);
  });

  test("sandbox messages are free", async () => {
    const { tenant, application } = await setup(false);
    await sendHookMessage({ application, ...message });
    expect(await metered(tenant)).toBe(0);
  });

  test("test sends and retries are free", async () => {
    const { tenant, application, endpoints } = await setup();
    await sendHookMessage({
      application,
      ...message,
      onlyEndpointId: endpoints[0]?.endpoint.id as string,
    });
    expect(await metered(tenant)).toBe(0);
    const sent = await sendHookMessage({ application, ...message });
    const [delivery] = await db
      .select()
      .from(schema.hookDelivery)
      .where(eq(schema.hookDelivery.messageId, sent.message.id))
      .limit(1);
    await db
      .update(schema.hookDelivery)
      .set({ status: "failed" })
      .where(eq(schema.hookDelivery.id, delivery?.id as string));
    await retryHookDelivery({
      organizationId: tenant.organization.id,
      applicationId: application.id,
      id: delivery?.id as string,
    });
    expect(await metered(tenant)).toBe(1);
  });
});

describe("the usage gate", () => {
  test("a refused reservation rolls the whole send back, idempotency key included", async () => {
    const { tenant, application } = await setup();
    const refused = Object.assign(new Error("Cap reached."), { code: "usage_limit_exceeded" });
    const gate: UsageGate = {
      reserve: () => Promise.reject(refused),
    };
    await expect(
      sendHookMessage({ application, ...message, idempotencyKey: "a", billing: gate }),
    ).rejects.toBe(refused);
    expect(await metered(tenant)).toBe(0);
    const messages = await db
      .select({ id: schema.hookMessage.id })
      .from(schema.hookMessage)
      .where(eq(schema.hookMessage.applicationId, application.id));
    expect(messages).toEqual([]);
    const allowed = await sendHookMessage({ application, ...message, idempotencyKey: "a" });
    expect(allowed.replayed).toBe(false);
  });

  test("reserves one unit of a live message, and nothing for a test send", async () => {
    const { tenant, application, endpoints } = await setup();
    const reserved: { meter: string; quantity: number }[] = [];
    const gate: UsageGate = {
      reserve: async (_tx, input) => {
        reserved.push({ meter: input.meter, quantity: input.quantity });
      },
    };
    await sendHookMessage({ application, ...message, billing: gate });
    await sendHookMessage({
      application,
      ...message,
      billing: gate,
      onlyEndpointId: endpoints[0]?.endpoint.id as string,
    });
    expect(reserved).toEqual([{ meter: "hooks.messages", quantity: 1 }]);
    expect(await metered(tenant)).toBe(1);
  });
});

describe("holds", () => {
  test("a billing hold refuses live sends, test sends too; sandbox keeps working", async () => {
    const { tenant, application, endpoints } = await setup();
    await db
      .insert(schema.billingHold)
      .values({ organizationId: tenant.organization.id, reason: "delinquent" });
    await expect(sendHookMessage({ application, ...message })).rejects.toMatchObject({
      code: "billing_hold",
      status: 402,
    });
    await expect(
      sendHookMessage({
        application,
        ...message,
        onlyEndpointId: endpoints[0]?.endpoint.id as string,
      }),
    ).rejects.toMatchObject({ code: "billing_hold" });
    const sandbox = await createHookApplication({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
      name: "Acme",
    });
    await expect(sendHookMessage({ application: sandbox, ...message })).resolves.toMatchObject({
      replayed: false,
    });
  });

  test("a replay still answers on a hold", async () => {
    const { tenant, application } = await setup();
    const first = await sendHookMessage({ application, ...message, idempotencyKey: "a" });
    await db
      .insert(schema.billingHold)
      .values({ organizationId: tenant.organization.id, reason: "delinquent" });
    const replay = await sendHookMessage({ application, ...message, idempotencyKey: "a" });
    expect(replay).toMatchObject({ replayed: true, message: { id: first.message.id } });
  });

  test("a spent budget refuses the source's live sends", async () => {
    const { tenant, application } = await setup();
    await db.insert(schema.billingBudgetHold).values({
      organizationId: tenant.organization.id,
      scope: "api_key",
      targetId: "key_spent",
      periodStart: new Date(),
      spentCents: 100n,
      limitCents: 100n,
    });
    await expect(
      sendHookMessage({ application, ...message, apiKeyId: "key_spent" }),
    ).rejects.toMatchObject({ code: "budget_exceeded", status: 402 });
    await expect(
      sendHookMessage({ application, ...message, apiKeyId: "key_other" }),
    ).resolves.toMatchObject({ replayed: false });
  });
});
