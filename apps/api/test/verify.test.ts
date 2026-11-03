import { describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { EmailError, listEmailSummariesPage } from "@coss/email";
import { createVerifiedDomain } from "@coss/email/testing";
import { createTestSmsNumber } from "@coss/sms/testing";
import { createTestTenant } from "@coss/tenancy/testing";
import { updateVerifySettings } from "@coss/verify";
import { codeIn } from "@coss/verify/testing";
import { verifyEmailSender } from "../src/verify-email.ts";
import { apiRequest, createTestApp, errorOf } from "./helpers.ts";

/** A random US number (the fraud guard counts number prefixes). */
function testMobile(): string {
  return `+1415${200 + Math.floor(Math.random() * 800)}${String(Math.floor(Math.random() * 10_000)).padStart(4, "0")}`;
}

describe("Verify over the API", () => {
  test("sandbox: start, a wrong code, the right one, then read it back", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const started = await apiRequest(app, "POST", "/v1/verifications", {
      key: tenant.sandboxKey,
      body: { to: "+15005550006", ip: "203.0.113.7", user_id: "user_42" },
    });
    expect(started.status).toBe(201);
    const verification = await started.json();
    expect(verification).toMatchObject({
      object: "verification",
      channel: "sms",
      status: "pending",
      sandbox: true,
      sends: [{ channel: "sms", route: "shared_number" }],
    });

    const wrong = await apiRequest(app, "POST", "/v1/verifications/check", {
      key: tenant.sandboxKey,
      body: { to: "+15005550006", code: "123456" },
    });
    expect(wrong.status).toBe(200);
    expect(await wrong.json()).toMatchObject({
      object: "verification_check",
      valid: false,
      verification: { attempts: 1 },
    });
    const right = await apiRequest(app, "POST", "/v1/verifications/check", {
      key: tenant.sandboxKey,
      body: { verification_id: verification.id, code: "000000" },
    });
    expect(await right.json()).toMatchObject({ valid: true, verification: { status: "approved" } });

    const read = await apiRequest(app, "GET", `/v1/verifications/${verification.id}`, {
      key: tenant.sandboxKey,
    });
    expect((await read.json()).status).toBe("approved");
    const list = await apiRequest(app, "GET", "/v1/verifications?status=approved", {
      key: tenant.sandboxKey,
    });
    expect((await list.json()).data.map((item: { id: string }) => item.id)).toEqual([
      verification.id,
    ]);
    // Another environment's key can't see it.
    const other = await apiRequest(app, "GET", `/v1/verifications/${verification.id}`, {
      key: tenant.liveKey,
    });
    expect(other.status).toBe(404);
    const cancel = await apiRequest(app, "POST", `/v1/verifications/${verification.id}/cancel`, {
      key: tenant.sandboxKey,
    });
    expect(cancel.status).toBe(422);
    expect((await errorOf(cancel)).code).toBe("verification_not_cancelable");
  });

  test("an idempotent start replays; a pending one is resent at most five times", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const body = { to: "ada@example.com" };
    const first = await apiRequest(app, "POST", "/v1/verifications", {
      key: tenant.sandboxKey,
      body,
      headers: { "Idempotency-Key": "verify-1" },
    });
    const replay = await apiRequest(app, "POST", "/v1/verifications", {
      key: tenant.sandboxKey,
      body,
      headers: { "Idempotency-Key": "verify-1" },
    });
    expect(replay.headers.get("Idempotent-Replayed")).toBe("true");
    expect((await replay.json()).id).toBe((await first.json()).id);
    for (let send = 2; send <= 5; send++) {
      const again = await apiRequest(app, "POST", "/v1/verifications", {
        key: tenant.sandboxKey,
        body,
      });
      expect((await again.json()).sends).toHaveLength(send);
    }
    const sixth = await apiRequest(app, "POST", "/v1/verifications", {
      key: tenant.sandboxKey,
      body,
    });
    expect(sixth.status).toBe(422);
    expect((await errorOf(sixth)).code).toBe("too_many_sends");
  });

  test("the fraud guard's block is a 422 and the verification is stored", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const response = await apiRequest(app, "POST", "/v1/verifications", {
      key: tenant.sandboxKey,
      body: { to: "+19005551234" },
    });
    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("verification_blocked");
    const list = await apiRequest(app, "GET", "/v1/verifications?status=blocked", {
      key: tenant.sandboxKey,
    });
    expect((await list.json()).data[0]).toMatchObject({
      status: "blocked",
      reasons: [{ code: "phone.premium_rate" }],
    });
  });

  test("live SMS: the environment's own number, or coss.com's shared ones", async () => {
    const tenant = await createTestTenant();
    // Without shared numbers or a number of its own: 503.
    const plain = createTestApp();
    const unavailable = await apiRequest(plain.app, "POST", "/v1/verifications", {
      key: tenant.liveKey,
      body: { to: testMobile() },
    });
    expect(unavailable.status).toBe(503);
    expect((await errorOf(unavailable)).code).toBe("shared_sender_unavailable");

    const coss = await createTestTenant();
    const shared = await createTestSmsNumber(coss.organization.id);
    const { app, dispatchSms, smsProvider } = createTestApp({
      verify: {
        sharedSms: {
          environment: {
            organizationId: coss.organization.id,
            projectId: coss.project.id,
            environmentId: coss.production.id,
            mode: "live",
          },
          numbers: [shared.phoneNumber],
        },
      },
    });
    const to = testMobile();
    const started = await apiRequest(app, "POST", "/v1/verifications", {
      key: tenant.liveKey,
      body: { to },
    });
    expect(started.status).toBe(201);
    const verification = await started.json();
    expect(verification.sends[0]).toMatchObject({ route: "shared_number", sms_id: null });
    await dispatchSms();
    const sms = smsProvider.sent.findLast((sent) => sent.to === to);
    expect(sms?.from).toBe(shared.phoneNumber);
    const check = await apiRequest(app, "POST", "/v1/verifications/check", {
      key: tenant.liveKey,
      body: { to, code: codeIn(sms?.body ?? "") },
    });
    expect((await check.json()).valid).toBe(true);

    // Its own number from now on.
    const own = await createTestSmsNumber(tenant.organization.id);
    await updateVerifySettings(
      { organizationId: tenant.organization.id, environmentId: tenant.production.id },
      { sms_from: own.phoneNumber },
    );
    const second = await apiRequest(app, "POST", "/v1/verifications", {
      key: tenant.liveKey,
      body: { to: testMobile() },
    });
    expect((await second.json()).sends[0]).toMatchObject({ route: "own_number" });
  });

  test("live email: the environment's sender, else coss.com's", async () => {
    const tenant = await createTestTenant();
    const coss = await createTestTenant();
    const cossDomain = await createVerifiedDomain(coss.organization.id);
    const { app } = createTestApp({
      verify: {
        cossEmail: {
          environment: {
            organizationId: coss.organization.id,
            projectId: coss.project.id,
            environmentId: coss.production.id,
            mode: "live",
          },
          address: `notifications@${cossDomain.name}`,
        },
      },
    });
    const viaCoss = await apiRequest(app, "POST", "/v1/verifications", {
      key: tenant.liveKey,
      body: { to: "grace@example.com" },
    });
    expect(viaCoss.status).toBe(201);
    expect((await viaCoss.json()).sends[0]).toMatchObject({ route: "coss_email" });
    const { data } = await listEmailSummariesPage({
      organizationId: coss.organization.id,
      environmentId: coss.production.id,
    });
    const [sent] = data;
    expect(sent?.from).toBe(
      `"${tenant.project.name} via coss.com" <notifications@${cossDomain.name}>`,
    );

    const domain = await createVerifiedDomain(tenant.organization.id);
    await updateVerifySettings(
      { organizationId: tenant.organization.id, environmentId: tenant.production.id },
      { email_from: `codes@${domain.name}` },
    );
    const own = await apiRequest(app, "POST", "/v1/verifications", {
      key: tenant.liveKey,
      body: { to: "lin@example.com" },
    });
    expect((await own.json()).sends[0]).toMatchObject({ route: "email" });
  });

  test("a suppressed email address fails at once instead of looking sent", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const suppressed = await apiRequest(app, "POST", "/v1/suppressions", {
      key: tenant.sandboxKey,
      body: { address: "bounced@example.com" },
    });
    expect(suppressed.status).toBe(201);
    const response = await apiRequest(app, "POST", "/v1/verifications", {
      key: tenant.sandboxKey,
      body: { to: "bounced@example.com" },
    });
    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("recipient_suppressed");
    const list = await apiRequest(app, "GET", "/v1/verifications?status=failed", {
      key: tenant.sandboxKey,
    });
    expect((await list.json()).data[0]).toMatchObject({
      to: "bounced@example.com",
      failure: { code: "recipient_suppressed" },
      sends: [],
    });
  });

  test("the environment's own suppression list counts with coss.com's sender too", async () => {
    const tenant = await createTestTenant();
    const coss = await createTestTenant();
    const cossDomain = await createVerifiedDomain(coss.organization.id);
    const { app } = createTestApp({
      verify: {
        cossEmail: {
          environment: {
            organizationId: coss.organization.id,
            projectId: coss.project.id,
            environmentId: coss.production.id,
            mode: "live",
          },
          address: `notifications@${cossDomain.name}`,
        },
      },
    });
    await apiRequest(app, "POST", "/v1/suppressions", {
      key: tenant.liveKey,
      body: { address: "complained@example.com" },
    });
    const response = await apiRequest(app, "POST", "/v1/verifications", {
      key: tenant.liveKey,
      body: { to: "complained@example.com" },
    });
    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("recipient_suppressed");
  });

  test("a billing hold is a 402", async () => {
    const tenant = await createTestTenant();
    await db
      .insert(schema.billingHold)
      .values({ organizationId: tenant.organization.id, reason: "admin" });
    const { app } = createTestApp();
    const response = await apiRequest(app, "POST", "/v1/verifications", {
      key: tenant.liveKey,
      body: { to: "pat@example.com" },
    });
    expect(response.status).toBe(402);
    expect(await errorOf(response)).toMatchObject({ type: "billing_error", code: "billing_hold" });
  });

  test("the email sender finds an email its key already made, whatever changed since", async () => {
    const tenant = await createTestTenant();
    const { emailService } = createTestApp();
    const sender = verifyEmailSender({ service: emailService, coss: null });
    const input = {
      environment: {
        organizationId: tenant.organization.id,
        projectId: tenant.project.id,
        environmentId: tenant.development.id,
        mode: "sandbox" as const,
      },
      apiKeyId: null,
      apiKeyOwnerId: null,
      from: null,
      appName: "Acme",
      to: "kai@example.com",
      subject: "Your Acme verification code",
      text: "Your code is 000000",
      html: "<p>000000</p>",
      cossHtml: "<p>000000</p>",
      idempotencyKey: "vrf_x:send:1",
    };
    const first = await sender(input);
    const again = await sender({ ...input, appName: "Acme Inc", subject: "Your Acme Inc code" });
    expect(again).toEqual(first);
  });

  test("a retried email send finds its email in coss.com's environment after the sender changed", async () => {
    const tenant = await createTestTenant();
    const coss = await createTestTenant();
    const cossDomain = await createVerifiedDomain(coss.organization.id);
    const ownDomain = await createVerifiedDomain(tenant.organization.id);
    const { emailService } = createTestApp();
    const sender = verifyEmailSender({
      service: emailService,
      coss: {
        environment: {
          organizationId: coss.organization.id,
          projectId: coss.project.id,
          environmentId: coss.production.id,
          mode: "live",
        },
        address: `notifications@${cossDomain.name}`,
      },
    });
    const input = {
      environment: {
        organizationId: tenant.organization.id,
        projectId: tenant.project.id,
        environmentId: tenant.production.id,
        mode: "live" as const,
      },
      apiKeyId: null,
      apiKeyOwnerId: null,
      from: null,
      appName: "Acme",
      to: "rio@example.com",
      subject: "Your Acme verification code",
      text: "Your code is 123456",
      html: "<p>123456</p>",
      cossHtml: "<p>123456</p>",
      idempotencyKey: "vrf_y:send:1",
    };
    const first = await sender(input);
    expect(first.route).toBe("coss_email");
    // The environment set its own sender since: the retry must not send a second email.
    const again = await sender({ ...input, from: `codes@${ownDomain.name}` });
    expect(again).toEqual(first);
  });

  test("coss.com's address never sends the copy with the customer's name on top", async () => {
    const tenant = await createTestTenant();
    const coss = await createTestTenant();
    const sent: { environmentId: string; html: string | undefined }[] = [];
    const sender = verifyEmailSender({
      service: {
        async send(input) {
          sent.push({
            environmentId: input.environment.environmentId,
            html: input.params.html ?? undefined,
          });
          if (input.environment.environmentId === tenant.production.id) {
            throw new EmailError("domain_not_verified", "Not verified.");
          }
          return { email: { id: "email_x", status: "queued", failure: null } } as never;
        },
      },
      coss: {
        environment: {
          organizationId: coss.organization.id,
          projectId: coss.project.id,
          environmentId: coss.production.id,
          mode: "live",
        },
        address: "notifications@coss.test",
      },
    });
    const result = await sender({
      environment: {
        organizationId: tenant.organization.id,
        projectId: tenant.project.id,
        environmentId: tenant.production.id,
        mode: "live",
      },
      apiKeyId: null,
      apiKeyOwnerId: null,
      from: "codes@acme.test",
      appName: "Acme",
      to: `fallback-${crypto.randomUUID()}@example.com`,
      subject: "Your Acme verification code",
      text: "Your code is 123456",
      html: "<p>branded</p>",
      cossHtml: "<p>coss</p>",
      idempotencyKey: `vrf_${crypto.randomUUID()}:send:1`,
    });
    expect(result.route).toBe("coss_email");
    expect(sent).toEqual([
      { environmentId: tenant.production.id, html: "<p>branded</p>" },
      { environmentId: coss.production.id, html: "<p>coss</p>" },
    ]);
  });

  test("a check names a verification or a destination", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const response = await apiRequest(app, "POST", "/v1/verifications/check", {
      key: tenant.sandboxKey,
      body: { code: "123456" },
    });
    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("validation_error");
  });
});
