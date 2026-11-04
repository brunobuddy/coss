import { describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { newId } from "@coss/db/id";
import { queryLogs } from "@coss/logs";
import { createTestTenant, type TestTenant } from "@coss/tenancy/testing";
import { LATEST_API_VERSION } from "@coss/versioning";
import { testVersioning } from "@coss/versioning/testing";
import { and, eq, inArray } from "drizzle-orm";
import { runDueWebhookDeliveries } from "../src/deliver.ts";
import { createWebhookEndpoint, listWebhookEndpoints } from "../src/endpoints.ts";
import { LEASE_MS } from "../src/engine/index.ts";
import { WebhookError } from "../src/errors.ts";
import {
  closeWebhookListener,
  createWebhookListener,
  LISTENER_IDLE_TTL_MS,
  listOpenWebhookListeners,
  MAX_HAND_OUTS,
  MAX_LISTENERS_PER_ENVIRONMENT,
  pollWebhookListener,
  touchWebhookListener,
  toWebhookListenerObject,
  type WebhookListenerRow,
} from "../src/listeners.ts";
import { enqueueWebhookMessage } from "../src/outbox.ts";
import { purgeExpiredWebhookListeners, purgeExpiredWebhookMessages } from "../src/retention.ts";
import { WebhookListenerObject, WebhookListenerPoll } from "../src/schemas.ts";
import { TEST_SECRETS_KEYS, testManagementDeps, testSender } from "../src/testing.ts";

const { webhookListener, webhookListenerDelivery, webhookMessage } = schema;

/** The value, which the test expects to be there. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

function listenerFor(
  tenant: TestTenant,
  eventTypes: string[] = [],
  apiVersion: string = LATEST_API_VERSION,
) {
  return createWebhookListener({
    organizationId: tenant.organization.id,
    environmentId: tenant.development.id,
    apiVersion,
    eventTypes,
    description: "test → localhost:3000",
  });
}

async function enqueue(
  tenant: TestTenant,
  type = "email.delivered",
  data = { email_id: "email_x" },
) {
  const id = newId("evt");
  const queued = await enqueueWebhookMessage(db, {
    id,
    organizationId: tenant.organization.id,
    environmentId: tenant.development.id,
    type,
    payload: { id, object: "event", type, data },
  });
  return { id, queued };
}

function poll(
  tenant: TestTenant,
  listener: WebhookListenerRow,
  opts: Partial<Parameters<typeof pollWebhookListener>[0]> = {},
) {
  return pollWebhookListener({
    organizationId: tenant.organization.id,
    environmentId: tenant.development.id,
    id: listener.id,
    waitMs: 0,
    ...opts,
  });
}

async function deliveriesOf(listener: WebhookListenerRow) {
  return db
    .select()
    .from(webhookListenerDelivery)
    .where(eq(webhookListenerDelivery.listenerId, listener.id));
}

const scopeOf = (tenant: TestTenant) => ({ organizationIds: [tenant.organization.id] });

describe("webhook listeners", () => {
  test("receive the events they subscribe to, rendered as an endpoint would get them", async () => {
    const tenant = await createTestTenant();
    const all = await listenerFor(tenant);
    const bounces = await listenerFor(tenant, ["email.bounced"]);

    const delivered = await enqueue(tenant, "email.delivered");
    const bounced = await enqueue(tenant, "email.bounced");
    // No endpoint: nothing for the worker, but the message is stored for the listeners.
    expect(delivered.queued).toBe(0);

    const first = await poll(tenant, all);
    // What the API returns parses as its wire schema.
    WebhookListenerPoll.parse({
      object: "webhook_listener_poll",
      listener: toWebhookListenerObject(must(first).listener),
      deliveries: must(first).deliveries,
      acknowledged: must(first).acknowledged,
    });
    // Two events in one millisecond can come back in either order.
    const handed = must(first).deliveries;
    expect(handed.map((d) => [d.event_id, d.event_type, d.attempt])).toHaveLength(2);
    expect(handed.map((d) => [d.event_id, d.event_type, d.attempt])).toEqual(
      expect.arrayContaining([
        [delivered.id, "email.delivered", 1],
        [bounced.id, "email.bounced", 1],
      ]),
    );
    expect(JSON.parse(handed.find((d) => d.event_id === delivered.id)?.body ?? "{}")).toEqual({
      id: delivered.id,
      object: "event",
      type: "email.delivered",
      api_version: LATEST_API_VERSION,
      data: { email_id: "email_x" },
    });
    const second = await poll(tenant, bounces);
    expect(second?.deliveries.map((d) => d.event_id)).toEqual([bounced.id]);
  });

  test("render in the listener's API version", async () => {
    const tenant = await createTestTenant();
    const versioning = testVersioning();
    const listener = await listenerFor(tenant);
    await enqueue(tenant, "email.sent", {
      email_id: "email_x",
      recipient: "a@example.com",
    } as never);
    const [delivery] = (await poll(tenant, listener, { versioning }))?.deliveries ?? [];
    // LATEST_API_VERSION is older than the test versioning's newest: `recipient` → `address`.
    expect(JSON.parse(delivery?.body ?? "{}").data).toEqual({
      email_id: "email_x",
      address: "a@example.com",
    });
  });

  test("never reach the worker, endpoints or their limits", async () => {
    const tenant = await createTestTenant();
    const listener = await listenerFor(tenant);
    await enqueue(tenant);
    expect(
      await runDueWebhookDeliveries(
        { scope: scopeOf(tenant) },
        {
          secretsKeys: TEST_SECRETS_KEYS,
          send: testSender(),
        },
      ),
    ).toBe(0);
    expect(
      await listWebhookEndpoints({
        organizationId: tenant.organization.id,
        environmentId: tenant.development.id,
      }),
    ).toEqual([]);
    expect((await deliveriesOf(listener)).map((d) => d.status)).toEqual(["pending"]);
  });

  test("lease what they hand out, and hand it out again when it is never acknowledged", async () => {
    const tenant = await createTestTenant();
    const listener = await listenerFor(tenant);
    const { id } = await enqueue(tenant);
    const now = new Date();

    const first = await poll(tenant, listener, { clock: () => now });
    expect(first?.deliveries).toHaveLength(1);
    // Leased: the next poll gets nothing until the lease expires.
    expect((await poll(tenant, listener, { clock: () => now }))?.deliveries).toEqual([]);
    const later = new Date(now.getTime() + LEASE_MS + 1);
    const again = await poll(tenant, listener, { clock: () => later });
    expect(again?.deliveries.map((d) => [d.event_id, d.attempt])).toEqual([[id, 2]]);
    // The first answer's token no longer matches.
    const stale = await poll(tenant, listener, {
      clock: () => later,
      acks: [
        {
          deliveryId: must(must(first).deliveries[0]).id,
          ackToken: must(must(first).deliveries[0]).ack_token,
          statusCode: 200,
          durationMs: 3,
          error: null,
        },
      ],
    });
    expect(stale?.acknowledged).toBe(0);

    // Handed out too often without an acknowledgement: it fails.
    let at = later;
    for (let i = 2; i < MAX_HAND_OUTS; i++) {
      at = new Date(at.getTime() + LEASE_MS + 1);
      expect((await poll(tenant, listener, { clock: () => at }))?.deliveries).toHaveLength(1);
    }
    at = new Date(at.getTime() + LEASE_MS + 1);
    expect((await poll(tenant, listener, { clock: () => at }))?.deliveries).toEqual([]);
    expect(await deliveriesOf(listener)).toEqual([
      expect.objectContaining({ status: "failed", handedOutCount: MAX_HAND_OUTS }),
    ]);
  });

  test("acknowledgements finish deliveries and log each forward", async () => {
    const tenant = await createTestTenant();
    const listener = await listenerFor(tenant);
    await enqueue(tenant, "email.delivered");
    await enqueue(tenant, "email.bounced");
    const started = new Date();
    const handed = (await poll(tenant, listener))?.deliveries ?? [];
    // Two events in one millisecond can come back in either order.
    const ok = handed.find((delivery) => delivery.event_type === "email.delivered");
    const broken = handed.find((delivery) => delivery.event_type === "email.bounced");
    const acked = await poll(tenant, listener, {
      acks: [
        {
          deliveryId: must(ok).id,
          ackToken: must(ok).ack_token,
          statusCode: 204,
          durationMs: 7,
          error: null,
        },
        {
          deliveryId: must(broken).id,
          ackToken: must(broken).ack_token,
          statusCode: null,
          durationMs: 1,
          error: "connection refused",
        },
        // Unknown and duplicate acknowledgements are ignored.
        {
          deliveryId: must(ok).id,
          ackToken: must(ok).ack_token,
          statusCode: 500,
          durationMs: 1,
          error: null,
        },
        {
          deliveryId: "whlisdel_nope",
          ackToken: "zz",
          statusCode: 200,
          durationMs: 1,
          error: null,
        },
        // A token past the last valid Date (8640000000000001 ms).
        {
          deliveryId: newId("whlisdel"),
          ackToken: "2d2mh7dt6o1",
          statusCode: 200,
          durationMs: 1,
          error: null,
        },
      ],
    });
    expect(acked?.acknowledged).toBe(2);
    expect(acked?.deliveries).toEqual([]);
    const rows = await deliveriesOf(listener);
    expect(rows.find((r) => r.id === must(ok).id)).toMatchObject({
      status: "succeeded",
      statusCode: 204,
    });
    expect(rows.find((r) => r.id === must(broken).id)).toMatchObject({
      status: "failed",
      error: "connection refused",
    });

    const page = await queryLogs({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
      from: new Date(started.getTime() - 60_000),
      to: new Date(started.getTime() + 60_000),
      filters: { sources: ["webhook"] },
    });
    expect(page.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "webhook.forward",
          level: "info",
          message: "email.delivered → coss listen (test → localhost:3000) 204",
          status_code: 204,
          resource_type: "email",
          resource_id: "email_x",
          attributes: expect.objectContaining({
            listener_id: listener.id,
            delivery_id: must(ok).id,
          }),
        }),
        expect.objectContaining({
          type: "webhook.forward",
          level: "error",
          error_code: "webhook_forward_failed",
          message: "email.bounced → coss listen (test → localhost:3000) connection refused",
        }),
      ]),
    );
  });

  test("a poll waits for an event, and returns early when aborted", async () => {
    const tenant = await createTestTenant();
    const listener = await listenerFor(tenant);
    const waiting = poll(tenant, listener, { waitMs: 5_000, intervalMs: 20 });
    await Bun.sleep(60);
    const { id } = await enqueue(tenant);
    expect((await waiting)?.deliveries.map((d) => d.event_id)).toEqual([id]);

    const controller = new AbortController();
    const startedAt = Date.now();
    const aborted = poll(tenant, listener, {
      waitMs: 20_000,
      intervalMs: 50,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 50);
    expect((await aborted)?.deliveries).toEqual([]);
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });

  test("stay open while polled, and receive nothing once closed or expired", async () => {
    const tenant = await createTestTenant();
    const listener = await listenerFor(tenant);
    const ids = { organizationId: tenant.organization.id, environmentId: tenant.development.id };
    expect(WebhookListenerObject.parse(toWebhookListenerObject(listener))).toBeTruthy();
    const touched = await touchWebhookListener({ ...ids, id: listener.id });
    expect(must(touched).expiresAt.getTime()).toBeGreaterThanOrEqual(listener.expiresAt.getTime());
    // Other environments can't see it.
    expect(
      await touchWebhookListener({ ...ids, environmentId: tenant.production.id, id: listener.id }),
    ).toBeNull();
    expect(await listOpenWebhookListeners(ids)).toHaveLength(1);

    expect(await closeWebhookListener({ ...ids, id: listener.id })).toBe(true);
    expect(await closeWebhookListener({ ...ids, id: listener.id })).toBe(false);
    expect(await touchWebhookListener({ ...ids, id: listener.id })).toBeNull();
    expect(await poll(tenant, listener)).toBeNull();
    await enqueue(tenant);
    expect(await deliveriesOf(listener)).toEqual([]);
    expect(await listOpenWebhookListeners(ids)).toEqual([]);

    // Idle ones expire.
    const idle = await listenerFor(tenant);
    expect(
      await touchWebhookListener({
        ...ids,
        id: idle.id,
        now: new Date(Date.now() + LISTENER_IDLE_TTL_MS + 1),
      }),
    ).toBeNull();
  });

  test("an environment has at most a few open listeners, and they validate the version", async () => {
    const tenant = await createTestTenant();
    const listeners = [];
    for (let i = 0; i < MAX_LISTENERS_PER_ENVIRONMENT; i++)
      listeners.push(await listenerFor(tenant));
    await expect(listenerFor(tenant)).rejects.toMatchObject({ code: "too_many_listeners" });
    // Endpoints are unaffected.
    await createWebhookEndpoint(
      {
        organizationId: tenant.organization.id,
        environmentId: tenant.development.id,
        url: "https://example.com/hook",
        eventTypes: [],
        apiVersion: LATEST_API_VERSION,
        userId: null,
      },
      testManagementDeps,
    );
    await closeWebhookListener({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
      id: must(listeners[0]).id,
    });
    expect(await listenerFor(tenant)).toBeTruthy();
    await expect(listenerFor(tenant, [], "1999-01-01")).rejects.toBeInstanceOf(WebhookError);
  });

  test("the cap holds when listeners are opened at the same time", async () => {
    const tenant = await createTestTenant();
    const results = await Promise.allSettled(
      Array.from({ length: MAX_LISTENERS_PER_ENVIRONMENT + 3 }, () => listenerFor(tenant)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(
      MAX_LISTENERS_PER_ENVIRONMENT,
    );
    for (const result of results.filter((r) => r.status === "rejected")) {
      expect(result.reason).toMatchObject({ code: "too_many_listeners" });
    }
  });

  test("retention purges expired listeners with their deliveries, and messages take theirs", async () => {
    const tenant = await createTestTenant();
    const listener = await listenerFor(tenant);
    const { id } = await enqueue(tenant);
    await closeWebhookListener({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
      id: listener.id,
    });
    const scope = scopeOf(tenant);
    expect(await purgeExpiredWebhookListeners({ scope })).toBe(0);
    expect(
      await purgeExpiredWebhookListeners({ scope, now: new Date(Date.now() + 2 * 86_400_000) }),
    ).toBe(1);
    expect(await deliveriesOf(listener)).toEqual([]);
    const [message] = await db.select().from(webhookMessage).where(eq(webhookMessage.id, id));
    expect(message).toBeDefined();

    // A purged message takes listener deliveries with it.
    const other = await listenerFor(tenant);
    const second = await enqueue(tenant);
    expect(await deliveriesOf(other)).toHaveLength(1);
    await purgeExpiredWebhookMessages({ scope, now: new Date(Date.now() + 31 * 86_400_000) });
    expect(
      await db
        .select()
        .from(webhookMessage)
        .where(inArray(webhookMessage.id, [id, second.id])),
    ).toEqual([]);
    expect(await deliveriesOf(other)).toEqual([]);
    const [still] = await db
      .select()
      .from(webhookListener)
      .where(and(eq(webhookListener.id, other.id)));
    expect(still).toBeDefined();
  });
});
