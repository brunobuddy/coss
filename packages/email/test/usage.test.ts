import { describe, expect, test } from "bun:test";
import {
  BillingError,
  createPlanGate,
  createUsageGate,
  liftHold,
  periodOf,
  placeHold,
} from "@coss/billing";
import { db, schema } from "@coss/db";
import { uniqueSuffix } from "@coss/db/testing";
import { createTestTenant, type TestTenant } from "@coss/tenancy/testing";
import { and, count, eq, sql, sum } from "drizzle-orm";
import { createDomain } from "../src/domains.ts";
import { EmailError } from "../src/errors.ts";
import { ingestProviderEvents } from "../src/events.ts";
import { FakeEmailProvider } from "../src/providers/fake.ts";
import { FakeIdentityProvider } from "../src/providers/fake-identity.ts";
import { FakeTrackingHostnameProvider } from "../src/providers/fake-tracking-hostnames.ts";
import { addSuppression } from "../src/suppressions.ts";
import { sweepStaleClaims } from "../src/sweeps.ts";
import { dispatchingEmailService } from "../src/testing.ts";
import { createTrackingDomain } from "../src/tracking-domains.ts";
import { gatedProvider, params, sendEnvironment, verifiedFrom } from "./helpers.ts";

async function meteredRecipients(tenant: TestTenant): Promise<number> {
  const [row] = await db
    .select({ total: sum(schema.billingUsage.quantity) })
    .from(schema.billingUsage)
    .where(eq(schema.billingUsage.organizationId, tenant.organization.id));
  return Number(row?.total ?? 0);
}

async function emailRow(id: string) {
  const [row] = await db.select().from(schema.email).where(eq(schema.email.id, id));
  return row;
}

function sentEvent(emailId: string) {
  return {
    provider: "fake",
    providerEventType: "Send",
    emailId,
    providerMessageId: "fake_event",
    type: "email.sent" as const,
    recipients: null,
    occurredAt: new Date(),
    sourceId: "fake_event",
    data: {},
  };
}

describe("email usage", () => {
  test("usage is attributed to the email's project, key and the key's owner", async () => {
    const tenant = await createTestTenant();
    const provider = new FakeEmailProvider({ log: false });
    const service = dispatchingEmailService({ liveProvider: provider, sandboxProvider: provider });
    const from = await verifiedFrom(tenant.organization.id);
    await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: "key_personal",
      apiKeyOwnerId: tenant.owner.id,
      params: params({ from, to: ["a@example.com", "b@example.com"] }),
    });
    await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({ from, to: ["c@example.com"] }),
    });

    const rows = await db
      .select({
        projectId: schema.billingUsageAttribution.projectId,
        apiKeyId: schema.billingUsageAttribution.apiKeyId,
        userId: schema.billingUsageAttribution.userId,
        quantity: sum(schema.billingUsageAttribution.quantity).mapWith(Number),
      })
      .from(schema.billingUsageAttribution)
      .where(eq(schema.billingUsageAttribution.organizationId, tenant.organization.id))
      .groupBy(
        schema.billingUsageAttribution.projectId,
        schema.billingUsageAttribution.apiKeyId,
        schema.billingUsageAttribution.userId,
      );
    expect(rows.sort((a, b) => b.quantity - a.quantity)).toEqual([
      {
        projectId: tenant.project.id,
        apiKeyId: "key_personal",
        userId: tenant.owner.id,
        quantity: 2,
      },
      { projectId: tenant.project.id, apiKeyId: "", userId: "", quantity: 1 },
    ]);
    expect(await meteredRecipients(tenant)).toBe(3);
  });

  test("a live email is billed once for the recipients it was sent to; sandbox never", async () => {
    const tenant = await createTestTenant();
    const provider = new FakeEmailProvider({ log: false });
    const service = dispatchingEmailService({ liveProvider: provider, sandboxProvider: provider });
    await addSuppression(
      { organizationId: tenant.organization.id, environmentId: tenant.production.id },
      { address: "gone@example.com", scope: "*" },
    );

    const live = await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({
        from: await verifiedFrom(tenant.organization.id),
        to: ["a@example.com", "b@example.com", "gone@example.com"],
        cc: "c@example.com",
      }),
    });
    expect(live.email.status).toBe("sent");
    expect(await meteredRecipients(tenant)).toBe(3);
    const row = await emailRow(live.email.id);
    expect(row?.billableRecipients).toBe(3);
    expect(row?.usageRecordedAt).toBeInstanceOf(Date);

    const [usage] = await db
      .select()
      .from(schema.billingUsage)
      .where(eq(schema.billingUsage.organizationId, tenant.organization.id));
    expect(usage).toMatchObject({
      meter: "email.recipients",
      dimension: "",
      environmentId: tenant.production.id,
    });
    // Counted per whole hour (the transaction's).
    expect((usage?.hourStart.getTime() ?? 1) % 3_600_000).toBe(0);

    await service.send({
      environment: sendEnvironment(tenant.development),
      apiKeyId: null,
      params: params({ to: ["a@example.com", "b@example.com"] }),
    });
    expect(await meteredRecipients(tenant)).toBe(3);
  });

  test("a Send event racing the provider call meters the email once", async () => {
    const tenant = await createTestTenant();
    const gated = gatedProvider("fake");
    const service = dispatchingEmailService({
      liveProvider: gated.provider,
      sandboxProvider: gated.provider,
    });
    const sending = service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({
        from: await verifiedFrom(tenant.organization.id),
        to: ["a@example.com", "b@example.com"],
      }),
    });
    await gated.called;
    const emailId = gated.sent[0]?.emailId ?? "";
    await ingestProviderEvents([sentEvent(emailId)]);
    expect(await meteredRecipients(tenant)).toBe(2);
    gated.release();
    await sending;
    expect((await emailRow(emailId))?.status).toBe("sent");
    expect(await meteredRecipients(tenant)).toBe(2);
  });

  test("an email the stale-claim sweep resolves as sent is metered", async () => {
    const tenant = await createTestTenant();
    const gated = gatedProvider("fake");
    const service = dispatchingEmailService({
      liveProvider: gated.provider,
      sandboxProvider: gated.provider,
    });
    void service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({ from: await verifiedFrom(tenant.organization.id) }),
    });
    await gated.called;
    const emailId = gated.sent[0]?.emailId ?? "";
    // The provider's Send event was recorded, but the dispatcher died before the outcome.
    await db.insert(schema.emailEvent).values({
      organizationId: tenant.organization.id,
      environmentId: tenant.production.id,
      emailId,
      type: "email.sent",
      provider: "fake",
      providerEventType: "Send",
      recipient: null,
      occurredAt: new Date(),
      dedupeKey: "sweep-test",
      details: {},
    });
    await db
      .update(schema.email)
      .set({ updatedAt: sql`now() - interval '1 hour'` })
      .where(eq(schema.email.id, emailId));

    expect(await sweepStaleClaims({ scope: { organizationIds: [tenant.organization.id] } })).toBe(
      1,
    );
    expect((await emailRow(emailId))?.status).toBe("sent");
    expect(await meteredRecipients(tenant)).toBe(1);
    gated.release();
  });

  test("a failed send is not billed", async () => {
    const tenant = await createTestTenant();
    const provider = new FakeEmailProvider({ log: false, fail: () => true });
    const service = dispatchingEmailService({ liveProvider: provider, sandboxProvider: provider });
    const result = await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({ from: await verifiedFrom(tenant.organization.id) }),
    });
    expect(result.email.status).toBe("failed");
    expect(await meteredRecipients(tenant)).toBe(0);
  });
});

describe("billing enforcement", () => {
  test("a billing hold refuses live sends and holds scheduled ones until it is lifted", async () => {
    const tenant = await createTestTenant();
    const provider = new FakeEmailProvider({ log: false });
    const service = dispatchingEmailService({ liveProvider: provider, sandboxProvider: provider });
    const from = await verifiedFrom(tenant.organization.id);
    const scheduled = await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({ from, scheduled_at: new Date(Date.now() + 60_000).toISOString() }),
    });
    await placeHold(db, tenant.organization.id, "delinquent", "test");

    const refused = await service
      .send({
        environment: sendEnvironment(tenant.production),
        apiKeyId: null,
        params: params({ from }),
      })
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(EmailError);
    expect((refused as EmailError).code).toBe("billing_hold");
    expect((refused as EmailError).status).toBe(402);
    // Sandbox keys still work.
    await service.send({
      environment: sendEnvironment(tenant.development),
      apiKeyId: null,
      params: params(),
    });

    const later = new Date(Date.now() + 120_000);
    const scope = { organizationIds: [tenant.organization.id] };
    await service.dispatchDue({ now: later, scope });
    expect((await emailRow(scheduled.email.id))?.status).toBe("scheduled");

    await liftHold(db, tenant.organization.id, "delinquent");
    await service.dispatchDue({ now: later, scope });
    expect((await emailRow(scheduled.email.id))?.status).toBe("sent");
  });

  test("a budget hold refuses its own source's live sends and holds its scheduled ones", async () => {
    const tenant = await createTestTenant();
    const provider = new FakeEmailProvider({ log: false });
    const service = dispatchingEmailService({ liveProvider: provider, sandboxProvider: provider });
    const from = await verifiedFrom(tenant.organization.id);
    const personal = { apiKeyId: "key_personal", apiKeyOwnerId: tenant.owner.id };
    const scheduled = await service.send({
      environment: sendEnvironment(tenant.production),
      ...personal,
      params: params({ from, scheduled_at: new Date(Date.now() + 60_000).toISOString() }),
    });
    const idempotencyKey = `budget-${uniqueSuffix()}`;
    await service.send({
      environment: sendEnvironment(tenant.production),
      ...personal,
      params: params({ from }),
      idempotencyKey,
    });
    await db.insert(schema.billingBudgetHold).values({
      organizationId: tenant.organization.id,
      scope: "user",
      targetId: tenant.owner.id,
      periodStart: periodOf(new Date()).start,
      spentCents: 600n,
      limitCents: 500n,
    });

    const attempt = (input: { apiKeyId: string | null; apiKeyOwnerId?: string | null }) =>
      service
        .send({
          environment: sendEnvironment(tenant.production),
          ...input,
          params: params({ from }),
        })
        .catch((error: unknown) => error);
    const refused = await attempt(personal);
    expect(refused).toBeInstanceOf(EmailError);
    expect((refused as EmailError).code).toBe("budget_exceeded");
    expect((refused as EmailError).status).toBe(402);
    const batch = await service
      .sendBatch({
        environment: sendEnvironment(tenant.production),
        ...personal,
        emails: [params({ from })],
      })
      .catch((error: unknown) => error);
    expect((batch as EmailError).code).toBe("budget_exceeded");
    // A retry of an accepted request still replays.
    const replay = await service.send({
      environment: sendEnvironment(tenant.production),
      ...personal,
      params: params({ from }),
      idempotencyKey,
    });
    expect(replay.replayed).toBe(true);
    // Organization keys and the sandbox are unaffected.
    expect(await attempt({ apiKeyId: "key_org" })).toMatchObject({
      email: expect.anything(),
    });
    await service.send({
      environment: sendEnvironment(tenant.development),
      ...personal,
      params: params(),
    });

    const later = new Date(Date.now() + 120_000);
    const scope = { organizationIds: [tenant.organization.id] };
    await service.dispatchDue({ now: later, scope });
    expect((await emailRow(scheduled.email.id))?.status).toBe("scheduled");
    await db
      .delete(schema.billingBudgetHold)
      .where(eq(schema.billingBudgetHold.organizationId, tenant.organization.id));
    await service.dispatchDue({ now: later, scope });
    expect((await emailRow(scheduled.email.id))?.status).toBe("sent");
  });

  test("Free's allowance caps live sends and batches, counted per accepted recipient", async () => {
    const tenant = await createTestTenant();
    const provider = new FakeEmailProvider({ log: false });
    const service = dispatchingEmailService({
      liveProvider: provider,
      sandboxProvider: provider,
      billing: createUsageGate(),
    });
    const from = await verifiedFrom(tenant.organization.id);
    await db.insert(schema.billingQuota).values({
      organizationId: tenant.organization.id,
      meter: "email.recipients",
      periodStart: periodOf(new Date()).start,
      reserved: 2_998,
    });
    await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({ from, to: ["a@example.com", "b@example.com"] }),
    });
    const refused = await service
      .sendBatch({
        environment: sendEnvironment(tenant.production),
        apiKeyId: null,
        emails: [params({ from }), params({ from, to: "c@example.com" })],
      })
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(BillingError);
    expect((refused as BillingError).code).toBe("usage_limit_exceeded");
    // Nothing of the refused batch was stored.
    const [stored] = await db
      .select({ n: count() })
      .from(schema.email)
      .where(eq(schema.email.organizationId, tenant.organization.id));
    expect(stored?.n).toBe(1);
    // Sandbox sends never count.
    await service.send({
      environment: sendEnvironment(tenant.development),
      apiKeyId: null,
      params: params(),
    });
  });

  test("the plan limits domains and tracking domains", async () => {
    const tenant = await createTestTenant();
    const deps = {
      identity: new FakeIdentityProvider(),
      dns: null,
      tracking: new FakeTrackingHostnameProvider(),
      plans: createPlanGate(),
    };
    const first = await createDomain(
      {
        organizationId: tenant.organization.id,
        name: `t-${uniqueSuffix()}.coss.test`,
        userId: null,
      },
      deps,
    );
    await expect(
      createDomain(
        {
          organizationId: tenant.organization.id,
          name: `t-${uniqueSuffix()}.coss.test`,
          userId: null,
        },
        deps,
      ),
    ).rejects.toThrow("1 domains");
    await expect(
      createTrackingDomain(
        {
          organizationId: tenant.organization.id,
          domainId: first.id,
          hostname: `links.${first.name}`,
        },
        deps,
      ),
    ).rejects.toThrow("Custom tracking domains are available on the Pro plan");
  });

  describe("attachment data", () => {
    const MB = 2 ** 20;
    const file = (bytes: number) => ({
      filename: "a.pdf",
      content: Buffer.alloc(bytes).toString("base64"),
    });

    async function meterTotal(tenant: TestTenant, meter: string): Promise<number> {
      const [row] = await db
        .select({ total: sum(schema.billingUsage.quantity) })
        .from(schema.billingUsage)
        .where(
          and(
            eq(schema.billingUsage.organizationId, tenant.organization.id),
            eq(schema.billingUsage.meter, meter),
          ),
        );
      return Number(row?.total ?? 0);
    }

    function testService(billing?: ReturnType<typeof createUsageGate>) {
      const provider = new FakeEmailProvider({ log: false });
      return dispatchingEmailService({
        liveProvider: provider,
        sandboxProvider: provider,
        ...(billing ? { billing } : {}),
      });
    }

    test("past the first MB, per email rounded up, for each recipient billed", async () => {
      const tenant = await createTestTenant();
      const service = testService();
      const from = await verifiedFrom(tenant.organization.id);
      await addSuppression(
        { organizationId: tenant.organization.id, environmentId: tenant.production.id },
        { address: "gone@example.com", scope: "*" },
      );
      await service.send({
        environment: sendEnvironment(tenant.production),
        apiKeyId: null,
        params: params({
          from,
          to: ["a@example.com", "b@example.com", "gone@example.com"],
          attachments: [file(2 * MB), file(1.5 * MB)],
        }),
      });
      // 3.5 MB is 3 past the first (rounded up) for 2 recipients: the suppressed one isn't billed.
      expect(await meterTotal(tenant, "email.attachment_data")).toBe(6);
      expect(await meterTotal(tenant, "email.recipients")).toBe(2);
    });

    test("an email within the first MB, or in a sandbox, bills none", async () => {
      const tenant = await createTestTenant();
      const service = testService();
      await service.send({
        environment: sendEnvironment(tenant.production),
        apiKeyId: null,
        params: params({
          from: await verifiedFrom(tenant.organization.id),
          to: "a@example.com",
          attachments: [file(MB)],
        }),
      });
      await service.send({
        environment: sendEnvironment(tenant.development),
        apiKeyId: null,
        params: params({ to: "a@example.com", attachments: [file(3 * MB)] }),
      });
      expect(await meterTotal(tenant, "email.attachment_data")).toBe(0);
      expect(await meterTotal(tenant, "email.recipients")).toBe(1);
    });

    test("is metered once, with its content already purged", async () => {
      const tenant = await createTestTenant();
      const service = testService();
      const { email } = await service.send({
        environment: sendEnvironment(tenant.production),
        apiKeyId: null,
        params: params({
          from: await verifiedFrom(tenant.organization.id),
          to: "a@example.com",
          attachments: [file(2 * MB)],
        }),
      });
      const [stored] = await db
        .select({ content: schema.emailAttachment.content })
        .from(schema.emailAttachment)
        .where(eq(schema.emailAttachment.emailId, email.id));
      expect(stored?.content).toBeNull();
      await ingestProviderEvents([sentEvent(email.id)]);
      expect(await meterTotal(tenant, "email.attachment_data")).toBe(1);
    });

    test("Free's allowance refuses large sends, while small ones keep going", async () => {
      const tenant = await createTestTenant();
      const service = testService(createUsageGate());
      const from = await verifiedFrom(tenant.organization.id);
      await db.insert(schema.billingQuota).values({
        organizationId: tenant.organization.id,
        meter: "email.attachment_data",
        periodStart: periodOf(new Date()).start,
        reserved: 999,
      });
      await service.send({
        environment: sendEnvironment(tenant.production),
        apiKeyId: null,
        params: params({ from, to: "a@example.com", attachments: [file(2 * MB)] }),
      });
      const refused = await service
        .send({
          environment: sendEnvironment(tenant.production),
          apiKeyId: null,
          params: params({ from, to: "b@example.com", attachments: [file(2 * MB)] }),
        })
        .catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(BillingError);
      expect((refused as BillingError).code).toBe("usage_limit_exceeded");
      expect((refused as BillingError).message).toContain("1,000 MB of email attachments");
      await service.send({
        environment: sendEnvironment(tenant.production),
        apiKeyId: null,
        params: params({ from, to: "c@example.com", attachments: [file(MB)] }),
      });
      expect(await meterTotal(tenant, "email.attachment_data")).toBe(1);
      expect(await meterTotal(tenant, "email.recipients")).toBe(2);
    });

    test("a batch reserves its emails' data as one", async () => {
      const tenant = await createTestTenant();
      const service = testService(createUsageGate());
      const from = await verifiedFrom(tenant.organization.id);
      await db.insert(schema.billingQuota).values({
        organizationId: tenant.organization.id,
        meter: "email.attachment_data",
        periodStart: periodOf(new Date()).start,
        reserved: 999,
      });
      const emails = [
        params({ from, to: "a@example.com", attachments: [file(2 * MB)] }),
        params({ from, to: "b@example.com", attachments: [file(2 * MB)] }),
      ];
      const refused = await service
        .sendBatch({
          environment: sendEnvironment(tenant.production),
          apiKeyId: null,
          emails,
        })
        .catch((error: unknown) => error);
      expect((refused as BillingError).code).toBe("usage_limit_exceeded");
      const [row] = await db
        .select({ n: count() })
        .from(schema.email)
        .where(eq(schema.email.organizationId, tenant.organization.id));
      expect(row?.n).toBe(0);
    });
  });
});
