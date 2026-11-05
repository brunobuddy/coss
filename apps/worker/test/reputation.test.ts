/**
 * End to end in live mode: simulator bounces mark the organization due, the reputation job
 * suspends it on its own, live sends are refused, the organization's live endpoint receives
 * a signed `account.suspended` the published SDK verifies, and its owner gets an email sent through
 * coss.com's own organization.
 */
import { describe, expect, test } from "bun:test";
import {
  EmailError,
  emailNotifier,
  emailReputationChecks,
  FakeEmailProvider,
  notificationEnvironment,
} from "@coss/email";
import { createVerifiedDomain, dispatchingEmailService } from "@coss/email/testing";
import {
  runDueReputationEvaluations,
  runDueReputationNotifications,
  updateReputationPolicy,
} from "@coss/reputation";
import { createTestTenant } from "@coss/tenancy/testing";
import { LATEST_API_VERSION } from "@coss/versioning";
import { createWebhookEndpoint, runDueWebhookDeliveries } from "@coss/webhooks";
import {
  TEST_SECRETS_KEYS,
  testManagementDeps,
  testSender,
  webhookReceiver,
} from "@coss/webhooks/testing";
import { verifyWebhook } from "coss";

describe("live bounces → automatic suspension → webhook", () => {
  test("suspends without human intervention and tells the customer", async () => {
    const tenant = await createTestTenant();
    const organizationId = tenant.organization.id;
    const scope = { organizationIds: [organizationId] };
    const receiver = webhookReceiver();
    try {
      const { secret } = await createWebhookEndpoint(
        {
          organizationId,
          environmentId: tenant.production.id,
          url: receiver.url,
          eventTypes: ["account.suspended"],
          apiVersion: LATEST_API_VERSION,
          userId: null,
        },
        testManagementDeps,
      );
      // Simulator addresses only count with the testing override; two recipients are enough.
      await updateReputationPolicy({
        organizationId,
        overrides: { countSimulatorRecipients: true, bounceRate: { minimumRecipients: 2 } },
        adminUserId: tenant.owner.id,
      });
      const domain = await createVerifiedDomain(organizationId);
      const provider = new FakeEmailProvider({ log: false });
      const service = dispatchingEmailService({
        liveProvider: provider,
        sandboxProvider: provider,
      });
      const send = () =>
        service.send({
          environment: {
            organizationId,
            projectId: tenant.project.id,
            environmentId: tenant.production.id,
            mode: "live",
          },
          apiKeyId: null,
          params: {
            from: `Acme <hello@${domain.name}>`,
            to: ["bounce@simulator.amazonses.com", "success@simulator.amazonses.com"],
            cc: [],
            bcc: [],
            reply_to: [],
            subject: "Spam",
            html: null,
            text: "Hi",
            headers: {},
            tags: [],
          },
        });
      await send();

      const now = new Date(Date.now() + 1000);
      expect(
        await runDueReputationEvaluations({ now, scope }, { checks: emailReputationChecks }),
      ).toBe(1);
      await expect(send()).rejects.toBeInstanceOf(EmailError);

      expect(
        await runDueWebhookDeliveries(
          { now, scope },
          { secretsKeys: TEST_SECRETS_KEYS, send: testSender() },
        ),
      ).toBe(1);
      const [request] = receiver.received;
      if (!request) throw new Error("nothing received");
      const event = await verifyWebhook(request.body, request.headers, secret);
      expect(event).toMatchObject({
        type: "account.suspended",
        data: {
          organization_id: organizationId,
          status: "suspended",
          previous_status: "good",
          reason: "bounce_rate",
          checks: [
            { trigger: "bounce_rate", severity: "suspend", rate: 0.5, count: 1, volume: 2 },
            { trigger: "complaint_rate", severity: "ok" },
            { trigger: "marketing_bounce_rate", severity: "ok", volume: 0 },
            { trigger: "marketing_complaint_rate", severity: "ok", volume: 0 },
          ],
          marketing: { status: "active", reason: null, paused_at: null },
        },
      });

      // The notification goes out as a live email of coss.com's own organization.
      const platform = await createTestTenant();
      const platformDomain = await createVerifiedDomain(platform.organization.id);
      const notifier = emailNotifier({
        service,
        environment: await notificationEnvironment(platform.production.id),
        from: `coss.com <notifications@${platformDomain.name}>`,
      });
      expect(
        await runDueReputationNotifications(
          { now, scope },
          { notifier, dashboardUrl: "https://coss.test" },
        ),
      ).toBe(1);
      const notice = provider.sent.find(
        (message) => message.organizationId === platform.organization.id,
      );
      expect(notice).toMatchObject({
        to: [tenant.owner.email],
        subject: `Live sending is suspended for ${tenant.organization.name}`,
      });
      expect(notice?.text).toContain(
        `https://coss.test/${tenant.organization.slug}?to=${encodeURIComponent("/email/reputation")}`,
      );
    } finally {
      receiver.stop();
    }
  });
});
