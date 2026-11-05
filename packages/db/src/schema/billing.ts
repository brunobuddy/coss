/**
 * Billing (`@coss/billing`): accounts, contracts, metered usage, credits, invoices and the
 * payment provider's events. Invoices (and their lines, payments and credit notes) outlive the
 * organization: no FK to it, names copied, kept for the retention in `@coss/retention`.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { ID_PREFIXES, newId } from "../id.ts";
import { apikey, organization, user } from "./auth.ts";
import { project } from "./domain.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const cents = (name: string) => bigint(name, { mode: "bigint" });

export const billingProvider = pgEnum("billing_provider", ["fake", "stripe", "manual"]);
export const billingCollectionMethod = pgEnum("billing_collection_method", [
  "charge_automatically",
  "send_invoice",
]);
export const billingAccountStatus = pgEnum("billing_account_status", [
  "active",
  "past_due",
  "delinquent",
]);
export const billingTaxMode = pgEnum("billing_tax_mode", ["none", "stripe_automatic"]);

/** What the provider says about the default payment method (shown in the dashboard). */
export type PaymentMethodSummary = {
  /** `card`, `us_bank_account`, `sepa_debit`, `bacs_debit`, `customer_balance`, … */
  type: string;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
  bankName?: string;
};

/** Postal address on invoices (the manual provider; Stripe keeps its own). */
export type BillingAddress = {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
};

/**
 * An organization's billing profile: created on first need (`ensureBillingAccount`). The
 * provider and how invoices are collected are per account, so a deal can be invoiced off-Stripe
 * or by direct debit without changing anything else.
 */
export const billingAccount = pgTable("billing_account", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newId(ID_PREFIXES.billingAccount)),
  organizationId: text("organization_id")
    .notNull()
    .unique("billing_account_organization_unique")
    .references(() => organization.id, { onDelete: "cascade" }),
  provider: billingProvider("provider").notNull(),
  providerCustomerId: text("provider_customer_id"),
  collectionMethod: billingCollectionMethod("collection_method")
    .notNull()
    .default("charge_automatically"),
  // Days until a `send_invoice` invoice is due.
  netTermsDays: integer("net_terms_days").notNull().default(30),
  // Payment method types the customer may add (Checkout offers only these) …
  allowedPaymentMethods: text("allowed_payment_methods")
    .array()
    .notNull()
    .default(sql`'{card}'::text[]`),
  // … and, when not empty, the ones its default method must be (e.g. direct debit only).
  requiredPaymentMethods: text("required_payment_methods")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  taxMode: billingTaxMode("tax_mode").notNull().default("none"),
  // Where invoices and billing emails go (`null`: the organization's owners).
  billingEmail: text("billing_email"),
  billingCc: text("billing_cc").array().notNull().default(sql`'{}'::text[]`),
  billingName: text("billing_name"),
  billingAddress: jsonb("billing_address").$type<BillingAddress>(),
  taxId: text("tax_id"),
  // Usage beyond the period's credit stops live sending past this (set by owners; `null`: none).
  spendLimitCents: cents("spend_limit_cents"),
  // An admin's credit limit, replacing the automatic one (`@coss/billing/catalog`'s `CREDIT_POLICY`);
  // also what brings a contract or net-terms account under it. `null`: the policy decides.
  creditLimitCents: cents("credit_limit_cents"),
  // Percentages of the period's usage credit that send an alert.
  alertThresholds: integer("alert_thresholds")
    .array()
    .notNull()
    .default(sql`'{80,100}'::integer[]`),
  // Days an invoice may stay overdue before live sending is held.
  graceDays: integer("grace_days").notNull().default(14),
  status: billingAccountStatus("status").notNull().default("active"),
  pastDueSince: timestamp("past_due_since", { withTimezone: true }),
  // An admin's exemption from the delinquency hold until this time.
  holdExemptUntil: timestamp("hold_exempt_until", { withTimezone: true }),
  paymentMethod: jsonb("payment_method").$type<PaymentMethodSummary>(),
  // Internal note for platform admins; never shown to the organization.
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const billingContractKind = pgEnum("billing_contract_kind", [
  "self_serve",
  "sales",
  "internal",
]);
export const billingContractStatus = pgEnum("billing_contract_status", [
  "pending",
  "confirmed",
  "canceled",
]);

/**
 * What an organization pays: a plan plus whatever a deal overrides (`terms`, validated by
 * `@coss/billing/schemas`). A confirmed contract is in effect while `effective_from <= t <
 * effective_until`; time alone decides (no contract in effect = the Free plan). Changes take the
 * account row's lock, so contracts never overlap.
 */
export const billingContract = pgTable(
  "billing_contract",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.billingContract)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => billingAccount.id, { onDelete: "cascade" }),
    kind: billingContractKind("kind").notNull(),
    status: billingContractStatus("status").notNull(),
    // `terms.plan`, for queries.
    plan: text("plan").notNull(),
    terms: jsonb("terms").$type<Record<string, unknown>>().notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveUntil: timestamp("effective_until", { withTimezone: true }),
    // End of the committed term; at its end the contract renews (`auto_renew`) or ends.
    termEnd: timestamp("term_end", { withTimezone: true }),
    autoRenew: boolean("auto_renew").notNull().default(false),
    supersedesId: text("supersedes_id"),
    // A pending (self-serve upgrade) contract waits for this invoice to be paid, until it expires.
    pendingInvoiceId: text("pending_invoice_id"),
    pendingExpiresAt: timestamp("pending_expires_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    // Internal note (sales context) and a reference to the signed order form or CRM deal.
    note: text("note"),
    reference: text("reference"),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("billing_contract_organization_idx").on(t.organizationId, t.effectiveFrom),
    index("billing_contract_pending_idx")
      .on(t.pendingExpiresAt)
      .where(sql`${t.status} = 'pending'`),
  ],
);

/**
 * Metered usage per hour, summed by the products' own transactions (`recordUsage`). `shard`
 * spreads one busy organization's writes over several rows. No FK to the environment: deleting
 * one must not drop usage that is still to be billed.
 */
export const billingUsage = pgTable(
  "billing_usage",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    hourStart: timestamp("hour_start", { withTimezone: true }).notNull(),
    meter: text("meter").notNull(),
    // `""` or `name=value` pairs (`dimensionKey`).
    dimension: text("dimension").notNull().default(""),
    environmentId: text("environment_id").notNull(),
    shard: smallint("shard").notNull().default(0),
    quantity: bigint("quantity", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    primaryKey({
      columns: [t.organizationId, t.hourStart, t.meter, t.dimension, t.environmentId, t.shard],
    }),
    // The worker's retention purge and the usage scan.
    index("billing_usage_hour_idx").on(t.hourStart),
  ],
);

/**
 * Who metered usage came from, next to `billing_usage` (written by the same `recordUsage` call):
 * the project, the API key and the member a personal key belongs to (`""`: none — dashboard
 * sends, organization keys). The owner is stored, not looked up through the key, so revoking a
 * key never erases a member's spend. Rating reads only `billing_usage`; spend breakdowns and
 * budgets read this, and count what it lacks (usage from before it existed) as the
 * organization's.
 */
export const billingUsageAttribution = pgTable(
  "billing_usage_attribution",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    hourStart: timestamp("hour_start", { withTimezone: true }).notNull(),
    meter: text("meter").notNull(),
    dimension: text("dimension").notNull().default(""),
    environmentId: text("environment_id").notNull(),
    // Follows from the environment; kept so a deleted environment's usage stays in its project.
    projectId: text("project_id").notNull().default(""),
    apiKeyId: text("api_key_id").notNull().default(""),
    userId: text("user_id").notNull().default(""),
    shard: smallint("shard").notNull().default(0),
    quantity: bigint("quantity", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    primaryKey({
      // Named: the generated name would be longer than Postgres keeps.
      name: "billing_usage_attribution_pk",
      columns: [
        t.organizationId,
        t.hourStart,
        t.meter,
        t.dimension,
        t.environmentId,
        t.apiKeyId,
        t.userId,
        t.shard,
      ],
    }),
    index("billing_usage_attribution_hour_idx").on(t.hourStart),
  ],
);

/** Units reserved against a hard per-period cap (Free's 3,000 emails), at send time. */
export const billingQuota = pgTable(
  "billing_quota",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    meter: text("meter").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    reserved: bigint("reserved", { mode: "number" }).notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.meter, t.periodStart] })],
);

export const billingHoldReason = pgEnum("billing_hold_reason", [
  "delinquent",
  "spend_limit",
  "credit_limit",
  "admin",
]);

/**
 * A billing hold on live sending; the row's presence is the hold. Independent of reputation
 * suspensions (`organization_suspension`): paying lifts a `delinquent` hold, the next period or a
 * higher limit a `spend_limit` one, payments aging or a higher limit a `credit_limit` one, only an
 * admin an `admin` one.
 */
export const billingHold = pgTable(
  "billing_hold",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    reason: billingHoldReason("reason").notNull(),
    // Internal context (an admin's note, the invoice that is overdue).
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.reason] })],
);

export const billingGrantKind = pgEnum("billing_grant_kind", ["amount", "units"]);
export const billingGrantAppliesTo = pgEnum("billing_grant_applies_to", ["usage", "any"]);
export const billingGrantSource = pgEnum("billing_grant_source", [
  "fee",
  "commitment",
  "support",
  "promotion",
  "refund",
  "sla",
  "threshold",
]);

/**
 * Credit an organization can spend: dollars (`amount`, cents) or units of a meter. A plan's fee
 * becomes a grant for its month, prepaid commitments become grants for their period, and support
 * grants credit by hand. What's left is `amount` minus its `billing_credit_entry` rows.
 */
export const billingCreditGrant = pgTable(
  "billing_credit_grant",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.billingCreditGrant)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: billingGrantKind("kind").notNull(),
    // Cents (`amount`) or units (`units`).
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    // Unit grants: the meter (and dimension value) they cover.
    meter: text("meter"),
    dimension: text("dimension"),
    // Amount grants: the meters they pay for (`null`: any).
    scope: text("scope").array(),
    appliesTo: billingGrantAppliesTo("applies_to").notNull().default("usage"),
    source: billingGrantSource("source").notNull(),
    // The engine's idempotency key (fee and commitment grants); `null` for grants made by hand.
    grantKey: text("grant_key").unique("billing_credit_grant_key_unique"),
    contractId: text("contract_id"),
    // The invoice that funds it (fee and commitment grants): voiding the invoice voids it.
    invoiceId: text("invoice_id"),
    // Shown to the customer.
    description: text("description").notNull(),
    // Internal (support's reason); never shown to the organization.
    reason: text("reason"),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("billing_credit_grant_organization_idx").on(t.organizationId, t.effectiveAt),
    index("billing_credit_grant_invoice_idx")
      .on(t.invoiceId)
      .where(sql`${t.invoiceId} is not null`),
  ],
);

export const billingCreditEntryKind = pgEnum("billing_credit_entry_kind", [
  "applied",
  "reversed",
  "voided",
  "rolled_over",
]);

/** Append-only drawdown of grants: what invoices used (`applied`), gave back (`reversed`), … */
export const billingCreditEntry = pgTable(
  "billing_credit_entry",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.billingCreditEntry)),
    organizationId: text("organization_id").notNull(),
    grantId: text("grant_id")
      .notNull()
      .references(() => billingCreditGrant.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id"),
    kind: billingCreditEntryKind("kind").notNull(),
    // Consumed amount (cents or units); reversals are negative.
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("billing_credit_entry_grant_idx").on(t.grantId)],
);

/** A closed billing month (`invoice_id` is `null` when nothing was billable). */
export const billingPeriod = pgTable(
  "billing_period",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.billingPeriod)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => billingAccount.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    invoiceId: text("invoice_id"),
    // Units per meter and dimension (`UsageTotal[]`).
    usage: jsonb("usage")
      .$type<{ meter: string; dimension: string; quantity: number }[]>()
      .notNull(),
    warnings: text("warnings").array().notNull().default(sql`'{}'::text[]`),
    closedAt: createdAt(),
  },
  (t) => [uniqueIndex("billing_period_account_start_idx").on(t.accountId, t.periodStart)],
);

export const billingInvoiceKind = pgEnum("billing_invoice_kind", [
  "period",
  "plan_change",
  "one_off",
  "final",
  "threshold",
]);
export const billingInvoiceStatus = pgEnum("billing_invoice_status", [
  "draft",
  "open",
  "paid",
  "void",
  "uncollectible",
]);
export const billingSyncAction = pgEnum("billing_sync_action", [
  "push",
  "collect",
  "void",
  "mark_uncollectible",
]);

/**
 * An invoice coss.com computed. Pushed to the account's provider by the worker (`sync_*`, an outbox)
 * and collected on coss.com's own schedule (`next_collection_at`). Outlives the organization.
 */
export const billingInvoice = pgTable(
  "billing_invoice",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.billingInvoice)),
    // No FKs: invoices are kept after the organization is deleted.
    organizationId: text("organization_id").notNull(),
    accountId: text("account_id").notNull(),
    organizationName: text("organization_name").notNull(),
    organizationSlug: text("organization_slug").notNull(),
    // Assigned (gapless) when finalized.
    number: text("number").unique("billing_invoice_number_unique"),
    kind: billingInvoiceKind("kind").notNull(),
    status: billingInvoiceStatus("status").notNull().default("draft"),
    currency: text("currency").notNull().default("usd"),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    subtotalCents: cents("subtotal_cents").notNull().default(sql`0`),
    discountCents: cents("discount_cents").notNull().default(sql`0`),
    creditCents: cents("credit_cents").notNull().default(sql`0`),
    taxCents: cents("tax_cents").notNull().default(sql`0`),
    totalCents: cents("total_cents").notNull().default(sql`0`),
    amountPaidCents: cents("amount_paid_cents").notNull().default(sql`0`),
    amountDueCents: cents("amount_due_cents").notNull().default(sql`0`),
    collectionMethod: billingCollectionMethod("collection_method").notNull(),
    provider: billingProvider("provider").notNull(),
    providerCustomerId: text("provider_customer_id"),
    providerInvoiceId: text("provider_invoice_id").unique("billing_invoice_provider_unique"),
    hostedUrl: text("hosted_url"),
    pdfUrl: text("pdf_url"),
    billingEmail: text("billing_email"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    // Provider outbox: what to do next, and when.
    syncAction: billingSyncAction("sync_action"),
    syncAttempts: integer("sync_attempts").notNull().default(0),
    nextSyncAt: timestamp("next_sync_at", { withTimezone: true }),
    syncError: text("sync_error"),
    // Dunning: payment retries and reminders.
    collectionAttempts: integer("collection_attempts").notNull().default(0),
    nextCollectionAt: timestamp("next_collection_at", { withTimezone: true }),
    // `processing` (async debit), `requires_action` (SCA), `failed`; `null` otherwise.
    paymentState: text("payment_state"),
    paymentError: text("payment_error"),
    // The resolved terms and rate card the invoice was computed with.
    termsSnapshot: jsonb("terms_snapshot").$type<Record<string, unknown>>(),
    memo: text("memo"),
    createdByUserId: text("created_by_user_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("billing_invoice_organization_idx").on(t.organizationId, t.createdAt.desc()),
    uniqueIndex("billing_invoice_period_idx")
      .on(t.accountId, t.periodStart)
      .where(sql`${t.kind} = 'period' and ${t.status} <> 'void'`),
    uniqueIndex("billing_invoice_final_idx")
      .on(t.accountId)
      .where(sql`${t.kind} = 'final' and ${t.status} <> 'void'`),
    index("billing_invoice_sync_idx").on(t.nextSyncAt).where(sql`${t.nextSyncAt} is not null`),
    index("billing_invoice_collection_idx")
      .on(t.nextCollectionAt)
      .where(sql`${t.nextCollectionAt} is not null`),
    index("billing_invoice_created_at_idx").on(t.createdAt),
  ],
);

export const billingLineKind = pgEnum("billing_line_kind", [
  "plan_fee",
  "proration",
  "usage",
  "credit",
  "discount",
  "commitment_fee",
  "commitment_shortfall",
  "add_on",
  "adjustment",
  "write_off",
]);

export const billingInvoiceLine = pgTable(
  "billing_invoice_line",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.billingInvoiceLine)),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => billingInvoice.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    position: integer("position").notNull(),
    kind: billingLineKind("kind").notNull(),
    description: text("description").notNull(),
    meter: text("meter"),
    dimension: text("dimension"),
    quantity: bigint("quantity", { mode: "number" }),
    coveredUnits: bigint("covered_units", { mode: "number" }),
    unitNanos: bigint("unit_nanos", { mode: "bigint" }),
    amountCents: cents("amount_cents").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    contractId: text("contract_id"),
    grantId: text("grant_id"),
    // A charge is billed once across invoices (cleared when its invoice is voided).
    chargeKey: text("charge_key"),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
  },
  (t) => [
    index("billing_invoice_line_invoice_idx").on(t.invoiceId, t.position),
    uniqueIndex("billing_invoice_line_charge_key_idx")
      .on(t.chargeKey)
      .where(sql`${t.chargeKey} is not null`),
    index("billing_invoice_line_contract_idx")
      .on(t.contractId, t.periodStart)
      .where(sql`${t.contractId} is not null`),
  ],
);

/** Gapless counters (invoice and credit note numbers), incremented in the finalizing transaction. */
export const billingCounter = pgTable("billing_counter", {
  name: text("name").primaryKey(),
  value: bigint("value", { mode: "number" }).notNull().default(0),
});

/** A payment received for an invoice: reported by the provider or recorded by an admin. */
export const billingPayment = pgTable(
  "billing_payment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.billingPayment)),
    organizationId: text("organization_id").notNull(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => billingInvoice.id, { onDelete: "cascade" }),
    amountCents: cents("amount_cents").notNull(),
    // `card`, `us_bank_account`, `wire`, `check`, …
    method: text("method").notNull(),
    reference: text("reference"),
    providerPaymentId: text("provider_payment_id").unique("billing_payment_provider_unique"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    recordedByUserId: text("recorded_by_user_id"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("billing_payment_invoice_idx").on(t.invoiceId)],
);

export const billingCreditNoteStatus = pgEnum("billing_credit_note_status", [
  "pending",
  "issued",
  "failed",
]);

/** A reduction of a finalized invoice, optionally refunded to the customer's payment method. */
export const billingCreditNote = pgTable(
  "billing_credit_note",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.billingCreditNote)),
    organizationId: text("organization_id").notNull(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => billingInvoice.id, { onDelete: "cascade" }),
    number: text("number").unique("billing_credit_note_number_unique"),
    amountCents: cents("amount_cents").notNull(),
    // The part returned to the payment method (the rest reduces what's due).
    refundCents: cents("refund_cents").notNull().default(sql`0`),
    // Shown to the customer.
    memo: text("memo").notNull(),
    // Internal.
    reason: text("reason"),
    status: billingCreditNoteStatus("status").notNull().default("pending"),
    providerCreditNoteId: text("provider_credit_note_id"),
    syncAttempts: integer("sync_attempts").notNull().default(0),
    nextSyncAt: timestamp("next_sync_at", { withTimezone: true }),
    syncError: text("sync_error"),
    createdByUserId: text("created_by_user_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("billing_credit_note_invoice_idx").on(t.invoiceId),
    index("billing_credit_note_sync_idx").on(t.nextSyncAt).where(sql`${t.nextSyncAt} is not null`),
  ],
);

export const billingProviderEventStatus = pgEnum("billing_provider_event_status", [
  "pending",
  "processed",
  "ignored",
  "failed",
]);

/** Events from the payment provider (Stripe webhooks), stored as received and processed by the worker. */
export const billingProviderEvent = pgTable(
  "billing_provider_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.billingProviderEvent)),
    provider: billingProvider("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: billingProviderEventStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("billing_provider_event_unique_idx").on(t.provider, t.providerEventId),
    index("billing_provider_event_next_attempt_idx")
      .on(t.nextAttemptAt)
      .where(sql`${t.nextAttemptAt} IS NOT NULL`),
    index("billing_provider_event_created_at_idx").on(t.createdAt),
  ],
);

export const billingNotificationStatus = pgEnum("billing_notification_status", [
  "pending",
  "sent",
  "skipped",
  "failed",
]);

/**
 * Outbox of billing emails to an organization (usage alerts, payment failures, holds, manual
 * invoices). `dedupe_key` makes each one once-only (e.g. one 80% alert per period).
 */
export const billingNotification = pgTable(
  "billing_notification",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.billingNotification)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    // A member it is also for (their budget), besides the billing contacts.
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    dedupeKey: text("dedupe_key").notNull().unique("billing_notification_dedupe_unique"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: billingNotificationStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    // When the worker should (re)try; also the claim's lease. Null once settled.
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    recipients: text("recipients").array().notNull().default(sql`'{}'::text[]`),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("billing_notification_next_attempt_idx")
      .on(t.nextAttemptAt)
      .where(sql`${t.nextAttemptAt} IS NOT NULL`),
    index("billing_notification_created_at_idx").on(t.createdAt),
  ],
);

/**
 * What a member, project or API key may spend in a month (`@coss/billing` budgets): spend is the
 * share of the month's usage charges they caused (`billing_usage_attribution`). `member_default`
 * applies to every member with personal keys and no budget of their own; a `user` budget without
 * an amount exempts that member from it. Over budget, the worker places a `billing_budget_hold`.
 */
export const billingBudgetScope = pgEnum("billing_budget_scope", [
  "member_default",
  "user",
  "project",
  "api_key",
]);

export const billingBudget = pgTable(
  "billing_budget",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.billingBudget)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    scope: billingBudgetScope("scope").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    projectId: text("project_id"),
    apiKeyId: text("api_key_id").references(() => apikey.id, { onDelete: "cascade" }),
    // `null`: no limit (only a member's own budget, exempting them from the default).
    amountCents: cents("amount_cents"),
    alertThresholds: integer("alert_thresholds")
      .array()
      .notNull()
      .default(sql`'{80,100}'::integer[]`),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "billing_budget_project_fk",
      columns: [t.projectId, t.organizationId],
      foreignColumns: [project.id, project.organizationId],
    }).onDelete("cascade"),
    check(
      "billing_budget_target_check",
      sql`case ${t.scope}
        when 'member_default' then ${t.userId} is null and ${t.projectId} is null and ${t.apiKeyId} is null and ${t.amountCents} is not null
        when 'user' then ${t.userId} is not null and ${t.projectId} is null and ${t.apiKeyId} is null
        when 'project' then ${t.userId} is null and ${t.projectId} is not null and ${t.apiKeyId} is null and ${t.amountCents} is not null
        when 'api_key' then ${t.userId} is null and ${t.projectId} is null and ${t.apiKeyId} is not null and ${t.amountCents} is not null
      end`,
    ),
    check("billing_budget_amount_check", sql`${t.amountCents} is null or ${t.amountCents} >= 0`),
    uniqueIndex("billing_budget_member_default_idx")
      .on(t.organizationId)
      .where(sql`${t.scope} = 'member_default'`),
    uniqueIndex("billing_budget_user_idx")
      .on(t.organizationId, t.userId)
      .where(sql`${t.scope} = 'user'`),
    uniqueIndex("billing_budget_project_idx")
      .on(t.organizationId, t.projectId)
      .where(sql`${t.scope} = 'project'`),
    uniqueIndex("billing_budget_api_key_idx")
      .on(t.organizationId, t.apiKeyId)
      .where(sql`${t.scope} = 'api_key'`),
  ],
);

/**
 * A member, project or API key over its budget this month (presence = paused): their live sends
 * are refused (`budget_exceeded`) until the month ends or the budget is raised. `target_id` is the
 * user, project or API key id; the hold outlives a deleted budget only until the next check.
 */
export const billingBudgetHold = pgTable(
  "billing_budget_hold",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    scope: billingBudgetScope("scope").notNull(),
    targetId: text("target_id").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    // What was spent and allowed when it was placed (for the notice).
    spentCents: cents("spent_cents").notNull(),
    limitCents: cents("limit_cents").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.scope, t.targetId] })],
);
