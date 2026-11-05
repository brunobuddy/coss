import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  cidr,
  customType,
  foreignKey,
  index,
  inet,
  integer,
  json,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { ID_PREFIXES, newId } from "../id.ts";
import { apikey, organization, session, user } from "./auth.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const project = pgTable(
  "project",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.project)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("project_organization_slug_unique").on(t.organizationId, t.slug),
    // Target for composite FKs that pin children to the same organization.
    unique("project_id_organization_unique").on(t.id, t.organizationId),
  ],
);

export const environmentMode = pgEnum("environment_mode", ["live", "sandbox"]);

export const environment = pgTable(
  "environment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.environment)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    mode: environmentMode("mode").notNull(),
    // Whether members may create personal API keys here (owners and admins always may). New
    // projects open their sandbox environments; the default covers older writers.
    personalKeys: boolean("personal_keys").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "environment_project_fk",
      columns: [t.projectId, t.organizationId],
      foreignColumns: [project.id, project.organizationId],
    }).onDelete("cascade"),
    unique("environment_project_slug_unique").on(t.projectId, t.slug),
    unique("environment_id_organization_unique").on(t.id, t.organizationId),
    index("environment_organization_idx").on(t.organizationId),
  ],
);

/**
 * Binds a Better Auth API key to exactly one environment. Keys without a binding are rejected,
 * so keys minted outside our flow fail closed. Organization/project are derived via the join.
 */
/**
 * `full`: every permission in `API_KEY_PERMISSIONS`, resolved on each request (the stored
 * `apikey.permissions` is ignored). `restricted`: exactly the stored permissions.
 */
export const apiKeyAccess = pgEnum("api_key_access", ["full", "restricted"]);

export const environmentApiKey = pgTable(
  "environment_api_key",
  {
    apiKeyId: text("api_key_id")
      .primaryKey()
      .references(() => apikey.id, { onDelete: "cascade" }),
    environmentId: text("environment_id")
      .notNull()
      .references(() => environment.id, { onDelete: "cascade" }),
    // `createEnvironmentApiKey` always names it. The default is for what predates the column:
    // existing keys, and writers that only ever made full-access keys (old tasks still running
    // during a rollout, or after a rollback).
    access: apiKeyAccess("access").notNull().default("full"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    // The member a personal key is assigned to (its usage is their spend); `null`: an organization
    // key. Deleting the user deletes the binding, so the key fails closed.
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("environment_api_key_environment_idx").on(t.environmentId),
    index("environment_api_key_owner_idx").on(t.ownerUserId),
  ],
);

/** `disabled`: the parent turned it off. `deleting`: the worker is releasing its domains and tenant. */
export const emailSubaccountStatus = pgEnum("email_subaccount_status", [
  "active",
  "disabled",
  "deleting",
]);

/** A sub-account's own sending standing; `paused` is lifted only by a reinstatement. */
export const emailSubaccountReputation = pgEnum("email_subaccount_reputation", [
  "good",
  "warning",
  "paused",
]);

/**
 * Email for platforms: one of a customer's end users, with their own domains (and SES tenant),
 * suppressions, quotas, reputation and screening sample. Addressed by its id or the customer's
 * `uid`. The organization stays accountable: it is billed, its own standing counts every
 * sub-account's sending, and its suspension stops them all.
 */
export const emailSubaccount = pgTable(
  "email_subaccount",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.emailSubaccount)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    // The customer's own id for it (e.g. their user id), unique per environment.
    uid: text("uid"),
    name: text("name").notNull(),
    metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
    status: emailSubaccountStatus("status").notNull().default("active"),
    // Quotas the customer sets on it (recipients); `null`: only the organization's apply.
    dailyRecipientLimit: integer("daily_recipient_limit"),
    perSecondRecipientLimit: integer("per_second_recipient_limit"),
    perSecondBurst: integer("per_second_burst"),
    reputationStatus: emailSubaccountReputation("reputation_status").notNull().default("good"),
    // The check (or `content_screening`) that last moved the standing.
    reputationTrigger: text("reputation_trigger"),
    reputationChangedAt: timestamp("reputation_changed_at", { withTimezone: true }),
    // Rates are measured from here after a reinstatement.
    reinstatedAt: timestamp("reinstated_at", { withTimezone: true }),
    metrics: jsonb("metrics"),
    // Bumped by every standing change: an evaluation that read an older one writes nothing.
    revision: integer("revision").notNull().default(0),
    nextEvaluationAt: timestamp("next_evaluation_at", { withTimezone: true }),
    evaluationLeaseUntil: timestamp("evaluation_lease_until", { withTimezone: true }),
    deletionLeaseUntil: timestamp("deletion_lease_until", { withTimezone: true }),
    deletionAttempts: integer("deletion_attempts").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "email_subaccount_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    unique("email_subaccount_environment_uid_unique").on(t.environmentId, t.uid),
    unique("email_subaccount_id_organization_unique").on(t.id, t.organizationId),
    index("email_subaccount_environment_created_at_idx").on(
      t.environmentId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
    index("email_subaccount_next_evaluation_idx")
      .on(t.nextEvaluationAt)
      .where(sql`${t.nextEvaluationAt} IS NOT NULL`),
    index("email_subaccount_deleting_idx")
      .on(t.deletionLeaseUntil)
      .where(sql`${t.status} = 'deleting'`),
  ],
);

export const emailStatus = pgEnum("email_status", [
  "queued",
  "sent",
  "failed",
  "scheduled",
  "canceled",
]);

export type EmailTag = { name: string; value: string };

/**
 * Separates traffic whose reputation must never mix: each stream has its own SES configuration
 * set and tenant per organization, so marketing complaints never pause password resets.
 */
export const emailStream = pgEnum("email_stream", ["transactional", "marketing"]);

// One `POST /v1/emails/batch` request. Holds the batch's idempotency key; its emails' keys are NULL.
export const emailBatch = pgTable(
  "email_batch",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.emailBatch)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    // No FK: Better Auth hard-deletes expired keys, and email history must survive that.
    apiKeyId: text("api_key_id"),
    idempotencyKey: text("idempotency_key"),
    requestHash: text("request_hash"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "email_batch_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    // NULL keys are distinct, so requests without an Idempotency-Key never conflict.
    unique("email_batch_environment_idempotency_key_unique").on(t.environmentId, t.idempotencyKey),
    unique("email_batch_id_organization_unique").on(t.id, t.organizationId),
  ],
);

export const email = pgTable(
  "email",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.email)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    // No FK: Better Auth hard-deletes expired keys, and email history must survive that.
    apiKeyId: text("api_key_id"),
    // The member whose personal key sent it, captured at acceptance (its usage is their spend
    // even after the key is revoked). No FK, like `api_key_id`.
    apiKeyOwnerId: text("api_key_owner_id"),
    status: emailStatus("status").notNull().default("queued"),
    from: text("from").notNull(),
    to: text("to").array().notNull(),
    cc: text("cc").array().notNull().default(sql`'{}'::text[]`),
    bcc: text("bcc").array().notNull().default(sql`'{}'::text[]`),
    replyTo: text("reply_to").array().notNull().default(sql`'{}'::text[]`),
    subject: text("subject").notNull(),
    html: text("html"),
    text: text("text"),
    // Internal sends whose body holds a secret (sign-in links in auth emails): `html`/`text` are
    // cleared when the email leaves `queued`/`scheduled`, like attachment content.
    discardBody: boolean("discard_body").notNull().default(false),
    // Internal senders only (fixed templates whose variable text was screened at setup).
    screeningExempt: boolean("screening_exempt").notNull().default(false),
    // The environment's content storage when the email was sent (`email_storage_settings`): when
    // false, the subject, body, headers, template variables and attachment filenames are cleared
    // once the email leaves `queued`/`scheduled` (`content_discarded_at` records when).
    storeContent: boolean("store_content").notNull().default(true),
    contentDiscardedAt: timestamp("content_discarded_at", { withTimezone: true }),
    headers: jsonb("headers").$type<Record<string, string>>().notNull().default({}),
    tags: jsonb("tags").$type<EmailTag[]>().notNull().default([]),
    // Matched against category-scoped suppressions and tracking rules.
    category: text("category"),
    // Decides the provider's configuration set and tenant (and the dispatch queue).
    stream: emailStream("stream").notNull().default("transactional"),
    // Open/click tracking, resolved once at send (per-send override, category rule, environment
    // default). The token names the email in its public `/t/*` URLs; set only when tracking or
    // one-click unsubscribe is on.
    trackOpens: boolean("track_opens").notNull().default(false),
    trackClicks: boolean("track_clicks").notNull().default(false),
    // One-click unsubscribe (RFC 8058) headers on the provider's copy: resolved at send like
    // tracking, and only for an email with a category and a single recipient.
    unsubscribe: boolean("unsubscribe").notNull().default(false),
    trackingToken: text("tracking_token").unique("email_tracking_token_unique"),
    openCount: integer("open_count").notNull().default(0),
    firstOpenedAt: timestamp("first_opened_at", { withTimezone: true }),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    clickCount: integer("click_count").notNull().default(0),
    firstClickedAt: timestamp("first_clicked_at", { withTimezone: true }),
    lastClickedAt: timestamp("last_clicked_at", { withTimezone: true }),
    provider: text("provider"),
    providerMessageId: text("provider_message_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    idempotencyKey: text("idempotency_key"),
    requestHash: text("request_hash"),
    // Set for emails sent by `POST /v1/emails/batch`; the index is the email's position in it.
    batchId: text("batch_id"),
    batchIndex: integer("batch_index"),
    // Broadcast emails: their content is the broadcast's, rendered with `variables` (the
    // contact's template values, frozen when the email was made) at dispatch and on read, so
    // `html`/`text` stay NULL. One per broadcast and contact.
    broadcastId: text("broadcast_id"),
    contactId: text("contact_id"),
    variables: jsonb("variables").$type<Record<string, string>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    // When the email may be handed to the provider; set only for requests with `scheduled_at`.
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    // Billing (`@coss/billing`): the recipients the send is billed for, frozen when a dispatcher
    // claims it (suppressed ones excluded); `usage_recorded_at` marks it metered (once, when sent).
    billableRecipients: integer("billable_recipients"),
    usageRecordedAt: timestamp("usage_recorded_at", { withTimezone: true }),
    // The template the email was rendered from (no FK: emails outlive their templates). The
    // version is NULL for the dashboard's test sends of a draft.
    templateId: text("template_id"),
    templateVersion: integer("template_version"),
    templateLocale: text("template_locale"),
    // Handed to the provider through the organization's dedicated IP pool (set at claim): metered
    // as `email.dedicated_ip` too, and its deliveries counted per sending IP.
    dedicatedPool: boolean("dedicated_pool").notNull().default(false),
    // Decided at the claim, with `dedicated_pool`: its organization is in HIPAA mode.
    requireTls: boolean("require_tls").notNull().default(false),
    // Sent from coss.com's own environment for an organization in HIPAA mode (Forms, Sign, Verify
    // and Scheduling fall back to it): the row is coss.com's, but the mode's rules still apply.
    hipaaOrigin: boolean("hipaa_origin").notNull().default(false),
    // Email for platforms: the sub-account it was sent for (its quotas, suppressions and
    // reputation). No FK, like `api_key_id`: emails outlive a deleted sub-account.
    subaccountId: text("subaccount_id"),
    // Handed to the provider through the sub-account's own tenant (set at claim: the From domain
    // was the sub-account's); else the organization's.
    subaccountTenant: boolean("subaccount_tenant").notNull().default(false),
    // The caller's W3C trace context (`traceparent` header of the request that sent it, validated
    // and normalized): echoed in the email's log lines and webhooks, so they join the caller's trace.
    traceparent: text("traceparent"),
  },
  (t) => [
    foreignKey({
      name: "email_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "email_batch_fk",
      columns: [t.batchId, t.organizationId],
      foreignColumns: [emailBatch.id, emailBatch.organizationId],
    }),
    index("email_batch_idx").on(t.batchId, t.batchIndex).where(sql`${t.batchId} is not null`),
    uniqueIndex("email_broadcast_contact_unique")
      .on(t.broadcastId, t.contactId)
      .where(sql`${t.broadcastId} is not null`),
    index("email_broadcast_status_idx")
      .on(t.broadcastId, t.status)
      .where(sql`${t.broadcastId} is not null`),
    // NULL keys are distinct, so requests without an Idempotency-Key never conflict.
    unique("email_environment_idempotency_key_unique").on(t.environmentId, t.idempotencyKey),
    index("email_environment_created_at_idx").on(t.environmentId, t.createdAt.desc()),
    index("email_organization_created_at_idx").on(t.organizationId, t.createdAt),
    // Reputation checks scan an organization's emails by the time they were sent
    // (`@coss/email` reputation-checks.ts `SEND_TIME`; keep the expression identical).
    index("email_organization_send_time_idx").on(
      t.organizationId,
      sql`coalesce(${t.sentAt}, ${t.createdAt})`,
    ),
    // The same scan per sub-account (its reputation), and its emails newest first.
    index("email_subaccount_send_time_idx")
      .on(t.subaccountId, sql`coalesce(${t.sentAt}, ${t.createdAt})`)
      .where(sql`${t.subaccountId} is not null`),
    // Due-scan for scheduled sends (`dispatchDue`, every 5 s): only rows still waiting, so the
    // scan never walks emails already sent or immediate sends with a past time.
    index("email_scheduled_due_idx").on(t.scheduledAt).where(sql`${t.status} = 'scheduled'`),
    // The worker's sweeps for queued emails whose dispatch was lost or interrupted.
    index("email_queued_created_at_idx").on(t.createdAt).where(sql`${t.status} = 'queued'`),
    // The worker's retention purge (oldest first, across organizations).
    index("email_created_at_idx").on(t.createdAt),
    // Target for composite FKs that pin children to the same organization.
    unique("email_id_organization_unique").on(t.id, t.organizationId),
  ],
);

export const emailRecipientKind = pgEnum("email_recipient_kind", ["to", "cc", "bcc"]);

/** Ordered by precedence: a recipient only moves to a higher-ranked status (see `@coss/email`). */
export const emailRecipientStatus = pgEnum("email_recipient_status", [
  "queued",
  "sent",
  "delivery_delayed",
  "delivered",
  "bounced",
  "suppressed",
  "complained",
  "failed",
  "canceled",
]);

/** Wire-format (snake_case) event details, stored as-is and returned by the API. */
export type EmailEventDetails = {
  bounce?: {
    type: "permanent" | "transient" | "undetermined";
    sub_type: string;
    diagnostic_code: string | null;
  };
  complaint?: { feedback_type: string | null; sub_type: string | null };
  delay?: { type: string; expires_at: string | null; diagnostic_code: string | null };
  delivery?: { smtp_response: string | null };
  failure?: { code: string; message: string };
  suppression?: { id: string; scope: string; reason: EmailSuppressionReason };
  open?: { user_agent: string | null };
  click?: { url: string; link_position: number; user_agent: string | null };
  reschedule?: { scheduled_at: string; previous_scheduled_at: string };
};

/** One row per distinct recipient address of an email; its status is driven by delivery events. */
export const emailRecipient = pgTable(
  "email_recipient",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.emailRecipient)),
    organizationId: text("organization_id").notNull(),
    emailId: text("email_id").notNull(),
    // Bare address, lower-cased (no display name).
    address: text("address").notNull(),
    kind: emailRecipientKind("kind").notNull(),
    position: integer("position").notNull(),
    status: emailRecipientStatus("status").notNull().default("queued"),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    details: jsonb("details").$type<EmailEventDetails>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "email_recipient_email_fk",
      columns: [t.emailId, t.organizationId],
      foreignColumns: [email.id, email.organizationId],
    }).onDelete("cascade"),
    unique("email_recipient_email_address_unique").on(t.emailId, t.address),
    // `GET /v1/emails?to=`: an address's emails.
    index("email_recipient_organization_address_idx").on(t.organizationId, t.address),
  ],
);

/** Postgres `bytea` (drizzle 0.x has no builder for it); node-postgres returns a `Buffer`. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/**
 * One row per attachment of an email. `content` is only kept until the email is sent or fails,
 * then set to null; the metadata stays.
 */
export const emailAttachment = pgTable(
  "email_attachment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.emailAttachment)),
    organizationId: text("organization_id").notNull(),
    emailId: text("email_id").notNull(),
    position: integer("position").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    // Set for inline attachments (referenced from the HTML as `cid:<content_id>`).
    contentId: text("content_id"),
    size: integer("size").notNull(),
    // Hex SHA-256 of the content, kept after the content is purged.
    sha256: text("sha256").notNull(),
    content: bytea("content"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "email_attachment_email_fk",
      columns: [t.emailId, t.organizationId],
      foreignColumns: [email.id, email.organizationId],
    }).onDelete("cascade"),
    unique("email_attachment_email_position_unique").on(t.emailId, t.position),
  ],
);

export const emailEventType = pgEnum("email_event_type", [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
  "email.scheduled",
  "email.canceled",
  "email.opened",
  "email.clicked",
  "email.rescheduled",
  "email.unsubscribed",
]);

/**
 * Normalized delivery events (from SES, the fake provider, or coss.com itself). Message-level events
 * (`email.sent`, `email.failed`) have no recipient. `dedupe_key` makes ingestion idempotent.
 */
export const emailEvent = pgTable(
  "email_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.emailEvent)),
    organizationId: text("organization_id").notNull(),
    environmentId: text("environment_id").notNull(),
    emailId: text("email_id").notNull(),
    type: emailEventType("type").notNull(),
    provider: text("provider").notNull(),
    providerEventType: text("provider_event_type").notNull(),
    recipient: text("recipient"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    details: jsonb("details").$type<EmailEventDetails>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "email_event_email_fk",
      columns: [t.emailId, t.organizationId],
      foreignColumns: [email.id, email.organizationId],
    }).onDelete("cascade"),
    unique("email_event_email_dedupe_unique").on(t.emailId, t.dedupeKey),
    index("email_event_email_occurred_at_idx").on(t.emailId, t.occurredAt),
  ],
);

export const emailSuppressionReason = pgEnum("email_suppression_reason", [
  "bounce",
  "complaint",
  "manual",
  "import",
  "unsubscribe",
]);

export type EmailSuppressionReason = (typeof emailSuppressionReason.enumValues)[number];

/**
 * An environment's suppression list: sends skip a recipient whose address has an entry with scope
 * `*` or with the email's category. Permanent bounces and complaints add `*` entries. Each
 * sub-account has its own list (`subaccount_id`): its sends skip its entries and the
 * environment's own (`subaccount_id` NULL), and its bounces and complaints go on its list only.
 */
export const emailSuppression = pgTable(
  "email_suppression",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.emailSuppression)),
    sequence: bigint("sequence", { mode: "number" }).generatedAlwaysAsIdentity(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    // Bare address, lower-cased (no display name).
    address: text("address").notNull(),
    // `*` (every email) or a category.
    scope: text("scope").notNull(),
    reason: emailSuppressionReason("reason").notNull(),
    // The email whose bounce or complaint added the entry. No FK: the entry outlives the email.
    emailId: text("email_id"),
    subaccountId: text("subaccount_id"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "email_suppression_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "email_suppression_subaccount_fk",
      columns: [t.subaccountId, t.organizationId],
      foreignColumns: [emailSubaccount.id, emailSubaccount.organizationId],
    }).onDelete("cascade"),
    unique("email_suppression_environment_subaccount_address_scope_unique")
      .on(t.environmentId, t.subaccountId, t.address, t.scope)
      .nullsNotDistinct(),
    index("email_suppression_subaccount_sequence_idx")
      .on(t.subaccountId, t.createdAt.desc(), t.sequence.desc())
      .where(sql`${t.subaccountId} is not null`),
    index("email_suppression_environment_sequence_idx").on(
      t.environmentId,
      t.createdAt.desc(),
      t.sequence.desc(),
    ),
  ],
);

/**
 * An environment's content storage: with `store_content` off, an email's content is kept only
 * until it leaves the queue (snapshotted on each email at send). No row means stored.
 */
export const emailStorageSettings = pgTable(
  "email_storage_settings",
  {
    environmentId: text("environment_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    storeContent: boolean("store_content").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "email_storage_settings_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
  ],
);

/**
 * An environment's open/click tracking settings: the row with a NULL category is the environment
 * default, the others override it for one category. Each field resolves separately (a send's own
 * `tracking` wins, then its category's rule, then the default, then off).
 */
export const emailTrackingRule = pgTable(
  "email_tracking_rule",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.emailTrackingRule)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    category: text("category"),
    opens: boolean("opens").notNull(),
    clicks: boolean("clicks").notNull(),
    unsubscribe: boolean("unsubscribe").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "email_tracking_rule_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    unique("email_tracking_rule_environment_category_unique")
      .on(t.environmentId, t.category)
      .nullsNotDistinct(),
  ],
);

/** A declared template variable (`@coss/email/templates` `TemplateVariable`). */
export type EmailTemplateVariableJson = {
  name: string;
  type: "string" | "number" | "boolean" | "list";
  required: boolean;
  default?: string | number | boolean;
  description?: string;
  fields?: { name: string; type: "string" | "number" | "boolean"; required: boolean }[];
};

/**
 * An environment's email template. Its content lives in versions: one draft (`version` NULL) that
 * is edited, and immutable published versions numbered from 1; `published_version` is the one
 * sends use unless they pin another. Sends address it by id or by its `alias`, which can be the
 * same in every environment.
 */
export const emailTemplate = pgTable(
  "email_template",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.emailTemplate)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    name: text("name").notNull(),
    alias: text("alias"),
    description: text("description"),
    publishedVersion: integer("published_version"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    // Stable list order (keyset pages by created_at, then this).
    sequence: bigint("sequence", { mode: "number" }).generatedAlwaysAsIdentity().notNull(),
  },
  (t) => [
    foreignKey({
      name: "email_template_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    // NULL aliases are distinct.
    unique("email_template_environment_alias_unique").on(t.environmentId, t.alias),
    index("email_template_environment_created_at_idx").on(
      t.environmentId,
      t.createdAt.desc(),
      t.sequence.desc(),
    ),
    unique("email_template_id_organization_unique").on(t.id, t.organizationId),
  ],
);

/**
 * A template's draft (`version` NULL, one per template) or one of its published versions, which
 * never change. `revision` counts the draft's saves, so an editor can refuse to overwrite (or
 * publish) a draft someone else changed meanwhile.
 */
export const emailTemplateVersion = pgTable(
  "email_template_version",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.emailTemplateVersion)),
    organizationId: text("organization_id").notNull(),
    templateId: text("template_id").notNull(),
    version: integer("version"),
    defaultLocale: text("default_locale").notNull(),
    variables: jsonb("variables").$type<EmailTemplateVariableJson[]>().notNull().default([]),
    // Example values for the dashboard's preview and test sends (customer data, never rendered by
    // API versioning: `OPAQUE_FIELDS`).
    sampleVariables: jsonb("sample_variables")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    revision: integer("revision").notNull().default(1),
    // Draft only: saved since the last publish (or never published).
    hasUnpublishedChanges: boolean("has_unpublished_changes").notNull().default(true),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "email_template_version_template_fk",
      columns: [t.templateId, t.organizationId],
      foreignColumns: [emailTemplate.id, emailTemplate.organizationId],
    }).onDelete("cascade"),
    unique("email_template_version_template_version_unique").on(t.templateId, t.version),
    uniqueIndex("email_template_version_draft_unique")
      .on(t.templateId)
      .where(sql`${t.version} is null`),
    unique("email_template_version_id_organization_unique").on(t.id, t.organizationId),
  ],
);

/** One locale's subject, HTML and text in a template version. */
export const emailTemplateContent = pgTable(
  "email_template_content",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.emailTemplateContent)),
    organizationId: text("organization_id").notNull(),
    versionId: text("version_id").notNull(),
    locale: text("locale").notNull(),
    subject: text("subject").notNull(),
    html: text("html"),
    text: text("text"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "email_template_content_version_fk",
      columns: [t.versionId, t.organizationId],
      foreignColumns: [emailTemplateVersion.id, emailTemplateVersion.organizationId],
    }).onDelete("cascade"),
    unique("email_template_content_version_locale_unique").on(t.versionId, t.locale),
  ],
);

export const contactStatus = pgEnum("contact_status", ["subscribed", "unsubscribed", "pending"]);
export const contactSource = pgEnum("contact_source", [
  "api",
  "dashboard",
  "import",
  "preference_center",
  "form",
]);
export const contactPropertyType = pgEnum("contact_property_type", [
  "string",
  "number",
  "boolean",
  "date",
]);
export const topicDefaultSubscription = pgEnum("topic_default_subscription", ["opt_in", "opt_out"]);
export const topicVisibility = pgEnum("topic_visibility", ["public", "private"]);
export const contactTopicStatus = pgEnum("contact_topic_status", ["opted_in", "opted_out"]);

/**
 * An environment's contacts: who marketing email goes to, and whether they consented. One per
 * address (bare, lower-cased). `status` is consent to marketing as a whole (`pending`: waiting
 * for a double opt-in confirmation); `contact_topic` holds consent per topic. Deliverability
 * (bounces, complaints) stays in `email_suppression`.
 */
export const contact = pgTable(
  "contact",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.contact)),
    sequence: bigint("sequence", { mode: "number" }).generatedAlwaysAsIdentity(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    address: text("address").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    status: contactStatus("status").notNull().default("subscribed"),
    // Custom properties, validated against `contact_property` (`@coss/email` contacts.ts).
    properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default({}),
    source: contactSource("source").notNull(),
    // The consent trail.
    subscribedAt: timestamp("subscribed_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    pendingSince: timestamp("pending_since", { withTimezone: true }),
    confirmationSentAt: timestamp("confirmation_sent_at", { withTimezone: true }),
    confirmationCount: integer("confirmation_count").notNull().default(0),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "contact_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    unique("contact_environment_address_unique").on(t.environmentId, t.address),
    unique("contact_id_organization_unique").on(t.id, t.organizationId),
    index("contact_environment_sequence_idx").on(
      t.environmentId,
      t.createdAt.desc(),
      t.sequence.desc(),
    ),
    // Recipient resolution walks an environment's contacts by id (`@coss/email` audience-resolution.ts).
    index("contact_environment_id_idx").on(t.environmentId, t.id),
    // Segment filters on properties (`properties @> …`).
    index("contact_properties_idx").using("gin", t.properties.op("jsonb_path_ops")),
    // Pending contacts expire (retention purge).
    index("contact_pending_since_idx").on(t.pendingSince).where(sql`${t.status} = 'pending'`),
  ],
);

/** How many contacts an environment has: the plan limit is checked against it, not a count(*). */
export const contactCounter = pgTable(
  "contact_counter",
  {
    environmentId: text("environment_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "contact_counter_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    check("contact_counter_count_check", sql`${t.count} >= 0`),
  ],
);

/** A custom contact property of an environment (typed; `fallback` fills templates without one). */
export const contactProperty = pgTable(
  "contact_property",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.contactProperty)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    key: text("key").notNull(),
    type: contactPropertyType("type").notNull(),
    fallback: jsonb("fallback").$type<string | number | boolean | null>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "contact_property_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    unique("contact_property_environment_key_unique").on(t.environmentId, t.key),
  ],
);

/** A static list of contacts (members added and removed explicitly). */
export const audience = pgTable(
  "audience",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.audience)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    name: text("name").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "audience_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    unique("audience_environment_name_unique").on(t.environmentId, t.name),
    unique("audience_id_organization_unique").on(t.id, t.organizationId),
  ],
);

export const audienceMember = pgTable(
  "audience_member",
  {
    audienceId: text("audience_id").notNull(),
    contactId: text("contact_id").notNull(),
    organizationId: text("organization_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.audienceId, t.contactId] }),
    foreignKey({
      name: "audience_member_audience_fk",
      columns: [t.audienceId, t.organizationId],
      foreignColumns: [audience.id, audience.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "audience_member_contact_fk",
      columns: [t.contactId, t.organizationId],
      foreignColumns: [contact.id, contact.organizationId],
    }).onDelete("cascade"),
    index("audience_member_contact_idx").on(t.contactId),
  ],
);

/** A filter over an environment's contacts, evaluated whenever it is used (`@coss/email` segments.ts). */
export const segment = pgTable(
  "segment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.segment)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    name: text("name").notNull(),
    filter: jsonb("filter").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "segment_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    unique("segment_environment_name_unique").on(t.environmentId, t.name),
  ],
);

/**
 * A subscription topic of an environment, built on categories: `key` is the `category` of the
 * emails about it. `opt_in` topics reach every subscribed contact unless they opted out; `opt_out`
 * topics only those who opted in. `private` ones never show in the preference center.
 */
export const topic = pgTable(
  "topic",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.topic)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    defaultSubscription: topicDefaultSubscription("default_subscription").notNull(),
    visibility: topicVisibility("visibility").notNull().default("public"),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "topic_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    unique("topic_environment_key_unique").on(t.environmentId, t.key),
    unique("topic_id_organization_unique").on(t.id, t.organizationId),
  ],
);

/** A contact's explicit choice for one topic (no row: the topic's default applies). */
export const contactTopic = pgTable(
  "contact_topic",
  {
    contactId: text("contact_id").notNull(),
    topicId: text("topic_id").notNull(),
    organizationId: text("organization_id").notNull(),
    status: contactTopicStatus("status").notNull(),
    source: contactSource("source").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.contactId, t.topicId] }),
    foreignKey({
      name: "contact_topic_contact_fk",
      columns: [t.contactId, t.organizationId],
      foreignColumns: [contact.id, contact.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "contact_topic_topic_fk",
      columns: [t.topicId, t.organizationId],
      foreignColumns: [topic.id, topic.organizationId],
    }).onDelete("cascade"),
    index("contact_topic_topic_status_idx").on(t.topicId, t.status, t.contactId),
  ],
);

/**
 * An environment's marketing settings: the name and postal address marketing emails carry
 * (CAN-SPAM), and double opt-in confirmations.
 */
export const marketingSettings = pgTable(
  "marketing_settings",
  {
    environmentId: text("environment_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    displayName: text("display_name"),
    // Required before any marketing email goes out.
    mailingAddress: text("mailing_address"),
    confirmationFrom: text("confirmation_from"),
    confirmationSubject: text("confirmation_subject"),
    confirmationHtml: text("confirmation_html"),
    confirmationText: text("confirmation_text"),
    confirmedRedirectUrl: text("confirmed_redirect_url"),
    doubleOptInDefault: boolean("double_opt_in_default").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "marketing_settings_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
  ],
);

export const broadcastStatus = pgEnum("broadcast_status", [
  "draft",
  "scheduled",
  "sending",
  "paused",
  "sent",
  "canceled",
  "failed",
]);

export const broadcastScreeningStatus = pgEnum("broadcast_screening_status", [
  "pending",
  "passed",
  "held",
  "blocked",
]);

/**
 * A marketing email to an audience or a segment (`@coss/email` broadcasts.ts). Its content is
 * frozen when it starts sending; the worker then makes one email per eligible contact in throttled
 * batches (`cursor`: the last contact id done, `contact_upper_bound`: contacts created after the
 * start are left out), leased like a delivery (`lease_until`).
 */
export const broadcast = pgTable(
  "broadcast",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.broadcast)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    // No FK: Better Auth hard-deletes expired keys, and the broadcast must survive that.
    apiKeyId: text("api_key_id"),
    // The member whose personal key created it (copied onto its emails). No FK.
    apiKeyOwnerId: text("api_key_owner_id"),
    name: text("name").notNull(),
    status: broadcastStatus("status").notNull().default("draft"),
    audienceId: text("audience_id"),
    segmentId: text("segment_id"),
    // The topic (its key: the emails' category) the broadcast is about, if any.
    topic: text("topic"),
    from: text("from").notNull(),
    replyTo: text("reply_to").array().notNull().default(sql`'{}'::text[]`),
    subject: text("subject").notNull(),
    previewText: text("preview_text"),
    html: text("html"),
    text: text("text"),
    trackOpens: boolean("track_opens").notNull().default(false),
    trackClicks: boolean("track_clicks").notNull().default(false),
    // Recipients per second; null: the plan's marketing rate.
    ratePerSecond: integer("rate_per_second"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    contactUpperBound: text("contact_upper_bound"),
    cursor: text("cursor"),
    recipientsEstimated: integer("recipients_estimated"),
    materialized: integer("materialized").notNull().default(0),
    screeningStatus: broadcastScreeningStatus("screening_status").notNull().default("pending"),
    /** When screening first failed to run (it is retried until an hour after). */
    screeningHeldAt: timestamp("screening_held_at", { withTimezone: true }),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    // Why a `paused` broadcast waits (`billing_hold`, `usage_limit`, `marketing_paused`, …).
    pauseReason: text("pause_reason"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    idempotencyKey: text("idempotency_key"),
    requestHash: text("request_hash"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "broadcast_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    check("broadcast_target_check", sql`(${t.audienceId} is null) <> (${t.segmentId} is null)`),
    unique("broadcast_id_organization_unique").on(t.id, t.organizationId),
    unique("broadcast_environment_idempotency_key_unique").on(t.environmentId, t.idempotencyKey),
    index("broadcast_environment_created_at_idx").on(t.environmentId, t.createdAt.desc()),
    // The worker's due scan.
    index("broadcast_due_idx").on(t.nextRunAt).where(sql`${t.status} in ('scheduled', 'sending')`),
  ],
);

/**
 * A broadcast's counters, split into shards (by email) so event ingestion never queues on one hot
 * row. Reads sum the shards.
 */
export const broadcastStat = pgTable(
  "broadcast_stat",
  {
    broadcastId: text("broadcast_id").notNull(),
    shard: integer("shard").notNull(),
    organizationId: text("organization_id").notNull(),
    recipients: integer("recipients").notNull().default(0),
    sent: integer("sent").notNull().default(0),
    delivered: integer("delivered").notNull().default(0),
    bounced: integer("bounced").notNull().default(0),
    complained: integer("complained").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    opened: integer("opened").notNull().default(0),
    clicked: integer("clicked").notNull().default(0),
    unsubscribed: integer("unsubscribed").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.broadcastId, t.shard] }),
    foreignKey({
      name: "broadcast_stat_broadcast_fk",
      columns: [t.broadcastId, t.organizationId],
      foreignColumns: [broadcast.id, broadcast.organizationId],
    }).onDelete("cascade"),
  ],
);

/** A link coss.com rewrote in a click-tracked email; `position` is its index in the HTML. */
export const emailLink = pgTable(
  "email_link",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.emailLink)),
    organizationId: text("organization_id").notNull(),
    emailId: text("email_id").notNull(),
    position: integer("position").notNull(),
    url: text("url").notNull(),
    clickCount: integer("click_count").notNull().default(0),
    firstClickedAt: timestamp("first_clicked_at", { withTimezone: true }),
    lastClickedAt: timestamp("last_clicked_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "email_link_email_fk",
      columns: [t.emailId, t.organizationId],
      foreignColumns: [email.id, email.organizationId],
    }).onDelete("cascade"),
    unique("email_link_email_position_unique").on(t.emailId, t.position),
  ],
);

export const tenantSendingStatus = pgEnum("tenant_sending_status", [
  "enabled",
  "disabled",
  "reinstated",
]);

/**
 * The provider-side tenants of an organization, one per stream (an SES tenant: isolated
 * reputation, suppression list and pausing). Created with the organization's first domain. An
 * email sub-account gets its own (transactional) tenant with its first own domain
 * (`subaccount_id`).
 */
export const emailTenant = pgTable(
  "email_tenant",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    subaccountId: text("subaccount_id"),
    // One tenant per stream: SES pauses (and rates) each on its own.
    stream: emailStream("stream").notNull().default("transactional"),
    provider: text("provider").notNull(),
    tenantName: text("tenant_name").primaryKey(),
    tenantArn: text("tenant_arn"),
    sendingStatus: tenantSendingStatus("sending_status").notNull().default("enabled"),
    // Bootstrap commits the imported lists and this marker together before disabling SES
    // suppression.
    suppressionMigratedAt: timestamp("suppression_migrated_at", { withTimezone: true }),
    statusCause: text("status_cause"),
    statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("email_tenant_owner_stream_unique")
      .on(t.organizationId, t.subaccountId, t.stream)
      .nullsNotDistinct(),
    // No cascade: deleting a sub-account deletes its provider tenant first.
    foreignKey({
      name: "email_tenant_subaccount_fk",
      columns: [t.subaccountId, t.organizationId],
      foreignColumns: [emailSubaccount.id, emailSubaccount.organizationId],
    }),
  ],
);

export const dedicatedIpPoolStatus = pgEnum("dedicated_ip_pool_status", [
  // Over COSS's pool capacity: nothing is created until a slot frees up.
  "waiting",
  "provisioning",
  // Live sends go through the pool; the provider is still warming its IPs up (or has none yet).
  "warming",
  "ready",
  // No longer paid for: sends are back on shared IPs, the pool is released after a grace period.
  "releasing",
]);

/**
 * An organization's dedicated IP pool (the Dedicated IPs add-on): a provider-managed pool (SES
 * managed dedicated IPs, warmed up automatically) and a configuration set per stream that sends
 * through it. Reconciled by the worker against billing; the row is deleted once the pool is released.
 */
export const dedicatedIpPool = pgTable(
  "dedicated_ip_pool",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.dedicatedIpPool)),
    organizationId: text("organization_id")
      .notNull()
      .unique("dedicated_ip_pool_organization_unique")
      .references(() => organization.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    status: dedicatedIpPoolStatus("status").notNull(),
    // The pool's IPs as the provider last listed them.
    ips: jsonb("ips").$type<string[]>().notNull().default([]),
    // Share of the last 7 days' deliveries that left from the pool's IPs (null: too few).
    dedicatedShare: real("dedicated_share"),
    statusMessage: text("status_message"),
    // Failed provider calls in a row (provisioning and release back off on them).
    attempts: integer("attempts").notNull().default(0),
    nextCheckAt: timestamp("next_check_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    provisionedAt: timestamp("provisioned_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    // `releasing`: when the provider resources may be deleted (sends claimed before keep them).
    releaseAfter: timestamp("release_after", { withTimezone: true }),
    // Set before the provider resources are deleted: from then on a returning entitlement no
    // longer restores this row (it gets a new pool once the release has finished).
    releaseStartedAt: timestamp("release_started_at", { withTimezone: true }),
    // When the pool's configuration sets were set to require TLS (HIPAA mode). Until then the
    // organization's mail takes the shared TLS sets instead of the pool.
    tlsRequiredAt: timestamp("tls_required_at", { withTimezone: true }),
    // When the marketing stream's configuration set on the pool was set up (null: marketing
    // sends stay on shared IPs). Pools made before the streams split, or while the organization
    // had no marketing tenant yet, get it at a later check.
    marketingConfiguredAt: timestamp("marketing_configured_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("dedicated_ip_pool_next_check_at_idx")
      .on(t.nextCheckAt)
      .where(sql`${t.nextCheckAt} is not null`),
  ],
);

/** Deliveries of dedicated-pool emails per UTC hour and sending IP (from the provider's events). */
export const dedicatedIpDeliveryRollup = pgTable(
  "dedicated_ip_delivery_rollup",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    hour: timestamp("hour", { withTimezone: true }).notNull(),
    sendingIp: text("sending_ip").notNull(),
    delivered: integer("delivered").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.hour, t.sendingIp] }),
    // The retention purge (oldest first, across organizations).
    index("dedicated_ip_delivery_rollup_hour_idx").on(t.hour),
  ],
);

export const domainStatus = pgEnum("domain_status", [
  "pending",
  "verified",
  "temporary_failure",
  "failed",
  "deleting",
]);

export const mailFromStatus = pgEnum("mail_from_status", [
  "pending",
  "success",
  "temporary_failure",
  "failed",
]);

/** Result of checking one DNS record a domain needs (or should have). */
export type DomainRecord = {
  purpose: "dkim" | "mail_from_mx" | "mail_from_spf" | "dmarc";
  type: "CNAME" | "MX" | "TXT";
  name: string;
  value: string;
  priority: number | null;
  required: boolean;
  status: "verified" | "missing" | "mismatch" | "not_checked";
  /** What DNS returned when it did not match. */
  found: string[];
};

const DMARC_REPORT_TOKEN_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** The random part of a domain's DMARC report address (`dmarc-<token>@<managed inbound domain>`). */
export function newDmarcReportToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // 32 symbols divide 256 evenly, so `% 32` keeps every symbol equally likely.
  return Array.from(bytes, (byte) => DMARC_REPORT_TOKEN_ALPHABET[byte % 32]).join("");
}

/**
 * The last BIMI check of a domain (`packages/email/src/bimi.ts`): DNS only, coss.com never fetches
 * the logo or the certificate. Issues are stored as codes; messages are rendered on read.
 */
export type DomainBimi = {
  status: "not_checked" | "missing" | "invalid" | "configured";
  /** Where the BIMI record was found, or looked up when there is none. */
  name: string;
  record: string | null;
  logoUrl: string | null;
  certificateUrl: string | null;
  dmarcPolicy: "none" | "quarantine" | "reject" | null;
  issues: (
    | "dmarc_missing"
    | "dmarc_not_enforced"
    | "dmarc_partial"
    | "record_multiple"
    | "record_invalid"
    | "logo_missing"
    | "logo_not_https"
    | "certificate_missing"
    | "certificate_not_https"
  )[];
};

/**
 * A sending domain of an organization (an SES domain identity with Easy DKIM and a custom MAIL
 * FROM subdomain). Names are unique across organizations while not `failed`: DKIM tokens belong
 * to the provider account, so two organizations can never hold the same identity.
 */
export const domain = pgTable(
  "domain",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.domain)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Lower-case ASCII (punycode), no trailing dot.
    name: text("name").notNull(),
    status: domainStatus("status").notNull().default("pending"),
    canSend: boolean("can_send").notNull().default(false),
    provider: text("provider").notNull(),
    region: text("region"),
    dkimTokens: text("dkim_tokens").array().notNull().default(sql`'{}'::text[]`),
    dkimHostedZone: text("dkim_hosted_zone"),
    mailFromDomain: text("mail_from_domain").notNull(),
    mailFromStatus: mailFromStatus("mail_from_status").notNull().default("pending"),
    records: jsonb("records").$type<DomainRecord[]>().notNull().default([]),
    // The last BIMI check (`null` until the domain is checked).
    bimi: jsonb("bimi").$type<DomainBimi>(),
    // Verification gives up 72 hours after this (creation, or the latest restart).
    verificationStartedAt: timestamp("verification_started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    nextCheckAt: timestamp("next_check_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    // Routes DMARC aggregate reports (`rua=mailto:dmarc-<token>@<managed inbound domain>`) here.
    dmarcReportToken: text("dmarc_report_token")
      .notNull()
      .$defaultFn(() => newDmarcReportToken()),
    // The `v=DMARC1` record found at `_dmarc.<name>` by the latest DNS check (null: none found).
    dmarcRecord: text("dmarc_record"),
    // A subdomain without a record of its own: its organizational domain's `v=DMARC1` record,
    // whose `sp` (else `p`) receivers apply to it (null otherwise).
    dmarcInheritedRecord: text("dmarc_inherited_record"),
    // When a DNS check first saw the policy that applies (own or inherited, including none);
    // readiness for the next policy counts from here.
    dmarcPolicyChangedAt: timestamp("dmarc_policy_changed_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    // Email for platforms: the sub-account the domain belongs to (only it sends from it, through
    // its own tenant). No cascade: deleting a sub-account releases its identities first.
    subaccountId: text("subaccount_id"),
    // An organization's domain its sub-accounts may send from too (through its tenant).
    sharedWithSubaccounts: boolean("shared_with_subaccounts").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "domain_subaccount_fk",
      columns: [t.subaccountId, t.organizationId],
      foreignColumns: [emailSubaccount.id, emailSubaccount.organizationId],
    }),
    check(
      "domain_shared_not_subaccount",
      sql`not (${t.sharedWithSubaccounts} and ${t.subaccountId} is not null)`,
    ),
    index("domain_subaccount_idx").on(t.subaccountId).where(sql`${t.subaccountId} is not null`),
    unique("domain_dmarc_report_token_unique").on(t.dmarcReportToken),
    uniqueIndex("domain_name_active_unique").on(t.name).where(sql`${t.status} <> 'failed'`),
    index("domain_organization_idx").on(t.organizationId),
    index("domain_next_check_at_idx").on(t.nextCheckAt).where(sql`${t.nextCheckAt} is not null`),
    unique("domain_id_organization_unique").on(t.id, t.organizationId),
  ],
);

export const trackingDomainStatus = pgEnum("tracking_domain_status", [
  "pending",
  "active",
  "temporary_failure",
  "failed",
  "deleting",
]);

/** Result of checking the CNAME a tracking domain needs (same statuses as `DomainRecord`). */
export type TrackingDomainRecord = {
  type: "CNAME";
  name: string;
  value: string;
  status: DomainRecord["status"];
  found: string[];
};

/**
 * The custom tracking hostname of a sending domain (e.g. `links.acme.com`, a CNAME to coss.com's
 * tracking host): open pixels and click redirects of emails sent from that domain use it once the
 * provider (CloudFront) serves it with a certificate. At most one per domain; hostnames
 * are unique across organizations while not `failed`.
 */
export const trackingDomain = pgTable(
  "tracking_domain",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.trackingDomain)),
    organizationId: text("organization_id").notNull(),
    domainId: text("domain_id").notNull(),
    // Lower-case ASCII (punycode), no trailing dot; a subdomain of the domain's name.
    hostname: text("hostname").notNull(),
    status: trackingDomainStatus("status").notNull().default("pending"),
    provider: text("provider").notNull(),
    // The provider's id for the hostname (a CloudFront distribution tenant id); null until created.
    providerHostnameId: text("provider_hostname_id"),
    record: jsonb("record").$type<TrackingDomainRecord>().notNull(),
    // The latest problem the provider reported (certificate validation, blocked hostname…).
    providerMessage: text("provider_message"),
    // Verification gives up 72 hours after this (creation, or the latest restart).
    verificationStartedAt: timestamp("verification_started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    nextCheckAt: timestamp("next_check_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "tracking_domain_domain_fk",
      columns: [t.domainId, t.organizationId],
      foreignColumns: [domain.id, domain.organizationId],
    }).onDelete("cascade"),
    unique("tracking_domain_domain_unique").on(t.domainId),
    uniqueIndex("tracking_domain_hostname_active_unique")
      .on(t.hostname)
      .where(sql`${t.status} <> 'failed'`),
    index("tracking_domain_next_check_at_idx")
      .on(t.nextCheckAt)
      .where(sql`${t.nextCheckAt} is not null`),
  ],
);

/** Result of checking the MX a receiving domain needs (same statuses as `DomainRecord`). */
export type ReceivingDomainRecord = {
  type: "MX";
  name: string;
  value: string;
  priority: number;
  status: DomainRecord["status"];
  found: string[];
};

/**
 * A hostname of a sending domain that receives email (the domain itself or a subdomain, with an MX
 * to the provider's inbound host), delivered to one environment of the organization. At most one
 * per domain; hostnames are unique across organizations. The MX check is only shown to the
 * customer: mail is accepted whenever the provider receives it for a routed hostname.
 */
export const receivingDomain = pgTable(
  "receiving_domain",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.receivingDomain)),
    organizationId: text("organization_id").notNull(),
    domainId: text("domain_id").notNull(),
    environmentId: text("environment_id").notNull(),
    // Lower-case ASCII (punycode), no trailing dot; the domain's name or a subdomain of it.
    hostname: text("hostname").notNull(),
    record: jsonb("record").$type<ReceivingDomainRecord>().notNull(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    nextCheckAt: timestamp("next_check_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "receiving_domain_domain_fk",
      columns: [t.domainId, t.organizationId],
      foreignColumns: [domain.id, domain.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "receiving_domain_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    unique("receiving_domain_domain_unique").on(t.domainId),
    unique("receiving_domain_hostname_unique").on(t.hostname),
    index("receiving_domain_environment_idx").on(t.environmentId),
    index("receiving_domain_next_check_at_idx")
      .on(t.nextCheckAt)
      .where(sql`${t.nextCheckAt} is not null`),
  ],
);

/**
 * An environment's address space under coss.com's managed inbound domain:
 * `<anything>@<label>.<INBOUND_MANAGED_DOMAIN>`. Created on first read; the label never changes.
 */
export const environmentInboundAddress = pgTable(
  "environment_inbound_address",
  {
    environmentId: text("environment_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    label: text("label").notNull().unique("environment_inbound_address_label_unique"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "environment_inbound_address_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
  ],
);

export const receivedEmailStatus = pgEnum("received_email_status", ["received", "blocked"]);

/** One header line of a received email, in message order (names keep their case). */
export type ReceivedEmailHeader = { name: string; value: string };

/**
 * An email received for one environment. A message addressed to several environments (or
 * organizations) becomes one row each, holding only that environment's envelope recipients.
 * The raw message and attachment bytes live in the inbound content store (`raw_key`,
 * `content_key`); `blocked` rows (a virus verdict) keep no content.
 */
export const receivedEmail = pgTable(
  "received_email",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.receivedEmail)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    status: receivedEmailStatus("status").notNull(),
    blockedReason: text("blocked_reason"),
    provider: text("provider").notNull(),
    providerMessageId: text("provider_message_id").notNull(),
    // Envelope: MAIL FROM (empty for bounces) and this environment's RCPT TO addresses.
    mailFrom: text("mail_from").notNull(),
    recipients: text("recipients").array().notNull(),
    // Parsed headers (addresses as `Name <address>` or bare addresses).
    from: text("from"),
    to: text("to").array().notNull().default(sql`'{}'::text[]`),
    cc: text("cc").array().notNull().default(sql`'{}'::text[]`),
    replyTo: text("reply_to").array().notNull().default(sql`'{}'::text[]`),
    subject: text("subject"),
    messageId: text("message_id"),
    inReplyTo: text("in_reply_to"),
    references: text("references").array().notNull().default(sql`'{}'::text[]`),
    // The Date header, when it parses.
    sentAt: timestamp("sent_at", { withTimezone: true }),
    headers: jsonb("headers").$type<ReceivedEmailHeader[]>().notNull().default([]),
    text: text("text"),
    html: text("html"),
    // True when `text`, `html` or `headers` were cut to their stored limits (the raw message is whole).
    truncated: boolean("truncated").notNull().default(false),
    // Provider verdicts: pass | fail | gray | processing_failed (null when not checked).
    spamVerdict: text("spam_verdict"),
    virusVerdict: text("virus_verdict"),
    spfVerdict: text("spf_verdict"),
    dkimVerdict: text("dkim_verdict"),
    dmarcVerdict: text("dmarc_verdict"),
    // The sender domain's DMARC policy when DMARC failed: none | quarantine | reject.
    dmarcPolicy: text("dmarc_policy"),
    // Size of the raw message in bytes.
    size: integer("size").notNull(),
    rawKey: text("raw_key"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "received_email_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    // A provider notification delivered twice (SQS is at-least-once) records the email once.
    unique("received_email_provider_message_unique").on(
      t.environmentId,
      t.provider,
      t.providerMessageId,
    ),
    // Lists page newest first by id (UUIDv7 ids are time-ordered).
    index("received_email_environment_id_idx").on(t.environmentId, t.id.desc()),
    // The worker's retention purge and organization deletion.
    index("received_email_created_at_idx").on(t.createdAt),
    index("received_email_organization_idx").on(t.organizationId),
    unique("received_email_id_organization_unique").on(t.id, t.organizationId),
  ],
);

/** Attachment metadata of a received email; the bytes are in the content store (`content_key`). */
export const receivedEmailAttachment = pgTable(
  "received_email_attachment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.receivedEmailAttachment)),
    organizationId: text("organization_id").notNull(),
    receivedEmailId: text("received_email_id").notNull(),
    position: integer("position").notNull(),
    filename: text("filename"),
    contentType: text("content_type").notNull(),
    contentId: text("content_id"),
    // `attachment` or `inline`.
    disposition: text("disposition").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    contentKey: text("content_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "received_email_attachment_email_fk",
      columns: [t.receivedEmailId, t.organizationId],
      foreignColumns: [receivedEmail.id, receivedEmail.organizationId],
    }).onDelete("cascade"),
    unique("received_email_attachment_position_unique").on(t.receivedEmailId, t.position),
  ],
);

/**
 * The fake provider's inbound content store (development and tests: S3 in production). No FK:
 * content is written before its row, and cleaned up like S3 objects (explicit deletes, a
 * lifecycle-like retention step, organization deletion).
 */
export const inboundFakeObject = pgTable(
  "inbound_fake_object",
  {
    key: text("key").primaryKey(),
    organizationId: text("organization_id").notNull(),
    contentType: text("content_type").notNull(),
    content: bytea("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("inbound_fake_object_organization_idx").on(t.organizationId),
    index("inbound_fake_object_created_at_idx").on(t.createdAt),
  ],
);

/** Received messages dropped because an organization went over its daily inbound limit. */
export const inboundDropCounter = pgTable(
  "inbound_drop_counter",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // UTC day.
    day: text("day").notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ name: "inbound_drop_counter_pk", columns: [t.organizationId, t.day] })],
);

/** The policy a DMARC report says the domain published (`policy_published`). */
export type DmarcPublishedPolicy = {
  domain: string;
  p: string | null;
  sp: string | null;
  np: string | null;
  adkim: string | null;
  aspf: string | null;
  pct: number | null;
  testing: string | null;
};

/**
 * A DMARC aggregate report a mailbox provider sent about a domain (to its `rua` address, received
 * through coss.com's own receiving). Only the parsed report is kept, never the message.
 */
export const dmarcReport = pgTable(
  "dmarc_report",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.dmarcReport)),
    organizationId: text("organization_id").notNull(),
    domainId: text("domain_id").notNull(),
    reporterOrg: text("reporter_org").notNull(),
    reporterEmail: text("reporter_email"),
    // The reporter's own id of the report (unique per reporter).
    reportId: text("report_id").notNull(),
    periodBegin: timestamp("period_begin", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    policyPublished: jsonb("policy_published").$type<DmarcPublishedPolicy>().notNull(),
    messageCount: integer("message_count").notNull(),
    passCount: integer("pass_count").notNull(),
    // True when the report had more records than are kept (`MAX_DMARC_REPORT_RECORDS`).
    truncated: boolean("truncated").notNull().default(false),
    provider: text("provider").notNull(),
    providerMessageId: text("provider_message_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "dmarc_report_domain_fk",
      columns: [t.domainId, t.organizationId],
      foreignColumns: [domain.id, domain.organizationId],
    }).onDelete("cascade"),
    // Reporters resend reports, and SQS redelivers notifications: each report is recorded once.
    unique("dmarc_report_reporter_unique").on(t.domainId, t.reporterOrg, t.reportId),
    unique("dmarc_report_id_organization_unique").on(t.id, t.organizationId),
    index("dmarc_report_domain_period_idx").on(t.domainId, t.periodEnd),
    // Lists page newest first by id.
    index("dmarc_report_domain_id_idx").on(t.domainId, t.id.desc()),
    // The worker's retention purge and organization deletion.
    index("dmarc_report_created_at_idx").on(t.createdAt),
    index("dmarc_report_organization_idx").on(t.organizationId),
  ],
);

/** One authentication result a DMARC report lists for a record. */
export type DmarcAuthResults = {
  dkim: { domain: string; selector: string | null; result: string }[];
  spf: { domain: string; scope: string | null; result: string }[];
};

/** One row of a DMARC report: messages from one source IP with one outcome. */
export const dmarcReportRecord = pgTable(
  "dmarc_report_record",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.dmarcReportRecord)),
    organizationId: text("organization_id").notNull(),
    domainId: text("domain_id").notNull(),
    dmarcReportId: text("dmarc_report_id").notNull(),
    // The report's period, copied so summaries need no join.
    periodBegin: timestamp("period_begin", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    sourceIp: text("source_ip").notNull(),
    count: integer("count").notNull(),
    // What the receiver did: none | quarantine | reject.
    disposition: text("disposition").notNull(),
    // Aligned results (`policy_evaluated`): pass | fail.
    dkim: text("dkim").notNull(),
    spf: text("spf").notNull(),
    dmarcPass: boolean("dmarc_pass").notNull(),
    headerFrom: text("header_from").notNull(),
    envelopeFrom: text("envelope_from"),
    authResults: jsonb("auth_results").$type<DmarcAuthResults>().notNull(),
    // Overrides the receiver applied (`reason`: type + comment).
    reasons: jsonb("reasons").$type<{ type: string; comment: string | null }[]>().notNull(),
    // Signed with the domain's coss.com DKIM keys or sent from its coss.com MAIL FROM domain.
    viaCoss: boolean("via_coss").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [
    foreignKey({
      name: "dmarc_report_record_report_fk",
      columns: [t.dmarcReportId, t.organizationId],
      foreignColumns: [dmarcReport.id, dmarcReport.organizationId],
    }).onDelete("cascade"),
    index("dmarc_report_record_report_idx").on(t.dmarcReportId, t.position),
    index("dmarc_report_record_domain_period_idx").on(t.domainId, t.periodEnd),
    index("dmarc_report_record_organization_idx").on(t.organizationId),
  ],
);

export const dmarcNotificationKind = pgEnum("dmarc_notification_kind", [
  "ready_quarantine",
  "ready_reject",
  "pass_rate_dropped",
]);

export const dmarcNotificationStatus = pgEnum("dmarc_notification_status", [
  "pending",
  "sent",
  "skipped",
  "failed",
]);

/**
 * Outbox of the emails that tell an organization's owners and admins that a domain is ready for
 * a stricter DMARC policy, or that mail is failing DMARC under an enforcing one. Written when a
 * report is ingested; the worker sends it (`runDueDmarcNotifications`).
 */
export const dmarcNotification = pgTable(
  "dmarc_notification",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.dmarcNotification)),
    organizationId: text("organization_id").notNull(),
    domainId: text("domain_id").notNull(),
    kind: dmarcNotificationKind("kind").notNull(),
    // One notification per kind, domain and policy epoch (and week, for pass rate drops).
    dedupeKey: text("dedupe_key").notNull().unique("dmarc_notification_dedupe_unique"),
    // The domain's `dmarc_policy_changed_at` when queued: a later policy change skips it.
    policyChangedAt: timestamp("policy_changed_at", { withTimezone: true }),
    // The record to publish next (readiness) or the pass rate (drops), for the email.
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    status: dmarcNotificationStatus("status").notNull().default("pending"),
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
    foreignKey({
      name: "dmarc_notification_domain_fk",
      columns: [t.domainId, t.organizationId],
      foreignColumns: [domain.id, domain.organizationId],
    }).onDelete("cascade"),
    index("dmarc_notification_due_idx").on(t.nextAttemptAt).where(sql`${t.status} = 'pending'`),
    index("dmarc_notification_created_at_idx").on(t.createdAt),
  ],
);

/** A customer URL that receives signed event notifications for one environment. */
export const webhookEndpoint = pgTable(
  "webhook_endpoint",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.webhookEndpoint)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    url: text("url").notNull(),
    description: text("description"),
    // The API version (`Coss-Version` date) payloads are rendered in at delivery.
    apiVersion: text("api_version").notNull(),
    // Event types to deliver; empty means every type.
    eventTypes: text("event_types").array().notNull().default(sql`'{}'::text[]`),
    // The `whsec_…` signing secret, encrypted with WEBHOOK_SECRETS_KEY (it must be reversible).
    secretCiphertext: text("secret_ciphertext").notNull(),
    // The secret before the last roll, which also signs deliveries until it expires. Both or neither.
    previousSecretCiphertext: text("previous_secret_ciphertext"),
    previousSecretExpiresAt: timestamp("previous_secret_expires_at", { withTimezone: true }),
    enabled: boolean("enabled").notNull().default(true),
    // Why it is off (`manual` or `failing`) and since when; null while enabled.
    disabledReason: text("disabled_reason"),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    // Set by the first delivery that failed every attempt, cleared by any success. An endpoint
    // failing for long enough is disabled (`failing`).
    failingSince: timestamp("failing_since", { withTimezone: true }),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "webhook_endpoint_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    index("webhook_endpoint_environment_idx").on(t.environmentId),
    unique("webhook_endpoint_id_organization_unique").on(t.id, t.organizationId),
    check(
      "webhook_endpoint_previous_secret_check",
      sql`(${t.previousSecretCiphertext} is null) = (${t.previousSecretExpiresAt} is null)`,
    ),
    // No CHECK tying `enabled` to `disabled_reason`/`disabled_at` (unlike `hook_endpoint`): the
    // code running while a deploy migrates sets `enabled` alone. Readers treat a reasonless
    // disabled endpoint as disabled by hand.
  ],
);

/** One event to notify an environment's endpoints about (the outbox). `id` is the event's id. */
export const webhookMessage = pgTable(
  "webhook_message",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    environmentId: text("environment_id").notNull(),
    type: text("type").notNull(),
    // `json`, not `jsonb`: keeps the payload's key order, so deliveries read as they were built.
    payload: json("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "webhook_message_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    unique("webhook_message_id_organization_unique").on(t.id, t.organizationId),
    // Deleting an environment (or an organization, `organization_deletion`) finds its messages.
    index("webhook_message_environment_idx").on(t.environmentId),
    // The worker's retention purge.
    index("webhook_message_created_at_idx").on(t.createdAt),
  ],
);

export const webhookDeliveryStatus = pgEnum("webhook_delivery_status", [
  "pending",
  "succeeded",
  "failed",
]);

/** A message to one endpoint, retried with backoff by the worker until it succeeds or gives up. */
export const webhookDelivery = pgTable(
  "webhook_delivery",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.webhookDelivery)),
    organizationId: text("organization_id").notNull(),
    messageId: text("message_id").notNull(),
    endpointId: text("endpoint_id").notNull(),
    status: webhookDeliveryStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    // Set while a worker is attempting it; an expired lease can be taken over.
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastStatusCode: integer("last_status_code"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "webhook_delivery_message_fk",
      columns: [t.messageId, t.organizationId],
      foreignColumns: [webhookMessage.id, webhookMessage.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "webhook_delivery_endpoint_fk",
      columns: [t.endpointId, t.organizationId],
      foreignColumns: [webhookEndpoint.id, webhookEndpoint.organizationId],
    }).onDelete("cascade"),
    unique("webhook_delivery_message_endpoint_unique").on(t.messageId, t.endpointId),
    index("webhook_delivery_due_idx").on(t.nextAttemptAt).where(sql`${t.status} = 'pending'`),
    index("webhook_delivery_endpoint_created_at_idx").on(t.endpointId, t.createdAt.desc()),
    unique("webhook_delivery_id_organization_unique").on(t.id, t.organizationId),
  ],
);

/** One HTTP attempt of a delivery (the endpoint's delivery log). */
export const webhookAttempt = pgTable(
  "webhook_attempt",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.webhookAttempt)),
    organizationId: text("organization_id").notNull(),
    deliveryId: text("delivery_id").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
    statusCode: integer("status_code"),
    durationMs: integer("duration_ms").notNull(),
    error: text("error"),
    // At most 1 KB of the response body, as text.
    responseExcerpt: text("response_excerpt"),
  },
  (t) => [
    foreignKey({
      name: "webhook_attempt_delivery_fk",
      columns: [t.deliveryId, t.organizationId],
      foreignColumns: [webhookDelivery.id, webhookDelivery.organizationId],
    }).onDelete("cascade"),
    index("webhook_attempt_delivery_idx").on(t.deliveryId, t.attemptedAt),
  ],
);

/**
 * A temporary subscriber the CLI (`coss listen`) pulls deliveries from over the API, instead of coss.com
 * POSTing them to a URL. Kept apart from `webhook_endpoint` so nothing that reads endpoints (the
 * worker's delivery loop, plan limits, health, the endpoint API) ever sees one. Alive while it is
 * polled (`expires_at` moves forward); closing it ends it early. Expired rows are purged.
 */
export const webhookListener = pgTable(
  "webhook_listener",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.webhookListener)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    apiVersion: text("api_version").notNull(),
    // Empty: every event type.
    eventTypes: text("event_types").array().notNull().default(sql`'{}'::text[]`),
    description: text("description"),
    // No FK: Better Auth hard-deletes keys.
    createdByApiKeyId: text("created_by_api_key_id"),
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "webhook_listener_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    unique("webhook_listener_id_organization_unique").on(t.id, t.organizationId),
    // Fan-out and the per-environment cap: the environment's live listeners.
    index("webhook_listener_environment_expires_idx").on(t.environmentId, t.expiresAt),
    // The retention purge.
    index("webhook_listener_expires_at_idx").on(t.expiresAt),
  ],
);

/** One message queued for one listener; handed out by polls (leased) and acknowledged by the CLI. */
export const webhookListenerDelivery = pgTable(
  "webhook_listener_delivery",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.webhookListenerDelivery)),
    organizationId: text("organization_id").notNull(),
    listenerId: text("listener_id").notNull(),
    messageId: text("message_id").notNull(),
    status: webhookDeliveryStatus("status").notNull().default("pending"),
    // Polls that handed it out; a delivery the CLI never acknowledges stops being handed out.
    handedOutCount: integer("handed_out_count").notNull().default(0),
    // Set while a poll's answer is out; the fencing token of its acknowledgement.
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    // What the CLI reported forwarding it to the local URL (no status: printed only).
    statusCode: integer("status_code"),
    durationMs: integer("duration_ms"),
    error: text("error"),
    forwardedAt: timestamp("forwarded_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "webhook_listener_delivery_listener_fk",
      columns: [t.listenerId, t.organizationId],
      foreignColumns: [webhookListener.id, webhookListener.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "webhook_listener_delivery_message_fk",
      columns: [t.messageId, t.organizationId],
      foreignColumns: [webhookMessage.id, webhookMessage.organizationId],
    }).onDelete("cascade"),
    unique("webhook_listener_delivery_message_listener_unique").on(t.messageId, t.listenerId),
    unique("webhook_listener_delivery_id_organization_unique").on(t.id, t.organizationId),
    // Polls: the listener's pending deliveries in order.
    index("webhook_listener_delivery_pending_idx")
      .on(t.listenerId, t.createdAt, t.id)
      .where(sql`${t.status} = 'pending'`),
    // The listener's cascade (retention purges listeners with deliveries in every status).
    index("webhook_listener_delivery_listener_idx").on(t.listenerId),
  ],
);

export const reputationStatus = pgEnum("reputation_status", ["good", "warning", "suspended"]);

/**
 * An organization's sending standing, kept by the reputation guard (`@coss/reputation`). Created
 * lazily: no row means `good`. Only platform admins move an organization out of `suspended`.
 */
export const reputationStanding = pgTable(
  "reputation_standing",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    status: reputationStatus("status").notNull().default("good"),
    // The trigger behind the current status (e.g. `complaint_rate`, `manual`); null when good.
    reason: text("reason"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    // Rate windows never reach back past the last reinstatement.
    reinstatedAt: timestamp("reinstated_at", { withTimezone: true }),
    // The marketing stream's own pause: its bounce or complaint rate stops marketing sends only
    // (set: paused, by `marketing_reason`). Never lifted automatically, like a suspension; its
    // rate windows never reach back past `marketing_reinstated_at`.
    marketingPausedAt: timestamp("marketing_paused_at", { withTimezone: true }),
    marketingReason: text("marketing_reason"),
    marketingReinstatedAt: timestamp("marketing_reinstated_at", { withTimezone: true }),
    // Per-organization policy overrides set by platform admins (validated by `@coss/reputation`).
    policyOverrides: jsonb("policy_overrides").$type<Record<string, unknown>>(),
    // The latest evaluation's check results.
    metrics: jsonb("metrics").$type<Record<string, unknown>>(),
    lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
    // Fences evaluations against intervening standing/policy changes.
    revision: integer("revision").notNull().default(0),
    // New evidence changes the due marker without releasing the active worker.
    evaluationLeaseUntil: timestamp("evaluation_lease_until", { withTimezone: true }),
    // When the worker should evaluate next; null when nothing is pending.
    nextEvaluationAt: timestamp("next_evaluation_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("reputation_standing_next_evaluation_idx")
      .on(t.nextEvaluationAt)
      .where(sql`${t.nextEvaluationAt} IS NOT NULL`),
  ],
);

export const reputationEventType = pgEnum("reputation_event_type", [
  "warning_raised",
  "warning_cleared",
  "suspended",
  "reinstated",
  "policy_updated",
  "marketing_paused",
  "marketing_reinstated",
]);

export const reputationActor = pgEnum("reputation_actor", ["system", "admin"]);

/**
 * Append-only history of an organization's standing changes (audit trail). The worker deletes
 * entries past the retention in `@coss/retention`, except each organization's latest transition.
 */
export const reputationEvent = pgTable(
  "reputation_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.reputationEvent)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    type: reputationEventType("type").notNull(),
    trigger: text("trigger").notNull(),
    actor: reputationActor("actor").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    note: text("note"),
    metrics: jsonb("metrics").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("reputation_event_organization_created_at_idx").on(t.organizationId, t.createdAt.desc()),
    unique("reputation_event_id_organization_unique").on(t.id, t.organizationId),
  ],
);

export const reputationNotificationStatus = pgEnum("reputation_notification_status", [
  "pending",
  "sent",
  "skipped",
  "failed",
]);

/**
 * Outbox of the emails that tell an organization's owners and admins about a warning or a
 * suspension. Written in the transition's transaction; the worker sends it (`@coss/reputation`).
 */
export const reputationNotification = pgTable(
  "reputation_notification",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.reputationNotification)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    reputationEventId: text("reputation_event_id").notNull(),
    // The transition announced: `warning_raised` or `suspended`.
    type: reputationEventType("type").notNull(),
    status: reputationNotificationStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    // When the worker should (re)try; also the claim's lease. Null once settled.
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    // The addresses it was sent to (owners and admins with a verified email, at send time).
    recipients: text("recipients").array().notNull().default(sql`'{}'::text[]`),
    // Why it was skipped, or the last failure.
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "reputation_notification_event_fk",
      columns: [t.reputationEventId, t.organizationId],
      foreignColumns: [reputationEvent.id, reputationEvent.organizationId],
    }).onDelete("cascade"),
    uniqueIndex("reputation_notification_event_idx").on(t.reputationEventId),
    index("reputation_notification_next_attempt_idx")
      .on(t.nextAttemptAt)
      .where(sql`${t.nextAttemptAt} IS NOT NULL`),
  ],
);

/**
 * Hourly rollups of an organization's live email reputation counts (`@coss/email`), by stream and
 * by the hour the emails were created. Computed lazily by the reputation checks for closed hours; delivery
 * events that change an hour's counts bump `revision`, so a row is current only while
 * `computed_revision = revision`. Mailbox-simulator recipients are counted separately.
 */
export const emailReputationRollup = pgTable(
  "email_reputation_rollup",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    // Rows from before streams are transactional and stay valid (never recounted): no marketing
    // email could be sent until the stream split, so every one of them counts transactional mail.
    stream: emailStream("stream").notNull().default("transactional"),
    revision: integer("revision").notNull().default(0),
    // Null until first computed.
    computedRevision: integer("computed_revision"),
    recipients: integer("recipients").notNull().default(0),
    bounces: integer("bounces").notNull().default(0),
    complaints: integer("complaints").notNull().default(0),
    simulatorRecipients: integer("simulator_recipients").notNull().default(0),
    simulatorBounces: integer("simulator_bounces").notNull().default(0),
    simulatorComplaints: integer("simulator_complaints").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.bucketStart, t.stream] })],
);
export const contentScreeningVerdict = pgEnum("content_screening_verdict", [
  "clean",
  "flagged",
  "blocked",
  "error",
]);

/**
 * Verified sending domains blocked by enforced content screening. No organization/domain FK:
 * deleting an identity or account must not erase abuse memory. Support reinstatement clears it.
 */
export const emailSenderDomainBlock = pgTable(
  "email_sender_domain_block",
  {
    domain: text("domain").primaryKey(),
    organizationId: text("organization_id").notNull(),
    groupId: text("group_id"),
    subjectId: text("subject_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("email_sender_domain_block_organization_idx").on(t.organizationId)],
);

/**
 * One AI content screening of an outgoing message (`@coss/screening`). Product-agnostic: the
 * message is named by `product` + `subject_id` (no FK), and its content is never copied here.
 */
export const contentScreening = pgTable(
  "content_screening",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.contentScreening)),
    organizationId: text("organization_id").notNull(),
    environmentId: text("environment_id").notNull(),
    // e.g. `email`; `subject_id` is that product's message id.
    product: text("product").notNull(),
    subjectId: text("subject_id").notNull(),
    // The message's position among the organization's live messages of this product (of its
    // group's, e.g. an email sub-account's: `group_id`).
    sequence: integer("sequence").notNull(),
    // A group of the organization sampled and enforced on its own (an email sub-account's id):
    // its blocks pause the group, never the organization. NULL: the organization's own.
    groupId: text("group_id"),
    classifier: text("classifier").notNull(),
    model: text("model"),
    verdict: contentScreeningVerdict("verdict").notNull(),
    // Whether a `blocked` verdict actually stopped the message (the policy's `enforce`).
    enforced: boolean("enforced").notNull().default(false),
    // Probability per category, e.g. `{ "spam": 0.02, "phishing": 0.97 }`.
    scores: jsonb("scores").$type<Record<string, number>>().notNull().default({}),
    topCategory: text("top_category"),
    topScore: real("top_score"),
    inputTokens: integer("input_tokens"),
    latencyMs: integer("latency_ms").notNull(),
    errorMessage: text("error_message"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "content_screening_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    index("content_screening_organization_created_at_idx").on(t.organizationId, t.createdAt.desc()),
    // The worker's retention purge.
    index("content_screening_created_at_idx").on(t.createdAt),
    // A message's verdicts (the admin console's email pages).
    index("content_screening_subject_idx").on(t.product, t.subjectId),
  ],
);

/** How many live messages of a product an organization has dispatched (screening samples by it). */
export const contentScreeningCounter = pgTable(
  "content_screening_counter",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    product: text("product").notNull(),
    // `""`: the organization's own messages; else a group's (an email sub-account's id).
    groupId: text("group_id").notNull().default(""),
    seen: integer("seen").notNull().default(0),
    // A sampled screening failed, so the next message is screened instead.
    owed: boolean("owed").notNull().default(false),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.product, t.groupId] })],
);

/**
 * A platform admin's suspension of an organization; the row's presence is the suspension.
 * While it exists the organization's API keys are refused, its webhook deliveries are held and
 * its dashboard is read-only. Lifting it deletes the row (history lives in `admin_audit_event`).
 */
export const organizationSuspension = pgTable("organization_suspension", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  // Internal note for platform admins; never shown to the organization.
  reason: text("reason").notNull(),
  // What kind of abuse a takedown was for (the admin console's `ABUSE_CATEGORIES`); null for a
  // plain suspension.
  category: text("category"),
  suspendedByUserId: text("suspended_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
});

/**
 * An organization's HIPAA mode (`@coss/compliance`); the row's presence is the mode. Turned on and
 * off only by platform admins, once a BAA is signed. Never derived from billing: a contract ending
 * must not lift safeguards without anyone deciding to. History lives in `admin_audit_event` and the
 * organization's own audit log.
 */
export const organizationHipaaMode = pgTable("organization_hipaa_mode", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  baaSignedAt: timestamp("baa_signed_at", { withTimezone: true }).notNull(),
  // The agreement's reference, shown on the customer's compliance page.
  baaReference: text("baa_reference").notNull(),
  enabledByUserId: text("enabled_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
});

/**
 * When a session was last active in an organization in HIPAA mode, for its idle logoff. Not
 * `session.updated_at`: Better Auth moves that when it extends a session, which is just what a
 * browser left open overnight triggers on its next request.
 */
export const hipaaSessionActivity = pgTable("hipaa_session_activity", {
  sessionId: text("session_id")
    .primaryKey()
    .references(() => session.id, { onDelete: "cascade" }),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull(),
});

/**
 * The API version an organization's requests use when they send no `Coss-Version` header. Created lazily on the
 * organization's first API use (pinned to the latest version then), changed only by an upgrade in the dashboard.
 */
export const organizationApiVersion = pgTable("organization_api_version", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  apiVersion: text("api_version").notNull(),
  updatedByUserId: text("updated_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Append-only log of platform admin actions (bans, role changes, impersonation, suspensions…),
 * kept for the retention in `@coss/retention` (the worker deletes older entries).
 * Platform-level, so `organization_id` is optional, and history: no FKs to the targets, and the
 * actor's email is copied so entries stay readable after the rows they name are gone.
 */
export const adminAuditEvent = pgTable(
  "admin_audit_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.adminAuditEvent)),
    sequence: bigint("sequence", { mode: "number" }).generatedAlwaysAsIdentity(),
    actorUserId: text("actor_user_id"),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    organizationId: text("organization_id"),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("admin_audit_event_target_idx").on(
      t.targetType,
      t.targetId,
      t.createdAt.desc(),
      t.sequence.desc(),
    ),
    index("admin_audit_event_organization_idx")
      .on(t.organizationId, t.createdAt.desc(), t.sequence.desc())
      .where(sql`${t.organizationId} is not null`),
    // The worker's retention purge.
    index("admin_audit_event_created_at_idx").on(t.createdAt),
  ],
);

/**
 * An organization's rule for one rate limit bucket (`BUCKETS` in `@coss/ratelimit`), replacing the
 * default. Set by platform admins (the admin console, or `bun run ratelimit:set`).
 */
export const rateLimitOverride = pgTable(
  "rate_limit_override",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.rateLimitOverride)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    bucket: text("bucket").notNull(),
    limit: integer("limit").notNull(),
    periodMs: integer("period_ms").notNull(),
    // Defaults to `limit`.
    burst: integer("burst"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("rate_limit_override_organization_bucket_unique").on(t.organizationId, t.bucket)],
);

/**
 * Maps a directory (SCIM) group to an organization role: members of the group get `role` (admin wins over
 * member). `group_name` is the group's displayName, trimmed and lower-cased. Read by the SCIM role projection
 * (`@coss/auth` `scim.ts`); written only by `setScimGroupRoles` (@coss/tenancy).
 */
export const scimGroupRole = pgTable(
  "scim_group_role",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.scimGroupRole)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    groupName: text("group_name").notNull(),
    // "admin" | "member" (never "owner": the directory doesn't manage owners).
    role: text("role").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("scim_group_role_organization_group_unique").on(t.organizationId, t.groupName)],
);

export const logSource = pgEnum("log_source", [
  "api",
  "email",
  "webhook",
  "risk",
  "smtp",
  "sms",
  "sign",
  "verify",
  "forms",
  "scheduling",
]);
export type LogSource = (typeof logSource.enumValues)[number];

export const logLevel = pgEnum("log_level", ["info", "warning", "error"]);
export type LogLevel = (typeof logLevel.enumValues)[number];

/**
 * One line of an environment's log (`@coss/logs`): an API request, an email event or a webhook
 * delivery attempt. Append-only and partitioned by day on `occurred_at` (migration 0027; the worker
 * creates upcoming partitions and drops expired ones), hence the composite primary key.
 */
export const logEntry = pgTable(
  "log_entry",
  {
    id: text("id")
      .notNull()
      .$defaultFn(() => newId(ID_PREFIXES.logEntry)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    source: logSource("source").notNull(),
    level: logLevel("level").notNull(),
    // e.g. `api.request`, `email.delivered`, `webhook.attempt`.
    type: text("type").notNull(),
    message: text("message").notNull(),
    requestId: text("request_id"),
    // No FK: Better Auth hard-deletes keys.
    apiKeyId: text("api_key_id"),
    method: text("method"),
    path: text("path"),
    // The matched route pattern, e.g. `/v1/emails/:id`.
    route: text("route"),
    statusCode: integer("status_code"),
    durationMs: integer("duration_ms"),
    clientIp: text("client_ip"),
    userAgent: text("user_agent"),
    errorCode: text("error_code"),
    // The resource the line is about (`email_…`, `whep_…`, `dom_…`), no FK.
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    recipient: text("recipient"),
    // Redacted request/response bodies, event details.
    attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
    // Lowercased text the free-text search matches (message, path, ids, recipient).
    searchText: text("search_text").notNull().default(""),
  },
  (t) => [
    primaryKey({ name: "log_entry_pkey", columns: [t.occurredAt, t.id] }),
    foreignKey({
      name: "log_entry_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    index("log_entry_environment_occurred_at_idx").on(
      t.environmentId,
      t.occurredAt.desc(),
      t.id.desc(),
    ),
    index("log_entry_environment_request_idx")
      .on(t.environmentId, t.requestId)
      .where(sql`${t.requestId} is not null`),
    index("log_entry_environment_resource_idx")
      .on(t.environmentId, t.resourceId)
      .where(sql`${t.resourceId} is not null`),
    index("log_entry_search_text_idx").using("gin", t.searchText.op("gin_trgm_ops")),
  ],
);

export const orgAuditActorType = pgEnum("org_audit_actor_type", ["user", "api_key", "system"]);
export type OrgAuditActorType = (typeof orgAuditActorType.enumValues)[number];

/**
 * An organization's audit log: who changed what (dashboard members, API keys, Better Auth flows,
 * coss.com support). History: no FKs except the organization, and actor/target labels are copied so
 * entries stay readable after the rows they name are gone. Kept indefinitely.
 */
export const orgAuditEvent = pgTable(
  "org_audit_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.orgAuditEvent)),
    sequence: bigint("sequence", { mode: "number" }).generatedAlwaysAsIdentity(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id"),
    environmentId: text("environment_id"),
    actorType: orgAuditActorType("actor_type").notNull(),
    actorId: text("actor_id"),
    actorLabel: text("actor_label").notNull(),
    // e.g. `api_key.created`, `domain.deleted`, `member.role_changed`.
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    targetLabel: text("target_label"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    clientIp: text("client_ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("org_audit_event_organization_idx").on(
      t.organizationId,
      t.createdAt.desc(),
      t.sequence.desc(),
    ),
    index("org_audit_event_organization_action_idx").on(
      t.organizationId,
      t.action,
      t.createdAt.desc(),
      t.sequence.desc(),
    ),
  ],
);

/** What a log drain forwards: the environment log's sources, plus the environment's audit events. */
export const logDrainSource = pgEnum("log_drain_source", [
  "api",
  "email",
  "webhook",
  "risk",
  "audit",
  "smtp",
  "sms",
  "sign",
  "verify",
  "forms",
  "scheduling",
]);
export type LogDrainSource = (typeof logDrainSource.enumValues)[number];

/** How a drain's batches are encoded (`@coss/webhooks` `log-drain-formats.ts`). */
export const logDrainFormat = pgEnum("log_drain_format", ["ndjson", "loki", "datadog", "otlp"]);

/**
 * An HTTPS endpoint an environment's log lines are streamed to, in signed batches by the worker
 * (`@coss/webhooks` log drains), encoded in its `format`. Queued lines are `log_drain_record`s.
 */
export const logDrain = pgTable(
  "log_drain",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.logDrain)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    url: text("url").notNull(),
    description: text("description"),
    // Sources to forward; empty means every source.
    sources: logDrainSource("sources").array().notNull().default(sql`'{}'::log_drain_source[]`),
    // The `whsec_…` signing secret, encrypted with WEBHOOK_SECRETS_KEY.
    secretCiphertext: text("secret_ciphertext").notNull(),
    format: logDrainFormat("format").notNull().default("ndjson"),
    // A header sent with every batch (a vendor's API key, `Authorization`); the value is
    // encrypted with WEBHOOK_SECRETS_KEY and never read back. Both or neither.
    authHeaderName: text("auth_header_name"),
    authHeaderCiphertext: text("auth_header_ciphertext"),
    enabled: boolean("enabled").notNull().default(true),
    // Why it is disabled: `manual` or `failing` (a batch exhausted its retries). Null while enabled.
    disabledReason: text("disabled_reason"),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "log_drain_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    // Every log line looks up its environment's enabled drains.
    index("log_drain_environment_idx").on(t.environmentId).where(sql`${t.enabled}`),
    unique("log_drain_id_organization_unique").on(t.id, t.organizationId),
    check(
      "log_drain_auth_header_check",
      sql`(${t.authHeaderName} is null) = (${t.authHeaderCiphertext} is null)`,
    ),
  ],
);

export const logDrainBatchStatus = pgEnum("log_drain_batch_status", [
  "pending",
  "succeeded",
  "failed",
]);

/** One NDJSON request of queued lines, retried with backoff until it succeeds or gives up. */
export const logDrainBatch = pgTable(
  "log_drain_batch",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.logDrainBatch)),
    organizationId: text("organization_id").notNull(),
    drainId: text("drain_id").notNull(),
    status: logDrainBatchStatus("status").notNull().default("pending"),
    recordCount: integer("record_count").notNull(),
    byteSize: integer("byte_size").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    // Set while a worker is attempting it; an expired lease can be taken over.
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastStatusCode: integer("last_status_code"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "log_drain_batch_drain_fk",
      columns: [t.drainId, t.organizationId],
      foreignColumns: [logDrain.id, logDrain.organizationId],
    }).onDelete("cascade"),
    // One open batch per drain: lines go out in order, and two workers never form two.
    uniqueIndex("log_drain_batch_pending_unique").on(t.drainId).where(sql`${t.status} = 'pending'`),
    index("log_drain_batch_due_idx").on(t.nextAttemptAt).where(sql`${t.status} = 'pending'`),
    index("log_drain_batch_drain_created_at_idx").on(t.drainId, t.createdAt.desc()),
    // The worker's retention purge.
    index("log_drain_batch_updated_at_idx").on(t.updatedAt).where(sql`${t.status} <> 'pending'`),
    unique("log_drain_batch_id_organization_unique").on(t.id, t.organizationId),
  ],
);

/**
 * A line queued for one drain (the outbox), written with the log line or audit event it copies.
 * `line` is the wire object as `GET /v1/logs` returns it (or the audit event's).
 */
export const logDrainRecord = pgTable(
  "log_drain_record",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.logDrainRecord)),
    organizationId: text("organization_id").notNull(),
    drainId: text("drain_id").notNull(),
    // Set when the record joins a batch; deleted with it.
    batchId: text("batch_id"),
    source: logDrainSource("source").notNull(),
    // The `log_…` or `oaudit_…` id.
    sourceId: text("source_id").notNull(),
    // `json`, not `jsonb`: keeps the object's key order.
    line: json("line").$type<Record<string, unknown>>().notNull(),
    // Bytes of the serialized line, newline included.
    byteSize: integer("byte_size").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "log_drain_record_drain_fk",
      columns: [t.drainId, t.organizationId],
      foreignColumns: [logDrain.id, logDrain.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "log_drain_record_batch_fk",
      columns: [t.batchId, t.organizationId],
      foreignColumns: [logDrainBatch.id, logDrainBatch.organizationId],
    }).onDelete("cascade"),
    unique("log_drain_record_drain_source_unique").on(t.drainId, t.sourceId),
    // Lines waiting for a batch, oldest first.
    index("log_drain_record_queued_idx").on(t.drainId, t.id).where(sql`${t.batchId} is null`),
    index("log_drain_record_batch_idx").on(t.batchId),
  ],
);

/** One HTTP attempt of a batch (the drain's delivery log). */
export const logDrainAttempt = pgTable(
  "log_drain_attempt",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.logDrainAttempt)),
    organizationId: text("organization_id").notNull(),
    batchId: text("batch_id").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
    statusCode: integer("status_code"),
    durationMs: integer("duration_ms").notNull(),
    error: text("error"),
    // At most 1 KB of the response body, as text.
    responseExcerpt: text("response_excerpt"),
  },
  (t) => [
    foreignKey({
      name: "log_drain_attempt_batch_fk",
      columns: [t.batchId, t.organizationId],
      foreignColumns: [logDrainBatch.id, logDrainBatch.organizationId],
    }).onDelete("cascade"),
    index("log_drain_attempt_batch_idx").on(t.batchId, t.attemptedAt),
  ],
);

export const authEmailKind = pgEnum("auth_email_kind", [
  "verify_email",
  "reset_password",
  "invitation",
]);

export const authEmailStatus = pgEnum("auth_email_status", [
  "pending",
  "sent",
  "skipped",
  "failed",
]);

/**
 * Outbox of the account emails Better Auth asks for (sign-up verification, password resets,
 * invitations). Written by `@coss/auth`'s callbacks; the worker sends each one through coss.com's own
 * email product (`@coss/auth/emails`). Not tenant data: an email belongs to an address, not an
 * organization.
 */
export const authEmail = pgTable(
  "auth_email",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.authEmail)),
    kind: authEmailKind("kind").notNull(),
    to: text("to").notNull(),
    // The account it is about (null for invitations, which may go to people without one). No FK:
    // Better Auth creates a user in a transaction the outbox insert is not part of; an email for
    // a user that doesn't exist (any more) is skipped.
    userId: text("user_id"),
    // The link to send. It carries a secret (a verification or reset token), so it is cleared
    // as soon as the email is settled.
    url: text("url"),
    // Kind-specific content (invitations: organization, inviter, role).
    data: jsonb("data").$type<Record<string, string>>().notNull().default({}),
    // The link stops working at this time; an email not sent by then is skipped.
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: authEmailStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    // When the worker should (re)try; also the claim's lease. Null once settled.
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    // Why it was skipped, or the last failure.
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("auth_email_next_attempt_idx")
      .on(t.nextAttemptAt)
      .where(sql`${t.nextAttemptAt} IS NOT NULL`),
  ],
);

export const organizationDeletionStatus = pgEnum("organization_deletion_status", [
  "pending",
  "completed",
]);

/**
 * A request to delete an organization, and afterwards the record that it was deleted. While
 * `pending`, the organization has no members, invitations, API keys or SSO provider (removed when
 * the request is made) and the worker tears down its provider resources and data in batches, then
 * deletes the organization row. History: no FKs, and the names are copied, so the row outlives
 * the organization and its requester.
 */
export const organizationDeletion = pgTable(
  "organization_deletion",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.organizationDeletion)),
    organizationId: text("organization_id").notNull().unique("organization_deletion_org_unique"),
    organizationName: text("organization_name").notNull(),
    organizationSlug: text("organization_slug").notNull(),
    requestedByUserId: text("requested_by_user_id"),
    requestedByEmail: text("requested_by_email").notNull(),
    // A platform admin deleted it from the admin console (also in `admin_audit_event`).
    byPlatformAdmin: boolean("by_platform_admin").notNull().default(false),
    status: organizationDeletionStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    // When the worker should (re)try; also the claim's lease. Null once completed.
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow(),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("organization_deletion_next_attempt_idx")
      .on(t.nextAttemptAt)
      .where(sql`${t.nextAttemptAt} IS NOT NULL`),
  ],
);

// Hooks: webhooks as a service. A customer's application (one per their end user) has endpoints;
// messages the customer sends are fanned out to them as deliveries and attempted by the worker.

/** One of a customer's end users, who registers endpoints. Addressed by its id or the customer's `uid`. */
export const hookApplication = pgTable(
  "hook_application",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.hookApplication)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    // The customer's own id for it (e.g. their user id), unique per environment.
    uid: text("uid"),
    name: text("name").notNull(),
    metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "hook_application_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    unique("hook_application_environment_uid_unique").on(t.environmentId, t.uid),
    unique("hook_application_id_organization_unique").on(t.id, t.organizationId),
    index("hook_application_environment_created_at_idx").on(
      t.environmentId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
  ],
);

/** A type of message the customer sends (e.g. `invoice.paid`): the catalog end users subscribe from. */
export const hookEventType = pgTable(
  "hook_event_type",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.hookEventType)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    // A JSON Schema of the payload, shown to end users (not enforced).
    schema: jsonb("schema").$type<Record<string, unknown>>(),
    // Example payloads; the first is what "send test" sends.
    examples: jsonb("examples").$type<unknown[]>().notNull().default([]),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "hook_event_type_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    unique("hook_event_type_environment_name_unique").on(t.environmentId, t.name),
  ],
);

/** An end user's URL that receives an application's messages, signed with its own secret. */
export const hookEndpoint = pgTable(
  "hook_endpoint",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.hookEndpoint)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    applicationId: text("application_id").notNull(),
    url: text("url").notNull(),
    description: text("description"),
    // Event types delivered; empty means every type.
    filterTypes: text("filter_types").array().notNull().default(sql`'{}'::text[]`),
    // The `whsec_…` signing secret, encrypted with WEBHOOK_SECRETS_KEY.
    secretCiphertext: text("secret_ciphertext").notNull(),
    previousSecretCiphertext: text("previous_secret_ciphertext"),
    previousSecretExpiresAt: timestamp("previous_secret_expires_at", { withTimezone: true }),
    // At most this many attempts per second (null: no limit of its own).
    rateLimitPerSecond: integer("rate_limit_per_second"),
    enabled: boolean("enabled").notNull().default(true),
    disabledReason: text("disabled_reason"),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    failingSince: timestamp("failing_since", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "hook_endpoint_application_fk",
      columns: [t.applicationId, t.organizationId],
      foreignColumns: [hookApplication.id, hookApplication.organizationId],
    }).onDelete("cascade"),
    index("hook_endpoint_application_idx").on(t.applicationId),
    unique("hook_endpoint_id_organization_unique").on(t.id, t.organizationId),
    check(
      "hook_endpoint_previous_secret_check",
      sql`(${t.previousSecretCiphertext} is null) = (${t.previousSecretExpiresAt} is null)`,
    ),
    check(
      "hook_endpoint_disabled_check",
      sql`${t.enabled} = (${t.disabledReason} is null) and (${t.disabledReason} is null) = (${t.disabledAt} is null)`,
    ),
    check(
      "hook_endpoint_rate_limit_check",
      sql`${t.rateLimitPerSecond} is null or ${t.rateLimitPerSecond} > 0`,
    ),
  ],
);

/**
 * The `Idempotency-Key` of a message send. Partitioned tables can't hold a unique key without
 * their partition column, so keys live here (kept a day) and point at their message.
 */
export const hookIdempotencyKey = pgTable(
  "hook_idempotency_key",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.hookIdempotencyKey)),
    organizationId: text("organization_id").notNull(),
    environmentId: text("environment_id").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    messageId: text("message_id").notNull(),
    messageCreatedAt: timestamp("message_created_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "hook_idempotency_key_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    unique("hook_idempotency_key_environment_key_unique").on(t.environmentId, t.key),
    index("hook_idempotency_key_created_at_idx").on(t.createdAt),
  ],
);

/** A short-lived portal sign-in for one application. Only the token's sha256 is stored. */
export const hookPortalSession = pgTable(
  "hook_portal_session",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.hookPortalSession)),
    organizationId: text("organization_id").notNull(),
    environmentId: text("environment_id").notNull(),
    applicationId: text("application_id").notNull(),
    tokenHash: text("token_hash").notNull().unique("hook_portal_session_token_hash_unique"),
    readOnly: boolean("read_only").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // Who minted it: an API key (no FK: Better Auth hard-deletes keys) or a dashboard user.
    apiKeyId: text("api_key_id"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "hook_portal_session_application_fk",
      columns: [t.applicationId, t.organizationId],
      foreignColumns: [hookApplication.id, hookApplication.organizationId],
    }).onDelete("cascade"),
    index("hook_portal_session_expires_at_idx").on(t.expiresAt),
    index("hook_portal_session_organization_idx").on(t.organizationId),
  ],
);

/** How an environment's portal looks and which sites may embed it. */
export const hookPortalSettings = pgTable(
  "hook_portal_settings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.hookPortalSettings)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id")
      .notNull()
      .unique("hook_portal_settings_environment_unique"),
    // Origins allowed to frame the portal (`frame-ancestors`); empty: it can't be embedded.
    allowedOrigins: text("allowed_origins").array().notNull().default(sql`'{}'::text[]`),
    displayName: text("display_name"),
    // `#rrggbb`.
    accentColor: text("accent_color"),
    // `light`, `dark` or `system`.
    theme: text("theme").notNull().default("system"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "hook_portal_settings_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
  ],
);

export const hookRecoveryStatus = pgEnum("hook_recovery_status", ["pending", "completed"]);

/** "Recover failed deliveries since T" for one endpoint, worked through by the worker in batches. */
export const hookEndpointRecovery = pgTable(
  "hook_endpoint_recovery",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.hookEndpointRecovery)),
    organizationId: text("organization_id").notNull(),
    environmentId: text("environment_id").notNull(),
    endpointId: text("endpoint_id").notNull(),
    since: timestamp("since", { withTimezone: true }).notNull(),
    // Deliveries of messages created from `since` until here (the request time).
    until: timestamp("until", { withTimezone: true }).notNull(),
    status: hookRecoveryStatus("status").notNull().default("pending"),
    // The last delivery requeued: the next batch continues after it.
    cursorCreatedAt: timestamp("cursor_created_at", { withTimezone: true }),
    cursorId: text("cursor_id"),
    requeued: integer("requeued").notNull().default(0),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "hook_endpoint_recovery_endpoint_fk",
      columns: [t.endpointId, t.organizationId],
      foreignColumns: [hookEndpoint.id, hookEndpoint.organizationId],
    }).onDelete("cascade"),
    index("hook_endpoint_recovery_pending_idx").on(t.createdAt).where(sql`${t.status} = 'pending'`),
    index("hook_endpoint_recovery_endpoint_idx").on(t.endpointId),
  ],
);

/*
 * Messages, deliveries and attempts are partitioned by UTC day of the message's creation (migration
 * 0051), without a default partition, so whole days are dropped together after retention. Nothing
 * holds an FK into them, and they hold none at all: deleting an application or endpoint must never
 * cascade into millions of rows, and dropping a partition that references `environment` would take
 * an ACCESS EXCLUSIVE lock on it (organization deletion deletes them explicitly); ids carry the message's timestamp, so an id alone finds its
 * partition (`idTimestamp`). Created-at values and ids are always bound from the same JS millisecond.
 */

/** A message the customer sent to one application. */
export const hookMessage = pgTable(
  "hook_message",
  {
    id: text("id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    applicationId: text("application_id").notNull(),
    eventType: text("event_type").notNull(),
    // `json`, not `jsonb`: delivered with the customer's key order.
    payload: json("payload").$type<unknown>().notNull(),
    payloadBytes: integer("payload_bytes").notNull(),
    // A test send: delivered only to this endpoint.
    onlyEndpointId: text("only_endpoint_id"),
  },
  (t) => [
    primaryKey({ name: "hook_message_pkey", columns: [t.createdAt, t.id] }),
    index("hook_message_application_created_at_idx").on(
      t.applicationId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
    index("hook_message_environment_created_at_idx").on(
      t.environmentId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
  ],
);

export const hookDeliveryStatus = pgEnum("hook_delivery_status", [
  "pending",
  "succeeded",
  "failed",
]);

/** One message sent to one endpoint, retried with backoff until it succeeds or gives up. */
export const hookDelivery = pgTable(
  "hook_delivery",
  {
    id: text("id").notNull(),
    messageCreatedAt: timestamp("message_created_at", { withTimezone: true }).notNull(),
    organizationId: text("organization_id").notNull(),
    environmentId: text("environment_id").notNull(),
    applicationId: text("application_id").notNull(),
    messageId: text("message_id").notNull(),
    endpointId: text("endpoint_id").notNull(),
    status: hookDeliveryStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastStatusCode: integer("last_status_code"),
    lastError: text("last_error"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: "hook_delivery_pkey", columns: [t.messageCreatedAt, t.id] }),
    unique("hook_delivery_message_endpoint_unique").on(
      t.messageCreatedAt,
      t.messageId,
      t.endpointId,
    ),
    index("hook_delivery_due_idx").on(t.nextAttemptAt).where(sql`${t.status} = 'pending'`),
    index("hook_delivery_endpoint_idx").on(t.endpointId, t.messageCreatedAt.desc(), t.id.desc()),
    index("hook_delivery_environment_idx").on(
      t.environmentId,
      t.messageCreatedAt.desc(),
      t.id.desc(),
    ),
  ],
);

/** One HTTP request of a delivery. */
export const hookAttempt = pgTable(
  "hook_attempt",
  {
    id: text("id").notNull(),
    messageCreatedAt: timestamp("message_created_at", { withTimezone: true }).notNull(),
    organizationId: text("organization_id").notNull(),
    environmentId: text("environment_id").notNull(),
    applicationId: text("application_id").notNull(),
    deliveryId: text("delivery_id").notNull(),
    endpointId: text("endpoint_id").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
    statusCode: integer("status_code"),
    durationMs: integer("duration_ms").notNull(),
    error: text("error"),
    responseExcerpt: text("response_excerpt"),
  },
  (t) => [
    primaryKey({ name: "hook_attempt_pkey", columns: [t.messageCreatedAt, t.id] }),
    index("hook_attempt_delivery_idx").on(t.deliveryId, t.attemptedAt),
    index("hook_attempt_environment_idx").on(
      t.environmentId,
      t.messageCreatedAt.desc(),
      t.id.desc(),
    ),
  ],
);

/**
 * Finished Hooks deliveries of live environments per organization and hour (the hour they
 * finished): what the `hook_failure_rate` reputation check measures. Counted by the delivery worker
 * once per claimed batch (best effort).
 */
export const hookDeliveryRollup = pgTable(
  "hook_delivery_rollup",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    hour: timestamp("hour", { withTimezone: true }).notNull(),
    succeeded: integer("succeeded").notNull().default(0),
    failed: integer("failed").notNull().default(0),
  },
  (t) => [
    primaryKey({ name: "hook_delivery_rollup_pkey", columns: [t.organizationId, t.hour] }),
    index("hook_delivery_rollup_hour_idx").on(t.hour),
  ],
);

// ---------------------------------------------------------------------------------------------
// Risk (`@coss/risk`): assessments of customers' sign-ups, logins… and what each environment
// remembers about them. Identifiers in memory tables are HMACs (`RISK_HASH_KEY`), never raw.

export const riskEvent = pgEnum("risk_event", ["signup", "login", "message", "checkout", "custom"]);
export const riskDecision = pgEnum("risk_decision", ["allow", "review", "block"]);
export const riskOutcome = pgEnum("risk_outcome", ["legitimate", "fraud", "abuse"]);
export const riskReviewStatus = pgEnum("risk_review_status", ["open", "resolved"]);
export const riskFeedbackSource = pgEnum("risk_feedback_source", ["api", "dashboard"]);
export const riskIdentityKind = pgEnum("risk_identity_kind", ["mailbox", "device"]);
export const riskReportKind = pgEnum("risk_report_kind", [
  "mailbox",
  "ip",
  "subnet",
  "user",
  "card",
  "device",
]);
export const riskList = pgEnum("risk_list", ["allow", "block"]);
export const riskListEntryType = pgEnum("risk_list_entry_type", [
  "email",
  "domain",
  "ip",
  "asn",
  "country",
  "user",
]);

/** A reason in an assessment (`REASONS` in `@coss/risk/schemas` documents the codes). */
export type RiskReasonRow = { code: string } & Record<string, unknown>;

/**
 * One `POST /v1/risk/assessments`. `email`, `ip` and `user_agent` are personal data, cleared after
 * `RETENTION_DAYS.riskPersonalData` (`personal_data_purged_at`); the hashes stay so feedback can
 * still teach the environment's memory. `signals` holds only non-identifying values.
 */
export const riskAssessment = pgTable(
  "risk_assessment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.riskAssessment)),
    sequence: bigint("sequence", { mode: "number" }).generatedAlwaysAsIdentity(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    event: riskEvent("event").notNull(),
    // The customer's name for a `custom` event.
    eventName: text("event_name"),
    // The customer's id for their user (not personal data on its own; cleared by "forget user").
    userId: text("user_id"),
    email: text("email"),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    emailHash: text("email_hash"),
    ipHash: text("ip_hash"),
    subnetHash: text("subnet_hash"),
    // Keyed hashes of the payment card's fingerprint (checkouts) and the browser's device id.
    cardHash: text("card_hash"),
    deviceHash: text("device_hash"),
    decision: riskDecision("decision").notNull(),
    score: real("score").notNull(),
    reasons: jsonb("reasons").$type<RiskReasonRow[]>().notNull().default([]),
    signals: jsonb("signals").$type<Record<string, unknown>>().notNull().default({}),
    // Signal groups that were unavailable (`velocity`, `ip`, `email_dns`).
    degraded: text("degraded").array().notNull().default(sql`'{}'::text[]`),
    outcome: riskOutcome("outcome"),
    outcomeAt: timestamp("outcome_at", { withTimezone: true }),
    // Set for `review` decisions; resolved by feedback.
    reviewStatus: riskReviewStatus("review_status"),
    idempotencyKey: text("idempotency_key"),
    requestHash: text("request_hash"),
    personalDataPurgedAt: timestamp("personal_data_purged_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "risk_assessment_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    unique("risk_assessment_id_organization_unique").on(t.id, t.organizationId),
    // NULL keys are distinct, so requests without an Idempotency-Key never conflict.
    unique("risk_assessment_environment_idempotency_key_unique").on(
      t.environmentId,
      t.idempotencyKey,
    ),
    index("risk_assessment_environment_sequence_idx").on(
      t.environmentId,
      t.createdAt.desc(),
      t.sequence.desc(),
    ),
    index("risk_assessment_environment_user_idx")
      .on(t.environmentId, t.userId)
      .where(sql`${t.userId} is not null`),
    index("risk_assessment_open_review_idx")
      .on(t.environmentId, t.createdAt.desc(), t.sequence.desc())
      .where(sql`${t.reviewStatus} = 'open'`),
    // The worker's retention purges (oldest first, across organizations).
    index("risk_assessment_created_at_idx").on(t.createdAt),
    index("risk_assessment_personal_data_idx")
      .on(t.createdAt)
      .where(sql`${t.personalDataPurgedAt} is null`),
  ],
);

/** Every outcome reported for an assessment (API or dashboard); the latest is on the assessment. */
export const riskFeedback = pgTable(
  "risk_feedback",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.riskFeedback)),
    organizationId: text("organization_id").notNull(),
    assessmentId: text("assessment_id").notNull(),
    outcome: riskOutcome("outcome").notNull(),
    source: riskFeedbackSource("source").notNull(),
    // The API key id or the dashboard user id.
    actorId: text("actor_id"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "risk_feedback_assessment_fk",
      columns: [t.assessmentId, t.organizationId],
      foreignColumns: [riskAssessment.id, riskAssessment.organizationId],
    }).onDelete("cascade"),
    index("risk_feedback_assessment_idx").on(t.assessmentId, t.createdAt),
  ],
);

/**
 * Which of the customer's users hold a mailbox (`canonicalEmail`), for "this mailbox already has
 * an account". `user_id` is null when the sign-up was assessed before the user had an id.
 */
export const riskIdentity = pgTable(
  "risk_identity",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.riskIdentity)),
    organizationId: text("organization_id").notNull(),
    environmentId: text("environment_id").notNull(),
    kind: riskIdentityKind("kind").notNull(),
    valueHash: text("value_hash").notNull(),
    userId: text("user_id"),
    // The first assessment that saw it. No FK: memory outlives assessments.
    assessmentId: text("assessment_id").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "risk_identity_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    unique("risk_identity_value_user_unique")
      .on(t.environmentId, t.kind, t.valueHash, t.userId)
      .nullsNotDistinct(),
    index("risk_identity_environment_user_idx")
      .on(t.environmentId, t.userId)
      .where(sql`${t.userId} is not null`),
    index("risk_identity_last_seen_idx").on(t.lastSeenAt),
  ],
);

/** Identifiers of assessments reported as fraud or abuse: "seen in fraud before" on later ones. */
export const riskReport = pgTable(
  "risk_report",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.riskReport)),
    organizationId: text("organization_id").notNull(),
    environmentId: text("environment_id").notNull(),
    kind: riskReportKind("kind").notNull(),
    valueHash: text("value_hash").notNull(),
    // Independent evidence per assessment. No FK: memory outlives assessments.
    assessmentId: text("assessment_id").notNull(),
    reportedAt: timestamp("reported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "risk_report_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    unique("risk_report_value_unique").on(t.environmentId, t.kind, t.valueHash, t.assessmentId),
    index("risk_report_assessment_idx").on(t.environmentId, t.assessmentId),
    index("risk_report_reported_at_idx").on(t.reportedAt),
  ],
);

/** An environment's allow and block lists. `value` is normalized; `network` is set for IPs. */
export const riskListEntry = pgTable(
  "risk_list_entry",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.riskListEntry)),
    sequence: bigint("sequence", { mode: "number" }).generatedAlwaysAsIdentity(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    list: riskList("list").notNull(),
    type: riskListEntryType("type").notNull(),
    value: text("value").notNull(),
    network: cidr("network"),
    note: text("note"),
    // The entry stops matching at this time (kept until deleted).
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "risk_list_entry_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    unique("risk_list_entry_value_unique").on(t.environmentId, t.list, t.type, t.value),
    index("risk_list_entry_environment_sequence_idx").on(
      t.environmentId,
      t.createdAt.desc(),
      t.sequence.desc(),
    ),
    index("risk_list_entry_network_idx")
      .using("gist", t.network.op("inet_ops"))
      .where(sql`${t.network} is not null`),
  ],
);

export const riskCaptchaProvider = pgEnum("risk_captcha_provider", ["turnstile", "hcaptcha"]);

/**
 * An environment's risk settings (one row, created on first change; defaults apply without one).
 * The captcha secret is encrypted like webhook secrets (`encryptSecret`, `WEBHOOK_SECRETS_KEY`).
 */
export const riskSettings = pgTable(
  "risk_settings",
  {
    environmentId: text("environment_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    reviewThreshold: real("review_threshold").notNull(),
    blockThreshold: real("block_threshold").notNull(),
    // Reason codes that never fire in this environment.
    disabledReasons: text("disabled_reasons").array().notNull().default(sql`'{}'::text[]`),
    captchaProvider: riskCaptchaProvider("captcha_provider"),
    captchaSecretCiphertext: text("captcha_secret_ciphertext"),
    // Assessments without a captcha token get `captcha.missing`.
    captchaRequired: boolean("captcha_required").notNull().default(false),
    // Per content category (`spam`, `phishing`, …), the score at which `content.<category>` fires.
    // Categories without one never fire: the customer decides what their content scores mean.
    contentThresholds: jsonb("content_thresholds")
      .$type<Partial<Record<string, number>>>()
      .notNull()
      .default({}),
    // Reason weights the customer chose (often from calibration), replacing `REASONS`' defaults.
    reasonWeights: jsonb("reason_weights")
      .$type<Partial<Record<string, number>>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "risk_settings_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    check(
      "risk_settings_thresholds_check",
      sql`${t.reviewThreshold} > 0 and ${t.reviewThreshold} <= ${t.blockThreshold} and ${t.blockThreshold} <= 1`,
    ),
    check(
      "risk_settings_captcha_check",
      sql`(${t.captchaProvider} is null) = (${t.captchaSecretCiphertext} is null)`,
    ),
  ],
);

export const riskRuleMatch = pgEnum("risk_rule_match", ["all", "any"]);

/** A condition of a risk rule (`RULE_FIELDS` in `@coss/risk/schemas` documents the fields). */
export type RiskRuleConditionRow = { field: string; operator: string; value: unknown };

/**
 * An environment's rules, evaluated after its lists and before the score thresholds: the first
 * enabled rule (by `position`, then age) whose conditions match decides.
 */
export const riskRule = pgTable(
  "risk_rule",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.riskRule)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    position: integer("position").notNull().default(0),
    // Events it applies to; empty = every event.
    events: text("events").array().notNull().default(sql`'{}'::text[]`),
    match: riskRuleMatch("match").notNull().default("all"),
    conditions: jsonb("conditions").$type<RiskRuleConditionRow[]>().notNull(),
    action: riskDecision("action").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "risk_rule_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    index("risk_rule_environment_position_idx").on(t.environmentId, t.position, t.createdAt),
  ],
);

export const riskLimitFailureMode = pgEnum("risk_limit_failure_mode", ["allow", "deny"]);

/**
 * Rate limiting as a service: an environment's own buckets, which `POST /v1/risk/limits` charges
 * per key (GCRA in Valkey, like coss.com's own limits; keys are HMACs). `limit` tokens refill per
 * `period_ms`, at most `burst` at once; `on_failure` answers while the store is unavailable.
 */
export const riskLimitBucket = pgTable(
  "risk_limit_bucket",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.riskLimitBucket)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    name: text("name").notNull(),
    limit: integer("limit").notNull(),
    periodMs: integer("period_ms").notNull(),
    burst: integer("burst").notNull(),
    onFailure: riskLimitFailureMode("on_failure").notNull().default("allow"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "risk_limit_bucket_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    unique("risk_limit_bucket_name_unique").on(t.environmentId, t.name),
    check(
      "risk_limit_bucket_values_check",
      sql`${t.limit} > 0 and ${t.periodMs} > 0 and ${t.burst} > 0`,
    ),
  ],
);

export const riskUserNetworkKind = pgEnum("risk_user_network_kind", ["country", "asn"]);

/**
 * The countries and networks (ASNs) each of the customer's users logged in from, by user hash,
 * for "login from a new country/network". Neither value identifies anyone on its own.
 */
export const riskUserNetwork = pgTable(
  "risk_user_network",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.riskUserNetwork)),
    organizationId: text("organization_id").notNull(),
    environmentId: text("environment_id").notNull(),
    userHash: text("user_hash").notNull(),
    kind: riskUserNetworkKind("kind").notNull(),
    value: text("value").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "risk_user_network_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    unique("risk_user_network_value_unique").on(t.environmentId, t.userHash, t.kind, t.value),
    index("risk_user_network_last_seen_idx").on(t.lastSeenAt),
  ],
);

/**
 * Platform data: when email domains were registered (RDAP), cached so assessments rarely wait for
 * a registry. `registered_at` is null when the registry had no date or no record.
 */
export const riskDomainAge = pgTable("risk_domain_age", {
  domain: text("domain").primaryKey(),
  registeredAt: timestamp("registered_at", { withTimezone: true }),
  // `found`, `not_found` (no record at the registry) or `unavailable` (no RDAP service, an error).
  status: text("status").notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Platform data (not tenant data): the latest copy of each public IP feed behind risk's IP
 * signals, refreshed by the worker and loaded into memory by the API. `content` is gzipped.
 */
export const riskDataset = pgTable("risk_dataset", {
  name: text("name").primaryKey(),
  sha256: text("sha256").notNull(),
  // Ranges or addresses in it (for the shrink guard and the admin view).
  entries: integer("entries").notNull(),
  content: bytea("content").notNull(),
  // When the content last changed, and when the feed was last fetched successfully.
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Idempotent assessment preparation: fingerprints and scores only, never customer content. */
export const riskAssessmentPreparation = pgTable(
  "risk_assessment_preparation",
  {
    environmentId: text("environment_id")
      .notNull()
      .references(() => environment.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    createdAt: createdAt(),
    content: jsonb("content").$type<{
      scores: Record<"spam" | "phishing" | "malware" | "fraud", number> | null;
      degraded: boolean;
    }>(),
  },
  (t) => [
    primaryKey({ columns: [t.environmentId, t.idempotencyKey] }),
    index("risk_assessment_preparation_created_idx").on(t.createdAt),
  ],
);

// Migrations: imports of a customer's resources from another email provider (`@coss/migrate`).

export const migrationProvider = pgEnum("migration_provider", ["resend", "sendgrid", "postmark"]);

export const migrationStatus = pgEnum("migration_status", [
  // The worker is reading what the provider has (`inventory`).
  "inspecting",
  // Waiting for the customer to choose what to import.
  "ready",
  "queued",
  "running",
  "completed",
  "failed",
  "canceled",
]);

/**
 * An import from another provider into one environment. The provider's API key is held encrypted
 * (`encryptSecret`) only until the import finishes or is canceled. The worker leases the row
 * (`lease_until`, every write fenced on it) and works through `phase` from `cursor`.
 */
export const migration = pgTable(
  "migration",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.migration)),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    provider: migrationProvider("provider").notNull(),
    status: migrationStatus("status").notNull().default("inspecting"),
    credentialsCiphertext: text("credentials_ciphertext"),
    // The key's last characters, to tell imports apart.
    credentialHint: text("credential_hint").notNull(),
    // Provider-specific connection details (Postmark's server, SendGrid's region).
    source: jsonb("source").notNull().default({}),
    inventory: jsonb("inventory"),
    // What the customer chose to import.
    selection: jsonb("selection"),
    phase: text("phase"),
    cursor: jsonb("cursor"),
    progress: jsonb("progress").notNull().default({}),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "migration_environment_fk",
      columns: [t.environmentId, t.organizationId],
      foreignColumns: [environment.id, environment.organizationId],
    }).onDelete("cascade"),
    unique("migration_id_organization_unique").on(t.id, t.organizationId),
    index("migration_environment_created_at_idx").on(t.environmentId, t.createdAt.desc()),
    // The worker's due scan.
    index("migration_due_idx")
      .on(t.nextRunAt)
      .where(sql`${t.status} in ('inspecting', 'queued', 'running')`),
  ],
);

export const migrationItemKind = pgEnum("migration_item_kind", [
  "domain",
  "property",
  "topic",
  "audience",
  "template",
  "webhook_endpoint",
]);

export const migrationItemOutcome = pgEnum("migration_item_outcome", [
  // Written before the object is created, so a retry finds it by its natural key.
  "pending",
  "created",
  "existing",
  "skipped",
  "failed",
]);

/**
 * One object an import brought over (or didn't), and what it became: contacts and suppressions
 * are only counted (`migration.progress`).
 */
export const migrationItem = pgTable(
  "migration_item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.migrationItem)),
    migrationId: text("migration_id").notNull(),
    organizationId: text("organization_id").notNull(),
    kind: migrationItemKind("kind").notNull(),
    sourceId: text("source_id").notNull(),
    sourceName: text("source_name").notNull(),
    // The coss.com object's id and its key, alias or name.
    targetId: text("target_id"),
    targetName: text("target_name"),
    outcome: migrationItemOutcome("outcome").notNull().default("pending"),
    // Imported, but not as it was (a template left a draft, an endpoint missing events).
    needsReview: boolean("needs_review").notNull().default(false),
    message: text("message"),
    warnings: jsonb("warnings").notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "migration_item_migration_fk",
      columns: [t.migrationId, t.organizationId],
      foreignColumns: [migration.id, migration.organizationId],
    }).onDelete("cascade"),
    unique("migration_item_source_unique").on(t.migrationId, t.kind, t.sourceId),
  ],
);

// A member's pinned (true) or hidden (false) dashboard product; no row: shown while in use.
export const productPreference = pgTable(
  "product_preference",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.productPreference)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    product: text("product").notNull(),
    pinned: boolean("pinned").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("product_preference_member_unique").on(t.organizationId, t.userId, t.product)],
);

const logoBytes = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const organizationLogoStatus = pgEnum("organization_logo_status", [
  "found",
  "not_found",
  "hidden",
]);

// The organization's logo, found on its own website by the worker (`@coss/tenancy/logos`).
export const organizationLogo = pgTable("organization_logo", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  status: organizationLogoStatus("status").notNull(),
  domain: text("domain"),
  sourceUrl: text("source_url"),
  contentType: text("content_type"),
  image: logoBytes("image"),
  sha256: text("sha256"),
  width: integer("width"),
  height: integer("height"),
  failures: integer("failures").notNull().default(0),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  // Null: never again (hidden by the organization).
  nextCheckAt: timestamp("next_check_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Where an account first came from, reported once by the browser after sign-up
 * (`@coss/auth/first-touch`). Per user, not per organization, and it goes with the user.
 */
export const signupAttribution = pgTable("signup_attribution", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  landingPath: text("landing_path").notNull(),
  referrerHost: text("referrer_host"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  landedAt: timestamp("landed_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});
