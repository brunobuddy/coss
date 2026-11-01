/**
 * Notification emails to an organization's owners and admins when the guard (or an admin) warns
 * or suspends it. `applyTransition` writes a `reputation_notification` row in its transaction;
 * the worker sends it later through a `ReputationNotifier` (the email product, wired by the
 * worker: this package never imports a product). System-level: the scan spans organizations, and
 * every read and write is scoped by the notification's own organization.
 */

import { orgLinkHref } from "@coss/dashboard-routes";
import { db, type Executor, schema } from "@coss/db";
import { type EmailBlock, oneLine, renderEmail } from "@coss/email-layout";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { CheckResult } from "./checks.ts";
import { triggerLabel } from "./schemas.ts";
import { metricsSnapshot } from "./standing.ts";
import type { MarketingTransitionType, TransitionType } from "./transitions.ts";

const { member, organization, reputationEvent, reputationNotification, user } = schema;

const MINUTE = 60 * 1000;
/** Transitions that email the organization. Recoveries and reinstatements only show in the app. */
export const NOTIFIED_TRANSITIONS: ReadonlySet<TransitionType | MarketingTransitionType> = new Set([
  "warning_raised",
  "suspended",
  "marketing_paused",
]);
const TRANSITION_TYPES: TransitionType[] = [
  "warning_raised",
  "warning_cleared",
  "suspended",
  "reinstated",
];
const MARKETING_TRANSITION_TYPES: MarketingTransitionType[] = [
  "marketing_paused",
  "marketing_reinstated",
];
/** A claimed notification is not picked up by another worker for this long. */
export const NOTIFICATION_LEASE_MS = 5 * MINUTE;
/** Attempts before a notification is given up as `failed` (backoff 1, 2, 4… min, about 2 h). */
export const MAX_NOTIFICATION_ATTEMPTS = 8;
/** Older notifications are skipped rather than sent late (e.g. while sending was unconfigured). */
export const MAX_NOTIFICATION_AGE_MS = 3 * 24 * 60 * MINUTE;
/** Roles that hear about their organization's standing. */
const NOTIFIED_ROLES = ["owner", "admin"];

/** One email to one person. */
export type ReputationNotice = {
  /** Stable per notification and recipient: senders pass it as their idempotency key. */
  idempotencyKey: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

/** Delivers a notice; throws when it could not (the notification is retried). */
export type ReputationNotifier = {
  send(notice: ReputationNotice): Promise<void>;
};

export type ReputationNotificationDeps = {
  notifier: ReputationNotifier;
  /** Origin of the dashboard, for links (`BETTER_AUTH_URL`). */
  dashboardUrl: string;
};

export type ReputationNotificationRow = typeof reputationNotification.$inferSelect;

/** Development only: prints notices to the console, like the dev auth emails. */
export const logReputationNotifier: ReputationNotifier = {
  async send(notice) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("[reputation] No notification sender configured in production.");
    }
    console.info(`\n[reputation] Email to ${notice.to}: ${notice.subject}\n\n${notice.text}\n`);
  },
};

/** Queues the notification of a transition, in the transition's transaction. */
export async function enqueueReputationNotification(
  tx: Executor,
  input: {
    organizationId: string;
    reputationEventId: string;
    type: TransitionType | MarketingTransitionType;
    now: Date;
  },
): Promise<void> {
  if (!NOTIFIED_TRANSITIONS.has(input.type)) return;
  await tx.insert(reputationNotification).values({
    organizationId: input.organizationId,
    reputationEventId: input.reputationEventId,
    type: input.type,
    nextAttemptAt: input.now,
    createdAt: input.now,
  });
}

/** The organization's notifications, newest first (tests and admin tooling). */
export async function listReputationNotifications(
  organizationId: string,
): Promise<ReputationNotificationRow[]> {
  return db
    .select()
    .from(reputationNotification)
    .where(eq(reputationNotification.organizationId, organizationId))
    .orderBy(desc(reputationNotification.createdAt), desc(reputationNotification.id));
}

/** Backoff after the `attempt`-th failed attempt (1-based): 1, 2, 4… minutes, at most an hour. */
function retryDelayMs(attempt: number): number {
  return Math.min(2 ** (attempt - 1) * MINUTE, 60 * MINUTE);
}

/**
 * Sends notifications that are due, oldest first. A notification whose transition was already
 * followed by another one (a warning that turned into a suspension, a cleared warning) is skipped:
 * only the current standing is announced. So is one older than `MAX_NOTIFICATION_AGE_MS`, or one
 * nobody can receive. Returns how many were claimed. `scope` limits the scan
 * to some organizations (tests).
 */
export async function runDueReputationNotifications(
  opts: { now?: Date; limit?: number; scope?: { organizationIds: string[] } },
  deps: ReputationNotificationDeps,
): Promise<number> {
  const now = opts.now ?? new Date();
  const due = and(
    eq(reputationNotification.status, "pending"),
    isNotNull(reputationNotification.nextAttemptAt),
    lte(reputationNotification.nextAttemptAt, now),
  );
  const candidates = await db
    .select({ id: reputationNotification.id })
    .from(reputationNotification)
    .where(
      and(
        due,
        opts.scope
          ? inArray(reputationNotification.organizationId, opts.scope.organizationIds)
          : undefined,
      ),
    )
    .orderBy(asc(reputationNotification.nextAttemptAt))
    .limit(opts.limit ?? 20);

  let claimed = 0;
  for (const candidate of candidates) {
    const [row] = await db
      .update(reputationNotification)
      .set({
        attemptCount: sql`${reputationNotification.attemptCount} + 1`,
        nextAttemptAt: new Date(now.getTime() + NOTIFICATION_LEASE_MS),
      })
      .where(and(due, eq(reputationNotification.id, candidate.id)))
      .returning();
    if (!row) continue;
    claimed++;
    await deliver(row, deps, now);
  }
  return claimed;
}

async function deliver(
  row: ReputationNotificationRow,
  deps: ReputationNotificationDeps,
  now: Date,
): Promise<void> {
  const thisRow = and(
    eq(reputationNotification.id, row.id),
    eq(reputationNotification.organizationId, row.organizationId),
  );
  const settle = (values: Partial<typeof reputationNotification.$inferInsert>) =>
    db
      .update(reputationNotification)
      .set({ nextAttemptAt: null, ...values })
      .where(thisRow);
  try {
    const content = await notificationContent(row, deps.dashboardUrl, now);
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
    console.error(`[reputation] notification ${row.id} (${row.organizationId}) failed:`, error);
    if (row.attemptCount >= MAX_NOTIFICATION_ATTEMPTS) {
      await settle({ status: "failed", lastError: message });
    } else {
      await db
        .update(reputationNotification)
        .set({
          nextAttemptAt: new Date(now.getTime() + retryDelayMs(row.attemptCount)),
          lastError: message,
        })
        .where(thisRow);
    }
  }
}

type Recipient = { userId: string; email: string };
type Message = Pick<ReputationNotice, "subject" | "text" | "html">;

async function notificationContent(
  row: ReputationNotificationRow,
  dashboardUrl: string,
  now: Date,
): Promise<{ skip: string } | { recipients: Recipient[]; message: Message }> {
  const { organizationId } = row;
  if (now.getTime() - row.createdAt.getTime() > MAX_NOTIFICATION_AGE_MS) {
    return { skip: "Too old to send." };
  }
  // Each kind is superseded by its own kind only: a marketing pause stays news after a warning.
  const marketing = row.type === "marketing_paused";
  const [latest] = await db
    .select({ id: reputationEvent.id })
    .from(reputationEvent)
    .where(
      and(
        eq(reputationEvent.organizationId, organizationId),
        inArray(reputationEvent.type, marketing ? MARKETING_TRANSITION_TYPES : TRANSITION_TYPES),
      ),
    )
    .orderBy(desc(reputationEvent.createdAt), desc(reputationEvent.id))
    .limit(1);
  if (latest?.id !== row.reputationEventId) {
    return { skip: "Superseded by a later standing change." };
  }
  const [event] = await db
    .select()
    .from(reputationEvent)
    .where(
      and(
        eq(reputationEvent.id, row.reputationEventId),
        eq(reputationEvent.organizationId, organizationId),
      ),
    );
  const [org] = await db
    .select({ name: organization.name, slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, organizationId));
  if (!event || !org) return { skip: "The organization or its history is gone." };

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

  const checks = (metricsSnapshot(event.metrics)?.checks ?? []).filter(
    (check: CheckResult) => check.severity !== "ok",
  );
  const message = renderNotification({
    type: marketing ? "marketing_paused" : row.type === "suspended" ? "suspended" : "warning",
    organizationName: org.name,
    trigger: event.trigger,
    checks: checks.map((check) => check.message),
    url: new URL(orgLinkHref(org.slug, "/email/reputation"), dashboardUrl).toString(),
  });
  return { recipients, message };
}

// ---------------------------------------------------------------------------------------------
// Content. Customer-facing: only what the dashboard and the `account.*` webhooks already show
// (the trigger and the checks' messages) — never screening scores or admin notes.
// ---------------------------------------------------------------------------------------------

const ADVICE: Record<string, string> = {
  bounce_rate:
    "Stop sending to addresses that bounce, and don't send to lists you haven't confirmed recently.",
  complaint_rate: "Only send to people who asked for your email, and make it easy to unsubscribe.",
  content_screening:
    "Review what your recent emails contain: content screening found possible spam or phishing.",
  marketing_bounce_rate:
    "Remove addresses that bounce from your marketing lists, and stop sending to contacts who haven't confirmed their address.",
  marketing_complaint_rate:
    "Send marketing only to contacts who opted in, keep the unsubscribe link prominent, and stop sending to people who don't engage.",
  sms_opt_out_rate:
    "Many of your SMS recipients replied STOP: only text people who asked for your messages, say who you are, and send less often.",
  sms_filtered_rate:
    "Carriers are filtering your SMS as spam: keep messages to what your registration describes, avoid URL shorteners, and only text people who opted in.",
  hook_failure_rate:
    "Most Hooks messages fail at your applications' endpoints: check that they are your users' real URLs, and disable or delete the ones that no longer answer.",
};

export function renderNotification(input: {
  type: "warning" | "suspended" | "marketing_paused";
  organizationName: string;
  trigger: string;
  /** Messages of the checks that were not ok. */
  checks: string[];
  url: string;
}): Message {
  const { organizationName: name } = input;
  const subjectName = oneLine(name);
  const label = triggerLabel(input.trigger);
  const advice = ADVICE[input.trigger];
  const blocks: EmailBlock[] = [];
  let subject: string;
  if (input.type === "marketing_paused") {
    subject = `Marketing sending is paused for ${subjectName}`;
    blocks.push({
      paragraph: `coss.com paused marketing sending for ${name}. Reason: ${label}.`,
    });
    if (input.checks.length) blocks.push({ list: input.checks });
    blocks.push({
      paragraph:
        "Broadcasts and other marketing emails are refused until the pause is lifted. " +
        "Transactional email (password resets, receipts, notifications) keeps going.",
    });
    if (advice) blocks.push({ paragraph: advice });
    blocks.push({
      paragraph: "A pause is never lifted automatically. Contact support to resume marketing.",
    });
  } else if (input.type === "suspended") {
    subject = `Live sending is suspended for ${subjectName}`;
    blocks.push({
      paragraph: `coss.com suspended live sending for ${name}. Reason: ${label}.`,
    });
    if (input.checks.length) blocks.push({ list: input.checks });
    blocks.push({
      paragraph:
        "Live API keys can't send email until the suspension is lifted: new sends are refused " +
        "and scheduled emails are held. Sandbox keys still work.",
    });
    if (advice) blocks.push({ paragraph: advice });
    blocks.push({
      paragraph: "A suspension is never lifted automatically. Contact support to resume sending.",
    });
  } else {
    subject = `Your sending reputation needs attention (${subjectName})`;
    blocks.push({
      paragraph:
        input.trigger === "content_screening"
          ? `Content screening flagged some of ${name}'s recent emails as possible spam or phishing.`
          : `${label} for ${name} is approaching the level at which coss.com suspends live sending automatically.`,
    });
    if (input.checks.length) blocks.push({ list: input.checks });
    if (advice) blocks.push({ paragraph: advice });
    blocks.push({
      paragraph:
        "Nothing is blocked yet. The warning clears on its own once your rates are healthy again.",
    });
  }
  blocks.push({ button: { label: "View your reputation", url: input.url } });
  return renderEmail({
    subject,
    blocks,
    reason: `You're receiving this because you're an owner or admin of ${name} on coss.com.`,
  });
}
