import { describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { uniqueSuffix } from "@coss/db/testing";
import {
  buildTestMessage,
  dmarcReportAddress,
  dmarcReportMessage,
  inboundAddressFor,
  sampleDmarcReport,
} from "@coss/email";
import { S3InboundStore } from "@coss/email/ses";
import { createVerifiedDomain, FakeS3Api, sesReceiptNotification } from "@coss/email/testing";
import { memoryLimiter } from "@coss/ratelimit/testing";
import { createTestTenant } from "@coss/tenancy/testing";
import { eq } from "drizzle-orm";
import {
  dmarcReportQuota,
  inboundDataQuota,
  inboundQuota,
  pollSesInbound,
} from "../src/inbound.ts";
import type { QueueMessage, SqsApi } from "../src/sqs.ts";

const MANAGED = "inbound.coss.test";
const BUCKET = "coss-inbound";

function fakeQueue(bodies: string[]) {
  const messages: QueueMessage[] = bodies.map((body, index) => ({
    id: `m${index}`,
    receiptHandle: `r${index}`,
    body,
  }));
  const deleted: string[] = [];
  const sqs: SqsApi = {
    receive: async () => messages.splice(0, 10),
    delete: async (done) => {
      deleted.push(...done.map((m) => m.id));
    },
  };
  return { sqs, deleted };
}

describe("pollSesInbound", () => {
  test("a failed store write retries at the quota boundary without losing the landing object", async () => {
    const tenant = await createTestTenant();
    const { domain } = await inboundAddressFor(
      { organizationId: tenant.organization.id, environmentId: tenant.production.id },
      MANAGED,
    );
    const s3 = new FakeS3Api();
    const messageId = `retry-${uniqueSuffix()}`;
    const objectKey = `landing/${messageId}`;
    await s3.putObject(
      BUCKET,
      objectKey,
      buildTestMessage({
        from: "sender@example.com",
        to: [`hello@${domain}`],
        subject: "retry",
      }),
      "message/rfc822",
    );
    const body = sesReceiptNotification({
      messageId,
      source: "sender@example.com",
      recipients: [`hello@${domain}`],
      bucketName: BUCKET,
      objectKey,
    });
    const store = new S3InboundStore(s3, BUCKET);
    const put = store.put.bind(store);
    store.put = async () => {
      throw new Error("temporary storage failure");
    };
    const limiter = memoryLimiter({
      overrides: async () => ({
        "email.inbound.day": { limit: 1, periodMs: 24 * 60 * 60 * 1000 },
      }),
    });
    const first = fakeQueue([body]);
    await pollSesInbound({
      sqs: first.sqs,
      s3,
      bucket: BUCKET,
      inbound: { store, managedDomain: MANAGED, quota: inboundQuota(limiter) },
    });
    expect(first.deleted).toEqual([]);
    expect(s3.objects.has(`${BUCKET}/${objectKey}`)).toBe(true);
    store.put = put;
    // A fresh adapter shares the admission record, as another worker would.
    const retry = fakeQueue([body]);
    await pollSesInbound({
      sqs: retry.sqs,
      s3,
      bucket: BUCKET,
      inbound: { store, managedDomain: MANAGED, quota: inboundQuota(limiter) },
    });
    expect(retry.deleted).toEqual(["m0"]);
    const rows = await db
      .select()
      .from(schema.receivedEmail)
      .where(eq(schema.receivedEmail.environmentId, tenant.production.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subject).toBe("retry");
    expect(s3.objects.has(`${BUCKET}/${objectKey}`)).toBe(false);
  });

  test("records a receipt, deletes its landing object, and keeps what failed", async () => {
    const tenant = await createTestTenant();
    const { domain } = await inboundAddressFor(
      { organizationId: tenant.organization.id, environmentId: tenant.production.id },
      MANAGED,
    );
    const s3 = new FakeS3Api();
    const messageId = `ses-${uniqueSuffix()}`;
    const objectKey = `landing/${messageId}`;
    const to = `orders@${domain}`;
    await s3.putObject(
      BUCKET,
      objectKey,
      buildTestMessage({ from: "jane@example.com", to: [to], subject: "Order", text: "Hi" }),
      "message/rfc822",
    );
    const receipt = sesReceiptNotification({
      messageId,
      source: "jane@example.com",
      recipients: [to, "nobody@unrouted.example"],
      bucketName: BUCKET,
      objectKey,
      verdicts: { spam: "GRAY" },
    });
    const failing = sesReceiptNotification({
      messageId: `ses-${uniqueSuffix()}`,
      source: "jane@example.com",
      recipients: [to],
      bucketName: BUCKET,
      objectKey: "landing/unreadable",
    });
    const { sqs, deleted } = fakeQueue([
      receipt,
      // Redelivered: the landing object is gone, nothing is recorded twice.
      receipt,
      JSON.stringify({ notificationType: "AMAZON_SES_SETUP_NOTIFICATION" }),
      failing,
    ]);
    const getObject = s3.getObject.bind(s3);
    s3.getObject = async (bucket, key) => {
      if (key === "landing/unreadable") throw new Error("S3 is down");
      return getObject(bucket, key);
    };
    const store = new S3InboundStore(s3, BUCKET);

    expect(
      await pollSesInbound({ sqs, s3, bucket: BUCKET, inbound: { store, managedDomain: MANAGED } }),
    ).toBe(4);
    expect(deleted).toEqual(["m0", "m1", "m2"]);
    expect(s3.objects.has(`${BUCKET}/${objectKey}`)).toBe(false);

    const rows = await db
      .select()
      .from(schema.receivedEmail)
      .where(eq(schema.receivedEmail.environmentId, tenant.production.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: "ses",
      providerMessageId: messageId,
      recipients: [to],
      subject: "Order",
      spamVerdict: "gray",
    });
    expect(s3.objects.has(`${BUCKET}/${rows[0]?.rawKey}`)).toBe(true);
  });
});

describe("inboundQuota", () => {
  test("charges the organization's daily inbound bucket", async () => {
    const tenant = await createTestTenant();
    const quota = inboundQuota(
      memoryLimiter({
        overrides: async () => ({
          "email.inbound.day": { limit: 1, periodMs: 24 * 60 * 60 * 1000 },
        }),
      }),
    );
    expect(await quota.consume(tenant.organization.id, "message-1")).toBe(true);
    expect(await quota.consume(tenant.organization.id, "message-1")).toBe(true);
    expect(await quota.consume(tenant.organization.id, "message-2")).toBe(false);
  });

  test("inboundDataQuota charges a message's MB once, across retries", async () => {
    const tenant = await createTestTenant();
    const quota = inboundDataQuota(
      memoryLimiter({
        overrides: async () => ({
          "email.inbound.megabytes.day": { limit: 10, periodMs: 24 * 60 * 60 * 1000 },
        }),
      }),
    );
    expect(await quota.consume(tenant.organization.id, "message-1", 7)).toBe(true);
    expect(await quota.consume(tenant.organization.id, "message-1", 7)).toBe(true);
    expect(await quota.consume(tenant.organization.id, "message-2", 4)).toBe(false);
    expect(await quota.consume(tenant.organization.id, "message-3", 3)).toBe(true);
  });

  test("a DMARC report to a domain's report address becomes a report, not a received email", async () => {
    const tenant = await createTestTenant();
    const domain = await createVerifiedDomain(tenant.organization.id);
    const to = dmarcReportAddress(domain.dmarcReportToken, MANAGED) as string;
    const s3 = new FakeS3Api();
    const messageId = `dmarc-${uniqueSuffix()}`;
    const objectKey = `landing/${messageId}`;
    await s3.putObject(
      BUCKET,
      objectKey,
      // `sesReceiptNotification` receives at 2026-10-12T10:00Z: the report covers the day before.
      dmarcReportMessage(
        {
          ...sampleDmarcReport(domain, { now: new Date("2026-10-12T10:00:00Z") }),
          reportId: messageId,
        },
        { to },
      ),
      "message/rfc822",
    );
    const queue = fakeQueue([
      sesReceiptNotification({
        messageId,
        source: "noreply-dmarc-support@google.com",
        recipients: [to],
        bucketName: BUCKET,
        objectKey,
      }),
    ]);
    await pollSesInbound({
      sqs: queue.sqs,
      s3,
      bucket: BUCKET,
      inbound: {
        store: new S3InboundStore(s3, BUCKET),
        managedDomain: MANAGED,
        quota: inboundQuota(memoryLimiter()),
        dmarcQuota: dmarcReportQuota(memoryLimiter()),
      },
    });
    expect(queue.deleted).toEqual(["m0"]);
    expect(s3.objects.has(`${BUCKET}/${objectKey}`)).toBe(false);
    const reports = await db
      .select()
      .from(schema.dmarcReport)
      .where(eq(schema.dmarcReport.domainId, domain.id));
    expect(reports.map((report) => [report.reportId, report.provider])).toEqual([
      [messageId, "ses"],
    ]);
    const received = await db
      .select()
      .from(schema.receivedEmail)
      .where(eq(schema.receivedEmail.organizationId, tenant.organization.id));
    expect(received).toHaveLength(0);
  });
});
