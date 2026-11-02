import { describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { newId } from "@coss/db/id";
import { uniqueSuffix } from "@coss/db/testing";
import { createTestTenant } from "@coss/tenancy/testing";
import { eq } from "drizzle-orm";
import { EmailError } from "../src/errors.ts";
import { FakeEmailProvider } from "../src/providers/fake.ts";
import { createEmailService, IDEMPOTENCY_KEY_TTL_MS } from "../src/service.ts";
import { dispatchingEmailService, memoryDispatchQueue } from "../src/testing.ts";
import { gatedProvider, params, sendEnvironment, verifiedFrom } from "./helpers.ts";

async function loadRow(id: string) {
  const [row] = await db.select().from(schema.email).where(eq(schema.email.id, id));
  if (!row) throw new Error(`email ${id} not found`);
  return row;
}

/** A service whose sends only enqueue (`queue.drain` dispatches them, like the worker). */
function fakeProviders() {
  const liveProvider = new FakeEmailProvider({ log: false });
  const sandboxProvider = new FakeEmailProvider({ log: false });
  const queue = memoryDispatchQueue();
  return {
    liveProvider,
    sandboxProvider,
    queue,
    service: createEmailService({ liveProvider, sandboxProvider, queue }),
  };
}

async function expectEmailError(promise: Promise<unknown>, code: EmailError["code"]) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(EmailError);
  expect((error as EmailError).code).toBe(code);
  return error as EmailError;
}

describe("send", () => {
  test("stores the email queued and enqueues its dispatch without calling the provider", async () => {
    const tenant = await createTestTenant();
    const { service, queue, sandboxProvider } = fakeProviders();
    const apiKeyId = newId("key");

    const { email, replayed } = await service.send({
      environment: sendEnvironment(tenant.development),
      apiKeyId,
      params: params({ cc: "copy@example.com", headers: { "X-Campaign": "fall" } }),
    });

    expect(replayed).toBe(false);
    expect(email).toMatchObject({
      object: "email",
      from: "Acme <hello@acme.com>",
      to: ["user@example.com"],
      cc: ["copy@example.com"],
      bcc: [],
      reply_to: [],
      subject: "Welcome",
      html: null,
      text: "Hello!",
      headers: { "x-campaign": "fall" },
      tags: [],
      status: "queued",
      recipients: [
        { address: "user@example.com", type: "to", status: "queued" },
        { address: "copy@example.com", type: "cc", status: "queued" },
      ],
      sandbox: true,
      sent_at: null,
    });
    expect(email.id).toStartWith("email_");
    expect(Date.parse(email.created_at)).not.toBeNaN();
    expect(await loadRow(email.id)).toMatchObject({
      organizationId: tenant.organization.id,
      projectId: tenant.project.id,
      environmentId: tenant.development.id,
      apiKeyId,
      status: "queued",
      provider: null,
      idempotencyKey: null,
      requestHash: null,
    });
    expect(queue.jobs).toEqual([
      { organizationId: tenant.organization.id, emailId: email.id, stream: "transactional" },
    ]);
    expect(sandboxProvider.sent).toHaveLength(0);

    await queue.drain(service);
    const row = await loadRow(email.id);
    expect(row).toMatchObject({
      status: "sent",
      provider: "fake",
      errorCode: null,
      sentAt: expect.any(Date),
    });
    expect(row.providerMessageId).toMatch(/^fake_[0-9a-f-]{36}$/);
    expect(sandboxProvider.sent).toHaveLength(1);
    expect(sandboxProvider.sent[0]).toMatchObject({
      emailId: email.id,
      cc: ["copy@example.com"],
      replyTo: [],
      headers: { "x-campaign": "fall" },
    });
  });

  test("sandbox always uses the sandbox provider; live uses the live provider", async () => {
    const tenant = await createTestTenant();
    const live = gatedProvider("live-test");
    live.release();
    const sandboxProvider = new FakeEmailProvider({ log: false });
    const service = dispatchingEmailService({ liveProvider: live.provider, sandboxProvider });

    const sandboxed = await service.send({
      environment: sendEnvironment(tenant.development),
      apiKeyId: null,
      params: params(),
    });
    expect(sandboxed.email).toMatchObject({ status: "sent", sandbox: true });
    expect(sandboxProvider.sent.map((m) => m.emailId)).toEqual([sandboxed.email.id]);
    expect(live.sent).toHaveLength(0);

    const delivered = await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({ from: await verifiedFrom(tenant.organization.id, "live-test") }),
    });
    expect(delivered.email).toMatchObject({ status: "sent", sandbox: false });
    expect(live.sent.map((m) => m.emailId)).toEqual([delivered.email.id]);
    expect(sandboxProvider.sent).toHaveLength(1);
    expect(await loadRow(delivered.email.id)).toMatchObject({
      provider: "live-test",
      providerMessageId: "live-test_1",
    });
  });

  test("records provider failures on the email", async () => {
    const tenant = await createTestTenant();
    const failing = new FakeEmailProvider({ log: false, fail: () => true });
    const service = dispatchingEmailService({ liveProvider: failing, sandboxProvider: failing });

    const { email } = await service.send({
      environment: sendEnvironment(tenant.development),
      apiKeyId: null,
      params: params(),
    });

    // The provider's own text stays internal: the wire shows the `email.failed` event's message.
    expect(email).toMatchObject({
      status: "failed",
      sent_at: null,
      failure: { code: "provider_error", message: "The email provider did not accept the email." },
    });
    expect(await loadRow(email.id)).toMatchObject({
      status: "failed",
      provider: "fake",
      providerMessageId: null,
      errorCode: "provider_error",
      errorMessage: `Fake provider rejected ${email.id}.`,
      sentAt: null,
    });
    expect(failing.sent).toHaveLength(0);
  });
});

describe("idempotency", () => {
  test("replays the same request without sending again", async () => {
    const tenant = await createTestTenant();
    const { service, queue, sandboxProvider } = fakeProviders();
    const environment = sendEnvironment(tenant.development);
    const idempotencyKey = `key-${uniqueSuffix()}`;

    const first = await service.send({
      environment,
      apiKeyId: null,
      params: params({ to: "user@example.com", headers: { "X-A": "1" } }),
      idempotencyKey,
    });
    // Same request, spelled differently.
    const second = await service.send({
      environment,
      apiKeyId: null,
      params: params({ to: ["user@example.com"], headers: { "x-a": "1" }, cc: [] }),
      idempotencyKey,
    });

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    // A queued email replays as queued (no 409 while it waits for the worker).
    expect(second.email).toEqual(first.email);
    expect(second.email.status).toBe("queued");
    expect(queue.jobs).toHaveLength(1);

    // Once dispatched, a replay returns the email's current state.
    await queue.drain(service);
    const third = await service.send({
      environment,
      apiKeyId: null,
      params: params({ to: "user@example.com", headers: { "X-A": "1" } }),
      idempotencyKey,
    });
    expect(third).toMatchObject({ replayed: true, email: { id: first.email.id, status: "sent" } });
    expect(queue.jobs).toHaveLength(0);
    expect(sandboxProvider.sent).toHaveLength(1);
    expect(await loadRow(first.email.id)).toMatchObject({
      idempotencyKey,
      requestHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  test("rejects the same key with a different body", async () => {
    const tenant = await createTestTenant();
    const { service } = fakeProviders();
    const environment = sendEnvironment(tenant.development);
    const idempotencyKey = `key-${uniqueSuffix()}`;

    await service.send({ environment, apiKeyId: null, params: params(), idempotencyKey });
    const error = await expectEmailError(
      service.send({
        environment,
        apiKeyId: null,
        params: params({ subject: "Different" }),
        idempotencyKey,
      }),
      "idempotency_key_reused",
    );
    expect(error.status).toBe(422);
  });

  test("replays an email whose dispatch is in progress", async () => {
    const tenant = await createTestTenant();
    const gated = gatedProvider();
    const queue = memoryDispatchQueue();
    const service = createEmailService({
      liveProvider: gated.provider,
      sandboxProvider: gated.provider,
      queue,
    });
    const environment = sendEnvironment(tenant.development);
    const idempotencyKey = `key-${uniqueSuffix()}`;

    const first = await service.send({
      environment,
      apiKeyId: null,
      params: params(),
      idempotencyKey,
    });
    const dispatching = queue.drain(service);
    await gated.called; // claimed, inside provider.send

    const retried = await service.send({
      environment,
      apiKeyId: null,
      params: params(),
      idempotencyKey,
    });
    expect(retried).toEqual({ email: first.email, replayed: true });

    gated.release();
    await dispatching;
    expect(gated.sent).toHaveLength(1);
    expect(queue.jobs).toHaveLength(0);
  });

  test("concurrent requests with one key store and enqueue exactly once", async () => {
    const tenant = await createTestTenant();
    const { service, queue, sandboxProvider } = fakeProviders();
    const environment = sendEnvironment(tenant.development);
    const idempotencyKey = `key-${uniqueSuffix()}`;

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        service.send({ environment, apiKeyId: null, params: params(), idempotencyKey }),
      ),
    );

    const fulfilled = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const rejected = results.flatMap((r) => (r.status === "rejected" ? [r.reason] : []));
    // Losers wait for the winner's commit and replay its queued email.
    expect(rejected).toEqual([]);
    expect(fulfilled.filter((r) => !r.replayed)).toHaveLength(1);
    expect(new Set(fulfilled.map((r) => r.email.id)).size).toBe(1);
    expect(queue.jobs).toHaveLength(1);
    await queue.drain(service);
    expect(sandboxProvider.sent).toHaveLength(1);
  });

  test("an expired key starts a fresh email", async () => {
    const tenant = await createTestTenant();
    const { service, queue } = fakeProviders();
    const environment = sendEnvironment(tenant.development);
    const idempotencyKey = `key-${uniqueSuffix()}`;

    const first = await service.send({
      environment,
      apiKeyId: null,
      params: params(),
      idempotencyKey,
    });
    await db
      .update(schema.email)
      .set({ createdAt: new Date(Date.now() - IDEMPOTENCY_KEY_TTL_MS - 60_000) })
      .where(eq(schema.email.id, first.email.id));

    // Even a different body is fine once the key expired.
    const second = await service.send({
      environment,
      apiKeyId: null,
      params: params({ subject: "Again" }),
      idempotencyKey,
    });

    expect(second.replayed).toBe(false);
    expect(second.email.id).not.toBe(first.email.id);
    expect(second.email).toMatchObject({ subject: "Again", status: "queued" });
    expect((await loadRow(first.email.id)).idempotencyKey).toBeNull();
    expect((await loadRow(second.email.id)).idempotencyKey).toBe(idempotencyKey);
    expect(queue.jobs.map((job) => job.emailId)).toEqual([first.email.id, second.email.id]);
  });

  test("keys are scoped to the environment", async () => {
    const tenant = await createTestTenant();
    const { service } = fakeProviders();
    const idempotencyKey = `key-${uniqueSuffix()}`;

    const dev = await service.send({
      environment: sendEnvironment(tenant.development),
      apiKeyId: null,
      params: params(),
      idempotencyKey,
    });
    const prod = await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({ subject: "Other", from: await verifiedFrom(tenant.organization.id) }),
      idempotencyKey,
    });
    expect(prod.replayed).toBe(false);
    expect(prod.email.id).not.toBe(dev.email.id);
  });
});

describe("dispatch", () => {
  test("is scoped by organization and leaves finished emails alone", async () => {
    const tenant = await createTestTenant();
    const other = await createTestTenant();
    const { service, sandboxProvider } = fakeProviders();
    const { email: queued } = await service.send({
      environment: sendEnvironment(tenant.development),
      apiKeyId: null,
      params: params(),
    });
    const input = { organizationId: tenant.organization.id, emailId: queued.id };

    const email = await service.dispatch(input);
    expect(email).toMatchObject({ id: queued.id, status: "sent" });
    // A job that runs again (retry, expired lease, sweep) is harmless.
    expect(await service.dispatch(input)).toEqual(email);
    expect(sandboxProvider.sent).toHaveLength(1);

    for (const input of [
      { organizationId: other.organization.id, emailId: email.id },
      { organizationId: tenant.organization.id, emailId: "not-an-id" },
      { organizationId: tenant.organization.id, emailId: newId("email") },
    ]) {
      await expectEmailError(service.dispatch(input), "not_found");
    }
  });

  test("delivers a queued email", async () => {
    const tenant = await createTestTenant();
    const { service, liveProvider } = fakeProviders();
    const from = await verifiedFrom(tenant.organization.id);
    const [row] = await db
      .insert(schema.email)
      .values({
        organizationId: tenant.organization.id,
        projectId: tenant.project.id,
        environmentId: tenant.production.id,
        from,
        to: ["user@example.com"],
        subject: "Queued",
        text: "Hi",
      })
      .returning();
    if (!row) throw new Error("insert failed");

    const email = await service.dispatch({
      organizationId: tenant.organization.id,
      emailId: row.id,
    });
    expect(email).toMatchObject({ id: row.id, status: "sent", sandbox: false });
    expect(liveProvider.sent.map((m) => m.emailId)).toEqual([row.id]);
  });

  test("gives an HTML-only email a generated text part, without storing it", async () => {
    const tenant = await createTestTenant();
    const { service, sandboxProvider, queue } = fakeProviders();
    const html = '<p>Hi Ada,</p><p><a href="https://acme.com/start">Get started</a></p>';
    const { email } = await service.send({
      environment: sendEnvironment(tenant.development),
      apiKeyId: null,
      params: params({ html, text: undefined }),
    });
    await queue.drain(service);

    expect(sandboxProvider.sent.at(-1)).toMatchObject({
      html,
      text: "Hi Ada,\n\nGet started [https://acme.com/start]",
    });
    expect(await loadRow(email.id)).toMatchObject({ html, text: null });
  });

  test("keeps the text part a send provided", async () => {
    const tenant = await createTestTenant();
    const { service, sandboxProvider, queue } = fakeProviders();
    await service.send({
      environment: sendEnvironment(tenant.development),
      apiKeyId: null,
      params: params({ html: "<p>HTML version</p>", text: "Text version" }),
    });
    await queue.drain(service);

    expect(sandboxProvider.sent.at(-1)?.text).toBe("Text version");
  });

  test("concurrent dispatchers send an email only once", async () => {
    const tenant = await createTestTenant();
    const gated = gatedProvider();
    const from = await verifiedFrom(tenant.organization.id, gated.provider.name);
    const service = createEmailService({
      liveProvider: gated.provider,
      sandboxProvider: new FakeEmailProvider({ log: false }),
      queue: memoryDispatchQueue(),
    });
    const [row] = await db
      .insert(schema.email)
      .values({
        organizationId: tenant.organization.id,
        projectId: tenant.project.id,
        environmentId: tenant.production.id,
        from,
        to: ["user@example.com"],
        subject: "Race",
        text: "Hi",
      })
      .returning();
    if (!row) throw new Error("insert failed");
    const input = { organizationId: tenant.organization.id, emailId: row.id };

    const first = service.dispatch(input);
    await gated.called; // the first dispatcher has claimed the email and is inside provider.send
    const second = await service.dispatch(input);
    expect(second.status).toBe("queued");
    gated.release();
    expect((await first).status).toBe("sent");
    expect(gated.sent).toHaveLength(1);
  });
});
