/**
 * The `retention` loop: deletes data past the retention published in `@coss/retention`. Each
 * step is the owning package's purge; emails go before their batches.
 */
import {
  purgeExpiredBillingNotifications,
  purgeExpiredBillingProviderEvents,
  purgeExpiredBillingUsage,
  purgeExpiredBillingUsageAttribution,
  purgeExpiredInvoices,
} from "@coss/billing";
import {
  purgeEmptyEmailBatches,
  purgeEmptyInboxThreads,
  purgeExpiredDedicatedIpRollups,
  purgeExpiredDmarcNotifications,
  purgeExpiredDmarcReports,
  purgeExpiredEmails,
  purgeExpiredFakeInboundObjects,
  purgeExpiredInboundDropCounters,
  purgeExpiredPendingContacts,
  purgeExpiredReceivedEmails,
  purgeExpiredReputationRollups,
} from "@coss/email";
import { purgeExpiredFormFakeObjects, purgeExpiredFormSubmissions } from "@coss/forms";
import {
  purgeExpiredHookDeliveryRollups,
  purgeExpiredHookIdempotencyKeys,
  purgeExpiredHookPortalSessions,
  purgeFinishedHookRecoveries,
} from "@coss/hooks";
import { purgeAbandonedMigrationDrafts, purgeExpiredMigrations } from "@coss/migrate";
import { purgeExpiredNotifications } from "@coss/notifications";
import { purgeExpiredPushNotifications } from "@coss/push";
import {
  purgeExpiredReputationEvents,
  purgeExpiredReputationNotifications,
} from "@coss/reputation";
import {
  purgeExpiredRiskAssessments,
  purgeExpiredRiskMemory,
  purgeExpiredRiskPersonalData,
} from "@coss/risk";
import {
  purgeExpiredBookings,
  purgeExpiredOutOfOffice,
  purgeExpiredReassignments,
  purgeSchedulingLeftovers,
  redactExpiredBookings,
  redactExpiredOutOfOffice,
} from "@coss/scheduling";
import { purgeExpiredScreenings } from "@coss/screening";
import { purgeExpiredSignSessions } from "@coss/sign";
import { purgeExpiredReceivedSms, purgeExpiredSmsMessages } from "@coss/sms";
import { purgeExpiredAdminAuditEvents, purgeExpiredAuthRows } from "@coss/tenancy/retention";
import { purgeExpiredVerifications } from "@coss/verify";
import {
  purgeExpiredLogDrainBatches,
  purgeExpiredWebhookListeners,
  purgeExpiredWebhookMessages,
} from "@coss/webhooks";

/** Limits every step to some organizations, users and verification identifiers (tests). */
export type RetentionScope = {
  organizationIds: string[];
  userIds?: string[];
  identifiers?: string[];
};

type StepOptions = { now?: Date; limit: number; scope?: RetentionScope };

const STEPS: { name: string; purge: (opts: StepOptions) => Promise<number | number[]> }[] = [
  { name: "emails", purge: purgeExpiredEmails },
  { name: "email batches", purge: purgeEmptyEmailBatches },
  { name: "reputation rollups", purge: purgeExpiredReputationRollups },
  { name: "dedicated IP rollups", purge: purgeExpiredDedicatedIpRollups },
  { name: "received emails", purge: purgeExpiredReceivedEmails },
  // The fake content store's stand-in for the S3 bucket's lifecycle rule.
  { name: "fake received email content", purge: purgeExpiredFakeInboundObjects },
  { name: "inbound drop counts", purge: purgeExpiredInboundDropCounters },
  // After emails and received emails: their messages left with them.
  { name: "empty inbox threads", purge: purgeEmptyInboxThreads },
  // Records of expired reports first, then the reports (bounded steps, no big cascade).
  { name: "dmarc reports", purge: purgeExpiredDmarcReports },
  { name: "dmarc notifications", purge: purgeExpiredDmarcNotifications },
  { name: "unconfirmed contacts", purge: purgeExpiredPendingContacts },
  { name: "sms messages", purge: purgeExpiredSmsMessages },
  { name: "received sms", purge: purgeExpiredReceivedSms },
  { name: "webhook messages", purge: purgeExpiredWebhookMessages },
  { name: "webhook listeners", purge: purgeExpiredWebhookListeners },
  { name: "log drain batches and backlog", purge: purgeExpiredLogDrainBatches },
  // Hooks messages, deliveries and attempts leave with their partitions (the `partitions` loop).
  { name: "hook idempotency keys", purge: purgeExpiredHookIdempotencyKeys },
  { name: "hook portal sessions", purge: purgeExpiredHookPortalSessions },
  { name: "sign sessions", purge: purgeExpiredSignSessions },
  { name: "verifications", purge: purgeExpiredVerifications },
  { name: "form submissions", purge: purgeExpiredFormSubmissions },
  { name: "booking personal data", purge: redactExpiredBookings },
  { name: "bookings", purge: purgeExpiredBookings },
  { name: "out of office notes", purge: redactExpiredOutOfOffice },
  { name: "out of office", purge: purgeExpiredOutOfOffice },
  { name: "bulk reassignments", purge: purgeExpiredReassignments },
  { name: "scheduling leftovers", purge: purgeSchedulingLeftovers },
  // The fake file store's stand-in for the S3 bucket's lifecycle rule.
  { name: "fake form files", purge: purgeExpiredFormFakeObjects },
  { name: "hook recoveries", purge: purgeFinishedHookRecoveries },
  { name: "hook delivery rollups", purge: purgeExpiredHookDeliveryRollups },
  { name: "content screenings", purge: purgeExpiredScreenings },
  // Personal data first: it goes long before the assessment itself.
  { name: "risk personal data", purge: purgeExpiredRiskPersonalData },
  { name: "risk memory", purge: purgeExpiredRiskMemory },
  { name: "risk assessments", purge: purgeExpiredRiskAssessments },
  { name: "reputation notifications", purge: purgeExpiredReputationNotifications },
  { name: "reputation events", purge: purgeExpiredReputationEvents },
  { name: "admin audit events", purge: purgeExpiredAdminAuditEvents },
  { name: "billing usage", purge: purgeExpiredBillingUsage },
  { name: "billing usage attribution", purge: purgeExpiredBillingUsageAttribution },
  { name: "billing provider events", purge: purgeExpiredBillingProviderEvents },
  { name: "billing notifications", purge: purgeExpiredBillingNotifications },
  { name: "push notifications", purge: purgeExpiredPushNotifications },
  { name: "notifications", purge: purgeExpiredNotifications },
  { name: "migrations", purge: purgeExpiredMigrations },
  { name: "unstarted migrations", purge: purgeAbandonedMigrationDrafts },
  { name: "invoices", purge: purgeExpiredInvoices },
  {
    name: "expired auth rows",
    purge: async (opts) => Object.values(await purgeExpiredAuthRows(opts)),
  },
];

/**
 * Runs every purge once, up to `limit` rows each, and logs what it deleted. Stops between steps
 * once `signal` is aborted. True when a step deleted a full batch (there may be more to delete).
 */
export async function runRetention(opts: {
  limit: number;
  signal?: AbortSignal;
  now?: Date;
  scope?: RetentionScope;
}): Promise<boolean> {
  const { signal, ...stepOptions } = opts;
  let busy = false;
  const deleted: string[] = [];
  for (const step of STEPS) {
    if (signal?.aborted) break;
    const counts = [await step.purge(stepOptions)].flat();
    const total = counts.reduce((sum, count) => sum + count, 0);
    if (total > 0) deleted.push(`${total} ${step.name}`);
    if (counts.some((count) => count === opts.limit)) busy = true;
  }
  if (deleted.length > 0) console.log(`[worker:retention] deleted ${deleted.join(", ")}`);
  return busy;
}
