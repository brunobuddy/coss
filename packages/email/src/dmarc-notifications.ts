/**
 * Emails to an organization's owners and admins about a domain's DMARC: it is ready for the next,
 * stricter policy, or mail sent through coss.com fails DMARC under an enforcing one. Ingesting a
 * report queues a `dmarc_notification` row (`queueNotifications` in `dmarc-reports.ts`); the
 * worker's `dmarc-notifications` loop sends it through a `Notifier` (coss.com's own environment, like
 * reputation notifications), with the same lease, backoff and age limits. System-level: the scan
 * spans organizations, and every read and write is scoped by the row's own organization.
 */

import { orgLinkHref } from "@coss/dashboard-routes";
import { db, schema } from "@coss/db";
import { type EmailBlock, oneLine, renderEmail } from "@coss/email-layout";
import { and, asc, eq, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { DMARC_READINESS } from "./dmarc-guidance.ts";
import { dmarcReadyRecord } from "./dmarc-reports.ts";
import type { Notice, Notifier } from "./notifier.ts";

const { dmarcNotification, domain, member, organization, user } = schema;

const MINUTE = 60 * 1000;
/** A claimed notification is not picked up by another worker for this long. */
export const DMARC_NOTIFICATION_LEASE_MS = 5 * MINUTE;
/** Attempts before a notification is given up as `failed` (backoff 1, 2, 4… min). */
export const MAX_DMARC_NOTIFICATION_ATTEMPTS = 8;
/** Older notifications are skipped rather than sent late. */
export const MAX_DMARC_NOTIFICATION_AGE_MS = 3 * 24 * 60 * MINUTE;
const NOTIFIED_ROLES = ["owner", "admin"];

export type DmarcNotificationRow = typeof dmarcNotification.$inferSelect;

export type DmarcNotificationDeps = {
  notifier: Notifier;
  /** Origin of the dashboard, for links (`BETTER_AUTH_URL`). */
  dashboardUrl: string;
  /** The managed inbound domain DMARC reports go to (`DomainDeps.dmarcReportDomain`). */
  dmarcReportDomain?: string | null;
};

function retryDelayMs(attempt: number): number {
  return Math.min(2 ** (attempt - 1) * MINUTE, 60 * MINUTE);
}

/** The organization's DMARC notifications, newest first (tests). */
export async function listDmarcNotifications(
  organizationId: string,
): Promise<DmarcNotificationRow[]> {
  return db
    .select()
    .from(dmarcNotification)
    .where(eq(dmarcNotification.organizationId, organizationId))
    .orderBy(sql`${dmarcNotification.createdAt} desc`, sql`${dmarcNotification.id} desc`);
}

/** Sends notifications that are due, oldest first. Returns how many were claimed. */
export async function runDueDmarcNotifications(
  opts: { now?: Date; limit?: number; scope?: { organizationIds: string[] } },
  deps: DmarcNotificationDeps,
): Promise<number> {
  const now = opts.now ?? new Date();
  const due = and(
    eq(dmarcNotification.status, "pending"),
    isNotNull(dmarcNotification.nextAttemptAt),
    lte(dmarcNotification.nextAttemptAt, now),
  );
  const candidates = await db
    .select({ id: dmarcNotification.id })
    .from(dmarcNotification)
    .where(
      and(
        due,
        opts.scope
          ? inArray(dmarcNotification.organizationId, opts.scope.organizationIds)
          : undefined,
      ),
    )
    .orderBy(asc(dmarcNotification.nextAttemptAt))
    .limit(opts.limit ?? 20);
  let claimed = 0;
  for (const candidate of candidates) {
    const [row] = await db
      .update(dmarcNotification)
      .set({
        attemptCount: sql`${dmarcNotification.attemptCount} + 1`,
        nextAttemptAt: new Date(now.getTime() + DMARC_NOTIFICATION_LEASE_MS),
      })
      .where(and(due, eq(dmarcNotification.id, candidate.id)))
      .returning();
    if (!row) continue;
    claimed++;
    await deliver(row, deps, now);
  }
  return claimed;
}

async function deliver(
  row: DmarcNotificationRow,
  deps: DmarcNotificationDeps,
  now: Date,
): Promise<void> {
  const thisRow = and(
    eq(dmarcNotification.id, row.id),
    eq(dmarcNotification.organizationId, row.organizationId),
  );
  const settle = (values: Partial<typeof dmarcNotification.$inferInsert>) =>
    db
      .update(dmarcNotification)
      .set({ nextAttemptAt: null, ...values })
      .where(thisRow);
  try {
    const content = await notificationContent(row, deps, now);
    if ("skip" in content) {
      await settle({ status: "skipped", lastError: content.skip });
      return;
    }
    for (const recipient of content.recipients) {
      await deps.notifier.send({
        idempotencyKey: `${row.id}:${recipient.userId}`,
        to: recipient.email,
        ...content.message,
      });
    }
    await settle({
      status: "sent",
      recipients: content.recipients.map((recipient) => recipient.email),
      sentAt: now,
      lastError: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[email:dmarc] notification ${row.id} (${row.organizationId}) failed:`, error);
    if (row.attemptCount >= MAX_DMARC_NOTIFICATION_ATTEMPTS) {
      await settle({ status: "failed", lastError: message });
    } else {
      await db
        .update(dmarcNotification)
        .set({
          nextAttemptAt: new Date(now.getTime() + retryDelayMs(row.attemptCount)),
          lastError: message,
        })
        .where(thisRow);
    }
  }
}

type Recipient = { userId: string; email: string };
type Message = Pick<Notice, "subject" | "text" | "html">;

async function notificationContent(
  row: DmarcNotificationRow,
  deps: DmarcNotificationDeps,
  now: Date,
): Promise<{ skip: string } | { recipients: Recipient[]; message: Message }> {
  const { organizationId } = row;
  if (now.getTime() - row.createdAt.getTime() > MAX_DMARC_NOTIFICATION_AGE_MS) {
    return { skip: "Too old to send." };
  }
  const [target] = await db
    .select()
    .from(domain)
    .where(and(eq(domain.id, row.domainId), eq(domain.organizationId, organizationId)));
  const [org] = await db
    .select({ name: organization.name, slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, organizationId));
  if (!target || !org || target.status === "deleting") {
    return { skip: "The domain or its organization is gone." };
  }
  if (target.dmarcPolicyChangedAt?.getTime() !== row.policyChangedAt?.getTime()) {
    return { skip: "The domain's DMARC policy changed since." };
  }
  let detail = row.detail;
  if (row.kind === "ready_quarantine" || row.kind === "ready_reject") {
    const policy = row.kind === "ready_quarantine" ? "quarantine" : "reject";
    // The record as of now: one queued earlier would undo DNS changes made since.
    const record = await dmarcReadyRecord(target, policy, deps.dmarcReportDomain ?? null, now);
    if (!record) return { skip: "No longer ready: later reports or DNS changed the checks." };
    detail = { ...detail, record };
  }
  // Verified addresses only: anyone can sign up with someone else's address.
  const recipients = await db
    .select({ userId: user.id, email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, organizationId),
        sql`string_to_array(${member.role}, ',') && ARRAY[${sql.join(
          NOTIFIED_ROLES.map((role) => sql`${role}`),
          sql`, `,
        )}]::text[]`,
        eq(user.emailVerified, true),
        or(isNull(user.banned), ne(user.banned, true)),
      ),
    )
    .orderBy(asc(member.createdAt));
  if (!recipients.length) return { skip: "No owner or admin with a verified email address." };
  const message = renderDmarcNotification({
    kind: row.kind,
    domain: target.name,
    organizationName: org.name,
    detail,
    url: new URL(
      orgLinkHref(org.slug, `/email/domains/${row.domainId}/dmarc`),
      deps.dashboardUrl,
    ).toString(),
  });
  return { recipients, message };
}

// ---------------------------------------------------------------------------------------------
// Content. Customer-facing: the domain, the record to publish and rates the dashboard shows;
// never source addresses from the reports.
// ---------------------------------------------------------------------------------------------

export function renderDmarcNotification(input: {
  kind: DmarcNotificationRow["kind"];
  domain: string;
  organizationName: string;
  detail: Record<string, unknown>;
  url: string;
}): Message {
  const { domain: name } = input;
  const blocks: EmailBlock[] = [];
  let subject: string;
  const record = typeof input.detail.record === "string" ? input.detail.record : null;
  if (input.kind === "ready_quarantine" || input.kind === "ready_reject") {
    const policy = input.kind === "ready_quarantine" ? "quarantine" : "reject";
    subject = `${name} is ready for DMARC p=${policy}`;
    blocks.push({
      paragraph:
        policy === "quarantine"
          ? `The DMARC reports for ${name} show its mail authenticates: for ${DMARC_READINESS.windowDays} days, mail sent through coss.com has passed DMARC and no other source with real volume fails it. You can now ask mailbox providers to quarantine mail that fails DMARC, so spoofed mail lands in spam.`
          : `${name} has quarantined mail that fails DMARC for ${DMARC_READINESS.daysAtQuarantine} days without its own mail failing. You can now ask mailbox providers to reject mail that fails DMARC, so spoofed mail is never delivered.`,
    });
    if (record) {
      blocks.push({ paragraph: `Replace the TXT record at _dmarc.${name} with:` });
      blocks.push({ code: record });
    }
    blocks.push({
      paragraph:
        "coss.com keeps reading the reports after the change. Nothing changes until you update DNS.",
    });
  } else {
    const rate =
      typeof input.detail.coss_pass_rate === "number" ? input.detail.coss_pass_rate : null;
    const policy = input.detail.policy === "reject" ? "reject" : "quarantine";
    subject = `Mail from ${name} is failing DMARC`;
    blocks.push({
      paragraph: `DMARC reports show that ${rate === null ? "some" : `only ${(rate * 100).toFixed(1)}% of the`} mail ${name} sends through coss.com passes DMARC. Its policy is p=${policy}, so mailbox providers ${policy === "reject" ? "reject" : "move to spam"} the rest.`,
    });
    blocks.push({
      paragraph:
        "Check the domain's DKIM and MAIL FROM records in the dashboard, and that the From address of your emails is on this domain.",
    });
  }
  blocks.push({ button: { label: "View the DMARC reports", url: input.url } });
  return renderEmail({
    subject,
    blocks,
    reason: `You're receiving this because you're an owner or admin of ${oneLine(input.organizationName)} on coss.com.`,
  });
}
