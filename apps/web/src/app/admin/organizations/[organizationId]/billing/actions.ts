"use server";

import {
  type AccountSettings,
  addMonths,
  type ContractTermsInput,
  createContract,
  createCreditGrant,
  createCreditNote,
  createOneOffInvoice,
  endContract,
  isMeterKey,
  type MeterKey,
  markInvoiceUncollectible,
  monthStart,
  organizationLabel,
  PAYMENT_METHOD_TYPES,
  parseContractTerms,
  parseDollarsToCents,
  periodOf,
  previousPeriod,
  recordManualPayment,
  resyncInvoice,
  setAdminHold,
  simulateTerms,
  updateBillingAccountSettings,
  voidCreditGrant,
  voidInvoice,
} from "@coss/billing";
import { refresh } from "next/cache";
import { ZodError } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { supportAudit } from "@/lib/audit";
import { defaultBillingProvider } from "@/lib/billing";
import { requirePlatformAdminAction } from "@/lib/session";

const ADMIN_REASON_MAX_LENGTH = 500;

/** The organization named by the form (platform admins act across organizations). */
async function organizationFromForm(formData: FormData): Promise<string> {
  const organizationId = formString(formData, "organizationId");
  if (!organizationId || !(await organizationLabel(organizationId))) {
    throw new ActionError("Organization not found.");
  }
  return organizationId;
}

function requiredReason(formData: FormData): string {
  const reason = formString(formData, "reason");
  if (!reason) throw new ActionError("Add a reason (it goes in the admin audit log).");
  if (reason.length > ADMIN_REASON_MAX_LENGTH) {
    throw new ActionError(`Reasons can be at most ${ADMIN_REASON_MAX_LENGTH} characters.`);
  }
  return reason;
}

function dollars(formData: FormData, name: string, label: string): bigint {
  const cents = parseDollarsToCents(formString(formData, name));
  if (cents === null) throw new ActionError(`${label}: enter dollars, like 25 or 1,250.50.`);
  return cents;
}

/** An admin's credit limit; empty means the policy decides (`0` is a limit: nothing on credit). */
function creditLimitField(formData: FormData): bigint | null {
  return formString(formData, "creditLimit")
    ? dollars(formData, "creditLimit", "Credit limit")
    : null;
}

/** `YYYY-MM-DD` (UTC midnight) or `null` when empty. */
function dateField(formData: FormData, name: string, label: string): Date | null {
  const value = formString(formData, name);
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new ActionError(`${label}: enter a date.`);
  return date;
}

/** `now` or a `YYYY-MM` month (its first instant, UTC). */
function startField(formData: FormData, name: string): Date | null {
  const value = formString(formData, name);
  if (!value || value === "now") return null;
  const date = new Date(`${value}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new ActionError("Choose when it takes effect.");
  return date;
}

function zodMessage(error: ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "terms"}: ${issue.message}`)
    .join("; ");
}

function termsFromForm(formData: FormData) {
  const raw = formString(formData, "terms");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ActionError("The terms aren't valid JSON.");
  }
  try {
    // The stored form (amounts as strings) for `createContract`, and the parsed terms.
    return { input: json as ContractTermsInput, terms: parseContractTerms(json) };
  } catch (error) {
    if (error instanceof ZodError) throw new ActionError(`Invalid terms: ${zodMessage(error)}`);
    throw error;
  }
}

export async function updateAccountSettingsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const organizationId = await organizationFromForm(formData);
    const reason = requiredReason(formData);
    const methods = (name: string) =>
      formData
        .getAll(name)
        .filter((value): value is string => typeof value === "string")
        .filter((value) => (PAYMENT_METHOD_TYPES as readonly string[]).includes(value));
    const provider = formString(formData, "provider");
    const collectionMethod = formString(formData, "collectionMethod");
    const taxMode = formString(formData, "taxMode");
    const settings: AccountSettings = {
      provider:
        provider === "stripe" || provider === "manual" || provider === "fake"
          ? provider
          : undefined,
      collectionMethod:
        collectionMethod === "send_invoice" || collectionMethod === "charge_automatically"
          ? collectionMethod
          : undefined,
      netTermsDays: Number(formString(formData, "netTermsDays") || "30"),
      allowedPaymentMethods: methods("allowedPaymentMethods"),
      requiredPaymentMethods: methods("requiredPaymentMethods"),
      taxMode: taxMode === "stripe_automatic" ? "stripe_automatic" : "none",
      billingEmail: formString(formData, "billingEmail") || null,
      billingCc: formString(formData, "billingCc")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      billingName: formString(formData, "billingName") || null,
      taxId: formString(formData, "taxId") || null,
      graceDays: Number(formString(formData, "graceDays") || "14"),
      holdExemptUntil: dateField(formData, "holdExemptUntil", "Hold exemption"),
      creditLimitCents: creditLimitField(formData),
      notes: formString(formData, "notes") || null,
    };
    await updateBillingAccountSettings({
      organizationId,
      defaultProvider: defaultBillingProvider(),
      settings,
      actor,
      reason,
    });
    await supportAudit(organizationId, "billing.settings_updated");
    refresh();
    return null;
  });
}

export async function createContractAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const organizationId = await organizationFromForm(formData);
    const reason = requiredReason(formData);
    const { input: terms } = termsFromForm(formData);
    const kind = formString(formData, "kind");
    const termEnd = startField(formData, "termEnd");
    const { contract } = await createContract({
      contract: {
        organizationId,
        kind: kind === "internal" || kind === "self_serve" ? kind : "sales",
        terms,
        effectiveFrom: startField(formData, "effectiveFrom"),
        termEnd,
        autoRenew: formString(formData, "autoRenew") === "on" && termEnd !== null,
        reference: formString(formData, "reference") || null,
        note: formString(formData, "note") || null,
      },
      defaultProvider: defaultBillingProvider(),
      actor,
      reason,
    });
    await supportAudit(organizationId, "billing.contract_changed", {
      type: "billing_contract",
      id: contract.id,
    });
    refresh();
    return null;
  });
}

export type SimulationLine = { kind: string; description: string; amountCents: string };
export type Simulation = {
  period: string;
  simulated: { lines: SimulationLine[]; totalCents: string; warnings: string[] };
  actual: { lines: SimulationLine[]; totalCents: string };
};

/** What the draft terms would bill for this month so far and last month, next to the real thing. */
export async function simulateContractAction(
  _previous: ActionResult<Simulation[]> | null,
  formData: FormData,
): Promise<ActionResult<Simulation[]>> {
  return runAction(async () => {
    await requirePlatformAdminAction();
    const organizationId = await organizationFromForm(formData);
    const { terms } = termsFromForm(formData);
    const current = periodOf(new Date());
    const results: Simulation[] = [];
    for (const [label, period] of [
      ["Last month", previousPeriod(current)],
      ["This month so far", current],
    ] as const) {
      const { simulated, actual } = await simulateTerms({ organizationId, terms, period });
      const lines = (composition: typeof simulated) =>
        composition.lines.map((line) => ({
          kind: line.kind,
          description: line.description,
          amountCents: line.amountCents.toString(),
        }));
      results.push({
        period: label,
        simulated: {
          lines: lines(simulated),
          totalCents: simulated.totalCents.toString(),
          warnings: simulated.warnings,
        },
        actual: { lines: lines(actual), totalCents: actual.totalCents.toString() },
      });
    }
    return results;
  });
}

export async function endContractAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const organizationId = await organizationFromForm(formData);
    const reason = requiredReason(formData);
    const at = formString(formData, "at");
    await endContract({
      organizationId,
      contractId: formString(formData, "contractId"),
      at: at === "next_month" ? addMonths(monthStart(new Date()), 1) : null,
      defaultProvider: defaultBillingProvider(),
      actor,
      reason,
    });
    await supportAudit(organizationId, "billing.contract_ended");
    refresh();
    return null;
  });
}

export async function grantCreditAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const organizationId = await organizationFromForm(formData);
    const reason = requiredReason(formData);
    const kind = formString(formData, "kind") === "units" ? "units" : "amount";
    const meter = formString(formData, "meter");
    if (kind === "units" && !isMeterKey(meter))
      throw new ActionError("Choose the product the units are for.");
    const amount =
      kind === "amount"
        ? dollars(formData, "amount", "Amount")
        : BigInt(Math.trunc(Number(formString(formData, "amount").replaceAll(",", "")) || 0));
    const sourceValue = formString(formData, "source");
    const source =
      sourceValue === "promotion" || sourceValue === "sla" || sourceValue === "refund"
        ? sourceValue
        : "support";
    const description = formString(formData, "description");
    if (!description) throw new ActionError("Add a description the customer sees.");
    const scopeMeter = formString(formData, "scope");
    await createCreditGrant({
      grant: {
        organizationId,
        kind,
        amount,
        meter: kind === "units" ? (meter as MeterKey) : null,
        scope: kind === "amount" && isMeterKey(scopeMeter) ? [scopeMeter] : null,
        appliesTo: formString(formData, "appliesTo") === "any" ? "any" : "usage",
        source,
        description,
        effectiveAt: dateField(formData, "effectiveAt", "Start") ?? new Date(),
        expiresAt: dateField(formData, "expiresAt", "Expiry"),
      },
      actor,
      reason,
    });
    await supportAudit(organizationId, "billing.credit_granted");
    refresh();
    return null;
  });
}

export async function voidCreditAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const organizationId = await organizationFromForm(formData);
    await voidCreditGrant({
      organizationId,
      grantId: formString(formData, "grantId"),
      actor,
      reason: requiredReason(formData),
    });
    await supportAudit(organizationId, "billing.credit_voided");
    refresh();
    return null;
  });
}

export async function voidInvoiceAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const organizationId = await organizationFromForm(formData);
    const invoice = await voidInvoice({
      organizationId,
      invoiceId: formString(formData, "invoiceId"),
      actor,
      reason: requiredReason(formData),
    });
    await supportAudit(organizationId, "billing.invoice_voided", {
      type: "invoice",
      id: invoice.id,
    });
    refresh();
    return null;
  });
}

export async function markUncollectibleAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const organizationId = await organizationFromForm(formData);
    await markInvoiceUncollectible({
      organizationId,
      invoiceId: formString(formData, "invoiceId"),
      actor,
      reason: requiredReason(formData),
    });
    refresh();
    return null;
  });
}

export async function resyncInvoiceAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const organizationId = await organizationFromForm(formData);
    await resyncInvoice({
      organizationId,
      invoiceId: formString(formData, "invoiceId"),
      actor,
      reason: requiredReason(formData),
    });
    refresh();
    return null;
  });
}

export async function recordPaymentAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const organizationId = await organizationFromForm(formData);
    const invoice = await recordManualPayment({
      organizationId,
      invoiceId: formString(formData, "invoiceId"),
      payment: {
        amountCents: dollars(formData, "amount", "Amount"),
        method: formString(formData, "method") || "wire",
        reference: formString(formData, "reference") || null,
        receivedAt: dateField(formData, "receivedAt", "Received") ?? new Date(),
        note: null,
      },
      actor,
      reason: requiredReason(formData),
    });
    await supportAudit(organizationId, "billing.payment_recorded", {
      type: "invoice",
      id: invoice.id,
    });
    refresh();
    return null;
  });
}

export async function creditNoteAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const organizationId = await organizationFromForm(formData);
    const memo = formString(formData, "memo");
    if (!memo) throw new ActionError("Add a memo the customer sees.");
    const refund = formString(formData, "refund");
    const note = await createCreditNote({
      organizationId,
      invoiceId: formString(formData, "invoiceId"),
      amountCents: dollars(formData, "amount", "Amount"),
      refundCents: refund ? dollars(formData, "refund", "Refund") : 0n,
      memo,
      actor,
      reason: requiredReason(formData),
    });
    await supportAudit(organizationId, "billing.credit_note_issued", {
      type: "credit_note",
      id: note.id,
    });
    refresh();
    return null;
  });
}

/** One line per charge: `Description | 1,250.00` (negative for an adjustment). */
function invoiceLines(text: string): { description: string; amountCents: bigint }[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.lastIndexOf("|");
      if (separator === -1) throw new ActionError(`"${line}": use Description | amount.`);
      const description = line.slice(0, separator).trim();
      const amountText = line.slice(separator + 1).trim();
      const negative = amountText.startsWith("-");
      const cents = parseDollarsToCents(negative ? amountText.slice(1) : amountText);
      if (!description || cents === null)
        throw new ActionError(`"${line}": use Description | amount.`);
      return { description, amountCents: negative ? -cents : cents };
    });
}

export async function oneOffInvoiceAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const organizationId = await organizationFromForm(formData);
    const invoice = await createOneOffInvoice({
      organizationId,
      lines: invoiceLines(formString(formData, "lines")),
      memo: formString(formData, "memo") || null,
      defaultProvider: defaultBillingProvider(),
      actor,
      reason: requiredReason(formData),
    });
    await supportAudit(organizationId, "billing.invoice_issued", {
      type: "invoice",
      id: invoice.id,
    });
    refresh();
    return null;
  });
}

export async function setHoldAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const organizationId = await organizationFromForm(formData);
    const held = formString(formData, "held") === "true";
    await setAdminHold({ organizationId, held, actor, reason: requiredReason(formData) });
    await supportAudit(organizationId, held ? "billing.sending_paused" : "billing.sending_resumed");
    refresh();
    return null;
  });
}
