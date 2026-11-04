/** Billing accounts: one per organization, created on first need. */
import { db, type Executor, schema, type Transaction } from "@coss/db";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { type AdminActor, auditBillingChange } from "./audit.ts";
import { BillingError } from "./errors.ts";

const { billingAccount, organization } = schema;

export type BillingAccount = typeof billingAccount.$inferSelect;
export type ProviderName = BillingAccount["provider"];

export const PAYMENT_METHOD_TYPES = [
  "card",
  "us_bank_account",
  "sepa_debit",
  "bacs_debit",
  "customer_balance",
] as const;
export type PaymentMethodType = (typeof PAYMENT_METHOD_TYPES)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodType, string> = {
  card: "Card",
  us_bank_account: "ACH Direct Debit",
  sepa_debit: "SEPA Direct Debit",
  bacs_debit: "Bacs Direct Debit",
  customer_balance: "Bank transfer",
};

export async function getBillingAccount(
  organizationId: string,
  executor: Executor = db,
): Promise<BillingAccount | null> {
  const [row] = await executor
    .select()
    .from(billingAccount)
    .where(eq(billingAccount.organizationId, organizationId))
    .limit(1);
  return row ?? null;
}

/** The organization's account, created with `provider` if it has none. */
export async function ensureBillingAccount(
  organizationId: string,
  provider: ProviderName,
  executor: Executor = db,
): Promise<BillingAccount> {
  await executor
    .insert(billingAccount)
    .values({ organizationId, provider })
    .onConflictDoNothing({ target: billingAccount.organizationId });
  const account = await getBillingAccount(organizationId, executor);
  if (!account) throw new BillingError("not_found", "The organization no longer exists.");
  return account;
}

/**
 * The account, row-locked for the transaction: every contract, invoice and credit change of an
 * organization takes this lock, so they never interleave.
 */
export async function lockBillingAccount(
  tx: Transaction,
  organizationId: string,
  provider: ProviderName,
): Promise<BillingAccount> {
  await ensureBillingAccount(organizationId, provider, tx);
  const [row] = await tx
    .select()
    .from(billingAccount)
    .where(eq(billingAccount.organizationId, organizationId))
    .for("update");
  if (!row) throw new BillingError("not_found", "The organization no longer exists.");
  return row;
}

export type OrganizationLabel = { id: string; name: string; slug: string };

export async function organizationLabel(
  organizationId: string,
  executor: Executor = db,
): Promise<OrganizationLabel | null> {
  const [row] = await executor
    .select({ id: organization.id, name: organization.name, slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return row ?? null;
}

/** What platform admins set per account (how it is invoiced and collected). */
export type AccountSettings = Partial<
  Pick<
    BillingAccount,
    | "provider"
    | "collectionMethod"
    | "netTermsDays"
    | "allowedPaymentMethods"
    | "requiredPaymentMethods"
    | "taxMode"
    | "billingEmail"
    | "billingCc"
    | "billingName"
    | "billingAddress"
    | "taxId"
    | "graceDays"
    | "holdExemptUntil"
    | "creditLimitCents"
    | "notes"
  >
>;

export async function updateBillingAccountSettings(input: {
  organizationId: string;
  defaultProvider: ProviderName;
  settings: AccountSettings;
  actor: AdminActor;
  reason: string;
}): Promise<BillingAccount> {
  validateSettings(input.settings);
  return db.transaction(async (tx) => {
    const previous = await lockBillingAccount(tx, input.organizationId, input.defaultProvider);
    // A customer belongs to one provider: switching forgets it (the next invoice creates one).
    const changingProvider =
      input.settings.provider !== undefined && input.settings.provider !== previous.provider;
    if (changingProvider) {
      const [unsettled] = await tx
        .select({ id: schema.billingInvoice.id })
        .from(schema.billingInvoice)
        .where(
          and(
            eq(schema.billingInvoice.accountId, previous.id),
            or(
              inArray(schema.billingInvoice.status, ["draft", "open"]),
              isNotNull(schema.billingInvoice.syncAction),
            ),
          ),
        )
        .limit(1);
      if (unsettled)
        throw new BillingError(
          "invalid_change",
          "Resolve unsettled invoices and their provider sync before changing providers.",
        );
    }
    const [row] = await tx
      .update(billingAccount)
      .set({
        ...input.settings,
        ...(changingProvider ? { providerCustomerId: null, paymentMethod: null } : {}),
      })
      .where(eq(billingAccount.id, previous.id))
      .returning();
    if (!row) throw new BillingError("not_found", "The billing account no longer exists.");
    await auditBillingChange(tx, {
      actor: input.actor,
      action: "billing.account_updated",
      organizationId: input.organizationId,
      reason: input.reason,
      metadata: { changes: changedFields(previous, row) },
    });
    return row;
  });
}

/** Owner-controlled settings (spend limit, alerts, where billing email goes). */
export async function updateSpendControls(input: {
  organizationId: string;
  defaultProvider: ProviderName;
  spendLimitCents?: bigint | null;
  alertThresholds?: number[];
  billingEmail?: string | null;
}): Promise<BillingAccount> {
  if (input.spendLimitCents !== undefined && input.spendLimitCents !== null) {
    if (input.spendLimitCents < 0n) {
      throw new BillingError("invalid_change", "The spend limit can't be negative.");
    }
  }
  if (input.alertThresholds) {
    if (input.alertThresholds.some((t) => !Number.isInteger(t) || t < 1 || t > 1000)) {
      throw new BillingError("invalid_change", "Alert thresholds are percentages from 1 to 1000.");
    }
  }
  return db.transaction(async (tx) => {
    const account = await lockBillingAccount(tx, input.organizationId, input.defaultProvider);
    const [row] = await tx
      .update(billingAccount)
      .set({
        ...(input.spendLimitCents !== undefined ? { spendLimitCents: input.spendLimitCents } : {}),
        ...(input.alertThresholds
          ? { alertThresholds: [...new Set(input.alertThresholds)].sort((a, b) => a - b) }
          : {}),
        ...(input.billingEmail !== undefined ? { billingEmail: input.billingEmail } : {}),
      })
      .where(eq(billingAccount.id, account.id))
      .returning();
    if (!row) throw new BillingError("not_found", "The billing account no longer exists.");
    return row;
  });
}

function validateSettings(settings: AccountSettings): void {
  if (settings.netTermsDays !== undefined) {
    if (
      !Number.isInteger(settings.netTermsDays) ||
      settings.netTermsDays < 0 ||
      settings.netTermsDays > 120
    ) {
      throw new BillingError("invalid_change", "Net terms are 0 to 120 days.");
    }
  }
  if (settings.graceDays !== undefined) {
    if (
      !Number.isInteger(settings.graceDays) ||
      settings.graceDays < 0 ||
      settings.graceDays > 365
    ) {
      throw new BillingError("invalid_change", "The grace period is 0 to 365 days.");
    }
  }
  if (
    settings.creditLimitCents !== undefined &&
    settings.creditLimitCents !== null &&
    settings.creditLimitCents < 0n
  ) {
    throw new BillingError("invalid_change", "The credit limit can't be negative.");
  }
  for (const list of [settings.allowedPaymentMethods, settings.requiredPaymentMethods]) {
    if (list?.some((type) => !(PAYMENT_METHOD_TYPES as readonly string[]).includes(type))) {
      throw new BillingError("invalid_change", "Unknown payment method type.");
    }
  }
  if (settings.allowedPaymentMethods && settings.allowedPaymentMethods.length === 0) {
    throw new BillingError("invalid_change", "Allow at least one payment method.");
  }
  if (
    settings.requiredPaymentMethods?.length &&
    settings.allowedPaymentMethods &&
    settings.requiredPaymentMethods.some((type) => !settings.allowedPaymentMethods?.includes(type))
  ) {
    throw new BillingError("invalid_change", "Required payment methods must also be allowed.");
  }
}

function changedFields(before: BillingAccount, after: BillingAccount): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof BillingAccount)[]) {
    if (key === "updatedAt") continue;
    const a = JSON.stringify(before[key], bigintReplacer);
    const b = JSON.stringify(after[key], bigintReplacer);
    if (a !== b) changes[key] = { from: JSON.parse(a ?? "null"), to: JSON.parse(b ?? "null") };
  }
  return changes;
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

/** Whether the account's default payment method satisfies its required types. */
export function paymentMethodCompliant(account: BillingAccount): boolean {
  if (!account.requiredPaymentMethods.length) return true;
  return (
    account.paymentMethod !== null &&
    account.requiredPaymentMethods.includes(account.paymentMethod.type)
  );
}
