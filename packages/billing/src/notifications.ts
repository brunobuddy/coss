/**
 * Billing emails (usage alerts, payment failures, holds, invoices coss.com sends itself): queued in
 * the transaction that decides them (`enqueueBillingNotification`, once per `dedupe_key`), sent
 * by the worker through a `BillingNotifier` (the email product, wired by the worker). They go to
 * the account's billing email (and cc), else to the organization's owners and admins, and to the
 * member a notification is also for (`user_id`: their budget), while they are still a member.
 */

import { settingsHref } from "@coss/dashboard-routes";
import { db, type Executor, schema } from "@coss/db";
import { type EmailBlock, oneLine, renderEmail } from "@coss/email-layout";
import { enqueuePush, type PushKind } from "@coss/push";
import { and, asc, eq, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { formatCents } from "./money.ts";

const { billingAccount, billingInvoice, billingNotification, member, organization, user } = schema;

const MINUTE = 60 * 1000;
export const BILLING_NOTIFICATION_LEASE_MS = 5 * MINUTE;
export const MAX_BILLING_NOTIFICATION_ATTEMPTS = 8;
/** Older notifications are skipped rather than sent late. */
export const MAX_BILLING_NOTIFICATION_AGE_MS = 3 * 24 * 60 * MINUTE;
const NOTIFIED_ROLES = ["owner", "admin"];

export type BillingNotificationKind =
  | "usage_threshold"
  | "spend_limit_reached"
  | "usage_charged"
  | "credit_limit_warning"
  | "credit_limit_reached"
  | "payment_failed"
  | "payment_action_required"
  | "invoice_issued"
  | "invoice_reminder"
  | "hold_placed"
  | "hold_lifted"
  | "contract_ending"
  | "budget_threshold"
  | "budget_paused";

/** One email to one address. */
export type BillingNotice = {
  idempotencyKey: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

/** Delivers a notice; throws when it could not (the notification is retried). */
export type BillingNotifier = { send(notice: BillingNotice): Promise<void> };

export type BillingNotificationDeps = {
  notifier: BillingNotifier;
  /** Origin of the dashboard, for links. */
  dashboardUrl: string;
};

/** Development only: prints notices to the console. */
export const logBillingNotifier: BillingNotifier = {
  async send(notice) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("[billing] No notification sender configured in production.");
    }
    console.info(`\n[billing] Email to ${notice.to}: ${notice.subject}\n\n${notice.text}\n`);
  },
};

export async function enqueueBillingNotification(
  tx: Executor,
  input: {
    organizationId: string;
    kind: BillingNotificationKind;
    dedupeKey: string;
    payload: Record<string, unknown>;
    /** A member it is also for (their budget). */
    userId?: string | null;
    now?: Date;
  },
): Promise<boolean> {
  const now = input.now ?? new Date();
  // Final invoices outlive their organization: nobody is left to tell (and the row's FK needs it).
  const [org] = await tx
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, input.organizationId));
  if (!org) return false;
  const inserted = await tx
    .insert(billingNotification)
    .values({
      organizationId: input.organizationId,
      kind: input.kind,
      userId: input.userId ?? null,
      dedupeKey: input.dedupeKey,
      payload: input.payload,
      nextAttemptAt: now,
      createdAt: now,
    })
    .onConflictDoNothing({ target: billingNotification.dedupeKey })
    .returning({ id: billingNotification.id });
  // Whether it is new (each dedupe key is sent once).
  if (!inserted.length) return false;
  const push = PUSHED[input.kind];
  if (push) {
    await enqueuePush(tx, {
      organizationId: input.organizationId,
      kind: push.kind,
      subjectId: push.subject(input.payload),
      now,
    });
  }
  return true;
}

/** Billing notifications that are also pushed to the iOS app: the ones that stop or risk sending. */
const PUSHED: Partial<
  Record<
    BillingNotificationKind,
    { kind: PushKind; subject(payload: Record<string, unknown>): string }
  >
> = {
  payment_failed: {
    kind: "billing_payment_failed",
    subject: (payload) => String(payload.invoiceId),
  },
  hold_placed: { kind: "billing_hold_placed", subject: () => "delinquent" },
  spend_limit_reached: { kind: "billing_hold_placed", subject: () => "spend_limit" },
  credit_limit_reached: { kind: "billing_hold_placed", subject: () => "credit_limit" },
  budget_paused: {
    kind: "billing_budget_paused",
    subject: (payload) => `${payload.scope}:${payload.targetId}`,
  },
};

export async function listBillingNotifications(organizationId: string) {
  return db
    .select()
    .from(billingNotification)
    .where(eq(billingNotification.organizationId, organizationId))
    .orderBy(asc(billingNotification.createdAt));
}

function retryDelayMs(attempt: number): number {
  return Math.min(2 ** (attempt - 1) * MINUTE, 60 * MINUTE);
}

type NotificationRow = typeof billingNotification.$inferSelect;

export async function runDueBillingNotifications(
  opts: { now?: Date; limit?: number; scope?: { organizationIds: string[] } },
  deps: BillingNotificationDeps,
): Promise<number> {
  const now = opts.now ?? new Date();
  const due = and(
    eq(billingNotification.status, "pending"),
    isNotNull(billingNotification.nextAttemptAt),
    lte(billingNotification.nextAttemptAt, now),
  );
  const candidates = await db
    .select({ id: billingNotification.id })
    .from(billingNotification)
    .where(
      and(
        due,
        opts.scope
          ? inArray(billingNotification.organizationId, opts.scope.organizationIds)
          : undefined,
      ),
    )
    .orderBy(asc(billingNotification.nextAttemptAt))
    .limit(opts.limit ?? 20);
  let claimed = 0;
  for (const candidate of candidates) {
    const [row] = await db
      .update(billingNotification)
      .set({
        attemptCount: sql`${billingNotification.attemptCount} + 1`,
        nextAttemptAt: new Date(now.getTime() + BILLING_NOTIFICATION_LEASE_MS),
      })
      .where(and(due, eq(billingNotification.id, candidate.id)))
      .returning();
    if (!row) continue;
    claimed++;
    await deliver(row, deps, now);
  }
  return claimed;
}

async function deliver(row: NotificationRow, deps: BillingNotificationDeps, now: Date) {
  const thisRow = and(
    eq(billingNotification.id, row.id),
    eq(billingNotification.organizationId, row.organizationId),
  );
  const settle = (values: Partial<typeof billingNotification.$inferInsert>) =>
    db
      .update(billingNotification)
      .set({ nextAttemptAt: null, ...values })
      .where(thisRow);
  try {
    if (now.getTime() - row.createdAt.getTime() > MAX_BILLING_NOTIFICATION_AGE_MS) {
      await settle({ status: "skipped", lastError: "Too old to send." });
      return;
    }
    const [org] = await db
      .select({ name: organization.name, slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, row.organizationId));
    if (!org) {
      await settle({ status: "skipped", lastError: "The organization is gone." });
      return;
    }
    const recipients = await recipientsOf(row.organizationId, row.userId);
    if (!recipients.length) {
      await settle({ status: "skipped", lastError: "Nobody to send it to." });
      return;
    }
    const message = await renderBillingNotification(row, org, deps.dashboardUrl);
    for (const to of recipients) {
      await deps.notifier.send({ idempotencyKey: `${row.id}:${to}`, to, ...message });
    }
    await settle({ status: "sent", recipients, sentAt: now, lastError: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[billing] notification ${row.id} (${row.organizationId}) failed:`, error);
    if (row.attemptCount >= MAX_BILLING_NOTIFICATION_ATTEMPTS) {
      await settle({ status: "failed", lastError: message });
    } else {
      await db
        .update(billingNotification)
        .set({
          nextAttemptAt: new Date(now.getTime() + retryDelayMs(row.attemptCount)),
          lastError: message,
        })
        .where(thisRow);
    }
  }
}

/**
 * The account's billing email and cc, else verified owners and admins; plus `userId` while they
 * are a verified member who isn't banned.
 */
async function recipientsOf(organizationId: string, userId: string | null): Promise<string[]> {
  const [account] = await db
    .select({ email: billingAccount.billingEmail, cc: billingAccount.billingCc })
    .from(billingAccount)
    .where(eq(billingAccount.organizationId, organizationId));
  const own = userId ? await memberEmail(organizationId, userId) : null;
  const extra = own ? [own] : [];
  if (account?.email) return [...new Set([account.email, ...account.cc, ...extra])];
  const rows = await db
    .select({ email: user.email })
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
  return [...new Set([...rows.map((row) => row.email), ...(account?.cc ?? []), ...extra])];
}

async function memberEmail(organizationId: string, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, organizationId),
        eq(member.userId, userId),
        eq(user.emailVerified, true),
        or(isNull(user.banned), ne(user.banned, true)),
      ),
    );
  return row?.email ?? null;
}

type Message = Pick<BillingNotice, "subject" | "text" | "html">;

async function renderBillingNotification(
  row: NotificationRow,
  org: { name: string; slug: string },
  dashboardUrl: string,
): Promise<Message> {
  const payload = row.payload as Record<string, string | number | undefined>;
  const name = org.name;
  const billingUrl = new URL(`/${org.slug}/settings/billing`, dashboardUrl).toString();
  const spendUrl = new URL(settingsHref(org.slug, "/spend"), dashboardUrl).toString();
  let link = { label: "Open billing", url: billingUrl };
  const blocks: EmailBlock[] = [];
  let subject: string;
  const invoice = payload.invoiceId
    ? (
        await db
          .select()
          .from(billingInvoice)
          .where(
            and(
              eq(billingInvoice.id, String(payload.invoiceId)),
              eq(billingInvoice.organizationId, row.organizationId),
            ),
          )
      )[0]
    : undefined;
  const invoiceLabel = invoice?.number ?? "your invoice";
  const due = invoice ? formatCents(invoice.amountDueCents) : "";
  switch (row.kind as BillingNotificationKind) {
    case "usage_threshold": {
      subject = `${name} has used ${payload.percent}% of this month's ${payload.what}`;
      blocks.push({
        paragraph: `${name} has used ${payload.percent}% of its ${payload.what} for ${payload.period}.`,
      });
      blocks.push({
        paragraph:
          payload.blocked === "true"
            ? "Usage stops at the limit until the next billing period. Upgrade to keep sending."
            : "Usage beyond your plan's credit is billed at your plan's rates.",
      });
      break;
    }
    case "spend_limit_reached":
      subject = `Live sending is paused: ${name} reached its spend limit`;
      blocks.push({
        paragraph: `${name}'s usage beyond its plan credit reached its spend limit of ${payload.limit}. Live sending is paused until the next billing period, or until an owner raises the limit.`,
      });
      break;
    case "usage_charged":
      subject = `We charged ${payload.amount} for usage so far (${name})`;
      blocks.push({
        paragraph: `${name}'s usage this month reached its ${payload.threshold} billing threshold, so we're charging ${payload.amount} to your payment method on invoice ${invoiceLabel}. It comes off this month's invoice, so you only pay for it once.`,
      });
      break;
    case "credit_limit_warning":
      subject = `${name} is close to its credit limit`;
      blocks.push({
        paragraph: `${name} has ${payload.used} of its ${payload.limit} credit limit in use. The limit covers usage not yet invoiced, unpaid invoices and recent charges, and live sending pauses when it's reached.`,
      });
      blocks.push({
        paragraph:
          "It rises on its own as payments settle. If you expect to need more sooner, ask support to raise it.",
      });
      break;
    case "credit_limit_reached":
      subject = `Live sending is paused: ${name} ${payload.cause === "over_limit" ? "reached its credit limit" : "has a payment problem"}`;
      blocks.push({
        paragraph:
          payload.cause === "fraud_dispute"
            ? `A payment for ${name} was disputed as fraudulent, so live sending is paused until coss.com support has looked at it. Sandbox keys still work, and scheduled emails are held, not lost.`
            : payload.cause === "charge_failed"
              ? `We couldn't charge ${name}'s usage so far, so live sending is paused. Sandbox keys still work, and scheduled emails are held, not lost. Sending resumes once the charge is paid: check your payment method.`
              : `${name} reached its ${payload.limit} credit limit, so live sending is paused. Sandbox keys still work, and scheduled emails are held, not lost. The limit rises as payments settle: pay anything open, or ask support to raise it.`,
      });
      break;
    case "payment_failed":
      subject = `Payment failed for ${invoiceLabel} (${name})`;
      blocks.push({
        paragraph: `We couldn't collect ${due} for ${invoiceLabel}${payload.error ? `: ${payload.error}` : "."} We'll try again; please check your payment method.`,
      });
      break;
    case "payment_action_required":
      subject = `Confirm your payment for ${invoiceLabel} (${name})`;
      blocks.push({
        paragraph: `Your bank needs you to confirm the payment of ${due} for ${invoiceLabel}.`,
      });
      if (invoice?.hostedUrl)
        blocks.push({ button: { label: "Confirm the payment", url: invoice.hostedUrl } });
      break;
    case "invoice_issued":
      subject = `Invoice ${invoiceLabel} from coss.com (${name})`;
      blocks.push({
        paragraph: `Invoice ${invoiceLabel} for ${due} is due ${invoice?.dueAt?.toISOString().slice(0, 10) ?? "now"}.`,
      });
      if (invoice?.hostedUrl)
        blocks.push({ button: { label: "View and pay the invoice", url: invoice.hostedUrl } });
      break;
    case "invoice_reminder":
      subject = `Reminder: ${invoiceLabel} is ${payload.overdue === "true" ? "overdue" : "due soon"} (${name})`;
      blocks.push({
        paragraph: `${invoiceLabel} for ${due} ${payload.overdue === "true" ? "is overdue" : `is due ${invoice?.dueAt?.toISOString().slice(0, 10) ?? "soon"}`}.`,
      });
      if (invoice?.hostedUrl)
        blocks.push({ button: { label: "Pay the invoice", url: invoice.hostedUrl } });
      break;
    case "hold_placed":
      subject = `Live sending is paused for ${name}: an invoice is overdue`;
      blocks.push({
        paragraph: `${invoiceLabel} is overdue, so live sending for ${name} is paused. Sandbox keys still work, and scheduled emails are held, not lost. Sending resumes as soon as the invoice is paid.`,
      });
      break;
    case "hold_lifted":
      subject = `Live sending has resumed for ${name}`;
      blocks.push({
        paragraph:
          payload.reason === "credit_limit"
            ? `${name} is back within its credit limit, so live sending has resumed.`
            : `Thanks — nothing is overdue anymore, so live sending for ${name} has resumed.`,
      });
      break;
    case "budget_threshold": {
      const target = oneLine(String(payload.target));
      subject = `${target} has used ${payload.percent}% of a monthly budget (${name})`;
      blocks.push({
        paragraph: `${target} has used ${payload.percent}% of its ${payload.amount} monthly budget in ${name} for ${payload.period} (${payload.spent} so far).`,
      });
      blocks.push({
        paragraph:
          "Over the budget, its live sending is paused until next month, or until an owner raises the budget.",
      });
      link = { label: "Open spend", url: spendUrl };
      break;
    }
    case "budget_paused": {
      const target = oneLine(String(payload.target));
      subject = `Live sending is paused for ${target}: its budget is used up (${name})`;
      blocks.push({
        paragraph: `${target} went over its ${payload.amount} monthly budget in ${name} for ${payload.period}, so its live sending is paused. Other keys and sandbox keys still work. Sending resumes next month, or as soon as an owner raises the budget.`,
      });
      link = { label: "Open spend", url: spendUrl };
      break;
    }
    case "contract_ending":
      subject = `${name}'s contract ends on ${payload.endsOn}`;
      blocks.push({
        paragraph: `${name}'s contract ends on ${payload.endsOn}. After that, ${payload.next}. Contact your account manager to renew.`,
      });
      break;
    default:
      subject = `Billing update for ${name}`;
  }
  // The invoice's own page, when there is one, is the call to action; billing is then a link.
  blocks.push(blocks.some((block) => "button" in block) ? { link } : { button: link });
  return renderEmail({
    subject,
    blocks,
    reason: row.userId
      ? `You're receiving this because you're the billing contact, an owner or an admin of ${name} on coss.com, or the member the budget is for.`
      : `You're receiving this because you're the billing contact, an owner or an admin of ${name} on coss.com.`,
  });
}
