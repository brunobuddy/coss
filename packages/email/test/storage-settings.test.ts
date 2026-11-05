import { describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { LATEST_API_VERSION } from "@coss/versioning";
import { createWebhookEndpoint } from "@coss/webhooks";
import { testManagementDeps } from "@coss/webhooks/testing";
import { and, eq } from "drizzle-orm";
import { withRenderedBody } from "../src/broadcast-content.ts";
import { FakeEmailProvider } from "../src/providers/fake.ts";
import { getEmail, listEmailSummariesPage } from "../src/read.ts";
import { createEmailService } from "../src/service.ts";
import { getStorageSettings, updateStorageSettings } from "../src/storage-settings.ts";
import { dispatchingEmailService, memoryDispatchQueue } from "../src/testing.ts";
import { params, sendEnvironment } from "./helpers.ts";

const provider = new FakeEmailProvider({ log: false });
const service = dispatchingEmailService({ liveProvider: provider, sandboxProvider: provider });

type Tenant = Awaited<ReturnType<typeof createTestTenant>>;

function devEnv(tenant: Tenant) {
  return { organizationId: tenant.organization.id, environmentId: tenant.development.id };
}

async function discarding(): Promise<Tenant> {
  const tenant = await createTestTenant();
  await updateStorageSettings(devEnv(tenant), { contentStorage: "discard" });
  return tenant;
}

const attachment = {
  filename: "lab-results.pdf",
  content: Buffer.from("%PDF-1.7 results").toString("base64"),
};

describe("storage settings", () => {
  test("store by default; changes are per environment and organization-scoped", async () => {
    const tenant = await createTestTenant();
    expect(await getStorageSettings(devEnv(tenant))).toEqual({
      contentStorage: "store",
      updatedAt: null,
      lockedByHipaaMode: false,
    });

    const updated = await updateStorageSettings(devEnv(tenant), { contentStorage: "discard" });
    expect(updated).toEqual({
      contentStorage: "discard",
      updatedAt: expect.any(Date),
      lockedByHipaaMode: false,
    });
    expect((await getStorageSettings(devEnv(tenant))).contentStorage).toBe("discard");
    expect(
      (
        await getStorageSettings({
          organizationId: tenant.organization.id,
          environmentId: tenant.production.id,
        })
      ).contentStorage,
    ).toBe("store");

    await updateStorageSettings(devEnv(tenant), { contentStorage: "store" });
    expect((await getStorageSettings(devEnv(tenant))).contentStorage).toBe("store");

    // Another organization's environment is never touched (or read).
    const other = await createTestTenant();
    expect(
      await updateStorageSettings(
        { organizationId: other.organization.id, environmentId: tenant.development.id },
        { contentStorage: "discard" },
      ),
    ).toBeNull();
    expect((await getStorageSettings(devEnv(tenant))).contentStorage).toBe("store");
  });
});

describe("sending without content storage", () => {
  test("delivers the whole email, then keeps only its metadata", async () => {
    const tenant = await discarding();
    const subject = `Your results ${crypto.randomUUID()}`;
    const { email } = await service.send({
      environment: sendEnvironment(tenant.development),
      apiKeyId: null,
      params: params({
        subject,
        html: "<p>Glucose: 5.1 mmol/L</p>",
        text: "Glucose: 5.1 mmol/L",
        headers: { "X-Patient": "p-123" },
        tags: [{ name: "kind", value: "results" }],
        category: "results",
        attachments: [attachment],
      }),
    });

    const delivered = provider.sent.find((message) => message.emailId === email.id);
    expect(delivered).toMatchObject({
      subject,
      html: "<p>Glucose: 5.1 mmol/L</p>",
      text: "Glucose: 5.1 mmol/L",
      headers: { "x-patient": "p-123" },
    });
    expect(delivered?.attachments[0]?.filename).toBe("lab-results.pdf");

    const [row] = await db.select().from(schema.email).where(eq(schema.email.id, email.id));
    expect(row).toMatchObject({
      status: "sent",
      storeContent: false,
      subject: "",
      html: null,
      text: null,
      headers: {},
      contentDiscardedAt: expect.any(Date),
      // Metadata stays.
      to: ["user@example.com"],
      tags: [{ name: "kind", value: "results" }],
      category: "results",
    });
    const attachments = await db
      .select()
      .from(schema.emailAttachment)
      .where(eq(schema.emailAttachment.emailId, email.id));
    expect(attachments).toMatchObject([
      { filename: "", content: null, size: 16, contentType: "application/pdf" },
    ]);

    const read = await getEmail({ ...devEnv(tenant), id: email.id });
    expect(read).toMatchObject({
      subject: "",
      html: null,
      text: null,
      headers: {},
      recipients: [{ address: "user@example.com", status: "delivered" }],
      attachments: [{ filename: "", size: 16 }],
      content_storage: { mode: "discard", discarded_at: expect.any(String) },
    });
    const { data } = await listEmailSummariesPage({ ...devEnv(tenant) });
    expect(data[0]).toMatchObject({
      id: email.id,
      subject: "",
      content_storage: { mode: "discard", discarded_at: expect.any(String) },
    });
  });

  test("never copies the subject into webhook payloads or event log lines", async () => {
    const tenant = await discarding();
    const { endpoint } = await createWebhookEndpoint(
      {
        ...devEnv(tenant),
        url: "https://example.com/hook",
        eventTypes: ["email.sent", "email.delivered"],
        apiVersion: LATEST_API_VERSION,
        userId: null,
      },
      testManagementDeps,
    );
    const subject = `Secret subject ${crypto.randomUUID()}`;
    const { email } = await service.send({
      environment: sendEnvironment(tenant.development),
      apiKeyId: null,
      params: params({ subject }),
    });

    const messages = await db
      .select({ payload: schema.webhookMessage.payload })
      .from(schema.webhookDelivery)
      .innerJoin(
        schema.webhookMessage,
        eq(schema.webhookMessage.id, schema.webhookDelivery.messageId),
      )
      .where(eq(schema.webhookDelivery.endpointId, endpoint.id));
    expect(messages.length).toBeGreaterThan(0);
    for (const { payload } of messages) {
      expect(payload).toMatchObject({ data: { email_id: email.id, subject: "" } });
    }
    const lines = await db
      .select({ attributes: schema.logEntry.attributes })
      .from(schema.logEntry)
      .where(
        and(
          eq(schema.logEntry.environmentId, tenant.development.id),
          eq(schema.logEntry.resourceId, email.id),
        ),
      );
    expect(lines.length).toBeGreaterThan(0);
    expect(JSON.stringify(lines)).not.toContain(subject);
  });

  test("keeps a scheduled email's content until it is canceled", async () => {
    const tenant = await discarding();
    const queued = createEmailService({
      liveProvider: provider,
      sandboxProvider: provider,
      queue: memoryDispatchQueue(),
    });
    const { email } = await queued.send({
      environment: sendEnvironment(tenant.development),
      apiKeyId: null,
      params: params({
        subject: "Later",
        scheduled_at: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    });
    expect(email).toMatchObject({
      status: "scheduled",
      subject: "Later",
      text: "Hello!",
      content_storage: { mode: "discard", discarded_at: null },
    });
    expect(await getEmail({ ...devEnv(tenant), id: email.id })).toMatchObject({
      subject: "Later",
      text: "Hello!",
    });

    await queued.cancel({ ...devEnv(tenant), emailId: email.id });
    expect(await getEmail({ ...devEnv(tenant), id: email.id })).toMatchObject({
      status: "canceled",
      subject: "",
      text: null,
      content_storage: { mode: "discard", discarded_at: expect.any(String) },
    });
  });

  test("emails keep the setting they were sent with", async () => {
    const tenant = await createTestTenant();
    const before = await service.send({
      environment: sendEnvironment(tenant.development),
      apiKeyId: null,
      params: params({ subject: "Kept" }),
    });
    await updateStorageSettings(devEnv(tenant), { contentStorage: "discard" });
    const after = await service.send({
      environment: sendEnvironment(tenant.development),
      apiKeyId: null,
      params: params({ subject: "Discarded" }),
    });
    await updateStorageSettings(devEnv(tenant), { contentStorage: "store" });

    expect(await getEmail({ ...devEnv(tenant), id: before.email.id })).toMatchObject({
      subject: "Kept",
      text: "Hello!",
      content_storage: { mode: "store", discarded_at: null },
    });
    expect(await getEmail({ ...devEnv(tenant), id: after.email.id })).toMatchObject({
      subject: "",
      text: null,
      content_storage: { mode: "discard" },
    });
  });

  test("a batch resolves the setting once for all its emails", async () => {
    const tenant = await discarding();
    const { batch } = await service.sendBatch({
      environment: sendEnvironment(tenant.development),
      apiKeyId: null,
      emails: [params({ subject: "One" }), params({ subject: "Two" })],
    });
    for (const sent of batch.data) {
      expect(sent).toMatchObject({
        status: "sent",
        subject: "",
        content_storage: { mode: "discard", discarded_at: expect.any(String) },
      });
    }
  });

  test("a discarded broadcast email is never rendered again", () => {
    const content = new Map([
      [
        "bcast_1",
        {
          subject: "Hi",
          html: "<p>Hi {{{contact.first_name}}}</p>",
          text: null,
          previewText: null,
        },
      ],
    ]);
    const row: Parameters<typeof withRenderedBody>[0] = {
      broadcastId: "bcast_1",
      variables: null,
      html: null,
      text: null,
      contentDiscardedAt: new Date(),
    };
    expect(withRenderedBody(row, content)).toBe(row);
    expect(withRenderedBody({ ...row, contentDiscardedAt: null }, content).html).toContain("Hi");
  });
});
