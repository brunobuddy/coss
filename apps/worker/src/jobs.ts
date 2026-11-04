/** The worker's jobs, wired to their dependencies. Each run returns true when it found a full batch. */
import { type AuthEmailDeps, runDueAuthEmails } from "@coss/auth/emails";
import {
  type BillingNotifier,
  type BillingProviders,
  expirePendingUpgrades,
  finalizeOrganizationBilling,
  organizationsEntitledTo,
  type ProviderName,
  reconcileOpenInvoices,
  runBillingUsageChecks,
  runContractRenewals,
  runDueBillingCollection,
  runDueBillingEvents,
  runDueBillingNotifications,
  runDueBillingPeriods,
  runDueBillingSync,
  runDueCreditNoteSync,
} from "@coss/billing";
import type { UsageGate } from "@coss/billing/gate";
import { dropExpiredPartitions, ensurePartitions, HOOK_PARTITIONS } from "@coss/db/partitions";
import {
  type BroadcastWorkerDeps,
  chargeDueInboxFees,
  type DomainDeps,
  type EmailDispatchQueue,
  type EmailService,
  emailReputationChecks,
  recheckDueDomains,
  recheckDueReceivingDomains,
  recheckDueTrackingDomains,
  reconcileDedicatedIpPools,
  releaseOrganizationEmailResources,
  releaseSubaccountEmailResources,
  runDueBroadcasts,
  runDueDmarcNotifications,
  runDueSubaccountDeletions,
  runDueSubaccountEvaluations,
  sweepStaleClaims,
  sweepUnclaimedEmails,
} from "@coss/email";
import type { InboundRuntime } from "@coss/email/runtime";
import {
  type FormDeliveryDeps,
  type FormFileStore,
  runDueFormDeliveries,
  runDueFormStoreCleanup,
} from "@coss/forms";
import {
  type HookDeliveryDeps,
  hookFailureRateCheck,
  parkHeldHookDeliveries,
  runDueHookDeliveries,
  runDueHookRecoveries,
} from "@coss/hooks";
import { dropExpiredLogPartitions, ensureLogPartitions } from "@coss/logs";
import { type MigrationWorkerDeps, runDueMigrations } from "@coss/migrate";
import { runDueNotifications } from "@coss/notifications";
import { type PushDeps, runDuePushNotifications } from "@coss/push";
import {
  type ReputationNotificationDeps,
  runDueReputationEvaluations,
  runDueReputationNotifications,
} from "@coss/reputation";
import { RETENTION_DAYS } from "@coss/retention";
import { refreshDueDatasets } from "@coss/risk";
import {
  announceDueOutOfOffice,
  checkHostEditedEvents,
  expireDueBookings,
  type NotificationDeps,
  refreshIdleZoomConnections,
  releaseOrganizationCalendars,
  renewDueCalendarChannels,
  runDueCalendarSyncs,
  runDueCalendarWrites,
  runDueReassignments,
  runDueSchedulingNotifications,
  type SchedulingWorkerDeps,
} from "@coss/scheduling";
import { contentScreeningCheck } from "@coss/screening";
import {
  type DocumentStore,
  runDueSignCleanup,
  runDueSignCompletions,
  runDueSignNotifications,
  type SignCompletionDeps,
  type SignNotificationDeps,
} from "@coss/sign";
import {
  advanceDueSmsRegistrations,
  attachPendingSmsNumbers,
  chargeDueSmsFees,
  reconcileSmsPurchases,
  releaseOrganizationSmsResources,
  retryUnfinishedSmsReleases,
  type SmsDispatchQueue,
  type SmsSenderDeps,
  type SmsService,
  smsReputationChecks,
  sweepStaleSmsClaims,
  sweepUnclaimedSms,
} from "@coss/sms";
import {
  autoResolveQuietTickets,
  copySupportAttachments,
  enqueueSupportAlerts,
  ingestSupportEmails,
  purgeExpiredSupportTickets,
  purgeSupportLeftovers,
  runDueSupportDeliveries,
  type SupportDeliveryDeps,
  type SupportFileStore,
  type SupportIntakeDeps,
  syncSupportDeliveries,
  wakeSnoozedTickets,
} from "@coss/support";
import { runDueOrganizationDeletions } from "@coss/tenancy/deletion";
import { publicLogoHttp, runDueOrganizationLogos } from "@coss/tenancy/logos";
import { recordDueVerifySmsUsage } from "@coss/verify";
import {
  runDueLogDrainDeliveries,
  runDueWebhookDeliveries,
  type WebhookDeliveryDeps,
} from "@coss/webhooks";
import { reportDispatchBacklog } from "./backlog.ts";
import { pollSesInbound, type SesInboundDeps } from "./inbound.ts";
import type { Loop } from "./loop.ts";
import { startLoop } from "./loop.ts";
import { NOTIFICATION_KINDS } from "./notification-kinds.ts";
import { runRetention } from "./retention.ts";
import { pollSesEvents, type SqsApi } from "./sqs.ts";

const WEBHOOK_BATCH = 20;
const HOOK_BATCH = 200;
const HOOK_CONCURRENCY = 100;
const HOOK_PARK_BATCH = 5000;
const HOOK_RECOVERY_BATCH = 1000;
const LOG_DRAIN_BATCH = 10;
const DOMAIN_BATCH = 25;
const DEDICATED_IP_BATCH = 25;
const SWEEP_BATCH = 100;
const INBOX_FEE_BATCH = 1000;
const SCHEDULED_SMS_BATCH = 50;
const SMS_REGISTRATION_BATCH = 20;
const REPUTATION_BATCH = 50;
const NOTIFICATION_BATCH = 20;
const AUTH_EMAIL_BATCH = 20;
const SCHEDULED_BATCH = 50;
const BROADCAST_BATCH = 10;
const MIGRATION_BATCH = 2;
const DELETION_BATCH = 5;
const LOGO_BATCH = 5;
const RETENTION_BATCH = 1000;
const BILLING_BATCH = 20;
const SCHEDULING_BATCH = 50;
const SIGN_COMPLETION_BATCH = 5;
const SIGN_NOTIFICATION_BATCH = 50;
const SIGN_CLEANUP_BATCH = 500;
const FORMS_CLEANUP_BATCH = 500;
const FORMS_DELIVERY_BATCH = 50;
// Content screening only records verdicts; this check turns them into warnings and suspensions.
// Hooks delivery failures warn by default (their policy has no suspension threshold).
const REPUTATION_CHECKS = [
  ...emailReputationChecks,
  ...smsReputationChecks,
  contentScreeningCheck,
  hookFailureRateCheck,
];

export type WorkerDeps = {
  /** Emails are dispatched by pg-boss workers; this loop only re-enqueues lost jobs. */
  dispatchQueue: EmailDispatchQueue;
  domains: DomainDeps;
  /** Dispatches scheduled emails. */
  email: Pick<EmailService, "dispatchDue">;
  /** SMS: dispatches scheduled messages; the sweeps re-enqueue lost jobs on `queue`. */
  sms: {
    service: Pick<SmsService, "dispatchDue">;
    queue: SmsDispatchQueue;
    /** Carrier registrations, numbers' and campaigns' monthly fees, subaccount teardown. */
    senders: SmsSenderDeps;
  };
  /** Fans broadcasts out into emails, at each organization's marketing rate. */
  broadcasts: BroadcastWorkerDeps;
  /** Imports from other providers (Resend, SendGrid, Postmark). */
  migrations: MigrationWorkerDeps;
  /** Also delivers log drain batches (same signing keys and sender). */
  webhooks: WebhookDeliveryDeps;
  /** Delivers Hooks messages (same signing keys and sender, plus the delivery rate limits). */
  hooks: HookDeliveryDeps;
  /** How long environment logs are kept (`LOG_RETENTION_DAYS`). */
  logRetentionDays: number;
  /** Downloads IPinfo Lite for risk's ASN and country signals (`IPINFO_TOKEN`); `null`: skipped. */
  ipinfoToken: string | null;
  /** Sends account emails (verification, password resets, invitations); `null`: held. */
  authEmails: AuthEmailDeps | null;
  /**
   * Emails owners and admins about warnings and suspensions, and about their domains' DMARC
   * (ready for a stricter policy, failing mail); `null`: held until configured.
   */
  notifications: ReputationNotificationDeps | null;
  /** Seals Sign's completed requests; `null`: held (no document store or sealer yet). */
  signCompletion?: SignCompletionDeps | null;
  /** Sign's document store: an organization's objects go when it is deleted. */
  signStore?: DocumentStore | null;
  /** Scheduling's attendee data keys, and calendars; `null`: its loops are off. */
  scheduling?: SchedulingWorkerDeps | null;
  /** Scheduling's emails and texts; `null`: held. */
  schedulingNotifications?: NotificationDeps | null;
  /** Forms' file store: deletions of removed submissions' files, and organization deletion. */
  formsStore?: FormFileStore | null;
  /** Forms' notifications, contacts and verification emails; `null`: off (no forms host yet). */
  formDeliveries?: FormDeliveryDeps | null;
  /** coss.com's support desk; `null`: off. */
  support?: SupportWorkerDeps | null;
  /** Sign's emails, reminders and expiry; `null`: off (no document store or signing app yet). */
  signNotifications?: SignNotificationDeps | null;
  /** Push notifications to the iOS app; `null`: held until APNs is configured. */
  push?: PushDeps | null;
  /** coss.com's own organization (`NOTIFICATIONS_ENVIRONMENT_ID`'s): the guard never suspends it. */
  systemOrganizationId: string | null;
  /** Only with `EMAIL_PROVIDER=ses`. */
  sesEvents?: { sqs: SqsApi; tenantPrefix: string };
  /** Receiving (`EmailRuntime.inbound`): receiving domain checks and content deletion. */
  inbound?: InboundRuntime | null;
  /** Only with `EMAIL_PROVIDER=ses` and receiving set up (`SES_INBOUND_QUEUE_URL`). */
  sesInbound?: SesInboundDeps;
  /** Billing: closes months, pushes and collects invoices, applies provider events, alerts. */
  billing: {
    providers: BillingProviders;
    defaultProvider: ProviderName;
    dashboardUrl: string;
    /** Billing emails (usage alerts, payment failures); `null`: held until configured. */
    notifier: BillingNotifier | null;
    /** Capped plans' allowance: the inbox-days the `inbox-fees` loop charges count toward it. */
    usage?: UsageGate;
  };
  /**
   * Aborted on shutdown: ends the SQS long poll and stops long runs between items. Each loop's
   * current item (a webhook attempt, a domain check, a received SQS batch) still finishes.
   */
  signal: AbortSignal;
  /** Run only these loops (`WORKER_LOOPS`); all of them when absent. */
  loops?: ReadonlySet<string>;
};

/**
 * Every loop (and pg-boss's email dispatch, one queue per stream), by name, for `WORKER_LOOPS`. The
 * conditional ones (`billing-notifications`, `auth-emails`, `reputation-notifications`,
 * `dmarc-notifications`, `notifications`, `push-notifications`, `sign-completions`, `sign-notifications`, `sign-cleanup`, `forms`, `support`, `ses-events`,
 * `ses-inbound`) also need their
 * configuration.
 */
export const WORKER_LOOP_NAMES = [
  "scheduling-expiry",
  "scheduling-notifications",
  "scheduling-calendar-sync",
  "scheduling-calendar-writes",
  "scheduling-calendar-channels",
  "scheduling-calendar-host-edits",
  "scheduling-out-of-office",
  "scheduling-reassignments",
  "email-dispatch",
  "email-dispatch-marketing",
  "webhooks",
  "hooks",
  "hooks-maintenance",
  "log-drains",
  "domains",
  "dedicated-ips",
  "scheduled-emails",
  "sms-dispatch",
  "scheduled-sms",
  "sms-sweeps",
  "sms-registrations",
  "sms-fees",
  "verify-usage",
  "inbox-fees",
  "broadcasts",
  "migrations",
  "stale-claims",
  "reputation",
  "organization-deletions",
  "organization-logos",
  "subaccount-deletions",
  "unclaimed",
  "dispatch-backlog",
  "retention",
  "partitions",
  "risk-datasets",
  "billing-periods",
  "billing-sync",
  "billing-collection",
  "billing-events",
  "billing-usage",
  "billing-reconcile",
  "billing-notifications",
  "auth-emails",
  "reputation-notifications",
  "dmarc-notifications",
  "notifications",
  "push-notifications",
  "sign-completions",
  "sign-notifications",
  "sign-cleanup",
  "forms",
  "support",
  "ses-events",
  "ses-inbound",
] as const;

export type SupportWorkerDeps = {
  /** Mail received in the support environment; `null`: only dashboard tickets. */
  intake: SupportIntakeDeps | null;
  /** `null`: customers' emails wait until the mailer is configured. */
  delivery: SupportDeliveryDeps | null;
  inbound: { get(key: string): Promise<Uint8Array | null> } | null;
  store: SupportFileStore | null;
  /** Reps' alerts are this organization's notifications; `null`: none. */
  alertsOrganizationId: string | null;
};

const SUPPORT_BATCH = 25;

export function startJobs(deps: WorkerDeps): Loop[] {
  const logoHttp = publicLogoHttp();
  // Only the loops this worker runs (`WORKER_LOOPS`), e.g. a fleet dedicated to Hooks deliveries.
  const start = (options: Parameters<typeof startLoop>[0]): Loop | null =>
    !deps.loops || deps.loops.has(options.name) ? startLoop(options) : null;
  const loops: (Loop | null)[] = [
    start({
      name: "webhooks",
      intervalMs: 1000,
      run: async () =>
        (await runDueWebhookDeliveries({ limit: WEBHOOK_BATCH }, deps.webhooks)) === WEBHOOK_BATCH,
    }),
    start({
      // Hooks: customers' messages to their users' endpoints. Busy whenever a batch is full.
      name: "hooks",
      intervalMs: 500,
      run: async () =>
        (await runDueHookDeliveries(
          { limit: HOOK_BATCH, concurrency: HOOK_CONCURRENCY },
          deps.hooks,
        )) === HOOK_BATCH,
    }),
    start({
      // Puts off held organizations' deliveries (so they never block the queue's head) and
      // requeues the failed deliveries of endpoint recoveries, in batches.
      name: "hooks-maintenance",
      intervalMs: 10_000,
      run: async () => {
        const parked = await parkHeldHookDeliveries({ limit: HOOK_PARK_BATCH });
        const recovered = await runDueHookRecoveries({ limit: HOOK_RECOVERY_BATCH });
        return parked === HOOK_PARK_BATCH || recovered === HOOK_RECOVERY_BATCH;
      },
    }),
    start({
      // Environment logs streamed to log drains, in NDJSON batches.
      name: "log-drains",
      intervalMs: 1000,
      run: async () =>
        (await runDueLogDrainDeliveries({ limit: LOG_DRAIN_BATCH }, deps.webhooks)) ===
        LOG_DRAIN_BATCH,
    }),
    start({
      name: "domains",
      intervalMs: 30_000,
      // Sending domains, then their custom tracking and receiving domains.
      run: async () => {
        const opts = { limit: DOMAIN_BATCH, signal: deps.signal };
        const domains = await recheckDueDomains(opts, deps.domains);
        const tracking = await recheckDueTrackingDomains(opts, deps.domains);
        const receiving = deps.inbound
          ? await recheckDueReceivingDomains(opts, deps.inbound, deps.domains.dns)
          : 0;
        return domains === DOMAIN_BATCH || tracking === DOMAIN_BATCH || receiving === DOMAIN_BATCH;
      },
    }),
    start({
      // Dedicated IP pools follow billing (the Dedicated IPs add-on): provisioned, checked for
      // warm-up progress, and released a day after the add-on ends.
      name: "dedicated-ips",
      intervalMs: 60_000,
      run: async () => {
        const dedicatedIps = deps.domains.dedicatedIps;
        if (!dedicatedIps) return false;
        const entitled = await organizationsEntitledTo("dedicatedIps");
        return (
          (await reconcileDedicatedIpPools(
            { entitled, limit: DEDICATED_IP_BATCH, signal: deps.signal },
            { identity: deps.domains.identity, dedicatedIps },
          )) === DEDICATED_IP_BATCH
        );
      },
    }),
    start({
      name: "scheduled-emails",
      intervalMs: 5000,
      run: async () =>
        (await deps.email.dispatchDue({ limit: SCHEDULED_BATCH, signal: deps.signal })) ===
        SCHEDULED_BATCH,
    }),
    start({
      // Broadcasts: starts the due ones and makes each sending one's next batch of emails.
      name: "broadcasts",
      intervalMs: 1000,
      run: async () =>
        (await runDueBroadcasts(deps.broadcasts, { limit: BROADCAST_BATCH })) === BROADCAST_BATCH,
    }),
    start({
      name: "scheduled-sms",
      intervalMs: 5000,
      run: async () =>
        (await deps.sms.service.dispatchDue({
          limit: SCHEDULED_SMS_BATCH,
          signal: deps.signal,
        })) === SCHEDULED_SMS_BATCH,
    }),
    start({
      // SMS whose dispatch was interrupted (claimed, never finished) or lost (never claimed).
      name: "sms-sweeps",
      intervalMs: 60_000,
      run: async () => {
        const stale = await sweepStaleSmsClaims({ limit: SWEEP_BATCH });
        const unclaimed = await sweepUnclaimedSms(deps.sms.queue, { limit: SWEEP_BATCH });
        return stale === SWEEP_BATCH || unclaimed.failed === SWEEP_BATCH;
      },
    }),
    start({
      // Carrier registrations: each step at Twilio, then its review, polled until decided;
      // purchases whose answer was lost; numbers their messaging service didn't take at purchase;
      // releases the provider didn't finish.
      name: "sms-registrations",
      intervalMs: 30_000,
      run: async () => {
        await reconcileSmsPurchases(deps.sms.senders);
        await attachPendingSmsNumbers(deps.sms.senders);
        await retryUnfinishedSmsReleases(deps.sms.senders);
        return (
          (await advanceDueSmsRegistrations(deps.sms.senders, {
            limit: SMS_REGISTRATION_BATCH,
          })) === SMS_REGISTRATION_BATCH
        );
      },
    }),
    start({
      // Monthly pass-through fees: numbers held and approved US campaigns.
      name: "sms-fees",
      intervalMs: 10 * 60_000,
      run: async () => (await chargeDueSmsFees({ limit: SWEEP_BATCH })) >= SWEEP_BATCH,
    }),
    start({
      // Verify's codes from coss.com's shared numbers, billed to each organization once the SMS
      // reached a carrier (as SMS bills its own).
      name: "verify-usage",
      intervalMs: 60_000,
      run: async () => (await recordDueVerifySmsUsage({ limit: SWEEP_BATCH })) >= SWEEP_BATCH,
    }),
    start({
      // A day of every live inbox (`email.inboxes`), charged when the day starts.
      name: "inbox-fees",
      intervalMs: 10 * 60_000,
      run: async () =>
        (await chargeDueInboxFees({ limit: INBOX_FEE_BATCH, billing: deps.billing.usage })) >=
        INBOX_FEE_BATCH,
    }),
    start({
      // Imports from other providers: each run works on a few for a step (they take turns).
      name: "migrations",
      intervalMs: 5000,
      run: async () => (await runDueMigrations(deps.migrations, { limit: MIGRATION_BATCH })) > 0,
    }),
    start({
      name: "stale-claims",
      intervalMs: 60_000,
      run: async () => (await sweepStaleClaims({ limit: SWEEP_BATCH })) === SWEEP_BATCH,
    }),
    start({
      // The reputation guard: re-checks organizations with new bounces or complaints, and
      // suspends live sending on its own when a rate crosses the policy.
      name: "reputation",
      intervalMs: 60_000,
      run: async () => {
        const organizations = await runDueReputationEvaluations(
          { limit: REPUTATION_BATCH },
          { checks: REPUTATION_CHECKS, systemOrganizationId: deps.systemOrganizationId },
        );
        // Email sub-accounts' own standings (their pauses never touch the organization's).
        const subaccounts = await runDueSubaccountEvaluations({ limit: REPUTATION_BATCH });
        return organizations === REPUTATION_BATCH || subaccounts === REPUTATION_BATCH;
      },
    }),
    start({
      // Each organization's logo, from its own website (new organizations within a minute).
      name: "organization-logos",
      intervalMs: 60_000,
      run: async () =>
        (await runDueOrganizationLogos(
          { limit: LOGO_BATCH, signal: deps.signal },
          { http: logoHttp },
        )) === LOGO_BATCH,
    }),
    start({
      // Organization deletions: releases domains and the SES tenant, then deletes the data.
      name: "organization-deletions",
      intervalMs: 10_000,
      run: async () =>
        (await runDueOrganizationDeletions(
          { limit: DELETION_BATCH, signal: deps.signal },
          {
            releaseProviderResources: async (organizationId, assertLease) => {
              await releaseOrganizationEmailResources(
                organizationId,
                { ...deps.domains, inboundStore: deps.inbound?.store ?? null },
                assertLease,
              );
              // Sign's documents, signatures and signed PDFs (the fake store's rows go with the data).
              if (deps.signStore) {
                await assertLease();
                await deps.signStore.deleteOrganization(organizationId);
              }
              // Files uploaded to forms (the fake store's rows go with the data).
              if (deps.formsStore) {
                await assertLease();
                await deps.formsStore.deleteOrganization(organizationId);
              }
              // Calendar channels stop, and coss.com's access to hosts' calendars is revoked.
              if (deps.scheduling?.calendars) {
                await releaseOrganizationCalendars(
                  organizationId,
                  deps.scheduling.calendars,
                  assertLease,
                );
              }
              // Numbers stop sending and the Twilio subaccount is closed.
              await releaseOrganizationSmsResources(organizationId, deps.sms.senders, assertLease);
              // The running month is invoiced (once); the invoice outlives the organization.
              await finalizeOrganizationBilling(organizationId, { assertLease });
            },
          },
        )) === DELETION_BATCH,
    }),
    start({
      // Email sub-accounts being deleted: what they hold is released, then the rows go.
      name: "subaccount-deletions",
      intervalMs: 10_000,
      run: async () =>
        (await runDueSubaccountDeletions(
          { release: (row) => releaseSubaccountEmailResources(row, deps.domains) },
          { limit: DELETION_BATCH },
        )) === DELETION_BATCH,
    }),
    start({
      name: "unclaimed",
      intervalMs: 60_000,
      // Busy only while there are more emails to fail (they leave the scan). Requeued emails may
      // stay unclaimed behind a backlog, and rescanning them at once would only spin.
      run: async () =>
        (await sweepUnclaimedEmails(deps.dispatchQueue, { limit: SWEEP_BATCH })).failed ===
        SWEEP_BATCH,
    }),
    start({
      name: "dispatch-backlog",
      intervalMs: 5 * 60_000,
      run: () => reportDispatchBacklog(),
    }),
    start({
      // Deletes data past its published retention (`@coss/retention`); catches up in full batches.
      name: "retention",
      intervalMs: 10 * 60_000,
      run: () => runRetention({ limit: RETENTION_BATCH, signal: deps.signal }),
    }),
    start({
      // Risk's IP datasets (Tor exits, cloud ranges, IPinfo Lite), each on its own schedule; the
      // API reloads changed ones. A failed download keeps the stored copy.
      name: "risk-datasets",
      intervalMs: 10 * 60_000,
      run: async () => {
        const results = await refreshDueDatasets({ ipinfoToken: deps.ipinfoToken ?? undefined });
        for (const result of results) {
          if (result.status === "updated")
            console.info(`[worker:risk-datasets] updated ${result.name}`);
          if (result.status === "failed") {
            console.error(
              `[worker:risk-datasets] ${result.name}:`,
              new Error(result.error ?? "refresh failed"),
            );
          }
        }
      },
    }),
    start({
      // Partitioned tables (environment logs, Hooks messages): a week of daily partitions ahead,
      // expired days dropped whole.
      name: "partitions",
      intervalMs: 60 * 60_000,
      run: async () => {
        const created = await ensureLogPartitions();
        const dropped = await dropExpiredLogPartitions({ retentionDays: deps.logRetentionDays });
        // Children first, so a delivery never outlives its message.
        for (const spec of HOOK_PARTITIONS) {
          created.push(...(await ensurePartitions(spec)));
          dropped.push(
            ...(await dropExpiredPartitions(spec, { retentionDays: RETENTION_DAYS.hookMessages })),
          );
        }
        if (created.length > 0 || dropped.length > 0) {
          console.info(
            `[worker:partitions] created ${created.length}, dropped ${dropped.length} partitions`,
          );
        }
      },
    }),
  ];
  const billing = deps.billing;
  const system = deps.systemOrganizationId;
  loops.push(
    start({
      // Closes ended months into invoices (after the usage settle window), renews contracts,
      // and gives up unpaid upgrades.
      name: "billing-periods",
      intervalMs: 60_000,
      run: async () => {
        const closed = await runDueBillingPeriods({ limit: BILLING_BATCH });
        await runContractRenewals({});
        await expirePendingUpgrades({});
        return closed === BILLING_BATCH;
      },
    }),
    start({
      // Pushes invoices to their provider and collects them; mirrors voids and credit notes.
      name: "billing-sync",
      intervalMs: 5000,
      run: async () => {
        const invoices = await runDueBillingSync(
          { limit: BILLING_BATCH },
          {
            providers: billing.providers,
            dashboardUrl: billing.dashboardUrl,
            systemOrganizationId: system,
          },
        );
        await runDueCreditNoteSync({ limit: BILLING_BATCH }, { providers: billing.providers });
        return invoices === BILLING_BATCH;
      },
    }),
    start({
      // Dunning: retries failed charges, reminds about invoices with net terms, and holds live
      // sending once an invoice is overdue past the account's grace days.
      name: "billing-collection",
      intervalMs: 60_000,
      run: async () =>
        (await runDueBillingCollection({ limit: BILLING_BATCH, systemOrganizationId: system })) ===
        BILLING_BATCH,
    }),
    start({
      // Payment provider events (Stripe webhooks) stored by the dashboard.
      name: "billing-events",
      intervalMs: 2000,
      run: async () =>
        (await runDueBillingEvents(
          { limit: BILLING_BATCH },
          { providers: billing.providers, systemOrganizationId: system },
        )) === BILLING_BATCH,
    }),
    start({
      // Usage alerts and spend-limit holds.
      name: "billing-usage",
      intervalMs: 5 * 60_000,
      run: async () => {
        await runBillingUsageChecks({ systemOrganizationId: system });
      },
    }),
    start({
      // Open invoices the provider may have settled without us hearing (a lost webhook).
      name: "billing-reconcile",
      intervalMs: 60 * 60_000,
      run: async () => {
        await reconcileOpenInvoices(
          {},
          { providers: billing.providers, systemOrganizationId: system },
        );
      },
    }),
  );
  const billingNotifier = billing.notifier;
  if (billingNotifier) {
    loops.push(
      start({
        name: "billing-notifications",
        intervalMs: 5000,
        run: async () =>
          (await runDueBillingNotifications(
            { limit: NOTIFICATION_BATCH },
            { notifier: billingNotifier, dashboardUrl: billing.dashboardUrl },
          )) === NOTIFICATION_BATCH,
      }),
    );
  }
  const authEmails = deps.authEmails;
  if (authEmails) {
    loops.push(
      start({
        name: "auth-emails",
        // Someone is waiting for these (a sign-up, a password reset).
        intervalMs: 2000,
        run: async () =>
          (await runDueAuthEmails({ limit: AUTH_EMAIL_BATCH }, authEmails)) === AUTH_EMAIL_BATCH,
      }),
    );
  }
  const notifications = deps.notifications;
  if (notifications) {
    loops.push(
      start({
        name: "reputation-notifications",
        intervalMs: 5000,
        run: async () =>
          (await runDueReputationNotifications({ limit: NOTIFICATION_BATCH }, notifications)) ===
          NOTIFICATION_BATCH,
      }),
      start({
        name: "dmarc-notifications",
        // Advice, not alarms: nobody is waiting on these.
        intervalMs: 30_000,
        run: async () =>
          (await runDueDmarcNotifications(
            { limit: NOTIFICATION_BATCH },
            { ...notifications, dmarcReportDomain: deps.domains.dmarcReportDomain ?? null },
          )) === NOTIFICATION_BATCH,
      }),
      start({
        // Next steps and outcomes (an SMS sender's registration): `@coss/notifications`.
        name: "notifications",
        intervalMs: 5000,
        run: async () =>
          (await runDueNotifications(
            { limit: NOTIFICATION_BATCH },
            { ...notifications, kinds: NOTIFICATION_KINDS },
          )) === NOTIFICATION_BATCH,
      }),
    );
  }
  const scheduling = deps.scheduling;
  if (scheduling) {
    loops.push(
      start({
        // Tidies up and tells customers: an expired hold blocks nobody even if this never ran.
        name: "scheduling-expiry",
        intervalMs: 30_000,
        run: async () => (await expireDueBookings(scheduling)) === SCHEDULING_BATCH,
      }),
      start({
        // Only what customers are told: entries block bookings by their times, whether or not this ran.
        name: "scheduling-out-of-office",
        intervalMs: 30_000,
        run: async () =>
          (await announceDueOutOfOffice(scheduling, { limit: SCHEDULING_BATCH })) ===
          SCHEDULING_BATCH,
      }),
      start({
        // A run's fifty bookings at a time, one transaction each. Soon, since someone's waiting.
        name: "scheduling-reassignments",
        intervalMs: 2000,
        run: async () => (await runDueReassignments(scheduling, { limit: 5 })) > 0,
      }),
    );
    const notifications = deps.schedulingNotifications;
    if (notifications) {
      loops.push(
        start({
          name: "scheduling-notifications",
          intervalMs: 5000,
          run: async () =>
            (await runDueSchedulingNotifications(notifications, { limit: SCHEDULING_BATCH })) ===
            SCHEDULING_BATCH,
        }),
      );
    }
    const calendars = scheduling.calendars;
    if (calendars) {
      loops.push(
        start({
          // A push marks a calendar due straight away, so this keeps availability close to live.
          name: "scheduling-calendar-sync",
          intervalMs: 2000,
          run: async () =>
            (await runDueCalendarSyncs(calendars, { limit: SCHEDULING_BATCH })) ===
            SCHEDULING_BATCH,
        }),
        start({
          name: "scheduling-calendar-writes",
          intervalMs: 2000,
          run: async () =>
            (await runDueCalendarWrites(calendars, { limit: SCHEDULING_BATCH })) ===
            SCHEDULING_BATCH,
        }),
        start({
          // Until a new calendar has its channel, changes to it wait for the 5 minute poll.
          name: "scheduling-calendar-channels",
          intervalMs: 15_000,
          run: async () =>
            (await renewDueCalendarChannels(calendars, { limit: SCHEDULING_BATCH })) ===
            SCHEDULING_BATCH,
        }),
        start({
          name: "scheduling-calendar-host-edits",
          intervalMs: 5 * 60_000,
          run: async () => {
            await checkHostEditedEvents(calendars, { limit: SCHEDULING_BATCH });
            await refreshIdleZoomConnections(calendars, { limit: SCHEDULING_BATCH });
            return false;
          },
        }),
      );
    }
  }
  const signCompletion = deps.signCompletion;
  if (signCompletion) {
    loops.push(
      start({
        // Signers wait for their copy: seal soon after the last signature.
        name: "sign-completions",
        intervalMs: 2000,
        run: async () =>
          (await runDueSignCompletions({ limit: SIGN_COMPLETION_BATCH }, signCompletion)) ===
          SIGN_COMPLETION_BATCH,
      }),
    );
  }
  const signStore = deps.signStore;
  if (signStore) {
    loops.push(
      start({
        // Retries store deletions that failed when a request was deleted.
        name: "sign-cleanup",
        intervalMs: 60_000,
        run: async () =>
          (await runDueSignCleanup({ limit: SIGN_CLEANUP_BATCH }, signStore)) ===
          SIGN_CLEANUP_BATCH,
      }),
    );
  }
  const formsStore = deps.formsStore;
  const formDeliveries = deps.formDeliveries;
  if (formsStore || formDeliveries) {
    loops.push(
      start({
        // Notifications should arrive within seconds of a submission; files of deleted and purged
        // submissions leave the store.
        name: "forms",
        intervalMs: 2000,
        run: async () => {
          const delivered = formDeliveries
            ? await runDueFormDeliveries({ limit: FORMS_DELIVERY_BATCH }, formDeliveries)
            : 0;
          const cleaned = formsStore
            ? await runDueFormStoreCleanup({ limit: FORMS_CLEANUP_BATCH }, formsStore)
            : 0;
          return delivered === FORMS_DELIVERY_BATCH || cleaned === FORMS_CLEANUP_BATCH;
        },
      }),
    );
  }
  const support = deps.support;
  if (support) {
    let nextHousekeeping = 0;
    loops.push(
      start({
        // A rep's reply or a customer's email should land within seconds.
        name: "support",
        intervalMs: 3000,
        run: async () => {
          const filed = support.intake
            ? await ingestSupportEmails({ limit: SUPPORT_BATCH }, support.intake)
            : 0;
          const copied = await copySupportAttachments(
            { limit: SUPPORT_BATCH },
            { inbound: support.inbound, store: support.store },
          );
          const sent = support.delivery
            ? await runDueSupportDeliveries({ limit: SUPPORT_BATCH }, support.delivery)
            : 0;
          if (support.alertsOrganizationId) {
            await enqueueSupportAlerts({
              organizationId: support.alertsOrganizationId,
              limit: SUPPORT_BATCH,
            });
          }
          if (Date.now() >= nextHousekeeping) {
            nextHousekeeping = Date.now() + 60_000;
            if (support.delivery) await syncSupportDeliveries({}, support.delivery);
            await wakeSnoozedTickets({});
            await autoResolveQuietTickets({});
            await purgeExpiredSupportTickets({ store: support.store });
            await purgeSupportLeftovers({ store: support.store });
          }
          return filed === SUPPORT_BATCH || copied === SUPPORT_BATCH || sent === SUPPORT_BATCH;
        },
      }),
    );
  }
  const signNotifications = deps.signNotifications;
  if (signNotifications) {
    loops.push(
      start({
        // Invitations should arrive within seconds of sending; reminders and expiry are by the day.
        name: "sign-notifications",
        intervalMs: 5000,
        run: async () =>
          (await runDueSignNotifications({ limit: SIGN_NOTIFICATION_BATCH }, signNotifications)) >=
          SIGN_NOTIFICATION_BATCH,
      }),
    );
  }
  const push = deps.push;
  if (push) {
    loops.push(
      start({
        name: "push-notifications",
        // Alerts: worth sending within seconds.
        intervalMs: 2000,
        run: async () =>
          (await runDuePushNotifications({ limit: NOTIFICATION_BATCH }, push)) ===
          NOTIFICATION_BATCH,
      }),
    );
  }
  const ses = deps.sesEvents;
  if (ses) {
    loops.push(
      start({
        name: "ses-events",
        // Each receive long-polls for up to 20 seconds, so poll again right away.
        intervalMs: 0,
        run: async () => {
          if (deps.signal.aborted) return;
          try {
            await pollSesEvents(ses.sqs, { tenantPrefix: ses.tenantPrefix, signal: deps.signal });
          } catch (error) {
            // Shutting down aborts the long poll; that's not a failure.
            if (!deps.signal.aborted) throw error;
          }
        },
      }),
    );
  }
  const sesInbound = deps.sesInbound;
  if (sesInbound) {
    loops.push(
      start({
        name: "ses-inbound",
        // Each receive long-polls for up to 20 seconds, so poll again right away.
        intervalMs: 0,
        run: async () => {
          if (deps.signal.aborted) return;
          try {
            await pollSesInbound(sesInbound, { signal: deps.signal });
          } catch (error) {
            if (!deps.signal.aborted) throw error;
          }
        },
      }),
    );
  }
  return loops.filter((loop): loop is Loop => loop !== null);
}
