import { describe, expect, test } from "bun:test";
import { auth } from "@coss/auth";
import {
  codeChallengeFor,
  createMobileAuthorizationCode,
  exchangeMobileAuthorizationCode,
  mobileSessionHeaders,
  revokeMobileSession,
} from "@coss/auth/mobile";
import { enableTestHipaaMode } from "@coss/compliance/testing";
import { db, schema } from "@coss/db";
import { newId } from "@coss/db/id";
import { uniqueSuffix } from "@coss/db/testing";
import {
  addMember,
  createTestTenant,
  createTestUser,
  type TestTenant,
} from "@coss/tenancy/testing";
import { and, eq, sql } from "drizzle-orm";
import {
  enqueuePush,
  getPushDevice,
  listPushNotifications,
  MAX_PUSH_AGE_MS,
  MAX_PUSH_ATTEMPTS,
  PUSH_LEASE_MS,
  PUSH_THROTTLE_MS,
  purgeExpiredPushNotifications,
  registerPushDevice,
  runDuePushNotifications,
  updatePushCategories,
} from "../src/index.ts";
import { createTestPushDevice, FakePushSender, randomToken } from "../src/testing.ts";

const MINUTE = 60 * 1000;
const scopeOf = (tenant: TestTenant) => ({ organizationIds: [tenant.organization.id] });

async function disabledEndpoint(tenant: TestTenant, description: string | null = "Orders") {
  const [row] = await db
    .insert(schema.webhookEndpoint)
    .values({
      organizationId: tenant.organization.id,
      projectId: tenant.project.id,
      environmentId: tenant.production.id,
      url: "https://hooks.example.com/coss",
      description,
      apiVersion: "2026-01-01",
      secretCiphertext: "v2:test",
      enabled: false,
      disabledReason: "failing",
      disabledAt: new Date(),
    })
    .returning();
  if (!row) throw new Error("no endpoint");
  return row;
}

describe("HIPAA mode", () => {
  test("nothing is queued, so no name passes through Apple", async () => {
    const tenant = await createTestTenant();
    await enableTestHipaaMode(tenant.organization.id);
    await enqueueEndpointDisabled(tenant, "ep_1");
    expect(await listPushNotifications(tenant.organization.id)).toEqual([]);
  });

  test("one queued as the mode was turned on is skipped, not sent", async () => {
    const tenant = await createTestTenant();
    await createTestPushDevice({ userId: tenant.owner.id });
    const endpoint = await disabledEndpoint(tenant);
    await enqueueEndpointDisabled(tenant, endpoint.id);
    await enableTestHipaaMode(tenant.organization.id);

    const sender = new FakePushSender();
    await runDuePushNotifications({ scope: scopeOf(tenant) }, { sender });

    expect(sender.sent).toEqual([]);
    const [row] = await listPushNotifications(tenant.organization.id);
    expect(row?.status).toBe("skipped");
    expect(row?.lastError).toBe("hipaa_mode");
  });
});

async function enqueueEndpointDisabled(tenant: TestTenant, endpointId: string, now = new Date()) {
  await enqueuePush(db, {
    organizationId: tenant.organization.id,
    environmentId: tenant.production.id,
    kind: "webhook_endpoint_disabled",
    subjectId: endpointId,
    now,
  });
}

async function openReview(tenant: TestTenant) {
  await db.insert(schema.riskAssessment).values({
    organizationId: tenant.organization.id,
    projectId: tenant.project.id,
    environmentId: tenant.production.id,
    event: "signup",
    decision: "review",
    score: 0.6,
    reviewStatus: "open",
  });
}

async function enqueueReview(tenant: TestTenant, now: Date) {
  await enqueuePush(db, {
    organizationId: tenant.organization.id,
    environmentId: tenant.production.id,
    kind: "risk_review",
    subjectId: tenant.production.id,
    collapseKey: `risk_review:${tenant.production.id}`,
    now,
  });
}

describe("devices", () => {
  test("registering the same token under another session moves it", async () => {
    const user = await createTestUser();
    const token = randomToken();
    const first = await createTestPushDevice({ userId: user.id, token });
    const second = await createTestPushDevice({ userId: user.id, token });
    expect(await getPushDevice(first.sessionId)).toBeNull();
    expect((await getPushDevice(second.sessionId))?.token).toBe(token);
  });

  test("a refresh keeps the chosen categories unless given", async () => {
    const user = await createTestUser();
    const { sessionId, device } = await createTestPushDevice({ userId: user.id });
    await updatePushCategories(sessionId, ["billing"]);
    const refreshed = await registerPushDevice({
      userId: user.id,
      sessionId,
      token: randomToken(),
      apnsEnvironment: "production",
    });
    expect(refreshed.id).toBe(device.id);
    expect(refreshed.categories).toEqual(["billing"]);
    expect(refreshed.apnsEnvironment).toBe("production");
  });

  test("signing out of the app deletes its registration", async () => {
    const user = await createTestUser();
    const verifier = `test-verifier-${uniqueSuffix()}-0123456789abcdefghijklmnopq`;
    const code = await createMobileAuthorizationCode({
      userId: user.id,
      codeChallenge: codeChallengeFor(verifier),
      ssoProviderId: null,
    });
    const signedIn = await exchangeMobileAuthorizationCode({
      code,
      codeVerifier: verifier,
      ipAddress: "203.0.113.7",
      userAgent: "COSS-iOS/test",
    });
    if (!signedIn) throw new Error("sign-in failed");
    const headers = await mobileSessionHeaders(signedIn.token, "COSS-iOS/test");
    const session = headers ? await auth.api.getSession({ headers }) : null;
    if (!session) throw new Error("no session");
    await registerPushDevice({
      userId: user.id,
      sessionId: session.session.id,
      token: randomToken(),
      apnsEnvironment: "production",
    });
    expect(await revokeMobileSession(signedIn.token)).toBe(true);
    expect(await getPushDevice(session.session.id)).toBeNull();
  });

  test("deleting the session deletes its registration", async () => {
    const user = await createTestUser();
    const { sessionId } = await createTestPushDevice({ userId: user.id });
    await db.delete(schema.session).where(eq(schema.session.id, sessionId));
    expect(await getPushDevice(sessionId)).toBeNull();
  });
});

describe("outbox", () => {
  test("pending notifications with the same collapse key coalesce", async () => {
    const tenant = await createTestTenant();
    const now = new Date();
    await enqueueReview(tenant, now);
    await enqueueReview(tenant, now);
    await enqueueReview(tenant, now);
    const rows = await listPushNotifications(tenant.organization.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(3);
  });
});

describe("sending", () => {
  test("sends to members who can act on it, with the current slugs", async () => {
    const tenant = await createTestTenant();
    const member = await createTestUser();
    await addMember({ organizationId: tenant.organization.id, userId: member.id, role: "member" });
    const owner = await createTestPushDevice({ userId: tenant.owner.id });
    await createTestPushDevice({ userId: member.id });
    const endpoint = await disabledEndpoint(tenant);
    await enqueueEndpointDisabled(tenant, endpoint.id);

    const sender = new FakePushSender();
    expect(await runDuePushNotifications({ scope: scopeOf(tenant) }, { sender })).toBe(1);

    expect(sender.sent.map((push) => push.target.deviceId)).toEqual([owner.device.id]);
    const message = sender.sent[0]?.message;
    expect(message?.title).toBe("Webhook endpoint disabled");
    expect(message?.body).toStartWith("A webhook endpoint in ");
    // Free-form text never goes through Apple.
    expect(message?.body).not.toContain("Orders");
    expect(message?.body).not.toContain("hooks.example.com");
    expect(message?.path).toBe(
      `/${tenant.organization.slug}/projects/${tenant.project.slug}/${tenant.production.slug}/webhooks/${endpoint.id}`,
    );
    const [row] = await listPushNotifications(tenant.organization.id);
    expect(row?.status).toBe("sent");
    expect(row?.deliveredDeviceIds).toEqual([owner.device.id]);
  });

  test("leaves out turned-off categories, expired, impersonated and banned sessions", async () => {
    const tenant = await createTestTenant();
    const admin = await createTestUser();
    await addMember({ organizationId: tenant.organization.id, userId: admin.id, role: "admin" });
    await createTestPushDevice({ userId: tenant.owner.id, categories: ["billing"] });
    await createTestPushDevice({ userId: tenant.owner.id, expiresAt: new Date(Date.now() - 1) });
    await createTestPushDevice({ userId: tenant.owner.id, impersonatedBy: tenant.owner.id });
    const banned = await createTestUser();
    await addMember({ organizationId: tenant.organization.id, userId: banned.id, role: "admin" });
    await db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, banned.id));
    await createTestPushDevice({ userId: banned.id });
    const kept = await createTestPushDevice({ userId: admin.id });
    const endpoint = await disabledEndpoint(tenant);
    await enqueueEndpointDisabled(tenant, endpoint.id);

    const sender = new FakePushSender();
    await runDuePushNotifications({ scope: scopeOf(tenant) }, { sender });
    expect(sender.sent.map((push) => push.target.deviceId)).toEqual([kept.device.id]);
  });

  test("follows the organization's SSO and two-factor requirements", async () => {
    const tenant = await createTestTenant();
    const providerId = `sso_${uniqueSuffix()}`;
    await db.insert(schema.ssoProvider).values({
      id: newId("ssop"),
      issuer: "https://idp.example.com",
      userId: tenant.owner.id,
      providerId,
      organizationId: tenant.organization.id,
      domain: "example.com",
    });
    await db
      .update(schema.organization)
      .set({ requireSso: true })
      .where(eq(schema.organization.id, tenant.organization.id));
    const admin = await createTestUser();
    await addMember({ organizationId: tenant.organization.id, userId: admin.id, role: "admin" });
    await createTestPushDevice({ userId: admin.id });
    const viaSso = await createTestPushDevice({ userId: admin.id, ssoProviderId: providerId });
    // Owners keep break-glass access.
    const owner = await createTestPushDevice({ userId: tenant.owner.id });
    const endpoint = await disabledEndpoint(tenant);
    await enqueueEndpointDisabled(tenant, endpoint.id);

    const sender = new FakePushSender();
    await runDuePushNotifications({ scope: scopeOf(tenant) }, { sender });
    expect(sender.sent.map((push) => push.target.deviceId).sort()).toEqual(
      [viaSso.device.id, owner.device.id].sort(),
    );

    const twoFactor = await createTestTenant();
    await db
      .update(schema.organization)
      .set({ requireTwoFactor: true })
      .where(eq(schema.organization.id, twoFactor.organization.id));
    await createTestPushDevice({ userId: twoFactor.owner.id });
    const second = await disabledEndpoint(twoFactor);
    await enqueueEndpointDisabled(twoFactor, second.id);
    const none = new FakePushSender();
    await runDuePushNotifications({ scope: scopeOf(twoFactor) }, { sender: none });
    expect(none.sent).toHaveLength(0);
    expect((await listPushNotifications(twoFactor.organization.id))[0]?.lastError).toBe(
      "no_recipients",
    );
  });

  test("skips what was resolved meanwhile, and stale notifications", async () => {
    const tenant = await createTestTenant();
    await createTestPushDevice({ userId: tenant.owner.id });
    const endpoint = await disabledEndpoint(tenant);
    await enqueueEndpointDisabled(tenant, endpoint.id);
    await db
      .update(schema.webhookEndpoint)
      .set({ enabled: true, disabledReason: null })
      .where(eq(schema.webhookEndpoint.id, endpoint.id));
    const other = await disabledEndpoint(tenant);
    const now = new Date();
    await enqueueEndpointDisabled(tenant, other.id, new Date(now.getTime() - MAX_PUSH_AGE_MS - 1));

    const sender = new FakePushSender();
    await runDuePushNotifications({ now, scope: scopeOf(tenant) }, { sender });
    expect(sender.sent).toHaveLength(0);
    const rows = await listPushNotifications(tenant.organization.id);
    expect(rows.map((row) => [row.status, row.lastError]).sort()).toEqual([
      ["skipped", "resolved"],
      ["skipped", "too_old"],
    ]);
  });

  test("retries never send twice to a device APNs accepted, and invalid tokens are dropped", async () => {
    const tenant = await createTestTenant();
    const good = await createTestPushDevice({ userId: tenant.owner.id });
    const flaky = await createTestPushDevice({ userId: tenant.owner.id });
    const gone = await createTestPushDevice({ userId: tenant.owner.id });
    const endpoint = await disabledEndpoint(tenant);
    const now = new Date();
    await enqueueEndpointDisabled(tenant, endpoint.id, now);

    const sender = new FakePushSender();
    sender.answer = (target) =>
      target.deviceId === flaky.device.id
        ? { status: "retry", reason: "TooManyRequests" }
        : target.deviceId === gone.device.id
          ? { status: "invalid_token", reason: "Unregistered" }
          : { status: "delivered" };
    await runDuePushNotifications({ now, scope: scopeOf(tenant) }, { sender });
    let [row] = await listPushNotifications(tenant.organization.id);
    expect(row?.status).toBe("pending");
    expect(row?.lastError).toBe("APNs: TooManyRequests");
    expect(row?.deliveredDeviceIds).toEqual([good.device.id]);
    expect(row?.nextAttemptAt?.getTime()).toBeGreaterThanOrEqual(now.getTime() + MINUTE);
    expect(row?.nextAttemptAt?.getTime()).toBeLessThan(now.getTime() + MINUTE + 5000);
    expect(await getPushDevice(gone.sessionId)).toBeNull();

    sender.answer = () => ({ status: "delivered" });
    await runDuePushNotifications(
      { now: new Date(now.getTime() + 2 * MINUTE), scope: scopeOf(tenant) },
      { sender },
    );
    expect(sender.sent.map((push) => push.target.deviceId)).toEqual([
      good.device.id,
      flaky.device.id,
    ]);
    [row] = await listPushNotifications(tenant.organization.id);
    expect(row?.status).toBe("sent");
  });

  test("a claim is a lease, and a notification fails after its last attempt", async () => {
    const tenant = await createTestTenant();
    await createTestPushDevice({ userId: tenant.owner.id });
    const endpoint = await disabledEndpoint(tenant);
    const now = new Date();
    await enqueueEndpointDisabled(tenant, endpoint.id, now);
    await db
      .update(schema.pushNotification)
      .set({ attemptCount: MAX_PUSH_ATTEMPTS - 1 })
      .where(eq(schema.pushNotification.organizationId, tenant.organization.id));

    const sender = new FakePushSender();
    sender.answer = () => ({ status: "retry", reason: "InternalServerError" });
    expect(await runDuePushNotifications({ now, scope: scopeOf(tenant) }, { sender })).toBe(1);
    const [row] = await listPushNotifications(tenant.organization.id);
    expect(row?.status).toBe("failed");
    expect(row?.nextAttemptAt).toBeNull();

    // Another worker can't claim one that is being sent.
    const other = await createTestTenant();
    const second = await disabledEndpoint(other);
    await enqueueEndpointDisabled(other, second.id, now);
    await db
      .update(schema.pushNotification)
      .set({ nextAttemptAt: new Date(now.getTime() + PUSH_LEASE_MS) })
      .where(eq(schema.pushNotification.organizationId, other.organization.id));
    expect(await runDuePushNotifications({ now, scope: scopeOf(other) }, { sender })).toBe(0);
  });

  test("risk reviews: one push per environment per interval, counting what is waiting", async () => {
    const tenant = await createTestTenant();
    await createTestPushDevice({ userId: tenant.owner.id });
    const now = new Date();
    await openReview(tenant);
    await enqueueReview(tenant, now);
    const sender = new FakePushSender();
    await runDuePushNotifications({ now, scope: scopeOf(tenant) }, { sender });
    expect(sender.sent[0]?.message.body).toStartWith("An assessment is waiting for review in ");
    expect(sender.sent[0]?.message.collapseId).toBe(`risk_review:${tenant.production.id}`);

    const later = new Date(now.getTime() + MINUTE);
    await openReview(tenant);
    await openReview(tenant);
    await enqueueReview(tenant, later);
    await enqueueReview(tenant, later);
    expect(await runDuePushNotifications({ now: later, scope: scopeOf(tenant) }, { sender })).toBe(
      0,
    );
    const [waiting] = await db
      .select()
      .from(schema.pushNotification)
      .where(
        and(
          eq(schema.pushNotification.organizationId, tenant.organization.id),
          eq(schema.pushNotification.status, "pending"),
        ),
      );
    const interval = PUSH_THROTTLE_MS.risk_review ?? 0;
    expect(waiting?.count).toBe(2);
    expect(waiting?.attemptCount).toBe(0);
    expect(waiting?.nextAttemptAt?.getTime()).toBeGreaterThanOrEqual(now.getTime() + interval);
    expect(waiting?.nextAttemptAt?.getTime()).toBeLessThan(now.getTime() + interval + 5000);

    await runDuePushNotifications(
      { now: new Date(now.getTime() + interval + 5000), scope: scopeOf(tenant) },
      { sender },
    );
    expect(sender.sent).toHaveLength(2);
    expect(sender.sent[1]?.message.body).toStartWith("3 assessments are waiting for review in ");
  });

  test("reputation and billing notifications check the state is still current", async () => {
    const tenant = await createTestTenant();
    await createTestPushDevice({ userId: tenant.owner.id });
    await db
      .insert(schema.reputationStanding)
      .values({ organizationId: tenant.organization.id, status: "suspended" });
    await enqueuePush(db, {
      organizationId: tenant.organization.id,
      kind: "reputation_suspended",
      subjectId: "repev_test",
    });
    await enqueuePush(db, {
      organizationId: tenant.organization.id,
      kind: "reputation_warning",
      subjectId: "repev_test",
    });
    await enqueuePush(db, {
      organizationId: tenant.organization.id,
      kind: "billing_hold_placed",
      subjectId: "delinquent",
    });
    const sender = new FakePushSender();
    await runDuePushNotifications({ scope: scopeOf(tenant) }, { sender });
    expect(sender.sent.map((push) => push.message.title)).toEqual(["Account suspended"]);
    expect(sender.sent[0]?.message.path).toBe(`/${tenant.organization.slug}/reputation`);
  });

  test("devices on a gateway the key doesn't serve are left out, not retried", async () => {
    const tenant = await createTestTenant();
    const production = await createTestPushDevice({ userId: tenant.owner.id });
    await db
      .update(schema.pushDevice)
      .set({ apnsEnvironment: "production" })
      .where(eq(schema.pushDevice.id, production.device.id));
    await createTestPushDevice({ userId: tenant.owner.id });
    const endpoint = await disabledEndpoint(tenant);
    await enqueueEndpointDisabled(tenant, endpoint.id);
    const sender = new FakePushSender();
    sender.environments = ["production"];
    await runDuePushNotifications({ scope: scopeOf(tenant) }, { sender });
    expect(sender.sent.map((push) => push.target.deviceId)).toEqual([production.device.id]);
    const [row] = await listPushNotifications(tenant.organization.id);
    expect(row?.status).toBe("sent");
  });

  test("a worker that lost its claim stops and writes nothing", async () => {
    const tenant = await createTestTenant();
    const first = await createTestPushDevice({ userId: tenant.owner.id });
    await createTestPushDevice({ userId: tenant.owner.id });
    // This test exercises lease fencing, not UUID order when registrations share a millisecond.
    await db
      .update(schema.pushDevice)
      .set({ createdAt: new Date(Date.now() - 1000) })
      .where(eq(schema.pushDevice.id, first.device.id));
    const endpoint = await disabledEndpoint(tenant);
    await enqueueEndpointDisabled(tenant, endpoint.id);
    const sender = new FakePushSender();
    sender.answer = () => ({ status: "delivered" });
    const send = sender.send.bind(sender);
    sender.send = async (target, message) => {
      const result = await send(target, message);
      // Meanwhile the lease expired and another worker claimed the notification.
      await db
        .update(schema.pushNotification)
        .set({ attemptCount: sql`${schema.pushNotification.attemptCount} + 1` })
        .where(eq(schema.pushNotification.organizationId, tenant.organization.id));
      return result;
    };
    await runDuePushNotifications({ scope: scopeOf(tenant) }, { sender });
    expect(sender.sent.map((push) => push.target.deviceId)).toEqual([first.device.id]);
    const [row] = await listPushNotifications(tenant.organization.id);
    expect(row?.status).toBe("pending");
    expect(row?.deliveredDeviceIds).toEqual([]);
  });

  test("an event that joins a notification while it is sent gets a notification of its own", async () => {
    const tenant = await createTestTenant();
    await createTestPushDevice({ userId: tenant.owner.id });
    const now = new Date();
    await openReview(tenant);
    await enqueueReview(tenant, now);
    const sender = new FakePushSender();
    const send = sender.send.bind(sender);
    let joined = false;
    sender.send = async (target, message) => {
      if (!joined) {
        joined = true;
        await openReview(tenant);
        await enqueueReview(tenant, now);
      }
      return send(target, message);
    };
    await runDuePushNotifications({ now, scope: scopeOf(tenant) }, { sender });
    const rows = await listPushNotifications(tenant.organization.id);
    expect(rows.map((row) => [row.status, row.count]).sort()).toEqual([
      ["pending", 1],
      ["sent", 2],
    ]);
  });

  test("concurrent sign-ins on one phone leave one registration", async () => {
    const user = await createTestUser();
    const token = randomToken();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => createTestPushDevice({ userId: user.id, token })),
    );
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    const rows = await db
      .select()
      .from(schema.pushDevice)
      .where(eq(schema.pushDevice.token, token));
    expect(rows).toHaveLength(1);
  });

  test("purges settled notifications past retention", async () => {
    const tenant = await createTestTenant();
    const endpoint = await disabledEndpoint(tenant);
    const old = new Date(Date.now() - 31 * 24 * 60 * MINUTE);
    await enqueueEndpointDisabled(tenant, endpoint.id, old);
    await enqueueEndpointDisabled(tenant, endpoint.id, old);
    await db
      .update(schema.pushNotification)
      .set({ status: "skipped", nextAttemptAt: null })
      .where(eq(schema.pushNotification.organizationId, tenant.organization.id));
    await enqueueEndpointDisabled(tenant, endpoint.id, old);
    expect(await purgeExpiredPushNotifications({ scope: scopeOf(tenant) })).toBe(2);
    expect(await listPushNotifications(tenant.organization.id)).toHaveLength(1);
  });
});
