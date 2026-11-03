import type { UsageGate } from "@coss/billing/gate";
import type { DomainDeps, EmailService, LinkKeyRing } from "@coss/email";
import type { InboundRuntime } from "@coss/email/runtime";
import type { FormFileStore } from "@coss/forms";
import type { RiskDeps } from "@coss/risk";
import type { SchedulingDeps } from "@coss/scheduling";
import type { SignService } from "@coss/sign";
import type { SmsService } from "@coss/sms";
import type { VerifyService } from "@coss/verify";
import type { WebhookManagementDeps } from "@coss/webhooks";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../types.ts";
import { createAudienceRoutes } from "./audiences.ts";
import { createAuditEventRoutes } from "./audit-events.ts";
import { createBillingRoutes } from "./billing.ts";
import { createBroadcastRoutes } from "./broadcasts.ts";
import { createContactRoutes } from "./contacts.ts";
import { createDedicatedIpRoutes } from "./dedicated-ips.ts";
import { createDomainRoutes } from "./domains.ts";
import { createEmailTemplateRoutes } from "./email-templates.ts";
import { createEmailRoutes } from "./emails.ts";
import { createEnvironmentRoutes } from "./environment.ts";
import { createFormRoutes } from "./forms.ts";
import { createHookRoutes } from "./hooks/index.ts";
import { createInboxRoutes } from "./inboxes.ts";
import { createLogDrainRoutes } from "./log-drains.ts";
import { createLogRoutes } from "./logs.ts";
import { createReceivedEmailRoutes } from "./received-emails.ts";
import { createReputationRoutes } from "./reputation.ts";
import { createRiskRoutes } from "./risk.ts";
import { createRiskConfigRoutes } from "./risk-config.ts";
import { createRiskLimitRoutes } from "./risk-limits.ts";
import { createRiskLookupRoutes } from "./risk-lookups.ts";
import { createSchedulingRoutes } from "./scheduling.ts";
import { createSegmentRoutes } from "./segments.ts";
import { createSignRoutes } from "./sign.ts";
import { createSignTemplateRoutes } from "./sign-templates.ts";
import { createSmsRoutes } from "./sms.ts";
import { createStorageSettingsRoutes } from "./storage-settings.ts";
import { createSubaccountRoutes } from "./subaccounts.ts";
import { createSuppressionRoutes } from "./suppressions.ts";
import { createTopicRoutes } from "./topics.ts";
import { createTrackingSettingsRoutes } from "./tracking-settings.ts";
import { createVerifyRoutes } from "./verify.ts";
import { createWebhookEndpointRoutes } from "./webhook-endpoints.ts";
import { createWebhookEventRoutes } from "./webhook-events.ts";
import { createWebhookListenerRoutes } from "./webhook-listeners.ts";

export type V1Dependencies = {
  emailService: EmailService;
  smsService: SmsService;
  verifyService: VerifyService;
  /** Sign's writes (documents' bytes); `null`: Sign isn't available in this deployment. */
  signService: SignService | null;
  domainDeps: DomainDeps;
  webhookDeps: WebhookManagementDeps;
  /** Where portal session links point (`PORTAL_PUBLIC_URL`); `null`: the portal isn't deployed. */
  portalUrl: string | null;
  /** Where signing session links point (`SIGN_PUBLIC_URL`); `null`: the signing app isn't deployed. */
  signUrl: string | null;
  /** Where forms are served (`FORMS_PUBLIC_URL`); `null`: Forms isn't available. */
  formsUrl: string | null;
  /** Forms' uploads; `null`: no store (files can't be read). */
  formsStore: FormFileStore | null;
  /** Scheduling's attendee data keys and plan checks; `null`: it isn't available. */
  scheduling: SchedulingDeps | null;
  /** Receiving (`EmailRuntime.inbound`); `null` when the deployment doesn't receive email. */
  inbound: InboundRuntime | null;
  riskDeps: RiskDeps;
  /** Aborted when the server shuts down: open long polls answer at once. */
  shutdownSignal: AbortSignal;
  listenerPollIntervalMs?: number;
  /** Marketing email's links: the key ring and their origin (`TRACKING_PUBLIC_URL`). */
  links: { keys: LinkKeyRing; baseUrl?: string };
  /** Capped plans' allowance: new live inboxes reserve from it, canceled and paused broadcasts give back. */
  billing?: UsageGate;
};

/** Everything under `/v1`. Each product mounts its routes here. */
export function createV1Router(deps: V1Dependencies): OpenAPIHono<AppEnv> {
  const v1 = new OpenAPIHono<AppEnv>();
  v1.route("/", createEnvironmentRoutes());
  v1.route("/", createEmailRoutes(deps.emailService));
  v1.route("/", createEmailTemplateRoutes());
  v1.route("/", createDomainRoutes(deps.domainDeps, deps.inbound));
  v1.route("/", createDedicatedIpRoutes());
  v1.route("/", createWebhookEndpointRoutes(deps.webhookDeps));
  v1.route(
    "/",
    createWebhookListenerRoutes({
      shutdownSignal: deps.shutdownSignal,
      pollIntervalMs: deps.listenerPollIntervalMs,
    }),
  );
  v1.route("/", createWebhookEventRoutes());
  v1.route("/", createSuppressionRoutes());
  v1.route("/", createSubaccountRoutes());
  v1.route("/", createSmsRoutes(deps.smsService));
  v1.route(
    "/",
    createSignRoutes({
      signService: deps.signService,
      signUrl: deps.signUrl,
      liveProvider: deps.domainDeps.identity.name,
    }),
  );
  v1.route("/", createSignTemplateRoutes({ signService: deps.signService, signUrl: deps.signUrl }));
  v1.route("/", createVerifyRoutes(deps.verifyService));
  v1.route(
    "/",
    createFormRoutes({
      formsUrl: deps.formsUrl,
      store: deps.formsStore,
      riskDeps: deps.riskDeps,
      liveProvider: deps.domainDeps.identity.name,
      billing: deps.billing,
    }),
  );
  v1.route("/", createSchedulingRoutes(deps.scheduling));
  v1.route("/", createTrackingSettingsRoutes());
  v1.route("/", createStorageSettingsRoutes());
  v1.route(
    "/",
    createContactRoutes({
      emailService: deps.emailService,
      links: deps.links,
      // The live provider's name (identities and sends share it): live confirmations must come
      // from a domain it verified.
      liveProvider: deps.domainDeps.identity.name,
    }),
  );
  v1.route(
    "/",
    createBroadcastRoutes({
      emailService: deps.emailService,
      liveProvider: deps.domainDeps.identity.name,
      billing: deps.billing,
    }),
  );
  v1.route("/", createAudienceRoutes());
  v1.route("/", createSegmentRoutes());
  v1.route("/", createTopicRoutes());
  v1.route("/", createReputationRoutes());
  v1.route("/", createLogRoutes());
  v1.route("/", createAuditEventRoutes());
  v1.route("/", createBillingRoutes());
  // Drain secrets use the same key ring as webhook endpoints.
  v1.route("/", createLogDrainRoutes(deps.webhookDeps));
  // Hooks endpoint secrets use the same key ring too.
  v1.route("/", createHookRoutes({ ...deps.webhookDeps, portalUrl: deps.portalUrl }));
  v1.route("/", createReceivedEmailRoutes(deps.inbound));
  v1.route(
    "/",
    createInboxRoutes({
      emailService: deps.emailService,
      inbound: deps.inbound,
      billing: deps.billing,
    }),
  );
  v1.route("/", createRiskRoutes(deps.riskDeps));
  v1.route("/", createRiskConfigRoutes(deps.riskDeps));
  v1.route("/", createRiskLookupRoutes(deps.riskDeps));
  v1.route("/", createRiskLimitRoutes(deps.riskDeps));
  return v1;
}
