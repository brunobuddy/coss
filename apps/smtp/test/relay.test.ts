import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { connect } from "node:net";
import { db, schema } from "@coss/db";
import { FakeEmailProvider } from "@coss/email";
import { createVerifiedDomain, memoryDispatchQueue } from "@coss/email/testing";
import { memoryLogWriter } from "@coss/logs/testing";
import type { OverrideRules } from "@coss/ratelimit";
import { memoryLimiter } from "@coss/ratelimit/testing";
import { suspendOrganization } from "@coss/tenancy/admin";
import { createTestTenant, createTestUser, type TestTenant } from "@coss/tenancy/testing";
import { and, eq } from "drizzle-orm";
import nodemailer, { type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import { createRelayEmailService } from "../src/email-service.ts";
import { createSmtpRelay, type SmtpPorts, type SmtpRelay } from "../src/server.ts";
import { selfSignedCertificate } from "../src/tls.ts";

const tls = selfSignedCertificate("localhost");

type Harness = {
  relay: SmtpRelay;
  ports: SmtpPorts;
  queue: ReturnType<typeof memoryDispatchQueue>;
  logs: ReturnType<typeof memoryLogWriter>;
};

const overrides = new Map<string, OverrideRules>();

function createRelay(opts: { maxMessageBytes?: number; closeTimeoutMs?: number } = {}) {
  const queue = memoryDispatchQueue();
  const logs = memoryLogWriter();
  const relay = createSmtpRelay({
    hostname: "localhost",
    tls,
    emailService: createRelayEmailService({
      liveProvider: new FakeEmailProvider({ log: false }),
      sandboxProvider: new FakeEmailProvider({ log: false }),
      queue,
      trackingBaseUrl: "https://track.coss.test",
    }),
    rateLimiter: memoryLimiter({
      overrides: async (organizationId) => overrides.get(organizationId) ?? {},
    }),
    logWriter: logs,
    ...opts,
  });
  return { relay, queue, logs };
}

async function startRelay(opts: { maxMessageBytes?: number; closeTimeoutMs?: number } = {}) {
  const created = createRelay(opts);
  const ports = await created.relay.listen({ implicitTls: 0, startTls: 0 }, "127.0.0.1");
  return { ...created, ports } satisfies Harness;
}

function transport(
  harness: Harness,
  pass: string,
  // SMTP transport options, `pool`/`maxConnections` included.
  opts: Record<string, unknown> = {},
): Transporter<SMTPTransport.SentMessageInfo> {
  return nodemailer.createTransport({
    host: "127.0.0.1",
    port: harness.ports.startTls,
    secure: false,
    requireTLS: true,
    auth: { user: "coss", pass },
    tls: { rejectUnauthorized: false },
    ...opts,
  } as SMTPTransport.Options);
}

/** The SMTP error nodemailer reports (`responseCode` + the whole `response` line). */
async function smtpError(promise: Promise<unknown>): Promise<{ code: number; response: string }> {
  try {
    await promise;
  } catch (error) {
    const { responseCode, response } = error as { responseCode: number; response: string };
    return { code: responseCode, response };
  }
  throw new Error("Expected the SMTP transaction to fail.");
}

function emailIdOf(info: SMTPTransport.SentMessageInfo): string {
  const id = /queued as (email_\w+)/.exec(info.response)?.[1];
  if (!id) throw new Error(`No email id in "${info.response}".`);
  return id;
}

let harness: Harness;
let tenant: TestTenant;

beforeAll(async () => {
  harness = await startRelay();
  tenant = await createTestTenant();
});

afterAll(async () => {
  await harness.relay.shutdown();
});

describe("SMTP relay", () => {
  test("a sandbox key sends over STARTTLS, like POST /v1/emails", async () => {
    const info = await transport(harness, tenant.sandboxKey).sendMail({
      from: "Acme <hello@acme.test>",
      to: "ada@example.com",
      bcc: "grace@example.com",
      subject: "Welcome",
      html: "<p>Hi</p>",
      text: "Hi",
    });
    expect(info.response).toMatch(/^250 2\.0\.0 OK queued as email_/);
    const id = emailIdOf(info);
    const [row] = await db
      .select()
      .from(schema.email)
      .where(and(eq(schema.email.id, id), eq(schema.email.organizationId, tenant.organization.id)));
    expect(row).toMatchObject({
      environmentId: tenant.development.id,
      from: "Acme <hello@acme.test>",
      subject: "Welcome",
      status: "queued",
    });
    expect(harness.queue.jobs.some((job) => job.emailId === id)).toBe(true);
    const line = harness.logs.entries.find((entry) => entry.resourceId === id);
    expect(line).toMatchObject({
      source: "smtp",
      type: "smtp.message",
      level: "info",
      statusCode: 250,
      environmentId: tenant.development.id,
      clientIp: "127.0.0.1",
      // The negotiated protocol, not the cipher suite's minimum (`TLSv1/SSLv3` under Bun).
      attributes: {
        smtp: { tls: expect.stringMatching(/^TLSv1\.[23]$/), cipher: expect.any(String) },
      },
    });
    // Never addresses or the subject in the log line.
    expect(JSON.stringify(line)).not.toContain("ada@example.com");
    expect(JSON.stringify(line)).not.toContain("Welcome");
  });

  test("a live key sends over implicit TLS from a verified domain", async () => {
    const domain = await createVerifiedDomain(tenant.organization.id);
    const info = await transport(harness, tenant.liveKey, {
      port: harness.ports.implicitTls,
      secure: true,
      requireTLS: false,
    }).sendMail({
      from: `hello@${domain.name}`,
      to: "ada@example.com",
      subject: "Live",
      text: "Hi",
    });
    const [row] = await db
      .select()
      .from(schema.email)
      .where(eq(schema.email.id, emailIdOf(info)));
    expect(row?.environmentId).toBe(tenant.production.id);
    const line = harness.logs.entries.find((entry) => entry.resourceId === emailIdOf(info));
    expect(line?.attributes).toMatchObject({
      smtp: { port: harness.ports.implicitTls, tls: expect.stringMatching(/^TLSv1\.[23]$/) },
    });
  });

  test("tracking set by X-Coss-Tracking is stored with the email", async () => {
    const info = await transport(harness, tenant.sandboxKey).sendMail({
      from: "hello@acme.test",
      to: "ada@example.com",
      subject: "Tracked",
      html: '<p><a href="https://acme.test">Hi</a></p>',
      headers: { "X-Coss-Tracking": "opens, clicks" },
    });
    const [row] = await db
      .select()
      .from(schema.email)
      .where(eq(schema.email.id, emailIdOf(info)));
    expect(row).toMatchObject({ trackOpens: true, trackClicks: true });
  });

  test("X-Coss-Tracking turns on one-click unsubscribe", async () => {
    const info = await transport(harness, tenant.sandboxKey).sendMail({
      from: "hello@acme.test",
      to: "ada@example.com",
      subject: "Newsletter",
      text: "Hi",
      headers: { "X-Coss-Category": "newsletter", "X-Coss-Tracking": "unsubscribe" },
    });
    const [row] = await db
      .select()
      .from(schema.email)
      .where(eq(schema.email.id, emailIdOf(info)));
    expect(row).toMatchObject({ unsubscribe: true, trackOpens: false, trackClicks: false });
  });

  test("an unverified From domain is refused for live keys", async () => {
    const error = await smtpError(
      transport(harness, tenant.liveKey).sendMail({
        from: "hello@not-ours.test",
        to: "ada@example.com",
        subject: "Hi",
        text: "Hi",
      }),
    );
    expect(error.code).toBe(550);
    expect(error.response).toContain("5.7.1");
  });

  test("AUTH needs TLS first", async () => {
    const error = await smtpError(
      transport(harness, tenant.sandboxKey, { requireTLS: false, ignoreTLS: true }).sendMail({
        from: "hello@acme.test",
        to: "ada@example.com",
        subject: "Hi",
        text: "Hi",
      }),
    );
    expect(error.code).toBe(538);
  });

  test("refuses other usernames, invalid keys and suspended organizations", async () => {
    const message = { from: "hello@acme.test", to: "ada@example.com", subject: "Hi", text: "Hi" };
    const username = await smtpError(
      transport(harness, tenant.sandboxKey, {
        auth: { user: "apikey", pass: tenant.sandboxKey },
      }).sendMail(message),
    );
    expect(username.code).toBe(535);
    expect(username.response).toContain('username "coss"');

    const invalid = await smtpError(
      transport(harness, `coss_test_${"a".repeat(64)}`).sendMail(message),
    );
    expect(invalid).toEqual({ code: 535, response: expect.stringContaining("5.7.8") });

    const suspended = await createTestTenant();
    const admin = await createTestUser();
    await suspendOrganization({
      organizationId: suspended.organization.id,
      reason: "Abuse report",
      actor: { userId: admin.id, email: admin.email },
    });
    const refused = await smtpError(transport(harness, suspended.sandboxKey).sendMail(message));
    expect(refused.code).toBe(535);
    expect(refused.response).toContain("suspended");
    // A real key refused for its organization is logged in its environment.
    expect(
      harness.logs.entries.some(
        (entry) => entry.type === "smtp.auth" && entry.environmentId === suspended.development.id,
      ),
    ).toBe(true);
  });

  test("plaintext on the implicit-TLS port doesn't take the relay down", async () => {
    await new Promise<void>((resolve) => {
      const socket = connect(harness.ports.implicitTls, "127.0.0.1", () => {
        socket.write("GET / HTTP/1.1\r\nHost: smtp\r\n\r\n");
      });
      socket.on("close", () => resolve());
      socket.on("error", () => resolve());
    });
    const info = await transport(harness, tenant.sandboxKey).sendMail({
      from: "hello@acme.test",
      to: "ada@example.com",
      subject: "Still up",
      text: "Hi",
    });
    expect(info.response).toStartWith("250 ");
  });

  test("a key revoked mid-session stops the next message", async () => {
    const revoked = await createTestTenant();
    const pooled = transport(harness, revoked.sandboxKey, { pool: true, maxConnections: 1 });
    const message = { from: "hello@acme.test", to: "ada@example.com", subject: "Hi", text: "Hi" };
    const first = await pooled.sendMail(message);
    const apiKeyId = harness.logs.entries.find(
      (entry) => entry.resourceId === emailIdOf(first),
    )?.apiKeyId;
    expect(apiKeyId).toBeString();
    await db
      .update(schema.apikey)
      .set({ enabled: false })
      .where(eq(schema.apikey.id, apiKeyId as string));
    const error = await smtpError(pooled.sendMail(message));
    pooled.close();
    expect(error.code).toBe(535);
    expect(error.response).toContain("no longer valid");
  });

  test("refusal log lines never quote the message's addresses", async () => {
    const error = await smtpError(
      transport(harness, tenant.sandboxKey).sendMail({
        from: "hello@acme.test",
        to: ["ada@example.com", "grace@example.com"],
        envelope: { from: "hello@acme.test", to: ["ada@example.com"] },
        subject: "Hi",
        text: "Hi",
      }),
    );
    // The client is told which address, the log only why.
    expect(error.response).toContain("grace@example.com");
    const line = harness.logs.entries.findLast(
      (entry) => entry.environmentId === tenant.development.id,
    );
    expect(line).toMatchObject({ statusCode: 554, errorCode: "recipient_not_in_envelope" });
    expect(JSON.stringify(line)).not.toContain("@example.com");
  });

  test("refuses messages it can't map, with the reason", async () => {
    const error = await smtpError(
      transport(harness, tenant.sandboxKey).sendMail({
        from: "hello@acme.test",
        to: "ada@example.com",
        subject: "Hi",
        text: "Hi",
        attachments: [{ filename: "setup.exe", content: Buffer.from("MZ") }],
      }),
    );
    expect(error.code).toBe(554);
    expect(error.response).toContain(".exe");
  });

  test("X-Coss-Idempotency-Key replays the first send", async () => {
    const key = `once-${crypto.randomUUID()}`;
    const message = {
      from: "hello@acme.test",
      to: "ada@example.com",
      subject: "Once",
      text: "Hi",
      headers: { "X-Coss-Idempotency-Key": key },
    };
    const first = await transport(harness, tenant.sandboxKey).sendMail(message);
    const second = await transport(harness, tenant.sandboxKey).sendMail(message);
    expect(emailIdOf(second)).toBe(emailIdOf(first));
    // A different key is a different email.
    const other = await transport(harness, tenant.sandboxKey).sendMail({
      ...message,
      headers: { "X-Coss-Idempotency-Key": `${key}-2` },
    });
    expect(emailIdOf(other)).not.toBe(emailIdOf(first));
  });

  test("a used-up recipient quota is a temporary failure", async () => {
    const limited = await createTestTenant();
    overrides.set(limited.organization.id, {
      "email.sandbox_recipients.day": { limit: 2, periodMs: 24 * 60 * 60 * 1000 },
    });
    const send = () =>
      transport(harness, limited.sandboxKey).sendMail({
        from: "hello@acme.test",
        to: "ada@example.com",
        subject: "Hi",
        text: "Hi",
      });
    await send();
    await send();
    const error = await smtpError(send());
    expect(error.code).toBe(451);
    expect(error.response).toContain("quota");
  });

  test("several messages share one pooled connection", async () => {
    const pooled = transport(harness, tenant.sandboxKey, { pool: true, maxConnections: 1 });
    const infos = await Promise.all(
      [1, 2, 3].map((n) =>
        pooled.sendMail({
          from: "hello@acme.test",
          to: `user${n}@example.com`,
          subject: `Message ${n}`,
          text: "Hi",
        }),
      ),
    );
    pooled.close();
    expect(new Set(infos.map(emailIdOf)).size).toBe(3);
  });

  test("refuses messages over the size limit", async () => {
    const small = await startRelay({ maxMessageBytes: 2_000 });
    try {
      const error = await smtpError(
        transport(small, tenant.sandboxKey).sendMail({
          from: "hello@acme.test",
          to: "ada@example.com",
          subject: "Big",
          text: "x".repeat(10_000),
        }),
      );
      expect(error.code).toBe(552);
    } finally {
      await small.relay.shutdown();
    }
  });

  test("a taken port fails the start instead of leaving it waiting", async () => {
    const second = createRelay();
    await expect(
      second.relay.listen({ implicitTls: harness.ports.implicitTls, startTls: 0 }, "127.0.0.1"),
    ).rejects.toMatchObject({ code: "EADDRINUSE" });
    await second.relay.shutdown();
  });

  test("shutdown says goodbye to idle clients and stops accepting", async () => {
    const draining = await startRelay({ closeTimeoutMs: 5_000 });
    const pooled = transport(draining, tenant.sandboxKey, { pool: true, maxConnections: 1 });
    await pooled.sendMail({
      from: "hello@acme.test",
      to: "ada@example.com",
      subject: "Hi",
      text: "Hi",
    });
    const started = Date.now();
    await draining.relay.shutdown();
    // The idle pooled connection was closed at once, not after the close timeout.
    expect(Date.now() - started).toBeLessThan(4_000);
    pooled.close();
    // Nothing listens any more.
    await expect(
      transport(draining, tenant.sandboxKey).sendMail({
        from: "hello@acme.test",
        to: "ada@example.com",
        subject: "Hi",
        text: "Hi",
      }),
    ).rejects.toMatchObject({ code: "ESOCKET" });
  });
});
