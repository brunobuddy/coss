import { describe, expect, spyOn, test } from "bun:test";
import { createUsageGate, periodOf } from "@coss/billing";
import { db, schema } from "@coss/db";
import { uniqueSuffix } from "@coss/db/testing";
import { createTestTenant, type TestTenant } from "@coss/tenancy/testing";
import { LATEST_API_VERSION } from "@coss/versioning";
import { createWebhookEndpoint, renderWebhookPayload } from "@coss/webhooks";
import { testManagementDeps } from "@coss/webhooks/testing";
import { and, eq, sum } from "drizzle-orm";
import {
  fakeVerdicts,
  type InboundMessage,
  NO_VERDICTS,
  receiveEmail,
  receiveFakeEmail,
} from "../src/inbound.ts";
import { inboundAddressFor } from "../src/inbound-address.ts";
import {
  buildTestMessage,
  parseInboundMessage,
  RECEIVED_BODY_MAX_LENGTH,
  scrubEnvelopeHeaders,
} from "../src/inbound-mime.ts";
import { FakeInboundStore } from "../src/inbound-store.ts";
import {
  deleteReceivedEmail,
  getReceivedEmail,
  getReceivedEmailAttachment,
  getReceivedEmailRaw,
  inboundDropCount,
  listReceivedEmails,
} from "../src/received-emails.ts";
import { createReceivingDomain } from "../src/receiving-domains.ts";
import { ReceivedEmailWebhookEvent } from "../src/schemas.ts";
import { createVerifiedDomain } from "../src/testing.ts";

const MANAGED = "inbound.coss.test";
const MX = "inbound-smtp.us-east-1.amazonaws.com";
const store = new FakeInboundStore();
const deps = { store, managedDomain: MANAGED };

async function managedAddress(tenant: TestTenant, env = tenant.production, local = "support") {
  const { domain } = await inboundAddressFor(
    { organizationId: tenant.organization.id, environmentId: env.id },
    MANAGED,
  );
  return `${local}@${domain}`;
}

function message(overrides: Partial<InboundMessage> & { rawBytes?: Uint8Array } = {}) {
  const raw =
    overrides.rawBytes ??
    buildTestMessage({
      from: "Jane <jane@example.com>",
      to: ["support@example.com"],
      subject: "Hello there",
      text: "Plain body",
      html: "<p>HTML body</p>",
      attachments: [
        { filename: "a.txt", contentType: "text/plain", content: new TextEncoder().encode("abc") },
      ],
    });
  return {
    provider: "fake",
    providerMessageId: `msg-${uniqueSuffix()}`,
    mailFrom: "jane@example.com",
    recipients: [],
    raw: async () => raw,
    verdicts: { ...NO_VERDICTS, spam: "pass", virus: "pass" },
    receivedAt: new Date(),
    ...overrides,
  } satisfies InboundMessage;
}

async function receivedUsage(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ total: sum(schema.billingUsage.quantity) })
    .from(schema.billingUsage)
    .where(
      and(
        eq(schema.billingUsage.organizationId, organizationId),
        eq(schema.billingUsage.meter, "email.received"),
      ),
    );
  return Number(row?.total ?? 0);
}

async function rowsFor(environmentId: string) {
  return db
    .select()
    .from(schema.receivedEmail)
    .where(eq(schema.receivedEmail.environmentId, environmentId));
}

describe("receiveEmail", () => {
  test("delivers mail for a managed address with its content, attachments and verdicts", async () => {
    const tenant = await createTestTenant();
    const to = await managedAddress(tenant);
    const outcomes = await receiveEmail(message({ recipients: [to.toUpperCase()] }), deps);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ kind: "received", environmentId: tenant.production.id });
    const id = outcomes[0]?.kind === "received" ? outcomes[0].receivedEmailId : "";
    const scope = { organizationId: tenant.organization.id, environmentId: tenant.production.id };

    const received = await getReceivedEmail({ ...scope, id });
    expect(received).toMatchObject({
      object: "received_email",
      status: "received",
      from: "Jane <jane@example.com>",
      recipients: [to],
      subject: "Hello there",
      text: "Plain body",
      html: "<p>HTML body</p>",
      spam: false,
      sandbox: false,
      verdicts: { spam: "pass", virus: "pass", spf: null },
    });
    expect(received?.attachments).toEqual([
      expect.objectContaining({ filename: "a.txt", content_type: "text/plain", size: 3 }),
    ]);
    const attachmentId = received?.attachments[0]?.id ?? "";
    const attachment = await getReceivedEmailAttachment({ ...scope, id, attachmentId }, store);
    expect(new TextDecoder().decode(attachment?.content)).toBe("abc");
    const raw = await getReceivedEmailRaw({ ...scope, id }, store);
    expect(new TextDecoder().decode(raw?.content)).toContain("Subject: Hello there");

    // Other environments and organizations see nothing.
    const other = await createTestTenant();
    expect(
      await getReceivedEmail({
        organizationId: other.organization.id,
        environmentId: other.production.id,
        id,
      }),
    ).toBeNull();
    expect(
      await getReceivedEmail({ ...scope, environmentId: tenant.development.id, id }),
    ).toBeNull();
  });

  test("stores decoded NUL-containing MIME safely while preserving content bytes", async () => {
    const tenant = await createTestTenant();
    const to = await managedAddress(tenant);
    const raw = buildTestMessage({
      from: "sender@example.com",
      to: ["to\0@example.com"],
      cc: ["cc\0@example.com"],
      subject: "hello\0world",
      text: "hello\0world",
      html: "<p>hello\0world</p>",
      messageId: "<message\0@example.com>",
      headers: {
        "Reply-To": "reply\0@example.com",
        "In-Reply-To": "<parent\0@example.com>",
        References: "<parent\0@example.com>",
        "X-Test": "hello\0world",
      },
      attachments: [
        { filename: "a\0.txt", contentType: "text/plain", content: new Uint8Array([0, 1, 0]) },
      ],
    });
    const outcomes = await receiveEmail(message({ recipients: [to], rawBytes: raw }), deps);
    expect(outcomes[0]?.kind).toBe("received");
    const [row] = await rowsFor(tenant.production.id);
    expect(row).toMatchObject({
      subject: "helloworld",
      text: "helloworld",
      html: "<p>helloworld</p>",
      messageId: "<message@example.com>",
      inReplyTo: "<parent@example.com>",
      references: ["<parent@example.com>"],
    });
    expect(JSON.stringify(row)).not.toContain("\\u0000");
    expect(await store.get(row?.rawKey ?? "")).toEqual(raw);
    const attachments = await db
      .select()
      .from(schema.receivedEmailAttachment)
      .where(eq(schema.receivedEmailAttachment.receivedEmailId, row?.id ?? ""));
    expect(attachments[0]?.filename).toBe("a.txt");
    expect(await store.get(attachments[0]?.contentKey ?? "")).toEqual(new Uint8Array([0, 1, 0]));
  });

  test("truncates Unicode headers safely and stores the original raw message", async () => {
    const tenant = await createTestTenant();
    const to = await managedAddress(tenant);
    const crossing = `${"a".repeat(8191)}😀`;
    const fitting = `${"b".repeat(8190)}😀`;
    const raw = buildTestMessage({
      from: "sender@example.com",
      to: [to],
      subject: "Unicode headers",
      headers: { "X-Crossing": crossing, "X-Fitting": fitting, "X-Short": "😀" },
    });
    const outcomes = await receiveEmail(message({ recipients: [to], rawBytes: raw }), deps);
    expect(outcomes[0]?.kind).toBe("received");
    const [row] = await rowsFor(tenant.production.id);
    expect(row?.truncated).toBe(true);
    expect(row?.headers).toEqual(
      expect.arrayContaining([
        { name: "X-Crossing", value: "a".repeat(8191) },
        { name: "X-Fitting", value: fitting },
        { name: "X-Short", value: "😀" },
      ]),
    );
    expect(await store.get(row?.rawKey ?? "")).toEqual(raw);
  });

  test("routes a receiving domain's hostname to its environment", async () => {
    const tenant = await createTestTenant();
    const parent = await createVerifiedDomain(tenant.organization.id);
    await createReceivingDomain(
      {
        organizationId: tenant.organization.id,
        domainId: parent.id,
        environmentId: tenant.development.id,
        hostname: `in.${parent.name}`,
      },
      { mxHost: MX, managedDomain: MANAGED },
      null,
    );
    const outcomes = await receiveEmail(
      message({
        recipients: [`help@in.${parent.name}`, `nobody@${parent.name}`, "x@unrelated.example"],
      }),
      deps,
    );
    expect(outcomes).toEqual([
      expect.objectContaining({
        kind: "received",
        environmentId: tenant.development.id,
        recipients: [`help@in.${parent.name}`],
      }),
    ]);
    const [row] = await rowsFor(tenant.development.id);
    expect(row?.recipients).toEqual([`help@in.${parent.name}`]);
  });

  test("drops recipients that route nowhere, and domains that are no longer verified", async () => {
    const tenant = await createTestTenant();
    const parent = await createVerifiedDomain(tenant.organization.id);
    await createReceivingDomain(
      {
        organizationId: tenant.organization.id,
        domainId: parent.id,
        environmentId: tenant.production.id,
        hostname: parent.name,
      },
      { mxHost: MX, managedDomain: MANAGED },
      null,
    );
    expect(await receiveEmail(message({ recipients: [`a@nolabel.${MANAGED}`] }), deps)).toEqual([]);
    await db.update(schema.domain).set({ status: "failed" }).where(eq(schema.domain.id, parent.id));
    expect(await receiveEmail(message({ recipients: [`a@${parent.name}`] }), deps)).toEqual([]);
  });

  test("a more specific domain of another organization takes the hostname over", async () => {
    const tenant = await createTestTenant();
    const parent = await createVerifiedDomain(tenant.organization.id);
    await createReceivingDomain(
      {
        organizationId: tenant.organization.id,
        domainId: parent.id,
        environmentId: tenant.production.id,
        hostname: `in.${parent.name}`,
      },
      { mxHost: MX, managedDomain: MANAGED },
      null,
    );
    const other = await createTestTenant();
    await createVerifiedDomain(other.organization.id, { name: `in.${parent.name}` });
    expect(await receiveEmail(message({ recipients: [`a@in.${parent.name}`] }), deps)).toEqual([]);
  });

  test("splits one message across environments without leaking recipients", async () => {
    const first = await createTestTenant();
    const second = await createTestTenant();
    const a = await managedAddress(first);
    const b = await managedAddress(second, second.production, "bcc-me");
    const raw = new TextEncoder().encode(
      [
        `Received: from mx.example.com by inbound-smtp.us-east-1.amazonaws.com with SMTP id abc for ${b};`,
        " Mon, 12 Oct 2026 10:00:00 +0000",
        "X-SES-RECEIPT: AEFBQUFBQUFBQUFH",
        "From: jane@example.com",
        `To: ${a}`,
        "Subject: Split",
        "",
        "Body",
        "",
      ].join("\r\n"),
    );
    const outcomes = await receiveEmail(message({ recipients: [a, b], rawBytes: raw }), deps);
    expect(outcomes.map((outcome) => outcome.recipients)).toEqual([[a], [b]]);

    const [firstRow] = await rowsFor(first.production.id);
    expect(firstRow?.recipients).toEqual([a]);
    expect(JSON.stringify(firstRow?.headers)).not.toContain(b);
    expect(JSON.stringify(firstRow?.headers)).not.toContain("X-SES-RECEIPT");
    const firstRaw = await store.get(firstRow?.rawKey ?? "");
    expect(new TextDecoder().decode(firstRaw ?? new Uint8Array())).not.toContain(b);
    // The recipient's own copy keeps its clause; the body is untouched.
    const [secondRow] = await rowsFor(second.production.id);
    const secondRaw = new TextDecoder().decode(
      (await store.get(secondRow?.rawKey ?? "")) ?? new Uint8Array(),
    );
    expect(secondRaw).toContain(`for ${b};`);
    expect(secondRaw).toEndWith("\r\n\r\nBody\r\n");
  });

  test("a repeated notification records the message once", async () => {
    const tenant = await createTestTenant();
    const to = await managedAddress(tenant);
    const once = message({ recipients: [to] });
    const first = await receiveEmail(once, deps);
    const second = await receiveEmail(once, deps);
    expect(second).toEqual([
      expect.objectContaining({
        kind: "duplicate",
        receivedEmailId: first[0]?.kind === "received" ? first[0].receivedEmailId : "",
      }),
    ]);
    expect(await rowsFor(tenant.production.id)).toHaveLength(1);
    const lines = await db
      .select()
      .from(schema.logEntry)
      .where(
        and(
          eq(schema.logEntry.environmentId, tenant.production.id),
          eq(schema.logEntry.type, "email.received"),
        ),
      );
    expect(lines).toHaveLength(1);
  });

  test("a virus verdict blocks the message: no content, no webhook", async () => {
    const tenant = await createTestTenant();
    const { endpoint } = await createWebhookEndpoint(
      {
        organizationId: tenant.organization.id,
        environmentId: tenant.production.id,
        url: "https://example.com/hook",
        eventTypes: [],
        apiVersion: LATEST_API_VERSION,
        userId: null,
      },
      testManagementDeps,
    );
    const to = await managedAddress(tenant);
    const [outcome] = await receiveEmail(
      message({ recipients: [to], verdicts: { ...NO_VERDICTS, virus: "fail" } }),
      deps,
    );
    expect(outcome?.kind).toBe("blocked");
    const [row] = await rowsFor(tenant.production.id);
    expect(row).toMatchObject({
      status: "blocked",
      blockedReason: "virus",
      rawKey: null,
      text: null,
    });
    const attachments = await db
      .select()
      .from(schema.receivedEmailAttachment)
      .where(eq(schema.receivedEmailAttachment.receivedEmailId, row?.id ?? ""));
    expect(attachments).toEqual([]);
    const deliveries = await db
      .select()
      .from(schema.webhookDelivery)
      .where(eq(schema.webhookDelivery.endpointId, endpoint.id));
    expect(deliveries).toEqual([]);
  });

  test("queues an email.received webhook with metadata only", async () => {
    const tenant = await createTestTenant();
    const { endpoint } = await createWebhookEndpoint(
      {
        organizationId: tenant.organization.id,
        environmentId: tenant.development.id,
        url: "https://example.com/hook",
        eventTypes: ["email.received"],
        apiVersion: LATEST_API_VERSION,
        userId: null,
      },
      testManagementDeps,
    );
    const to = await managedAddress(tenant, tenant.development);
    const raw = buildTestMessage({
      from: "jane@example.com",
      to: [to],
      cc: ["copied@example.com"],
      subject: "Secret plans [coss-test:spam]",
      text: "The body text",
    });
    const [outcome] = await receiveFakeEmail(
      {
        raw,
        mailFrom: "jane@example.com",
        recipients: [to],
        subject: "Secret plans [coss-test:spam]",
      },
      deps,
    );
    const [delivery] = await db
      .select({ payload: schema.webhookMessage.payload })
      .from(schema.webhookDelivery)
      .innerJoin(
        schema.webhookMessage,
        eq(schema.webhookMessage.id, schema.webhookDelivery.messageId),
      )
      .where(eq(schema.webhookDelivery.endpointId, endpoint.id));
    const event = ReceivedEmailWebhookEvent.parse(
      renderWebhookPayload(delivery?.payload ?? {}, LATEST_API_VERSION),
    );
    expect(event).toMatchObject({
      type: "email.received",
      data: {
        received_email_id: outcome?.kind === "received" ? outcome.receivedEmailId : "",
        recipients: [to],
        spam: true,
        sandbox: true,
        attachment_count: 0,
      },
    });
    expect(JSON.stringify(event)).not.toContain("The body text");
    expect(JSON.stringify(event)).not.toContain("copied@example.com");
  });

  test("over the daily limit, messages are dropped and counted", async () => {
    const tenant = await createTestTenant();
    const to = await managedAddress(tenant);
    const now = new Date();
    const outcomes = await receiveEmail(message({ recipients: [to], receivedAt: now }), {
      ...deps,
      quota: { consume: async () => false },
    });
    expect(outcomes).toEqual([expect.objectContaining({ kind: "over_limit" })]);
    expect(await rowsFor(tenant.production.id)).toEqual([]);
    expect(await inboundDropCount(tenant.organization.id, now.toISOString().slice(0, 10))).toBe(1);
  });

  test("bills every stored copy the provider took, except spam, viruses and test emails", async () => {
    const tenant = await createTestTenant();
    const org = tenant.organization.id;
    const live = await managedAddress(tenant);
    const sandbox = await managedAddress(tenant, tenant.development);
    // One message for both environments: two stored copies, both billed (sandbox mail is real).
    const both = message({ provider: "ses", recipients: [live, sandbox] });
    expect(await receiveEmail(both, deps)).toHaveLength(2);
    expect(await receivedUsage(org)).toBe(2);
    // A repeated notification stores nothing more, so bills nothing more.
    await receiveEmail(both, deps);
    expect(await receivedUsage(org)).toBe(2);
    // Spam and viruses are free (the sender chose to send them); so is the fake provider's mail.
    await receiveEmail(
      message({ provider: "ses", recipients: [live], verdicts: { ...NO_VERDICTS, spam: "fail" } }),
      deps,
    );
    await receiveEmail(
      message({ provider: "ses", recipients: [live], verdicts: { ...NO_VERDICTS, virus: "fail" } }),
      deps,
    );
    await receiveEmail(message({ recipients: [live] }), deps);
    expect(await rowsFor(tenant.production.id)).toHaveLength(4);
    expect(await receivedUsage(org)).toBe(2);
  });

  test("past Free's allowance, received mail is dropped and counted", async () => {
    const tenant = await createTestTenant();
    const to = await managedAddress(tenant);
    const billing = { ...deps, billing: createUsageGate() };
    await db.insert(schema.billingQuota).values({
      organizationId: tenant.organization.id,
      meter: "email.received",
      periodStart: periodOf(new Date()).start,
      reserved: 2_999,
    });
    const now = new Date();
    const [first] = await receiveEmail(
      message({ provider: "ses", recipients: [to], receivedAt: now }),
      billing,
    );
    expect(first?.kind).toBe("received");
    const [second] = await receiveEmail(
      message({ provider: "ses", recipients: [to], receivedAt: now }),
      billing,
    );
    expect(second?.kind).toBe("over_limit");
    expect(await inboundDropCount(tenant.organization.id, now.toISOString().slice(0, 10))).toBe(1);
    // What isn't billed isn't capped.
    const [test] = await receiveEmail(message({ recipients: [to], receivedAt: now }), billing);
    expect(test?.kind).toBe("received");
    expect(await rowsFor(tenant.production.id)).toHaveLength(2);
    expect(await receivedUsage(tenant.organization.id)).toBe(1);
  });

  describe("received data", () => {
    const MB = 2 ** 20;
    /** A parseable raw message of exactly `bytes`. */
    function sized(bytes: number): Uint8Array {
      const head = Buffer.from("From: jane@example.com\r\nSubject: Large\r\n\r\n");
      return new Uint8Array(Buffer.concat([head, Buffer.alloc(bytes - head.length, "a")]));
    }

    async function dataUsage(organizationId: string): Promise<number> {
      const [row] = await db
        .select({ total: sum(schema.billingUsage.quantity) })
        .from(schema.billingUsage)
        .where(
          and(
            eq(schema.billingUsage.organizationId, organizationId),
            eq(schema.billingUsage.meter, "email.received_data"),
          ),
        );
      return Number(row?.total ?? 0);
    }

    test("is billed past the first MB of the raw message, per copy", async () => {
      const tenant = await createTestTenant();
      const production = await managedAddress(tenant);
      const development = await managedAddress(tenant, tenant.development);
      await receiveEmail(
        message({ provider: "ses", recipients: [production], rawBytes: sized(MB) }),
        deps,
      );
      expect(await dataUsage(tenant.organization.id)).toBe(0);
      await receiveEmail(
        message({
          provider: "ses",
          recipients: [production, development],
          rawBytes: sized(2.5 * MB),
        }),
        deps,
      );
      // 2 MB past the first (rounded up), once for each environment it reached.
      expect(await dataUsage(tenant.organization.id)).toBe(4);
      expect(await receivedUsage(tenant.organization.id)).toBe(3);
    });

    test("spam, viruses and the fake provider's mail aren't billed", async () => {
      const tenant = await createTestTenant();
      const to = await managedAddress(tenant);
      const rawBytes = sized(3 * MB);
      for (const verdicts of [{ spam: "fail" }, { virus: "fail" }] as const) {
        await receiveEmail(
          message({
            provider: "ses",
            recipients: [to],
            rawBytes,
            verdicts: { ...NO_VERDICTS, spam: "pass", virus: "pass", ...verdicts },
          }),
          deps,
        );
      }
      await receiveEmail(message({ recipients: [to], rawBytes }), deps);
      expect(await dataUsage(tenant.organization.id)).toBe(0);
    });

    test("past Free's data allowance large mail is dropped, while small mail still arrives", async () => {
      const tenant = await createTestTenant();
      const to = await managedAddress(tenant);
      const billing = { ...deps, billing: createUsageGate() };
      await db.insert(schema.billingQuota).values({
        organizationId: tenant.organization.id,
        meter: "email.received_data",
        periodStart: periodOf(new Date()).start,
        reserved: 1_000,
      });
      const now = new Date();
      const [large] = await receiveEmail(
        message({ provider: "ses", recipients: [to], rawBytes: sized(2 * MB), receivedAt: now }),
        billing,
      );
      expect(large?.kind).toBe("over_limit");
      expect(await inboundDropCount(tenant.organization.id, now.toISOString().slice(0, 10))).toBe(
        1,
      );
      const [small] = await receiveEmail(
        message({ provider: "ses", recipients: [to], rawBytes: sized(MB), receivedAt: now }),
        billing,
      );
      expect(small?.kind).toBe("received");
      expect(await rowsFor(tenant.production.id)).toHaveLength(1);
      // The dropped copy's reservation of `email.received` rolled back with it.
      expect(await receivedUsage(tenant.organization.id)).toBe(1);
      const [reserved] = await db
        .select({ reserved: schema.billingQuota.reserved })
        .from(schema.billingQuota)
        .where(
          and(
            eq(schema.billingQuota.organizationId, tenant.organization.id),
            eq(schema.billingQuota.meter, "email.received"),
          ),
        );
      expect(reserved?.reserved).toBe(1);
    });

    test("the daily data limit drops large mail, spam included, before writing content", async () => {
      const tenant = await createTestTenant();
      const to = await managedAddress(tenant);
      const charges: number[] = [];
      const limited = {
        ...deps,
        dataQuota: {
          consume: async (_organizationId: string, _key: string, megabytes: number) => {
            charges.push(megabytes);
            return false;
          },
        },
      };
      const puts = spyOn(store, "put");
      const baseline = puts.mock.calls.length;
      const now = new Date();
      for (const spam of ["pass", "fail"] as const) {
        const [outcome] = await receiveEmail(
          message({
            provider: "ses",
            recipients: [to],
            rawBytes: sized(4 * MB),
            receivedAt: now,
            verdicts: { ...NO_VERDICTS, spam, virus: "pass" },
          }),
          limited,
        );
        expect(outcome?.kind).toBe("over_limit");
      }
      expect(charges).toEqual([3, 3]);
      expect(puts.mock.calls.length).toBe(baseline);
      expect(await inboundDropCount(tenant.organization.id, now.toISOString().slice(0, 10))).toBe(
        2,
      );
      // Small mail isn't charged, and a virus stores nothing for the limit to bound.
      const [small] = await receiveEmail(
        message({ provider: "ses", recipients: [to], rawBytes: sized(MB) }),
        limited,
      );
      expect(small?.kind).toBe("received");
      const [virus] = await receiveEmail(
        message({
          provider: "ses",
          recipients: [to],
          rawBytes: sized(4 * MB),
          verdicts: { ...NO_VERDICTS, spam: "pass", virus: "fail" },
        }),
        limited,
      );
      expect(virus?.kind).toBe("blocked");
      expect(charges).toEqual([3, 3]);
      puts.mockRestore();
      expect(await dataUsage(tenant.organization.id)).toBe(0);
    });
  });

  test("a failed attempt reserves nothing of Free's allowance, so its retry is received", async () => {
    const tenant = await createTestTenant();
    const to = await managedAddress(tenant);
    const billing = createUsageGate();
    await db.insert(schema.billingQuota).values({
      organizationId: tenant.organization.id,
      meter: "email.received",
      periodStart: periodOf(new Date()).start,
      reserved: 2_999,
    });
    const once = message({ provider: "ses", recipients: [to] });
    const down = {
      name: store.name,
      put: () => Promise.reject(new Error("store unavailable")),
      get: (key: string) => store.get(key),
      delete: (keys: readonly string[]) => store.delete(keys),
      deleteOrganization: (id: string) => store.deleteOrganization(id),
    };
    await expect(receiveEmail(once, { ...deps, store: down, billing })).rejects.toThrow(
      "store unavailable",
    );
    const [retried] = await receiveEmail(once, { ...deps, billing });
    expect(retried?.kind).toBe("received");
    expect(await receivedUsage(tenant.organization.id)).toBe(1);
  });

  test("organizations being deleted receive nothing; suspended ones still do", async () => {
    const deleting = await createTestTenant();
    const toDeleting = await managedAddress(deleting);
    await db.insert(schema.organizationDeletion).values({
      organizationId: deleting.organization.id,
      organizationName: deleting.organization.name,
      organizationSlug: deleting.organization.slug,
      requestedByEmail: "owner@example.com",
      // Never claimed by a deletion run.
      nextAttemptAt: null,
    });
    expect(await receiveEmail(message({ recipients: [toDeleting] }), deps)).toEqual([]);

    const suspended = await createTestTenant();
    const toSuspended = await managedAddress(suspended);
    await db.insert(schema.organizationSuspension).values({
      organizationId: suspended.organization.id,
      reason: "test",
    });
    expect(await receiveEmail(message({ recipients: [toSuspended] }), deps)).toHaveLength(1);
  });
});

describe("received emails", () => {
  test("list newest first with an id cursor, and delete removes the content", async () => {
    const tenant = await createTestTenant();
    const to = await managedAddress(tenant);
    for (let i = 0; i < 3; i++) await receiveEmail(message({ recipients: [to] }), deps);
    const scope = { organizationId: tenant.organization.id, environmentId: tenant.production.id };
    const first = await listReceivedEmails({ ...scope, limit: 2 });
    expect(first.data).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    const second = await listReceivedEmails({ ...scope, limit: 2, after: first.data[1]?.id });
    expect(second.data).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    expect([...first.data, ...second.data].map((e) => e.id)).toEqual(
      [...first.data, ...second.data]
        .map((e) => e.id)
        .sort()
        .reverse(),
    );

    const target = second.data[0]?.id ?? "";
    const [row] = await db
      .select()
      .from(schema.receivedEmail)
      .where(eq(schema.receivedEmail.id, target));
    expect(await store.get(row?.rawKey ?? "")).not.toBeNull();
    expect(
      await deleteReceivedEmail(
        { ...scope, environmentId: tenant.development.id, id: target },
        store,
      ),
    ).toBe(false);
    expect(await deleteReceivedEmail({ ...scope, id: target }, store)).toBe(true);
    expect(await store.get(row?.rawKey ?? "")).toBeNull();
    expect(await getReceivedEmail({ ...scope, id: target })).toBeNull();
  });
});

describe("MIME helpers", () => {
  test.each([
    ["application/😀", "application/octet-stream"],
    ["application/x\u0001test", "application/octet-stream"],
    ["application/x\0test", "application/octet-stream"],
    ["application/not a token", "application/octet-stream"],
    ["application/", "application/octet-stream"],
    [`application/${"x".repeat(128)}`, "application/octet-stream"],
    ["Application/PDF", "application/pdf"],
    ["application/vnd.example+json", "application/vnd.example+json"],
    ["text/plain; charset=utf-8", "text/plain"],
  ])("normalizes attachment type %s for content storage", async (contentType, expected) => {
    const content = new Uint8Array([0, 1, 255]);
    const parsed = await parseInboundMessage(
      buildTestMessage({
        from: "a@example.com",
        to: ["b@example.com"],
        subject: "types",
        attachments: [{ filename: "file.bin", contentType, content }],
      }),
    );
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0]?.contentType).toBe(expected);
    expect(parsed.attachments[0]?.content).toEqual(content);
  });

  test("body limits preserve complete Unicode characters", async () => {
    const text = `${"a".repeat(RECEIVED_BODY_MAX_LENGTH - 1)}😀`;
    const html = `${"b".repeat(RECEIVED_BODY_MAX_LENGTH - 2)}😀tail`;
    const parsed = await parseInboundMessage(
      buildTestMessage({
        from: "a@example.com",
        to: ["b@example.com"],
        subject: "bodies",
        text,
        html,
      }),
    );
    expect(parsed.truncated).toBe(true);
    expect(parsed.text).toBe("a".repeat(RECEIVED_BODY_MAX_LENGTH - 1));
    expect(parsed.html).toBe(`${"b".repeat(RECEIVED_BODY_MAX_LENGTH - 2)}😀`);
  });

  test("fake verdicts come from subject markers", () => {
    expect(fakeVerdicts("hi")).toMatchObject({ spam: "pass", virus: "pass" });
    expect(fakeVerdicts("[coss-test:virus] [coss-test:dmarc-fail]")).toMatchObject({
      virus: "fail",
      dmarc: "fail",
      dmarcPolicy: "reject",
    });
  });

  test("scrubbing leaves a message without provider headers byte-identical", () => {
    const raw = buildTestMessage({ from: "a@example.com", to: ["b@example.com"], subject: "x" });
    expect(scrubEnvelopeHeaders(raw, ["b@example.com"])).toBe(raw);
  });
});
