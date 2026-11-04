/**
 * Payment provider events (Stripe webhooks): stored as received by the dashboard's webhook route
 * (`storeProviderEvent`, after the signature check), applied by the worker
 * (`runDueBillingEvents`). The provider re-reads each object, and states only move forward
 * (`paid` is final), so late, repeated and out-of-order events are harmless.
 */
import { db, schema } from "@coss/db";
import { and, asc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { BillingAccount } from "./accounts.ts";
import { cancelContract, contractPendingOn } from "./contracts.ts";
import { checkOrganizationCredit } from "./credit.ts";
import { evaluateStanding } from "./holds.ts";
import { lockInvoice } from "./invoices.ts";
import { enqueueBillingNotification } from "./notifications.ts";
import { recordProviderPayment, voidInvoice } from "./payments.ts";
import {
  type BillingProviders,
  type ProviderOutcome,
  providerFor,
  type ReceivedProviderEvent,
} from "./providers/provider.ts";
import { applyCollection } from "./sync.ts";

const { billingAccount, billingInvoice, billingProviderEvent } = schema;

const MINUTE = 60 * 1000;
const LEASE_MS = 5 * MINUTE;
const MAX_ATTEMPTS = 10;

/** Stores a verified event once (a repeated delivery is a no-op). Returns whether it was new. */
export async function storeProviderEvent(
  provider: BillingAccount["provider"],
  event: ReceivedProviderEvent,
): Promise<boolean> {
  const inserted = await db
    .insert(billingProviderEvent)
    .values({
      provider,
      providerEventId: event.id,
      type: event.type,
      payload: event.payload,
      nextAttemptAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: billingProviderEvent.id });
  return inserted.length > 0;
}

export async function runDueBillingEvents(
  opts: { now?: Date; limit?: number },
  deps: { providers: BillingProviders; systemOrganizationId?: string | null },
): Promise<number> {
  const now = opts.now ?? new Date();
  const due = and(
    eq(billingProviderEvent.status, "pending"),
    isNotNull(billingProviderEvent.nextAttemptAt),
    lte(billingProviderEvent.nextAttemptAt, now),
  );
  const candidates = await db
    .select({ id: billingProviderEvent.id })
    .from(billingProviderEvent)
    .where(due)
    .orderBy(asc(billingProviderEvent.createdAt))
    .limit(opts.limit ?? 20);
  let claimed = 0;
  for (const candidate of candidates) {
    const [row] = await db
      .update(billingProviderEvent)
      .set({
        attemptCount: sql`${billingProviderEvent.attemptCount} + 1`,
        nextAttemptAt: new Date(now.getTime() + LEASE_MS),
      })
      .where(and(due, eq(billingProviderEvent.id, candidate.id)))
      .returning();
    if (!row) continue;
    claimed++;
    const settle = (values: Partial<typeof billingProviderEvent.$inferInsert>) =>
      db
        .update(billingProviderEvent)
        .set({ nextAttemptAt: null, ...values })
        .where(eq(billingProviderEvent.id, row.id));
    try {
      const provider = providerFor(deps.providers, row.provider);
      const outcomes = await provider.interpretEvent({
        id: row.providerEventId,
        type: row.type,
        payload: row.payload,
      });
      for (const outcome of outcomes) await applyOutcome(outcome, row.provider, deps, now);
      await settle({
        status: outcomes.length ? "processed" : "ignored",
        processedAt: now,
        lastError: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[billing] provider event ${row.providerEventId} failed:`, error);
      if (row.attemptCount >= MAX_ATTEMPTS) {
        await settle({ status: "failed", lastError: message });
      } else {
        await db
          .update(billingProviderEvent)
          .set({
            nextAttemptAt: new Date(
              now.getTime() + Math.min(2 ** (row.attemptCount - 1), 60) * MINUTE,
            ),
            lastError: message,
          })
          .where(eq(billingProviderEvent.id, row.id));
      }
    }
  }
  return claimed;
}

async function invoiceByProviderId(
  provider: BillingAccount["provider"],
  providerInvoiceId: string,
) {
  const [row] = await db
    .select()
    .from(billingInvoice)
    .where(
      and(
        eq(billingInvoice.provider, provider),
        eq(billingInvoice.providerInvoiceId, providerInvoiceId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Applies one outcome. Unknown invoices (not coss.com's) are ignored. */
export async function applyOutcome(
  outcome: ProviderOutcome,
  provider: BillingAccount["provider"],
  deps: { systemOrganizationId?: string | null },
  now: Date,
): Promise<void> {
  switch (outcome.kind) {
    case "invoice_paid": {
      const invoice = await invoiceByProviderId(provider, outcome.providerInvoiceId);
      if (!invoice) return;
      await db.transaction(async (tx) => {
        const locked = await lockInvoice(tx, invoice.id);
        if (!locked) return;
        await recordProviderPayment(
          tx,
          locked,
          {
            amountCents: outcome.amountCents,
            method: outcome.method,
            providerPaymentId: outcome.paymentId,
            receivedAt: now,
          },
          now,
          deps,
        );
      });
      return;
    }
    case "invoice_payment_failed": {
      const invoice = await invoiceByProviderId(provider, outcome.providerInvoiceId);
      // Charges coss.com made itself report their failure synchronously; only async ones (a
      // direct debit that bounced days later) arrive here.
      if (invoice?.status !== "open" || invoice.paymentState !== "processing") return;
      await applyCollection(invoice, { state: "failed", error: outcome.error }, deps, now);
      return;
    }
    case "invoice_payment_processing": {
      const invoice = await invoiceByProviderId(provider, outcome.providerInvoiceId);
      if (invoice?.status !== "open") return;
      await db
        .update(billingInvoice)
        .set({
          paymentState: "processing",
          paymentError: null,
          nextCollectionAt: null,
          syncAction: null,
          nextSyncAt: null,
        })
        .where(and(eq(billingInvoice.id, invoice.id), eq(billingInvoice.status, "open")));
      return;
    }
    case "invoice_action_required": {
      const invoice = await invoiceByProviderId(provider, outcome.providerInvoiceId);
      if (invoice?.status !== "open" || invoice.paymentState === "requires_action") return;
      await applyCollection(
        invoice,
        { state: "requires_action", hostedUrl: outcome.hostedUrl },
        deps,
        now,
      );
      return;
    }
    case "invoice_voided": {
      const invoice = await invoiceByProviderId(provider, outcome.providerInvoiceId);
      if (!invoice || (invoice.status !== "open" && invoice.status !== "draft")) return;
      // Voided at the provider (e.g. by staff in Stripe): mirror it, without pushing it back.
      const voided = await voidInvoice({
        organizationId: invoice.organizationId,
        invoiceId: invoice.id,
        actor: null,
        reason: "Voided at the payment provider.",
        now,
      });
      await db
        .update(billingInvoice)
        .set({ syncAction: null, nextSyncAt: null })
        .where(eq(billingInvoice.id, voided.id));
      return;
    }
    case "invoice_uncollectible": {
      const invoice = await invoiceByProviderId(provider, outcome.providerInvoiceId);
      if (invoice?.status !== "open") return;
      await db.transaction(async (tx) => {
        const locked = await lockInvoice(tx, invoice.id);
        if (locked?.status !== "open") return;
        const [row] = await tx
          .update(billingInvoice)
          .set({
            status: "uncollectible",
            nextCollectionAt: null,
            syncAction: null,
            nextSyncAt: null,
          })
          .where(and(eq(billingInvoice.id, invoice.id), eq(billingInvoice.status, "open")))
          .returning();
        if (!row) return;
        // Nothing will pay for an upgrade waiting on it.
        const pending = await contractPendingOn(row.id, tx);
        if (pending) await cancelContract(tx, pending.id, now);
        await evaluateStanding(tx, row.accountId, now, deps.systemOrganizationId);
      });
      return;
    }
    case "payment_method_updated": {
      await db
        .update(billingAccount)
        .set({ paymentMethod: outcome.method })
        .where(
          and(
            eq(billingAccount.provider, provider),
            eq(billingAccount.providerCustomerId, outcome.customerId),
          ),
        );
      return;
    }
    case "dispute_opened": {
      const invoice = outcome.providerInvoiceId
        ? await invoiceByProviderId(provider, outcome.providerInvoiceId)
        : null;
      console.warn(
        `[billing] dispute opened (${outcome.reason}) for ${invoice?.id ?? outcome.customerId ?? "an unknown payment"}`,
      );
      if (invoice) {
        await db
          .update(billingInvoice)
          .set({ paymentState: "disputed", paymentError: outcome.reason })
          .where(eq(billingInvoice.id, invoice.id));
        await enqueueBillingNotification(db, {
          organizationId: invoice.organizationId,
          kind: "payment_failed",
          dedupeKey: `dispute:${invoice.id}`,
          payload: { invoiceId: invoice.id, error: "the payment was disputed" },
          now,
        });
        // A cardholder saying it wasn't them is the signal a stolen card gives: act on it now.
        if (invoice.organizationId !== deps.systemOrganizationId) {
          await checkOrganizationCredit(invoice.organizationId, now);
        }
      }
      return;
    }
  }
}

/** Events awaiting processing or failed (the admin overview). */
export async function providerEventBacklog() {
  return db
    .select()
    .from(billingProviderEvent)
    .where(inArray(billingProviderEvent.status, ["pending", "failed"]))
    .orderBy(asc(billingProviderEvent.createdAt))
    .limit(100);
}

/**
 * Asks the provider about open invoices that haven't changed for an hour (a lost webhook, a
 * debit that settled quietly) and applies what it says. Returns how many were checked.
 */
export async function reconcileOpenInvoices(
  opts: { now?: Date; limit?: number },
  deps: { providers: BillingProviders; systemOrganizationId?: string | null },
): Promise<number> {
  const now = opts.now ?? new Date();
  const stale = await db
    .select()
    .from(billingInvoice)
    .where(
      and(
        eq(billingInvoice.status, "open"),
        isNotNull(billingInvoice.providerInvoiceId),
        lte(billingInvoice.updatedAt, new Date(now.getTime() - 60 * MINUTE)),
      ),
    )
    .orderBy(asc(billingInvoice.updatedAt))
    .limit(opts.limit ?? 50);
  for (const invoice of stale) {
    try {
      const provider = providerFor(deps.providers, invoice.provider);
      const state = await provider.fetchInvoice({ invoice, lines: [], account: null });
      const providerInvoiceId = invoice.providerInvoiceId ?? "";
      if (state?.status === "paid") {
        await applyOutcome(
          {
            kind: "invoice_paid",
            providerInvoiceId,
            paymentId: state.paymentId,
            amountCents: state.paidCents,
            method: state.method ?? invoice.provider,
          },
          invoice.provider,
          deps,
          now,
        );
      } else if (state?.status === "void") {
        await applyOutcome(
          { kind: "invoice_voided", providerInvoiceId },
          invoice.provider,
          deps,
          now,
        );
      } else if (state?.status === "uncollectible") {
        await applyOutcome(
          { kind: "invoice_uncollectible", providerInvoiceId },
          invoice.provider,
          deps,
          now,
        );
      }
    } catch (error) {
      console.error(`[billing] reconciling invoice ${invoice.id} failed:`, error);
    }
    // Checked: the next look is an hour away (`updated_at` moves).
    await db
      .update(billingInvoice)
      .set({ updatedAt: now })
      .where(and(eq(billingInvoice.id, invoice.id), eq(billingInvoice.status, "open")));
  }
  return stale.length;
}
