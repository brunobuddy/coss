import { describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import {
  getReputationStanding,
  reinstateOrganization,
  updateReputationPolicy,
} from "@coss/reputation";
import { listScreenings, screenMessage } from "@coss/screening";
import { fakeClassifier } from "@coss/screening/testing";
import { createTestTenant } from "@coss/tenancy/testing";
import { asc, eq } from "drizzle-orm";
import sharp from "sharp";
import { authorizeLiveSender } from "../src/domains.ts";
import { FakeEmailProvider } from "../src/providers/fake.ts";
import {
  clearScreeningDomainBlock,
  emailScreeningContent,
  htmlTextAndLinks,
} from "../src/screening.ts";
import { backfillScreeningDomainBlocks } from "../src/screening-domain-backfill.ts";
import { createEmailService } from "../src/service.ts";
import { sweepUnclaimedEmails } from "../src/sweeps.ts";
import {
  createVerifiedDomain,
  dispatchingEmailService,
  memoryDispatchQueue,
} from "../src/testing.ts";
import { params, sendEnvironment, verifiedFrom } from "./helpers.ts";

const png = await sharp({ create: { width: 512, height: 512, channels: 3, background: "white" } })
  .png()
  .toBuffer();

function screeningService(classifier = fakeClassifier()) {
  const liveProvider = new FakeEmailProvider({ log: false });
  const sandboxProvider = new FakeEmailProvider({ log: false });
  const service = dispatchingEmailService({
    liveProvider,
    sandboxProvider,
    screen: (input) => screenMessage(input, { classifier }),
  });
  return { service, liveProvider, sandboxProvider, classifier };
}

async function eventsOf(emailId: string) {
  return db
    .select()
    .from(schema.emailEvent)
    .where(eq(schema.emailEvent.emailId, emailId))
    .orderBy(asc(schema.emailEvent.createdAt));
}

describe("emailScreeningContent", () => {
  test("extracts visible text, alt text and links from HTML", () => {
    const { text, hrefs } = htmlTextAndLinks(
      `<html><head><title>x</title><style>p{}</style></head><body>
        <p>Your account is <b>locked</b>.</p><script>alert(1)</script>
        <a href="https://evil.example/login?u=1">Unlock now</a><img alt="Bank logo" src="x.png">
      </body></html>`,
    );
    expect(text).toContain("Your account is locked.");
    expect(text).toContain("Unlock now");
    expect(text).toContain("Bank logo");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("p{}");
    expect(hrefs).toEqual(["https://evil.example/login?u=1"]);
  });

  test("includes both body alternatives and merges their links", () => {
    expect(
      emailScreeningContent({
        from: "a@example.com",
        subject: "  Hi  ",
        html: '<p>html body</p><a href="https://one.example/a">x</a>',
        text: "text body https://two.example/b",
      }),
    ).toEqual({
      kind: "email",
      from: "a@example.com",
      subject: "Hi",
      text: "text body https://two.example/b\n\nhtml body\nx",
      links: ["one.example/a", "two.example/b"],
    });
  });

  test.each(["text", "html"] as const)(
    "a long %s part cannot crowd out the other alternative",
    (longPart) => {
      const content = emailScreeningContent({
        from: "a@example.com",
        subject: "Hello",
        text: longPart === "text" ? "x".repeat(20_000) : "Plain message",
        html: longPart === "html" ? `<p>${"x".repeat(20_000)}</p>` : "<p>HTML message</p>",
      });
      expect(content.text).toContain(longPart === "text" ? "HTML message" : "Plain message");
      expect(content.text.length).toBeLessThanOrEqual(8000);
    },
  );

  test("bounds a million-character HTML link before classification", () => {
    const content = emailScreeningContent({
      from: "a@example.com",
      subject: "Hello",
      text: null,
      html: `<a href="https://evil.example/${"x".repeat(1_000_000)}">Open</a>`,
    });
    expect(content.links[0]).toStartWith("evil.example/");
    expect(JSON.stringify(content).length).toBeLessThan(1000);
  });
});

describe("dispatch with content screening", () => {
  test("backfill respects an audited domain release even while the source organization is suspended", async () => {
    const tenant = await createTestTenant();
    const domain = await createVerifiedDomain(tenant.organization.id);
    const { service } = screeningService();
    await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({ from: `hello@${domain.name}`, subject: "[coss-test:phishing]" }),
    });
    await db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.id, tenant.owner.id));
    await clearScreeningDomainBlock({
      domain: domain.name,
      adminUserId: tenant.owner.id,
      note: "Reviewed new domain owner",
    });
    expect(
      await backfillScreeningDomainBlocks({
        apply: true,
        scope: { organizationIds: [tenant.organization.id] },
      }),
    ).toMatchObject({ inserted: 0 });
    expect(
      await db
        .select()
        .from(schema.emailSenderDomainBlock)
        .where(eq(schema.emailSenderDomainBlock.domain, domain.name)),
    ).toHaveLength(0);
  });
  test("historical domain backfill is dry-run by default, idempotent and respects reinstatement", async () => {
    const tenant = await createTestTenant();
    const domain = await createVerifiedDomain(tenant.organization.id);
    const { service } = screeningService();
    await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({ from: `hello@${domain.name}`, subject: "[coss-test:phishing]" }),
    });
    // Simulate a pre-upgrade screening, after its domain was deleted or transferred.
    await db
      .delete(schema.emailSenderDomainBlock)
      .where(eq(schema.emailSenderDomainBlock.domain, domain.name));
    await db.delete(schema.domain).where(eq(schema.domain.id, domain.id));
    const scope = { organizationIds: [tenant.organization.id] };
    expect(await backfillScreeningDomainBlocks({ scope })).toEqual({ candidates: 1, inserted: 0 });
    expect(await backfillScreeningDomainBlocks({ scope, apply: true })).toEqual({
      candidates: 1,
      inserted: 1,
    });
    expect(await backfillScreeningDomainBlocks({ scope, apply: true })).toEqual({
      candidates: 1,
      inserted: 0,
    });
    await reinstateOrganization({
      organizationId: tenant.organization.id,
      adminUserId: tenant.owner.id,
      note: "Reviewed",
    });
    expect(await backfillScreeningDomainBlocks({ scope, apply: true })).toEqual({
      candidates: 0,
      inserted: 0,
    });
    const later = await createVerifiedDomain(tenant.organization.id);
    await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({ from: `hello@${later.name}`, subject: "[coss-test:phishing]" }),
    });
    // A later suspension must not revive restrictions that support previously cleared.
    expect(await backfillScreeningDomainBlocks({ scope, apply: true })).toEqual({
      candidates: 1,
      inserted: 0,
    });
  });

  test("screens CID images before attachment bytes are purged", async () => {
    const tenant = await createTestTenant();
    const { service, classifier } = screeningService();
    const bytes = png;
    const { email } = await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({
        from: await verifiedFrom(tenant.organization.id),
        text: undefined,
        html: '<img src="cid:logo">',
        attachments: [
          { filename: "logo.png", content: bytes.toString("base64"), content_id: "logo" },
        ],
      }),
    });
    expect(email.status).toBe("sent");
    expect(classifier.calls[0]).toMatchObject({
      images: [{ data: bytes, mediaType: "image/png" }],
    });
    expect(
      (
        await db
          .select()
          .from(schema.emailAttachment)
          .where(eq(schema.emailAttachment.emailId, email.id))
      )[0]?.content,
    ).toBeNull();
  });
  test("image-only mail is screened beyond sampling and passes bytes to the classifier", async () => {
    const tenant = await createTestTenant();
    await updateReputationPolicy({
      organizationId: tenant.organization.id,
      adminUserId: tenant.owner.id,
      overrides: { contentScreening: { alwaysFirst: 0, milestones: [], sampleRate: 0 } },
    });
    const classifier = fakeClassifier({ scores: { phishing: 0.97 } });
    const provider = new FakeEmailProvider({ log: false });
    const service = dispatchingEmailService({
      liveProvider: provider,
      sandboxProvider: provider,
      screeningImages: async () => ({
        data: png,
        mediaType: "image/png",
      }),
      screen: (input) => screenMessage(input, { classifier, random: () => 1 }),
    });
    const { email } = await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({
        from: await verifiedFrom(tenant.organization.id),
        subject: "hi",
        text: undefined,
        html: '<img src="https://img.example/payload.png" alt="Account Notification"><p>Unsubscribe</p>',
      }),
    });
    expect(email.status).toBe("failed");
    expect(email.failure?.code).toBe("content_rejected");
    expect(provider.sent).toHaveLength(0);
    expect(classifier.calls[0]).toMatchObject({
      kind: "email",
      images: [{ mediaType: "image/png" }],
    });
  });

  test("unreadable images hold live mail instead of sending without inspection", async () => {
    const tenant = await createTestTenant();
    const provider = new FakeEmailProvider({ log: false });
    const classifier = fakeClassifier();
    const service = dispatchingEmailService({
      liveProvider: provider,
      sandboxProvider: provider,
      screeningImages: async () => {
        throw new Error("Image unavailable");
      },
      screen: (input) => screenMessage(input, { classifier }),
    });
    const { email } = await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({
        from: await verifiedFrom(tenant.organization.id),
        text: undefined,
        html: '<img src="https://img.example/payload.png">',
      }),
    });
    expect(email.status).toBe("queued");
    expect(provider.sent).toHaveLength(0);
    expect(classifier.calls).toHaveLength(0);
    expect((await listScreenings(tenant.organization.id))[0]?.verdict).toBe("error");
  });

  test("sender-domain blocks survive transfer and organization deletion", async () => {
    const source = await createTestTenant();
    const next = await createTestTenant();
    const domain = await createVerifiedDomain(source.organization.id);
    const from = `hello@${domain.name}`;
    const { service } = screeningService();
    await service.send({
      environment: sendEnvironment(source.production),
      apiKeyId: null,
      params: params({ from, subject: "[coss-test:phishing]" }),
    });
    await db.delete(schema.domain).where(eq(schema.domain.id, domain.id));
    await createVerifiedDomain(next.organization.id, { name: domain.name });
    await expect(
      authorizeLiveSender({ organizationId: next.organization.id, from, provider: "fake" }),
    ).rejects.toMatchObject({ code: "sending_paused" });
    await db.delete(schema.organization).where(eq(schema.organization.id, source.organization.id));
    await expect(
      authorizeLiveSender({
        organizationId: next.organization.id,
        from: `hello@child.${domain.name}`,
        provider: "fake",
      }),
    ).rejects.toMatchObject({ code: "sending_paused" });
    await expect(
      clearScreeningDomainBlock({
        domain: domain.name,
        adminUserId: next.owner.id,
        note: "Reviewed transfer",
      }),
    ).rejects.toThrow("platform admin");
    await db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.id, next.owner.id));
    expect(
      await clearScreeningDomainBlock({
        domain: domain.name,
        adminUserId: next.owner.id,
        note: "Reviewed transfer",
      }),
    ).toBe(true);
    await expect(
      authorizeLiveSender({ organizationId: next.organization.id, from, provider: "fake" }),
    ).resolves.toBeUndefined();
    const [audit] = await db
      .select()
      .from(schema.adminAuditEvent)
      .where(eq(schema.adminAuditEvent.targetId, domain.name));
    expect(audit).toMatchObject({
      action: "email.domain_screening_released",
      actorUserId: next.owner.id,
      reason: "Reviewed transfer",
    });
  });

  test("support reinstatement clears a domain restriction and queued sends recheck restrictions", async () => {
    const tenant = await createTestTenant();
    const domain = await createVerifiedDomain(tenant.organization.id);
    const from = `hello@${domain.name}`;
    const { service } = screeningService();
    await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({ from, subject: "[coss-test:phishing]" }),
    });
    await reinstateOrganization({
      organizationId: tenant.organization.id,
      adminUserId: tenant.owner.id,
      note: "Reviewed sender",
    });
    await expect(
      authorizeLiveSender({ organizationId: tenant.organization.id, from, provider: "fake" }),
    ).resolves.toBeUndefined();
    const provider = new FakeEmailProvider({ log: false });
    const queue = memoryDispatchQueue();
    const queued = createEmailService({ liveProvider: provider, sandboxProvider: provider, queue });
    const { email } = await queued.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({ from }),
    });
    await db
      .insert(schema.emailSenderDomainBlock)
      .values({ domain: domain.name, organizationId: tenant.organization.id, subjectId: email.id });
    await queue.drain(queued);
    expect(provider.sent).toHaveLength(0);
    expect(
      (await db.select().from(schema.email).where(eq(schema.email.id, email.id)))[0]?.errorCode,
    ).toBe("sending_paused");
  });
  test("blocks a confidently malicious live email before the provider and suspends", async () => {
    const tenant = await createTestTenant();
    const { service, liveProvider } = screeningService();
    const { email } = await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({
        from: await verifiedFrom(tenant.organization.id),
        subject: "Your mailbox is full [coss-test:phishing]",
      }),
    });

    expect(email).toMatchObject({ status: "failed" });
    expect(liveProvider.sent).toHaveLength(0);
    const [row] = await db.select().from(schema.email).where(eq(schema.email.id, email.id));
    expect(row).toMatchObject({ errorCode: "content_rejected", provider: "fake" });
    const events = await eventsOf(email.id);
    expect(events.map((event) => event.type)).toEqual(["email.failed"]);
    expect(events[0]?.details).toMatchObject({ failure: { code: "content_rejected" } });
    expect((await getReputationStanding(tenant.organization.id))?.status).toBe("suspended");
    const [screening] = await listScreenings(tenant.organization.id);
    expect(screening).toMatchObject({ subjectId: email.id, verdict: "blocked" });
  });

  test("blocks HTML fraud even with a long benign plain-text alternative", async () => {
    const tenant = await createTestTenant();
    const { service, liveProvider, classifier } = screeningService();
    const { email } = await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({
        from: await verifiedFrom(tenant.organization.id),
        text: "Your receipt. ".repeat(1000),
        html: "<p>Pay using gift cards [coss-test:fraud]</p>",
      }),
    });
    expect(email.status).toBe("failed");
    expect(liveProvider.sent).toHaveLength(0);
    expect(classifier.calls).toHaveLength(1);
    expect((await listScreenings(tenant.organization.id))[0]?.verdict).toBe("blocked");
    expect((await getReputationStanding(tenant.organization.id))?.status).toBe("suspended");
  });

  test("sends clean and flagged live emails", async () => {
    const tenant = await createTestTenant();
    const { service, liveProvider, classifier } = screeningService();
    const from = await verifiedFrom(tenant.organization.id);
    for (const subject of ["Receipt", "Big sale [coss-test:spam:0.8]"]) {
      const { email } = await service.send({
        environment: sendEnvironment(tenant.production),
        apiKeyId: null,
        params: params({ from, subject }),
      });
      expect(email.status).toBe("sent");
    }
    expect(liveProvider.sent).toHaveLength(2);
    expect(classifier.calls).toHaveLength(2);
    const verdicts = (await listScreenings(tenant.organization.id)).map((s) => s.verdict);
    expect(verdicts.sort()).toEqual(["clean", "flagged"]);
  });

  test("never screens sandbox emails", async () => {
    const tenant = await createTestTenant();
    const { service, sandboxProvider, classifier } = screeningService();
    const { email } = await service.send({
      environment: sendEnvironment(tenant.development),
      apiKeyId: null,
      params: params({ subject: "[coss-test:phishing]" }),
    });
    expect(email.status).toBe("sent");
    expect(sandboxProvider.sent).toHaveLength(1);
    expect(classifier.calls).toHaveLength(0);
  });

  test("holds a live email while screening is unavailable, and sends it once it is back", async () => {
    const tenant = await createTestTenant();
    const liveProvider = new FakeEmailProvider({ log: false });
    let classifier = fakeClassifier({ fail: true });
    const service = dispatchingEmailService({
      liveProvider,
      sandboxProvider: new FakeEmailProvider({ log: false }),
      screen: (input) => screenMessage(input, { classifier }),
    });
    const { email } = await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({ from: await verifiedFrom(tenant.organization.id) }),
    });

    // Held, not failed: unclaimed again, marked, and dispatched again later.
    expect(email.status).toBe("queued");
    const [held] = await db.select().from(schema.email).where(eq(schema.email.id, email.id));
    expect(held).toMatchObject({ provider: null, errorCode: "content_screening_unavailable" });
    expect(await eventsOf(email.id)).toEqual([]);
    expect(liveProvider.sent).toHaveLength(0);
    expect(service.queue.jobs).toEqual([
      { organizationId: tenant.organization.id, emailId: email.id, stream: "transactional" },
    ]);

    classifier = fakeClassifier();
    await service.queue.drain(service);
    const [sent] = await db.select().from(schema.email).where(eq(schema.email.id, email.id));
    expect(sent).toMatchObject({ status: "sent", errorCode: null, errorMessage: null });
    expect(liveProvider.sent).toHaveLength(1);
    // Screened again on the retry (it was a sample).
    expect(classifier.calls).toHaveLength(1);
    const verdicts = (await listScreenings(tenant.organization.id)).map((s) => s.verdict);
    expect(verdicts.sort()).toEqual(["clean", "error"]);
  });

  test("a held email gives up an hour after it was due, as content_screening_unavailable", async () => {
    const tenant = await createTestTenant();
    const service = dispatchingEmailService({
      liveProvider: new FakeEmailProvider({ log: false }),
      sandboxProvider: new FakeEmailProvider({ log: false }),
      screen: async () => {
        throw new Error("database unavailable");
      },
    });
    const from = await verifiedFrom(tenant.organization.id);
    const scope = { organizationIds: [tenant.organization.id] };
    const { email: immediate } = await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({ from }),
    });
    expect(immediate.status).toBe("queued");
    const queue = memoryDispatchQueue();
    const createdAt = new Date(immediate.created_at).getTime();
    expect(
      await sweepUnclaimedEmails(queue, { now: new Date(createdAt + 61 * 60_000), scope }),
    ).toMatchObject({ failed: 1 });
    const [failed] = await db.select().from(schema.email).where(eq(schema.email.id, immediate.id));
    expect(failed).toMatchObject({ status: "failed", errorCode: "content_screening_unavailable" });
    expect((await eventsOf(immediate.id)).map((e) => e.details)).toEqual([
      { failure: expect.objectContaining({ code: "content_screening_unavailable" }) },
    ]);

    // A scheduled send held when it fell due counts its hour from then, not from its creation.
    const scheduledAt = new Date(Date.now() + 2 * 86_400_000);
    const { email: scheduled } = await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({ from, scheduled_at: scheduledAt.toISOString() }),
    });
    expect(scheduled.status).toBe("scheduled");
    await service.dispatchDue({ now: new Date(scheduledAt.getTime() + 1000), scope });
    const [heldScheduled] = await db
      .select()
      .from(schema.email)
      .where(eq(schema.email.id, scheduled.id));
    expect(heldScheduled).toMatchObject({ status: "queued", provider: null });
    const due = scheduledAt.getTime();
    expect(await sweepUnclaimedEmails(queue, { now: new Date(due + 30 * 60_000), scope })).toEqual({
      failed: 0,
      requeued: 1,
    });
    expect(
      await sweepUnclaimedEmails(queue, { now: new Date(due + 61 * 60_000), scope }),
    ).toMatchObject({ failed: 1 });
  });

  test("keeps account mail available when screening itself throws", async () => {
    const tenant = await createTestTenant();
    const liveProvider = new FakeEmailProvider({ log: false });
    const service = dispatchingEmailService({
      liveProvider,
      sandboxProvider: new FakeEmailProvider({ log: false }),
      screen: async () => {
        throw new Error("database unavailable");
      },
      screeningFailureAllowlist: new Set([tenant.organization.id]),
    });
    const { email } = await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({ from: await verifiedFrom(tenant.organization.id) }),
    });
    expect(email.status).toBe("sent");
    expect(liveProvider.sent).toHaveLength(1);
  });

  test("screens scheduled emails when they are dispatched", async () => {
    const tenant = await createTestTenant();
    const liveProvider = new FakeEmailProvider({ log: false });
    const classifier = fakeClassifier();
    const service = createEmailService({
      liveProvider,
      sandboxProvider: new FakeEmailProvider({ log: false }),
      queue: memoryDispatchQueue(),
      screen: (input) => screenMessage(input, { classifier }),
    });
    const { email } = await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({
        from: await verifiedFrom(tenant.organization.id),
        subject: "[coss-test:fraud]",
        scheduled_at: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    });
    expect(classifier.calls).toHaveLength(0);
    const dispatched = await service.dispatchDue({
      now: new Date(Date.now() + 7_200_000),
      scope: { organizationIds: [tenant.organization.id] },
    });
    expect(dispatched).toBe(1);
    expect(classifier.calls).toHaveLength(1);
    const [row] = await db.select().from(schema.email).where(eq(schema.email.id, email.id));
    expect(row).toMatchObject({ status: "failed", errorCode: "content_rejected" });
    expect(liveProvider.sent).toHaveLength(0);
  });
});
