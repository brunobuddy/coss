import { describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { listPushNotifications } from "@coss/push";
import {
  addMember,
  createTestTenant,
  createTestUser,
  type TestTenant,
} from "@coss/tenancy/testing";
import { eq } from "drizzle-orm";
import type { CheckResult, ReputationCheck } from "../src/checks.ts";
import { runDueReputationEvaluations, WARNING_RECHECK_MS } from "../src/evaluate.ts";
import {
  listReputationNotifications,
  MAX_NOTIFICATION_AGE_MS,
  MAX_NOTIFICATION_ATTEMPTS,
  NOTIFICATION_LEASE_MS,
  type ReputationNotice,
  type ReputationNotifier,
  renderNotification,
  runDueReputationNotifications,
} from "../src/notifications.ts";
import type { CheckSeverity } from "../src/schemas.ts";
import { markReputationDue } from "../src/standing.ts";
import { reinstateOrganization, suspendOrganization } from "../src/transitions.ts";

const DASHBOARD = "https://dashboard.test";
const scopeOf = (tenant: TestTenant) => ({ organizationIds: [tenant.organization.id] });

/** Records notices; `fail` makes the next sends to these addresses throw. */
function recordingNotifier() {
  const sent: ReputationNotice[] = [];
  const failFor = new Set<string>();
  const notifier: ReputationNotifier = {
    async send(notice) {
      if (failFor.has(notice.to)) throw new Error(`mailbox of ${notice.to} unavailable`);
      sent.push(notice);
    },
  };
  return { sent, failFor, deps: { notifier, dashboardUrl: DASHBOARD } };
}

function bounceCheck(state: { severity: CheckSeverity }): ReputationCheck {
  return {
    trigger: "bounce_rate",
    async evaluate(): Promise<CheckResult> {
      return {
        trigger: "bounce_rate",
        severity: state.severity,
        message: `Bounce rate 10.00% (${state.severity}).`,
        rate: 0.1,
        count: 10,
        volume: 100,
        warningThreshold: 0.04,
        suspendThreshold: 0.08,
        minimumVolume: 1,
      };
    },
  };
}

async function evaluate(tenant: TestTenant, severity: CheckSeverity, now: Date) {
  await markReputationDue(db, tenant.organization.id, now);
  const deps = { checks: [bounceCheck({ severity })] };
  expect(await runDueReputationEvaluations({ now, scope: scopeOf(tenant) }, deps)).toBe(1);
}

describe("reputation notifications", () => {
  test("a warning emails owners and admins with a verified address", async () => {
    const tenant = await createTestTenant();
    const orgId = tenant.organization.id;
    const admin = await createTestUser();
    const unverifiedAdmin = await createTestUser({ emailVerified: false });
    const member = await createTestUser();
    await addMember({ organizationId: orgId, userId: admin.id, role: "admin" });
    await addMember({ organizationId: orgId, userId: unverifiedAdmin.id, role: "admin" });
    await addMember({ organizationId: orgId, userId: member.id, role: "member" });
    const now = new Date();
    await evaluate(tenant, "warning", now);

    const [pending] = await listReputationNotifications(orgId);
    expect(pending).toMatchObject({ type: "warning_raised", status: "pending", attemptCount: 0 });

    const { sent, deps } = recordingNotifier();
    expect(await runDueReputationNotifications({ now, scope: scopeOf(tenant) }, deps)).toBe(1);
    expect(sent.map((notice) => notice.to)).toEqual([tenant.owner.email, admin.email]);
    const [notice] = sent;
    expect(notice?.subject).toBe(
      `Your sending reputation needs attention (${tenant.organization.name})`,
    );
    expect(notice?.text).toContain("Bounce rate 10.00% (warning).");
    expect(notice?.text).toContain(
      `${DASHBOARD}/${tenant.organization.slug}?to=%2Femail%2Freputation`,
    );
    expect(notice?.html).toContain(
      `href="${DASHBOARD}/${tenant.organization.slug}?to=%2Femail%2Freputation"`,
    );
    // Stable per notification and recipient, so a retried send replays.
    expect(new Set(sent.map((n) => n.idempotencyKey)).size).toBe(2);
    expect(notice?.idempotencyKey).toStartWith(`${pending?.id}:`);

    const [settled] = await listReputationNotifications(orgId);
    expect(settled).toMatchObject({
      status: "sent",
      attemptCount: 1,
      nextAttemptAt: null,
      sentAt: now,
      recipients: [tenant.owner.email, admin.email],
    });
    // Settled notifications are never sent again.
    expect(await runDueReputationNotifications({ now, scope: scopeOf(tenant) }, deps)).toBe(0);
    expect(sent).toHaveLength(2);
  });

  test("matches exact role tokens in combined roles", async () => {
    const tenant = await createTestTenant();
    await db
      .update(schema.member)
      .set({ role: "admin,owner" })
      .where(eq(schema.member.organizationId, tenant.organization.id));
    const admin = await createTestUser();
    await addMember({ organizationId: tenant.organization.id, userId: admin.id, role: "member" });
    await db
      .update(schema.member)
      .set({ role: "member,admin" })
      .where(eq(schema.member.userId, admin.id));
    for (const role of ["superadmin", "ownerish", "member, admin"]) {
      const user = await createTestUser();
      await addMember({ organizationId: tenant.organization.id, userId: user.id, role: "member" });
      await db.update(schema.member).set({ role }).where(eq(schema.member.userId, user.id));
    }
    const now = new Date();
    await evaluate(tenant, "warning", now);
    const { sent, deps } = recordingNotifier();
    await runDueReputationNotifications({ now, scope: scopeOf(tenant) }, deps);
    expect(sent.map((notice) => notice.to)).toEqual([tenant.owner.email, admin.email]);
  });

  test("only the current standing is announced: a warning overtaken by a suspension is skipped", async () => {
    const tenant = await createTestTenant();
    const orgId = tenant.organization.id;
    const now = new Date();
    await evaluate(tenant, "warning", now);
    const later = new Date(now.getTime() + WARNING_RECHECK_MS);
    await evaluate(tenant, "suspend", later);

    const { sent, deps } = recordingNotifier();
    expect(await runDueReputationNotifications({ now: later, scope: scopeOf(tenant) }, deps)).toBe(
      2,
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: tenant.owner.email,
      subject: `Live sending is suspended for ${tenant.organization.name}`,
    });
    expect(sent[0]?.text).toContain("Reason: Bounce rate.");
    expect(sent[0]?.text).toContain("never lifted automatically");
    const [suspended, warning] = await listReputationNotifications(orgId);
    expect(suspended).toMatchObject({ type: "suspended", status: "sent" });
    expect(warning).toMatchObject({
      type: "warning_raised",
      status: "skipped",
      lastError: "Superseded by a later standing change.",
    });
  });

  test("admin suspensions notify; recoveries and reinstatements don't", async () => {
    const tenant = await createTestTenant();
    const orgId = tenant.organization.id;
    const now = new Date();
    await suspendOrganization({
      organizationId: orgId,
      trigger: "manual",
      actor: { kind: "system" },
      now,
    });
    const { sent, deps } = recordingNotifier();
    await runDueReputationNotifications({ now, scope: scopeOf(tenant) }, deps);
    expect(sent[0]?.text).toContain("Reason: coss.com review.");

    await reinstateOrganization({
      organizationId: orgId,
      adminUserId: tenant.owner.id,
      note: "resolved",
      now: new Date(now.getTime() + 1000),
    });
    const notifications = await listReputationNotifications(orgId);
    expect(notifications.map((row) => row.type)).toEqual(["suspended"]);
    const pushes = await listPushNotifications(orgId);
    expect(pushes.map((row) => `${row.kind}:${row.subjectId}`)).toEqual([
      `reputation_suspended:${notifications[0]?.reputationEventId}`,
    ]);
  });

  test("is skipped when nobody can receive it", async () => {
    const tenant = await createTestTenant({ emailVerified: false });
    const now = new Date();
    await suspendOrganization({
      organizationId: tenant.organization.id,
      trigger: "manual",
      actor: { kind: "system" },
      now,
    });
    const { sent, deps } = recordingNotifier();
    expect(await runDueReputationNotifications({ now, scope: scopeOf(tenant) }, deps)).toBe(1);
    expect(sent).toHaveLength(0);
    const [row] = await listReputationNotifications(tenant.organization.id);
    expect(row).toMatchObject({
      status: "skipped",
      lastError: "No owner or admin with a verified email address.",
    });
  });

  test("is skipped when it is too old to be useful", async () => {
    const tenant = await createTestTenant();
    const now = new Date();
    await suspendOrganization({
      organizationId: tenant.organization.id,
      trigger: "manual",
      actor: { kind: "system" },
      now,
    });
    const { sent, deps } = recordingNotifier();
    const late = new Date(now.getTime() + MAX_NOTIFICATION_AGE_MS + 1);
    expect(await runDueReputationNotifications({ now: late, scope: scopeOf(tenant) }, deps)).toBe(
      1,
    );
    expect(sent).toHaveLength(0);
    const [row] = await listReputationNotifications(tenant.organization.id);
    expect(row).toMatchObject({ status: "skipped", lastError: "Too old to send." });
  });

  test("failures are retried with backoff (same idempotency keys), then given up", async () => {
    const tenant = await createTestTenant();
    const orgId = tenant.organization.id;
    const admin = await createTestUser();
    await addMember({ organizationId: orgId, userId: admin.id, role: "admin" });
    const now = new Date();
    await suspendOrganization({
      organizationId: orgId,
      trigger: "manual",
      actor: { kind: "system" },
      now,
    });

    const { sent, failFor, deps } = recordingNotifier();
    failFor.add(admin.email);
    expect(await runDueReputationNotifications({ now, scope: scopeOf(tenant) }, deps)).toBe(1);
    let [row] = await listReputationNotifications(orgId);
    expect(row).toMatchObject({
      status: "pending",
      attemptCount: 1,
      nextAttemptAt: new Date(now.getTime() + 60_000),
      lastError: `mailbox of ${admin.email} unavailable`,
    });
    // Not due before its backoff.
    expect(await runDueReputationNotifications({ now, scope: scopeOf(tenant) }, deps)).toBe(0);

    failFor.clear();
    const retry = new Date(now.getTime() + 60_000);
    expect(await runDueReputationNotifications({ now: retry, scope: scopeOf(tenant) }, deps)).toBe(
      1,
    );
    // The owner's notice went out on both attempts with the same key: the sender replays it.
    expect(sent.map((notice) => notice.to)).toEqual([
      tenant.owner.email,
      tenant.owner.email,
      admin.email,
    ]);
    expect(sent[0]?.idempotencyKey).toBe(sent[1]?.idempotencyKey ?? "");
    [row] = await listReputationNotifications(orgId);
    expect(row).toMatchObject({ status: "sent", attemptCount: 2, lastError: null });

    // A notification that keeps failing is given up.
    const other = await createTestTenant();
    await suspendOrganization({
      organizationId: other.organization.id,
      trigger: "manual",
      actor: { kind: "system" },
      now,
    });
    failFor.add(other.owner.email);
    let at = now;
    for (let attempt = 1; attempt <= MAX_NOTIFICATION_ATTEMPTS; attempt++) {
      expect(await runDueReputationNotifications({ now: at, scope: scopeOf(other) }, deps)).toBe(1);
      at = new Date(at.getTime() + 60 * 60_000);
    }
    const [failed] = await listReputationNotifications(other.organization.id);
    expect(failed).toMatchObject({
      status: "failed",
      attemptCount: MAX_NOTIFICATION_ATTEMPTS,
      nextAttemptAt: null,
    });
    expect(await runDueReputationNotifications({ now: at, scope: scopeOf(other) }, deps)).toBe(0);
  });

  test("concurrent workers send once; a crashed claim is retried after its lease", async () => {
    const tenant = await createTestTenant();
    const now = new Date();
    await suspendOrganization({
      organizationId: tenant.organization.id,
      trigger: "manual",
      actor: { kind: "system" },
      now,
    });
    const { sent, deps } = recordingNotifier();
    const runs = await Promise.all(
      [1, 2, 3].map(() => runDueReputationNotifications({ now, scope: scopeOf(tenant) }, deps)),
    );
    expect(runs.reduce((a, b) => a + b, 0)).toBe(1);
    expect(sent).toHaveLength(1);

    // A worker that claimed and died: the lease expires and another worker sends it.
    const other = await createTestTenant();
    await suspendOrganization({
      organizationId: other.organization.id,
      trigger: "manual",
      actor: { kind: "system" },
      now,
    });
    await db
      .update(schema.reputationNotification)
      .set({ attemptCount: 1, nextAttemptAt: new Date(now.getTime() + NOTIFICATION_LEASE_MS) })
      .where(eq(schema.reputationNotification.organizationId, other.organization.id));
    expect(await runDueReputationNotifications({ now, scope: scopeOf(other) }, deps)).toBe(0);
    const afterLease = new Date(now.getTime() + NOTIFICATION_LEASE_MS);
    expect(
      await runDueReputationNotifications({ now: afterLease, scope: scopeOf(other) }, deps),
    ).toBe(1);
    expect(sent.map((notice) => notice.to)).toEqual([tenant.owner.email, other.owner.email]);
  });
});

describe("renderNotification", () => {
  test("escapes HTML and explains content screening warnings", () => {
    const message = renderNotification({
      type: "warning",
      organizationName: `<b>Acme</b> & "Co"`,
      trigger: "content_screening",
      checks: ["2 messages look like spam or phishing to content screening."],
      url: "https://coss.com/acme/reputation?a=1&b=2",
    });
    expect(message.text).toContain(
      `Content screening flagged some of <b>Acme</b> & "Co"'s recent emails as possible spam or phishing.`,
    );
    expect(message.html).not.toContain("<b>Acme</b>");
    expect(message.html).toContain("&lt;b&gt;Acme&lt;/b&gt; &amp; &quot;Co&quot;");
    expect(message.html).toContain('href="https://coss.com/acme/reputation?a=1&amp;b=2"');
    expect(message.html).toMatch(/<li[^>]*>2 messages look like spam or phishing/);
  });
});
